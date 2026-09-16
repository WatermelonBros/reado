/**
 * The Review Guide panel — the cockpit of a Guided Pair Review.
 *
 * The code stays the hero in the editor; this panel surfaces the session's
 * state without scraping it: the current file and the agent's reason for it, the
 * proposed artifacts to dispose of, the route queue, open questions, the running
 * summary and progress. Every LLM artifact is a proposal the human accepts,
 * edits, converts, defers or discards — never auto-final.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { TYPE_COLOR } from "@/components/atoms/commentMeta"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import { MoreIcon, RouteIcon, SparkleIcon, WarningIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { ResolveLoopBar } from "@/components/molecules/ResolveLoopBar"
import type { MessageKey } from "@/i18n"
import { sanitizePromptText } from "@/lib/agents"
import type { FileState, Objective, Proposal, Session, Verdict } from "@/lib/api"
import { gitBranches } from "@/lib/api"
import { cn } from "@/lib/cn"
import { useComments } from "@/lib/comments"
import { useForge } from "@/lib/forge"
import {
  currentEntry,
  openProposals,
  progress,
  uncoveredFiles,
  useGuidedReview,
} from "@/lib/guidedReview"
import { useProject, useSettings } from "@/lib/store"

/** What a new review runs over. Three are git-scoped (a concrete file set); the
 *  fourth lets the agent decide from a free-text description. */
type Source = "diff" | "branch" | "pr" | "prompt"

/** The overflow trigger: a square the size of a chip, so a cluster of actions
 *  keeps one height and one rhythm however many of them there are. */
const MENU_TRIGGER =
  "inline-flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line text-muted transition-colors hover:bg-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"

/** How many uncovered files the gap lists before deferring to its own count. */
const UNCOVERED_SHOWN = 8

const OBJECTIVES: Objective[] = [
  "bug_risk",
  "design",
  "maintainability",
  "security",
  "performance",
  "test_coverage",
  "ai_sanity",
  "onboarding",
  "general",
]

/** Short label + tone for a per-file state badge. */
function fileStateTone(state: FileState): string {
  switch (state) {
    case "reviewed":
      return "text-accent"
    case "in_review":
      return "text-ink"
    case "needs_followup":
    case "blocked":
      return "text-marker"
    case "skipped":
    case "out_of_scope":
      return "text-faint line-through"
    default:
      return "text-faint"
  }
}

export function GuidedReviewPanel() {
  const root = useProject((s) => s.root)
  const sessions = useGuidedReview((s) => s.sessions)
  const currentId = useGuidedReview((s) => s.currentId)
  const busy = useGuidedReview((s) => s.busy)
  const pending = useGuidedReview((s) => s.pending)

  const session = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? null,
    [sessions, currentId],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header session={session} sessions={sessions} busy={busy} pending={pending} />
      <ErrorRow />
      <ResolveLoopBar />
      {session ? (
        <SessionView key={session.id} root={root} session={session} />
      ) : (
        <EmptyState root={root} />
      )}
    </div>
  )
}

function Header({
  session,
  sessions,
  busy,
  pending,
}: {
  session: Session | null
  sessions: Session[]
  busy: string | null
  pending: string | null
}) {
  const select = useGuidedReview((s) => s.select)
  const { t } = useTranslation()
  // Two different truths, and the panel used to tell neither: the prompt is
  // still being typed into the pane, or it was delivered and the agent is
  // working in a window this panel cannot see. The header carries them because
  // it is the one region that never scrolls away.
  const status = busy ? t("guided.sending") : pending ? t("guided.waiting") : null
  return (
    <div className="flex flex-none items-center gap-2 border-b border-line px-2 py-1.5">
      <RouteIcon className="h-3.5 w-3.5 flex-none text-faint" />
      {sessions.length > 1 ? (
        <div className="min-w-0 flex-1">
          <Select
            value={session?.id ?? sessions[0].id}
            options={sessions.map((s) => ({ value: s.id, label: s.title }))}
            onChange={(id) => select(id)}
            variant="ghost"
            ariaLabel={t("guided.panel")}
            className="w-full"
          />
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">
          {session?.title ?? t("guided.panel")}
        </span>
      )}
      {status && (
        <span
          className="flex flex-none items-center gap-1 text-[10px] text-accent"
          // Politely, because it fires on every hand-off: the reviewer is
          // reading code, not waiting on this line.
          aria-live="polite"
        >
          <SparkleIcon className="h-3 w-3 animate-pulse" />
          {status}
        </span>
      )}
    </div>
  )
}

/** The last failure, in the panel rather than in a swallowed `catch`. Sticky at
 *  the top: the click that failed may be scrolled far away by the time it does. */
