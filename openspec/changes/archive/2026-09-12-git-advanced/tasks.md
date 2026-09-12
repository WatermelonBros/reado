## 1. Backend

- [x] 1.1 `git_merge`, `git_rebase`, `git_rebase_commits`,
      `git_rebase_interactive` — each conflicting case reported as an
      `ApplyOutcome`, not as an error.
- [x] 1.2 `git_sequencer` (what is in progress) and `git_sequencer_continue`
      (stage, then `--continue --no-edit`).
- [x] 1.3 `git_worktrees` / `git_worktree_add` / `git_worktree_remove`,
      `git_submodules` / `git_submodule_update`.
- [x] 1.4 `git_signing` / `git_set_signing` against git's own config keys.
- [x] 1.5 `git_graph`: hash, parents, subject, author, relative date, refs, over
      `--all --date-order`.
- [x] 1.6 The interactive plan validated before anything is written: known
      actions only, hashes only, and the two plans git itself refuses.

## 2. UI

- [x] 2.1 Source Control ▸ More actions grows Merge, Rebase, Worktrees,
      Submodules, the commit graph and the signing toggle.
- [x] 2.2 `RebaseDialog`: the plan as a list, per-commit action, reordering, and
      the refusals stated before the button is usable.
- [x] 2.3 `ConflictView` asks the repository what is in progress and offers
      Continue for a rebase where a merge offers Mark resolved.
- [x] 2.4 `GitGraph` overlay with lane assignment, refs, paging, and "diff
      against this commit"; reachable from the menu and the palette.

## 3. Verify

- [x] 3.1 Rust tests for the plan validator, including the hash and action
      rejections.
- [x] 3.2 Unit tests for lane assignment: linear history, a merge's second
      parent, lane reuse, and a parent outside the window.
- [x] 3.3 i18n for all five shipped locales.
- [x] 3.4 CHANGELOG entry under `[Unreleased]`.
- [x] 3.5 Driven in the running app against a throwaway repository: the menu,
      every picker, the graph overlay, and a real interactive rebase that
      squashed one commit into another. What it turned up:
      - the plan listed the merge commit, which a plain `rebase -i` never
        replays and cannot `pick` — now `--no-merges`;
      - the graph's header read "{n} commit" because the count was passed under
        the wrong name;
      - git refuses to rebase over a dirty working tree, and the reason reached
        only the log — the dialog now says so before the button is usable.
      - A real worktree was created (sibling directory, new branch) and removed,
        and the signing toggle was checked against `git config`.
