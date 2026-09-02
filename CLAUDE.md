# Reado — working notes

## UI components

**Build on Ark UI, not from scratch.** [`@ark-ui/react`](https://ark-ui.com) is a
dependency; use its headless primitives for any interactive base component
(dialogs, menus, tooltips, segmented controls, selects, checkboxes, QR codes, …)
and style them with our Tailwind tokens. Don't hand-roll focus traps, keyboard
nav, positioning, or ARIA that Ark already provides. Import per component, e.g.
`import { Tooltip } from "@ark-ui/react/tooltip"`.

**Reach for the shared atoms before writing raw markup.** Common UI is a
component, not a copy-pasted `<button className="…">`:

- **`Button`** (`atoms/Button.tsx`) — text buttons (`primary` / `secondary` /
  `ghost` / `danger`, sizes `sm`/`md`). Never restyle a bare `<button>` for a
  text action.
- **`IconButton`** (`atoms/IconButton.tsx`) — every clickable icon. `label` is
  required (it is both `aria-label` and the tooltip); pass `active` for toggles,
  `danger` for destructive actions. It carries an Ark-based `Tooltip`, so a
  migrated icon button needs no `title`.
- **`Tooltip`** (`atoms/Tooltip.tsx`) — Ark tooltip; `IconButton` uses it.
  `GlobalTooltip` (the legacy `title`-scraping singleton) is the interim fallback
  for buttons not yet on `IconButton`; prefer `IconButton`/`Tooltip` for new code
  and migrate old buttons toward them.

If a component isn't trivial and Ark has it, use Ark. If clickable UI repeats,
promote it to an atom rather than duplicating classes.

### Phosphor icons

The `atoms/icons.tsx` set wraps Phosphor. Import the **`*Icon`-suffixed** exports
(`CaretRightIcon`, not the deprecated bare `CaretRight`).

## Code style

**Biome owns formatting and lint** ([`biome.jsonc`](./biome.jsonc)): no
semicolons, double quotes, 100 columns, imports organized. `pnpm lint` is the
read-only check CI runs; `pnpm lint:fix` applies everything it flags. Don't
hand-format — run the fixer.

CI fails on a single diagnostic and the check is required on `main`, so a rule
left enabled is a rule the code obeys. The handful that are off carry their
reason inline in `biome.jsonc`; turning one back on means fixing its sites, not
suppressing them one by one.

**Imports use the `@/…` alias** for anything outside a file's own directory
(`@/lib/api`, `@/components/atoms/Button`); a sibling stays relative (`./x`).
The alias is declared in `tsconfig.json`, `vite.config.ts` and `vitest.config.ts`
— all three, or one of the three toolchains won't resolve it.

## Releases & changelog

Every user-facing change is recorded in [`CHANGELOG.md`](./CHANGELOG.md) under the
**[Unreleased]** heading, in `Added` / `Changed` / `Fixed` groups, as the work
lands (not deferred to release time).

**When cutting a release** (`pnpm release`, which bumps the manifests, commits
`release: vX.Y.Z`, tags, and pushes):

1. First rename `## [Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] — YYYY-MM-DD`
   and add a fresh empty `## [Unreleased]` above it. Update the compare/link
   footnotes at the bottom.
2. The release commit **must include `CHANGELOG.md`** alongside the version bump —
   so everything listed under that version ships in the same commit as the tag.
   (`scripts/release.sh` stages `CHANGELOG.md`, so don't leave the file dirty with
   unrelated edits when releasing.)

Never release without moving the accumulated `[Unreleased]` entries into the new
version — a tagged release with an empty changelog section means changes went out
undocumented. The GitHub release page is *built* from that section
([`scripts/release-notes.sh`](./scripts/release-notes.sh) lifts it out at tag
time), so skipping the rename publishes a release that describes nothing.
