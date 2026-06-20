/**
 * Image viewer: a transparency checkerboard, the image fit to the viewport (or
 * shown at 100%), with its pixel dimensions and simple zoom controls. Click the
 * image to toggle fit ↔ actual size.
 */
import { useState } from "react";

const ZOOMS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

export function ImageView({ dataUrl, name }: { dataUrl: string; name: string }) {
  // `null` zoom = fit to viewport; a number = explicit scale.
  const [zoom, setZoom] = useState<number | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const stepZoom = (dir: 1 | -1) => {
    const current = zoom ?? 1;
    const idx = ZOOMS.findIndex((z) => z >= current);
    const next = ZOOMS[Math.min(Math.max((idx < 0 ? ZOOMS.length - 1 : idx) + dir, 0), ZOOMS.length - 1)];
    setZoom(next);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="reado-checkerboard grid min-h-0 flex-1 place-items-center overflow-auto p-8">
        <img
          src={dataUrl}
          alt={name}
          onLoad={(e) =>
            setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          onClick={() => setZoom((z) => (z === null ? 1 : null))}
          style={
            zoom === null
              ? { maxWidth: "100%", maxHeight: "100%", cursor: "zoom-in" }
              : {
                  width: size ? size.w * zoom : undefined,
                  height: size ? size.h * zoom : undefined,
                  maxWidth: "none",
                  cursor: "zoom-out",
                }
          }
          className="rounded-md shadow-[var(--shadow)] select-none"
          draggable={false}
        />
      </div>

      {/* Bottom overlay: dimensions + zoom controls. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-line bg-overlay px-2 py-1 text-xs text-muted shadow-[var(--shadow)]">
          {size && (
            <span className="px-1.5 font-mono text-faint tabular-nums">
              {size.w} × {size.h}
            </span>
          )}
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            aria-label="Zoom out"
            className="grid h-6 w-6 place-items-center rounded hover:bg-surface hover:text-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => (z === null ? 1 : null))}
            className="min-w-[3rem] rounded px-1.5 py-0.5 text-center tabular-nums hover:bg-surface hover:text-ink"
          >
            {zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() => stepZoom(1)}
            aria-label="Zoom in"
            className="grid h-6 w-6 place-items-center rounded hover:bg-surface hover:text-ink"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
