/** Settings drawer with a sidebar of tabs: Appearance, Editor, Files, System. */

import { getVersion } from "@tauri-apps/api/app"
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import type { TFunction } from "i18next"
import { type CSSProperties, useEffect, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Checkbox } from "@/components/atoms/Checkbox"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { CloseIcon, CodeIcon, SearchIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { SegmentedControl } from "@/components/atoms/SegmentedControl"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"
import { SettingsJson } from "@/components/organisms/SettingsJson"
import { LOCALES, type Locale, type MessageKey, useLocale } from "@/i18n"
import { cliInstalled, installCli } from "@/lib/api"
import { makeDefaultApp } from "@/lib/defaults"
import { allIconThemes } from "@/lib/extIcons"
import { type ExtThemePreview, loadExtThemePreviews } from "@/lib/extThemes"
import { DEFAULT_NESTING } from "@/lib/fileNesting"
import { BUNDLED_FONTS, fontName, fontStack, isPresetFont, SYSTEM_FONTS } from "@/lib/fonts"
import { logPath } from "@/lib/logger"
import { useMarketplace } from "@/lib/marketplace"
import { notify, notifyError } from "@/lib/notice"
import {
  dropProjectOverride,
  isProjectOverride,
  overridesVersion,
  type ProjectKey,
  subscribeOverrides,
} from "@/lib/projectConfig"
import {
  DEFAULTS,
  FONT_SIZE_RANGE,
  isDefaultSetting,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  type SettingsState,
  THEMES,
  type ThemeMode,
  type ThemeName,
  usePalette,
  useProject,
  useSettings,
} from "@/lib/store"
import { useTourGuide } from "@/lib/tour"
import { checkForUpdates } from "@/lib/updater"
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

function AppearanceTab() {
  const settings = useSettings()
  const { locale, setLocale } = useLocale()
  const { t } = useTranslation()

  return (
    <>
      <Section id="theme" title={t("settings.theme")}>
        <Field label={t("settings.themeMode")} settingKey="mode">
          <Select
            value={settings.mode}
            onChange={(v) => settings.set({ mode: v as ThemeMode })}
            options={[
              { value: "manual", label: t("settings.mode.manual") },
              { value: "system", label: t("settings.mode.system") },
              { value: "auto", label: t("settings.mode.auto") },
            ]}
          />
        </Field>

        {/* One grid, always.
            The polarity-split version hid Sepia from anyone whose machine is in
            dark mode and High-Contrast from anyone in light mode — and in the
            default "follow system" mode, clicking a tile of the other polarity
            changed nothing at all. The most-attempted action in a settings
            window was a dead control on first open. Picking a theme now means
            what it says: it switches to Manual and applies, and the line below
            says so before you click rather than after. */}
        <ThemeChoice
          value={
            settings.mode === "manual"
              ? settings.theme
              : prefersDark()
                ? settings.darkTheme
                : settings.lightTheme
          }
          onChange={(theme) => settings.set({ theme, mode: "manual" })}
          t={t}
        />
        {settings.mode !== "manual" && (
          <p className="text-xs leading-relaxed text-faint">{t("settings.themeFollowing")}</p>
        )}
      </Section>
      {/* The section names it; a field label underneath would say it twice. */}
      <Section id="language" title={t("settings.language")}>
        <Select
          value={locale}
          onChange={(v) => setLocale(v as Locale)}
          options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
          ariaLabel={t("settings.language")}
        />
      </Section>
    </>
  )
}

function EditorTab() {
  const settings = useSettings()
  const { t } = useTranslation()

  return (
    <>
      <Section id="typography" title={t("settings.typography")}>
        <Field label={t("settings.codeFont")} settingKey="codeFont">
          <Select
            value={isPresetFont(settings.codeFont) ? settings.codeFont : ""}
            onChange={(v) => settings.set({ codeFont: v })}
            options={[
              { value: "", label: t("settings.codeFontDefault") },
              ...BUNDLED_FONTS.map((f) => ({ value: fontStack(f), label: f })),
              ...SYSTEM_FONTS.map((f) => ({
                value: fontStack(f),
                label: t("settings.codeFontSystem", { font: f }),
              })),
            ]}
          />
        </Field>

        {/* Any installed face, by name — the presets are the quick path, not the
        limit. Empty means "use the preset above". */}
        <CustomFont
          value={isPresetFont(settings.codeFont) ? "" : settings.codeFont}
          onCommit={(name) => settings.set({ codeFont: name ? fontStack(name) : "" })}
        />

        <div className="grid grid-cols-2 gap-4">
          <NumberField
            settingKey="fontSize"
            label={t("settings.fontSize")}
            value={settings.fontSize}
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            step={1}
            onCommit={(n) => settings.set({ fontSize: n })}
          />
          <NumberField
            settingKey="lineHeight"
            label={t("settings.lineHeight")}
            value={settings.lineHeight}
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={0.05}
            onCommit={(n) => settings.set({ lineHeight: n })}
          />
        </div>

        <NumberField
          settingKey="letterSpacing"
          label={t("settings.letterSpacing")}
          value={settings.letterSpacing}
          min={LETTER_SPACING_RANGE.min}
          max={LETTER_SPACING_RANGE.max}
          step={0.01}
          onCommit={(n) => settings.set({ letterSpacing: n })}
          hint={t("settings.letterSpacingHint")}
        />

        <NumberField
          settingKey="rulerColumn"
          label={t("settings.ruler")}
          value={settings.rulerColumn}
          min={0}
          max={200}
          step={1}
          onCommit={(n) => settings.set({ rulerColumn: n })}
          hint={t("settings.rulerHint")}
        />
      </Section>
      <Section id="gutter" title={t("settings.gutter")}>
        <Field label={t("settings.lineNumbers")} settingKey="lineNumbers">
          <Select
            value={settings.lineNumbers}
            onChange={(v) => settings.set({ lineNumbers: v as SettingsState["lineNumbers"] })}
            options={[
              { value: "off", label: t("settings.lineNumbersOff") },
              { value: "on", label: t("settings.lineNumbersOn") },
              { value: "relative", label: t("settings.lineNumbersRelative") },
            ]}
          />
        </Field>

        <Field label={t("settings.activeLine")} settingKey="activeLine">
          <Select
            value={settings.activeLine}
            onChange={(v) => settings.set({ activeLine: v as SettingsState["activeLine"] })}
            options={[
              { value: "off", label: t("settings.activeLineOff") },
              { value: "gutter", label: t("settings.activeLineGutter") },
              { value: "line", label: t("settings.activeLineLine") },
              { value: "both", label: t("settings.activeLineBoth") },
            ]}
          />
        </Field>

        <Field label={t("settings.indentGuides")} settingKey="indentGuides">
          <Select
            value={settings.indentGuides}
            onChange={(v) => settings.set({ indentGuides: v as SettingsState["indentGuides"] })}
            options={[
              { value: "off", label: t("settings.indentGuidesOff") },
              { value: "all", label: t("settings.indentGuidesAll") },
              { value: "active", label: t("settings.indentGuidesActive") },
            ]}
          />
        </Field>
      </Section>
      <Section id="autosave" title={t("settings.autoSave")}>
        <Field label={t("settings.autoSave")} settingKey="autoSave">
          <Select
            value={settings.autoSave}
            onChange={(v) => settings.set({ autoSave: v as SettingsState["autoSave"] })}
            options={[
              { value: "off", label: t("settings.autoSaveOff") },
              { value: "afterDelay", label: t("settings.autoSaveAfterDelay") },
              { value: "onFocusChange", label: t("settings.autoSaveOnFocusChange") },
            ]}
          />
        </Field>
        {settings.autoSave === "afterDelay" && (
          <NumberField
            settingKey="autoSaveDelay"
            label={t("settings.autoSaveDelay")}
            value={settings.autoSaveDelay}
            min={200}
            max={10000}
            step={100}
            onCommit={(n) => settings.set({ autoSaveDelay: n })}
            hint={t("settings.autoSaveDelayHint")}
          />
        )}
      </Section>
      <Section id="aids" title={t("settings.aids")}>
        <ToggleField
          settingKey="wrap"
          checked={settings.wrap}
          onChange={(v) => settings.set({ wrap: v })}
          label={t("editor.wrap")}
          hint={t("settings.wrapHint")}
        />
        {settings.wrap && (
          <NumberField
            settingKey="wrapColumn"
            label={t("settings.wrapColumn")}
            value={settings.wrapColumn}
            min={0}
            max={400}
            step={1}
            onCommit={(n) => settings.set({ wrapColumn: n })}
            hint={t("settings.wrapColumnHint")}
          />
        )}
        <ToggleField
          settingKey="columnSelection"
          checked={settings.columnSelection}
          onChange={(v) => settings.set({ columnSelection: v })}
          label={t("editor.columnSelection")}
          hint={t("settings.columnSelectionHint")}
        />
        <ToggleField
          settingKey="stickyScroll"
          checked={settings.stickyScroll}
          onChange={(v) => settings.set({ stickyScroll: v })}
          label={t("editor.sticky")}
          hint={t("settings.stickyHint")}
        />
        <ToggleField
          settingKey="codeLens"
          checked={settings.codeLens}
          onChange={(v) => settings.set({ codeLens: v })}
          label={t("settings.codeLens")}
          hint={t("settings.codeLensHint")}
        />
        <ToggleField
          settingKey="semanticTokens"
          checked={settings.semanticTokens}
          onChange={(v) => settings.set({ semanticTokens: v })}
          label={t("settings.semanticTokens")}
          hint={t("settings.semanticTokensHint")}
        />
        <ToggleField
          settingKey="colorSwatches"
          checked={settings.colorSwatches}
          onChange={(v) => settings.set({ colorSwatches: v })}
          label={t("settings.colorSwatches")}
          hint={t("settings.colorSwatchesHint")}
        />
        <ToggleField
          settingKey="renderWhitespace"
          checked={settings.renderWhitespace}
          onChange={(v) => settings.set({ renderWhitespace: v })}
          label={t("settings.renderWhitespace")}
          hint={t("settings.whitespaceHint")}
        />
        <ToggleField
          settingKey="bracketMatching"
          checked={settings.bracketMatching}
          onChange={(v) => settings.set({ bracketMatching: v })}
          label={t("settings.bracketMatching")}
          hint={t("settings.bracketMatchingHint")}
        />
        <ToggleField
          settingKey="bracketPairColors"
          checked={settings.bracketPairColors}
          onChange={(v) => settings.set({ bracketPairColors: v })}
          label={t("settings.bracketPairColors")}
          hint={t("settings.bracketPairColorsHint")}
        />
        <ToggleField
          settingKey="suggestOnTyping"
          checked={settings.suggestOnTyping}
          onChange={(v) => settings.set({ suggestOnTyping: v })}
          label={t("settings.suggestOnTyping")}
          hint={t("settings.suggestOnTypingHint")}
        />
        <ToggleField
          settingKey="focusMode"
          checked={settings.focusMode}
          onChange={(v) => settings.set({ focusMode: v })}
          label={t("editor.focus")}
          hint={t("settings.focusHint")}
        />
      </Section>
    </>
  )
}

const ZOOM_PRESETS = [0.9, 1, 1.1, 1.25, 1.5]

function InterfaceTab() {
  const settings = useSettings()
  const { t } = useTranslation()
  const zoomValues = ZOOM_PRESETS.includes(settings.zoom)
    ? ZOOM_PRESETS
    : [...ZOOM_PRESETS, settings.zoom].sort((a, b) => a - b)

  return (
    <>
      <Section id="accessibility" title={t("settings.accessibility")}>
        <Field label={t("settings.zoom")} settingKey="zoom">
          <Select
            value={String(settings.zoom)}
            onChange={(v) => settings.set({ zoom: Number(v) })}
            options={zoomValues.map((z) => ({
              value: String(z),
              label: `${Math.round(z * 100)}%`,
            }))}
          />
        </Field>

        {/* Labelled by what the reader can't separate, with the clinical name in
        brackets — most people know the experience, not the term. */}
        <Field label={t("settings.colorVision")} settingKey="colorVision">
          <Select
            value={settings.colorVision}
            onChange={(v) => settings.set({ colorVision: v as SettingsState["colorVision"] })}
            options={[
              { value: "normal", label: t("settings.colorVisionNormal") },
              { value: "red-green", label: t("settings.colorVisionRedGreen") },
              { value: "blue-yellow", label: t("settings.colorVisionBlueYellow") },
            ]}
          />
          <span className="text-xs leading-relaxed text-faint">
            {t("settings.colorVisionHint")}
          </span>
        </Field>

        {/* Not auto-detected, and the hint says why: a webview cannot see a
        screen reader, and a wrong guess is either a flood or a silence. */}
        <Checkbox
          checked={settings.screenReader}
          onChange={(screenReader) => settings.set({ screenReader })}
          label={t("settings.screenReader")}
          className="text-sm text-muted"
        />
        <span className="-mt-1 text-xs leading-relaxed text-faint">
          {t("settings.screenReaderHint")}
        </span>

        <Checkbox
          checked={settings.audioCues}
          onChange={(audioCues) => settings.set({ audioCues })}
          label={t("settings.audioCues")}
          className="text-sm text-muted"
        />
        <span className="-mt-1 text-xs leading-relaxed text-faint">
          {t("settings.audioCuesHint")}
        </span>

        <Field label={t("settings.reduceMotion")} settingKey="reduceMotion">
          <Select
            value={settings.reduceMotion}
            onChange={(v) => settings.set({ reduceMotion: v as SettingsState["reduceMotion"] })}
            options={[
              { value: "system", label: t("settings.reduceMotionSystem") },
              { value: "on", label: t("settings.reduceMotionOn") },
              { value: "off", label: t("settings.reduceMotionOff") },
            ]}
          />
        </Field>
      </Section>
      <Section id="cursor" title={t("settings.cursor")}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("settings.cursorStyle")} settingKey="cursorStyle">
            <Select
              value={settings.cursorStyle}
              onChange={(v) => settings.set({ cursorStyle: v as SettingsState["cursorStyle"] })}
              options={[
                { value: "line", label: t("settings.cursorLine") },
                { value: "block", label: t("settings.cursorBlock") },
                { value: "underline", label: t("settings.cursorUnderline") },
              ]}
            />
          </Field>
          <Field label={t("settings.cursorBlink")} settingKey="cursorBlink">
            <Select
              value={settings.cursorBlink}
              onChange={(v) => settings.set({ cursorBlink: v as SettingsState["cursorBlink"] })}
              options={[
                { value: "blink", label: t("settings.cursorBlinkBlink") },
                { value: "smooth", label: t("settings.cursorBlinkSmooth") },
                { value: "solid", label: t("settings.cursorBlinkSolid") },
              ]}
            />
          </Field>
        </div>
      </Section>
      <Section id="surfaces" title={t("settings.surfaces")}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("settings.tabBar")} settingKey="tabBar">
            <Select
              value={settings.tabBar}
              onChange={(v) => settings.set({ tabBar: v as SettingsState["tabBar"] })}
              options={[
                { value: "multiple", label: t("settings.tabBarMultiple") },
                { value: "single", label: t("settings.tabBarSingle") },
                { value: "hidden", label: t("settings.tabBarHidden") },
              ]}
            />
          </Field>
          <Field label={t("settings.scrollbar")} settingKey="scrollbar">
            <Select
              value={settings.scrollbar}
              onChange={(v) => settings.set({ scrollbar: v as SettingsState["scrollbar"] })}
              options={[
                { value: "auto", label: t("settings.scrollbarAuto") },
                { value: "always", label: t("settings.scrollbarAlways") },
                { value: "hidden", label: t("settings.scrollbarHidden") },
              ]}
            />
          </Field>
        </div>

        <ToggleField
          settingKey="previewTabs"
          checked={settings.previewTabs}
          onChange={(v) => settings.set({ previewTabs: v })}
          label={t("settings.previewTabs")}
          hint={t("settings.previewTabsHint")}
        />
        <Field label={t("settings.fileIcons")} settingKey="fileIcons">
          <Select
            value={settings.fileIcons}
            onChange={(v) => settings.set({ fileIcons: v as SettingsState["fileIcons"] })}
            options={[
              { value: "off", label: t("settings.fileIconsOff") },
              { value: "mono", label: t("settings.fileIconsMono") },
              { value: "colored", label: t("settings.fileIconsColored") },
            ]}
          />
          <p className="text-xs leading-relaxed text-faint">{t("settings.fileIconsHint")}</p>
        </Field>

        <IconThemeField t={t} />
      </Section>
      <Section id="chrome" title={t("settings.chrome")}>
        <Checkbox
          checked={settings.showActivityBar}
          onChange={(v) => settings.set({ showActivityBar: v })}
          label={t("settings.showActivityBar")}
          className="text-sm text-muted"
        />
        <Checkbox
          checked={settings.showStatusBar}
          onChange={(v) => settings.set({ showStatusBar: v })}
          label={t("settings.showStatusBar")}
          className="text-sm text-muted"
        />
        <Checkbox
          checked={settings.showBreadcrumbs}
          onChange={(v) => settings.set({ showBreadcrumbs: v })}
          label={t("settings.showBreadcrumbs")}
          className="text-sm text-muted"
        />
        <Checkbox
          checked={settings.showRibbon}
          onChange={(v) => settings.set({ showRibbon: v })}
          label={t("editor.ribbon")}
          className="text-sm text-muted"
        />
      </Section>
    </>
  )
}

