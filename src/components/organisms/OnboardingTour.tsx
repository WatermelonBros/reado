/**
 * First-run onboarding tour (Ark UI Tour). Walks the user through Reado's
 * intended workflow — Read → Comment → Resolve — by spotlighting the real UI.
 * Auto-starts once per machine the first time a project is open (localStorage
 * gate); replayable from Settings via `useTourGuide().run()`. Rendered at the
 * app root (outside the zoom layer) and portalled to <body> so its backdrop and
 * positioner anchor to the viewport.
 */
import { Tour, useTour, Portal } from "@ark-ui/react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { mod, shift } from "../../lib/shortcuts";
import { useTourGuide } from "../../lib/tour";
import { useProject } from "../../lib/store";

const SEEN_KEY = "reado.tour.seen";

/** SVG path for a rounded rectangle (one subpath). */
function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), H = Math.round(h);
  return (
    `M${X + r} ${Y} H${X + W - r} A${r} ${r} 0 0 1 ${X + W} ${Y + r} ` +
    `V${Y + H - r} A${r} ${r} 0 0 1 ${X + W - r} ${Y + H} ` +
    `H${X + r} A${r} ${r} 0 0 1 ${X} ${Y + H - r} ` +
    `V${Y + r} A${r} ${r} 0 0 1 ${X + r} ${Y} Z`
  );
}

function intersects(a: DOMRect, b: DOMRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Build the clip-path (outer viewport rect + cut-outs) for the current step. */
function scrimPath(): string | null {
  const q = (part: string) =>
    document.querySelector<HTMLElement>(`[data-scope="tour"][data-part="${part}"]`);
  const card = q("content");
  if (!card) return null;
  const cr = card.getBoundingClientRect();
  // Reject the garbage rect zag reports for a frame before it applies the
  // transform — the real card is never zero-sized nor pinned to the corner.
  if (cr.width <= 1 || cr.height <= 1 || (cr.x < 2 && cr.y < 2)) return null;
  const W = window.innerWidth, H = window.innerHeight;
  const holes: string[] = [];
  const spot = q("spotlight");
  const sr = spot?.getBoundingClientRect();
  // Spotlight is hidden on target-less (dialog) steps.
  const hasTarget = !!spot && !spot.hasAttribute("hidden") && !!sr && sr.width > 1 && sr.height > 1;
  if (hasTarget) holes.push(roundedRect(sr!.x - 4, sr!.y - 4, sr!.width + 8, sr!.height + 8, 8));
  // Skip the card hole when it's inside the target hole: overlapping holes cancel
  // under even-odd and would re-dim the card (the comment step targets the whole
  // editor, with the card inside it).
  if (!(hasTarget && intersects(cr, sr!))) {
    holes.push(roundedRect(cr.x - 6, cr.y - 6, cr.width + 12, cr.height + 12, 12));
  }
  return `M0 0 H${W} V${H} H0 Z ${holes.join(" ")}`;
}

/**
 * Full-screen scrim with cut-outs. Unlike Ark's backdrop (one hole, none on
 * dialog steps), this dims the whole app on *every* step and punches holes around
 * the card and the highlighted target — both read as lit while the rest recedes.
 *
 * Re-cut is event-driven (step change, resize, scroll), NOT a 60fps loop: polling
 * getBoundingClientRect every frame forced reflows that fought zag's positioning
 * and made the card flash at the origin. After each trigger we poll only until the
 * path holds steady for two frames, then stop touching the DOM.
 */
function TourScrim({ open, stepIndex }: { open: boolean; stepIndex: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let prev = "";
    let tries = 0;
    const settle = () => {
      const el = ref.current;
      const path = scrimPath();
      if (el && path) {
        if (path === prev) {
          el.style.clipPath = `path(evenodd, "${path}")`;
          return; // stable for two frames — stop polling
        }
        prev = path;
      }
      if (tries++ < 40) raf = requestAnimationFrame(settle);
    };
    const restart = () => {
      cancelAnimationFrame(raf);
      prev = "";
      tries = 0;
      raf = requestAnimationFrame(settle);
    };
    restart();
    window.addEventListener("resize", restart);
    window.addEventListener("scroll", restart, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", restart);
      window.removeEventListener("scroll", restart, true);
    };
  }, [open, stepIndex]);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[300]"
      style={{ display: open ? "block" : "none", background: "oklch(0.13 0.02 250 / 0.55)" }}
    />
  );
}

