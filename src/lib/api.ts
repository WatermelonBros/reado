/**
 * Typed wrappers around the Tauri command boundary.
 *
 * Keeping every `invoke` call in one place means the rest of the app never
 * touches stringly-typed command names, and the Rust signatures are mirrored
 * here once.
 */
// Route every command through the traced wrapper so the IPC boundary (command
// name, duration, outcome) is logged without changing any call site.

import type { VaultItem, VaultStatus } from "@/lib/vault"
import { tracedInvoke as invoke } from "./logger"
import { useSettings } from "./store"
import { profileFor } from "./terminalProfiles"

/** The user's exclude-from-tree/search globs, read at call time. */
const excludeGlobs = () => useSettings.getState().excludeGlobs

/** Globs excluded from project search: the search-specific list when the user
 *  set one, otherwise the tree's. Empty means "same as the tree", so the common
 *  case stays a single list to maintain. */
const searchExcludeGlobs = () => {
  const s = useSettings.getState()
  return s.searchExcludeGlobs.length > 0 ? s.searchExcludeGlobs : s.excludeGlobs
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  /** Last-modified time (ms since the epoch), when the platform reports one. */
  modified?: number
}

export type FileContent =
  /** `encoding` is the charset the backend decoded with, and the one a save
   *  writes back. Optional because "absent" and "utf-8" mean the same thing —
   *  the overwhelmingly common case stays untyped noise-free. */
  | { kind: "text"; text: string; encoding?: string }
  | { kind: "image"; dataUrl: string }
  | { kind: "pdf"; dataUrl: string }
  | { kind: "binary"; size: number }
  /** Text, but past the large-file guard — not read. Re-read with `guardBytes: 0`
   *  to open it anyway. */
  | { kind: "large"; size: number }

export interface GitInfo {
  isRepo: boolean
  branch: string | null
  /** Commits on HEAD not yet on the upstream (how many to push). */
  ahead: number
  /** Commits on the upstream not yet on HEAD (how many to pull). */
  behind: number
  /** Whether any remote is configured. */
  hasRemote: boolean
  /** Whether the current branch tracks an upstream. */
  hasUpstream: boolean
  /** Files with working-tree or index changes (the Source Control badge). */
  changedFiles: number
}

/** Result of a sync (pull + push). */
export interface SyncOutcome {
  /** Files left conflicted by the pull; non-empty means the push was skipped. */
  conflicted: string[]
}

export interface SearchMatch {
  path: string
  line: number
  column: number
  text: string
}

/** List the immediate children of `dir`, honouring ignore rules. */
export const listDir = (root: string, dir: string, showHidden: boolean) =>
  invoke<DirEntry[]>("list_dir", { root, dir, showHidden, exclude: excludeGlobs() })

/** Every file path in one folder, for the fuzzy finder. */
export const listFiles = (root: string) =>
  invoke<string[]>("list_files", { root, exclude: excludeGlobs() })

/** Whether an AI agent binary (claude/codex/copilot) resolves on the PATH, so
 * AI actions can be gated instead of dispatching a prompt into a bare shell. */
export const agentInstalled = (bin: string) => invoke<boolean>("agent_installed", { bin })

/** Drain any files the OS asked to open with Reado before the UI was ready
 * (cold launch via a file association). Each is a resolved {root, file} pair. */
export const drainOpenTargets = () => invoke<{ root: string; file: string }[]>("drain_open_targets")

/** Make Reado the default app for the given file extensions. On macOS this sets
 * the handlers directly (`kind: "set"`); on Windows it opens the OS chooser
 * (`kind: "settings"`); elsewhere it may report `"manual"`. */
export const setDefaultHandler = (exts: string[]) =>
  invoke<{ kind: "set" | "settings" | "manual"; count: number }>("set_default_handler", { exts })

/** Symlink/copy the bundled `reado` CLI into ~/.local/bin; returns its path. */
export const installCli = () => invoke<string>("install_cli")
/** Whether the `reado` CLI is already installed in ~/.local/bin. */
export const cliInstalled = () => invoke<boolean>("cli_installed")

/** Read a file for display (text, image data URL, or binary placeholder).
 * `asText` forces text decoding for formats that would otherwise render as an
 * image (e.g. SVG), so they can be edited as source. */
/** Read a file for display. `guardBytes` applies the user's large-file guard;
 *  pass 0 to bypass it ("open anyway"), and omit it where the guard shouldn't
 *  apply at all (agent results, sidecars — files Reado itself wrote). */
export const readFile = (
  root: string,
  path: string,
  asText?: boolean,
  guardBytes?: number,
  /** Force an encoding ("Reopen with Encoding"); omitted, the backend detects. */
  encoding?: string,
) => invoke<FileContent>("read_file", { root, path, asText, guardBytes, encoding })

/** The encodings "Reopen with Encoding" offers. */
export const listEncodings = () => invoke<string[]>("list_encodings")

/** One ranked answer from the local semantic index. */
export interface SemanticHit {
  file: string
  line: number
  snippet: string
  /** The declared symbol the hit sits on, when it is one. */
  symbol?: string
}

/** (Re)build the local semantic index over the project. */
export const semanticRebuild = (root: string) => invoke<number>("semantic_rebuild", { root })

/** Re-index one file after it changed on disk. */
export const semanticReindexFile = (root: string, file: string) =>
  invoke<number>("semantic_reindex_file", { root, file })

/** Ask the local index. Empty when it hasn't been built yet. */
export const semanticQuery = (root: string, q: string) =>
  invoke<SemanticHit[]>("semantic_query", { root, q })

/** One added line of a hunk, with a patch that stages just it. */
export interface LinePatch {
  line: number
  text: string
  patch: string
}

/** One hunk of a file's diff, with a patch that applies just it. */
export interface Hunk {
  index: number
  header: string
  patch: string
  newStart: number
  added: number
  removed: number
  /** Per-line patches, when the hunk is unambiguous (no removals). Empty
   *  otherwise: a `+` inside a replacement can't be staged on its own. */
  linePatches: LinePatch[]
}

/** The hunks of a file's diff. `staged` reads the index against HEAD. */
export const gitFileHunks = (root: string, file: string, staged: boolean) =>
  invoke<Hunk[]>("git_file_hunks", { root, file, staged })

/** Apply a patch. `cached` targets the index; `reverse` undoes it — which is how
 *  unstage (cached+reverse) and discard (reverse) are expressed. */
export const gitApplyPatch = (root: string, patch: string, cached: boolean, reverse: boolean) =>
  invoke<void>("git_apply_patch", { root, patch, cached, reverse })

/** One conflicted region: what each side wants, and where it sits. */
export interface ConflictRegion {
  index: number
  startLine: number
  endLine: number
  oursLabel: string
  theirsLabel: string
  ours: string
  theirs: string
}

/** The conflicted regions of a file, or empty when it has none. */
export const gitConflictRegions = (root: string, file: string) =>
  invoke<ConflictRegion[]>("git_conflict_regions", { root, file })

/** Resolve one region by keeping a side; the file is rewritten without its markers. */
export const gitResolveConflict = (
  root: string,
  file: string,
  index: number,
  side: "ours" | "theirs" | "both",
) => invoke<void>("git_resolve_conflict", { root, file, index, side })

