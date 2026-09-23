/** The labelled controls every settings tab is built from. */

import { useEffect, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/atoms/Checkbox"
import { Input } from "@/components/atoms/Input"
import { Textarea } from "@/components/atoms/Textarea"
import {
  dropProjectOverride,
  isProjectOverride,
  overridesVersion,
  type ProjectKey,
  subscribeOverrides,
} from "@/lib/projectConfig"
import {
  DEFAULTS,
  isDefaultSetting,
  type SettingsState,
  useProject,
  useSettings,
} from "@/lib/store"

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
export const SECTION_TITLE = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
export const FIELD_LABEL = "text-xs font-medium text-ink/70"

/** A single labelled control (label wraps the input for a clean click target). */
export function Field({
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
export type SettingKey = keyof typeof DEFAULTS

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
export function ModifiedMark({ settingKey }: { settingKey: SettingKey }) {
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
export function Section({
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
export function ToggleField({
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
export function NumberField({
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

/**
 * A newline-separated list, committed on blur.
 *
 * Four settings are edited this way (tree excludes, search excludes, nesting
 * rules, and the terminal's shell arguments); they differed only in their label,
 * placeholder and height, which are values — so they are parameters, not four
 * copies of the same parse.
 */
export function LinesField({
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
