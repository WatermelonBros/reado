/**
 * Themed checkbox built on rind-ui's headless `Checkbox`.
 *
 * Rind supplies the accessible control (a `button role="checkbox"`, label
 * association, keyboard, hidden input for forms); we style the box and check. API mirrors a plain controlled
 * checkbox so call sites stay terse.
 */
import { Checkbox as RindCheckbox } from "@rind-ui/react"

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  /** Extra classes for the root (e.g. text size/colour). */
  className?: string
  title?: string
  /** Shown but not changeable (a setting the plan doesn't include, say). */
  disabled?: boolean
}

export function Checkbox({
  checked,
  onChange,
  label,
  className = "",
  title,
  disabled,
}: CheckboxProps) {
  return (
    <RindCheckbox.Root
      checked={checked}
      onCheckedChange={(c) => onChange(c === true)}
      title={title}
      disabled={disabled}
      className={`flex cursor-pointer items-center gap-2 select-none data-[disabled]:cursor-default data-[disabled]:opacity-50 ${className}`}
    >
      <RindCheckbox.Control className="grid cursor-[inherit] h-[var(--check-size)] w-[var(--check-size)] flex-none place-items-center rounded-[3px] border border-line-strong bg-canvas text-on-accent transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent">
        <RindCheckbox.Indicator>
          {({ checked }) =>
            checked && (
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12l5 5L19 7" />
              </svg>
            )
          }
        </RindCheckbox.Indicator>
      </RindCheckbox.Control>
      <RindCheckbox.Label>{label}</RindCheckbox.Label>
    </RindCheckbox.Root>
  )
}