/** Abandon an in-progress merge. */
export const gitMergeAbort = (root: string) => invoke<void>("git_merge_abort", { root })

/** Abandon an in-progress rebase. */
export const gitRebaseAbort = (root: string) => invoke<void>("git_rebase_abort", { root })

/** Line ranges the working tree changes vs HEAD — the diff gutter's input. */
export const gitWorkingDiffLines = (root: string, file: string) =>
  invoke<Array<[number, number]>>("git_working_diff_lines", { root, file })

/** Keep the window's title string (the Dock's window list reads it) while
 *  hiding the text macOS would paint over the content. macOS only. */
export const hideNativeTitleText = () => invoke<void>("window_hide_title_text")

/** One parked copy of a file's earlier content (local history). */
export interface HistoryEntry {
  /** Nanoseconds since the epoch, as a string — the key `historyRead` takes. */
  stamp: string
  size: number
}

/** The copies kept for one project file, newest first. Independent of git. */
export const historyList = (root: string, path: string) =>
  invoke<HistoryEntry[]>("history_list", { root, path })

/** The content of one parked copy. */
export const historyRead = (root: string, path: string, stamp: string) =>
  invoke<string>("history_read", { root, path, stamp })

/** Write UTF-8 text back to a file (manual editing). */
export const writeFile = (root: string, path: string, content: string, encoding?: string) =>
  invoke<void>("write_file", { root, path, content, encoding })

/** Create a new empty file (project-relative path); returns its absolute path. */
export const createFile = (root: string, path: string) =>
  invoke<string>("create_file", { root, path })

/** Create a new empty folder (project-relative path); returns its absolute path. */
export const createDir = (root: string, path: string) =>
  invoke<string>("create_dir", { root, path })

/** Move/rename a file or folder within the project (internal drag-and-drop). */
export const movePath = (root: string, from: string, to: string) =>
  invoke<void>("move_path", { root, from, to })

/** Delete a path into the project's own trash (`.reado/.trash/`), reversibly.
 * Returns the absolute trashed path so it can be moved back on undo. */
export const trashPath = (root: string, path: string) =>
  invoke<string>("trash_path", { root, path })

/** Copy external files/folders into a project folder (drag-and-drop from outside). */
export const importPaths = (root: string, sources: string[], destDir: string) =>
  invoke<void>("import_paths", { root, sources, destDir })

/** Resolve a relative import spec to an existing file (for modifier-click on a
 * path); returns the absolute path or null. */
export const resolveImport = (root: string, fromFile: string, spec: string) =>
  invoke<string | null>("resolve_import", { root, fromFile, spec })

/** Resolve a path printed in the terminal (project-relative or absolute) to an
 * existing file inside the project; returns the absolute path or null. With
 * `search`, a spec that isn't root-relative is matched by suffix against the
 * project's files — terminal output rarely names paths from the root. */
export const resolvePath = (root: string, spec: string, search = false) =>
  invoke<string | null>("resolve_path", { root, spec, search })

/** Save the clipboard image to a temp PNG and return its path (null if the
 * clipboard holds no image) — the only way to hand one to an agent in a PTY. */
export const clipboardImageToTemp = () => invoke<string | null>("clipboard_image_to_temp")

/** Allow the webview to load files under `root` through the `asset:` protocol,
 *  so markdown previews can show a README's own images. */
export const allowProjectAssets = (root: string) => invoke<void>("allow_project_assets", { root })

/** Git status of the project root (never throws). */
export const gitInfo = (root: string) => invoke<GitInfo>("git_info", { root })

export interface GitBranches {
  current: string | null
  local: string[]
  remote: string[]
}
/** Local + remote branches for the branch switcher. */
export const gitBranches = (root: string) => invoke<GitBranches>("git_branches", { root })
/** Check out a branch (remote branches create a local tracking branch). */
export const gitCheckout = (root: string, branch: string, remote: boolean) =>
  invoke<void>("git_checkout", { root, branch, remote })

export interface GitChange {
  path: string
  status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted"
  staged: boolean
}

/** Working-tree status (Source Control view), split into staged/unstaged. */
export const gitStatus = (root: string) => invoke<GitChange[]>("git_status", { root })

/** Stage a path (git add). */
export const gitStage = (root: string, path: string) => invoke<void>("git_stage", { root, path })

/** Unstage a path (git reset HEAD). */
export const gitUnstage = (root: string, path: string) =>
  invoke<void>("git_unstage", { root, path })

/** Stage every change. */
export const gitStageAll = (root: string) => invoke<void>("git_stage_all", { root })

/** Unstage everything. */
export const gitUnstageAll = (root: string) => invoke<void>("git_unstage_all", { root })

/** Discard working-tree changes for a path (deletes untracked files). Destructive. */
export const gitDiscard = (root: string, path: string, untracked: boolean) =>
  invoke<void>("git_discard", { root, path, untracked })

/** Discard all working-tree changes; `untracked` also removes untracked files. Destructive. */
export const gitDiscardAll = (root: string, untracked: boolean) =>
  invoke<void>("git_discard_all", { root, untracked })

/** Commit the staged changes with a message. */
export const gitCommit = (root: string, message: string) =>
  invoke<void>("git_commit", { root, message })

/** Whether the commit at HEAD is already on the upstream — amending it then
 *  rewrites history other people may have. */
export const gitHeadIsPushed = (root: string) => invoke<boolean>("git_head_is_pushed", { root })

/** Amend the last commit with whatever is staged. No message reuses its own. */
export const gitAmend = (root: string, message?: string) =>
  invoke<void>("git_amend", { root, message })

/** What applying a commit elsewhere did: empty `conflicted` means it went in. */
export interface ApplyOutcome {
  conflicted: string[]
}

/** A new commit that undoes an old one. */
export const gitRevert = (root: string, commit: string) =>
  invoke<ApplyOutcome>("git_revert", { root, commit })

/** Apply one commit from another branch onto this one. */
export const gitCherryPick = (root: string, commit: string) =>
  invoke<ApplyOutcome>("git_cherry_pick", { root, commit })

/** The repository's tags, newest first. */
export const gitTags = (root: string) => invoke<string[]>("git_tags", { root })

/** Create a tag at HEAD; a message makes it annotated. */
export const gitTagCreate = (root: string, name: string, message?: string) =>
  invoke<void>("git_tag_create", { root, name, message })

export const gitTagDelete = (root: string, name: string) =>
  invoke<void>("git_tag_delete", { root, name })

export const gitTagPush = (root: string, name: string, remote: string) =>
  invoke<void>("git_tag_push", { root, name, remote })

/** A remote and where it points. */
export interface Remote {
  name: string
  url: string
}

export const gitRemotes = (root: string) => invoke<Remote[]>("git_remotes", { root })

export const gitRemoteAdd = (root: string, name: string, url: string) =>
  invoke<void>("git_remote_add", { root, name, url })

export const gitRemoteRename = (root: string, from: string, to: string) =>
  invoke<void>("git_remote_rename", { root, from, to })

export const gitRemoteRemove = (root: string, name: string) =>
  invoke<void>("git_remote_remove", { root, name })

