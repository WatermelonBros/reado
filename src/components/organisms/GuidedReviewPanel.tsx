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
import { RouteIcon, SparkleIcon, WarningIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { ResolveLoopBar } from "@/components/molecules/ResolveLoopBar"
import type { MessageKey } from "@/i18n"
import { sanitizePromptText } from "@/lib/agents"
import type { Objective, Session } from "@/lib/api"
import { gitBranches } from "@/lib/api"
import { useForge } from "@/lib/forge"
import { currentEntry, uncoveredFiles, useGuidedReview } from "@/lib/guidedReview"
import { useProject, useSettings } from "@/lib/store"
import { CurrentFileCard } from "./guided/CurrentFileCard"
import { ProposalList } from "./guided/ProposalList"
import { SectionLabel } from "./guided/parts"
import { RouteChangeCard } from "./guided/RouteChangeCard"
import { RouteQueue } from "./guided/RouteQueue"
import { SessionFooter } from "./guided/SessionFooter"
import { SessionProgress } from "./guided/SessionProgress"
import { UncoveredFiles } from "./guided/UncoveredFiles"

/** What a new review runs over. Three are git-scoped (a concrete file set); the
 *  fourth lets the agent decide from a free-text description. */
type Source = "diff" | "branch" | "pr" | "prompt"

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
  const hasRoute = (session.route ?? []).length > 0
  // Files the scope contains that the route never picked up. Only ever non-empty
  // for a scope Reado could enumerate itself (the diff, a branch range).
  const uncovered = useMemo(() => uncoveredFiles(session), [session])
  const gapRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const decisions = (session.proposals ?? []).filter((p) => p.artifactType === "decision")

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Progress + objective */}
      <SessionProgress session={session} uncovered={uncovered} gapRef={gapRef} />

      {/* A route change the agent proposed. It sits above the current file
          because it is the one thing here waiting on the human — and until they
          answer, the route underneath keeps running unchanged. */}
      <RouteChangeCard root={root} session={session} />

      {/* The current file. Not a card: it is where you *are*, not something to
          decide, and a bordered box inside a bordered panel next to a bordered
          route-change card left the eye with three equal containers and no
          lead. Flat, with the file name as the largest thing in the panel. */}
      <CurrentFileCard root={root} session={session} />

      {/* While the agent is still planning the route there's nothing to act on. */}
      {!hasRoute && (
        <p className="px-4 py-4 text-xs leading-relaxed text-faint">
          {session.status === "planning" ? t("guided.planning") : t("guided.noRoute")}
        </p>
      )}

      {/* Open proposals — the human disposes of each */}
      <ProposalList root={root} session={session} />

      {/* Route queue */}
      <RouteQueue root={root} session={session} />

      {/* The gap between the scope and the route. Reado knows the scope's files,
          so an omission is a fact to show, not a suspicion — and each one is
          openable, because "which file?" is the first question.

          Its own section rather than a tail of the route queue: a plan that came
          back empty leaves the whole change uncovered, which is exactly when
          this has to still be on screen. */}
      <UncoveredFiles root={root} session={session} uncovered={uncovered} gapRef={gapRef} />

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
      <SessionFooter root={root} session={session} />
    </div>
  )
}
