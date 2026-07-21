<h1 align="center">Reado</h1>

<p align="center"><em>A calm place to read code.</em></p>

<p align="center"><a href="https://reado.watermelon-studio.it"><strong>reado.watermelon-studio.it</strong></a> · <a href="https://discord.gg/HHqT9ucXn4"><strong>Discord</strong></a></p>

Most IDEs are built for **writing** code. Reado inverts that: the primary
experience is **reading**, and the primary action is leaving durable comments
anchored to precise points in the code. Those comments are not throwaway notes —
they are persistent, lifecycle-bearing artifacts that an AI agent (Claude Code,
Codex or Copilot) resolves, and that accumulate into a consultable knowledge base.

> The mental model is an **inverted code review**: you are the reviewer (read,
> annotate), the AI is the committer (implements the fixes).

Reado is built with [Tauri 2](https://tauri.app), React 19 and a Rust backend.
It runs on macOS, Linux and Windows.

## Download

Grab the latest signed build for your platform from the
[**Releases**](https://github.com/WatermelonBros/reado/releases/latest) page —
macOS (`.dmg`, signed & notarized), Linux (`.AppImage` / `.deb` / `.rpm`) and
Windows (`.exe` / `.msi`). Reado updates itself from signed releases after that.

## Status

Reado is in active development. The current focus is the **read → annotate →
AI-resolve** loop. See [`openspec/changes/add-reado-mvp`](openspec/changes/add-reado-mvp)
for the full specification and the sequenced task list.

What works today:

- Open any local folder (git repository or not) from a recent-projects launcher.
- Gitignore-aware file tree with a "show hidden" toggle.
- A read-first CodeMirror 6 viewer with broad syntax highlighting, large-file
  virtualization, a line-wrap toggle, comfortable reading width, and a soft
  landing highlight when you jump to a location.
- Dedicated rendering for markdown, images and foldable JSON.
- Fuzzy file open (`Cmd/Ctrl+P`), full-text project search (ripgrep when
  present, with a built-in pure-Rust fallback), and a command palette
  (`Cmd/Ctrl+K`).
- Code reading aids: an outline of file symbols, sticky scope headers,
  go-to-definition (`Cmd/Ctrl+click` / `F12`), go-to-line, and Format Document
  through the project's own formatters (Biome/Prettier/rustfmt/…).
- Git introspection with stage/unstage/discard/commit, inline blame, and a
  local diff view.
- Four research-grounded themes (dark, light, high-contrast, sepia) with manual,
  follow-system, and time-of-day selection.
- Italian and English UI.
- Anchored comments as an external overlay: leave a comment on a line range
  (hover the `+` or press the shortcut), with types, states, task/note, threads,
  and a gutter marker. Comments are stored as `.md` files under `.reado/` and
  survive external edits (git-diff-free fuzzy re-anchoring; orphans never point
  at the wrong line).
- An integrated terminal (real PTYs, multiple tabs) with one-click launch of
  `claude`, `codex` and `copilot`, and **Send review** to hand your open tasks to
  the agent.
- A knowledge base unifying the project's **docs**, **specs** (OpenSpec /
  speckit), and the **notes** captured while reading, with full-text search and
  a knowledge graph linking comments, files, specs and docs.
- An **MCP server** and a **`reado` CLI** — how agents reach Reado. The MCP
  server (auto-wired into each agent) exposes your tasks, comments, reading
  progress and bookmarks as read-only context, plus `browser_*` tools to inspect
  and drive the in-app browser preview; the CLI is how the agent *acts* —
  resolving tasks, consulting the knowledge base, proposing review artifacts.
  Both are the same `reado` binary, which **must be on the agent's `PATH`**.

## The AI loop

Reado's core loop is **read → annotate → AI-resolve**:

1. You read code and leave comments. Comments flagged as **tasks** are the work
   list; **notes** stay out of the agent's way.
2. Open the terminal (`Cmd/Ctrl+J`), launch **Claude**, **Codex** or **Copilot**,
   then click **Send review**. Reado injects a prompt pointing the agent at your
   open tasks.
3. The agent reads your tasks and comments — from the `reado://tasks` and
   `reado://comments` MCP resources, or `reado task list` — makes the changes,
   and marks each done with `reado task done <id>` (or `reado task fail <id>
   "<reason>"`). Reado's watcher reflects the result live, and resolved comments
   move to history.

The `reado` binary is the stable contract — the on-disk format can evolve without
breaking the agents. It serves both the **MCP server** (`reado mcp`, auto-wired
into each agent's config on project open) and the **CLI** the agent calls, so it
must be on the agent's `PATH` for the AI loop to work. The packaged app bundles
it: install from **Settings → Command-line tool** (links `reado` into
`~/.local/bin`, VS Code style). From a source checkout, build and link it
directly:

```bash
scripts/install-cli.sh           # builds release + links into ~/.local/bin
reado --help
```

Actions (CLI): `reado task list|show|done|fail|link`,
`reado comment add|reply|search`, and `reado kb list|show|search` (to consult
the docs and specs before resolving). Context (MCP): the `reado://tasks`,
`reado://comments`, `reado://reading-progress` and `reado://bookmarks` resources,
plus `browser_*` tools for the in-app preview. Agent identity comes from
`$READO_AGENT` (Reado sets it when launching an agent).

An agent plugin in [`plugin/`](plugin/) teaches Claude Code (and Codex, via
`AGENTS.md`) this contract so the agent resolves tasks correctly. See
[`plugin/README.md`](plugin/README.md) to install it. Other agents (e.g. Copilot)
still get the contract from the **Send review** prompt Reado injects, as long as
the `reado` CLI is installed.

## Keyboard shortcuts

| Shortcut             | Action                   |
| -------------------- | ------------------------ |
| `Cmd/Ctrl + P`       | Go to file (fuzzy)       |
| `Cmd/Ctrl + K`       | Command palette          |
| `Cmd/Ctrl + Shift+F` | Full-text project search |
| `Cmd/Ctrl + ,`       | Settings                 |

## Development

Prerequisites: [Node.js](https://nodejs.org) 22+, [pnpm](https://pnpm.io),
the [Rust toolchain](https://rustup.rs), and the
[Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.
[ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) on your `PATH` makes
full-text search faster; without it Reado falls back to a built-in scanner.

```bash
pnpm install        # install frontend dependencies
pnpm tauri dev      # run the app in development
pnpm tauri build    # produce a native installer for the current platform
```

Useful checks:

```bash
pnpm typecheck                                   # TypeScript
cargo test    --manifest-path src-tauri/Cargo.toml
cargo clippy  --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Contributing

Reado aims to be a friendly open-source project. Contributions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues: see [SECURITY.md](SECURITY.md). All code, comments and
documentation are written in English.

## License

[MIT](LICENSE) © Reado contributors
