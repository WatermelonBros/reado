/**
 * Compose the prompt injected into the terminal to kick off an AI review.
 *
 * Per the design (D4), the agent reads and mutates tasks only through the
 * `reado` CLI — so the prompt doesn't embed the tasks; it directs the agent to
 * fetch them with `reado task list` and resolve each through the CLI. It is a
 * single line (no embedded newlines) so it submits as one message in the
 * agent's TUI.
 */
export function composeReviewPrompt(taskCount: number): string {
  const n = taskCount === 1 ? "1 task" : `${taskCount} tasks`
  return (
    `READO REVIEW — I've left ${n} for you in this project. ` +
    "Run `reado task list` to see them; resolve each by editing the code, then mark it " +
    'done with `reado task done <id>` (or `reado task fail <id> "<reason>"` if blocked). ' +
    "Please start now."
  )
}

/** Prompt for resolving a specific selected subset of tasks. */
export function composeReviewPromptForIds(ids: string[]): string {
  if (ids.length === 0) return composeReviewPrompt(0)
  return (
    `READO REVIEW — please resolve these tasks: ${ids.join(", ")}. ` +
    "For each, run `reado task show <id>`, make the change, then mark it " +
    '`reado task done <id>` (or `reado task fail <id> "<reason>"` if blocked). ' +
    "Start now."
  )
}

/**
 * Compose the prompt that asks the agent to audit a file or folder and record
 * its findings as Reado comments (so they show up inline in the code). Single
 * line, like the review prompts, so it submits as one message in the agent TUI.
 */
export function composeAuditPrompt(target: string, instructions: string): string {
  const focus = instructions.trim() || "a general code-quality, correctness, and security audit"
  return (
    `READO AUDIT — please audit \`${target}\` (focus: ${focus}). ` +
    "Do NOT change any code. Instead, for each finding anchor a comment to the exact line(s) with " +
    '`reado comment add --file <path> --line <n> [--end <m>] --type <bug|refactor|performance|question|note> "<body>"` ' +
    "— use a task comment for actionable issues and add `--note` for observations. " +
    "Keep each comment concise and specific to its location. Start now."
  )
}

/**
 * Prompt asking the agent to commit and push the working tree. Single line so it
 * submits as one message in the agent TUI.
 */
export function composeCommitPrompt(): string {
  return (
    "Commit and push the current changes. Run `git status` and `git diff` to review them, " +
    "stage everything, write a concise Conventional Commit message summarising the change, " +
    "commit, then `git push`. Do NOT add a Co-Authored-By trailer or any other " +
    "attribution footer to the message — the commit is the author's. " +
    "Don't ask for confirmation — just do it."
  )
}

/**
 * Prompt asking the agent to explain a span of code. Single line (the agent reads
 * the file itself, so no code is embedded); optionally records the explanation as
 * an anchored `reado` note.
 */
/** Explain a specific symbol — what it does and what each parameter means —
 * using the language server's hover docs as context (handy for external
 * libraries), then record it as an anchored note. Single line (TUI submit). */
export function composeSymbolExplainPrompt(
  file: string,
  line: number,
  symbol: string,
  docs: string,
): string {
  const flat = docs.replace(/\s+/g, " ").trim().slice(0, 1500)
  let p =
    `READO EXPLAIN — explain the symbol \`${symbol}\` used in \`${file}\` at line ${line}: ` +
    "what it does and what each parameter means, concisely (it may come from an external " +
    "library). Do NOT change any code."
  if (flat) p += ` Its language-server docs: "${flat}".`
  p +=
    ` Then record your explanation as a note: ` +
    `\`reado comment add --file ${file} --line ${line} --end ${line} --note "<explanation>"\`.`
  return p
}

export function composeExplainPrompt(
  file: string,
  startLine: number,
  endLine: number,
  asNote: boolean,
): string {
  const where = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`
  let p =
    `READO EXPLAIN — read \`${file}\` ${where} and explain that code concisely ` +
    "(what it does and why). Do NOT change any code."
  if (asNote) {
    p +=
      ` Then record your explanation as a note anchored there: ` +
      `\`reado comment add --file ${file} --line ${startLine} --end ${endLine} --note "<explanation>"\`.`
  }
  return p
}

