/**
 * Bottom status bar: active file, cursor position, document info (indentation,
 * encoding, line endings, language), git branch, open-comment count and agent
 * run status. Some items are clickable (go to line, convert line endings), in
 * the spirit of VS Code's status bar.
 */
import { Popover } from "@ark-ui/react/popover"
import { Portal } from "@ark-ui/react/portal"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { Dropdown, MenuLabel, MenuRow } from "@/components/atoms/Dropdown"
import { Input } from "@/components/atoms/Input"
import {
  BrowserIcon,
  DeviceIcon,
  GitBranchIcon,
  MessageIcon,
  TerminalIcon,
} from "@/components/atoms/icons"
import type { MessageKey } from "@/i18n"
import {
  anywhereStatus,
  type GitBranches,
  gitBranches,
  gitCheckout,
  gitInfo,
  listEncodings,
} from "@/lib/api"
import { useChords } from "@/lib/chords"
import { openCount, toRelative, useComments } from "@/lib/comments"
import {
  convertEol,
  type Eol,
  editorConfigOf,
  goToLine,
  LANGUAGE_OPTIONS,
  reopenWithEncoding,
  setEncoding,
  useDocInfo,
} from "@/lib/docInfo"
import { notify, notifyError } from "@/lib/notice"
import { usePreview } from "@/lib/preview"
import { mod } from "@/lib/shortcuts"
import { useCursor, usePalette, useProject, useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/**
 * The indicators the status bar lets you switch off, in the order they appear.
 *
 * Deliberately not everything: the file path and the caret position are what a
 * status bar is for, and a bar you can empty completely is a bar you should
 * have hidden instead (View ▸ Toggle Status Bar, also in this menu).
 */
const STATUS_ITEMS: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "preview", labelKey: "preview.open" },
  { id: "encoding", labelKey: "status.encoding" },
  { id: "branch", labelKey: "status.branch" },
  { id: "comments", labelKey: "status.openComments" },
  { id: "agent", labelKey: "status.agentIdle" },
  { id: "anywhere", labelKey: "anywhere.title" },
  { id: "terminal", labelKey: "terminal.toggle" },
]

/** Path relative to the project root, with forward slashes. Delegates to the
 *  shared helper: a private copy here silently lost its sibling-prefix guard,
 *  rendering `/home/me/proj-backup/a.ts` as `-backup/a.ts`. */
const relativePath = (root: string, path: string | null): string | null =>
  path ? toRelative(root, path) : null

/** Shared style for a clickable status-bar item. */
const ITEM =
  "inline-flex items-center gap-[5px] whitespace-nowrap rounded-sm px-1 transition-colors hover:bg-overlay hover:text-ink"

