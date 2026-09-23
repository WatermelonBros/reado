import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/atoms/Checkbox"
import { Select } from "@/components/atoms/Select"
import { allIconThemes } from "@/lib/extIcons"
import { useMarketplace } from "@/lib/marketplace"
import { type SettingsState, useSettings } from "@/lib/store"
import { Field, Section, ToggleField } from "./fields"

const ZOOM_PRESETS = [0.9, 1, 1.1, 1.25, 1.5]

export function InterfaceTab() {
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
