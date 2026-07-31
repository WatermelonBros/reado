## ADDED Requirements

### Requirement: Launch Agent
Reado SHALL provide an action to launch an AI agent (Claude Code or Codex) into a terminal tab. Launching the agent and sending a review SHALL be two separate actions.

#### Scenario: Launch into terminal
- **WHEN** the user clicks launch for an agent
- **THEN** the agent starts in a terminal tab, ready to receive input

### Requirement: Reado CLI Contract
Reado SHALL provide a `reado` CLI as the stable contract between agents and the annotation store, exposing at least: `task list`, `task show`, `task done`, `task fail`, `task link`, `comment add`, `comment reply`, `comment search`. The CLI SHALL read and write the `.md` store; the internal schema MAY evolve behind it.

#### Scenario: Agent lists tasks
- **WHEN** an agent runs `reado task list`
- **THEN** it receives the open tasks with their ids, anchors, and snippets

#### Scenario: Agent marks a task done
- **WHEN** an agent runs `reado task done <id>`
- **THEN** the task's state becomes done and its file is archived

### Requirement: Plugin Installation and Update
Reado SHALL package the CLI and operating instructions as a plugin for Claude Code (and a Codex equivalent), installing and updating it automatically on first launch.

#### Scenario: Auto-install on first launch
- **WHEN** Reado launches and the plugin is missing or outdated
- **THEN** Reado installs or updates it without manual setup

### Requirement: Context Injection on Launch
On each agent launch, Reado SHALL ensure the agent has the operating context (how to read tasks and use the CLI) so it can proceed even without prior setup.

#### Scenario: Context guaranteed
- **WHEN** an agent is launched in a project
- **THEN** the agent has the context needed to find tasks and use the `reado` CLI

### Requirement: Send Review Batch
"Send review" SHALL inject a command into the active agent's terminal referencing a batch of tasks. By default the batch SHALL include all open task-flagged comments, with the ability to deselect items before sending.

#### Scenario: Send all open tasks
- **WHEN** the user sends a review without deselecting
- **THEN** the agent receives a prompt referencing all open task comments

#### Scenario: Deselect before sending
- **WHEN** the user deselects some tasks before sending
- **THEN** the injected batch excludes the deselected tasks

### Requirement: Send Single Task
Reado SHALL allow sending a single task immediately, in addition to batch review.

#### Scenario: Send just this one
- **WHEN** the user chooses "send just this now" on a task
- **THEN** only that task is injected to the agent

### Requirement: Agent Task Completion
When the agent completes a task via the CLI, Reado SHALL reflect the new state in the UI through the watcher, and the agent MAY post a note in the thread describing what changed.

#### Scenario: UI reflects completion
- **WHEN** an agent marks a task done via the CLI
- **THEN** the watcher detects the change and the UI updates the comment to done

### Requirement: Agent Failure Handling
When the agent fails or is interrupted on a task, the comment SHALL return to the open state with an error note recorded in its thread.

#### Scenario: Task fails
- **WHEN** an agent runs `reado task fail <id>` or a run is cancelled mid-task
- **THEN** the comment returns to open with an error note in the thread

### Requirement: Non-Blocking Runs
While an agent works on a batch, the user SHALL be able to continue reading and commenting; new comments join the next batch, and the in-progress run SHALL be cancellable.

#### Scenario: Continue during a run
- **WHEN** an agent is processing a batch
- **THEN** the user can read and create comments
- **AND** can cancel the running batch

### Requirement: Multi-Agent Selection
Reado SHALL support multiple agent terminal tabs, and when sending a review SHALL let the user choose which agent receives it. A default agent SHALL be configurable per project with a global fallback.

#### Scenario: Choose target agent
- **WHEN** more than one agent tab is open and the user sends a review
- **THEN** Reado asks which agent should receive the batch

### Requirement: Cross-Review Between AIs
Reado SHALL allow an AI agent to create comments on code or on another AI's work via the CLI, with the comment attributed to the originating agent's identity.

#### Scenario: One AI reviews another
- **WHEN** an agent uses `reado comment add` to comment on another agent's change
- **THEN** a comment is created attributed to that agent's identity
