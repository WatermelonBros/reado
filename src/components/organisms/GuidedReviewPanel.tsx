/**
 * The Review Guide panel — the cockpit of a Guided Pair Review.
 *
 * The code stays the hero in the editor; this panel surfaces the session's
 * state without scraping it: the current file and the agent's reason for it, the
 * proposed artifacts to dispose of, the route queue, open questions, the running
 * summary and progress. Every LLM artifact is a proposal the human accepts,
 * edits, converts, defers or discards — never auto-final.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject, useSettings } from "../../lib/store";
import {
  currentEntry,
  openProposals,
  progress,
  useGuidedReview,
} from "../../lib/guidedReview";
import { useForge } from "../../lib/forge";
import { useComments } from "../../lib/comments";
import { sanitizePromptText } from "../../lib/agents";
import { gitBranches } from "../../lib/api";
import type {
  FileState,
  Objective,
  Proposal,
  Session,
  Verdict,
} from "../../lib/api";
import { Button } from "../atoms/Button";
import { TYPE_COLOR } from "../atoms/commentMeta";
import { RouteIcon, SparkleIcon } from "../atoms/icons";
import { Select } from "../atoms/Select";
import { ResolveLoopBar } from "../molecules/ResolveLoopBar";
import { Textarea } from "../atoms/Textarea";
import { type MessageKey } from "../../i18n";

/** What a new review runs over. Three are git-scoped (a concrete file set); the
 *  fourth lets the agent decide from a free-text description. */
type Source = "diff" | "branch" | "pr" | "prompt";

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
];

/** Short label + tone for a per-file state badge. */
function fileStateTone(state: FileState): string {
  switch (state) {
    case "reviewed":
      return "text-accent";
    case "in_review":
      return "text-ink";
    case "needs_followup":
    case "blocked":
      return "text-marker";
    case "skipped":
    case "out_of_scope":
      return "text-faint line-through";
    default:
      return "text-faint";
  }
}

export function GuidedReviewPanel() {
  const root = useProject((s) => s.root);
  const sessions = useGuidedReview((s) => s.sessions);
  const currentId = useGuidedReview((s) => s.currentId);
  const busy = useGuidedReview((s) => s.busy);

  const session = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? null,
    [sessions, currentId],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header session={session} sessions={sessions} busy={busy} />
      <ResolveLoopBar />
      {session ? (
        <SessionView key={session.id} root={root} session={session} />
      ) : (
        <EmptyState root={root} />
      )}
    </div>
  );
}

function Header({
  session,
  sessions,
  busy,
}: {
  session: Session | null;
  sessions: Session[];
  busy: boolean;
}) {
  const select = useGuidedReview((s) => s.select);
  const { t } = useTranslation();
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
      {busy && (
        <span className="flex flex-none items-center gap-1 text-[10px] text-accent">
          <SparkleIcon className="h-3 w-3 animate-pulse" />
          {t("guided.busy")}
        </span>
      )}
    </div>
  );
}