function ErrorRow() {
  const error = useGuidedReview((s) => s.error)
  const dismiss = useGuidedReview((s) => s.dismissError)
  const { t } = useTranslation()
  if (!error) return null
  return (
    <div
      role="alert"
      className="flex flex-none items-start gap-3 border-b border-marker/30 bg-marker/5 px-4 py-2.5"
    >
      <WarningIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-marker" />
      <p className="min-w-0 flex-1 text-[11px] leading-snug break-words [overflow-wrap:anywhere] text-ink">
        {error}
      </p>
      <Button size="sm" onClick={dismiss} className="flex-none">
        {t("guided.err.dismiss")}
      </Button>
    </div>
  )
}

function EmptyState({ root }: { root: string }) {
  const start = useGuidedReview((s) => s.start)
  const isRepo = useProject((s) => s.git.isRepo)
  // Seed from the last-used objective (persisted) so it isn't re-picked each time.
  const [objective, setObjectiveState] = useState<Objective>(() => {
    const saved = useSettings.getState().reviewObjective
    return (OBJECTIVES as string[]).includes(saved) ? (saved as Objective) : "bug_risk"
  })
  const setObjective = (o: Objective) => {
    setObjectiveState(o)
    useSettings.getState().set({ reviewObjective: o })
  }
  const [source, setSource] = useState<Source>("diff")
  const [base, setBase] = useState("")
  const [branches, setBranches] = useState<string[]>([])
  const [promptText, setPromptText] = useState("")
  const [prNumber, setPrNumber] = useState<number | null>(null)
  const { t } = useTranslation()

  // Load the repo's branches when the "branch" source is chosen; default the base
  // to main / master / the current branch.
  useEffect(() => {
    if (source !== "branch") return
    void gitBranches(root)
      .then((b) => {
        const locals = b?.local ?? []
        setBranches(locals)
        setBase(
          (cur) =>
            cur ||
            (locals.includes("main")
              ? "main"
              : locals.includes("master")
                ? "master"
                : (b?.current ?? locals[0] ?? "")),
        )
      })
      .catch(() => {})
  }, [source, root])

  const sourceOptions = [
    { value: "diff", label: t("guided.src.diff") },
    ...(isRepo
      ? [
          { value: "branch", label: t("guided.src.branch") },
          { value: "pr", label: t("guided.src.pr") },
        ]
      : []),
    { value: "prompt", label: t("guided.src.prompt") },
  ]

  // The primary button is always present; it's enabled once the chosen source
  // has what it needs (a base branch, a selected PR, some text — diff needs none).
  const canStart =
    source === "diff" ||
    (source === "branch" && !!base) ||
    (source === "pr" && prNumber != null) ||
    (source === "prompt" && !!promptText.trim())

  const onStart = () => {
    if (source === "diff") void start(root, { kind: "diff" }, objective)
    else if (source === "branch" && base) void start(root, { kind: "branch", base }, objective)
    else if (source === "pr" && prNumber != null) {
      const pr = useForge.getState().prs.find((p) => p.number === prNumber)
      if (pr) void useForge.getState().openPr(root, pr, objective)
    } else if (source === "prompt" && promptText.trim())
      // A free-text request is still a full guided-review workflow: start a
      // session scoped to the request so the agent plans a route and proposes
      // artifacts, rather than a one-off that just scatters comments.
      void start(root, { kind: "prompt", request: sanitizePromptText(promptText) }, objective)
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
      <p className="text-xs leading-relaxed text-faint">{t("guided.empty.body")}</p>

      {/* Primary choice: what to review. */}
      <div className="flex flex-col gap-1 text-xs text-faint">
        {t("guided.source")}
        <Select
          value={source}
          options={sourceOptions}
          onChange={(v) => setSource(v as Source)}
          ariaLabel={t("guided.source")}
          className="w-full"
        />
      </div>

      {/* The chosen source's own control appears inline — no modal indirection. */}
      {source === "branch" && (
        <div className="flex flex-col gap-1 text-xs text-faint">
          {t("guided.branchBase")}
          <Select
            value={base}
            options={branches.map((b) => ({ value: b, label: b }))}
            onChange={setBase}
            ariaLabel={t("guided.branchBase")}
            className="w-full"
          />
        </div>
      )}

      {source === "prompt" && (
        <label className="flex flex-col gap-1 text-xs text-faint">
          {t("guided.reviewPromptHint")}
          <Textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={t("guided.reviewPromptPlaceholder")}
            className="h-28 resize-none p-2.5"
          />
        </label>
      )}

      {source === "pr" && <PrList root={root} selected={prNumber} onSelect={setPrNumber} />}

      {/* Refinement: the review focus, applied to whatever source is chosen. */}
      <div className="flex flex-col gap-1 text-xs text-faint">
        {t("guided.objective.label")}
        <Select
          value={objective}
          options={OBJECTIVES.map((o) => ({
            value: o,
            label: t(`guided.obj.${o}` as MessageKey),
          }))}
          onChange={(o) => setObjective(o)}
          ariaLabel={t("guided.objective.label")}
          className="w-full"
        />
      </div>

      <Button variant="primary" size="sm" onClick={onStart} disabled={!canStart}>
        {t("guided.startReview")}
      </Button>
    </div>
  )
}

