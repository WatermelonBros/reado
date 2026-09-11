/**
 * The rendered app-menu model for the Windows/Linux title bar.
 *
 * `decorations: false` removes the native menu strip on those platforms, so the
 * title bar draws its own menu bar from this model. Item ids match the cases in
 * `runMenuCommand` (lib/menu.ts) — the same handler the native macOS menu uses —
 * so there's a single source of truth for what each command does. Labels mirror
 * the native menu (English) for parity with macOS. Native-only items (undo/copy/
 * paste, quit) are omitted: the webview/keyboard already handle them.
 */
import { DEFAULT_BINDINGS } from "./keybindings"

export type MenuItem = { id: string; label: string } | { sep: true } | { header: string }

/**
 * Keyboard accelerators for the native menu, derived from the bindings table.
 *
 * `DEFAULT_BINDINGS` is the one place a keystroke is written down; this is the
 * same set in Tauri's notation, restricted to the commands whose menu item may
 * safely carry an accelerator. Deriving rather than restating is what stopped
 * the two disagreeing — `view:split` here used to claim `⌘\` while the bindings
 * table gave that key to `view:splitToggle`.
 *
 * A native accelerator claims the keystroke before the webview sees it, so a
 * combo that means one thing in the editor and another elsewhere (⌘Z is undo in
 * a file and undo-a-file-operation outside it; ⌘D adds a cursor in the editor
 * and duplicates in the tree) must stay out of `MENU_SAFE` or one of the two
 * meanings dies.
 */
const MENU_SAFE = new Set([
  "settings",
  "window:new",
  "newFile",
  "newUntitled",
  "tasks:run",
  "tasks:build",
  "group:split",
  "openFile",
  "save",
  "saveAll",
  "saveAs",
  "format",
  "reopenClosed",
  "closeEditor",
  "find",
  "edit:replace",
  "edit:toggleComment",
  "edit:quickFix",
  "gotoLine",
  "sel:lineEnds",
  "palette:files",
  "palette:commands",
  "palette:symbols",
  "palette:wsymbols",
  "palette:search",
  "gotodef",
  "go:peek",
  "go:references",
  "go:nextProblem",
  "go:prevProblem",
  "view:sidebar",
  "terminal",
  "view:splitToggle",
  "view:wrap",
  "view:columnSelection",
  // Deliberately not `terminal:new`: `⌃⇧\`` is Ctrl on *every* platform, which
  // is the one shape the `Mod` alias cannot express — derived, it would come out
  // as `CmdOrCtrl` off macOS and disagree with the native menu. The binding
  // still works; only the menu hint is absent.
])

/**
 * Accelerators for commands whose key is bound *inside the editor*, by
 * CodeMirror's own keymaps, rather than in `DEFAULT_BINDINGS`.
 *
 * These cannot be derived, because the window-level table genuinely does not
 * contain them — they are the editor's bindings, and the menu item merely
 * displays and mirrors them. Listed here so the menu still shows a shortcut for
 * Find, Go to Line and the rest instead of leaving them blank.
 */
const EDITOR_ACCELERATORS: Record<string, string> = {
  // Handled natively by the window, not by either binding layer.
  "window:new": "CmdOrCtrl+Shift+N",
  find: "CmdOrCtrl+F",
  "edit:replace": "CmdOrCtrl+Alt+F",
  "edit:toggleComment": "CmdOrCtrl+/",
  gotoLine: "Ctrl+G",
  "sel:lineEnds": "Shift+Alt+I",
  gotodef: "F12",
  "go:peek": "Alt+F12",
  "go:references": "Shift+F12",
}

/** A binding combo in Tauri's accelerator notation. */
const toAccelerator = (combo: string) => combo.replace("Mod", "CmdOrCtrl")

export const ACCELERATORS: Record<string, string> = {
  ...EDITOR_ACCELERATORS,
  ...Object.fromEntries(
    Object.entries(DEFAULT_BINDINGS)
      .filter(([, command]) => MENU_SAFE.has(command))
      .map(([combo, command]) => [command, toAccelerator(combo)]),
  ),
}

/** An accelerator as Windows/Linux write it: "CmdOrCtrl+Shift+N" → "Ctrl+Shift+N". */
export const acceleratorHint = (id: string): string | undefined =>
  ACCELERATORS[id]?.replace("CmdOrCtrl", "Ctrl")

export interface Menu {
  label: string
  items: MenuItem[]
}

