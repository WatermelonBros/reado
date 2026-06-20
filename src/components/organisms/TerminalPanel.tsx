/**
 * The integrated-terminal dock at the bottom of the workspace.
 *
 * Hosts multiple terminal tabs (each a live PTY) plus launch buttons that start
 * `claude`/`codex` in the active terminal — the entry point to the AI loop.
 * Inactive terminals stay mounted but hidden so their sessions persist.
 */
import { ptyWrite } from "../../lib/api";
import { useTerminals } from "../../lib/terminals";
import { useProject } from "../../lib/store";
import { useComments } from "../../lib/comments";
import { useState } from "react";
import { useT } from "../../i18n";
import { Terminal } from "../organisms/Terminal";
import { SendReviewDialog } from "../organisms/SendReviewDialog";
import { PlusIcon, CloseIcon, SendIcon } from "../atoms/icons";

export function TerminalPanel() {
  const sessions = useTerminals((s) => s.sessions);
  const activeId = useTerminals((s) => s.activeId);
  const add = useTerminals((s) => s.add);
  const remove = useTerminals((s) => s.remove);
  const setActive = useTerminals((s) => s.setActive);
  const toggle = useTerminals((s) => s.toggle);
  const root = useProject((s) => s.root);
  // Select the stable array and derive the count in render (returning a new
  // array from the selector would loop).
  const openTaskCount = useComments(
    (s) => s.comments.filter((c) => c.kind === "task" && c.state === "open").length,
  );
  const t = useT();

  // Run a command in the active terminal, creating one if needed.
  const launch = (command: string) => {
    const id = activeId ?? add();
    // Defer so a freshly spawned PTY is ready before we write to it.
    setTimeout(() => ptyWrite(id, `${command}\r`), id === activeId ? 0 : 400);
  };

  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <div className="flex h-[280px] flex-none flex-col border-t border-line bg-canvas">
      {/* Tab bar. */}
      <div className="flex h-9 flex-none items-center gap-1 border-b border-line pr-2 pl-1">
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sessions.map((s) => (
            <div
              key={s.id}
              role="tab"
              aria-selected={s.id === activeId}
              onClick={() => setActive(s.id)}
              className={`group flex items-center gap-2 rounded-md px-3 py-1 text-xs whitespace-nowrap transition-colors ${
                s.id === activeId
                  ? "bg-surface text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              <span>{s.title}</span>
              <button
                type="button"
                aria-label={t("terminal.close")}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(s.id);
                }}
                className="grid h-4 w-4 place-items-center rounded-sm text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
              >
                <CloseIcon className="block h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            aria-label={t("terminal.new")}
            title={t("terminal.new")}
            onClick={() => add()}
            className="ml-1 grid h-6 w-6 flex-none place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Send review + launch buttons + collapse. */}
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          disabled={openTaskCount === 0}
          title={
            openTaskCount === 0 ? t("terminal.noTasks") : t("terminal.sendReview")
          }
          className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-on-accent transition-[filter] hover:brightness-110 disabled:opacity-40"
        >
          <SendIcon className="h-3.5 w-3.5" />
          {t("terminal.sendReview")}
          {openTaskCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_oklch,var(--accent-contrast)_25%,transparent)] px-1 text-[10px]">
              {openTaskCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => launch("READO_AGENT=claude-code claude")}
          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-ink transition-colors hover:border-line-strong"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--syn-control)" }} />
          {t("terminal.launchClaude")}
        </button>
        <button
          type="button"
          onClick={() => launch("READO_AGENT=codex codex")}
          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-ink transition-colors hover:border-line-strong"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--syn-string)" }} />
          {t("terminal.launchCodex")}
        </button>
        <button
          type="button"
          aria-label={t("terminal.hide")}
          title={t("terminal.hide")}
          onClick={() => toggle(false)}
          className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal stack — all mounted, only the active one visible. */}
      <div className="relative min-h-0 flex-1 p-1">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={s.id === activeId ? "absolute inset-1" : "hidden"}
          >
            <Terminal id={s.id} cwd={root} active={s.id === activeId} />
          </div>
        ))}
      </div>

      <SendReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}
