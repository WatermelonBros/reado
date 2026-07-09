/**
 * Specs side panel: the project's OpenSpec change proposals and capability specs
 * (or a speckit `.specify/` tree), grouped and ordered, so the plan reads right
 * next to the code. Clicking a document opens it in the editor. A filter box
 * narrows the list; the panel reloads from disk as files change (see ProjectView)
 * and on demand via Refresh.
 */
import { useMemo, useState } from "react";
import { useSpecs, type SpecGroup } from "../../lib/specs";
import { useProject } from "../../lib/store";
import { SearchIcon, FetchIcon, ChevronIcon, CollapseAllIcon } from "../atoms/icons";
import { Input } from "../atoms/Input";
import { IconButton } from "../atoms/IconButton";
import { useTranslation } from "react-i18next";

/** Display label without the markdown extension (proposal.md → proposal). */
const stripExt = (label: string) => label.replace(/\.(md|markdown)$/i, "");

/** Keep groups whose title matches (all their items) or that have matching items. */
function filterGroups(groups: SpecGroup[], query: string): SpecGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => {
      if (g.title.toLowerCase().includes(q)) return g;
      const items = g.items.filter(
        (it) => it.label.toLowerCase().includes(q) || it.path.toLowerCase().includes(q),
      );
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
}

export function SpecsPanel() {
  const groups = useSpecs((s) => s.groups);
  const expanded = useSpecs((s) => s.expanded);
  const toggleExpanded = useSpecs((s) => s.toggleExpanded);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const active = useProject((s) => s.active);
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterGroups(groups, query), [groups, query]);
  const allKeys = useMemo(() => groups.map((g) => `${g.kind}:${g.title}`), [groups]);
  const anyExpanded = expanded.size > 0;

  // Not a spec project at all — no filter box, just the explainer.
  if (groups.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("specs.empty")}</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center gap-1.5 border-b border-line px-2 py-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <SearchIcon className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("specs.search")}
            aria-label={t("specs.search")}
            className="min-w-0 flex-1 bg-canvas py-1 pr-2 pl-7"
          />
        </div>
        <IconButton
          label={t(anyExpanded ? "specs.collapseAll" : "specs.expandAll")}
          onClick={() =>
            anyExpanded
              ? useSpecs.getState().collapseAll()
              : useSpecs.getState().expandAll(allKeys)
          }
          icon={<CollapseAllIcon className="h-4 w-4" />}
        />
        <IconButton
          label={t("specs.refresh")}
          onClick={() => void useSpecs.getState().load(root)}
          icon={<FetchIcon className="h-4 w-4" />}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("specs.noMatch")}</p>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.map((g) => {
            const key = `${g.kind}:${g.title}`;
            // Collapsed by default; a filter forces every matching group open.
            const isCollapsed = !query.trim() && !expanded.has(key);
            return (
            <div key={key} className="mb-1">
              <button
                type="button"
                onClick={() => toggleExpanded(key)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-2 px-3 pt-2.5 pb-1 text-left hover:bg-surface"
              >
                <ChevronIcon
                  className={`h-3 w-3 flex-none text-faint transition-transform ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
                />
                <span
                  className={`flex-none rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                    g.kind === "change"
                      ? "bg-[color-mix(in_oklch,var(--accent)_18%,transparent)] text-accent"
                      : "bg-surface text-muted"
                  }`}
                >
                  {t(g.kind === "change" ? "specs.change" : "specs.spec")}
                </span>
                <span className="truncate text-sm font-medium text-ink">{g.title}</span>
              </button>
              {!isCollapsed && (
              <ul className="m-0 list-none p-0">
                {g.items.map((item, i) => {
                  const full = `${root}/${item.path}`;
                  const isActive = active === full;
                  // A small "Specs" heading before the first capability delta.
                  const firstSpec = item.isSpec && (i === 0 || !g.items[i - 1].isSpec);
                  return (
                    <li key={item.path}>
                      {firstSpec && (
                        <div className="px-5 pt-2 pb-0.5 text-[10px] font-semibold tracking-wide text-faint uppercase">
                          {t("specs.spec")}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => open(full)}
                        title={item.path}
                        className={`flex w-full items-center gap-2 truncate py-1 pr-3 text-left text-sm transition-colors ${
                          item.isSpec ? "pl-7" : "pl-5"
                        } ${isActive ? "bg-selection text-ink" : "text-muted hover:bg-surface hover:text-ink"}`}
                      >
                        {item.isSpec && (
                          <span className="h-1 w-1 flex-none rounded-full bg-[var(--syn-control)]" />
                        )}
                        <span className="truncate">{stripExt(item.label)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
