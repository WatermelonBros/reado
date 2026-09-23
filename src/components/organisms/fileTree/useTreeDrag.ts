import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { importPaths } from "@/lib/api"
import { osDropTarget } from "@/lib/dropTarget"
import { useProject } from "@/lib/store"
import { dropPathsIntoTerminal, offSafe } from "@/lib/terminals"
import { onFileDrop } from "@/lib/window"
import { rootFor } from "@/lib/workspace"

/** The drag label sits just below-right of the cursor, clear of the pointer. */
export const ghostAt = (x: number, y: number) => `translate(${x + 14}px, ${y + 12}px)`

/**
 * Dragging in and out of the tree: rows dragged onto a folder (or out, onto a
 * terminal), and files dropped in from the OS.
 */
export function useTreeDrag(
  move: (from: string, destDir: string) => Promise<void>,
  {
    root,
    containerRef,
    selectedRef,
  }: {
    root: string
    containerRef: RefObject<HTMLDivElement | null>
    /** The current selection: dragging a selected row drags all of it. */
    selectedRef: RefObject<string[]>
  },
) {
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
    // An interrupted drag (the OS took the pointer, the window lost focus) never
    // sees a `pointerup` — drop it rather than leave the ghost stuck to the cursor.
    const onCancel = () => {
      dragStart.current = null
      setDraggingPath(null)
      setOverDir(null)
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("blur", onCancel)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("blur", onCancel)
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
    const un = onFileDrop((paths, position) => {
      const el = osDropTarget(containerRef.current, position)
      if (!el) return
      const destDir = el.closest("[data-dir]")?.getAttribute("data-dir") || root
      importPaths(rootFor(destDir), paths, destDir)
        .then(() => useProject.getState().bumpTree())
        .catch(() => {})
    })
    // FileTree unmounts on every tool switch, so the unlisten regularly finds a
    // listener map that is already gone.
    return () => offSafe(un)
  }, [root])

  return { draggingPath, overDir, onRowPointerDown, dragStart, ghostRef, ptr }
}
