/**
 * Lazy, gitignore-aware file tree.
 *
 * Directories load their children on first expand (`list_dir`), so even large
 * repositories render instantly. The "show hidden" toggle re-fetches with
 * ignore rules disabled. Clicking a file opens it; right-clicking any row (or
 * the empty area) offers to leave a file-, folder- or project-scoped comment.
 *
 * Files can be reorganised by drag-and-drop: drag a row onto a folder to move
 * it (internal), or drop files from outside the app onto a folder to copy them
 * in. The tree re-lists itself when files change on disk (`treeNonce`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listDir, movePath, importPaths, type DirEntry } from "../../lib/api";
import { useProject } from "../../lib/store";
import { useTextView } from "../../lib/textView";
import { useReadProgress } from "../../lib/readProgress";
import { toRelative } from "../../lib/comments";
import { useT } from "../../i18n";
import {
  FileIcon,
  ChevronIcon,
  MessageIcon,
  EditIcon,
  SparkleIcon,
  LayoutIcon,
} from "../atoms/icons";
import { TreeCommentDialog, type CommentTarget } from "../organisms/TreeCommentDialog";
import { AuditDialog, type AuditTarget } from "../organisms/AuditDialog";
import { ContextMenu, type ContextMenuItem } from "../atoms/ContextMenu";

type Ctx = (entry: DirEntry | null, e: React.MouseEvent) => void;

const DRAG_TYPE = "application/reado-path";
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const sep = (p: string) => (p.includes("\\") ? "\\" : "/");
const parentOf = (p: string) => p.slice(0, p.lastIndexOf(sep(p)));
/** Where a row drops into: a folder takes its own path, a file its parent dir. */
const dropDir = (entry: DirEntry) => (entry.isDir ? entry.path : parentOf(entry.path));

export function FileTree() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const showHidden = useProject((s) => s.showHidden);
  const treeNonce = useProject((s) => s.treeNonce);
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);

  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry | null } | null>(
    null,
  );
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [audit, setAudit] = useState<AuditTarget | null>(null);

  // Internal drag-and-drop: move a dragged path into a destination folder.
  const move = useCallback(
    async (from: string, destDir: string) => {
      const to = `${destDir}${sep(destDir)}${baseName(from)}`;
      // No-op, or moving a folder into itself/its own subtree.
      if (from === to || destDir === from || destDir.startsWith(from + sep(from))) return;
      try {
        await movePath(root, from, to);
        useProject.getState().renamePath(from, to);
        useProject.getState().bumpTree();
      } catch {
        /* refused (e.g. name clash) — leave the tree as-is */
      }
    },
    [root],
  );

  // External drag-and-drop: OS file drops are delivered by Tauri (not HTML5),
  // with a physical-pixel position. Resolve the folder under the cursor and copy
  // the dropped paths into it; ignore drops outside the tree.
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const tree = containerRef.current;
      if (!tree) return;
      const dpr = window.devicePixelRatio || 1;
      const { x, y } = event.payload.position;
      const el = document.elementFromPoint(x / dpr, y / dpr);
      if (!el || !tree.contains(el)) return;
      const destDir = el.closest("[data-dir]")?.getAttribute("data-dir") || root;
      importPaths(root, event.payload.paths, destDir)
        .then(() => useProject.getState().bumpTree())
        .catch(() => {});
    });
    return () => {
      un.then((f) => f());
    };
  }, [root]);

  const onContext: Ctx = (entry, e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const openComment = (kind: CommentTarget["kind"], path = "") => {
    setMenu(null);
    setTarget({ kind, path });
  };

  const menuItems: ContextMenuItem[] = menu
    ? [
        ...(menu.entry
          ? [
              {
                label: t(menu.entry.isDir ? "tree.commentFolder" : "tree.commentFile"),
                icon: <MessageIcon className="h-3.5 w-3.5" />,
                onSelect: () =>
                  openComment(
                    menu.entry!.isDir ? "folder" : "file",
                    toRelative(root, menu.entry!.path),
                  ),
              },
              {
                label: t("tree.audit"),
                icon: <SparkleIcon className="h-3.5 w-3.5" />,
                onSelect: () => {
                  setAudit({
                    path: toRelative(root, menu.entry!.path),
                    isDir: menu.entry!.isDir,
                  });
                  setMenu(null);
                },
              },
            ]
          : []),
        ...(menu.entry && !menu.entry.isDir
          ? [
              {
                label: t("split.openSide"),
                icon: <LayoutIcon className="h-3.5 w-3.5" />,
                onSelect: () => {
                  useProject.getState().openSplit(menu.entry!.path);
                  setMenu(null);
                },
              },
              {
                label: useReadProgress.getState().read.has(toRelative(root, menu.entry.path))
                  ? t("tree.markUnread")
                  : t("tree.markRead"),
                onSelect: () => {
                  const relP = toRelative(root, menu.entry!.path);
                  const isRead = useReadProgress.getState().read.has(relP);
                  useReadProgress.getState().mark(root, relP, !isRead);
                  setMenu(null);
                },
              },
            ]
          : []),
        ...(menu.entry && !menu.entry.isDir && /\.svg$/i.test(menu.entry.path)
          ? [
              {
                label: t("tree.openAsText"),
                icon: <EditIcon className="h-3.5 w-3.5" />,
                onSelect: () => {
                  useTextView.getState().openAsText(menu.entry!.path);
                  open(menu.entry!.path);
                  setMenu(null);
                },
              },
            ]
          : []),
        {
          label: t("tree.commentProject"),
          icon: <MessageIcon className="h-3.5 w-3.5" />,
          onSelect: () => openComment("project"),
        },
      ]
    : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        ref={containerRef}
        role="tree"
        data-dir={root}
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
          treeNonce={treeNonce}
          onContext={onContext}
          onMove={move}
        />
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

      <TreeCommentDialog target={target} onClose={() => setTarget(null)} />
      <AuditDialog target={audit} onClose={() => setAudit(null)} />
    </div>
  );
}

