import type { Compartment } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { type RefObject, useEffect } from "react"
import { gitBlame, gitWorkingDiffLines } from "@/lib/api"
import { blameGutter, inlineBlame } from "@/lib/blameGutter"
import { diffGutter } from "@/lib/changedLines"
import { useEditorActions, useSettings } from "@/lib/store"

/** The git-backed gutters: blame (column or inline) and the working-tree diff marks. */
export function useGitGutters(
  viewRef: RefObject<EditorView | null>,
  {
    fileRoot,
    relPath,
    text,
    blameComp,
    diffComp,
  }: {
    fileRoot: string
    relPath: string
    text: string
    blameComp: Compartment
    diffComp: Compartment
  },
): void {
  const blame = useEditorActions((s) => s.blame)
  const inlineBlameOn = useSettings((s) => s.inlineBlame)
  const diffGutterOn = useSettings((s) => s.diffGutter)

  // The blame column (breadcrumb toggle) and the inline, cursor-line annotation
  // (a setting) read the same `git_blame`, so one fetch serves both. The column
  // wins when both are on — showing the same fact twice on one line is noise.
  useEffect(() => {
    if (!blame && !inlineBlameOn) {
      viewRef.current?.dispatch({ effects: blameComp.reconfigure([]) })
      return
    }
    let cancelled = false
    gitBlame(fileRoot, relPath)
      .then((lines) => {
        if (cancelled || !lines.length) return
        const ext = blame ? blameGutter(lines) : inlineBlame(lines)
        viewRef.current?.dispatch({ effects: blameComp.reconfigure(ext) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [blame, inlineBlameOn, fileRoot, relPath, blameComp])

  // Mark the lines this working tree changes since HEAD. Keyed on `text`, which
  // is what a save or an on-disk change produces (the file is re-read and the
  // prop replaced) — this component is keyed by path, so it does not remount on
  // a save and nothing else here would refresh the marks.
  useEffect(() => {
    if (!diffGutterOn) {
      viewRef.current?.dispatch({ effects: diffComp.reconfigure([]) })
      return
    }
    let cancelled = false
    gitWorkingDiffLines(fileRoot, relPath)
      .then((ranges) => {
        if (!cancelled) {
          viewRef.current?.dispatch({ effects: diffComp.reconfigure(diffGutter(ranges)) })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [diffGutterOn, fileRoot, relPath, diffComp, text])
}
