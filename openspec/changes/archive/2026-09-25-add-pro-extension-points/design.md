## Context

See proposal.md. The consumer is the private official build (`reado-pro`), which
includes this repo as a git submodule and must never patch it. Relevant current state:

- `src/main.tsx` does all startup at module top level (i18n, fonts, automation bridge
  in dev, navigation guard, error handlers, companion-window detection) and renders
  `<App />` or `<MascotWindow />`.
- `src-tauri/src/lib.rs::run()` builds `tauri::Builder::default()` with
  single-instance first, then the other plugins, and runs it.
- Settings tabs live in `src/components/organisms/settings/*Tab.tsx`, indexed by
  `settingsIndex.ts`; the activity bar is `organisms/ActivityBar.tsx`.

## Goals / Non-Goals

**Goals:**
- The smallest set of extension points the official build needs now (the account entry,
  backend version in the settings footer, native plugins, deep links).
- Zero behavior change and zero new dependencies in the community build.

**Non-Goals:**
- A general plugin API for third parties. The existing `extensions` capability
  (declarative marketplace contributions) stays the public extension story; these
  hooks are for a trusted build compiled together with the core.
- Runtime command/menu registration — added when a pro feature needs it.

## Decisions

### Slot registry: a module-level map, filled before first render

`src/lib/slots.ts` holds `Map<SlotName, Contribution[]>` with `registerSlot(name, c)`
and a `<Slot name>` component that maps over it, each item in its own error
boundary. Registration is only valid before `boot()` renders; that is enough because
contributions are static per build. No context provider, no store subscription —
alternatives that add reactivity nobody needs yet.

`SlotName` is a string-literal union so a typo is a type error in both repos.

No settings-tab slot: the account lives entirely in the activity-bar entry (a
popover on the avatar), so the settings need nothing but the footer slot.

### `boot()` in `src/boot.tsx`

The current body of `main.tsx` moves verbatim into `export function boot()`.
`main.tsx` becomes `boot()`. The official entry does `registerPro(); boot()`. Moving
code rather than wrapping it keeps the diff reviewable and the order of side effects
identical.

### `run_with(extend)`

```rust
pub fn run() { run_with(|b| b) }
pub fn run_with(extend: impl FnOnce(tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry>)
```

`extend` is applied after all core `.plugin(...)` calls and before `.run(...)`, so
single-instance stays first as it must.

### Second-instance forwarding

The single-instance callback keeps opening existing files and collects the rest into
a `Vec<String>`; if non-empty, it calls every handler registered through a small
`register_arg_handler(fn(&AppHandle, &[String]))` list (a `OnceLock<Mutex<Vec<…>>>`),
set by the embedding binary inside `extend`. Alternative considered: enabling
single-instance's `deep-link` feature in the core — rejected because it pulls the
deep-link plugin into the community build, which does not need it.

## Risks / Trade-offs

- [The hooks become an API the private build depends on] → Keep them few and typed;
  breaking one is caught by the private repo's CI, which builds against every public
  push.
- [Contributors wonder what the slots are for] → The CONTRIBUTING note says it
  plainly: the official build fills them; the community build leaves them empty.