function FilesTab() {
  const settings = useSettings()
  const isRepo = useProject((s) => s.git.isRepo)
  const { t } = useTranslation()

  return (
    <>
      <Section id="project" title={t("settings.project")}>
        <LinesField
          settingKey="excludeGlobs"
          label={t("settings.exclude")}
          value={settings.excludeGlobs}
          onCommit={(g) => settings.set({ excludeGlobs: g })}
          placeholder={"node_modules\ndist\n*.log"}
          hint={t("settings.excludeHint")}
        />
        <LinesField
          settingKey="searchExcludeGlobs"
          label={t("settings.searchExclude")}
          value={settings.searchExcludeGlobs}
          onCommit={(g) => settings.set({ searchExcludeGlobs: g })}
          rows={3}
          placeholder={"**/*.snap\n**/fixtures/**"}
          hint={t("settings.searchExcludeHint")}
        />
        <ToggleField
          settingKey="fileNesting"
          checked={settings.fileNesting}
          onChange={(v) => settings.set({ fileNesting: v })}
          label={t("settings.fileNesting")}
          hint={t("settings.fileNestingHint")}
        />
        {settings.fileNesting && (
          <LinesField
            settingKey="fileNestingRules"
            label={t("settings.fileNestingRules")}
            value={settings.fileNestingRules}
            onCommit={(rules) => settings.set({ fileNestingRules: rules })}
            rows={5}
            placeholder={DEFAULT_NESTING.join("\n")}
            hint={t("settings.fileNestingRulesHint")}
          />
        )}
        <Field label={t("settings.explorerSort")} settingKey="explorerSort">
          <Select
            value={settings.explorerSort}
            onChange={(v) => settings.set({ explorerSort: v as SettingsState["explorerSort"] })}
            options={[
              { value: "name", label: t("tree.sortName") },
              { value: "type", label: t("tree.sortType") },
              { value: "modified", label: t("tree.sortModified") },
            ]}
          />
          <p className="text-xs leading-relaxed text-faint">{t("settings.explorerSortHint")}</p>
        </Field>
        <ToggleField
          settingKey="restoreSession"
          checked={settings.restoreSession}
          onChange={(v) => settings.set({ restoreSession: v })}
          label={t("settings.restoreSession")}
          hint={t("settings.restoreSessionHint")}
        />
        <NumberField
          settingKey="largeFileGuardMb"
          label={t("settings.largeFileGuard")}
          value={settings.largeFileGuardMb}
          min={0}
          max={64}
          step={1}
          onCommit={(v) => settings.set({ largeFileGuardMb: v })}
          hint={t("settings.largeFileGuardHint")}
        />
      </Section>

      <Section id="onSave" title={t("settings.onSave")}>
        <ToggleField
          settingKey="formatOnSave"
          checked={settings.formatOnSave}
          onChange={(v) => settings.set({ formatOnSave: v })}
          label={t("settings.formatOnSave")}
          hint={t("settings.formatOnSaveHint")}
        />
        <ToggleField
          settingKey="formatOnPaste"
          checked={settings.formatOnPaste}
          onChange={(v) => settings.set({ formatOnPaste: v })}
          label={t("settings.formatOnPaste")}
          hint={t("settings.formatOnPasteHint")}
        />
        <ToggleField
          settingKey="formatOnType"
          checked={settings.formatOnType}
          onChange={(v) => settings.set({ formatOnType: v })}
          label={t("settings.formatOnType")}
          hint={t("settings.formatOnTypeHint")}
        />
        <ToggleField
          settingKey="trimTrailingWhitespace"
          checked={settings.trimTrailingWhitespace}
          onChange={(v) => settings.set({ trimTrailingWhitespace: v })}
          label={t("settings.trimTrailingWhitespace")}
          hint={t("settings.trimTrailingWhitespaceHint")}
        />
        <ToggleField
          settingKey="insertFinalNewline"
          checked={settings.insertFinalNewline}
          onChange={(v) => settings.set({ insertFinalNewline: v })}
          label={t("settings.insertFinalNewline")}
          hint={t("settings.insertFinalNewlineHint")}
        />
        <p className="text-xs leading-relaxed text-faint">{t("settings.editorconfigNote")}</p>
        {/* Files Reado creates. An existing file keeps whatever it already has —
          the status bar converts that one, per document. */}
        <Field label={t("settings.defaultEol")} settingKey="defaultEol">
          <Select
            value={settings.defaultEol}
            onChange={(v) => settings.set({ defaultEol: v as SettingsState["defaultEol"] })}
            options={[
              { value: "auto", label: t("settings.defaultEolAuto") },
              { value: "LF", label: "LF" },
              { value: "CRLF", label: "CRLF" },
            ]}
          />
        </Field>
      </Section>
      {/* Repo-gated: both read git, so outside a repository they would be two
        switches that do nothing. */}
      {isRepo && (
        <Section id="gitSignals" title={t("settings.gitSignals")}>
          <ToggleField
            settingKey="inlineBlame"
            checked={settings.inlineBlame}
            onChange={(v) => settings.set({ inlineBlame: v })}
            label={t("settings.inlineBlame")}
            hint={t("settings.inlineBlameHint")}
          />
          <ToggleField
            settingKey="diffGutter"
            checked={settings.diffGutter}
            onChange={(v) => settings.set({ diffGutter: v })}
            label={t("settings.diffGutter")}
            hint={t("settings.diffGutterHint")}
          />
        </Section>
      )}
    </>
  )
}

