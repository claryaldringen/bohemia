"""Modely zboží a pomůcek: včelí klát (brť) a rám s napnutou kůží – vlastní tvorba, CC0.

blender -b --factory-startup --python tools/blender/wares.py -- apps/web/public/models/wares

Výstup (apps/web/public/models/wares):
  hive.glb       vydlabaný kmen ⌀ ≈ 0,45 m, výška ≈ 1,1 m, prkenná stříška, česno (úzká štěrbina) vpředu
  hive-bees.glb  týž klát s tečkami včel u česna
  hide-frame.glb rám z tyčí ≈ 1,4 × 1,2 m s napnutou kůží, stažená provázky

Souřadnice: Z nahoru, počátek = střed paty na zemi, česno v −Y (v glTF do +Z). Jedna mesh, barvy
materiálů bez textur (do 60 kB).
"""

import math
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

OUT = sys.argv[sys.argv.index("--") + 1]


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def material(name, color, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def cyl(bm, p0, p1, r0, r1=None, seg=10):
    """Komolý kužel mezi dvěma body."""
    r1 = r0 if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    q = (p1 - p0).to_track_quat("Z", "Y")
    top, bot = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        v = Vector((math.cos(a), math.sin(a), 0))
        bot.append(bm.verts.new(p0 + q @ (v * r0)))
        top.append(bm.verts.new(p1 + q @ (v * r1)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    if r1 > 0:
        bm.faces.new(top)
    if r0 > 0:
        bm.faces.new(bot[::-1])


def box(bm, centre, size, rot=(0.0, 0.0, 0.0)):
    r = bmesh.ops.create_cube(bm, size=1.0)
    m = Euler(rot).to_matrix()
    for v in r["verts"]:
        v.co = Vector(centre) + m @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))


def blob(bm, centre, rad, seg=6, rings=4):
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in r["verts"]:
        v.co = Vector(centre) + Vector((v.co.x * rad[0], v.co.y * rad[1], v.co.z * rad[2]))


def build(parts):
    """Spojí díly {název: (bmesh, materiál)} do jedné mesh s víc materiály a exportuje."""
    me = bpy.data.meshes.new("ware")
    total = bmesh.new()
    mats = []
    for bm, mt in parts:
        if mt not in mats:
            mats.append(mt)
            me.materials.append(mt)
        idx = mats.index(mt)
        for f in bm.faces:
            f.material_index = idx
        tmp = bpy.data.meshes.new("t")
        bm.to_mesh(tmp)
        total.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        bm.free()
    total.to_mesh(me)
    total.free()
    me.shade_flat()
    ob = bpy.data.objects.new("ware", me)
    bpy.context.collection.objects.link(ob)
    return ob


def export(ob, name):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=f"{OUT}/{name}.glb", export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True)
    print("hotovo", name)


BARK = (0.33, 0.24, 0.16)
WOOD = (0.52, 0.38, 0.22)
DARK = (0.06, 0.04, 0.03)


def hive_parts(rng):
    log, lid, slot, strap = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    seg, h, r = 12, 1.1, 0.225
    # kmen mírně sbíhavý, oblé hrany kůry přes dva prstence
    cyl(log, (0, 0, 0), (0, 0, h), r * 1.04, r * 0.96, seg)
    for z in (0.3, 0.75):
        cyl(strap, (0, 0, z - 0.012), (0, 0, z + 0.012), r * 1.06, r * 1.06, seg)
    # stříška: dvě prkna do stanu a hřeben, přesah přes kmen
    for sgn in (-1, 1):
        box(lid, (sgn * 0.17, 0, h + 0.09), (0.34, 0.6, 0.035), (0, sgn * math.radians(-32) * -1, 0))
    box(lid, (0, 0, h + 0.2), (0.07, 0.62, 0.05))
    # česno: úzká štěrbina při patě vpředu (−Y)
    box(slot, (0, -r * 1.0, 0.2), (0.1, 0.05, 0.026))
    return [(log, material("bark", BARK, 0.95)), (strap, material("strap", (0.2, 0.15, 0.1))),
            (lid, material("boards", WOOD)), (slot, material("slot", DARK, 1.0))]


def hide_frame_parts(rng):
    poles, skin, cord = bmesh.new(), bmesh.new(), bmesh.new()
    w, d, post = 1.4, 1.2, 1.5
    # dva svislé sloupky a dvě příčky; rám stojí zhruba svisle, kůže mezi příčkami
    x = w / 2
    for sx in (-1, 1):
        cyl(poles, (sx * x, 0, 0), (sx * x, 0, post), 0.035, 0.03, 8)
        cyl(poles, (sx * x * 0.8, -0.35, 0), (sx * x, 0, post * 0.8), 0.025, 0.02, 6)
    z0, z1 = 0.25, 0.25 + d
    cyl(poles, (-x - 0.04, 0, z0), (x + 0.04, 0, z0), 0.028, 0.028, 8)
    cyl(poles, (-x - 0.04, 0, z1), (x + 0.04, 0, z1), 0.028, 0.028, 8)
    # kůže: nepravidelný čtyřúhelník mírně vypouklý, zadní strana tenká
    n = 7
    verts = [[None] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            u, v = i / (n - 1), j / (n - 1)
            edge = 0.04 * rng.uniform(-1, 1) if i in (0, n - 1) or j in (0, n - 1) else 0.0
            verts[i][j] = skin.verts.new((-x * 0.93 + u * x * 1.86 + edge, 0.04 * math.sin(math.pi * u) * math.sin(math.pi * v) + 0.01,
                                          z0 + 0.03 + v * (d - 0.06) + edge))
    for i in range(n - 1):
        for j in range(n - 1):
            skin.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
    bmesh.ops.solidify(skin, geom=list(skin.faces), thickness=0.012)
    # provázky od okraje kůže k příčkám
    for k in range(6):
        u = (k + 0.5) / 6
        px = -x * 0.93 + u * x * 1.86
        for zc, zs in ((z0, z0 + 0.03), (z1, z1 - 0.03)):
            cyl(cord, (px, 0.02, zs), (px, 0.0, zc), 0.007, 0.007, 4)
    return [(poles, material("poles", BARK, 0.9)), (skin, material("hide", (0.68, 0.52, 0.32), 0.75)),
            (cord, material("cord", (0.22, 0.16, 0.1), 0.9))]


def main():
    rng = random.Random(7)
    clear()
    export(build(hive_parts(rng)), "hive")
    clear()
    parts = hive_parts(rng)
    bees = bmesh.new()
    brng = random.Random(3)
    for _ in range(9):
        blob(bees, (brng.uniform(-0.14, 0.14), -0.27 - brng.uniform(0, 0.08), 0.14 + brng.uniform(0, 0.16)),
             (0.011, 0.016, 0.011))
    parts.append((bees, material("bees", (0.95, 0.7, 0.1), 0.6)))
    export(build(parts), "hive-bees")
    clear()
    export(build(hide_frame_parts(rng)), "hide-frame")


main()
