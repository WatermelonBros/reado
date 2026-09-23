/**
 * Project tasks: the commands everyone on a project runs, written down once.
 *
 * Two halves, and the second is the point. Running a command in a terminal is
 * something Reado could already do; turning what that command prints into
 * entries you can click is the bridge between "the build failed" and "here is
 * the line". That parse is what a **problem matcher** is.
 *
 * Tasks run in a real terminal pane rather than a captured pipe, so colour,
 * progress bars and anything that asks a question behave exactly as they do when
 * the command is typed by hand. The matcher reads the same stream on its way to
 * the screen.
 */
import type { UnlistenFn } from "@tauri-apps/api/event"
import { create } from "zustand"
import { t } from "@/i18n"
import { createFile, ptyWrite, readFile, writeFile } from "./api"
import { toRelative } from "./comments"
import { useDocInfo } from "./docInfo"
import { createLogger, safeError } from "./logger"
import { notify, notifyError } from "./notice"
import { createMatcher, type TaskProblem } from "./problemMatcher"
import { useProject } from "./store"
import { detectTasks } from "./taskDetect"
import { listenPtyLines, offSafe, useTerminals } from "./terminals"

const log = createLogger("tasks")

export { createMatcher, shapesFor, type TaskProblem } from "./problemMatcher"

/** Where a project's tasks may live, in the order Reado looks. Reado's own file
 *  wins; `.vscode/tasks.json` is read because projects already have one and
 *  asking for a second copy of the same list helps nobody. */
export const TASK_FILES = [".reado/tasks.json", ".vscode/tasks.json"] as const

export interface Task {
  label: string
  command: string
  args?: string[]
  /** Relative to the project root. */
  cwd?: string
  group?: "build" | "test"
  /** The group's default task — VS Code's `"group": { "isDefault": true }`, which
   *  is how a project with several build tasks says which one ⇧⌘B runs. */
  isDefault?: boolean
  /** Environment for this run, `VAR=value` prefixed onto the command line. */
  env?: Record<string, string>
  /** Problem matchers by name (`$tsc`), as VS Code writes them. `undefined` is
   *  "try everything" — what Reado did before names existed; `[]` is "parse
   *  nothing", which is how a task says its output is not diagnostics. */
  matchers?: string[]
  /** The provider that found this task (`npm`, `cargo`, …), when nobody wrote it
   *  down. Configured tasks have no provider. */
  detected?: string
}

/** A `tasks.json` entry as written: every field is optional here because which
 *  ones are required depends on `type`. */
type RawTask = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)
const strs = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map((x) => String(x)) : undefined

/**
 * What a typed task actually runs.
 *
 * VS Code's `type` is a *provider*: `{"type":"npm","script":"build"}` has no
 * command in it, because the npm provider is the thing that knows a script is
 * run with `npm run`. Reado resolves the handful of providers that cover real
 * projects; `shell` and `process` are the untyped case, where the command is
 * written out and there is nothing to resolve.
 */
function commandFor(raw: RawTask, pm: string): { command: string; args?: string[] } | null {
  switch (str(raw.type) ?? "shell") {
    case "npm": {
      const script = str(raw.script)
      if (!script) return null
      // `install` is a command of its own, not a script to `run`.
      return { command: pm, args: script === "install" ? ["install"] : ["run", script] }
    }
    case "cargo": {
      const sub = str(raw.command)
      return sub ? { command: "cargo", args: [sub, ...(strs(raw.args) ?? [])] } : null
    }
    case "typescript": {
      const cfg = str(raw.tsconfig) ?? "tsconfig.json"
      const watch = str(raw.option) === "watch"
      return { command: "npx", args: ["tsc", "-p", cfg, ...(watch ? ["--watch"] : [])] }
    }
    case "gulp":
    case "grunt":
    case "jake": {
      const runner = str(raw.type) as string
      const task = str(raw.task)
      return { command: "npx", args: [runner, ...(task ? [task] : [])] }
    }
    default: {
      const command = str(raw.command)
      return command ? { command, args: strs(raw.args) } : null
    }
  }
}

/**
 * The matchers an entry asks for, by name.
 *
 * `"problemMatcher"` is written four ways in the wild: one name, a list of them,
 * an object that extends one (`{"base": "$tsc", …}`), or a list of those. All
 * four mean the same thing to Reado — which shapes to read the output with.
 * Absent means "try everything"; `[]` means "this output is not diagnostics",
 * and both have to survive the round trip, so `undefined` and `[]` differ.
 */
function matchersOf(raw: RawTask): string[] | undefined {
  const value = raw.problemMatcher
  if (value === undefined) return undefined
  const one = (v: unknown): string | undefined =>
    typeof v === "string" ? v : str((v as RawTask)?.base)
  const names = (Array.isArray(value) ? value : [value]).map(one).filter((n): n is string => !!n)
  return names
}