/** Merge a branch into the current one; conflicts come back as an outcome. */
export const gitMerge = (root: string, branch: string) =>
  invoke<ApplyOutcome>("git_merge", { root, branch })

/** Replay this branch on top of another. */
export const gitRebase = (root: string, onto: string) =>
  invoke<ApplyOutcome>("git_rebase", { root, onto })

/** The commits an interactive rebase would replay, oldest first. */
export const gitRebaseCommits = (root: string, upstream: string) =>
  invoke<Array<{ hash: string; subject: string }>>("git_rebase_commits", { root, upstream })

/** What to do with one commit in an interactive rebase. */
export type RebaseAction = "pick" | "squash" | "fixup" | "drop"

/** Run an interactive rebase from a plan built in the UI. */
export const gitRebaseInteractive = (
  root: string,
  upstream: string,
  todo: Array<{ action: RebaseAction; hash: string }>,
) => invoke<ApplyOutcome>("git_rebase_interactive", { root, upstream, todo })

/** What the sequencer is halfway through: `rebase`, `merge`, `cherry-pick`,
 *  `revert`, or nothing. It decides what finishing means. */
export const gitSequencer = (root: string) => invoke<string | null>("git_sequencer", { root })

/** Carry on once the conflicts are resolved (stages, then `--continue`). */
export const gitSequencerContinue = (root: string) =>
  invoke<ApplyOutcome>("git_sequencer_continue", { root })

/** A checkout of this repository in another directory. */
export interface Worktree {
  path: string
  branch: string | null
  isMain: boolean
}

export const gitWorktrees = (root: string) => invoke<Worktree[]>("git_worktrees", { root })

export const gitWorktreeAdd = (root: string, path: string, branch: string, newBranch: boolean) =>
  invoke<void>("git_worktree_add", { root, path, branch, newBranch })

export const gitWorktreeRemove = (root: string, path: string) =>
  invoke<void>("git_worktree_remove", { root, path })

/** A repository nested inside this one. */
export interface Submodule {
  path: string
  sha: string
  initialized: boolean
  modified: boolean
}

export const gitSubmodules = (root: string) => invoke<Submodule[]>("git_submodules", { root })

/** Clone and update submodules — all of them, or one. */
export const gitSubmoduleUpdate = (root: string, path?: string) =>
  invoke<void>("git_submodule_update", { root, path })

/** Whether this repository signs its commits (`commit.gpgsign`). */
export const gitSigning = (root: string) => invoke<boolean>("git_signing", { root })

export const gitSetSigning = (root: string, on: boolean) =>
  invoke<void>("git_set_signing", { root, on })

/** Why this repository could not sign — `""` when it can. The reasons are keys
 *  (`no-gpg`, `no-key`, `no-ssh-key`), translated at the call site. */
export const gitSigningCheck = (root: string) => invoke<string>("git_signing_check", { root })

/** One commit as the graph draws it. */
export interface GraphCommit {
  hash: string
  parents: string[]
  subject: string
  author: string
  date: string
  refs: string[]
}

/** Every branch's history, newest first. */
export const gitGraph = (root: string, limit: number) =>
  invoke<GraphCommit[]>("git_graph", { root, limit })

/** One runnable test, as found in the source. */
export interface TestItem {
  name: string
  /** Enclosing suites, outermost first. */
  suites: string[]
  line: number
}

/** One file's tests, and the framework that runs them. */
export interface TestFile {
  /** Project-relative. */
  path: string
  framework: string
  /** The directory the framework runs from — the nearest manifest at or above
   *  the file, project-relative; `""` is the project root. */
  project: string
  tests: TestItem[]
  /** Last-modified time, ms since the epoch — what a remembered verdict is
   *  checked against before it is shown as current. */
  modified?: number
}

/** Every test in the project, found by reading the source rather than by asking
 *  a framework that may not be installed. */
export const discoverTests = (root: string) => invoke<TestFile[]>("discover_tests", { root })

/** Create and switch to a new branch. */
export const gitCreateBranch = (root: string, name: string) =>
  invoke<void>("git_create_branch", { root, name })

/** Fetch all remotes (with prune). */
export const gitFetch = (root: string) => invoke<void>("git_fetch", { root })

/** Pull the current branch from upstream. */
export const gitPull = (root: string) => invoke<void>("git_pull", { root })

/** Push the current branch (sets upstream to origin if needed). */
export const gitPush = (root: string) => invoke<void>("git_push", { root })

/** Sync: pull then push. Resolves with the conflicted files (empty = clean). */
export const gitSync = (root: string) => invoke<SyncOutcome>("git_sync", { root })

export interface StashEntry {
  index: number
  message: string
}

/** List saved stashes (most recent first). */
export const gitStashList = (root: string) => invoke<StashEntry[]>("git_stash_list", { root })

/** Stash working-tree changes (optionally including untracked). */
export const gitStash = (root: string, message: string, untracked: boolean) =>
  invoke<void>("git_stash", { root, message, untracked })

/** Apply and drop a stash. */
export const gitStashPop = (root: string, index: number) =>
  invoke<void>("git_stash_pop", { root, index })

/** Apply a stash, keeping it. */
export const gitStashApply = (root: string, index: number) =>
  invoke<void>("git_stash_apply", { root, index })

/** Delete a stash without applying. */
export const gitStashDrop = (root: string, index: number) =>
  invoke<void>("git_stash_drop", { root, index })

export interface GitRefs {
  branches: string[]
  commits: { hash: string; subject: string }[]
}

/** Local branches and recent commits, for the diff base picker. */
export const gitRefs = (root: string) => invoke<GitRefs>("git_refs", { root })

/** A tracked file's contents at a ref (branch/commit/HEAD). Null when the file
 *  isn't in that ref — the caller reads the working tree instead. */
export const gitShowRef = (root: string, file: string, base: string) =>
  invoke<string | null>("git_show_ref", { root, file, base })

/** The document to diff a file against at `base`. Empty when the ref exists but
 *  the file doesn't — a file added since the base, whose diff is all-added.
 *  Null only when the ref itself doesn't resolve. */
export const gitDiffBase = (root: string, file: string, base: string) =>
  invoke<string | null>("git_diff_base", { root, file, base })

/** Head-side line ranges (1-based, inclusive) a file changed across `base...head`
 *  — the lines a PR touched, for inline change markers. */
export const gitDiffLines = (root: string, file: string, base: string, head: string) =>
  invoke<[number, number][]>("git_diff_lines", { root, file, base, head })

export interface FileCommit {
  hash: string
  author: string
  time: number
  subject: string
}
/** Commits that touched a file (most recent first), for the Timeline panel. */
export const gitFileHistory = (root: string, file: string) =>
  invoke<FileCommit[]>("git_file_history", { root, file })

/** The current HEAD commit (short hash), or null outside a repo. */
export const gitHead = (root: string) => invoke<string | null>("git_head", { root })

export interface BlameLine {
  line: number
  hash: string
  author: string
  time: number
  summary: string
}

/** Per-line blame for a tracked file (empty when untracked / no git). */
export const gitBlame = (root: string, file: string) =>
  invoke<BlameLine[]>("git_blame", { root, file })

