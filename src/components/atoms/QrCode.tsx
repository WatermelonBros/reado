/**
 * A QR code rendered as a crisp SVG, built on Ark UI's headless `QrCode`.
 *
 * Always dark-on-light (regardless of theme) so a phone camera reads it reliably:
 * the pattern is filled with `--qr-ink` and the caller places it on a light tile
 * that doubles as the quiet zone. Ark generates and lays out the modules; we only
 * style the surface.
 */
import { QrCode as ArkQrCode } from "@ark-ui/react/qr-code";
import { useTranslation } from "react-i18next";

interface Props {
  /** The payload to encode. */
  value: string;
  /** Rendered pixel size of the square. */
  size?: number;
}

export function QrCode({ value, size = 220 }: Props) {
  const { t } = useTranslation();
  return (
    <ArkQrCode.Root value={value} encoding={{ ecc: "M" }}>
      <ArkQrCode.Frame
        width={size}
        height={size}
        shapeRendering="crispEdges"
        role="img"
        aria-label={t("anywhere.qrLabel")}
      >
        <ArkQrCode.Pattern fill="var(--qr-ink)" />
      </ArkQrCode.Frame>
    </ArkQrCode.Root>
  );
}
