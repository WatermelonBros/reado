import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { create } from "zustand"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { ChevronIcon, CloseIcon, DeltaIcon, FileIcon } from "@/components/atoms/icons"
import { AuditDialog, type AuditTarget } from "@/components/organisms/AuditDialog"
import { type CommentTarget, TreeCommentDialog } from "@/components/organisms/TreeCommentDialog"
import { createDir, createFile, type DirEntry, importPaths, listDir, movePath } from "@/lib/api"
import { baseName, toRelative } from "@/lib/comments"
import { useDiagnostics } from "@/lib/diagnostics"
import { nestEntries, nestingRulesFor } from "@/lib/fileNesting"
import { trashAndRecord, useFileUndo } from "@/lib/fileUndo"
import { type FileStatus, folderHasChanges, STATUS, useGitStatus } from "@/lib/gitStatus"
import { notifyError } from "@/lib/notice"
import { dirName, pathSep } from "@/lib/paths"
import { useProjectFiles } from "@/lib/projectFiles"
import { prompt } from "@/lib/prompt"
import { LAST_READ_BASE, useReadProgress } from "@/lib/readProgress"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { filterEntries, sortEntries } from "@/lib/treeSort"
import { removeWorkspaceFolder, rootFor } from "@/lib/workspace"
import {
  dropDir,
  type FileTreeMenuCtx,
  fileTreeMenuItems,
  openWithItems,
} from "./fileTree/fileTreeMenu"
import { ghostAt, useTreeDrag } from "./fileTree/useTreeDrag"
import { useTreeSelection } from "./fileTree/useTreeSelection"

type Ctx = (entry: DirEntry | null, e: React.MouseEvent) => void

/** Per-collection memo for `countPrefix`, keyed on the collection itself.
 *
 * Safe because both backing collections are *replaced* on every change (the file
 * list is a fresh array per load, the read-set a fresh `Set` per mark) — never
 * mutated in place, so a given object's counts can never go stale. If that ever
 * stops holding, this cache is the thing that breaks.
 */
const prefixCounts = new WeakMap<object, Map<string, number>>()

/** How many of `items` (a file list or read-set) sit under `prefix` ("dir/").
 *
 * Memoized because the callers are zustand selectors on an unvirtualized tree:
 * uncached, every visible folder row rescans the whole project (up to 50 000
 * paths) on every render *and* on every write to either store.
 */
const countPrefix = (items: Iterable<string> & object, prefix: string) => {
  let cache = prefixCounts.get(items)
  if (!cache) {
    cache = new Map()
    prefixCounts.set(items, cache)
  }
  const cached = cache.get(prefix)
  if (cached !== undefined) return cached
  let n = 0
  for (const p of items) if (p.startsWith(prefix)) n++
  cache.set(prefix, n)
  return n
}

/** Pointer-drag reorder/move context. HTML5 drag doesn't fire in the Tauri
 *  webview (the OS drop handler owns it), and it also mis-hit-tests under interface
 *  zoom; raw pointer events with `elementFromPoint` are correct at any zoom. */
const RowCtx = createContext<{
  onRowPointerDown: (path: string) => (e: React.PointerEvent) => void
  draggingPath: string | null
  overDir: string | null
  /** Paths in the current multi-selection (⌘/⇧ click), for highlighting. */
  selected: string[]
  /** A row was clicked: decides whether it opens, extends or toggles the
   *  selection. Returns true when the click was a selection gesture and the row
   *  must *not* open. */
  onRowClick: (path: string, e: React.MouseEvent) => boolean
}>({
  onRowPointerDown: () => () => {},
  draggingPath: null,
  overDir: null,
  selected: [],
  onRowClick: () => false,
})

/**
 * The explorer's filter field — whether it is showing, and what it holds.
 *
 * A store rather than local state because the button that opens it lives in the
 * panel header, which is a different component tree.
 */
