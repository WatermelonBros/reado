/**
 * A QR code rendered as a crisp SVG. Always dark-on-light (regardless of theme)
 * so a phone camera reads it reliably; the caller places it on a light tile that
 * doubles as the quiet zone.
 */
import QRCode from "qrcode";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  /** The payload to encode. */
  value: string;
  /** Rendered pixel size of the square. */
  size?: number;
}

export function QrCode({ value, size = 220 }: Props) {
  const { t } = useTranslation();
  const { d, dim } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    const margin = 2; // quiet zone, in modules
    let path = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (data[y * n + x]) path += `M${x + margin},${y + margin}h1v1h-1z`;
      }
    }
    return { d: path, dim: n + margin * 2 };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={t("anywhere.qrLabel")}
    >
      <path d={d} fill="var(--qr-ink)" />
    </svg>
  );
}