/** Inline, selectable list of the repo's open PRs. Picking one highlights it;
 *  the shared "Start review" button then runs on the selection — so the primary
 *  action stays put. Handles no-forge / CLI-missing / loading / empty. */
function PrList({
  root,
  selected,
  onSelect,
}: {
  root: string
  selected: number | null
  onSelect: (n: number) => void
}) {
  const { t } = useTranslation()
  const forge = useForge((s) => s.forge)
  const cliPresent = useForge((s) => s.cliPresent)
  const prs = useForge((s) => s.prs)
  const loadingPrs = useForge((s) => s.loadingPrs)
  const prsError = useForge((s) => s.prsError)

  useEffect(() => {
    void useForge.getState().detect(root)
  }, [root])
  useEffect(() => {
    if (forge?.hasAdapter && cliPresent) void useForge.getState().listPrs(root)
  }, [forge?.hasAdapter, cliPresent, root])

  if (!forge || forge.provider === "unknown" || !forge.hasAdapter)
    return <p className="text-xs leading-relaxed text-faint">{t("forge.pickNoForge")}</p>
  if (cliPresent === false)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs leading-relaxed text-faint">
          {t("forge.installHint", { cli: forge.cli })}
        </p>
        <Button variant="secondary" size="sm" onClick={() => useForge.getState().installCli()}>
          {t("forge.install", { cli: forge.cli })}
        </Button>
      </div>
    )
  if (loadingPrs) return <p className="text-xs text-faint">{t("forge.loading")}</p>
  // A failed list (auth / not a repo / CLI error) surfaces here instead of being
  // swallowed into an empty list — the backend now carries gh/glab's stderr.
  if (prsError)
    return (
      <p className="text-xs leading-relaxed text-danger">
        {t("forge.listError", { term: forge.term, error: prsError })}
      </p>
    )
  if (prs.length === 0)
    return <p className="text-xs leading-relaxed text-faint">{t("forge.pickEmpty")}</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {prs.map((pr) => (
        <li key={pr.number}>
          <button
            type="button"
            aria-pressed={selected === pr.number}
            onClick={() => onSelect(pr.number)}
            className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left ${
              selected === pr.number ? "bg-selection text-ink" : "hover:bg-surface"
            }`}
          >
            <span className="flex-none text-[10px] tabular-nums text-faint">#{pr.number}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{pr.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function SessionView({ root, session }: { root: string; session: Session }) {
  const entry = currentEntry(session)
  const { reviewed, total } = progress(session)
  const open = openProposals(session)
  const hasRoute = (session.route ?? []).length > 0
  // Files the scope contains that the route never picked up. Only ever non-empty
  // for a scope Reado could enumerate itself (the diff, a branch range).
  const uncovered = useMemo(() => uncoveredFiles(session), [session])
  const change = session.routeChange
  const gapRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const store = useGuidedReview.getState

  /** How much work a file already carries — every proposal ever made on it. It
   *  is the price of dropping that file from the route. */
  const findingsOn = (file: string) =>
    (session.proposals ?? []).filter((p) => p.file === file).length
  const routeFiles = (session.route ?? []).map((e) => e.file)
  const proposedFiles = new Set((change?.route ?? []).map((e) => e.file))
  const added = (change?.route ?? []).filter((e) => !routeFiles.includes(e.file)).map((e) => e.file)
  const dropped = change ? routeFiles.filter((f) => !proposedFiles.has(f)) : []
  const droppedFindings = dropped.reduce((n, f) => n + findingsOn(f), 0)
  // One sentence naming every number the two bars stand for: an 8px bar cannot
  // carry its own legend.
  const barTitle = uncovered.length
    ? `${t("guided.progress", { reviewed, total })} · ${t("guided.outside", { count: uncovered.length })}`
    : t("guided.progress", { reviewed, total })

  // Proposals for the file currently in focus float to the top; the rest follow.
  const focusFile = entry?.file
  const ordered = useMemo(
    () => [...open].sort((a, b) => Number(b.file === focusFile) - Number(a.file === focusFile)),
    [open, focusFile],
  )
  // The current file's open proposals — the batch "approve/discard all" targets.
  const focusFileOpen = useMemo(() => open.filter((p) => p.file === focusFile), [open, focusFile])
  const disposeAll = (fn: (root: string, sessionId: string, id: string) => Promise<unknown>) => {
    // Snapshot ids first — each call mutates the proposal list.
    for (const id of focusFileOpen.map((p) => p.id)) void fn(root, session.id, id)
  }

  const acceptedTasks = (session.proposals ?? []).filter(
    (p) => p.state === "converted_to_task" && p.commentId,
  )
  const decisions = (session.proposals ?? []).filter((p) => p.artifactType === "decision")
  const memory = (session.proposals ?? []).filter(
    (p) => p.state === "discarded" || p.state === "resolved_as_false_positive",
  )
  // The current file already has findings → a "second opinion" makes sense (it
  // challenges those, which is what distinguishes it from the first review).
  const reviewedCurrent = !!entry && (session.proposals ?? []).some((p) => p.file === entry.file)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Progress + objective */}
      <div className="flex-none px-4 pt-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 text-muted tabular-nums">
            {t("guided.progress", { reviewed, total })}
            {/* Progress counts the route, and the route can be smaller than the
                change. Without this, a review that never looked at a third of
                the diff still reads "done" — so the gap is named here, in the
                same words the section below uses, and clicking goes to it. */}
            {uncovered.length > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => gapRef.current?.scrollIntoView({ block: "nearest" })}
                  className="text-marker underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  {t("guided.outside", { count: uncovered.length })}
                </button>
              </>
            )}
          </span>
          {session.objective && (
            <span className="flex-none rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
              {t(`guided.obj.${session.objective}` as MessageKey)}
            </span>
          )}
        </div>
        {/* Two bars, not one with a mystery segment on its end: the plan, and —
            only when there is one — what the plan never included. A single
            stacked bar made the uncovered share look like progress of some kind,
            when it is the opposite: work that is not even scheduled. The gap
            between them is what says "these are different things".

            The track needs its own boundary too — it was `bg-surface` drawn on a
            `bg-surface` parent, which painted nothing at all at 0%. */}
        <div className="mt-2 flex items-center gap-1" title={barTitle}>
          <div
            className="flex h-2 overflow-hidden rounded-full border border-line bg-bg"
            style={{ flexGrow: total || 1 }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={reviewed}
            aria-label={t("guided.progress", { reviewed, total })}
          >
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: total ? `${(reviewed / total) * 100}%` : "0%" }}
            />
          </div>
          {uncovered.length > 0 && (
            // Decorative, deliberately: the line above already says "2 outside
            // the route" in words, in this colour, and clicking it goes to the
            // list. A second control with the same name would be a duplicate
            // tab stop that adds nothing.
            <div
              aria-hidden="true"
              data-testid="uncovered-bar"
              className="h-2 flex-none rounded-full border border-marker/40 bg-[repeating-linear-gradient(135deg,var(--color-marker)_0_2px,transparent_2px_5px)] opacity-70"
              style={{ flexGrow: uncovered.length, flexBasis: 0 }}
            />
          )}
        </div>
      </div>

      {/* A route change the agent proposed. It sits above the current file
          because it is the one thing here waiting on the human — and until they
          answer, the route underneath keeps running unchanged. */}
      {change && (
        <section className="flex-none px-4 pt-3">
          <div className="animate-rise rounded-lg border border-accent/40 bg-accent/5 p-3">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent">
              <RouteIcon className="h-3 w-3" /> {t("guided.routeChange")}
            </p>
            <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-ink">
              {change.reason}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
              {t("guided.routeChangeShape", {
                from: routeFiles.length,
                to: change.route.length,
              })}
              {added.length > 0 && (
                <>
                  {" — "}
                  {t("guided.routeChangeAdds")}: {added.join(", ")}
                </>
              )}
              {dropped.length > 0 && (
                <>
                  {" — "}
                  <span className="text-marker">
                    {t("guided.routeChangeDrops")}:{" "}
                    {dropped
                      .map((f) => {
                        // A filename is not enough to weigh the loss: what it
                        // costs is the work already done on that file, so that
                        // is what the line says.
                        const n = findingsOn(f)
                        return n > 0 ? `${f} (${t("guided.findings", { count: n })})` : f
                      })
                      .join(", ")}
                  </span>
                </>
              )}
            </p>
            {/* What the box *is*, in Reado's own voice, directly above the two
                buttons it qualifies — which is where the question is asked. The
                agent's reason says what it wants; nothing said what a route is,
                or what pressing either button would do. */}
            <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
              {t("guided.routeChangeExplain")}
            </p>
            <div className="mt-2 flex items-stretch gap-1.5">
              <Confirm
                // Only a change that throws work away needs a second press; a
                // pure addition costs the reviewer nothing.
                guarded={droppedFindings > 0}
                tone={droppedFindings > 0 ? "muted" : "accent"}
                confirmLabel={t("guided.routeChangeConfirm", { count: droppedFindings })}
                onConfirm={() => void store().acceptRouteChange(root, session.id)}
              >
                {t("guided.routeChangeAccept")}
              </Confirm>
              <Action onClick={() => void store().discardRouteChange(root, session.id)}>
                {t("guided.routeChangeDiscard")}
              </Action>
            </div>
          </div>
        </section>
      )}

      {/* The current file. Not a card: it is where you *are*, not something to
          decide, and a bordered box inside a bordered panel next to a bordered
          route-change card left the eye with three equal containers and no
          lead. Flat, with the file name as the largest thing in the panel. */}
      {entry && (
        <section key={entry.file} className="animate-rise flex-none px-4 pb-1 pt-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-faint">
            {t("guided.current")}
          </h3>
          <button
            type="button"
            onClick={() => void store().focusFile(root, session.id, entry.file)}
            className="mt-1.5 block w-full truncate text-left text-[15px] font-semibold leading-tight text-ink hover:text-accent"
            title={entry.file}
            // Finishing a file moves the cursor, this block and the editor at
            // once. Sighted users see all three; this is the only one a screen
            // reader would otherwise have to be told about by hand.
            aria-live="polite"
          >
            {entry.file.split("/").pop()}
          </button>
          {entry.reason && (
            <p className="mt-1.5 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
              {entry.reason}
            </p>
          )}
          {!!entry.relatedFiles?.length && (
            <p
              className="mt-1 truncate text-[11px] text-faint"
              title={entry.relatedFiles.join(", ")}
            >
              {t("guided.related")}: {entry.relatedFiles.join(", ")}
            </p>
          )}
          {/* Primary CTA: first press reviews the file; once it has findings a
              second press runs a second-opinion pass that challenges them. */}
          <Button
            variant="primary"
            className="mt-4 h-9 w-full"
            title={reviewedCurrent ? t("guided.action.againHint") : t("guided.action.reviewHint")}
            onClick={() => {
              if (reviewedCurrent) void store().challenge(root, session.id, entry.file)
              else void store().reviewFile(root, session.id, entry.file)
            }}
          >
            {reviewedCurrent ? t("guided.action.again") : t("guided.action.review")}
          </Button>
          {/* Two chips, not four: marking the file done and skipping it are the
              moves that advance the review. Responding to comments and the wide
              pass are occasional, and each one added to this row cost the two
              that matter their prominence. */}
          <div className="mt-2 flex items-stretch gap-1.5">
            <Action
              fill
              onClick={() => void store().finishFile(root, session.id, entry.file, "reviewed")}
            >
              {t("guided.action.reviewed")}
            </Action>
            <Action
              fill
              onClick={() => void store().finishFile(root, session.id, entry.file, "skipped")}
            >
              {t("guided.action.skip")}
            </Action>
            <Dropdown
              label={t("guided.moreActions")}
              placement="bottom"
              align="end"
              triggerClassName={MENU_TRIGGER}
              trigger={<MoreIcon className="h-3.5 w-3.5" />}
            >
              <MenuRow
                label={t("guided.action.respond")}
                onClick={() => void store().respond(root, session.id, entry.file)}
              />
              {/* Deliberately user-triggered: the wide pass is expensive, and it
                  only earns its keep once the narrow walk has found its share. */}
              <MenuRow
                label={t("guided.action.widen")}
                onClick={() => void store().widen(root, session.id)}
              />
            </Dropdown>
          </div>
        </section>
      )}

      {/* While the agent is still planning the route there's nothing to act on. */}
      {!hasRoute && (
        <p className="px-4 py-4 text-xs leading-relaxed text-faint">
          {session.status === "planning" ? t("guided.planning") : t("guided.noRoute")}
        </p>
      )}

      {/* Open proposals — the human disposes of each */}
      {hasRoute && (
        <section className="mt-6 flex-none border-t border-line/70 pt-4">
          <div className="flex items-center justify-between pr-4">
            <SectionLabel>
              {t("guided.proposals")}
              {ordered.length > 0 && <span className="text-faint">· {ordered.length}</span>}
            </SectionLabel>
            {focusFileOpen.length >= 2 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="text-accent"
                  onClick={() => disposeAll(store().accept)}
                >
                  {t("guided.approveAll")}
                </Button>
                {/* Discarding the lot is N irreversible disposals from one
                    click; approving is not, so only this one asks. */}
                <Confirm
                  confirmLabel={t("guided.discardAllConfirm", { count: focusFileOpen.length })}
                  onConfirm={() => disposeAll(store().discard)}
                >
                  {t("guided.discardAll")}
                </Confirm>
              </div>
            )}
          </div>
          {ordered.length === 0 ? (
            <p className="px-4 py-2 text-xs text-faint">{t("guided.noProposals")}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {ordered.map((p) => (
                <ProposalRow key={p.id} root={root} sessionId={session.id} p={p} />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Route queue */}
      {!!session.route?.length && (
        <section className="mt-6 flex-none border-t border-line/70 pt-4">
          <SectionLabel>
            <RouteIcon className="h-3 w-3" /> {t("guided.route")}
          </SectionLabel>
          <ul className="m-0 list-none p-0">
            {session.route.map((e) => {
              const fs = session.files?.find((f) => f.file === e.file)?.state ?? "queued"
              const isCurrent = e.file === entry?.file
              return (
                <li key={e.file}>
                  <button
                    type="button"
                    onClick={() => void store().focusFile(root, session.id, e.file)}
                    className={`group flex w-full items-center gap-2 border-l-2 py-2 pl-3.5 pr-4 text-left text-xs transition-colors ${
                      isCurrent
                        ? "border-accent bg-surface text-ink"
                        : "border-transparent text-muted hover:border-line-strong hover:bg-surface"
                    }`}
                    title={t("guided.openFile", { file: e.file })}
                  >
                    <FilePath file={e.file} />
                    <span className={`flex-none text-[11px] ${fileStateTone(fs)}`}>
                      {t(`guided.fs.${fs}` as MessageKey)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {/* The gap between the scope and the route. Reado knows the scope's files,
          so an omission is a fact to show, not a suspicion — and each one is
          openable, because "which file?" is the first question.

          Its own section rather than a tail of the route queue: a plan that came
          back empty leaves the whole change uncovered, which is exactly when
          this has to still be on screen. */}
      {uncovered.length > 0 && (
        <section ref={gapRef} className="mt-5 flex-none">
          <SectionLabel>
            <WarningIcon className="h-3 w-3 flex-none text-marker" />
            <span className="text-marker">
              {t("guided.uncovered", { count: uncovered.length })}
            </span>
          </SectionLabel>
          <ul className="m-0 list-none p-0">
            {/* A 40-file diff against a 6-file route would otherwise render 34
                rows under the queue. The count is in the heading; the list only
                has to show enough to act on. */}
            {uncovered.slice(0, UNCOVERED_SHOWN).map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => void store().focusFile(root, session.id, f)}
                  className="flex w-full items-center gap-2 py-2 pl-4 pr-4 text-left text-xs text-muted hover:bg-surface hover:text-ink"
                  title={t("guided.openFile", { file: f })}
                >
                  <FilePath file={f} />
                </button>
              </li>
            ))}
          </ul>
          {uncovered.length > UNCOVERED_SHOWN && (
            <p className="px-4 pt-1 text-[11px] text-faint">
              {t("guided.uncoveredMore", { count: uncovered.length - UNCOVERED_SHOWN })}
            </p>
          )}
          <div className="px-4 pb-4 pt-3">
            <Action
              tone="accent"
              title={t("guided.uncoveredAskHint")}
              onClick={() => void store().cover(root, session.id, uncovered)}
            >
              {t("guided.uncoveredAsk")}
            </Action>
          </div>
        </section>
      )}

      {/* File summary for the current file */}
      {entry && session.files?.find((f) => f.file === entry.file)?.summary && (
        <section className="mt-3 flex-none px-4">
          <SectionLabel inline>{t("guided.fileSummary")}</SectionLabel>
          <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
            {session.files.find((f) => f.file === entry.file)?.summary}
          </p>
        </section>
      )}

      {/* Decisions (session memory) */}
      {!!decisions.length && (
        <section className="mt-3 flex-none px-4">
          <SectionLabel inline>{t("guided.decisions")}</SectionLabel>
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="text-xs leading-snug break-words [overflow-wrap:anywhere] text-muted"
              >
                · {d.body}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Session summary */}
      {session.summary && (
        <section className="mt-3 flex-none px-4">
          <SectionLabel inline>{t("guided.summary")}</SectionLabel>
          <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
            {session.summary}
          </p>
        </section>
      )}

      {/* Footer: hand off to the resolve loop, summarise, close */}
      <div className="mt-auto flex flex-none flex-col gap-2 border-t border-line px-4 py-3">
        {memory.length > 0 && (
          <p className="text-[10px] text-faint">{t("guided.memory", { count: memory.length })}</p>
        )}
        {session.scope.kind === "pr" ? (
          <PrSubmit root={root} session={session} />
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={acceptedTasks.length === 0}
            onClick={() => void store().sendTasks(root, session.id)}
          >
            {t("guided.sendTasks", { count: acceptedTasks.length })}
          </Button>
        )}
        <div className="flex items-center justify-between">
          {session.status !== "done" ? (
            <Button size="sm" onClick={() => void store().close(root, session.id)}>
              {t("guided.close")}
            </Button>
          ) : (
            <span />
          )}
          {/* The panel's most destructive control used to be its plainest: raw
              markup, ghost-quiet, one click from deleting the whole session. */}
          <Confirm
            danger
            confirmLabel={t("guided.resetConfirm")}
            title={t("guided.resetHint")}
            onConfirm={() => void store().discardSession(root, session.id)}
          >
            {t("guided.reset")}
          </Confirm>
        </div>
      </div>
    </div>
  )
}

/** Submit a PR/MR session to the host as one batched review with a verdict. */
function PrSubmit({ root, session }: { root: string; session: Session }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation()
  const number = Number((session.scope.pr ?? "").replace(/[^0-9]/g, "")) || 0
  // Without a real PR/MR number there's nothing to submit to (#0 would be wrong).
  const disabled = number === 0 || busy
  const allComments = useComments((s) => s.comments)

  // The review body is just the session summary; the per-line detail rides along
  // as inline comments.
  const body = session.summary ?? ""

  // Locally authored, line-anchored comments on the PR's files — the user's own
  // and accepted agent proposals. Pulled host threads (`externalId`) are excluded
  // so we never re-post what already exists on the PR.
  const comments = useMemo(() => {
    const routeFiles = new Set((session.route ?? []).map((e) => e.file))
    return allComments
      .filter((c) => !c.externalId && c.anchor.startLine > 0 && routeFiles.has(c.anchor.file))
      .map((c) => ({
        path: c.anchor.file,
        line: c.anchor.startLine,
        body: c.messages[0]?.body ?? "",
      }))
      .filter((c) => c.body.trim().length > 0)
  }, [allComments, session.route])

  const submit = async (verdict: Verdict) => {
    if (disabled) return
    setError(null)
    setBusy(true)
    const err = await useForge.getState().submit(root, number, verdict, body, comments)
    setBusy(false)
    if (err) setError(err)
    else setSent(true)
  }

  if (sent) return <p className="text-xs text-accent">{t("forge.submitted")}</p>

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{t("forge.submit")}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={disabled}
          className="bg-surface text-accent"
          onClick={() => void submit("approve")}
        >
          {t("forge.approve")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={disabled}
          className="bg-surface"
          onClick={() => void submit("request_changes")}
        >
          {t("forge.requestChanges")}
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => void submit("comment")}>
          {t("forge.comment")}
        </Button>
      </div>
      {number === 0 && <p className="text-[10px] leading-snug text-faint">{t("forge.noNumber")}</p>}
      {error && <p className="text-[10px] leading-snug text-marker">{error}</p>}
    </div>
  )
}

function ProposalRow({ root, sessionId, p }: { root: string; sessionId: string; p: Proposal }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p.body)
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation()
  const store = useGuidedReview.getState
  const anchored = !!p.file && p.startLine > 0
  const color = p.type ? TYPE_COLOR[p.type] : "var(--text-muted)"

  // Run a disposal action with the row's buttons disabled while it's in flight —
  // a double-click on Approve would otherwise try to accept the same proposal
  // twice (core is now idempotent too, but the UI shouldn't fire it twice).
  const run = (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    void fn().finally(() => setBusy(false))
  }

  return (
    <li className="border-b border-line/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] text-faint">
        <span
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="font-medium uppercase tracking-wide" style={{ color }}>
          {t(`guided.at.${p.artifactType}` as MessageKey)}
        </span>
        {anchored && (
          <button
            type="button"
            onClick={() => useProject.getState().open(`${root}/${p.file}`, p.startLine)}
            className="flex min-w-0 flex-1 items-center gap-0.5 py-1 text-left text-[11px] hover:text-ink"
            title={`${p.file}:${p.startLine}`}
          >
            <FilePath file={p.file} />
            <span className="flex-none">:{p.startLine}</span>
          </button>
        )}
      </div>

      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="mt-1 resize-none px-2 py-1 text-xs focus:border-accent"
        />
      ) : (
        <p className="mt-1 text-xs leading-snug break-words [overflow-wrap:anywhere] text-ink">
          {p.body}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {editing ? (
          <>
            <Action
              tone="accent"
              disabled={busy}
              onClick={() => {
                run(() => store().edit(root, sessionId, p.id, draft))
                setEditing(false)
              }}
            >
              {t("guided.save")}
            </Action>
            <Confirm
              // Cancel used to throw away whatever had been typed, silently.
              guarded={draft !== p.body}
              confirmLabel={t("guided.cancelConfirm")}
              onConfirm={() => {
                setDraft(p.body)
                setEditing(false)
              }}
            >
              {t("guided.cancel")}
            </Confirm>
          </>
        ) : (
          <>
            {/* Five equal chips made the panel's most frequent decision a scan.
                The two answers the reviewer actually gives — yes, no — are the
                two visible controls; the rarer dispositions live one press
                deeper, in a menu that brings its own roving focus and ARIA. */}
            <Button
              variant="primary"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => run(() => store().accept(root, sessionId, p.id))}
            >
              {t("guided.approve")}
            </Button>
            <Action
              disabled={busy}
              onClick={() => run(() => store().discard(root, sessionId, p.id))}
            >
              {t("guided.discard")}
            </Action>
            <Dropdown
              label={t("guided.moreActions")}
              placement="bottom"
              align="end"
              triggerClassName={MENU_TRIGGER}
              trigger={<MoreIcon className="h-3.5 w-3.5" />}
            >
              <MenuRow
                label={t("guided.approveNote")}
                onClick={() => run(() => store().accept(root, sessionId, p.id, true))}
              />
              <MenuRow
                label={t("guided.edit")}
                onClick={() => {
                  // Seed the editor from the *current* body, not a stale mount-time copy.
                  setDraft(p.body)
                  setEditing(true)
                }}
              />
              <MenuRow
                label={t("guided.falsePositive")}
                onClick={() =>
                  run(() => store().falsePositive(root, sessionId, p.id, t("guided.fpNote")))
                }
              />
            </Dropdown>
          </>
        )}
      </div>
    </li>
  )
}

/**
 * An action that asks a second time before it happens.
 *
 * Two presses in place, not a modal: the reviewer stays where they are, and the
 * question ("delete 3 findings?") is asked on the control itself. The armed
 * state disarms on blur and after a few seconds, so a chip left armed by a
 * wandering click cannot be fired later by accident.
 */
function Confirm({
  children,
  confirmLabel,
  onConfirm,
  guarded = true,
  tone = "muted",
  danger,
  title,
}: {
  children: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  /** False turns this back into a plain one-press action. */
  guarded?: boolean
  tone?: "muted" | "accent"
  danger?: boolean
  title?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  const fire = () => {
    if (guarded && !armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onConfirm()
  }
  if (danger) {
    return (
      <Button
        variant="danger"
        size="sm"
        onClick={fire}
        onBlur={() => setArmed(false)}
        title={title}
        className={armed ? "bg-marker/10" : undefined}
      >
        {armed ? confirmLabel : children}
      </Button>
    )
  }
  return (
    <Action
      tone={armed ? "accent" : tone}
      title={title}
      onClick={fire}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </Action>
  )
}

/**
 * One project-relative path, written the same way everywhere in this panel: the
 * directory quiet, the file name legible. The route used to show bare basenames
 * (two `index.ts` are indistinguishable) while the coverage list showed whole
 * paths — one list, one presentation.
 */
function FilePath({ file }: { file: string }) {
  const cut = file.lastIndexOf("/")
  return (
    <span className="min-w-0 flex-1 truncate">
      {cut > 0 && <span className="text-faint">{file.slice(0, cut + 1)}</span>}
      {file.slice(cut + 1)}
    </span>
  )
}

/** A quiet secondary action chip — reads as a button (border + padding), not a
 *  link. `tone` lets a single chip carry meaning (accent for the positive one). */
function Action({
  children,
  onClick,
  onBlur,
  title,
  disabled,
  fill,
  tone = "muted",
}: {
  children: React.ReactNode
  onClick: () => void
  onBlur?: () => void
  title?: string
  disabled?: boolean
  /** Share the row's width equally with its siblings, instead of hugging its
   *  own label — four controls of four widths in one cluster read as debris. */
  fill?: boolean
  tone?: "muted" | "accent"
}) {
  // `secondary` already draws the chip; the only thing left to the call site is
  // which one of the row reads as the positive action. The muted branch used to
  // restate the variant's own colours, and a third "marker" tone had no caller.
  //
  // `h-8` over the shared `sm` height: at 24px every chip in this panel was
  // under the 32px target floor, and these are the controls the reviewer hits
  // dozens of times a session. One height for every chip, so a cluster reads as
  // a row rather than as four unrelated things.
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      onBlur={onBlur}
      title={title}
      disabled={disabled}
      className={cn(
        "h-8",
        fill && "min-w-0 flex-1",
        tone === "accent" && "text-accent hover:border-accent",
      )}
    >
      <span className="truncate">{children}</span>
    </Button>
  )
}

/** A section heading. `h3`, not a styled `<p>`: six sections in one panel is
 *  exactly the case where heading navigation is how a screen-reader user moves. */
function SectionLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <h3
      className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted ${
        inline ? "" : "px-4 pb-2"
      }`}
    >
      {children}
    </h3>
  )
}