function EmptyState({ root }: { root: string }) {
  const start = useGuidedReview((s) => s.start);
  const isRepo = useProject((s) => s.git.isRepo);
  // Seed from the last-used objective (persisted) so it isn't re-picked each time.
  const [objective, setObjectiveState] = useState<Objective>(() => {
    const saved = useSettings.getState().reviewObjective;
    return (OBJECTIVES as string[]).includes(saved) ? (saved as Objective) : "bug_risk";
  });
  const setObjective = (o: Objective) => {
    setObjectiveState(o);
    useSettings.getState().set({ reviewObjective: o });
  };
  const [source, setSource] = useState<Source>("diff");
  const [base, setBase] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [promptText, setPromptText] = useState("");
  const [prNumber, setPrNumber] = useState<number | null>(null);
  const { t } = useTranslation();

  // Load the repo's branches when the "branch" source is chosen; default the base
  // to main / master / the current branch.
  useEffect(() => {
    if (source !== "branch") return;
    void gitBranches(root)
      .then((b) => {
        const locals = b?.local ?? [];
        setBranches(locals);
        setBase(
          (cur) =>
            cur ||
            (locals.includes("main")
              ? "main"
              : locals.includes("master")
                ? "master"
                : (b?.current ?? locals[0] ?? "")),
        );
      })
      .catch(() => {});
  }, [source, root]);

  const sourceOptions = [
    { value: "diff", label: t("guided.src.diff") },
    ...(isRepo
      ? [
          { value: "branch", label: t("guided.src.branch") },
          { value: "pr", label: t("guided.src.pr") },
        ]
      : []),
    { value: "prompt", label: t("guided.src.prompt") },
  ];

  // The primary button is always present; it's enabled once the chosen source
  // has what it needs (a base branch, a selected PR, some text — diff needs none).
  const canStart =
    source === "diff" ||
    (source === "branch" && !!base) ||
    (source === "pr" && prNumber != null) ||
    (source === "prompt" && !!promptText.trim());

  const onStart = () => {
    if (source === "diff") void start(root, { kind: "diff" }, objective);
    else if (source === "branch" && base) void start(root, { kind: "branch", base }, objective);
    else if (source === "pr" && prNumber != null) {
      const pr = useForge.getState().prs.find((p) => p.number === prNumber);
      if (pr) void useForge.getState().openPr(root, pr, objective);
    } else if (source === "prompt" && promptText.trim())
      // A free-text request is still a full guided-review workflow: start a
      // session scoped to the request so the agent plans a route and proposes
      // artifacts, rather than a one-off that just scatters comments.
      void start(root, { kind: "prompt", request: sanitizePromptText(promptText) }, objective);
  };

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
      <p className="text-xs leading-relaxed text-faint">{t("guided.empty.body")}</p>

      {/* Primary choice: what to review. */}
      <label className="flex flex-col gap-1 text-xs text-faint">
        {t("guided.source")}
        <Select
          value={source}
          options={sourceOptions}
          onChange={(v) => setSource(v as Source)}
          ariaLabel={t("guided.source")}
          className="w-full"
        />
      </label>

      {/* The chosen source's own control appears inline — no modal indirection. */}
      {source === "branch" && (
        <label className="flex flex-col gap-1 text-xs text-faint">
          {t("guided.branchBase")}
          <Select
            value={base}
            options={branches.map((b) => ({ value: b, label: b }))}
            onChange={setBase}
            ariaLabel={t("guided.branchBase")}
            className="w-full"
          />
        </label>
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
      <label className="flex flex-col gap-1 text-xs text-faint">
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
      </label>

      <Button variant="primary" size="sm" onClick={onStart} disabled={!canStart}>
        {t("guided.startReview")}
      </Button>
    </div>
  );
}

/** Inline, selectable list of the repo's open PRs. Picking one highlights it;
 *  the shared "Start review" button then runs on the selection — so the primary
 *  action stays put. Handles no-forge / CLI-missing / loading / empty. */
function PrList({
  root,
  selected,
  onSelect,
}: {
  root: string;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const { t } = useTranslation();
  const forge = useForge((s) => s.forge);
  const cliPresent = useForge((s) => s.cliPresent);
  const prs = useForge((s) => s.prs);
  const loadingPrs = useForge((s) => s.loadingPrs);
  const prsError = useForge((s) => s.prsError);

  useEffect(() => {
    void useForge.getState().detect(root);
  }, [root]);
  useEffect(() => {
    if (forge?.hasAdapter && cliPresent) void useForge.getState().listPrs(root);
  }, [forge?.hasAdapter, cliPresent, root]);

  if (!forge || forge.provider === "unknown" || !forge.hasAdapter)
    return <p className="text-xs leading-relaxed text-faint">{t("forge.pickNoForge")}</p>;
  if (cliPresent === false)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs leading-relaxed text-faint">{t("forge.installHint", { cli: forge.cli })}</p>
        <button
          type="button"
          onClick={() => useForge.getState().installCli()}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
        >
          {t("forge.install", { cli: forge.cli })}
        </button>
      </div>
    );
  if (loadingPrs) return <p className="text-xs text-faint">{t("forge.loading")}</p>;
  // A failed list (auth / not a repo / CLI error) surfaces here instead of being
  // swallowed into an empty list — the backend now carries gh/glab's stderr.
  if (prsError)
    return (
      <p className="text-xs leading-relaxed text-danger">
        {t("forge.listError", { term: forge.term, error: prsError })}
      </p>
    );
  if (prs.length === 0) return <p className="text-xs leading-relaxed text-faint">{t("forge.pickEmpty")}</p>;
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
  );
}

