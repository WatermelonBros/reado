/**
 * Bottom status bar: active file, cursor position, document info (indentation,
 * encoding, line endings, language), git branch, open-comment count and agent
 * run status. Some items are clickable (go to line, convert line endings), in
 * the spirit of VS Code's status bar.
 */
import { Popover } from "@ark-ui/react/popover"
import { Portal } from "@ark-ui/react/portal"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { Input } from "@/components/atoms/Input"
import { Slot } from "@/components/atoms/Slot"
import { useChords } from "@/lib/chords"
import { toRelative } from "@/lib/comments"
import { goToLine } from "@/lib/docInfo"
import { mod } from "@/lib/shortcuts"
import { useCursor, useProject, useSettings } from "@/lib/store"
import { STATUS_ITEMS } from "./statusBar/items"
import { ITEM } from "./statusBar/shared"

/** Path relative to the project root, with forward slashes. Delegates to the
 *  shared helper: a private copy here silently lost its sibling-prefix guard,
 *  rendering `/home/me/proj-backup/a.ts` as `-backup/a.ts`. */
const relativePath = (root: string, path: string | null): string | null =>
  path ? toRelative(root, path) : null

export function StatusBar() {
  const root = useProject((s) => s.root)
  const active = useProject((s) => s.active)
  const { line, col } = useCursor()
  const chordPending = useChords((s) => s.pending)
  const { t } = useTranslation()

  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const [gotoValue, setGotoValue] = useState("")

  const rel = relativePath(root, active)
  // Which of the optional indicators are showing. The file path and the caret
  // position are not in here: they are what a status bar is *for*.
  const hidden = useSettings((s) => s.hiddenStatusItems)
  const show = (id: string) => !hidden.includes(id)
  const toggleItem = (id: string) =>
    useSettings.getState().set({
      hiddenStatusItems: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id],
    })
  const ctxItems: ContextMenuItem[] = [
    ...STATUS_ITEMS.filter((item) => item.labelKey).map((item) => ({
      label: t(item.labelKey!),
      checked: show(item.id),
      onSelect: () => toggleItem(item.id),
    })),
    {
      label: t("status.hideBar"),
      separatorBefore: true,
      onSelect: () => useSettings.getState().set({ showStatusBar: false }),
    },
  ]

  const submitGoto = () => {
    const n = parseInt(gotoValue, 10)
    if (Number.isFinite(n)) goToLine(n)
    setGotoValue("")
  }

  return (
    <footer
      className="flex h-[26px] flex-none items-center justify-between border-t border-line bg-surface px-2 text-xs text-muted select-none"
      onContextMenu={(e) => {
        e.preventDefault()
        setCtx({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* When the bar runs out of room (a narrow window, a large interface zoom)
          the path gives way first, down to nothing; the cursor position never
          does — this group is never narrower than what it must show. The group
          on the right absorbs the rest: its items wrap onto a second line that
          the bar's height hides, so an item that doesn't fit leaves whole
          instead of being squeezed under its own text or cut in half. */}
      <div className="flex flex-1 items-center gap-1">
        <Slot name="statusbar.left" />
        {/* A prefix you can't see is a prefix that eats your next keystroke for
            reasons you can't account for. */}
        {chordPending && (
          <span className="mr-1 flex-none rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-medium text-on-accent">
            {t("chord.pending", { key: `${mod}K` })}
          </span>
        )}
        {/* Left-truncate (ellipsis on the left) so the filename stays visible on
            long paths; <bdi> keeps the path itself laid out left-to-right. */}
        <span
          className="block min-w-0 flex-1 overflow-hidden px-1 text-ellipsis whitespace-nowrap"
          style={{ direction: "rtl" }}
          title={rel ?? undefined}
        >
          <bdi>{rel ?? t("status.noFile")}</bdi>
        </span>
        {active && (
          <Popover.Root positioning={{ placement: "top-start" }} lazyMount unmountOnExit>
            <Popover.Trigger title={t("status.goToLine")} className={ITEM}>
              Ln {line}, Col {col}
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content className="z-[200] rounded-md border border-line-strong bg-overlay p-1 shadow-[var(--shadow)] focus:outline-none">
                  <Popover.Context>
                    {(api) => (
                      <Input
                        variant="plain"
                        value={gotoValue}
                        inputMode="numeric"
                        onChange={(e) => setGotoValue(e.target.value.replace(/[^0-9]/g, ""))}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return
                          // Prevent the Enter from reaching the editor once
                          // goToLine refocuses it — otherwise it inserts a
                          // newline (shifting the target line by one and marking
                          // the file dirty).
                          e.preventDefault()
                          submitGoto()
                          api.setOpen(false)
                        }}
                        placeholder={t("status.goToLinePlaceholder")}
                        aria-label={t("status.goToLinePlaceholder")}
                        className="block w-[160px]"
                      />
                    )}
                  </Popover.Context>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        )}
      </div>

      <div className="flex h-full min-w-0 flex-wrap items-center justify-end gap-x-1 overflow-hidden *:flex *:h-full *:flex-none *:items-center">
        {STATUS_ITEMS.map(
          ({ id, labelKey, Item }) => (!labelKey || show(id)) && <Item key={id} rel={rel} />,
        )}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />}
    </footer>
  )
}
