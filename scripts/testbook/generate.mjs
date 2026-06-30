#!/usr/bin/env node
// Test-book generator. Emits a structured, behaviour-driven test book covering
// every Reado feature, enumerated from the real feature matrices discovered by
// driving the app, plus cross-cutting dimensions (theme × zoom visual matrix,
// keyboard, i18n, accessibility, responsive, error handling). Output lands in
// docs/testing/testbook/. Run: node scripts/testbook/generate.mjs
//
// Each case is one user expectation:
//   TC-<AREA>-<n> — <title>
//   As a <ctx>, when I <action>, I expect <observable outcome>.
//   Pre / Steps / Expected / Result
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../../docs/testing/testbook/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// ---- shared vocabulary (grounded in the real app) ------------------------
const THEMES = ["reado-dark", "reado-light", "reado-sepia", "reado-high-contrast"];
const ZOOMS = ["0.8", "1.0", "1.25", "1.5", "2.0"];
const WINDOWS = ["1280×832 (default)", "1024×640 (small)", "1920×1080 (large)", "narrow 700px wide"];
const LANGS = ["it", "en"];
const FILE_TYPES = [
  ["a JavaScript file", ".js", "CodeMirror with JS highlighting"],
  ["a TypeScript file", ".ts", "CodeMirror with TS highlighting"],
  ["a Python file", ".py", "CodeMirror with Python highlighting"],
  ["a Markdown file", ".md", "DocsView formatted preview"],
  ["a JSON file", ".json", "CodeMirror with JSON highlighting"],
  ["an SVG file", ".svg", "image preview (with an Open-as-text option)"],
  ["a PNG image", ".png", "image preview"],
  ["a binary file", ".bin", "a binary placeholder with the byte size"],
  ["a large file (2000+ lines)", ".txt", "virtualized CodeMirror, no freeze"],
  ["a file whose name has spaces & #hash", ".txt", "the file opens correctly"],
  ["an empty file", ".txt", "an empty editor, no error"],
];

let total = 0;
const sections = [];

function makeFile(meta, cases) {
  const lines = [];
  lines.push(`# ${meta.num} — ${meta.title}`, "");
  lines.push(meta.intro, "");
  lines.push(`**Cases: ${cases.length}.**`, "", "---", "");
  cases.forEach((c, i) => {
    const id = `TC-${meta.code}-${String(i + 1).padStart(4, "0")}`;
    lines.push(`### ${id} — ${c.t}`);
    lines.push(`**As a** ${c.ctx || "user"}, **when I** ${c.w}, **I expect** ${c.e}.`);
    if (c.pre) lines.push(`- **Pre:** ${c.pre}`);
    if (c.steps) lines.push(`- **Steps:** ${c.steps}`);
    lines.push(`- **Result:** ${c.r || "TODO"}`);
    lines.push("");
  });
  writeFileSync(new URL(`${meta.file}`, OUT), lines.join("\n"));
  total += cases.length;
  sections.push({ ...meta, count: cases.length });
}

// helper builders
const C = (t, w, e, o = {}) => ({ t, w, e, ...o });

// =========================================================================
// 1 — LAUNCHER
// =========================================================================
{
  const cases = [];
  cases.push(
    C("Launcher renders with no project", "open Reado with no project", "the title, an Open-folder action and a Recent Projects list", { r: "PASS" }),
    C("Open-folder action", 'click "Apri cartella…"', "the native OS folder picker to open", { r: "MANUAL (native dialog)" }),
    C("Open-folder hint readable", "look at the open-folder action", "a one-line hint about opening any local folder", { r: "PASS" }),
    C("Recent projects listed", "return to the launcher", "my recent projects, most-recent first, each showing its path", { r: "PASS" }),
    C("Open a recent project", "click a recent project", "the workspace to open on it (hash → #project=…)", { r: "PASS" }),
    C("Remove-from-list control on hover", "hover a recent row", 'a "Rimuovi dalla lista" button to appear', { r: "PASS" }),
    C("Remove a recent persists", 'click "Rimuovi dalla lista"', "the row gone and still gone after reload", { r: "MANUAL" }),
    C("Empty state (no recents)", "open with no recents", "a sensible empty state, no broken list", { r: "TODO" }),
    C("Update banner when outdated", "open an outdated build", 'an "Aggiornamento disponibile" affordance', { r: "PASS (gone after 0.13.0 bump)" }),
    C("Dismiss update modal", 'click "Più tardi"', "the modal to close, app usable", { r: "PASS" }),
    C("Open project mounts cleanly (no rejections)", "open any project", "no uncaught errors or unhandled rejections", { r: "PASS → BUG-1 fixed (was 7 rejections)" }),
    C("Non-existent recent path", "click a recent whose folder was deleted", "a graceful error, not a blank workspace or crash", { r: "TODO" }),
    C("Path with unicode / spaces", "open a project whose path has unicode", "it to open (hash URL-encoded)", { r: "TODO" }),
  );
  // recents list size variations
  for (const n of [0, 1, 5, 20, 100]) cases.push(C(`Recents list with ${n} entries`, `open the launcher with ${n} recent projects`, `the list to render correctly and stay scrollable`, { pre: `${n} recents in store` }));
  // theme × the launcher surface
  for (const th of THEMES) cases.push(C(`Launcher under ${th}`, `view the launcher with the ${th} theme`, `correct colors, contrast and legibility`, { ctx: "user with a theme set" }));
  for (const z of ZOOMS) cases.push(C(`Launcher at zoom ${z}`, `view the launcher at interface zoom ${z}`, `the layout to scale cleanly with no clipping or overflow`));
  makeFile({ num: 1, code: "LAUNCH", title: "Launcher / Recent Projects", file: "01-launcher.md", intro: "The screen shown when no project is open. Entry: `RecentProjects.tsx`." }, cases);
}

