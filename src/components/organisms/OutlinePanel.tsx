/**
 * Outline side panel: the active file's symbols (functions, classes, types, …)
 * extracted on the fly, click to jump. A read-first navigation aid — see the
 * shape of a file at a glance without scrolling it.
 */
import { useEffect, useState } from "react";
import { useDocInfo, goToLine } from "../../lib/docInfo";
import { useProject } from "../../lib/store";
import { extractSymbols, type OutlineSymbol } from "../../lib/outline";
import { lspDocumentSymbols } from "../../lib/lsp";
import { useCursor } from "../../lib/store";
import { useTranslation } from "react-i18next";

/** A faint type label + colour per symbol kind. */
const KIND_COLOR: Record<OutlineSymbol["kind"], string> = {
  function: "var(--syn-keyword)",
  method: "var(--syn-keyword)",
  class: "var(--syn-number)",
  type: "var(--syn-control)",
  variable: "var(--text-muted)",
};

export function OutlinePanel() {
  const view = useDocInfo((s) => s.view);
  const active = useProject((s) => s.active);
  const line = useCursor((s) => s.line);
  const { t } = useTranslation();
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([]);

  // Re-derive symbols when the file changes (or its editor view is (re)created).
  // Prefer the language server's document symbols; fall back to the heuristic
  // extractor when no server is attached or it returns nothing.
  useEffect(() => {
    if (!view) {
      setSymbols([]);
      return;
    }
    const heuristic = () => extractSymbols(view.state.doc.toString());
    setSymbols(heuristic());
    let cancelled = false;
    const fromServer = lspDocumentSymbols(view);
    if (fromServer) {
      void fromServer.then((syms) => {
        if (!cancelled && syms && syms.length) setSymbols(syms);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [view, active]);

  if (!active) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("outline.noFile")}</p>;
  }
  if (symbols.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("outline.empty")}</p>;
  }

  // The symbol the cursor is currently inside (the last one at/above the line).
  let current = -1;
  for (let i = 0; i < symbols.length; i++) {
    if (symbols[i].line <= line) current = i;
  }

  return (
    <ul className="m-0 h-full list-none overflow-y-auto p-0 py-1">
      {symbols.map((s, i) => (
        <li key={`${s.line}:${s.name}`}>
          <button
            type="button"
            onClick={() => goToLine(s.line)}
            title={`${s.kind} · line ${s.line}`}
            className={`flex w-full items-center gap-2 py-1 pr-3 pl-3 text-left text-sm transition-colors ${
              i === current ? "bg-selection text-ink" : "text-muted hover:bg-surface hover:text-ink"
            } ${s.kind === "method" ? "pl-6" : ""}`}
          >
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: KIND_COLOR[s.kind] }}
            />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto flex-none font-mono text-xs text-faint tabular-nums">
              {s.line}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
