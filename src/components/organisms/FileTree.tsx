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
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listDir, listFiles, movePath, importPaths, type DirEntry } from "../../lib/api";
import { useProject, useEditorActions, useSettings } from "../../lib/store";
import { useTextView } from "../../lib/textView";
import { useReadProgress, LAST_READ_BASE } from "../../lib/readProgress";
import { useDiagnostics } from "../../lib/diagnostics";
import { toRelative } from "../../lib/comments";

import {
  FileIcon,
  ChevronIcon,
  MessageIcon,
  EditIcon,
  SparkleIcon,
  LayoutIcon,
  DeltaIcon,
  TrashIcon,
} from "../atoms/icons";
import { TreeCommentDialog, type CommentTarget } from "../organisms/TreeCommentDialog";
import { AuditDialog, type AuditTarget } from "../organisms/AuditDialog";
import { ContextMenu, type ContextMenuItem } from "../atoms/ContextMenu";
import { useFileUndo, trashAndRecord } from "../../lib/fileUndo";
import { useTranslation } from "react-i18next";

type Ctx = (entry: DirEntry | null, e: React.MouseEvent) => void;

/** The project's full file list (rel paths, "/"-separated), cached so each folder
 *  row can show a quiet read/total aggregate without re-walking the disk. */
const useProjectFiles = create<{ files: string[]; load: (root: string) => void }>((set) => ({
  files: [],
  load: (root) =>
    void listFiles(root)
      .then((fs) => set({ files: fs.map((f) => f.replace(/\\/g, "/")) }))
      // A transient failure keeps the cached list — wiping it to [] would flicker
      // away the per-folder read/total badges. Stale beats empty here.
      .catch(() => {}),
}));

/** How many of `items` (a file list or read-set) sit under `prefix` ("dir/"). */
const countPrefix = (items: Iterable<string>, prefix: string) => {
  let n = 0;
  for (const p of items) if (p.startsWith(prefix)) n++;
  return n;
};

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const sep = (p: string) => (p.includes("\\") ? "\\" : "/");
const parentOf = (p: string) => p.slice(0, p.lastIndexOf(sep(p)));
/** Where a row drops into: a folder takes its own path, a file its parent dir. */
const dropDir = (entry: DirEntry) => (entry.isDir ? entry.path : parentOf(entry.path));

/** Pointer-drag reorder/move context. HTML5 drag doesn't fire in the Tauri
 *  webview (the OS drop handler owns it), and it also mis-hit-tests under interface
 *  zoom; raw pointer events with `elementFromPoint` are correct at any zoom. */
const DragCtx = createContext<{
  onRowPointerDown: (path: string) => (e: React.PointerEvent) => void;
  draggingPath: string | null;
  overDir: string | null;
}>({ onRowPointerDown: () => () => {}, draggingPath: null, overDir: null });

