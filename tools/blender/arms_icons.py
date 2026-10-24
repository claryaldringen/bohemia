"""Ikony dovedností vojvodovy rodiny (docs/design/lord.md – Co hráč vidí): luk, štít s mečem
a podkova (jízda). Nakreslené v Pillow (ne v Blenderu), vlastní dílo – CC0. Výstup 64 × 64 PNG
do `apps/web/public/icons/resources/` (luk.png, boj.png, jizda.png).

Spuštění z kořene repa: python3 tools/blender/arms_icons.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path("apps/web/public/icons/resources")
S = 8  # nadvzorkování
N = 64 * S

WOOD = (150, 98, 48, 255)
WOOD_DARK = (96, 60, 28, 255)
STEEL = (206, 210, 216, 255)
STEEL_DARK = (120, 126, 136, 255)
RED = (156, 44, 40, 255)
GOLD = (214, 174, 70, 255)
LINE = (236, 226, 200, 255)


def canvas():
    return Image.new("RGBA", (N, N), (0, 0, 0, 0))


def finish(img, name):
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    alpha = img.split()[3].point(lambda v: int(v * 0.45))
    shadow.paste((0, 0, 0, 255), (3 * S, 3 * S), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(2 * S))
    out = Image.alpha_composite(shadow, img).resize((64, 64), Image.LANCZOS)
    out.save(OUT / name)


def p(x, y):
    return (x * S, y * S)


def bow():
    img = canvas()
    d = ImageDraw.Draw(img)
    # oblouk luku (výseč kruhu) a tětiva
    box = [p(-14, 6), p(46, 58)]
    d.arc(box, 270, 90, fill=WOOD_DARK, width=7 * S)
    d.arc(box, 270, 90, fill=WOOD, width=4 * S)
    d.line([p(32, 6), p(32, 58)], fill=LINE, width=S)
    # šíp s hrotem a opeřením
    d.line([p(14, 44), p(56, 20)], fill=WOOD_DARK, width=3 * S)
    d.polygon([p(60, 17), p(51, 17), p(55, 25)], fill=STEEL)
    d.polygon([p(10, 47), p(16, 40), p(20, 46)], fill=RED)
    d.polygon([p(15, 50), p(21, 43), p(24, 49)], fill=RED)
    return img


def combat():
    img = canvas()
    d = ImageDraw.Draw(img)
    # meč za štítem
    d.polygon([p(30, 4), p(34, 4), p(35, 40), p(29, 40)], fill=STEEL, outline=STEEL_DARK)
    d.rectangle([p(22, 38), p(42, 42)], fill=GOLD)
    d.rectangle([p(30, 42), p(34, 56)], fill=WOOD_DARK)
    # štít
    shield = [p(12, 16), p(52, 16), p(52, 34), p(32, 60), p(12, 34)]
    d.polygon(shield, fill=WOOD_DARK)
    inner = [p(15, 19), p(49, 19), p(49, 33), p(32, 55), p(15, 33)]
    d.polygon(inner, fill=RED)
    d.line([p(32, 19), p(32, 55)], fill=GOLD, width=2 * S)
    d.line([p(15, 30), p(49, 30)], fill=GOLD, width=2 * S)
    d.ellipse([p(28, 26), p(36, 34)], fill=GOLD)
    return img


def shoe():
    img = canvas()
    d = ImageDraw.Draw(img)
    cx, cy, r = 32, 34, 20
    # podkova – tlustý oblouk otevřený dolů a hřeby
    box = [p(cx - r, cy - r), p(cx + r, cy + r)]
    d.arc(box, 130 - 180 + 180, 410, fill=STEEL_DARK, width=11 * S)
    d.arc(box, 130 - 180 + 180, 410, fill=STEEL, width=8 * S)
    for a in (160, 200, 240, 300, 340, 20):
        x = cx + (r - 0.5) * math.cos(math.radians(a))
        y = cy + (r - 0.5) * math.sin(math.radians(a))
        d.ellipse([p(x - 1.6, y - 1.6), p(x + 1.6, y + 1.6)], fill=STEEL_DARK)
    return img


if __name__ == "__main__":
    finish(bow(), "luk.png")
    finish(combat(), "boj.png")
    finish(shoe(), "jizda.png")
