/**
 * The Source Control side panel.
 *
 * Surfaces the working-tree changes split into staged and unstaged groups, lets
 * you stage / unstage / discard individual files (or all), and commit the staged
 * set with a message. Selecting a file opens it with the diff view on so you can
 * see what changed (including the agent's edits).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  gitStatus,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitDiscard,
  gitDiscardAll,
  gitCommit,
  gitFetch,
  gitPull,
  gitPush,
  gitSync,
  gitInfo,
  gitCreateBranch,
  gitStash,
  gitStashList,
  gitStashPop,
  gitStashApply,
  gitStashDrop,
  submitToTerminal,
  type GitChange,
  type StashEntry,
} from "../../lib/api";
import { useProject, useEditorActions } from "../../lib/store";
import { useTerminals } from "../../lib/terminals";
import { notify } from "../../lib/notice";
import { composeCommitPrompt } from "../../lib/review";
import { Textarea } from "../atoms/Textarea";
import { Input } from "../atoms/Input";
import { IconButton } from "../atoms/IconButton";

import {
  PlusIcon,
  MinusIcon,
  DiscardIcon,
  SparkleIcon,
  FetchIcon,
  PullIcon,
  PushIcon,
  SyncIcon,
  StashIcon,
  MoreIcon,
  GitBranchIcon,
  CloseIcon,
} from "../atoms/icons";
import { useTranslation } from "react-i18next";

/** Single-letter badge + colour per change category. */
const STATUS: Record<GitChange["status"], { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--syn-number)" },
  added: { letter: "A", color: "var(--syn-string)" },
  deleted: { letter: "D", color: "var(--marker)" },
  renamed: { letter: "R", color: "var(--syn-keyword)" },
  untracked: { letter: "U", color: "var(--text-faint)" },
  conflicted: { letter: "!", color: "var(--diag-error)" },
};

const basename = (p: string) => p.split("/").pop() ?? p;
const dirname = (p: string) => {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "";
};

