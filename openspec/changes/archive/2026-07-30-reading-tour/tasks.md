## 1. Tour data model & persistence

- [x] 1.1 `Tour { id, name, steps: { file, line, note }[] }` persisted in
      `.reado/tours.json` (Reado owns it), loaded on project open.

## 2. Step-through navigation

- [x] 2.1 `TourBar` floating navigation (step i/n + note + prev/next/exit); each
      step opens the file at its line.

## 3. AI-generated tour

- [x] 3.1 `generate()` dispatches the terminal agent to write a tour to a scratch
      file (`.reado/ai-tour.json`); Reado polls, imports it, and saves it into
      tours.json. Explicit trigger.

## 4. Manual authoring

- [x] 4.1 Create a tour, add a step from the cursor (with a note), remove steps,
      remove a tour — all from `ToursPanel`.

## 5. Glue

- [x] 5.1 `tours` Tool + panel; ActivityBar entry when tours exist; a "Reading
      tours" palette command opens the panel even with none.
- [x] 5.2 EN + IT (`tours.*`); typecheck + cargo check + build green.
