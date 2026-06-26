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

/** Create a new empty file (project-relative path); returns its absolute path. */
export const createFile = (root: string, path: string) =>
  invoke<string>("create_file", { root, path });

/** Move/rename a file or folder within the project (internal drag-and-drop). */
export const movePath = (root: string, from: string, to: string) =>
  invoke<void>("move_path", { root, from, to });

/** Copy external files/folders into a project folder (drag-and-drop from outside). */
export const importPaths = (root: string, sources: string[], destDir: string) =>
  invoke<void>("import_paths", { root, sources, destDir });

/** Resolve a relative import spec to an existing file (for modifier-click on a
 * path); returns the absolute path or null. */
export const resolveImport = (root: string, fromFile: string, spec: string) =>
  invoke<string | null>("resolve_import", { root, fromFile, spec });

/** Resolve a path printed in the terminal (project-relative or absolute) to an
 * existing file inside the project; returns the absolute path or null. */
export const resolvePath = (root: string, spec: string) =>
  invoke<string | null>("resolve_path", { root, spec });

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

/** Discard all working-tree changes; `untracked` also removes untracked files. Destructive. */
export const gitDiscardAll = (root: string, untracked: boolean) =>
  invoke<void>("git_discard_all", { root, untracked });

/** Commit the staged changes with a message. */
export const gitCommit = (root: string, message: string) =>
  invoke<void>("git_commit", { root, message });

/** Create and switch to a new branch. */
export const gitCreateBranch = (root: string, name: string) =>
  invoke<void>("git_create_branch", { root, name });

/** Fetch all remotes (with prune). */
export const gitFetch = (root: string) => invoke<void>("git_fetch", { root });

/** Pull the current branch from upstream. */
export const gitPull = (root: string) => invoke<void>("git_pull", { root });

/** Push the current branch (sets upstream to origin if needed). */
export const gitPush = (root: string) => invoke<void>("git_push", { root });

export interface StashEntry {
  index: number;
  message: string;
}

/** List saved stashes (most recent first). */
export const gitStashList = (root: string) =>
  invoke<StashEntry[]>("git_stash_list", { root });

/** Stash working-tree changes (optionally including untracked). */
export const gitStash = (root: string, message: string, untracked: boolean) =>
  invoke<void>("git_stash", { root, message, untracked });

/** Apply and drop a stash. */
export const gitStashPop = (root: string, index: number) =>
  invoke<void>("git_stash_pop", { root, index });

/** Apply a stash, keeping it. */
export const gitStashApply = (root: string, index: number) =>
  invoke<void>("git_stash_apply", { root, index });

/** Delete a stash without applying. */
export const gitStashDrop = (root: string, index: number) =>
  invoke<void>("git_stash_drop", { root, index });

export interface GitRefs {
  branches: string[];
  commits: { hash: string; subject: string }[];
}

/** Local branches and recent commits, for the diff base picker. */
export const gitRefs = (root: string) => invoke<GitRefs>("git_refs", { root });

/** A tracked file's contents at a ref (branch/commit/HEAD), for the diff view. */
export const gitShowRef = (root: string, file: string, base: string) =>
  invoke<string | null>("git_show_ref", { root, file, base });

export interface FileCommit {
  hash: string;
  author: string;
  time: number;
  subject: string;
}
/** Commits that touched a file (most recent first), for the Timeline panel. */
export const gitFileHistory = (root: string, file: string) =>
  invoke<FileCommit[]>("git_file_history", { root, file });

/** The current HEAD commit (short hash), or null outside a repo. */
export const gitHead = (root: string) => invoke<string | null>("git_head", { root });

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

export interface Symbol {
  name: string;
  kind: string;
  path: string;
  line: number;
}

/** All declared symbols across the project, for the workspace symbol picker. */
export const listSymbols = (root: string) =>
  invoke<Symbol[]>("list_symbols", { root });

/** Project-relative paths the user has marked read. */
export const listRead = (root: string) => invoke<string[]>("list_read", { root });

/** Mark a project-relative path read or unread (persisted in `.reado/`). When
 *  marking read, `content` is snapshotted so a later change can be reviewed as a
 *  delta (oversized content is skipped on the backend). */
export const setReadState = (root: string, path: string, read: boolean, content?: string) =>
  invoke<void>("set_read", { root, path, read, content: content ?? null });

/** The content snapshotted when a path was last marked read, if any. */
export const getReadSnapshot = (root: string, path: string) =>
  invoke<string | null>("get_read_snapshot", { root, path });

export interface Bookmark {
  /** Project-relative, forward-slashed path. */
  path: string;
  /** 1-based line. */
  line: number;
  /** 1-based end line for a region. */
  endLine?: number;
  /** One-line snippet captured at creation, for the list. */
  snippet: string;
}

