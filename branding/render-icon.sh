#!/usr/bin/env bash
# Rasterize branding/icon.svg → branding/icon.png and regenerate all app icons.
#
# IMPORTANT: render with a real browser. ImageMagick/librsvg drop SVG filters
# (the book's drop shadow) and flatten the radial glow, so do NOT use `magick`
# to rasterize this icon.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
HTML="$(mktemp -t reado-icon).html"
{
  echo '<!doctype html><html><head><meta charset="utf-8">'
  echo '<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>'
  echo '</head><body>'
  cat branding/icon.svg
  echo '</body></html>'
} > "$HTML"

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --default-background-color=00000000 --force-device-scale-factor=1 \
  --window-size=1024,1024 --screenshot=branding/icon.png "$HTML"

npx tauri icon branding/icon.png
echo "icons regenerated from branding/icon.svg"
