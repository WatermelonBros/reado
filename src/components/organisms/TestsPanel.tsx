/**
 * The Test Explorer: the project's tests as a tree, each one runnable from where
 * it is written.
 *
 * The list is read out of the source rather than asked of a framework, so it is
 * there before anything is installed and costs nothing to show. Running is the
 * framework's job — in a PTY the user never sees, so no terminal is hijacked —
 * and what comes back is a tick, a cross, or nothing, per test.
 *
 * A test row is also a link: clicking the name opens the file at the line it is
 * declared on, which is the thing you actually want after reading a failure.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CollapseAllIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  SyncIcon,
} from "@/components/atoms/icons"
import type { TestFile, TestItem } from "@/lib/api"
import { useProject } from "@/lib/store"
import {
  isStale,
  type Result,
  resultsFor,
  runTests,
  stopTests,
  type TestStatus,
  testId,
  useTesting,
} from "@/lib/testing"

/** The dot beside a test: its verdict, or nothing when it has not run. A verdict
 *  whose file has changed since the run is drawn faded and says so — it is still
 *  the last thing that happened, but it is no longer a claim about this code. */
function Status({ status, stale }: { status: TestStatus | undefined; stale?: boolean }) {
  const faded = stale ? "opacity-40" : ""
  if (status === "pass")
    return (
      <CheckIcon className={`h-3.5 w-3.5 flex-none text-[var(--ok,var(--syn-string))] ${faded}`} />
    )
  if (status === "fail")
    return <CloseIcon className={`h-3.5 w-3.5 flex-none text-marker ${faded}`} />
  if (status === "running")
    return <SyncIcon className="h-3.5 w-3.5 flex-none animate-spin text-muted" />
  return <span className="h-3.5 w-3.5 flex-none" />
}

/** One test with its id and how it last went — resolved once, in the memo below,
 *  rather than per render: resolving means joining the id back together. */
interface Row extends TestItem {
  id: string
  result: Result | undefined
  stale: boolean
}

/** One line of the flattened tree — a file header, or a test under it. The tree
 *  is drawn from a flat list because only a flat list can be windowed: a project
 *  with tens of thousands of tests would otherwise put every one of them in the
 *  DOM to show the twenty that fit. */
type ListRow =
  | { kind: "file"; key: string; file: TestFile; rows: Row[]; status: TestStatus | undefined }
  | { kind: "test"; key: string; file: TestFile; row: Row }

/** Every row is drawn this tall, so the window is arithmetic instead of a
 *  measurement. `h-6` on both row kinds is what makes it true. */
const ROW_H = 24

/** Rows kept in the DOM either side of the scroll position. Deliberately far
 *  more than fit: a panel is never 100 rows tall, so nothing has to be measured
 *  and a resize needs no recompute. */
const WINDOW = 100

/** Roll a file's tests up into one verdict: a single failure colours the file. */
function fileStatus(rows: Row[]): TestStatus | undefined {
  if (rows.some((r) => r.result?.status === "running")) return "running"
  if (rows.some((r) => r.result?.status === "fail")) return "fail"
  if (rows.length > 0 && rows.every((r) => r.result?.status === "pass")) return "pass"
  return undefined
}

