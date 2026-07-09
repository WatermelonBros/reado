/**
 * Reading-tours panel: create/generate guided "Start here" paths, add steps from
 * the cursor, start a tour, and manage steps. The running tour is driven from the
 * floating TourBar (below).
 */
import { useState } from "react";
import { useTours } from "../../lib/tours";
import { useProject } from "../../lib/store";
import { prompt } from "../../lib/prompt";
import { PlusIcon, SparkleIcon, CloseIcon, ChevronIcon } from "../atoms/icons";
import { Button } from "../atoms/Button";
import { IconButton } from "../atoms/IconButton";
import { useTranslation } from "react-i18next";

export function ToursPanel() {
  const tours = useTours((s) => s.tours);
  const generating = useTours((s) => s.generating);
  const root = useProject((s) => s.root);
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  const newTour = async () => {
    const name = await prompt({ title: t("tours.new"), confirmLabel: t("tours.create") });
    if (name) useTours.getState().createTour(root, name);
  };
  const addStep = async (tourId: string) => {
    const note = await prompt({ title: t("tours.stepNote"), confirmLabel: t("tours.addStep") });
    if (note) useTours.getState().addStepHere(root, tourId, note);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={newTour}>
          <PlusIcon className="h-3 w-3" /> {t("tours.new")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useTours.getState().generate(root)}
          disabled={generating}
        >
          <SparkleIcon className="h-3 w-3" /> {generating ? t("tours.generating") : t("tours.generate")}
        </Button>
      </div>

      {tours.length === 0 ? (
        <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("tours.empty")}</p>
      ) : (
        <ul className="m-0 flex-1 list-none overflow-y-auto p-0 py-1">
          {tours.map((tour) => (
            <li key={tour.id}>
              <div className="group/t flex items-center">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === tour.id ? null : tour.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 pl-2 text-left text-xs text-ink hover:bg-surface"
                >
                  <ChevronIcon
                    className={`h-3 w-3 flex-none text-faint transition-transform ${
                      expanded === tour.id ? "rotate-90" : ""
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{tour.name}</span>
                  <span className="flex-none text-xs text-faint">{tour.steps.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => useTours.getState().start(tour.id)}
                  disabled={tour.steps.length === 0}
                  title={t("tours.start")}
                  className="flex-none rounded-md px-2 py-0.5 text-xs text-accent hover:bg-surface disabled:opacity-40"
                >
                  {t("tours.start")}
                </button>
                <IconButton
                  size="sm"
                  label={t("tours.removeTour")}
                  onClick={() => useTours.getState().removeTour(root, tour.id)}
                  icon={<CloseIcon className="h-3 w-3" />}
                  className="opacity-0 transition-opacity group-hover/t:opacity-100 group-focus-within/t:opacity-100 focus-visible:opacity-100"
                />
              </div>
              {expanded === tour.id && (
                <div className="pb-1">
                  {tour.steps.map((s, i) => (
                    <div key={i} className="group/s flex items-center pl-7">
                      <button
                        type="button"
                        onClick={() => useTours.getState().start(tour.id)}
                        title={`${s.file}:${s.line}`}
                        className="flex min-w-0 flex-1 items-baseline gap-2 py-0.5 pr-1 text-left text-xs text-muted hover:text-ink"
                      >
                        <span className="min-w-0 flex-1 truncate">{s.note}</span>
                        <span className="flex-none text-faint">{s.line}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => useTours.getState().removeStep(root, tour.id, i)}
                        title={t("tours.removeStep")} aria-label={t("tours.removeStep")}
                        className="grid h-5 w-5 flex-none place-items-center text-faint opacity-0 transition-opacity group-hover/s:opacity-100 group-focus-within/s:opacity-100 focus-visible:opacity-100 hover:text-ink"
                      >
                        <CloseIcon className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addStep(tour.id)}
                    className="ml-7 flex items-center gap-1 py-0.5 text-xs text-faint hover:text-ink"
                  >
                    <PlusIcon className="h-3 w-3" /> {t("tours.addStep")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Floating navigation bar shown while a tour is running. */
export function TourBar() {
  const running = useTours((s) => s.running);
  const tours = useTours((s) => s.tours);
  const { t } = useTranslation();
  if (!running) return null;
  const tour = tours.find((x) => x.id === running.tourId);
  if (!tour) return null;
  const step = tour.steps[running.index];

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-overlay px-4 py-2 shadow-[var(--shadow)]">
      <span className="flex-none text-xs font-medium text-faint tabular-nums">
        {running.index + 1}/{tour.steps.length}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink">{step?.note}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => useTours.getState().go(-1)}
        disabled={running.index === 0}
      >
        {t("tours.prev")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => useTours.getState().go(1)}
        disabled={running.index >= tour.steps.length - 1}
      >
        {t("tours.next")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => useTours.getState().stop()}>
        {t("tours.exit")}
      </Button>
    </div>
  );
}
