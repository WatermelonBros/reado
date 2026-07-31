## ADDED Requirements

### Requirement: Graph Nodes and Edges
Reado SHALL build a knowledge graph whose nodes are comments and files, with edges from manual links between comments and from co-location (comments sharing a file/area).

#### Scenario: Co-location edge
- **WHEN** two comments are anchored in the same file
- **THEN** the graph connects them via a co-location edge

#### Scenario: Manual link edge
- **WHEN** the user links one comment to another
- **THEN** the graph connects them via a link edge

### Requirement: Progress View
The graph SHALL offer a view of work progress, conveying which areas have open, in-progress, and resolved comments.

#### Scenario: See progress by area
- **WHEN** the user opens the progress view
- **THEN** the graph distinguishes areas by their comment states

### Requirement: Concept Exploration View
The graph SHALL support exploring conceptual relationships across the codebase through comments and their connections.

#### Scenario: Explore relationships
- **WHEN** the user selects a node
- **THEN** the graph reveals its connected comments and files

### Requirement: Documentation Source
The graph and its underlying data SHALL be usable as a source for generated documentation views.

#### Scenario: Feed documentation
- **WHEN** documentation views are generated
- **THEN** they draw on the graph's comments and relationships