// ---- Guided Pair Review --------------------------------------------------
//
// The agent drives the session through Reado's MCP tools, with the
// `reado session`/`reado review` CLI as the fallback for agents that have no
// MCP: it plans a route, reviews file by file and **proposes** artifacts the
// human disposes of. Reado never calls an LLM directly — these single-line
// prompts (TUI submit, so no embedded newlines) hand over the session id and
// name the verbs; the contract itself is carried by the MCP server's
// instructions, which reach every agent rather than one vendor's system-prompt
// flag.

/** A PR fetched in place — head/base git refs to read the change from without
 *  ever touching the working tree. Derivable from the PR number. */
export interface PrRefs {
  head: string
  base: string
}

/** What the planner is told about the scope, when Reado can know it.
 *
 *  `files` is the scope's file set as git reports it (untracked included) — the
 *  thing the agent would otherwise re-derive from a `git diff` that doesn't show
 *  untracked files. Empty for the scopes Reado cannot enumerate: a PR lives in
 *  refs, a free-text request has no set. */
export interface PlanFacts {
  objective?: string
  files?: string[]
  pr?: PrRefs
}

/** How the agent reaches the session. Every verb exists twice — as an MCP tool
 *  with typed arguments and as a CLI command — because not every agent speaks
 *  MCP, and the one that does should not be composing shell quoting around a
 *  JSON array. Named in that order so the structured channel is the default. */
const TOOLS =
  "Use Reado's MCP tools if you have them (session_show, review_context, review_plan, " +
  "review_propose_route_change, review_propose_comment, review_propose, review_summarize_file); " +
  "otherwise use the equivalent `reado session` / `reado review` commands."

/** How many of the scope's files the planning prompt names before deferring to
 *  the session. The prompt is typed into a terminal, so its length is a real
 *  cost; the session is where the complete list lives. */
const PLAN_FILES_NAMED = 60

/** Kick off the planning pass: read the scope and emit a ranked route.
 *
 *  The objective is stated here, not only in the per-file prompt: it is what the
 *  ranking is *for*, and a route ordered by generic risk is the wrong route for a
 *  security pass. The known file set is stated too — Reado already read it from
 *  git, and asking the agent to rediscover it invites a plain `git diff` that
 *  silently omits untracked files. */
