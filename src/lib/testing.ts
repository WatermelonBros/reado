/**
 * The Test Explorer's half of the job: what to run, how to run it, and what the
 * output said.
 *
 * Discovery is Rust's (`discover_tests`). Running is a terminal pane, the same
 * way a task runs: a test run is a command whose colour, progress and stack
 * traces are worth seeing exactly as the framework prints them, and a captured
 * pipe throws all three away. What this module adds on the way past is a
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
import type { UnlistenFn } from "@tauri-apps/api/event"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { t } from "@/i18n"
import { announce, cue } from "./a11y"
import { discoverTests, ptyWrite, type TestFile } from "./api"
import { createLogger, safeError } from "./logger"
import { useProject } from "./store"
import { listenPtyLines, plainText, shellQuote, useTerminals } from "./terminals"

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

/** How to ask a framework to run something, and how to read what it says. */
export interface Runner {
  /** The command for one test, one file, or the whole project. */
  command: (scope: { file?: string; suites?: string[]; name?: string }) => string
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
    // about files — so a file-scoped run falls back to the whole crate.
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
}

interface TestingState {
  files: TestFile[]
  /** The terminal pane test runs reuse. */
  paneId: string | null
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
      paneId: null,
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
    },
  ),
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

/**
 * Which tests a printed verdict is about.
 *
 * `byLeaf` maps a test's last segment to every id in the run that ends with it.
 * A framework that printed a path narrows that to the ids whose own tail matches
 * it, which is what tells two tests of the same name in one file apart; one that
 * printed only a leaf matches them all, which is the best that can be done with
 * what it said.
 */
export function idsFor(byLeaf: Map<string, string[]>, path: string[]): string[] {
  const candidates = byLeaf.get(path[path.length - 1]) ?? []
  const tail = SEP + path.join(SEP)
  const exact = candidates.filter((key) => (SEP + key).endsWith(tail))
  return exact.length > 0 ? exact : candidates
}

/**
 * Run a scope — one test, one file, or every test of one framework — in a
 * terminal pane, marking what the output reports as it arrives.
 *
 * One pane, reused: a pane per run is a pile nobody reads.
 */
export async function runTests(scope: {
  framework: string
  file?: string
  suites?: string[]
  name?: string
}): Promise<void> {
  const root = useProject.getState().root
  const runner = RUNNERS[scope.framework]
  if (!root || !runner) return

  const terminals = useTerminals.getState()
  if (!terminals.open) terminals.toggle()
  const existing = useTesting.getState().paneId
  const alive = existing && terminals.sessions.some((s) => s.id === existing)
  const id = alive ? existing : terminals.add(root)
  useTerminals.getState().setTitle(id, "tests")
  useTesting.setState({ paneId: id, running: true })

  // The tests this run is about are pending until the output says otherwise, so
  // a rerun clears the last verdict instead of showing it as current.
  const affected = useTesting
    .getState()
    .files.filter((f) => (scope.file ? f.path === scope.file : f.framework === scope.framework))
    .flatMap((f) =>
      f.tests
        .filter((test) => !scope.name || test.name === scope.name)
        .map((test) => testId(f.path, test.suites, test.name)),
    )
  // Ids by their last segment, so a printed verdict is a lookup instead of a
  // scan of every test in the run — which is quadratic on a real suite.
  const byLeaf = new Map<string, string[]>()
  for (const key of affected) {
    const leaf = key.slice(key.lastIndexOf(SEP) + SEP.length)
    byLeaf.set(leaf, [...(byLeaf.get(leaf) ?? []), key])
  }
  const write = (results: Record<string, Result>) =>
    useTesting.setState((s) => ({
      byRoot: { ...s.byRoot, [root]: { ...(s.byRoot[root] ?? {}), ...results } },
    }))
  // `at: 0` — running is not a verdict, so it has no age and never reads stale.
  write(Object.fromEntries(affected.map((k) => [k, { status: "running" as const, at: 0 }])))

  let off: UnlistenFn | null = null
  let idle = 0
  const stop = () => {
    void off?.()
    off = null
    clearTimeout(idle)
    useTesting.setState({ running: false })
    // What the run said, for a reader who is not watching the pane scroll past.
    const results = resultsFor(useTesting.getState().byRoot, root)
    const seen = affected.map((k) => results[k]?.status)
    const failed = seen.filter((v) => v === "fail").length
    const passed = seen.filter((v) => v === "pass").length
    if (failed + passed === 0) return
    cue(failed > 0 ? "error" : "success")
    announce(t("tests.finished", { passed, failed }), { assertive: failed > 0 })
  }

  off = await listenPtyLines(id, (line) => {
    const verdict = runner.read(line)
    if (verdict) {
      const at = Date.now()
      write(
        Object.fromEntries(
          idsFor(byLeaf, verdict.path).map((key) => [key, { status: verdict.status, at }]),
        ),
      )
    }
    // A run that has stopped printing has finished, as far as the reader is
    // concerned. Watch mode simply keeps the listener a little longer.
    clearTimeout(idle)
    idle = window.setTimeout(stop, 4000)
  })
  await ptyWrite(id, `${runner.command(scope)}\r`)
}
