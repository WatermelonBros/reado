/**
 * A stand-in for the Rust backend, for tests that render the whole app in a real
 * browser (the `browser` vitest project). Installed through Tauri's own
 * `mockIPC`, so every `invoke` in the app lands here instead of on a process.
 *
 * Only the commands that carry the reading loop are real — a small in-memory
 * project the tree can walk and the editor can open. Everything else answers
 * `null`, which most of the app already treats as "nothing there", and is
 * recorded in `unknown` so a test can show what the app asked for that the
 * fake never answered: a gap in the fake, not a pass.
 */
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks"

export const ROOT = "/fake/demo"

/** The project on "disk": paths relative to `ROOT`. */
export type FakeFiles = Record<string, string>

export const DEMO_FILES: FakeFiles = {
  "README.md": "# Demo\n\nA project that exists only in memory.\n",
  "package.json": '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n',
  "src/main.ts": 'import { greet } from "./greet"\n\nconsole.log(greet("Reado"))\n',
  "src/greet.ts":
    '/** Say hello. */\nexport function greet(name: string): string {\n  return "Hello, " + name\n}\n',
  // Taller than any editor, for what happens at the bottom edge of one.
  "src/long.ts": Array.from({ length: 120 }, (_, i) => `export const line${i + 1} = ${i + 1}`).join(
    "\n",
  ),
}

const rel = (p: string) => (p.startsWith(ROOT) ? p.slice(ROOT.length).replace(/^\/+/, "") : p)
const abs = (p: string) => (p ? `${ROOT}/${p}` : ROOT)

export interface FakeBackend {
  files: FakeFiles
  /** Commands the app sent that the fake has no answer for, with a count. */
  unknown: Map<string, number>
}

export function installFakeBackend(files: FakeFiles = DEMO_FILES): FakeBackend {
  const fake: FakeBackend = { files: { ...files }, unknown: new Map() }

  const listDir = (dir: string) => {
    const base = rel(dir)
    const prefix = base ? `${base}/` : ""
    const seen = new Map<string, boolean>()
    for (const path of Object.keys(fake.files)) {
      if (!path.startsWith(prefix)) continue
      const [name, ...rest] = path.slice(prefix.length).split("/")
      seen.set(name, seen.get(name) || rest.length > 0)
    }
    return [...seen].map(([name, isDir]) => ({ name, path: abs(prefix + name), isDir }))
  }

  const handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
    list_dir: (a) => listDir(String(a.dir)),
    list_files: () => Object.keys(fake.files).map(abs),
    read_file: (a) => {
      const text = fake.files[rel(String(a.path))]
      if (text === undefined) throw new Error(`No such file: ${a.path}`)
      return { kind: "text", text }
    },
    write_file: (a) => {
      fake.files[rel(String(a.path))] = String(a.content ?? "")
    },
    git_info: () => ({
      isRepo: true,
      branch: "main",
      ahead: 0,
      behind: 0,
      hasRemote: false,
      hasUpstream: false,
      changedFiles: 0,
    }),
    git_status: () => [],
    git_branches: () => ({ current: "main", local: ["main"], remote: [] }),
    git_changed_files: () => [],
    git_file_history: () => [],
    doc_links: () => [],
    list_comments: () => [],
    list_archived: () => [],
    list_read: () => [],
    get_bookmarks: () => [],
    list_symbols: () => [],
    session_list: () => [],
    history_list: () => [],
    discover_tests: () => [],
    reasoning_read: () => [],
    ovsx_installed: () => [],
    list_encodings: () => ["utf-8"],
    drain_open_targets: () => [],
    agent_installed: () => false,
    cli_installed: () => true,
    lsp_installed: () => false,
    mascot_monitors: () => [],
    "plugin:app|version": () => "0.0.0-test",
    "plugin:path|resolve_directory": () => "/fake/home",
  }

  mockWindows("main")
  mockIPC(
    (cmd, payload) => {
      const handler = handlers[cmd]
      if (handler) return handler((payload ?? {}) as Record<string, unknown>)
      // Window chrome and the event bus: fire-and-forget, nothing to model.
      if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) return null
      fake.unknown.set(cmd, (fake.unknown.get(cmd) ?? 0) + 1)
      return null
    },
    { shouldMockEvents: true },
  )
  return fake
}

export const uninstallFakeBackend = () => clearMocks()
