/**
 * "Ask AI for an audit" dialog.
 *
 * Lets the user point an agent at a file or folder with optional focus
 * instructions; the agent records what it finds as Reado comments anchored to
 * the code (via the `reado` CLI), so the findings are readable inline. Mirrors
 * SendReviewDialog: pick the target terminal, then inject a one-line prompt.
 */
import { useState } from "react";
import { submitToTerminal } from "../../lib/api";
import { useTerminals } from "../../lib/terminals";
import { composeAuditPrompt } from "../../lib/review";

import { Modal } from "../atoms/Modal";
import { Button } from "../atoms/Button";
import { Select } from "../atoms/Select";
import { Textarea } from "../atoms/Textarea";
import { useTranslation } from "react-i18next";

export interface AuditTarget {
  /** Project-relative path of the file or folder to audit. */
  path: string;
  isDir: boolean;
}

export function AuditDialog({
  target,
  onClose,
}: {
  target: AuditTarget | null;
  onClose: () => void;
}) {
  const sessions = useTerminals((s) => s.sessions);
  const activeId = useTerminals((s) => s.activeId);
  const add = useTerminals((s) => s.add);
  const { t } = useTranslation();

  const [instructions, setInstructions] = useState("");
  const [agent, setAgent] = useState("");

  const send = () => {
    if (!target) return;
    const id = agent || activeId || add();
    const prompt = composeAuditPrompt(target.path, instructions);
    // Defer when we just spawned a terminal so the PTY is ready to receive.
    submitToTerminal(id, prompt, id === (agent || activeId) ? 0 : 400);
    setInstructions("");
    onClose();
  };

  return (
    <Modal
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={t("audit.title")}
      className="flex w-[min(520px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
        <h2 className="m-0 text-sm font-semibold tracking-wide uppercase">{t("audit.title")}</h2>
        {sessions.length > 1 && (
          <Select
            ariaLabel={t("audit.target")}
            value={agent || activeId || sessions[0]?.id || ""}
            onChange={setAgent}
            options={sessions.map((s) => ({ value: s.id, label: s.title }))}
          />
        )}
      </header>

      <div className="flex flex-col gap-3 p-5">
        <div className="text-xs text-muted">
          {t("audit.target")}{" "}
          <span className="font-mono text-ink">{target?.path}</span>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-muted">
          {t("audit.instructions")}
          <Textarea
            autoFocus
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onSubmit={send}
            placeholder={t("audit.placeholder")}
            rows={4}
            className="resize-none bg-canvas px-3 py-2"
          />
        </label>

        <p className="m-0 text-xs text-faint">{t("audit.hint")}</p>
      </div>

      <footer className="flex flex-none items-center justify-end gap-2 border-t border-line px-5 py-3">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" onClick={send}>
          {t("audit.send")}
        </Button>
      </footer>
    </Modal>
  );
}
