#!/usr/bin/env python3
"""Build the mascot's sprite atlas from the frames in `assets/mascot/frames`.

The twelve frames are already cut to one shared box (see `frames/README.md`), so
this only scales and tiles them: the character's body lands on the same pixels in
every cell, which is what keeps it from jumping when the state changes.

    python3 scripts/mascot-atlas.py          # -> src/assets/mascot/owl.webp

Needs Pillow and numpy (`pip install pillow numpy`). Not wired into the app build: the atlas is a
committed asset, and this is how it is regenerated when a frame is redrawn.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Cell order IS the atlas contract — `frames.ts` indexes into it by number, so a
# cell may be redrawn but never reordered.
FRAMES = [
    "talk-closed",  # 0  the neutral face: idle, and the start of everything
    "think-blink",  # 1  eyes shut flat — the idle blink as well as the thinking one
    "talk-half",  # 2
    "talk-open",  # 3
    "think-left",  # 4
    "think-right",  # 5
    "done-mid",  # 6
    "done-peak",  # 7
    "done-settle",  # 8
    "ask-widen",  # 9
    "ask-peak",  # 10
    "ask-blink",  # 11
]
COLS, ROWS = 4, 3
# Tall enough that the largest companion (240 CSS px) is still sharp on a 2x
# display, and no taller: the atlas is shipped in the app bundle.
CELL_H = 480


def resize_premultiplied(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale without the dark halo a plain RGBA resize leaves.

    Fully transparent pixels still carry a colour, and an ordinary resize blends
    it into the edge — here that colour is what is left of the green screen, so
    the owl would come out rimmed in grey-green. Multiplying colour by alpha
    first, and dividing it back out after, keeps the edge the colour of the
    character.
    """
    a = np.asarray(im, dtype=np.float32)
    alpha = a[..., 3:4] / 255
    prem = np.concatenate([a[..., :3] * alpha, a[..., 3:4]], -1).astype(np.uint8)
    small = np.asarray(
        Image.fromarray(prem, "RGBA").resize(size, Image.LANCZOS), dtype=np.float32
    )
    al = small[..., 3:4] / 255
    rgb = np.divide(small[..., :3], al, out=np.zeros_like(small[..., :3]), where=al > 0)
    out = np.concatenate([rgb.clip(0, 255), small[..., 3:4]], -1)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    src = root / "assets" / "mascot" / "frames"
    dst = root / "src" / "assets" / "mascot" / "owl.webp"

    first = Image.open(src / f"{FRAMES[0]}.webp")
    cell_w = round(first.width * CELL_H / first.height)
    atlas = Image.new("RGBA", (cell_w * COLS, CELL_H * ROWS))

    for i, name in enumerate(FRAMES):
        im = Image.open(src / f"{name}.webp").convert("RGBA")
        if im.size != first.size:
            raise SystemExit(f"{name}: {im.size} — every frame must share one crop, {first.size}")
        cell = resize_premultiplied(im, (cell_w, CELL_H))
        atlas.paste(cell, ((i % COLS) * cell_w, (i // COLS) * CELL_H))

    dst.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(dst, quality=85, method=6)
    print(f"{dst.relative_to(root)}  {atlas.width}x{atlas.height}  {dst.stat().st_size // 1024} KB")
    print(f"cell {cell_w}x{CELL_H}, {COLS}x{ROWS} grid, {len(FRAMES)} frames")
    return 0


if __name__ == "__main__":
    sys.exit(main())
