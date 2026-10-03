"""Draws the Wind mark and writes every icon and splash asset.

Run from the repo root:  python scripts/make_icon.py   (needs Pillow)

The mark: three lime wind trails pulling a terracotta location pin, on a forest tile.
Geometry lives in a 0..100 box and is mirrored by <Logo /> in src/ui.tsx; change both together.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "assets"
SIZE = 1024
SCALE = 4  # draw large, then downsample: smooth edges on the pin
PAPER = "#F3F2EC"
FOREST = "#12342A"
LIME = "#D3F27A"
CLAY = "#CB6845"
WHITE = "#FFFFFF"

# x1, x2, y, thickness (0..100 box)
BARS = [(26, 48, 38, 7), (14, 48, 51, 8), (32, 48, 64, 7)]
# pin head centre x, centre y, head radius, hole radius; the tip points straight down
PIN = (70, 45, 16, 6.5)
TILE_RADIUS = 0.29  # of the tile width


def mark(size: int, *, tile: bool = True, monochrome: bool = False, background=None, inset: float = 0.0) -> Image.Image:
    big = size * SCALE
    image = Image.new("RGBA", (big, big), background or (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pad = big * inset
    box = big - 2 * pad
    if tile:
        draw.rounded_rectangle((pad, pad, pad + box, pad + box), radius=box * TILE_RADIUS, fill=FOREST)

    def at(v: float) -> float:
        return pad + v * box / 100

    for x1, x2, y, thickness in BARS:
        half = thickness * box / 200
        draw.rounded_rectangle((at(x1), at(y) - half, at(x2), at(y) + half), radius=half, fill=WHITE if monochrome else LIME)

    # Teardrop = circle + the square corner below it (the square's sides are tangent to the circle).
    cx, cy, r, hole = PIN
    k = 0.70710678
    pin = WHITE if monochrome else CLAY
    draw.ellipse((at(cx - r), at(cy - r), at(cx + r), at(cy + r)), fill=pin)
    draw.polygon([(at(cx - r * k), at(cy + r * k)), (at(cx + r * k), at(cy + r * k)), (at(cx), at(cy + r * 1.41421356))], fill=pin)
    hole_fill = (0, 0, 0, 0) if not tile else FOREST
    draw.ellipse((at(cx - hole), at(cy - hole), at(cx + hole), at(cy + hole)), fill=hole_fill)
    return image.resize((size, size), Image.LANCZOS)


# App icon (iOS, web manifest): tile on paper, like the splash.
mark(SIZE, background=PAPER, inset=0.1).convert("RGB").save(ROOT / "icon.png")
# Android adaptive icon: forest background layer, trails and pin inside the 66% safe zone on the foreground layer.
Image.new("RGB", (SIZE, SIZE), FOREST).save(ROOT / "android-icon-background.png")
mark(SIZE, tile=False, inset=0.15).save(ROOT / "android-icon-foreground.png")
mark(SIZE, tile=False, monochrome=True, inset=0.15).save(ROOT / "android-icon-monochrome.png")
# Native splash: the tile alone; the animated intro (src/intro.tsx) picks up from this exact frame.
mark(512).save(ROOT / "splash-icon.png")
mark(64, background=PAPER, inset=0.04).convert("RGB").save(ROOT / "favicon.png")
