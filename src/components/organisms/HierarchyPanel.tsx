/**
 * Call / type hierarchy panel: read-first "who calls this / who implements this",
 * server-backed (LSP), one level deep with a direction toggle. Click a node to
 * jump; re-run "Show Call Hierarchy" at a node to go deeper.
 */
import { useHierarchy, type HierDir } from "../../lib/hierarchy";
import { setHierarchyDirection } from "../../lib/docInfo";
import { useProject } from "../../lib/store";
import { toRelative } from "../../lib/comments";
import { useTranslation } from "react-i18next";

export function HierarchyPanel() {
  const { mode, direction, root, results, loading, unsupported } = useHierarchy();
  const rootProject = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const { t } = useTranslation();

  // The two directions for the current mode.
  const dirs: { id: HierDir; label: string }[] =
    mode === "call"
      ? [
          { id: "incoming", label: t("hier.incoming") },
          { id: "outgoing", label: t("hier.outgoing") },
        ]
      : [
          { id: "sub", label: t("hier.sub") },
          { id: "super", label: t("hier.super") },
        ];

  if (unsupported) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("hier.unsupported")}</p>;
  }
  if (!root && !loading) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("hier.empty")}</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {root && (
        <div className="flex-none border-b border-line px-3 py-2">
          <div className="truncate text-xs font-medium text-ink">{root.name}</div>
          <div className="truncate text-[11px] text-faint">
            {toRelative(rootProject, root.path)}:{root.line}
          </div>
          <div className="mt-1.5 flex gap-1">
            {dirs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setHierarchyDirection(d.id)}
                aria-pressed={direction === d.id}
                className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                  direction === d.id
                    ? "bg-selection text-ink"
                    : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="m-0 flex-1 list-none overflow-y-auto p-0 py-1">
        {loading && <li className="px-3 py-2 text-xs text-faint">{t("common.loading")}</li>}
        {!loading && results.length === 0 && root && (
          <li className="px-3 py-2 text-xs text-faint">{t("hier.none")}</li>
        )}
        {results.map((n, i) => (
          <li key={`${n.path}:${n.line}:${i}`}>
            <button
              type="button"
              onClick={() => open(n.path, n.line)}
              title={`${n.path}:${n.line}`}
              className="flex w-full items-baseline gap-2 py-1 pr-3 pl-3 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
              <span className="flex-none truncate text-[11px] text-faint">
                {toRelative(rootProject, n.path)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
