> Mostly wiring: the frontend already routes a `menu` event to commands, and the
> commands already exist. Add menu items + ids, and the few missing command
> handlers (recent projects list, theme submenu).

## 1. Menu definition (Rust, `src-tauri/src/menu.rs`)

- [x] 1.1 Add Selection, Terminal, and Help submenus; extend File, Edit, Go, View.
- [x] 1.2 Emit stable ids for each custom item (e.g. `go:back`, `edit:replace`, `terminal:split`, `help:website`, `view:splitEditor`).
- [ ] 1.3 Open Recent submenu built from the recent-projects list (passed from the frontend or read at build time / rebuilt on change).
- [x] 1.4 Appearance/Theme submenu listing the themes.
- [ ] 1.5 Set accelerators to match the in-app shortcuts.

## 2. Event routing (frontend, `src/lib/menu.ts`)

- [x] 2.1 Map each new id to the existing action (back/forward, reopenClosed, toggleSidebar, openSplit, find references, go to line, replace, send review, audit, check for updates, etc.).
- [x] 2.2 Help → Website / Report Issue open URLs via the opener plugin.
- [ ] 2.3 Disable file-scoped items when no file is open (enable/disable on active-file change).

## 3. Glue

- [ ] 3.1 Surface the recent-projects list to the menu so Open Recent stays current.
- [ ] 3.2 i18n: menu labels in EN + IT.

## 4. Verification

- [ ] 4.1 Every menu item triggers its command on macOS (and builds on Win/Linux).
- [ ] 4.2 Accelerators shown match the actual shortcuts.
- [x] 4.3 typecheck + cargo check + build green.
