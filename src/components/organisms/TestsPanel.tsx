/**
 * The Test Explorer: the project's tests as a tree, each one runnable from where
 * it is written.
 *
 * The list is read out of the source rather than asked of a framework, so it is
 * there before anything is installed and costs nothing to show. Running is the
 * framework's job — the run happens in a terminal pane where its output reads
 * normally — and what comes back is a tick, a cross, or nothing, per test.
 *
 * A test row is also a link: clicking the name opens the file at the line it is
 * declared on, which is the thing you actually want after reading a failure.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { CheckIcon, ChevronIcon, CloseIcon, RefreshIcon, SyncIcon } from "@/components/atoms/icons"
import type { TestFile, TestItem } from "@/lib/api"
import { useProject } from "@/lib/store"
import {
  isStale,
  type Result,
  resultsFor,
  runTests,
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

  /** The frameworks present, so "run everything" can mean one command each. */
  const frameworks = useMemo(() => [...new Set(files.map((f) => f.framework))], [files])
  const total = files.reduce((n, f) => n + f.tests.length, 0)

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
        <IconButton
          label={t("tests.runAll")}
          icon={<SyncIcon className="h-3.5 w-3.5" />}
          size="sm"
          disabled={running}
          onClick={() => {
            for (const framework of frameworks) void runTests({ framework })
          }}
        />
        <IconButton
          label={t("tests.refresh")}
          icon={<RefreshIcon className="h-3.5 w-3.5" />}
          size="sm"
          onClick={() => void useTesting.getState().load(root)}
        />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {shown.map(({ file, rows, status }) => {
          const isCollapsed = collapsed[file.path]
          return (
            <li key={file.path}>
              <div className="flex w-full items-center gap-1 px-2 py-1 hover:bg-surface">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [file.path]: !c[file.path] }))}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <ChevronIcon
                    className={`h-3 w-3 flex-none text-faint transition-transform ${
                      isCollapsed ? "" : "rotate-90"
                    }`}
                  />
                  <Status status={status} stale={rows.every((r) => r.stale)} />
                  <span className="min-w-0 truncate text-xs text-ink">{file.path}</span>
                  <span className="flex-none text-[10px] text-faint">{rows.length}</span>
                </button>
                <IconButton
                  label={t("tests.runFile")}
                  icon={<SyncIcon className="h-3 w-3" />}
                  size="xs"
                  disabled={running}
                  onClick={() => void runTests({ framework: file.framework, file: file.path })}
                />
              </div>
              {!isCollapsed && (
                <ul>
                  {rows.map((row) => (
                    <li key={row.id} className="flex items-center gap-1 pr-2 pl-6 hover:bg-surface">
                      <Status status={row.result?.status} stale={row.stale} />
                      <button
                        type="button"
                        onClick={() => open(`${root}/${file.path}`, row.line)}
                        className="flex min-w-0 flex-1 items-baseline gap-1.5 py-0.5 text-left"
                        title={row.stale ? t("tests.stale") : undefined}
                      >
                        {row.suites.length > 0 && (
                          <span className="flex-none truncate text-[10px] text-faint">
                            {row.suites.join(" › ")}
                          </span>
                        )}
                        <span
                          className={`min-w-0 truncate text-xs ${
                            row.result?.status === "fail" && !row.stale
                              ? "text-marker"
                              : "text-muted"
                          }`}
                        >
                          {row.name}
                        </span>
                        {row.stale && (
                          <span className="flex-none text-[10px] text-faint">
                            {t("tests.staleShort")}
                          </span>
                        )}
                      </button>
                      <IconButton
                        label={t("tests.runOne")}
                        icon={<SyncIcon className="h-3 w-3" />}
                        size="xs"
                        disabled={running}
                        onClick={() =>
                          void runTests({
                            framework: file.framework,
                            file: file.path,
                            suites: row.suites,
                            name: row.name,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <p className="flex-none border-t border-line px-3 py-1 text-[10px] text-faint">
        {t("tests.count", { n: total, files: files.length })}
      </p>
    </div>
  )
}
