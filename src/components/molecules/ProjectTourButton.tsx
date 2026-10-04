/**
 * "Project tour", at the end of the editor tab bar when the project ships a
 * `tour.json` — or when the embedding build adds entries of its own (the official
 * build's "Edit tours…", "Create a tour…"). One click plays the project tour; when
 * there is something to choose — pick up where you left off, another tour, an
 * added entry — it opens a short menu instead.
 */
import { Menu } from "@ark-ui/react/menu"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import { TourIcon } from "@/components/atoms/icons"
import { tourMenuItems } from "@/lib/contributions"
import { onboardingTour, savedStep, useProjectTours } from "@/lib/projectTours"

export function ProjectTourButton() {
  const { t } = useTranslation()
  const tours = useProjectTours((s) => s.tours)
  const root = useProjectTours((s) => s.root)
  const newer = useProjectTours((s) => s.newer)
  const invalid = useProjectTours((s) => s.invalid)
  const playing = useProjectTours((s) => !!s.playing)
  const play = useProjectTours((s) => s.play)
  const extra = tourMenuItems()
  if (!tours.length && !newer && !extra.length) return null

  const main = onboardingTour(tours) ?? tours[0]
  const resume = main ? savedStep(root, main) : null
  const others = tours.filter((x) => x !== main)
  const label = t("projectTour.button")
  const face = (
    <>
      <TourIcon className="h-3.5 w-3.5" />
      {label}
    </>
  )

  if (main && resume === null && !others.length && !invalid && !newer && !extra.length)
    return (
      <Button
        size="sm"
        className="mx-1 my-auto flex-none"
        disabled={playing}
        onClick={() => play(main.id)}
        title={t("projectTour.hint", { name: main.name })}
      >
        {face}
      </Button>
    )

  return (
    <Dropdown
      label={label}
      placement="bottom"
      align="end"
      triggerClassName="mx-1 my-auto inline-flex flex-none items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface hover:text-ink"
      trigger={face}
      className="w-64"
    >
      {main && resume !== null && (
        <MenuRow
          label={t("projectTour.resume", { step: resume + 1 })}
          detail={main.name}
          onClick={() => play(main.id, resume)}
        />
      )}
      {main && (
        <MenuRow
          label={resume !== null ? t("projectTour.restart") : main.name}
          detail={t("projectTour.steps", { count: main.steps.length })}
          onClick={() => play(main.id)}
        />
      )}
      {others.map((x) => (
        <MenuRow
          key={x.id}
          label={x.name}
          detail={t("projectTour.steps", { count: x.steps.length })}
          onClick={() => play(x.id)}
        />
      ))}
      {extra.length > 0 && tours.length > 0 && (
        <Menu.Separator className="my-1 border-t border-line" />
      )}
      {extra.map((item) => (
        <MenuRow key={item.label(true)} label={item.label(tours.length > 0)} onClick={item.run} />
      ))}
      {(invalid > 0 || newer) && (
        <p className="border-t border-line px-3 pt-2 pb-1 text-[11px] leading-relaxed text-faint">
          {newer ? t("projectTour.newer") : t("projectTour.invalid", { count: invalid })}
        </p>
      )}
    </Dropdown>
  )
}
