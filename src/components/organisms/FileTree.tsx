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

import { getCurrentWebview } from "@tauri-apps/api/webview"
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { create } from "zustand"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import {
  ChevronIcon,
  CloseIcon,
  DeltaIcon,
  EditIcon,
  FileIcon,
  LayoutIcon,
  MessageIcon,
  SparkleIcon,
  TrashIcon,
} from "@/components/atoms/icons"
import { AuditDialog, type AuditTarget } from "@/components/organisms/AuditDialog"
import { type CommentTarget, TreeCommentDialog } from "@/components/organisms/TreeCommentDialog"
import {
  createDir,
  createFile,
  type DirEntry,
  importPaths,
  listDir,
  listFiles,
  movePath,
} from "@/lib/api"
import { baseName, toRelative } from "@/lib/comments"
import { useDiagnostics } from "@/lib/diagnostics"
import { compareWithSaved } from "@/lib/docInfo"
import { nestEntries, nestingRulesFor } from "@/lib/fileNesting"
import { trashAndRecord, useFileUndo } from "@/lib/fileUndo"
import { type FileStatus, folderHasChanges, STATUS, useGitStatus } from "@/lib/gitStatus"
import { notifyError } from "@/lib/notice"
import { prompt } from "@/lib/prompt"
import { LAST_READ_BASE, useReadProgress } from "@/lib/readProgress"
import { FILE_BASE, useEditorActions, useProject, useSettings, useWorkspace } from "@/lib/store"
import { dropPathsIntoTerminal, useTerminals } from "@/lib/terminals"
import { useTextView } from "@/lib/textView"
import { filterEntries, sortEntries } from "@/lib/treeSort"
import { revealAppName } from "@/lib/window"
import { removeWorkspaceFolder, rootFor } from "@/lib/workspace"

type Ctx = (entry: DirEntry | null, e: React.MouseEvent) => void

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
}))

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

/** Files Reado renders as something other than code, and so can be opened either
 *  way ("Open With ▸ Editor / Preview"). */
const hasPreview = (p: string) =>
  /\.(md|markdown|mdx|svg|png|jpe?g|gif|webp|bmp|ico|avif|pdf)$/i.test(p)
const sep = (p: string) => (p.includes("\\") ? "\\" : "/")
const parentOf = (p: string) => p.slice(0, p.lastIndexOf(sep(p)))
/** The drag label sits just below-right of the cursor, clear of the pointer. */
const ghostAt = (x: number, y: number) => `translate(${x + 14}px, ${y + 12}px)`

