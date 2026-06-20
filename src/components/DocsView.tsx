/**
 * Documentation overlay.
 *
 * The comments are the documentation: this renders them — open and resolved —
 * grouped by file as a readable, editorial document, filterable by type. It's a
 * consultable record of the decisions and intent captured while reading.
 */
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Comment, CommentType } from "../lib/api";
import { useComments } from "../lib/comments";
import { useProject, useWorkspace } from "../lib/store";
import { useT } from "../i18n";
import { COMMENT_TYPES, TYPE_COLOR, typeKey, stateKey, Dot } from "./commentMeta";
import { Select } from "./ui/Select";
import { CloseIcon } from "./icons";

export function DocsView() {
  const comments = useComments((s) => s.comments);
  const archived = useComments((s) => s.archived);
  const loadArchived = useComments((s) => s.loadArchived);
  const setActive = useComments((s) => s.setActive);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const close = useWorkspace((s) => s.toggleDocs);
  const t = useT();
  const [typeFilter, setTypeFilter] = useState<CommentType | "all">("all");

  useEffect(() => {
    loadArchived();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadArchived, close]);

  // Group all comments by file, filtered by type, sorted by line.
  const groups = useMemo(() => {
    const all = [...comments, ...archived].filter(
      (c) => typeFilter === "all" || c.type === typeFilter,
    );
    const byFile = new Map<string, Comment[]>();
    for (const c of all) {
      const key = c.anchor.file || "(project)";
      (byFile.get(key) ?? byFile.set(key, []).get(key)!).push(c);
    }
    return [...byFile.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([file, list]) => ({
        file,
        list: list.sort((a, b) => a.anchor.startLine - b.anchor.startLine),
      }));
  }, [comments, archived, typeFilter]);

  const jump = (c: Comment) => {
    if (c.anchor.file) open(`${root}/${c.anchor.file}`, c.anchor.startLine || undefined);
    if (!c.archived) setActive(c.id);
    close(false);
  };

  return (
    <div
      onClick={() => close(false)}
      className="animate-fade fixed inset-0 z-[115] grid place-items-center reado-scrim"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] w-[92vw] max-w-[820px] flex-col overflow-hidden rounded-lg border border-line-strong bg-canvas shadow-[var(--shadow)]"
      >
        <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="m-0 text-sm font-semibold tracking-wide uppercase">{t("docs.title")}</h2>
          <div className="ml-auto flex items-center gap-2">
            <Select
              ariaLabel="type filter"
              variant="ghost"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as CommentType | "all")}
              options={[
                { value: "all", label: t("comments.filter.all") },
                ...COMMENT_TYPES.map((tp) => ({ value: tp, label: t(typeKey(tp)), color: TYPE_COLOR[tp] })),
              ]}
            />
            <button
              type="button"
              aria-label={t("settings.close")}
              onClick={() => close(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {groups.length === 0 ? (
            <p className="text-sm text-faint">{t("comments.empty")}</p>
          ) : (
            <div className="mx-auto max-w-[640px]">
              {groups.map(({ file, list }) => (
                <section key={file} className="mb-8">
                  <h3 className="mb-3 border-b border-line pb-1 font-mono text-sm text-muted">
                    {file}
                  </h3>
                  {list.map((c) => (
                    <article key={c.id} className="mb-5">
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <Dot color={TYPE_COLOR[c.type]} />
                        <span className="font-medium text-ink">{t(typeKey(c.type))}</span>
                        {c.anchor.startLine > 0 && (
                          <button
                            type="button"
                            onClick={() => jump(c)}
                            className="font-mono text-faint hover:text-accent"
                          >
                            :{c.anchor.startLine}
                          </button>
                        )}
                        <span className="ml-auto text-faint uppercase">{t(stateKey(c.state))}</span>
                      </div>
                      {c.messages.map((m, i) => (
                        <div
                          key={i}
                          className="prose-reado mb-1 text-[13px] leading-relaxed text-ink [&_p]:my-1"
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
                        </div>
                      ))}
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
