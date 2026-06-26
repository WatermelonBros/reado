/**
 * The Review Guide panel — the cockpit of a Guided Pair Review.
 *
 * The code stays the hero in the editor; this panel surfaces the session's
 * state without scraping it: the current file and the agent's reason for it, the
 * proposed artifacts to dispose of, the route queue, open questions, the running
 * summary and progress. Every LLM artifact is a proposal the human accepts,
 * edits, converts, defers or discards — never auto-final.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../../lib/store";
import {
  currentEntry,
  openProposals,
  progress,
  useGuidedReview,
} from "../../lib/guidedReview";
import type {
  FileState,
  Objective,
  Proposal,
  Session,
} from "../../lib/api";
import { TYPE_COLOR } from "../atoms/commentMeta";
import { RouteIcon, SparkleIcon } from "../atoms/icons";
import { ResolveLoopBar } from "../molecules/ResolveLoopBar";
import { type MessageKey } from "../../i18n";

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
        <select
          value={session?.id ?? ""}
          onChange={(e) => select(e.target.value || null)}
          className="min-w-0 flex-1 truncate bg-transparent text-[11px] text-muted outline-none"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted">
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
  const [objective, setObjective] = useState<Objective>("bug_risk");
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
      <div>
        <h3 className="text-xs font-semibold text-ink">{t("guided.empty.title")}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">{t("guided.empty.body")}</p>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-faint">
        {t("guided.objective.label")}
        <select
          value={objective}
          onChange={(e) => setObjective(e.target.value as Objective)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        >
          {OBJECTIVES.map((o) => (
            <option key={o} value={o}>
              {t(`guided.obj.${o}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => void start(root, { kind: "diff" }, objective)}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90"
        >
          {t("guided.start.diff")}
        </button>
        {isRepo && (
          <button
            type="button"
            onClick={() => void start(root, { kind: "branch", base: "main" }, objective)}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            {t("guided.start.branch")}
          </button>
        )}
      </div>
    </div>
  );
}

function SessionView({ root, session }: { root: string; session: Session }) {
  const entry = currentEntry(session);
  const { reviewed, total } = progress(session);
  const open = openProposals(session);
  const { t } = useTranslation();
  const store = useGuidedReview.getState;

  // Proposals for the file currently in focus float to the top; the rest follow.
  const focusFile = entry?.file;
  const ordered = useMemo(
    () =>
      [...open].sort((a, b) => Number(b.file === focusFile) - Number(a.file === focusFile)),
    [open, focusFile],
  );

  const acceptedTasks = (session.proposals ?? []).filter(
    (p) => p.state === "converted_to_task" && p.commentId,
  );
  const decisions = (session.proposals ?? []).filter((p) => p.artifactType === "decision");
  const memory = (session.proposals ?? []).filter(
    (p) => p.state === "discarded" || p.state === "resolved_as_false_positive",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Progress + objective */}
      <div className="flex-none px-3 pt-2.5">
        <div className="flex items-center justify-between text-[10px] text-faint">
          <span>{t("guided.progress", { reviewed, total })}</span>
          {session.objective && (
            <span className="rounded bg-surface px-1.5 py-0.5 text-muted">
              {t(`guided.obj.${session.objective}` as MessageKey)}
            </span>
          )}
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: total ? `${(reviewed / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Current file + actions */}
      {entry && (
        <section className="flex-none px-3 pt-3">
          <p className="text-[10px] uppercase tracking-wide text-faint">{t("guided.current")}</p>
          <button
            type="button"
            onClick={() => useProject.getState().open(`${root}/${entry.file}`, 1)}
            className="mt-0.5 block w-full truncate text-left text-xs font-medium text-ink hover:text-accent"
            title={entry.file}
          >
            {entry.file}
          </button>
          {entry.reason && (
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{entry.reason}</p>
          )}
          {!!entry.relatedFiles?.length && (
            <p className="mt-0.5 text-[10px] text-faint">
              {t("guided.related")}: {entry.relatedFiles.join(", ")}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Action onClick={() => void store().reviewFile(root, session.id, entry.file)} primary>
              {t("guided.action.review")}
            </Action>
            <Action onClick={() => void store().challenge(root, session.id, entry.file)}>
              {t("guided.action.challenge")}
            </Action>
            <Action
              onClick={() => void store().setFileState(root, session.id, entry.file, "reviewed")}
            >
              {t("guided.action.reviewed")}
            </Action>
            <Action
              onClick={() => void store().setFileState(root, session.id, entry.file, "skipped")}
            >
              {t("guided.action.skip")}
            </Action>
          </div>
        </section>
      )}

      {/* Open proposals — the human disposes of each */}
      <section className="mt-3 flex-none">
        <SectionLabel>{t("guided.proposals")}</SectionLabel>
        {ordered.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-faint">{t("guided.noProposals")}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {ordered.map((p) => (
              <ProposalRow key={p.id} root={root} sessionId={session.id} p={p} />
            ))}
          </ul>
        )}
      </section>

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
                    onClick={() => void store().reviewFile(root, session.id, e.file)}
                    className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[11px] hover:bg-surface ${
                      isCurrent ? "bg-surface" : ""
                    }`}
                    title={e.reason}
                  >
                    <span className="min-w-0 flex-1 truncate text-muted">{e.file}</span>
                    <span className={`flex-none text-[9px] ${fileStateTone(fs)}`}>
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
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
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
              <li key={d.id} className="text-[11px] leading-snug text-muted">
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
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{session.summary}</p>
        </section>
      )}

      {/* Footer: hand off to the resolve loop, summarise, close */}
      <div className="mt-auto flex flex-none flex-col gap-1.5 border-t border-line px-3 py-2.5">
        {memory.length > 0 && (
          <p className="text-[10px] text-faint">{t("guided.memory", { count: memory.length })}</p>
        )}
        <button
          type="button"
          disabled={acceptedTasks.length === 0}
          onClick={() => void store().sendTasks(root, session.id)}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-40"
        >
          {t("guided.sendTasks", { count: acceptedTasks.length })}
        </button>
        {session.status !== "done" && (
          <button
            type="button"
            onClick={() => void store().close(root, session.id)}
            className="rounded-md px-3 py-1 text-[11px] text-faint hover:text-ink"
          >
            {t("guided.close")}
          </button>
        )}
      </div>
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
  const { t } = useTranslation();
  const store = useGuidedReview.getState;
  const anchored = !!p.file && p.startLine > 0;
  const color = p.type ? TYPE_COLOR[p.type] : "var(--text-muted)";

  return (
    <li className="border-b border-line/60 px-3 py-2">
      <div className="flex items-center gap-2 text-[10px] text-faint">
        <span
          className="rounded px-1.5 py-0.5"
          style={{ color, background: "var(--bg-surface)" }}
        >
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
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-none rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        />
      ) : (
        <p className="mt-1 text-xs leading-snug text-ink">{p.body}</p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {editing ? (
          <>
            <Action
              primary
              onClick={() => {
                void store().edit(root, sessionId, p.id, draft);
                setEditing(false);
              }}
            >
              {t("guided.save")}
            </Action>
            <Action onClick={() => setEditing(false)}>{t("guided.cancel")}</Action>
          </>
        ) : (
          <>
            <Action primary onClick={() => void store().accept(root, sessionId, p.id)}>
              {t("guided.approve")}
            </Action>
            <Action onClick={() => void store().accept(root, sessionId, p.id, true)}>
              {t("guided.approveNote")}
            </Action>
            <Action onClick={() => setEditing(true)}>{t("guided.edit")}</Action>
            <Action onClick={() => void store().discard(root, sessionId, p.id)}>
              {t("guided.discard")}
            </Action>
            <Action
              onClick={() =>
                void store().falsePositive(root, sessionId, p.id, t("guided.fpNote"))
              }
            >
              {t("guided.falsePositive")}
            </Action>
          </>
        )}
      </div>
    </li>
  );
}

function Action({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-[11px] ${
        primary
          ? "bg-surface text-accent hover:text-ink"
          : "text-faint hover:text-ink"
      }`}
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