/** A font name typed by hand, committed on blur so the editor doesn't reflow on
 *  every keystroke while a name is half-written. */
function CustomFont({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const { t } = useTranslation()
  // Show the bare family name, not the CSS stack it is stored as.
  const bare = fontName(value)
  const [draft, setDraft] = useState(bare)
  useEffect(() => setDraft(bare), [bare])
  return (
    <Field label={t("settings.codeFontCustom")} settingKey="codeFont">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft.trim())}
        placeholder={t("settings.codeFontCustomPlaceholder")}
      />
      <span className="text-xs leading-relaxed text-faint">{t("settings.codeFontCustomHint")}</span>
    </Field>
  )
}

/**
 * A newline-separated list, committed on blur.
 *
 * Four settings are edited this way (tree excludes, search excludes, nesting
 * rules, and the terminal's shell arguments); they differed only in their label,
 * placeholder and height, which are values — so they are parameters, not four
 * copies of the same parse.
 */
function LinesField({
  label,
  settingKey,
  value,
  onCommit,
  rows = 4,
  placeholder,
  hint,
}: {
  label: string
  settingKey: SettingKey
  value: string[]
  onCommit: (lines: string[]) => void
  rows?: number
  placeholder?: string
  hint?: string
}) {
  const [draft, setDraft] = useState(value.join("\n"))
  useEffect(() => setDraft(value.join("\n")), [value])
  return (
    <Field label={label} settingKey={settingKey}>
      <Textarea
        mono
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          onCommit(
            draft
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          )
        }
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className="bg-canvas text-xs"
      />
      {hint && <span className="text-xs leading-relaxed text-faint">{hint}</span>}
    </Field>
  )
}

