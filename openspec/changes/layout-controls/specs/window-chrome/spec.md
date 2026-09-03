## ADDED Requirements

### Requirement: Layout controls in the title bar

Reado SHALL offer, from the title bar, controls to show or hide the primary
sidebar, the panel and the secondary sidebar, and SHALL show each control's
current state.

#### Scenario: Hiding a region

- **WHEN** the reader activates the primary sidebar toggle
- **THEN** that region is hidden, and the control shows it as hidden

#### Scenario: The title bar and Settings agree

- **WHEN** a region is hidden from the title bar
- **THEN** the matching Settings control reflects it, and vice versa — they are
  one setting with two surfaces

### Requirement: A place that holds the window's shape

Reado SHALL provide a single surface listing the window's structural options —
activity bar, status bar, breadcrumbs, and which side the primary sidebar is on.

#### Scenario: Moving the primary sidebar

- **WHEN** the reader sets the primary sidebar to the right
- **THEN** the sidebar and its activity bar render on the right edge and the
  editor keeps the middle

#### Scenario: The choice persists

- **WHEN** the project is reopened
- **THEN** the window keeps the shape the reader chose
