# 6 — Git / Source Control

Source Control + branch switcher; 28 `git_*` commands. Destructive ops only on a throwaway repo. Entry: `GitPanel.tsx`.

**Cases: 207.**

---

### TC-GIT-0001 — Status lists changes
**As a** user, **when I** open Source Control with a dirty tree, **I expect** modified/untracked files listed.
- **Result:** PASS

### TC-GIT-0002 — Stage a file
**As a** user, **when I** click "Aggiungi a stage", **I expect** it staged.
- **Result:** PASS

### TC-GIT-0003 — Unstage a file
**As a** user, **when I** unstage a staged file, **I expect** it back to unstaged.
- **Result:** PASS

### TC-GIT-0004 — Stage all
**As a** user, **when I** click "Aggiungi tutto a stage", **I expect** every change staged.
- **Result:** PASS

### TC-GIT-0005 — Commit
**As a** user, **when I** write a message and Cmd+Enter, **I expect** a commit created, box cleared.
- **Result:** PASS

### TC-GIT-0006 — Commit disabled with nothing staged
**As a** user, **when I** have nothing staged, **I expect** Commit disabled.
- **Result:** PASS

### TC-GIT-0007 — Discard a file (confirm)
**As a** user, **when I** discard a file, **I expect** an inline "Scarta modifiche?" confirm, then revert.
- **Result:** PASS

### TC-GIT-0008 — Discard all (confirm)
**As a** user, **when I** discard all, **I expect** a confirm before wiping the tree.
- **Result:** PARTIAL

### TC-GIT-0009 — Checkout a branch
**As a** user, **when I** pick a branch, **I expect** switch to it.
- **Result:** PASS

### TC-GIT-0010 — Create a branch
**As a** user, **when I** enter a name + confirm, **I expect** it created and checked out.
- **Result:** TODO

### TC-GIT-0011 — Remote ops fail gracefully
**As a** user, **when I** Fetch/Pull/Push with no remote, **I expect** a clear error, no crash, no rejection.
- **Result:** PASS

### TC-GIT-0012 — Stash save
**As a** user, **when I** stash, **I expect** changes saved, tree cleaned.
- **Result:** TODO (Ark menu driver limit)

### TC-GIT-0013 — Stash list/pop/apply/drop
**As a** user, **when I** manage stashes, **I expect** the stash operations apply.
- **Result:** TODO

### TC-GIT-0014 — Diff vs HEAD
**As a** user, **when I** view a modified file's diff, **I expect** changed lines vs HEAD.
- **Result:** PASS

### TC-GIT-0015 — Blame
**As a** user, **when I** toggle blame, **I expect** per-line author/commit.
- **Result:** PASS

### TC-GIT-0016 — Timeline / file history
**As a** user, **when I** open Timeline, **I expect** commits that touched the file.
- **Result:** TODO

### TC-GIT-0017 — Branch switcher marks current
**As a** user, **when I** open the switcher, **I expect** the current branch marked.
- **Result:** PASS

### TC-GIT-0018 — .reado not gitignored by default
**As a** user, **when I** view status, **I expect** .reado shows untracked unless opted in.
- **Result:** PASS

### TC-GIT-0019 — Commit & push with AI
**As a** user, **when I** use the AI commit action, **I expect** an AI message + push.
- **Result:** TODO

### TC-GIT-0020 — No console errors
**As a** user, **when I** stage/commit/checkout/discard, **I expect** no uncaught errors.
- **Result:** PASS

