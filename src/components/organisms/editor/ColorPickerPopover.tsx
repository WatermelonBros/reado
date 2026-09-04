/**
 * The picker that opens over a colour swatch. Ark's headless colour picker in
 * our tokens, positioned at the swatch and writing back through a callback.
 *
 * The value it hands back is always sRGB; turning that into the notation the
 * source used is the caller's job (`formatColor`), so a file keeps its own
 * dialect instead of being converted to hex on the first edit.
 */

import { ColorPicker, parseColor } from "@ark-ui/react/color-picker"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { formatColor, parseColorLiteral } from "@/lib/colorLiterals"
import type { SwatchHit } from "@/lib/colorSwatch"

/** Keep the panel on screen: it is positioned from the swatch's viewport rect. */
const PANEL_W = 232
const PANEL_H = 250

export function ColorPickerPopover({
  hit,
  onChange,
  onClose,
}: {
  hit: SwatchHit
  /** The literal to write in place of `hit.from`–`hit.to`. */
  onChange: (literal: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  // Escape and a click outside close it, like every other transient panel here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKey)
    // Deferred: the mousedown that opened this panel is still in flight.
    const id = setTimeout(() => window.addEventListener("mousedown", onDown))
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
      clearTimeout(id)
    }
  }, [onClose])

  const rgb = parseColorLiteral(hit.text)
  if (!rgb) return null

  const left = Math.min(Math.max(hit.rect.left, 8), window.innerWidth - PANEL_W - 8)
  const below = hit.rect.bottom + 6
  const top = below + PANEL_H > window.innerHeight ? hit.rect.top - PANEL_H - 6 : below

  return (
    <div
      ref={ref}
      style={{ left, top, width: PANEL_W }}
      className="fixed z-[60] rounded-md border border-line bg-overlay p-2 shadow-[var(--shadow)]"
    >
      <ColorPicker.Root
        open
        inline
        // Ark parses/serialises sRGB; the source's own notation is restored on
        // the way out, in `onValueChange`.
        value={parseColor(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a})`)}
        onValueChange={(d) => {
          const c = d.value.toFormat("rgba")
          onChange(
            formatColor(
              {
                r: Math.round(c.getChannelValue("red")),
                g: Math.round(c.getChannelValue("green")),
                b: Math.round(c.getChannelValue("blue")),
                a: c.getChannelValue("alpha"),
              },
              hit.format,
            ),
          )
        }}
      >
        <ColorPicker.Content className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <ColorPicker.ValueText className="font-mono text-xs text-muted" />
            <IconButton
              label={t("common.close")}
              icon={<CloseIcon className="h-3.5 w-3.5" />}
              onClick={onClose}
            />
          </div>
          <ColorPicker.Area className="h-28 w-full overflow-hidden rounded-sm">
            <ColorPicker.AreaBackground className="h-full w-full" />
            <ColorPicker.AreaThumb className="h-3 w-3 rounded-full border-2 border-white shadow" />
          </ColorPicker.Area>
          <ColorPicker.ChannelSlider channel="hue" className="h-3 w-full rounded-full">
            <ColorPicker.ChannelSliderTrack className="h-full w-full rounded-full" />
            <ColorPicker.ChannelSliderThumb className="h-3 w-3 rounded-full border-2 border-white shadow" />
          </ColorPicker.ChannelSlider>
          <ColorPicker.ChannelSlider channel="alpha" className="h-3 w-full rounded-full">
            <ColorPicker.ChannelSliderTrack className="h-full w-full rounded-full" />
            <ColorPicker.ChannelSliderThumb className="h-3 w-3 rounded-full border-2 border-white shadow" />
          </ColorPicker.ChannelSlider>
        </ColorPicker.Content>
      </ColorPicker.Root>
    </div>
  )
}
