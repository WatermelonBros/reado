/**
 * Semantic search results (natural-language query answered by the terminal agent).
 * Lists ranked locations; click to jump.
 */
import { useSemanticSearch } from "../../lib/semanticSearch";
import { useProject } from "../../lib/store";
import { Modal } from "../atoms/Modal";
import { SearchIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function SemanticModal() {
  const { open, query, status, results } = useSemanticSearch();
  const root = useProject((s) => s.root);
  const openFile = useProject((s) => s.open);
  const { t } = useTranslation();

  const jump = (file: string, line: number) => {
    openFile(`${root}/${file}`, line);
    useSemanticSearch.getState().close();
  };

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
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {status === "loading" && (
          <p className="px-5 py-3 text-sm text-muted">{t("semantic.generating")}</p>
        )}
        {status === "error" && <p className="px-5 py-3 text-sm text-muted">{t("semantic.error")}</p>}
        {status === "ready" &&
          results.map((h, i) => (
            <button
              key={`${h.file}:${h.line}:${i}`}
              type="button"
              onClick={() => jump(h.file, h.line)}
              className="block w-full border-b border-line/60 px-5 py-2 text-left hover:bg-surface"
            >
              <div className="flex items-baseline gap-2 text-xs text-faint">
                <span className="min-w-0 flex-1 truncate">{h.file}</span>
                <span className="flex-none tabular-nums">{h.line}</span>
              </div>
              {h.snippet && <p className="mt-0.5 truncate font-mono text-xs text-muted">{h.snippet}</p>}
            </button>
          ))}
      </div>
    </Modal>
  );
}
