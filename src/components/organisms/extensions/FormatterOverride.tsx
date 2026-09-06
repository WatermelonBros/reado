/**
 * Pin, or switch off, the formatter for the open file's type in this project.
 *
 * Detection answers this on its own almost always. The override is for the rest
 * — a repo where the declaration is wrong, or absent, or where you simply want
 * the other one — and it lives here, scoped to the file you have open, because
 * that is the moment you want it: "not this one, here".
 */
import { useTranslation } from "react-i18next"
import { Select } from "@/components/atoms/Select"
import type { FormatterStatus } from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { FORMATTERS } from "@/lib/extensions"
import { extOf, useFormatterOverrides } from "@/lib/formatters"
import { useProject } from "@/lib/store"

export function FormatterOverride({
  status,
  filter,
}: {
  status: Record<string, FormatterStatus>
  filter: string
}) {
  const { t } = useTranslation()
  const root = useProject((s) => s.root)
  const active = useProject((s) => s.active)
  const ext = active ? extOf(toRelative(root, active)) : ""
  const current = useFormatterOverrides((s) => s.byRoot[root]?.[ext])
  const set = useFormatterOverrides((s) => s.set)

  const candidates = FORMATTERS.filter((f) => status[f.id]?.exts.includes(ext))
  // Only where it's the question being asked: with no file open, or under a
  // filter that isn't about formatting, it's a control in the way.
  if (!ext || candidates.length === 0 || (filter !== "all" && filter !== "formatters")) return null

  return (
    <div className="border-b border-line/60 px-3 py-2.5">
      <p className="mb-1 text-xs text-muted">{t("ext.formatterFor", { ext })}</p>
      <Select
        ariaLabel={t("ext.formatterFor", { ext })}
        value={current ?? ""}
        onChange={(v) => set(root, ext, v === "" ? null : v)}
        options={[
          { value: "", label: t("ext.formatterAuto") },
          ...candidates.map((f) => ({ value: f.id, label: f.name })),
          { value: "off", label: t("ext.formatterOff", { ext }) },
        ]}
      />
    </div>
  )
}
