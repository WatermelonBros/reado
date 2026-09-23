/** Open-file tab strip, with a right-click context menu per tab. */

import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { ask } from "@tauri-apps/plugin-dialog"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon, FileIcon, PinIcon } from "@/components/atoms/icons"
import { baseName, toRelative } from "@/lib/comments"
import { formatDocument } from "@/lib/docInfo"
import { dirName } from "@/lib/paths"
import { useFlip, usePointerReorder } from "@/lib/pointerReorder"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { isUntitled, untitledName, useUntitled } from "@/lib/untitled"
import { revealAppName } from "@/lib/window"

/**
 * The label for a tab: its file name, plus the parent folder when another open
 * tab has the same name.
 *
 * Two `index.ts` tabs are otherwise identical, which is the one case where the
 * strip stops being readable at a glance.
 */
export function tabLabels(paths: string[]): Map<string, { name: string; dir?: string }> {
  // A scratch buffer's id is not a path — its name is the whole of it, and two
  // of them are never ambiguous, because the number is what tells them apart.
  const nameOf = (p: string) => (isUntitled(p) ? untitledName(p) : baseName(p))
  const counts = new Map<string, number>()
  for (const p of paths) counts.set(nameOf(p), (counts.get(nameOf(p)) ?? 0) + 1)
  return new Map(
    paths.map((p) => {
      const name = nameOf(p)
      const ambiguous = !isUntitled(p) && (counts.get(name) ?? 0) > 1
      return [p, { name, dir: ambiguous ? baseName(dirName(p)) : undefined }]
    }),
  )
}

/**
 * The tab strip.
 *
 * With no `group` it is the focused group's strip and reads the live fields, as
 * it always has. Given a group id it shows that group's tabs instead, and every
 * action on them focuses the group first — so the whole of the machinery below
 * only ever deals with "the focused group", which is the single-pane case it was
 * written for.
 */