function SessionView({ root, session }: { root: string; session: Session }) {
  const entry = currentEntry(session);
  const { reviewed, total } = progress(session);
  const open = openProposals(session);
  const hasRoute = (session.route ?? []).length > 0;
  const { t } = useTranslation();
  const store = useGuidedReview.getState;

  // Proposals for the file currently in focus float to the top; the rest follow.
  const focusFile = entry?.file;
  const ordered = useMemo(
    () =>
      [...open].sort((a, b) => Number(b.file === focusFile) - Number(a.file === focusFile)),
    [open, focusFile],
  );
  // The current file's open proposals — the batch "approve/discard all" targets.
  const focusFileOpen = useMemo(
    () => open.filter((p) => p.file === focusFile),
    [open, focusFile],
  );
  const disposeAll = (fn: (root: string, sessionId: string, id: string) => Promise<unknown>) => {
    // Snapshot ids first — each call mutates the proposal list.
    for (const id of focusFileOpen.map((p) => p.id)) void fn(root, session.id, id);
  };

  const acceptedTasks = (session.proposals ?? []).filter(
    (p) => p.state === "converted_to_task" && p.commentId,
  );
  const decisions = (session.proposals ?? []).filter((p) => p.artifactType === "decision");
  const memory = (session.proposals ?? []).filter(
    (p) => p.state === "discarded" || p.state === "resolved_as_false_positive",
  );
  // The current file already has findings → a "second opinion" makes sense (it
  // challenges those, which is what distinguishes it from the first review).
  const reviewedCurrent = !!entry && (session.proposals ?? []).some((p) => p.file === entry.file);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Progress + objective */}
      <div className="flex-none px-3 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted tabular-nums">{t("guided.progress", { reviewed, total })}</span>
          {session.objective && (
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
              {t(`guided.obj.${session.objective}` as MessageKey)}
            </span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: total ? `${(reviewed / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Current file card — the focus zone. Keyed by file so it re-animates
          when the current file changes (a clear cue the focus moved). */}
      {entry && (
        <section className="flex-none px-3 pt-3">
          <div
            key={entry.file}
            className="animate-rise rounded-lg border border-line bg-surface/50 p-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-faint">
              {t("guided.current")}
            </p>
            <button
              type="button"
              onClick={() => void store().focusFile(root, session.id, entry.file)}
              className="mt-1 block w-full truncate text-left text-sm font-semibold text-ink hover:text-accent"
              title={entry.file}
            >
              {entry.file.split("/").pop()}
            </button>
            {entry.reason && (
              <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
                {entry.reason}
              </p>
            )}
            {!!entry.relatedFiles?.length && (
              <p className="mt-1 truncate text-[10px] text-faint" title={entry.relatedFiles.join(", ")}>
                {t("guided.related")}: {entry.relatedFiles.join(", ")}
              </p>
            )}
            {/* Primary CTA: first press reviews the file; once it has findings a
                second press runs a second-opinion pass that challenges them. */}
            <div className="mt-3">
              <PrimaryButton
                title={reviewedCurrent ? t("guided.action.againHint") : t("guided.action.reviewHint")}
                onClick={() => {
                  if (reviewedCurrent) void store().challenge(root, session.id, entry.file);
                  else void store().reviewFile(root, session.id, entry.file);
                }}
              >
                {reviewedCurrent ? t("guided.action.again") : t("guided.action.review")}
              </PrimaryButton>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Action onClick={() => void store().finishFile(root, session.id, entry.file, "reviewed")}>
                {t("guided.action.reviewed")}
              </Action>
              <Action onClick={() => void store().finishFile(root, session.id, entry.file, "skipped")}>
                {t("guided.action.skip")}
              </Action>
              {/* Always available — reply to the comments already on this file. */}
              <Action
                title={t("guided.action.respondHint")}
                onClick={() => void store().respond(root, session.id, entry.file)}
              >
                {t("guided.action.respond")}
              </Action>
            </div>
          </div>
        </section>
      )}

      {/* While the agent is still planning the route there's nothing to act on. */}
      {!hasRoute && (
        <p className="px-3 py-4 text-xs leading-relaxed text-faint">
          {session.status === "planning" ? t("guided.planning") : t("guided.noRoute")}
        </p>
      )}

      {/* Open proposals — the human disposes of each */}
      {hasRoute && (
        <section className="mt-3 flex-none">
          <div className="flex items-center justify-between pr-3">
            <SectionLabel>{t("guided.proposals")}</SectionLabel>
            {focusFileOpen.length >= 2 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => disposeAll(store().accept)}
                  className="text-xs text-accent hover:text-ink"
                >
                  {t("guided.approveAll")}
                </button>
                <button
                  type="button"
                  onClick={() => disposeAll(store().discard)}
                  className="text-xs text-muted hover:text-ink"
                >
                  {t("guided.discardAll")}
                </button>
              </div>
            )}
          </div>
          {ordered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-faint">{t("guided.noProposals")}</p>
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
        <section className="mt-3 flex-none">
          <SectionLabel>
            <RouteIcon className="h-3 w-3" /> {t("guided.route")}
          </SectionLabel>
          <ul className="m-0 list-none p-0">
            {session.route.map((e) => {
              const fs =
                session.files?.find((f) => f.file === e.file)?.state ?? "queued";
              const isCurrent = e.file === entry?.file;
              return (
                <li key={e.file}>
                  <button
                    type="button"
                    onClick={() => void store().focusFile(root, session.id, e.file)}
                    className={`group flex w-full items-center gap-2 border-l-2 py-1.5 pl-3 pr-3 text-left text-xs transition-colors ${
                      isCurrent
                        ? "border-accent bg-surface text-ink"
                        : "border-transparent text-muted hover:border-line-strong hover:bg-surface"
                    }`}
                    title={t("guided.openFile", { file: e.file })}
                  >
                    <span className="min-w-0 flex-1 truncate">{e.file.split("/").pop()}</span>
                    <span className={`flex-none text-[10px] ${fileStateTone(fs)}`}>
                      {t(`guided.fs.${fs}` as MessageKey)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* File summary for the current file */}
      {entry &&
        session.files?.find((f) => f.file === entry.file)?.summary && (
          <section className="mt-3 flex-none px-3">
            <SectionLabel inline>{t("guided.fileSummary")}</SectionLabel>
            <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
              {session.files.find((f) => f.file === entry.file)?.summary}
            </p>
          </section>
        )}

      {/* Decisions (session memory) */}
      {!!decisions.length && (
        <section className="mt-3 flex-none px-3">
          <SectionLabel inline>{t("guided.decisions")}</SectionLabel>
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {decisions.map((d) => (
              <li key={d.id} className="text-xs leading-snug break-words [overflow-wrap:anywhere] text-muted">
                · {d.body}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Session summary */}
      {session.summary && (
        <section className="mt-3 flex-none px-3">
          <SectionLabel inline>{t("guided.summary")}</SectionLabel>
          <p className="mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere] text-muted">
            {session.summary}
          </p>
        </section>
      )}

      {/* Footer: hand off to the resolve loop, summarise, close */}
      <div className="mt-auto flex flex-none flex-col gap-1.5 border-t border-line px-3 py-2.5">
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
            <button
              type="button"
              onClick={() => void store().close(root, session.id)}
              className="rounded-md px-2 py-1 text-xs text-faint hover:text-ink"
            >
              {t("guided.close")}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => void store().discardSession(root, session.id)}
            className="rounded-md px-2 py-1 text-xs text-faint hover:text-marker"
          >
            {t("guided.reset")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Submit a PR/MR session to the host as one batched review with a verdict. */
function PrSubmit({ root, session }: { root: string; session: Session }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const number = Number((session.scope.pr ?? "").replace(/[^0-9]/g, "")) || 0;
  // Without a real PR/MR number there's nothing to submit to (#0 would be wrong).
  const disabled = number === 0 || busy;
  const allComments = useComments((s) => s.comments);

  // The review body is just the session summary; the per-line detail rides along
  // as inline comments.
  const body = session.summary ?? "";

  // Locally authored, line-anchored comments on the PR's files — the user's own
  // and accepted agent proposals. Pulled host threads (`externalId`) are excluded
  // so we never re-post what already exists on the PR.
  const comments = useMemo(() => {
    const routeFiles = new Set((session.route ?? []).map((e) => e.file));
    return allComments
      .filter((c) => !c.externalId && c.anchor.startLine > 0 && routeFiles.has(c.anchor.file))
      .map((c) => ({
        path: c.anchor.file,
        line: c.anchor.startLine,
        body: c.messages[0]?.body ?? "",
      }))
      .filter((c) => c.body.trim().length > 0);
  }, [allComments, session.route]);

  const submit = async (verdict: Verdict) => {
    if (disabled) return;
    setError(null);
    setBusy(true);
    const err = await useForge.getState().submit(root, number, verdict, body, comments);
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (sent) return <p className="text-xs text-accent">{t("forge.submitted")}</p>;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{t("forge.submit")}</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void submit("approve")}
          className="rounded-md bg-surface px-2 py-1 text-xs text-accent hover:text-ink disabled:opacity-40"
        >
          {t("forge.approve")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void submit("request_changes")}
          className="rounded-md bg-surface px-2 py-1 text-xs text-marker hover:text-ink disabled:opacity-40"
        >
          {t("forge.requestChanges")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void submit("comment")}
          className="rounded-md px-2 py-1 text-xs text-faint hover:text-ink disabled:opacity-40"
        >
          {t("forge.comment")}
        </button>
      </div>
      {number === 0 && <p className="text-[10px] leading-snug text-faint">{t("forge.noNumber")}</p>}
      {error && <p className="text-[10px] leading-snug text-marker">{error}</p>}
    </div>
  );
}

function ProposalRow({
  root,
  sessionId,
  p,
}: {
  root: string;
  sessionId: string;
  p: Proposal;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.body);
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();
  const store = useGuidedReview.getState;
  const anchored = !!p.file && p.startLine > 0;
  const color = p.type ? TYPE_COLOR[p.type] : "var(--text-muted)";

  // Run a disposal action with the row's buttons disabled while it's in flight —
  // a double-click on Approve would otherwise try to accept the same proposal
  // twice (core is now idempotent too, but the UI shouldn't fire it twice).
  const run = (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  return (
    <li className="border-b border-line/60 px-3 py-2.5">
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
            className="min-w-0 flex-1 truncate text-left hover:text-ink"
            title={`${p.file}:${p.startLine}`}
          >
            {p.file}:{p.startLine}
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
                run(() => store().edit(root, sessionId, p.id, draft));
                setEditing(false);
              }}
            >
              {t("guided.save")}
            </Action>
            <Action onClick={() => setEditing(false)}>{t("guided.cancel")}</Action>
          </>
        ) : (
          <>
            <Action tone="accent" disabled={busy} onClick={() => run(() => store().accept(root, sessionId, p.id))}>
              {t("guided.approve")}
            </Action>
            <Action disabled={busy} onClick={() => run(() => store().accept(root, sessionId, p.id, true))}>
              {t("guided.approveNote")}
            </Action>
            <Action
              disabled={busy}
              onClick={() => {
                // Seed the editor from the *current* body, not a stale mount-time copy.
                setDraft(p.body);
                setEditing(true);
              }}
            >
              {t("guided.edit")}
            </Action>
            <Action disabled={busy} onClick={() => run(() => store().discard(root, sessionId, p.id))}>
              {t("guided.discard")}
            </Action>
            <Action
              disabled={busy}
              onClick={() => run(() => store().falsePositive(root, sessionId, p.id, t("guided.fpNote")))}
            >
              {t("guided.falsePositive")}
            </Action>
          </>
        )}
      </div>
    </li>
  );
}

/** A full-width primary call-to-action (one per surface — the obvious next step). */
function PrimaryButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full rounded-md bg-accent px-3 py-2 text-xs font-medium text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A quiet secondary action chip — reads as a button (border + padding), not a
 *  link. `tone` lets a single chip carry meaning (accent for the positive one). */
function Action({
  children,
  onClick,
  title,
  disabled,
  tone = "muted",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  tone?: "muted" | "accent" | "marker";
}) {
  const toneCls =
    tone === "accent"
      ? "text-accent hover:border-accent"
      : tone === "marker"
        ? "text-marker hover:border-marker"
        : "text-muted hover:text-ink hover:border-line-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded-md border border-line bg-surface px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneCls}`}
    >
      {children}
    </button>
  );
}

function SectionLabel({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint ${
        inline ? "" : "px-3 pb-1"
      }`}
    >
      {children}
    </p>
  );
}
