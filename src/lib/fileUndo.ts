/**
 * Undo stack for filesystem actions (move a file to another folder, delete a
 * file/folder). Both are reversible by a move: a delete goes to the project trash
 * (`.reado/.trash/`) and undo moves it back; a move's undo moves it back to its
 * origin. Cmd/Ctrl+Z pops the stack (when the editor isn't focused — see the
 * global-shortcuts hook).
 */
import { create } from "zustand";
import { movePath, trashPath } from "./api";
import { useProject } from "./store";
import { notify, notifyError } from "./notice";
import { t } from "../i18n";

type FileOp =
  | { kind: "move"; from: string; to: string }
  | { kind: "trash"; original: string; trashed: string };

interface FileUndoState {
  stack: FileOp[];
  record: (op: FileOp) => void;
  undo: () => Promise<void>;
}

export const useFileUndo = create<FileUndoState>((set, get) => ({
  stack: [],
  record: (op) => set((s) => ({ stack: [...s.stack, op].slice(-50) })),
  undo: async () => {
    const stack = get().stack;
    const op = stack[stack.length - 1];
    if (!op) return;
    const root = useProject.getState().root;
    try {
      if (op.kind === "move") {
        await movePath(root, op.to, op.from);
        useProject.getState().renamePath(op.to, op.from);
      } else {
        await movePath(root, op.trashed, op.original);
      }
      set({ stack: stack.slice(0, -1) });
      useProject.getState().bumpTree();
    } catch {
      // Can't reverse (e.g. the original name is taken again) — drop the op so the
      // stack doesn't get stuck, and say so.
      set({ stack: stack.slice(0, -1) });
      notifyError("fileUndo", t("undo.failed"));
    }
  },
}));

/** Delete `path` to the project trash and record it so Cmd/Ctrl+Z restores it. */
export async function trashAndRecord(path: string): Promise<void> {
  const root = useProject.getState().root;
  try {
    const trashed = await trashPath(root, path);
    useProject.getState().close(path); // drop any open tab on the deleted file
    useFileUndo.getState().record({ kind: "trash", original: path, trashed });
    useProject.getState().bumpTree();
    notify("info", t("tree.deleted"));
  } catch (e) {
    notifyError("fileUndo", t("tree.deleteFailed"), e);
  }
}
