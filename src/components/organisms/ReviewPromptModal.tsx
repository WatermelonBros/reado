/**
 * Free-text review prompt: instead of scoping a review to a git diff / branch /
 * PR, the reader describes in their own words what they want looked at, and the
 * agent decides which files are relevant. On submit the text is handed to the
 * terminal agent (which records its findings as Reado comments).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../atoms/Modal";

export function ReviewPromptModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onSubmit(v);
    setText("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={t("guided.reviewPromptTitle")}
      className="flex w-[min(92vw,560px)] flex-col"
    >
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="m-0 text-sm font-medium text-ink">{t("guided.reviewPromptTitle")}</h2>
        <p className="mt-0.5 text-xs text-faint">{t("guided.reviewPromptHint")}</p>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
        placeholder={t("guided.reviewPromptPlaceholder")}
        className="m-4 h-40 resize-none rounded-md border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
      />
      <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2.5 py-1.5 text-xs text-muted hover:text-ink"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {t("guided.reviewPromptSubmit")}
        </button>
      </div>
    </Modal>
  );
}
