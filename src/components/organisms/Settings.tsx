/** Settings drawer with a sidebar of tabs: Appearance, Editor, Files, System. */

import { getVersion } from "@tauri-apps/api/app"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { CloseIcon, CodeIcon, SearchIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { SegmentedControl } from "@/components/atoms/SegmentedControl"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"
import { SettingsJson } from "@/components/organisms/SettingsJson"
import type { MessageKey } from "@/i18n"
import { notify } from "@/lib/notice"
import { usePalette, useSettings } from "@/lib/store"
import { useTourGuide } from "@/lib/tour"
import { checkForUpdates } from "@/lib/updater"
import { AppearanceTab } from "./settings/AppearanceTab"
import { EditorTab } from "./settings/EditorTab"
import { FilesTab } from "./settings/FilesTab"
import { InterfaceTab } from "./settings/InterfaceTab"
import { SystemTab } from "./settings/SystemTab"
import { findSettings, type SettingEntry } from "./settingsIndex"

type TabId = "appearance" | "editor" | "interface" | "files" | "system"

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "editor", labelKey: "settings.tabs.editor" },
  { id: "interface", labelKey: "settings.tabs.interface" },
  { id: "files", labelKey: "settings.tabs.files" },
  { id: "system", labelKey: "settings.tabs.system" },
]

export function Settings() {
  const open = usePalette((s) => s.settingsOpen)
  const toggle = usePalette((s) => s.toggleSettings)
  const jsonOpen = usePalette((s) => s.settingsJsonOpen)
  const toggleJson = usePalette((s) => s.toggleSettingsJson)
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>("appearance")
  // The section a search result asked for. Cleared once it has been revealed,
  // so re-picking the same result flashes it again.
  const [jumpTo, setJumpTo] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!jumpTo) return
    // One frame, so the tab that owns the section has rendered.
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(`setting-${jumpTo}`)
      el?.scrollIntoView?.({ block: "center", behavior: "smooth" })
      // Optional: Web Animations isn't everywhere, and a missing flash must not
      // cost the reader the scroll that actually took them there.
      el?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 600, easing: "ease-out" })
      setJumpTo(null)
    })
    return () => cancelAnimationFrame(id)
  }, [jumpTo])

  return (
    // A modal rather than a drawer: settings have outgrown a side panel, and the
    // two-column shape below needs room for a readable rail *and* a readable
    // measure of content beside it.
    <Modal
      open={open}
      onOpenChange={(o) => toggle(o)}
      ariaLabel={t("settings.title")}
      className="flex h-[min(760px,88vh)] w-[min(1040px,92vw)] flex-col overflow-hidden"
    >
      <header className="flex flex-none items-center gap-4 border-b border-line px-6 py-4">
        <h2 className="m-0 flex-none text-lg font-semibold">{t("settings.title")}</h2>
        {/* In the header, not the rail: a 208px column can't hold a result that
            has to read "Editor › Typography · Line height". */}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.searchPlaceholder")}
          aria-label={t("settings.searchPlaceholder")}
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          className="bg-canvas"
          // In the header, not the rail: a 208px column can't hold a result
          // that has to read "Editor › Typography · Line height".
          wrapperClassName="max-w-sm min-w-0 flex-1"
        />
        <span className="flex-1" />
        {/* The text view of the same preferences — the one form you can diff,
            paste into an issue, or carry between machines by hand. */}
        <IconButton
          label={t("settings.json")}
          icon={<CodeIcon className="h-4 w-4" />}
          onClick={() => toggleJson(true)}
        />
        <IconButton
          label={t("settings.close")}
          icon={<CloseIcon />}
          onClick={() => toggle(false)}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-48 flex-none flex-col gap-2 border-r border-line p-2">
          {/* Tab rail — the active thumb slides between tabs. */}
          <SegmentedControl
            value={tab}
            onChange={(id) => {
              // Otherwise the rail's thumb slides and the pane doesn't change:
              // a visibly-responding control that does nothing, on the obvious
              // escape route from a search that found nothing.
              setQuery("")
              setTab(id)
            }}
            orientation="vertical"
            segments={TABS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }))}
            ariaLabel={t("settings.title")}
            className="gap-0.5"
            segmentClassName="rounded-md px-3 py-1.5 text-left text-sm"
            thumbClassName="bg-surface rounded-md"
          />
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-6 py-6">
            {query.trim() ? (
              <SearchResults
                query={query}
                onPick={(hit) => {
                  setTab(hit.tab)
                  setQuery("")
                  setJumpTo(hit.section)
                }}
              />
            ) : (
              <>
                {tab === "appearance" && <AppearanceTab />}
                {tab === "editor" && <EditorTab />}
                {tab === "interface" && <InterfaceTab />}
                {tab === "files" && <FilesTab />}
                {tab === "system" && <SystemTab />}
              </>
            )}
          </div>
          <AppVersion />
        </div>
      </div>
      <SettingsJson open={jsonOpen} onClose={() => toggleJson(false)} />
    </Modal>
  )
}

/** App version + a manual update check. */
function AppVersion() {
  const { t } = useTranslation()
  const [version, setVersion] = useState("")
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])
  return (
    <div className="flex flex-none items-center justify-between gap-4 border-t border-line px-6 py-3 text-xs">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex-none text-faint">Reado {version ? `v${version}` : "—"}</span>
        <ResetAll />
      </div>
      <div className="flex flex-none items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            usePalette.getState().toggleSettings(false)
            useTourGuide.getState().run()
          }}
        >
          {t("tour.replay")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => usePalette.getState().toggleShortcuts(true)}
        >
          {t("settings.shortcuts")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => checkForUpdates(true)}>
          {t("settings.checkUpdates")}
        </Button>
      </div>
    </div>
  )
}

/**
 * The way back.
 *
 * Every other control here is reversible only if you remember what it was, and
 * after an evening of moving the font size, the line height and the theme
 * around, nobody does. It sits by the version rather than beside the actions on
 * the right: it undoes the whole pane, so it shouldn't sit in the row you reach
 * into for one more thing.
 */
function ResetAll() {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
        {t("settings.reset")}
      </Button>
    )
  return (
    <InlineConfirm
      question={t("settings.resetAsk")}
      confirmLabel={t("settings.reset")}
      onConfirm={() => {
        useSettings.getState().reset()
        setAsking(false)
        notify("info", t("settings.resetDone"))
      }}
      onCancel={() => setAsking(false)}
    />
  )
}

/**
 * Search results, in the content pane.
 *
 * They navigate rather than filter: a result says where the control lives
 * ("Editor › Typography"), and picking it opens that tab and flashes the group.
 * Filtering would hide the neighbours, and half of finding a setting is
 * recognising it next to the ones it belongs with.
 */
function SearchResults({ query, onPick }: { query: string; onPick: (hit: SettingEntry) => void }) {
  const { t } = useTranslation()
  const hits = findSettings(query, (k) => t(k), 20)

  if (hits.length === 0) {
    return <p className="text-sm text-faint">{t("settings.searchNone")}</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {hits.map((hit) => (
        <li key={hit.key}>
          <button
            type="button"
            onClick={() => onPick(hit)}
            className="w-full cursor-pointer rounded-md border border-transparent px-3 py-2 text-left hover:border-line hover:bg-surface"
          >
            <span className="block text-sm text-ink">{t(hit.key)}</span>
            <span className="mt-0.5 block text-xs text-faint">
              {t(TABS.find((tb) => tb.id === hit.tab)?.labelKey ?? "settings.title")} ›{" "}
              {t(hit.sectionKey)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