export function composeGuidedPlanPrompt(
  sessionId: string,
  scopeDesc: string,
  facts: PlanFacts = {},
): string {
  const { objective, files, pr } = facts
  const inspect = pr
    ? `This PR is fetched locally as git refs — the working tree is NOT the PR, so do NOT check anything out or edit it. ` +
      `Inspect the change with \`git diff ${pr.base}...${pr.head}\` and read file versions with \`git show ${pr.head}:<path>\`, `
    : "inspect the changed files (git diff, the tree, symbols, existing comments), "
  // A 200-file diff would otherwise put 200 paths into a line the pane types
  // character by character. The named few orient the ranking; the session holds
  // the whole set, and the answer to review_plan names every file left out — so
  // capping the prompt costs nothing the agent needs.
  const named = (files ?? []).slice(0, PLAN_FILES_NAMED)
  const rest = (files?.length ?? 0) - named.length
  // The coverage contract only exists where Reado knows the file set; without
  // one, asserting anything about completeness would be inventing it.
  const coverage = files?.length
    ? `Reado already read the scope from git — these ${files.length} files changed (untracked included): ${named.join(", ")}` +
      (rest > 0
        ? ` (+${rest} more — read the full set from the session's expectedFiles). `
        : ". ") +
      "Every one must end up in your route or be marked out of scope; the answer to review_plan lists the ones you left out. " +
      "Leaving a file out because it needs no review is an answer — leaving it out in silence is not. "
    : ""
  return (
    `READO GUIDED REVIEW — planning pass for session ${sessionId} (scope: ${scopeDesc}). ` +
    (objective
      ? `Objective: ${objective} — let it shape what you look for and where you go deep. `
      : "") +
    `${TOOLS} Read the session for context, ${inspect}then propose an ordered review route. ` +
    coverage +
    // The route is only as good as what informed it: the project states its own
    // intent in its specs and docs, and a file that contradicts the spec it
    // implements is exactly what a route should surface early.
    "Before ranking, read what the project says about itself: any `openspec/` or " +
    "`.specify/` change proposals and capability specs that cover this scope, the " +
    "README and `docs/**`, and the existing Reado comments. " +
    "Weigh a file higher when it implements a documented capability, when it " +
    "contradicts one, or when it is referenced from several of those documents. " +
    "Each route entry is " +
    '{"file","priority","reason","suggestedReviewMode":"quick|normal|deep","relatedFiles":[...]}. ' +
    // The route is a reading order, not a triage queue. Ranking by risk alone
    // drops the reviewer into the middle of a change with no context — and a
    // reviewer who does not understand the change cannot judge it, however
    // risky the file they were handed first.
    "ORDER THE ROUTE SO THE CHANGE READS. " +
    "1) Start where the change starts: the file that carries its intent, or the spec, doc or test that states it. " +
    "2) Then go in the order that makes each next file make sense — definition before use, " +
    "producer before consumer, the changed function before its callers. " +
    "3) Keep together what has to be read together (a file and its test, a type and its implementation, " +
    "a migration and the code that reads it) and name those in `relatedFiles`. " +
    "4) Leave for last what carries no understanding: generated output, lockfiles, snapshots, mechanical renames. " +
    "Risk orders files *within* that reading, it does not replace it: among files the reader is equally ready for, " +
    "the riskiest first (diff size, role, dependents, files with comments, documented intent). " +
    "Each `reason` says why the file sits *there* — what the reader already knows by the time they reach it — " +
    "not only why it matters; cite which document moved a file up. " +
    "Set `suggestedReviewMode` by how much judgement the file needs: `deep` for the logic the change turns on and " +
    "for money, security, data and error paths; `normal` for ordinary edits; `quick` for mechanical or generated ones. " +
    "Not every file needs reading: one whose change is purely mechanical is `quick`, or out of scope with a reason. " +
    "Covering the scope means every file is accounted for, not that every file is read closely. " +
    "Do NOT review deeply yet and do NOT change any code — just plan the route."
  )
}

/** Ask the agent to close a coverage gap the human can see in the panel: files
 *  the scope contains that the route never picked up. It answers with a route
 *  *change*, which the human then accepts — the route is not edited behind them. */
export function composeGuidedCoverPrompt(sessionId: string, files: string[]): string {
  return (
    `READO GUIDED REVIEW — session ${sessionId} has files in scope that your route left out: ${files.join(", ")}. ` +
    `${TOOLS} Look at each one, then either propose a route change that includes it ` +
    "(review_propose_route_change with the whole new route and a reason — the human accepts it, it does not apply by itself), " +
    "or mark it out of scope (`reado session set-file " +
    `${sessionId} --file <path> --state out-of-scope\`) and say why in a session decision. ` +
    "Do NOT change any code."
  )
}

/**
 * The Big Pass: step back from the file-by-file walk and look at the whole
 * subsystem at once.
 *
 * The incremental route is deliberately narrow — one file, its context, its
 * proposals — which is what keeps it honest, and also what makes it blind to
 * the findings that only exist between files: a pattern repeated in five
 * places, a drift from the spec, a suite that no longer passes. This is the
 * explicit, user-triggered widening, never automatic: it costs a lot of agent
 * time and the human decides when the narrow pass has earned it.
 */
