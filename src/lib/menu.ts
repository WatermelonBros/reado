/**
 * Bridge from the native OS menu to in-app commands. The Rust side emits a
 * `menu` event with the clicked item's id; here we map each id to the matching
 * action, reusing the same stores/helpers the keyboard shortcuts and palette use.
 */
import { listen } from "@tauri-apps/api/event"
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener"
import { type MessageKey, t } from "@/i18n"
import { clearTerminal, dispatchToAgent, launchAgent, restartTerminal } from "./agents"
import { APP_MENUS } from "./appMenu"
import { organizeImports } from "./codeActions"
import { openCount, toRelative, useComments } from "./comments"
import { useDiagnostics } from "./diagnostics"
import {
  addCursorAbove,
  addCursorBelow,
  addCursorsToLineEnds,
  addNextOccurrence,
  askAboutSelection,
  compareWithSaved,
  convertIndentationTo,
  copyLineDownCmd,
  copyLineUpCmd,
  cursorRedo,
  cursorUndo,
  deleteDuplicateLinesCmd,
  duplicateSelection,
  expandSelectionCmd,
  findReferencesAtCursor,
  focusPane,
  foldAllCmd,
  foldLevel,
  formatDocument,
  formatSelection,
  goToBracket,
  goToDefinitionAtCursor,
  goToImplementationAtCursor,
  goToTypeDefinitionAtCursor,
  gotoLastEdit,
  joinLinesCmd,
  lowerCaseCmd,
  moveLineDownCmd,
  moveLineUpCmd,
  newFile,
  nextProblem,
  openFind,
  openGotoLine,
  openReplace,
  prevProblem,
  redoEdit,
  reindentLines,
  revertFile,
  saveAll,
  saveAs,
  saveDocument,
  selectAllOccurrences,
  showCallHierarchy,
  showTypeHierarchy,
  shrinkSelectionCmd,
  sortLinesAsc,
  sortLinesDesc,
  titleCaseCmd,
  toggleBlockCommentCmd,
  toggleLineComment,
  trimWhitespaceCmd,
  undoEdit,
  unfoldAllCmd,
  upperCaseCmd,
  useDocInfo,
} from "./docInfo"
import { useFileUndo } from "./fileUndo"
import { logPath } from "./logger"
import { notify } from "./notice"
import { toggleDockArea } from "./panels"
import { usePreview } from "./preview"
import { useReadProgress } from "./readProgress"
import { composeReviewPrompt } from "./review"
import {
  type SettingsState,
  THEMES,
  type ThemeName,
  toggleZenMode,
  useEditorActions,
  usePalette,
  useProject,
  useSettings,
  useWorkspace,
} from "./store"
import { useTerminals } from "./terminals"
import { checkForUpdates } from "./updater"
import {
  closeProject,
  openFileDialog,
  openInNewWindow,
  pickFolderAndOpen,
  toggleFullscreen,
} from "./window"
import { addWorkspaceFolder, rootFor } from "./workspace"

/** Toggle the read/unread state of the active file. Read progress is keyed by
 *  project-relative path, so the absolute active path is converted first. */
function toggleActiveRead(): void {
  const { root, active } = useProject.getState()
  if (!active) return
  const rel = toRelative(root, active)
  const isRead = useReadProgress.getState().read.has(rel)
  useReadProgress.getState().mark(root, rel, !isRead)
}

const WEBSITE = "https://reado.watermelon-studio.it"
const DISCORD = "https://discord.gg/HHqT9ucXn4"
const ISSUES = "https://github.com/WatermelonBros/reado/issues"
const RELEASES = "https://github.com/WatermelonBros/reado/releases"

const ZOOM_MIN = 0.6
const ZOOM_MAX = 2
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10))
const nudgeZoom = (delta: number) =>
  useSettings.getState().set({ zoom: clampZoom(useSettings.getState().zoom + delta) })

// Which context a menu command needs to do anything. Ids not listed are always
// available. Mirrors the command-palette `when:` gating so the menu, the menu
// bar and the palette agree on what's applicable.
type MenuCond =
  | "file"
  | "selection"
  | "back"
  | "forward"
  | "reopen"
  | "split"
  | "terminal"
  | "problems"

