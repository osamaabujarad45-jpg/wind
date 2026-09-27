from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "assets"
SIZE = 1024
PAPER = "#F8F7F0"
OLIVE = "#34765A"
CLAY = "#CB6845"


def mark(background: bool, monochrome: bool = False) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), PAPER if background else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if not monochrome:
        draw.rounded_rectangle((100, 100, 924, 924), radius=240, fill=OLIVE)
    color = "#FFFFFF"
    path = [(285, 705), (450, 550), (570, 550), (745, 355)]
    draw.line(path, fill=color, width=74, joint="curve")
    for x, y in path:
        draw.ellipse((x - 37, y - 37, x + 37, y + 37), fill=color)
    draw.ellipse((240, 660, 330, 750), fill=color)
    draw.ellipse((700, 310, 790, 400), fill=CLAY if not monochrome else color)
    return image


mark(True).convert("RGB").save(ROOT / "icon.png")
mark(False).save(ROOT / "android-icon-foreground.png")
Image.new("RGB", (SIZE, SIZE), PAPER).save(ROOT / "android-icon-background.png")
mark(False, True).save(ROOT / "android-icon-monochrome.png")
mark(False).resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / "splash-icon.png")
mark(True).resize((64, 64), Image.Resampling.LANCZOS).save(ROOT / "favicon.png")
