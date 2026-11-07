"""Cvičiště vojvodovy rodiny (docs/design/lord.md – Terče a cvičiště na dvorku): slaměný terč na
trojnožce, proutěný plůtek, cvičný kůl, stojan s dřevěnými meči a proutěnými štíty, kůl na koně.
Vlastní práce, CC0 – jednoduché tvary, barvy z malé palety (8 × 1 px), jeden materiál.

blender -b --factory-startup --python tools/blender/training_ground.py -- \
    apps/web/public/models/training

Souřadnice Blenderu: Z nahoru, vpřed = −Y (v glTF +Z, ve scéně díl míří na +Z), rozměry v m.
Díly (uzly) s počátkem na zemi – scéna je rozmístí podle apps/web/lib/scene/training-ground-layout.ts:
  target    kotouč ze svázané slámy ≈ 1 m s okrovým kruhem, na dřevěné trojnožce, čelem vpřed
  backstop  proutěný plůtek 4 m za terči (na zachycení šípů), podél osy X
  post      cvičný kůl ≈ 1,8 m se zářezy od úderů (Vegetius)
  rack      stojan s dřevěnými meči a proutěnými štíty, čelem vpřed
  hitch     kůl na uvázání koní s provazem
"""
import math
import os
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1]

# paleta: (R, G, B) 0–1 – index = sloupec obrázku
PALETTE = [
    (0.78, 0.66, 0.38),  # 0 sláma
    (0.72, 0.42, 0.12),  # 1 okr
    (0.42, 0.30, 0.18),  # 2 dřevo
    (0.28, 0.20, 0.13),  # 3 tmavé dřevo (kůl)
    (0.55, 0.45, 0.28),  # 4 proutí
    (0.60, 0.50, 0.34),  # 5 ohlazené dřevo (meče)
    (0.50, 0.40, 0.25),  # 6 provaz
    (0.36, 0.26, 0.16),  # 7 zářezy
]


def palette_material():
    img = bpy.data.images.new("training-palette", width=len(PALETTE), height=1)
    px = []
    for r, g, b in PALETTE:
        px += [r, g, b, 1.0]
    img.pixels = px
    img.file_format = "PNG"
    img.pack()
    mat = bpy.data.materials.new("training")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


MAT = None


def colored(obj, index):
    """Všechny UV objektu do středu pixelu palety `index`, materiál palety."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    u = (index + 0.5) / len(PALETTE)
    for loop in mesh.uv_layers.active.data:
        loop.uv = (u, 0.5)
    mesh.materials.clear()
    mesh.materials.append(MAT)
    return obj


def cylinder(index, r, depth, loc, rot=(0, 0, 0), verts=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    return colored(bpy.context.object, index)


def box(index, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    return colored(o, index)


def torus(index, major, minor, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, major_segments=20, minor_segments=6,
        location=loc, rotation=rot,
    )
    return colored(bpy.context.object, index)


def leg(index, a, b, r):
    """Kulatina od bodu a do bodu b."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cylinder(index, r, length, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), verts=6)
    o.rotation_mode = "QUATERNION"
    from mathutils import Vector
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)))
    return o


def join(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.name = name
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return o


def target():
    tilt = math.radians(12)  # kotouč nakloněný dozadu, opřený o trojnožku
    centre = (0, 0, 1.05)
    disc = cylinder(0, 0.52, 0.26, centre, rot=(math.pi / 2 - tilt, 0, 0), verts=16)
    # okrový kruh a střed na přední straně (vpřed = −Y)
    fy = -0.135 * math.cos(tilt)
    fz = 1.05 + 0.135 * math.sin(tilt)
    ring = torus(1, 0.3, 0.035, (0, fy, fz), rot=(math.pi / 2 - tilt, 0, 0))
    dot = cylinder(1, 0.09, 0.02, (0, fy, fz), rot=(math.pi / 2 - tilt, 0, 0), verts=10)
    top = (0, 0.12, 1.35)
    legs = [
        leg(2, top, (-0.5, -0.15, 0), 0.03),
        leg(2, top, (0.5, -0.15, 0), 0.03),
        leg(2, top, (0, 0.75, 0), 0.03),
    ]
    return join("target", [disc, ring, dot, *legs])


def backstop():
    parts = [box(4, (4.0, 0.08, 1.5), (0, 0, 0.85))]
    for x in (-2.0, -1.0, 0.0, 1.0, 2.0):
        parts.append(cylinder(2, 0.05, 1.75, (x, 0, 0.875), verts=6))
    return join("backstop", parts)


def post():
    parts = [cylinder(3, 0.1, 1.8, (0, 0, 0.9), verts=10)]
    # zářezy od úderů – tmavší prstence ve výšce ramen a pasu
    for z in (0.95, 1.2, 1.45):
        parts.append(cylinder(7, 0.104, 0.05, (0, 0, z), verts=10))
    return join("post", parts)


def rack():
    parts = [
        cylinder(2, 0.04, 1.25, (-0.7, 0, 0.625), verts=6),
        cylinder(2, 0.04, 1.25, (0.7, 0, 0.625), verts=6),
        box(2, (1.5, 0.06, 0.06), (0, 0, 1.15)),
        box(2, (1.5, 0.06, 0.06), (0, 0, 0.35)),
    ]
    # dřevěné meče opřené o horní břevno (vpřed = −Y)
    for x in (-0.45, -0.2, 0.05):
        parts.append(box(5, (0.05, 0.025, 0.95), (x, -0.12, 0.55), rot=(math.radians(-8), 0, 0)))
        parts.append(box(2, (0.16, 0.03, 0.03), (x, -0.08, 0.86), rot=(math.radians(-8), 0, 0)))
    # proutěné štíty opřené o spodní břevno
    for x in (0.35, 0.55):
        parts.append(
            cylinder(4, 0.3, 0.04, (x, -0.18, 0.32), rot=(math.pi / 2 - math.radians(15), 0, 0), verts=14)
        )
    return join("rack", parts)


def hitch():
    parts = [
        cylinder(3, 0.08, 1.3, (0, 0, 0.65), verts=8),
        torus(6, 0.1, 0.02, (0, 0, 1.0)),
    ]
    return join("hitch", parts)


def main():
    global MAT
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.cursor.location = (0, 0, 0)
    MAT = palette_material()
    objs = [target(), backstop(), post(), rack(), hitch()]
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, "training.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_animations=False,
    )
    print("training.glb", os.path.getsize(path), "B")


main()
