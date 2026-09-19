/**
 * The companion as the window sees it: the owl, whatever it is saying, and the
 * one control it owns — the tab that sends it off the edge of the screen.
 *
 * Everything positional comes from one value — the corner the user parked it in
 * (see `corner.ts`). What it *shows* arrives as props: the state machine decides
 * that, never the view.
 *
 * Tucked, the character is not there at all: what remains is a bar against the
 * screen's edge, three pixels of it, ten under the pointer. Done here rather
 * than by moving the window, because the window's edge already sits on the
 * screen's edge — there is nothing to move.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { type Corner, cornerLayout } from "./corner"
import type { MascotState } from "./frames"
import { Mascot } from "./Mascot"
import { SpeechBubble } from "./SpeechBubble"

/** The tucked companion is a bar against the screen's edge: this thin at rest,
 *  this wide under the pointer. Three pixels is furniture you stop seeing; ten
 *  is a thing you can aim at. */
const BAR = 3
const BAR_HOVER = 10

export function MascotCompanion({
  state,
  text,
  corner = "bottom-right",
  size = 180,
  onDismissBubble,
  onClick,
  onTuckChange,
  pointerOver,
}: {
  state: MascotState
  /** What it is saying, if anything. Plain text: it comes from an agent. */
  text?: string
  corner?: Corner
  size?: number
  onDismissBubble?: () => void
  onClick?: () => void
  /** Going away changes which part of the window is solid, and only the window
   *  can tell the backend that. */
  onTuckChange?: (tucked: boolean) => void
  /** Is the pointer over the companion? In the floating window this comes from
   *  the backend, which is the only place that can know: while the window is
   *  letting the pointer through it receives no events, so the crossing never
   *  arrives as `pointerenter`. Anywhere else, the DOM's own hover does. */
  pointerOver?: boolean
}) {
  const { t } = useTranslation()
  const { column, align } = cornerLayout(corner)
  const [tucked, setTucked] = useState(false)
  const [domHover, setDomHover] = useState(false)
  // Either signal means the pointer is there; neither is complete on its own.
  const hovering = (pointerOver ?? false) || domHover
  /** Going away and coming back both swap what is under the pointer, and the
   *  old hover has nothing to say about the new thing. */
  const tuck = (away: boolean) => {
    setTucked(away)
    setDomHover(false)
    onTuckChange?.(away)
  }

  // Talking is what the idle owl does while a bubble is up. A state that has a
  // face of its own keeps it: the leaning question *is* the message, and an owl
  // that grinned and talked at the same time would say two things at once.
  const shown: MascotState = text && state === "idle" ? "talk" : state
  // It leaves through the edge it is parked against — the near one. Going the
  // other way would walk it across the screen the user is working on.
  const right = corner.endsWith("right")
  const width = size * (390 / 480)

  return (
    <div
      data-mascot-corner={corner}
      data-mascot-tucked={tucked || undefined}
      className="flex h-full w-full gap-1.5 p-1"
      onPointerEnter={() => !tucked && setDomHover(true)}
      onPointerLeave={() => setDomHover(false)}
      style={{ flexDirection: column, alignItems: align, justifyContent: "flex-end" }}
    >
      {/* A tucked companion says nothing: it was sent away, and a bubble from
          beyond the screen's edge would be words with nobody attached to them. */}
      {text && !tucked && <SpeechBubble text={text} corner={corner} onDismiss={onDismissBubble} />}

      {/* Both are always here: the character slides out through the near edge
          and the bar takes its place, which is a movement rather than a swap.
          Whatever is off screen stops being solid — the window works that out
          from where these end up, so nothing here has to say it. */}
      <div className="relative" style={{ width, height: size }}>
        <button
          type="button"
          {...(tucked ? {} : { "data-mascot-hit": true })}
          onClick={onClick}
          tabIndex={tucked ? -1 : undefined}
          aria-hidden={tucked || undefined}
          className="absolute inset-0 block cursor-default transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(${tucked ? (right ? width + 10 : -width - 10) : 0}px)` }}
        >
          <Mascot state={shown} size={size} />
        </button>

        <button
          type="button"
          {...(tucked ? { "data-mascot-hit": true } : {})}
          onClick={() => tuck(false)}
          onPointerEnter={() => setDomHover(true)}
          onPointerLeave={() => setDomHover(false)}
          aria-label={t("mascot.show")}
          title={t("mascot.show")}
          tabIndex={tucked ? undefined : -1}
          aria-hidden={!tucked || undefined}
          className={`absolute top-0 flex items-stretch transition-opacity duration-200 ${
            tucked ? "cursor-default opacity-100 delay-150" : "pointer-events-none opacity-0"
          }`}
          // Out past the page's own padding, so the bar is flush with the screen.
          style={{ height: size, width: BAR_HOVER, [right ? "right" : "left"]: -4 }}
        >
          <span
            data-mascot-bar
            className={`h-full bg-ink transition-all duration-200 ${
              // Rounded on the side that is *inside* the screen; the other side
              // is against the edge, where a corner would never be seen.
              right ? "ml-auto rounded-l-md" : "mr-auto rounded-r-md"
            }`}
            style={{ width: hovering ? BAR_HOVER : BAR }}
          />
        </button>

        {/* Solid only while it can be pressed. Left marked once tucked, this
            button — which sits a character's width inside the screen — would
            keep the whole transparent box swallowing clicks meant for whatever
            is under it. */}
        <button
          type="button"
          {...(tucked ? {} : { "data-mascot-tuck": true })}
          onClick={() => tuck(true)}
          onPointerEnter={() => setDomHover(true)}
          onPointerLeave={() => setDomHover(false)}
          aria-label={t("mascot.tuck")}
          title={t("mascot.tuck")}
          tabIndex={tucked ? -1 : undefined}
          // High and clear of the ear tufts: over the head it would be a button
          // growing out of the character.
          className={`absolute top-0 grid h-6 w-5 place-items-center rounded-md border border-line-strong bg-surface text-ink shadow-sm transition-opacity ${
            hovering && !tucked ? "opacity-100" : "pointer-events-none opacity-0"
          } ${right ? "-left-5" : "-right-5"}`}
        >
          {/* Points the way it will go, which is out through the near edge. */}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d={right ? "M3.5 1 L7.5 5 L3.5 9" : "M6.5 1 L2.5 5 L6.5 9"}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
