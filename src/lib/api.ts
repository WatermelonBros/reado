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

/** Symlink/copy the bundled `reado` CLI into ~/.local/bin; returns its path. */
export const installCli = () => invoke<string>("install_cli");
/** Whether the `reado` CLI is already installed in ~/.local/bin. */
export const cliInstalled = () => invoke<boolean>("cli_installed");

/** Read a file for display (text, image data URL, or binary placeholder).
 * `asText` forces text decoding for formats that would otherwise render as an
 * image (e.g. SVG), so they can be edited as source. */
export const readFile = (root: string, path: string, asText?: boolean) =>
  invoke<FileContent>("read_file", { root, path, asText });

/** Write UTF-8 text back to a file (manual editing). */
export const writeFile = (root: string, path: string, content: string) =>
  invoke<void>("write_file", { root, path, content });

/** Move/rename a file or folder within the project (internal drag-and-drop). */
export const movePath = (root: string, from: string, to: string) =>
  invoke<void>("move_path", { root, from, to });

/** Copy external files/folders into a project folder (drag-and-drop from outside). */
export const importPaths = (root: string, sources: string[], destDir: string) =>
  invoke<void>("import_paths", { root, sources, destDir });

/** Git status of the project root (never throws). */
export const gitInfo = (root: string) => invoke<GitInfo>("git_info", { root });

export interface GitBranches {
  current: string | null;
  local: string[];
  remote: string[];
}
/** Local + remote branches for the branch switcher. */
export const gitBranches = (root: string) => invoke<GitBranches>("git_branches", { root });
/** Check out a branch (remote branches create a local tracking branch). */
export const gitCheckout = (root: string, branch: string, remote: boolean) =>
  invoke<void>("git_checkout", { root, branch, remote });

export interface GitChange {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

/** Working-tree status (Source Control view), split into staged/unstaged. */
export const gitStatus = (root: string) => invoke<GitChange[]>("git_status", { root });

/** Stage a path (git add). */
export const gitStage = (root: string, path: string) =>
  invoke<void>("git_stage", { root, path });

/** Unstage a path (git reset HEAD). */
export const gitUnstage = (root: string, path: string) =>
  invoke<void>("git_unstage", { root, path });

/** Stage every change. */
export const gitStageAll = (root: string) => invoke<void>("git_stage_all", { root });

/** Unstage everything. */
export const gitUnstageAll = (root: string) => invoke<void>("git_unstage_all", { root });

/** Discard working-tree changes for a path (deletes untracked files). Destructive. */
export const gitDiscard = (root: string, path: string, untracked: boolean) =>
  invoke<void>("git_discard", { root, path, untracked });

/** Commit the staged changes with a message. */
export const gitCommit = (root: string, message: string) =>
  invoke<void>("git_commit", { root, message });

export interface GitRefs {
  branches: string[];
  commits: { hash: string; subject: string }[];
}

/** Local branches and recent commits, for the diff base picker. */
export const gitRefs = (root: string) => invoke<GitRefs>("git_refs", { root });

/** A tracked file's contents at a ref (branch/commit/HEAD), for the diff view. */
export const gitShowRef = (root: string, file: string, base: string) =>
  invoke<string | null>("git_show_ref", { root, file, base });

export interface BlameLine {
  line: number;
  hash: string;
  author: string;
  time: number;
  summary: string;
}

/** Per-line blame for a tracked file (empty when untracked / no git). */
export const gitBlame = (root: string, file: string) =>
  invoke<BlameLine[]>("git_blame", { root, file });

/** Full-text search across the project via ripgrep. */
export const searchText = (root: string, query: string) =>
  invoke<SearchMatch[]>("search_text", { root, query });

/** Replace every literal occurrence of `query` across the project. Returns the
 * number of files changed. */
export const replaceText = (root: string, query: string, replacement: string) =>
  invoke<number>("replace_text", { root, query, replacement });

export interface Definition {
  path: string;
  line: number;
  text: string;
  score: number;
}

/** Candidate definition sites for a symbol, best matches first (LSP-free). */
export const findDefinition = (root: string, name: string) =>
  invoke<Definition[]>("find_definition", { root, name });

/** Format text with the project's formatter for this file type. Throws on failure. */
export const formatFile = (root: string, path: string, content: string) =>
  invoke<string>("format_file", { root, path, content });

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

/** Per-project config (`.reado/config.json`) as raw JSON, or null when absent. */
export const readProjectConfig = (root: string) =>
  invoke<string | null>("read_project_config", { root });

export const writeProjectConfig = (root: string, json: string) =>
  invoke<void>("write_project_config", { root, json });

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

/** Rebuild the SQLite comment index from the `.md` files (a cache). */
export const rebuildIndex = (root: string) =>
  invoke<number>("rebuild_index", { root });

// ---- Integrated terminal (PTY) -------------------------------------------

/** Spawn a login shell in a PTY for terminal tab `id`. */
export const ptySpawn = (id: string, cwd: string, rows: number, cols: number) =>
  invoke<void>("pty_spawn", { id, cwd, rows, cols });

/** Forward input (keystrokes or injected text) to a terminal. */
export const ptyWrite = (id: string, data: string) =>
  invoke<void>("pty_write", { id, data });

/**
 * Send a command to a terminal and submit it. The text and the Enter key are
 * sent as two separate writes: a TUI agent (Claude/Codex use Ink) otherwise
 * treats a trailing newline in the same chunk as a literal newline instead of
 * submitting. `delay` lets a freshly spawned PTY become ready first.
 */
export function submitToTerminal(id: string, command: string, delay = 0): void {
  setTimeout(() => {
    void ptyWrite(id, command);
    setTimeout(() => void ptyWrite(id, "\r"), 120);
  }, delay);
}

/** Resize a terminal's PTY. */
export const ptyResize = (id: string, rows: number, cols: number) =>
  invoke<void>("pty_resize", { id, rows, cols });

/** Kill a terminal session. */
export const ptyKill = (id: string) => invoke<void>("pty_kill", { id });
