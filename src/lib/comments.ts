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
  setAnchor,
  listArchived,
  forgeResolveThread,
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
  /** Resolved comments (the history), loaded on demand. */
  archived: Comment[];
  loadArchived: () => Promise<void>;
  /** Comment whose thread is currently open, or null. */
  activeId: string | null;
  /** Whether the first-comment gitignore prompt is showing. */
  gitignorePromptOpen: boolean;
  setGitignorePrompt: (open: boolean) => void;
  /** Id of the comment being manually re-anchored, or null. */
  reanchoringId: string | null;
  startReanchor: (id: string) => void;
  cancelReanchor: () => void;
  applyReanchor: (file: string, start: number, end: number) => Promise<void>;
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

/** Route an updated comment to the right list: archived ones move to `archived`
 * (still shown inline as resolved), active ones stay in `comments`. */
function distribute(
  s: { comments: Comment[]; archived: Comment[] },
  next: Comment,
): { comments: Comment[]; archived: Comment[] } {
  const comments = s.comments.filter((c) => c.id !== next.id);
  const archived = s.archived.filter((c) => c.id !== next.id);
  if (next.archived) archived.push(next);
  else comments.push(next);
  return { comments, archived };
}

export const useComments = create<CommentsState>((set, get) => ({
  root: "",
  comments: [],
  archived: [],
  loadArchived: async () => {
    const root = get().root;
    const archived = await listArchived(root);
    if (get().root === root) set({ archived });
  },
  activeId: null,
  gitignorePromptOpen: false,
  setGitignorePrompt: (open) => set({ gitignorePromptOpen: open }),

  reanchoringId: null,
  startReanchor: (id) => set({ reanchoringId: id, activeId: null }),
  cancelReanchor: () => set({ reanchoringId: null }),
  applyReanchor: async (file, start, end) => {
    const id = get().reanchoringId;
    if (!id) return;
    const next = await setAnchor(get().root, id, file, start, end);
    set((s) => ({ comments: replace(s.comments, next), reanchoringId: null }));
  },

  load: async (root) => {
    // A reload of the *same* project (e.g. the watcher saw a comment change)
    // must not clear the list or drop the open thread — only a genuine project
    // switch resets activeId. Clearing/resetting here would close the thread the
    // user just acted on (our own write trips the watcher too).
    const sameRoot = get().root === root;
    if (!sameRoot) set({ root, comments: [], archived: [], activeId: null });
    // Load active and resolved (archived) together: done comments are shown
    // inline in the editor too, so the gutter needs them up front.
    const [comments, archived] = await Promise.all([
      listComments(root),
      listArchived(root),
    ]);
    // Guard against a stale load if the project changed meanwhile.
    if (get().root === root) set({ comments, archived });
  },

  create: async (input) => {
    const { comment, firstComment } = await createComment(get().root, input);
    set((s) => ({ comments: [...s.comments, comment] }));
    return { comment, firstComment };
  },

  patch: async (id, patch) => {
    const next = await updateComment(get().root, id, patch);
    set((s) => distribute(s, next));
  },

  reply: async (id, body) => {
    const next = await addReply(get().root, id, "user", body);
    set((s) => distribute(s, next));
  },

  setState: async (id, state) => {
    const next = await setCommentState(get().root, id, state);
    set((s) => distribute(s, next));
    // If this comment mirrors a host review thread, sync the resolution back to
    // the forge (resolving/reopening the thread there too).
    if (next.origin && next.externalId && next.externalRef) {
      const number = Number(next.externalRef);
      if (number) {
        void forgeResolveThread(get().root, number, next.externalId, state === "done").catch(
          () => {},
        );
      }
    }
  },

  remove: async (id) => {
    await deleteComment(get().root, id);
    set((s) => ({
      comments: s.comments.filter((c) => c.id !== id),
      archived: s.archived.filter((c) => c.id !== id),
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
