# guided-pair-review Specification

## Purpose
TBD - created by archiving change guided-pair-review. Update Purpose after archive.
## Requirements
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

The planning request SHALL carry the session's objective, so what the agent looks
for and how deeply it reads are shaped by what the user asked for.

The route SHALL be ordered for the reader's comprehension: a review is a reading
task, and a queue sorted by risk alone drops the reviewer into the middle of a
change with no context. Risk SHALL order files within that reading rather than
replace it.

Where Reado can know the scope's file set without an LLM — the working tree's
changes, or a branch range — it SHALL capture that set on the session
(`expectedFiles`) when the session is created, and SHALL state it in the planning
request. Untracked files are part of that set. For a scope Reado cannot enumerate
— a hosted PR, whose change lives in git refs, or a free-text request — the set
stays empty and the agent derives its own.

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

#### Scenario: The route is a reading order

- **WHEN** the planning pass orders the route
- **THEN** it starts where the change starts (the file carrying its intent, or the spec/doc/test that states it), continues in the order that makes each next file make sense (definition before use, producer before consumer, the changed function before its callers), keeps files that must be read together adjacent and names them in `related_files`, and leaves what carries no understanding — generated output, lockfiles, snapshots, mechanical renames — for last

#### Scenario: Risk orders within the reading, not across it

- **WHEN** two files are equally ready to be read
- **THEN** the riskier one comes first; risk does not reorder the reading itself

#### Scenario: A reason explains the position, not only the importance

- **WHEN** a route entry is emitted
- **THEN** its reason says what the reader already knows by the time they reach that file, not only why the file matters

#### Scenario: Depth is chosen, and some files are not read closely

- **WHEN** the planning pass sets a file's review mode
- **THEN** it is `deep` for the logic the change turns on and for money, security, data and error paths, `normal` for ordinary edits, and `quick` for mechanical or generated ones — and a purely mechanical change may instead be declared out of scope with a reason, because covering the scope means every file is accounted for, not that every file is read closely

#### Scenario: The objective shapes the route

- **WHEN** the user starts a review with an objective
- **THEN** the planning request names that objective and the ranking reflects it

#### Scenario: Reado states the file set it already knows

- **WHEN** the scope is the current diff or a branch range
- **THEN** the session records those files — untracked ones included — and the planning request lists them instead of asking the agent to rediscover them

#### Scenario: A scope Reado cannot enumerate

- **WHEN** the scope is a hosted PR or a free-text request
- **THEN** no file set is asserted, and the agent derives the files itself from the PR's refs or from the request

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

A proposed route change SHALL be held on the session with its reason until the
user accepts or discards it, and SHALL NOT take effect before that. Once a route
exists, an attempt to set a new one outright SHALL be refused and directed to the
proposal verb, so an approved route is never replaced without the user.

#### Scenario: LLM suggests widening, user decides

- **WHEN** the LLM suggests widening the scope (e.g. "review the whole auth subsystem")
- **THEN** the change happens only if the user accepts it

#### Scenario: User stops at any time

- **WHEN** the user chooses to stop the session
- **THEN** the session ends with its current state and summary preserved

#### Scenario: The proposal explains itself

- **WHEN** a route change is shown
- **THEN** the panel states, in its own voice and next to the two controls, that the agent is proposing a different review order and that nothing changes until the user chooses

#### Scenario: A route change is proposed, not applied

- **WHEN** the agent proposes a route change during a session
- **THEN** the session keeps the current route, records the proposal with its reason, and shows it to the user as accept-or-discard

#### Scenario: Accepting a route change

- **WHEN** the user accepts a proposed route change
- **THEN** the proposed route becomes the session's route, any newly routed file is queued, and the proposal is cleared

#### Scenario: Re-planning an approved route is refused

- **WHEN** the agent sets a route on a session that already has one
- **THEN** the call fails with an error naming the route-change proposal verb, and the existing route is unchanged

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

The session SHALL also record the scope's expected file set where known, and any
pending route-change proposal, so both survive a restart and are visible to the
agent through the same read verbs as the rest of the session.

#### Scenario: Per-file status tracked

- **WHEN** the user reviews, skips, or defers files
- **THEN** each file's status (not_started / queued / in_review / reviewed / needs_followup / skipped / blocked / out_of_scope) is recorded in the session

#### Scenario: Resume a session

- **WHEN** the user resumes a saved session
- **THEN** the route, per-file status, decisions and summaries are restored and the review continues

#### Scenario: A pending route change survives a restart

- **WHEN** a route change is proposed and Reado is restarted before the user disposes of it
- **THEN** the proposal is still pending, with its reason, when the session is reopened

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

