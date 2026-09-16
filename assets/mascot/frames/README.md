# Mascot frames

The twelve drawings the companion is built from, each already cut to **one
shared box** (`x[143,829] y[59,904]` of the 1024² originals). That shared cut is
the whole trick: the owl's body lands on the same pixels in every frame, so a
state change moves its face and nothing else. Two of them — the ones where the
head leans — reach further left and higher than the rest, which is why the box is
the union of all twelve rather than the tidy outline of the first.

`scripts/mascot-atlas.py` tiles these into `src/assets/mascot/owl.webp`. Cell
order is a contract: `frames.ts` addresses cells by number, so a frame may be
redrawn but never reordered.

Drawn with Gemini one frame at a time, each generated from the same reference
image with a prompt that changed exactly one thing and said, in as many words,
that everything else had to stay identical. Asking for a nine-cell grid of poses
instead fails: an image model reads a grid as "give me variations", and the
silhouette wanders between cells.