export const useTreeFilter = create<{
  open: boolean
  text: string
  toggle: () => void
  close: () => void
  setText: (text: string) => void
}>((set) => ({
  open: false,
  text: "",
  // Closing clears: a hidden filter that is still narrowing the tree is a tree
  // that looks broken.
  toggle: () => set((s) => (s.open ? { open: false, text: "" } : { open: true })),
  close: () => set({ open: false, text: "" }),
  setText: (text) => set({ text }),
}))

export function FileTree() {
  const root = useProject((s) => s.root)
  const open = useProject((s) => s.open)
  const showHidden = useProject((s) => s.showHidden)
  const treeNonce = useProject((s) => s.treeNonce)
  const { t } = useTranslation()
  const iconMode = useSettings((s) => s.fileIcons)
  const sortMode = useSettings((s) => s.explorerSort)
  const containerRef = useRef<HTMLDivElement>(null)

  const [menu, setMenu] = useState<{
    x: number
    y: number
    entry: DirEntry | null
    /** Which page of the menu is showing. "openWith" lists the viewers for the
     *  clicked file; the shared ContextMenu has no submenus, and re-opening it
     *  in place beats teaching it hover-intent and nested positioning. */
    view?: "openWith"
  } | null>(null)
  const { selected, setSelected, anchorRef, selectedRef, onRowClick, targetsFor, keyDownWith } =
    useTreeSelection(containerRef)

  // The tree's own clipboard: a cut is a pending move, a copy a pending copy.
  // Deliberately not the system clipboard — pasting a file path into an editor
  // and pasting a file into a folder are different intents.
  const [clip, setClip] = useState<{ paths: string[]; cut: boolean } | null>(null)
  const [target, setTarget] = useState<CommentTarget | null>(null)
  const [audit, setAudit] = useState<AuditTarget | null>(null)
  // The on-screen filter. Narrows the rows the tree lists; finding a file
  // anywhere in the project is ⌘P.
  const filterOpen = useTreeFilter((s) => s.open)
  const filter = useTreeFilter((s) => s.text)
  const setFilter = useTreeFilter((s) => s.setText)
  const closeFilter = useTreeFilter((s) => s.close)
  // "Select for Compare": the file the next "Compare with" diffs against.
  const [compareLeft, setCompareLeft] = useState<string | null>(null)
  // Workspace folders, and which of their headers are collapsed.
  const roots = useProject((s) => s.roots)
  const [collapsedRoots, setCollapsedRoots] = useState<string[]>([])
  const [rootMenu, setRootMenu] = useState<{ x: number; y: number; root: string } | null>(null)

  // Keep the file-list cache and the git decorations fresh. Both are keyed to
  // `treeNonce`, so anything that changes the tree (a save, a delete, an agent
  // writing files) refreshes them together.
  useEffect(() => {
    useProjectFiles.getState().load(root)
  }, [root, treeNonce])
  const isRepo = useProject((s) => s.git.isRepo)
  useEffect(() => {
    if (isRepo) void useGitStatus.getState().refresh(root)
    else useGitStatus.getState().clear()
  }, [root, treeNonce, isRepo])

  // The one move: drag-and-drop into a folder and F2 rename are the same
  // operation with a different destination, undo record included.
  const moveTo = useCallback(
    async (from: string, to: string) => {
      if (from === to) return
      try {
        // The folder that owns the file, not the window's primary one: a move
        // inside the second workspace folder must not be resolved against the
        // first — and its undo has to reach the same folder.
        const owner = rootFor(from)
        await movePath(owner, from, to)
        useProject.getState().renamePath(from, to)
        useFileUndo.getState().record({ kind: "move", root: owner, from, to })
        useProject.getState().bumpTree()
      } catch (e) {
        notifyError("fileTree", t("tree.renameFailed"), e)
      }
    },
    [root, t],
  )

  // Internal drag-and-drop: move a dragged path into a destination folder.
  const move = useCallback(
    async (from: string, destDir: string) => {
      // Moving a folder into itself or its own subtree isn't a move.
      if (destDir === from || destDir.startsWith(from + pathSep(from))) return
      await moveTo(from, `${destDir}${pathSep(destDir)}${baseName(from)}`)
    },
    [moveTo],
  )

  // Rename in place (F2, or the context menu): the name is prompted for, the
  // parent folder stays put.
  const rename = useCallback(
    async (path: string) => {
      const current = baseName(path)
      const name = await prompt({
        title: t("tree.rename"),
        value: current,
        confirmLabel: t("tree.renameConfirm"),
      })
      if (!name || name === current) return
      await moveTo(path, `${dirName(path)}${pathSep(path)}${name}`)
    },
    [moveTo, t],
  )

  const { draggingPath, overDir, onRowPointerDown, dragStart, ghostRef, ptr } = useTreeDrag(move, {
    root,
    containerRef,
    selectedRef,
  })

  /**
   * A row's path, relative to *its own* workspace folder.
   *
   * The tree lists every folder, so the primary root is the right answer only
   * for the rows that happen to live under it.
   */
  const relOf = (p: string) => toRelative(rootFor(p), p)

  // Create a file or folder next to the clicked row (inside it, for a folder).
  const create = async (kind: "file" | "folder", entry: DirEntry | null) => {
    setMenu(null)
    const dir = entry ? dropDir(entry) : root
    const name = await prompt({
      title: t(kind === "file" ? "file.newFile" : "tree.newFolder"),
      placeholder: kind === "file" ? "name.ext" : "name",
      confirmLabel: t("file.create"),
    })
    if (!name) return
    const owner = rootFor(dir)
    const rel = toRelative(owner, `${dir}${pathSep(dir)}${name}`)
    try {
      if (kind === "folder") {
        await createDir(owner, rel)
        useProject.getState().toggleDir(relOf(dir), true)
      } else {
        useProject.getState().open(await createFile(owner, rel))
      }
      useProject.getState().bumpTree()
    } catch (e) {
      notifyError("fileTree", t("tree.createFailed"), e)
    }
  }

  // Paste whatever was cut or copied into the folder the row points at (a file
  // row means its parent, like a drop does).
  const paste = useCallback(
    async (entry: DirEntry | null) => {
      const c = clip
      if (!c) return
      const dir = entry ? dropDir(entry) : root
      if (c.cut) {
        for (const path of c.paths) await move(path, dir)
        setClip(null) // a cut is consumed by its paste; a copy can be pasted again
      } else {
        try {
          await importPaths(rootFor(dir), c.paths, dir)
          useProject.getState().bumpTree()
        } catch (e) {
          notifyError("fileTree", t("tree.pasteFailed"), e)
        }
      }
    },
    [clip, move, root, t],
  )

  /** Copy each path beside itself ("x.ts" → "x 2.ts"); the backend picks the name. */
  const duplicate = useCallback(
    async (paths: string[]) => {
      try {
        // Grouped by folder: one call per destination is all `import_paths` needs.
        for (const dir of new Set(paths.map(dirName))) {
          await importPaths(
            root,
            paths.filter((p) => dirName(p) === dir),
            dir,
          )
        }
        useProject.getState().bumpTree()
      } catch (e) {
        notifyError("fileTree", t("tree.pasteFailed"), e)
      }
    },
    [root, t],
  )

  /** Delete every path in `paths`, each recorded so ⌘Z walks them back. */
  const remove = useCallback(async (paths: string[]) => {
    for (const path of paths) await trashAndRecord(path)
    setSelected((sel) => sel.filter((p) => !paths.includes(p)))
  }, [])

  const onContext: Ctx = (entry, e) => {
    e.preventDefault()
    e.stopPropagation()
    // Right-clicking a row outside the selection acts on that row alone — the
    // selection follows the pointer rather than the menu quietly hitting ten
    // files you can no longer see.
    if (entry && !selected.includes(entry.path)) {
      setSelected([entry.path])
      anchorRef.current = entry.path
    }
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const openComment = (kind: CommentTarget["kind"], path = "") => {
    setMenu(null)
    setTarget({ kind, path })
  }

  const menuCtx: FileTreeMenuCtx = {
    t,
    close: () => setMenu(null),
    setOpenWithPage: (on) =>
      menu &&
      setMenu({ x: menu.x, y: menu.y, entry: menu.entry, view: on ? "openWith" : undefined }),
    relOf,
    targetsFor,
    clip,
    setClip,
    compareLeft,
    setCompareLeft,
    sortMode,
    open,
    openComment,
    setAudit,
    rename,
    paste,
    duplicate,
    remove,
    create,
  }
  const menuItems: ContextMenuItem[] =
    menu?.view === "openWith" && menu.entry
      ? openWithItems(menu.entry, menuCtx)
      : menu
        ? fileTreeMenuItems(menu.entry, menuCtx)
        : []

  const onTreeKeyDown = keyDownWith({ relOf, setClip, paste, duplicate, remove, rename })

  return (
    <RowCtx.Provider value={{ onRowPointerDown, draggingPath, overDir, selected, onRowClick }}>
      <div className="flex h-full flex-col overflow-hidden">
        {filterOpen && (
          <div className="flex-none border-b border-line px-2 py-1.5">
            <Input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeFilter()
              }}
              placeholder={t("tree.filterPlaceholder")}
              className="h-6 text-xs"
              trailing={
                filter ? (
                  <IconButton
                    size="xxs"
                    label={t("search.clearScope")}
                    icon={<CloseIcon className="h-3 w-3" />}
                    onClick={() => setFilter("")}
                  />
                ) : undefined
              }
            />
          </div>
        )}
        <div
          ref={containerRef}
          role="tree"
          data-dir={root}
          className="flex-1 overflow-y-auto py-2"
          onContextMenu={(e) => onContext(null, e)}
          onKeyDown={onTreeKeyDown}
        >
          {/* One listing per workspace folder. With a single folder — the
                usual case — the header is left off entirely, so the tree looks
                exactly as it always did. */}
          {(roots.length > 0 ? roots : [root]).map((folder) => (
            <div key={folder}>
              {roots.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedRoots((c) =>
                      c.includes(folder) ? c.filter((r) => r !== folder) : [...c, folder],
                    )
                  }
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setRootMenu({ x: e.clientX, y: e.clientY, root: folder })
                  }}
                  title={folder}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] font-semibold tracking-wide text-faint uppercase hover:text-ink"
                >
                  <ChevronIcon
                    className={`h-3 w-3 flex-none transition-transform ${
                      collapsedRoots.includes(folder) ? "" : "rotate-90"
                    }`}
                  />
                  {baseName(folder)}
                </button>
              )}
              {!collapsedRoots.includes(folder) && (
                /* `key` forces a full reload of the tree when the toggle flips. */
                <DirChildren
                  key={`${folder}:${String(showHidden)}`}
                  root={folder}
                  dir={folder}
                  depth={0}
                  showHidden={showHidden}
                  treeNonce={treeNonce}
                  onContext={onContext}
                  onMove={move}
                />
              )}
            </div>
          ))}
        </div>

        {/* What you are dragging, under the cursor — otherwise a drop onto the
            terminal is a blind gesture. */}
        {draggingPath && (
          <div
            ref={ghostRef}
            style={{ transform: ghostAt(ptr.current.x, ptr.current.y) }}
            className="pointer-events-none fixed top-0 left-0 z-[200] flex max-w-[240px] items-center gap-1.5 overflow-hidden rounded-md border border-line bg-overlay px-2 py-1 text-xs whitespace-nowrap text-ink text-ellipsis shadow-[var(--shadow)]"
          >
            <FileIcon
              isDir={dragStart.current?.isDir ?? false}
              name={baseName(draggingPath)}
              mode={iconMode}
            />
            {baseName(draggingPath)}
            {selected.includes(draggingPath) && selected.length > 1
              ? ` +${selected.length - 1}`
              : ""}
          </div>
        )}

        {menu && (
          <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
        )}

        {rootMenu && (
          <ContextMenu
            x={rootMenu.x}
            y={rootMenu.y}
            items={[
              {
                label: collapsedRoots.includes(rootMenu.root)
                  ? t("workspace.expandFolder")
                  : t("workspace.collapseFolder"),
                onSelect: () =>
                  setCollapsedRoots((c) =>
                    c.includes(rootMenu.root)
                      ? c.filter((r) => r !== rootMenu.root)
                      : [...c, rootMenu.root],
                  ),
              },
              {
                label: t("workspace.removeFolder"),
                separatorBefore: true,
                // The primary folder owns the workspace file and the
                // annotations; removing it is "close project", not this.
                disabled: rootMenu.root === root,
                danger: true,
                onSelect: () => void removeWorkspaceFolder(rootMenu.root),
              },
            ]}
            onClose={() => setRootMenu(null)}
          />
        )}
        <TreeCommentDialog target={target} onClose={() => setTarget(null)} />
        <AuditDialog target={audit} onClose={() => setAudit(null)} />
      </div>
    </RowCtx.Provider>
  )
}

