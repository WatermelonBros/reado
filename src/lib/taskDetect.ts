/**
 * Tasks nobody wrote down.
 *
 * A project already says how it is built — in `package.json`'s scripts, in
 * `Cargo.toml`, in `go.mod`, in `tsconfig.json`. Asking for a second copy of
 * that list in `tasks.json` is asking the same question twice, so Reado reads
 * the manifests and offers what it finds. This is what VS Code calls task
 * *auto-detection*; there it is contributed by extensions (npm, typescript,
 * gulp…), here it is this file.
 *
 * A detected task is a suggestion, not a record: a `tasks.json` entry with the
 * same label always wins, which is how a project overrides one (add a problem
 * matcher, change the cwd) without losing the rest.
 */
import { listDir, readFile } from "./api"
import { createLogger, safeError } from "./logger"
import type { Task } from "./tasks"

const log = createLogger("tasks")

/** Lockfile → the package manager that wrote it. A project's scripts have to be
 *  run with its own manager: `npm run` in a pnpm workspace resolves the wrong
 *  binaries, and in a Bun project it may not resolve them at all. */
const LOCKFILES: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "package-lock.json": "npm",
}

/** The package manager a project's root says it uses; npm when nothing does. */
export function packageManagerFor(names: Iterable<string>): string {
  for (const name of names) {
    const pm = LOCKFILES[name]
    if (pm) return pm
  }
  return "npm"
}

/** Scripts whose name says what they are, so ⇧⌘B and the test group find them.
 *  Exact names only: marking every `build:*` as a build task would leave the
 *  shortcut with five candidates and nothing to run. */
const GROUP_OF: Record<string, "build" | "test"> = { build: "build", test: "test" }

/** One task per `package.json` script, run with the project's own manager. */
async function npmTasks(root: string, pm: string): Promise<Task[]> {
  const file = await readFile(root, `${root}/package.json`).catch(() => null)
  if (file?.kind !== "text") return []
  let scripts: Record<string, unknown> = {}
  try {
    scripts = (JSON.parse(file.text) as { scripts?: Record<string, unknown> }).scripts ?? {}
  } catch (e) {
    // A package.json that doesn't parse is the project's problem, not something
    // to shout about here — the tasks that do parse still show up.
    log.warn("package.json did not parse", { error: safeError(e) })
    return []
  }
  return Object.keys(scripts)
    .filter((name) => typeof scripts[name] === "string")
    .map((name) => ({
      label: `${pm}: ${name}`,
      command: pm,
      args: ["run", name],
      group: GROUP_OF[name],
      detected: pm,
    }))
}

/** `tsc -p tsconfig.json`, build and watch — the two the TypeScript provider
 *  offers in VS Code, with tsc's own matcher attached. */
const tscTasks = (): Task[] => [
  {
    label: "tsc: build - tsconfig.json",
    command: "npx",
    args: ["tsc", "-p", "tsconfig.json"],
    group: "build",
    matchers: ["$tsc"],
    detected: "typescript",
  },
  {
    label: "tsc: watch - tsconfig.json",
    command: "npx",
    args: ["tsc", "-p", "tsconfig.json", "--watch"],
    matchers: ["$tsc"],
    detected: "typescript",
  },
]

/** What a Cargo project runs, with rustc's matcher. `clippy` is included because
 *  every Rust project's CI runs it and its output is the same shape. */
const cargoTasks = (): Task[] =>
  (
    [
      ["build", "build"],
      ["test", "test"],
      ["check", undefined],
      ["clippy", undefined],
      ["run", undefined],
    ] as const
  ).map(([sub, group]) => ({
    label: `cargo: ${sub}`,
    command: "cargo",
    args: [sub],
    group,
    matchers: ["$rustc"],
    detected: "cargo",
  }))

/** Go's two, over the whole module. */
const goTasks = (): Task[] =>
  (
    [
      ["build", "build"],
      ["test", "test"],
      ["vet", undefined],
    ] as const
  ).map(([sub, group]) => ({
    label: `go: ${sub}`,
    command: "go",
    args: [sub, "./..."],
    group,
    matchers: ["$go"],
    detected: "go",
  }))

/** What a project's own manifests say it can run, plus the package manager they
 *  imply (which typed `npm` tasks in a `tasks.json` need to resolve). One
 *  directory listing decides which manifests are there, so a project with none
 *  costs one call and no failed reads. */
export async function detectTasks(root: string): Promise<{ tasks: Task[]; pm: string }> {
  const entries = await listDir(root, root, true).catch((e) => {
    log.warn("could not list the project root", { error: safeError(e) })
    return []
  })
  const names = entries.filter((e) => !e.isDir).map((e) => e.name)
  const pm = packageManagerFor(names)
  const has = (name: string) => names.includes(name)
  const tasks: Task[] = [
    ...(has("package.json") ? await npmTasks(root, pm) : []),
    ...(has("tsconfig.json") ? tscTasks() : []),
    ...(has("Cargo.toml") ? cargoTasks() : []),
    ...(has("go.mod") ? goTasks() : []),
  ]
  return { tasks, pm }
}
