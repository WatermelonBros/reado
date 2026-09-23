import { useEffect, useState } from "react"
import { Button } from "@/components/atoms/Button"
import type { FileState } from "@/lib/api"
import { cn } from "@/lib/cn"

/** The overflow trigger: a square the size of a chip, so a cluster of actions
 *  keeps one height and one rhythm however many of them there are. */
export const MENU_TRIGGER =
  "inline-flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line text-muted transition-colors hover:bg-overlay hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"

/** How many uncovered files the gap lists before deferring to its own count. */
export const UNCOVERED_SHOWN = 8

/** Short label + tone for a per-file state badge. */
export function fileStateTone(state: FileState): string {
  switch (state) {
    case "reviewed":
      return "text-accent"
    case "in_review":
      return "text-ink"
    case "needs_followup":
    case "blocked":
      return "text-marker"
    case "skipped":
    case "out_of_scope":
      return "text-faint line-through"
    default:
      return "text-faint"
  }
}

/**
 * An action that asks a second time before it happens.
 *
 * Two presses in place, not a modal: the reviewer stays where they are, and the
 * question ("delete 3 findings?") is asked on the control itself. The armed
 * state disarms on blur and after a few seconds, so a chip left armed by a
 * wandering click cannot be fired later by accident.
 */
export function Confirm({
  children,
  confirmLabel,
  onConfirm,
  guarded = true,
  tone = "muted",
  danger,
  title,
}: {
  children: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  /** False turns this back into a plain one-press action. */
  guarded?: boolean
  tone?: "muted" | "accent"
  danger?: boolean
  title?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  const fire = () => {
    if (guarded && !armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onConfirm()
  }
  if (danger) {
    return (
      <Button
        variant="danger"
        size="sm"
        onClick={fire}
        onBlur={() => setArmed(false)}
        title={title}
        className={armed ? "bg-marker/10" : undefined}
      >
        {armed ? confirmLabel : children}
      </Button>
    )
  }
  return (
    <Action
      tone={armed ? "accent" : tone}
      title={title}
      onClick={fire}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </Action>
  )
}

/**
 * One project-relative path, written the same way everywhere in this panel: the
 * directory quiet, the file name legible. The route used to show bare basenames
 * (two `index.ts` are indistinguishable) while the coverage list showed whole
 * paths — one list, one presentation.
 */
export function FilePath({ file }: { file: string }) {
  const cut = file.lastIndexOf("/")
  return (
    <span className="min-w-0 flex-1 truncate">
      {cut > 0 && <span className="text-faint">{file.slice(0, cut + 1)}</span>}
      {file.slice(cut + 1)}
    </span>
  )
}

/** A quiet secondary action chip — reads as a button (border + padding), not a
 *  link. `tone` lets a single chip carry meaning (accent for the positive one). */
export function Action({
  children,
  onClick,
  onBlur,
  title,
  disabled,
  fill,
  tone = "muted",
}: {
  children: React.ReactNode
  onClick: () => void
  onBlur?: () => void
  title?: string
  disabled?: boolean
  /** Share the row's width equally with its siblings, instead of hugging its
   *  own label — four controls of four widths in one cluster read as debris. */
  fill?: boolean
  tone?: "muted" | "accent"
}) {
  // `secondary` already draws the chip; the only thing left to the call site is
  // which one of the row reads as the positive action. The muted branch used to
  // restate the variant's own colours, and a third "marker" tone had no caller.
  //
  // `h-8` over the shared `sm` height: at 24px every chip in this panel was
  // under the 32px target floor, and these are the controls the reviewer hits
  // dozens of times a session. One height for every chip, so a cluster reads as
  // a row rather than as four unrelated things.
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      onBlur={onBlur}
      title={title}
      disabled={disabled}
      className={cn(
        "h-8",
        fill && "min-w-0 flex-1",
        tone === "accent" && "text-accent hover:border-accent",
      )}
    >
      <span className="truncate">{children}</span>
    </Button>
  )
}

/** A section heading. `h3`, not a styled `<p>`: six sections in one panel is
 *  exactly the case where heading navigation is how a screen-reader user moves. */
export function SectionLabel({
  children,
  inline,
}: {
  children: React.ReactNode
  inline?: boolean
}) {
  return (
    <h3
      className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted ${
        inline ? "" : "px-4 pb-2"
      }`}
    >
      {children}
    </h3>
  )
}
