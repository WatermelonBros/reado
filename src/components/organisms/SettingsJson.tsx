/**
 * The settings, as text you can read, diff and edit.
 *
 * The dialog is the discoverable half of `lib/settingsJson.ts`: it shows what
 * Reado will write and — the part that matters — what it *won't*, so a typo'd
 * key doesn't vanish without a word.
 */
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { TextDialog } from "@/components/molecules/TextDialog"
import { applySettingsJson, parseSettingsJson, settingsToJson } from "@/lib/settingsJson"

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsJson({ open, onClose }: Props) {
  const { t } = useTranslation()

  const apply = (draft: string) => {
    const parsed = parseSettingsJson(draft)
    if (!parsed) return t("settings.jsonInvalid")
    const count = applySettingsJson(parsed)
    // Both halves of the outcome, always: "applied 12" alone would hide the two
    // lines that were quietly dropped.
    return [
      t("settings.jsonApplied", { count }),
      parsed.rejected.length > 0 &&
        t("settings.jsonRejected", {
          count: parsed.rejected.length,
          names: parsed.rejected.join(", "),
        }),
    ]
      .filter(Boolean)
      .join(" ")
  }

  return (
    <TextDialog
      open={open}
      onClose={onClose}
      title={t("settings.json")}
      hint={t("settings.jsonHint")}
      load={settingsToJson}
      onApply={apply}
      applyLabel={t("settings.jsonApply")}
      actions={({ draft, reload }) => (
        <>
          <Button variant="ghost" onClick={() => void clipboardWriteText(draft).catch(() => {})}>
            {t("settings.jsonCopy")}
          </Button>
          <Button variant="secondary" onClick={reload}>
            {t("settings.jsonRevert")}
          </Button>
        </>
      )}
    />
  )
}
