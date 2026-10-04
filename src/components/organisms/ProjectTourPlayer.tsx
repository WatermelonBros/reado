/**
 * Plays a project tour (`tour.json`) with Ark UI's Tour: each step opens its file,
 * brings its code to the middle of the editor, lights exactly that span and
 * explains it in a card beside it.
 *
 * The target is a box laid over the span *inside* the editor's scroller, so it
 * scrolls with the code by itself and the card's positioner follows it through
 * its own ancestor-scroll tracking; the shared scrim cuts the backdrop around
 * both. A whole-file step targets the scroller.
 */
import { Portal, Tour, useTour } from "@ark-ui/react"
import type { TourStepDetails, TourStepEffectArgs } from "@ark-ui/react/tour"
import { EditorView } from "@codemirror/view"
import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { TourCard, tourTranslations } from "@/components/molecules/TourCard"
import { TOUR_LAYOUT, TourScrim } from "@/components/molecules/TourScrim"
import { liveViews } from "@/lib/liveViews"
import {
  locateStep,
  type Tour as ProjectTour,
  saveStep,
  type TourStep,
  useProjectTours,
} from "@/lib/projectTours"
import { useReadProgress } from "@/lib/readProgress"
import { useProject } from "@/lib/store"

const SCOPE = "project-tour"
/** Card width + a margin: pulls a "right-start" card back inside its target.
 *  ponytail: tied to `w-[380px]` below. */
const INSIDE = { mainAxis: -(380 + 16), crossAxis: 16 }
/** How long a step waits for its file's editor before showing anyway. */
const OPEN_TIMEOUT_MS = 4000

const frame = () => new Promise((r) => requestAnimationFrame(r))

/** The primary editor showing `file`, once it has mounted. */
async function viewFor(root: string, file: string): Promise<EditorView | null> {
  const until = performance.now() + OPEN_TIMEOUT_MS
  while (performance.now() < until) {
    for (const [view, at] of liveViews)
      if (at.primary && at.root === root && at.rel === file) return view
    await frame()
  }
  return null
}

/**
 * A box over `[from, to]`, in the scroller's own coordinates so it scrolls with
 * the code. Laid out again whenever the editor's geometry changes — code lenses
 * arriving after the file opened push the code down a line, a narrower editor
 * rewraps it — and a multi-line span is the block of its lines, as wide as the
 * code. Returns the box and what stops following.
 */
function spotOver(view: EditorView, from: number, to: number) {
  const scroller = view.scrollDOM
  const spot = document.createElement("div")
  spot.setAttribute("aria-hidden", "true")
  spot.className =
    "pointer-events-none absolute z-[5] rounded-md outline outline-[1.5px] outline-accent/80"
  const oneLine = view.state.doc.lineAt(from).number === view.state.doc.lineAt(to).number
  const layout = () => {
    const a = view.coordsAtPos(from, 1)
    const b = view.coordsAtPos(to, -1)
    if (!a || !b) return // scrolled out of the rendered range: keep the last box
    const box = scroller.getBoundingClientRect()
    const left = oneLine ? a.left : view.contentDOM.getBoundingClientRect().left
    const right = oneLine ? b.right : box.right
    Object.assign(spot.style, {
      left: `${left - box.left + scroller.scrollLeft - 3}px`,
      top: `${a.top - box.top + scroller.scrollTop - 2}px`,
      width: `${Math.max(right - left, 8) + 6}px`,
      height: `${b.bottom - a.top + 4}px`,
    })
    window.dispatchEvent(new Event(TOUR_LAYOUT))
  }
  scroller.appendChild(spot)
  layout()
  // The content's height (widgets, wrapping) and the scroller's width.
  const watch = new ResizeObserver(() => layout())
  watch.observe(view.contentDOM)
  watch.observe(scroller)
  return {
    spot,
    stop: () => {
      watch.disconnect()
      spot.remove()
    },
  }
}

/**
 * Open a step's file, find its code and put the target over it. Returns the
 * target, whether the code was found, and a cleanup that takes the box away.
 */
async function reveal(
  root: string,
  step: TourStep,
): Promise<{ target: HTMLElement | null; placed: boolean; whole: boolean; cleanup: () => void }> {
  useProject.getState().open(`${root}/${step.file}`, step.span?.from.line)
  const view = await viewFor(root, step.file)
  if (!view) return { target: null, placed: false, whole: true, cleanup: () => {} }
  const found = locateStep(view.state.doc.toString(), step)
  const range = found === "file" || found === null ? null : found
  if (range) view.dispatch({ effects: EditorView.scrollIntoView(range.from, { y: "center" }) })
  await frame()
  await frame()
  const follow = range ? spotOver(view, range.from, range.to) : null
  return {
    target: follow?.spot ?? view.scrollDOM,
    placed: found !== null,
    whole: !follow,
    cleanup: () => follow?.stop(),
  }
}

