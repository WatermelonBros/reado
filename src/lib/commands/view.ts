import { foldAllCmd, unfoldAllCmd } from "@/lib/activeEditor"
import { toRelative } from "@/lib/comments"
import { focusPane } from "@/lib/liveViews"
import { toggleDockArea } from "@/lib/panels"
import { usePreview } from "@/lib/preview"
import { useReadProgress } from "@/lib/readProgress"
import {
  type SettingsState,
  type Tool,
  toggleZenMode,
  useEditorActions,
  useProject,
  useSettings,
  useWorkspace,
} from "@/lib/store"
import { toggleFullscreen } from "@/lib/window"
import type { Command, CommandTable } from "./types"

/** Toggle the read/unread state of the active file. Read progress is keyed by
 *  project-relative path, so the absolute active path is converted first. */
function toggleActiveRead(): void {
  const { root, active } = useProject.getState()
  if (!active) return
  const rel = toRelative(root, active)
  const isRead = useReadProgress.getState().read.has(rel)
  useReadProgress.getState().mark(root, rel, !isRead)
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 2
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10))
const nudgeZoom = (delta: number) =>
  useSettings.getState().set({ zoom: clampZoom(useSettings.getState().zoom + delta) })

type BooleanSetting = {
  [K in keyof SettingsState]: SettingsState[K] extends boolean ? K : never
}[keyof SettingsState]

/** Flip a boolean setting off its current value. */
const toggleSetting = (key: BooleanSetting): Command => ({
  run: () => {
    const settings = useSettings.getState()
    settings.set({ [key]: !settings[key] })
  },
})

const openTool = (tool: Tool): Command => ({ run: () => useWorkspace.getState().openTool(tool) })

/** The View menu: layout, panes, reading aids, overlays and zoom. */
export const viewCommands: CommandTable = {
  "view:sidebar": { run: () => useWorkspace.getState().toggleSidebar() },
  "view:split": { run: () => useProject.getState().openSplit(), when: "split" },
  "view:splitToggle": {
    run: () => {
      const project = useProject.getState()
      if (project.splitPath) project.closeSplit()
      else project.openSplit()
    },
    when: "split",
  },
  "view:focusPane1": {
    run: () => {
      // A group is a pane, and these two ids were already the keys for "pane 1"
      // and "pane 2": with groups they mean the first and second group, and
      // still move the caret into it when there is an editor there.
      useProject.getState().focusGroup(0)
      focusPane(1)
    },
    when: "file",
  },
  "view:focusPane2": {
    run: () => {
      useProject.getState().focusGroup(1)
      focusPane(2)
    },
    when: "split",
  },
  "view:fullscreen": { run: () => toggleFullscreen() },
  "view:zen": { run: () => toggleZenMode() },
  "view:secondarySidebar": { run: () => toggleDockArea("right") },
  "preview:toggle": {
    run: () => {
      const preview = usePreview.getState()
      if (preview.open) preview.close()
      else preview.openPane()
    },
  },
  "preview:agentAccess": {
    run: () => {
      const p = usePreview.getState()
      p.setAgentAccess(!p.agentAccess)
    },
  },
  "comment:new": { run: () => useEditorActions.getState().requestCompose(), when: "selection" },
  "read:toggle": { run: () => toggleActiveRead(), when: "file" },
  "tabs:closeAll": { run: () => useProject.getState().closeAll() },
  "view:foldAll": { run: () => foldAllCmd(), when: "file" },
  "view:unfoldAll": { run: () => unfoldAllCmd(), when: "file" },
  "view:wrap": toggleSetting("wrap"),
  "view:columnSelection": toggleSetting("columnSelection"),
  "view:whitespace": toggleSetting("renderWhitespace"),
  "view:ribbon": toggleSetting("showRibbon"),
  "view:focus": toggleSetting("focusMode"),
  "view:activityBar": toggleSetting("showActivityBar"),
  "view:statusBar": toggleSetting("showStatusBar"),
  "view:breadcrumbs": toggleSetting("showBreadcrumbs"),
  "view:stickyScroll": toggleSetting("stickyScroll"),
  "view:showHidden": {
    run: () => {
      const project = useProject.getState()
      project.setShowHidden(!project.showHidden)
    },
  },
  "view:open:files": openTool("files"),
  "view:open:search": openTool("search"),
  "view:open:comments": openTool("comments"),
  "view:open:outline": openTool("outline"),
  "view:open:git": openTool("git"),
  "view:open:extensions": openTool("extensions"),
  graph: { run: () => useWorkspace.getState().toggleGraph(true) },
  // No menu item names this one: the graph is opened from the Git panel's
  // menu and the palette. The id exists so it is rebindable like everything
  // else — a command without one cannot be bound to a key at all.
  "git:graph": { run: () => useWorkspace.getState().toggleGitGraph(true) },
  docs: { run: () => useWorkspace.getState().toggleDocs(true) },
  "zoom:in": { run: () => nudgeZoom(0.1) },
  "zoom:out": { run: () => nudgeZoom(-0.1) },
  "zoom:reset": { run: () => useSettings.getState().set({ zoom: 1 }) },
}