export function GitPanel() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const git = useProject((s) => s.git);
  const setGit = useProject((s) => s.setGit);
  const setDiffing = useEditorActions((s) => s.setDiffing);
  const activeTerminal = useTerminals((s) => s.activeId);
  const addTerminal = useTerminals((s) => s.add);
  const { t } = useTranslation();
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Path armed for discard confirmation (inline, like the comment delete flow).
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  // Stash index armed for drop confirmation (inline, like discardDiscard above).
  const [confirmDropStash, setConfirmDropStash] = useState<number | null>(null);
  // Repo-level "more actions" dropdown + its data.
  const [menuOpen, setMenuOpen] = useState(false);
  // The "more" menu is positioned with fixed coords (to the right of the dots) so
  // it escapes the sidebar's overflow clipping entirely.
  const dotsRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [branchName, setBranchName] = useState<string | null>(null); // null = input hidden
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    gitStatus(root)
      .then(setChanges)
      .catch(() => setChanges([]));
  }, [root]);

  const refreshStashes = useCallback(() => {
    gitStashList(root)
      .then(setStashes)
      .catch(() => setStashes([]));
  }, [root]);

  // Refresh ahead/behind/remote after a repo op so the push/sync affordances
  // reflect the new state (a commit adds to `ahead`, a push clears it).
  const refreshInfo = useCallback(() => {
    gitInfo(root).then(setGit).catch(() => {});
  }, [root, setGit]);

  useEffect(() => {
    refresh();
    // Keep the view fresh as the tree changes (cheap, debounced by interval).
    // Skip the poll while the window is hidden — nothing to refresh for.
    const id = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, 4000);
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
    setError(null);
    p.then(() => {
      refresh();
      refreshInfo();
    })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };

  // Repo-level op (fetch/pull/push/stash/…): refresh status, stashes and
  // ahead/behind, close the menu, and surface git's stderr on failure.
  const runRepo = (p: Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    p.then(() => {
      refresh();
      refreshStashes();
      refreshInfo();
    })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };

  // Sync = pull then push. A conflict isn't an error: the backend reports the
  // conflicted files (which then show in the list) and we point the user at them.
  const sync = () => {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    gitSync(root)
      .then((res) => {
        refresh();
        refreshStashes();
        refreshInfo();
        if (res.conflicted.length > 0) {
          notify("info", t("git.syncConflicts", { count: res.conflicted.length }));
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };

  const discard = (c: GitChange) => {
    setConfirmDiscard(null);
    act(gitDiscard(root, c.path, c.status === "untracked"));
  };

  const createBranch = () => {
    const name = (branchName ?? "").trim();
    if (!name) return;
    setBranchName(null);
    runRepo(gitCreateBranch(root, name));
  };

  const commit = () => {
    if (!message.trim() || staged.length === 0) return;
    setBusy(true);
    setError(null);
    gitCommit(root, message.trim())
      .then(() => {
        setMessage("");
        refresh();
      })
      .catch((e) => setError(String(e)))
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
            <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
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
    actions,
  }: {
    label: string;
    count: number;
    actions: { onClick: () => void; label: string; Icon: typeof PlusIcon; danger?: boolean }[];
  }) => (
    <div className="group/hdr flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
      <span>{label}</span>
      <span className="text-faint">{count}</span>
      <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/hdr:opacity-100 group-focus-within/hdr:opacity-100">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            title={a.label}
            aria-label={a.label}
            className={`grid h-5 w-5 place-items-center rounded text-muted hover:bg-overlay ${
              a.danger ? "hover:text-marker" : "hover:text-ink"
            }`}
          >
            <a.Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );

  const ToolButton = ({
    onClick,
    label,
    Icon,
    disabled,
  }: {
    onClick: () => void;
    label: string;
    Icon: typeof PlusIcon;
    disabled?: boolean;
  }) => (
    <IconButton
      onClick={onClick}
      disabled={busy || disabled}
      label={label}
      icon={<Icon className="h-4 w-4" />}
    />
  );

  // Remote affordances: what can each action actually do right now?
  const { ahead, behind, hasRemote, hasUpstream } = git;
  const canPush = hasRemote && (!hasUpstream || ahead > 0);
  const canSync = hasRemote && (ahead > 0 || behind > 0 || hasUpstream);
  // Tooltip that spells out the pending counts, e.g. "Sync (↓2 ↑1)".
  const counts = [behind > 0 ? `↓${behind}` : "", ahead > 0 ? `↑${ahead}` : ""]
    .filter(Boolean)
    .join(" ");
  const syncLabel = counts ? `${t("git.sync")} (${counts})` : t("git.sync");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Repo toolbar: fetch / pull / push, plus a "more" menu */}
      <div className="relative flex flex-none items-center gap-0.5 border-b border-line px-2 py-1.5">
        <ToolButton
          onClick={sync}
          label={syncLabel}
          Icon={SyncIcon}
          disabled={!canSync}
        />
        {counts && (
          <span className="mr-0.5 font-mono text-[11px] text-muted tabular-nums">{counts}</span>
        )}
        <ToolButton
          onClick={() => runRepo(gitFetch(root))}
          label={t("git.fetch")}
          Icon={FetchIcon}
          disabled={!hasRemote}
        />
        <ToolButton
          onClick={() => runRepo(gitPull(root))}
          label={t("git.pull")}
          Icon={PullIcon}
          disabled={!hasRemote}
        />
        <ToolButton
          onClick={() => runRepo(gitPush(root))}
          label={t("git.push")}
          Icon={PushIcon}
          disabled={!canPush}
        />
        <div ref={dotsRef} className="ml-auto">
          <ToolButton
            onClick={() => {
              const next = !menuOpen;
              if (next) {
                const r = dotsRef.current?.getBoundingClientRect();
                if (r) setMenuPos({ top: r.top, left: r.right + 6 });
                refreshStashes();
              }
              setMenuOpen(next);
            }}
            label={t("git.more")}
            Icon={MoreIcon}
          />
          {menuOpen && menuPos && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div
                className="fixed z-30 w-60 overflow-y-auto rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
                style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  maxHeight: `calc(100vh - ${menuPos.top}px - 8px)`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setBranchName("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface"
                >
                  <GitBranchIcon className="h-3.5 w-3.5 text-muted" />
                  {t("git.newBranch")}
                </button>
                <button
                  type="button"
                  onClick={() => runRepo(gitStash(root, "", false))}
                  disabled={changes.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface disabled:opacity-40"
                >
                  <StashIcon className="h-3.5 w-3.5 text-muted" />
                  {t("git.stash")}
                </button>
                <button
                  type="button"
                  onClick={() => runRepo(gitStash(root, "", true))}
                  disabled={changes.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface disabled:opacity-40"
                >
                  <StashIcon className="h-3.5 w-3.5 text-muted" />
                  {t("git.stashUntracked")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDiscardAll(true);
                  }}
                  disabled={unstaged.length === 0}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-marker hover:bg-surface disabled:opacity-40"
                >
                  <DiscardIcon className="h-3.5 w-3.5" />
                  {t("git.discardAll")}
                </button>

                <div className="mt-1 border-t border-line px-3 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wide text-faint uppercase">
                  {t("git.stashes")}
                </div>
                {stashes.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-faint">{t("git.noStashes")}</p>
                ) : (
                  stashes.map((s) => (
                    <div
                      key={s.index}
                      className="group/stash flex items-center gap-1 px-3 py-1 hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-muted" title={s.message}>
                        {s.message}
                      </span>
                      {confirmDropStash === s.index ? (
                        <div className="flex flex-none items-center gap-1.5 text-xs">
                          <span className="text-muted">{t("git.stashDropConfirm")}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDropStash(null);
                              runRepo(gitStashDrop(root, s.index));
                            }}
                            className="font-semibold text-marker hover:underline"
                          >
                            {t("git.stashDrop")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDropStash(null)}
                            className="text-muted hover:text-ink"
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => runRepo(gitStashApply(root, s.index))}
                            className="flex-none text-xs text-muted opacity-0 transition-opacity group-hover/stash:opacity-100 group-focus-within/stash:opacity-100 focus-visible:opacity-100 hover:text-ink"
                          >
                            {t("git.stashApply")}
                          </button>
                          <button
                            type="button"
                            onClick={() => runRepo(gitStashPop(root, s.index))}
                            className="flex-none text-xs text-muted opacity-0 transition-opacity group-hover/stash:opacity-100 group-focus-within/stash:opacity-100 focus-visible:opacity-100 hover:text-ink"
                          >
                            {t("git.stashPop")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDropStash(s.index)}
                            className="flex-none text-xs text-muted opacity-0 transition-opacity group-hover/stash:opacity-100 group-focus-within/stash:opacity-100 focus-visible:opacity-100 hover:text-marker"
                          >
                            {t("git.stashDrop")}
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* New-branch inline input */}
      {branchName !== null && (
        <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
          <Input
            variant="filled"
            autoFocus
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createBranch();
              if (e.key === "Escape") setBranchName(null);
            }}
            placeholder={t("git.newBranchPlaceholder")}
            className="min-w-0 flex-1 px-2"
          />
          <IconButton
            size="sm"
            onClick={() => setBranchName(null)}
            label={t("common.cancel")}
            icon={<CloseIcon className="h-3.5 w-3.5" />}
          />
        </div>
      )}

      {error && (
        <div className="flex-none border-b border-line bg-surface px-3 py-1.5 text-xs text-marker">
          {error}
        </div>
      )}

      {confirmDiscardAll && (
        <div className="flex-none border-b border-line bg-surface px-3 py-2 text-xs">
          <p className="mb-1.5 text-muted">{t("git.discardAllConfirm")}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmDiscardAll(false);
                act(gitDiscardAll(root, true));
              }}
              className="font-semibold text-marker hover:underline"
            >
              {t("git.discardAll")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDiscardAll(false)}
              className="text-muted hover:text-ink"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Commit box */}
      <div className="flex-none border-b border-line p-2">
        <Textarea
          variant="filled"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onSubmit={commit}
          placeholder={t("git.commitPlaceholder")}
          rows={1}
          className="max-h-32 min-h-8"
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
          <SparkleIcon className="h-3.5 w-3.5" />
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
                actions={[
                  { onClick: () => act(gitUnstageAll(root)), label: t("git.unstageAll"), Icon: MinusIcon },
                ]}
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
                actions={[
                  {
                    onClick: () => setConfirmDiscardAll(true),
                    label: t("git.discardAll"),
                    Icon: DiscardIcon,
                    danger: true,
                  },
                  { onClick: () => act(gitStageAll(root)), label: t("git.stageAll"), Icon: PlusIcon },
                ]}
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
