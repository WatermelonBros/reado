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
import { useProject } from "../../lib/store";
import { useT } from "../../i18n";
import { COMMENT_STATES, COMMENT_TYPES, TYPE_COLOR, typeKey, stateKey, Dot } from "../atoms/commentMeta";
import { Select } from "../atoms/Select";
import { Checkbox } from "../atoms/Checkbox";

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
  const t = useT();

  const [view, setView] = useState<"open" | "history">("open");
  const [typeFilter, setTypeFilter] = useState<CommentType | "all">("all");
  const [stateFilter, setStateFilter] = useState<CommentState | "all">("all");
  const [thisFileOnly, setThisFileOnly] = useState(false);

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
      onClick={() => setView(id)}
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
          onChange={(v) => setTypeFilter(v as CommentType | "all")}
          options={[
            { value: "all", label: t("comments.filter.all") },
            ...COMMENT_TYPES.map((tp) => ({ value: tp, label: t(typeKey(tp)), color: TYPE_COLOR[tp] })),
          ]}
        />
        {view === "open" && (
          <Select
            ariaLabel="state filter"
            value={stateFilter}
            onChange={(v) => setStateFilter(v as CommentState | "all")}
            options={[
              { value: "all", label: t("comments.filter.all") },
              ...COMMENT_STATES.map((st) => ({ value: st, label: t(stateKey(st)) })),
            ]}
          />
        )}
        <Checkbox
          checked={thisFileOnly}
          onChange={setThisFileOnly}
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
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => jump(c)}
                  className={`flex w-full flex-col gap-1 border-b border-line px-3 py-2 text-left transition-colors hover:bg-surface ${
                    activeId === c.id ? "bg-selection" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Dot color={TYPE_COLOR[c.type]} />
                    <span className="text-xs font-medium text-ink">{t(typeKey(c.type))}</span>
                    {c.orphan && <span className="text-xs text-marker">⚠</span>}
                    <span className="ml-auto text-[10px] text-faint">
                      {view === "history"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
