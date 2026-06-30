# 7 — Guided Review

Paired review sessions. `.reado/sessions/<id>.json`. Route + comment-proposals are produced by the terminal AI agent. Entry: `GuidedReviewPanel.tsx`, `crates/reado-core/session.rs`.

**Cases: 82.**

---

### TC-GR-0001 — Objective selector
**As a** user, **when I** open the empty panel, **I expect** an objective picker (default Bug risk).
- **Result:** PASS

### TC-GR-0002 — Start a diff review
**As a** user, **when I** click "Revisiona le modifiche correnti", **I expect** a session scoped to the diff (status planning).
- **Result:** PASS

### TC-GR-0003 — Planning state UI
**As a** user, **when I** have a planning session, **I expect** a clear waiting state + progress + Close.
- **Result:** PASS

### TC-GR-0004 — Set a file state
**As a** user, **when I** mark a file reviewed/skipped/etc, **I expect** the state tracked + persisted.
- **Result:** PASS

### TC-GR-0005 — Record a decision
**As a** user, **when I** add a decision, **I expect** a decision artifact on the session.
- **Result:** PASS

### TC-GR-0006 — Session summary
**As a** user, **when I** set a session summary, **I expect** it saved.
- **Result:** PASS

### TC-GR-0007 — Discard a proposal
**As a** user, **when I** discard a proposal, **I expect** its state → discarded.
- **Result:** PASS

### TC-GR-0008 — Accept comment proposal → comment
**As a** user, **when I** accept a comment proposal, **I expect** a durable .md created.
- **Result:** AGENT-REQUIRED

### TC-GR-0009 — Close a session
**As a** user, **when I** close a session, **I expect** status → done (in history).
- **Result:** PASS

### TC-GR-0010 — Discard a session
**As a** user, **when I** discard a session, **I expect** it removed; accepted comments untouched.
- **Result:** TODO

### TC-GR-0011 — No console errors
**As a** user, **when I** create/transition/close, **I expect** no uncaught errors.
- **Result:** PASS

### TC-GR-0012 — Session: diff scope, bug_risk
**As a** user, **when I** start a diff-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0013 — Session: diff scope, design
**As a** user, **when I** start a diff-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0014 — Session: diff scope, maintainability
**As a** user, **when I** start a diff-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0015 — Session: diff scope, security
**As a** user, **when I** start a diff-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0016 — Session: diff scope, performance
**As a** user, **when I** start a diff-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0017 — Session: diff scope, test_coverage
**As a** user, **when I** start a diff-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0018 — Session: diff scope, ai_sanity
**As a** user, **when I** start a diff-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0019 — Session: diff scope, onboarding
**As a** user, **when I** start a diff-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0020 — Session: diff scope, general
**As a** user, **when I** start a diff-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** PASS (diff)

