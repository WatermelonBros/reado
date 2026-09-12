## Why

A `.ipynb` opens in Reado as what it is on disk: a wall of JSON with the notebook
buried in it — base64 images inline, source split into one-string-per-line
arrays, outputs interleaved with metadata. Nobody opens a notebook to read that.

The results are already in the file. A notebook saves its outputs alongside its
cells, which is why a notebook can be shared and read without anything running —
so showing a readable notebook needs no kernel at all, only a renderer.

## What Changes

- **`.ipynb` renders as cells**: markdown as prose, code with its execution
  number, raw cells as themselves.
- **Saved outputs shown** under each code cell: printed lines (with stderr told
  from stdout), returned values, HTML tables, figures, and tracebacks with their
  terminal colour stripped.
- **Rich output is sanitised** through the same pipeline as project markdown — a
  notebook is a document that arrived from somewhere else.
- **The source toggle**, the same one markdown has, is where the JSON, editing
  and the comment gutter stay.
- **Running is one button for the whole notebook** (`jupyter nbconvert
  --execute`), in a terminal.

## Capabilities

### Added Capabilities

- `notebook-view`: reading a Jupyter notebook as cells and outputs.

## Impact

- New `src/lib/notebook.ts` (parser) and `src/components/organisms/NotebookView.tsx`.
- One branch in `Editor.tsx`, beside the markdown one it mirrors.
- Deliberately not built: per-cell execution. That needs a live Jupyter kernel
  session — five ZeroMQ sockets and an HMAC — which is a subsystem, not a
  function. A per-cell button that quietly re-ran the whole file would be a lie
  about what had run, so the whole-notebook button is the honest offer.
