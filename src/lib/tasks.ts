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
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { create } from "zustand"
import { t } from "@/i18n"
import { createFile, ptyWrite, readFile, writeFile } from "./api"
import { createLogger, safeError } from "./logger"
import { notify, notifyError } from "./notice"
import { useProject } from "./store"
import { useTerminals } from "./terminals"

const log = createLogger("tasks")

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
}

/** One entry a matcher found in a task's output. */
export interface TaskProblem {
  /** Project-relative or absolute, as the compiler printed it. */
  path: string
  line: number
  character: number
  /** LSP severity: 1 error, 2 warning, 3 info. */
  severity: number
  message: string
}

const severityOf = (word: string): number => (/^err/i.test(word) ? 1 : /^warn/i.test(word) ? 2 : 3)

/** Strip the ANSI colour a compiler writes when it thinks it has a terminal —
 *  and it does, because Reado gives it a real one. */
const plain = (line: string): string =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters by definition.
  line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "")

/** `src/a.ts(12,5): error TS2345: message` — tsc, and MSBuild. */
const TSC = /^(.+?)\((\d+),(\d+)\):\s*(error|warning|info)\b[^:]*:\s*(.+)$/
/** `src/a.ts:12:5: error: message` — gcc, eslint's compact format, and most
 *  things that print a location at all. */
const COLON = /^(.+?):(\d+):(\d+):\s*(error|warning|info|note)?:?\s*(.+)$/
/** cargo's first line: `error[E0308]: mismatched types`. */
const CARGO_HEAD = /^(error|warning)(\[[A-Za-z0-9]+\])?:\s*(.+)$/
/** cargo's second line: `  --> src/main.rs:5:9`. */
const CARGO_LOC = /^\s*-->\s*(.+?):(\d+):(\d+)\s*$/

/**
 * A matcher reading one run's output.
 *
 * Stateful because cargo's shape is two lines — the message, then the location —
 * and a matcher that only ever sees one line at a time cannot join them.
 */
export function createMatcher(): { push: (raw: string) => TaskProblem[] } {
  let pending: { severity: number; message: string } | null = null
  return {
    push(raw) {
      const line = plain(raw)
      if (!line.trim()) return []
      if (pending) {
        const loc = CARGO_LOC.exec(line)
        if (loc) {
          const found = {
            path: loc[1],
            line: Number(loc[2]),
            character: Number(loc[3]),
            severity: pending.severity,
            message: pending.message,
          }
          pending = null
          return [found]
        }
        // The location has to be the very next line; anything else means that
        // message had none, and holding it would attach it to the wrong file.
        pending = null
      }
      const tsc = TSC.exec(line)
      if (tsc)
        return [
          {
            path: tsc[1].trim(),
            line: Number(tsc[2]),
            character: Number(tsc[3]),
            severity: severityOf(tsc[4]),
            message: tsc[5].trim(),
          },
        ]
      const colon = COLON.exec(line)
      // A bare `10:5: something` has no path worth clicking, and a Windows
      // `C:\x.ts:1:1` would otherwise be read as a path of "C".
      if (colon && colon[1].trim().length > 1) {
        const path = colon[1].trim()
        return [
          {
            path,
            line: Number(colon[2]),
            character: Number(colon[3]),
            severity: severityOf(colon[4] ?? "error"),
            message: colon[5].trim(),
          },
        ]
      }
      const head = CARGO_HEAD.exec(line)
      if (head) pending = { severity: severityOf(head[1]), message: head[3].trim() }
      return []
    },
  }
}

/**
 * Parse a tasks file.
 *
 * Both files are hand-written JSON with comments and trailing commas, because
 * `.vscode/tasks.json` always has been. Refusing them would mean refusing most
 * of the projects this feature exists for.
 */
export function parseTasks(text: string): Task[] {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1")
  const parsed = JSON.parse(stripped) as { tasks?: unknown } | unknown[]
  const list = Array.isArray(parsed) ? parsed : ((parsed as { tasks?: unknown }).tasks ?? [])
  if (!Array.isArray(list)) throw new Error("tasks is not a list")
  return list
    .map((raw) => raw as Record<string, unknown>)
    .filter((raw) => typeof raw?.label === "string" && typeof raw?.command === "string")
    .map((raw) => ({
      label: raw.label as string,
      command: raw.command as string,
      args: Array.isArray(raw.args) ? (raw.args as string[]).map(String) : undefined,
      cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
      group:
        raw.group === "build" || raw.group === "test"
          ? raw.group
          : typeof raw.group === "object" && raw.group
            ? ((raw.group as { kind?: string }).kind as "build" | "test" | undefined)
            : undefined,
    }))
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

/** Read the project's tasks. A file that does not parse is reported and leaves
 *  whatever was already loaded alone. */
export async function loadTasks(root: string): Promise<Task[]> {
  for (const rel of TASK_FILES) {
    const content = await readFile(root, `${root}/${rel}`).catch(() => null)
    if (content?.kind !== "text") continue
    try {
      const tasks = parseTasks(content.text)
      useTasks.getState().set({ tasks, source: rel })
      return tasks
    } catch (e) {
      log.warn("tasks file did not parse", { file: rel, error: safeError(e) })
      notify("error", t("tasks.badFile", { file: rel }))
      return useTasks.getState().tasks
    }
  }
  useTasks.getState().set({ tasks: [], source: null })
  return []
}

/** The line a task runs, quoted the way a shell needs. */
export function commandLine(task: Task): string {
  const quote = (a: string) => (/[\s"'$`\\]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a)
  return [task.command, ...(task.args ?? [])].map(quote).join(" ")
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
  const matcher = createMatcher()
  const found: TaskProblem[] = []
  useTasks.getState().set({ byTask: { ...useTasks.getState().byTask, [task.label]: [] } })
  let off: UnlistenFn | null = null
  let idle = 0
  const stop = () => {
    void off?.()
    off = null
    clearTimeout(idle)
  }
  off = await listen<string>(`pty-output-${id}`, (e) => {
    const text = typeof e.payload === "string" ? e.payload : String(e.payload)
    for (const line of text.split("\n")) found.push(...matcher.push(line))
    useTasks.getState().set({ byTask: { ...useTasks.getState().byTask, [task.label]: [...found] } })
    // A task that has stopped printing has finished, as far as the reader is
    // concerned; a watch task simply keeps the listener a little longer.
    clearTimeout(idle)
    idle = window.setTimeout(stop, 4000)
  })
  await ptyWrite(id, `${commandLine(task)}\r`)
}

/** The single `build` task, when there is exactly one — what the shortcut runs
 *  without asking. */
export function buildTask(tasks: Task[]): Task | undefined {
  const builds = tasks.filter((t2) => t2.group === "build")
  return builds.length === 1 ? builds[0] : undefined
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
