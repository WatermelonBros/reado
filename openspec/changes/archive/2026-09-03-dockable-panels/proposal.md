## Why

Reado's workspace has **fixed regions**: the tool panels on the left, the editor
in the centre, and the terminal / browser preview locked to bottom-or-right. As
the surface grew — terminal, browser preview (with its own Console/Network/Elements
inspector), split editor, a dozen tool panels — the fixed layout stopped fitting
real workflows. Users want to co-locate and rearrange them: the browser preview
**side-by-side with the terminal**, tools on the right, the inspector wherever it
helps. Today each panel has at most a bottom/right toggle and can't share space
with another.

A **dockable-panel system** lets the user move any panel to any dock area, stack
or split panels, resize freely, and have the arrangement persist. The layout
adapts to the work instead of the other way around.

## What Changes

- **Layout model.** Dock **areas** (left / right / bottom) around the fixed editor
  centre. Each area holds one or more panel **groups** (a tabbed stack of panels);
  groups within an area can be **split** so two panels sit side-by-side. Movable
  panels: the tool panels (files / search / comments / …), the **terminal**, and
  the **browser preview** (its Console/Network inspector is a nested sub-dock).
- **Move panels.** Drag a panel's tab onto another area or group — drop indicators
  show where it lands (into a group as a tab, or split beside it). A keyboard/menu
  path ("Move panel → Left / Right / Bottom / Split") mirrors drag for
  accessibility.
- **Resize.** Every area and split is drag-resizable; sizes persist.
- **Persistence.** The arrangement is saved (per project, restored on open) and
  survives a reload; a "Reset layout" returns to the default.
- **Migration.** Today's layout becomes the default arrangement; the existing
  terminal / inspector bottom-right toggles fold into "move panel".
- **Correctness.** The **native browser child window** follows its placeholder to
  wherever it docks (screen-coordinate reposition already in place), and everything
  stays aligned under the **interface zoom**.

## Capabilities

### Added Capabilities

- `panel-layout`: a dockable, resizable, persisted panel system — move any panel to
  any dock area, stack (tab) or split it, around the fixed editor centre.

### Modified Capabilities

- `browser-preview`: the preview pane and its inspector become **panels** in
  `panel-layout` (dockable anywhere, splittable beside the terminal), instead of a
  fixed right-hand split with a bottom/right inspector toggle.
