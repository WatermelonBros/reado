/**
 * A Jupyter notebook, as cells rather than as the JSON it is stored in.
 *
 * Markdown cells render as prose, code cells as code with their execution
 * number, and each code cell carries the outputs the file was saved with — the
 * printed lines, the returned value, the figure, the traceback. That is what
 * makes a notebook readable without a kernel: the results are in the file.
 *
 * Rich HTML output goes through the same sanitising pipeline as project
 * markdown. A notebook is a document someone else produced, and its outputs are
 * arbitrary HTML that arrived with it; rendering them raw would be handing a
 * downloaded file the run of the window.
 *
 * Running is deliberately one button, not one per cell: without a kernel session
 * there is no such thing as "this cell, in the state the last one left", and a
 * per-cell button that silently re-ran the whole file would be a lie. The button
 * asks `jupyter nbconvert` to execute the notebook in a terminal, where its
 * progress and its failures read normally.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/atoms/Button"
import { PlayIcon } from "@/components/atoms/icons"
import { ptyWrite } from "@/lib/api"
import { markdownRehype, markdownRemark, markdownUrlTransform } from "@/lib/markdown"
import { type NbCell, type NbOutput, parseNotebook } from "@/lib/notebook"
import { shellQuote, useTerminals } from "@/lib/terminals"

function Output({ output }: { output: NbOutput }) {
  if (output.kind === "image")
    return (
      <img
        src={output.dataUrl}
        alt=""
        className="my-1 max-w-full rounded border border-line bg-canvas"
      />
    )
  if (output.kind === "html")
    return (
      <div className="prose-reado max-w-none overflow-x-auto text-sm">
        <ReactMarkdown
          remarkPlugins={markdownRemark}
          rehypePlugins={markdownRehype}
          urlTransform={markdownUrlTransform}
        >
          {output.text ?? ""}
        </ReactMarkdown>
      </div>
    )
  const tone =
    output.kind === "error"
      ? "text-marker"
      : output.stderr
        ? "text-[var(--syn-number)]"
        : "text-muted"
  return (
    <pre className={`overflow-x-auto font-mono text-xs leading-relaxed break-words ${tone}`}>
      {output.text}
    </pre>
  )
}

function Cell({ cell, language }: { cell: NbCell; language: string }) {
  if (cell.type === "markdown")
    return (
      <div className="prose-reado max-w-none px-4 py-2">
        <ReactMarkdown
          remarkPlugins={markdownRemark}
          rehypePlugins={markdownRehype}
          urlTransform={markdownUrlTransform}
        >
          {cell.source}
        </ReactMarkdown>
      </div>
    )

  if (cell.type === "raw")
    return (
      <pre className="mx-4 my-2 overflow-x-auto rounded border border-dashed border-line p-3 font-mono text-xs text-faint">
        {cell.source}
      </pre>
    )

  return (
    <div className="flex gap-2 px-4 py-2">
      {/* The execution number is the notebook's own sense of order, and it is
          often *not* the order the cells are in — which is the single most
          useful thing to see when reading someone else's notebook. */}
      <span className="w-12 flex-none pt-3 text-right font-mono text-[10px] text-faint">
        [{cell.executionCount ?? " "}]
      </span>
      <div className="min-w-0 flex-1">
        <pre
          className="overflow-x-auto rounded border border-line bg-surface p-3 font-mono text-xs leading-relaxed"
          data-language={language}
        >
          {cell.source}
        </pre>
        {cell.outputs.length > 0 && (
          <div className="mt-1 border-l-2 border-line pl-3">
            {cell.outputs.map((output, i) => (
              // Outputs have no identity of their own in the format; their
              // order is the only thing that distinguishes them.
              <Output key={`${i}-${output.kind}`} output={output} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function NotebookView({
  text,
  path,
  root,
}: {
  /** The `.ipynb` file's raw JSON. */
  text: string
  /** Absolute path, for the run command. */
  path: string
  root: string
}) {
  const { t } = useTranslation()
  const notebook = useMemo(() => parseNotebook(text), [text])
  const [running, setRunning] = useState(false)

  if (!notebook)
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-faint" role="status">
        {t("notebook.unreadable")}
      </div>
    )

  const run = async () => {
    setRunning(true)
    const terminals = useTerminals.getState()
    if (!terminals.open) terminals.toggle()
    const id = terminals.add(root)
    useTerminals.getState().setTitle(id, "notebook")
    // Quoted: a notebook's path is as likely to have a space in it as any other
    // document's, and this one came from a file picker, not from a developer.
    await ptyWrite(id, `jupyter nbconvert --execute --inplace ${shellQuote(path)}\r`)
    setRunning(false)
  }

  const codeCells = notebook.cells.filter((c) => c.type === "code").length

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur">
        <span className="text-xs text-faint">
          {t("notebook.summary", { cells: notebook.cells.length, code: codeCells })}
        </span>
        <span className="rounded border border-line px-1.5 text-[10px] text-muted">
          {notebook.language}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={running}
          onClick={() => void run()}
        >
          <PlayIcon className="h-3.5 w-3.5" />
          {t("notebook.runAll")}
        </Button>
      </header>
      <div className="mx-auto max-w-[100ch] pb-16">
        {notebook.cells.map((cell) => (
          <Cell key={cell.id} cell={cell} language={notebook.language} />
        ))}
      </div>
    </div>
  )
}
