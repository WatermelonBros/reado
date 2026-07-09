/**
 * App-wide transient notices (toasts). A minimal channel for lib code (no React
 * context) to surface a message — e.g. "the AI agent isn't installed", or a
 * failed operation that would otherwise be swallowed by an empty `.catch`.
 * Rendered as a bottom-centre stack by `Notice` at the app root.
 *
 * A stack (not a single slot) so two events close together don't erase each
 * other; capped so a burst can't flood the view.
 */
import { create } from "zustand";
import { createLogger, safeError } from "./logger";

export type NoticeKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: NoticeKind;
  text: string;
}

/** Most toasts kept on screen at once; older ones drop off a burst. */
export const MAX_NOTICES = 4;

/** Monotonic id source — no `Date.now`/`Math.random` (keeps the store pure). */
let seq = 0;

export interface NoticeState {
  notices: Toast[];
  /** Push a toast (newest first, capped). Returns its id. */
  show: (kind: NoticeKind, text: string) => number;
  /** Remove one toast by id. */
  dismiss: (id: number) => void;
  /** Remove all toasts. */
  clear: () => void;
}

export const useNotice = create<NoticeState>((set) => ({
  notices: [],
  show: (kind, text) => {
    const id = ++seq;
    set((s) => ({ notices: [{ id, kind, text }, ...s.notices].slice(0, MAX_NOTICES) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  clear: () => set({ notices: [] }),
}));

/** Surface an info/success message. */
export function notify(kind: NoticeKind, text: string): void {
  useNotice.getState().show(kind, text);
}

/**
 * Report a failed operation: log the raw error under `scope` for diagnostics and
 * surface a **curated** message to the user. The message must be user-facing
 * (already localized by the caller) — never a raw exception or stderr, which is
 * what the log file is for.
 */
export function notifyError(scope: string, message: string, error?: unknown): void {
  createLogger(scope).error(message, error !== undefined ? { error: safeError(error) } : undefined);
  useNotice.getState().show("error", message);
}