/** This project's reading bookmarks (persisted in `.reado/bookmarks.json`). */
export const getBookmarks = (root: string) => invoke<Bookmark[]>("get_bookmarks", { root });

/** Replace the whole bookmark set. */
export const setBookmarks = (root: string, bookmarks: Bookmark[]) =>
  invoke<void>("set_bookmarks", { root, bookmarks });

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
  /** The hosting forge a pulled review thread came from ("github"/"gitlab"). */
  origin?: string;
  /** The host thread/discussion id, for resolution sync. */
  externalId?: string;
  /** The host change-request ref (PR/MR number) the thread belongs to. */
  externalRef?: string;
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

// ---- Guided Pair Review sessions -----------------------------------------

export type ScopeKind =
  | "diff"
  | "branch"
  | "folder"
  | "files"
  | "comments"
  | "project"
  | "pr";

export type Objective =
  | "bug_risk"
  | "design"
  | "maintainability"
  | "security"
  | "performance"
  | "test_coverage"
  | "ai_sanity"
  | "onboarding"
  | "general";

export type ReviewMode = "quick" | "normal" | "deep";

export type FileState =
  | "not_started"
  | "queued"
  | "in_review"
  | "reviewed"
  | "needs_followup"
  | "skipped"
  | "blocked"
  | "out_of_scope";

export type SessionStatus = "planning" | "in_review" | "done";

export type ArtifactType =
  | "comment"
  | "task"
  | "note"
  | "question"
  | "decision"
  | "follow_up"
  | "needs_context"
  | "false_positive"
  | "file_summary"
  | "session_summary";

export type ArtifactState =
  | "proposed"
  | "accepted"
  | "edited"
  | "discarded"
  | "converted_to_task"
  | "converted_to_note"
  | "resolved_as_false_positive";

export interface ReviewScope {
  kind: ScopeKind;
  base?: string;
  paths?: string[];
  pr?: string;
}

export interface RouteEntry {
  file: string;
  priority: number;
  reason: string;
  suggestedReviewMode: ReviewMode;
  relatedFiles?: string[];
}

export interface FileEntry {
  file: string;
  state: FileState;
  summary?: string;
}

