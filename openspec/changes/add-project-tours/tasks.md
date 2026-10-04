## 1. Format and loading

- [x] 1.1 `src/lib/projectTours.ts`: types, validation, load `tour.json` (recognised by shape),
      reload on change, path confinement. Tests.
- [x] 1.2 Step location: quoted text (exact, whitespace-insensitive, nearest) →
      span → unplaceable. Tests.
- [x] 1.3 Specification `docs/tour-format.md` (positions, versioning, `x-`
      extensions, preservation rule) and `docs/tour.schema.json` (2020-12), CC0;
      validate with it in code; link from the README.
- [x] 1.4 Website: serve the schema at `/schema/tour/v1.json` and a page about the
      format.

## 2. Player

- [x] 2.1 Extract the scrim from `OnboardingTour.tsx` into a shared component.
- [x] 2.2 `ProjectTourPlayer` on Ark `Tour`: `effect` (open, unfold, scroll, wait for
      layout), fixed highlight `target`, repositioning, markdown dialog, progress,
      keyboard.
- [x] 2.3 Whole-file and unplaceable steps; mark files read on leaving a step.
- [x] 2.4 "Project tour" button, palette commands, resume, first-open offer.
- [x] 2.5 Check in the real app: exact span on a long line, multi-line span, browser
      pane open.

## 3. Extension points

- [x] 3.1 `registerPanel` (widen `PanelId`), `registerEditorMenuItem`. Tests: nothing
      registered → nothing shown.

## 4. Release

- [x] 4.1 i18n; CHANGELOG under [Unreleased] (Added: project tours).
- [ ] 4.2 Dogfood: an onboarding tour in `tour.json` for Reado itself.