interface DirChildrenProps {
  root: string
  dir: string
  depth: number
  showHidden: boolean
  treeNonce: number
  onContext: Ctx
  onMove: (from: string, destDir: string) => void
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
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const sortMode = useSettings((s) => s.explorerSort)
  const nestingOn = useSettings((s) => s.fileNesting)
  const nestingRules = useSettings((s) => s.fileNestingRules)
  const filter = useTreeFilter((s) => s.text)
  const { t } = useTranslation()

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    listDir(root, dir, showHidden)
      .then((e) => !cancelled && setEntries(e))
      // A read failure must stay distinguishable from a genuinely empty folder:
      // flag the error so we don't render `tree.empty` as if the load succeeded.
      .catch(() => {
        if (cancelled) return
        setEntries([])
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [root, dir, showHidden, treeNonce])

  // Sorting, filtering and nesting are pure functions of these five things, and
  // the tree is not virtualised — without the memo, expanding one folder redid
  // all of it for every other folder on screen.
  const shown = useMemo(
    () =>
      entries
        ? sortEntries(
            filterEntries(entries, filter, (e) =>
              useProject.getState().expandedDirs.includes(toRelative(root, e.path)),
            ),
            sortMode,
          )
        : [],
    [entries, filter, sortMode, root],
  )
  // Nesting runs after the filter: a search for "lock" has to be able to find a
  // file that is normally tucked away, not hide it twice over.
  const nested = useMemo(
    () => nestEntries(shown, nestingOn && !filter ? nestingRulesFor(nestingRules) : []),
    [shown, nestingOn, filter, nestingRules],
  )

  if (entries === null) {
    return (
      <div className="px-4 py-2 text-xs text-faint" style={indent(depth)}>
        {t("common.loading")}
      </div>
    )
  }
  if (failed) {
    return (
      <div className="px-4 py-2 text-xs text-faint" style={indent(depth)}>
        {t("tree.readError")}
      </div>
    )
  }
  if (entries.length === 0 && depth === 0) {
    return <div className="px-4 py-2 text-xs text-faint">{t("tree.empty")}</div>
  }
  if (shown.length === 0 && depth === 0) {
    return <div className="px-4 py-2 text-xs text-faint">{t("tree.noFilterMatch")}</div>
  }
  return (
    <>
      {nested.map(({ entry, children }) => (
        <TreeNode
          key={entry.path}
          root={root}
          entry={entry}
          nested={children}
          depth={depth}
          showHidden={showHidden}
          treeNonce={treeNonce}
          onContext={onContext}
          onMove={onMove}
        />
      ))}
    </>
  )
}

const indent = (depth: number) => ({ paddingLeft: `${depth * 14 + 8}px` })

function TreeNode({
  root,
  entry,
  nested = [],
  depth,
  showHidden,
  treeNonce,
  onContext,
  onMove,
}: {
  root: string
  entry: DirEntry
  /** Files tucked under this one by the nesting rules. Empty for a folder, and
   *  whenever nesting is off. */
  nested?: DirEntry[]
  depth: number
  showHidden: boolean
  treeNonce: number
  onContext: Ctx
  onMove: (from: string, destDir: string) => void
}) {
  const { onRowPointerDown, draggingPath, overDir, selected, onRowClick } = useContext(RowCtx)
  const rowRef = useRef<HTMLButtonElement>(null)
  const { t } = useTranslation()
  const open = useProject((s) => s.open)
  const active = useProject((s) => s.active)
  // Primitive selector → re-renders only when the icon mode actually flips.
  const iconMode = useSettings((s) => s.fileIcons)
  // Expansion lives in the store (persisted per project), keyed by the same
  // project-relative path the tree uses elsewhere, so a reopen restores it and
  // collapse-all (which clears expandedDirs) collapses everything.
  const relPath = toRelative(root, entry.path)
  // A nested parent expands too, on the same list as a folder — one idea of
  // "this row is open", so ⌘K-collapse-all and the arrow keys both work on it.
  const expanded = useProject(
    (s) => (entry.isDir || nested.length > 0) && s.expandedDirs.includes(relPath),
  )

  // Reveal the open file: ancestor folders auto-expand (the chain cascades as
  // each level mounts), and the active row scrolls into view.
  useEffect(() => {
    if (entry.isDir && active?.startsWith(entry.path + pathSep(entry.path))) {
      useProject.getState().toggleDir(relPath, true)
    }
  }, [active, entry.isDir, entry.path, relPath])
  const isActive = !entry.isDir && active === entry.path
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: "nearest" })
  }, [isActive])
  // Read files are dimmed (a quiet reading-progress cue).
  const isRead = useReadProgress((s) => !entry.isDir && s.read.has(relPath))
  // Per-folder aggregate: how many files under this folder have been read.
  // Selectors short-circuit for files so file rows never scan the lists.
  const folderTotal = useProjectFiles((s) =>
    entry.isDir ? countPrefix(s.files, `${relPath}/`) : 0,
  )
  const folderRead = useReadProgress((s) => (entry.isDir ? countPrefix(s.read, `${relPath}/`) : 0))
  // A fully-read folder dims like a read file; a partially-read one shows a quiet
  // count. Empty/untouched folders stay neutral (no zero-noise on every row).
  const folderDone = entry.isDir && folderTotal > 0 && folderRead >= folderTotal
  const dimmed = entry.isDir ? folderDone : isRead
  // Error count from the language server — a quiet trailing count, not a loud
  // red filename (and honest: its absence means "none found", not "clean").
  const errorCount = useDiagnostics((s) => (entry.isDir ? 0 : (s.errors[entry.path] ?? 0)))
  // A read file that changed externally has a delta to review.
  const hasDelta = useReadProgress((s) => !entry.isDir && s.changed.has(relPath))
  // Git decoration: the file's own status, or — for a folder — whether anything
  // inside it differs from HEAD, so a change is visible without expanding.
  const gitStatus = useGitStatus((s) =>
    entry.isDir ? undefined : (s.byPath[relPath] as FileStatus | undefined),
  )
  const folderChanged = useGitStatus((s) => entry.isDir && folderHasChanges(s.byPath, relPath))
  const isDirty = useEditorActions((s) => !entry.isDir && s.dirtyPaths.includes(relPath))

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // A ⌘/⇧ click is a selection gesture, not an open: extending a selection
      // must not also load five files into the editor.
      if (onRowClick(entry.path, e)) return
      if (entry.isDir) useProject.getState().toggleDir(relPath)
      // Browsing previews; naming opens. Clicking through a folder is browsing,
      // so the tab is a preview the next click replaces — a double-click (below)
      // is how you say you meant it.
      else useProject.getState().openPreview(entry.path)
    },
    [entry, relPath, onRowClick],
  )
  const isSelected = selected.includes(entry.path)

  const isDragged = draggingPath === entry.path
  // Highlight the destination folder row (the one files would move into).
  const isDropTarget = draggingPath !== null && entry.isDir && entry.path === overDir

  const reviewDelta = () => {
    open(entry.path)
    useEditorActions.getState().setDiffBase(LAST_READ_BASE)
    // Through the request queue, not by setting the flag: opening the file
    // resets the pane to its default view a moment later, which would wipe it.
    useEditorActions.getState().requestView("diff")
  }

  return (
    <>
      {/* The row-open button and the delta review control are siblings: a button
          may not nest inside another button. */}
      <div
        className={`flex items-stretch ${
          isDropTarget
            ? "bg-[color-mix(in_oklch,var(--accent)_16%,transparent)]"
            : isSelected || isActive
              ? "bg-selection"
              : "hover:bg-surface"
        } ${isDragged ? "opacity-40" : ""}`}
      >
        {/* A nested parent is still a file: clicking it opens the file, and the
            twistie beside it is what expands the nest. Two jobs, two controls —
            and a button can't live inside another button. */}
        {!entry.isDir && nested.length > 0 && (
          <button
            type="button"
            onClick={() => useProject.getState().toggleDir(relPath)}
            aria-label={t(expanded ? "tree.collapseNest" : "tree.expandNest")}
            style={indent(depth)}
            className="flex flex-none items-center pr-0 pl-0"
          >
            <ChevronIcon
              className={`h-[13px] w-[13px] flex-none text-faint transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
            />
          </button>
        )}
        <button
          ref={rowRef}
          type="button"
          style={!entry.isDir && nested.length > 0 ? undefined : indent(depth)}
          data-dir={dropDir(entry)}
          data-path={entry.path}
          onPointerDown={onRowPointerDown(entry.path)}
          onClick={onClick}
          onDoubleClick={() => !entry.isDir && open(entry.path)}
          onContextMenu={(e) => onContext(entry, e)}
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={entry.isDir || nested.length > 0 ? expanded : undefined}
          title={relPath}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-[3px] pr-3 text-left text-sm text-ink transition-colors"
        >
          {entry.isDir ? (
            <ChevronIcon
              className={`h-[13px] w-[13px] flex-none text-faint transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
            />
          ) : nested.length > 0 ? null : (
            <span className="w-[13px] flex-none" />
          )}
          <FileIcon isDir={entry.isDir} expanded={expanded} name={entry.name} mode={iconMode} />
          <span
            className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
              // Never dim the row you are on. A read file is dimmed to say "you
              // have been here", but the selection tint lightens the background
              // under it, and muted ink on that came out at 3.9:1 — under the
              // 4.5 Reado holds its own themes to. The row you selected is also
              // the one you most need to read.
              dimmed && !gitStatus && !(isSelected || isActive) ? "text-muted" : ""
            }`}
            style={gitStatus ? { color: STATUS[gitStatus].color } : undefined}
          >
            {entry.name}
          </span>
          {/* Unsaved edits, on the row as well as on the tab: the tree is where
              you look for "what is in flight", and git status can't show it. */}
          {isDirty && (
            <span
              role="img"
              title={t("tree.unsaved")}
              aria-label={t("tree.unsaved")}
              className="ml-1 h-1.5 w-1.5 flex-none rounded-full bg-accent"
            />
          )}
          {gitStatus && (
            <span
              title={t(`git.status.${gitStatus}`)}
              className="flex-none pl-1 text-[10px] font-semibold"
              style={{ color: STATUS[gitStatus].color }}
            >
              {STATUS[gitStatus].letter}
            </span>
          )}
          {folderChanged && (
            <span
              role="img"
              title={t("git.folderChanged")}
              aria-label={t("git.folderChanged")}
              className="ml-1 h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: STATUS.modified.color }}
            />
          )}
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
          <IconButton
            size="xxs"
            label={t("delta.review")}
            icon={<DeltaIcon className="h-[13px] w-[13px]" />}
            onClick={(e) => {
              e.stopPropagation()
              reviewDelta()
            }}
            className="mr-2 text-accent"
          />
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
      {/* Nested files are already listed; they only need indenting under their
          parent, not another directory read. */}
      {!entry.isDir &&
        expanded &&
        nested.map((child) => (
          <TreeNode
            key={child.path}
            root={root}
            entry={child}
            depth={depth + 1}
            showHidden={showHidden}
            treeNonce={treeNonce}
            onContext={onContext}
            onMove={onMove}
          />
        ))}
    </>
  )
}
