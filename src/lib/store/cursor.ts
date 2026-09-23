import { create } from "zustand"

interface CursorState {
  line: number
  col: number
  set: (line: number, col: number) => void
}

/** Cursor position of the focused editor, shown in the status bar. Kept in its
 *  own store so frequent cursor moves don't re-render the whole project tree. */
export const useCursor = create<CursorState>((set) => ({
  line: 1,
  col: 1,
  set: (line, col) => set({ line, col }),
}))