### TC-GIT-0021 — git_status on a clean repo
**As a** user, **when I** invoke git_status with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0022 — git_status on a dirty working tree
**As a** user, **when I** invoke git_status with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0023 — git_status on a detached HEAD
**As a** user, **when I** invoke git_status with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0024 — git_status on no commits yet
**As a** user, **when I** invoke git_status with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0025 — git_status on no remote
**As a** user, **when I** invoke git_status with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0026 — git_status on a conflicted state
**As a** user, **when I** invoke git_status with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0027 — git_status on a large diff
**As a** user, **when I** invoke git_status with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0028 — git_stage on a clean repo
**As a** user, **when I** invoke git_stage with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0029 — git_stage on a dirty working tree
**As a** user, **when I** invoke git_stage with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0030 — git_stage on a detached HEAD
**As a** user, **when I** invoke git_stage with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0031 — git_stage on no commits yet
**As a** user, **when I** invoke git_stage with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0032 — git_stage on no remote
**As a** user, **when I** invoke git_stage with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0033 — git_stage on a conflicted state
**As a** user, **when I** invoke git_stage with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0034 — git_stage on a large diff
**As a** user, **when I** invoke git_stage with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0035 — git_unstage on a clean repo
**As a** user, **when I** invoke git_unstage with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0036 — git_unstage on a dirty working tree
**As a** user, **when I** invoke git_unstage with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0037 — git_unstage on a detached HEAD
**As a** user, **when I** invoke git_unstage with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0038 — git_unstage on no commits yet
**As a** user, **when I** invoke git_unstage with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0039 — git_unstage on no remote
**As a** user, **when I** invoke git_unstage with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0040 — git_unstage on a conflicted state
**As a** user, **when I** invoke git_unstage with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0041 — git_unstage on a large diff
**As a** user, **when I** invoke git_unstage with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0042 — git_stage_all on a clean repo
**As a** user, **when I** invoke git_stage_all with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0043 — git_stage_all on a dirty working tree
**As a** user, **when I** invoke git_stage_all with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0044 — git_stage_all on a detached HEAD
**As a** user, **when I** invoke git_stage_all with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0045 — git_stage_all on no commits yet
**As a** user, **when I** invoke git_stage_all with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0046 — git_stage_all on no remote
**As a** user, **when I** invoke git_stage_all with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0047 — git_stage_all on a conflicted state
**As a** user, **when I** invoke git_stage_all with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0048 — git_stage_all on a large diff
**As a** user, **when I** invoke git_stage_all with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0049 — git_unstage_all on a clean repo
**As a** user, **when I** invoke git_unstage_all with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0050 — git_unstage_all on a dirty working tree
**As a** user, **when I** invoke git_unstage_all with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0051 — git_unstage_all on a detached HEAD
**As a** user, **when I** invoke git_unstage_all with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0052 — git_unstage_all on no commits yet
**As a** user, **when I** invoke git_unstage_all with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0053 — git_unstage_all on no remote
**As a** user, **when I** invoke git_unstage_all with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0054 — git_unstage_all on a conflicted state
**As a** user, **when I** invoke git_unstage_all with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0055 — git_unstage_all on a large diff
**As a** user, **when I** invoke git_unstage_all with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0056 — git_commit on a clean repo
**As a** user, **when I** invoke git_commit with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0057 — git_commit on a dirty working tree
**As a** user, **when I** invoke git_commit with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0058 — git_commit on a detached HEAD
**As a** user, **when I** invoke git_commit with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0059 — git_commit on no commits yet
**As a** user, **when I** invoke git_commit with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0060 — git_commit on no remote
**As a** user, **when I** invoke git_commit with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0061 — git_commit on a conflicted state
**As a** user, **when I** invoke git_commit with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0062 — git_commit on a large diff
**As a** user, **when I** invoke git_commit with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0063 — git_discard on a clean repo
**As a** user, **when I** invoke git_discard with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0064 — git_discard on a dirty working tree
**As a** user, **when I** invoke git_discard with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0065 — git_discard on a detached HEAD
**As a** user, **when I** invoke git_discard with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0066 — git_discard on no commits yet
**As a** user, **when I** invoke git_discard with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0067 — git_discard on no remote
**As a** user, **when I** invoke git_discard with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0068 — git_discard on a conflicted state
**As a** user, **when I** invoke git_discard with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0069 — git_discard on a large diff
**As a** user, **when I** invoke git_discard with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0070 — git_discard_all on a clean repo
**As a** user, **when I** invoke git_discard_all with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0071 — git_discard_all on a dirty working tree
**As a** user, **when I** invoke git_discard_all with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0072 — git_discard_all on a detached HEAD
**As a** user, **when I** invoke git_discard_all with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0073 — git_discard_all on no commits yet
**As a** user, **when I** invoke git_discard_all with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0074 — git_discard_all on no remote
**As a** user, **when I** invoke git_discard_all with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0075 — git_discard_all on a conflicted state
**As a** user, **when I** invoke git_discard_all with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0076 — git_discard_all on a large diff
**As a** user, **when I** invoke git_discard_all with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0077 — git_checkout on a clean repo
**As a** user, **when I** invoke git_checkout with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0078 — git_checkout on a dirty working tree
**As a** user, **when I** invoke git_checkout with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0079 — git_checkout on a detached HEAD
**As a** user, **when I** invoke git_checkout with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0080 — git_checkout on no commits yet
**As a** user, **when I** invoke git_checkout with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0081 — git_checkout on no remote
**As a** user, **when I** invoke git_checkout with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0082 — git_checkout on a conflicted state
**As a** user, **when I** invoke git_checkout with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0083 — git_checkout on a large diff
**As a** user, **when I** invoke git_checkout with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0084 — git_create_branch on a clean repo
**As a** user, **when I** invoke git_create_branch with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0085 — git_create_branch on a dirty working tree
**As a** user, **when I** invoke git_create_branch with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0086 — git_create_branch on a detached HEAD
**As a** user, **when I** invoke git_create_branch with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0087 — git_create_branch on no commits yet
**As a** user, **when I** invoke git_create_branch with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0088 — git_create_branch on no remote
**As a** user, **when I** invoke git_create_branch with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0089 — git_create_branch on a conflicted state
**As a** user, **when I** invoke git_create_branch with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0090 — git_create_branch on a large diff
**As a** user, **when I** invoke git_create_branch with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0091 — git_branches on a clean repo
**As a** user, **when I** invoke git_branches with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0092 — git_branches on a dirty working tree
**As a** user, **when I** invoke git_branches with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0093 — git_branches on a detached HEAD
**As a** user, **when I** invoke git_branches with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0094 — git_branches on no commits yet
**As a** user, **when I** invoke git_branches with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0095 — git_branches on no remote
**As a** user, **when I** invoke git_branches with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0096 — git_branches on a conflicted state
**As a** user, **when I** invoke git_branches with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0097 — git_branches on a large diff
**As a** user, **when I** invoke git_branches with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0098 — git_fetch on a clean repo
**As a** user, **when I** invoke git_fetch with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0099 — git_fetch on a dirty working tree
**As a** user, **when I** invoke git_fetch with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0100 — git_fetch on a detached HEAD
**As a** user, **when I** invoke git_fetch with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0101 — git_fetch on no commits yet
**As a** user, **when I** invoke git_fetch with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0102 — git_fetch on no remote
**As a** user, **when I** invoke git_fetch with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0103 — git_fetch on a conflicted state
**As a** user, **when I** invoke git_fetch with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0104 — git_fetch on a large diff
**As a** user, **when I** invoke git_fetch with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0105 — git_pull on a clean repo
**As a** user, **when I** invoke git_pull with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0106 — git_pull on a dirty working tree
**As a** user, **when I** invoke git_pull with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0107 — git_pull on a detached HEAD
**As a** user, **when I** invoke git_pull with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0108 — git_pull on no commits yet
**As a** user, **when I** invoke git_pull with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0109 — git_pull on no remote
**As a** user, **when I** invoke git_pull with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0110 — git_pull on a conflicted state
**As a** user, **when I** invoke git_pull with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0111 — git_pull on a large diff
**As a** user, **when I** invoke git_pull with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0112 — git_push on a clean repo
**As a** user, **when I** invoke git_push with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0113 — git_push on a dirty working tree
**As a** user, **when I** invoke git_push with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0114 — git_push on a detached HEAD
**As a** user, **when I** invoke git_push with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0115 — git_push on no commits yet
**As a** user, **when I** invoke git_push with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0116 — git_push on no remote
**As a** user, **when I** invoke git_push with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0117 — git_push on a conflicted state
**As a** user, **when I** invoke git_push with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0118 — git_push on a large diff
**As a** user, **when I** invoke git_push with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0119 — git_stash on a clean repo
**As a** user, **when I** invoke git_stash with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0120 — git_stash on a dirty working tree
**As a** user, **when I** invoke git_stash with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0121 — git_stash on a detached HEAD
**As a** user, **when I** invoke git_stash with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0122 — git_stash on no commits yet
**As a** user, **when I** invoke git_stash with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0123 — git_stash on no remote
**As a** user, **when I** invoke git_stash with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0124 — git_stash on a conflicted state
**As a** user, **when I** invoke git_stash with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0125 — git_stash on a large diff
**As a** user, **when I** invoke git_stash with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0126 — git_stash_pop on a clean repo
**As a** user, **when I** invoke git_stash_pop with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0127 — git_stash_pop on a dirty working tree
**As a** user, **when I** invoke git_stash_pop with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0128 — git_stash_pop on a detached HEAD
**As a** user, **when I** invoke git_stash_pop with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0129 — git_stash_pop on no commits yet
**As a** user, **when I** invoke git_stash_pop with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0130 — git_stash_pop on no remote
**As a** user, **when I** invoke git_stash_pop with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0131 — git_stash_pop on a conflicted state
**As a** user, **when I** invoke git_stash_pop with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0132 — git_stash_pop on a large diff
**As a** user, **when I** invoke git_stash_pop with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0133 — git_stash_apply on a clean repo
**As a** user, **when I** invoke git_stash_apply with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0134 — git_stash_apply on a dirty working tree
**As a** user, **when I** invoke git_stash_apply with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0135 — git_stash_apply on a detached HEAD
**As a** user, **when I** invoke git_stash_apply with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0136 — git_stash_apply on no commits yet
**As a** user, **when I** invoke git_stash_apply with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0137 — git_stash_apply on no remote
**As a** user, **when I** invoke git_stash_apply with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0138 — git_stash_apply on a conflicted state
**As a** user, **when I** invoke git_stash_apply with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0139 — git_stash_apply on a large diff
**As a** user, **when I** invoke git_stash_apply with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0140 — git_stash_drop on a clean repo
**As a** user, **when I** invoke git_stash_drop with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0141 — git_stash_drop on a dirty working tree
**As a** user, **when I** invoke git_stash_drop with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0142 — git_stash_drop on a detached HEAD
**As a** user, **when I** invoke git_stash_drop with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0143 — git_stash_drop on no commits yet
**As a** user, **when I** invoke git_stash_drop with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0144 — git_stash_drop on no remote
**As a** user, **when I** invoke git_stash_drop with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0145 — git_stash_drop on a conflicted state
**As a** user, **when I** invoke git_stash_drop with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0146 — git_stash_drop on a large diff
**As a** user, **when I** invoke git_stash_drop with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0147 — git_stash_list on a clean repo
**As a** user, **when I** invoke git_stash_list with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0148 — git_stash_list on a dirty working tree
**As a** user, **when I** invoke git_stash_list with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0149 — git_stash_list on a detached HEAD
**As a** user, **when I** invoke git_stash_list with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0150 — git_stash_list on no commits yet
**As a** user, **when I** invoke git_stash_list with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0151 — git_stash_list on no remote
**As a** user, **when I** invoke git_stash_list with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0152 — git_stash_list on a conflicted state
**As a** user, **when I** invoke git_stash_list with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0153 — git_stash_list on a large diff
**As a** user, **when I** invoke git_stash_list with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0154 — git_blame on a clean repo
**As a** user, **when I** invoke git_blame with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0155 — git_blame on a dirty working tree
**As a** user, **when I** invoke git_blame with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0156 — git_blame on a detached HEAD
**As a** user, **when I** invoke git_blame with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0157 — git_blame on no commits yet
**As a** user, **when I** invoke git_blame with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0158 — git_blame on no remote
**As a** user, **when I** invoke git_blame with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0159 — git_blame on a conflicted state
**As a** user, **when I** invoke git_blame with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0160 — git_blame on a large diff
**As a** user, **when I** invoke git_blame with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0161 — git_file_history on a clean repo
**As a** user, **when I** invoke git_file_history with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0162 — git_file_history on a dirty working tree
**As a** user, **when I** invoke git_file_history with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0163 — git_file_history on a detached HEAD
**As a** user, **when I** invoke git_file_history with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0164 — git_file_history on no commits yet
**As a** user, **when I** invoke git_file_history with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0165 — git_file_history on no remote
**As a** user, **when I** invoke git_file_history with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0166 — git_file_history on a conflicted state
**As a** user, **when I** invoke git_file_history with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0167 — git_file_history on a large diff
**As a** user, **when I** invoke git_file_history with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0168 — git_show_ref on a clean repo
**As a** user, **when I** invoke git_show_ref with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0169 — git_show_ref on a dirty working tree
**As a** user, **when I** invoke git_show_ref with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0170 — git_show_ref on a detached HEAD
**As a** user, **when I** invoke git_show_ref with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0171 — git_show_ref on no commits yet
**As a** user, **when I** invoke git_show_ref with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0172 — git_show_ref on no remote
**As a** user, **when I** invoke git_show_ref with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0173 — git_show_ref on a conflicted state
**As a** user, **when I** invoke git_show_ref with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0174 — git_show_ref on a large diff
**As a** user, **when I** invoke git_show_ref with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0175 — git_refs on a clean repo
**As a** user, **when I** invoke git_refs with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0176 — git_refs on a dirty working tree
**As a** user, **when I** invoke git_refs with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0177 — git_refs on a detached HEAD
**As a** user, **when I** invoke git_refs with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0178 — git_refs on no commits yet
**As a** user, **when I** invoke git_refs with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0179 — git_refs on no remote
**As a** user, **when I** invoke git_refs with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0180 — git_refs on a conflicted state
**As a** user, **when I** invoke git_refs with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0181 — git_refs on a large diff
**As a** user, **when I** invoke git_refs with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0182 — git_head on a clean repo
**As a** user, **when I** invoke git_head with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0183 — git_head on a dirty working tree
**As a** user, **when I** invoke git_head with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0184 — git_head on a detached HEAD
**As a** user, **when I** invoke git_head with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0185 — git_head on no commits yet
**As a** user, **when I** invoke git_head with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0186 — git_head on no remote
**As a** user, **when I** invoke git_head with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0187 — git_head on a conflicted state
**As a** user, **when I** invoke git_head with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0188 — git_head on a large diff
**As a** user, **when I** invoke git_head with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0189 — git_changed_files on a clean repo
**As a** user, **when I** invoke git_changed_files with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0190 — git_changed_files on a dirty working tree
**As a** user, **when I** invoke git_changed_files with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0191 — git_changed_files on a detached HEAD
**As a** user, **when I** invoke git_changed_files with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0192 — git_changed_files on no commits yet
**As a** user, **when I** invoke git_changed_files with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0193 — git_changed_files on no remote
**As a** user, **when I** invoke git_changed_files with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0194 — git_changed_files on a conflicted state
**As a** user, **when I** invoke git_changed_files with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0195 — git_changed_files on a large diff
**As a** user, **when I** invoke git_changed_files with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0196 — git_info on a clean repo
**As a** user, **when I** invoke git_info with a clean repo, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0197 — git_info on a dirty working tree
**As a** user, **when I** invoke git_info with a dirty working tree, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0198 — git_info on a detached HEAD
**As a** user, **when I** invoke git_info with a detached HEAD, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0199 — git_info on no commits yet
**As a** user, **when I** invoke git_info with no commits yet, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0200 — git_info on no remote
**As a** user, **when I** invoke git_info with no remote, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0201 — git_info on a conflicted state
**As a** user, **when I** invoke git_info with a conflicted state, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0202 — git_info on a large diff
**As a** user, **when I** invoke git_info with a large diff, **I expect** the correct result or a graceful, non-crashing error.
- **Result:** TODO

### TC-GIT-0203 — Git panel at zoom 0.8
**As a** user, **when I** use Source Control at zoom 0.8, **I expect** rows, confirms and the commit box scale without clipping.
- **Result:** TODO

### TC-GIT-0204 — Git panel at zoom 1.0
**As a** user, **when I** use Source Control at zoom 1.0, **I expect** rows, confirms and the commit box scale without clipping.
- **Result:** TODO

### TC-GIT-0205 — Git panel at zoom 1.25
**As a** user, **when I** use Source Control at zoom 1.25, **I expect** rows, confirms and the commit box scale without clipping.
- **Result:** TODO

### TC-GIT-0206 — Git panel at zoom 1.5
**As a** user, **when I** use Source Control at zoom 1.5, **I expect** rows, confirms and the commit box scale without clipping.
- **Result:** TODO

### TC-GIT-0207 — Git panel at zoom 2.0
**As a** user, **when I** use Source Control at zoom 2.0, **I expect** rows, confirms and the commit box scale without clipping.
- **Result:** TODO
