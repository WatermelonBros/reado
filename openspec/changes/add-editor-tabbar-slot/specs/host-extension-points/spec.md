## ADDED Requirements

### Requirement: Editor tab bar slot

The app SHALL expose a named slot `editor.tabbar` at the right end of the primary
editor group's tab bar, outside the scrolling strip of tabs, so its content stays
visible whatever the number of open tabs. Other editor groups SHALL NOT render it.
With no registrations it SHALL render nothing and take no space.

#### Scenario: Many tabs

- **WHEN** an embedding build fills `editor.tabbar` and more tabs are open than fit
- **THEN** the tabs scroll and the slot's content stays at the right end

#### Scenario: Split editor

- **WHEN** the editor is split into two groups
- **THEN** only the primary group's tab bar shows the slot's content

#### Scenario: No tab open

- **WHEN** every tab is closed and an embedding build fills `editor.tabbar`
- **THEN** the bar stays, showing only the slot; with nothing registered it does not

### Requirement: Editor extensions

The app SHALL let an embedding build register functions that, for each code editor
it opens, receive the project root, the file's project-relative path and whether it
is the primary editor, and return CodeMirror extensions to add to that editor. With
none registered the editor SHALL be unchanged.

#### Scenario: A registered extension

- **WHEN** an embedding build registers an extension for `src/a.ts`
- **THEN** the editor opened on `src/a.ts` includes it, and other files' don't

### Requirement: Write guards

The app SHALL let an embedding build register guards that, given a project root and
a file path, say the file must not be written. Every write of a file through the
app SHALL consult them; a held-back write SHALL write nothing and SHALL complete as
a successful save would. With none registered every write SHALL happen as before.

#### Scenario: A held-back file

- **WHEN** a guard holds back `shared.ts` and the user saves it
- **THEN** nothing is written, and other files save as usual