function SystemTab() {
  const settings = useSettings()
  const { t } = useTranslation()

  return (
    <>
      <Section id="review" title={t("settings.review")}>
        <ToggleField
          settingKey="showResolvedComments"
          checked={settings.showResolvedComments}
          onChange={(v) => settings.set({ showResolvedComments: v })}
          label={t("settings.showResolvedComments")}
          hint={t("settings.showResolvedCommentsHint")}
        />
        <ToggleField
          settingKey="inlineDiagnostics"
          checked={settings.inlineDiagnostics}
          onChange={(v) => settings.set({ inlineDiagnostics: v })}
          label={t("settings.inlineDiagnostics")}
          hint={t("settings.inlineDiagnosticsHint")}
        />
      </Section>

      <Section id="notifications" title={t("settings.notifications")}>
        <Checkbox
          checked={settings.completionSound}
          onChange={(v) => settings.set({ completionSound: v })}
          label={t("settings.completionSound")}
          className="text-sm text-muted"
        />
      </Section>

      <TerminalSettings />
      <DefaultApp />
      <LoggingSettings />
      <CliInstall />
    </>
  )
}

/** The integrated terminal's own appearance and shell. Its font family follows
 *  the editor's; everything else here is the terminal's alone. */
function TerminalSettings() {
  const settings = useSettings()
  const { t } = useTranslation()
  return (
    <Section id="terminal" title={t("settings.terminal")}>
      <NumberField
        settingKey="terminalFontSize"
        label={t("settings.terminalFontSize")}
        value={settings.terminalFontSize}
        min={8}
        max={24}
        step={1}
        onCommit={(n) => settings.set({ terminalFontSize: n })}
      />
      <NumberField
        settingKey="terminalScrollback"
        label={t("settings.terminalScrollback")}
        value={settings.terminalScrollback}
        min={200}
        max={100000}
        step={500}
        onCommit={(n) => settings.set({ terminalScrollback: n })}
      />
      <Field label={t("settings.terminalCursor")} settingKey="terminalCursorStyle">
        <Select
          value={settings.terminalCursorStyle}
          onChange={(v) =>
            settings.set({ terminalCursorStyle: v as SettingsState["terminalCursorStyle"] })
          }
          options={[
            { value: "block", label: t("settings.cursorBlock") },
            { value: "bar", label: t("settings.cursorBar") },
            { value: "underline", label: t("settings.cursorUnderline") },
          ]}
        />
      </Field>
      <Field label={t("settings.terminalShell")} settingKey="terminalShell">
        <Input
          value={settings.terminalShell}
          onChange={(e) => settings.set({ terminalShell: e.target.value })}
          placeholder="/bin/zsh"
          spellCheck={false}
          className="bg-canvas font-mono text-xs"
        />
        <span className="text-xs leading-relaxed text-faint">
          {t("settings.terminalShellHint")}
        </span>
      </Field>
      <LinesField
        settingKey="terminalProfiles"
        label={t("settings.terminalProfiles")}
        value={settings.terminalProfiles}
        onCommit={(lines) => settings.set({ terminalProfiles: lines })}
        rows={3}
        placeholder={"Node REPL = node\nContainer = docker exec -it app sh"}
        hint={t("settings.terminalProfilesHint")}
      />
      {settings.terminalProfiles.length > 0 && (
        <Field label={t("settings.defaultTerminalProfile")} settingKey="defaultTerminalProfile">
          <Input
            value={settings.defaultTerminalProfile}
            onChange={(e) => settings.set({ defaultTerminalProfile: e.target.value })}
            placeholder="Node REPL"
            spellCheck={false}
            className="bg-canvas font-mono text-xs"
          />
          <span className="text-xs leading-relaxed text-faint">
            {t("settings.defaultTerminalProfileHint")}
          </span>
        </Field>
      )}
      {/* Only with an override: the default shell's `-il` is chosen for it, and
        an arguments box that does nothing is worse than no box. */}
      {settings.terminalShell.trim() !== "" && (
        <LinesField
          settingKey="terminalShellArgs"
          label={t("settings.terminalShellArgs")}
          value={settings.terminalShellArgs}
          onCommit={(a) => settings.set({ terminalShellArgs: a })}
          rows={2}
          placeholder={"-l\n-i"}
          hint={t("settings.terminalShellArgsHint")}
        />
      )}
    </Section>
  )
}

