/**
 * Modal that shows a file's AI synopsis (opened from the breadcrumb button).
 * Generation runs through the terminal agent; this renders the cached/generated
 * Markdown, with a Regenerate action. Calm, themed surface.
 */

import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/atoms/Button"
import { SparkleIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { useAgentTasks } from "@/lib/agentTask"
import { useSynopsis } from "@/lib/synopsis"

const baseName = (p: string | null) => (p ? (p.split(/[\\/]/).pop() ?? p) : "")

export function SynopsisModal() {
  const { open, relPath, status, text, stale } = useSynopsis()
  const { t } = useTranslation()

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
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted">{t("synopsis.generating")}</p>
            <Button size="sm" onClick={() => useAgentTasks.getState().cancel("synopsis")}>
              {t("agentTask.cancel")}
            </Button>
          </div>
        )}
        {status === "error" && <p className="text-sm text-muted">{t("synopsis.error")}</p>}
        {status === "ready" && (
          <div className="prose-reado max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </Modal>
  )
}
