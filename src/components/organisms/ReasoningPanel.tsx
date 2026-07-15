/**
 * The agent's live reasoning feed, docked beside the terminal. Renders the lines
 * the agent narrates via `reado thought` (decisions, orderings, assumptions) so a
 * human can follow *how* it's translating the plan into actions — and catch a
 * wrong assumption before it becomes wrong code.
 *
 * ponytail: experiment. A flat auto-scrolling list, no filtering/virtualisation —
 * a real run is tens of lines, not thousands. Add those if it earns its keep.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../../lib/store";
import { useReasoning } from "../../lib/reasoning";
import { IconButton } from "../atoms/IconButton";
import { TrashIcon } from "../atoms/icons";

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ReasoningPanel({ docked = false }: { docked?: boolean } = {}) {
  const { t } = useTranslation();
  const root = useProject((s) => s.root);
  const thoughts = useReasoning((s) => s.thoughts);
  const clear = useReasoning((s) => s.clear);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view as the agent narrates.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thoughts.length]);

  return (
    <div data-docked={docked || undefined} className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex h-7 flex-none items-center justify-between border-b border-line px-2">
        <span className="text-xs text-faint">{t("reasoning.title")}</span>
        {thoughts.length > 0 && (
          <IconButton
            label={t("reasoning.clear")}
            onClick={() => void clear(root)}
            size="sm"
            icon={<TrashIcon className="h-3.5 w-3.5" />}
          />
        )}
      </div>
      <div
        ref={listRef}
        className="flex-1 space-y-1.5 overflow-y-auto p-2 text-xs leading-relaxed"
      >
        {thoughts.length === 0 ? (
          <p className="text-faint italic">{t("reasoning.empty")}</p>
        ) : (
          thoughts.map((th, i) => {
            const isAssumption =
              th.kind === "assumption" || /^\s*assumo\s*:/i.test(th.text);
            return (
              <div
                key={i}
                className={`rounded px-2 py-1 text-ink ${
                  isAssumption ? "border-l-2 border-accent bg-accent/10" : ""
                }`}
              >
                <span className="mr-1.5 align-top text-[10px] tabular-nums text-faint">
                  {fmtTime(th.ts)}
                </span>
                {th.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