interface DirChildrenProps {
  root: string;
  dir: string;
  depth: number;
  showHidden: boolean;
  treeNonce: number;
  onContext: Ctx;
  onMove: (from: string, destDir: string) => void;
}

function DirChildren({
  root,
  dir,
  depth,
  showHidden,
  treeNonce,
  onContext,
  onMove,
}: DirChildrenProps) {
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
  }, [root, dir, showHidden, treeNonce]);

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
          treeNonce={treeNonce}
          onContext={onContext}
          onMove={onMove}
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
  treeNonce,
  onContext,
  onMove,
}: {
  root: string;
  entry: DirEntry;
  depth: number;
  showHidden: boolean;
  treeNonce: number;
  onContext: Ctx;
  onMove: (from: string, destDir: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [over, setOver] = useState(false);
  const open = useProject((s) => s.open);
  const active = useProject((s) => s.active);
  // Read files are dimmed (a quiet reading-progress cue).
  const isRead = useReadProgress((s) => !entry.isDir && s.read.has(toRelative(root, entry.path)));

  const onClick = useCallback(() => {
    if (entry.isDir) setExpanded((e) => !e);
    else open(entry.path);
  }, [entry, open]);

  const isActive = !entry.isDir && active === entry.path;
  const dragging = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

  return (
    <>
      <button
        type="button"
        style={indent(depth)}
        data-dir={dropDir(entry)}
        draggable
        onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, entry.path)}
        onDragOver={(e) => {
          if (!dragging(e)) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          if (!dragging(e)) return;
          e.preventDefault();
          e.stopPropagation();
          const from = e.dataTransfer.getData(DRAG_TYPE);
          if (from) onMove(from, dropDir(entry));
        }}
        onClick={onClick}
        onContextMenu={(e) => onContext(entry, e)}
        role="treeitem"
        aria-expanded={entry.isDir ? expanded : undefined}
        title={entry.name}
        className={`flex w-full items-center gap-1.5 py-[3px] pr-3 text-left text-sm text-ink transition-colors ${
          over ? "bg-selection" : isActive ? "bg-selection" : "hover:bg-surface"
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
        <span
          className={`overflow-hidden text-ellipsis whitespace-nowrap ${
            isRead ? "text-muted" : ""
          }`}
        >
          {entry.name}
        </span>
      </button>
      {entry.isDir && expanded && (
        <DirChildren
          root={root}
          dir={entry.path}
          depth={depth + 1}
          showHidden={showHidden}
          treeNonce={treeNonce}
          onContext={onContext}
          onMove={onMove}
        />
      )}
    </>
  );
}