export const APP_MENUS: Menu[] = [
  {
    label: "File",
    items: [
      { id: "window:new", label: "New Window" },
      { id: "newUntitled", label: "New Untitled File" },
      { id: "newFile", label: "New File…" },
      { id: "openFile", label: "Open File…" },
      { id: "openFolder", label: "Open Folder…" },
      { id: "openRecent", label: "Open Recent…" },
      { id: "workspace:addFolder", label: "Add Folder to Workspace…" },
      { id: "workspace:open", label: "Open Workspace…" },
      { id: "workspace:saveAs", label: "Save Workspace As…" },
      { sep: true },
      { id: "save", label: "Save" },
      { id: "saveAll", label: "Save All" },
      { id: "saveAs", label: "Save As…" },
      { header: "Auto Save" },
      { id: "autosave:off", label: "Off" },
      { id: "autosave:afterDelay", label: "After Delay" },
      { id: "autosave:onFocusChange", label: "On Focus Change" },
      { id: "revert", label: "Revert File" },
      { id: "compareSaved", label: "Compare with Saved" },
      { id: "format", label: "Format Document" },
      { id: "formatSelection", label: "Format Selection" },
      { sep: true },
      { id: "reopenClosed", label: "Reopen Closed Editor" },
      { id: "closeEditor", label: "Close Editor" },
      { id: "closeProject", label: "Close Project" },
      { sep: true },
      { id: "settings", label: "Settings…" },
      { id: "checkUpdates", label: "Check for Updates…" },
    ],
  },
  {
    label: "Edit",
    items: [
      { id: "edit:undo", label: "Undo" },
      { id: "edit:redo", label: "Redo" },
      { sep: true },
      { id: "find", label: "Find…" },
      { id: "edit:replace", label: "Replace…" },
      { sep: true },
      { id: "edit:findInFiles", label: "Find in Files…" },
      { id: "edit:replaceInFiles", label: "Replace in Files…" },
      { sep: true },
      { id: "edit:toggleComment", label: "Toggle Line Comment" },
      { id: "edit:toggleBlockComment", label: "Toggle Block Comment" },
      { id: "gotoLine", label: "Go to Line…" },
      { sep: true },
      { id: "edit:quickFix", label: "Quick Fix…" },
      { id: "edit:organizeImports", label: "Organize Imports" },
      { sep: true },
      { id: "edit:cursorUndo", label: "Cursor Undo" },
      { id: "edit:cursorRedo", label: "Cursor Redo" },
      { header: "Transform" },
      { id: "edit:upperCase", label: "Transform to Uppercase" },
      { id: "edit:lowerCase", label: "Transform to Lowercase" },
      { id: "edit:titleCase", label: "Transform to Title Case" },
      { id: "edit:sortAsc", label: "Sort Lines Ascending" },
      { id: "edit:sortDesc", label: "Sort Lines Descending" },
      { id: "edit:dedupe", label: "Delete Duplicate Lines" },
      { id: "edit:joinLines", label: "Join Lines" },
      { header: "Whitespace" },
      { id: "edit:trimWhitespace", label: "Trim Trailing Whitespace" },
      { id: "edit:reindent", label: "Reindent Lines" },
      { id: "edit:convertSpaces", label: "Convert Indentation to Spaces" },
      { id: "edit:convertTabs", label: "Convert Indentation to Tabs" },
    ],
  },
  {
    label: "Selection",
    items: [
      { id: "sel:expand", label: "Expand Selection" },
      { id: "sel:shrink", label: "Shrink Selection" },
      { sep: true },
      { id: "sel:addNext", label: "Add Selection to Next Match" },
      { id: "sel:allOccurrences", label: "Select All Occurrences" },
      { id: "sel:cursorAbove", label: "Add Cursor Above" },
      { id: "sel:cursorBelow", label: "Add Cursor Below" },
      { id: "sel:lineEnds", label: "Add Cursors to Line Ends" },
      { id: "sel:duplicate", label: "Duplicate Selection" },
      { sep: true },
      { id: "sel:explain", label: "Explain Selection with AI" },
      { sep: true },
      { id: "sel:copyUp", label: "Copy Line Up" },
      { id: "sel:copyDown", label: "Copy Line Down" },
      { id: "sel:moveUp", label: "Move Line Up" },
      { id: "sel:moveDown", label: "Move Line Down" },
    ],
  },
  {
    label: "Go",
    items: [
      { id: "go:back", label: "Back" },
      { id: "go:forward", label: "Forward" },
      { sep: true },
      { id: "palette:files", label: "Go to File…" },
      { id: "palette:symbols", label: "Go to Symbol in File…" },
      { id: "palette:wsymbols", label: "Go to Symbol in Project…" },
      { id: "palette:commands", label: "Command Palette…" },
      { id: "palette:search", label: "Search in Project…" },
      { sep: true },
      { id: "gotodef", label: "Go to Definition" },
      { id: "go:peek", label: "Peek Definition" },
      { id: "go:typedef", label: "Go to Type Definition" },
      { id: "go:impl", label: "Go to Implementation" },
      { id: "go:references", label: "Find References" },
      { id: "go:bracket", label: "Go to Bracket" },
      { id: "go:lastEdit", label: "Go to Last Edit Location" },
      { sep: true },
      { id: "go:nextProblem", label: "Next Problem" },
      { id: "go:prevProblem", label: "Previous Problem" },
      { sep: true },
      { id: "go:nextTab", label: "Next Editor" },
      { id: "go:prevTab", label: "Previous Editor" },
    ],
  },
  {
    label: "View",
    items: [
      { id: "palette:commands", label: "Command Palette…" },
      { header: "Open View" },
      { id: "view:open:files", label: "Files" },
      { id: "view:open:search", label: "Search" },
      { id: "view:open:comments", label: "Comments" },
      { id: "view:open:outline", label: "Outline" },
      { id: "view:open:git", label: "Source Control" },
      { id: "view:open:extensions", label: "Extensions" },
      { sep: true },
      { id: "view:sidebar", label: "Toggle Sidebar" },
      { id: "view:activityBar", label: "Toggle Activity Bar" },
      { id: "view:statusBar", label: "Toggle Status Bar" },
      { id: "view:breadcrumbs", label: "Toggle Breadcrumbs" },
      { id: "terminal", label: "Toggle Terminal" },
      { id: "view:output", label: "Output" },
      { id: "terminal:runSelection", label: "Run Selected Text in Terminal" },
      { id: "view:splitToggle", label: "Split Editor" },
      { id: "group:split", label: "Split Editor into a New Group" },
      { sep: true },
      { id: "view:foldAll", label: "Fold All" },
      { id: "view:unfoldAll", label: "Unfold All" },
      { sep: true },
      { id: "view:wrap", label: "Toggle Word Wrap" },
      { id: "view:columnSelection", label: "Column Selection Mode" },
      { id: "view:whitespace", label: "Render Whitespace" },
      { id: "view:focus", label: "Focus Mode" },
      { sep: true },
      { id: "graph", label: "Knowledge Graph" },
      { id: "docs", label: "Documentation" },
      { header: "Appearance" },
      { id: "theme:reado-dark", label: "Dark" },
      { id: "theme:reado-light", label: "Light" },
      { id: "theme:reado-high-contrast", label: "High Contrast" },
      { id: "theme:reado-sepia", label: "Sepia" },
      { sep: true },
      { id: "zoom:in", label: "Zoom In" },
      { id: "zoom:out", label: "Zoom Out" },
      { id: "zoom:reset", label: "Reset Zoom" },
    ],
  },
  {
    label: "Terminal",
    items: [
      { id: "tasks:run", label: "Run Task…" },
      { id: "tasks:build", label: "Run Build Task" },
      { sep: true },
      { id: "terminal:new", label: "New Terminal" },
      { id: "terminal:split", label: "Split Terminal" },
      { id: "terminal:clear", label: "Clear Terminal" },
      { id: "terminal:restart", label: "Restart Terminal" },
      { sep: true },
      { id: "terminal:launch:claude", label: "Launch Claude" },
      { id: "terminal:launch:codex", label: "Launch Codex" },
      { id: "terminal:launch:copilot", label: "Launch Copilot" },
      { id: "terminal:launch:gemini", label: "Launch Gemini" },
      { id: "terminal:launch:opencode", label: "Launch OpenCode" },
      { id: "terminal:sendReview", label: "Send Review" },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "help:shortcuts", label: "Keyboard Shortcuts" },
      { id: "docs", label: "Documentation" },
      { id: "help:website", label: "Reado Website" },
      { id: "help:discord", label: "Discord Community" },
      { id: "help:report", label: "Report an Issue" },
      { sep: true },
      { id: "help:revealLog", label: "Reveal Log File" },
      { id: "help:copyLogPath", label: "Copy Log Path" },
      { sep: true },
      { id: "help:releases", label: "Release Notes" },
      { id: "checkUpdates", label: "Check for Updates…" },
    ],
  },
]
