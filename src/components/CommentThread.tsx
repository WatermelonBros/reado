/**
 * Floating thread popover for a single comment.
 *
 * Shows the conversation (each message with its author identity), the type and
 * state controls, the task/note flag, a reply box, and edit/delete. Anchored
 * near its line; positioned by the editor via the `top` prop.
 */
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Comment, CommentState, CommentType } from "../lib/api";
import { useComments } from "../lib/comments";
import { useT } from "../i18n";
import {
  COMMENT_STATES,
  COMMENT_TYPES,
  TYPE_COLOR,
  typeKey,
  stateKey,
  authorLabel,
} from "./commentMeta";
import { Select } from "./ui/Select";
import { Checkbox } from "./ui/Checkbox";
import { CloseIcon } from "./icons";

const fmtTime = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ms),
  );

interface Props {
  comment: Comment;
  top: number;
  onClose: () => void;
}

export function CommentThread({ comment, top, onClose }: Props) {
  const { patch, reply, setState, remove } = useComments();
  const t = useT();
  const [replyText, setReplyText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const lineLabel =
    comment.anchor.scope !== "range"
      ? comment.anchor.scope
      : comment.anchor.startLine === comment.anchor.endLine
        ? t("comment.line", { line: comment.anchor.startLine })
        : t("comment.lines", { from: comment.anchor.startLine, to: comment.anchor.endLine });

  const sendReply = async () => {
    if (!replyText.trim()) return;
    await reply(comment.id, replyText.trim());
    setReplyText("");
  };

  return (
    <div
      className="absolute right-4 z-30 flex max-h-[70%] w-[min(460px,calc(100%-2rem))] flex-col rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)]"
      style={{ top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header: type, state, line, close. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-3 py-2.5">
        <Select
          ariaLabel="type"
          variant="ghost"
          value={comment.type}
          onChange={(v) => patch(comment.id, { type: v as CommentType })}
          options={COMMENT_TYPES.map((tp) => ({
            value: tp,
            label: t(typeKey(tp)),
            color: TYPE_COLOR[tp],
          }))}
        />
        <Select
          ariaLabel="state"
          variant="ghost"
          value={comment.state}
          onChange={(v) => setState(comment.id, v as CommentState)}
          options={COMMENT_STATES.map((st) => ({ value: st, label: t(stateKey(st)) }))}
        />
        <span className="ml-auto font-mono text-xs text-faint">{lineLabel}</span>
        <button
          type="button"
          aria-label={t("settings.close")}
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-sm text-muted hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {comment.orphan && (
        <div className="border-b border-line px-3 py-2 text-xs text-marker">
          {t("comment.orphan")}
        </div>
      )}

      {/* Thread — the conversation is the focus; metadata stays quiet. */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {comment.messages.map((m, i) => (
          <div key={i} className={i > 0 ? "border-t border-line pt-3" : ""}>
            <div className="mb-1 flex items-baseline gap-2">
              <span
                className={`text-xs font-semibold ${
                  m.author === "agent" ? "text-accent" : "text-ink"
                }`}
              >
                {authorLabel(m, t("comment.you"))}
              </span>
              <span className="text-[11px] text-faint">{fmtTime(m.createdAt)}</span>
            </div>
            <div className="prose-reado text-[13px] leading-relaxed text-ink [&_p]:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: reply + task/note + delete. */}
      <div className="border-t border-line p-2">
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
          }}
          placeholder={t("comment.replyPlaceholder")}
          className="block max-h-32 min-h-9 w-full resize-y rounded-md bg-surface px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint"
        />
        <div className="mt-2 flex items-center justify-between">
          <Checkbox
            checked={comment.kind === "task"}
            onChange={(checked) => patch(comment.id, { kind: checked ? "task" : "note" })}
            label={t("comment.task")}
            className="text-xs text-muted"
          />
          <div className="flex items-center gap-1">
            {confirmingDelete ? (
              <>
                <span className="text-xs text-muted">{t("comment.deleteConfirm")}</span>
                <button
                  type="button"
                  onClick={() => remove(comment.id)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-marker hover:bg-surface"
                >
                  {t("comment.delete")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
                >
                  {t("comment.delete")}
                </button>
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={!replyText.trim()}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
                >
                  {t("comment.reply")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