/** Where a row drops into: a folder takes its own path, a file its parent dir. */
const dropDir = (entry: DirEntry) => (entry.isDir ? entry.path : parentOf(entry.path))

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
  // Multi-selection: ⌘/Ctrl+click toggles a row, ⇧+click takes the range from
  // the anchor. Empty means "just whatever row you act on", which is what a
  // plain click leaves behind.
  const [selected, setSelected] = useState<string[]>([])
  const anchorRef = useRef<string | null>(null)
  // The window-level pointer handlers are re-bound only when a drag starts, so
  // they read the selection through a ref rather than a stale closure.
  const selectedRef = useRef(selected)
  selectedRef.current = selected

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
      if (destDir === from || destDir.startsWith(from + sep(from))) return
      await moveTo(from, `${destDir}${sep(destDir)}${baseName(from)}`)
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
      await moveTo(path, `${parentOf(path)}${sep(path)}${name}`)
    },
    [moveTo, t],
  )

  // Pointer-based drag to move a file/folder into another folder. Press a row,
  // move past a small threshold, and release over a destination folder.
  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const [overDir, setOverDir] = useState<string | null>(null)
  const dragStart = useRef<{ path: string; x: number; y: number; isDir: boolean } | null>(null)
  // The label that follows the cursor while dragging. It is moved by writing the
  // transform directly (a re-render per pointer move would be visible lag), so
  // the last pointer position is kept in a ref for the first frame too.
  const ghostRef = useRef<HTMLDivElement>(null)
  const ptr = useRef({ x: 0, y: 0 })

  const onRowPointerDown = useCallback(
    (path: string) => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      // `data-dir` is the row's own path for a folder, its parent for a file —
      // so the row already says which one it is; no extra prop to thread down.
      const isDir = e.currentTarget.getAttribute("data-dir") === path
      dragStart.current = { path, x: e.clientX, y: e.clientY, isDir }
    },
    [],
  )

  useEffect(() => {
    const destAt = (x: number, y: number) =>
      document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-dir]")
        ?.getAttribute("data-dir") ?? null
    const onPointerMove = (e: PointerEvent) => {
      const s = dragStart.current
      if (!s) return
      if (!draggingPath) {
        if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < 5) return
        setDraggingPath(s.path)
      }
      ptr.current = { x: e.clientX, y: e.clientY }
      if (ghostRef.current) ghostRef.current.style.transform = ghostAt(e.clientX, e.clientY)
      setOverDir(destAt(e.clientX, e.clientY))
    }
    const onPointerUp = (e: PointerEvent) => {
      const s = dragStart.current
      dragStart.current = null
      const wasDragging = draggingPath
      setDraggingPath(null)
      setOverDir(null)
      if (!s || !wasDragging) return
      // Swallow the trailing click so releasing a drag doesn't also open the file.
      const stopClick = (ev: Event) => {
        ev.stopPropagation()
        ev.preventDefault()
        window.removeEventListener("click", stopClick, true)
      }
      window.addEventListener("click", stopClick, true)
      const dest = destAt(e.clientX, e.clientY)
      // Dragging a row that is part of the selection drags the whole selection.
      const dragged = selectedRef.current.includes(s.path) ? selectedRef.current : [s.path]
      if (dest) void Promise.all(dragged.map((p) => move(p, dest)))
      // Dropped outside the tree: if a terminal is under the cursor, type the
      // paths there instead — that's how you hand files to an agent in the PTY.
      else dropPathsIntoTerminal(e.clientX, e.clientY, dragged)
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [draggingPath, move])

  // While a row is in flight the grabbing cursor wins everywhere — including
  // over the terminal and the editor, which set cursors of their own.
  useEffect(() => {
    if (!draggingPath) return
    document.documentElement.setAttribute("data-dragging-file", "")
    return () => document.documentElement.removeAttribute("data-dragging-file")
  }, [draggingPath])

  // External drag-and-drop: OS file drops are delivered by Tauri (not HTML5),
  // with a physical-pixel position. Resolve the folder under the cursor and copy
  // the dropped paths into it; ignore drops outside the tree.
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return
      const tree = containerRef.current
      if (!tree) return
      const dpr = window.devicePixelRatio || 1
      const { x, y } = event.payload.position
      const el = document.elementFromPoint(x / dpr, y / dpr)
      if (!el || !tree.contains(el)) return
      const destDir = el.closest("[data-dir]")?.getAttribute("data-dir") || root
      importPaths(rootFor(destDir), event.payload.paths, destDir)
        .then(() => useProject.getState().bumpTree())
        .catch(() => {})
    })
    return () => {
      // FileTree unmounts on every tool switch; swallow a rejecting unlisten so
      // it doesn't surface as an unhandled rejection.
      void un.then((f) => f()).catch(() => {})
    }
  }, [root])

  // Keyboard on the tree, like VS Code's explorer: F2 renames, Delete (⌘⌫ on
  // macOS) deletes, arrows walk and open/close rows. The focused row is the
  // event's own target, so no separate selection state has to be kept in sync.
  const onRowClick = useCallback((path: string, e: React.MouseEvent): boolean => {
    if (e.metaKey || e.ctrlKey) {
      setSelected((sel) => (sel.includes(path) ? sel.filter((p) => p !== path) : [...sel, path]))
      anchorRef.current = path
      return true
    }
    if (e.shiftKey) {
      const rows = [
        ...(containerRef.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []),
      ].map((r) => r.dataset.path ?? "")
      const from = rows.indexOf(anchorRef.current ?? path)
      const to = rows.indexOf(path)
      if (from !== -1 && to !== -1) {
        setSelected(rows.slice(Math.min(from, to), Math.max(from, to) + 1))
        return true
      }
    }
    // A plain click collapses the selection to this row and opens it as before.
    setSelected([path])
    anchorRef.current = path
    return false
  }, [])

  /** The paths an action should apply to: the whole selection when the row acted
   *  on is part of it, otherwise just that row. Right-clicking outside the
   *  selection acts on what you right-clicked — never silently on ten files. */
  const targetsFor = useCallback(
    (path: string) => (selected.includes(path) && selected.length > 1 ? selected : [path]),
    [selected],
  )

  /** The rows currently on screen, in display order — collapsed folders' children
   *  aren't rendered, so this is exactly what the arrows should walk. */
  const visibleRows = () => [
    ...(containerRef.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []),
  ]

  const onTreeKeyDown = (e: React.KeyboardEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]")
    const path = row?.dataset.path
    if (!path) return
    const isDir = row?.getAttribute("aria-expanded") !== null
    const expanded = row?.getAttribute("aria-expanded") === "true"
    const mod = e.metaKey || e.ctrlKey
    if (mod && ["x", "c", "v", "d"].includes(e.key.toLowerCase())) {
      e.preventDefault()
      const entry: DirEntry = { name: baseName(path), path, isDir }
      if (e.key.toLowerCase() === "x") setClip({ paths: targetsFor(path), cut: true })
      else if (e.key.toLowerCase() === "c") setClip({ paths: targetsFor(path), cut: false })
      else if (e.key.toLowerCase() === "v") void paste(entry)
      else void duplicate(targetsFor(path))
      return
    }
    if (e.key === "F2") {
      e.preventDefault()
      void rename(path)
    } else if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      void remove(targetsFor(path))
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const rows = visibleRows()
      const next = rows.indexOf(row!) + (e.key === "ArrowDown" ? 1 : -1)
      const target = rows[next]
      if (!target) return
      target.focus()
      // Shift extends the selection as you walk; otherwise the selection is
      // simply wherever you are.
      if (e.shiftKey) {
        const from = rows.indexOf(
          rows.find((r) => r.dataset.path === anchorRef.current) ?? (row as HTMLElement),
        )
        setSelected(
          rows
            .slice(Math.min(from, next), Math.max(from, next) + 1)
            .map((r) => r.dataset.path ?? ""),
        )
      } else {
        setSelected([target.dataset.path ?? ""])
        anchorRef.current = target.dataset.path ?? null
      }
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault()
      const rows = visibleRows()
      ;(e.key === "Home" ? rows[0] : rows[rows.length - 1])?.focus()
    } else if (e.key.length === 1 && !mod && !e.altKey) {
      // Type-ahead: a letter jumps to the next row whose name starts with it,
      // wrapping — how every file list has worked since Finder.
      const rows = visibleRows()
      const from = rows.indexOf(row!) + 1
      const wanted = e.key.toLowerCase()
      const hit = [...rows.slice(from), ...rows.slice(0, from)].find((r) =>
        (baseName(r.dataset.path ?? "") || "").toLowerCase().startsWith(wanted),
      )
      if (hit) {
        e.preventDefault()
        hit.focus()
      }
    } else if (e.key === "ArrowRight" && isDir && !expanded) {
      e.preventDefault()
      useProject.getState().toggleDir(relOf(path), true)
    } else if (e.key === "ArrowLeft" && isDir && expanded) {
      e.preventDefault()
      useProject.getState().toggleDir(relOf(path), false)
    }
  }

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
    const rel = toRelative(owner, `${dir}${sep(dir)}${name}`)
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
        for (const dir of new Set(paths.map(parentOf))) {
          await importPaths(
            root,
            paths.filter((p) => parentOf(p) === dir),
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

  /** The "Open With ▸" page: the viewers that actually apply to this file. */
  const openWithItems = (entry: DirEntry): ContextMenuItem[] => {
    const asText = useTextView.getState().force.has(entry.path)
    const openWith = (viewer: "text" | "preview" | "diff") => () => {
      setMenu(null)
      useTextView.getState().setText(entry.path, viewer === "text")
      if (viewer === "diff") useEditorActions.getState().requestView("diff")
      open(entry.path)
    }
    return [
      {
        label: t("tree.openWithBack"),
        keepOpen: true,
        onSelect: () => setMenu((m) => (m ? { ...m, view: undefined } : m)),
      },
      {
        label: t("tree.viewerText"),
        checked: asText,
        separatorBefore: true,
        onSelect: openWith("text"),
      },
      // Only offered where there *is* a rich rendering to fall back to; for a
      // plain .ts file "Preview" would just be the editor under another name.
      ...(hasPreview(entry.path)
        ? [{ label: t("tree.viewerPreview"), checked: !asText, onSelect: openWith("preview") }]
        : []),
      ...(useProject.getState().git.isRepo
        ? [{ label: t("tree.viewerDiff"), onSelect: openWith("diff") }]
        : []),
    ]
  }

  const menuItems: ContextMenuItem[] =
    menu?.view === "openWith" && menu.entry
      ? openWithItems(menu.entry)
      : menu
        ? [
            ...(menu.entry
              ? [
                  {
                    label: t(menu.entry.isDir ? "tree.commentFolder" : "tree.commentFile"),
                    icon: <MessageIcon className="h-3.5 w-3.5" />,
                    onSelect: () =>
                      openComment(menu.entry!.isDir ? "folder" : "file", relOf(menu.entry!.path)),
                  },
                  {
                    label: t("tree.audit"),
                    icon: <SparkleIcon className="h-3.5 w-3.5" />,
                    onSelect: () => {
                      setAudit({
                        path: relOf(menu.entry!.path),
                        isDir: menu.entry!.isDir,
                      })
                      setMenu(null)
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
                      useProject.getState().openSplit(menu.entry!.path)
                      setMenu(null)
                    },
                  },
                  {
                    label: useReadProgress.getState().read.has(relOf(menu.entry.path))
                      ? t("tree.markUnread")
                      : t("tree.markRead"),
                    onSelect: () => {
                      const relP = relOf(menu.entry!.path)
                      const isRead = useReadProgress.getState().read.has(relP)
                      useReadProgress.getState().mark(rootFor(menu.entry!.path), relP, !isRead)
                      setMenu(null)
                    },
                  },
                ]
              : []),
            ...(() => {
              if (!menu.entry?.isDir) return []
              // Only offer the direction that would actually change something: a
              // folder with everything already read shouldn't offer "mark read", an
              // all-unread (or empty) folder shouldn't offer "mark unread".
              const folderOwner = rootFor(menu.entry.path)
              const folderRel = relOf(menu.entry.path)
              const files = useProjectFiles
                .getState()
                .files.filter((f) => f.startsWith(`${folderRel}/`))
              if (files.length === 0) return []
              const read = useReadProgress.getState().read
              const someUnread = files.some((f) => !read.has(f))
              const someRead = files.some((f) => read.has(f))
              const mark = (value: boolean) => {
                useReadProgress.getState().markMany(folderOwner, files, value)
                setMenu(null)
              }
              return [
                ...(someUnread
                  ? [{ label: t("tree.markFolderRead"), onSelect: () => mark(true) }]
                  : []),
                ...(someRead
                  ? [{ label: t("tree.markFolderUnread"), onSelect: () => mark(false) }]
                  : []),
              ]
            })(),
            ...(menu.entry && !menu.entry.isDir && /\.svg$/i.test(menu.entry.path)
              ? [
                  {
                    label: t("tree.openAsText"),
                    icon: <EditIcon className="h-3.5 w-3.5" />,
                    onSelect: () => {
                      useTextView.getState().openAsText(menu.entry!.path)
                      open(menu.entry!.path)
                      setMenu(null)
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
                      useTextView.getState().openAsText(menu.entry!.path)
                      open(menu.entry!.path)
                      setMenu(null)
                    },
                  },
                ]
              : []),
            ...(menu.entry
              ? [
                  {
                    label: t("tree.reveal", { app: revealAppName() }),
                    onSelect: () => {
                      void revealItemInDir(menu.entry!.path)
                      setMenu(null)
                    },
                  },
                ]
              : []),
            ...(menu.entry
              ? [
                  {
                    label: t("tree.rename"),
                    icon: <EditIcon className="h-3.5 w-3.5" />,
                    separatorBefore: true,
                    onSelect: () => {
                      const path = menu.entry!.path
                      setMenu(null)
                      void rename(path)
                    },
                  },
                ]
              : []),
            ...(menu.entry && !menu.entry.isDir
              ? [
                  {
                    // Two-file compare, the pair VS Code puts here: pick one
                    // file, then pick the other. The chosen file survives folder
                    // navigation, which is the point — the two rarely sit
                    // side by side.
                    label: t("tree.selectForCompare"),
                    separatorBefore: true,
                    onSelect: () => {
                      setCompareLeft(relOf(menu.entry!.path))
                      setMenu(null)
                    },
                  },
                  ...(compareLeft && compareLeft !== relOf(menu.entry.path)
                    ? [
                        {
                          label: t("tree.compareWithSelected", { name: baseName(compareLeft) }),
                          onSelect: () => {
                            const actions = useEditorActions.getState()
                            const path = menu.entry!.path
                            setMenu(null)
                            // Open the right-hand file, then diff it against the
                            // one picked earlier. The base is a path sentinel, so
                            // the diff view resolves it the same way it resolves
                            // "saved" or a git ref.
                            open(path)
                            actions.setCompareBuffer(null)
                            actions.setDiffBase(`${FILE_BASE}${compareLeft}`)
                            // Through the request queue, not by setting the flag:
                            // opening the file resets the pane to its default
                            // view a moment later, which wiped a flag set here
                            // and left you looking at the file with no diff.
                            actions.requestView("diff")
                          },
                        },
                      ]
                    : []),
                ]
              : []),
            ...(menu.entry?.isDir
              ? [
                  {
                    label: t("tree.findInFolder"),
                    separatorBefore: true,
                    onSelect: () => {
                      setMenu(null)
                      useWorkspace.getState().setSearchScope(relOf(menu.entry!.path))
                      useWorkspace.getState().selectTool("search")
                    },
                  },
                ]
              : []),
            ...(menu.entry &&
            !menu.entry.isDir &&
            useEditorActions.getState().isDirty(relOf(menu.entry.path))
              ? [
                  {
                    label: t("diff.compareWithSaved"),
                    separatorBefore: true,
                    onSelect: () => {
                      const path = menu.entry!.path
                      setMenu(null)
                      // The buffer only exists while that file is the open one.
                      if (useProject.getState().active === path) compareWithSaved()
                      else open(path)
                    },
                  },
                ]
              : []),
            ...(menu.entry && !menu.entry.isDir
              ? [
                  {
                    label: t("tree.openWith"),
                    separatorBefore: true,
                    onSelect: () => {
                      const at = { x: menu.x, y: menu.y, entry: menu.entry }
                      setMenu({ ...at, view: "openWith" })
                    },
                  },
                ]
              : []),
            ...(menu.entry
              ? [
                  {
                    label: t("tree.openInTerminal"),
                    separatorBefore: true,
                    onSelect: () => {
                      const dir = dropDir(menu.entry!)
                      setMenu(null)
                      const terminals = useTerminals.getState()
                      terminals.add(dir)
                      terminals.toggle(true)
                    },
                  },
                ]
              : []),
            ...(menu.entry
              ? [
                  {
                    label: t("tree.cut"),
                    separatorBefore: true,
                    onSelect: () => {
                      setClip({ paths: targetsFor(menu.entry!.path), cut: true })
                      setMenu(null)
                    },
                  },
                  {
                    label: t("tree.copy"),
                    onSelect: () => {
                      setClip({ paths: targetsFor(menu.entry!.path), cut: false })
                      setMenu(null)
                    },
                  },
                ]
              : []),
            ...(clip
              ? [
                  {
                    label: t("tree.paste"),
                    separatorBefore: !menu.entry,
                    onSelect: () => {
                      const entry = menu.entry
                      setMenu(null)
                      void paste(entry)
                    },
                  },
                ]
              : []),
            ...(menu.entry
              ? [
                  {
                    label: t("tree.duplicate"),
                    onSelect: () => {
                      const paths = targetsFor(menu.entry!.path)
                      setMenu(null)
                      void duplicate(paths)
                    },
                  },
                ]
              : []),
            {
              label: t("file.newFile"),
              separatorBefore: !menu.entry,
              onSelect: () => void create("file", menu.entry),
            },
            {
              label: t("tree.newFolder"),
              onSelect: () => void create("folder", menu.entry),
            },
            ...(menu.entry
              ? [
                  {
                    label: t("tree.copyPath"),
                    separatorBefore: true,
                    onSelect: () => {
                      void clipboardWriteText(menu.entry!.path).catch(() => {})
                      setMenu(null)
                    },
                  },
                  {
                    label: t("tree.copyRelativePath"),
                    onSelect: () => {
                      void clipboardWriteText(relOf(menu.entry!.path)).catch(() => {})
                      setMenu(null)
                    },
                  },
                ]
              : []),
            ...(menu.entry
              ? [
                  {
                    label:
                      targetsFor(menu.entry.path).length > 1
                        ? t("tree.deleteMany", { count: targetsFor(menu.entry.path).length })
                        : t("tree.delete"),
                    icon: <TrashIcon className="h-3.5 w-3.5" />,
                    danger: true,
                    separatorBefore: true,
                    onSelect: () => {
                      const paths = targetsFor(menu.entry!.path)
                      setMenu(null)
                      void remove(paths)
                    },
                  },
                ]
              : []),
            ...(["name", "type", "modified"] as const).map((mode, i) => ({
              label: `${t("tree.sort")}: ${t(
                mode === "name"
                  ? "tree.sortName"
                  : mode === "type"
                    ? "tree.sortType"
                    : "tree.sortModified",
              )}`,
              separatorBefore: i === 0,
              checked: sortMode === mode,
              onSelect: () => {
                useSettings.getState().set({ explorerSort: mode })
                setMenu(null)
              },
            })),
            {
              label: t("tree.commentProject"),
              icon: <MessageIcon className="h-3.5 w-3.5" />,
              onSelect: () => openComment("project"),
            },
          ]
        : []

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
    if (entry.isDir && active?.startsWith(entry.path + sep(entry.path))) {
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