export function Tabs({ group }: { group?: string } = {}) {
  const otherGroup = useProject((s) =>
    group && group !== s.focusedGroup ? s.groups.find((g) => g.id === group) : undefined,
  )
  const liveTabs = useProject((s) => s.tabs)
  const liveActive = useProject((s) => s.active)
  const activateInGroup = useProject((s) => s.activateInGroup)
  const closeInGroup = useProject((s) => s.closeInGroup)
  const tabs = otherGroup ? otherGroup.tabs : liveTabs
  const root = useProject((s) => s.root)
  const active = otherGroup ? otherGroup.active : liveActive
  const setActive = otherGroup
    ? (path: string) => activateInGroup(otherGroup.id, path)
    : useProject.getState().setActive
  const close = otherGroup
    ? (path: string) => closeInGroup(otherGroup.id, path)
    : useProject.getState().close
  const closeOthers = useProject((s) => s.closeOthers)
  const closeToRight = useProject((s) => s.closeToRight)
  const closeAll = useProject((s) => s.closeAll)
  const openSplit = useProject((s) => s.openSplit)
  const reopenClosed = useProject((s) => s.reopenClosed)
  const closedTabs = useProject((s) => s.closedTabs)
  const moveTab = useProject((s) => s.moveTab)
  const tabBar = useSettings((s) => s.tabBar)
  const iconMode = useSettings((s) => s.fileIcons)
  const dirtyPaths = useEditorActions((s) => s.dirtyPaths)
  const previewPath = useProject((s) => s.previewPath)
  const pinnedTabs = useProject((s) => s.pinnedTabs)
  const togglePinned = useProject((s) => s.togglePinned)
  const keepOpen = useProject((s) => s.keepOpen)
  const { t } = useTranslation()

  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)

  /**
   * Close a tab, asking first when that would throw text away.
   *
   * A file's edits are on disk (or flushed on the way out); a scratch buffer's
   * are only here, so closing one is the single close that destroys something.
   */
  const closeTab = (tabPath: string) => {
    if (!isUntitled(tabPath) || !useUntitled.getState().textOf(tabPath).trim()) {
      close(tabPath)
      return
    }
    void ask(t("file.untitledDiscardBody"), {
      title: t("file.untitledDiscardTitle", { name: untitledName(tabPath) }),
      okLabel: t("file.untitledDiscard"),
      kind: "warning",
    }).then((yes) => {
      if (!yes) return
      close(tabPath)
      useUntitled.getState().drop(tabPath)
    })
  }
  // Drag-to-reorder (pointer-based; HTML5 DnD is hijacked by Tauri's OS drop).
  const { dragging, over, onPointerDown } = usePointerReorder("x", (from, to, after) => {
    const idx = tabs.indexOf(to)
    moveTab(from, after ? (tabs[idx + 1] ?? null) : to)
  })
  const listRef = useRef<HTMLDivElement>(null)
  useFlip(listRef, tabs.join(" ")) // slide tabs to new positions on reorder

  if (tabs.length === 0 || tabBar === "hidden") return null
  // Single-tab mode shows only the active file; switching files (palette/keys)
  // replaces it rather than accumulating a row. No open file is closed.
  // Pinned tabs sort to the front: they are the ones you meant to keep, and the
  // strip scrolls away from the rest as it fills up.
  const ordered = [...tabs].sort(
    (a, b) => Number(pinnedTabs.includes(b)) - Number(pinnedTabs.includes(a)),
  )
  const shownTabs = tabBar === "single" ? ordered.filter((p) => p === active) : ordered
  const labels = tabLabels(tabs)

  const path = menu?.path ?? ""
  const isLast = menu ? tabs.indexOf(menu.path) === tabs.length - 1 : true
  const savedCount = tabs.filter((p) => !dirtyPaths.includes(toRelative(root, p))).length
  const items: ContextMenuItem[] = [
    { label: t("tabs.close"), onSelect: () => closeTab(path) },
    { label: t("tabs.closeOthers"), onSelect: () => closeOthers(path), disabled: tabs.length < 2 },
    { label: t("tabs.closeRight"), onSelect: () => closeToRight(path), disabled: isLast },
    {
      // "Saved" is the useful bulk close: it clears the tabs you are done with
      // and leaves anything with pending edits exactly where it is.
      label: t("tabs.closeSaved"),
      onSelect: () => {
        for (const p of tabs) if (!dirtyPaths.includes(toRelative(root, p))) close(p)
      },
      disabled: savedCount === 0,
    },
    { label: t("tabs.closeAll"), onSelect: closeAll },
    {
      label: pinnedTabs.includes(path) ? t("tabs.unpin") : t("tabs.pin"),
      separatorBefore: true,
      onSelect: () => togglePinned(path),
    },
    ...(previewPath === path
      ? [{ label: t("tabs.keepOpen"), onSelect: () => keepOpen(path) }]
      : []),
    {
      label: t("tabs.reopen"),
      onSelect: reopenClosed,
      disabled: closedTabs.length === 0,
    },
    {
      label: t("tabs.splitRight"),
      separatorBefore: true,
      onSelect: () => openSplit(path),
    },
    {
      label: t("editor.format"),
      onSelect: () => {
        setActive(path)
        setTimeout(() => void formatDocument(), 80)
      },
    },
    {
      label: t("tree.copyPath"),
      separatorBefore: true,
      onSelect: () => void clipboardWriteText(path).catch(() => {}),
    },
    {
      label: t("tree.copyRelativePath"),
      onSelect: () => void clipboardWriteText(toRelative(root, path)).catch(() => {}),
    },
    {
      label: t("tree.reveal", { app: revealAppName() }),
      onSelect: () => void revealItemInDir(path).catch(() => {}),
    },
    {
      label: t("tree.openInTerminal"),
      onSelect: () => {
        const terminals = useTerminals.getState()
        terminals.add(dirName(path))
        terminals.toggle(true)
      },
    },
  ]

  return (
    <div
      ref={listRef}
      role="tablist"
      className="flex h-[38px] flex-none items-stretch overflow-x-auto border-b border-line bg-surface [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {shownTabs.map((tabPath) => {
        const isActive = active === tabPath
        const dirty = dirtyPaths.includes(toRelative(root, tabPath))
        const preview = previewPath === tabPath
        const pinned = pinnedTabs.includes(tabPath)
        const label = labels.get(tabPath) ?? { name: baseName(tabPath) }
        return (
          <div
            key={tabPath}
            data-reorder-id={tabPath}
            onPointerDown={onPointerDown(tabPath)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, path: tabPath })
            }}
            // Middle-click (mouse wheel) closes the tab, like a browser.
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                closeTab(tabPath)
              }
            }}
            title={tabPath}
            className={`group relative flex max-w-[240px] items-stretch gap-2 whitespace-nowrap border-r border-line pr-2 text-sm transition-colors ${
              isActive
                ? "bg-canvas text-ink shadow-[inset_0_2px_0_var(--accent)]"
                : "text-muted hover:bg-canvas/50 hover:text-ink"
            } ${dragging === tabPath ? "opacity-40" : ""}`}
          >
            {over?.id === tabPath && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-accent ${
                  over.after ? "right-0" : "left-0"
                }`}
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tabPath)}
              // A second click on the tab you are already looking at is the
              // "I mean it" gesture, exactly as a double-click in the tree is.
              onDoubleClick={() => keepOpen(tabPath)}
              title={preview ? t("tabs.preview") : tabPath}
              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden pl-3 text-left"
            >
              <FileIcon isDir={false} name={label.name} mode={iconMode} className="flex-none" />
              <span className={`overflow-hidden text-ellipsis ${preview ? "italic" : ""}`}>
                {label.name}
              </span>
              {label.dir && (
                <span className="flex-none overflow-hidden text-ellipsis text-[10px] text-faint">
                  {label.dir}
                </span>
              )}
            </button>
            {/* The dot replaces the close button while there are unsaved edits —
                the same slot, so the strip doesn't reflow, and hovering swaps it
                back to the X so the tab is still closable. */}
            {pinned && (
              <span
                role="img"
                aria-label={t("tabs.pinned")}
                title={t("tabs.pinned")}
                className="my-auto flex-none text-faint"
              >
                <PinIcon className="h-3 w-3" weight="fill" />
              </span>
            )}
            {dirty && (
              <span
                role="img"
                aria-label={t("tabs.unsaved")}
                title={t("tabs.unsaved")}
                className="my-auto h-1.5 w-1.5 flex-none rounded-full bg-accent group-hover:hidden group-focus-within:hidden"
              />
            )}
            <IconButton
              size="xxs"
              label={`${t("tabs.close")} ${label.name}`}
              icon={<CloseIcon className="block h-[13px] w-[13px]" />}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tabPath)
              }}
              className={`my-auto transition-opacity ${
                isActive && !dirty
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              } ${dirty ? "hidden group-hover:block group-focus-within:block" : ""}`}
            />
          </div>
        )
      })}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}