const MENU_PRECOND: Record<string, MenuCond> = {
  // Need an open editor.
  save: "file",
  saveAll: "file",
  saveAs: "file",
  revert: "file",
  compareSaved: "file",
  format: "file",
  "edit:upperCase": "file",
  "edit:lowerCase": "file",
  "edit:titleCase": "file",
  "edit:sortAsc": "file",
  "edit:sortDesc": "file",
  "edit:dedupe": "file",
  "edit:joinLines": "file",
  "edit:trimWhitespace": "file",
  "edit:reindent": "file",
  "edit:convertSpaces": "file",
  "edit:convertTabs": "file",
  "edit:cursorUndo": "file",
  "edit:cursorRedo": "file",
  "view:foldAll": "file",
  "view:unfoldAll": "file",
  closeEditor: "file",
  gotoLine: "file",
  find: "file",
  "edit:undo": "file",
  "edit:redo": "file",
  "edit:replace": "file",
  "edit:toggleComment": "file",
  "edit:quickFix": "file",
  "edit:organizeImports": "file",
  "edit:toggleBlockComment": "file",
  "palette:symbols": "file",
  gotodef: "file",
  "go:peek": "file",
  "go:typedef": "file",
  "go:impl": "file",
  "go:references": "file",
  "go:callHierarchy": "file",
  "go:typeHierarchy": "file",
  "go:bracket": "file",
  "go:lastEdit": "file",
  "go:nextTab": "file",
  "go:prevTab": "file",
  "sel:expand": "file",
  "sel:shrink": "file",
  "sel:addNext": "file",
  "sel:allOccurrences": "file",
  "sel:cursorAbove": "file",
  "sel:cursorBelow": "file",
  "sel:lineEnds": "file",
  "sel:duplicate": "file",
  "sel:copyUp": "file",
  "sel:copyDown": "file",
  "sel:moveUp": "file",
  "sel:moveDown": "file",
  // Need a text selection specifically.
  "sel:explain": "selection",
  formatSelection: "selection",
  "comment:new": "selection",
  "sel:ask": "selection",
  // Navigation / history / layout.
  "go:back": "back",
  "go:forward": "forward",
  reopenClosed: "reopen",
  "view:split": "split",
  "view:splitToggle": "split",
  "view:focusPane1": "file",
  "view:focusPane2": "split",
  "read:toggle": "file",
  "file:copyPath": "file",
  "file:reveal": "file",
  // Need a terminal / a diagnostic to jump to.
  "terminal:clear": "terminal",
  "terminal:restart": "terminal",
  "terminal:split": "terminal",
  "go:nextProblem": "problems",
  "go:prevProblem": "problems",
}

/** The message shown when a command is invoked without its precondition. */
const MENU_COND_MSG: Record<MenuCond, MessageKey> = {
  file: "menu.needFile",
  selection: "menu.needSelection",
  back: "menu.needBack",
  forward: "menu.needForward",
  reopen: "menu.needReopen",
  split: "menu.needFile",
  terminal: "menu.needTerminal",
  problems: "menu.needProblems",
}

function menuCondMet(cond: MenuCond): boolean {
  const project = useProject.getState()
  switch (cond) {
    case "file":
      return !!project.active
    case "selection": {
      const v = useDocInfo.getState().view
      return !!v && !v.state.selection.main.empty
    }
    case "back":
      return project.navIndex > 0
    case "forward":
      return project.navIndex < project.navStack.length - 1
    case "reopen":
      return project.closedTabs.length > 0
    case "split":
      return !!project.active || !!project.splitPath
    case "terminal":
      return useTerminals.getState().sessions.length > 0
    case "problems":
      return Object.keys(useDiagnostics.getState().byFile).length > 0
  }
}

/** Whether a menu command can act in the current context (drives both the greyed
 *  state in the rendered menu bar and the notice-instead-of-no-op in the handler). */
export function menuCommandEnabled(id: string): boolean {
  const cond = MENU_PRECOND[id]
  return !cond || menuCondMet(cond)
}

/** Run an app-menu command by id — shared by the native menu (forwarded as a
 *  `menu` event) and the rendered Win/Linux menu bar in the title bar. */
