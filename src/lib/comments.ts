/**
 * Annotation state.
 *
 * Mirrors the on-disk store (the `.md` files are the source of truth) into
 * memory for the UI. Every mutation goes through a Tauri command and then
 * updates the local list with the authoritative comment returned by the
 * backend, so the two never drift.
 */
import { create } from "zustand";
import {
  listComments,
  createComment,
  updateComment,
  addReply,
  setCommentState,
  deleteComment,
  type Comment,
  type CommentPatch,
  type CommentState,
  type NewComment,
} from "./api";

/** Convert an absolute path to a project-relative, forward-slashed path. */
export function toRelative(root: string, path: string): string {
  const rel = path.startsWith(root) ? path.slice(root.length) : path;
  return rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

interface CommentsState {
  root: string;
  comments: Comment[];
  /** Comment whose thread is currently open, or null. */
  activeId: string | null;
  /** Whether the first-comment gitignore prompt is showing. */
  gitignorePromptOpen: boolean;
  setGitignorePrompt: (open: boolean) => void;
  load: (root: string) => Promise<void>;
  create: (input: NewComment) => Promise<{ comment: Comment; firstComment: boolean }>;
  patch: (id: string, patch: CommentPatch) => Promise<void>;
  reply: (id: string, body: string) => Promise<void>;
  setState: (id: string, state: CommentState) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  /** Replace all comments anchored to `file` with the reanchored set. */
  replaceForFile: (file: string, next: Comment[]) => void;
}

/** Replace the stored comment with `next`, or drop it when archived/removed. */
function replace(list: Comment[], next: Comment): Comment[] {
  const without = list.filter((c) => c.id !== next.id);
  // Archived comments leave the active list; they live in the history view.
  return next.archived ? without : [...without, next];
}

export const useComments = create<CommentsState>((set, get) => ({
  root: "",
  comments: [],
  activeId: null,
  gitignorePromptOpen: false,
  setGitignorePrompt: (open) => set({ gitignorePromptOpen: open }),

  load: async (root) => {
    set({ root, comments: [], activeId: null });
    const comments = await listComments(root);
    // Guard against a stale load if the project changed meanwhile.
    if (get().root === root) set({ comments });
  },

  create: async (input) => {
    const { comment, firstComment } = await createComment(get().root, input);
    set((s) => ({ comments: [...s.comments, comment] }));
    return { comment, firstComment };
  },

  patch: async (id, patch) => {
    const next = await updateComment(get().root, id, patch);
    set((s) => ({ comments: replace(s.comments, next) }));
  },

  reply: async (id, body) => {
    const next = await addReply(get().root, id, "user", body);
    set((s) => ({ comments: replace(s.comments, next) }));
  },

  setState: async (id, state) => {
    const next = await setCommentState(get().root, id, state);
    set((s) => ({ comments: replace(s.comments, next) }));
  },

  remove: async (id) => {
    await deleteComment(get().root, id);
    set((s) => ({
      comments: s.comments.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }));
  },

  setActive: (id) => set({ activeId: id }),

  replaceForFile: (file, next) =>
    set((s) => ({
      comments: [...s.comments.filter((c) => c.anchor.file !== file), ...next],
    })),
}));

/** Comments anchored to a given project-relative file path. */
export const commentsForFile = (comments: Comment[], relPath: string) =>
  comments.filter((c) => c.anchor.file === relPath);

/** Count of comments that are still open (for the status bar / badges). */
export const openCount = (comments: Comment[]) =>
  comments.filter((c) => c.state === "open").length;