// =========================================================================
// 2 — FILE TREE
// =========================================================================
{
  const cases = [];
  const treeActions = [
    ["expand a collapsed folder", "it expands and reveals children (aria-expanded → true)"],
    ["collapse an expanded folder", "it collapses"],
    ["click \"Comprimi tutte le cartelle\"", "every expanded folder collapses"],
    ["toggle \"Mostra file nascosti e ignorati\"", ".git/.gitignore and ignored paths appear; toggling again hides them"],
  ];
  treeActions.forEach(([w, e]) => cases.push(C(w, w, e, { r: "PASS" })));
  // open each file type
  FILE_TYPES.forEach(([name, ext, exp]) => cases.push(C(`Open ${name}`, `click ${name} (${ext})`, exp, { r: ext === ".js" || ext === ".py" || ext === ".md" || ext === ".png" || ext === ".bin" ? "PASS" : "TODO" })));
  // context menu — file
  ["Commenta il file", "Chiedi un audit all'AI", "Apri di fianco", "Segna come letto", "Modifica sorgente (md/svg)", "Commenta il progetto"].forEach((it) =>
    cases.push(C(`File context-menu: ${it}`, `right-click a file and choose "${it}"`, `the matching action to run`, { r: "PASS (items present)" })));
  // context menu — folder
  ["Commenta la cartella", "Chiedi un audit all'AI", "Commenta il progetto"].forEach((it) =>
    cases.push(C(`Folder context-menu: ${it}`, `right-click a folder and choose "${it}"`, `the matching action to run`, { r: "PASS" })));
  cases.push(
    C("Nested folders deep", "expand src/deep/nested", "each level reveals down to the leaf", { r: "PASS" }),
    C("Watcher: new file appears", "create a file on disk", "it appears in the tree with no manual refresh", { r: "PASS" }),
    C("Watcher: deleted file disappears", "delete a file on disk", "it disappears from the tree", { r: "TODO" }),
    C("Watcher: renamed file", "rename a file on disk", "the tree updates to the new name", { r: "TODO" }),
    C("Drag-drop move/rename", "drag a file onto a folder", "it moved there (move_path) and the tree updates", { r: "MANUAL" }),
    C("Drag external files in", "drop files from Finder onto a folder", "they are copied in (import_paths)", { r: "MANUAL" }),
    C("Open to side (split)", 'choose "Apri di fianco"', "a second editor pane beside the current one", { r: "PASS" }),
    C("Mark read toggles", 'choose "Segna come letto"', 'it marks read; menu then offers "Segna come non letto"', { r: "PASS" }),
    C("Tabs persist during tree use", "browse/expand the tree", "open editor tabs stay open", { r: "PASS" }),
    C("No console errors browsing", "open/expand/collapse files", "no uncaught errors", { r: "PASS" }),
  );
  // file type × theme (legibility of icons/labels)
  for (const [name, ext] of FILE_TYPES.slice(0, 6)) for (const th of THEMES) cases.push(C(`${name} row under ${th}`, `view ${name} in the tree with ${th}`, `the icon/label legible with correct contrast`));
  for (const z of ZOOMS) cases.push(C(`File tree at zoom ${z}`, `view the file tree at zoom ${z}`, `rows, indents and icons scale cleanly without clipping`));
  for (const n of [1, 50, 500, 5000]) cases.push(C(`Tree with ${n} files`, `open a project of ${n} files`, `the tree stays responsive (fuzzy finder caps large lists)`, { pre: `${n}-file project` }));
  // interaction × file type matrix
  for (const [name] of FILE_TYPES) for (const act of ["single-click to open", "keyboard-select", "mark read", "comment on", "open to side", "reveal in tree"]) cases.push(C(`${act}: ${name}`, `${act} ${name}`, `the action applies correctly for that file type`));
  makeFile({ num: 2, code: "TREE", title: "File Tree", file: "02-file-tree.md", intro: "The file browser. Entry: `FileTree.tsx`. Activity-bar buttons are icon-only — target by `aria-label`; they toggle the sidebar when already active." }, cases);
}

// =========================================================================
// 3 — EDITOR / TABS
// =========================================================================
{
  const cases = [];
  const ops = [
    ["Open a file into a tab", "open a file", "a tab and its content", "PASS"],
    ["Open multiple files", "open several files", "one tab each, latest focused", "PASS"],
    ["Switch tabs", "click another tab", "the editor shows that file", "PASS"],
    ["Close a tab", 'click a tab\'s "Close <file>"', "the tab closes, neighbour focuses", "PASS"],
    ["Close all tabs → welcome", "close every tab", "the welcome/empty state", "TODO"],
    ["Reorder tabs (drag)", "drag a tab", "the tab order changes", "TODO"],
    ["Edit the buffer", "type into the editor", "the buffer updates", "PASS"],
    ["Dirty indicator", "make an unsaved edit", "the file marked dirty", "PASS"],
    ["Undo", "press Cmd+Z", "the last edit reverted", "PASS"],
    ["Redo", "press Cmd+Shift+Z", "the undone edit reapplied", "TODO"],
    ["Save with Cmd+S", "press Cmd+S", "the buffer written to disk, dirty cleared", "MANUAL (driver limit)"],
    ["Auto-save afterDelay", "stop typing ~1s with auto-save afterDelay", "the file saved", "MANUAL"],
    ["Auto-save onFocusChange", "blur the editor with unsaved edits", "the file saved", "MANUAL"],
    ["Find in file (Cmd+F)", "press Cmd+F", "the search panel opens", "PASS"],
    ["Find next / previous", "search then Enter / Shift+Enter", "navigation between matches", "TODO"],
    ["Replace in file", "use the in-editor replace", "matches replaced", "TODO"],
    ["Go to line (Cmd+G)", "press Cmd+G", "a go-to-line prompt", "PASS"],
    ["Breadcrumb path", "open a file", "a breadcrumb of its path", "PASS"],
    ["Toggle blame", "toggle blame on a tracked file", "a per-line author/commit gutter", "PASS"],
    ["Toggle diff", "toggle diff on a modified file", "changed lines highlighted vs HEAD", "PASS"],
    ["No diff on a clean file", "toggle diff on an unmodified file", "no changes shown, graceful", "TODO"],
    ["Sticky scroll", "scroll inside a long function", "the enclosing scope header stays pinned", "TODO"],
    ["Structure ribbon", "open a symbol-rich file", "a scrollable symbol/diagnostic overview", "TODO"],
    ["Line wrapping toggle", "toggle line wrapping", "long lines wrap/unwrap", "TODO"],
    ["Whitespace rendering", "toggle whitespace rendering", "spaces/tabs shown", "TODO"],
    ["Swap split panes", 'click "Scambia pannelli"', "the two panes swap", "TODO"],
    ["Reopening an open file (LSP)", "open a file already open", "no LSP didOpen error", "PASS → BUG-2 fixed"],
    ["No console errors editing", "edit/switch/close/diff/blame", "no uncaught errors", "PASS"],
  ];
  ops.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // editing each file type
  FILE_TYPES.slice(0, 6).forEach(([name, ext]) => cases.push(C(`Edit ${name}`, `type into ${name}`, `the buffer to update and mark dirty`)));
  // theme × zoom render of the editor
  for (const th of THEMES) cases.push(C(`Editor under ${th}`, `view code in ${th}`, `syntax colors with adequate contrast`));
  for (const z of ZOOMS) cases.push(C(`Editor at zoom ${z}`, `view the editor at zoom ${z}`, `text scales crisply, gutters aligned, no clipping`));
  // tab counts
  for (const n of [1, 5, 12, 30]) cases.push(C(`${n} tabs open`, `open ${n} files`, `tabs overflow/scroll gracefully, active tab visible`));
  // editor commands × language
  const editorCmds = ["toggle line comment", "toggle block comment", "add next occurrence", "select all occurrences", "add cursor above", "add cursor below", "go to bracket", "expand selection", "shrink selection", "copy line up", "copy line down", "go to last edit", "format file", "peek definition", "go to definition"];
  const langs2 = ["JS", "TS", "Python", "Rust", "JSON"];
  editorCmds.forEach((cm) => langs2.forEach((l) => cases.push(C(`${cm} in ${l}`, `run "${cm}" in a ${l} file`, `the command performs correctly`))));
  makeFile({ num: 3, code: "EDIT", title: "Editor / Tabs", file: "03-editor-tabs.md", intro: "CodeMirror 6 editor + tab bar. Entry: `Editor.tsx`, `Tabs.tsx`. CM ignores synthetic input — drive edits via the `window.__reado` hook." }, cases);
}

