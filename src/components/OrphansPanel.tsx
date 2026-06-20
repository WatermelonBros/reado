/**
 * The Orphans side panel: comments whose anchored code could no longer be
 * located. Each shows its last-known location and snippet, and a Re-anchor
 * action that opens the file and lets the user pick the new line/range.
 */
import type { Comment } from "../lib/api";
import { useComments } from "../lib/comments";
import { useProject } from "../lib/store";
import { useT } from "../i18n";
import { TYPE_COLOR, typeKey, Dot } from "./commentMeta";

export function OrphansPanel() {
  const orphans = useComments((s) => s.comments.filter((c) => c.orphan));
  const startReanchor = useComments((s) => s.startReanchor);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const t = useT();

  const reanchor = (c: Comment) => {
    if (c.anchor.file) open(`${root}/${c.anchor.file}`);
    startReanchor(c.id);
  };

  if (orphans.length === 0) {
    return (
      <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("orphans.empty")}</p>
    );
  }

  return (
    <ul className="m-0 list-none overflow-y-auto p-0">
      {orphans.map((c) => (
        <li key={c.id} className="border-b border-line px-3 py-3">
          <div className="mb-1 flex items-center gap-2">
            <Dot color={TYPE_COLOR[c.type]} />
            <span className="text-xs font-medium text-ink">{t(typeKey(c.type))}</span>
            <span className="text-xs text-marker">⚠</span>
          </div>
          <p className="m-0 line-clamp-2 text-sm text-muted">{c.messages[0]?.body || ""}</p>
          <p className="mt-1 mb-2 text-[10px] text-faint">
            {t("orphans.lastKnown", {
              loc: `${c.anchor.file}:${c.anchor.startLine}`,
            })}
          </p>
          {c.context.snippet && (
            <pre className="mb-2 max-h-24 overflow-auto rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted">
              {c.context.snippet}
            </pre>
          )}
          <button
            type="button"
            onClick={() => reanchor(c)}
            className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink transition-colors hover:border-line-strong"
          >
            {t("orphans.reanchor")}
          </button>
        </li>
      ))}
    </ul>
  );
}
