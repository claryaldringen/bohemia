"""Zralá koruna jabloně: do listí bez plodů se namaluje víc a větších jablek, aby byla vidět z dálky.

blender -b --factory-startup --python tools/blender/apple_ripe.py -- \
    <0ad>/binaries/data/mods/public/art/textures/skins/gaia/tree_apple_a_leaves.png \
    <0ad>/binaries/data/mods/public/art/textures/skins/gaia/tree_apple_a_ripe.png

Vstup je výstup `tools/blender/apple_leaves.py` (listí bez původních jablek, ta mají jen ≈ 3 px
ze 128 a z kamery 30–120 m nejsou vidět). Výstup se ukládá vedle něj do art/ složky 0 A.D. –
`tools/blender/orchard.json` ho bere pro `apple-fruit-*`. Pořadí: apple_leaves.py, tento skript,
převod `trees_from_0ad.py`.

Jablka jsou kulaté skvrny o průměru 5–7 px (sytě červené až červenožluté, tmavší okraj, světlý
odlesk vlevo nahoře), zhruba 2,5× víc než v originálu. Rozmisťují se deterministicky (pevný seed)
jen na listí – střed i nejméně 80 % kotouče musí ležet na pixelech s alfou > 0,5 a mimo
jednobarevný čtverec v rohu atlasu – a nepřekrývají se. Okraj je vyhlazený (4 × 4 vzorky na
pixel); kde kotouč pokrývá aspoň půl pixelu, je pixel neprůhledný, jinak alfa zůstává.
"""
import math
import random
import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = args[0], args[1]
SEED = 11
COUNT = 44  # originál má 17 jablek
RADIUS_PX = (2.5, 3.5)
MIN_COVER = 0.8
# Barva slupky: sytě červená a červenožlutá (podíl červenožlutých jablek).
RED = np.array((0.74, 0.05, 0.03), dtype=np.float32)
YELLOW_RED = np.array((0.8, 0.22, 0.05), dtype=np.float32)
YELLOW_SHARE = 0.3
SS = 4

bpy.ops.wm.read_factory_settings(use_empty=True)
image = bpy.data.images.load(SRC)
w, h = image.size
px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
alpha = px[..., 3]

# Jednobarevné plochy (čtverec v rohu po apple_leaves.py) – listí má vždy kresbu.
lum = px[..., :3].mean(axis=2)
mean = np.zeros_like(lum)
sq = np.zeros_like(lum)
for dy in range(-2, 3):
    for dx in range(-2, 3):
        shifted = np.roll(np.roll(lum, dy, 0), dx, 1)
        mean += shifted
        sq += shifted * shifted
mean /= 25
flat = sq / 25 - mean * mean < 1e-5
leaf = (alpha > 0.5) & ~flat

rng = random.Random(SEED)
margin = 5
ys, xs = np.nonzero(leaf[margin : h - margin, margin : w - margin])
candidates = list(zip((ys + margin).tolist(), (xs + margin).tolist()))
gy, gx = np.mgrid[0:h, 0:w]
apples = []
for _ in range(20000):
    if len(apples) >= COUNT:
        break
    cy, cx = rng.choice(candidates)
    cy, cx = cy + rng.uniform(-0.5, 0.5), cx + rng.uniform(-0.5, 0.5)
    r = rng.uniform(*RADIUS_PX)
    if any(math.hypot(cy - ay, cx - ax) < r + ar + 1.2 for ay, ax, ar, _ in apples):
        continue
    disc = (gy + 0.5 - cy) ** 2 + (gx + 0.5 - cx) ** 2 <= r * r
    if leaf[disc].mean() < MIN_COVER:
        continue
    apples.append((cy, cx, r, rng.random()))

out = px.copy()
sub = (np.arange(SS) + 0.5) / SS
for cy, cx, r, tone in apples:
    color = YELLOW_RED if tone < YELLOW_SHARE else RED
    color = color * rng.uniform(0.9, 1.05)
    y0, y1 = int(cy - r) - 1, int(cy + r) + 2
    x0, x1 = int(cx - r) - 1, int(cx + r) + 2
    for y in range(y0, y1):
        for x in range(x0, x1):
            acc = np.zeros(3, dtype=np.float32)
            cover = 0
            for sy in sub:
                for sx in sub:
                    # u doprava, v nahoru (řádky Blenderu jdou zdola) – odlesk vlevo nahoře
                    u, v = (x + sx - cx) / r, (y + sy - cy) / r
                    d2 = u * u + v * v
                    if d2 > 1:
                        continue
                    cover += 1
                    c = color * (1 - 0.45 * d2)
                    if d2 > (1 - 0.9 / r) ** 2:  # tmavší okraj ≈ 1 px
                        c = c * 0.55
                    hl = math.exp(-((u + 0.35) ** 2 + (v - 0.35) ** 2) / 0.09)
                    c = c * (1 - 0.7 * hl) + np.array((1.0, 0.86, 0.78), dtype=np.float32) * 0.7 * hl
                    acc += c
            if cover == 0:
                continue
            k = cover / (SS * SS)
            out[y, x, :3] = out[y, x, :3] * (1 - k) + acc / cover * k
            if k >= 0.5:
                out[y, x, 3] = 1.0

result = bpy.data.images.new("apple-ripe", w, h, alpha=True)
result.pixels = np.clip(out, 0, 1).ravel()
result.file_format = "PNG"
result.save(filepath=OUT)
print(f"saved {OUT}: {len(apples)} jablek")
