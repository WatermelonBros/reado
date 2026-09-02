## ADDED Requirements

### Requirement: Capture the resolving change

When an agent marks a task done, Reado SHALL be able to capture the change that
resolved it (a diff or commit range) and attach it to the comment thread, so a
resolved task records what changed rather than only that it closed. Capture SHALL
be optional and degrade gracefully when no change is available.

#### Scenario: Resolved task shows its diff

- **WHEN** the agent runs `reado task done <id>` after editing code and the
  capture is available
- **THEN** the resolved thread carries the resolving diff/commit reference, viewable
  in the comment history

#### Scenario: No diff available

- **WHEN** there is no captured change (e.g. the resolution was a discussion)
- **THEN** the task still resolves normally without a diff attached

### Requirement: Optional verification gate

Reado SHALL support `reado task done --verify "<cmd>"`, running the command,
recording its pass/fail outcome on the thread, and marking a task
resolved-but-unverified when the command fails, distinctly from a clean resolve.

#### Scenario: Verify passes

- **WHEN** the agent resolves with `--verify` and the command exits zero
- **THEN** the task is marked resolved and the thread records the verification
  passed

#### Scenario: Verify fails

- **WHEN** the verify command exits non-zero
- **THEN** the task is recorded as resolved-but-unverified with the failure, and
  the UI surfaces it distinctly rather than as a clean resolve

### Requirement: MCP tools for the resolve verbs

Reado's MCP server SHALL expose the core resolve verbs (`task done`, `task fail`,
`comment add`, `comment reply`) as callable tools returning a structured result,
so an MCP-capable agent resolves through a structured channel rather than the PTY
paste. The PTY path SHALL remain for agents without MCP.

#### Scenario: Agent resolves via MCP tool

- **WHEN** an MCP-capable agent calls the `task done` tool
- **THEN** the task resolves and the tool returns a structured result Reado can
  act on, with no reliance on scraping terminal output

#### Scenario: Non-MCP agent still works

- **WHEN** an agent without MCP support is used
- **THEN** the existing pasted-prompt + `reado` CLI path resolves tasks as before

### Requirement: Resolution provenance

Reado SHALL record which agent and model resolved each task on the thread, so the
knowledge base has an honest audit trail beyond a free-text agent string.

#### Scenario: Provenance recorded

- **WHEN** a task is resolved by an agent
- **THEN** the thread records the resolving agent and model identifier
