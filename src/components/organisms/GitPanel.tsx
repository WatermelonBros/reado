/**
 * The Source Control side panel.
 *
 * Surfaces the working-tree changes split into staged and unstaged groups, lets
 * you stage / unstage / discard individual files (or all), and commit the staged
 * set with a message. Selecting a file opens it with the diff view on so you can
 * see what changed (including the agent's edits).
 */
import { useCallback, useEffect, useState } from "react";
import {
  gitStatus,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitDiscard,
  gitCommit,
  submitToTerminal,
  type GitChange,
} from "../../lib/api";
import { useProject, useEditorActions } from "../../lib/store";
import { useTerminals } from "../../lib/terminals";
import { composeCommitPrompt } from "../../lib/review";
import { useT } from "../../i18n";
import { PlusIcon, MinusIcon, DiscardIcon, ClaudeIcon } from "../atoms/icons";

/** Single-letter badge + colour per change category. */
const STATUS: Record<GitChange["status"], { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--syn-number)" },
  added: { letter: "A", color: "var(--syn-string)" },
  deleted: { letter: "D", color: "var(--marker)" },
  renamed: { letter: "R", color: "var(--syn-keyword)" },
  untracked: { letter: "U", color: "var(--text-faint)" },
};

const basename = (p: string) => p.split("/").pop() ?? p;
const dirname = (p: string) => {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "";
};

export function GitPanel() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const setDiffing = useEditorActions((s) => s.setDiffing);
  const activeTerminal = useTerminals((s) => s.activeId);
  const addTerminal = useTerminals((s) => s.add);
  const t = useT();
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Path armed for discard confirmation (inline, like the comment delete flow).
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  const refresh = useCallback(() => {
    gitStatus(root)
      .then(setChanges)
      .catch(() => setChanges([]));
  }, [root]);

  useEffect(() => {
    refresh();
    // Keep the view fresh as the tree changes (cheap, debounced by interval).
    const id = window.setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => !c.staged);

  const select = (c: GitChange) => {
    if (c.status === "deleted") return;
    open(`${root}/${c.path}`);
    setDiffing(true);
  };

  // Run a mutation, then refresh — optimism isn't worth a stale index here.
  const act = (p: Promise<unknown>) => {
    setBusy(true);
    p.then(refresh)
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const discard = (c: GitChange) => {
    setConfirmDiscard(null);
    act(gitDiscard(root, c.path, c.status === "untracked"));
  };

  const commit = () => {
    if (!message.trim() || staged.length === 0) return;
    setBusy(true);
    gitCommit(root, message.trim())
      .then(() => {
        setMessage("");
        refresh();
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  // Hand the commit+push off to the agent in the terminal: it reviews the diff,
  // writes the message, commits and pushes.
  const aiCommit = () => {
    const id = activeTerminal ?? addTerminal();
    submitToTerminal(id, composeCommitPrompt(), id === activeTerminal ? 0 : 400);
  };

  const Row = ({ c }: { c: GitChange }) => {
    const s = STATUS[c.status];
    return (
      <li className="group/row">
        <div className="flex items-center gap-2 px-3 py-1 text-sm transition-colors hover:bg-surface">
          <button
            type="button"
            onClick={() => select(c)}
            title={c.path}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="truncate text-ink">{basename(c.path)}</span>
            <span className="truncate text-xs text-faint">{dirname(c.path)}</span>
          </button>
          {confirmDiscard === c.path ? (
            <div className="flex flex-none items-center gap-1.5 text-xs">
              <span className="text-muted">{t("git.discard")}?</span>
              <button
                type="button"
                onClick={() => discard(c)}
                className="font-semibold text-marker hover:underline"
              >
                {t("comment.delete")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(null)}
                className="text-muted hover:text-ink"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
              {!c.staged && (
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(c.path)}
                  title={t("git.discard")}
                  aria-label={t("git.discard")}
                  className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-overlay hover:text-marker"
                >
                  <DiscardIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  act(c.staged ? gitUnstage(root, c.path) : gitStage(root, c.path))
                }
                title={c.staged ? t("git.unstage") : t("git.stage")}
                aria-label={c.staged ? t("git.unstage") : t("git.stage")}
                className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-overlay hover:text-ink"
              >
                {c.staged ? (
                  <MinusIcon className="h-3.5 w-3.5" />
                ) : (
                  <PlusIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
          <span
            className="flex-none font-mono text-xs font-semibold"
            style={{ color: s.color }}
          >
            {s.letter}
          </span>
        </div>
      </li>
    );
  };

  const GroupHeader = ({
    label,
    count,
    action,
    actionLabel,
    Icon,
  }: {
    label: string;
    count: number;
    action: () => void;
    actionLabel: string;
    Icon: typeof PlusIcon;
  }) => (
    <div className="group/hdr flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
      <span>{label}</span>
      <span className="text-faint">{count}</span>
      <button
        type="button"
        onClick={action}
        title={actionLabel}
        aria-label={actionLabel}
        className="ml-auto grid h-5 w-5 place-items-center rounded text-muted opacity-0 transition-opacity group-hover/hdr:opacity-100 hover:bg-overlay hover:text-ink"
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Commit box */}
      <div className="flex-none border-b border-line p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          }}
          placeholder={t("git.commitPlaceholder")}
          rows={1}
          className="block max-h-32 min-h-8 w-full resize-y rounded-md bg-surface px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint"
        />
        <button
          type="button"
          onClick={commit}
          disabled={busy || !message.trim() || staged.length === 0}
          title={staged.length === 0 ? t("git.nothingStaged") : t("git.commit")}
          className="mt-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {busy ? t("git.committing") : t("git.commit")}
        </button>
        <button
          type="button"
          onClick={aiCommit}
          disabled={changes.length === 0}
          title={changes.length === 0 ? t("git.clean") : t("git.aiCommit")}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
        >
          <ClaudeIcon className="h-3.5 w-3.5" />
          {t("git.aiCommit")}
        </button>
      </div>

      {changes.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("git.clean")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {staged.length > 0 && (
            <>
              <GroupHeader
                label={t("git.staged")}
                count={staged.length}
                action={() => act(gitUnstageAll(root))}
                actionLabel={t("git.unstageAll")}
                Icon={MinusIcon}
              />
              <ul className="m-0 list-none p-0">
                {staged.map((c, i) => (
                  <Row key={`s:${i}:${c.path}`} c={c} />
                ))}
              </ul>
            </>
          )}
          {unstaged.length > 0 && (
            <>
              <GroupHeader
                label={t("git.changes")}
                count={unstaged.length}
                action={() => act(gitStageAll(root))}
                actionLabel={t("git.stageAll")}
                Icon={PlusIcon}
              />
              <ul className="m-0 list-none p-0">
                {unstaged.map((c, i) => (
                  <Row key={`u:${i}:${c.path}`} c={c} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
