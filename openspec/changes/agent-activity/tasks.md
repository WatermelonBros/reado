## 1. Activity feed store

- [x] 1.1 `src/lib/activity.ts`: a capped, de-duplicated feed of external file
      changes (`{ file, time }`, most recent first); `record`/`clear`.
- [x] 1.2 Fed from the existing `file-changed` watcher in `ProjectView`, recording
      only external changes (own saves excluded via `wasSelfWrite`, consumed once).

## 2. Comment mapping

- [x] 2.1 Each entry shows the count of comments on that file (`commentsForFile`),
      and a "Δ" when the file has a pending read-delta (i.e. it changed since read).

## 3. Panel UI

- [x] 3.1 `activity` Tool + `ActivityPanel`: recent changes, relative age, comment
      count, click to open (opening the delta when one is pending). Clear action.
- [x] 3.2 ActivityBar entry appears once there's activity this session.

## 4. Read-only guarantee

- [x] 4.1 The panel only reports/navigates — it never drives the agent or mutates
      comment state (it links to comments advisorily).

## 5. i18n + verify

- [x] 5.1 EN + IT (`activity.*`).
- [x] 5.2 typecheck + build green.
