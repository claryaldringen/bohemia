"""Listí jabloně bez plodů: z textury koruny 0 A.D. (`tree_apple_a.dds`) se vymažou červená jablka.

blender -b --factory-startup --python tools/blender/apple_leaves.py -- \
    <0ad>/binaries/data/mods/public/art/textures/skins/gaia/tree_apple_a.dds \
    <0ad>/binaries/data/mods/public/art/textures/skins/gaia/tree_apple_a_leaves.png

Výstup se ukládá vedle originálu do art/ složky 0 A.D., protože `tools/blender/orchard.json`
(převod `trees_from_0ad.py`) bere textury relativně k ní – nejdřív tento skript, pak převod.

Jablko = sytě červené jádro (červená převládá, zelená i modrá nízko) a jeho lem – načervenalé
pixely (vč. tmavě rudohnědého stínu) do 2 px od jádra; hnědé větve dál od jablek zůstanou.
Pixely jablek se vyplní zvenku dovnitř průměrem okolního zeleného listí (difuze, hnědé větve se
do výplně nepočítají) a mírně ztmaví jako listí uvnitř koruny; průhlednost (alfa) zůstává beze
změny. Čtverec jablečné slupky v pravém dolním rohu atlasu (velká souvislá červená plocha, koruny
ho nepoužívají) dostane průměrnou barvu listí. Výstup je deterministický (stejný vstup = stejné
PNG).
"""
import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = args[0], args[1]
# Ztmavení vyplněných míst (stín uvnitř koruny), šířka lemu kolem červeného jádra v pixelech
# a velikost souvislé červené plochy, od které jde o čtverec slupky (jablko má pár desítek px).
SHADE = 0.88
RIM_PX = 2
PATCH_PX = 200

bpy.ops.wm.read_factory_settings(use_empty=True)
image = bpy.data.images.load(SRC)
w, h = image.size
px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
r, g, b, a = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
opaque = a > 0.5


def grow(mask):
    """Rozšíření masky o jeden pixel (8 sousedů)."""
    out = mask.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


core = opaque & (r > 0.3) & (g < 0.3 * r) & (b < 0.35 * r)
# Čtverec slupky v rohu atlasu = velká souvislá oblast jádra (jablko má nejvýš pár desítek px).
patch = np.zeros_like(core)
seen = np.zeros_like(core)
for sy, sx in zip(*np.nonzero(core)):
    if seen[sy, sx]:
        continue
    stack, comp = [(sy, sx)], []
    seen[sy, sx] = True
    while stack:
        y, x = stack.pop()
        comp.append((y, x))
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and core[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    if len(comp) > PATCH_PX:
        ys, xs = zip(*comp)
        patch[min(ys) : max(ys) + 1, min(xs) : max(xs) + 1] = True
patch &= opaque
core &= ~patch
# Lem jablka: načervenalé pixely (vč. tmavě rudohnědého stínu) do RIM_PX od jádra.
reddish = opaque & (g < 0.6 * r) & (r > 0.08)
apple = core.copy()
for _ in range(RIM_PX):
    apple |= grow(apple) & reddish

# Zdrojem výplně je jen zelené listí (ne hnědé větve), vyplněné pixely se k němu přidávají.
known = opaque & ~apple & ~patch & (g >= r)
out = px.copy()
todo = apple.copy()
while todo.any():
    acc = np.zeros((h, w, 3), dtype=np.float32)
    cnt = np.zeros((h, w), dtype=np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            k = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(out[..., :3], dy, 0), dx, 1) * k[..., None]
            cnt += k
    ready = todo & (cnt > 0)
    if not ready.any():
        break
    out[ready, :3] = acc[ready] / cnt[ready, None]
    known |= ready
    todo &= ~ready
out[apple, :3] *= SHADE
leaf_mean = px[opaque & ~apple & ~patch & (g >= r), :3].mean(axis=0)
out[todo | patch, :3] = leaf_mean
out[..., 3] = a

result = bpy.data.images.new("apple-leaves", w, h, alpha=True)
result.pixels = out.ravel()
result.file_format = "PNG"
result.save(filepath=OUT)
print(f"saved {OUT}: {int(apple.sum())} px jablek vyplněno, slupka v rohu {int(patch.sum())} px")
