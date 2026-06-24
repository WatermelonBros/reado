/**
 * Modal that shows a file's AI synopsis (opened from the breadcrumb button).
 * Generation runs through the terminal agent; this renders the cached/generated
 * Markdown, with a Regenerate action. Calm, themed surface.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSynopsis } from "../../lib/synopsis";
import { Modal } from "../atoms/Modal";
import { SparkleIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

const baseName = (p: string | null) => (p ? (p.split(/[\\/]/).pop() ?? p) : "");

export function SynopsisModal() {
  const { open, relPath, status, text, stale } = useSynopsis();
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && useSynopsis.getState().close()}
      ariaLabel={t("synopsis.title")}
      className="flex max-h-[80vh] w-[min(680px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
        <SparkleIcon className="h-4 w-4 flex-none text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {t("synopsis.title")} · {baseName(relPath)}
        </span>
        <button
          type="button"
          onClick={() => useSynopsis.getState().regenerate()}
          disabled={status === "loading"}
          className="flex-none rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          {t("synopsis.regenerate")}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {status === "ready" && stale && (
          <p className="mb-3 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-muted">
            {t("synopsis.stale")}
          </p>
        )}
        {status === "loading" && (
          <p className="text-sm text-muted">{t("synopsis.generating")}</p>
        )}
        {status === "error" && <p className="text-sm text-muted">{t("synopsis.error")}</p>}
        {status === "ready" && (
          <div className="prose-reado max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </Modal>
  );
}
