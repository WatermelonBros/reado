/**
 * Themed single-select built on Rind's headless `Select`.
 *
 * Rind provides the tested accessibility (listbox semantics, keyboard nav, focus
 * management, dismissal); we provide the Reado styling via Tailwind. The public
 * API stays simple — `value`, `options`, `onChange` — so call sites read well.
 */

import { Select as RindSelect } from "@rind-ui/react"
import { ChevronIcon } from "./icons"

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** Optional leading colour dot (e.g. comment-type accents). */
  color?: string
}

interface SelectProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel?: string
  /** "default" shows a bordered control; "ghost" is quiet until hovered/open. */
  variant?: "default" | "ghost"
  /** Extra classes for the trigger button. */
  className?: string
}

/** Rind keys are prefixed: its selection uses the bare string `"all"` to mean
 *  "every item", so an option whose value is "all" (the filters' default)
 *  would read as everything selected and ignore picks. ponytail: drop once rind
 *  stops overloading the key space. */
const KEY = "opt:"

const TRIGGER_BASE =
  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink transition-colors"
const TRIGGER_VARIANT = {
  default:
    "min-h-[var(--field-h)] border border-line bg-surface shadow-[var(--control-shadow)] hover:border-line-strong data-[state=open]:border-line-strong",
  ghost: "border border-transparent hover:bg-surface data-[state=open]:bg-surface",
} as const

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant = "default",
  className = "",
}: SelectProps<T>) {
  const items = options.map((o) => ({ key: KEY + o.value, label: o.label }))
  const selected = options.find((o) => o.value === value)

  return (
    <RindSelect.Root
      items={items}
      value={KEY + value}
      // Null, not falsiness: "" is a legitimate value (the "built-in" /
      // "auto" option several call sites use), so only a genuinely empty
      // selection is ignored.
      onValueChange={(v) => v !== null && onChange(v.slice(KEY.length) as T)}
      modal={false}
      positioning={{ side: "bottom", align: "start", sideOffset: 4 }}
    >
      <RindSelect.Trigger
        aria-label={ariaLabel}
        className={`${TRIGGER_BASE} ${TRIGGER_VARIANT[variant]} ${className}`}
      >
        {selected?.color && (
          <span className="h-2 w-2 flex-none rounded-full" style={{ background: selected.color }} />
        )}
        <RindSelect.ValueText className="truncate" />
        <ChevronIcon className="ml-auto h-3.5 w-3.5 flex-none rotate-90 text-faint transition-transform data-[state=open]:-rotate-90" />
      </RindSelect.Trigger>
      <RindSelect.Portal>
        {/* The positioner is translated, so it is the stacking context the content's
            z-index lives in; it takes the z-index itself. Pinned to the trigger's width
            (the content's min-width can still widen it). */}
        <RindSelect.Positioner className="z-[200] w-[var(--rind-anchor-width)]">
          <RindSelect.Content className="animate-fade z-[200] max-h-[min(60vh,20rem)] min-w-[11rem] overflow-y-auto rounded-md border border-line-strong bg-overlay p-1 shadow-[var(--shadow)] focus:outline-none">
            <RindSelect.List>
              {options.map((opt) => (
                <RindSelect.Item
                  key={opt.value}
                  value={KEY + opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm whitespace-nowrap text-muted data-[highlighted]:bg-selection data-[highlighted]:text-ink data-[selected]:font-medium data-[selected]:text-ink"
                >
                  {opt.color && (
                    <span
                      className="h-2 w-2 flex-none rounded-full"
                      style={{ background: opt.color }}
                    />
                  )}
                  <RindSelect.ItemText>{opt.label}</RindSelect.ItemText>
                </RindSelect.Item>
              ))}
            </RindSelect.List>
          </RindSelect.Content>
        </RindSelect.Positioner>
      </RindSelect.Portal>
    </RindSelect.Root>
  )
}
