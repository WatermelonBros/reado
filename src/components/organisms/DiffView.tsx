/**
 * On-demand diff view: the active file vs its committed (HEAD) version.
 *
 * This is how you see what changed — including the agent's own edits — without
 * leaving the reader. It's opt-in (the default view is clean code) and
 * read-only, rendered as a CodeMirror unified merge against the git base.
 */

import { LanguageDescription } from "@codemirror/language"
import { getChunks, goToNextChunk, goToPreviousChunk, unifiedMergeView } from "@codemirror/merge"
import { Compartment, EditorState, Text } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { ChevronIcon } from "@/components/atoms/icons"
import { HunkBar } from "@/components/molecules/HunkBar"
import { announce } from "@/lib/a11y"
import { getReadSnapshot, gitDiffBase, historyRead, readFile } from "@/lib/api"
import { readoAppearance } from "@/lib/codemirror"
import { languages } from "@/lib/languages"
import { diffRuler } from "@/lib/overviewRuler"
import { LAST_READ_BASE, useReadProgress } from "@/lib/readProgress"
import {
  FILE_BASE,
  HISTORY_BASE,
  SAVED_BASE,
  useEditorActions,
  useProject,
  useSettings,
} from "@/lib/store"

interface Props {
  relPath: string
  text: string
  /** Override the git base to diff against (PR review diffs head vs the PR base
   *  ref, not the working tree's HEAD). Falls back to the shared diff base. */
  base?: string
}

/**
 * How many lines a changed chunk spans, for the announcement.
 *
 * A chunk's end offset points *past* its trailing newline, so measuring up to
 * `to` counts the untouched line after it — `to - 1` lands on that newline,
 * which still belongs to the chunk's last line. Exported for the test: an
 * off-by-one here is invisible on screen and wrong in every announcement.
 */
export function chunkLines(doc: Text, from: number, to: number): number {
  if (from >= to) return 0
  return doc.lineAt(Math.min(to, doc.length) - 1).number - doc.lineAt(from).number + 1
}

/**
 * Say what a jump landed on.
 *
 * A diff is read by colour, and colour is the one thing a screen reader cannot
 * relay — so the chunk is described instead: which one of how many, how many
 * lines it adds and removes, and where it is. Without this, Alt+Down moves a
 * caret for no stated reason.
 *
 * The early return matters: `announce` is a no-op for a reader who has not asked
 * for it, and rebuilding the original document to count its lines is not free.
 */
function describeChunk(view: EditorView, original: string, t: TFunction): void {
  if (!useSettings.getState().screenReader) return
  const chunks = getChunks(view.state)?.chunks ?? []
  if (chunks.length === 0) return
  const at = view.state.selection.main.head
  const index = chunks.findIndex((c) => at >= c.fromB && at <= c.toB)
  const chunk = chunks[index] ?? chunks[0]
  announce(
    t("a11y.diffChunk", {
      n: (index === -1 ? 0 : index) + 1,
      total: chunks.length,
      added: chunkLines(view.state.doc, chunk.fromB, chunk.toB),
      removed: chunkLines(Text.of(original.split("\n")), chunk.fromA, chunk.toA),
      line: view.state.doc.lineAt(chunk.fromB).number,
    }),
  )
}