/** Make Reado the OS default for text/source files. */
function DefaultApp() {
  const { t } = useTranslation()
  return (
    <Section title={t("defaultApp.title")}>
      <Button variant="secondary" onClick={() => void makeDefaultApp()} className="self-start">
        {t("defaultApp.set")}
      </Button>
      <p className="text-xs leading-relaxed text-faint">{t("defaultApp.hint")}</p>
    </Section>
  )
}

/** Diagnostic logging: enable toggle, detail level, and the file location. */
function LoggingSettings() {
  const { t } = useTranslation()
  const settings = useSettings()
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    logPath()
      .then(setPath)
      .catch(() => {})
  }, [])

  return (
    <Section id="logging" title={t("settings.logging")}>
      <Checkbox
        checked={settings.logEnabled}
        onChange={(v) => settings.set({ logEnabled: v })}
        label={t("settings.logEnabled")}
        className="text-sm text-muted"
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">{t("settings.logLevel")}</span>
        <Select
          value={settings.logLevel}
          ariaLabel={t("settings.logLevel")}
          onChange={(v) => settings.set({ logLevel: v as SettingsState["logLevel"] })}
          options={[
            { value: "error", label: "Error" },
            { value: "warn", label: "Warn" },
            { value: "info", label: "Info" },
            { value: "debug", label: "Debug" },
            { value: "trace", label: "Trace" },
          ]}
        />
      </div>
      {/* The log-file cluster reads as one unit: buttons, its path, and the note. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => path && void revealItemInDir(path).catch(() => {})}
            disabled={!path}
          >
            {t("settings.logReveal")}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              path &&
              void clipboardWriteText(path)
                .then(() => notify("info", t("help.logPathCopied")))
                .catch((e) => notifyError("settings", t("help.logPathCopyFailed"), e))
            }
            disabled={!path}
          >
            {t("settings.logCopyPath")}
          </Button>
        </div>
        {path && <p className="break-all text-xs leading-relaxed text-faint">{path}</p>}
        <p className="text-xs leading-relaxed text-faint">{t("settings.logHint")}</p>
      </div>
    </Section>
  )
}

/** Install the bundled `reado` CLI onto the user's PATH (~/.local/bin). */
function CliInstall() {
  const { t } = useTranslation()
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    cliInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(false))
  }, [])

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const path = await installCli()
      setInstalled(true)
      setResult({ ok: true, text: t("settings.cliDone", { path }) })
    } catch (e) {
      setResult({ ok: false, text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="cli" title={t("settings.cli")}>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={run} disabled={busy}>
          {installed ? t("settings.cliReinstall") : t("settings.cliInstall")}
        </Button>
        {installed && !result && (
          <span className="text-xs text-faint">{t("settings.cliInstalled")}</span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-faint">{t("settings.cliHint")}</p>
      {result && (
        <p className={`text-xs leading-relaxed ${result.ok ? "text-faint" : "text-marker"}`}>
          {result.text}
        </p>
      )}
    </Section>
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

/** Uppercase "eyebrow" label shared by every settings section header. */
/**
 * Two steps, not one.
 *
 * A section title and a field label were sharing a class, so "Typography" and
 * "Code font" read as the same rank and the grouping stopped grouping. The
 * section keeps the uppercase eyebrow — it is a signpost you skim past. The
 * field label drops it: sentence case, lighter, closer to the control it names,
 * so it reads as belonging to the input rather than heading a region.
 */
const SECTION_TITLE = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
const FIELD_LABEL = "text-xs font-medium text-ink/70"

/** A single labelled control (label wraps the input for a clean click target). */
function Field({
  label,
  settingKey,
  children,
}: {
  label: string
  /** The setting this field edits, so it can be marked and undone on its own. */
  settingKey: SettingKey
  children: React.ReactNode
}) {
  return (
    // The mark is a sibling of the <label>, not a child of it: a button inside a
    // label is associated with that label, so `getByLabelText` (and a screen
    // reader) would find two controls under one name.
    <div className="relative flex flex-col">
      <label className="flex flex-col gap-2.5">
        <span className={FIELD_LABEL}>{label}</span>
        {children}
      </label>
      <span className="absolute top-0 right-0">
        <ModifiedMark settingKey={settingKey} />
      </span>
    </div>
  )
}

/** A setting Reado ships a default for — everything in `SettingsState` except
 *  the store's own actions. */
type SettingKey = keyof typeof DEFAULTS

/**
 * Where a setting's value came from, and a one-click way back.
 *
 * Two things a settings dialog has to be able to say, and Reado could say
 * neither: "you changed this" (otherwise the only way to find out is to reset
 * everything and start over) and "this project pins it" — without which you
 * change a value, watch it stick, and never learn that everyone opening this
 * repository gets it too.
 *
 * The project mark wins when both apply: it is the one that explains why the
 * value is what it is.
 */
function ModifiedMark({ settingKey }: { settingKey: SettingKey }) {
  const { t } = useTranslation()
  const modified = useSettings((s) => !isDefaultSetting(settingKey, s))
  const set = useSettings((s) => s.set)
  const root = useProject((s) => s.root)
  // The declared set isn't a store (it is read on hot paths), so re-render on
  // its own version counter instead.
  useSyncExternalStore(subscribeOverrides, overridesVersion)
  const fromProject = isProjectOverride(settingKey)
  if (!fromProject && !modified) return null
  const label = fromProject ? t("settings.clearProject") : t("settings.resetOne")
  return (
    <button
      type="button"
      title={fromProject ? t("settings.fromProjectHint") : label}
      aria-label={label}
      onClick={(e) => {
        // The label wraps its control: without this the click would also focus
        // (and, for a checkbox, toggle) the field being acted on.
        e.preventDefault()
        if (fromProject) void dropProjectOverride(root, settingKey as ProjectKey)
        else set({ [settingKey]: DEFAULTS[settingKey] } as Partial<SettingsState>)
      }}
      className={`ml-1.5 inline-flex cursor-pointer items-center gap-1 align-middle hover:text-ink ${
        fromProject ? "text-marker" : "text-accent"
      }`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="text-[10px] normal-case">
        {fromProject ? t("settings.fromProject") : t("settings.modified")}
      </span>
    </button>
  )
}

/** A grouped section (heading + arbitrary content) for multi-control blocks. */
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

function Section({
  id,
  title,
  children,
}: {
  /** Matches `SETTINGS_INDEX`, so search can scroll to this group. */
  id?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id && `setting-${id}`} className="flex flex-col gap-2.5">
      <span className={SECTION_TITLE}>{title}</span>
      {children}
    </section>
  )
}

/** A checkbox with a one-line description beneath it (aligned past the box), so
 *  a terse toggle explains what it does — and when its effect is visible. */
function ToggleField({
  checked,
  onChange,
  label,
  hint,
  settingKey,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
  settingKey: SettingKey
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center">
        <Checkbox
          checked={checked}
          onChange={onChange}
          label={label}
          className="text-sm text-ink"
        />
        <ModifiedMark settingKey={settingKey} />
      </span>
      <span className="pl-[22px] text-xs leading-relaxed text-faint">{hint}</span>
    </div>
  )
}

/** A clamped numeric field: free typing, committed (and clamped) on blur/Enter. */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
  hint,
  settingKey,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (n: number) => void
  hint?: string
  settingKey: SettingKey
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Number(draft)
    onCommit(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value)
  }
  return (
    <Field label={label} settingKey={settingKey}>
      <Input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="bg-canvas px-2 py-1.5"
      />
      {hint && <span className="text-xs leading-relaxed text-faint">{hint}</span>}
    </Field>
  )
}

/** The icon-theme choice, shown only once an extension contributes one — an
 *  empty dropdown is a worse answer than no dropdown. */
function IconThemeField({ t }: { t: TFunction }) {
  const installed = useMarketplace((s) => s.installed)
  const chosen = useSettings((s) => s.iconTheme)
  const set = useSettings((s) => s.set)
  const themes = allIconThemes(installed)
  if (themes.length === 0) return null
  return (
    <Field label={t("settings.iconTheme")} settingKey="iconTheme">
      <Select
        value={chosen ?? ""}
        onChange={(v) => set({ iconTheme: v || null })}
        options={[
          { value: "", label: t("settings.iconThemeBuiltIn") },
          ...themes.map((th) => ({ value: th.id, label: th.label })),
        ]}
      />
      <p className="text-xs leading-relaxed text-faint">{t("settings.iconThemeHint")}</p>
    </Field>
  )
}

/** Which theme the system would pick right now, so the grid shows what is
 *  actually on screen rather than the manual choice you last made. */
const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches

/** The swatch every theme tile shows: three syntax dots on the theme's own
 *  canvas. Small enough to read a palette from at a glance, which is the only
 *  question a theme picker actually answers.
 *
 *  The previewed palette is applied *here* and nowhere else. It used to sit on
 *  the whole tile, so the tile's name inherited it too — and a light theme's ink
 *  on the dark settings surface came out at a contrast ratio of 1.6, against the
 *  4.5 this very picker holds contributed themes to. Only the swatch wants the
 *  other theme's colours; the label wants the ones the reader is using. */
function ThemeSwatch({ theme, style }: { theme?: string; style?: CSSProperties }) {
  return (
    <span
      data-theme={theme}
      style={style}
      className="flex h-[34px] items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5"
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--syn-control)" }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--syn-string)" }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--marker)" }} />
    </span>
  )
}

