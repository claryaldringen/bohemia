"""Obléhací pomůcky (docs/design/fortifications.md – Hradby a obrana): žebříky, otep a hromady
kamene. Vlastní práce, CC0 – jednoduché tvary, každý díl jeden materiál s barvou (bez textur
a UV – víc vertex bufferů by WebGPU nedovolilo).

blender -b --factory-startup --python tools/blender/siege.py -- apps/web/public/models/siege

Souřadnice Blenderu: Z nahoru, rozměry v m; ve scéně je bod Blenderu (x, y) v osách (−x, −y).
Díly (uzly) s počátkem na zemi:
  ladder-5    žebřík 5 m opřený o zeď: ležící podél +Z (stojící), dva sloupky Ø 8 cm 0,5 m od sebe
              (X), příčky po 0,3 m; patky v z = 0
  ladder-7    totéž 7 m
  fagot       otep chrastí 1,2 m dlouhá (podél X), Ø ≈ 0,45 m, ležící na zemi, dvě vazby
  stone-pile-a  hromada kamení ≈ 1 m³ (půdorys ≈ 1,9 m, výška ≈ 0,7 m), střed v počátku
  stone-pile-b  hromada ≈ 3 m³ (půdorys ≈ 2,9 m, výška ≈ 1,05 m)
"""
import math
import os
import sys

import bmesh
import bpy

OUT = sys.argv[sys.argv.index("--") + 1]

COLORS = {
    "siege-wood": (0.52, 0.40, 0.26),
    "siege-brush": (0.46, 0.36, 0.20),
    "siege-stone": (0.50, 0.48, 0.44),
}
MATS = {}


def material(name):
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    r, g, b = (c ** 2.2 for c in COLORS[name])
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    MATS[name] = mat
    return mat


def finish(obj, mat):
    mesh = obj.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.materials.clear()
    mesh.materials.append(material(mat))
    return obj


def mesh_object(name, verts, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, mat)


def cylinder(name, r, depth, loc, rot=(0, 0, 0), verts=7, mat="siege-wood"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, mat)


def join(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def rnd(seed):
    v = math.sin(seed * 12.9898) * 43758.5453
    return v - math.floor(v)


def ladder(name, length):
    parts = []
    for x in (-0.25, 0.25):
        parts.append(cylinder(f"rail-{x}", 0.04, length, (x, 0, length / 2)))
    n = int((length - 0.3) / 0.3)
    for k in range(n):
        parts.append(cylinder(f"rung-{k}", 0.025, 0.54, (0, 0, 0.3 + k * 0.3), rot=(0, math.pi / 2, 0), verts=5))
    return join(name, parts)


def fagot():
    parts = []
    for k in range(14):
        a = 2 * math.pi * k / 14
        r = 0.14 + 0.05 * rnd(k + 1)
        parts.append(
            cylinder(
                f"twig-{k}", 0.05 + 0.02 * rnd(k + 20), 1.2 - 0.1 * rnd(k + 40),
                (0.05 * (rnd(k + 60) - 0.5), r * math.cos(a), 0.26 + r * math.sin(a)),
                rot=(0, math.pi / 2, 0), verts=5, mat="siege-brush",
            )
        )
    for x in (-0.3, 0.3):
        parts.append(cylinder(f"band-{x}", 0.25, 0.05, (x, 0, 0.26), rot=(0, math.pi / 2, 0), verts=8, mat="siege-brush"))
    return join("fagot", parts)


def stone_pile(name, radius, height, count, seed):
    """Hromada: kameny (zkosené kostky) v několika vrstvách, nahoru ubývají."""
    parts = []
    for i in range(count):
        t = rnd(seed + i)
        a = 2 * math.pi * rnd(seed + 100 + i)
        layer = i % 3
        rr = radius * (0.85 - 0.3 * layer) * math.sqrt(rnd(seed + 200 + i))
        size = (0.16 + 0.10 * rnd(seed + 300 + i)) * radius / 0.95
        cz = size * 0.5 + layer * height * 0.32 * (1 - 0.3 * rr / radius)
        cx, cy = rr * math.cos(a), rr * math.sin(a)
        hx, hy, hz = size, size * (0.7 + 0.5 * t), size * 0.7
        verts = []
        for s, (sx, sy, sz) in enumerate((x, y, z) for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)):
            j = 0.25
            verts.append((
                cx + sx * hx * (1 + j * (rnd(seed + i * 8 + s) - 0.5)),
                cy + sy * hy * (1 + j * (rnd(seed + i * 8 + s + 500) - 0.5)),
                max(0.0, cz + sz * hz * (1 + j * (rnd(seed + i * 8 + s + 900) - 0.5))),
            ))
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        parts.append(mesh_object(f"k-{i}", verts, faces, "siege-stone"))
    return join(name, parts)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    objs = [
        ladder("ladder-5", 5.0),
        ladder("ladder-7", 7.0),
        fagot(),
        stone_pile("stone-pile-a", 0.95, 0.7, 26, 11),
        stone_pile("stone-pile-b", 1.45, 1.05, 60, 37),
    ]
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, "siege.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
    )
    print("siege.glb", os.path.getsize(path), "B")


main()