export function TestsPanel() {
  const root = useProject((s) => s.root)
  const open = useProject((s) => s.open)
  const { t } = useTranslation()
  const files = useTesting((s) => s.files)
  const byRoot = useTesting((s) => s.byRoot)
  const loading = useTesting((s) => s.loading)
  const running = useTesting((s) => s.running)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState("")
  /** Where the list is scrolled to — the only input the window needs. */
  const [scrollTop, setScrollTop] = useState(0)
  /** The row under the pointer, which is the only row that draws a run button.
   *  Measured: an `IconButton` carries an Ark tooltip, and three hundred of them
   *  cost ~90ms to render — five frames, which a flick of the trackpad outruns
   *  and leaves the list blank. One is free. */
  const [hovered, setHovered] = useState<string | null>(null)

  /** The tree as it is drawn: filtered, with every id and verdict resolved once. */
  const shown = useMemo(() => {
    const results = resultsFor(byRoot, root)
    const needle = filter.trim().toLowerCase()
    const matches = (file: TestFile, test: TestItem) =>
      !needle ||
      test.name.toLowerCase().includes(needle) ||
      file.path.toLowerCase().includes(needle) ||
      test.suites.some((s) => s.toLowerCase().includes(needle))
    return files
      .map((file) => {
        const rows: Row[] = file.tests
          .filter((test) => matches(file, test))
          .map((test) => {
            const id = testId(file.path, test.suites, test.name)
            const result = results[id]
            return { ...test, id, result, stale: isStale(file, result) }
          })
        return { file, rows, status: fileStatus(rows) }
      })
      .filter((group) => group.rows.length > 0)
  }, [files, byRoot, root, filter])

  /** The same tree, flattened to the lines actually drawn — a collapsed file
   *  contributes its header and nothing else. */
  const list = useMemo<ListRow[]>(
    () =>
      shown.flatMap(({ file, rows, status }) => [
        { kind: "file" as const, key: file.path, file, rows, status },
        ...(collapsed[file.path]
          ? []
          : rows.map((row) => ({ kind: "test" as const, key: row.id, file, row }))),
      ]),
    [shown, collapsed],
  )

  /** Whether the one button is "collapse all" or "expand all" — the same
   *  arrows either way, so it never sits there doing nothing. */
  const anyExpanded = shown.some((g) => !collapsed[g.file.path])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - WINDOW)
  const last = Math.min(list.length, first + WINDOW * 3)

  /** How the project stands: every test, and what the last run said about it.
   *  Counted over all the files, not the filtered ones — the header answers "how
   *  many are there and how many are green", which a filter must not change.
   *
   *  A row counts for as many tests as the last run reported it under: a
   *  declaration in a loop is one line of source and two hundred tests, and
   *  counting it once is what made this total read lower than the framework's.
   *  Until a run says otherwise, one row is one test — the honest guess. */
  const tally = useMemo(() => {
    const results = resultsFor(byRoot, root)
    let total = 0
    let pass = 0
    let fail = 0
    let running = 0
    let skip = 0
    for (const file of files)
      for (const test of file.tests) {
        const result = results[testId(file.path, test.suites, test.name)]
        const n = result?.cases ?? 1
        total += n
        if (result?.status === "pass") pass += n
        else if (result?.status === "fail") fail += n
        else if (result?.status === "running") running += n
        else if (result?.status === "skip") skip += n
      }
    // Everything else has no verdict: never run, or run by a framework that
    // could not be matched back to it (a test whose name is built at runtime —
    // `it(`${tool} renders…`)` — is printed expanded and read here as written).
    // Shown rather than left implicit: the numbers have to add up, otherwise the
    // strip reads as "nothing failed" while a third of the tree is blank.
    return { total, pass, fail, running, none: total - pass - fail - running - skip, skip }
  }, [files, byRoot, root])

  /** The frameworks present, so "run everything" can mean one command each. */
  const frameworks = useMemo(() => [...new Set(files.map((f) => f.framework))], [files])

  if (loading && files.length === 0)
    return <p className="p-3 text-xs text-faint">{t("common.loading")}</p>

  if (files.length === 0)
    return (
      <div className="p-3">
        <p className="text-xs text-faint">{t("tests.empty")}</p>
      </div>
    )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("tests.filter")}
          aria-label={t("tests.filter")}
          className="min-w-0 flex-1 py-1 text-xs"
        />
        {running ? (
          <IconButton
            label={t("tests.stop")}
            icon={<StopIcon className="h-3.5 w-3.5" />}
            size="sm"
            danger
            onClick={stopTests}
          />
        ) : (
          <IconButton
            label={t("tests.runAll")}
            icon={<PlayIcon className="h-3.5 w-3.5" />}
            size="sm"
            onClick={() => {
              for (const framework of frameworks) void runTests({ framework })
            }}
          />
        )}
        <IconButton
          label={t(anyExpanded ? "tests.collapseAll" : "tests.expandAll")}
          icon={<CollapseAllIcon className="h-3.5 w-3.5" />}
          size="sm"
          onClick={() =>
            setCollapsed(
              anyExpanded ? Object.fromEntries(shown.map((g) => [g.file.path, true])) : {},
            )
          }
        />
        <IconButton
          label={t("tests.refresh")}
          icon={<RefreshIcon className="h-3.5 w-3.5" />}
          size="sm"
          onClick={() => void useTesting.getState().load(root)}
        />
      </div>

      <p className="flex flex-none items-center gap-2 border-b border-line px-3 py-1 text-[10px] text-faint">
        <span>{t("tests.count", { n: tally.total, files: files.length })}</span>
        <span className="text-[var(--ok,var(--syn-string))]">
          {t("tests.passed", { n: tally.pass })}
        </span>
        <span className={tally.fail > 0 ? "text-marker" : undefined}>
          {t("tests.failed", { n: tally.fail })}
        </span>
        {tally.skip > 0 && <span>{t("tests.skipped", { n: tally.skip })}</span>}
        {tally.none > 0 && <span>{t("tests.notRun", { n: tally.none })}</span>}
        {tally.running > 0 && <span>{t("tests.runningCount", { n: tally.running })}</span>}
      </p>

      <ul
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {/* The rows above and below the window, as height rather than as DOM —
            what keeps the scrollbar honest about how long the list is. */}
        <li style={{ height: first * ROW_H }} aria-hidden />
        {list.slice(first, last).map((item) =>
          item.kind === "file" ? (
            <li
              key={item.key}
              className="flex h-6 w-full items-center gap-1 px-2 hover:bg-surface"
              onMouseEnter={() => setHovered(item.key)}
            >
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [item.file.path]: !c[item.file.path] }))
                }
                className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                aria-expanded={!collapsed[item.file.path]}
              >
                <ChevronIcon
                  className={`h-3 w-3 flex-none text-faint transition-transform ${
                    collapsed[item.file.path] ? "" : "rotate-90"
                  }`}
                />
                <Status status={item.status} stale={item.rows.every((r) => r.stale)} />
                <span className="min-w-0 truncate text-xs text-ink">{item.file.path}</span>
                <span className="flex-none text-[10px] text-faint">{item.rows.length}</span>
              </button>
              {hovered === item.key ? (
                <IconButton
                  label={t("tests.runFile")}
                  icon={<PlayIcon className="h-3 w-3" />}
                  size="xs"
                  disabled={running}
                  onClick={() =>
                    void runTests({ framework: item.file.framework, file: item.file.path })
                  }
                />
              ) : (
                <span className="h-5 w-5 flex-none" />
              )}
            </li>
          ) : (
            <li
              key={item.key}
              className="flex h-6 items-center gap-1 pr-2 pl-6 hover:bg-surface"
              onMouseEnter={() => setHovered(item.key)}
            >
              <Status status={item.row.result?.status} stale={item.row.stale} />
              <button
                type="button"
                onClick={() => open(`${root}/${item.file.path}`, item.row.line)}
                className="flex h-full min-w-0 flex-1 items-baseline gap-1.5 text-left"
                title={item.row.stale ? t("tests.stale") : undefined}
              >
                {item.row.suites.length > 0 && (
                  <span className="flex-none truncate text-[10px] text-faint">
                    {item.row.suites.join(" › ")}
                  </span>
                )}
                <span
                  className={`min-w-0 truncate text-xs ${
                    item.row.result?.status === "fail" && !item.row.stale
                      ? "text-marker"
                      : "text-muted"
                  }`}
                >
                  {item.row.name}
                </span>
                {(item.row.result?.cases ?? 1) > 1 && (
                  <span
                    className="flex-none text-[10px] text-faint"
                    title={t("tests.cases", { n: item.row.result?.cases ?? 1 })}
                  >
                    ×{item.row.result?.cases}
                  </span>
                )}
                {item.row.stale && (
                  <span className="flex-none text-[10px] text-faint">{t("tests.staleShort")}</span>
                )}
              </button>
              {hovered === item.key ? (
                <IconButton
                  label={t("tests.runOne")}
                  icon={<PlayIcon className="h-3 w-3" />}
                  size="xs"
                  disabled={running}
                  onClick={() =>
                    void runTests({
                      framework: item.file.framework,
                      file: item.file.path,
                      suites: item.row.suites,
                      name: item.row.name,
                    })
                  }
                />
              ) : (
                <span className="h-5 w-5 flex-none" />
              )}
            </li>
          ),
        )}
        <li style={{ height: (list.length - last) * ROW_H }} aria-hidden />
      </ul>
    </div>
  )
}
