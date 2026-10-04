## Context

`OnboardingTour.tsx` already drives Ark UI's `Tour` (zag) with a custom scrim. A zag
step takes `target: () => HTMLElement | null` and `effect({next, show, update})` —
enough to open a file, scroll, and anchor a dialog to a span of code. `.reado/` is
gitignored by default, so a tour meant for others can't live there.

## Decisions

- **Location: `tour.json` at the project root**, one file for all the project's
  tours — a standard name, like `package.json`, that people recognise and commit.
  Outside `.reado/` so it is committed by default. Watched, so a `git pull` that
  brings a new version shows it.
- **An open standard, deliberately.** The format carries no product name, so any
  tool can adopt it:
  - **Recognition by shape**, not by brand: a `tour.json` is a tour file when its
    top level has `version` (an integer) and `tours` (an array). Anything else is
    someone else's file and is ignored silently. `$schema` is recommended
    (`"https://reado.watermelon-studio.it/schema/tour/v1.json"`) and written by
    tools that save the file, but never required to read it.
  - **Versioning**: `version` is the format's major version. Additive changes
    (new optional fields) keep the number; a reader ignores what it doesn't know.
    A higher major than the reader knows → "This project's tours need a newer
    version of the format."
  - **Extensions**: tool-specific data goes under keys prefixed `x-` (e.g.
    `"x-reado": {…}`), on the file, a tour or a step. Readers ignore them; writers
    must keep every unknown key, `x-` or not, when they rewrite the file.
  - **Specification** in `docs/tour-format.md` and a **JSON Schema** (draft
    2020-12) in `docs/tour.schema.json`, also served at the `$schema` URL by the
    website; both CC0, so adopting them needs no permission. Reado validates with
    the same schema it publishes.
  - The name stays plain `tour.json`: a standard wants the obvious name.
- **Format (v1)**:

  ```ts
  interface TourFile {
    $schema?: string
    version: 1                         // the format's major version
    tours: ProjectTour[]
  }
  interface ProjectTour {
    id: string                         // stable, for resume and editing
    name: string
    description?: string
    onboarding?: boolean               // the project tour; the first marked wins
    author?: string                    // display name
    steps: ProjectTourStep[]
  }
  interface ProjectTourStep {
    file: string                       // project-relative, forward slashes
    span?: { from: Pos; to: Pos }      // absent = whole file
    text?: string                      // the exact code of the span, for re-anchoring
    title: string
    body: string                       // markdown
    placement?: "auto" | "right" | "left" | "top" | "bottom"
  }
  type Pos = { line: number; col?: number }   // 1-based; no col = whole line
  ```

  Positions are 1-based lines and 1-based columns counted in Unicode code points,
  `to` inclusive of its line and exclusive of its column — the specification
  spells this out, since another tool must highlight the same characters.

  A tour file in which some tours don't validate: the valid ones load, the others
  are skipped with a warning in the logs and a quiet note in the tour list ("1 tour
  couldn't be read"). Unknown fields are ignored and preserved.
- **Locating a step**: by `text` first (exact, then whitespace-insensitive, nearest
  to `span`), then by `span` if it still fits the file, else unplaceable — played as
  a whole-file step saying "This code has changed since the step was written". Same
  idea as comment anchoring, without its store.
- **Player: `ProjectTourPlayer`**, an Ark `Tour` rendered at the app root and
  portalled to `document.body` (core rule). Per step:
  - `effect`: open the file (`useProject.open`), wait for its `EditorView`, unfold
    and scroll the span to the middle of the view, wait one frame, then `show()`.
  - `target`: a `position: fixed` highlight element (portalled) over the span from
    `view.coordsAtPos` — first line's start to last line's end for a multi-line
    span; the editor pane for a whole-file step. Repositioned on scroll and resize,
    calling the tour's `update()`.
  - The scrim from `OnboardingTour.tsx`, extracted into a shared component.
  - Dialog: title, markdown body (the comment renderer), "3 of 12", Back / Next /
    Done, close; arrow keys navigate. `lib/overlays.ts` moves the native browser
    pane away as for any floating layer.
  - The highlighted code stays readable and scrollable.
- **Project tour button** in the primary tab bar's end, before the `editor.tabbar`
  slot, shown when a tour has `onboarding`. Palette: `Tour: Start project tour`,
  `Tour: Play…`. Progress `{file, hash of the tour, step}` per project in local
  storage; a changed tour restarts. First-open offer when the project's `read.json`
  is empty or absent, once per project per machine.
- **Read marks**: leaving a step marks its file read through the reading-progress
  store when it isn't already. A preview (an author's draft) leaves no progress
  and no read marks.
- **Extension points** (for the official build's editor): `registerPanel({id, title,
  icon, defaultArea, Component})` — `PanelId` widens to registered ids; and
  `registerEditorMenuItem(fn)` adding items to the editor's context menu.

## Risks / Trade-offs

- [The tour and the code drift] → it's committed with the code, so a checkout of an
  old commit gets the old tour; quoted `text` handles moves; unplaceable steps say
  so.
- [A repository ships a hostile tour] → it is data: markdown rendered with the
  comment renderer (no HTML, no scripts), paths confined to the project root,
  nothing executed.
