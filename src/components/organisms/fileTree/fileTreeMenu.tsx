/**
 * The file tree's right-click menu, as data: one flat list of `cond && item`
 * entries, in display order. The tree owns the state; this only decides what is
 * offered for the row (or the empty area) that was clicked.
 */
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import type { TFunction } from "i18next"
import type { ContextMenuItem } from "@/components/atoms/ContextMenu"
import { EditIcon, LayoutIcon, MessageIcon, SparkleIcon, TrashIcon } from "@/components/atoms/icons"
import type { AuditTarget } from "@/components/organisms/AuditDialog"
import type { CommentTarget } from "@/components/organisms/TreeCommentDialog"
import type { DirEntry } from "@/lib/api"
import { baseName } from "@/lib/comments"
import { compareWithSaved } from "@/lib/docInfo"
import { dirName } from "@/lib/paths"
import { useProjectFiles } from "@/lib/projectFiles"
import { useReadProgress } from "@/lib/readProgress"
import { FILE_BASE, useEditorActions, useProject, useSettings, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { useTextView } from "@/lib/textView"
import { revealAppName } from "@/lib/window"
import { rootFor } from "@/lib/workspace"

/** Files Reado renders as something other than code, and so can be opened either
 *  way ("Open With ▸ Editor / Preview"). */
const hasPreview = (p: string) =>
  /\.(md|markdown|mdx|svg|png|jpe?g|gif|webp|bmp|ico|avif|pdf)$/i.test(p)

/** Where a row drops into: a folder takes its own path, a file its parent dir. */
export const dropDir = (entry: DirEntry) => (entry.isDir ? entry.path : dirName(entry.path))

/** Everything the menu's actions reach back into the tree for. */
export interface FileTreeMenuCtx {
  t: TFunction
  /** Close the menu. */
  close: () => void
  /** Switch the open menu to its "Open With ▸" page, or back from it. */
  setOpenWithPage: (on: boolean) => void
  /** A row's path, relative to its own workspace folder. */
  relOf: (path: string) => string
  /** The paths an action on `path` applies to (the selection, or just it). */
  targetsFor: (path: string) => string[]
  clip: { paths: string[]; cut: boolean } | null
  setClip: (clip: { paths: string[]; cut: boolean }) => void
  compareLeft: string | null
  setCompareLeft: (rel: string) => void
  sortMode: "name" | "type" | "modified"
  open: (path: string) => void
  openComment: (kind: CommentTarget["kind"], path?: string) => void
  setAudit: (target: AuditTarget) => void
  rename: (path: string) => Promise<void>
  paste: (entry: DirEntry | null) => Promise<void>
  duplicate: (paths: string[]) => Promise<void>
  remove: (paths: string[]) => Promise<void>
  create: (kind: "file" | "folder", entry: DirEntry | null) => Promise<void>
}

/** The "Open With ▸" page: the viewers that actually apply to this file. */
export function openWithItems(entry: DirEntry, ctx: FileTreeMenuCtx): ContextMenuItem[] {
  const { t, close, open, setOpenWithPage } = ctx
  const asText = useTextView.getState().force.has(entry.path)
  const openWith = (viewer: "text" | "preview" | "diff") => () => {
    close()
    useTextView.getState().setText(entry.path, viewer === "text")
    if (viewer === "diff") useEditorActions.getState().requestView("diff")
    open(entry.path)
  }
  return [
    {
      label: t("tree.openWithBack"),
      keepOpen: true,
      onSelect: () => setOpenWithPage(false),
    },
    {
      label: t("tree.viewerText"),
      checked: asText,
      separatorBefore: true,
      onSelect: openWith("text"),
    },
    // Only offered where there *is* a rich rendering to fall back to; for a
    // plain .ts file "Preview" would just be the editor under another name.
    hasPreview(entry.path) && {
      label: t("tree.viewerPreview"),
      checked: !asText,
      onSelect: openWith("preview"),
    },
    useProject.getState().git.isRepo && { label: t("tree.viewerDiff"), onSelect: openWith("diff") },
  ].filter(Boolean) as ContextMenuItem[]
}

/** The menu for a right-click on `entry`, or on the tree's empty area (`null`). */
export function fileTreeMenuItems(entry: DirEntry | null, ctx: FileTreeMenuCtx): ContextMenuItem[] {
  const { t, close, relOf, targetsFor, clip, compareLeft, open } = ctx
  const file = entry && !entry.isDir ? entry : null
  const dir = entry?.isDir ? entry : null

  // Only offer the direction that would actually change something: a folder with
  // everything already read shouldn't offer "mark read", an all-unread (or
  // empty) folder shouldn't offer "mark unread".
  const folderFiles = dir
    ? useProjectFiles.getState().files.filter((f) => f.startsWith(`${relOf(dir.path)}/`))
    : []
  const read = useReadProgress.getState().read
  const markFolder = (value: boolean) => {
    if (!dir) return
    useReadProgress.getState().markMany(rootFor(dir.path), folderFiles, value)
    close()
  }
  const deleteCount = entry ? targetsFor(entry.path).length : 0

  return [
    entry && {
      label: t(entry.isDir ? "tree.commentFolder" : "tree.commentFile"),
      icon: <MessageIcon className="h-3.5 w-3.5" />,
      onSelect: () => ctx.openComment(entry.isDir ? "folder" : "file", relOf(entry.path)),
    },
    entry && {
      label: t("tree.audit"),
      icon: <SparkleIcon className="h-3.5 w-3.5" />,
      onSelect: () => {
        ctx.setAudit({ path: relOf(entry.path), isDir: entry.isDir })
        close()
      },
    },
    file && {
      label: t("split.openSide"),
      icon: <LayoutIcon className="h-3.5 w-3.5" />,
      onSelect: () => {
        useProject.getState().openSplit(file.path)
        close()
      },
    },
    file && {
      label: read.has(relOf(file.path)) ? t("tree.markUnread") : t("tree.markRead"),
      onSelect: () => {
        const relP = relOf(file.path)
        const isRead = useReadProgress.getState().read.has(relP)
        useReadProgress.getState().mark(rootFor(file.path), relP, !isRead)
        close()
      },
    },
    folderFiles.some((f) => !read.has(f)) && {
      label: t("tree.markFolderRead"),
      onSelect: () => markFolder(true),
    },
    folderFiles.some((f) => read.has(f)) && {
      label: t("tree.markFolderUnread"),
      onSelect: () => markFolder(false),
    },
    file &&
      /\.svg$/i.test(file.path) && {
        label: t("tree.openAsText"),
        icon: <EditIcon className="h-3.5 w-3.5" />,
        onSelect: () => {
          useTextView.getState().openAsText(file.path)
          open(file.path)
          close()
        },
      },
    file &&
      /\.(md|markdown|mdx)$/i.test(file.path) && {
        // Markdown opens as rendered prose by default; this opens it
        // straight into the editable source view.
        label: t("tree.editSource"),
        icon: <EditIcon className="h-3.5 w-3.5" />,
        onSelect: () => {
          useTextView.getState().openAsText(file.path)
          open(file.path)
          close()
        },
      },
    entry && {
      label: t("tree.reveal", { app: revealAppName() }),
      onSelect: () => {
        void revealItemInDir(entry.path)
        close()
      },
    },
    entry && {
      label: t("tree.rename"),
      icon: <EditIcon className="h-3.5 w-3.5" />,
      separatorBefore: true,
      onSelect: () => {
        const path = entry.path
        close()
        void ctx.rename(path)
      },
    },
    file && {
      // Two-file compare, the pair VS Code puts here: pick one
      // file, then pick the other. The chosen file survives folder
      // navigation, which is the point — the two rarely sit
      // side by side.
      label: t("tree.selectForCompare"),
      separatorBefore: true,
      onSelect: () => {
        ctx.setCompareLeft(relOf(file.path))
        close()
      },
    },
    file &&
      compareLeft &&
      compareLeft !== relOf(file.path) && {
        label: t("tree.compareWithSelected", { name: baseName(compareLeft) }),
        onSelect: () => {
          const actions = useEditorActions.getState()
          const path = file.path
          close()
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
    dir && {
      label: t("tree.findInFolder"),
      separatorBefore: true,
      onSelect: () => {
        close()
        useWorkspace.getState().setSearchScope(relOf(dir.path))
        useWorkspace.getState().selectTool("search")
      },
    },
    file &&
      useEditorActions.getState().isDirty(relOf(file.path)) && {
        label: t("diff.compareWithSaved"),
        separatorBefore: true,
        onSelect: () => {
          const path = file.path
          close()
          // The buffer only exists while that file is the open one.
          if (useProject.getState().active === path) compareWithSaved()
          else open(path)
        },
      },
    file && {
      label: t("tree.openWith"),
      separatorBefore: true,
      onSelect: () => ctx.setOpenWithPage(true),
    },
    entry && {
      label: t("tree.openInTerminal"),
      separatorBefore: true,
      onSelect: () => {
        const dir = dropDir(entry)
        close()
        const terminals = useTerminals.getState()
        terminals.add(dir)
        terminals.toggle(true)
      },
    },
    entry && {
      label: t("tree.cut"),
      separatorBefore: true,
      onSelect: () => {
        ctx.setClip({ paths: targetsFor(entry.path), cut: true })
        close()
      },
    },
    entry && {
      label: t("tree.copy"),
      onSelect: () => {
        ctx.setClip({ paths: targetsFor(entry.path), cut: false })
        close()
      },
    },
    clip && {
      label: t("tree.paste"),
      separatorBefore: !entry,
      onSelect: () => {
        close()
        void ctx.paste(entry)
      },
    },
    entry && {
      label: t("tree.duplicate"),
      onSelect: () => {
        const paths = targetsFor(entry.path)
        close()
        void ctx.duplicate(paths)
      },
    },
    {
      label: t("file.newFile"),
      separatorBefore: !entry,
      onSelect: () => void ctx.create("file", entry),
    },
    {
      label: t("tree.newFolder"),
      onSelect: () => void ctx.create("folder", entry),
    },
    entry && {
      label: t("tree.copyPath"),
      separatorBefore: true,
      onSelect: () => {
        void clipboardWriteText(entry.path).catch(() => {})
        close()
      },
    },
    entry && {
      label: t("tree.copyRelativePath"),
      onSelect: () => {
        void clipboardWriteText(relOf(entry.path)).catch(() => {})
        close()
      },
    },
    entry && {
      label: deleteCount > 1 ? t("tree.deleteMany", { count: deleteCount }) : t("tree.delete"),
      icon: <TrashIcon className="h-3.5 w-3.5" />,
      danger: true,
      separatorBefore: true,
      onSelect: () => {
        const paths = targetsFor(entry.path)
        close()
        void ctx.remove(paths)
      },
    },
    ...(["name", "type", "modified"] as const).map((mode, i) => ({
      label: `${t("tree.sort")}: ${t(
        mode === "name" ? "tree.sortName" : mode === "type" ? "tree.sortType" : "tree.sortModified",
      )}`,
      separatorBefore: i === 0,
      checked: ctx.sortMode === mode,
      onSelect: () => {
        useSettings.getState().set({ explorerSort: mode })
        close()
      },
    })),
    {
      label: t("tree.commentProject"),
      icon: <MessageIcon className="h-3.5 w-3.5" />,
      onSelect: () => ctx.openComment("project"),
    },
  ].filter(Boolean) as ContextMenuItem[]
}
