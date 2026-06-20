<h1 align="center">Reado</h1>

<p align="center"><em>A calm place to read code.</em></p>

Most IDEs are built for **writing** code. Reado inverts that: the primary
experience is **reading**, and the primary action is leaving durable comments
anchored to precise points in the code. Those comments are not throwaway notes —
they are persistent, lifecycle-bearing artifacts that an AI agent (Claude Code /
Codex) resolves, and that accumulate into a consultable knowledge base.

> The mental model is an **inverted code review**: you are the reviewer (read,
> annotate), the AI is the committer (implements the fixes).

Reado is built with [Tauri 2](https://tauri.app), React 19 and a Rust backend.
It runs on macOS, Linux and Windows.

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
- Fuzzy file open (`Cmd/Ctrl+P`), full-text project search via ripgrep
  (`Cmd/Ctrl+Shift+F`), and a command palette (`Cmd/Ctrl+K`).
- Four research-grounded themes (dark, light, high-contrast, sepia) with manual,
  follow-system, and time-of-day selection.
- Italian and English UI.
- Anchored comments as an external overlay: leave a comment on a line range
  (hover the `+` or press the shortcut), with types, states, task/note, threads,
  and a gutter marker. Comments are stored as `.md` files under `.reado/` and
  survive external edits (git-diff-free fuzzy re-anchoring; orphans never point
  at the wrong line).
- An integrated terminal (real PTYs, multiple tabs) with one-click launch of
  `claude`/`codex`, and **Send review** to hand your open tasks to the agent.
- A `reado` CLI — the stable contract the agent uses to read and resolve tasks.

## The AI loop

Reado's core loop is **read → annotate → AI-resolve**:

1. You read code and leave comments. Comments flagged as **tasks** are the work
   list; **notes** stay out of the agent's way.
2. Open the terminal (`Cmd/Ctrl+J`), launch **Claude** or **Codex**, then click
   **Send review**. Reado injects a prompt asking the agent to fetch and resolve
   your tasks through the `reado` CLI.
3. The agent reads tasks with `reado task list`, makes the changes, and marks
   each `reado task done <id>` (or `reado task fail <id> "<reason>"`). Reado's
   watcher reflects the result live, and resolved comments move to history.

The `reado` CLI is the stable contract — the on-disk format can evolve without
breaking the agent. Build and install it onto your PATH:

```bash
scripts/install-cli.sh           # builds release + links into ~/.local/bin
reado --help
```

Contract: `reado task list|show|done|fail|link` and
`reado comment add|reply|search`. Agent identity comes from `$READO_AGENT`
(Reado sets it when launching an agent).

An agent plugin in [`plugin/`](plugin/) teaches Claude Code (and Codex, via
`AGENTS.md`) this contract so the agent resolves tasks correctly. See
[`plugin/README.md`](plugin/README.md) to install it.

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
Full-text search currently requires [ripgrep](https://github.com/BurntSushi/ripgrep)
(`rg`) on your `PATH`.

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
[CONTRIBUTING.md](CONTRIBUTING.md). All code, comments and documentation are
written in English.

## License

[MIT](LICENSE) © Reado contributors
