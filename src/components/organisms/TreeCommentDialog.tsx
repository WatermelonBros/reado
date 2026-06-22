/**
 * Standalone composer for a file-, folder- or project-scoped comment, opened
 * from the file tree's context menu (rather than a line selection). These
 * comments carry no line range; they describe a path or the whole project.
 */
import { useState } from "react";
import type { CommentType } from "../../lib/api";
import { useComments } from "../../lib/comments";
import { useSettings } from "../../lib/store";
import { type MessageKey } from "../../i18n";
import { COMMENT_TYPES, TYPE_COLOR, typeKey, Dot } from "../atoms/commentMeta";
import { Checkbox } from "../atoms/Checkbox";
import { Modal } from "../atoms/Modal";
import { useTranslation } from "react-i18next";

export interface CommentTarget {
  kind: "file" | "folder" | "project";
  /** Project-relative path; empty for the project scope. */
  path: string;
}

const titleKey: Record<CommentTarget["kind"], MessageKey> = {
  file: "tree.commentFile",
  folder: "tree.commentFolder",
  project: "tree.commentProject",
};

export function TreeCommentDialog({
  target,
  onClose,
}: {
  target: CommentTarget | null;
  onClose: () => void;
}) {
  const create = useComments((s) => s.create);
  const setGitignorePrompt = useComments((s) => s.setGitignorePrompt);
  const gitignoreDontAsk = useSettings((s) => s.gitignoreDontAsk);
  const { t } = useTranslation();

  const [type, setType] = useState<CommentType>("note");
  // type=note → a note; actionable types default to a task (toggleable).
  const [isTask, setIsTask] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const pickType = (tp: CommentType) => {
    setType(tp);
    setIsTask(tp !== "note");
  };

  const reset = () => {
    setBody("");
    setType("note");
    setIsTask(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!target || !body.trim() || saving) return;
    setSaving(true);
    try {
      const isProject = target.kind === "project";
      const { firstComment } = await create({
        file: isProject ? "" : target.path,
        scope: isProject ? "project" : "file",
        startLine: 0,
        endLine: 0,
        type,
        kind: isTask ? "task" : "note",
        body: body.trim(),
        context: { snippet: "", before: "", after: "" },
      });
      if (firstComment && !gitignoreDontAsk) setGitignorePrompt(true);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onOpenChange={(o) => !o && close()}
      ariaLabel={target ? t(titleKey[target.kind]) : ""}
      className="w-[min(460px,calc(100vw-2rem))]"
    >
      <div className="border-b border-line px-4 py-3">
        <h2 className="m-0 text-sm font-semibold text-ink">
          {target ? t(titleKey[target.kind]) : ""}
        </h2>
        {target && target.kind !== "project" && (
          <p className="m-0 mt-0.5 truncate font-mono text-xs text-faint">{target.path}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1 px-4 pt-3">
        {COMMENT_TYPES.map((tp) => (
          <button
            key={tp}
            type="button"
            onClick={() => pickType(tp)}
            className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs ${
              type === tp ? "bg-selection text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Dot color={TYPE_COLOR[tp]} />
            {t(typeKey(tp))}
          </button>
        ))}
      </div>

      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
        placeholder={t("comment.bodyPlaceholder")}
        className="mt-2 block max-h-60 min-h-24 w-full resize-y bg-transparent px-4 py-2 text-sm text-ink outline-none placeholder:text-faint"
      />

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <Checkbox
          checked={isTask}
          onChange={setIsTask}
          label={t("comment.task")}
          className="text-xs text-muted"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
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
    </Modal>
  );
}
