/**
 * Knowledge base overlay.
 *
 * One place for the project's knowledge: its **docs** (README, `docs/**`,
 * product/code docs), its **specs** (OpenSpec/speckit), and the **notes**
 * captured while reading (the comments, open and resolved). An index on the
 * left, the selected document — or the notes digest — rendered on the right,
 * filterable by name. Read-only; it just points the editor at the source.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { readFile, searchText, listFiles, type Comment, type CommentType } from "../../lib/api";
import { useComments } from "../../lib/comments";
import { useProject, useWorkspace } from "../../lib/store";
import { useSpecs } from "../../lib/specs";
import { listDocs, type DocItem } from "../../lib/knowledge";

import { COMMENT_TYPES, TYPE_COLOR, typeKey, stateKey, Dot } from "../atoms/commentMeta";
import { Select } from "../atoms/Select";
import { CloseIcon, DocsIcon, SpecsIcon, MessageIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type Selection =
  | { kind: "notes" }
  | { kind: "doc" | "spec"; path: string; label: string };

const stripExt = (s: string) => s.replace(/\.(md|markdown|mdx)$/i, "");
const basename = (p: string) => p.split("/").pop() ?? p;

export function DocsView() {
  const comments = useComments((s) => s.comments);
  const archived = useComments((s) => s.archived);
  const loadArchived = useComments((s) => s.loadArchived);
  const setActiveComment = useComments((s) => s.setActive);
  const specGroups = useSpecs((s) => s.groups);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const close = useWorkspace((s) => s.toggleDocs);
  const { t } = useTranslation();

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CommentType | "all">("all");
  const [selection, setSelection] = useState<Selection>({ kind: "notes" });
  const [content, setContent] = useState<string | null>(null);
  // KB paths whose *content* matches the query (full-text, not just the name).
  const [contentMatches, setContentMatches] = useState<Set<string>>(new Set());
  // A missing ripgrep must surface (like SearchPanel), not be swallowed — else
  // content search silently degrades to name-only with no explanation.
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    loadArchived();
    listFiles(root)
      .then((files) => {
        const ds = listDocs(files);
        setDocs(ds);
        // Open the README (or first doc) by default; fall back to notes.
        if (ds.length) setSelection({ kind: "doc", path: ds[0].path, label: ds[0].label });
      })
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadArchived, close, root]);

  // Fetch the selected markdown document.
  useEffect(() => {
    if (selection.kind === "notes") {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContent(null);
    // read_file resolves `path` as given (it doesn't join `root`), so the KB's
    // project-relative doc/spec paths must be made absolute — otherwise every
    // document fails to load.
    readFile(root, `${root}/${selection.path}`)
      .then((c) => !cancelled && setContent(c.kind === "text" ? c.text : ""))
      .catch(() => !cancelled && setContent(""));
    return () => {
      cancelled = true;
    };
  }, [selection, root]);

  // Comments grouped by file for the notes digest.
  const noteGroups = useMemo(() => {
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

  const jumpToComment = (c: Comment) => {
    if (c.anchor.file) open(`${root}/${c.anchor.file}`, c.anchor.startLine || undefined);
    if (!c.archived) setActiveComment(c.id);
    close(false);
  };

  // Full-text search across the KB: ripgrep the project, keep hits that are KB
  // docs/specs. Combined with the name filter below for a real KB search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setContentMatches(new Set());
      setSearchError(null);
      return;
    }
    const kbPaths = new Set([
      ...docs.map((d) => d.path),
      ...specGroups.flatMap((g) => g.items.map((i) => i.path)),
    ]);
    let cancelled = false;
    const id = setTimeout(() => {
      searchText(root, query.trim())
        .then((matches) => {
          if (cancelled) return;
          const hit = new Set<string>();
          for (const m of matches) {
            const rel = (m.path.startsWith(root) ? m.path.slice(root.length) : m.path)
              .replace(/^[\\/]+/, "")
              .replace(/\\/g, "/");
            if (kbPaths.has(rel)) hit.add(rel);
          }
          setContentMatches(hit);
          setSearchError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          // Name-filtering still works; only the full-text overlay is degraded.
          setContentMatches(new Set());
          setSearchError(String(e).includes("ripgrep") ? "ripgrep" : null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, root, docs, specGroups]);

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const filteredDocs = docs.filter((d) => match(d.label) || contentMatches.has(d.path));
  const filteredSpecs = specGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => match(i.label) || match(g.title) || contentMatches.has(i.path),
      ),
    }))
    .filter((g) => g.items.length > 0);

  const isSel = (kind: string, path?: string) =>
    selection.kind === kind && (kind === "notes" || (selection as { path: string }).path === path);

  const navButton = (
    key: string,
    label: string,
    icon: React.ReactNode,
    sel: Selection,
    indent = false,
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => setSelection(sel)}
      title={"path" in sel ? sel.path : label}
      className={`flex w-full items-center gap-2 truncate py-1 pr-3 text-left text-sm transition-colors ${
        indent ? "pl-7" : "pl-3"
      } ${
        isSel(sel.kind, "path" in sel ? sel.path : undefined)
          ? "bg-selection text-ink"
          : "text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );

  const sectionLabel = (text: string) => (
    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wide text-faint uppercase">
      {text}
    </div>
  );

  return createPortal(
    <div
      onClick={() => close(false)}
      className="animate-fade fixed inset-0 z-[115] grid place-items-center reado-scrim"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[70vh] max-h-[600px] w-[94vw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-line-strong bg-canvas shadow-[var(--shadow)]"
      >
        <header className="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="m-0 text-sm font-medium">{t("kb.title")}</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("kb.search")}
            aria-label={t("kb.search")}
            className="ml-2 w-48 rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />
          <button
            type="button"
            title={t("settings.close")} aria-label={t("settings.close")}
            onClick={() => close(false)}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Index */}
          <nav className="w-64 flex-none overflow-y-auto border-r border-line py-1">
            {searchError === "ripgrep" && (
              <p className="px-3 py-2 text-xs leading-relaxed text-marker">
                {t("search.ripgrepMissing")}
              </p>
            )}
            {filteredDocs.length > 0 && (
              <>
                {sectionLabel(t("kb.docs"))}
                {filteredDocs.map((d) =>
                  navButton(
                    d.path,
                    d.label.includes("/") ? d.label : basename(d.label),
                    <DocsIcon className="h-3.5 w-3.5 flex-none text-faint" />,
                    { kind: "doc", path: d.path, label: d.label },
                  ),
                )}
              </>
            )}

            {filteredSpecs.length > 0 && (
              <>
                {sectionLabel(t("kb.specs"))}
                {filteredSpecs.map((g) => (
                  <div key={`${g.kind}:${g.title}`}>
                    <div className="truncate px-3 pt-1.5 pb-0.5 text-xs font-medium text-muted">
                      {g.title}
                    </div>
                    {g.items.map((it) =>
                      navButton(
                        it.path,
                        stripExt(it.label),
                        <SpecsIcon className="h-3.5 w-3.5 flex-none text-faint" />,
                        { kind: "spec", path: it.path, label: it.label },
                        true,
                      ),
                    )}
                  </div>
                ))}
              </>
            )}

            {sectionLabel(t("kb.notes"))}
            {navButton(
              "notes",
              t("kb.notes"),
              <MessageIcon className="h-3.5 w-3.5 flex-none text-faint" />,
              { kind: "notes" },
            )}
          </nav>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            {selection.kind === "notes" ? (
              <NotesDigest
                groups={noteGroups}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                onJump={jumpToComment}
                t={t}
              />
            ) : content === null ? (
              <p className="text-sm text-faint">{t("common.loading")}</p>
            ) : (
              <div className="prose-reado mx-auto max-w-[680px]">
                {/* Project docs (READMEs especially) embed raw HTML — centered
                    headings, badge images. rehype-raw renders it instead of
                    showing the literal <h1> tags as text. */}
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The comments-as-documentation digest (the previous Documentation content). */
function NotesDigest({
  groups,
  typeFilter,
  setTypeFilter,
  onJump,
  t,
}: {
  groups: { file: string; list: Comment[] }[];
  typeFilter: CommentType | "all";
  setTypeFilter: (v: CommentType | "all") => void;
  onJump: (c: Comment) => void;
  t: TFunction;
}) {
  return (
    <div className="mx-auto max-w-[680px]">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="m-0 text-base font-semibold text-ink">{t("kb.notes")}</h3>
        <Select
          ariaLabel="type filter"
          variant="ghost"
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
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-faint">{t("comments.empty")}</p>
      ) : (
        groups.map(({ file, list }) => (
          <section key={file} className="mb-8">
            <h4 className="mb-3 border-b border-line pb-1 font-mono text-sm text-muted">{file}</h4>
            {list.map((c) => (
              <article key={c.id} className="mb-5">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Dot color={TYPE_COLOR[c.type]} />
                  <span className="font-medium text-ink">{t(typeKey(c.type))}</span>
                  {c.anchor.startLine > 0 && (
                    <button
                      type="button"
                      onClick={() => onJump(c)}
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
                    className="prose-reado mb-1 text-base leading-relaxed text-ink [&_p]:my-1"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
                  </div>
                ))}
              </article>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
