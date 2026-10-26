"""Rekvizity porážky (docs/design/slaughter.md, docs/code/scene-village.md – Porážka ve scéně):
kozlina (trojnožka s bidlem, provazem a háky) ve dvou velikostech, necky, špalek s prknem a miska.

blender -b --factory-startup --python tools/blender/slaughter.py -- \
    apps/web/public/models/roads/road-log.glb apps/web/public/models/slaughter <render_dir|->

road-log.glb: kmen hatě z tools/blender/roads.py – skript z něj vezme kůru a čelo (0 A.D., buk).
Prkna, provaz, železo a krev jsou procedurální (numpy). Jeden atlas 256 × 256, jeden materiál.

Souřadnice Blenderu: Z nahoru, počátek každého dílu na zemi pod jeho středem. Rozměry jsou skutečné (m).

Výstup slaughter.glb – díly (uzly):
  trestle-large  kozlina na krávu: tři kůly (základna r 1,25 m, vrchol 2,72 m), bidlo podél X ve
                 výšce 2,58 m, provaz a rozpěrák (±0,22 m podél X) se dvěma háky, **hroty háků ve
                 výšce 2,20 m** (kráva visí 2,05 m nad svým počátkem -> počátek zvířete 0,15 m nad zemí).
  trestle-small  kozlina na prase, ovci a kozu (visí 1,18–1,28 m): vrchol 2,0 m, bidlo 1,88 m,
                 **hroty háků ve výšce 1,50 m** (počátek zvířete 0,22–0,32 m nad zemí).
  trough         necky: vyhloubené koryto 1,4 × 0,5 m, výška 0,24 m (dno 0,05 m), na dvou příčných
                 trámcích, bez krve (krev jen v misce); leží pod hlavou visícího zvířete.
  block          špalek r 0,3 m, výška 0,55 m, na něm prkno 0,7 × 0,34 × 0,04 m (vršek prkna 0,59 m)
                 – na prkno se kladou kýty.
  bowl           miska (horní r 0,14 m, dno 0,08 m, výška 0,09 m) s krví, dno na zemi.
Licence: kůra a čela z 0 A.D. (CC BY-SA 3.0, Wildfire Games) – zbytek vlastní;
apps/web/public/models/slaughter/LICENSES.md.
"""
import json
import math
import os
import random
import struct
import sys
import tempfile

import bmesh
import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
ROAD_GLB, OUT_DIR = args[0], args[1]
RENDER_DIR = args[2] if len(args) > 2 else "-"

ATLAS = 256
# oblasti atlasu (u0, v0, u1, v1) v 0–1, v odspodu jako v Blenderu
BARK = (0.0, 0.0, 0.5, 1.0)
ENDGRAIN = (0.5, 0.0, 0.75, 0.5)
ROPE = (0.5, 0.5, 1.0, 0.625)
PLANK = (0.5, 0.625, 1.0, 0.8125)
IRON = (0.75, 0.0, 1.0, 0.5)
BLOOD = (0.5, 0.8125, 1.0, 1.0)

random.seed(5)


def glb_image(path):
    data = open(path, "rb").read()
    length = struct.unpack("<I", data[12:16])[0]
    meta = json.loads(data[20 : 20 + length])
    view = meta["bufferViews"][meta["images"][0]["bufferView"]]
    start = 20 + length + 8 + view.get("byteOffset", 0)
    fd, name = tempfile.mkstemp(suffix=".jpg")
    os.write(fd, data[start : start + view["byteLength"]])
    os.close(fd)
    return name


def load_pixels(path):
    image = bpy.data.images.load(path)
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    bpy.data.images.remove(image)
    return px.reshape(h, w, 4)[:, :, :3]


def resample(src, width, height):
    h, w = src.shape[:2]
    ys = np.clip(((np.arange(height) + 0.5) * h / height).astype(int), 0, h - 1)
    xs = np.clip(((np.arange(width) + 0.5) * w / width).astype(int), 0, w - 1)
    return src[ys][:, xs]


