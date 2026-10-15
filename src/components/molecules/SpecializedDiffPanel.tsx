import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/atoms/Modal"
import {
  type DiffTool,
  gitConfirmDiffTool,
  gitDiffTools,
  gitSpecializedDiff,
  type SpecializedDiff,
} from "@/lib/api"

interface Props {
  root: string
  file: string
  base: string
  head: string | null
}

function escapeBidiControls(text: string): string {
  return text.replace(
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  )
}

export function SpecializedDiffPanel(props: Props) {
  return <Panel key={JSON.stringify(props)} {...props} />
}

function Panel({ root, file, base, head }: Props) {
  const { t } = useTranslation()
  const [tools, setTools] = useState<DiffTool[]>([])
  const [selected, setSelected] = useState<DiffTool | null>(null)
  const [result, setResult] = useState<(SpecializedDiff & { kind: DiffTool["kind"] }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const alive = useRef(true)
  const running = useRef(false)
  const inspectFailed = t("diff.tools.inspectFailed")

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    gitDiffTools(root, file)
      .then((value) => {
        if (!cancelled) setTools(value)
      })
      .catch(() => {
        if (!cancelled) setError(inspectFailed)
      })
    return () => {
      cancelled = true
    }
  }, [root, file, refresh, inspectFailed])

  const preview = async () => {
    if (!selected || running.current) return
    running.current = true
    const tool = selected
    setSelected(null)
    setError(null)
    setBusy(true)
    try {
      await gitConfirmDiffTool(root, file, tool.id)
      const value = await gitSpecializedDiff(root, file, base, head, tool.id)
      if (alive.current) setResult({ ...value, kind: tool.kind })
    } catch (cause) {
      if (!alive.current) return
      const message = String(cause)
      setError(
        message === "diff-tool-changed"
          ? t("diff.tools.changed")
          : message === "diff-tool-timeout"
            ? t("diff.tools.timeout")
            : message === "diff-tool-too-large"
              ? t("diff.tools.tooLarge")
              : `${t("diff.tools.failed")} ${message}`,
      )
      if (message === "diff-tool-changed") {
        setTools([])
        setRefresh((n) => n + 1)
      }
    } finally {
      running.current = false
      if (alive.current) setBusy(false)
    }
  }

  if (tools.length === 0 && !error && !busy) return null

  return (
    <div className="flex flex-none flex-col gap-2 border-b border-line bg-surface px-3 py-2 text-xs">
      {tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-muted">{t("diff.tools.available")}</span>
          {tools.map((tool) => (
            <Button
              key={tool.id}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setError(null)
                setSelected(tool)
              }}
            >
              {tools.length === 1 ? t("diff.tools.view") : t(`diff.tools.${tool.kind}`)}
            </Button>
          ))}
        </div>
      )}
      {busy && (
        <span role="status" className="text-muted">
          {t("diff.tools.running")}
        </span>
      )}
      {error && (
        <span role="alert" className="break-words text-marker">
          {error}
        </span>
      )}
      <Modal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        ariaLabel={t("diff.tools.confirm")}
        className="w-full max-w-xl p-5"
      >
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink">{t("diff.tools.confirm")}</h2>
          <p className="text-sm text-muted">{t("diff.tools.consent")}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted">{t("diff.tools.project")}</dt>
            <dd className="break-all text-ink">{escapeBidiControls(root)}</dd>
            <dt className="text-muted">{t("diff.tools.file")}</dt>
            <dd className="break-all text-ink">{escapeBidiControls(file)}</dd>
            <dt className="text-muted">{t("diff.base")}</dt>
            <dd className="break-all text-ink">
              {escapeBidiControls(base)} → {escapeBidiControls(head ?? t("diff.saved"))}
            </dd>
          </dl>
          <pre className="max-h-40 overflow-auto rounded-md bg-canvas p-3 font-mono text-xs whitespace-pre-wrap break-all text-ink">
            {selected ? escapeBidiControls(selected.command) : ""}
          </pre>
          <p className="text-xs text-muted">{t("diff.tools.savedHint")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void preview()}>
              {t("diff.tools.run")}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) setResult(null)
        }}
        ariaLabel={t("diff.tools.result")}
        className="flex max-h-[85vh] w-full max-w-5xl flex-col p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t("diff.tools.result")}</h2>
            <p className="text-xs text-muted">{t("diff.tools.readOnly")}</p>
          </div>
          <Button variant="secondary" onClick={() => setResult(null)}>
            {t("common.close")}
          </Button>
        </div>
        {result?.truncated && (
          <p role="status" className="mb-2 text-xs text-marker">
            {t("diff.tools.truncated")}
          </p>
        )}
        <pre className="min-h-0 overflow-auto rounded-md bg-canvas p-3 font-mono text-xs whitespace-pre-wrap break-words text-ink">
          {result?.text ||
            t(result?.kind === "external" ? "diff.tools.noOutput" : "diff.noChanges")}
        </pre>
      </Modal>
    </div>
  )
}
