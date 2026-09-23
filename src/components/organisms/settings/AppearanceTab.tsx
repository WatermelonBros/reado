import type { TFunction } from "i18next"
import { type CSSProperties, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Select } from "@/components/atoms/Select"
import { LOCALES, type Locale, type MessageKey, useLocale } from "@/i18n"
import { type ExtThemePreview, loadExtThemePreviews } from "@/lib/extThemes"
import { useMarketplace } from "@/lib/marketplace"
import { THEMES, type ThemeMode, type ThemeName, useSettings } from "@/lib/store"
import { Field, Section } from "./fields"

export function AppearanceTab() {
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