export function composeGuidedWidenPrompt(sessionId: string, files: string[]): string {
  const scope = files.length
    ? `the subsystem around: ${files.slice(0, 12).join(", ")}`
    : "the whole reviewed scope"
  return (
    `READO GUIDED REVIEW — WIDE PASS for session ${sessionId}. ${TOOLS} ` +
    "Read the session first to see what the narrow pass already found. " +
    `Now widen to ${scope} and look for what a file-by-file walk cannot see: ` +
    "(1) repeated patterns — the same mistake, workaround or duplication in several files; " +
    "(2) drift from the documented intent — compare against the project's specs " +
    "(`openspec/`, `.specify/`) and docs; a capability that says one thing while the code does another; " +
    "(3) structural risk — a boundary crossed in one place only, state owned in two, a dependency going the wrong way; " +
    "(4) evidence — run the project's tests and typecheck; report what actually fails rather than what might. " +
    "Propose what you find as session artifacts (review_propose_comment / review_propose --kind question), " +
    "and record the overall read as the session summary. " +
    "Do NOT change any code and do NOT accept anything — the human disposes of every proposal."
  )
}

/** Review one file: ask targeted questions and propose anchored comments. */
export function composeGuidedFilePrompt(
  sessionId: string,
  file: string,
  mode: string,
  objective?: string,
  pr?: PrRefs,
): string {
  const focus = objective ? ` Objective: ${objective}.` : ""
  const read = pr
    ? `Read the PR's version with \`git show ${pr.head}:${file}\` (the working tree is NOT the PR — never edit it) ` +
      `and diff it with \`git diff ${pr.base}...${pr.head} -- ${file}\`; anchor line numbers to the PR version. `
    : "Read the file and "
  return (
    `READO GUIDED REVIEW — review \`${file}\` for session ${sessionId} (${mode} pass).${focus} ` +
    `${TOOLS} Read the file's session context first (review_context). ${read}` +
    "raise concrete, grounded observations — never broad generic remarks. Propose each as an anchored " +
    "comment (review_propose_comment, type bug|refactor|performance|question|note); open questions as " +
    "review_propose --kind question; and if you can't judge without more context, --kind needs-context " +
    "instead of guessing. " +
    // The route is a plan made before the code was read; the file that turns out
    // to matter is discovered here. Without naming this verb the agent's only
    // options are to review off-route silently or to say nothing.
    "If this file shows that another one must be reviewed (its only caller, the place the same bug repeats), " +
    "propose a route change with your reason (review_propose_route_change) — it waits for the human, so keep reviewing. " +
    "When done, capture a mini-summary of what you checked, the risks and what's next (review_summarize_file). " +
    "Do NOT change any code and do NOT accept anything — the human disposes of every proposal."
  )
}

/** Ask a second agent to challenge the current review (a contrarian pass). */
export function composeGuidedChallengePrompt(sessionId: string, file: string): string {
  return (
    `READO GUIDED REVIEW — second opinion for session ${sessionId} on \`${file}\`. ${TOOLS} ` +
    "Read the existing findings for that file (review_context), " +
    "then challenge them: which are false positives, what was missed, what's over-stated? " +
    "Record your challenges as proposals (review_propose_comment / review_propose --kind question). " +
    "Do NOT change any code; surface disagreements as proposals the human decides on."
  )
}

/** Reply to the comments already written on a file (questions, suggestions) —
 *  distinct from a review: it doesn't propose new findings, it answers existing ones. */
export function composeGuidedRespondPrompt(sessionId: string, file: string): string {
  return (
    `READO GUIDED REVIEW — respond to the existing comments on \`${file}\` (session ${sessionId}). ` +
    "Find the comments anchored to that file (run `reado task list` and `reado comment search` and look " +
    `at anchors on \`${file}\`), read each in its code context, and reply with ` +
    '`reado comment reply <id> "<your answer>"` — answer questions, confirm or push back on suggestions, ' +
    "point to the relevant code. Do NOT change any code, do NOT resolve or close anything, and do NOT add " +
    "new findings — only respond to what's already there."
  )
}

/** Prompt for resolving a single specific task ("send just this now"). */
export function composeSingleTaskPrompt(id: string): string {
  return (
    `READO REVIEW — please resolve one task now. Run \`reado task show ${id}\` for details, ` +
    `make the change, then \`reado task done ${id}\` (or \`reado task fail ${id} "<reason>"\`).`
  )
}
