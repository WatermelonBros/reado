/**
 * Specs side panel: the project's OpenSpec change proposals and capability specs
 * (or a speckit `.specify/` tree), grouped and ordered, so the plan reads right
 * next to the code. Clicking a document opens it in the editor.
 */
import { useSpecs } from "../../lib/specs";
import { useProject } from "../../lib/store";
import { useTranslation } from "react-i18next";

/** Display label without the markdown extension (proposal.md → proposal). */
const stripExt = (label: string) => label.replace(/\.(md|markdown)$/i, "");

export function SpecsPanel() {
  const groups = useSpecs((s) => s.groups);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const active = useProject((s) => s.active);
  const { t } = useTranslation();

  if (groups.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("specs.empty")}</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto py-1">
      {groups.map((g) => (
        <div key={`${g.kind}:${g.title}`} className="mb-1">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
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
          </div>
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
        </div>
      ))}
    </div>
  );
}
