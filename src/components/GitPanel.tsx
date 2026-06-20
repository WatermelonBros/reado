/**
 * The Source Control side panel (read-only).
 *
 * Reado never stages or commits — git stays the user's tool. This surfaces the
 * working-tree changes; selecting a file opens it and turns on the diff view so
 * you can see what changed (including the agent's edits).
 */
import { useCallback, useEffect, useState } from "react";
import { gitStatus, type GitChange } from "../lib/api";
import { useProject, useEditorActions } from "../lib/store";
import { useT } from "../i18n";

/** Single-letter badge + colour per change category. */
const STATUS: Record<GitChange["status"], { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--syn-number)" },
  added: { letter: "A", color: "var(--syn-string)" },
  deleted: { letter: "D", color: "var(--marker)" },
  renamed: { letter: "R", color: "var(--syn-keyword)" },
  untracked: { letter: "U", color: "var(--text-faint)" },
};

const basename = (p: string) => p.split("/").pop() ?? p;
const dirname = (p: string) => {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "";
};

export function GitPanel() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const setDiffing = useEditorActions((s) => s.setDiffing);
  const t = useT();
  const [changes, setChanges] = useState<GitChange[]>([]);

  const refresh = useCallback(() => {
    gitStatus(root).then(setChanges).catch(() => setChanges([]));
  }, [root]);

  useEffect(() => {
    refresh();
    // Keep the view fresh as the tree changes (cheap, debounced by interval).
    const id = window.setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const select = (c: GitChange) => {
    if (c.status === "deleted") return;
    open(`${root}/${c.path}`);
    setDiffing(true);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {changes.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("git.clean")}</p>
      ) : (
        <ul className="m-0 list-none overflow-y-auto p-0">
          {changes.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={c.path}>
                <button
                  type="button"
                  onClick={() => select(c)}
                  title={c.path}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-sm transition-colors hover:bg-surface"
                >
                  <span className="truncate text-ink">{basename(c.path)}</span>
                  <span className="truncate text-xs text-faint">{dirname(c.path)}</span>
                  <span
                    className="ml-auto flex-none font-mono text-xs font-semibold"
                    style={{ color: s.color }}
                  >
                    {s.letter}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
