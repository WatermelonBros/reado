/**
 * The Search side panel: full-text project search via ripgrep, with results
 * grouped by file. Selecting a result navigates the editor to that line.
 */
import { useEffect, useMemo, useState } from "react";
import { searchText, replaceText, type SearchMatch, type SearchOpts } from "../../lib/api";
import { useProject, useWorkspace } from "../../lib/store";
import { toRelative } from "../../lib/comments";
import { Textarea } from "../atoms/Textarea";
import { useTranslation } from "react-i18next";

/** Enter searches live; Shift+Enter inserts a newline (multi-line snippets). */
const multilineKeys = (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
};
/** Grow the box with its content, 1–6 rows. */
const rowsFor = (text: string) => Math.min(6, Math.max(1, text.split("\n").length));

// Cap the rows we actually mount. A broad query can hit the backend's 2000-match
// cap → ~4000 DOM nodes, janking every keystroke. Render the first N (like the
// command palette) and offer a "refine your search" hint when truncated. Full
// virtualization is a separate follow-up.
const RENDER_CAP = 300;

export function SearchPanel() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const pendingSearch = useWorkspace((s) => s.pendingSearch);
  const clearPendingSearch = useWorkspace((s) => s.clearPendingSearch);
  const { t } = useTranslation();

  // Restore the last query so leaving and returning to the Search tool doesn't
  // lose it (the debounced effect below re-runs the search from the seed).
  const [query, setQuery] = useState(() => useWorkspace.getState().searchQuery);

  // Persist the query so it survives a tool-switch / reopen.
  useEffect(() => {
    useWorkspace.getState().setSearchQuery(query);
  }, [query]);

  // Seed the query when something requests a search (e.g. Find references).
  useEffect(() => {
    if (pendingSearch !== null) {
      setQuery(pendingSearch);
      clearPendingSearch();
    }
  }, [pendingSearch, clearPendingSearch]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Search toggles (VS Code-style): case sensitive, whole word, regex.
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const opts = useMemo<SearchOpts>(
    () => ({ caseSensitive, wholeWord, regex }),
    [caseSensitive, wholeWord, regex],
  );

  // Literal project-wide replace, with a confirm step (it writes files, no undo).
  const doReplace = async () => {
    setConfirming(false);
    try {
      const n = await replaceText(root, query, replacement);
      setStatus(t("search.replaced", { count: n }));
      setMatches(await searchText(root, query, opts));
    } catch (e) {
      setStatus(String(e));
    }
  };

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      setError(null);
      setSearching(false);
      return;
    }
    const id = setTimeout(() => {
      // A slow ripgrep on a big repo shouldn't read as "no results / frozen":
      // flag the pending state so the panel can say it's searching.
      setSearching(true);
      searchText(root, query, opts)
        .then((m) => {
          setMatches(m);
          setError(null);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setSearching(false));
    }, 180);
    return () => clearTimeout(id);
  }, [query, root, opts]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col gap-1.5 border-b border-line p-2">
        {/* The case / whole-word / regex toggles sit inside the input, right edge. */}
        <div className="relative">
          <Textarea
            mono
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setStatus(null);
              setConfirming(false);
            }}
            onKeyDown={multilineKeys}
            rows={rowsFor(query)}
            placeholder={t("search.placeholder")}
            spellCheck={false}
            className="resize-none bg-canvas py-1.5 pr-[74px] pl-2 placeholder:font-sans"
          />
          <div className="absolute top-1 right-1 flex items-center gap-0.5">
            <FlagButton
              active={caseSensitive}
              onClick={() => setCaseSensitive((v) => !v)}
              label="Aa"
              title={t("search.caseSensitive")}
            />
            <FlagButton
              active={wholeWord}
              onClick={() => setWholeWord((v) => !v)}
              label="ab"
              title={t("search.wholeWord")}
            />
            <FlagButton
              active={regex}
              onClick={() => setRegex((v) => !v)}
              label=".*"
              title={t("search.regex")}
            />
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <Textarea
            mono
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={multilineKeys}
            rows={rowsFor(replacement)}
            placeholder={t("search.replacePlaceholder")}
            spellCheck={false}
            className="min-w-0 flex-1 resize-none bg-canvas placeholder:font-sans"
          />
          {confirming ? (
            <button
              type="button"
              onClick={doReplace}
              title={t("search.replaceConfirm")}
              className="flex-none rounded-md bg-marker px-2 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110"
            >
              {t("search.replaceConfirm")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={matches.length === 0}
              title={t("search.replaceAll")}
              aria-label={t("search.replaceAll")}
              className="flex-none rounded-md border border-line px-2 py-1.5 text-xs text-ink hover:border-line-strong disabled:opacity-40"
            >
              {t("search.replaceAll")}
            </button>
          )}
        </div>
        {status && <span className="text-xs text-faint">{status}</span>}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <p className="px-4 py-4 text-xs text-marker">
            {error.includes("ripgrep") ? t("search.ripgrepMissing") : error}
          </p>
        ) : searching && query.trim().length >= 2 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("search.searching")}</p>
        ) : matches.length === 0 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-faint">
            {query.trim().length >= 2 ? t("search.noResults") : ""}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {matches.slice(0, RENDER_CAP).map((m, i) => (
              <li key={`${m.path}-${m.line}-${i}`}>
                <button
                  type="button"
                  onClick={() => open(m.path, m.line)}
                  title={`${toRelative(root, m.path)}:${m.line}`}
                  className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-surface"
                >
                  <span className="overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap text-muted">
                    {m.text.trim()}
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-faint">
                    {toRelative(root, m.path)}:{m.line}
                  </span>
                </button>
              </li>
            ))}
            {matches.length > RENDER_CAP && (
              <li className="px-3 py-2 text-[10px] leading-relaxed text-faint">
                {t("search.truncated", {
                  shown: RENDER_CAP,
                  total: matches.length,
                  defaultValue: "Showing {shown} of {total} — refine your search.",
                })}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A small square search-mode toggle (case / whole-word / regex). */
function FlagButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={title}
      className={`grid h-6 w-6 flex-none place-items-center rounded border font-mono text-[11px] font-semibold transition-colors ${
        active
          ? "border-accent bg-[color-mix(in_oklch,var(--accent)_18%,transparent)] text-accent"
          : "border-line text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
