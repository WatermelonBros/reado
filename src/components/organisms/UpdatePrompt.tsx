/**
 * Custom in-app update experience: a styled modal when an update is available,
 * a small "update available" indicator (top-right) once dismissed, and a toast
 * for "up to date" / error feedback. Replaces the native updater dialogs.
 */
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUpdate } from "../../lib/update";
import { useT } from "../../i18n";
import { Modal } from "../atoms/Modal";
import { CloseIcon } from "../atoms/icons";

export function UpdatePrompt() {
  const { update, version, notes, open, dismissed, installing, toast } = useUpdate();
  const reopen = useUpdate((s) => s.reopen);
  const dismiss = useUpdate((s) => s.dismiss);
  const install = useUpdate((s) => s.install);
  const clearToast = useUpdate((s) => s.clearToast);
  const t = useT();

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, 4500);
    return () => clearTimeout(id);
  }, [toast, clearToast]);

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => !o && dismiss()}
        ariaLabel={t("update.title")}
        className="w-[min(460px,calc(100vw-2rem))]"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="m-0 text-sm font-semibold text-ink">{t("update.title")}</h2>
          <button
            type="button"
            aria-label={t("update.later")}
            onClick={dismiss}
            disabled={installing}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink disabled:opacity-40"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="m-0 text-sm text-ink">{t("update.available", { version: version ?? "" })}</p>
          {notes && (
            <div className="prose-reado mt-3 max-h-60 overflow-y-auto text-[13px] text-muted">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
          <button
            type="button"
            onClick={dismiss}
            disabled={installing}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
          >
            {t("update.later")}
          </button>
          <button
            type="button"
            onClick={() => void install()}
            disabled={installing}
            className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-60"
          >
            {installing ? t("update.installing") : t("update.install")}
          </button>
        </div>
      </Modal>

      {/* Indicator: available but dismissed. */}
      {update && dismissed && !open && (
        <button
          type="button"
          onClick={reopen}
          title={t("update.available", { version: version ?? "" })}
          className="animate-fade fixed top-3 right-3 z-[105] inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-overlay px-2.5 py-1 text-xs font-medium text-ink shadow-[var(--shadow)] hover:bg-surface"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {t("update.indicator")}
        </button>
      )}

      {/* Toast: up-to-date / error. */}
      {toast && (
        <div
          role="status"
          className={`animate-rise fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-md border px-3 py-2 text-xs shadow-[var(--shadow)] ${
            toast.kind === "error"
              ? "border-line-strong bg-overlay text-marker"
              : "border-line bg-overlay text-ink"
          }`}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}
