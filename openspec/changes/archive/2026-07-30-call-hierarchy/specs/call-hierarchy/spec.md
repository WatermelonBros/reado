## ADDED Requirements

### Requirement: Incoming and Outgoing Call Hierarchy
Reado SHALL resolve a symbol's incoming and outgoing call hierarchy through the
language server, using `textDocument/prepareCallHierarchy` followed by
`callHierarchy/incomingCalls` and `callHierarchy/outgoingCalls`, so the reader can
survey who calls a function and what it calls in turn.

#### Scenario: Who calls this
- **WHEN** the user invokes Show Call Hierarchy on a function the server resolves
- **THEN** the incoming-calls direction lists each caller, and expanding a caller fetches that caller's own incoming calls

#### Scenario: What does it call
- **WHEN** the user switches the hierarchy to the outgoing direction
- **THEN** the tree lists the functions the symbol calls, each expandable to its callees

#### Scenario: Jump to a call site
- **WHEN** the user activates a node in the call hierarchy
- **THEN** Reado opens that symbol's file at its line via the project open action

### Requirement: Type Hierarchy
Reado SHALL resolve a type's supertypes and subtypes through the language server,
using `textDocument/prepareTypeHierarchy` followed by `typeHierarchy/supertypes`
and `typeHierarchy/subtypes`, so the reader can see what a type extends or
implements and who implements or extends it.

#### Scenario: Who implements or extends this
- **WHEN** the user invokes Show Type Hierarchy on a type the server resolves
- **THEN** the subtypes direction lists implementers and extenders, each expandable to their own subtypes

#### Scenario: Supertypes
- **WHEN** the user switches the type hierarchy to the supertypes direction
- **THEN** the tree lists the type's base classes and implemented interfaces

### Requirement: Graceful Fallback Without Server Support
Reado SHALL fall back to the existing references and symbol index when the
language server does not advertise a call- or type-hierarchy capability (or the
prepare step yields nothing), and SHALL label such results as a heuristic
fallback rather than presenting them as authoritative.

#### Scenario: Server lacks call hierarchy
- **WHEN** the server reports no `callHierarchyProvider` and the user requests a call hierarchy
- **THEN** Reado derives approximate incoming calls from references and marks the result as a heuristic fallback

#### Scenario: Server lacks type hierarchy
- **WHEN** the server reports no `typeHierarchyProvider` and the user requests a type hierarchy
- **THEN** Reado approximates the hierarchy from implementation and definition results and marks it as a heuristic fallback

#### Scenario: Nothing resolves
- **WHEN** neither the server nor the fallback can resolve any relationship for the symbol
- **THEN** Reado shows an honest empty-state message instead of an empty silent panel

### Requirement: Navigable Hierarchy UI
Reado SHALL present the call and type hierarchy as a navigable, lazily-expandable
tree in a side panel and as an inline peek over the editor, with calm styling and
WCAG AA keyboard access, so the reader understands a symbol's blast radius without
leaving the file.

#### Scenario: Lazy expansion
- **WHEN** the user expands a node in the hierarchy tree
- **THEN** that node's children are fetched on demand rather than computed all at once up front

#### Scenario: Inline peek
- **WHEN** the user opens the hierarchy as an inline peek over the editor
- **THEN** the hierarchy appears in place, Escape closes it, and an explicit action opens a selected node's file

#### Scenario: Keyboard navigation
- **WHEN** the user navigates the tree with the keyboard
- **THEN** arrow keys expand and collapse nodes, Enter jumps to the focused node, and focus states meet WCAG AA contrast
