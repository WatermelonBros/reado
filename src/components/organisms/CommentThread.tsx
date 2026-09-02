/**
 * Floating thread popover for a single comment.
 *
 * Shows the conversation (each message with its author identity), the type and
 * state controls, the task/note flag, a reply box, and edit/delete. Anchored
 * near its line; positioned by the editor via the `top` prop.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/atoms/Button"
import { Checkbox } from "@/components/atoms/Checkbox"
import {
  ACCENT,
  agentBrand,
  authorLabel,
  COMMENT_STATES,
  COMMENT_TYPES,
  stateKey,
  TYPE_COLOR,
  typeKey,
} from "@/components/atoms/commentMeta"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon, SendIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { dispatchToAgent } from "@/lib/agents"
import type { Comment, CommentState, CommentType } from "@/lib/api"
import { useComments } from "@/lib/comments"
import { composeSingleTaskPrompt } from "@/lib/review"

const fmtTime = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ms),
  )

interface Props {
  comment: Comment
  top: number
  onClose: () => void
}

export function CommentThread({ comment, top, onClose }: Props) {
  const { patch, reply, setState, remove } = useComments()
  const { t } = useTranslation()
  const [replyText, setReplyText] = useState("")
  const [answer, setAnswer] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // When non-null, the root message is being edited (holds the draft text).
  const [editDraft, setEditDraft] = useState<string | null>(null)

  const saveEdit = async () => {
    if (editDraft === null) return
    await patch(comment.id, { body: editDraft.trim() })
    setEditDraft(null)
  }

  const lineLabel =
    comment.anchor.scope !== "range"
      ? comment.anchor.scope
      : comment.anchor.startLine === comment.anchor.endLine
        ? t("comment.line", { line: comment.anchor.startLine })
        : t("comment.lines", { from: comment.anchor.startLine, to: comment.anchor.endLine })

  const sendReply = async () => {
    if (!replyText.trim()) return
    await reply(comment.id, replyText.trim())
    setReplyText("")
  }

  // "Send just this now": hand this one task to the agent through the hardened
  // dispatch (launches/boot-waits the agent, checks it's installed, submits
  // correctly) rather than a raw PTY write that a TUI agent may not even submit.
  const sendToAgent = () => {
    void dispatchToAgent(composeSingleTaskPrompt(comment.id))
  }

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
            const type = v as CommentType
            patch(comment.id, { type, kind: type === "note" ? "note" : "task" })
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
        {/* A blocked task is waiting on you, not on the agent: sending it back
          unanswered would just spend another attempt on the same wall. */}
        {comment.kind === "task" && comment.state !== "done" && comment.state !== "blocked" && (
          <IconButton
            size="sm"
            label={t("terminal.sendReview")}
            onClick={sendToAgent}
            icon={<SendIcon className="h-3.5 w-3.5" />}
          />
        )}
        <IconButton
          size="sm"
          label={t("settings.close")}
          onClick={onClose}
          icon={<CloseIcon className="h-3.5 w-3.5" />}
        />
      </div>

      {comment.orphan && (
        <div className="border-b border-line px-3 py-2 text-xs text-marker">
          {t("comment.orphan")}
        </div>
      )}

      {/* Provenance for a resolved task: which agent, which model, which diff,
        and what the check said. "Done" alone asks the reviewer to take a claim
        on faith; this gives them something to read. */}
      {comment.resolution && (
        <div className="flex flex-col gap-0.5 border-b border-line px-3 py-2 text-[10px] leading-relaxed text-faint">
          <span>
            {t("comment.resolvedBy", {
              agent: comment.resolution.model
                ? `${comment.resolution.agent} · ${comment.resolution.model}`
                : comment.resolution.agent,
            })}
          </span>
          {comment.resolution.diffRef && (
            <span className="font-mono">
              {t("comment.diffRef", { ref: comment.resolution.diffRef })}
            </span>
          )}
          <span className={comment.resolution.verify?.passed ? "text-accent" : "text-marker"}>
            {comment.resolution.verify
              ? t(
                  comment.resolution.verify.passed
                    ? "comment.verifyPassed"
                    : "comment.verifyFailed",
                  { cmd: comment.resolution.verify.cmd },
                )
              : t("comment.noVerify")}
          </span>
        </div>
      )}

      {/* Blocked: show the agent's question and take the answer here, so the
        human's reply and the return to open are one action rather than two. */}
      {comment.state === "blocked" && (
        <div className="flex flex-col gap-2 border-b border-line bg-surface px-3 py-2">
          <p className="text-xs leading-relaxed text-muted">
            {comment.blockedReason || t("comment.blockedHint")}
          </p>
          {!!comment.attempts && (
            <p className="text-[10px] text-faint">
              {t("comment.attempts", { count: comment.attempts })}
            </p>
          )}
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t("comment.answerPlaceholder")}
            rows={2}
            className="text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!answer.trim()}
            className="self-start"
            onClick={() => {
              void useComments.getState().answer(comment.id, answer.trim())
              setAnswer("")
            }}
          >
            {t("comment.answer")}
          </Button>
        </div>
      )}

      {/* Thread — the conversation is the focus; metadata stays quiet. */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {comment.messages.map((m, i) => (
          <div key={i} className={`group/msg ${i > 0 ? "border-t border-line pt-3" : ""}`}>
            <div className="mb-1 flex items-baseline gap-2">
              {(() => {
                const brand = agentBrand(m)
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
                )
              })()}
              <span className="text-xs text-faint">{fmtTime(m.createdAt)}</span>
              {i === 0 && editDraft === null && (
                <button
                  type="button"
                  onClick={() => setEditDraft(m.body)}
                  className="ml-auto text-xs text-faint opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 focus-visible:opacity-100 hover:text-ink"
                >
                  {t("comment.edit")}
                </button>
              )}
            </div>
            {i === 0 && editDraft !== null ? (
              <div>
                <Textarea
                  variant="filled"
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onSubmit={saveEdit}
                  onCancel={() => setEditDraft(null)}
                  className="max-h-40 min-h-16"
                />
                <div className="mt-1 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditDraft(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="primary" size="sm" onClick={saveEdit}>
                    {t("editor.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose-reado text-base leading-relaxed text-ink [&_p]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer: reply + task/note + delete. */}
      <div className="border-t border-line p-2">
        <Textarea
          variant="filled"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onSubmit={sendReply}
          placeholder={t("comment.replyPlaceholder")}
          className="max-h-32 min-h-9"
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
                <Button variant="danger" size="sm" onClick={() => remove(comment.id)}>
                  {t("comment.delete")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
                  {t("comment.delete")}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={sendReply}
                  disabled={!replyText.trim()}
                >
                  {t("comment.reply")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
