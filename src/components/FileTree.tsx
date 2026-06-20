/**
 * Lazy, gitignore-aware file tree.
 *
 * Directories load their children on first expand (`list_dir`), so even large
 * repositories render instantly. The "show hidden" toggle re-fetches with
 * ignore rules disabled. Clicking a file opens it; right-clicking any row (or
 * the empty area) offers to leave a file-, folder- or project-scoped comment.
 */
import { useCallback, useEffect, useState } from "react";
import { listDir, type DirEntry } from "../lib/api";
import { useProject } from "../lib/store";
import { toRelative } from "../lib/comments";
import { useT } from "../i18n";
import { FileIcon, ChevronIcon, MessageIcon } from "./icons";
import { TreeCommentDialog, type CommentTarget } from "./TreeCommentDialog";

type Ctx = (entry: DirEntry | null, e: React.MouseEvent) => void;

export function FileTree() {
  const root = useProject((s) => s.root);
  const showHidden = useProject((s) => s.showHidden);
  const t = useT();

  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry | null } | null>(
    null,
  );
  const [target, setTarget] = useState<CommentTarget | null>(null);

  const onContext: Ctx = (entry, e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const openComment = (kind: CommentTarget["kind"], path = "") => {
    setMenu(null);
    setTarget({ kind, path });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        role="tree"
        className="flex-1 overflow-y-auto py-2"
        onContextMenu={(e) => onContext(null, e)}
      >
        {/* `key` forces a full reload of the tree when the toggle flips. */}
        <DirChildren
          key={String(showHidden)}
          root={root}
          dir={root}
          depth={0}
          showHidden={showHidden}
          onContext={onContext}
        />
      </div>

      {menu && (
        <ul
          className="fixed z-[120] min-w-[200px] overflow-hidden rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.entry && (
            <MenuItem
              label={t(menu.entry.isDir ? "tree.commentFolder" : "tree.commentFile")}
              onClick={() =>
                openComment(
                  menu.entry!.isDir ? "folder" : "file",
                  toRelative(root, menu.entry!.path),
                )
              }
            />
          )}
          <MenuItem label={t("tree.commentProject")} onClick={() => openComment("project")} />
        </ul>
      )}

      <TreeCommentDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink transition-colors hover:bg-surface"
      >
        <MessageIcon className="h-3.5 w-3.5 flex-none text-muted" />
        {label}
      </button>
    </li>
  );
}

interface DirChildrenProps {
  root: string;
  dir: string;
  depth: number;
  showHidden: boolean;
  onContext: Ctx;
}

function DirChildren({ root, dir, depth, showHidden, onContext }: DirChildrenProps) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    listDir(root, dir, showHidden)
      .then((e) => !cancelled && setEntries(e))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [root, dir, showHidden]);

  if (entries === null) {
    return (
      <div className="px-4 py-2 text-xs text-faint" style={indent(depth)}>
        {t("common.loading")}
      </div>
    );
  }
  if (entries.length === 0 && depth === 0) {
    return <div className="px-4 py-2 text-xs text-faint">{t("tree.empty")}</div>;
  }
  return (
    <>
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          root={root}
          entry={entry}
          depth={depth}
          showHidden={showHidden}
          onContext={onContext}
        />
      ))}
    </>
  );
}

const indent = (depth: number) => ({ paddingLeft: `${depth * 14 + 8}px` });

function TreeNode({
  root,
  entry,
  depth,
  showHidden,
  onContext,
}: {
  root: string;
  entry: DirEntry;
  depth: number;
  showHidden: boolean;
  onContext: Ctx;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = useProject((s) => s.open);
  const active = useProject((s) => s.active);

  const onClick = useCallback(() => {
    if (entry.isDir) setExpanded((e) => !e);
    else open(entry.path);
  }, [entry, open]);

  const isActive = !entry.isDir && active === entry.path;

  return (
    <>
      <button
        type="button"
        style={indent(depth)}
        onClick={onClick}
        onContextMenu={(e) => onContext(entry, e)}
        role="treeitem"
        aria-expanded={entry.isDir ? expanded : undefined}
        title={entry.name}
        className={`flex w-full items-center gap-1.5 py-[3px] pr-3 text-left text-sm text-ink transition-colors ${
          isActive ? "bg-selection" : "hover:bg-surface"
        }`}
      >
        {entry.isDir ? (
          <ChevronIcon
            className={`h-[13px] w-[13px] flex-none text-faint transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-[13px] flex-none" />
        )}
        <FileIcon isDir={entry.isDir} expanded={expanded} name={entry.name} />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {entry.name}
        </span>
      </button>
      {entry.isDir && expanded && (
        <DirChildren
          root={root}
          dir={entry.path}
          depth={depth + 1}
          showHidden={showHidden}
          onContext={onContext}
        />
      )}
    </>
  );
}
