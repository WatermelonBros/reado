/** Path breadcrumb for the active file, with a manual-editing toggle. */
import { useProject, useEditorActions } from "../lib/store";
import { useT } from "../i18n";
import { ChevronIcon, DiffIcon } from "./icons";

export function Breadcrumb() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const isRepo = useProject((s) => s.git.isRepo);
  const diffing = useEditorActions((s) => s.diffing);
  const setDiffing = useEditorActions((s) => s.setDiffing);
  const dirty = useEditorActions((s) => s.dirty);
  const t = useT();
  if (!active) return null;

  const rel = (active.startsWith(root) ? active.slice(root.length) : active)
    .replace(/^[\\/]+/, "")
    .replace(/\\/g, "/");
  const segments = rel.split("/");

  return (
    <nav
      aria-label="File path"
      className="flex flex-none items-center gap-0.5 border-b border-line bg-canvas px-4 py-2 text-xs text-faint select-none"
    >
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <ChevronIcon className="h-[11px] w-[11px] opacity-60" />}
          <span className={i === segments.length - 1 ? "text-muted" : ""}>{seg}</span>
        </span>
      ))}

      {dirty && (
        <span
          className="ml-1 h-1.5 w-1.5 flex-none rounded-full bg-accent"
          title="Unsaved changes"
        />
      )}

      <div className="ml-auto flex flex-none items-center gap-0.5">
        {isRepo && (
          <button
            type="button"
            onClick={() => setDiffing(!diffing)}
            aria-pressed={diffing}
            title={t("diff.toggle")}
            aria-label={t("diff.toggle")}
            className={`grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-surface ${
              diffing ? "text-accent" : "text-faint hover:text-ink"
            }`}
          >
            <DiffIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </nav>
  );
}
