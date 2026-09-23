import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { BUNDLED_FONTS, fontName, fontStack, isPresetFont, SYSTEM_FONTS } from "@/lib/fonts"
import {
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  type SettingsState,
  useSettings,
} from "@/lib/store"
import { Field, NumberField, Section, ToggleField } from "./fields"

export function EditorTab() {
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
