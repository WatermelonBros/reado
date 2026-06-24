/**
 * Q&A panel: the project's anchored Q&A notes, grouped by file, click to revisit
 * (opens the file at the line and shows the answer). Durable artifacts under
 * `.reado/qa/`; a navigation aid for understanding you've captured.
 */
import { useMemo } from "react";
import { useQa } from "../../lib/qa";
import { useProject } from "../../lib/store";
import { CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function QaPanel() {
  const notes = useQa((s) => s.notes);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const byFile = new Map<string, typeof notes>();
    for (const n of notes) {
      const arr = byFile.get(n.file) ?? [];
      arr.push(n);
      byFile.set(n.file, arr);
    }
    return [...byFile.entries()]
      .map(([file, items]) => ({ file, items: [...items].sort((a, b) => a.line - b.line) }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }, [notes]);

  if (notes.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("qa.empty")}</p>;
  }

  return (
    <ul className="m-0 h-full list-none overflow-y-auto p-0 py-1">
      {groups.map((g) => (
        <li key={g.file}>
          <div className="truncate px-3 pt-2 pb-0.5 text-[11px] font-medium text-muted">
            {g.file}
          </div>
          {g.items.map((n) => (
            <div key={n.id} className="group/qa flex items-center">
              <button
                type="button"
                onClick={() => {
                  open(`${root}/${n.file}`, n.line);
                  useQa.getState().view(n);
                }}
                title={n.question}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-3 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <span className="min-w-0 flex-1 truncate">{n.question}</span>
                <span className="flex-none font-mono text-[11px] text-faint tabular-nums">
                  {n.line}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("qa.remove")}
                title={t("qa.remove")}
                onClick={() => useQa.getState().remove(root, n.id)}
                className="grid h-6 w-6 flex-none place-items-center text-faint opacity-0 transition-opacity group-hover/qa:opacity-100 hover:text-ink"
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
