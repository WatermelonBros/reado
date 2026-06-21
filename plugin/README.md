# Reado agent plugin

Teaches an AI agent (Claude Code, Codex, …) the `reado` CLI contract so it can
resolve Reado tasks from the terminal. This is the agent side of the
read → annotate → AI-resolve loop.

## Prerequisite

Install the `reado` CLI onto your PATH (from the Reado repo):

```bash
pnpm cli:install      # builds release + links `reado` into ~/.local/bin
```

## Claude Code

Install the plugin in `plugin/reado/`:

- **Recommended (marketplace):** add this repo as a plugin marketplace and
  install `reado`:
  ```
  /plugin marketplace add WatermelonBros/reado
  /plugin install reado@reado
  ```
- **Manual:** symlink `plugin/reado` into your Claude Code plugins directory.

Once installed, Claude gains the `reado` skill (auto-activates in projects with a
`.reado/` folder) and the `/reado-review` command.

## Codex / Copilot / other agents

Codex and the GitHub Copilot CLI read `AGENTS.md`. Copy `plugin/reado/AGENTS.md`
into your project root (or append its contents to an existing `AGENTS.md`); for
Copilot you can also drop the same contract into `.github/copilot-instructions.md`.
Either way, Reado's **Send review** / **Audit** prompts already include the `reado`
commands inline, so any terminal agent can resolve tasks without extra setup.

## How Reado uses it

When you launch an agent from Reado's terminal, Reado sets `$READO_AGENT` so the
agent's comments and replies are attributed correctly. **Send review** then
injects a prompt telling the agent to fetch and resolve tasks with the CLI.
