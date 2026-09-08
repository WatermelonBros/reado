/**
 * The shortcuts, as text you can rewrite.
 *
 * The list starts from what is actually in force — defaults included — because a
 * file that opens empty tells you nothing about what there is to change. Saving
 * keeps only the lines that differ, so a future release's new default reaches
 * you instead of being frozen by a copy you made today.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { TextDialog } from "@/components/molecules/TextDialog"
import { bindingsToText, overridesFor, resolveBindings, unknownCommands } from "@/lib/keybindings"
import { knownCommands } from "@/lib/menu"
import { useSettings } from "@/lib/store"

interface Props {
  open: boolean
  onClose: () => void
}

export function KeybindingsEditor({ open, onClose }: Props) {
  const { t } = useTranslation()

  const apply = (draft: string) => {
    const lines = draft.split("\n")
    // A line pointing at a command that doesn't exist would silently do nothing
    // forever; naming it is the difference between a typo and a mystery.
    const unknown = unknownCommands(lines, knownCommands())
    const overrides = overridesFor(lines)
    useSettings.getState().set({ keybindings: overrides })
    return [
      t("sc.editSaved", { count: resolveBindings(overrides).size }),
      unknown.length > 0 && t("sc.editUnknown", { names: unknown.join(", ") }),
    ]
      .filter(Boolean)
      .join(" ")
  }

  return (
    <TextDialog
      open={open}
      onClose={onClose}
      title={t("sc.editTitle")}
      hint={t("sc.editHint")}
      // Read through the store rather than a subscribed value: Apply writes to
      // it, and the reload right after has to see what was just written.
      load={() => bindingsToText(useSettings.getState().keybindings)}
      onApply={apply}
      applyLabel={t("sc.editApply")}
      actions={({ reload }) => (
        <Button
          variant="secondary"
          onClick={() => {
            useSettings.getState().set({ keybindings: [] })
            reload()
          }}
        >
          {t("sc.editReset")}
        </Button>
      )}
    />
  )
}
