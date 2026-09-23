/**
 * The status bar's right-hand items, one component each, in the order they
 * appear. An entry with a `labelKey` is one the bar's context menu can switch
 * off; the rest (the document's indentation, endings and language) show
 * whenever there is a document to describe.
 */
import { type ComponentType, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import {
  BrowserIcon,
  DeviceIcon,
  MascotIcon,
  MessageIcon,
  TerminalIcon,
} from "@/components/atoms/icons"
import type { MessageKey } from "@/i18n"
import { anywhereStatus } from "@/lib/api"
import { openCount, useComments } from "@/lib/comments"
import { convertEol, type Eol, editorConfigOf, LANGUAGE_OPTIONS, useDocInfo } from "@/lib/docInfo"
import { useMascot } from "@/lib/mascot"
import { usePreview } from "@/lib/preview"
import { DEFAULT_PROFILE_ID, useProfiles } from "@/lib/profiles"
import { mod } from "@/lib/shortcuts"
import { usePalette, useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { BranchItem } from "./BranchItem"
import { EncodingGroup } from "./EncodingGroup"
import { ITEM, type StatusItemProps } from "./shared"

/** Where the indentation and endings came from. Without this the picker shows
 *  a value the reader didn't choose and can't account for. */
function useEcNote() {
  const { t } = useTranslation()
  return (set: boolean) => (set ? ` — ${t("status.fromEditorconfig")}` : "")
}

function PreviewItem() {
  const previewOpen = usePreview((s) => s.open)
  const { t } = useTranslation()
  return (
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
  )
}

function IndentItem({ rel }: StatusItemProps) {
  const indentKind = useDocInfo((s) => s.indentKind)
  const indentSize = useDocInfo((s) => s.indentSize)
  const setDoc = useDocInfo((s) => s.set)
  const ecNote = useEcNote()
  const { t } = useTranslation()
  if (!rel) return null
  const ec = editorConfigOf(rel)
  return (
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
  )
}

function EolItem({ rel }: StatusItemProps) {
  const eol = useDocInfo((s) => s.eol)
  const ecNote = useEcNote()
  const { t } = useTranslation()
  if (!rel) return null
  const ec = editorConfigOf(rel)
  return (
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
  )
}

function LanguageItem({ rel }: StatusItemProps) {
  const language = useDocInfo((s) => s.language)
  const setDoc = useDocInfo((s) => s.set)
  const { t } = useTranslation()
  if (!rel || !language) return null
  return (
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
  )
}

/** Which configuration is in use. Shown only when it is not the default
 *  one: a bar that always says "Default" is a bar saying nothing. */
function ProfileItem() {
  const profiles = useProfiles((s) => s.profiles)
  const activeProfileId = useProfiles((s) => s.activeId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0]
  const { t } = useTranslation()
  if (activeProfile.id === DEFAULT_PROFILE_ID) return null
  return (
    <Dropdown
      label={t("profile.status")}
      triggerClassName={ITEM}
      trigger={activeProfile.name}
      className="max-h-72 w-56 overflow-y-auto"
    >
      {profiles.map((p) => (
        <MenuRow
          key={p.id}
          label={p.name}
          checked={p.id === activeProfile.id}
          onClick={() => useProfiles.getState().switchTo(p.id)}
        />
      ))}
    </Dropdown>
  )
}

function CommentsItem() {
  const openComments = useComments((s) => openCount(s.comments))
  const { t } = useTranslation()
  return (
    <span
      className="inline-flex items-center gap-[5px] px-1 whitespace-nowrap"
      title={t("status.openComments")}
    >
      <MessageIcon className="h-[13px] w-[13px]" />
      {t("status.comments", { count: openComments })}
    </span>
  )
}

function AgentItem() {
  // The agent segment used to be the constant `status.agentIdle` — it announced
  // an idle agent while the companion, reading the same facts, showed `think`.
  // It now reads those facts: an agent pane has to exist at all, and the mascot
  // state is what Reado already knows about the turn.
  const hasAgent = useTerminals((s) => s.agentTerminals.length > 0)
  const mascotState = useMascot((s) => s.state)
  const { t } = useTranslation()
  const agentStatusKey: MessageKey = !hasAgent
    ? "status.agentIdle"
    : mascotState === "think"
      ? "status.agentWorking"
      : mascotState === "ask"
        ? "status.agentAsking"
        : "status.agentIdle"
  return <span className="px-1 text-faint">{t(agentStatusKey)}</span>
}

/** Reado Anywhere: a phone icon + a live dot (green when the LAN server is up),
 *  opening the pairing dialog. Re-checked whenever the dialog opens/closes. */
function AnywhereItem() {
  const anywhereOpen = usePalette((s) => s.anywhereOpen)
  const [anywhereOn, setAnywhereOn] = useState(false)
  const { t } = useTranslation()
  useEffect(() => {
    anywhereStatus()
      .then((s) => setAnywhereOn(!!s))
      .catch(() => setAnywhereOn(false))
  }, [anywhereOpen])
  return (
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
  )
}

/** Right-clicking the companion sends it away; without this the only way back
 *  is the settings dialog. */
function MascotItem() {
  const mascotOn = useSettings((s) => s.mascot)
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => useSettings.getState().set({ mascot: !mascotOn })}
      title={t("mascot.toggle")}
      aria-label={t("mascot.toggle")}
      aria-pressed={mascotOn}
      className={`${ITEM} ${mascotOn ? "text-accent" : "text-faint"}`}
    >
      <MascotIcon className="h-[13px] w-[13px]" />
    </button>
  )
}

