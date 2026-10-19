/**
 * A QR code rendered as a crisp SVG, built on rind-ui's headless `QrCode`.
 *
 * Always dark-on-light (regardless of theme) so a phone camera reads it reliably:
 * the pattern is filled with `--qr-ink` and the caller places it on a light tile
 * that doubles as the quiet zone (so rind's built-in quiet zone is off). Rind generates and lays out the modules; we only
 * style the surface.
 */
import { QrCode as RindQrCode } from "@rind-ui/react"
import { useTranslation } from "react-i18next"

interface Props {
  /** The payload to encode. */
  value: string
  /** Rendered pixel size of the square. */
  size?: number
}

export function QrCode({ value, size = 220 }: Props) {
  const { t } = useTranslation()
  return (
    <RindQrCode.Root value={value} encoding={{ ecc: "M", quietZone: 0 }}>
      <RindQrCode.Frame
        width={size}
        height={size}
        shapeRendering="crispEdges"
        role="img"
        aria-label={t("anywhere.qrLabel")}
      >
        <RindQrCode.Pattern fill="var(--qr-ink)" />
      </RindQrCode.Frame>
    </RindQrCode.Root>
  )
}