const tileClass = (selected: boolean) =>
  `flex flex-col gap-2 rounded-md border p-2 ${selected ? "border-accent ring-1 ring-accent" : "border-line"}`

function ThemeChoice({
  value,
  onChange,
  polarity,
  t,
}: {
  value: ThemeName
  onChange: (theme: ThemeName) => void
  /** Restrict to the light or dark half of the pair (System / Trust Reado). */
  polarity?: "light" | "dark"
  t: TFunction
}) {
  const options = polarity
    ? THEMES.filter((theme) =>
        polarity === "light"
          ? theme.includes("light") || theme.includes("sepia")
          : theme.includes("dark") || theme.includes("contrast"),
      )
    : THEMES

  // Themes contributed by installed extensions, loaded and measured once. The
  // preview inlines each theme's own mapped tokens over its built-in base, so a
  // tile shows the colours that theme will actually produce here — not a guess.
  const installed = useMarketplace((s) => s.installed)
  const [contributed, setContributed] = useState<ExtThemePreview[]>([])
  useEffect(() => {
    let live = true
    void loadExtThemePreviews(installed).then((p) => live && setContributed(p))
    return () => {
      live = false
    }
  }, [installed])

  // A contributed theme's polarity comes from the base it resolved to, not from
  // guessing at its name.
  const extOptions = polarity
    ? contributed.filter((p) => p.resolved.base === `reado-${polarity}`)
    : contributed

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {options.map((theme) => (
          <button
            key={theme}
            type="button"
            onClick={() => onChange(theme)}
            aria-pressed={value === theme}
            title={t(`theme.${theme}` as MessageKey)}
            className={tileClass(value === theme)}
          >
            <ThemeSwatch theme={theme} />
            <span className="text-left text-xs text-muted">
              {t(`theme.${theme}` as MessageKey)}
            </span>
          </button>
        ))}
      </div>

      {extOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-faint uppercase">
            {t("theme.fromExtension")}
          </span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
            {extOptions.map(({ theme, resolved, verdict }) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChange(theme.id)}
                aria-pressed={value === theme.id}
                title={theme.label}
                className={tileClass(value === theme.id)}
              >
                <ThemeSwatch
                  theme={resolved.base}
                  style={
                    Object.fromEntries(
                      Object.entries(resolved.tokens).map(([k, v]) => [`--${k}`, v]),
                    ) as CSSProperties
                  }
                />
                <span className="truncate text-left text-xs text-muted">{theme.label}</span>
                {verdict.ratio !== null && (
                  // Reado holds its own themes to WCAG AA. A contributed theme
                  // is measured against the same bar and labelled — never
                  // blocked, because it is the reader's editor.
                  <span
                    className={`text-left text-xs ${verdict.passes ? "text-faint" : "text-danger"}`}
                    title={t(verdict.passes ? "theme.contrastPass" : "theme.contrastFail", {
                      ratio: verdict.ratio.toFixed(1),
                    })}
                  >
                    {verdict.ratio.toFixed(1)}:1
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
