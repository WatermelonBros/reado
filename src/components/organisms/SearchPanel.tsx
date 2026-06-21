/**
 * The Search side panel: full-text project search via ripgrep, with results
 * grouped by file. Selecting a result navigates the editor to that line.
 */
import { useEffect, useState } from "react";
import { searchText, replaceText, type SearchMatch } from "../../lib/api";
import { useProject, useWorkspace } from "../../lib/store";
import { toRelative } from "../../lib/comments";
import { useT } from "../../i18n";

export function SearchPanel() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const pendingSearch = useWorkspace((s) => s.pendingSearch);
  const clearPendingSearch = useWorkspace((s) => s.clearPendingSearch);
  const t = useT();

  const [query, setQuery] = useState("");

  // Seed the query when something requests a search (e.g. Find references).
  useEffect(() => {
    if (pendingSearch !== null) {
      setQuery(pendingSearch);
      clearPendingSearch();
    }
  }, [pendingSearch, clearPendingSearch]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Literal project-wide replace, with a confirm step (it writes files, no undo).
  const doReplace = async () => {
    setConfirming(false);
    try {
      const n = await replaceText(root, query, replacement);
      setStatus(t("search.replaced", { count: n }));
      setMatches(await searchText(root, query));
    } catch (e) {
      setStatus(String(e));
    }
  };

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      setError(null);
      return;
    }
    const id = setTimeout(() => {
      searchText(root, query)
        .then((m) => {
          setMatches(m);
          setError(null);
        })
        .catch((e) => setError(String(e)));
    }, 180);
    return () => clearTimeout(id);
  }, [query, root]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col gap-1.5 border-b border-line p-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setStatus(null);
            setConfirming(false);
          }}
          placeholder={t("search.placeholder")}
          spellCheck={false}
          className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <div className="flex items-center gap-1.5">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder={t("search.replacePlaceholder")}
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
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
        {status && <span className="text-[11px] text-faint">{status}</span>}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <p className="px-4 py-4 text-xs text-marker">
            {error.includes("ripgrep") ? t("search.ripgrepMissing") : error}
          </p>
        ) : matches.length === 0 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-faint">
            {query.trim().length >= 2 ? t("search.noResults") : ""}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {matches.map((m, i) => (
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
          </ul>
        )}
      </div>
    </div>
  );
}
