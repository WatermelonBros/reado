/**
 * First-run onboarding tour (Ark UI Tour). Walks the user through Reado's
 * intended workflow — Read → Comment → Resolve — by spotlighting the real UI.
 * Auto-starts once per machine the first time a project is open (localStorage
 * gate); replayable from Settings via `useTourGuide().run()`. Rendered at the
 * app root (outside the zoom layer) and portalled to <body> so its backdrop and
 * positioner anchor to the viewport.
 */
import { Portal, Tour, useTour } from "@ark-ui/react"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { TourCard, tourTranslations } from "@/components/molecules/TourCard"
import { TourScrim } from "@/components/molecules/TourScrim"
import { mod, shift } from "@/lib/shortcuts"
import { useProject } from "@/lib/store"
import { useTourGuide } from "@/lib/tour"

const SEEN_KEY = "reado.tour.seen"

export function OnboardingTour() {
  const { t } = useTranslation()
  const runNonce = useTourGuide((s) => s.runNonce)
  // The tour targets live inside a project; gate so it never fires on the launcher.
  const inProject = useProject((s) => !!s.root)

  const nav = (back: boolean, last: boolean) => [
    ...(back ? [{ label: t("tour.back"), action: "prev" as const }] : []),
    {
      label: last ? t("tour.done") : t("tour.next"),
      action: (last ? "dismiss" : "next") as "dismiss" | "next",
    },
  ]
  const sel = (q: string) => () => document.querySelector<HTMLElement>(q)

  const steps = useMemo(
    () => [
      {
        id: "welcome",
        type: "dialog" as const,
        title: t("tour.welcomeTitle"),
        description: t("tour.welcomeBody"),
        actions: [
          { label: t("tour.skip"), action: "dismiss" as const },
          { label: t("tour.next"), action: "next" as const },
        ],
      },
      {
        id: "read",
        type: "tooltip" as const,
        target: sel('[data-tour="files"]'),
        placement: "right-start" as const,
        offset: { mainAxis: 12 },
        title: t("tour.readTitle"),
        description: t("tour.readBody"),
        actions: nav(true, false),
      },
      {
        id: "comment",
        type: "tooltip" as const,
        target: sel("main"),
        // `main` fills the viewport, so any edge placement would push the card
        // off-screen. Anchor left-start, then pull it back *into* the editor with
        // a negative main-axis offset (~card width) so it floats over the editor
        // it's describing. ponytail: -360 ≈ card width + gap; revisit if the card
        // width changes.
        placement: "left-start" as const,
        offset: { mainAxis: -360, crossAxis: 64 },
        title: t("tour.commentTitle"),
        description: t("tour.commentBody", { key: `${mod}${shift}M` }),
        actions: nav(true, false),
      },
      {
        id: "tasks",
        type: "tooltip" as const,
        target: sel('[data-tour="comments"]'),
        placement: "right-start" as const,
        offset: { mainAxis: 12 },
        title: t("tour.tasksTitle"),
        description: t("tour.tasksBody"),
        actions: nav(true, false),
      },
      {
        id: "review",
        type: "tooltip" as const,
        target: sel('[data-tour="guidedreview"]'),
        placement: "right-start" as const,
        offset: { mainAxis: 12 },
        title: t("tour.reviewTitle"),
        description: t("tour.reviewBody"),
        actions: nav(true, false),
      },
      {
        id: "resolve",
        type: "tooltip" as const,
        target: sel('[data-tour="terminal"]'),
        placement: "top-end" as const,
        offset: { mainAxis: 12 },
        title: t("tour.resolveTitle"),
        description: t("tour.resolveBody"),
        actions: nav(true, false),
      },
      {
        id: "customize",
        type: "tooltip" as const,
        target: sel('[data-tour="settings"]'),
        placement: "right-end" as const,
        offset: { mainAxis: 12 },
        title: t("tour.customizeTitle"),
        description: t("tour.customizeBody"),
        actions: nav(true, true),
      },
    ],
    [t],
  )

  const tour = useTour({ steps, translations: tourTranslations(t) })

  // Auto-start once, the first time a project is open (so the targets exist).
  // Mark "seen" only when the timer actually fires — not synchronously — so
  // React StrictMode's mount/unmount/remount doesn't burn the flag on the
  // throwaway first mount and suppress the tour forever in dev.
  useEffect(() => {
    if (!inProject || localStorage.getItem(SEEN_KEY)) return
    const id = window.setTimeout(() => {
      localStorage.setItem(SEEN_KEY, "1")
      tour.start("welcome") // always from the first step
    }, 800) // let the UI settle
    return () => window.clearTimeout(id)
  }, [inProject])

  // Replay on demand (Settings → "Replay the intro tour"). Pass the first step
  // id explicitly: tour.start() with no id resumes wherever the tour last was.
  useEffect(() => {
    if (runNonce > 0) tour.start("welcome")
  }, [runNonce])

  return (
    <Tour.Root tour={tour}>
      <Portal>
        <div data-tour-scope="app-tour">
          {/* Our own scrim (see TourScrim): backdrop on every step with a hole
            around the card AND a hole around the target. Replaces Ark's backdrop,
            which only cuts the target (and nothing on dialog steps). The spotlight
            stays as the accent ring on the target; both it and the scrim must NOT
            capture pointer events, or — because zag isolates the positioner into
            its own stacking context — they'd intercept clicks meant for the card. */}
          <TourScrim open={tour.open} stepIndex={tour.stepIndex} scope="app-tour" />
          {/* Invisible: kept only so TourScrim can read the target rect zag sizes
            it to. The highlight is the backdrop cut-out, not a ring — a ring here
            would also flicker as zag re-parks it between steps. */}
          <Tour.Spotlight className="pointer-events-none invisible" />
          <TourCard className="max-w-[340px]" titleClassName="text-lg" />
        </div>
      </Portal>
    </Tour.Root>
  )
}
