# notebook-view Specification

## Purpose
TBD - created by archiving change notebook-view. Update Purpose after archive.
## Requirements
### Requirement: A Notebook Opens As Cells

Reado SHALL render a `.ipynb` file as its ordered cells rather than as JSON:
markdown cells as prose, code cells as code, raw cells as their own text. A code
cell SHALL show its execution number, including its absence for a cell that has
not run.

The execution number is shown because it is often *not* the order the cells are
in, which is the first thing worth knowing about someone else's notebook.

#### Scenario: Opening one

- **WHEN** the user opens a `.ipynb`
- **THEN** its cells are shown in order, with markdown rendered and code shown as
  code

#### Scenario: What has run

- **WHEN** a code cell has an execution number
- **THEN** it is shown beside the cell, and a cell that never ran shows none

### Requirement: Saved Outputs Are Shown

Reado SHALL show the outputs stored in the file under the code cell that produced
them: streamed text with stderr distinguishable from stdout, returned values,
rich representations, figures, and errors as their traceback.

Where a single result carries several representations, Reado SHALL show the
richest one — a figure rather than its textual repr, a table rather than the same
table redrawn in spaces.

A traceback SHALL have its terminal colour stripped, because this is not a
terminal.

#### Scenario: A figure

- **WHEN** a result carries both an image and a text repr of itself
- **THEN** the image is shown

#### Scenario: An error

- **WHEN** a cell's output is an error
- **THEN** its traceback is shown as text, without escape sequences

#### Scenario: stderr

- **WHEN** a cell wrote to both stdout and stderr
- **THEN** the two are distinguishable

### Requirement: Rich Output Is Untrusted

Reado SHALL render a notebook's HTML output through the same sanitising pipeline
as project markdown. A notebook is a document produced elsewhere, and its outputs
are arbitrary HTML that arrived with it.

#### Scenario: HTML from elsewhere

- **WHEN** a notebook's output contains HTML
- **THEN** it is sanitised before it is rendered

### Requirement: Malformed Notebooks Degrade

Reado SHALL treat a file that is not a readable notebook as a file to show as
text, not as an error: a half-written `.ipynb`, or one that is really something
else, SHALL produce an honest message pointing at the source view rather than a
crash or an empty page.

#### Scenario: Mid-save

- **WHEN** a `.ipynb` is truncated or is not a notebook at all
- **THEN** Reado says so and points at the source view

#### Scenario: An output shape from the future

- **WHEN** a cell carries an output Reado does not recognise
- **THEN** that output is skipped and the rest of the cell is shown

### Requirement: The Source Is One Toggle Away

Reado SHALL offer the same source toggle markdown has, so that the notebook's
JSON — and with it editing, saving, and the comment gutter — stays reachable
without leaving the tab.

#### Scenario: Switching to source

- **WHEN** the user toggles to source on a notebook
- **THEN** the file's JSON is shown in the code editor, with the usual gutter

### Requirement: Running The Notebook

Reado SHALL offer to execute the whole notebook through the project's own
`jupyter nbconvert`, in a terminal pane, so its progress and failures read
normally. Reado SHALL NOT offer per-cell execution, because without a kernel
session there is no such thing as "this cell, in the state the last one left it",
and a per-cell control that re-ran everything would misstate what had run.

#### Scenario: Executing

- **WHEN** the user runs the notebook
- **THEN** `jupyter nbconvert --execute` runs against that file in a terminal
  pane, with its path quoted

