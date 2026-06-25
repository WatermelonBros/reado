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
import type { Comment, CommentState, CommentType } from "../../lib/api";
import { useComments } from "../../lib/comments";

import {
  COMMENT_STATES,
  COMMENT_TYPES,
  TYPE_COLOR,
  ACCENT,
  typeKey,
  stateKey,
  authorLabel,
  agentBrand,
} from "../atoms/commentMeta";
import { Select } from "../atoms/Select";
import { Checkbox } from "../atoms/Checkbox";
import { CloseIcon, SendIcon } from "../atoms/icons";
import { useTerminals } from "../../lib/terminals";
import { ptyWrite } from "../../lib/api";
import { composeSingleTaskPrompt } from "../../lib/review";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [replyText, setReplyText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // When non-null, the root message is being edited (holds the draft text).
  const [editDraft, setEditDraft] = useState<string | null>(null);

  const saveEdit = async () => {
    if (editDraft === null) return;
    await patch(comment.id, { body: editDraft.trim() });
    setEditDraft(null);
  };

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

  // "Send just this now": inject a prompt for the active agent to resolve only
  // this task (spec 4.4).
  const sendToAgent = () => {
    const terminals = useTerminals.getState();
    const id = terminals.activeId ?? terminals.add();
    setTimeout(
      () => ptyWrite(id, `${composeSingleTaskPrompt(comment.id)}\r`),
      id === terminals.activeId ? 0 : 400,
    );
  };

  return (
    <div
      className="absolute right-4 z-30 flex max-h-[70%] w-[min(460px,calc(100%-2rem))] flex-col shadow-[var(--shadow)]"
      style={{
        top,
        // No border: the box is just a fill of the connector's colour, so the
        // line flows straight into it as one piece (no seam). The top-left is
        // square (the line enters flat there); the top-right matches the
        // connector's convex corner.
        background: ACCENT(comment.type),
        borderRadius: "0 8px 8px 8px",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header: type, state, line, close. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-3 py-2.5">
        <Select
          ariaLabel="type"
          variant="ghost"
          value={comment.type}
          // Mirror the composer: changing the type re-derives the kind (a "note"
          // type is a note; any actionable type becomes a task) so it's sent to
          // the AI. The task/note checkbox below can still override it.
          onChange={(v) => {
            const type = v as CommentType;
            patch(comment.id, { type, kind: type === "note" ? "note" : "task" });
          }}
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
        {comment.kind === "task" && comment.state !== "done" && (
          <button
            type="button"
            onClick={sendToAgent}
            title={t("terminal.sendReview")}
            aria-label={t("terminal.sendReview")}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted hover:bg-surface hover:text-accent"
          >
            <SendIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          title={t("settings.close")} aria-label={t("settings.close")}
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
          <div key={i} className={`group/msg ${i > 0 ? "border-t border-line pt-3" : ""}`}>
            <div className="mb-1 flex items-baseline gap-2">
              {(() => {
                const brand = agentBrand(m);
                return (
                  <span
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      brand ? "" : m.author === "agent" ? "text-accent" : "text-ink"
                    }`}
                    style={brand ? { color: brand.color } : undefined}
                  >
                    {brand && <brand.Icon className="h-3 w-3 translate-y-px" />}
                    {authorLabel(m, t("comment.you"))}
                  </span>
                );
              })()}
              <span className="text-[11px] text-faint">{fmtTime(m.createdAt)}</span>
              {i === 0 && editDraft === null && (
                <button
                  type="button"
                  onClick={() => setEditDraft(m.body)}
                  className="ml-auto text-[11px] text-faint opacity-0 transition-opacity group-hover/msg:opacity-100 hover:text-ink"
                >
                  {t("comment.edit")}
                </button>
              )}
            </div>
            {i === 0 && editDraft !== null ? (
              <div>
                <textarea
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditDraft(null);
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit();
                  }}
                  className="block max-h-40 min-h-16 w-full resize-y rounded-md bg-surface px-2 py-1.5 text-sm text-ink outline-none"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditDraft(null)}
                    className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent hover:brightness-110"
                  >
                    {t("editor.save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose-reado text-[13px] leading-relaxed text-ink [&_p]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
              </div>
            )}
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