/** Turn one entry into something runnable, or null if it isn't one. */
function toTask(raw: RawTask, pm: string): Task | null {
  const resolved = commandFor(raw, pm)
  if (!resolved) return null
  const options = (raw.options ?? {}) as RawTask
  const groupRaw = raw.group
  const group =
    groupRaw === "build" || groupRaw === "test"
      ? groupRaw
      : typeof groupRaw === "object" && groupRaw
        ? ((groupRaw as { kind?: string }).kind as "build" | "test" | undefined)
        : undefined
  const env = options.env && typeof options.env === "object" ? options.env : undefined
  return {
    // A typed entry may leave the label out — VS Code shows it as `npm: build`,
    // so a file that relies on that still reads the same here.
    label:
      str(raw.label) ??
      `${str(raw.type) ?? "shell"}: ${str(raw.script) ?? str(raw.command) ?? str(raw.task) ?? ""}`.trim(),
    ...resolved,
    cwd: str(raw.cwd) ?? str(options.cwd),
    group,
    isDefault:
      typeof groupRaw === "object" && groupRaw
        ? (groupRaw as { isDefault?: boolean }).isDefault === true
        : undefined,
    env: env as Record<string, string> | undefined,
    matchers: matchersOf(raw),
  }
}

/**
 * Parse a tasks file.
 *
 * Both files are hand-written JSON with comments and trailing commas, because
 * `.vscode/tasks.json` always has been. Refusing them would mean refusing most
 * of the projects this feature exists for.
 */
export function parseTasks(text: string, pm = "npm"): Task[] {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1")
  const parsed = JSON.parse(stripped) as { tasks?: unknown } | unknown[]
  const list = Array.isArray(parsed) ? parsed : ((parsed as { tasks?: unknown }).tasks ?? [])
  if (!Array.isArray(list)) throw new Error("tasks is not a list")
  return list
    .map((raw) => toTask(raw as RawTask, pm))
    .filter((task): task is Task => !!task && !!task.label)
}

interface TasksState {
  tasks: Task[]
  /** Where the tasks came from, so the UI can say which file to edit. */
  source: string | null
  /** Problems by task label, so re-running one replaces its own and no one
   *  else's. */
  byTask: Record<string, TaskProblem[]>
  /** Which terminal a task last ran in, so a re-run reuses its pane. */
  paneOf: Record<string, string>
  set: (patch: Partial<TasksState>) => void
}

export const useTasks = create<TasksState>((set) => ({
  tasks: [],
  source: null,
  byTask: {},
  paneOf: {},
  set: (patch) => set(patch),
}))

/**
 * Read the project's tasks: the ones written down, then the ones detected from
 * its manifests.
 *
 * Written wins on a tie. A `tasks.json` entry that shares a label with a
 * detected task is the project overriding it — adding a matcher, a cwd, an
 * environment — and the detected copy would only be a duplicate row saying
 * something slightly different.
 *
 * A file that does not parse is reported and leaves whatever was already loaded
 * alone; detection still runs, so a broken file doesn't take the project's
 * scripts down with it.
 */
export async function loadTasks(root: string): Promise<Task[]> {
  const { tasks: detected, pm } = await detectTasks(root)
  for (const rel of TASK_FILES) {
    const content = await readFile(root, `${root}/${rel}`).catch(() => null)
    if (content?.kind !== "text") continue
    try {
      const written = parseTasks(content.text, pm)
      const labels = new Set(written.map((task) => task.label))
      const tasks = [...written, ...detected.filter((task) => !labels.has(task.label))]
      useTasks.getState().set({ tasks, source: rel })
      return tasks
    } catch (e) {
      log.warn("tasks file did not parse", { file: rel, error: safeError(e) })
      notify("error", t("tasks.badFile", { file: rel }))
      const kept = useTasks.getState().tasks
      return kept.length ? kept : detected
    }
  }
  useTasks.getState().set({ tasks: detected, source: null })
  return detected
}

/**
 * VS Code's `${…}` variables, which real `tasks.json` files are full of.
 *
 * Resolved when the task runs, not when the file is read — `${file}` means the
 * file open *now*. What the shell can expand itself is handed to the shell
 * (`${env:FOO}` → `$FOO`, `${userHome}` → `$HOME`) rather than read here, and an
 * unknown variable is left standing: a visible `${whatever}` in the command line
 * says what happened, where an empty string would silently run the wrong thing.
 */
