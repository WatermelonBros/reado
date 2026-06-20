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

/** Prompt for resolving a single specific task ("send just this now"). */
export function composeSingleTaskPrompt(id: string): string {
  return (
    `READO REVIEW — please resolve one task now. Run \`reado task show ${id}\` for details, ` +
    `make the change, then \`reado task done ${id}\` (or \`reado task fail ${id} "<reason>"\`).`
  );
}
