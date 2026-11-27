"""Ikony dílen zlata (plán 6, issue #13) – rýžovník, šperkař a mincovna.

Dílny zlata mají modely dnešních dílen (plán 6 – Rozhodnutí 11): rýžovník uhlíře, šperkař a mincovna
kováře. Ikona dílny = ikona základní dílny (každá varianta zvlášť – samostatná dílna, u vypleteného
domu a u srubu) a v pravém dolním rohu kulatý odznak se zlatým okrajem: rýžovník – dřevěná pánev
s vodou a zlatými zrnky, šperkař – prsten (`resources/jewellery.png`), mincovna – denár
(`resources/coin.png`) s razidlem.

Z kořene repa (Python 3 s Pillow), až když jsou hotové ikony dílen a `icons.py … gold,jewellery`:

    python3 tools/blender/gold_badges.py apps/web/public/icons

Skládá jen z hotových ikon v zadané složce, takže jde kdykoli spustit znovu se stejným výsledkem.
Licence výstupu: `apps/web/public/icons/LICENSES.md`.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 128  # ikony staveb
SS = 4  # tvary se kreslí ve 4× větším měřítku a zmenší se – hladké hrany
CX, CY, R = 96.0, 96.0, 29.0  # střed a poloměr odznaku (px ikony)
RIM = 3.5  # šířka zlatého okraje
GOLD_HI, GOLD_LO = (240, 207, 120), (107, 71, 20)  # okraj odznaku – světlý vlevo nahoře, tmavý vpravo dole
FIELD_IN, FIELD_OUT = (91, 76, 59), (28, 23, 18)  # pole odznaku – jako pozadí portrétů (backdrop v icons.py)
INK = (13, 10, 7)  # obrysy jako rámeček portrétů

# dílna zlata → základní dílna, jejíž ikonu odznak doplní (varianty: samostatná, u vypleteného domu, u srubu)
WORKSHOPS = {"ryzovnik": "uhlir", "sperkar": "kovar", "mincovna": "kovar"}
VARIANTS = ("", "-vypleteny", "-srub")

# zlatá zrnka na dně pánve: (x, y, poloměr) v px ikony vůči středu odznaku
GRAINS = [(-5.4, 3.4, 2.1), (-1.8, 2.6, 2.4), (2.4, 3.0, 2.2), (5.8, 4.2, 1.9), (-3.6, 6.4, 2.3),
          (0.6, 6.0, 2.6), (4.2, 7.0, 2.0), (-7.4, 5.8, 1.5)]


def px(v):
    return v * SS


def canvas():
    return Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))


def mask(draw):
    """Maska plátna (L) nakreslená funkcí `draw(ImageDraw)` – souřadnice už ve 4× měřítku."""
    m = Image.new("L", (SIZE * SS, SIZE * SS), 0)
    draw(ImageDraw.Draw(m))
    return m


def ellipse(cx, cy, rx, ry):
    """Obdélník elipsy pro ImageDraw (px ikony → plátno)."""
    return [px(cx - rx), px(cy - ry), px(cx + rx), px(cy + ry)]


def paint(layer, m, c0, c1, t, alpha=255):
    """Vyplní masku `m` přechodem c0 → c1; `t(x, y)` dává polohu 0…1 (x, y v px ikony)."""
    box = m.getbbox()
    if not box:
        return
    x0, y0, x1, y1 = box
    data = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            k = min(1.0, max(0.0, t(x / SS, y / SS)))
            data.append(tuple(round(a + (b - a) * k) for a, b in zip(c0, c1)) + (alpha,))
    grad = Image.new("RGBA", (x1 - x0, y1 - y0))
    grad.putdata(data)
    full = canvas()
    full.paste(grad, (x0, y0))
    full.putalpha(ImageChops.multiply(full.getchannel("A"), m))
    layer.alpha_composite(full)


def linear(x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    n = dx * dx + dy * dy
    return lambda x, y: ((x - x0) * dx + (y - y0) * dy) / n


def radial(cx, cy, r):
    return lambda x, y: ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / r


def solid(layer, m, color, alpha=255):
    paint(layer, m, color, color, lambda x, y: 0.0, alpha)


def medallion():
    """Podklad odznaku: stín, zlatý okraj s obrysem a tmavé pole s vinětou."""
    layer = canvas()
    shadow = mask(lambda d: d.ellipse(ellipse(CX + 1.0, CY + 1.6, R, R), fill=170))
    layer.alpha_composite(Image.merge("RGBA", (*[Image.new("L", shadow.size, 0)] * 3, shadow))
                          .filter(ImageFilter.GaussianBlur(px(1.6))))
    solid(layer, mask(lambda d: d.ellipse(ellipse(CX, CY, R, R), fill=255)), INK)
    paint(layer, mask(lambda d: d.ellipse(ellipse(CX, CY, R - 0.8, R - 0.8), fill=255)), GOLD_HI, GOLD_LO,
          linear(CX - R * 0.7, CY - R * 0.7, CX + R * 0.7, CY + R * 0.7))
    solid(layer, mask(lambda d: d.ellipse(ellipse(CX, CY, R - RIM, R - RIM), fill=255)), INK)
    paint(layer, mask(lambda d: d.ellipse(ellipse(CX, CY, R - RIM - 0.6, R - RIM - 0.6), fill=255)),
          FIELD_IN, FIELD_OUT, radial(CX - 5, CY - 6, R * 1.05))
    return layer


def pan(layer):
    """Rýžovník: dřevěná pánev zešikma shora, na dně kalná voda a zlatá zrnka."""
    cx, cy = CX, CY + 1.0
    solid(layer, mask(lambda d: d.ellipse(ellipse(cx, cy + 0.4, 19.6, 12.6), fill=255)), INK)
    paint(layer, mask(lambda d: d.ellipse(ellipse(cx, cy, 19.0, 12.0), fill=255)), (196, 140, 82), (92, 58, 26),
          linear(cx - 14, cy - 10, cx + 12, cy + 11))
    # vnitřek: vzadu osvětlená stěna, vpředu stín pod okrajem
    paint(layer, mask(lambda d: d.ellipse(ellipse(cx, cy - 0.6, 15.4, 9.0), fill=255)), (150, 104, 58), (66, 40, 18),
          linear(cx, cy - 9.6, cx, cy + 8.4))
    paint(layer, mask(lambda d: d.ellipse(ellipse(cx + 0.2, cy + 2.6, 12.0, 6.2), fill=255)), (176, 200, 206),
          (84, 112, 122), radial(cx - 2, cy + 1.2, 12.5), alpha=240)
    for gx, gy, r in GRAINS:
        x, y = cx + gx, cy + gy - 2.0
        solid(layer, mask(lambda d: d.ellipse(ellipse(x + 0.25, y + 0.35, r, r * 0.8), fill=255)), (90, 56, 6))
        paint(layer, mask(lambda d: d.ellipse(ellipse(x, y, r * 0.92, r * 0.74), fill=255)), (255, 236, 140),
              (214, 150, 20), radial(x - r * 0.5, y - r * 0.4, r * 1.5))


def die(layer):
    """Mincovna: horní razidlo – železný kolík s roztepanou hlavou, šikmo dosedá na denár."""
    top, tip = (CX + 10.5, CY - 19.5), (CX + 2.5, CY - 4.0)
    ax, ay = tip[0] - top[0], tip[1] - top[1]
    n = (ax * ax + ay * ay) ** 0.5
    ux, uy = ax / n, ay / n  # podél razidla
    vx, vy = -uy, ux  # napříč
    # obrys: (poloha podél 0…1, poloviční šířka) – hlava roztepaná údery kladiva, dřík, zúžený konec
    prof = [(0.0, 3.0), (0.04, 4.6), (0.16, 4.6), (0.22, 3.3), (0.86, 3.3), (1.0, 2.4)]

    def outline(grow):
        side = [(top[0] + ux * n * t + vx * (w + grow), top[1] + uy * n * t + vy * (w + grow)) for t, w in prof]
        other = [(top[0] + ux * n * t - vx * (w + grow), top[1] + uy * n * t - vy * (w + grow))
                 for t, w in reversed(prof)]
        return [(px(x), px(y)) for x, y in side + other]

    solid(layer, mask(lambda d: d.polygon(outline(0.8), fill=255)), INK)
    paint(layer, mask(lambda d: d.polygon(outline(0.0), fill=255)), (214, 218, 226), (58, 60, 66),
          linear(top[0] + vx * 3.3, top[1] + vy * 3.3, top[0] - vx * 3.3, top[1] - vy * 3.3))
    paint(layer, mask(lambda d: d.line([(px(top[0] + ux * n * 0.05 + vx * 2.6), px(top[1] + uy * n * 0.05 + vy * 2.6)),
                                         (px(tip[0] + vx * 1.6), px(tip[1] + vy * 1.6))], fill=255, width=round(px(1.0)))),
          (250, 252, 255), (250, 252, 255), lambda x, y: 0.0, alpha=170)


def symbol(base, path, box, centre):
    """Vloží hotovou ikonu suroviny oříznutou na obsah, vepsanou do čtverce `box` px se středem `centre`."""
    im = Image.open(path).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    k = box / max(im.width, im.height)
    w, h = round(im.width * k), round(im.height * k)
    im = im.resize((w, h), Image.LANCZOS)
    base.alpha_composite(im, (round(centre[0] - w / 2), round(centre[1] - h / 2)))


def shrink(layer):
    return layer.resize((SIZE, SIZE), Image.LANCZOS)


def badge(kind, icons):
    """Odznak dílny jako vrstva 128 × 128 (průhledná mimo odznak)."""
    out = shrink(medallion())
    if kind == "ryzovnik":
        layer = canvas()
        pan(layer)
        out.alpha_composite(shrink(layer))
    elif kind == "sperkar":
        symbol(out, icons / "resources/jewellery.png", 40, (CX, CY + 0.5))
    else:
        symbol(out, icons / "resources/coin.png", 36, (CX - 2.5, CY + 3.5))
        layer = canvas()
        die(layer)
        out.alpha_composite(shrink(layer))
    return out


def main():
    icons = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/icons")
    for kind, source in WORKSHOPS.items():
        mark = badge(kind, icons)
        for variant in VARIANTS:
            icon = Image.open(icons / f"build/{source}{variant}.png").convert("RGBA")
            assert icon.size == (SIZE, SIZE), f"{source}{variant}.png není {SIZE} × {SIZE}"
            icon.alpha_composite(mark)
            icon.save(icons / f"build/{kind}{variant}.png", optimize=True)
            print("hotovo", f"{kind}{variant}")


if __name__ == "__main__":
    main()