Because a route is structured data and a terminal prompt is a single line of
text, the same verbs SHALL also be available as MCP tools with typed arguments,
and the MCP server's instructions SHALL state the guided-review contract — that
channel reaches every MCP-speaking agent, whereas a system-prompt flag reaches
only one vendor's CLI. For agents without MCP, the CLI SHALL accept a route from
stdin or a file as well as from an argument, so a quoting accident cannot silently
lose a plan.

#### Scenario: Agent reads structured context

- **WHEN** the agent needs the next step or a file's context during a session
- **THEN** it can get it through `reado session`/`reado review` commands rather than reading the UI

#### Scenario: Session lifecycle via CLI

- **WHEN** a session is created, advanced, and closed via the CLI
- **THEN** the persisted session reflects each change

#### Scenario: The same verbs over MCP

- **WHEN** an agent is connected to Reado's MCP server
- **THEN** it can show a session, read a file's context, set or propose a route, propose comments and questions, and record summaries as tools with typed arguments, without composing a shell command

#### Scenario: Every agent is told the contract

- **WHEN** any MCP-speaking agent connects
- **THEN** the server's instructions describe the guided-review loop (propose, never accept; the human disposes), independently of the agent's vendor

#### Scenario: A route too large or too quoted for an argument

- **WHEN** the agent passes `-` or `@<path>` as the route
- **THEN** the CLI reads the route JSON from stdin or that file

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

### Requirement: Route Coverage Is Verified

When the session knows the scope's file set, Reado SHALL compare the proposed
route against it and report every expected file the route leaves out — to the
agent, in the answer to the call that set the route, and to the user in the Review
Guide panel. A route SHALL NOT be rejected for being incomplete: the gap is
reported, not enforced.

An expected file is covered when it appears in the route, or when its per-file
state says it was deliberately left out (`out_of_scope` or `skipped`). Declaring a
file out of scope is therefore an answer; omitting it silently is not.

#### Scenario: The agent is told what it missed

- **WHEN** the agent sets a route that omits files from the session's expected set
- **THEN** the call succeeds and its result names the omitted files, so the agent can route them or declare them out of scope

#### Scenario: The user sees the gap

- **WHEN** a session's route omits expected files
- **THEN** the Review Guide panel shows those files, each openable, and offers to ask the agent to route them

#### Scenario: A deliberate omission is not a gap

- **WHEN** the agent marks an expected file `out_of_scope` (or the user skips it)
- **THEN** it is no longer reported as missing

#### Scenario: Nothing is asserted without a known set

- **WHEN** the session has no expected file set (a PR or a free-text request)
- **THEN** no coverage gap is reported for it

### Requirement: The Hand-Off Is Visible And Fallible

Reado does not run the model: a guided-review action composes a prompt and hands
it to the terminal agent. The Review Guide SHALL show which of the three states
that hand-off is in — being sent, sent and awaiting the agent, or failed — and
SHALL attribute it to the action that started it rather than to the panel as a
whole. A hand-off that could not be delivered, and any session operation that
fails, SHALL be reported in the panel with what failed and why; neither may be
swallowed.

Because the work then happens outside Reado, the waiting state SHALL end on the
only evidence Reado has: the session changing under the agent's hands.

#### Scenario: Sending, then waiting

- **WHEN** the user starts a review action
- **THEN** the panel shows that the prompt is being sent, then that it is waiting on the agent, and stops waiting when the session next changes

#### Scenario: There is no agent to send to

- **WHEN** the prompt cannot be delivered (no agent is running and none can be started)
- **THEN** the panel says so, and the action is not left looking as though it had been sent

#### Scenario: A failed session operation is reported

- **WHEN** accepting a proposal, changing a file's state, or any other session write fails
- **THEN** the panel shows what failed and the underlying reason, and the user can dismiss it

### Requirement: Destructive Review Actions Are Confirmed

Deleting a review session, discarding every open proposal on a file at once, and
abandoning an edit in progress SHALL each require a second, deliberate press
that states what is about to be lost. Accepting a route change that would drop
files carrying findings SHALL be confirmed the same way, naming how many findings
go with them; a route change that only adds files SHALL NOT be.

#### Scenario: Deleting the session

- **WHEN** the user presses the control that deletes the review
- **THEN** it asks first, and only a second press deletes it

#### Scenario: A route change that costs findings

- **WHEN** the proposed route drops a file that already carries proposals
- **THEN** the panel names that file with its number of findings, and accepting takes a second press

#### Scenario: A route change that only adds

- **WHEN** the proposed route drops nothing
- **THEN** accepting it takes one press
