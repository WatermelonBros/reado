# Components

UI is organized by [atomic design](https://bradfrost.com/blog/post/atomic-web-design/),
from smallest to largest:

- **`atoms/`** — primitives with no domain logic: `Checkbox`, `Select`, `Modal`,
  `Drawer`, `ContextMenu`, the `icons` set, and the shared comment metadata
  (`commentMeta`: type colors and the `Dot`).
- **`molecules/`** — small, mostly-presentational composites: `Breadcrumb`,
  `StatusBar`, `GitignorePrompt`, `Welcome`.
- **`organisms/`** — self-contained feature surfaces: the editor, file tree,
  side panels (search/comments/git/orphans/outline/specs), tabs, terminal,
  command palette, knowledge graph, knowledge base, settings, and the dialogs.
- **`pages/`** — top-level screens the app routes between: `RecentProjects`
  (launcher) and `ProjectView` (the workspace shell).

There is no separate `templates/` layer: `ProjectView` is both the workspace
layout and its only instance, so a template/page split would be ceremony.

Rule of thumb when adding a component: it belongs to the lowest layer that can
express it. A button is an atom; a labeled field group is a molecule; anything
that owns state, talks to a store, or composes several molecules is an organism.
