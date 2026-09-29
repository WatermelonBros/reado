#!/usr/bin/env bash
# Record the running Reado dev window to video, cropped to the window itself.
#
#   scripts/demo/record.sh start <name>   # begin capturing (background ffmpeg)
#   scripts/demo/record.sh stop           # finish the capture
#   scripts/demo/record.sh export <name>  # raw capture -> <name>.mp4 + <name>.gif
#
# The window's bounds come from the app itself (window.__reado.win, through the UI
# driver), in physical pixels — the same space avfoundation captures in — so no
# System Events / Accessibility permission is involved. Only Screen Recording is.
# Captures the main display ("Capture screen 0"); keep the window on it.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${DEMO_OUT:-$ROOT/docs/media}"
TMP="${TMPDIR:-/tmp}/reado-demo"
mkdir -p "$OUT" "$TMP"

bounds() {
  node "$ROOT/scripts/uidriver/drive.mjs" eval '{"js":"const w = window.__reado.win; w.setFocus(); const p = await w.outerPosition(); const s = await w.outerSize(); return [p.x, p.y, s.width, s.height].join(\" \")"}'
}

case "${1:-}" in
  start)
    name="${2:?usage: record.sh start <name>}"
    # the real pointer would be captured on top of the window: park it outside
    [ -x "$TMP/park-cursor" ] || swiftc -O "$HERE/park-cursor.swift" -o "$TMP/park-cursor"
    "$TMP/park-cursor"
    read -r x y w h < <(bounds)
    # libx264 wants even dimensions
    w=$((w / 2 * 2)); h=$((h / 2 * 2))
    echo "window: ${w}x${h} at ${x},${y}"
    nohup ffmpeg -hide_banner -loglevel error -y \
      -f avfoundation -capture_cursor 0 -framerate 30 -i "Capture screen 0:none" \
      -vf "crop=${w}:${h}:${x}:${y}" -c:v libx264 -preset ultrafast -crf 12 -pix_fmt yuv420p \
      "$TMP/$name.raw.mp4" >"$TMP/ffmpeg.log" 2>&1 &
    echo $! >"$TMP/ffmpeg.pid"
    sleep 1
    kill -0 "$(cat "$TMP/ffmpeg.pid")" 2>/dev/null || { cat "$TMP/ffmpeg.log"; exit 1; }
    echo "recording -> $TMP/$name.raw.mp4"
    ;;
  stop)
    pid="$(cat "$TMP/ffmpeg.pid")"
    kill -INT "$pid" 2>/dev/null || true # SIGINT lets ffmpeg finalise the file
    while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
    rm -f "$TMP/ffmpeg.pid"
    echo "stopped"
    ;;
  export)
    name="${2:?usage: record.sh export <name>}"
    raw="$TMP/$name.raw.mp4"
    # site: full quality, at most 1920 wide, streamable
    ffmpeg -hide_banner -loglevel error -y -i "$raw" \
      -vf "scale='min(1920,iw)':-2:flags=lanczos" -c:v libx264 -preset slow -crf 20 \
      -pix_fmt yuv420p -movflags +faststart -an "$OUT/$name.mp4"
    # README: small GIF, two-pass palette so UI greys don't band
    ffmpeg -hide_banner -loglevel error -y -i "$raw" \
      -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
      "$OUT/$name.gif"
    ls -lh "$OUT/$name.mp4" "$OUT/$name.gif"
    ;;
  *)
    sed -n '2,11p' "$0"
    exit 2
    ;;
esac
