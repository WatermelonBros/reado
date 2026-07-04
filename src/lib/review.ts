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
  const n = taskCount === 1 ? "1 task" : `${taskCount} tasks`;
  return (
    `READO REVIEW — I've left ${n} for you in this project. ` +
    "Run `reado task list` to see them; resolve each by editing the code, then mark it " +
    'done with `reado task done <id>` (or `reado task fail <id> "<reason>"` if blocked). ' +
    "Please start now."
  );
}

/** Prompt for resolving a specific selected subset of tasks. */
export function composeReviewPromptForIds(ids: string[]): string {
  if (ids.length === 0) return composeReviewPrompt(0);
  return (
    `READO REVIEW — please resolve these tasks: ${ids.join(", ")}. ` +
    "For each, run `reado task show <id>`, make the change, then mark it " +
    '`reado task done <id>` (or `reado task fail <id> "<reason>"` if blocked). ' +
    "Start now."
  );
}

/**
 * Free-text review: the human describes what they want looked at, and the agent
 * decides which files are relevant, reads them, and records findings as Reado
 * comments. Single line so it submits as one message in the agent TUI.
 */
export function composeReviewRequestPrompt(request: string): string {
  return (
    `READO REVIEW — review request from me: "${request}". ` +
    "Work out which files are relevant yourself, read them, and record your findings as Reado " +
    "comments anchored to the exact line(s): " +
    '`reado comment add --file <path> --line <n> [--end <m>] --type <bug|refactor|performance|question|note> "<body>"` ' +
    "— a task comment for actionable issues, add `--note` for observations. Do NOT change any code. Start now."
  );
}

/**
 * Compose the prompt that asks the agent to audit a file or folder and record
 * its findings as Reado comments (so they show up inline in the code). Single
 * line, like the review prompts, so it submits as one message in the agent TUI.
 */
export function composeAuditPrompt(target: string, instructions: string): string {
  const focus = instructions.trim() || "a general code-quality, correctness, and security audit";
  return (
    `READO AUDIT — please audit \`${target}\` (focus: ${focus}). ` +
    "Do NOT change any code. Instead, for each finding anchor a comment to the exact line(s) with " +
    '`reado comment add --file <path> --line <n> [--end <m>] --type <bug|refactor|performance|question|note> "<body>"` ' +
    "— use a task comment for actionable issues and add `--note` for observations. " +
    "Keep each comment concise and specific to its location. Start now."
  );
}

/**
 * Prompt asking the agent to commit and push the working tree. Single line so it
 * submits as one message in the agent TUI.
 */
export function composeCommitPrompt(): string {
  return (
    "Commit and push the current changes. Run `git status` and `git diff` to review them, " +
    "stage everything, write a concise Conventional Commit message summarising the change, " +
    "commit, then `git push`. Don't ask for confirmation — just do it."
  );
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
  const flat = docs.replace(/\s+/g, " ").trim().slice(0, 1500);
  let p =
    `READO EXPLAIN — explain the symbol \`${symbol}\` used in \`${file}\` at line ${line}: ` +
    "what it does and what each parameter means, concisely (it may come from an external " +
    "library). Do NOT change any code.";
  if (flat) p += ` Its language-server docs: "${flat}".`;
  p +=
    ` Then record your explanation as a note: ` +
    `\`reado comment add --file ${file} --line ${line} --end ${line} --note "<explanation>"\`.`;
  return p;
}

export function composeExplainPrompt(
  file: string,
  startLine: number,
  endLine: number,
  asNote: boolean,
): string {
  const where = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
  let p =
    `READO EXPLAIN — read \`${file}\` ${where} and explain that code concisely ` +
    "(what it does and why). Do NOT change any code.";
  if (asNote) {
    p +=
      ` Then record your explanation as a note anchored there: ` +
      `\`reado comment add --file ${file} --line ${startLine} --end ${endLine} --note "<explanation>"\`.`;
  }
  return p;
}

// ---- Guided Pair Review --------------------------------------------------
//
// The agent drives the session through the `reado session`/`reado review` CLI:
// it plans a route, reviews file by file and **proposes** artifacts the human
// disposes of. Reado never calls an LLM directly — these single-line prompts
// (TUI submit) hand the session id to the agent and tell it which verb to run.

