"""Vylepšení pevné cesty (raně slovanská ves, 6.–9. st. – docs/design/roads.md): kmen hatě,
plochý kámen do bláta a brodu a lávka z kmenů přes potok – malý atlas z textur 0 A.D., jeden
materiál.

blender -b --factory-startup --python tools/blender/roads.py -- \
    <0ad_textures> apps/web/public/models/roads <render_dir|->

0ad_textures: složka textur 0 A.D. (…/art/textures) – skript z ní vezme kůru buku
(skins/gaia/trunk_beech_a.dds) a kámen (skins/gaia/stone_temperate_01.png) a složí atlas
512 × 512: vlevo kůra (pás 256 × 512, opakuje se podél kmene), vpravo nahoře kámen, vpravo dole
čelo kmene (letokruhy – procedurálně). render_dir: náhled ve Workbenchi, "-" = bez náhledu.

Souřadnice Blenderu: Z nahoru; ve scéně je bod Blenderu (x, y) v osách (−x, −y) a glTF má Y nahoru.
Rozměry jsou skutečné (m), počátek každého dílu leží na zemi. Kam se díly kladou, počítá scéna
(apps/web/lib/scene/road-works.ts – rozměry níže musí sedět s konstantami tam).

Výstup (apps/web/public/models/roads):
  road-log.glb          kmen hatě napříč cestou: délka LOG_LENGTH (2,6 m) podél x, průměr
                        0,2 m, leží na zemi (počátek pod středem kmene)
  road-stone.glb        plochý kámen ≈ 0,5 × 0,4 m, zapuštěný do bláta (počátek na zemi)
  road-bridge.glb       lávka přes brod: tři kmeny podélně (y) délky BRIDGE_LENGTH (5,2 m) na
                        dvou příčných prazích, ty na čtyřech kůlech; zábradlí z tyče na jedné
                        straně (+x). Počátek na zemi pod středem lávky.
  road-bridge-posts.glb staveniště lávky – jen kůly a prahy (scéna je ukáže v první půli stavby)
Licence: kůra a kámen z 0 A.D. (CC BY-SA 3.0, Wildfire Games) – apps/web/public/models/roads/
LICENSES.md.
"""
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
TEXTURES, OUT_DIR, RENDER_DIR = args[0], args[1], args[2] if len(args) > 2 else "-"

ATLAS = 512
LOG_LENGTH = 2.6
LOG_RADIUS = 0.1
BRIDGE_LENGTH = 5.2
BRIDGE_DECK_Z = 0.62
# oblasti atlasu (u0, v0, u1, v1) v 0–1, v odspodu jako v Blenderu
BARK = (0.0, 0.0, 0.5, 1.0)
STONE = (0.5, 0.5, 1.0, 1.0)
ENDGRAIN = (0.5, 0.0, 1.0, 0.5)

random.seed(7)


def load_pixels(path):
    image = bpy.data.images.load(path)
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[:, :, :3]


def resample(src, width, height):
    h, w = src.shape[:2]
    ys = np.clip(((np.arange(height) + 0.5) * h / height).astype(int), 0, h - 1)
    xs = np.clip(((np.arange(width) + 0.5) * w / width).astype(int), 0, w - 1)
    return src[ys][:, xs]


def build_atlas():
    """Atlas kůra + kámen + čelo kmene (řádek 0 = dole jako v Blenderu)."""
    px = np.zeros((ATLAS, ATLAS, 3), dtype=np.float32)
    half = ATLAS // 2
    bark = load_pixels(os.path.join(TEXTURES, "skins/gaia/trunk_beech_a.dds"))
    # buková kůra je šedá – dub a olše na kmeny hatě jsou tmavší a teplejší
    bark = resample(bark, half, ATLAS) * np.array([0.78, 0.66, 0.52], np.float32)
    px[:, :half] = np.clip(bark, 0, 1)
    stone = load_pixels(os.path.join(TEXTURES, "skins/gaia/stone_temperate_01.png"))
    px[half:, half:] = resample(stone, half, half)
    # čelo kmene: letokruhy kolem středu, světlé dřevo, tmavší okraj kůry
    yy, xx = np.mgrid[0:half, 0:half].astype(np.float32)
    r = np.hypot(xx - half / 2, yy - half / 2) / (half / 2)
    rings = 0.5 + 0.5 * np.sin(r * 38.0)
    wood = np.stack([0.72 - 0.08 * rings, 0.56 - 0.07 * rings, 0.36 - 0.05 * rings], axis=-1)
    edge = np.clip((r - 0.86) / 0.1, 0, 1)[..., None]
    wood = wood * (1 - edge) + np.array([0.3, 0.22, 0.15], np.float32) * edge
    px[:half, half:] = wood
    image = bpy.data.images.new("road-atlas", ATLAS, ATLAS)
    rgba = np.concatenate([px, np.ones((ATLAS, ATLAS, 1), np.float32)], axis=-1)
    image.pixels.foreach_set(rgba.reshape(-1))
    image.file_format = "JPEG"
    image.pack()
    return image


def make_material(image):
    mat = bpy.data.materials.new("road-atlas")
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def in_region(region, u, v):
    u0, v0, u1, v1 = region
    return (u0 + (u1 - u0) * u, v0 + (v1 - v0) * v)


