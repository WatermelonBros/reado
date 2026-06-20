/** Path breadcrumb for the active file, shown above the reading surface. */
import { useProject } from "../lib/store";
import { ChevronIcon } from "./icons";

export function Breadcrumb() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  if (!active) return null;

  const rel = (active.startsWith(root) ? active.slice(root.length) : active)
    .replace(/^[\\/]+/, "")
    .replace(/\\/g, "/");
  const segments = rel.split("/");

  return (
    <nav
      aria-label="File path"
      className="flex flex-none flex-wrap items-center gap-0.5 border-b border-line bg-canvas px-4 py-2 text-xs text-faint select-none"
    >
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <ChevronIcon className="h-[11px] w-[11px] opacity-60" />}
          <span className={i === segments.length - 1 ? "text-muted" : ""}>{seg}</span>
        </span>
      ))}
    </nav>
  );
}
