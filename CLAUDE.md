# Reado — working notes

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
undocumented.
