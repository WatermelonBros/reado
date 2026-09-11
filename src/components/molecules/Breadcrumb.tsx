/** Path breadcrumb for the active file, with the diff toggle and base picker. */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import { IconButton } from "@/components/atoms/IconButton"
import { BlameIcon, ChevronIcon, DiffIcon, SparkleIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import { type DirEntry, type GitRefs, gitRefs, listDir } from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { useDocInfo } from "@/lib/docInfo"
import { lspDocumentSymbols } from "@/lib/lsp"
import { extractSymbols, type OutlineSymbol } from "@/lib/outline"
import { LAST_READ_BASE } from "@/lib/readProgress"
import { SAVED_BASE, useEditorActions, useProject } from "@/lib/store"
import { useSynopsis } from "@/lib/synopsis"
import { isUntitled } from "@/lib/untitled"

/** A path segment: a button that doesn't look like one until you reach it. */
const SEGMENT =
  "rounded-sm px-1 py-0.5 hover:bg-surface hover:text-ink data-[state=open]:bg-surface"

export function Breadcrumb() {
  const root = useProject((s) => s.root)
  const active = useProject((s) => s.active)
  const isRepo = useProject((s) => s.git.isRepo)
  const navStack = useProject((s) => s.navStack)
  const navIndex = useProject((s) => s.navIndex)
  const goBack = useProject((s) => s.goBack)
  const goForward = useProject((s) => s.goForward)
  const diffing = useEditorActions((s) => s.diffing)
  const setDiffing = useEditorActions((s) => s.setDiffing)
  const diffBase = useEditorActions((s) => s.diffBase)
  const setDiffBase = useEditorActions((s) => s.setDiffBase)
  const blame = useEditorActions((s) => s.blame)
  const setBlame = useEditorActions((s) => s.setBlame)
  const dirtyPaths = useEditorActions((s) => s.dirtyPaths)
  const { t } = useTranslation()
  const [refs, setRefs] = useState<GitRefs>({ branches: [], commits: [] })
  const [siblings, setSiblings] = useState<DirEntry[]>([])
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([])
  const open = useProject((s) => s.open)

  // Load the diff base options when the diff turns on.
  useEffect(() => {
    if (diffing && isRepo)
      gitRefs(root)
        .then(setRefs)
        .catch(() => {})
  }, [diffing, isRepo, root])

  // A scratch buffer has no path to break into segments, no folder to list
  // beside it, and nothing in git to diff or blame against.
  if (!active || isUntitled(active)) return null

  const rel = toRelative(root, active)
  const segments = rel.split("/")
  const dirty = dirtyPaths.includes(rel)

  /** List the folder at segment `i`. */
  const loadFolder = (i: number) => {
    setSiblings([])
    const dir = [root, ...segments.slice(0, i + 1)].join("/")
    listDir(root, dir, useProject.getState().showHidden)
      .then(setSiblings)
      .catch(() => setSiblings([]))
  }

  /** The file's own symbols: the heuristic outline first (instant), replaced by
   *  the language server's when it answers. */
  const loadSymbols = () => {
    const view = useDocInfo.getState().view
    if (!view) {
      setSymbols([])
      return
    }
    setSymbols(extractSymbols(view.state.doc.toString()))
    void lspDocumentSymbols(view)?.then((syms) => {
      if (syms?.length) setSymbols(syms)
    })
  }

  const baseOptions = [
    // The sentinels aren't git refs, so they're only listed while active —
    // otherwise the Select would show a blank value for the base in effect.
    ...(diffBase === SAVED_BASE ? [{ value: SAVED_BASE, label: t("diff.saved") }] : []),
    ...(diffBase === LAST_READ_BASE ? [{ value: LAST_READ_BASE, label: t("diff.lastRead") }] : []),
    { value: "HEAD", label: t("diff.head") },
    ...refs.branches.map((b) => ({ value: b, label: b })),
    ...refs.commits.map((c) => ({
      value: c.hash,
      label: `${c.hash} · ${c.subject.slice(0, 32)}`,
    })),
  ]

  return (
    <nav
      aria-label={t("breadcrumb.label")}
      className="flex flex-none items-center gap-0.5 border-b border-line bg-canvas px-4 py-2 text-xs text-faint select-none"
    >
      <div className="mr-1.5 flex flex-none items-center gap-0.5">
        <IconButton
          label={t("nav.back")}
          icon={<ChevronIcon className="h-[13px] w-[13px] rotate-180" />}
          onClick={goBack}
          disabled={navIndex <= 0}
          size="sm"
        />
        <IconButton
          label={t("nav.forward")}
          icon={<ChevronIcon className="h-[13px] w-[13px]" />}
          onClick={goForward}
          disabled={navIndex >= navStack.length - 1}
          size="sm"
        />
      </div>

      {segments.map((seg, i) => {
        const isFile = i === segments.length - 1
        const rowsClass = "max-h-72 w-64"
        return (
          // The breadcrumb is a navigator, not a label: a folder lists what is
          // beside the file you are reading, and the file itself lists what is
          // inside it.
          <span key={`${seg}-${i}`} className="inline-flex items-center gap-0.5">
            {i > 0 && <ChevronIcon className="h-[11px] w-[11px] opacity-60" />}
            {isFile ? (
              <Dropdown
                label={t("breadcrumb.symbols")}
                trigger={seg}
                triggerClassName={`${SEGMENT} text-muted`}
                placement="bottom"
                align="end"
                onOpen={loadSymbols}
                className={rowsClass}
              >
                {symbols.length === 0 ? (
                  <p className="px-3 py-1.5 text-sm text-faint">{t("breadcrumb.noSymbols")}</p>
                ) : (
                  symbols.map((sym) => (
                    <MenuRow
                      key={`${sym.name}:${sym.line}`}
                      label={sym.name}
                      value={`${sym.name}:${sym.line}`}
                      detail={String(sym.line)}
                      onClick={() => open(active, sym.line)}
                    />
                  ))
                )}
              </Dropdown>
            ) : (
              <Dropdown
                label={t("breadcrumb.folder", { name: seg })}
                trigger={seg}
                triggerClassName={SEGMENT}
                placement="bottom"
                onOpen={() => loadFolder(i)}
                className={rowsClass}
              >
                {siblings.length === 0 ? (
                  <p className="px-3 py-1.5 text-sm text-faint">{t("tree.empty")}</p>
                ) : (
                  siblings.map((e) => (
                    <MenuRow
                      key={e.path}
                      label={e.name}
                      detail={e.isDir ? "/" : undefined}
                      checked={rel.startsWith(`${segments.slice(0, i + 1).join("/")}/${e.name}`)}
                      onClick={() => {
                        // A folder reveals in the tree; only a file opens.
                        if (e.isDir) useProject.getState().toggleDir(toRelative(root, e.path), true)
                        else open(e.path)
                      }}
                    />
                  ))
                )}
              </Dropdown>
            )}
          </span>
        )
      })}

      {dirty && (
        <span
          className="ml-1 h-1.5 w-1.5 flex-none rounded-full bg-accent"
          title={t("editor.unsaved")}
        />
      )}

      <div className="ml-auto flex flex-none items-center gap-1.5">
        {diffing && isRepo && (
          <Select
            ariaLabel={t("diff.base")}
            variant="ghost"
            value={diffBase}
            onChange={setDiffBase}
            options={baseOptions}
          />
        )}
        {!diffing && (
          <IconButton
            label={t("synopsis.open")}
            icon={<SparkleIcon className="h-3.5 w-3.5" />}
            onClick={() => useSynopsis.getState().show(rel)}
            size="sm"
          />
        )}
        {isRepo && !diffing && (
          <IconButton
            label={t("blame.toggle")}
            icon={<BlameIcon className="h-3.5 w-3.5" weight={blame ? "duotone" : "regular"} />}
            onClick={() => setBlame(!blame)}
            active={blame}
            size="sm"
          />
        )}
        {isRepo && (
          <IconButton
            label={t("diff.toggle")}
            icon={<DiffIcon className="h-3.5 w-3.5" weight={diffing ? "duotone" : "regular"} />}
            onClick={() => setDiffing(!diffing)}
            active={diffing}
            size="sm"
          />
        )}
      </div>
    </nav>
  )
}
