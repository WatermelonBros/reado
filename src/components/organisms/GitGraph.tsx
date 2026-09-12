/**
 * The history as a graph: every branch at once, with the lanes drawn.
 *
 * The Timeline panel answers "what happened to this file"; this answers "what
 * shape is this repository in" — where a branch left the trunk, which commits a
 * merge brought in, what a tag is actually pointing at. Reading that out of
 * `git log --graph` in a terminal is the thing people install a GUI for.
 *
 * Lanes are assigned the way git's own graph does it: walking newest to oldest,
 * each commit takes the lane that was waiting for it (or the first free one),
 * then hands that lane to its first parent and gives any further parent — a
 * merge's other side — a lane of its own. Lanes are freed the moment nothing is
 * waiting in them, so a long history stays a few columns wide instead of one
 * column per branch that ever existed.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { type GraphCommit, gitGraph } from "@/lib/api"
import { useEditorActions, useProject, useWorkspace } from "@/lib/store"

/** Row height and lane pitch, in px — the two numbers the SVG is drawn from. */
const ROW = 28
const LANE = 14
/** How many commits to read. Past a few hundred the graph is a texture, not a
 *  thing to read; "More" asks for the next slab. */
const PAGE = 300

/** Lane colours, cycled. Semantic theme tokens, so they follow the theme. */
const COLORS = [
  "var(--accent)",
  "var(--syn-string)",
  "var(--syn-keyword)",
  "var(--syn-number)",
  "var(--syn-control)",
  "var(--marker)",
]
const laneColor = (lane: number) => COLORS[lane % COLORS.length]

interface Placed {
  commit: GraphCommit
  row: number
  lane: number
  /** One line per parent: where it starts (this commit) and the lane it lands
   *  in. The row is resolved later, once every commit has one. */
  edges: Array<{ parent: string; lane: number }>
}

/**
 * Assign a lane to each commit and record the lines between them.
 *
 * Exported for the test: lane assignment is the whole of this component's
 * logic, and it is the kind that is wrong in a way a screenshot hides.
 */
export function layout(commits: GraphCommit[]): { placed: Placed[]; width: number } {
  // `lanes[i]` is the hash lane `i` is currently waiting for; null means free.
  const lanes: (string | null)[] = []
  const take = (hash: string, from = 0): number => {
    const existing = lanes.indexOf(hash)
    if (existing >= 0) return existing
    for (let i = from; i < lanes.length; i++) {
      if (lanes[i] === null) {
        lanes[i] = hash
        return i
      }
    }
    lanes.push(hash)
    return lanes.length - 1
  }
  const placed: Placed[] = commits.map((commit, row) => {
    const lane = take(commit.hash)
    // Every other lane waiting for this same commit has just converged here.
    lanes.forEach((h, i) => {
      if (h === commit.hash && i !== lane) lanes[i] = null
    })
    // The first parent keeps this lane; the rest branch off into their own.
    lanes[lane] = commit.parents[0] ?? null
    const edges = commit.parents.map((parent, i) => ({
      parent,
      lane: i === 0 ? lane : take(parent, lane + 1),
    }))
    return { commit, row, lane, edges }
  })
  const width = placed.reduce((w, p) => Math.max(w, ...p.edges.map((e) => e.lane), p.lane), 0) + 1
  return { placed, width }
}

/** One commit's row. */
function CommitRow({
  commit,
  selected,
  onSelect,
}: {
  commit: GraphCommit
  selected: boolean
  onSelect: (hash: string | null) => void
}) {
  return (
    <li>
      <button
        type="button"
        style={{ height: ROW }}
        onClick={() => onSelect(selected ? null : commit.hash)}
        className={`flex w-full items-center gap-3 px-3 text-left text-sm hover:bg-surface ${
          selected ? "bg-surface" : ""
        }`}
      >
        {commit.refs.map((r) => (
          <span
            key={r}
            className="flex-none rounded border border-line px-1 text-[10px] text-muted"
          >
            {r}
          </span>
        ))}
        <span className="min-w-0 flex-1 truncate text-ink">{commit.subject}</span>
        <span className="flex-none truncate text-xs text-faint">{commit.author}</span>
        <span className="w-24 flex-none truncate text-right text-xs text-faint">{commit.date}</span>
        <span className="w-16 flex-none text-right font-mono text-[10px] text-faint">
          {commit.hash.slice(0, 7)}
        </span>
      </button>
    </li>
  )
}

