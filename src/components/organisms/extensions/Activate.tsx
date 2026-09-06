/**
 * Turn on what an installed extension contributes.
 *
 * Installing a theme and having nothing happen is the sharpest edge in a
 * marketplace: the work is done, the result is invisible, and the next step
 * lives in another window. A contributed colour theme or icon set is selectable,
 * so it gets a control right on the row — one button when the extension carries
 * a single one, a picker when it carries a pack.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { CheckIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import type { InstalledExt } from "@/lib/api"
import { iconThemesOf } from "@/lib/extIcons"
import { themesOf } from "@/lib/extThemes"
import { type ThemeName, useSettings } from "@/lib/store"

interface Selectable {
  id: string
  label: string
  kind: "theme" | "icons"
}

export function Activate({ ext }: { ext: InstalledExt }) {
  const { t } = useTranslation()
  const theme = useSettings((s) => s.theme)
  const iconTheme = useSettings((s) => s.iconTheme)
  const set = useSettings((s) => s.set)

  const items: Selectable[] = [
    ...themesOf(ext).map((x) => ({ id: x.id, label: x.label, kind: "theme" as const })),
    ...iconThemesOf(ext).map((x) => ({ id: x.id, label: x.label, kind: "icons" as const })),
  ]
  if (items.length === 0) return null

  const activeId = items.find((i) => (i.kind === "theme" ? theme === i.id : iconTheme === i.id))?.id
  const use = (item: Selectable) =>
    item.kind === "theme"
      ? // Choosing a theme is a manual choice; leaving the mode on system or
        // time-of-day would switch straight back off it.
        set({ theme: item.id as ThemeName, mode: "manual" })
      : set({ iconTheme: item.id })

  if (activeId) {
    return (
      <span className="flex items-center gap-1 text-xs text-ok">
        <CheckIcon className="h-3.5 w-3.5" />
        {t("ext.inUse")}
      </span>
    )
  }

  if (items.length === 1) {
    return (
      <Button variant="secondary" size="sm" onClick={() => use(items[0])}>
        {t("ext.use")}
      </Button>
    )
  }

  return (
    <Select
      ariaLabel={t("ext.chooseContribution")}
      value=""
      onChange={(v) => {
        const item = items.find((i) => i.id === v)
        if (item) use(item)
      }}
      options={[
        { value: "", label: t("ext.chooseContribution") },
        ...items.map((i) => ({ value: i.id, label: i.label })),
      ]}
    />
  )
}
