## ADDED Requirements

### Requirement: Start A Guided Review From A Scope

Reado SHALL let the user start a Guided Pair Review from a chosen scope — current
diff, branch vs main, a local/remote PR, a folder, selected files, open
tasks/comments, or the whole project (sampled progressively) — and an optional
objective. Starting it SHALL create a persistent session.

#### Scenario: Start from a scope

- **WHEN** the user starts a guided review choosing a scope (and optionally an objective)
- **THEN** Reado creates a review session scoped to it and enters the planning pass

#### Scenario: Whole project is sampled, not loaded at once

- **WHEN** the chosen scope is the whole project
- **THEN** Reado does not load the entire codebase at once; it works progressively

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

### Requirement: Integrate With The Existing Resolve Loop

A Guided Pair Review SHALL feed the existing AI-resolve loop: at any point the user
SHALL be able to send only the confirmed tasks to the agent, keep reviewing before
sending, and resume the session after the agent's fixes. The existing loop SHALL
remain intact; guided review sits before and around it.

#### Scenario: Send confirmed tasks only

- **WHEN** the user chooses to send tasks to the agent mid-session
- **THEN** only the accepted tasks from the session are dispatched, via the existing flow

#### Scenario: Resume after fixes

- **WHEN** the agent has resolved the sent tasks
- **THEN** the user can resume the guided review on the changed files
