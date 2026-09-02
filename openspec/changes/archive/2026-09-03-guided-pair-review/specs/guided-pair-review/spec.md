## ADDED Requirements

### Requirement: Start A Guided Review From A Scope

Reado SHALL let the user start a Guided Pair Review from a chosen scope — current
diff, branch vs main, a folder, selected files, open tasks/comments, or the whole
project (sampled progressively) — and an optional objective. A hosted PR/MR scope is
supplied by the `pull-request-review` adapter (which detects GitHub/GitLab/… from
the remote). Starting a review SHALL create a persistent session.

#### Scenario: Start from a scope

- **WHEN** the user starts a guided review choosing a scope (and optionally an objective)
- **THEN** Reado creates a review session scoped to it and enters the planning pass

#### Scenario: Whole project is sampled, not loaded at once

- **WHEN** the chosen scope is the whole project
- **THEN** Reado does not load the entire codebase at once; it works progressively

#### Scenario: Multiple entry points

- **WHEN** the user invokes "Start Guided Review" from the file tree, the diff view, a PR/MR review view, the command palette, the knowledge graph, or the terminal/agent panel
- **THEN** a guided review starts scoped appropriately to where it was launched

#### Scenario: Pick an objective

- **WHEN** the user starts a review
- **THEN** they may pick an objective — bug risk, design/API quality, maintainability, security, performance, test coverage, AI-generated-code sanity check, onboarding/comprehension, or general senior review — and it shapes the LLM's focus

### Requirement: Planning Pass Proposes A Route

The LLM SHALL run a light planning pass — reading metadata, diff, tree, symbols,
dependencies and existing comments — and propose an **ordered review route** that
groups related files and gives a one-line reason per step. The user SHALL be able
to accept, edit, or skip the proposed route.

#### Scenario: Route proposed with reasons

- **WHEN** the planning pass completes
- **THEN** an ordered list of files/groups is shown, each with a short reason, without a deep review yet

#### Scenario: User overrides the route

- **WHEN** the user edits or skips the proposed route
- **THEN** the session follows the user's choice, not the LLM's

#### Scenario: Route entries are structured and ranked

- **WHEN** the planning pass ranks files
- **THEN** each entry carries `{ file, priority, reason, suggested_review_mode, related_files }` (review mode ∈ quick / normal / deep) so the route can be sorted, filtered, and resumed

#### Scenario: Planning heuristics ground the ranking

- **WHEN** the LLM ranks what to review first
- **THEN** it weighs signals such as diff size and number of changed lines, file type and role (impl vs test vs config), imports/dependents, files that already carry comments/tasks, recency of change, symbols (LSP/tree-sitter) and knowledge-graph references — not an arbitrary order

### Requirement: File-By-File Pair Review

For the current file/group the LLM SHALL ask targeted questions and propose
comments anchored to specific lines; it SHALL NOT make any comment final on its
own. The user SHALL be able to approve, edit, mark as task or note, ask a
follow-up, jump to a related file, defer, or discard each proposal.

#### Scenario: LLM proposes, human disposes

- **WHEN** the LLM proposes a comment on a line during the review
- **THEN** it appears as a proposal the user can approve, edit, convert to task/note, defer, or discard — never auto-accepted

#### Scenario: Targeted questions, not generic ones

- **WHEN** the LLM guides the current file
- **THEN** its questions/observations are grounded in that file's code, not broad generic remarks

#### Scenario: Per-proposal actions

- **WHEN** the user acts on a single proposed comment
- **THEN** the available actions are: approve as-is, edit then approve, mark as task, mark as note, ask a follow-up question, jump to a related file, defer, or discard — and each updates the artifact's state

### Requirement: The Review Guide Panel

Alongside the code (which stays the hero), Reado SHALL show a **Review Guide**
panel for the active session that surfaces, without scraping the editor: the
current session and objective, the current file/group, the LLM's guidance and
targeted questions, the proposed next action, the route queue, open questions, the
current file's running summary, and session progress (files reviewed / remaining).
The panel SHALL expose the session's quick actions.