function StepBody({ step, placed }: { step: TourStep; placed: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      {!placed && (
        <p className="text-xs leading-relaxed text-[var(--diag-warn)]">{t("projectTour.moved")}</p>
      )}
      <div className="prose-reado max-h-[40vh] overflow-y-auto text-sm leading-relaxed text-ink/90 [&_p]:my-1.5 [&>*:first-child]:mt-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.body}</ReactMarkdown>
      </div>
      <p className="truncate font-mono text-[11px] text-faint">
        {step.file}
        {step.span &&
          (step.span.from.line === step.span.to.line
            ? `:${step.span.from.line}`
            : `:${step.span.from.line}–${step.span.to.line}`)}
      </p>
    </div>
  )
}

function Player({
  root,
  tour,
  start,
  preview,
}: {
  root: string
  tour: ProjectTour
  start: number
  /** An author's preview: leaves no progress and no read marks behind. */
  preview: boolean
}) {
  const { t } = useTranslation()
  const target = useRef<HTMLElement | null>(null)
  const index = useRef(start)

  const steps = useMemo(
    () =>
      tour.steps.map((step, i) => {
        const last = i === tour.steps.length - 1
        return {
          id: `step-${i}`,
          type: "tooltip" as const,
          title: step.title,
          description: <StepBody step={step} placed />,
          // Under the code by default: beside a block as wide as the editor there
          // is no room, and zag doesn't shift a card back on screen.
          placement: (step.placement && step.placement !== "auto"
            ? step.placement
            : "bottom-start") as TourStepDetails["placement"],
          offset: { mainAxis: 14 },
          target: () => target.current,
          actions: [
            ...(i > 0 ? [{ label: t("tour.back"), action: "prev" as const }] : []),
            {
              label: last ? t("tour.done") : t("tour.next"),
              action: (last ? "dismiss" : "next") as "dismiss" | "next",
            },
          ],
          effect: ({ show, update }: TourStepEffectArgs) => {
            let stop = () => {}
            let live = true
            void reveal(root, step).then((r) => {
              if (!live) return r.cleanup()
              stop = r.cleanup
              target.current = r.target
              update({
                ...(r.placed ? {} : { description: <StepBody step={step} placed={false} /> }),
                // The whole editor is the target: no room beside it, so the card
                // sits inside its right edge instead.
                ...(r.whole ? { placement: "right-start", offset: INSIDE } : {}),
              })
              show()
            })
            return () => {
              live = false
              stop()
            }
          },
        }
      }),
    [root, tour, t],
  )

  const markRead = (i: number) => {
    if (preview) return
    const file = tour.steps[i]?.file
    if (file && !useReadProgress.getState().read.has(file))
      useReadProgress.getState().mark(root, file, true)
  }

  const api = useTour({
    steps,
    keyboardNavigation: true,
    translations: tourTranslations(t),
    closeOnInteractOutside: false,
    onStepChange: ({ stepIndex }) => {
      if (stepIndex > index.current) markRead(index.current)
      index.current = stepIndex
      if (!preview) saveStep(root, tour, stepIndex)
    },
    onStatusChange: ({ status }) => {
      if (status !== "dismissed" && status !== "completed" && status !== "skipped") return
      const finished = index.current === tour.steps.length - 1
      if (finished && !preview) {
        markRead(index.current)
        saveStep(root, tour, null)
      }
      useProjectTours.getState().stop()
    },
  })

  useEffect(() => {
    api.start(`step-${start}`)
  }, [])

  return (
    <Tour.Root tour={api}>
      <Portal>
        <div data-tour-scope={SCOPE}>
          <TourScrim
            open={api.open}
            stepIndex={api.stepIndex}
            scope={SCOPE}
            target={() => target.current}
          />
          <TourCard className="w-[380px]" />
        </div>
      </Portal>
    </Tour.Root>
  )
}

/** Mounted once at the app root; plays whatever `useProjectTours` says is playing. */
export function ProjectTourPlayer() {
  const playing = useProjectTours((s) => s.playing)
  const tour = useProjectTours((s) => s.preview ?? s.tours.find((x) => x.id === s.playing?.tourId))
  const previewing = useProjectTours((s) => !!s.preview)
  const root = useProjectTours((s) => s.root)
  if (!playing || !tour) return null
  return (
    <Player
      key={`${tour.id}:${playing.step}:${previewing}`}
      root={root}
      tour={tour}
      start={playing.step}
      preview={previewing}
    />
  )
}
