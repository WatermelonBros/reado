# Tasks — Task blocked state

## 1. Core model (`crates/reado-core`)

- [ ] 1.1 Add a `Blocked` comment/task state with a stored reason; serialize into
      the `.md` (additive). Track an attempt counter.

## 2. CLI (`crates/reado-cli`)

- [ ] 2.1 `reado task block <id> "<reason>"` and keep `task fail` incrementing the
      attempt counter; auto-block past the budget.
- [ ] 2.2 `task list` filters exclude blocked from the resolvable set.

## 3. Desktop

- [ ] 3.1 Comments/tasks UI: blocked badge + filter; an "answer" action that adds
      context and returns the task to open.
- [ ] 3.2 Resolve loop: exclude blocked; track unresolved queued ids; re-dispatch
      only stragglers on agent relaunch.

## 4. i18n + impeccable

- [ ] 4.1 Keys for the blocked state/answer flow; calm, honest surfacing.

## 5. Tests

- [ ] 5.1 Core: block state round-trips; attempt counter + auto-block.
- [ ] 5.2 Frontend: resolve loop excludes blocked; straggler set computed right.

## 6. Verify

- [ ] 6.1 `cargo fmt/clippy/test` across crates; `pnpm typecheck && pnpm test`.
