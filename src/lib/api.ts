/**
 * Typed wrappers around the Tauri command boundary.
 *
 * Keeping every `invoke` call in one place means the rest of the app never
 * touches stringly-typed command names, and the Rust signatures are mirrored
 * here once.
 */
import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export type FileContent =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUrl: string }
  | { kind: "binary"; size: number };

export interface GitInfo {
  isRepo: boolean;
  branch: string | null;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}

/** List the immediate children of `dir`, honouring ignore rules. */
export const listDir = (root: string, dir: string, showHidden: boolean) =>
  invoke<DirEntry[]>("list_dir", { root, dir, showHidden });

/** Every file path in the project, for the fuzzy finder. */
export const listFiles = (root: string) => invoke<string[]>("list_files", { root });

/** Read a file for display (text, image data URL, or binary placeholder). */
export const readFile = (root: string, path: string) =>
  invoke<FileContent>("read_file", { root, path });

/** Write UTF-8 text back to a file (manual editing). */
export const writeFile = (root: string, path: string, content: string) =>
  invoke<void>("write_file", { root, path, content });

/** Git status of the project root (never throws). */
export const gitInfo = (root: string) => invoke<GitInfo>("git_info", { root });

/** The committed (HEAD) contents of a tracked file, for the diff view. */
export const gitShowHead = (root: string, file: string) =>
  invoke<string | null>("git_show_head", { root, file });

/** Full-text search across the project via ripgrep. */
export const searchText = (root: string, query: string) =>
  invoke<SearchMatch[]>("search_text", { root, query });

// ---- Annotations ---------------------------------------------------------

export type CommentType = "bug" | "refactor" | "performance" | "question" | "note";
export type CommentState = "open" | "in-progress" | "done" | "discarded";
export type CommentKind = "task" | "note";
export type Scope = "range" | "file" | "project";

export interface Anchor {
  file: string;
  scope: Scope;
  startLine: number;
  endLine: number;
}

export interface Context {
  snippet: string;
  before: string;
  after: string;
}

export interface Message {
  author: string;
  agent?: string;
  createdAt: number;
  body: string;
}

export interface Comment {
  id: string;
  type: CommentType;
  state: CommentState;
  kind: CommentKind;
  anchor: Anchor;
  context: Context;
  links: string[];
  author: string;
  agent?: string;
  orphan: boolean;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  archived: boolean;
}

export interface NewComment {
  file: string;
  scope: Scope;
  startLine: number;
  endLine: number;
  type: CommentType;
  kind: CommentKind;
  body: string;
  context: Context;
}

export interface CreateResult {
  comment: Comment;
  firstComment: boolean;
}

export interface CommentPatch {
  type?: CommentType;
  kind?: CommentKind;
  links?: string[];
  body?: string;
}

export const createComment = (root: string, input: NewComment) =>
  invoke<CreateResult>("create_comment", { root, input });

export const listComments = (root: string) =>
  invoke<Comment[]>("list_comments", { root });

export const listArchived = (root: string) =>
  invoke<Comment[]>("list_archived", { root });

export const updateComment = (root: string, id: string, patch: CommentPatch) =>
  invoke<Comment>("update_comment", { root, id, patch });

export const addReply = (
  root: string,
  id: string,
  author: string,
  body: string,
  agent?: string,
) => invoke<Comment>("add_reply", { root, id, author, agent, body });

export const setCommentState = (root: string, id: string, state: CommentState) =>
  invoke<Comment>("set_comment_state", { root, id, state });

export const deleteComment = (root: string, id: string) =>
  invoke<void>("delete_comment", { root, id });

export const addReadoGitignore = (root: string, versioned: boolean) =>
  invoke<void>("add_reado_gitignore", { root, versioned });

/** Recompute the anchors of `file`'s comments against its current content. */
export const reanchorFile = (root: string, file: string) =>
  invoke<Comment[]>("reanchor_file", { root, file });

/** Manually re-anchor a comment to a file/range (resolves an orphan). */
export const setAnchor = (
  root: string,
  id: string,
  file: string,
  start: number,
  end: number,
) => invoke<Comment>("set_anchor", { root, id, file, start, end });

/** Start the filesystem watcher for the project (emits `file-changed`). */
export const startWatching = (root: string) =>
  invoke<void>("start_watching", { root });

// ---- Integrated terminal (PTY) -------------------------------------------

/** Spawn a login shell in a PTY for terminal tab `id`. */
export const ptySpawn = (id: string, cwd: string, rows: number, cols: number) =>
  invoke<void>("pty_spawn", { id, cwd, rows, cols });

/** Forward input (keystrokes or injected text) to a terminal. */
export const ptyWrite = (id: string, data: string) =>
  invoke<void>("pty_write", { id, data });

/** Resize a terminal's PTY. */
export const ptyResize = (id: string, rows: number, cols: number) =>
  invoke<void>("pty_resize", { id, rows, cols });

/** Kill a terminal session. */
export const ptyKill = (id: string) => invoke<void>("pty_kill", { id });
