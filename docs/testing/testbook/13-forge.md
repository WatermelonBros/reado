# 13 — Forge / PR Review

Hosting-forge integration via gh/glab. Entry: `forge.ts`, `PrSection`. PR-thread ops need a real PR.

**Cases: 50.**

---

### TC-FORGE-0001 — No remote → graceful
**As a** user, **when I** detect forge with no remote, **I expect** provider unknown, no adapter.
- **Result:** PASS

### TC-FORGE-0002 — Detect GitHub
**As a** user, **when I** have a github remote, **I expect** provider github, cli gh, hasAdapter.
- **Result:** PASS

### TC-FORGE-0003 — CLI presence
**As a** user, **when I** check for gh/glab, **I expect** a correct present/absent result.
- **Result:** PASS

### TC-FORGE-0004 — List PRs graceful
**As a** user, **when I** list PRs against an unreachable repo, **I expect** a graceful empty/error, no crash.
- **Result:** PASS

### TC-FORGE-0005 — List PRs real
**As a** user, **when I** have open PRs, **I expect** number/title/author/branch.
- **Result:** TODO

### TC-FORGE-0006 — Checkout a PR
**As a** user, **when I** open a PR for review, **I expect** its branch fetched + checked out.
- **Result:** TODO

### TC-FORGE-0007 — Pull review threads
**As a** user, **when I** pull a PR's threads, **I expect** them imported as comments (+ dropped count).
- **Result:** TODO

### TC-FORGE-0008 — Submit a batched review
**As a** user, **when I** submit, **I expect** one batched review with a verdict.
- **Result:** TODO

### TC-FORGE-0009 — Resolve thread mirrors
**As a** user, **when I** resolve a comment, **I expect** the host thread resolved.
- **Result:** TODO

### TC-FORGE-0010 — PR-scoped guided review
**As a** user, **when I** start a PR review, **I expect** a pr-scoped session.
- **Result:** TODO

### TC-FORGE-0011 — No console errors
**As a** user, **when I** detect/list, **I expect** no uncaught errors.
- **Result:** PASS

### TC-FORGE-0012 — detect on github
**As a** user, **when I** detect for a github remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0013 — list PRs on github
**As a** user, **when I** list PRs for a github remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0014 — checkout PR on github
**As a** user, **when I** checkout PR for a github remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0015 — pull threads on github
**As a** user, **when I** pull threads for a github remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0016 — submit review on github
**As a** user, **when I** submit review for a github remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0017 — resolve thread on github
**As a** user, **when I** resolve thread for a github remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0018 — detect on gitlab
**As a** user, **when I** detect for a gitlab remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0019 — list PRs on gitlab
**As a** user, **when I** list PRs for a gitlab remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0020 — checkout PR on gitlab
**As a** user, **when I** checkout PR for a gitlab remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0021 — pull threads on gitlab
**As a** user, **when I** pull threads for a gitlab remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0022 — submit review on gitlab
**As a** user, **when I** submit review for a gitlab remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0023 — resolve thread on gitlab
**As a** user, **when I** resolve thread for a gitlab remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0024 — detect on bitbucket
**As a** user, **when I** detect for a bitbucket remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0025 — list PRs on bitbucket
**As a** user, **when I** list PRs for a bitbucket remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0026 — checkout PR on bitbucket
**As a** user, **when I** checkout PR for a bitbucket remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0027 — pull threads on bitbucket
**As a** user, **when I** pull threads for a bitbucket remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0028 — submit review on bitbucket
**As a** user, **when I** submit review for a bitbucket remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0029 — resolve thread on bitbucket
**As a** user, **when I** resolve thread for a bitbucket remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0030 — detect on gitea
**As a** user, **when I** detect for a gitea remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0031 — list PRs on gitea
**As a** user, **when I** list PRs for a gitea remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0032 — checkout PR on gitea
**As a** user, **when I** checkout PR for a gitea remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0033 — pull threads on gitea
**As a** user, **when I** pull threads for a gitea remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0034 — submit review on gitea
**As a** user, **when I** submit review for a gitea remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0035 — resolve thread on gitea
**As a** user, **when I** resolve thread for a gitea remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0036 — detect on azuredevops
**As a** user, **when I** detect for a azuredevops remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0037 — list PRs on azuredevops
**As a** user, **when I** list PRs for a azuredevops remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0038 — checkout PR on azuredevops
**As a** user, **when I** checkout PR for a azuredevops remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0039 — pull threads on azuredevops
**As a** user, **when I** pull threads for a azuredevops remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0040 — submit review on azuredevops
**As a** user, **when I** submit review for a azuredevops remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0041 — resolve thread on azuredevops
**As a** user, **when I** resolve thread for a azuredevops remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0042 — detect on unknown
**As a** user, **when I** detect for a unknown remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0043 — list PRs on unknown
**As a** user, **when I** list PRs for a unknown remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0044 — checkout PR on unknown
**As a** user, **when I** checkout PR for a unknown remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0045 — pull threads on unknown
**As a** user, **when I** pull threads for a unknown remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0046 — submit review on unknown
**As a** user, **when I** submit review for a unknown remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0047 — resolve thread on unknown
**As a** user, **when I** resolve thread for a unknown remote, **I expect** the right adapter behaviour or a graceful unsupported.
- **Result:** TODO

### TC-FORGE-0048 — Submit verdict: approve
**As a** user, **when I** submit a review with verdict approve, **I expect** the verdict posted to the host.
- **Result:** TODO

### TC-FORGE-0049 — Submit verdict: request_changes
**As a** user, **when I** submit a review with verdict request_changes, **I expect** the verdict posted to the host.
- **Result:** TODO

### TC-FORGE-0050 — Submit verdict: comment
**As a** user, **when I** submit a review with verdict comment, **I expect** the verdict posted to the host.
- **Result:** TODO