export function runMenuCommand(id: string): void {
  // A command whose precondition isn't met would silently do nothing (the
  // native macOS menu can't be greyed from here) — tell the user why instead.
  const cond = MENU_PRECOND[id]
  if (cond && !menuCondMet(cond)) {
    notify("info", t(MENU_COND_MSG[cond]))
    return
  }
  const palette = usePalette.getState()
  const project = useProject.getState()
  const workspace = useWorkspace.getState()
  const settings = useSettings.getState()
  const terminals = useTerminals.getState()

  // Theme submenu: ids like "theme:dark".
  if (id.startsWith("theme:")) {
    settings.set({ theme: id.slice(6) as ThemeName, mode: "manual" })
    return
  }
  // Auto Save submenu: ids like "autosave:afterDelay".
  // Fold to a numbered level: `view:foldLevel:3`.
  if (id.startsWith("view:foldLevel:")) {
    foldLevel(Number(id.slice("view:foldLevel:".length)))
    return
  }
  if (id.startsWith("autosave:")) {
    settings.set({ autoSave: id.slice(9) as SettingsState["autoSave"] })
    return
  }

  switch (id) {
    // App
    case "settings":
      palette.toggleSettings(true)
      break
    case "settings:json":
      palette.toggleSettingsJson(true)
      break
    case "checkUpdates":
      void checkForUpdates(true)
      break

    // File
    case "window:new":
      openInNewWindow()
      break
    case "openFile":
      void openFileDialog()
      break
    case "openFolder":
      void pickFolderAndOpen()
      break
    case "workspace:addFolder":
      void addWorkspaceFolder()
      break
    case "openRecent":
      palette.open("recents")
      break
    case "closeProject":
      void closeProject()
      break
    case "newFile":
      void newFile()
      break
    case "saveAs":
      void saveAs()
      break
    case "save":
      saveDocument()
      break
    case "saveAll":
      void saveAll()
      break
    case "format":
      void formatDocument()
      break
    case "formatSelection":
      void formatSelection()
      break
    case "closeEditor":
      if (project.active) project.close(project.active)
      break
    case "reopenClosed":
      project.reopenClosed()
      break
    case "revert":
      revertFile()
      break
    case "compareSaved":
      compareWithSaved()
      break

    // Edit
    case "find":
      openFind()
      break
    case "edit:undo":
      undoEdit()
      break
    case "edit:redo":
      redoEdit()
      break
    case "edit:replace":
      openReplace()
      break
    case "edit:findInFiles":
    case "edit:replaceInFiles":
      workspace.searchFor("")
      break
    case "edit:toggleComment":
      toggleLineComment()
      break
    case "edit:quickFix":
      useEditorActions.getState().requestQuickFix()
      break
    case "edit:organizeImports":
      void organizeImports()
      break
    case "edit:toggleBlockComment":
      toggleBlockCommentCmd()
      break
    case "gotoLine":
      openGotoLine()
      break
    case "edit:cursorUndo":
      cursorUndo()
      break
    case "edit:cursorRedo":
      cursorRedo()
      break
    case "edit:upperCase":
      upperCaseCmd()
      break
    case "edit:lowerCase":
      lowerCaseCmd()
      break
    case "edit:titleCase":
      titleCaseCmd()
      break
    case "edit:sortAsc":
      sortLinesAsc()
      break
    case "edit:sortDesc":
      sortLinesDesc()
      break
    case "edit:dedupe":
      deleteDuplicateLinesCmd()
      break
    case "edit:joinLines":
      joinLinesCmd()
      break
    case "edit:trimWhitespace":
      trimWhitespaceCmd()
      break
    case "edit:reindent":
      reindentLines()
      break
    case "edit:convertSpaces":
      convertIndentationTo("spaces")
      break
    case "edit:convertTabs":
      convertIndentationTo("tabs")
      break

    // Selection
    case "sel:expand":
      expandSelectionCmd()
      break
    case "sel:shrink":
      shrinkSelectionCmd()
      break
    case "sel:addNext":
      addNextOccurrence()
      break
    case "sel:allOccurrences":
      selectAllOccurrences()
      break
    case "sel:cursorAbove":
      addCursorAbove()
      break
    case "sel:cursorBelow":
      addCursorBelow()
      break
    case "sel:lineEnds":
      addCursorsToLineEnds()
      break
    case "sel:duplicate":
      duplicateSelection()
      break
    case "sel:explain":
      useEditorActions.getState().requestExplain()
      break
    case "sel:ask":
      void askAboutSelection()
      break
    case "sel:copyUp":
      copyLineUpCmd()
      break
    case "sel:copyDown":
      copyLineDownCmd()
      break
    case "sel:moveUp":
      moveLineUpCmd()
      break
    case "sel:moveDown":
      moveLineDownCmd()
      break

    // Go
    case "palette:files":
      palette.open("files")
      break
    case "palette:commands":
      palette.open("commands")
      break
    case "palette:search":
      palette.open("search")
      break
    case "palette:symbols":
      palette.open("symbols")
      break
    case "palette:wsymbols":
      palette.open("wsymbols")
      break
    case "gotodef":
      goToDefinitionAtCursor()
      break
    case "go:peek":
      useEditorActions.getState().requestPeek()
      break
    case "go:typedef":
      goToTypeDefinitionAtCursor()
      break
    case "go:impl":
      goToImplementationAtCursor()
      break
    case "go:references":
      findReferencesAtCursor()
      break
    case "go:callHierarchy":
      showCallHierarchy()
      break
    case "go:typeHierarchy":
      showTypeHierarchy()
      break
    case "go:bracket":
      goToBracket()
      break
    case "go:lastEdit":
      gotoLastEdit()
      break
    case "go:nextProblem":
      nextProblem()
      break
    case "go:prevProblem":
      prevProblem()
      break
    case "go:nextTab":
      project.cycleTab(1)
      break
    case "go:prevTab":
      project.cycleTab(-1)
      break
    case "go:back":
      project.goBack()
      break
    case "go:forward":
      project.goForward()
      break

    // View
    case "view:sidebar":
      workspace.toggleSidebar()
      break
    case "view:split":
      project.openSplit()
      break
    case "view:splitToggle":
      if (project.splitPath) project.closeSplit()
      else project.openSplit()
      break
    case "view:focusPane1":
      if (!focusPane(1)) notify("info", t("menu.needSplit"))
      break
    case "view:focusPane2":
      if (!focusPane(2)) notify("info", t("menu.needSplit"))
      break
    case "view:fullscreen":
      toggleFullscreen()
      break
    case "view:zen":
      toggleZenMode()
      break
    case "view:secondarySidebar":
      toggleDockArea("right")
      break
    case "preview:toggle": {
      const preview = usePreview.getState()
      if (preview.open) preview.close()
      else preview.openPane()
      break
    }
    case "comment:new":
      useEditorActions.getState().requestCompose()
      break
    case "read:toggle":
      toggleActiveRead()
      break
    case "tabs:closeAll":
      project.closeAll()
      break
    case "file:copyPath": {
      const active = useProject.getState().active
      if (active) void clipboardWriteText(toRelative(rootFor(active), active)).catch(() => {})
      break
    }
    case "file:reveal": {
      const active = useProject.getState().active
      if (active) void revealItemInDir(active).catch(() => {})
      break
    }
    case "edit:undoFile":
      void useFileUndo.getState().undo()
      break
    case "view:foldAll":
      foldAllCmd()
      break
    case "view:unfoldAll":
      unfoldAllCmd()
      break
    case "view:wrap":
      settings.set({ wrap: !settings.wrap })
      break
    case "view:whitespace":
      settings.set({ renderWhitespace: !settings.renderWhitespace })
      break
    case "view:ribbon":
      settings.set({ showRibbon: !settings.showRibbon })
      break
    case "view:focus":
      settings.set({ focusMode: !settings.focusMode })
      break
    case "view:activityBar":
      settings.set({ showActivityBar: !settings.showActivityBar })
      break
    case "view:statusBar":
      settings.set({ showStatusBar: !settings.showStatusBar })
      break
    case "view:breadcrumbs":
      settings.set({ showBreadcrumbs: !settings.showBreadcrumbs })
      break
    case "view:open:files":
      workspace.selectTool("files")
      break
    case "view:open:search":
      workspace.selectTool("search")
      break
    case "view:open:comments":
      workspace.selectTool("comments")
      break
    case "view:open:outline":
      workspace.selectTool("outline")
      break
    case "view:open:git":
      workspace.selectTool("git")
      break
    case "view:open:extensions":
      workspace.selectTool("extensions")
      break
    case "graph":
      workspace.toggleGraph(true)
      break
    case "docs":
      workspace.toggleDocs(true)
      break
    case "zoom:in":
      nudgeZoom(0.1)
      break
    case "zoom:out":
      nudgeZoom(-0.1)
      break
    case "zoom:reset":
      settings.set({ zoom: 1 })
      break

    // Terminal
    case "terminal":
      terminals.toggle()
      break
    case "terminal:new":
      terminals.add()
      break
    case "terminal:split":
      terminals.split()
      break
    case "terminal:clear":
      clearTerminal()
      break
    case "terminal:restart":
      restartTerminal()
      break
    case "terminal:launch:claude":
      void launchAgent("claude-code", "claude")
      break
    case "terminal:launch:codex":
      void launchAgent("codex", "codex")
      break
    case "terminal:launch:copilot":
      void launchAgent("copilot", "copilot")
      break
    case "terminal:launch:gemini":
      void launchAgent("gemini", "gemini")
      break
    case "terminal:launch:opencode":
      void launchAgent("opencode", "opencode")
      break
    case "terminal:sendReview": {
      const count = openCount(useComments.getState().comments)
      // Mirror the Comments/Terminal buttons, which disable at zero: sending a
      // review prompt with no open tasks would produce a meaningless request.
      if (count === 0) {
        notify("info", t("terminal.noTasks"))
        break
      }
      void dispatchToAgent(composeReviewPrompt(count))
      break
    }

    // Help
    case "help:shortcuts":
      palette.toggleShortcuts(true)
      break
    case "help:website":
      void openUrl(WEBSITE)
      break
    case "help:discord":
      void openUrl(DISCORD)
      break
    case "help:report":
      void openUrl(ISSUES)
      break
    case "help:releases":
      void openUrl(RELEASES)
      break
    case "help:revealLog":
      void logPath()
        .then((p) => {
          if (p) return revealItemInDir(p)
        })
        .catch(() => {})
      break
    case "help:copyLogPath":
      void logPath()
        .then((p) => {
          if (p) return navigator.clipboard.writeText(p)
        })
        .catch(() => {})
      break
  }
}

