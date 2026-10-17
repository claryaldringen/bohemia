"""Textura kvetoucí louky: tráva z 0 A.D. s trsy květů z jejich obtisku sedmikrásek.

blender -b --factory-startup --python tools/blender/flower_meadow_texture.py -- \
    <0ad>/.../terrain/types/temperate/grass_01.png <0ad>/.../skins/gaia/flowers_daisies.dds out.png
magick out.png -quality 94 apps/web/public/textures/terrain/grass-flowers.jpg

Tráva je stejná jako u vrstvy `grass` (stejné opakování), takže přechod do kvetoucí louky je jen
v květech. Obtisk sedmikrásek se zmenší (květ ≈ 4 px ≈ 0,25 m při opakování 65 m), přebarví
na pryskyřník, zvonek a hvozdík a skládá se do trsů přes okraj (textura se plynule opakuje).
"""
import random
import sys

import bpy
import numpy as np

SIZE = 1024
DECAL_PX = 96
CLUSTERS = 45
# Barva okvětí (násobí bílé sedmikrásky) a četnost: sedmikráska, pryskyřník, zvonek, hvozdík.
COLORS = [
    ((0.92, 0.92, 0.9), 0.35),
    ((1.0, 0.8, 0.1), 0.35),
    ((0.6, 0.48, 0.92), 0.2),
    ((0.92, 0.4, 0.52), 0.1),
]

args = sys.argv[sys.argv.index("--") + 1 :]
GRASS, DAISIES, OUT = args[0], args[1], args[2]
bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path, size):
    image = bpy.data.images.load(path)
    if tuple(image.size) != (size, size):
        image.scale(size, size)
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(size, size, 4)
    return pixels


grass = load(GRASS, SIZE)
decal = load(DAISIES, DECAL_PX)
rng = random.Random(7)
out = grass.copy()


def stamp(px, py, rgba):
    h, w = rgba.shape[:2]
    ys = (np.arange(h) + py) % SIZE
    xs = (np.arange(w) + px) % SIZE
    region = out[np.ix_(ys, xs)]
    alpha = rgba[:, :, 3:4]
    region[:, :, :3] = region[:, :, :3] * (1 - alpha) + rgba[:, :, :3] * alpha
    out[np.ix_(ys, xs)] = region


for _ in range(CLUSTERS):
    color = rng.choices([c for c, _ in COLORS], weights=[w for _, w in COLORS])[0]
    tinted = decal.copy()
    tinted[:, :, :3] *= np.array(color, dtype=np.float32)
    cx, cy = rng.randrange(SIZE), rng.randrange(SIZE)
    for _ in range(rng.randint(1, 3)):
        piece = np.rot90(tinted, rng.randrange(4))
        if rng.random() < 0.5:
            piece = piece[:, ::-1]
        stamp(cx + rng.randint(-40, 40), cy + rng.randint(-40, 40), piece)

result = bpy.data.images.new("flowers", SIZE, SIZE, alpha=False)
out[:, :, 3] = 1
result.pixels = out.ravel()
result.file_format = "PNG"
result.save(filepath=OUT)
print("saved", OUT)
