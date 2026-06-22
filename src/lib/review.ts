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

/** Prompt for resolving a single specific task ("send just this now"). */
export function composeSingleTaskPrompt(id: string): string {
  return (
    `READO REVIEW — please resolve one task now. Run \`reado task show ${id}\` for details, ` +
    `make the change, then \`reado task done ${id}\` (or \`reado task fail ${id} "<reason>"\`).`
  );
}
