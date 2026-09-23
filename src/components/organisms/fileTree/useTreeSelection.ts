import { type RefObject, useCallback, useRef, useState } from "react"
import type { DirEntry } from "@/lib/api"
import { baseName } from "@/lib/comments"
import { useProject } from "@/lib/store"

/** What the tree's keyboard shortcuts act through. */
export interface TreeKeyActions {
  relOf: (path: string) => string
  setClip: (clip: { paths: string[]; cut: boolean }) => void
  paste: (entry: DirEntry | null) => Promise<void>
  duplicate: (paths: string[]) => Promise<void>
  remove: (paths: string[]) => Promise<void>
  rename: (path: string) => Promise<void>
}

/**
 * The tree's multi-selection and its keyboard.
 *
 * ⌘/Ctrl+click toggles a row, ⇧+click takes the range from the anchor. Empty
 * means "just whatever row you act on", which is what a plain click leaves
 * behind.
 */
export function useTreeSelection(containerRef: RefObject<HTMLDivElement | null>) {
  const [selected, setSelected] = useState<string[]>([])
  const anchorRef = useRef<string | null>(null)
  // The window-level pointer handlers are re-bound only when a drag starts, so
  // they read the selection through a ref rather than a stale closure.
  const selectedRef = useRef(selected)
  selectedRef.current = selected

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

  /** The tree's key handler, acting through `actions`. */
  const keyDownWith =
    ({ relOf, setClip, paste, duplicate, remove, rename }: TreeKeyActions) =>
    (e: React.KeyboardEvent) => {
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

  return { selected, setSelected, anchorRef, selectedRef, onRowClick, targetsFor, keyDownWith }
}
