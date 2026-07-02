/**
 * Problems panel: language-server diagnostics aggregated across the files Reado
 * has seen, grouped by file, click to jump. Read-first triage — "what's broken /
 * what to understand". Scope follows what the servers publish (workspace-wide for
 * servers like rust-analyzer, open-file-only for others).
 */
import { useMemo, useState } from "react";
import { useDiagnostics, type DiagItem } from "../../lib/diagnostics";
import { useProject } from "../../lib/store";
import { toRelative } from "../../lib/comments";
import { useTranslation } from "react-i18next";

// LSP severity → token + short label key. Hints fold into "info".
const SEVERITY: Record<number, { color: string; bucket: "error" | "warn" | "info" }> = {
  1: { color: "var(--diag-error)", bucket: "error" },
  2: { color: "var(--diag-warn)", bucket: "warn" },
  3: { color: "var(--diag-info)", bucket: "info" },
  4: { color: "var(--diag-info)", bucket: "info" },
};

export function ProblemsPanel() {
  const byFile = useDiagnostics((s) => s.byFile);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const { t } = useTranslation();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Files sorted by path, each with its diagnostics sorted by line; counts per
  // bucket drive the filter chips.
  const { files, counts } = useMemo(() => {
    const counts = { error: 0, warn: 0, info: 0 };
    const files = Object.entries(byFile)
      .map(([path, items]) => {
        const sorted = [...items].sort((a, b) => a.line - b.line);
        for (const d of sorted) counts[SEVERITY[d.severity]?.bucket ?? "info"]++;
        return { path, items: sorted };
      })
      .filter((f) => f.items.length)
      .sort((a, b) => a.path.localeCompare(b.path));
    return { files, counts };
  }, [byFile]);

  const visible = (d: DiagItem) => !hidden.has(SEVERITY[d.severity]?.bucket ?? "info");
  const shown = files
    .map((f) => ({ ...f, items: f.items.filter(visible) }))
    .filter((f) => f.items.length);

  const toggle = (bucket: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.has(bucket) ? next.delete(bucket) : next.add(bucket);
      return next;
    });

  if (files.length === 0) {
    return (
      <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("problems.empty")}</p>
    );
  }

  const chip = (bucket: "error" | "warn" | "info", count: number) => (
    <button
      type="button"
      onClick={() => toggle(bucket)}
      aria-pressed={!hidden.has(bucket)}
      className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs tabular-nums transition-colors ${
        hidden.has(bucket) ? "text-faint opacity-50" : "text-muted hover:text-ink"
      }`}
    >
      <span
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: SEVERITY[bucket === "error" ? 1 : bucket === "warn" ? 2 : 3].color }}
      />
      {count} {t(`problems.${bucket}`)}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
        {chip("error", counts.error)}
        {chip("warn", counts.warn)}
        {chip("info", counts.info)}
      </div>
      <ul className="m-0 flex-1 list-none overflow-y-auto p-0 py-1">
        {shown.map((f) => (
          <li key={f.path}>
            <div className="truncate px-3 pt-2 pb-0.5 text-xs font-medium text-muted">
              {toRelative(root, f.path)}
            </div>
            {f.items.map((d, i) => (
              <button
                key={`${d.line}:${i}`}
                type="button"
                onClick={() => open(f.path, d.line)}
                title={d.message}
                className="flex w-full items-start gap-2 py-1 pr-3 pl-3 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <span
                  className="mt-1 h-2 w-2 flex-none rounded-full"
                  style={{ background: (SEVERITY[d.severity] ?? SEVERITY[3]).color }}
                />
                <span className="min-w-0 flex-1 truncate">{d.message}</span>
                <span className="flex-none font-mono text-xs text-faint tabular-nums">
                  {d.line}
                </span>
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