#### Scenario: Panel reflects session state

- **WHEN** a guided review is active
- **THEN** the Review Guide panel shows the current file/group, the LLM's guidance and questions, the proposed next action, the route queue, open questions, the file summary, and progress (reviewed vs remaining)

#### Scenario: Quick actions from the panel

- **WHEN** the user acts from the Review Guide panel
- **THEN** they can accept/edit a comment, create a task, ask why, open a related file, deep-dive, skip the file, mark it reviewed, change the route, ask a second opinion, and send confirmed tasks — without leaving the review

### Requirement: Durable Artifact Types

Beyond a comment's lifecycle state, a session SHALL record distinct artifact
**types**: anchored comment, task, note, question, session decision, follow-up
item, "needs context" marker, resolved false positive, file-level summary, and
session-level summary. Each type SHALL persist in the session and be attributable
to the human or the agent.

#### Scenario: A decision is recorded as its own artifact

- **WHEN** the user makes a judgment call during review (e.g. "intentional debt, leave it")
- **THEN** it is stored as a session decision artifact, distinct from a comment, and survives in session memory

#### Scenario: A "needs context" marker is captured

- **WHEN** the LLM cannot judge a line without more context
- **THEN** it records a "needs context" marker (rather than a confident comment) that the user can later resolve or expand

### Requirement: Dynamic Routing Under Human Control

During the session the LLM SHALL surface routing changes only as suggestions —
widen scope, narrow scope, deep-dive, a cross-cutting mini-review, or moving on —
and the user SHALL always control the next step (continue, skip, deep dive, widen,
narrow, stop, send tasks, summarize).

#### Scenario: LLM suggests widening, user decides

- **WHEN** the LLM suggests widening the scope (e.g. "review the whole auth subsystem")
- **THEN** the change happens only if the user accepts it

#### Scenario: User stops at any time

- **WHEN** the user chooses to stop the session
- **THEN** the session ends with its current state and summary preserved

### Requirement: Review Artifacts Are Durable With Explicit State

Every LLM-generated review artifact SHALL be a durable Reado artifact carrying an
explicit state: proposed, accepted, edited, discarded, converted_to_task,
converted_to_note, or resolved_as_false_positive. Discarded/false-positive
artifacts SHALL remain in session memory.

#### Scenario: Approve a proposal into a real comment

- **WHEN** the user approves (or edits then approves) a proposed comment
- **THEN** it becomes a durable anchored Reado comment/task and the artifact's state reflects that

#### Scenario: A dismissed finding is remembered

- **WHEN** the user resolves a proposal as a false positive
- **THEN** it is kept as session memory (e.g. "checked — fine because convention X"), not silently dropped

### Requirement: Persistent, Resumable Sessions

Reado SHALL persist each session under `.reado/sessions/` (scope, route, per-file
status, created artifacts, decisions, open questions, summaries). A session SHALL
be resumable later without losing context.

#### Scenario: Per-file status tracked

- **WHEN** the user reviews, skips, or defers files
- **THEN** each file's status (not_started / queued / in_review / reviewed / needs_followup / skipped / blocked / out_of_scope) is recorded in the session

#### Scenario: Resume a session

- **WHEN** the user resumes a saved session
- **THEN** the route, per-file status, decisions and summaries are restored and the review continues

### Requirement: Session Memory And Summaries

At the end of each file Reado SHALL capture a mini-summary (what was checked, what
was decided, comments created, remaining risks, dependents, recommended next), and
the session SHALL have an overall summary. Summaries SHALL be available to resume
the session and MAY feed the knowledge graph and future reviews.

#### Scenario: Per-file summary on completion

- **WHEN** the user finishes a file
- **THEN** a mini-summary is generated/captured and stored in the session

#### Scenario: Session-level recap

- **WHEN** the user asks to summarize the session
- **THEN** Reado reports what has been reviewed, what's decided, and what high-risk files remain

#### Scenario: Resume verbs