/** Full-text search across the project via ripgrep. */
/** Global-search toggles, mirroring VS Code's Aa / whole-word / .* buttons. */
export type SearchOpts = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  /** Project-relative folder to search in ("Find in Folder"); absent = all of it. */
  scope?: string | null
  /** Comma-separated globs to restrict this search to ("files to include"). */
  include?: string
  /** Comma-separated globs to skip for this search only, on top of the settings. */
  exclude?: string
}
const DEFAULT_SEARCH_OPTS: SearchOpts = { caseSensitive: false, wholeWord: false, regex: false }

/** Split a comma/space-separated glob field into patterns. Not exported: the
 *  wrapper sweep in `api.uitest.ts` treats every export here as a command. */
const globList = (s?: string): string[] =>
  (s ?? "")
    .split(/[,\s]+/)
    .map((g) => g.trim())
    .filter(Boolean)

/** The filters and toggles a search runs with, as the backend takes them.
 *
 *  Search and replace must agree on what a match *is* — a rewrite that finds
 *  something different from the list on screen is the bug this exists to
 *  prevent — so they build their arguments from one place rather than two
 *  hand-copied object literals that the next option can be added to only once. */
const searchToggles = (opts: SearchOpts) => ({
  caseSensitive: opts.caseSensitive,
  wholeWord: opts.wholeWord,
  regex: opts.regex,
})

const searchArgs = (opts: SearchOpts) => ({
  // The search list is what the user is looking at, so a rewrite must obey the
  // same exclusions it does — not the tree's.
  exclude: [...searchExcludeGlobs(), ...globList(opts.exclude)],
  include: globList(opts.include),
  scope: opts.scope ?? null,
  ...searchToggles(opts),
})

export const searchText = (root: string, query: string, opts: SearchOpts = DEFAULT_SEARCH_OPTS) =>
  invoke<SearchMatch[]>("search_text", { root, query, ...searchArgs(opts) })

/** One file's pre-replace content, parked so the rewrite can be undone. */
export interface Backup {
  path: string
  backup: string
}

/** What a replace did, and how to take it back. */
export interface ReplaceResult {
  changed: number
  backups: Backup[]
}

/** Replace every match of `query` across the project. Returns the number of
 * files changed. */
export const replaceText = (
  root: string,
  query: string,
  replacement: string,
  opts: SearchOpts = DEFAULT_SEARCH_OPTS,
) => invoke<ReplaceResult>("replace_text", { root, query, replacement, ...searchArgs(opts) })

/** Replace inside one file: every match, or only the ones at the given
 *  `[line, column]` positions ("replace this result") — the positions a
 *  `SearchMatch` carries, so pass them through unchanged. Takes the same toggles
 *  the search ran with, for the same reason `replaceText` does. */
export const replaceInFile = (
  root: string,
  path: string,
  query: string,
  replacement: string,
  opts: SearchOpts = DEFAULT_SEARCH_OPTS,
  positions: Array<[number, number]> = [],
) =>
  // One file, so the project-wide globs and scope do not apply — but the toggles
  // must, and they come from the same place the search took them.
  invoke<ReplaceResult>("replace_in_file", {
    root,
    path,
    query,
    replacement,
    ...searchToggles(opts),
    positions,
  })

/** Replace whole lines of one file, by 1-based line number — how the editable
 *  search results are written back. Backed up like any other bulk write. */
export const writeLines = (
  root: string,
  path: string,
  edits: Array<{ line: number; text: string }>,
) => invoke<ReplaceResult>("write_lines", { root, path, edits })

/** Write over a project file, parking a copy for undo first — the door language
 *  server workspace edits go through, so a cross-file rename is one ⌘Z. */
export const writeBacked = (root: string, path: string, content: string, encoding?: string) =>
  invoke<ReplaceResult>("write_backed", { root, path, content, encoding })

/** Put parked content back — the undo of a replace. Returns how many files were
 *  restored (a backup someone deleted meanwhile is skipped, not an error). */
export const restoreBackups = (root: string, backups: Backup[]) =>
  invoke<number>("restore_backups", { root, backups })

export interface Definition {
  path: string
  line: number
  text: string
  score: number
}

/** Candidate definition sites for a symbol, best matches first (LSP-free). */
export const findDefinition = (root: string, name: string) =>
  invoke<Definition[]>("find_definition", { root, name })

export interface Symbol {
  name: string
  kind: string
  path: string
  line: number
}

/** All declared symbols across the project, for the workspace symbol picker. */
export const listSymbols = (root: string) => invoke<Symbol[]>("list_symbols", { root })

/** Project-relative paths the user has marked read. */
export const listRead = (root: string) => invoke<string[]>("list_read", { root })

/** Mark a project-relative path read or unread (persisted in `.reado/`). When
 *  marking read, `content` is snapshotted so a later change can be reviewed as a
 *  delta (oversized content is skipped on the backend). */
export const setReadState = (root: string, path: string, read: boolean, content?: string) =>
  invoke<void>("set_read", { root, path, read, content: content ?? null })

/** The content snapshotted when a path was last marked read, if any. */
export const getReadSnapshot = (root: string, path: string) =>
  invoke<string | null>("get_read_snapshot", { root, path })

export interface Bookmark {
  /** Project-relative, forward-slashed path. */
  path: string
  /** 1-based line. */
  line: number
  /** 1-based end line for a region. */
  endLine?: number
  /** One-line snippet captured at creation, for the list. */
  snippet: string
}

/** This project's reading bookmarks (persisted in `.reado/bookmarks.json`). */
export const getBookmarks = (root: string) => invoke<Bookmark[]>("get_bookmarks", { root })

/** Replace the whole bookmark set. */
export const setBookmarks = (root: string, bookmarks: Bookmark[]) =>
  invoke<void>("set_bookmarks", { root, bookmarks })

/** The outcome of a format attempt. `formatter` is null when the project
 *  declares none for this file — a normal result, not a failure. */
export interface FormatResult {
  formatter: string | null
  text: string
  changed: boolean
}

/** Format text with a formatter this project declares. `formatter` pins one by
 *  id (the per-project override). Throws when a formatter ran and failed, or
 *  when the project declares one that isn't installed. */
export const formatFile = (
  root: string,
  path: string,
  content: string,
  formatter?: string | null,
) => invoke<FormatResult>("format_file", { root, path, content, formatter: formatter ?? null })

/** A formatter's standing for the open project. */
export interface FormatterStatus {
  id: string
  exts: string[]
  declared: boolean
  installed: boolean
}

/** Every formatter Reado can run, with whether this project declares it and
 *  whether it's installed here. */
export const formatterStatus = (root: string) =>
  invoke<FormatterStatus[]>("formatter_status", { root })

// ---- Extension marketplace (Open VSX) -------------------------------------

/** An extension's published `package.json`. Only the keys Reado reads are named;
 *  everything else in a real manifest is deliberately ignored. */
export interface ExtManifest {
  name?: string
  displayName?: string
  description?: string
  version?: string
  publisher?: string
  /** A code entry point. Its presence is what makes an extension "partial":
   *  Reado takes the data it declares and never loads the code. */
  main?: string
  browser?: string
  extensionPack?: string[]
  extensionDependencies?: string[]
  categories?: string[]
  contributes?: Record<string, unknown>
}