export function OnboardingTour() {
  const { t } = useTranslation();
  const runNonce = useTourGuide((s) => s.runNonce);
  // The tour targets live inside a project; gate so it never fires on the launcher.
  const inProject = useProject((s) => !!s.root);

  const nav = (back: boolean, last: boolean) => [
    ...(back ? [{ label: t("tour.back"), action: "prev" as const }] : []),
    { label: last ? t("tour.done") : t("tour.next"), action: (last ? "dismiss" : "next") as "dismiss" | "next" },
  ];
  const sel = (q: string) => () => document.querySelector<HTMLElement>(q);

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
  );

  const tour = useTour({ steps });

  // Auto-start once, the first time a project is open (so the targets exist).
  // Mark "seen" only when the timer actually fires — not synchronously — so
  // React StrictMode's mount/unmount/remount doesn't burn the flag on the
  // throwaway first mount and suppress the tour forever in dev.
  useEffect(() => {
    if (!inProject || localStorage.getItem(SEEN_KEY)) return;
    const id = window.setTimeout(() => {
      localStorage.setItem(SEEN_KEY, "1");
      tour.start("welcome"); // always from the first step
    }, 800); // let the UI settle
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProject]);

  // Replay on demand (Settings → "Replay the intro tour"). Pass the first step
  // id explicitly: tour.start() with no id resumes wherever the tour last was.
  useEffect(() => {
    if (runNonce > 0) tour.start("welcome");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runNonce]);

  return (
    <Tour.Root tour={tour}>
      <Portal>
        {/* Our own scrim (see TourScrim): backdrop on every step with a hole
            around the card AND a hole around the target. Replaces Ark's backdrop,
            which only cuts the target (and nothing on dialog steps). The spotlight
            stays as the accent ring on the target; both it and the scrim must NOT
            capture pointer events, or — because zag isolates the positioner into
            its own stacking context — they'd intercept clicks meant for the card. */}
        <TourScrim open={tour.open} stepIndex={tour.stepIndex} />
        {/* Invisible: kept only so TourScrim can read the target rect zag sizes
            it to. The highlight is the backdrop cut-out, not a ring — a ring here
            would also flicker as zag re-parks it between steps. */}
        <Tour.Spotlight className="pointer-events-none invisible" />
        <Tour.Positioner className="z-[302]">
          <Tour.Content className="relative flex max-w-[340px] flex-col gap-2 rounded-lg border border-line-strong bg-overlay p-4 text-sm shadow-[var(--shadow),0_2px_10px_oklch(0_0_0/0.35)]">
            <Tour.Title className="pr-6 text-lg font-semibold text-ink" />
            <Tour.Description className="leading-relaxed text-muted" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <Tour.ProgressText className="text-xs tabular-nums text-faint" />
              <Tour.Actions>
                {(actions) => (
                  <div className="flex gap-1.5">
                    {actions.map((a) => (
                      <Tour.ActionTrigger
                        key={a.label}
                        action={a}
                        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink transition-colors hover:border-accent hover:bg-surface"
                      >
                        {a.label}
                      </Tour.ActionTrigger>
                    ))}
                  </div>
                )}
              </Tour.Actions>
            </div>
            <Tour.CloseTrigger className="absolute top-2.5 right-2.5 grid h-5 w-5 place-items-center rounded text-faint hover:text-ink">
              ×
            </Tour.CloseTrigger>
          </Tour.Content>
        </Tour.Positioner>
      </Portal>
    </Tour.Root>
  );
}
