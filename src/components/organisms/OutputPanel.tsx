/**
 * Output: the app's own log, in the app, by channel.
 *
 * The file sink keeps everything and outlives the session; this shows what is
 * happening now, so "the language server didn't start" can be answered without
 * leaving Reado to find a JSON-lines file in Application Support. The buffer and
 * its filters live in `lib/outputLog.ts`; this is the view.
 */

import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { FilesIcon, FolderIcon, TrashIcon } from "@/components/atoms/icons"
import { Select } from "@/components/atoms/Select"
import type { LogLevel } from "@/lib/logger"
import { runMenuCommand } from "@/lib/menu"
import { channelsOf, filterRecords, formatRecord, useOutput } from "@/lib/outputLog"
import { useSettings } from "@/lib/store"

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug", "trace"]

/** Colour by severity — the one thing you scan an output pane for. */
const LEVEL_CLASS: Record<LogLevel, string> = {
  error: "text-danger",
  warn: "text-warning",
  info: "text-ink",
  debug: "text-muted",
  trace: "text-faint",
}

const time = (at: number) => new Date(at).toTimeString().slice(0, 8)

export function OutputPanel() {
  const records = useOutput((s) => s.records)
  const clear = useOutput((s) => s.clear)
  const logEnabled = useSettings((s) => s.logEnabled)
  const { t } = useTranslation()
  const [channel, setChannel] = useState<string | null>(null)
  const [level, setLevel] = useState<LogLevel>("debug")
  const [text, setText] = useState("")
  const [follow, setFollow] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const channels = useMemo(() => channelsOf(records), [records])
  const shown = useMemo(
    () => filterRecords(records, { channel, level, text }),
    [records, channel, level, text],
  )

  // Follow the tail, until the reader scrolls up — at which point following
  // would fight them for the scroll position.
  useEffect(() => {
    if (!follow) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [shown.length, follow])

  // A channel that stops existing (cleared) must not filter everything away.
  useEffect(() => {
    if (channel && !channels.includes(channel)) setChannel(null)
  }, [channel, channels])

  return (
    // `min-w-0 flex-1`: the dock lays its panels out in a row, so without it the
    // panel is only as wide as its own toolbar and the log reads in a column.
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* One row, never wrapped: wrapping put the filter field on a line of its
          own where it kept its flex basis and looked like a stub. The field takes
          whatever the controls leave. */}
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-2 py-1">
        <Select
          value={channel ?? ""}
          onChange={(v) => setChannel(v || null)}
          options={[
            { value: "", label: t("output.allChannels") },
            ...channels.map((c) => ({ value: c, label: c })),
          ]}
          ariaLabel={t("output.channel")}
          // Wide enough for a channel name — `lsp:typescript` is the one you
          // come here to read, and a truncated channel list is unusable.
          className="h-7 w-48 flex-none py-0"
        />
        <Select
          value={level}
          onChange={(v) => setLevel(v as LogLevel)}
          options={LEVELS.map((l) => ({ value: l, label: l }))}
          ariaLabel={t("output.level")}
          className="h-7 w-24 flex-none py-0"
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("output.filter")}
          aria-label={t("output.filter")}
          // Grows with the panel but stops: a filter field the width of the
          // window is a lot of box for a word or two.
          className="h-7 min-w-[5rem] max-w-[20rem] flex-1 rounded-md border border-line bg-canvas px-2 text-xs text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <Button
          variant={follow ? "primary" : "secondary"}
          size="sm"
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          className="ml-auto flex-none"
        >
          {t("output.follow")}
        </Button>
        <IconButton
          size="sm"
          label={t("output.copy")}
          icon={<FilesIcon className="h-3.5 w-3.5" />}
          onClick={() =>
            void clipboardWriteText(shown.map(formatRecord).join("\n")).catch(() => {})
          }
        />
        <IconButton
          size="sm"
          label={t("output.clear")}
          icon={<TrashIcon className="h-3.5 w-3.5" />}
          onClick={clear}
        />
        {/* The buffer is the last 2000 records; the file is everything. When you
            need more than this panel holds, this is where it is. */}
        <IconButton
          size="sm"
          label={t("output.revealLog")}
          icon={<FolderIcon className="h-3.5 w-3.5" />}
          onClick={() => runMenuCommand("help:revealLog")}
        />
      </div>

      {!logEnabled && <p className="px-3 py-2 text-xs text-faint">{t("output.loggingOff")}</p>}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          // Within a line of the bottom counts as "at the bottom".
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
        }}
        className="min-h-0 flex-1 overflow-auto px-2 py-1 font-mono text-[11px] leading-relaxed"
      >
        {shown.length === 0 && logEnabled && (
          <p className="px-1 py-2 text-xs text-faint">{t("output.empty")}</p>
        )}
        {shown.map((r) => (
          <div key={r.seq} className="flex gap-2 whitespace-pre-wrap">
            <span className="flex-none text-faint tabular-nums">{time(r.at)}</span>
            <span className="flex-none text-muted">{r.channel}</span>
            <span className={`min-w-0 ${LEVEL_CLASS[r.level]}`}>
              {r.msg}
              {r.fields && Object.keys(r.fields).length > 0 && (
                <span className="text-faint"> {JSON.stringify(r.fields)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