/** One catalogue entry, with the manifest that says what it contributes. */
export interface ExtListing {
  id: string
  namespace: string
  name: string
  version: string
  displayName: string
  description: string
  downloadCount: number
  verified: boolean
  icon: string | null
  manifest: ExtManifest | null
}

export interface ExtSearchPage {
  items: ExtListing[]
  total: number
}

/** An installed extension, read from its own directory. */
export interface InstalledExt {
  id: string
  namespace: string
  name: string
  version: string
  displayName: string
  manifest: ExtManifest
}

/** Search Open VSX. `category` narrows to one of the registry's own categories
 *  ("Themes", "Snippets", "Programming Languages"); `sort: "downloads"` orders
 *  by installs, which is what makes an empty query worth browsing. */
export const ovsxSearch = (
  query: string,
  category: string | null,
  offset: number,
  size: number,
  sort: "downloads" | null = null,
) => invoke<ExtSearchPage>("ovsx_search", { query, category, offset, size, sort })

/** Download, verify and unpack an extension. The download URL comes from the
 *  registry's own answer, never from here. */
export const ovsxInstall = (namespace: string, name: string, version: string) =>
  invoke<InstalledExt>("ovsx_install", { namespace, name, version })

export const ovsxInstalled = () => invoke<InstalledExt[]>("ovsx_installed")

/** An extension's README as Markdown — from disk when it's installed, from the
 *  registry otherwise, so a listing can be read before installing it. */
export const ovsxReadme = (namespace: string, name: string, version?: string | null) =>
  invoke<string>("ovsx_readme", { namespace, name, version: version ?? null })

/** The latest published version of each id, for the ones the registry answers
 *  for. An id missing from the answer means "no update offered" — unreachable
 *  and up-to-date must not look the same. */
export const ovsxLatest = (ids: string[]) => invoke<Record<string, string>>("ovsx_latest", { ids })

export const ovsxUninstall = (namespace: string, name: string) =>
  invoke<void>("ovsx_uninstall", { namespace, name })

/** Read a text file an extension contributes, confined to its own directory. */
export const extRead = (namespace: string, name: string, path: string) =>
  invoke<string>("ext_read", { namespace, name, path })

/** Read a binary asset an extension contributes, as a `data:` URL. */
export const extAsset = (namespace: string, name: string, path: string) =>
  invoke<string>("ext_asset", { namespace, name, path })

// ---- Annotations ---------------------------------------------------------

export type CommentType = "bug" | "refactor" | "performance" | "question" | "note"
export type CommentState =
  | "open"
  | "in-progress"
  | "done"
  | "discarded"
  | "blocked"
  /** The agent says it fixed this and nothing checked — a claim, not a proof. */
  | "resolved-unverified"
export type CommentKind = "task" | "note"
export type Scope = "range" | "file" | "project" | "web"

export interface Anchor {
  file: string
  scope: Scope
  startLine: number
  endLine: number
  /** `scope: "web"` design comments: the page URL and click point (document coords). */
  url?: string
  x?: number
  y?: number
}

export interface Context {
  snippet: string
  before: string
  after: string
}

export interface Message {
  author: string
  agent?: string
  createdAt: number
  body: string
}

/** What a verification command reported. */
export interface Verification {
  cmd: string
  passed: boolean
}

/** Provenance for a resolved task — the evidence behind "done". */
export interface Resolution {
  agent: string
  model?: string
  diffRef?: string
  verify?: Verification
  at: number
}

export interface Comment {
  id: string
  type: CommentType
  state: CommentState
  kind: CommentKind
  anchor: Anchor
  context: Context
  links: string[]
  author: string
  agent?: string
  /** The hosting forge a pulled review thread came from ("github"/"gitlab"). */
  origin?: string
  /** The host thread/discussion id, for resolution sync. */
  externalId?: string
  /** The host change-request ref (PR/MR number) the thread belongs to. */
  externalRef?: string
  orphan: boolean
  /** Why the agent stopped, when `state` is "blocked". */
  blockedReason?: string
  /** Failed agent attempts; the task blocks itself once the budget is spent. */
  attempts?: number
  /** How the task was resolved: who, with what, against which diff, and whether
   *  anything checked. */
  resolution?: Resolution
  createdAt: number
  updatedAt: number
  messages: Message[]
  archived: boolean
}

export interface NewComment {
  file: string
  scope: Scope
  startLine: number
  endLine: number
  type: CommentType
  kind: CommentKind
  body: string
  context: Context
  /** `scope: "web"`: the page URL and click point (document coords). */
  url?: string
  x?: number
  y?: number
}

export interface CreateResult {
  comment: Comment
  firstComment: boolean
}

export interface CommentPatch {
  type?: CommentType
  kind?: CommentKind
  links?: string[]
  body?: string
}

export const createComment = (root: string, input: NewComment) =>
  invoke<CreateResult>("create_comment", { root, input })

export const listComments = (root: string) => invoke<Comment[]>("list_comments", { root })

export const listArchived = (root: string) => invoke<Comment[]>("list_archived", { root })

export const updateComment = (root: string, id: string, patch: CommentPatch) =>
  invoke<Comment>("update_comment", { root, id, patch })

export const addReply = (root: string, id: string, author: string, body: string, agent?: string) =>
  invoke<Comment>("add_reply", { root, id, author, agent, body })

/** Block a task with the reason the agent gave. It leaves the resolvable set
 *  until a human answers it. */
export const blockComment = (root: string, id: string, reason: string) =>
  invoke<Comment>("block_comment", { root, id, reason })

/** Answer a blocked task: the note joins the thread and the task reopens. */
export const answerBlocked = (root: string, id: string, note: string) =>
  invoke<Comment>("answer_blocked", { root, id, note })

export const setCommentState = (root: string, id: string, state: CommentState) =>
  invoke<Comment>("set_comment_state", { root, id, state })

export const deleteComment = (root: string, id: string) =>
  invoke<void>("delete_comment", { root, id })

export const addReadoGitignore = (root: string, versioned: boolean) =>
  invoke<void>("add_reado_gitignore", { root, versioned })

/** Write a settings bundle to a path the user picked in the OS save dialog.
 *  The backend requires a `.json` extension; nothing else outside the open
 *  project is writable. */
export const writeSettingsFile = (path: string, json: string) =>
  invoke<void>("write_settings_file", { path, json })

/** Read a settings bundle back from a path the user picked in the open dialog. */
export const readSettingsFile = (path: string) => invoke<string>("read_settings_file", { path })

/**
 * What `.editorconfig` says about one file.
 *
 * Every field is optional because "the project didn't say" and "the project
 * said no" are different answers: Reado falls back to its own detection only
 * for the properties nobody set.
 */
export interface EditorConfig {
  indentStyle?: "tab" | "space"
  indentSize?: number
  tabWidth?: number
  endOfLine?: "lf" | "crlf" | "cr"
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
  /** 0 means `max_line_length = off` — an explicit "no ruler". */
  maxLineLength?: number
  /** Whether any `.editorconfig` applied to this file at all. */
  applies: boolean
}

export const editorConfigFor = (root: string, path: string) =>
  invoke<EditorConfig>("editor_config_for", { root, path })

/** A shared, repository-versioned file under the project's `.reado/` directory
 *  (snippets, recommended extensions), or null when absent. `name` must be a
 *  bare file name — the backend rejects anything with a path in it. */