export function GitGraph() {
  const root = useProject((s) => s.root)
  const close = useWorkspace((s) => s.toggleGitGraph)
  const { t } = useTranslation()
  const [commits, setCommits] = useState<GraphCommit[] | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    gitGraph(root, limit)
      .then(setCommits)
      .catch(() => setCommits([]))
  }, [root, limit])

  const { placed, width } = useMemo(() => layout(commits ?? []), [commits])
  const rowOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of placed) m.set(p.commit.hash, p.row)
    return m
  }, [placed])

  const x = (lane: number) => lane * LANE + LANE / 2
  const y = (row: number) => row * ROW + ROW / 2

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) close(false)
      }}
      ariaLabel={t("gitGraph.title")}
      className="flex h-[86vh] w-[94vw] max-w-[1320px] flex-col overflow-hidden bg-canvas"
    >
      <header className="flex flex-none items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="m-0 text-sm font-medium">{t("gitGraph.title")}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-faint">
            {t("gitGraph.count", { n: placed.length })}
          </span>
          <IconButton label={t("common.close")} icon={<CloseIcon />} onClick={() => close(false)} />
        </div>
      </header>

      {commits === null ? (
        <p className="grid flex-1 place-items-center text-sm text-faint">{t("common.loading")}</p>
      ) : placed.length === 0 ? (
        <p className="grid flex-1 place-items-center text-sm text-faint">{t("gitGraph.empty")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="relative flex">
            {/* The lanes. One SVG for the whole history rather than one per
                row: an edge spans rows, and a per-row clip would cut it. */}
            <svg
              className="flex-none"
              width={width * LANE + LANE}
              height={placed.length * ROW}
              aria-hidden="true"
            >
              <title>{t("gitGraph.title")}</title>
              {placed.map((p) =>
                p.edges.map((e) => {
                  const to = rowOf.get(e.parent)
                  // A parent outside the window: a stub down to the edge, so
                  // the lane does not simply stop mid-air.
                  const endY = to === undefined ? placed.length * ROW : y(to)
                  const endX = to === undefined ? x(e.lane) : x(placed[to].lane)
                  const mid = y(p.row) + ROW / 2
                  return (
                    <path
                      key={`${p.commit.hash}-${e.parent}`}
                      d={`M ${x(p.lane)} ${y(p.row)} L ${x(p.lane)} ${mid} L ${endX} ${mid + ROW / 2} L ${endX} ${endY}`}
                      fill="none"
                      stroke={laneColor(e.lane)}
                      strokeWidth={1.5}
                      opacity={0.7}
                    />
                  )
                }),
              )}
              {placed.map((p) => (
                <circle
                  key={p.commit.hash}
                  cx={x(p.lane)}
                  cy={y(p.row)}
                  r={p.commit.parents.length > 1 ? 4.5 : 3.5}
                  fill={p.commit.parents.length > 1 ? "var(--bg-canvas)" : laneColor(p.lane)}
                  stroke={laneColor(p.lane)}
                  strokeWidth={1.5}
                />
              ))}
            </svg>

            <ul className="min-w-0 flex-1">
              {placed.map((p) => (
                <CommitRow
                  key={p.commit.hash}
                  commit={p.commit}
                  selected={selected === p.commit.hash}
                  onSelect={setSelected}
                />
              ))}
            </ul>
          </div>
          {commits.length >= limit && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              {t("gitGraph.more")}
            </Button>
          )}
        </div>
      )}
      {selected && (
        <footer className="flex flex-none items-center gap-3 border-t border-line px-4 py-2 text-xs text-muted">
          <span className="font-mono text-faint">{selected.slice(0, 12)}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // The editor already diffs against any ref; picking one here is
              // the shortest path from "that commit" to "what it changed".
              useEditorActions.getState().setDiffBase(selected)
              useEditorActions.getState().requestView("diff")
              close(false)
            }}
          >
            {t("gitGraph.diff")}
          </Button>
        </footer>
      )}
    </Modal>
  )
}