- **WHEN** the user returns to a session
- **THEN** they can ask Reado to "continue last guided review", "show reviewed files", "show remaining high-risk files", "summarize what we found so far", "send only confirmed tasks", or "ask a second agent to challenge this review" — each acting on the persisted session

### Requirement: Controlled Context Expansion

The session SHALL load context progressively (overview → current file → selected
related files → relevant comments/docs/specs → wider subsystem only on explicit
ask). The LLM SHALL prefer asking for context over assuming, and an explicit
"Widen Review" action SHALL allow a larger pass when useful.

#### Scenario: Small by default

- **WHEN** the LLM reviews the current file
- **THEN** it does not pull in the whole repository unless the user (or an accepted widen) asks

#### Scenario: Explicit big pass

- **WHEN** the user invokes "Widen Review" (e.g. review the whole subsystem, compare with specs, run tests)
- **THEN** the larger context is loaded for that pass

#### Scenario: Big-pass actions are enumerated

- **WHEN** the user opens the "Widen Review" / Big Pass options
- **THEN** the available passes include: review the whole subsystem, review all files in the route so far, compare the change with specs/docs, scan for a repeated pattern across the codebase, run tests/typecheck and react to the results, search for similar code, and ask a second agent for a critique

#### Scenario: No broad generic comments by default

- **WHEN** the LLM has no grounded observation for the current file
- **THEN** it does not emit a broad generic comment; it stays silent, asks a question, or records a "needs context" marker, preserving uncertainty instead of inventing findings

### Requirement: Second-Agent Challenge

The session SHALL let the user invoke a **second agent** to challenge the review —
either to critique the current file/findings (a contrarian second opinion) or, after
fixes, to review the proposed changes. The second agent's output SHALL be surfaced
as proposals/questions the user disposes of, never as auto-accepted verdicts.

#### Scenario: Challenge the current review

- **WHEN** the user asks a second agent to challenge the review
- **THEN** Reado runs a second pass that critiques or contradicts the current findings, and its remarks appear as proposals the user can accept, edit, or discard

#### Scenario: Second opinion on the fixes

- **WHEN** the agent has applied fixes and the user asks a second agent to review them
- **THEN** that review is run and its findings re-enter the session as proposals, not as a silent merge

### Requirement: CLI Session And Review Contract

The `reado` CLI SHALL expose the session as structured commands so the agent gets
context without scraping UI state — at least: create/list/show/plan/next/status,
update a file's state, add a decision, summarize, and close a session; plus
agent-facing review commands (plan, next, context, propose-comment,
propose-route-change, summarize-file).

#### Scenario: Agent reads structured context

- **WHEN** the agent needs the next step or a file's context during a session
- **THEN** it can get it through `reado session`/`reado review` commands rather than reading the UI

#### Scenario: Session lifecycle via CLI

- **WHEN** a session is created, advanced, and closed via the CLI
- **THEN** the persisted session reflects each change

### Requirement: Integrate With The Resolve Loop

A Guided Pair Review SHALL feed the resolve loop (`async-review-loop`): at any point
the user SHALL be able to send only the confirmed tasks to the agent, keep reviewing
before sending, and resume the session after the agent's fixes. The resolve loop
SHALL remain a separate capability; guided review sits before and around it.

#### Scenario: Send confirmed tasks only

- **WHEN** the user chooses to send tasks to the agent mid-session
- **THEN** only the accepted tasks from the session are dispatched, via the existing flow

#### Scenario: Resume after fixes

- **WHEN** the agent has resolved the sent tasks
- **THEN** the user can resume the guided review on the changed files

#### Scenario: Resolve-handoff options

- **WHEN** the user reaches the resolve handoff
- **THEN** the options include: send confirmed tasks now, keep reviewing before sending, create an implementation batch, ask the agent to fix only this session's tasks, and ask a second agent to review the proposed fixes

#### Scenario: Export the session as a review summary

- **WHEN** the user asks to export the session
- **THEN** Reado produces a PR/MR-review-style summary (verdict, confirmed comments/tasks, decisions, remaining risks) that `pull-request-review` can submit to the host, or that the user can copy out
