/**
 * Semantic search results. The local index answers as you type; "Ask the agent"
 * escalates to the terminal agent, which reads the code instead of matching
 * words. Agent answers are badged, because a reader should know which kind of
 * answer they are looking at. Arrow keys walk the list; Enter jumps.
 */

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { SearchIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { useAgentTasks } from "@/lib/agentTask"
import { useSemanticSearch } from "@/lib/semanticSearch"
import { useProject } from "@/lib/store"

export function SemanticModal() {
  const { open, query, status, results, askingAgent } = useSemanticSearch()
  const [cursor, setCursor] = useState(0)
  const root = useProject((s) => s.root)
  const openFile = useProject((s) => s.open)
  const { t } = useTranslation()

  const jump = (file: string, line: number) => {
    openFile(`${root}/${file}`, line)
    useSemanticSearch.getState().close()
  }

  // A fresh answer starts at the top; keeping the old cursor would land the
  // reader somewhere arbitrary in a different list.
  useEffect(() => setCursor(0), [results])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCursor((c) => Math.min(results.length - 1, c + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const hit = results[cursor]
      if (hit) jump(hit.file, hit.line)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && useSemanticSearch.getState().close()}
      ariaLabel={t("semantic.title")}
      className="flex max-h-[80vh] w-[min(680px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
        <SearchIcon className="h-4 w-4 flex-none text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {t("semantic.title")} · {query}
        </span>
      </header>
      {/* The list is the modal's keyboard surface: focus lands here, arrows walk
        it, Enter opens. Each row is a real button, so click and Enter agree. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
        role="listbox"
        aria-label={t("semantic.title")}
        tabIndex={0}
        // biome-ignore lint/a11y/noAutofocus: the modal exists to show this list
        autoFocus
        onKeyDown={onKeyDown}
      >
        {status === "loading" && (
          <div className="flex items-center gap-3 px-5 py-3">
            <p className="text-sm text-muted">
              {askingAgent ? t("semantic.asking") : t("semantic.searching")}
            </p>
            {askingAgent && (
              <Button size="sm" onClick={() => useAgentTasks.getState().cancel("semantic")}>
                {t("agentTask.cancel")}
              </Button>
            )}
          </div>
        )}
        {status === "error" && (
          <p className="px-5 py-3 text-sm text-muted">{t("semantic.error")}</p>
        )}
        {/* A search that ran and matched nothing is an answer, not a failure. */}
        {status === "ready" && results.length === 0 && (
          <p className="px-5 py-3 text-sm text-muted">{t("semantic.empty")}</p>
        )}
        {status === "ready" &&
          results.map((h, i) => (
            <button
              key={`${h.file}:${h.line}:${i}`}
              type="button"
              role="option"
              aria-selected={i === cursor}
              onClick={() => jump(h.file, h.line)}
              className={`block w-full border-b border-line/60 px-5 py-2 text-left hover:bg-surface ${
                i === cursor ? "bg-surface" : ""
              }`}
            >
              <div className="flex items-baseline gap-2 text-xs text-faint">
                {h.symbol && <span className="flex-none font-mono text-accent">{h.symbol}</span>}
                <span className="min-w-0 flex-1 truncate">{h.file}</span>
                {h.fromAgent && (
                  <span className="flex-none rounded bg-surface px-1 text-[10px] text-muted">
                    {t("semantic.byAgent")}
                  </span>
                )}
                <span className="flex-none tabular-nums">{h.line}</span>
              </div>
              {h.snippet && (
                <p className="mt-0.5 truncate font-mono text-xs text-muted">{h.snippet}</p>
              )}
            </button>
          ))}
      </div>

      {/* The escalation, always explicit. The index answers most questions; the
        agent answers the ones that need the code read rather than matched. */}
      <footer className="flex flex-none items-center justify-between gap-3 border-t border-line px-5 py-2.5">
        <span className="min-w-0 truncate text-[10px] text-faint">{t("semantic.localHint")}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={askingAgent || !query.trim()}
          onClick={() => useSemanticSearch.getState().askAgent()}
        >
          {t("semantic.askAgent")}
        </Button>
      </footer>
    </Modal>
  )
}