/** A PR fetched in place — head/base git refs to read the change from without
 *  ever touching the working tree. Derivable from the PR number. */
export interface PrRefs {
  head: string;
  base: string;
}

/** Kick off the planning pass: read the scope and emit a ranked route. When the
 *  scope is a PR, the change lives in git refs (not the working tree), so the
 *  agent is told to read it non-destructively via `git diff`/`git show`. */
export function composeGuidedPlanPrompt(
  sessionId: string,
  scopeDesc: string,
  pr?: PrRefs,
): string {
  const inspect = pr
    ? `This PR is fetched locally as git refs — the working tree is NOT the PR, so do NOT check anything out or edit it. ` +
      `Inspect the change with \`git diff ${pr.base}...${pr.head}\` and read file versions with \`git show ${pr.head}:<path>\`, `
    : "inspect the changed files (git diff, the tree, symbols, existing comments), ";
  return (
    `READO GUIDED REVIEW — planning pass for session ${sessionId} (scope: ${scopeDesc}). ` +
    `Run \`reado session show ${sessionId} --json\` for context, ${inspect}then propose an ordered review route. ` +
    `Emit it with \`reado review plan ${sessionId} --route '<json>'\` where <json> is an array of ` +
    '{"file","priority","reason","suggestedReviewMode":"quick|normal|deep","relatedFiles":[...]} ' +
    "ranked by risk (diff size, role, dependents, files with comments). Do NOT review deeply yet " +
    "and do NOT change any code — just plan the route."
  );
}

/** Review one file: ask targeted questions and propose anchored comments. */
export function composeGuidedFilePrompt(
  sessionId: string,
  file: string,
  mode: string,
  objective?: string,
  pr?: PrRefs,
): string {
  const focus = objective ? ` Objective: ${objective}.` : "";
  const read = pr
    ? `Read the PR's version with \`git show ${pr.head}:${file}\` (the working tree is NOT the PR — never edit it) ` +
      `and diff it with \`git diff ${pr.base}...${pr.head} -- ${file}\`; anchor line numbers to the PR version. `
    : "Read the file and ";
  return (
    `READO GUIDED REVIEW — review \`${file}\` for session ${sessionId} (${mode} pass).${focus} ` +
    `Run \`reado review context ${sessionId} --file ${file} --json\` first. ${read}` +
    "raise concrete, grounded observations — never broad generic remarks. For each, PROPOSE a " +
    `comment: \`reado review propose-comment ${sessionId} --file ${file} --line <n> [--end <m>] ` +
    '--type <bug|refactor|performance|question|note> "<body>"\`. ' +
    `Open questions → \`reado review propose ${sessionId} --kind question --file ${file} --line <n> "<q>"\`; ` +
    "if you can't judge without more context, use `--kind needs-context` instead of guessing. " +
    `When done, capture a mini-summary: \`reado review summarize-file ${sessionId} --file ${file} "<what you checked / risks / next>"\`. ` +
    "Do NOT change any code and do NOT accept anything — the human disposes of every proposal."
  );
}

/** Ask a second agent to challenge the current review (a contrarian pass). */
export function composeGuidedChallengePrompt(sessionId: string, file: string): string {
  return (
    `READO GUIDED REVIEW — second opinion for session ${sessionId} on \`${file}\`. ` +
    `Run \`reado review context ${sessionId} --file ${file} --json\` to see the existing findings, ` +
    "then challenge them: which are false positives, what was missed, what's over-stated? " +
    `Record your challenges as proposals (\`reado review propose-comment\` / \`reado review propose ${sessionId} --kind question\`). ` +
    "Do NOT change any code; surface disagreements as proposals the human decides on."
  );
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
  );
}

/** Prompt for resolving a single specific task ("send just this now"). */
export function composeSingleTaskPrompt(id: string): string {
  return (
    `READO REVIEW — please resolve one task now. Run \`reado task show ${id}\` for details, ` +
    `make the change, then \`reado task done ${id}\` (or \`reado task fail ${id} "<reason>"\`).`
  );
}
