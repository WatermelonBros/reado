/**
 * The Comments side panel: every comment in the project, filterable by state,
 * type and (optionally) the current file. Selecting one navigates the editor to
 * its anchor and opens its thread.
 */
import { useMemo, useState } from "react";
import type { Comment, CommentState, CommentType } from "../lib/api";
import { useComments, toRelative } from "../lib/comments";
import { useProject } from "../lib/store";
import { useT } from "../i18n";
import {
  COMMENT_STATES,
  COMMENT_TYPES,
  TYPE_COLOR,
  typeKey,
  stateKey,
  Dot,
} from "./commentMeta";
import { Select } from "./ui/Select";
import { Checkbox } from "./ui/Checkbox";

export function CommentsPanel() {
  const comments = useComments((s) => s.comments);
  const setActive = useComments((s) => s.setActive);
  const activeId = useComments((s) => s.activeId);
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const open = useProject((s) => s.open);
  const t = useT();

  const [typeFilter, setTypeFilter] = useState<CommentType | "all">("all");
  const [stateFilter, setStateFilter] = useState<CommentState | "all">("all");
  const [thisFileOnly, setThisFileOnly] = useState(false);

  const activeRel = active ? toRelative(root, active) : null;

  const filtered = useMemo(() => {
    return comments
      .filter((c) => typeFilter === "all" || c.type === typeFilter)
      .filter((c) => stateFilter === "all" || c.state === stateFilter)
      .filter((c) => !thisFileOnly || c.anchor.file === activeRel)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [comments, typeFilter, stateFilter, thisFileOnly, activeRel]);

  const jump = (c: Comment) => {
    if (c.anchor.scope === "range") {
      open(`${root}/${c.anchor.file}`, c.anchor.startLine);
    } else if (c.anchor.file) {
      open(`${root}/${c.anchor.file}`);
    }
    setActive(c.id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-2">
        <Select
          ariaLabel="type filter"
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as CommentType | "all")}
          options={[
            { value: "all", label: t("comments.filter.all") },
            ...COMMENT_TYPES.map((tp) => ({
              value: tp,
              label: t(typeKey(tp)),
              color: TYPE_COLOR[tp],
            })),
          ]}
        />
        <Select
          ariaLabel="state filter"
          value={stateFilter}
          onChange={(v) => setStateFilter(v as CommentState | "all")}
          options={[
            { value: "all", label: t("comments.filter.all") },
            ...COMMENT_STATES.map((st) => ({ value: st, label: t(stateKey(st)) })),
          ]}
        />
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
            {t("comments.empty")}
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
                    <span className="ml-auto text-[10px] text-faint uppercase">
                      {t(stateKey(c.state))}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm text-muted">
                    {c.messages[0]?.body || ""}
                  </span>
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