def rod(bm, uv, start, end, radius, sides=10, caps=True, bark_repeat=1.0):
    """Válec (kmen) z `start` do `end` – plášť z kůry, čela s letokruhy."""
    a = np.array(start, np.float64)
    b = np.array(end, np.float64)
    axis = b - a
    length = float(np.linalg.norm(axis))
    d = axis / length
    helper = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
    n1 = np.cross(d, helper)
    n1 /= np.linalg.norm(n1)
    n2 = np.cross(d, n1)
    jitter = [radius * (1 + random.uniform(-0.08, 0.08)) for _ in range(sides)]
    ring_a = []
    ring_b = []
    for k in range(sides + 1):
        t = 2 * math.pi * k / sides
        rr = jitter[k % sides]
        off = n1 * math.cos(t) * rr + n2 * math.sin(t) * rr
        ring_a.append(bm.verts.new(a + off))
        ring_b.append(bm.verts.new(b + off))
    for k in range(sides):
        face = bm.faces.new((ring_a[k], ring_a[k + 1], ring_b[k + 1], ring_b[k]))
        u0, u1 = k / sides, (k + 1) / sides
        vlen = length / 2.6 * bark_repeat
        for loop, (u, v) in zip(face.loops, [(u0, 0), (u1, 0), (u1, vlen), (u0, vlen)]):
            loop[uv].uv = in_region(BARK, u, min(v, 1.0) if vlen <= 1 else v)
    if caps:
        for ring, center, flip in ((ring_a, a, True), (ring_b, b, False)):
            c = bm.verts.new(center)
            for k in range(sides):
                tri = (c, ring[k + 1], ring[k]) if flip else (c, ring[k], ring[k + 1])
                face = bm.faces.new(tri)
                for loop in face.loops:
                    p = np.array(loop.vert.co) - center
                    u = 0.5 + float(np.dot(p, n1)) / (2.4 * radius)
                    v = 0.5 + float(np.dot(p, n2)) / (2.4 * radius)
                    loop[uv].uv = in_region(ENDGRAIN, u, v)


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
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def build_log(bm, uv):
    rod(bm, uv, (-LOG_LENGTH / 2, 0, LOG_RADIUS * 0.8), (LOG_LENGTH / 2, 0, LOG_RADIUS * 0.8), LOG_RADIUS)


def build_stone(bm, uv):
    ico = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.25)
    for v in ico["verts"]:
        x, y, z = v.co
        s = 1 + random.uniform(-0.15, 0.15)
        v.co = (x * 1.1 * s, y * 0.9 * s, max(-0.02, z * 0.32 * s))
    for face in bm.faces:
        for loop in face.loops:
            x, y, _ = loop.vert.co
            loop[uv].uv = in_region(STONE, 0.5 + x / 0.7, 0.5 + y / 0.7)


def posts_and_sills(bm, uv):
    for y in (-BRIDGE_LENGTH / 2 + 0.3, BRIDGE_LENGTH / 2 - 0.3):
        for x in (-0.7, 0.7):
            rod(bm, uv, (x, y, -0.3), (x, y, BRIDGE_DECK_Z - 0.18), 0.08, sides=8)
        rod(bm, uv, (-0.85, y, BRIDGE_DECK_Z - 0.14), (0.85, y, BRIDGE_DECK_Z - 0.14), 0.1, sides=8)


def build_bridge(bm, uv):
    posts_and_sills(bm, uv)
    for x in (-0.26, 0.0, 0.26):
        rod(
            bm,
            uv,
            (x, -BRIDGE_LENGTH / 2, BRIDGE_DECK_Z),
            (x, BRIDGE_LENGTH / 2, BRIDGE_DECK_Z),
            0.13,
            bark_repeat=2.0,
        )
    # zábradlí na jedné straně – dva vyšší kůly a tyč
    for y in (-BRIDGE_LENGTH / 2 + 0.6, BRIDGE_LENGTH / 2 - 0.6):
        rod(bm, uv, (0.82, y, -0.3), (0.82, y, BRIDGE_DECK_Z + 0.95), 0.06, sides=8)
    rod(
        bm,
        uv,
        (0.82, -BRIDGE_LENGTH / 2 + 0.4, BRIDGE_DECK_Z + 0.9),
        (0.82, BRIDGE_LENGTH / 2 - 0.4, BRIDGE_DECK_Z + 0.9),
        0.05,
        sides=8,
        bark_repeat=2.0,
    )


def export(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_apply=True,
    )


def render_preview(objs):
    os.makedirs(RENDER_DIR, exist_ok=True)
    for k, obj in enumerate(objs):
        obj.location.x = k * 4.0
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (6, -11, 7)
    target = bpy.data.objects.new("target", None)
    bpy.context.scene.collection.objects.link(target)
    target.location = (6, 0, 0)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = 1200
    bpy.context.scene.render.resolution_y = 600
    bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
    bpy.context.scene.display.shading.color_type = "TEXTURE"
    bpy.context.scene.render.filepath = os.path.join(RENDER_DIR, "roads.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    material = make_material(build_atlas())
    parts = {
        "road-log": build_log,
        "road-stone": build_stone,
        "road-bridge": build_bridge,
        "road-bridge-posts": posts_and_sills,
    }
    objs = []
    for name, build in parts.items():
        obj = new_object(name, build, material)
        export(obj, os.path.join(OUT_DIR, f"{name}.glb"))
        objs.append(obj)
    if RENDER_DIR != "-":
        render_preview(objs)


main()