export function DiffView({ relPath, text, base: baseOverride }: Props) {
  const root = useProject((s) => s.root)
  const storeBase = useEditorActions((s) => s.diffBase)
  const base = baseOverride ?? storeBase
  const { codeFont } = useSettings()
  const { t } = useTranslation()
  const [head, setHead] = useState<string | null | undefined>(undefined)
  // Bumped when a hunk moves, so the base is re-read and the diff redraws.
  const [refresh, setRefresh] = useState(0)
  // Delta mode: diff against the last-read snapshot rather than a git ref.
  const isDelta = base === LAST_READ_BASE
  // "Compare with Saved": the base is the file on disk, not a git ref — so this
  // works on an untracked file, and outside a repository entirely.
  const isSaved = base === SAVED_BASE
  // "Compare with Selected": the base is another file in the project.
  const otherFile = base.startsWith(FILE_BASE) ? base.slice(FILE_BASE.length) : null
  // A local-history entry: this file as it was at one of its own saves. Not a
  // git ref either — the case it exists for is a file git has never seen.
  const historyStamp = base.startsWith(HISTORY_BASE) ? base.slice(HISTORY_BASE.length) : null

  // Fetch the base version whenever the file or chosen base changes.
  useEffect(() => {
    let cancelled = false
    setHead(undefined)
    // `gitDiffBase`, not `gitShowRef`: a file added since the base is not "no
    // base", it's an empty one — so a new file reads as an all-added diff.
    const fetchBase = historyStamp
      ? historyRead(root, relPath, historyStamp)
      : otherFile
        ? readFile(root, otherFile).then((c) => (c.kind === "text" ? c.text : null))
        : isSaved
          ? readFile(root, relPath).then((c) => (c.kind === "text" ? c.text : null))
          : isDelta
            ? getReadSnapshot(root, relPath)
            : gitDiffBase(root, relPath, base)
    fetchBase.then((h) => !cancelled && setHead(h)).catch(() => !cancelled && setHead(null))
    return () => {
      cancelled = true
    }
  }, [root, relPath, base, isDelta, isSaved, otherFile, historyStamp, refresh])

  // "Mark reviewed": re-snapshot the current content as read and leave the delta.
  const markReviewed = () => {
    useReadProgress.getState().mark(root, relPath, true, text)
    useReadProgress.getState().clearChanged(relPath)
    useEditorActions.getState().setDiffBase("HEAD")
    useEditorActions.getState().setDiffing(false)
  }

  if (head === undefined) {
    return <div className="grid h-full place-items-center text-muted">{t("common.loading")}</div>
  }
  if (head === null) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
        {isDelta ? t("delta.noBase") : t("diff.noBase")}
      </div>
    )
  }
  if (head === text) {
    return (
      <div className="grid h-full place-items-center gap-3 p-8 text-center text-sm text-muted">
        {isDelta ? t("delta.noChanges") : t("diff.noChanges")}
        {isDelta && (
          <Button variant="secondary" size="sm" onClick={markReviewed}>
            {t("delta.markReviewed")}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Per-hunk staging, only against HEAD: a delta (vs the last-read snapshot)
        isn't a git diff, so there is nothing to stage from it. */}
      {!isDelta && base === "HEAD" && (
        <HunkBar relPath={relPath} onChanged={() => setRefresh((n) => n + 1)} />
      )}
      <div className="relative min-h-0 flex-1">
        <DiffEditor
          key={`${relPath}@${base}`}
          path={relPath}
          original={head}
          text={text}
          codeFont={codeFont}
        />
      </div>
      {isDelta && (
        <Button
          variant="secondary"
          size="sm"
          onClick={markReviewed}
          title={t("delta.markReviewed")}
          className="absolute top-3 left-4 z-10 bg-overlay shadow-[var(--shadow)]"
        >
          {t("delta.markReviewed")}
        </Button>
      )}
    </div>
  )
}

function DiffEditor({
  path,
  original,
  text,
  codeFont,
}: {
  path: string
  original: string
  text: string
  codeFont: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langComp = useMemo(() => new Compartment(), [])
  const { t } = useTranslation()
  const [chunkCount, setChunkCount] = useState(0)

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          // Jump between changed regions with Alt+Up/Down.
          keymap.of([
            {
              key: "Alt-ArrowDown",
              run: (v) => {
                const moved = goToNextChunk(v)
                if (moved) describeChunk(v, original, t)
                return moved
              },
            },
            {
              key: "Alt-ArrowUp",
              run: (v) => {
                const moved = goToPreviousChunk(v)
                if (moved) describeChunk(v, original, t)
                return moved
              },
            },
          ]),
          // Show the current file with changes vs the committed base inline.
          unifiedMergeView({ original, mergeControls: false }),
          // Mark each changed chunk along the scrollbar.
          diffRuler,
          readoAppearance,
          langComp.of([]),
        ],
      }),
    })
    viewRef.current = view
    const count = getChunks(view.state)?.chunks.length ?? 0
    setChunkCount(count)
    announce(t("a11y.diffSummary", { count }))
    const desc = LanguageDescription.matchFilename(languages, path)
    if (desc) desc.load().then((s) => view.dispatch({ effects: langComp.reconfigure(s) }))
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  const jump = (next: boolean) => {
    const view = viewRef.current
    if (!view) return
    ;(next ? goToNextChunk : goToPreviousChunk)(view)
    view.focus()
    describeChunk(view, original, t)
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className="mx-auto h-full w-full [&_.cm-editor]:h-full"
        style={
          {
            "--code-font": codeFont || undefined,
          } as React.CSSProperties
        }
      />
      {chunkCount > 0 && (
        <div className="absolute top-3 right-4 z-10 flex items-center overflow-hidden rounded-md border border-line bg-overlay text-muted shadow-[var(--shadow)]">
          <IconButton
            label={t("diff.prevChange")}
            icon={<ChevronIcon className="h-3.5 w-3.5 -rotate-90" />}
            onClick={() => jump(false)}
          />
          <span className="px-2 text-xs tabular-nums">
            {t("diff.changes", { count: chunkCount })}
          </span>
          <IconButton
            label={t("diff.nextChange")}
            icon={<ChevronIcon className="h-3.5 w-3.5 rotate-90" />}
            onClick={() => jump(true)}
          />
        </div>
      )}
    </div>
  )
}
