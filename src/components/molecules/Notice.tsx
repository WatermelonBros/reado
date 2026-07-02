/**
 * The app-wide transient notice toast (bottom-center), driven by `useNotice`.
 * Auto-dismisses; mirrors the update toast's quiet styling.
 */
import { useEffect } from "react";
import { useNotice } from "../../lib/notice";

export function Notice() {
  const notice = useNotice((s) => s.notice);
  const clear = useNotice((s) => s.clear);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clear, 5000);
    return () => clearTimeout(id);
  }, [notice, clear]);

  if (!notice) return null;
  return (
    <div
      role="status"
      onClick={clear}
      className={`animate-rise fixed bottom-4 left-1/2 z-[120] max-w-[min(90vw,420px)] -translate-x-1/2 cursor-pointer rounded-md border px-3 py-2 text-xs shadow-[var(--shadow)] ${
        notice.kind === "error"
          ? "border-line-strong bg-overlay text-marker"
          : "border-line bg-overlay text-ink"
      }`}
    >
      {notice.text}
    </div>
  );
}
