/**
 * Renders the active text-input prompt (see `lib/prompt.ts`). Used for New File,
 * Save As, Rename, and anywhere a quick one-line input is needed.
 */
import { useEffect, useRef } from "react";
import { usePrompt } from "../../lib/prompt";
import { Modal } from "../atoms/Modal";
import { Input } from "../atoms/Input";
import { Button } from "../atoms/Button";
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
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") cancel();
        }}
        placeholder={placeholder}
        className="py-1.5"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={cancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="sm" onClick={submit} disabled={!value.trim()}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
