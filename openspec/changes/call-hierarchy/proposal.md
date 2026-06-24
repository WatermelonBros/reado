## Why

Reading code is mostly about understanding a symbol's *blast radius*: who calls
this function, what it calls in turn, and — for types — who implements or extends
it. Today Reado can jump to a definition or list references, but references are a
flat list of textual hits with no caller/callee structure and no type lattice.
A reader who wants to understand impact before annotating a comment (the unit the
AI later resolves) has to reconstruct the graph by hand.

Call and type hierarchy are read-first by nature: they let you survey a symbol's
relationships in place — an expandable tree or an inline peek — and click to jump,
without committing to navigation. This fits the calm, honest surfaces principle:
explicit trigger, no silent action, and an honest "server doesn't support this"
fallback when a language server lacks the capability.

## What Changes

- **Incoming/outgoing call hierarchy** via the language server:
  `textDocument/prepareCallHierarchy` then `callHierarchy/incomingCalls` and
  `callHierarchy/outgoingCalls`, exposed as helpers in `src/lib/lsp.ts` and routed
  through the existing request plumbing (`src-tauri/src/lsp.rs`).
- **Type hierarchy** (implementers / supertypes) via
  `textDocument/prepareTypeHierarchy` then `typeHierarchy/supertypes` and
  `typeHierarchy/subtypes`, with the same helper shape.
- **Navigable UI**: a `hierarchy` side-panel Tool (new `WorkspaceState.Tool` in
  `src/lib/store.ts`) showing a lazily-expandable tree (each node fetches its
  children on expand), plus an inline peek over the editor so the reader can stay
  in the file. Clicking any node opens path+line via `useProject.open`.
- **Graceful fallback**: when the server advertises no `callHierarchyProvider` /
  `typeHierarchyProvider` (or the prepare step returns nothing), fall back to the
  existing references/symbol index (e.g. references grouped as approximate
  incoming calls; `implementation` results for type relationships) and label the
  result honestly as a heuristic fallback.
- Triggers wired into the Go menu and command palette / Command Center, plus a
  keybinding; i18n strings added to `src/i18n/locales/en.json` and `it.json`.

## Capabilities

### Added Capabilities
- `call-hierarchy`: read-first call and type hierarchy via LSP, shown as a
  navigable tree/peek with graceful fallback.

## Out of Scope

- A full graph/diagram visualization (we ship a tree/peek, not a node graph).
- Cross-language or whole-workspace precomputed call graphs.
- Editing or refactoring from the hierarchy (read-first only; jumps, no rewrites).
- New server capabilities or bundling additional language servers.
