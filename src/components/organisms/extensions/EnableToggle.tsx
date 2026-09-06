/**
 * Turn an extension on or off.
 *
 * A button, not a checkbox: a checked box next to "Use it" makes you read a
 * state and then work out the verb, and it sat there checked on every row saying
 * nothing. A button names the action it performs, which is the whole job.
 *
 * Only shown for something installed — switching on what you don't have is a
 * preference about nothing.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { useExtensions } from "@/lib/extensions"

export function EnableToggle({ id }: { id: string }) {
  const { t } = useTranslation()
  const disabled = useExtensions((s) => s.disabled)
  const toggle = useExtensions((s) => s.toggle)
  const enabled = !disabled.includes(id)

  return (
    <Button variant="secondary" size="sm" onClick={() => toggle(id, !enabled)}>
      {t(enabled ? "ext.disable" : "ext.enable")}
    </Button>
  )
}