export function FileTree() {
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const showHidden = useProject((s) => s.showHidden);
  const treeNonce = useProject((s) => s.treeNonce);
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry | null } | null>(
    null,
  );
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [audit, setAudit] = useState<AuditTarget | null>(null);

  // Keep the file-list cache fresh for the per-folder read/total aggregate.
  useEffect(() => {
    useProjectFiles.getState().load(root);
  }, [root, treeNonce]);

  // Internal drag-and-drop: move a dragged path into a destination folder.
  const move = useCallback(
    async (from: string, destDir: string) => {
      const to = `${destDir}${sep(destDir)}${baseName(from)}`;
      // No-op, or moving a folder into itself/its own subtree.
      if (from === to || destDir === from || destDir.startsWith(from + sep(from))) return;
      try {
        await movePath(root, from, to);
        useProject.getState().renamePath(from, to);
        useFileUndo.getState().record({ kind: "move", from, to });
        useProject.getState().bumpTree();
      } catch {
        /* refused (e.g. name clash) — leave the tree as-is */
      }
    },
    [root],
  );

  // Pointer-based drag to move a file/folder into another folder. Press a row,
  // move past a small threshold, and release over a destination folder.
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [overDir, setOverDir] = useState<string | null>(null);
  const dragStart = useRef<{ path: string; x: number; y: number } | null>(null);

  const onRowPointerDown = useCallback(
    (path: string) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      dragStart.current = { path, x: e.clientX, y: e.clientY };
    },
    [],
  );

  useEffect(() => {
    const destAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dir]")?.getAttribute("data-dir") ??
      null;
    const onPointerMove = (e: PointerEvent) => {
      const s = dragStart.current;
      if (!s) return;
      if (!draggingPath) {
        if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < 5) return;
        setDraggingPath(s.path);
      }
      setOverDir(destAt(e.clientX, e.clientY));
    };
    const onPointerUp = (e: PointerEvent) => {
      const s = dragStart.current;
      dragStart.current = null;
      const wasDragging = draggingPath;
      setDraggingPath(null);
      setOverDir(null);
      if (!s || !wasDragging) return;
      // Swallow the trailing click so releasing a drag doesn't also open the file.
      const stopClick = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener("click", stopClick, true);
      };
      window.addEventListener("click", stopClick, true);
      const dest = destAt(e.clientX, e.clientY);
      if (dest) void move(s.path, dest);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingPath, move]);

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
      // FileTree unmounts on every tool switch; swallow a rejecting unlisten so
      // it doesn't surface as an unhandled rejection.
      void un.then((f) => f()).catch(() => {});
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
        ...(() => {
          if (!menu.entry || !menu.entry.isDir) return [];
          // Only offer the direction that would actually change something: a
          // folder with everything already read shouldn't offer "mark read", an
          // all-unread (or empty) folder shouldn't offer "mark unread".
          const folderRel = toRelative(root, menu.entry.path);
          const files = useProjectFiles
            .getState()
            .files.filter((f) => f.startsWith(folderRel + "/"));
          if (files.length === 0) return [];
          const read = useReadProgress.getState().read;
          const someUnread = files.some((f) => !read.has(f));
          const someRead = files.some((f) => read.has(f));
          const mark = (value: boolean) => {
            useReadProgress.getState().markMany(root, files, value);
            setMenu(null);
          };
          return [
            ...(someUnread
              ? [{ label: t("tree.markFolderRead"), onSelect: () => mark(true) }]
              : []),
            ...(someRead
              ? [{ label: t("tree.markFolderUnread"), onSelect: () => mark(false) }]
              : []),
          ];
        })(),
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
        ...(menu.entry && !menu.entry.isDir && /\.(md|markdown|mdx)$/i.test(menu.entry.path)
          ? [
              {
                // Markdown opens as rendered prose by default; this opens it
                // straight into the editable source view.
                label: t("tree.editSource"),
                icon: <EditIcon className="h-3.5 w-3.5" />,
                onSelect: () => {
                  useTextView.getState().openAsText(menu.entry!.path);
                  open(menu.entry!.path);
                  setMenu(null);
                },
              },
            ]
          : []),
        ...(menu.entry
          ? [
              {
                label: t("tree.reveal", {
                  app: /win/i.test(navigator.userAgent)
                    ? "Explorer"
                    : /mac|iphone|ipad/i.test(navigator.userAgent)
                      ? "Finder"
                      : t("tree.fileManager"),
                }),
                onSelect: () => {
                  void revealItemInDir(menu.entry!.path);
                  setMenu(null);
                },
              },
            ]
          : []),
        ...(menu.entry
          ? [
              {
                label: t("tree.delete"),
                icon: <TrashIcon className="h-3.5 w-3.5" />,
                danger: true,
                separatorBefore: true,
                onSelect: () => {
                  void trashAndRecord(menu.entry!.path);
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
    <DragCtx.Provider value={{ onRowPointerDown, draggingPath, overDir }}>
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
    </DragCtx.Provider>
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
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    listDir(root, dir, showHidden)
      .then((e) => !cancelled && setEntries(e))
      // A read failure must stay distinguishable from a genuinely empty folder:
      // flag the error so we don't render `tree.empty` as if the load succeeded.
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setFailed(true);
      });
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
  if (failed) {
    return (
      <div className="px-4 py-2 text-xs text-faint" style={indent(depth)}>
        {t("tree.readError")}
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
  const { onRowPointerDown, draggingPath, overDir } = useContext(DragCtx);
  const rowRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();
  const open = useProject((s) => s.open);
  const active = useProject((s) => s.active);
  // Primitive selector → re-renders only when the icon mode actually flips.
  const iconMode = useSettings((s) => s.fileIcons);
  // Expansion lives in the store (persisted per project), keyed by the same
  // project-relative path the tree uses elsewhere, so a reopen restores it and
  // collapse-all (which clears expandedDirs) collapses everything.
  const relPath = toRelative(root, entry.path);
  const expanded = useProject((s) => entry.isDir && s.expandedDirs.includes(relPath));

  // Reveal the open file: ancestor folders auto-expand (the chain cascades as
  // each level mounts), and the active row scrolls into view.
  useEffect(() => {
    if (entry.isDir && active && active.startsWith(entry.path + sep(entry.path))) {
      useProject.getState().toggleDir(relPath, true);
    }
  }, [active, entry.isDir, entry.path, relPath]);
  const isActive = !entry.isDir && active === entry.path;
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);
  // Read files are dimmed (a quiet reading-progress cue).
  const isRead = useReadProgress((s) => !entry.isDir && s.read.has(relPath));
  // Per-folder aggregate: how many files under this folder have been read.
  // Selectors short-circuit for files so file rows never scan the lists.
  const folderTotal = useProjectFiles((s) =>
    entry.isDir ? countPrefix(s.files, relPath + "/") : 0,
  );
  const folderRead = useReadProgress((s) =>
    entry.isDir ? countPrefix(s.read, relPath + "/") : 0,
  );
  // A fully-read folder dims like a read file; a partially-read one shows a quiet
  // count. Empty/untouched folders stay neutral (no zero-noise on every row).
  const folderDone = entry.isDir && folderTotal > 0 && folderRead >= folderTotal;
  const dimmed = entry.isDir ? folderDone : isRead;
  // Error count from the language server — a quiet trailing count, not a loud
  // red filename (and honest: its absence means "none found", not "clean").
  const errorCount = useDiagnostics((s) => (entry.isDir ? 0 : (s.errors[entry.path] ?? 0)));
  // A read file that changed externally has a delta to review.
  const hasDelta = useReadProgress((s) => !entry.isDir && s.changed.has(relPath));

  const onClick = useCallback(() => {
    if (entry.isDir) useProject.getState().toggleDir(relPath);
    else open(entry.path);
  }, [entry, open, relPath]);

  const isDragged = draggingPath === entry.path;
  // Highlight the destination folder row (the one files would move into).
  const isDropTarget = draggingPath !== null && entry.isDir && entry.path === overDir;

  const reviewDelta = () => {
    open(entry.path);
    useEditorActions.getState().setDiffBase(LAST_READ_BASE);
    useEditorActions.getState().setDiffing(true);
  };

  return (
    <>
      {/* The row-open button and the delta review control are siblings: a button
          may not nest inside another button. */}
      <div
        className={`flex items-stretch ${
          isDropTarget
            ? "bg-[color-mix(in_oklch,var(--accent)_16%,transparent)]"
            : isActive
              ? "bg-selection"
              : "hover:bg-surface"
        } ${isDragged ? "opacity-40" : ""}`}
      >
        <button
          ref={rowRef}
          type="button"
          style={indent(depth)}
          data-dir={dropDir(entry)}
          onPointerDown={onRowPointerDown(entry.path)}
          onClick={onClick}
          onContextMenu={(e) => onContext(entry, e)}
          role="treeitem"
          aria-expanded={entry.isDir ? expanded : undefined}
          title={entry.name}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-[3px] pr-3 text-left text-sm text-ink transition-colors"
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
          <FileIcon isDir={entry.isDir} expanded={expanded} name={entry.name} mode={iconMode} />
          <span
            className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
              dimmed ? "text-muted" : ""
            }`}
          >
            {entry.name}
          </span>
          {entry.isDir && folderRead > 0 && !folderDone && (
            <span
              title={t("tree.readProgress", { read: folderRead, total: folderTotal })}
              className="flex-none pl-1 text-[10px] text-faint tabular-nums"
            >
              {folderRead}/{folderTotal}
            </span>
          )}
          {errorCount > 0 && (
            <span
              title={t("tree.problems", { count: errorCount })}
              className="flex-none pl-1 text-[10px] font-medium text-danger tabular-nums"
            >
              {errorCount}
            </span>
          )}
        </button>
        {hasDelta && (
          <button
            type="button"
            aria-label={t("delta.review")}
            title={t("delta.review")}
            onClick={(e) => {
              e.stopPropagation();
              reviewDelta();
            }}
            className="flex flex-none items-center pr-3 pl-1 text-accent hover:underline"
          >
            <DeltaIcon className="h-[13px] w-[13px]" />
          </button>
        )}
      </div>
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