export const readReadoFile = (root: string, name: string) =>
  invoke<string | null>("read_reado_file", { root, name })

/** Per-project config (`.reado/config.json`) as raw JSON, or null when absent. */
export const readProjectConfig = (root: string) =>
  invoke<string | null>("read_project_config", { root })

export const writeProjectConfig = (root: string, json: string, name?: string) =>
  invoke<void>("write_project_config", { root, json, name })

// ---- Guided Pair Review sessions -----------------------------------------

export type ScopeKind =
  | "diff"
  | "branch"
  | "folder"
  | "files"
  | "comments"
  | "project"
  | "pr"
  | "prompt"

export type Objective =
  | "bug_risk"
  | "design"
  | "maintainability"
  | "security"
  | "performance"
  | "test_coverage"
  | "ai_sanity"
  | "onboarding"
  | "general"

export type ReviewMode = "quick" | "normal" | "deep"

export type FileState =
  | "not_started"
  | "queued"
  | "in_review"
  | "reviewed"
  | "needs_followup"
  | "skipped"
  | "blocked"
  | "out_of_scope"

export type SessionStatus = "planning" | "in_review" | "done"

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
  | "session_summary"

export type ArtifactState =
  | "proposed"
  | "accepted"
  | "edited"
  | "discarded"
  | "converted_to_task"
  | "converted_to_note"
  | "resolved_as_false_positive"

export interface ReviewScope {
  kind: ScopeKind
  base?: string
  paths?: string[]
  pr?: string
  /** The user's free-text request for a `prompt` scope (what to review). */
  request?: string
}

export interface RouteEntry {
  file: string
  priority: number
  reason: string
  suggestedReviewMode: ReviewMode
  relatedFiles?: string[]
}

export interface FileEntry {
  file: string
  state: FileState
  summary?: string
}

/** A route change the agent proposed mid-session, pending the human's decision.
 *  The session keeps running its current route until it is accepted. */
export interface RouteChange {
  id: string
  route: RouteEntry[]
  reason: string
  author: string
  agent?: string
  createdAt: number
}

export interface Proposal {
  id: string
  artifactType: ArtifactType
  state: ArtifactState
  file: string
  startLine: number
  endLine: number
  type?: CommentType
  body: string
  author: string
  agent?: string
  commentId?: string
  createdAt: number
  updatedAt: number
}

export interface Session {
  id: string
  title: string
  scope: ReviewScope
  objective?: Objective
  status: SessionStatus
  position: number
  route?: RouteEntry[]
  files?: FileEntry[]
  proposals?: Proposal[]
  /** The files the scope is known to contain — set for the scopes Reado can
   *  enumerate from git (the diff, a branch range), empty for a PR (which lives
   *  in refs) or a free-text request. Route coverage is measured against it. */
  expectedFiles?: string[]
  routeChange?: RouteChange
  summary?: string
  agent?: string
  createdAt: number
  updatedAt: number
}

export interface NewSession {
  title: string
  scope: ReviewScope
  objective?: Objective
  expectedFiles?: string[]
}

/** Project-relative files changed for a scope (working tree, or `base...HEAD`). */
export const gitChangedFiles = (root: string, base?: string) =>
  invoke<string[]>("git_changed_files", { root, base })

/** One line of the agent's live reasoning feed (`.reado/reasoning.jsonl`). */
export interface Thought {
  ts: number
  kind: string
  text: string
  agent?: string
}

export const reasoningRead = (root: string) => invoke<Thought[]>("reasoning_read", { root })

export const reasoningClear = (root: string) => invoke<void>("reasoning_clear", { root })

export const sessionCreate = (root: string, input: NewSession) =>
  invoke<Session>("session_create", { root, input })

export const sessionList = (root: string) => invoke<Session[]>("session_list", { root })

export const sessionGet = (root: string, id: string) => invoke<Session>("session_get", { root, id })

export const sessionSetFileState = (root: string, id: string, file: string, state: FileState) =>
  invoke<Session>("session_set_file_state", { root, id, file, state })

/** Move the route cursor to a file index (the focused/current file). */
export const sessionSetPosition = (root: string, id: string, index: number) =>
  invoke<Session>("session_set_position", { root, id, index })

export const sessionAcceptProposal = (
  root: string,
  id: string,
  proposal: string,
  kind: CommentKind,
) => invoke<Session>("session_accept_proposal", { root, id, proposal, kind })

export const sessionSetProposalState = (
  root: string,
  id: string,
  proposal: string,
  state: ArtifactState,
  body?: string,
) => invoke<Session>("session_set_proposal_state", { root, id, proposal, state, body })

export const sessionAddDecision = (root: string, id: string, text: string, file: string) =>
  invoke<Proposal>("session_add_decision", { root, id, text, file })

export const sessionSetFileSummary = (root: string, id: string, file: string, text: string) =>
  invoke<Session>("session_set_file_summary", { root, id, file, text })

export const sessionSetSummary = (root: string, id: string, text: string) =>
  invoke<Session>("session_set_summary", { root, id, text })

/** Accept the agent's proposed route change — it becomes the session's route. */
export const sessionAcceptRouteChange = (root: string, id: string) =>
  invoke<Session>("session_accept_route_change", { root, id })

export const sessionDiscardRouteChange = (root: string, id: string) =>
  invoke<Session>("session_discard_route_change", { root, id })

export const sessionClose = (root: string, id: string) =>
  invoke<Session>("session_close", { root, id })

/** Delete a session entirely (reset/discard). Accepted comments are untouched. */
export const sessionDelete = (root: string, id: string) =>
  invoke<void>("session_delete", { root, id })

/** Publish (or clear with null) the resolve-loop state for paired phones. */
/** Mirror the agent terminal's recent output for paired phones. The desktop
 *  publishes because it owns the PTY; a second reader would race it. */
export const anywherePublishAgent = (terminal: string | null, text: string) =>
  invoke<void>("anywhere_publish_agent", { terminal, text })

/** Push a notice to paired phones (loop finished, the agent needs you). */
export const anywhereNotify = (kind: string, text: string) =>
  invoke<void>("anywhere_notify", { kind, text })

export const anywherePublishLoop = (json: string | null) =>
  invoke<void>("anywhere_publish_loop", { json })

// ---- Forge adapter (pull-request-review) ---------------------------------

export type ForgeProvider = "github" | "gitlab" | "bitbucket" | "gitea" | "azuredevops" | "unknown"

export interface Forge {
  provider: ForgeProvider
  host: string
  cli?: string
  term: string
  hasAdapter: boolean
}

export interface Pr {
  number: number
  title: string
  author: string
  branch: string
}

export type Verdict = "approve" | "request_changes" | "comment"

/** Detect the hosting forge from the project's origin remote. */
export const detectForge = (root: string) => invoke<Forge>("detect_forge", { root })

/** Whether a forge CLI (gh/glab) is on PATH. */
export const forgeCliPresent = (cli: string) => invoke<boolean>("forge_cli_present", { cli })

/** Open PRs/MRs via the detected CLI (empty when none/unavailable). */
export const forgeListPrs = (root: string) => invoke<Pr[]>("forge_list_prs", { root })

