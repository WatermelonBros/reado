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

/** Prompt for resolving a single specific task ("send just this now"). */
export function composeSingleTaskPrompt(id: string): string {
  return (
    `READO REVIEW — please resolve one task now. Run \`reado task show ${id}\` for details, ` +
    `make the change, then \`reado task done ${id}\` (or \`reado task fail ${id} "<reason>"\`).`
  );
}
