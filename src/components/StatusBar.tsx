/**
 * Bottom status bar: active file, cursor position, git branch, open-comment
 * count and agent run status. State the tool never hides — it lives here.
 */
import { useCursor, useProject } from "../lib/store";
import { useComments, openCount } from "../lib/comments";
import { useTerminals } from "../lib/terminals";
import { useT } from "../i18n";
import { GitBranchIcon, MessageIcon, TerminalIcon } from "./icons";

/** Path relative to the project root, with forward slashes. */
function relativePath(root: string, path: string | null): string | null {
  if (!path) return null;
  const rel = path.startsWith(root) ? path.slice(root.length) : path;
  return rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

export function StatusBar() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const git = useProject((s) => s.git);
  const { line, col } = useCursor();
  const open = useComments((s) => openCount(s.comments));
  const toggleTerminal = useTerminals((s) => s.toggle);
  const t = useT();

  const rel = relativePath(root, active);

  return (
    <footer className="flex h-[26px] flex-none items-center justify-between border-t border-line bg-surface px-3 text-xs text-muted select-none">
      <div className="flex min-w-0 items-center gap-4">
        <span className="max-w-[50vw] overflow-hidden text-ellipsis whitespace-nowrap">
          {rel ?? t("status.noFile")}
        </span>
        {active && (
          <span className="text-faint">
            Ln {line}, Col {col}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-4">
        {git.isRepo ? (
          <span className="inline-flex items-center gap-[5px] whitespace-nowrap" title={t("status.branch")}>
            <GitBranchIcon className="h-[13px] w-[13px]" />
            {git.branch ?? "—"}
          </span>
        ) : (
          <span className="text-faint">{t("status.notGit")}</span>
        )}
        <span className="inline-flex items-center gap-[5px] whitespace-nowrap" title="open comments">
          <MessageIcon className="h-[13px] w-[13px]" />
          {t("status.comments", { count: open })}
        </span>
        <span className="text-faint">{t("status.agentIdle")}</span>
        <button
          type="button"
          onClick={() => toggleTerminal()}
          title={`${t("terminal.toggle")} (⌘J)`}
          aria-label={t("terminal.toggle")}
          className="inline-flex items-center gap-[5px] rounded-sm px-1 text-faint transition-colors hover:text-ink"
        >
          <TerminalIcon className="h-[13px] w-[13px]" />
        </button>
      </div>
    </footer>
  );
}
