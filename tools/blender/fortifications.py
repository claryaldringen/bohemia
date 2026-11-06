"""Opevnění vsi (docs/design/fortifications.md – Ve scéně): kůl palisády ve třech variantách,
vysoký kůl brány, trám nad bránou, křídlo brány z prken, křídlo proutěné brány polského plotu
a závora v průchodu valem. Vlastní práce, CC0 – jednoduché tvary, každý díl jeden materiál
s barvou (bez textur a UV – ve scéně jdou kůly v instancích s barvou instance a víc vertex
bufferů by WebGPU nedovolilo).

blender -b --factory-startup --python tools/blender/fortifications.py -- \
    apps/web/public/models/fortifications

Souřadnice Blenderu: Z nahoru, rozměry v m; ve scéně je bod Blenderu (x, y) v osách (−x, −y).
Díly (uzly) s počátkem na zemi – scéna je rozmístí podle apps/web/lib/scene/fortification-layout.ts:
  stake-a     kůl Ø 25 cm, 3,5 m nad zemí (0,4 m v zemi), osmiboký, zašpičatělý
  stake-b     kůl Ø 22 cm, trochu křivý hrot (seknutý ze dvou stran)
  stake-c     kůl Ø 28 cm, čtyřboký hrot
  gate-post   kůl brány Ø 32 cm, 4,2 m nad zemí, rovně uříznutý (nese trám)
  gate-beam   trám nad bránou 5 m podél osy X, počátek uprostřed jeho spodní hrany
  gate-planks křídlo brány z prken 2 × 3,2 m – závěs v počátku, křídlo do −X Blenderu
              (ve scéně +x), dvě příčky a vzpěra na vnitřní straně (+Y Blenderu, ve scéně −z)
  gate-wicker křídlo proutěné brány plotu 2 × 1,3 m – závěs v počátku, křídlo do −X Blenderu
  gate-bar    závora v průchodu valem: dva kůly s vidlicí 4,6 m od sebe a žerď přes ně (1 m)
"""
import math
import os
import sys

import bmesh
import bpy

OUT = sys.argv[sys.argv.index("--") + 1]

COLORS = {
    "fort-wood": (0.45, 0.33, 0.21),
    "fort-planks": (0.50, 0.38, 0.24),
    "fort-wicker": (0.55, 0.45, 0.28),
}
MATS = {}


def material(name):
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    # barvy palety jsou v sRGB (jako textury ostatních modelů) – Blender i glTF chtějí lineární
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


def stake(name, radius, sides, tip, bend=0.0, rot=0.0):
    """Kůl od −0,4 m do 3,5 m: plášť po stranách, hrot `tip` m (vrchol posunutý o `bend`)."""
    top = 3.5 - tip
    verts = []
    for z in (-0.4, top):
        for k in range(sides):
            a = rot + 2 * math.pi * k / sides
            verts.append((radius * math.cos(a), radius * math.sin(a), z))
    verts.append((bend, bend * 0.4, 3.5))
    apex = len(verts) - 1
    faces = []
    for k in range(sides):
        n = (k + 1) % sides
        faces.append((k, n, sides + n, sides + k))
        faces.append((sides + k, sides + n, apex))
    faces.append(tuple(reversed(range(sides))))
    return mesh_object(name, verts, faces, "fort-wood")


def box(name, size, loc, rot=(0, 0, 0), mat="fort-planks"):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.name = name
    return finish(o, mat)


def cylinder(name, r, depth, loc, rot=(0, 0, 0), verts=8, mat="fort-wood"):
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


def gate_post():
    return cylinder("gate-post", 0.16, 4.6, (0, 0, 1.9), verts=9)


def gate_beam():
    return box("gate-beam", (5.0, 0.3, 0.3), (0, 0, 0.15), mat="fort-wood")


def gate_planks():
    parts = []
    width = 2.0
    n = 8
    w = width / n
    for k in range(n):
        h = 3.2 - 0.06 * ((k * 37) % 5)
        parts.append(box(f"plank-{k}", (w - 0.02, 0.08, h), (-(k + 0.5) * w, 0, 0.1 + h / 2)))
    for z in (0.7, 2.6):
        parts.append(box(f"batten-{z}", (width - 0.1, 0.06, 0.18), (-width / 2, 0.07, z)))
    brace = math.atan2(1.9, width - 0.3)
    parts.append(
        box("brace", (math.hypot(1.9, width - 0.3), 0.06, 0.16), (-width / 2, 0.07, 1.65), rot=(0, brace, 0))
    )
    return join("gate-planks", parts)


def gate_wicker():
    parts = []
    width = 1.95
    for x in (-0.05, -width + 0.05):
        parts.append(cylinder(f"pole-{x}", 0.04, 1.4, (x, 0, 0.75), mat="fort-wicker"))
    for k in range(7):
        z = 0.2 + k * 0.17
        parts.append(
            cylinder(f"rod-{k}", 0.025, width, (-width / 2, 0.02 * (1 if k % 2 else -1), z), rot=(0, math.pi / 2, 0), verts=5, mat="fort-wicker")
        )
    return join("gate-wicker", parts)


def gate_bar():
    parts = []
    for x in (-2.3, 2.3):
        parts.append(cylinder(f"fork-{x}", 0.09, 1.4, (x, 0, 0.5), verts=7))
        for s in (-1, 1):
            parts.append(cylinder(f"tine-{x}-{s}", 0.04, 0.35, (x + 0.06 * s, 0, 1.3), rot=(0, 0.35 * s, 0), verts=5))
    parts.append(cylinder("bar", 0.07, 5.0, (0, 0, 1.12), rot=(0, math.pi / 2, 0), verts=7))
    return join("gate-bar", parts)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    objs = [
        stake("stake-a", 0.125, 8, 0.45),
        stake("stake-b", 0.11, 7, 0.4, bend=0.04, rot=0.3),
        stake("stake-c", 0.14, 8, 0.5, rot=0.2),
        gate_post(),
        gate_beam(),
        gate_planks(),
        gate_wicker(),
        gate_bar(),
    ]
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, "fortifications.glb")
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
    print("fortifications.glb", os.path.getsize(path), "B")


main()
