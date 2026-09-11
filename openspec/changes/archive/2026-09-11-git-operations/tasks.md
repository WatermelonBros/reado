## 1. Backend

- [x] 1.1 `git_amend` (message + staged), `git_revert`, `git_cherry_pick`,
      `git_tags`/`git_tag_create`/`git_tag_delete`/`git_tag_push`,
      `git_remotes`/`git_remote_add`/`git_remote_rename`/`git_remote_remove`.
- [x] 1.2 Each reports conflicts as conflicts, not as a failure with a message
      nobody can act on.
- [x] 1.3 Whether the last commit is already on the upstream, for the warning.

## 2. UI

- [x] 2.1 The Source Control "more actions" menu grows Amend, Revert,
      Cherry-pick, Tags and Remotes.
- [x] 2.2 Amend prefills the message; pushed-already asks first.
- [x] 2.3 Pickers for commit, branch, tag and remote reuse the existing dialogs.

## 3. Verify

- [x] 3.1 Rust tests against a real temporary repository for each command,
      including the conflicting revert and the duplicate tag name.
- [x] 3.2 UI tests for the menu wiring and the amend prefill.
- [x] 3.3 i18n for every shipped locale.
- [x] 3.4 CHANGELOG entry under `[Unreleased]`.
