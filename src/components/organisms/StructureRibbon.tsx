/**
 * Structure ribbon: a slim overview column down the editor's right edge marking
 * symbols, comment anchors, and diagnostics by line, plus the current viewport.
 * Click a mark to jump. A read-first navigation aid — NOT a pixel minimap. Purely
 * presentational; the editor computes the marks + viewport band.
 */
export interface RibbonMark {
  line: number;
  kind: "symbol" | "comment" | "error" | "warn";
}

const COLOR: Record<RibbonMark["kind"], string> = {
  symbol: "var(--text-faint)",
  comment: "var(--marker)",
  error: "var(--diag-error)",
  warn: "var(--diag-warn)",
};

export function StructureRibbon({
  marks,
  totalLines,
  band,
  onJump,
}: {
  marks: RibbonMark[];
  totalLines: number;
  /** Visible range as top/height percentages, or null if not scrollable. */
  band: { top: number; height: number } | null;
  onJump: (line: number) => void;
}) {
  const lines = Math.max(1, totalLines);
  return (
    <div className="absolute top-0 right-0 bottom-0 z-10 w-2.5 border-l border-line/50 bg-canvas/40">
      {band && (
        <div
          className="absolute inset-x-0 rounded-sm bg-ink/10"
          style={{ top: `${band.top}%`, height: `${Math.max(band.height, 2)}%` }}
        />
      )}
      {marks.map((m, i) => (
        <button
          key={`${m.line}:${m.kind}:${i}`}
          type="button"
          onClick={() => onJump(m.line)}
          title={`${m.kind} · ${m.line}`}
          className={`absolute right-0 h-[2px] cursor-pointer ${
            m.kind === "symbol" ? "w-1.5" : "w-full"
          }`}
          style={{ top: `${(m.line / lines) * 100}%`, background: COLOR[m.kind] }}
        />
      ))}
    </div>
  );
}
