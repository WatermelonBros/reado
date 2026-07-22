/**
 * In-app PDF viewer: renders each page to a canvas with pdf.js (bundled, offline —
 * no external viewer, no network). The bytes arrive as a `data:` URL from the
 * backend (like images). Canvases are appended to a ref'd node React never
 * manages, so React re-renders (the zoom bar, the error banner) can't wipe them.
 *
 * Zoom multiplies the fit-to-width scale (100% = fit width); pages render at
 * device-pixel resolution so text stays crisp when magnified.
 */
import { memo, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
// The worker is bundled from 'self', so the desktop CSP allows it.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useTranslation } from "react-i18next";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Decode a `data:...;base64,XXXX` URL to raw bytes for pdf.js. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const PdfView = memo(function PdfView({ dataUrl }: { dataUrl: string; name: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // 1 = fit page width; the bar scales this up/down.
  const [zoom, setZoom] = useState(1);
  const { t } = useTranslation();

  const zoomBy = (f: number) => setZoom((z) => Math.min(5, Math.max(0.5, Math.round(z * f * 100) / 100)));

  useEffect(() => {
    const host = pagesRef.current;
    if (!host) return;
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    host.replaceChildren();
    setError(null);
    void (async () => {
      try {
        doc = await pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
        // If the effect was torn down while getDocument was in flight, the
        // cleanup closure already ran with doc===null and destroyed nothing —
        // so the body owns destroying the doc it just created, or it leaks.
        if (cancelled) {
          await doc.destroy();
          return;
        }
        const avail = host.clientWidth || 800;
        const dpr = window.devicePixelRatio || 1;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          // Fit the page to the width, then apply the zoom on top.
          const fit = Math.min(3, Math.max(0.3, avail / base.width));
          const scale = fit * zoom;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          // Display at logical size (crisp on HiDPI); zoomed-in pages scroll.
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.className = "mx-auto mb-4 shadow-[var(--shadow)]";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          host.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [dataUrl, zoom]);

  const btn =
    "grid h-6 w-6 place-items-center rounded text-faint hover:bg-canvas hover:text-ink";

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="flex flex-none items-center justify-end gap-0.5 border-b border-line px-2 py-1">
        <button type="button" className={btn} onClick={() => zoomBy(1 / 1.25)} title={t("pdf.zoomOut")}>
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          title={t("pdf.zoomReset")}
          className="min-w-[3.5rem] rounded px-1 text-center text-xs text-muted tabular-nums hover:bg-canvas hover:text-ink"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={btn} onClick={() => zoomBy(1.25)} title={t("pdf.zoomIn")}>
          +
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {error && (
          <p className="mb-3 rounded border border-line bg-canvas px-3 py-2 text-xs text-marker">
            PDF: {error}
          </p>
        )}
        <div ref={pagesRef} />
      </div>
    </div>
  );
});