export function StatusBar() {
  const root = useProject((s) => s.root)
  const active = useProject((s) => s.active)
  const git = useProject((s) => s.git)
  const previewOpen = usePreview((s) => s.open)
  const { line, col } = useCursor()
  const eol = useDocInfo((s) => s.eol)
  const encoding = useDocInfo((s) => s.encoding)
  const chordPending = useChords((s) => s.pending)
  const indentKind = useDocInfo((s) => s.indentKind)
  const indentSize = useDocInfo((s) => s.indentSize)
  const language = useDocInfo((s) => s.language)
  const setDoc = useDocInfo((s) => s.set)
  const openComments = useComments((s) => openCount(s.comments))
  const toggleTerminal = useTerminals((s) => s.toggle)
  const { t } = useTranslation()

  // Reado Anywhere: a phone icon + a live dot (green when the LAN server is up),
  // opening the pairing dialog. Re-checked whenever the dialog opens/closes.
  const anywhereOpen = usePalette((s) => s.anywhereOpen)
  const [anywhereOn, setAnywhereOn] = useState(false)
  useEffect(() => {
    anywhereStatus()
      .then((s) => setAnywhereOn(!!s))
      .catch(() => setAnywhereOn(false))
  }, [anywhereOpen])

  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  // The list comes from the backend so the menu and the decoder can't disagree
  // about what Reado supports.
  const [encodings, setEncodings] = useState<string[]>([])
  useEffect(() => {
    listEncodings()
      .then(setEncodings)
      .catch(() => setEncodings([]))
  }, [])
  const [gotoValue, setGotoValue] = useState("")
  const [branches, setBranches] = useState<GitBranches | null>(null)

  const loadBranches = () => {
    setBranches(null)
    gitBranches(root)
      .then(setBranches)
      .catch(() => setBranches(null))
  }

  const checkout = async (name: string, remote: boolean) => {
    try {
      await gitCheckout(root, name, remote)
      // Refresh in place. A full page reload would tear down the terminals and
      // tabs; instead update the branch + tree now, and let the file watcher
      // reload the open file and re-anchor comments for the new working tree.
      useProject.getState().setGit(await gitInfo(root))
      useProject.getState().bumpTree()
    } catch (e) {
      // Picking a branch closes the menu, so the reason it didn't happen has to
      // go where the other failures go — a dirty working tree is the usual one.
      notifyError("statusBar", String(e))
    }
  }

  const rel = relativePath(root, active)
  // Where the indentation and endings came from. Without this the picker shows
  // a value the reader didn't choose and can't account for.
  const ec = rel ? editorConfigOf(rel) : undefined
  const ecNote = (set: boolean) => (set ? ` — ${t("status.fromEditorconfig")}` : "")

  // Which of the optional indicators are showing. The file path and the caret
  // position are not in here: they are what a status bar is *for*.
  const hidden = useSettings((s) => s.hiddenStatusItems)
  const show = (id: string) => !hidden.includes(id)
  const toggleItem = (id: string) =>
    useSettings.getState().set({
      hiddenStatusItems: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id],
    })
  const ctxItems: ContextMenuItem[] = [
    ...STATUS_ITEMS.map((item) => ({
      label: t(item.labelKey),
      checked: show(item.id),
      onSelect: () => toggleItem(item.id),
    })),
    {
      label: t("status.hideBar"),
      separatorBefore: true,
      onSelect: () => useSettings.getState().set({ showStatusBar: false }),
    },
  ]

  const submitGoto = () => {
    const n = parseInt(gotoValue, 10)
    if (Number.isFinite(n)) goToLine(n)
    setGotoValue("")
  }

  return (
    <footer
      className="flex h-[26px] flex-none items-center justify-between border-t border-line bg-surface px-2 text-xs text-muted select-none"
      onContextMenu={(e) => {
        e.preventDefault()
        setCtx({ x: e.clientX, y: e.clientY })
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {/* A prefix you can't see is a prefix that eats your next keystroke for
            reasons you can't account for. */}
        {chordPending && (
          <span className="mr-1 flex-none rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-medium text-on-accent">
            {t("chord.pending", { key: `${mod}K` })}
          </span>
        )}
        {/* Left-truncate (ellipsis on the left) so the filename stays visible on
            long paths; <bdi> keeps the path itself laid out left-to-right. */}
        <span
          className="block min-w-0 flex-1 overflow-hidden px-1 text-ellipsis whitespace-nowrap"
          style={{ direction: "rtl" }}
          title={rel ?? undefined}
        >
          <bdi>{rel ?? t("status.noFile")}</bdi>
        </span>
        {active && (
          <Popover.Root positioning={{ placement: "top-start" }} lazyMount unmountOnExit>
            <Popover.Trigger title={t("status.goToLine")} className={ITEM}>
              Ln {line}, Col {col}
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner className="z-[120]">
                <Popover.Content className="rounded-md border border-line-strong bg-overlay p-1 shadow-[var(--shadow)] focus:outline-none">
                  <Popover.Context>
                    {(api) => (
                      <Input
                        variant="plain"
                        value={gotoValue}
                        inputMode="numeric"
                        onChange={(e) => setGotoValue(e.target.value.replace(/[^0-9]/g, ""))}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return
                          // Prevent the Enter from reaching the editor once
                          // goToLine refocuses it — otherwise it inserts a
                          // newline (shifting the target line by one and marking
                          // the file dirty).
                          e.preventDefault()
                          submitGoto()
                          api.setOpen(false)
                        }}
                        placeholder={t("status.goToLinePlaceholder")}
                        aria-label={t("status.goToLinePlaceholder")}
                        className="block w-[160px]"
                      />
                    )}
                  </Popover.Context>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        )}
      </div>

      <div className="flex flex-none items-center gap-1">
        {show("preview") && (
          <button
            type="button"
            onClick={() => {
              const p = usePreview.getState()
              if (p.open) p.close()
              else p.openPane()
            }}
            title={t("preview.open")}
            className={`${ITEM} ${previewOpen ? "text-accent" : ""}`}
          >
            <BrowserIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {active && (
          <>
            <Dropdown
              label={`${t("status.indent")}${ecNote(!!ec?.indentStyle || !!ec?.indentSize)}`}
              triggerClassName={ITEM}
              trigger={t(indentKind === "tabs" ? "status.tabs" : "status.spaces", {
                size: indentSize,
              })}
            >
              {(["spaces", "tabs"] as const).map((kind) => (
                <MenuRow
                  key={kind}
                  label={t(kind === "tabs" ? "status.useTabs" : "status.useSpaces")}
                  checked={indentKind === kind}
                  onClick={() => setDoc({ indentKind: kind })}
                />
              ))}
              <div className="my-1 border-t border-line" />
              {[2, 4, 8].map((size) => (
                <MenuRow
                  key={size}
                  label={String(size)}
                  checked={indentSize === size}
                  onClick={() => setDoc({ indentSize: size })}
                />
              ))}
            </Dropdown>
            <span className="px-1">UTF-8</span>
            <Dropdown
              label={`${t("status.eol")}${ecNote(!!ec?.endOfLine)}`}
              triggerClassName={ITEM}
              trigger={eol}
            >
              {(["LF", "CRLF"] as Eol[]).map((opt) => (
                <MenuRow
                  key={opt}
                  label={opt}
                  checked={opt === eol}
                  onClick={() => opt !== eol && convertEol(opt)}
                />
              ))}
            </Dropdown>
            {show("encoding") && (
              <Dropdown
                label={t("status.encoding")}
                triggerClassName={ITEM}
                trigger={encoding}
                className="max-h-72 w-56 overflow-y-auto"
              >
                {/* Two different acts, not one: re-decoding the bytes you have,
                    and choosing what the next save writes. Merging them would
                    silently rewrite a file you only wanted to look at. */}
                <MenuLabel>{t("status.reopenWith")}</MenuLabel>
                {encodings.map((name) => (
                  <MenuRow
                    key={`r:${name}`}
                    value={`r:${name}`}
                    label={name}
                    checked={name === encoding}
                    onClick={() => void reopenWithEncoding(name)}
                  />
                ))}
                <MenuLabel>{t("status.saveWith")}</MenuLabel>
                {encodings.map((name) => (
                  <MenuRow
                    key={`s:${name}`}
                    value={`s:${name}`}
                    label={name}
                    onClick={() => {
                      const view = useDocInfo.getState().view
                      if (!view) return
                      setEncoding(view, name)
                      notify("info", t("status.encodingSaveSet", { name }))
                    }}
                  />
                ))}
              </Dropdown>
            )}
            {language && (
              <Dropdown
                label={t("status.language")}
                triggerClassName={ITEM}
                trigger={language}
                className="max-h-[40vh] overflow-y-auto"
              >
                {LANGUAGE_OPTIONS.map((name) => (
                  <MenuRow
                    key={name}
                    label={name}
                    checked={language === name}
                    onClick={() => setDoc({ language: name, languageOverride: name })}
                  />
                ))}
              </Dropdown>
            )}
          </>
        )}
        {show("branch") && git.isRepo ? (
          <Dropdown
            label={t("status.branch")}
            triggerClassName={ITEM}
            onOpen={loadBranches}
            className="max-h-72 w-60 overflow-y-auto"
            trigger={
              <>
                <GitBranchIcon className="h-[13px] w-[13px]" />
                {git.branch ?? "—"}
              </>
            }
          >
            {!branches ? (
              <p className="px-3 py-2 text-sm text-faint">{t("common.loading")}</p>
            ) : (
              <>
                <MenuLabel>{t("branch.local")}</MenuLabel>
                {branches.local.length === 0 && <p className="px-3 py-1 text-sm text-faint">—</p>}
                {branches.local.map((b) => (
                  <MenuRow
                    key={`l:${b}`}
                    value={`l:${b}`}
                    label={b}
                    checked={b === branches.current}
                    onClick={() => void checkout(b, false)}
                  />
                ))}
                {branches.remote.length > 0 && <MenuLabel>{t("branch.remote")}</MenuLabel>}
                {branches.remote.map((b) => (
                  <MenuRow
                    key={`r:${b}`}
                    value={`r:${b}`}
                    label={b}
                    onClick={() => void checkout(b, true)}
                  />
                ))}
              </>
            )}
          </Dropdown>
        ) : show("branch") ? (
          <span className="px-1 text-faint">{t("status.notGit")}</span>
        ) : null}
        {show("comments") && (
          <span
            className="inline-flex items-center gap-[5px] px-1 whitespace-nowrap"
            title={t("status.openComments")}
          >
            <MessageIcon className="h-[13px] w-[13px]" />
            {t("status.comments", { count: openComments })}
          </span>
        )}
        {show("agent") && <span className="px-1 text-faint">{t("status.agentIdle")}</span>}
        {show("anywhere") && (
          <button
            type="button"
            onClick={() => usePalette.getState().toggleAnywhere(true)}
            title={t("anywhere.title")}
            aria-label={`${t("anywhere.title")} — ${t(anywhereOn ? "anywhere.statusOn" : "anywhere.statusOff")}`}
            className={`${ITEM} text-faint`}
          >
            <DeviceIcon className="h-[13px] w-[13px]" />
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: anywhereOn ? "var(--syn-string)" : "var(--border-strong)" }}
            />
          </button>
        )}
        {show("terminal") && (
          <button
            type="button"
            data-tour="terminal"
            onClick={() => toggleTerminal()}
            title={`${t("terminal.toggle")} (${mod}J)`}
            aria-label={t("terminal.toggle")}
            className={`${ITEM} text-faint`}
          >
            <TerminalIcon className="h-[13px] w-[13px]" />
          </button>
        )}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />}
    </footer>
  )
}