export interface Proposal {
  id: string;
  artifactType: ArtifactType;
  state: ArtifactState;
  file: string;
  startLine: number;
  endLine: number;
  type?: CommentType;
  body: string;
  author: string;
  agent?: string;
  commentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  title: string;
  scope: ReviewScope;
  objective?: Objective;
  status: SessionStatus;
  position: number;
  route?: RouteEntry[];
  files?: FileEntry[];
  proposals?: Proposal[];
  summary?: string;
  agent?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewSession {
  title: string;
  scope: ReviewScope;
  objective?: Objective;
}

/** Project-relative files changed for a scope (working tree, or `base...HEAD`). */
export const gitChangedFiles = (root: string, base?: string) =>
  invoke<string[]>("git_changed_files", { root, base });

export const sessionCreate = (root: string, input: NewSession) =>
  invoke<Session>("session_create", { root, input });

export const sessionList = (root: string) =>
  invoke<Session[]>("session_list", { root });

export const sessionGet = (root: string, id: string) =>
  invoke<Session>("session_get", { root, id });

export const sessionSetFileState = (
  root: string,
  id: string,
  file: string,
  state: FileState,
) => invoke<Session>("session_set_file_state", { root, id, file, state });

/** Move the route cursor to a file index (the focused/current file). */
export const sessionSetPosition = (root: string, id: string, index: number) =>
  invoke<Session>("session_set_position", { root, id, index });

export const sessionAcceptProposal = (
  root: string,
  id: string,
  proposal: string,
  kind: CommentKind,
) => invoke<Session>("session_accept_proposal", { root, id, proposal, kind });

export const sessionSetProposalState = (
  root: string,
  id: string,
  proposal: string,
  state: ArtifactState,
  body?: string,
) =>
  invoke<Session>("session_set_proposal_state", { root, id, proposal, state, body });

export const sessionAddDecision = (
  root: string,
  id: string,
  text: string,
  file: string,
) => invoke<Proposal>("session_add_decision", { root, id, text, file });

export const sessionSetFileSummary = (
  root: string,
  id: string,
  file: string,
  text: string,
) => invoke<Session>("session_set_file_summary", { root, id, file, text });

export const sessionSetSummary = (root: string, id: string, text: string) =>
  invoke<Session>("session_set_summary", { root, id, text });

export const sessionClose = (root: string, id: string) =>
  invoke<Session>("session_close", { root, id });

/** Delete a session entirely (reset/discard). Accepted comments are untouched. */
export const sessionDelete = (root: string, id: string) =>
  invoke<void>("session_delete", { root, id });

/** Publish (or clear with null) the resolve-loop state for paired phones. */
export const anywherePublishLoop = (json: string | null) =>
  invoke<void>("anywhere_publish_loop", { json });

// ---- Forge adapter (pull-request-review) ---------------------------------

export type ForgeProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "gitea"
  | "azuredevops"
  | "unknown";

export interface Forge {
  provider: ForgeProvider;
  host: string;
  cli?: string;
  term: string;
  hasAdapter: boolean;
}

export interface Pr {
  number: number;
  title: string;
  author: string;
  branch: string;
}

export type Verdict = "approve" | "request_changes" | "comment";

/** Detect the hosting forge from the project's origin remote. */
export const detectForge = (root: string) => invoke<Forge>("detect_forge", { root });

/** Whether a forge CLI (gh/glab) is on PATH. */
export const forgeCliPresent = (cli: string) =>
  invoke<boolean>("forge_cli_present", { cli });

/** Open PRs/MRs via the detected CLI (empty when none/unavailable). */
export const forgeListPrs = (root: string) => invoke<Pr[]>("forge_list_prs", { root });

/** Fetch + check out a PR/MR branch so a guided review can read it. */
export const forgeCheckoutPr = (root: string, number: number) =>
  invoke<void>("forge_checkout_pr", { root, number });

/** Submit the session as one batched review with a verdict. */
export const forgeSubmitReview = (
  root: string,
  number: number,
  verdict: Verdict,
  body: string,
) => invoke<void>("forge_submit_review", { root, number, verdict, body });

export interface PullResult {
  comments: Comment[];
  /** Host threads that failed to import (a partial sync, surfaced not hidden). */
  dropped: number;
}

/** Pull a PR/MR's existing review threads into the comment inbox (idempotent). */
export const forgePullThreads = (root: string, number: number) =>
  invoke<PullResult>("forge_pull_threads", { root, number });

/** Resolve (or reopen) a host thread to mirror a resolution made in Reado. */
export const forgeResolveThread = (
  root: string,
  number: number,
  externalId: string,
  resolved: boolean,
) => invoke<void>("forge_resolve_thread", { root, number, externalId, resolved });

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

/** The executable used by PTY sessions (used for shell-specific command syntax). */
export const ptyDefaultShell = () => invoke<string>("pty_default_shell");

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

/** Start a known language `server` (resolved to a binary in Rust) for connection
 * `id`, running in `cwd`; output via `lsp-{id}`. */
export const lspStart = (id: string, server: string, cwd: string) =>
  invoke<void>("lsp_start", { id, server, cwd });

/** Send a JSON-RPC message to language server `id`. */
export const lspSend = (id: string, message: string) =>
  invoke<void>("lsp_send", { id, message });

/** Stop a language server. */
export const lspStop = (id: string) => invoke<void>("lsp_stop", { id });

/** Whether a known language server's binary is installed (on the real PATH). */
export const lspInstalled = (server: string) =>
  invoke<boolean>("lsp_installed", { server });

/** The Linux package manager available ("apt"|"dnf"|"pacman"|"zypper"|"brew"),
 * or null — so the marketplace picks the right per-distro install command. */
export const linuxPackageManager = () =>
  invoke<string | null>("linux_package_manager");

/** Kill a terminal session. */
export const ptyKill = (id: string) => invoke<void>("pty_kill", { id });

// ---- Reado Anywhere: opt-in LAN server (phone review) ---------------------

/** What the desktop shows for pairing: the HTTPS LAN address, the certificate
 * fingerprint to verify, and a single-use pairing token. */
export interface AnywhereInfo {
  url: string;
  fingerprint: string;
  token: string;
}

/** Start the Reado Anywhere LAN server (idempotent); returns the pairing info. */
export const anywhereEnable = () => invoke<AnywhereInfo>("anywhere_enable");

/** Stop the Reado Anywhere server. */
export const anywhereDisable = () => invoke<void>("anywhere_disable");

/** The running server's info, or null when Reado Anywhere is off. */
export const anywhereStatus = () => invoke<AnywhereInfo | null>("anywhere_status");

/** Register this window's open project so a paired phone can pick it. */
export const anywhereSetProject = (id: string, root: string, name: string) =>
  invoke<void>("anywhere_set_project", { id, root, name });

/** Drop this window's project from the phone-visible list (on close). */
export const anywhereClearProject = (id: string) =>
  invoke<void>("anywhere_clear_project", { id });

/** Publish the recent-projects list so a phone can open one on the desktop. */
export const anywhereSetRecents = (recents: { path: string; name: string }[]) =>
  invoke<void>("anywhere_set_recents", { recents });
