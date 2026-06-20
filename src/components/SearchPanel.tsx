/**
 * The Search side panel: full-text project search via ripgrep, with results
 * grouped by file. Selecting a result navigates the editor to that line.
 */
import { useEffect, useState } from "react";
import { searchText, type SearchMatch } from "../lib/api";
import { useProject } from "../lib/store";
import { toRelative } from "../lib/comments";
import { useT } from "../i18n";

export function SearchPanel() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const t = useT();

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      <div className="border-b border-line p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          spellCheck={false}
          className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <p className="px-3 py-3 text-xs text-marker">
            {error.includes("ripgrep") ? t("search.ripgrepMissing") : error}
          </p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-3 text-xs text-faint">
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