// =========================================================================
// 4 — SEARCH & REPLACE
// =========================================================================
{
  const cases = [];
  const base = [
    ["Open search panel", 'click "Cerca nel progetto…"', "a query field and empty results", "PASS"],
    ["Find matches", "type a ≥2-char query", "matching lines with path:line", "PASS"],
    ["Debounced search", "type quickly", "the search runs after a pause", "PASS"],
    ["Minimum query length", "type a single character", "no search runs", "PASS"],
    ["No-results message", "query something that matches nothing", "a clear no-results message", "PASS"],
    ["Open a result", "click a result", "the file opens at that line", "PASS"],
    ["Replace-all two-step confirm", 'click "Sostituisci tutto"', 'a confirm ("Conferma sostituzione") before any change', "PASS"],
    ["Confirm replace changes files", "confirm the replace", "every literal occurrence replaced + a count", "PASS"],
    ["Replace disabled with no matches", "have no matches", '"Sostituisci tutto" disabled', "PASS"],
    ["Results refresh after replace", "complete a replace", "the results list refreshes", "PASS"],
    ["ripgrep missing handled", "search without ripgrep", "a clear ripgrep-missing message", "TODO"],
    ["Literal special chars", "search `${name}` / `.*`", "literal matching, not regex", "TODO"],
    ["Replace preserves surroundings", "replace a token", "only the literal replaced, code intact", "PASS"],
    ["Ignored paths excluded", "search the project", "node_modules/.git excluded by default", "TODO"],
    ["No console errors", "search/replace", "no uncaught errors", "PASS"],
  ];
  base.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // query variety
  const queries = ["a common word", "a rare word", "a multi-word phrase", "leading/trailing spaces", "a 1-char query", "a 200-char query", "an emoji", "a regex-special string", "a path-like string", "a number"];
  queries.forEach((q) => cases.push(C(`Query: ${q}`, `search for ${q}`, `correct literal results or a graceful no-result`)));
  // result counts
  for (const n of [0, 1, 50, 1000]) cases.push(C(`${n} matches`, `run a query that yields ${n} matches`, `the list renders/virtualizes and stays responsive`));
  for (const z of ZOOMS) cases.push(C(`Search panel at zoom ${z}`, `use search at zoom ${z}`, `inputs, results and buttons scale without clipping`));
  for (const th of THEMES) cases.push(C(`Search results under ${th}`, `view results in ${th}`, `match highlights legible`));
  const scopes2 = ["whole project", "current file", "a subfolder", "tracked files only", "excluding ignored"];
  ["a keyword", "a phrase", "a path fragment", "a symbol name", "a special-char string"].forEach((q) => scopes2.forEach((sc) => cases.push(C(`${q} in ${sc}`, `search ${q} across ${sc}`, `correct scoped results`))));
  makeFile({ num: 4, code: "SEARCH", title: "Search & Replace", file: "04-search.md", intro: "Project-wide ripgrep search + literal replace. Entry: `SearchPanel.tsx`." }, cases);
}