### TC-GR-0021 — Session: branch scope, bug_risk
**As a** user, **when I** start a branch-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0022 — Session: branch scope, design
**As a** user, **when I** start a branch-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0023 — Session: branch scope, maintainability
**As a** user, **when I** start a branch-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0024 — Session: branch scope, security
**As a** user, **when I** start a branch-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0025 — Session: branch scope, performance
**As a** user, **when I** start a branch-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0026 — Session: branch scope, test_coverage
**As a** user, **when I** start a branch-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0027 — Session: branch scope, ai_sanity
**As a** user, **when I** start a branch-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0028 — Session: branch scope, onboarding
**As a** user, **when I** start a branch-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0029 — Session: branch scope, general
**As a** user, **when I** start a branch-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0030 — Session: folder scope, bug_risk
**As a** user, **when I** start a folder-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0031 — Session: folder scope, design
**As a** user, **when I** start a folder-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0032 — Session: folder scope, maintainability
**As a** user, **when I** start a folder-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0033 — Session: folder scope, security
**As a** user, **when I** start a folder-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0034 — Session: folder scope, performance
**As a** user, **when I** start a folder-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0035 — Session: folder scope, test_coverage
**As a** user, **when I** start a folder-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0036 — Session: folder scope, ai_sanity
**As a** user, **when I** start a folder-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0037 — Session: folder scope, onboarding
**As a** user, **when I** start a folder-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0038 — Session: folder scope, general
**As a** user, **when I** start a folder-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0039 — Session: files scope, bug_risk
**As a** user, **when I** start a files-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0040 — Session: files scope, design
**As a** user, **when I** start a files-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0041 — Session: files scope, maintainability
**As a** user, **when I** start a files-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0042 — Session: files scope, security
**As a** user, **when I** start a files-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0043 — Session: files scope, performance
**As a** user, **when I** start a files-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0044 — Session: files scope, test_coverage
**As a** user, **when I** start a files-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0045 — Session: files scope, ai_sanity
**As a** user, **when I** start a files-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0046 — Session: files scope, onboarding
**As a** user, **when I** start a files-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0047 — Session: files scope, general
**As a** user, **when I** start a files-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0048 — Session: comments scope, bug_risk
**As a** user, **when I** start a comments-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0049 — Session: comments scope, design
**As a** user, **when I** start a comments-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0050 — Session: comments scope, maintainability
**As a** user, **when I** start a comments-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0051 — Session: comments scope, security
**As a** user, **when I** start a comments-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0052 — Session: comments scope, performance
**As a** user, **when I** start a comments-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0053 — Session: comments scope, test_coverage
**As a** user, **when I** start a comments-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0054 — Session: comments scope, ai_sanity
**As a** user, **when I** start a comments-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0055 — Session: comments scope, onboarding
**As a** user, **when I** start a comments-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0056 — Session: comments scope, general
**As a** user, **when I** start a comments-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0057 — Session: project scope, bug_risk
**As a** user, **when I** start a project-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0058 — Session: project scope, design
**As a** user, **when I** start a project-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0059 — Session: project scope, maintainability
**As a** user, **when I** start a project-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0060 — Session: project scope, security
**As a** user, **when I** start a project-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0061 — Session: project scope, performance
**As a** user, **when I** start a project-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0062 — Session: project scope, test_coverage
**As a** user, **when I** start a project-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0063 — Session: project scope, ai_sanity
**As a** user, **when I** start a project-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0064 — Session: project scope, onboarding
**As a** user, **when I** start a project-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0065 — Session: project scope, general
**As a** user, **when I** start a project-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0066 — Session: pr scope, bug_risk
**As a** user, **when I** start a pr-scoped review with objective bug_risk, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0067 — Session: pr scope, design
**As a** user, **when I** start a pr-scoped review with objective design, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0068 — Session: pr scope, maintainability
**As a** user, **when I** start a pr-scoped review with objective maintainability, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0069 — Session: pr scope, security
**As a** user, **when I** start a pr-scoped review with objective security, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0070 — Session: pr scope, performance
**As a** user, **when I** start a pr-scoped review with objective performance, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0071 — Session: pr scope, test_coverage
**As a** user, **when I** start a pr-scoped review with objective test_coverage, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0072 — Session: pr scope, ai_sanity
**As a** user, **when I** start a pr-scoped review with objective ai_sanity, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0073 — Session: pr scope, onboarding
**As a** user, **when I** start a pr-scoped review with objective onboarding, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0074 — Session: pr scope, general
**As a** user, **when I** start a pr-scoped review with objective general, **I expect** a session created with that scope+objective.
- **Result:** AGENT/TODO

### TC-GR-0075 — File state → not_started
**As a** user, **when I** set a route file to not_started, **I expect** the state persisted and reflected.
- **Result:** TODO

### TC-GR-0076 — File state → queued
**As a** user, **when I** set a route file to queued, **I expect** the state persisted and reflected.
- **Result:** TODO

### TC-GR-0077 — File state → in_review
**As a** user, **when I** set a route file to in_review, **I expect** the state persisted and reflected.
- **Result:** PASS

### TC-GR-0078 — File state → reviewed
**As a** user, **when I** set a route file to reviewed, **I expect** the state persisted and reflected.
- **Result:** TODO

### TC-GR-0079 — File state → needs_followup
**As a** user, **when I** set a route file to needs_followup, **I expect** the state persisted and reflected.
- **Result:** TODO

### TC-GR-0080 — File state → skipped
**As a** user, **when I** set a route file to skipped, **I expect** the state persisted and reflected.
- **Result:** TODO

### TC-GR-0081 — File state → blocked
**As a** user, **when I** set a route file to blocked, **I expect** the state persisted and reflected.
- **Result:** TODO

### TC-GR-0082 — File state → out_of_scope
**As a** user, **when I** set a route file to out_of_scope, **I expect** the state persisted and reflected.
- **Result:** TODO