/** A PR fetched in place — head/base as hidden refs, no working-tree change. */
export interface PrCheckout {
  head: string
  base: string
  files: string[]
}

/** Fetch a PR/MR non-destructively (refs only) for an in-place review. */
export const forgeFetchPr = (root: string, number: number) =>
  invoke<PrCheckout>("forge_fetch_pr", { root, number })

/** Submit the session as one batched review with a verdict. */
/** A line-anchored comment to post inline on the PR (GitHub). */
export interface ReviewComment {
  path: string
  line: number
  body: string
}

export const forgeSubmitReview = (
  root: string,
  number: number,
  verdict: Verdict,
  body: string,
  comments: ReviewComment[],
) => invoke<void>("forge_submit_review", { root, number, verdict, body, comments })

export interface PullResult {
  comments: Comment[]
  /** Host threads that failed to import (a partial sync, surfaced not hidden). */
  dropped: number
}

/** Pull a PR/MR's existing review threads into the comment inbox (idempotent). */
export const forgePullThreads = (root: string, number: number) =>
  invoke<PullResult>("forge_pull_threads", { root, number })

/** Resolve (or reopen) a host thread to mirror a resolution made in Reado. */
export const forgeResolveThread = (
  root: string,
  number: number,
  externalId: string,
  resolved: boolean,
) => invoke<void>("forge_resolve_thread", { root, number, externalId, resolved })

/** Recompute the anchors of `file`'s comments against its current content. */
export const reanchorFile = (root: string, file: string) =>
  invoke<Comment[]>("reanchor_file", { root, file })

/** Manually re-anchor a comment to a file/range (resolves an orphan). */
export const setAnchor = (root: string, id: string, file: string, start: number, end: number) =>
  invoke<Comment>("set_anchor", { root, id, file, start, end })

/** Start the filesystem watcher for the project (emits `file-changed`). */
export const startWatching = (root: string) => invoke<void>("start_watching", { root })

/** Rebuild the SQLite comment index from the `.md` files (a cache). */
export const rebuildIndex = (root: string) => invoke<number>("rebuild_index", { root })

// ---- Integrated terminal (PTY) -------------------------------------------

/** Spawn a shell in a PTY for terminal tab `id`: the named profile's command,
 *  the configured shell, or the platform's login shell — in that order. */
export const ptySpawn = (
  id: string,
  cwd: string,
  rows: number,
  cols: number,
  // Explicitly defaulted so it is not counted as a required argument: it names a
  // profile resolved *here*, and is not a key the command receives.
  profileName: string | undefined = undefined,
) => {
  const { terminalShell, terminalShellArgs } = useSettings.getState()
  const profile = profileFor(profileName)
  return invoke<void>("pty_spawn", {
    id,
    cwd,
    rows,
    cols,
    // Null, not "", so the backend can tell "no override" from "a shell whose
    // name is the empty string" and fall back to the platform's login shell.
    shell: profile?.command ?? (terminalShell.trim() || null),
    shellArgs: profile ? profile.args : terminalShell.trim() ? terminalShellArgs : null,
  })
}

/** The executable used by PTY sessions (used for shell-specific command syntax). */
export const ptyDefaultShell = () => invoke<string>("pty_default_shell")

/** Forward input (keystrokes or injected text) to a terminal. Input for a pane
 *  whose shell has not spawned yet is held by the backend and delivered when it
 *  does, so a command typed into a brand-new pane is never lost. */
export const ptyWrite = (id: string, data: string) => invoke<void>("pty_write", { id, data })

/**
 * Send a command to a terminal and submit it. The text and the Enter key are
 * sent as two separate writes: a TUI agent (Claude/Codex use Ink) otherwise
 * treats a trailing newline in the same chunk as a literal newline instead of
 * submitting. `delay` lets a freshly spawned PTY become ready first.
 */
export function submitToTerminal(id: string, command: string, delay = 0): void {
  setTimeout(() => {
    void ptyWrite(id, command)
    setTimeout(() => void ptyWrite(id, "\r"), 120)
  }, delay)
}

/** Resize a terminal's PTY. */
export const ptyResize = (id: string, rows: number, cols: number) =>
  invoke<void>("pty_resize", { id, rows, cols })

/** Start a known language `server` (resolved to a binary in Rust) for connection
 * `id`, running in `cwd`; output via `lsp-{id}`. */
export const lspStart = (id: string, server: string, cwd: string) =>
  invoke<void>("lsp_start", { id, server, cwd })

/** The links the project's own markdown documents make to each other, as
 * `[from, to]` pairs of project-relative paths (both ends within `files`). */
export const docLinks = (root: string, files: string[]) =>
  invoke<Array<[string, string]>>("doc_links", { root, files })

/** The Angular project owning `file` (nearest `angular.json` at or above it,
 * never above `root`), or null when the file is not in one. */
export const angularRoot = (root: string, file: string) =>
  invoke<string | null>("angular_root", { root, file })

/** The `initializationOptions` a server needs (a TypeScript's `tsserver.path`,
 * say), or null — the client splices them into its `initialize` request. */
export const lspInitOptions = (server: string, root: string) =>
  invoke<Record<string, unknown> | null>("lsp_init_options", { server, root })

/** Send a JSON-RPC message to language server `id`. */
export const lspSend = (id: string, message: string) => invoke<void>("lsp_send", { id, message })

/** Stop a language server. */
export const lspStop = (id: string) => invoke<void>("lsp_stop", { id })

/** Whether every known language server is installed, in one call — the panel
 *  asks about all of them at once. */
export const lspInstalledAll = (root: string) =>
  invoke<Array<[string, boolean]>>("lsp_installed_all", { root })

/** Whether a known language server's binary is installed (on the real PATH). */
export const lspInstalled = (server: string, root: string) =>
  invoke<boolean>("lsp_installed", { server, root })

/** The Linux package manager available ("apt"|"dnf"|"pacman"|"zypper"|"brew"),
 * or null — so the marketplace picks the right per-distro install command. */
export const linuxPackageManager = () => invoke<string | null>("linux_package_manager")

/** Kill a terminal session. */
export const ptyKill = (id: string) => invoke<void>("pty_kill", { id })

// ---- Reado Anywhere: opt-in LAN server (phone review) ---------------------

/** What the desktop shows for pairing: the HTTPS LAN address, the certificate
 * fingerprint to verify, and a single-use pairing secret. The secret is not an
 * API credential — the phone spends it once to mint its own. */
export interface AnywhereInfo {
  url: string
  fingerprint: string
  pairing: string
}

/** A phone paired with this desktop. No credential material crosses this
 * boundary — the backend keeps only a hash, and doesn't send even that. */
export interface AnywhereDevice {
  id: string
  name: string
  /** Unix seconds. */
  created: number
  lastSeen: number
}

/** Anywhere's persisted preferences (the device list is fetched separately). */
export interface AnywhereConfig {
  /** Days a credential survives unused; 0 disables the check. */
  idleDays: number
  /** Days a credential survives at all; 0 disables the check. */
  maxDays: number
  /** Interface address to bind, or null for the machine's LAN address. */
  bind: string | null
  mdns: boolean
}

/** A network interface Anywhere can bind to. */
export interface AnywhereIface {
  name: string
  addr: string
}

