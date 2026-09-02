# Tasks — Agent task runner

## 1. Runner (`src/lib/agentTask.ts`)

- [x] 1.1 `runAgentTask({ prompt, poll, parse, timeout, retries, signal })` →
      typed status (`running|done|failed|cancelled|timedOut`) + result.
- [x] 1.2 In-flight registry (zustand) keyed by task id for UI display + cancel.
- [x] 1.3 Failure surfaces via `notifyError`; malformed parse = failed, not empty.

## 2. Migrate callers

- [x] 2.1 `synopsis.ts` onto the runner.
- [x] 2.2 `qa.ts` onto the runner.
- [x] 2.3 `semanticSearch.ts` onto the runner (until the semantic-index change
      lands; then only the agent-escalation path).
- [x] 2.4 `preReview.ts` onto the runner.
- [x] 2.5 `tours.ts` (AI tour) onto the runner.

## 3. UI

- [x] 3.1 A minimal running/cancel affordance where each feature already renders
      its loading state (reuse existing spinners; add cancel).

## 4. Tests

- [x] 4.1 `agentTask.uitest.ts`: status transitions, cancel, retry/backoff,
      malformed-result → failed, timeout.
- [x] 4.2 Keep each migrated feature's existing tests green.

## 5. Verify

- [x] 5.1 `pnpm typecheck && pnpm test`.
