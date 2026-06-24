/**
 * Modal showing an anchored Q&A answer (generated via the terminal agent). The
 * answer is a durable `.reado/qa/…` note; this renders its Markdown.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQa } from "../../lib/qa";
import { Modal } from "../atoms/Modal";
import { SparkleIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

const baseName = (p: string | null) => (p ? (p.split(/[\\/]/).pop() ?? p) : "");

export function QaModal() {
  const { open, relPath, status, text } = useQa();
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && useQa.getState().close()}
      ariaLabel={t("qa.title")}
      className="flex max-h-[80vh] w-[min(680px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
        <SparkleIcon className="h-4 w-4 flex-none text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {t("qa.title")} · {baseName(relPath)}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {status === "loading" && <p className="text-sm text-muted">{t("qa.generating")}</p>}
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