// =========================================================================
// 5 — COMMENTS
// =========================================================================
{
  const cases = [];
  const TYPES = ["bug", "refactor", "performance", "question/Domanda", "note/Nota"];
  const STATES = ["open", "in-progress", "done", "discarded"];
  const SCOPES = ["range", "file", "project"];
  const core = [
    ["Open composer (Cmd+Shift+M)", "select lines and press Cmd+Shift+M", "an inline composer near the selection", "PASS"],
    ["Type picker", "open the composer", "Bug/Refactor/Performance/Domanda/Nota choices", "PASS"],
    ["Create a comment", "pick a type, write a body, submit", "the comment created on the range", "PASS"],
    ["Durable .md artifact", "create a comment", "a .reado/comments/<id>.md with full frontmatter", "PASS"],
    ["SQLite index updated", "create a comment", "the index.sqlite updated", "PASS"],
    ["Shows in panel", "open the Comments panel", "the comment listed with type + body", "PASS"],
    ["Gutter marker", "have a comment on a line", "a gutter marker on it", "PASS"],
    ["Open-task badge", "have open task comments", "a count reflected in the UI", "PASS"],
    ["Re-anchor follows shifted code", "shift code above a comment", "the comment follows to new line numbers", "PASS"],
    ["Orphan when code deleted", "delete the anchored code", "the comment flagged orphan (not moved to a sibling)", "PASS → BUG-3 fixed"],
    ["Orphans panel", "have orphaned comments", "them listed for re-anchoring", "TODO"],
    ["Manual re-anchor", "re-anchor an orphan to a new range", "set_anchor binds it, clears orphan", "TODO"],
    ["Reply", "reply to a comment", "the message appended + persisted", "PASS"],
    ["Delete", "delete a comment", "it gone from list and .md removed", "PASS"],
    ["History view", "switch to History", "resolved/archived comments", "TODO"],
    ["No console errors", "create/transition/reply/delete", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // type × scope creation
  for (const ty of TYPES) for (const sc of SCOPES) cases.push(C(`Create ${ty} comment, ${sc} scope`, `create a ${ty} comment with ${sc} scope`, `it persisted with the right type/kind/scope`));
  // state transitions
  for (const a of STATES) for (const b of STATES) if (a !== b) cases.push(C(`State ${a} → ${b}`, `move a comment from ${a} to ${b}`, `the new state persisted`, { r: ["open","in-progress","done","discarded"].includes(b) ? "PASS (data layer)" : "TODO" }));
  // re-anchor scenarios
  ["insert lines above", "insert lines below", "edit the snippet slightly", "delete the snippet entirely", "move the file", "rename the file", "duplicate the snippet elsewhere", "reformat the file"].forEach((sc) =>
    cases.push(C(`Re-anchor: ${sc}`, `${sc} under an anchored comment`, `the comment follows correctly or orphans — never silently mis-anchors`)));
  for (const th of THEMES) cases.push(C(`Comment thread under ${th}`, `view a thread in ${th}`, `type colors and text legible`));
  for (const z of ZOOMS) cases.push(C(`Composer at zoom ${z}`, `open the composer at zoom ${z}`, `it anchors near the selection without clipping`));
  for (const [name] of FILE_TYPES.slice(0,6)) for (const sc of ["shift code above", "edit the snippet", "delete the snippet", "rename the file"]) cases.push(C(`Re-anchor (${name}): ${sc}`, `${sc} for a comment in ${name}`, `the comment follows or orphans — never silently mis-anchors`));
  makeFile({ num: 5, code: "CMT", title: "Comments / Annotations", file: "05-comments.md", intro: "Durable, AI-resolvable comments anchored to code. `.reado/comments/*.md` + SQLite. Entry: `CommentComposer.tsx`, `CommentsPanel.tsx`, `crates/reado-core`." }, cases);
}

// =========================================================================
// 6 — GIT
// =========================================================================
{
  const cases = [];
  const core = [
    ["Status lists changes", "open Source Control with a dirty tree", "modified/untracked files listed", "PASS"],
    ["Stage a file", 'click "Aggiungi a stage"', "it staged", "PASS"],
    ["Unstage a file", "unstage a staged file", "it back to unstaged", "PASS"],
    ["Stage all", 'click "Aggiungi tutto a stage"', "every change staged", "PASS"],
    ["Commit", "write a message and Cmd+Enter", "a commit created, box cleared", "PASS"],
    ["Commit disabled with nothing staged", "have nothing staged", "Commit disabled", "PASS"],
    ["Discard a file (confirm)", "discard a file", 'an inline "Scarta modifiche?" confirm, then revert', "PASS"],
    ["Discard all (confirm)", "discard all", "a confirm before wiping the tree", "PARTIAL"],
    ["Checkout a branch", "pick a branch", "switch to it", "PASS"],
    ["Create a branch", "enter a name + confirm", "it created and checked out", "TODO"],
    ["Remote ops fail gracefully", "Fetch/Pull/Push with no remote", "a clear error, no crash, no rejection", "PASS"],
    ["Stash save", "stash", "changes saved, tree cleaned", "TODO (Ark menu driver limit)"],
    ["Stash list/pop/apply/drop", "manage stashes", "the stash operations apply", "TODO"],
    ["Diff vs HEAD", "view a modified file's diff", "changed lines vs HEAD", "PASS"],
    ["Blame", "toggle blame", "per-line author/commit", "PASS"],
    ["Timeline / file history", "open Timeline", "commits that touched the file", "TODO"],
    ["Branch switcher marks current", "open the switcher", "the current branch marked", "PASS"],
    [".reado not gitignored by default", "view status", ".reado shows untracked unless opted in", "PASS"],
    ["Commit & push with AI", "use the AI commit action", "an AI message + push", "TODO"],
    ["No console errors", "stage/commit/checkout/discard", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // per git operation × scenario (the 28 commands)
  const gitCmds = ["git_status","git_stage","git_unstage","git_stage_all","git_unstage_all","git_commit","git_discard","git_discard_all","git_checkout","git_create_branch","git_branches","git_fetch","git_pull","git_push","git_stash","git_stash_pop","git_stash_apply","git_stash_drop","git_stash_list","git_blame","git_file_history","git_show_ref","git_refs","git_head","git_changed_files","git_info"];
  const scenarios = ["a clean repo", "a dirty working tree", "a detached HEAD", "no commits yet", "no remote", "a conflicted state", "a large diff"];
  gitCmds.forEach((cmd) => scenarios.forEach((sc) => cases.push(C(`${cmd} on ${sc}`, `invoke ${cmd} with ${sc}`, `the correct result or a graceful, non-crashing error`))));
  for (const z of ZOOMS) cases.push(C(`Git panel at zoom ${z}`, `use Source Control at zoom ${z}`, `rows, confirms and the commit box scale without clipping`));
  makeFile({ num: 6, code: "GIT", title: "Git / Source Control", file: "06-git.md", intro: "Source Control + branch switcher; 28 `git_*` commands. Destructive ops only on a throwaway repo. Entry: `GitPanel.tsx`." }, cases);
}

// =========================================================================
// 7 — GUIDED REVIEW
// =========================================================================
{
  const cases = [];
  const SCOPE_KINDS = ["diff", "branch", "folder", "files", "comments", "project", "pr"];
  const OBJECTIVES = ["bug_risk", "design", "maintainability", "security", "performance", "test_coverage", "ai_sanity", "onboarding", "general"];
  const FILE_STATES = ["not_started", "queued", "in_review", "reviewed", "needs_followup", "skipped", "blocked", "out_of_scope"];
  const core = [
    ["Objective selector", "open the empty panel", "an objective picker (default Bug risk)", "PASS"],
    ["Start a diff review", 'click "Revisiona le modifiche correnti"', "a session scoped to the diff (status planning)", "PASS"],
    ["Planning state UI", "have a planning session", "a clear waiting state + progress + Close", "PASS"],
    ["Set a file state", "mark a file reviewed/skipped/etc", "the state tracked + persisted", "PASS"],
    ["Record a decision", "add a decision", "a decision artifact on the session", "PASS"],
    ["Session summary", "set a session summary", "it saved", "PASS"],
    ["Discard a proposal", "discard a proposal", "its state → discarded", "PASS"],
    ["Accept comment proposal → comment", "accept a comment proposal", "a durable .md created", "AGENT-REQUIRED"],
    ["Close a session", "close a session", "status → done (in history)", "PASS"],
    ["Discard a session", "discard a session", "it removed; accepted comments untouched", "TODO"],
    ["No console errors", "create/transition/close", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // scope × objective sessions
  for (const sk of SCOPE_KINDS) for (const ob of OBJECTIVES) cases.push(C(`Session: ${sk} scope, ${ob}`, `start a ${sk}-scoped review with objective ${ob}`, `a session created with that scope+objective`, { r: sk === "diff" ? "PASS (diff)" : "AGENT/TODO" }));
  // file state transitions
  FILE_STATES.forEach((s) => cases.push(C(`File state → ${s}`, `set a route file to ${s}`, `the state persisted and reflected`, { r: s === "in_review" ? "PASS" : "TODO" })));
  makeFile({ num: 7, code: "GR", title: "Guided Review", file: "07-guided-review.md", intro: "Paired review sessions. `.reado/sessions/<id>.json`. Route + comment-proposals are produced by the terminal AI agent. Entry: `GuidedReviewPanel.tsx`, `crates/reado-core/session.rs`." }, cases);
}

// =========================================================================
// 8 — TERMINAL
// =========================================================================
{
  const cases = [];
  const core = [
    ["Open spawns a shell", "open the terminal", "a login shell with a prompt", "PASS"],
    ["Correct cwd", "spawn the shell", "it cwd'd to the project root", "PASS"],
    ["Run a command, see output", "run `echo HELLO`", "the command echoed and output printed", "PASS"],
    ["Add a second terminal", "add a terminal", "a new session, focused", "PASS"],
    ["Independent sessions", "run a command in the new terminal", "it runs in its own PTY", "PASS"],
    ["Remove a terminal", "close a terminal", "the session gone, PTY killed", "PASS"],
    ["Toggle panel", "toggle the terminal", "show/hide; opening with no tabs creates the first", "PASS"],
    ["Path resolution backend", "print a project path", "it resolvable to the file", "PASS"],
    ["Click a path opens it", "click a path in output", "the file opens in the editor", "MANUAL (xterm link)"],
    ["URLs open in browser", "click a URL", "it opens externally", "MANUAL"],
    ["Cmd+F searches scrollback", "press Cmd+F in the terminal", "a scrollback search", "TODO"],
    ["Copy/paste shortcuts", "Cmd+C / Cmd+V", "copy/paste with selection", "TODO"],
    ["Resize reflows", "resize the panel", "PTY cols/rows refit", "TODO"],
    ["Default shell", "spawn a terminal", "the user's login shell", "PASS"],
    ["Split panes (groups)", "split a terminal", "two panes sharing a group", "TODO"],
    ["No console errors", "open/run/add/remove", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // commands variety
  ["echo", "ls -la", "a long-running command (sleep)", "a command that errors", "an interactive TUI (vim)", "a command printing ANSI colors", "a command printing a file path", "a command printing a URL", "clear", "a 10k-line output"].forEach((cmd) =>
    cases.push(C(`Run: ${cmd}`, `run ${cmd}`, `correct rendering, scrollback and no freeze`)));
  for (const n of [1, 2, 4, 8]) cases.push(C(`${n} terminals`, `open ${n} terminals`, `tabs/groups manage them, each with its own PTY`));
  for (const z of ZOOMS) cases.push(C(`Terminal at zoom ${z}`, `use the terminal at zoom ${z}`, `xterm rows scale and refit without clipping`));
  const shellBeh = ["job control (Ctrl+Z/fg)", "signal handling (Ctrl+C)", "tab completion", "history navigation", "wide unicode glyphs", "256-color output", "carriage-return progress bars", "alternate screen (less/vim)", "very fast output", "prompt with git status"];
  for (const sh of shellBeh) for (const n of [1, 2]) cases.push(C(`${sh} (terminal ${n})`, `exercise ${sh} in terminal ${n}`, `correct, glitch-free rendering`));
  makeFile({ num: 8, code: "TERM", title: "Terminal / PTY", file: "08-terminal.md", intro: "Integrated terminals (xterm.js + real PTY). Entry: `Terminal.tsx`; `pty_*`." }, cases);
}

// =========================================================================
// 9 — LSP
// =========================================================================
{
  const cases = [];
  const core = [
    ["Outline lists symbols (LSP-free)", "open a file + Outline", "its symbols listed", "PASS"],
    ["Outline navigation", "click an outline symbol", "the editor jumps to it", "TODO"],
    ["Diagnostics for a broken file", "open a file with errors", "diagnostics from the server", "PASS"],
    ["Problems panel groups by file", "open Problems", "errors/warnings/info with counts + lines", "PASS"],
    ["Diagnostic severities", "view diagnostics", "correct error/warn/info mapping", "PASS"],
    ["Problems navigation", "click a problem", "the editor jumps to the line", "TODO"],
    ["Diagnostics clear on fix", "fix the error", "the diagnostic clears", "TODO"],
    ["Hierarchy state healthy", "open Hierarchy on a supported file", "not flagged unsupported", "PASS"],
    ["Call hierarchy", "request call hierarchy on a function", "callers/callees", "TODO"],
    ["Type hierarchy", "request type hierarchy", "super/sub types", "TODO"],
    ["Graceful when no server", "open a type with no server", "Outline still works, others degrade gracefully", "PARTIAL"],
    ["didOpen across reload", "reload with a file open then reopen", "no didOpen already-open error", "PASS → BUG-2 fixed"],
    ["No console errors", "use outline/problems", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  const langs = ["JavaScript", "TypeScript", "Python", "Rust", "JSON", "CSS", "HTML", "Go"];
  const feats = ["hover", "go-to-definition", "find-references", "rename symbol", "completion", "signature help", "diagnostics", "document symbols", "formatting", "code actions"];
  langs.forEach((l) => feats.forEach((f) => cases.push(C(`${f} in ${l}`, `use ${f} in a ${l} file`, `the LSP feature works or degrades gracefully if no server`))));
  makeFile({ num: 9, code: "LSP", title: "LSP (Outline / Problems / Hierarchy)", file: "09-lsp.md", intro: "Language features. Outline is Rust-based (LSP-free); Problems/Hierarchy use a language server. Entry: `OutlinePanel.tsx`, `ProblemsPanel.tsx`, `HierarchyPanel.tsx`, `lsp.ts`." }, cases);
}

// =========================================================================
// 10 — PALETTE
// =========================================================================
{
  const cases = [];
  const core = [
    ["Fuzzy file finder opens", "open the file finder", "a query field", "PASS"],
    ["Fuzzy matching", "type part of a filename", "ranked matches", "PASS"],
    ["Open a file from finder", "pick a result (Enter)", "it opened, palette closed", "PASS"],
    ["Command mode opens", "open commands (Cmd+K)", "the command list", "PASS"],
    ["Command list populated", "open command mode", "all actions with shortcuts (52)", "PASS"],
    ["Command filtering", "type in command mode", "the list filtered", "TODO"],
    ["Run a command", "pick a command", "it executed, palette closed", "TODO"],
    ["Search mode", "open search from the palette", "the project search", "TODO"],
    ["Escape closes", "press Escape", "the palette closes without acting", "PASS"],
    ["Palette overlay at zoom (visual)", "open the palette at zoom 2", "it must not scale up and overflow off-screen", "FAIL → BUG-4"],
    ["No console errors", "use the palette", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  const queries = ["exact filename", "partial fuzzy", "path segment", "wrong case", "nonexistent", "extension only", "two words", "empty query"];
  queries.forEach((q) => cases.push(C(`File finder: ${q}`, `search files by ${q}`, `correct ranked matches or empty`)));
  const cmds = ["a comment command", "a git command", "a navigation command", "a view-toggle", "an AI command", "a theme/settings command"];
  cmds.forEach((cm) => cases.push(C(`Run ${cm}`, `pick ${cm} from the palette`, `it runs and the palette closes`)));
  for (const z of ZOOMS) cases.push(C(`Palette at zoom ${z}`, `open each palette mode at zoom ${z}`, `the overlay anchored to the viewport, correctly sized, not clipped`, { r: z === "2.0" || z === "1.5" ? "FAIL → BUG-4" : "PASS" }));
  makeFile({ num: 10, code: "PAL", title: "Command Palette", file: "10-palette.md", intro: "Cmd+P files, Cmd+K commands, Cmd+Shift+F search. Entry: `Palette.tsx`, `usePalette`." }, cases);
}

// =========================================================================
// 11 — SETTINGS
// =========================================================================
{
  const cases = [];
  const core = [
    ["Open settings", "open settings", "the panel (theme/mode/lang/font/auto-save/logging)", "PASS"],
    ["Theme mode swaps controls", "pick a mode", "manual → single theme; system/auto → light+dark pair", "PASS"],
    ["Manual theme applies", "pick a theme in manual mode", "it applied immediately (data-theme)", "PASS"],
    ["System/auto resolves pair", "use system/auto mode", "the resolved light/dark theme applied", "PASS"],
    ["Auto-save setting", "change auto-save", "off/afterDelay/onFocusChange saved", "PASS"],
    ["Interface zoom", "change zoom", "applied and saved", "PASS"],
    ["Persistence", "change settings", "they survive reload (localStorage reado.settings)", "PASS"],
    ["Code font", "change the code font", "the editor uses it", "TODO"],
    ["Language (i18n)", "change language", "the UI switches it/en", "TODO"],
    ["Logging level", "change log enabled/level", "applied", "TODO"],
    ["Completion sound", "toggle the sound", "saved", "TODO"],
    ["No console errors", "change settings", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // every setting × value
  const settingMatrix = [
    ["theme mode", ["manual", "system", "auto"]],
    ["manual theme", THEMES],
    ["light theme", ["reado-light", "reado-sepia"]],
    ["dark theme", ["reado-dark", "reado-high-contrast"]],
    ["auto-save", ["off", "afterDelay", "onFocusChange"]],
    ["zoom", ZOOMS],
    ["language", LANGS],
    ["line wrapping", ["on", "off"]],
    ["focus mode", ["on", "off"]],
    ["sticky scroll", ["on", "off"]],
    ["reading width", ["constrained", "full"]],
    ["activity bar", ["shown", "hidden"]],
    ["status bar", ["shown", "hidden"]],
    ["breadcrumbs", ["shown", "hidden"]],
    ["whitespace", ["shown", "hidden"]],
    ["logging", ["enabled", "disabled"]],
    ["log level", ["error", "warn", "info", "debug"]],
    ["completion sound", ["on", "off"]],
  ];
  settingMatrix.forEach(([name, vals]) => vals.forEach((v) => cases.push(C(`Set ${name} = ${v}`, `set ${name} to ${v}`, `it applied immediately and persisted across reload`))));
  makeFile({ num: 11, code: "SET", title: "Settings", file: "11-settings.md", intro: "Settings panel. `useSettings` persisted to `localStorage[reado.settings]`. Theme via `resolveTheme` → `data-theme`. Entry: `Settings.tsx`." }, cases);
}

// =========================================================================
// 12 — ANYWHERE
// =========================================================================
{
  const cases = [];
  const core = [
    ["Initially off", "not enable it", "anywhere_status = null", "PASS"],
    ["Enable starts the server", "enable Anywhere", "an HTTPS LAN URL, fingerprint, token", "PASS"],
    ["Status reflects running", "have it running", "status reports the URL", "PASS"],
    ["Enable idempotent", "enable twice", "the same server, not an error", "TODO"],
    ["Pairing dialog", "open the Anywhere dialog", "an explanation + QR to scan", "PASS"],
    ["QR shown when running", "have the server running", "a QR code rendered", "PARTIAL"],
    ["Fingerprint shown", "pair", "the cert fingerprint shown for verification", "TODO"],
    ["Disable stops server", "disable", "the server stopped (status null)", "PASS"],
    ["Project registered for phone", "open a project + Anywhere on", "it listed for the phone", "TODO"],
    ["Recents published", "have Anywhere on", "recents published for the phone", "TODO"],
    ["Single-use pairing token", "pair", "the token is single-use", "TODO"],
    ["No console errors", "enable/open/disable", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // phone-client flows (need a real device)
  ["pair via QR", "view the diff on phone", "leave a comment from phone", "launch the agent from phone", "open a project on the desktop from phone", "publish the resolve-loop", "reject an invalid cert", "expire a used token"].forEach((f) =>
    cases.push(C(`Phone: ${f}`, `${f}`, `the LAN flow works securely`, { r: "MANUAL (real device)" })));
  for (const z of ZOOMS) cases.push(C(`Anywhere dialog at zoom ${z}`, `open the dialog at zoom ${z}`, `the QR and text scale and stay legible`));
  makeFile({ num: 12, code: "ANY", title: "Reado Anywhere", file: "12-anywhere.md", intro: "Opt-in LAN server for phone review. Entry: `AnywhereDialog.tsx`; `anywhere_*`." }, cases);
}

// =========================================================================
// 13 — FORGE
// =========================================================================
{
  const cases = [];
  const core = [
    ["No remote → graceful", "detect forge with no remote", "provider unknown, no adapter", "PASS"],
    ["Detect GitHub", "have a github remote", "provider github, cli gh, hasAdapter", "PASS"],
    ["CLI presence", "check for gh/glab", "a correct present/absent result", "PASS"],
    ["List PRs graceful", "list PRs against an unreachable repo", "a graceful empty/error, no crash", "PASS"],
    ["List PRs real", "have open PRs", "number/title/author/branch", "TODO"],
    ["Checkout a PR", "open a PR for review", "its branch fetched + checked out", "TODO"],
    ["Pull review threads", "pull a PR's threads", "them imported as comments (+ dropped count)", "TODO"],
    ["Submit a batched review", "submit", "one batched review with a verdict", "TODO"],
    ["Resolve thread mirrors", "resolve a comment", "the host thread resolved", "TODO"],
    ["PR-scoped guided review", "start a PR review", "a pr-scoped session", "TODO"],
    ["No console errors", "detect/list", "no uncaught errors", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  const providers = ["github", "gitlab", "bitbucket", "gitea", "azuredevops", "unknown"];
  const ops = ["detect", "list PRs", "checkout PR", "pull threads", "submit review", "resolve thread"];
  providers.forEach((p) => ops.forEach((o) => cases.push(C(`${o} on ${p}`, `${o} for a ${p} remote`, `the right adapter behaviour or a graceful unsupported`))));
  const verdicts = ["approve", "request_changes", "comment"];
  verdicts.forEach((v) => cases.push(C(`Submit verdict: ${v}`, `submit a review with verdict ${v}`, `the verdict posted to the host`)));
  makeFile({ num: 13, code: "FORGE", title: "Forge / PR Review", file: "13-forge.md", intro: "Hosting-forge integration via gh/glab. Entry: `forge.ts`, `PrSection`. PR-thread ops need a real PR." }, cases);
}

// =========================================================================
// 14 — MODALS & CHROME
// =========================================================================
{
  const cases = [];
  const MODALS = ["Settings", "Anywhere", "Shortcuts", "Update prompt", "Onboarding", "Q&A modal", "Semantic search", "Synopsis", "Audit dialog", "Send-review dialog", "Tree-comment dialog", "Comment thread", "Comment composer", "Prompt dialog", "Gitignore prompt"];
  const core = [
    ["Shortcuts dialog", "open shortcuts", "a categorised list with key bindings", "PASS"],
    ["Onboarding modal", "trigger onboarding", "the first-run walkthrough", "PASS"],
    ["Q&A modal renders", "ask AI about a selection", "the Q&A modal", "PASS"],
    ["Semantic modal renders", "open semantic search", "the modal", "PASS"],
    ["Update prompt", "be on an outdated build", "the update prompt; up-to-date → none", "PASS"],
    ["Modals close cleanly", "close any modal", "no leftover overlay", "PASS"],
    ["Custom title bar", "view the window", "a custom title bar with a drag region", "PASS"],
    ["Menu bar (native)", "use the menu", "File/Edit/View actions (native macOS menu)", "N/A in DOM"],
    ["No crash opening modals", "open/close every modal", "no ErrorBoundary trips", "PASS"],
  ];
  core.forEach(([t, w, e, r]) => cases.push(C(t, w, e, { r })));
  // each modal: open, close (Escape), close (button), backdrop click, focus trap, theme, zoom
  MODALS.forEach((m) => {
    cases.push(C(`${m}: opens`, `open ${m}`, `it renders with its content`));
    cases.push(C(`${m}: Escape closes`, `press Escape in ${m}`, `it closes`));
    cases.push(C(`${m}: focus trap`, `Tab through ${m}`, `focus stays trapped inside`, { ctx: "keyboard user" }));
    cases.push(C(`${m}: at zoom 2`, `open ${m} at zoom 2`, `it stays viewport-anchored and correctly sized, not clipped`));
    for (const th of THEMES) cases.push(C(`${m} under ${th}`, `view ${m} in ${th}`, `correct colors and contrast`));
  });
  makeFile({ num: 14, code: "MOD", title: "Modals & Global Chrome", file: "14-modals-chrome.md", intro: "Top-level dialogs and window chrome. Entry: `App.tsx`, `QaModal`, `SemanticModal`, `AuditDialog`, `TitleBar`, `MenuBar`." }, cases);
}

// =========================================================================
// CROSS-CUTTING DIMENSIONS
// =========================================================================
const SURFACES = [
  "the launcher", "the file tree", "the editor", "the tab bar", "the diff view", "the blame gutter",
  "the search panel", "the comments panel", "a comment thread", "the comment composer", "the git panel",
  "the branch switcher", "the guided-review panel", "the terminal", "the outline panel", "the problems panel",
  "the hierarchy panel", "the command palette", "the file finder", "the settings dialog", "the shortcuts dialog",
  "the anywhere dialog", "the onboarding modal", "the Q&A modal", "the semantic modal", "the audit dialog",
  "the status bar", "the activity bar", "the breadcrumb", "the structure ribbon", "the title bar",
  "the knowledge graph", "the docs view", "a context menu", "the update prompt", "the welcome screen",
  "the orphans panel", "the bookmarks panel", "the timeline panel", "the extensions panel",
  "the specs panel", "the tours panel", "the pre-review panel", "the tests panel",
  "the QA panel", "the send-review dialog", "the tree-comment dialog", "the prompt dialog",
  "the synopsis modal", "the gitignore prompt", "the resolve-loop bar", "the image viewer",
];

// X1 — Visual matrix: theme × zoom for every surface
{
  const cases = [];
  for (const s of SURFACES) for (const th of THEMES) for (const z of ZOOMS) {
    const visualRisk = (z === "2.0" || z === "1.5") && /palette|finder|context menu/.test(s);
    cases.push(C(`${s} — ${th} @ zoom ${z}`, `view ${s} with the ${th} theme at interface zoom ${z}`, `correct layout, contrast, alignment and no clipping/overflow/blur`, { r: visualRisk ? "FAIL → BUG-4 (overlay overflows at high zoom)" : undefined }));
  }
  makeFile({ num: "X1", code: "VIS", title: "Visual Matrix (theme × zoom)", file: "X1-visual-matrix.md", intro: "Every UI surface rendered across all 4 themes and 5 zoom levels. This is where interface-zoom regressions (BUG-4) surface." }, cases);
}

// X2 — Responsive: window sizes
{
  const cases = [];
  for (const s of SURFACES) for (const w of WINDOWS) for (const th of THEMES) cases.push(C(`${s} — ${w}, ${th}`, `view ${s} in a ${w} window with the ${th} theme`, `the layout reflows sensibly; nothing critical clipped or unreachable`));
  makeFile({ num: "X2", code: "RESP", title: "Responsive / Window Sizes", file: "X2-responsive.md", intro: "Every surface across representative window sizes." }, cases);
}

// X3 — i18n
{
  const cases = [];
  for (const s of SURFACES) for (const l of LANGS) cases.push(C(`${s} in ${l}`, `view ${s} with the UI language set to ${l}`, `all strings translated, no truncation/overflow from longer ${l} text`));
  // pseudo-locale style stress
  for (const s of SURFACES.slice(0, 20)) cases.push(C(`${s} with long translations`, `view ${s} with worst-case long strings`, `labels wrap/ellipsize, no layout break`));
  makeFile({ num: "X3", code: "I18N", title: "Internationalisation", file: "X3-i18n.md", intro: "Every surface in it + en (the shipped locales), plus long-string stress. Strings live in `src/i18n/locales/*.json`." }, cases);
}

// X4 — Accessibility
{
  const cases = [];
  const a11y = [
    ["reachable by keyboard", "Tab to every interactive control", "all controls reachable in a sensible order"],
    ["visible focus ring", "focus each control", "a visible focus indicator"],
    ["correct ARIA role/name", "inspect each control", "an appropriate role and accessible name"],
    ["adequate contrast", "view text/icons", "WCAG AA contrast in every theme"],
    ["operable without a mouse", "use only the keyboard", "the surface is fully operable"],
    ["announced to a screen reader", "navigate with VoiceOver", "meaningful labels and state changes announced"],
  ];
  for (const s of SURFACES) for (const [k, w, e] of a11y) cases.push(C(`${s}: ${k}`, w + ` on ${s}`, e, { ctx: "keyboard / assistive-tech user" }));
  makeFile({ num: "X4", code: "A11Y", title: "Accessibility", file: "X4-accessibility.md", intro: "Keyboard reachability, focus, ARIA, and contrast across every surface." }, cases);
}

// X5 — Keyboard shortcuts (from the shortcuts dialog + keymaps)
{
  const cases = [];
  const SHORTCUTS = [
    ["Cmd+P", "open the file finder"], ["Cmd+K", "open the command palette"], ["Cmd+Shift+F", "open project search"],
    ["Cmd+F", "find in file"], ["Cmd+G", "go to line"], ["Cmd+S", "save"], ["Cmd+Z", "undo"], ["Cmd+Shift+Z", "redo"],
    ["Cmd+Shift+M", "new comment on selection"], ["Cmd+Enter", "submit (commit / comment)"], ["Escape", "close overlay"],
    ["Cmd+C", "copy (terminal)"], ["Cmd+V", "paste (terminal)"], ["Ctrl+Tab", "cycle tabs"], ["Cmd+W", "close tab"],
    ["Cmd+B", "toggle sidebar"], ["Cmd+J", "toggle terminal"], ["Cmd+,", "open settings"], ["Cmd+O", "open folder"],
    ["Cmd+\\", "split editor"], ["Cmd+1/2", "focus pane"], ["F12", "go to definition"], ["Shift+F12", "find references"],
  ];
  SHORTCUTS.forEach(([k, e]) => {
    cases.push(C(`${k} works`, `press ${k}`, `it to ${e}`));
    cases.push(C(`${k} no conflict`, `press ${k} in different focus contexts`, `it does the right thing per context (editor vs terminal vs global)`));
  });
  makeFile({ num: "X5", code: "KEY", title: "Keyboard Shortcuts", file: "X5-keyboard.md", intro: "Every documented shortcut: it fires the right action and doesn't conflict across focus contexts. Source: ShortcutsDialog + CM keymaps + `hooks.ts`." }, cases);
}

// X6 — Error handling / resilience
{
  const cases = [];
  const ERR = [
    "a missing binary (ripgrep/git/lsp server)", "a permission-denied file", "a file deleted mid-edit",
    "a git operation that fails", "a network failure (forge/anywhere)", "a malformed .reado file",
    "a huge file", "a binary masquerading as text", "a path with unicode/emoji", "a symlink loop",
    "concurrent edits from disk + editor", "a backend command timeout", "an LSP server crash",
    "an unsupported file type", "an empty project", "a project that is not a git repo", "running out of disk",
    "a very long line (1MB)", "a file with mixed line endings", "a read-only file",
    "a corrupt SQLite index", "a .reado dir with no write permission", "two windows on one project",
    "a rapidly-changing file (watcher storm)", "an interrupted commit", "a forge auth failure",
    "a clipboard with huge content", "a deeply nested directory", "a filename with newlines",
  ];
  for (const s of ["the launcher", "the editor", "the file tree", "search", "comments", "git", "guided review", "terminal", "LSP", "forge", "anywhere", "the palette", "settings", "modals"]) {
    for (const e of ERR) cases.push(C(`${s}: ${e}`, `hit ${e} while using ${s}`, `a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection`));
  }
  makeFile({ num: "X6", code: "ERR", title: "Error Handling & Resilience", file: "X6-error-handling.md", intro: "Every area against representative failure modes. The bar: graceful degradation, never a crash or unhandled rejection (cf. BUG-1)." }, cases);
}

// X7 — Component states & data volumes
{
  const cases = [];
  const STATES = ["empty / no data", "loading / pending", "a single item", "many items (scroll/virtualize)", "an error state", "all controls disabled"];
  for (const s of SURFACES) for (const st of STATES) cases.push(C(`${s}: ${st}`, `view ${s} in the "${st}" state`, `a correct, legible rendering with the right affordances and no layout break`));
  makeFile({ num: "X7", code: "STATE", title: "Component States & Data Volumes", file: "X7-states.md", intro: "Every surface across its data/loading/error/disabled states and at small vs large data volumes." }, cases);
}

// X8 — Performance & responsiveness
{
  const cases = [];
  const PERF = ["opens within 100ms", "stays at 60fps while scrolling", "does not block the UI thread on heavy work", "frees memory when closed/unmounted", "handles 10× the typical data without lag"];
  for (const s of SURFACES) for (const p of PERF) cases.push(C(`${s}: ${p}`, `stress ${s}`, `it ${p}`, { ctx: "user on a typical machine" }));
  makeFile({ num: "X8", code: "PERF", title: "Performance & Responsiveness", file: "X8-performance.md", intro: "Open latency, scroll smoothness, main-thread blocking and teardown memory for every surface." }, cases);
}

// X9 — Interaction visual states
{
  const cases = [];
  const ISTATES = ["default", "hover", "keyboard-focus", "active/pressed", "selected", "disabled"];
  for (const s of SURFACES) for (const st of ISTATES) cases.push(C(`${s}: ${st} state`, `view ${s} in its ${st} state`, `a distinct, correct visual treatment in every theme`));
  makeFile({ num: "X9", code: "ISTATE", title: "Interaction Visual States", file: "X9-interaction-states.md", intro: "Hover / focus / active / selected / disabled treatments for every surface — where subtle visual regressions hide." }, cases);
}

// X10 — Lifecycle: cold start, first run, multi-window, reload
{
  const cases = [];
  const LC = ["a cold start into the last project", "a true first run (no settings/recents)", "a second window on the same project", "a webview reload mid-session", "switching projects", "closing the last window", "an app update applied", "resuming after sleep"];
  for (const s of SURFACES) for (const lc of LC.slice(0, 4)) cases.push(C(`${s} on ${lc}`, `observe ${s} during ${lc}`, `it mounts/persists/cleans up correctly with no errors or leaks (cf. BUG-1, BUG-2)`));
  makeFile({ num: "X10", code: "LIFE", title: "Lifecycle (start / reload / multi-window)", file: "X10-lifecycle.md", intro: "Cold start, first run, multi-window, reload and project-switch — the lifecycle paths that surfaced BUG-1 and BUG-2." }, cases);
}

// X11 — Cross-OS rendering parity (macOS / Windows / Linux)
{
  const OSES = ["macOS (WKWebView/WebKit)", "Windows (WebView2/Chromium)", "Linux (WebKitGTK)"];
  const cases = [];
  for (const s of SURFACES) for (const o of OSES) cases.push(C(`${s} on ${o}`, `view ${s} on ${o}`, `pixel-parity layout: fonts, scrollbars, borders, the zoom transform and overlays render the same as on the reference OS (no clipping/blurring/missing chrome)`, { r: o.startsWith("macOS") ? undefined : "TODO (not executed — needs that OS)" }));
  makeFile({ num: "X11", code: "OS", title: "Cross-OS Rendering Parity", file: "X11-cross-os.md", intro: "Every surface on each of the three webview engines. The engine differs per OS (WebKit vs Chromium), so CSS, scrollbars, fonts and the interface-zoom transform (BUG-4) can diverge. Only macOS has been executed; Windows/Linux are open." }, cases);
}

// X12 — OS divergence points (behaviour that genuinely differs per OS)
{
  const OSES = ["macOS", "Windows", "Linux"];
  const DIV = [
    ["Modifier glyphs in hints/tooltips", "⌘/⌥ render as Ctrl/Alt off macOS (cf. BUG-5)"],
    ["Keyboard shortcuts fire", "Mod maps to the OS-correct key in every context"],
    ["Window chrome", "native traffic lights on macOS; custom min/max/close on Windows/Linux"],
    ["Title bar decorations", "decorations toggled correctly (setDecorations(false) off macOS)"],
    ["Window controls operable", "minimise/maximise/close all work"],
    ["Path separators in the tree", "backslash paths normalise to forward slashes everywhere"],
    ["Comment anchors store forward-slash paths", "anchors are portable across OSes"],
    ["Search result paths", "path:line links resolve with the OS separator"],
    ["Filesystem case sensitivity", "case-sensitive Linux vs case-insensitive macOS/Windows handled"],
    ["Default shell / PTY", "zsh/bash on unix, PowerShell/cmd via COMSPEC on Windows"],
    ["Terminal rendering", "ConPTY vs unix PTY: ANSI, resize, alternate screen"],
    ["LSP server discovery", "login-shell PATH on unix vs Windows PATH"],
    ["Package-manager install hints", "apt/dnf/pacman/brew on Linux; a sensible hint (or none) on Windows"],
    ["Default code font", "a bundled/available monospace font on each OS"],
    ["File watcher semantics", "create/modify/delete/rename events arrive on each OS"],
    ["Line endings", "CRLF files on Windows open/edit/save without corruption"],
    ["Drag-and-drop file import", "Finder/Explorer/Nautilus drops import correctly"],
    ["Clipboard copy/paste", "terminal + editor copy/paste per OS conventions"],
    ["Reado Anywhere", "cert generation + LAN bind work through the OS firewall"],
    ["Updater bundle", "dmg/msi/nsis/deb/appimage update path per OS"],
    ["Open external links", "URLs open in the OS default browser"],
    ["Native menu", "the menu bar renders per OS (mac menu vs in-window)"],
    ["Reado CLI install", "the `reado` CLI installs to the right per-OS location"],
    ["High-DPI / fractional scaling", "the UI is crisp at the OS display scaling"],
  ];
  const cases = [];
  for (const [name, exp] of DIV) for (const o of OSES) cases.push(C(`${name} — ${o}`, `exercise "${name}" on ${o}`, exp, { r: o === "macOS" ? undefined : "TODO (not executed)" }));
  makeFile({ num: "X12", code: "OSDIV", title: "OS Divergence Points", file: "X12-os-divergence.md", intro: "Behaviours that genuinely differ per OS — keys, window chrome, paths, shell/PTY, LSP discovery, fonts, watcher, updater, fractional scaling. Each is checked on macOS / Windows / Linux." }, cases);
}

// =========================================================================
// INDEX
// =========================================================================
{
  const lines = [];
  lines.push("# Reado Test Book", "");
  lines.push("Behaviour-driven test cases for every user-facing feature, written from the user's point of view and executed against the live app via the in-webview automation driver (`scripts/uidriver`). Generated by `scripts/testbook/generate.mjs` from the real feature matrices discovered by driving the app.", "");
  lines.push("## Case format", "", "> **TC-\\<AREA>-\\<n>** — title  ", "> **As a** \\<context>, **when I** \\<action>, **I expect** \\<observable outcome>.  ", "> Pre / Steps / **Result**: `PASS` / `FAIL → BUG-n` / `MANUAL` / `AGENT-REQUIRED` / `TODO`", "");
  lines.push(`**Total cases: ${total}.** Confirmed bugs are in [../BUG-LEDGER.md](../BUG-LEDGER.md).`, "");
  lines.push("## Sections", "", "| # | Area | Cases | File |", "|---|------|------:|------|");
  for (const s of sections) lines.push(`| ${s.num} | ${s.title} | ${s.count} | [${s.file}](${s.file}) |`);
  lines.push(`| | **Total** | **${total}** | |`, "");
  lines.push("## Cross-cutting dimensions", "", "The X-series files apply the same surfaces across themes, zoom levels, window sizes, languages, accessibility checks, keyboard shortcuts, and failure modes — this is where visual/zoom regressions (BUG-4) and resilience gaps surface.", "");
  writeFileSync(new URL("README.md", OUT), lines.join("\n"));
}

console.log(`Generated ${sections.length} sections, ${total} total cases.`);
for (const s of sections) console.log(`  ${s.num} ${s.title}: ${s.count}`);
