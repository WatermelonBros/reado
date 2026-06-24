## 1. LSP plumbing (call hierarchy)

- [ ] 1.1 Detect `callHierarchyProvider` in the server capabilities so callers can branch on support.
- [ ] 1.2 `src/lib/lsp.ts`: `lspPrepareCallHierarchy(pos)` → `textDocument/prepareCallHierarchy`, returning the resolved hierarchy item(s) or null.
- [ ] 1.3 `lspIncomingCalls(item)` / `lspOutgoingCalls(item)` → `callHierarchy/incomingCalls` | `callHierarchy/outgoingCalls`, mapped to `{name, kind, path, line}` plus call ranges.
- [ ] 1.4 Route any new request methods through the existing request plumbing in `src-tauri/src/lsp.rs` (no new transport).

## 2. LSP plumbing (type hierarchy)

- [ ] 2.1 Detect `typeHierarchyProvider` in the server capabilities.
- [ ] 2.2 `lspPrepareTypeHierarchy(pos)` → `textDocument/prepareTypeHierarchy`.
- [ ] 2.3 `lspSupertypes(item)` / `lspSubtypes(item)` → `typeHierarchy/supertypes` | `typeHierarchy/subtypes` (supertypes = extends/implements, subtypes = implementers).

## 3. Graceful fallback

- [ ] 3.1 When no `callHierarchyProvider` (or prepare returns nothing), derive approximate incoming calls from the existing references/symbol index; mark results as a heuristic fallback in the data.
- [ ] 3.2 When no `typeHierarchyProvider`, use `textDocument/implementation` and definition results to approximate sub/supertypes; mark as heuristic.
- [ ] 3.3 Empty/unsupported state surfaces an honest message rather than an empty silent panel.

## 4. Navigable UI

- [ ] 4.1 Add a `hierarchy` value to `WorkspaceState.Tool` in `src/lib/store.ts` and a side-panel registration.
- [ ] 4.2 Tree component with lazy expansion: expanding a node fetches its children (incoming/outgoing or super/sub) on demand; calm styling using semantic tokens.
- [ ] 4.3 Direction toggle (incoming ↔ outgoing) for calls and (supertypes ↔ subtypes) for types; a small "heuristic fallback" badge when results came from the fallback path.
- [ ] 4.4 Clicking a node opens path+line via `useProject.open`; keyboard navigation (arrows expand/collapse, Enter jumps); WCAG AA focus states.
- [ ] 4.5 Inline peek over the editor showing the hierarchy in place; Escape closes, an action opens the file.

## 5. Triggers & i18n

- [ ] 5.1 Go menu + command palette / Command Center entries (Show Call Hierarchy, Show Type Hierarchy) and a keybinding; explicit trigger only, never automatic.
- [ ] 5.2 Add EN + IT strings to `src/i18n/locales/en.json` and `it.json`.

## 6. Verify

- [ ] 6.1 typecheck + cargo check + build green.
