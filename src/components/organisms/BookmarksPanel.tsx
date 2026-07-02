/**
 * Bookmarks panel: this project's reading pins, grouped by file, click to jump.
 * A navigation aid distinct from comments — no annotation, never sent to an AI
 * agent. Each row shows the captured snippet + line; a quiet remove action.
 */
import { useMemo } from "react";
import { useBookmarks } from "../../lib/bookmarks";
import { useProject } from "../../lib/store";
import { CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function BookmarksPanel() {
  const bookmarks = useBookmarks((s) => s.bookmarks);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const { t } = useTranslation();

  // Group by file, each file's pins sorted by line.
  const groups = useMemo(() => {
    const byFile = new Map<string, typeof bookmarks>();
    for (const b of bookmarks) {
      const arr = byFile.get(b.path) ?? [];
      arr.push(b);
      byFile.set(b.path, arr);
    }
    return [...byFile.entries()]
      .map(([path, items]) => ({ path, items: [...items].sort((a, b) => a.line - b.line) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [bookmarks]);

  if (bookmarks.length === 0) {
    return (
      <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("bookmarks.empty")}</p>
    );
  }

  return (
    <ul className="m-0 h-full list-none overflow-y-auto p-0 py-1">
      {groups.map((g) => (
        <li key={g.path}>
          <div className="truncate px-3 pt-2 pb-0.5 text-xs font-medium text-muted">
            {g.path}
          </div>
          {g.items.map((b) => (
            <div key={`${b.line}`} className="group/bm flex items-center">
              <button
                type="button"
                onClick={() => open(`${root}/${b.path}`, b.line)}
                title={b.snippet}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-3 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <span className="min-w-0 flex-1 truncate font-mono">{b.snippet || "—"}</span>
                <span className="flex-none font-mono text-xs text-faint tabular-nums">
                  {b.line}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("bookmarks.remove")}
                title={t("bookmarks.remove")}
                onClick={() => useBookmarks.getState().remove(root, b.path, b.line)}
                className="grid h-6 w-6 flex-none place-items-center text-faint opacity-0 transition-opacity group-hover/bm:opacity-100 group-focus-within/bm:opacity-100 focus-visible:opacity-100 hover:text-ink"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
