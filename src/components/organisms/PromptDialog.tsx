/**
 * Renders the active text-input prompt (see `lib/prompt.ts`). Used for New File,
 * Save As, Rename, and anywhere a quick one-line input is needed.
 */
import { useEffect, useRef } from "react";
import { usePrompt } from "../../lib/prompt";
import { Modal } from "../atoms/Modal";
import { useTranslation } from "react-i18next";

export function PromptDialog() {
  const { open, title, placeholder, value, confirmLabel, setValue, submit, cancel } = usePrompt();
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.select());
  }, [open]);

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel();
      }}
      ariaLabel={title}
      className="w-[min(440px,92vw)] p-4"
    >
      <h2 className="mb-2 text-sm font-medium text-ink">{title}</h2>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") cancel();
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-faint"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          className="rounded-md px-2.5 py-1.5 text-xs text-muted hover:text-ink"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
