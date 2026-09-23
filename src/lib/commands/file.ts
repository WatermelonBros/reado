import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { compareWithSaved } from "@/lib/activeEditor"
import { toRelative } from "@/lib/comments"
import { newFile, newUntitled, revertFile, saveAs } from "@/lib/fileActions"
import { formatDocument, formatSelection, saveAll, saveDocument } from "@/lib/save"
import { usePalette, useProject } from "@/lib/store"
import { openTaskList, runBuildTask } from "@/lib/taskCommands"
import { closeProject, openFileDialog, openInNewWindow, pickFolderAndOpen } from "@/lib/window"
import { addWorkspaceFolder, rootFor } from "@/lib/workspace"
import { pickWorkspaceFile, saveWorkspaceAs } from "@/lib/workspaceFile"
import type { CommandTable } from "./types"

/** The File menu: windows, folders, workspaces, and saving the open buffers. */
export const fileCommands: CommandTable = {
  "window:new": { run: () => openInNewWindow() },
  openFile: { run: () => void openFileDialog() },
  openFolder: { run: () => void pickFolderAndOpen() },
  "workspace:open": { run: () => void pickWorkspaceFile() },
  "workspace:saveAs": { run: () => void saveWorkspaceAs() },
  "workspace:addFolder": { run: () => void addWorkspaceFolder() },
  openRecent: { run: () => usePalette.getState().open("recents") },
  closeProject: { run: () => void closeProject() },
  newFile: { run: () => void newFile() },
  "group:split": { run: () => useProject.getState().splitGroup() },
  "tasks:run": { run: () => void openTaskList() },
  "tasks:build": { run: () => void runBuildTask() },
  newUntitled: { run: () => newUntitled() },
  saveAs: { run: () => void saveAs(), when: "file" },
  save: { run: () => saveDocument(), when: "file" },
  saveAll: { run: () => void saveAll(), when: "file" },
  format: { run: () => void formatDocument(), when: "file" },
  formatSelection: { run: () => void formatSelection(), when: "selection" },
  closeEditor: {
    run: () => {
      const project = useProject.getState()
      if (project.active) project.close(project.active)
    },
    when: "file",
  },
  reopenClosed: { run: () => useProject.getState().reopenClosed(), when: "reopen" },
  revert: { run: () => revertFile(), when: "file" },
  compareSaved: { run: () => compareWithSaved(), when: "file" },
  "file:copyPath": {
    run: () => {
      const active = useProject.getState().active
      if (active) void clipboardWriteText(toRelative(rootFor(active), active)).catch(() => {})
    },
    when: "file",
  },
  "file:reveal": {
    run: () => {
      const active = useProject.getState().active
      if (active) void revealItemInDir(active).catch(() => {})
    },
    when: "file",
  },
}
