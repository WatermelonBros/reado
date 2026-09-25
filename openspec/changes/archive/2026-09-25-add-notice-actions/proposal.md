## Why

A notice can report something the person may want to go to — a teammate assigned
them a comment, say — but a toast can only be read and dismissed. An embedding
build (the official one's team notifications) needs "choose it to open it", and the
core should offer that generically rather than each module drawing its own toasts.

## What Changes

- A notice MAY carry one action (a label and a callback). The toast shows it as a
  text button; choosing it runs the callback and dismisses the toast.
- `notify(kind, text, action?)` and `useNotice.show(kind, text, action?)` accept it.
  Existing calls are unchanged.

## Impact

- `src/lib/notice.ts`, `src/components/molecules/Notice.tsx`, their tests.
- No visible change in the community build: nothing in the core passes an action yet.
