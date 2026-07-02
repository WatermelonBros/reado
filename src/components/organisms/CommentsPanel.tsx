/**
 * The Comments side panel.
 *
 * Two views: **Open** (active comments) and **History** (resolved comments,
 * archived). Both are filterable by type, state and the current file. Selecting
 * a comment navigates the editor to its anchor; open ones also open the thread.
 */
import { useEffect, useMemo, useState } from "react";
import type { Comment, CommentState, CommentType } from "../../lib/api";
import { useComments, toRelative } from "../../lib/comments";
import { useProject, useEditorActions, useWorkspace } from "../../lib/store";
import { useReadProgress, LAST_READ_BASE } from "../../lib/readProgress";

import { COMMENT_STATES, COMMENT_TYPES, TYPE_COLOR, typeKey, stateKey, Dot } from "../atoms/commentMeta";
import { Select } from "../atoms/Select";
import { Checkbox } from "../atoms/Checkbox";
import { SendIcon, SparkleIcon } from "../atoms/icons";
import { SendReviewDialog } from "./SendReviewDialog";
import { AuditDialog, type AuditTarget } from "./AuditDialog";
import { useTranslation } from "react-i18next";

const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(ms));

export function CommentsPanel() {
  const comments = useComments((s) => s.comments);
  const archived = useComments((s) => s.archived);
  const loadArchived = useComments((s) => s.loadArchived);
  const setActive = useComments((s) => s.setActive);
  const activeId = useComments((s) => s.activeId);
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const open = useProject((s) => s.open);
  // Files the agent changed since you last read them → open comments on those
  // files are "pending review" (the agent may have resolved them).
  const changed = useReadProgress((s) => s.changed);
  const { t } = useTranslation();

  // Open the comment's file at its anchor and show the delta the agent produced.
  const reviewChange = (c: Comment) => {
    open(`${root}/${c.anchor.file}`, c.anchor.scope === "range" ? c.anchor.startLine : 1);
    useEditorActions.getState().setDiffBase(LAST_READ_BASE);
    useEditorActions.getState().setDiffing(true);
  };

  // Panel filters live in the workspace store so switching tools (which unmounts
  // this panel) doesn't reset them.
  const filter = useWorkspace((s) => s.commentFilter);
  const view = filter.view;
  const typeFilter = filter.type as CommentType | "all";
  const stateFilter = filter.state as CommentState | "all";
  const thisFileOnly = filter.thisFile;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<AuditTarget | null>(null);

  const openTasks = comments.filter((c) => c.kind === "task" && c.state === "open").length;
  // Audit the open file when there is one, otherwise the whole project.
  const auditScope = (): AuditTarget =>
    active ? { path: toRelative(root, active), isDir: false } : { path: ".", isDir: true };

  // Load the history lazily when first switching to it.
  useEffect(() => {
    if (view === "history") loadArchived();
  }, [view, loadArchived]);

  const activeRel = active ? toRelative(root, active) : null;
  const source = view === "open" ? comments : archived;

  const filtered = useMemo(
    () =>
      source
        .filter((c) => typeFilter === "all" || c.type === typeFilter)
        .filter((c) => view === "history" || stateFilter === "all" || c.state === stateFilter)
        .filter((c) => !thisFileOnly || c.anchor.file === activeRel)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [source, view, typeFilter, stateFilter, thisFileOnly, activeRel],
  );

  const jump = (c: Comment) => {
    if (c.anchor.scope === "range") open(`${root}/${c.anchor.file}`, c.anchor.startLine);
    else if (c.anchor.file) open(`${root}/${c.anchor.file}`);
    if (view === "open") setActive(c.id);
  };

  const segment = (id: "open" | "history", label: string) => (
    <button
      type="button"
      onClick={() => useWorkspace.getState().setCommentFilter({ view: id })}
      aria-pressed={view === id}
      className={`flex-1 rounded-sm px-2 py-1 text-xs transition-colors ${
        view === id
          ? "bg-canvas font-medium text-ink"
          : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Open / History switch. */}
      <div className="flex gap-1 border-b border-line bg-surface p-1">
        {segment("open", t("comments.open"))}
        {segment("history", t("comments.history"))}
      </div>

      {/* Filters. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-2">
        <Select
          ariaLabel="type filter"
          value={typeFilter}
          onChange={(v) => useWorkspace.getState().setCommentFilter({ type: v })}
          options={[
            { value: "all", label: t("comments.filter.all") },
            ...COMMENT_TYPES.map((tp) => ({ value: tp, label: t(typeKey(tp)), color: TYPE_COLOR[tp] })),
          ]}
        />
        {view === "open" && (
          <Select
            ariaLabel="state filter"
            value={stateFilter}
            onChange={(v) => useWorkspace.getState().setCommentFilter({ state: v })}
            options={[
              { value: "all", label: t("comments.filter.all") },
              ...COMMENT_STATES.map((st) => ({ value: st, label: t(stateKey(st)) })),
            ]}
          />
        )}
        <Checkbox
          checked={thisFileOnly}
          onChange={(v) => useWorkspace.getState().setCommentFilter({ thisFile: v })}
          label={t("comments.filter.thisFile")}
          className="text-xs text-muted"
        />
      </div>

      {/* List. */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-faint">
            {t(view === "open" ? "comments.empty" : "comments.historyEmpty")}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {filtered.map((c) => {
              const pending = view === "open" && c.state === "open" && changed.has(c.anchor.file);
              return (
              <li key={c.id} className={`group relative border-b border-line ${pending ? "bg-accent/5" : ""}`}>
                {view === "open" && c.state !== "done" && (
                  <button
                    type="button"
                    onClick={() => void useComments.getState().setState(c.id, "done")}
                    aria-label={t("comments.resolve")}
                    title={t("comments.resolve")}
                    className="absolute right-2 top-2 z-10 rounded-md bg-surface px-1.5 py-0.5 text-xs text-accent opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    ✓
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => jump(c)}
                  className={`flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-surface ${
                    activeId === c.id ? "bg-selection" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Dot color={TYPE_COLOR[c.type]} />
                    <span className="text-xs font-medium text-ink">{t(typeKey(c.type))}</span>
                    {c.origin && (
                      <span className="rounded bg-overlay px-1 text-[9px] uppercase tracking-wide text-faint">
                        {c.origin}
                      </span>
                    )}
                    {c.orphan && <span className="text-xs text-marker">⚠</span>}
                    <span className="ml-auto text-[10px] text-faint">
                      {pending
                        ? t("comments.pending").toUpperCase()
                        : view === "history"
                          ? t("comments.resolvedAt", { date: fmtDate(c.updatedAt) })
                          : t(stateKey(c.state)).toUpperCase()}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm text-muted">{c.messages[0]?.body || ""}</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-faint">
                    {c.anchor.file}
                    {c.anchor.scope === "range" ? `:${c.anchor.startLine}` : ""}
                  </span>
                </button>
                {pending && (
                  <div className="flex items-center gap-2 px-3 pb-2">
                    <span className="mr-auto text-[10px] text-accent">{t("comments.agentChanged")}</span>
                    <button
                      type="button"
                      onClick={() => reviewChange(c)}
                      className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted hover:text-ink"
                    >
                      {t("comments.reviewChange")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void useComments.getState().setState(c.id, "done")}
                      className="rounded-md bg-surface px-2 py-0.5 text-xs text-accent hover:text-ink"
                    >
                      {t("comments.resolve")}
                    </button>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Ask an agent to review the open tasks or audit the code into comments. */}
      <div className="flex flex-none gap-2 border-t border-line p-2">
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          disabled={openTasks === 0}
          title={openTasks === 0 ? t("terminal.noTasks") : t("terminal.sendReview")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-on-accent transition-[filter] hover:brightness-110 disabled:opacity-40"
        >
          <SendIcon className="h-3.5 w-3.5" />
          {t("comments.review")}
          {openTasks > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_oklch,var(--accent-contrast)_25%,transparent)] px-1 text-[10px]">
              {openTasks}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setAuditTarget(auditScope())}
          title={active ? t("tree.audit") : t("comments.auditProject")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs text-ink transition-colors hover:border-line-strong"
        >
          <SparkleIcon className="h-3.5 w-3.5" />
          {t("comments.audit")}
        </button>
      </div>

      <SendReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} />
      <AuditDialog target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}