/** Start the Reado Anywhere LAN server (idempotent); returns the pairing info. */
export const anywhereEnable = () => invoke<AnywhereInfo>("anywhere_enable")

/** Stop the Reado Anywhere server. */
export const anywhereDisable = () => invoke<void>("anywhere_disable")

/** The running server's info, or null when Reado Anywhere is off. */
export const anywhereStatus = () => invoke<AnywhereInfo | null>("anywhere_status")

/** The phones paired with this desktop, newest first. */
export const anywhereDevices = () => invoke<AnywhereDevice[]>("anywhere_devices")

/** Revoke one device; returns whether it was paired. Takes effect immediately. */
export const anywhereRevoke = (id: string) => invoke<boolean>("anywhere_revoke", { id })

/** Revoke every paired device at once; returns how many were dropped. */
export const anywhereRevokeAll = () => invoke<number>("anywhere_revoke_all")

/** Mint a fresh single-use pairing secret (to pair another phone). */
export const anywhereNewPairing = () => invoke<AnywhereInfo>("anywhere_new_pairing")

/** Anywhere's persisted preferences. */
export const anywhereConfig = () => invoke<AnywhereConfig>("anywhere_config")

/** Set how long a device credential lives (0 disables a check). */
export const anywhereSetLifetimes = (idleDays: number, maxDays: number) =>
  invoke<void>("anywhere_set_lifetimes", { idleDays, maxDays })

/** The machine's IPv4 interfaces, LAN addresses first. */
export const anywhereInterfaces = () => invoke<AnywhereIface[]>("anywhere_interfaces")

/** Choose the interface to bind; applies at the next enable. */
export const anywhereSetBind = (bind: string | null) => invoke<void>("anywhere_set_bind", { bind })

/** Toggle mDNS advertisement; applies at the next enable. */
export const anywhereSetMdns = (on: boolean) => invoke<void>("anywhere_set_mdns", { on })

/** Register this window's open project so a paired phone can pick it. */
export const anywhereSetProject = (id: string, root: string, name: string) =>
  invoke<void>("anywhere_set_project", { id, root, name })

/** Drop this window's project from the phone-visible list (on close). */
export const anywhereClearProject = (id: string) => invoke<void>("anywhere_clear_project", { id })

/** Publish the recent-projects list so a phone can open one on the desktop. */
export const anywhereSetRecents = (recents: { path: string; name: string }[]) =>
  invoke<void>("anywhere_set_recents", { recents })

// ---- In-app browser preview (multiwebview) --------------------------------
// The preview page is a native webview parked over a DOM placeholder; the
// frontend reports the placeholder's pixel rect so the two stay aligned.

/** Open (or navigate + reposition) the preview webview over the given rect. */
export const previewOpen = (url: string, x: number, y: number, w: number, h: number) =>
  invoke<void>("preview_open", { url, x, y, w, h })

/** Keep the preview parked over the pane as the layout resizes. */
export const previewSetBounds = (x: number, y: number, w: number, h: number) =>
  invoke<void>("preview_set_bounds", { x, y, w, h })

/** Navigate the open preview to a new URL (URL bar / agent). */
export const previewNavigate = (url: string) => invoke<void>("preview_navigate", { url })

/** Does this bare name resolve on this machine? The address bar asks before
 *  treating a single-label word as a host — that is what an `/etc/hosts` alias
 *  looks like, and nothing in the webview can see `/etc/hosts`. */
export const hostResolves = (name: string) => invoke<boolean>("host_resolves", { name })

/** Close the preview pane (remove its webview). */
export const previewClose = () => invoke<void>("preview_close")

/** Run JS in the preview page and get its JSON result (drain bridge, query DOM). */
export const previewEval = (js: string) => invoke<string>("preview_eval", { js })

/** Live dev-server URLs, ordered by the open project's framework/config. */
export const previewDetectUrls = (root: string, current?: string) =>
  invoke<string[]>("preview_detect_urls", { root, current: current ?? null })

/** Mirror the drained console/network snapshots to `.reado/` for the MCP server. */
export const previewPersistState = (root: string, consoleJson: string, networkJson: string) =>
  invoke<void>("preview_persist_state", { root, console: consoleJson, network: networkJson })

/** Remove the `.reado/` mirror + control files when the pane closes, so the agent's
 *  tools report "no preview pane running" again. */
export const previewClearState = (root: string) => invoke<void>("preview_clear_state", { root })

/** Control-channel queue: read the agent's pending command / write its result. */
export const previewTakeCmd = (root: string) => invoke<string | null>("preview_take_cmd", { root })
export const previewPutResult = (root: string, result: string) =>
  invoke<void>("preview_put_result", { root, result })
/** Detach the preview into its own window. */
export const previewDetach = (url: string) => invoke<void>("preview_detach", { url })
/** Capture the preview region as a PNG data URL (OS-level window capture). */
export const previewCaptureFrame = (x: number, y: number, w: number, h: number) =>
  invoke<string>("preview_capture_frame", { x, y, w, h })

/** Set the preview page zoom (scale content to fit big viewports into the pane). */
export const previewSetZoom = (factor: number) => invoke<void>("preview_set_zoom", { factor })

/** Show/hide the preview window (hidden while a Reado overlay covers the pane). */
export const previewSetVisible = (visible: boolean) =>
  invoke<void>("preview_set_visible", { visible })

export const previewBack = () => invoke<void>("preview_back")
export const previewForward = () => invoke<void>("preview_forward")
export const previewReload = () => invoke<void>("preview_reload")

// --- The user's password manager, through its own CLI (see `vault.rs`) ---------
// Reado's own UI only: these are deliberately absent from the agent's control
// channel and from the MCP tool surface.

/** Which password-manager CLI is available, and whether it needs unlocking. */
export const vaultStatus = () => invoke<VaultStatus>("vault_status")

/** Unlock Bitwarden; the session it returns stays in the backend's memory. */
export const vaultUnlock = (password: string) => invoke<void>("vault_unlock", { password })

/** The logins matching a page's origin — ids and usernames, never a secret. */
export const vaultLookup = (url: string) => invoke<VaultItem[]>("vault_lookup", { url })

/** One item's password, fetched at the moment of the fill. */
export const vaultSecret = (id: string) => invoke<string>("vault_secret", { id })

/** One item's current one-time code. */
export const vaultOtp = (id: string) => invoke<string>("vault_otp", { id })

/** Save a new login for `url`, and return the generated password to fill with. */
export const vaultCreate = (url: string, title: string, username: string) =>
  invoke<string>("vault_create", { url, title, username })

/** Show or hide the companion window. The backend owns the window itself, so
 *  the setting flipping is the only thing the app has to say. */
export const mascotShow = (show: boolean, corner: string, size: number) =>
  invoke<void>("mascot_show", { show, corner, size })

/** Which rectangle of the companion window is solid, in CSS pixels relative to
 *  its own top-left. Everything outside it lets the pointer through. */
export const mascotHitRect = (x: number, y: number, w: number, h: number) =>
  invoke<void>("mascot_hit_rect", { x, y, w, h })

/** The companion was clicked: bring Reado forward. */
export const mascotRaise = () => invoke<void>("mascot_raise")
