/**
 * The render overlays for the code viewer — small presentational components
 * lifted out of CodeView's return. Each takes explicit props (refs / geometry /
 * callbacks) so they stay decoupled from CodeView's internal state.
 */
import { type RefObject } from "react";
import { EditorView } from "@codemirror/view";
import { useTranslation } from "react-i18next";
import { type Comment } from "../../../lib/api";
import { ACCENT } from "../../atoms/commentMeta";
import { Button } from "../../atoms/Button";
import { IconButton } from "../../atoms/IconButton";
import { PlusIcon, CloseIcon } from "../../atoms/icons";

/** Peek-definition panel state: an inline preview of where the symbol at the
 *  cursor is defined, without navigating away. */
export interface PeekInfo {
  top: number;
  label: string;
  lines: string[];
  defLineIndex: number;
  target: { path: string; line: number } | null;
}

/** A failed write (read-only file, permission, disk full), surfaced as a small
 *  dismissable banner so a save error is never swallowed silently. */
export function SaveErrorBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="absolute right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-md border border-line-strong bg-[color-mix(in_oklch,var(--marker)_14%,var(--bg-elevated))] px-3 py-2 text-xs text-ink shadow-[var(--shadow)]"
    >
      <span className="min-w-0 flex-1">{t("editor.saveError")}</span>
      <IconButton
        label={t("common.cancel")}
        icon={<CloseIcon className="h-3.5 w-3.5" />}
        onClick={onDismiss}
        className="h-5 w-5"
      />
    </div>
  );
}

/** Sticky scope headers pinned above the viewport top. */
export function StickyHeaders({
  headers,
  viewRef,
  hostRef,
}: {
  headers: { line: number; text: string }[];
  viewRef: RefObject<EditorView | null>;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-line bg-canvas">
      {headers.map((h) => (
        <button
          key={h.line}
          type="button"
          onClick={() => {
            const v = viewRef.current;
            if (!v) return;
            const line = v.state.doc.line(Math.min(h.line, v.state.doc.lines));
            v.dispatch({
              selection: { anchor: line.from },
              effects: EditorView.scrollIntoView(line.from, { y: "start" }),
            });
            v.focus();
          }}
          title={t("editor.stickyJump")}
          className="pointer-events-auto block w-full overflow-hidden text-left whitespace-pre text-muted hover:bg-surface hover:text-ink"
          style={{
            paddingLeft:
              (hostRef.current?.querySelector(".cm-gutters") as HTMLElement | null)
                ?.clientWidth ?? 40,
            fontFamily: "var(--code-font, var(--font-code))",
            fontSize: "var(--text-md)",
            lineHeight: "var(--code-line-height)",
          }}
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}

/** The re-anchor hint bar shown while an orphan is being re-anchored. */
export function ReanchorBar({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-line bg-[color-mix(in_oklch,var(--marker)_14%,var(--bg-elevated))] px-4 py-2 text-xs text-ink">
      <span className="min-w-0 flex-1 truncate">
        {t("orphans.reanchorHint", { label })}
      </span>
      <Button variant="primary" size="sm" onClick={onConfirm}>
        {t("orphans.confirm")}
      </Button>
      <Button variant="secondary" size="sm" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
    </div>
  );
}

/** Peek definition: an inline preview anchored under the symbol. */
export function PeekPanel({
  peek,
  onOpen,
  onClose,
}: {
  peek: PeekInfo;
  onOpen: (target: { path: string; line: number }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="absolute left-1/2 z-50 w-[min(680px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)]"
      style={{ top: peek.top + 4 }}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-muted">
          {peek.target ? peek.label : t("peek.none", { name: peek.label })}
        </span>
        {peek.target && (
          <Button variant="ghost" size="sm" onClick={() => onOpen(peek.target!)}>
            {t("peek.open")}
          </Button>
        )}
        <IconButton
          label={t("common.cancel")}
          icon={<CloseIcon className="h-3.5 w-3.5" />}
          onClick={onClose}
          className="h-5 w-5"
        />
      </header>
      {peek.target && (
        <pre className="max-h-56 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-ink">
          {peek.lines.map((l, i) => (
            <div
              key={i}
              className={i === peek.defLineIndex ? "bg-selection" : undefined}
            >
              {l || " "}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/** The hover "+" add-comment affordance. */
export function AddCommentButton({
  top,
  onClick,
}: {
  top: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <IconButton
      label={t("comment.new")}
      icon={<PlusIcon className="h-3.5 w-3.5" />}
      onClick={onClick}
      style={{ top }}
      className="absolute right-4 z-20 h-[18px] w-[18px] -translate-y-px border border-line-strong bg-surface text-muted shadow-[var(--shadow)] hover:bg-accent hover:text-on-accent"
    />
  );
}

/**
 * A bracket that wraps the commented lines and flows into the thread box as a
 * single shape: a vertical rail in the line-number gutter spanning every
 * commented line, a horizontal run below the last line, and a rounded (never
 * square) turn into the box's top-left corner. Drawn in the box's own
 * colour/outline so line and box read as one object.
 *
 * Pure: `startTop` (from topForLine) and `width` (from wrapRef.clientWidth) are
 * passed in already computed.
 */
export function ThreadConnector({
  comment,
  threadTop,
  startTop,
  width,
}: {
  comment: Comment;
  threadTop: number;
  startTop: number;
  width: number;
}) {
  const xBoxRight = width - 16; // the box's right edge (it sits at right-4)
  const xRail = 6; // in the line-number gutter, far left
  const hY = threadTop; // top edge of the box = run below the last line
  const r = 8; // matches the box's rounded-lg corner
  const down = 64; // how far the rail traces down the box's right edge
  const multi = comment.anchor.endLine > comment.anchor.startLine;
  const accent = ACCENT(comment.type);
  // The line is the same colour as the box, so it goes flat into it and
  // shows only as a faint tail over the code. The vertical rail stays
  // thin; the horizontal run (along the box's top edge, the convex
  // top-RIGHT corner, then down the right side) is heavier.
  const vertical = `M ${xRail} ${Math.min(startTop, hY)} L ${xRail} ${hY}`;
  const horizontal =
    `M ${xRail} ${hY} L ${xBoxRight - r} ${hY}` +
    ` Q ${xBoxRight} ${hY} ${xBoxRight} ${hY + r} L ${xBoxRight} ${hY + down}`;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    >
      {multi && (
        <path
          d={vertical}
          fill="none"
          stroke={accent}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d={horizontal}
        fill="none"
        stroke={accent}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
