/**
 * The comment composer's text field, with the completions an embedding build
 * registered (`registerComposerCompletion`) — the official build's `@` for
 * teammates. In the community build nothing is registered and this is exactly a
 * `Textarea`.
 *
 * What a source marks (a mention it would make) is highlighted as it is written:
 * a copy of the text is laid exactly over the field, transparent but for the
 * marks, so the caret, selection and placeholder stay the field's own. Only
 * colour changes — a different weight would widen the glyphs and drift from the
 * caret.
 *
 * The list hangs off the field, not the caret: the field is a few lines tall, so
 * the eye is already there, and it saves measuring text. It is portalled with
 * `position: fixed` (core rule: the zoom transform and the native browser pane).
 */
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Textarea } from "@/components/atoms/Textarea"
import { cn } from "@/lib/cn"
import {
  type CompletionContext,
  type CompletionItem,
  completionAt,
  composerCompletions,
} from "@/lib/contributions"

const MAX_ITEMS = 6

/** The field's text metrics, which the overlay has to share to line up. */
const MIRRORED = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const

/** The marks of `value`, coloured, over the field `field`; the rest invisible. */
function Marks({
  field,
  value,
  marks,
}: {
  field: HTMLTextAreaElement | null
  value: string
  marks: { from: number; to: number }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!field || !el) return
    const sync = () => {
      const cs = getComputedStyle(field)
      for (const k of MIRRORED) el.style[k] = cs[k]
      el.style.width = `${field.offsetWidth}px`
      el.style.height = `${field.offsetHeight}px`
      el.scrollTop = field.scrollTop
    }
    sync()
    const watch = new ResizeObserver(sync)
    watch.observe(field)
    field.addEventListener("scroll", sync)
    return () => {
      watch.disconnect()
      field.removeEventListener("scroll", sync)
    }
  }, [field])
  const parts: ReactNode[] = []
  let at = 0
  for (const m of [...marks].sort((a, b) => a.from - b.from)) {
    if (m.from < at) continue
    parts.push(value.slice(at, m.from))
    parts.push(
      <mark key={m.from} className="rounded-sm bg-accent/15 text-accent">
        {value.slice(m.from, m.to)}
      </mark>,
    )
    at = m.to
  }
  parts.push(value.slice(at), "\u200b") // a trailing newline still takes its line
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden border-solid border-transparent break-words whitespace-pre-wrap text-transparent"
    >
      {parts}
    </div>
  )
}

type Props = ComponentProps<typeof Textarea> & {
  value: string
  onValueChange: (value: string) => void
  completion: CompletionContext
}

interface Open {
  start: number
  query: string
  items: CompletionItem[]
  /** Said instead of a list: why nothing can be completed here. */
  note: string | null
}

export function CompletingTextarea({
  value,
  onValueChange,
  completion,
  onSubmit,
  onCancel,
  onKeyDown,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const sources = composerCompletions()

  const refresh = (text: string, caret: number) => {
    const at = completionAt(
      text,
      caret,
      sources.map((s) => s.trigger),
    )
    const source = at && sources.find((s) => s.trigger === at.trigger)
    if (!at || !source) return setOpen(null)
    const note = source.unavailable?.(completion) ?? null
    const items = note ? [] : source.items(at.query, completion).slice(0, MAX_ITEMS)
    if (!note && !items.length) return setOpen(null)
    setOpen({ start: at.start, query: at.query, items, note })
    setActive(0)
  }

  useLayoutEffect(() => {
    if (open) setRect(ref.current?.getBoundingClientRect() ?? null)
  }, [open])

  const pick = (item: CompletionItem) => {
    const el = ref.current
    if (!open || !el) return
    const end = open.start + 1 + open.query.length
    const next = `${value.slice(0, open.start)}${item.insert} ${value.slice(end)}`
    onValueChange(next)
    setOpen(null)
    const caret = open.start + item.insert.length + 1
    requestAnimationFrame(() => el.setSelectionRange(caret, caret))
  }

  const listId = "composer-completions"
  const listing = !!open?.items.length
  const marks = sources.flatMap((src) => src.marks?.(value, completion) ?? [])
  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          if (sources.length) refresh(e.target.value, e.target.selectionStart)
        }}
        onBlur={() => setOpen(null)}
        // While the list is up, Escape closes it and ⌘↵ doesn't send half a name.
        onSubmit={open ? undefined : onSubmit}
        onCancel={open ? undefined : onCancel}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "Escape") {
              e.preventDefault()
              setOpen(null)
              return
            }
            if (listing && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault()
              const n = open.items.length
              setActive((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n)
              return
            }
            if (listing && (e.key === "Enter" || e.key === "Tab") && !e.metaKey && !e.ctrlKey) {
              e.preventDefault()
              pick(open.items[active])
              return
            }
          }
          onKeyDown?.(e)
        }}
        role={sources.length ? "combobox" : undefined}
        aria-expanded={sources.length ? listing : undefined}
        aria-controls={listing ? listId : undefined}
        aria-activedescendant={listing ? `${listId}-${active}` : undefined}
        aria-autocomplete={sources.length ? "list" : undefined}
        {...rest}
      />
      {marks.length > 0 && <Marks field={ref.current} value={value} marks={marks} />}
      {open &&
        rect &&
        createPortal(
          <div
            className="fixed z-[400] w-64 overflow-hidden rounded-md border border-line-strong bg-overlay py-1 text-sm shadow-[var(--shadow)]"
            // Above the field: the reply box sits at the bottom of the thread.
            style={{ left: rect.left, bottom: window.innerHeight - rect.top + 4 }}
          >
            {open.note ? (
              <p className="px-3 py-1.5 text-xs leading-relaxed text-muted">{open.note}</p>
            ) : (
              <div id={listId} role="listbox">
                {open.items.map((item, i) => (
                  <div
                    key={item.insert}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    // mousedown, not click: keep the caret in the field.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(item)
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex cursor-default items-center gap-2 px-3 py-1.5",
                      i === active ? "bg-selection text-ink" : "text-ink/90",
                    )}
                  >
                    {item.icon}
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.detail && (
                      <span className="ml-auto flex-none text-xs text-faint">{item.detail}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