/** Only while it is on: a mode you cannot see is a mode that confuses
 *  whoever next touches the keyboard — but an indicator that is always
 *  there, and always says "off", is noise. */
function ColumnItem() {
  const columnSelection = useSettings((s) => s.columnSelection)
  const { t } = useTranslation()
  if (!columnSelection) return null
  return (
    <button
      type="button"
      onClick={() => useSettings.getState().set({ columnSelection: false })}
      title={t("status.columnSelection")}
      aria-label={t("status.columnSelection")}
      className={`${ITEM} text-accent`}
    >
      {t("editor.columnSelection")}
    </button>
  )
}

function TerminalItem() {
  const toggleTerminal = useTerminals((s) => s.toggle)
  const { t } = useTranslation()
  return (
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
  )
}

/**
 * The right-hand items, in the order they appear.
 *
 * The ones with a `labelKey` are the indicators the status bar lets you switch
 * off — deliberately not everything: the file path and the caret position are
 * what a status bar is for, and a bar you can empty completely is a bar you
 * should have hidden instead (View ▸ Toggle Status Bar, also in this menu).
 */
export const STATUS_ITEMS: Array<{
  id: string
  labelKey?: MessageKey
  Item: ComponentType<StatusItemProps>
}> = [
  { id: "preview", labelKey: "preview.open", Item: PreviewItem },
  { id: "indent", Item: IndentItem },
  { id: "eol", Item: EolItem },
  { id: "encoding", labelKey: "status.encoding", Item: EncodingGroup },
  { id: "language", Item: LanguageItem },
  { id: "profile", labelKey: "profile.status", Item: ProfileItem },
  { id: "branch", labelKey: "status.branch", Item: BranchItem },
  { id: "comments", labelKey: "status.openComments", Item: CommentsItem },
  { id: "agent", labelKey: "status.agentIdle", Item: AgentItem },
  { id: "anywhere", labelKey: "anywhere.title", Item: AnywhereItem },
  { id: "mascot", labelKey: "settings.mascot", Item: MascotItem },
  { id: "column", labelKey: "editor.columnSelection", Item: ColumnItem },
  { id: "terminal", labelKey: "terminal.toggle", Item: TerminalItem },
]
