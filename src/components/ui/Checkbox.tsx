/**
 * Themed checkbox built on Ark UI's headless `Checkbox`.
 *
 * Ark supplies the accessible control (label association, keyboard, hidden
 * input for forms); we style the box and check. API mirrors a plain controlled
 * checkbox so call sites stay terse.
 */
import { Checkbox as ArkCheckbox } from "@ark-ui/react/checkbox";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  /** Extra classes for the root (e.g. text size/colour). */
  className?: string;
  title?: string;
}

export function Checkbox({ checked, onChange, label, className = "", title }: CheckboxProps) {
  return (
    <ArkCheckbox.Root
      checked={checked}
      onCheckedChange={(d) => onChange(d.checked === true)}
      title={title}
      className={`flex cursor-pointer items-center gap-2 select-none ${className}`}
    >
      <ArkCheckbox.Control className="grid h-3.5 w-3.5 flex-none place-items-center rounded-[3px] border border-line-strong bg-canvas text-on-accent transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent">
        <ArkCheckbox.Indicator>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5L19 7" />
          </svg>
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      <ArkCheckbox.Label>{label}</ArkCheckbox.Label>
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  );
}
