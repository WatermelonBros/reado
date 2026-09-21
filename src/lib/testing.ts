/**
 * The Test Explorer's half of the job: what to run, how to run it, and what the
 * output said.
 *
 * Discovery is Rust's (`discover_tests`). Running is a PTY the user never sees:
 * a test run is Reado's errand, not a command that hijacks their terminal and
 * scrolls past. The tree is where the answer belongs, so the output is read for
 * verdicts on the way and otherwise goes to the log, which is where a run that
 * failed is worth reading. What this module adds on the way past is a
 * **result matcher** — per framework, the one line each test prints when it
 * passes or fails — so the tree can show a tick without the reader scanning the
 * scrollback for it.
 *
 * A verdict is matched back to a test by the **path the framework printed**, not
 * by the test's bare name: `✓ src/a.test.ts > outer > works` says which `works`
 * it is, and a file whose two suites each hold one is the ordinary shape of a
 * test file, not an edge case. Throwing that path away and guessing from the
 * leaf would put a green tick on a failing test.
 *
 * Verdicts outlive the session: they are kept per project and restored on
 * re-open, but only ever shown as *current* while the file they judged has not
 * changed since the run. A green tick against code edited afterwards is worse
 * than no tick at all.
 *
 * ponytail: the match is a suffix of the printed path, so a framework that
 * prints no path at all still falls back to the leaf and marks every candidate.
 * Machine-readable reporters (`--reporter=json`, libtest's JSON) are the
 * upgrade, and each one costs a parser and a flag older versions do not have.
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { t } from "@/i18n"
import { announce, cue } from "./a11y"
import { discoverTests, ptyKill, ptySpawn, submitToTerminal, type TestFile } from "./api"
import { createLogger, safeError } from "./logger"
import { useMascot } from "./mascot"
import { useProject } from "./store"
import { listenPtyLines, offSafe, plainText, shellQuote } from "./terminals"

const log = createLogger("testing")

export type TestStatus = "pass" | "fail" | "running" | "skip"

/** The separator between a test id's segments — file, suites, name. */
const SEP = " › "

/** What a test is called in the tree, and in the map of results. */
export const testId = (file: string, suites: string[], name: string) =>
  [file, ...suites, name].join(SEP)

/** One verdict, named by the path the framework printed — outermost first, so it
 *  can be matched against the tail of a [`testId`]. */
export interface Verdict {
  path: string[]
  status: TestStatus
}

/** What a run is about: one test, one file, or a whole framework. */
export interface Scope {
  framework: string
  file?: string
  suites?: string[]
  name?: string
}

/** How to ask a framework to run something, and how to read what it says. */
export interface Runner {
  /** The command for one test, one file, or the whole project. Paths are
   *  relative to the project the command runs in, not to the Reado project —
   *  see [`commandFor`], which is what decides where that is. */
  command: (scope: { file?: string; suites?: string[]; name?: string; files?: string[] }) => string
  /** The verdict on one line of output, or nothing. */
  read: (line: string) => Verdict | null
}

/** Every glyph vitest and jest use for a result. They do not agree: vitest's
 *  failure is `×` (U+00D7), jest's is `✕` (U+2715), and both have been `✗`. */
const PASS_MARKS = "✓✔"
const FAIL_MARKS = "×✗✘✕"
const JS_VERDICT = new RegExp(`^\\s*([${PASS_MARKS}${FAIL_MARKS}])\\s+(.+)$`)

/** The duration each runner tacks on: vitest writes `3ms`, jest `(3 ms)`, and
 *  either may report seconds. Trailing, so it cannot eat a name. */
const DURATION = /\s*\(?\d+(?:\.\d+)?\s*m?s\)?$/

/** `✓ path > suite > name 3ms`. The file's own summary line
 *  (`✓ src/a.test.ts (3 tests | 1 failed)`) matches too and names no test, which
 *  is harmless: nothing in the tree is called that. */
