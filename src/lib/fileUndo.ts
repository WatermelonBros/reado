/**
 * Undo stack for filesystem actions: moving a file to another folder, deleting
 * one, and rewriting files with a project-wide replace.
 *
 * Each is reversible because the previous state is parked rather than thrown
 * away — a delete goes to the project trash (`.reado/.trash/`), a replace copies
 * each file it touches into `.reado/.undo/` first. Cmd/Ctrl+Z pops the stack
 * (when the editor isn't focused — see the global-shortcuts hook).
 *
 * A replace is *one* entry however many files it rewrote: the user made one
 * decision, so one ⌘Z takes it back.
 */
import { create } from "zustand"
import { t } from "@/i18n"
import { type Backup, movePath, restoreBackups, trashPath } from "./api"
import { toRelative } from "./comments"
import { notify, notifyError } from "./notice"
import { useEditorActions, useProject } from "./store"
import { rootFor } from "./workspace"

/**
 * Every op carries the folder it was recorded against.
 *
 * Reading "the project's root" at undo time is right only while one folder is
 * open: with a workspace, undoing a move or a delete in the second folder would
 * resolve against the first — the exact failure the recording sites guard.
 * `replace` needs none: its backups are absolute paths.
 */
type FileOp =
  | { kind: "move"; root: string; from: string; to: string }
  | { kind: "trash"; root: string; original: string; trashed: string }
  | { kind: "replace"; backups: Backup[] }

interface FileUndoState {
  stack: FileOp[]
  record: (op: FileOp) => void
  undo: () => Promise<void>
}

export const useFileUndo = create<FileUndoState>((set, get) => ({
  stack: [],
  record: (op) => set((s) => ({ stack: [...s.stack, op].slice(-50) })),
  undo: async () => {
    const stack = get().stack
    const op = stack[stack.length - 1]
    if (!op) return
    try {
      if (op.kind === "move") {
        await movePath(op.root, op.to, op.from)
        useProject.getState().renamePath(op.to, op.from)
      } else if (op.kind === "trash") {
        await movePath(op.root, op.trashed, op.original)
      } else {
        // Backups are absolute paths; the first backup names the folder they
        // were parked under.
        const restored = await restoreBackups(rootFor(op.backups[0]?.path ?? ""), op.backups)
        notify("info", t("undo.replaced", { count: restored }))
      }
      set({ stack: stack.slice(0, -1) })
      useProject.getState().bumpTree()
    } catch {
      // Can't reverse (e.g. the original name is taken again) — drop the op so the
      // stack doesn't get stuck, and say so.
      set({ stack: stack.slice(0, -1) })
      notifyError("fileUndo", t("undo.failed"))
    }
  },
}))

/** Delete `path` to the project trash and record it so Cmd/Ctrl+Z restores it. */
export async function trashAndRecord(path: string): Promise<void> {
  // The trash lives in the owning folder's `.reado/`, so a delete in the second
  // workspace folder is undoable from that folder's own trash.
  const root = rootFor(path)
  try {
    const trashed = await trashPath(root, path)
    // Forget any unsaved edits on what was just deleted (a folder takes its
    // subtree with it). Closing the tab tears the editor down, and a buffer
    // still marked unsaved would be flushed to disk on the way out — recreating
    // the file the user just deleted.
    const rel = toRelative(root, path)
    for (const p of useEditorActions.getState().dirtyPaths) {
      if (p === rel || p.startsWith(`${rel}/`)) useEditorActions.getState().setDirty(p, false)
    }
    useProject.getState().close(path) // drop any open tab on the deleted file
    useFileUndo.getState().record({ kind: "trash", root, original: path, trashed })
    useProject.getState().bumpTree()
    notify("info", t("tree.deleted"))
  } catch (e) {
    notifyError("fileUndo", t("tree.deleteFailed"), e)
  }
}