def noise(h, w, cells, seed):
    r = np.random.default_rng(seed).random((cells + 1, cells + 1)).astype(np.float32)
    r[-1, :] = r[0, :]
    r[:, -1] = r[:, 0]
    ys, xs = np.linspace(0, cells, h, endpoint=False), np.linspace(0, cells, w, endpoint=False)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a, b, c, d = r[y0][:, x0], r[y0][:, x0 + 1], r[y0 + 1][:, x0], r[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def region_px(region):
    u0, v0, u1, v1 = region
    return int(v0 * ATLAS), int(v1 * ATLAS), int(u0 * ATLAS), int(u1 * ATLAS)


def build_atlas():
    road = load_pixels(glb_image(ROAD_GLB))
    rh, rw = road.shape[:2]
    px = np.zeros((ATLAS, ATLAS, 3), dtype=np.float32)
    half, quarter = ATLAS // 2, ATLAS // 4
    px[:, :half] = resample(road[:, : rw // 2], half, ATLAS)
    px[: ATLAS // 2, half : half + quarter] = resample(road[: rh // 2, rw // 2 :], quarter, ATLAS // 2)
    # lýkový provaz (šikmé prameny)
    r0, r1, c0, c1 = region_px(ROPE)
    yy, xx = np.mgrid[0 : r1 - r0, 0 : c1 - c0].astype(np.float32)
    strand = 0.5 + 0.5 * np.sin((xx + yy * 1.2) * 2 * math.pi / 6.0)
    px[r0:r1, c0:c1] = np.array([0.5, 0.4, 0.26], np.float32) * (0.7 + 0.4 * strand[..., None])
    # prkno: světlé dřevo, podélné léty (v podél U)
    r0, r1, c0, c1 = region_px(PLANK)
    h, w = r1 - r0, c1 - c0
    grain = 0.6 + 0.25 * np.sin(np.arange(h)[:, None, None] * 1.7 + 4 * noise(h, w, 3, 8)[..., None])
    px[r0:r1, c0:c1] = np.array([0.55, 0.42, 0.27], np.float32) * (0.78 + 0.3 * grain) * (0.9 + 0.15 * noise(h, w, 10, 4)[..., None])
    # železo: tmavě šedé, mírně skvrnité
    r0, r1, c0, c1 = region_px(IRON)
    px[r0:r1, c0:c1] = np.array([0.2, 0.2, 0.21], np.float32) * (0.8 + 0.4 * noise(r1 - r0, c1 - c0, 6, 6)[..., None])
    # krev: tmavě rudohnědá
    r0, r1, c0, c1 = region_px(BLOOD)
    px[r0:r1, c0:c1] = np.array([0.32, 0.04, 0.03], np.float32) * (0.8 + 0.4 * noise(r1 - r0, c1 - c0, 5, 9)[..., None])
    image = bpy.data.images.new("slaughter-atlas", ATLAS, ATLAS)
    rgba = np.concatenate([np.clip(px, 0, 1), np.ones((ATLAS, ATLAS, 1), np.float32)], axis=-1)
    image.pixels.foreach_set(rgba.reshape(-1))
    image.file_format = "JPEG"
    image.pack()
    return image


def make_material(name, image):
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def at(region, u, v):
    u0, v0, u1, v1 = region
    return (u0 + (u1 - u0) * (u % 1.0 if u > 1 else u), v0 + (v1 - v0) * min(max(v, 0.0), 1.0))


def rod(bm, uv, start, end, radius, region=BARK, sides=6, caps=True, cap_region=ENDGRAIN, end_radius=None):
    """Kůl / tyč (komolý kužel) ze `start` do `end`, plášť z `region`, čela z `cap_region`."""
    a, b = np.array(start, np.float64), np.array(end, np.float64)
    axis = b - a
    length = float(np.linalg.norm(axis))
    d = axis / length
    helper = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
    n1 = np.cross(d, helper)
    n1 /= np.linalg.norm(n1)
    n2 = np.cross(d, n1)
    r_end = radius if end_radius is None else end_radius
    ring_a, ring_b = [], []
    for k in range(sides + 1):
        t = 2 * math.pi * k / sides
        off = n1 * math.cos(t) + n2 * math.sin(t)
        ring_a.append(bm.verts.new(a + off * radius))
        ring_b.append(bm.verts.new(b + off * r_end))
    v0 = random.random() * 0.5
    vlen = min(0.45, length / 2.6)
    for k in range(sides):
        face = bm.faces.new((ring_a[k], ring_a[k + 1], ring_b[k + 1], ring_b[k]))
        face.smooth = True
        u0, u1 = k / sides, (k + 1) / sides
        for loop, (u, v) in zip(face.loops, [(u0, v0), (u1, v0), (u1, v0 + vlen), (u0, v0 + vlen)]):
            loop[uv].uv = at(region, u, v)
    if caps:
        for ring, center, flip, rr in ((ring_a, a, True, radius), (ring_b, b, False, r_end)):
            c = bm.verts.new(center)
            for k in range(sides):
                face = bm.faces.new((c, ring[k + 1], ring[k]) if flip else (c, ring[k], ring[k + 1]))
                for loop in face.loops:
                    p = np.array(loop.vert.co) - center
                    loop[uv].uv = at(cap_region, 0.5 + float(np.dot(p, n1)) / (2.4 * rr), 0.5 + float(np.dot(p, n2)) / (2.4 * rr))


def box(bm, uv, center, size, region):
    """Kvádr, všechny stěny z jedné oblasti atlasu (prkna, trámce)."""
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    c = [bm.verts.new((cx + dx * sx, cy + dy * sy, cz + dz * sz)) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
    for f in [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]:
        face = bm.faces.new([c[i] for i in f])
        for loop, (u, v) in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[uv].uv = at(region, u, v)


# --- díly ---------------------------------------------------------------------------------------


def trestle(bm, uv, apex, spread, hook_z, leg_r):
    """Kozlina: tři kůly sbíhající se nahoře, bidlo podél X, provaz, rozpěrák a dva háky."""
    bar_z = apex - 0.14
    for angle in (90, 210, 330):
        a = math.radians(angle)
        rod(bm, uv, (math.cos(a) * spread, math.sin(a) * spread, 0.0), (math.cos(a) * 0.04, math.sin(a) * 0.04, apex), leg_r, end_radius=leg_r * 0.8)
    rod(bm, uv, (-0.6, 0, bar_z), (0.6, 0, bar_z), 0.04, sides=6)
    # svázání vrcholu provazem
    rod(bm, uv, (0, 0, apex - 0.2), (0, 0, apex - 0.06), 0.085, region=ROPE, sides=6, caps=False)
    gambrel_z = hook_z + 0.2
    rod(bm, uv, (0, 0, bar_z - 0.03), (0, 0, gambrel_z), 0.012, region=ROPE, sides=4, caps=False)
    rod(bm, uv, (-0.24, 0, gambrel_z), (0.24, 0, gambrel_z), 0.02, sides=6)
    for sign in (-1, 1):
        x = 0.22 * sign
        rod(bm, uv, (x, 0, gambrel_z), (x, 0, hook_z + 0.05), 0.012, region=IRON, sides=4, caps=False)
        rod(bm, uv, (x, 0, hook_z + 0.05), (x - 0.05 * sign, 0, hook_z), 0.012, region=IRON, sides=4)


def build_trestle_large(bm, uv):
    trestle(bm, uv, apex=2.72, spread=1.25, hook_z=2.2, leg_r=0.055)


def build_trestle_small(bm, uv):
    trestle(bm, uv, apex=2.0, spread=0.85, hook_z=1.5, leg_r=0.045)


def build_trough(bm, uv):
    length, width, height, wall, bottom = 1.4, 0.5, 0.24, 0.05, 0.05
    box(bm, uv, (0, 0, 0.04 + bottom / 2), (length, width, bottom), PLANK)
    for sign in (-1, 1):
        box(bm, uv, (0, sign * (width - wall) / 2, 0.04 + height / 2), (length, wall, height), PLANK)
        box(bm, uv, (sign * (length - wall) / 2, 0, 0.04 + height / 2), (wall, width - 2 * wall, height), PLANK)
        box(bm, uv, (sign * 0.45, 0, 0.02), (0.08, width + 0.08, 0.04), BARK)
    # bez krve na dně – krev jen tmavá hladina v misce (Martin 26. 10. 2026)


def build_block(bm, uv):
    height = 0.55
    rod(bm, uv, (0, 0, 0), (0, 0, height), 0.3, sides=10, end_radius=0.28)
    box(bm, uv, (0, 0, height + 0.02), (0.7, 0.34, 0.04), PLANK)


def build_bowl(bm, uv):
    sides, r_top, r_bot, h = 10, 0.14, 0.08, 0.09
    top = [bm.verts.new((math.cos(2 * math.pi * k / sides) * r_top, math.sin(2 * math.pi * k / sides) * r_top, h)) for k in range(sides)]
    bot = [bm.verts.new((math.cos(2 * math.pi * k / sides) * r_bot, math.sin(2 * math.pi * k / sides) * r_bot, 0)) for k in range(sides)]
    for k in range(sides):
        j = (k + 1) % sides
        quads = [(bot[k], bot[j], top[j], top[k])]
        # vnitřní stěna z vlastních vrcholů (mírně užší)
        inner = [bm.verts.new((v.co.x * 0.93, v.co.y * 0.93, v.co.z)) for v in (top[k], top[j], bot[j], bot[k])]
        quads.append(tuple(inner))
        for pts in quads:
            face = bm.faces.new(pts)
            for loop, (u, v) in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
                loop[uv].uv = at(PLANK, u, v)
    c = bm.verts.new((0, 0, 0))
    for k in range(sides):
        face = bm.faces.new((c, bot[k], bot[(k + 1) % sides]))
        for loop in face.loops:
            loop[uv].uv = at(PLANK, 0.5, 0.5)
    level = h - 0.02
    r_lv = r_bot + (r_top - r_bot) * level / h
    lc = bm.verts.new((0, 0, level))
    ring = [bm.verts.new((math.cos(2 * math.pi * k / sides) * r_lv, math.sin(2 * math.pi * k / sides) * r_lv, level)) for k in range(sides)]
    for k in range(sides):
        face = bm.faces.new((lc, ring[(k + 1) % sides], ring[k]))
        for loop in face.loops:
            loop[uv].uv = at(BLOOD, 0.5, 0.5)


def new_object(name, build, material):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    build(bm, uv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_texcoords=True,
        export_normals=True, export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=88, export_apply=True,
    )


def render_preview(objs):
    os.makedirs(RENDER_DIR, exist_ok=True)
    for k, obj in enumerate(objs):
        obj.location.x = k * 3.0
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (6, -10, 5)
    target = bpy.data.objects.new("target", None)
    bpy.context.scene.collection.objects.link(target)
    target.location = (6, 0, 1.0)
    track = cam.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1400, 600
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.filepath = os.path.join(RENDER_DIR, "slaughter.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    material = make_material("slaughter-atlas", build_atlas())
    objs = [
        new_object("trestle-large", build_trestle_large, material),
        new_object("trestle-small", build_trestle_small, material),
        new_object("trough", build_trough, material),
        new_object("block", build_block, material),
        new_object("bowl", build_bowl, material),
    ]
    for obj in objs:
        z = [v.co.z for v in obj.data.vertices]
        xs = [v.co.x for v in obj.data.vertices]
        ys = [v.co.y for v in obj.data.vertices]
        print(f"{obj.name}: {len(obj.data.polygons)} ploch, x {min(xs):.2f}..{max(xs):.2f}, y {min(ys):.2f}..{max(ys):.2f}, z {min(z):.2f}..{max(z):.2f}")
    path = os.path.join(OUT_DIR, "slaughter.glb")
    export(objs, path)
    print(f"slaughter.glb: {os.path.getsize(path) / 1024:.0f} kB")
    if RENDER_DIR != "-":
        render_preview(objs)


main()