const jsVerdict = (line: string): Verdict | null => {
  const m = JS_VERDICT.exec(plainText(line))
  if (!m) return null
  const path = m[2]
    .replace(DURATION, "")
    .split(" > ")
    .map((s) => s.trim())
    .filter(Boolean)
  return path.length === 0 ? null : { path, status: PASS_MARKS.includes(m[1]) ? "pass" : "fail" }
}

/** Exported for the test: the runners are the whole of this module's knowledge
 *  about the world outside, and both halves of each one are easy to get wrong. */
export const RUNNERS: Record<string, Runner> = {
  vitest: {
    // `--reporter=verbose` is not a preference: the default reporter prints a
    // line per *file* and only names the tests that failed, so every passing
    // test would stay "never run" forever.
    command: ({ file, name }) =>
      [
        "npx vitest run --reporter=verbose",
        file ? shellQuote(file) : "",
        name ? `-t ${shellQuote(name)}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    read: jsVerdict,
  },
  jest: {
    // Same reason: jest collapses passes without `--verbose`.
    command: ({ file, name }) =>
      ["npx jest --verbose", file ? shellQuote(file) : "", name ? `-t ${shellQuote(name)}` : ""]
        .filter(Boolean)
        .join(" "),
    read: jsVerdict,
  },
  cargo: {
    // Cargo filters by a substring of the test's full path, and knows nothing
    // about files — so a file-scoped run falls back to the whole crate, which is
    // the directory this already runs in.
    command: ({ name }) => ["cargo test", name ? shellQuote(name) : ""].filter(Boolean).join(" "),
    read: (line) => {
      const m = /^test\s+(\S+)\s+\.\.\.\s+(ok|FAILED|ignored)/.exec(plainText(line))
      if (!m) return null
      return {
        path: m[1].split("::"),
        status: m[2] === "ok" ? "pass" : m[2] === "ignored" ? "skip" : "fail",
      }
    },
  },
  pytest: {
    // `-v` is not a preference: without it pytest prints a row of dots, and a
    // dot names no test.
    command: ({ file, suites, name }) => {
      const target = file ? [file, ...(suites ?? []), name].filter(Boolean).join("::") : ""
      return ["pytest -v", target ? shellQuote(target) : ""].filter(Boolean).join(" ")
    },
    read: (line) => {
      const m = /^(\S+?)::(\S+)\s+(PASSED|FAILED|ERROR|SKIPPED|XFAIL)/.exec(plainText(line))
      if (!m) return null
      return {
        // The file too: pytest prints a node id, which is the whole identity.
        path: [m[1], ...m[2].split("::")],
        status:
          m[3] === "PASSED" ? "pass" : m[3] === "SKIPPED" || m[3] === "XFAIL" ? "skip" : "fail",
      }
    },
  },
  go: {
    command: ({ file, name }) => {
      const dir = file?.includes("/") ? `./${file.slice(0, file.lastIndexOf("/"))}/` : "./..."
      return ["go test", name ? `-run ${shellQuote(`^${name}$`)}` : "", dir]
        .filter(Boolean)
        .join(" ")
    },
    read: (line) => {
      const m = /^\s*---\s+(PASS|FAIL|SKIP):\s+(\S+)/.exec(plainText(line))
      if (!m) return null
      // Go's subtests are `Parent/child`, which is the same idea as a suite.
      return {
        path: m[2].split("/"),
        status: m[1] === "PASS" ? "pass" : m[1] === "SKIP" ? "skip" : "fail",
      }
    },
  },
}

/** What one test did, and when it did it. */
export interface Result {
  status: TestStatus
  /** ms since the epoch, for the staleness check. */
  at: number
  /** How many tests this row turned out to *be*, when the last run said so.
   *  A declaration in a loop is one line of source and many tests: Reado's own
   *  `` it(`${name} invokes …`) `` is two hundred of them. Counting the row as
   *  one is what made the panel's total read lower than the framework's. */
  cases?: number
}

interface TestingState {
  files: TestFile[]
  /** Every project's verdicts, keyed by root and then by [`testId`], persisted.
   *  One place rather than a live copy beside a stored one: a mirror is a thing
   *  that can be forgotten, and forgetting it loses a session's results. */
  byRoot: Record<string, Record<string, Result>>
  loading: boolean
  /** A run is in flight (the panel disables a second one rather than racing). */
  running: boolean
  load: (root: string) => Promise<void>
}

export const useTesting = create<TestingState>()(
  persist(
    (set) => ({
      files: [],
      byRoot: {},
      loading: false,
      running: false,
      load: async (root) => {
        if (!root) return
        set({ loading: true })
        try {
          set({ files: await discoverTests(root) })
        } catch (e) {
          log.error("discovery failed", { error: safeError(e) })
          set({ files: [] })
        } finally {
          set({ loading: false })
        }
      },
    }),
    {
      name: "reado-test-results",
      // Only the verdicts travel. The file list is a walk of the disk, and the
      // disk is the authority on it.
      partialize: (s) => ({ byRoot: s.byRoot }),
      onRehydrateStorage: () => (state) => {
        if (state) state.byRoot = withoutRunning(state.byRoot)
      },
    },
  ),
)

/**
 * The same verdicts with every "running" one dropped.
 *
 * "Running" is a claim about a process, and no process survives the window
 * closing. A run cut short by a reload or a crash would otherwise leave each
 * test it had started spinning for the rest of the project's life — a real
 * project was found with 1926 of them.
 */
export const withoutRunning = (byRoot: TestingState["byRoot"]): TestingState["byRoot"] =>
  Object.fromEntries(
    Object.entries(byRoot).map(([root, results]) => [
      root,
      Object.fromEntries(Object.entries(results).filter(([, v]) => v.status !== "running")),
    ]),
  )

/** One project's verdicts, by [`testId`]. */
export const resultsFor = (byRoot: TestingState["byRoot"], root: string): Record<string, Result> =>
  byRoot[root] ?? {}

/**
 * Whether a remembered verdict still describes the file it judged.
 *
 * The honest answer to "did this pass?" for code edited since the run is "it
 * passed, before you changed it" — which is what the panel says, rather than
 * showing a tick that means nothing.
 */
export function isStale(file: TestFile, result: Result | undefined): boolean {
  if (!result?.at || file.modified === undefined) return false
  return file.modified > result.at
}

/** One test whose name is not a name, and the ids it stands for. */
export interface Dynamic {
  id: string
  re: RegExp
}

/**
 * The pattern a test's written name makes, or null when the name is just a name.
 *
 * A test declared in a loop is written `` it(`${tool} renders ${EXPECTED[tool]}`) ``
 * and *printed* expanded — "files renders FileTree". Discovery reads the source,
 * so the two never meet: nine of this project's own tests ran, passed, and sat
 * in the tree marked "not run" forever. What was written is the pattern, so this
 * turns it into one.
 *
 * A name that is nothing but an interpolation (`` `${name}` ``) makes a pattern
 * that matches every line, which is worse than no answer — those keep none.
 */
export function namePattern(name: string): RegExp | null {
  if (!name.includes("${")) return null
  const literals = name.split(/\$\{[^{}]*\}/)
  if (!literals.some((part) => part.trim().length > 0)) return null
  const escaped = literals.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`^${escaped.join(".+")}$`)
}

/**
 * Which tests a printed verdict is about.
 *
 * `byLeaf` maps a test's last segment to every id in the run that ends with it.
 * A framework that printed a path narrows that to the ids whose own tail matches
 * it, which is what tells two tests of the same name in one file apart; one that
 * printed only a leaf matches them all, which is the best that can be done with
 * what it said.
 *
 * `dynamic` is the last resort, for a printed name no test is called: the tests
 * whose written name is a template, matched as the patterns they are. One
 * declaration stands for every name it produces, so a single id is the honest
 * answer to many printed lines — see the run's failure rule, which keeps the
 * worst of them.
 */
export function idsFor(
  byLeaf: Map<string, string[]>,
  path: string[],
  dynamic: Dynamic[] = [],
): string[] {
  const leaf = path[path.length - 1]
  const candidates = byLeaf.get(leaf) ?? []
  const tail = SEP + path.join(SEP)
  const exact = candidates.filter((key) => (SEP + key).endsWith(tail))
  if (exact.length > 0) return exact
  if (candidates.length > 0) return candidates
  return dynamic.filter((d) => d.re.test(leaf)).map((d) => d.id)
}

/**
 * The shell line for a run, across however many projects it touches.
 *
 * Every framework here is invoked from inside its own project, not from the
 * Reado root: `cargo test` outside a crate, `npx vitest` outside the package
 * that installed it, `go test` outside the module and `pytest` outside the
 * package all fail before they look at a test — and a repo that keeps its code
 * in `crates/*`, `packages/*` or `apps/*` is the ordinary shape, not the odd
 * one. Discovery says where each file's project starts; this groups the run by
 * that, `cd`s into each one and makes the paths relative to it.
 *
 * `;`, not `&&`: one project whose tests fail must not hide the next one's. The
 * `cd` is absolute so each command stands alone whatever the last one did.
 */
export function commandFor(runner: Runner, root: string, files: TestFile[], scope: Scope): string {
  const byProject = new Map<string, TestFile[]>()
  for (const f of files) byProject.set(f.project, [...(byProject.get(f.project) ?? []), f])
  // Nothing discovered (a framework asked for by name alone) still gets a run,
  // from the root — which is where it ran before any of this.
  if (byProject.size === 0) byProject.set("", [])
  const rel = (path: string, project: string) =>
    project && path.startsWith(`${project}/`) ? path.slice(project.length + 1) : path
  return [...byProject]
    .map(([project, group]) => {
      const command = runner.command({
        ...scope,
        file: scope.file ? rel(scope.file, project) : undefined,
        files: group.map((f) => rel(f.path, project)),
      })
      return project ? `cd ${shellQuote(`${root}/${project}`)} && ${command}` : command
    })
    .join("; ")
}

/** Distinct per run, so two runs never share a PTY or its listeners. */
let runSeq = 0

/** How to end the run in flight — set while one is, so the panel's Stop has
 *  something to call. One at a time is the panel's own rule: it disables a
 *  second run rather than racing it. */
let endRun: (() => void) | null = null

/** Stop the run in flight: the shell is killed, and whatever it had already
 *  reported stands. A test still marked running has simply not been judged. */
export function stopTests(): void {
  endRun?.()
}

/** A run that has gone this long without printing anything is over as far as the
 *  panel is concerned — the backstop for a framework that never exits. */
const SILENCE_MS = 120_000

/**
 * Run a scope — one test, one file, or every test of one framework — in a
 * hidden PTY, marking what the output reports as it arrives.
 *
 * The shell is told to `exit` after the command, so the run ends on
 * `pty-exit` rather than on a guess about how long silence means "finished".
 */
export async function runTests(scope: Scope): Promise<void> {
  const root = useProject.getState().root
  const runner = RUNNERS[scope.framework]
  if (!root || !runner) return

  const id = `tests-${++runSeq}`
  useTesting.setState({ running: true })
  // A run in flight is the agent's other kind of work: the companion shows it
  // thinking, and its verdict below.
  useMascot.getState().working()

  // The tests this run is about are pending until the output says otherwise, so
  // a rerun clears the last verdict instead of showing it as current.
  const inScope = useTesting
    .getState()
    .files.filter((f) => (scope.file ? f.path === scope.file : f.framework === scope.framework))
  const affected: string[] = []
  // Ids by their last segment, so a printed verdict is a lookup instead of a
  // scan of every test in the run — which is quadratic on a real suite.
  const byLeaf = new Map<string, string[]>()
  // …and the handful whose name is a template, which no lookup can find.
  const dynamic: Dynamic[] = []
  for (const f of inScope)
    for (const test of f.tests) {
      if (scope.name && test.name !== scope.name) continue
      const id = testId(f.path, test.suites, test.name)
      affected.push(id)
      byLeaf.set(test.name, [...(byLeaf.get(test.name) ?? []), id])
      const re = namePattern(test.name)
      if (re) dynamic.push({ id, re })
    }
  const write = (results: Record<string, Result>) =>
    useTesting.setState((s) => ({
      byRoot: { ...s.byRoot, [root]: { ...(s.byRoot[root] ?? {}), ...results } },
    }))
  // `at: 0` — running is not a verdict, so it has no age and never reads stale.
  write(Object.fromEntries(affected.map((k) => [k, { status: "running" as const, at: 0 }])))

  const command = commandFor(runner, root, inScope, scope)
  // The tail of what the run printed: with no pane to scroll back through, this
  // is the only place a failure's stack trace survives.
  let tail = ""
  let off: UnlistenFn | null = null
  let unExit: UnlistenFn | null = null
  let silent = 0
  let done = false
  const stop = () => {
    if (done) return
    done = true
    endRun = null
    offSafe(off)
    offSafe(unExit)
    clearTimeout(silent)
    void ptyKill(id).catch(() => {})
    // A test the run ended without judging — stopped, crashed, or filtered out
    // by the framework — goes back to having no verdict rather than spinning for
    // the rest of the session. Only one run is ever in flight, so every verdict
    // still reading "running" belongs to this one.
    useTesting.setState((s) => ({
      running: false,
      byRoot: {
        ...s.byRoot,
        [root]: Object.fromEntries(
          Object.entries(s.byRoot[root] ?? {}).filter(([, v]) => v.status !== "running"),
        ),
      },
    }))
    // What the run said, for a reader who is not watching the tree redraw.
    const results = resultsFor(useTesting.getState().byRoot, root)
    const seen = affected.map((k) => results[k]?.status)
    const failed = seen.filter((v) => v === "fail").length
    const passed = seen.filter((v) => v === "pass").length
    if (failed > 0 || failed + passed === 0) log.warn("run output", { command, output: tail })
    if (failed + passed === 0) return
    useMascot.getState().tested(failed)
    cue(failed > 0 ? "error" : "success")
    announce(t("tests.finished", { passed, failed }), { assertive: failed > 0 })
  }
  endRun = stop

  // One template declaration stands for many printed tests, so the same id is
  // written several times in a run. A failure among them is the answer: a later
  // sibling's pass must not paint it green.
  const failed = new Set<string>()
  // The distinct names each row was reported under, which is how many tests it
  // stands for. One for an ordinary test; two hundred for a declaration in a
  // loop over two hundred cases.
  const cases = new Map<string, Set<string>>()
  // Assigned after the await: if `stop()` already ran (a fast failure, a second
  // run starting), there was nothing for it to unsubscribe and the subscription
  // outlived the run it belonged to.
  const subLines = await listenPtyLines(id, (line) => {
    tail = `${tail}${plainText(line)}\n`.slice(-8000)
    const verdict = runner.read(line)
    if (verdict) {
      const at = Date.now()
      const leaf = verdict.path[verdict.path.length - 1]
      const keys = idsFor(byLeaf, verdict.path, dynamic)
      if (verdict.status === "fail") for (const key of keys) failed.add(key)
      for (const key of keys) {
        const seen = cases.get(key) ?? new Set<string>()
        seen.add(leaf)
        cases.set(key, seen)
      }
      write(
        Object.fromEntries(
          keys
            .filter((key) => verdict.status === "fail" || !failed.has(key))
            .map((key) => [key, { status: verdict.status, at, cases: cases.get(key)?.size }]),
        ),
      )
    }
    clearTimeout(silent)
    silent = window.setTimeout(stop, SILENCE_MS)
  })
  const subExit = await listen(`pty-exit-${id}`, () => stop())
  if (done) {
    offSafe(subLines)
    offSafe(subExit)
    return
  }
  off = subLines
  unExit = subExit
  silent = window.setTimeout(stop, SILENCE_MS)
  try {
    await ptySpawn(id, root, 24, 200)
  } catch (e) {
    log.error("test shell failed to start", { command, error: safeError(e) })
    stop()
    return
  }
  submitToTerminal(id, command, 200)
  // `exit` closes the shell once the run returns, which is what fires
  // `pty-exit`; it is spelled the same in every shell Reado can be pointed at.
  submitToTerminal(id, "exit", 400)
}
