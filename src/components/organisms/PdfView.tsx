/**
 * In-app PDF viewer: renders each page to a canvas with pdf.js (bundled, offline —
 * no external viewer, no network). The bytes arrive as a `data:` URL from the
 * backend (like images). Canvases are appended to a ref'd node React never
 * manages, so React re-renders (the error banner) can't wipe them.
 */
import { memo, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
// The worker is bundled from 'self', so the desktop CSP allows it.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
        if (cancelled) return;
        const avail = (host.clientWidth || 800) - 16;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(0.4, avail / base.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-4 max-w-full shadow-[var(--shadow)]";
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
  }, [dataUrl]);

  return (
    <div className="h-full w-full overflow-auto bg-surface p-6">
      {error && (
        <p className="mb-3 rounded border border-line bg-canvas px-3 py-2 text-xs text-marker">
          PDF: {error}
        </p>
      )}
      <div ref={pagesRef} />
    </div>
  );
});
