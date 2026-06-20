/**
 * "Send review" dialog: choose which open tasks to hand to the agent and which
 * terminal (agent) receives them, then inject the review prompt. Completes
 * task 4.4 (deselectable batch + target agent).
 */
import { useMemo, useState } from "react";
import { ptyWrite } from "../../lib/api";
import { useComments } from "../../lib/comments";
import { useTerminals } from "../../lib/terminals";
import { composeReviewPrompt, composeReviewPromptForIds } from "../../lib/review";
import { useT } from "../../i18n";
import { TYPE_COLOR, typeKey, Dot } from "../atoms/commentMeta";
import { Modal } from "../atoms/Modal";
import { Checkbox } from "../atoms/Checkbox";
import { Select } from "../atoms/Select";

export function SendReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const comments = useComments((s) => s.comments);
  const tasks = comments.filter((c) => c.kind === "task" && c.state === "open");
  const sessions = useTerminals((s) => s.sessions);
  const activeId = useTerminals((s) => s.activeId);
  const add = useTerminals((s) => s.add);
  const t = useT();

  // All tasks selected by default; the target is the active terminal.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>("");

  const selected = useMemo(
    () => tasks.filter((c) => !excluded.has(c.id)).map((c) => c.id),
    [tasks, excluded],
  );

  const toggle = (id: string) =>
    setExcluded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const send = () => {
    const id = target || activeId || add();
    const prompt =
      selected.length === tasks.length
        ? composeReviewPrompt(tasks.length)
        : composeReviewPromptForIds(selected);
    setTimeout(() => ptyWrite(id, `${prompt}\r`), id === (target || activeId) ? 0 : 400);
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={t("review.title")}
      className="flex max-h-[80vh] w-[min(520px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
        <h2 className="m-0 text-sm font-semibold tracking-wide uppercase">{t("review.title")}</h2>
        {sessions.length > 1 && (
          <Select
            ariaLabel={t("review.target")}
            value={target || activeId || sessions[0]?.id || ""}
            onChange={setTarget}
            options={sessions.map((s) => ({ value: s.id, label: s.title }))}
          />
        )}
      </header>

      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
        {tasks.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface"
          >
            <Checkbox
              checked={!excluded.has(c.id)}
              onChange={() => toggle(c.id)}
              label={
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Dot color={TYPE_COLOR[c.type]} />
                    <span className="text-ink">{t(typeKey(c.type))}</span>
                    <span className="overflow-hidden font-mono text-ellipsis whitespace-nowrap text-faint">
                      {c.anchor.file}:{c.anchor.startLine}
                    </span>
                  </span>
                  <span className="line-clamp-1 text-sm text-muted">
                    {c.messages[0]?.body || ""}
                  </span>
                </span>
              }
            />
          </li>
        ))}
      </ul>

      <footer className="flex flex-none items-center justify-end gap-2 border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={selected.length === 0}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
        >
          {t("review.send", { count: selected.length })}
        </button>
      </footer>
    </Modal>
  );
}