export function resolveVars(text: string, root: string, file: string | null): string {
  const rel = file ? toRelative(root, file) : file
  const base = file?.split("/").pop() ?? ""
  const dot = base.lastIndexOf(".")
  const view = useDocInfo.getState().view
  const at = view?.state.selection.main
  return text.replace(/\$\{([^}]+)\}/g, (whole, name: string) => {
    if (name.startsWith("env:")) return `$${name.slice(4)}`
    switch (name) {
      case "workspaceFolder":
        return root
      case "workspaceFolderBasename":
        return root.split("/").pop() ?? root
      case "file":
        return file ?? whole
      case "relativeFile":
        return rel ?? whole
      case "relativeFileDirname":
        return rel ? rel.split("/").slice(0, -1).join("/") || "." : whole
      case "fileBasename":
        return base || whole
      case "fileBasenameNoExtension":
        return dot > 0 ? base.slice(0, dot) : base || whole
      case "fileExtname":
        return dot > 0 ? base.slice(dot) : ""
      case "fileDirname":
        return file ? file.split("/").slice(0, -1).join("/") : whole
      case "lineNumber":
        return view && at ? String(view.state.doc.lineAt(at.head).number) : whole
      case "selectedText":
        return view && at ? view.state.sliceDoc(at.from, at.to) : whole
      case "pathSeparator":
        return "/"
      case "userHome":
        return "$HOME"
      default:
        return whole
    }
  })
}

/** The line a task runs, quoted the way a shell needs and with `${…}` resolved.
 *  `env` rides in front of it, which is how a shell takes a per-command
 *  environment without a wrapper. */
export function commandLine(task: Task, root = useProject.getState().root ?? ""): string {
  const file = useProject.getState().active
  const quote = (a: string) => {
    const v = resolveVars(a, root, file)
    // `$` survives quoting: a resolved `$HOME` or `$FOO` is for the shell to
    // expand, so it goes in unquoted-but-escaped rather than in single quotes.
    return /[\s"'`\\]/.test(v) ? `'${v.replace(/'/g, `'\\''`)}'` : v
  }
  const env = Object.entries(task.env ?? {}).map(([k, v]) => `${k}=${quote(v)}`)
  return [...env, ...[task.command, ...(task.args ?? [])].map(quote)].join(" ")
}

/**
 * Run a task in a terminal pane and collect what its output says.
 *
 * The pane is reused across runs of the same task: one pane per task is a
 * readable workspace, one per run is a pile.
 */
export async function runTask(task: Task): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const terminals = useTerminals.getState()
  const state = useTasks.getState()
  const existing = state.paneOf[task.label]
  const alive = existing && terminals.sessions.some((s) => s.id === existing)
  const cwd = task.cwd ? `${root}/${task.cwd}` : root
  if (!terminals.open) terminals.toggle()
  const id = alive ? existing : terminals.add(cwd)
  useTasks.getState().set({ paneOf: { ...state.paneOf, [task.label]: id } })
  useTerminals.getState().setTitle(id, task.label)

  // This run's problems replace the last one's, so the panel describes the
  // current state rather than every run since the project opened.
  const matcher = createMatcher(task.matchers)
  const found: TaskProblem[] = []
  useTasks.getState().set({ byTask: { ...useTasks.getState().byTask, [task.label]: [] } })
  let off: UnlistenFn | null = null
  let idle = 0
  let stopped = false
  const stop = () => {
    stopped = true
    offSafe(off)
    off = null
    clearTimeout(idle)
  }
  // Assigned *after* the await, so `stop()` running inside that window would
  // have nothing to unsubscribe and the subscription would outlive the run.
  const sub = await listenPtyLines(id, (line) => {
    found.push(...matcher.push(line))
    useTasks.getState().set({ byTask: { ...useTasks.getState().byTask, [task.label]: [...found] } })
    // A task that has stopped printing has finished, as far as the reader is
    // concerned; a watch task simply keeps the listener a little longer.
    clearTimeout(idle)
    idle = window.setTimeout(stop, 4000)
  })
  if (stopped) offSafe(sub)
  else off = sub
  await ptyWrite(id, `${commandLine(task)}\r`)
}

/** What ⇧⌘B runs without asking: the task the project marked as the group's
 *  default, or the single `build` task when there is exactly one. With several
 *  and no default there is a real choice to make, so the caller asks. */
export function buildTask(tasks: Task[]): Task | undefined {
  const builds = tasks.filter((t2) => t2.group === "build")
  return builds.find((t2) => t2.isDefault) ?? (builds.length === 1 ? builds[0] : undefined)
}

/** Write a starter tasks file, for a project that has none. */
export async function createTasksFile(root: string): Promise<void> {
  const rel = TASK_FILES[0]
  const starter = `{
  // Commands everyone on this project runs. Reado runs them in a terminal and
  // turns what they print into entries in the Problems panel.
  "tasks": [
    { "label": "build", "command": "npm", "args": ["run", "build"], "group": "build" },
    { "label": "test", "command": "npm", "args": ["test"], "group": "test" }
  ]
}
`
  try {
    await createFile(root, rel).catch(() => {})
    await writeFile(root, rel, starter)
    useProject.getState().open(`${root}/${rel}`)
    await loadTasks(root)
  } catch (e) {
    notifyError("tasks", t("tasks.createFailed"), e)
  }
}
