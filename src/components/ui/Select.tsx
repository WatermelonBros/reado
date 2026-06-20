/**
 * Themed single-select built on Ark UI's headless `Select`.
 *
 * Ark provides the tested accessibility (listbox semantics, keyboard nav, focus
 * management, dismissal); we provide the Reado styling via Tailwind. The public
 * API stays simple — `value`, `options`, `onChange` — so call sites read well.
 */
import { Select as ArkSelect, createListCollection } from "@ark-ui/react/select";
import { Portal } from "@ark-ui/react/portal";
import { ChevronIcon } from "../icons";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading colour dot (e.g. comment-type accents). */
  color?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** "default" shows a bordered control; "ghost" is quiet until hovered/open. */
  variant?: "default" | "ghost";
  /** Extra classes for the trigger button. */
  className?: string;
}

const TRIGGER_BASE =
  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink transition-colors";
const TRIGGER_VARIANT = {
  default: "border border-line bg-surface hover:border-line-strong data-[state=open]:border-line-strong",
  ghost: "border border-transparent hover:bg-surface data-[state=open]:bg-surface",
} as const;

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant = "default",
  className = "",
}: SelectProps<T>) {
  const collection = createListCollection({
    items: options,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
  });
  const selected = options.find((o) => o.value === value);

  return (
    <ArkSelect.Root
      collection={collection}
      value={[value]}
      onValueChange={(d) => d.value[0] && onChange(d.value[0] as T)}
      positioning={{ gutter: 4, placement: "bottom-start" }}
    >
      <ArkSelect.Control>
        <ArkSelect.Trigger
          aria-label={ariaLabel}
          className={`${TRIGGER_BASE} ${TRIGGER_VARIANT[variant]} ${className}`}
        >
          {selected?.color && (
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: selected.color }}
            />
          )}
          <ArkSelect.ValueText className="truncate" placeholder="" />
          <ChevronIcon className="ml-auto h-3.5 w-3.5 flex-none rotate-90 text-faint transition-transform data-[state=open]:-rotate-90" />
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Portal>
        <ArkSelect.Positioner>
          <ArkSelect.Content className="animate-fade z-[200] max-h-[min(60vh,20rem)] min-w-[11rem] overflow-y-auto rounded-md border border-line-strong bg-overlay p-1 shadow-[var(--shadow)] focus:outline-none">
            {options.map((opt) => (
              <ArkSelect.Item
                key={opt.value}
                item={opt}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm whitespace-nowrap text-muted data-[highlighted]:bg-selection data-[highlighted]:text-ink data-[state=checked]:font-medium data-[state=checked]:text-ink"
              >
                {opt.color && (
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: opt.color }}
                  />
                )}
                <ArkSelect.ItemText>{opt.label}</ArkSelect.ItemText>
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </Portal>
    </ArkSelect.Root>
  );
}
