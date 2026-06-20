#!/usr/bin/env bash
# Regenerate all app icons from the source artwork.
#
# Pipeline: branding/icon-source.png (a full-bleed 1024 raster — the open-book
# mark on the dark glow background) → apply the macOS-style squircle mask
# (rounded corners, transparent outside) → branding/icon.png → tauri icon.
#
# The source is a raster on purpose: tracing the book to SVG merged the two
# right-hand sheets into one shape, so we keep the raster and mask it here.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="branding/icon-source.png"
OUT="branding/icon.png"

# Rounded-square (squircle) mask: 824x824 inset, ~22% corner radius.
magick -size 1024x1024 xc:black -fill white \
  -draw "roundrectangle 100,100,924,924,184,184" /tmp/reado-squircle-mask.png
magick "$SRC" /tmp/reado-squircle-mask.png -alpha off \
  -compose CopyOpacity -composite "$OUT"

npx tauri icon "$OUT"
echo "icons regenerated from $SRC"
