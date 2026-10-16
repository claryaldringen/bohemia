"""Impostory stromů: každý model vyrenderovaný pod náklonem kamery hry do jednoho atlasu (Cycles).

blender -b --factory-startup --python tools/blender/impostors.py -- \\
    apps/web/public/models/trees impostors.png impostors.json
cwebp -q 85 -alpha_q 100 -exact impostors.png -o apps/web/public/models/trees/impostors.webp

Kamera hry má pevný náklon (BETA v apps/web/lib/scene/camera.ts) a otáčí se jen kolem svislé
osy – obrázek stromu pod tímto náklonem proto sedí z kteréhokoli směru. JSON nese pro každou
buňku atlasu stranu čtverce (m) a polohu paty kmene v buňce (0–1, v odspodu); jeho hodnoty se
přepíší do apps/web/lib/scene/impostor-atlas.ts. Po změně BETA nebo modelů stromů atlas znovu
vyrenderovat.
"""
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
MODELS, OUT_PNG, OUT_JSON = args[0], args[1], args[2]

BETA = 0.85  # úhel kamery od svislice (rad) – musí odpovídat camera.ts
ELEVATION = math.pi / 2 - BETA
CELL = 256
COLUMNS = 4
TREES = ["spruce-1", "spruce-2", "oak-1", "oak-2", "beech-1", "beech-2", "birch-1", "birch-2"]
YAWS = [0.0, math.pi * 0.75]
# Textura jehličí má hodně hnědých větviček – smrky se v atlasu posunou do modrozelena.
SPRUCE_TINT = (1.1, 1.4, 1.25)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

world = bpy.data.worlds.new("w")
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.75, 0.85, 1.0, 1)
bg.inputs["Strength"].default_value = 0.9
scene.world = world
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 2.6
sun.data.angle = math.radians(10)
scene.collection.objects.link(sun)

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

try:
    scene.render.engine = "CYCLES"
except TypeError as e:
    print("engine:", e)
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = CELL
scene.render.resolution_y = CELL
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"


def import_tree(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{MODELS}/{name}.glb")
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if name.startswith("spruce"):
        for mat in meshes[0].data.materials:
            nt = mat.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            link = bsdf.inputs["Base Color"].links[0]
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = (*SPRUCE_TINT, 1)
            nt.links.new(link.from_socket, mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return meshes[0], [o for o in bpy.data.objects if o not in before]


cells = []
tiles = []
for name in TREES:
    obj, created = import_tree(name)
    world_verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    for yaw in YAWS:
        # Kamera se dívá ze směru yaw pod náklonem ELEVATION; right/up jsou osy obrázku.
        back = Vector((math.cos(yaw) * math.cos(ELEVATION), math.sin(yaw) * math.cos(ELEVATION), math.sin(ELEVATION)))
        right = Vector((-math.sin(yaw), math.cos(yaw), 0))
        up = back.cross(right)
        xs = [p.dot(right) for p in world_verts]
        ys = [p.dot(up) for p in world_verts]
        side = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.04
        cx = (max(xs) + min(xs)) / 2
        cy = (max(ys) + min(ys)) / 2
        cam_data.ortho_scale = side
        cam.location = right * cx + up * cy + back * 200
        cam.rotation_euler = (-back).to_track_quat("-Z", "Y").to_euler()
        # Slunce shora z boku kamery – stín v koruně bez výrazného směru (kamera se otáčí).
        sun_dir = (back * 0.6 + Vector((0, 0, 1)) + right * 0.3).normalized()
        sun.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()
        path = f"{OUT_PNG}.{name}.{len(cells)}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles.append(path)
        cells.append(
            {
                "model": name,
                "sideM": round(side, 3),
                # Pata kmene (počátek modelu) v buňce: u zleva, v odspodu.
                "pivotU": round((0 - (cx - side / 2)) / side, 4),
                "pivotV": round((0 - (cy - side / 2)) / side, 4),
            }
        )
    for o in created:
        bpy.data.objects.remove(o, do_unlink=True)

# Atlas: buňky po řádcích odshora; barvy průhledných pixelů rozlité z okolí (bez tmavých lemů
# v mipmapách).
rows = math.ceil(len(cells) / COLUMNS)
atlas = np.zeros((rows * CELL, COLUMNS * CELL, 4), dtype=np.float32)
for k, path in enumerate(tiles):
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(CELL, CELL, 4)  # odspodu
    rgb = px[:, :, :3].copy()
    alpha = px[:, :, 3]
    known = alpha > 0.5
    for _ in range(12):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(alpha.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted_known = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * shifted_known[:, :, None]
            cnt += shifted_known
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    px[:, :, :3] = rgb
    row = k // COLUMNS
    col = k % COLUMNS
    top = (rows - 1 - row) * CELL  # pole pixelů v Blenderu jde odspodu
    atlas[top : top + CELL, col * CELL : (col + 1) * CELL] = px
    bpy.data.images.remove(img)

out = bpy.data.images.new("atlas", COLUMNS * CELL, rows * CELL, alpha=True)
out.pixels = atlas.ravel()
out.filepath_raw = OUT_PNG
out.file_format = "PNG"
out.save()
json.dump({"columns": COLUMNS, "rows": rows, "elevation": ELEVATION, "cells": cells}, open(OUT_JSON, "w"), indent=2)
print("atlas", OUT_PNG, len(cells), "cells")