/**
 * Every command id `runMenuCommand` answers to.
 *
 * Derived from the rendered menu model plus the ids that only ever had a
 * keyboard binding, so the keybinding editor can tell a typo from a command —
 * a line pointing at nothing would otherwise just silently do nothing.
 */
export function knownCommands(): Set<string> {
  const ids = new Set<string>(Object.keys(MENU_PRECOND))
  for (const menu of APP_MENUS) {
    for (const item of menu.items) if ("id" in item) ids.add(item.id)
  }
  for (const id of [
    "view:fullscreen",
    "view:zen",
    "view:secondarySidebar",
    "preview:toggle",
    "edit:undoFile",
    "settings",
    "checkUpdates",
    "graph",
    "docs",
    "terminal",
    "zoom:in",
    "zoom:out",
    "zoom:reset",
    "view:ribbon",
    "view:focus",
    // Reachable only as a ⌘K chord or a palette row, so no menu item names
    // them — but they are as rebindable as anything else.
    "settings:json",
    "tabs:closeAll",
    ...Array.from({ length: 9 }, (_, i) => `view:foldLevel:${i + 1}`),
    ...THEMES.map((t) => `theme:${t}`),
    ...(["off", "afterDelay", "onFocusChange"] as const).map((v) => `autosave:${v}`),
  ]) {
    ids.add(id)
  }
  return ids
}

/** Start handling native-menu events; returns an unlisten function. */
export function listenForMenu(): Promise<() => void> {
  return listen<string>("menu", ({ payload: id }) => runMenuCommand(id))
}
