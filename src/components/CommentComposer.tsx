/**
 * Inline composer for creating a comment from a line selection.
 *
 * Opens anchored near the selected range. The user picks a type and whether the
 * comment is a task (sent to the AI) or a note, writes Markdown, and saves. The
 * code file is never modified — the comment is an external overlay.
 */
import { useState } from "react";
import type { CommentType, Context } from "../lib/api";
import { useComments } from "../lib/comments";
import { useSettings } from "../lib/store";
import { useT } from "../i18n";
import { COMMENT_TYPES, TYPE_COLOR, typeKey, Dot } from "./commentMeta";
import { Checkbox } from "./ui/Checkbox";

interface Props {
  relPath: string;
  startLine: number;
  endLine: number;
  context: Context;
  top: number;
  onClose: () => void;
}

export function CommentComposer({ relPath, startLine, endLine, context, top, onClose }: Props) {
  const create = useComments((s) => s.create);
  const setGitignorePrompt = useComments((s) => s.setGitignorePrompt);
  const gitignoreDontAsk = useSettings((s) => s.gitignoreDontAsk);
  const t = useT();

  const [type, setType] = useState<CommentType>("note");
  const [isTask, setIsTask] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const label =
    startLine === endLine
      ? t("comment.line", { line: startLine })
      : t("comment.lines", { from: startLine, to: endLine });

  const save = async () => {
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      const { firstComment } = await create({
        file: relPath,
        scope: "range",
        startLine,
        endLine,
        type,
        kind: isTask ? "task" : "note",
        body: body.trim(),
        context,
      });
      if (firstComment && !gitignoreDontAsk) setGitignorePrompt(true);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute right-4 z-30 w-[min(460px,calc(100%-2rem))] rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)]"
      style={{ top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-xs text-faint">{label}</span>
        <div className="flex flex-wrap gap-1">
          {COMMENT_TYPES.map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setType(tp)}
              className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs ${
                type === tp ? "bg-selection text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Dot color={TYPE_COLOR[tp]} />
              {t(typeKey(tp))}
            </button>
          ))}
        </div>
      </div>

      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
        placeholder={t("comment.bodyPlaceholder")}
        className="block max-h-60 min-h-20 w-full resize-y bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-faint"
      />

      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <Checkbox
          checked={isTask}
          onChange={setIsTask}
          label={t("comment.task")}
          title={t("comment.taskHint")}
          className="text-xs text-muted"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted hover:text-ink"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!body.trim() || saving}
            className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {t("comment.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
