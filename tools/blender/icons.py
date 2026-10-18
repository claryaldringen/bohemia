"""Ikony pro rozhraní Bohemie ve stylu 0 A.D. – portréty staveb a ikony surovin.

Celé jedním příkazem z kořene repa (Blender 5, ImageMagick `magick`, internet jen pro ikony 0 A.D.):

    blender -b --factory-startup --python tools/blender/icons.py -- apps/web/public/icons [jen,vybrané,ikony]

Výstup (128 × 128 PNG, průhledné rohy) – `build/` zemnice, polozemnice, pole, hrbitov,
hrncir, kovar, uhlir (řemeslné dílny z `apps/web/public/models/crafts/`, uhlíř s milířem), sad
(jabloňový sad); (64 × 64 PNG) – `resources/` people, food, wood, labor, satiation, date, apples,
ozim (osení pod sněhem), jar (klasy jarního ječmene).
Bez druhého argumentu vše, jinak čárkami oddělený výběr (např. `pole,hrbitov,food`).

Postup: portréty staveb a ikony `food`, `wood`, `labor`, `satiation`, `date`, `apples` se vyrenderují v Cycles
(ortografická kamera ~3/4 shora, teplé slunce, měkký stín, 256 px) a ImageMagick je zmenší
a vloží na tmavě hnědé pozadí s vinětou a zaoblenými rohy (jako portréty 0 A.D.); ikony surovin
zůstávají průhledné jako v 0 A.D. `people` je původní ikona 0 A.D. (`population.png`, CC BY-SA 3.0),
stahuje se z oficiálního repozitáře 0 A.D. (GitHub 0ad/0ad), jen zmenšená/zachovaná; licence viz
`apps/web/public/icons/LICENSES.md`. Zemnice a polozemnice jsou vlastní modely
(`apps/web/public/models/dwellings/`), pole, hřbitov, sad (jabloně s jablky), obilí, hranice
klád, motyka, miska s chlebem, slunce a jablka se modelují přímo v tomto skriptu, textury země
jsou z `apps/web/public/textures/terrain/`.
"""
import math
import os
import random
import subprocess
import sys
import tempfile
import urllib.request

import bmesh
import bpy
from mathutils import Euler, Vector, noise

args = sys.argv[sys.argv.index("--") + 1 :]
OUT = os.path.abspath(args[0])
ONLY = set(args[1].split(",")) if len(args) > 1 and args[1] else None
ROOT = os.getcwd()
MODELS = os.path.join(ROOT, "apps/web/public/models/dwellings")
CRAFTS = os.path.join(ROOT, "apps/web/public/models/crafts")
TEX = os.path.join(ROOT, "apps/web/public/textures/terrain")
TMP = tempfile.mkdtemp(prefix="bohemia-icons-")
RES = 256
POP_URL = (
    "https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/art/textures/"
    "ui/session/icons/resources/population.png"
)

# ---------------------------------------------------------------- scéna ----


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.cycles.device = "CPU"
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.68, 0.78, 1)
    bg.inputs["Strength"].default_value = 0.55
    return sc


def sun(az=-50, el=48, strength=4.2, color=(1.0, 0.86, 0.66), size=0.08):
    """Slunce svítící ze směru azimutu `az` (stupně od -Y k +X) pod výškou `el`."""
    d = bpy.data.lights.new("sun", "SUN")
    d.energy, d.color, d.angle = strength, color, size
    o = bpy.data.objects.new("sun", d)
    bpy.context.collection.objects.link(o)
    a, e = math.radians(az), math.radians(el)
    back = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    o.rotation_euler = (-back).to_track_quat("-Z", "Y").to_euler()
    return o


def camera(points, az=35, el=36, margin=1.12, shift=(0, 0)):
    """Ortografická kamera ze směru `az`/`el`, zaměřená tak, aby `points` vyplnily čtverec."""
    a, e = math.radians(az), math.radians(el)
    back = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    right = Vector((math.cos(a), math.sin(a), 0))
    up = back.cross(right)
    xs = [p.dot(right) for p in points]
    ys = [p.dot(up) for p in points]
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * margin
    cx, cy = (max(xs) + min(xs)) / 2 + shift[0] * side, (max(ys) + min(ys)) / 2 + shift[1] * side
    d = bpy.data.cameras.new("cam")
    d.type, d.ortho_scale, d.clip_start, d.clip_end = "ORTHO", side, 0.1, 500
    o = bpy.data.objects.new("cam", d)
    bpy.context.collection.objects.link(o)
    o.location = right * cx + up * cy + back * 100
    o.rotation_euler = (-back).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = o


def world_points(objs):
    pts = []
    for o in objs:
        if o.type == "MESH":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    return pts


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------- materiály ----


def mat(name, color=(0.5, 0.5, 0.5), rough=0.85, tex=None, scale=1.0, tint=None, bump=0.0, noise=None):
    """Materiál: barva, nebo obrázek z `tex` (JPEG), případně se šumem barvy a výškou (bump)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    out = b.inputs["Base Color"]
    if tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(tex)
        t.image.colorspace_settings.name = "sRGB"
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        t.projection = "FLAT"
        src = t.outputs["Color"]
        if tint:
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
            mx.inputs["Factor"].default_value = 1.0
            mx.inputs[7].default_value = (*tint, 1)
            nt.links.new(src, mx.inputs[6])
            src = mx.outputs[2]
        nt.links.new(src, out)
    else:
        b.inputs["Base Color"].default_value = (*color, 1)
        if noise:
            n = nt.nodes.new("ShaderNodeTexNoise")
            n.inputs["Scale"].default_value = noise
            n.inputs["Detail"].default_value = 6
            ramp = nt.nodes.new("ShaderNodeMix")
            ramp.data_type = "RGBA"
            ramp.inputs[6].default_value = (*[c * 0.55 for c in color], 1)
            ramp.inputs[7].default_value = (*[min(1, c * 1.2) for c in color], 1)
            tc = nt.nodes.new("ShaderNodeTexCoord")
            nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
            nt.links.new(n.outputs["Fac"], ramp.inputs["Factor"])
            nt.links.new(ramp.outputs[2], out)
            if bump:
                bn = nt.nodes.new("ShaderNodeBump")
                bn.inputs["Strength"].default_value = bump
                bn.inputs["Distance"].default_value = 0.02
                nt.links.new(n.outputs["Fac"], bn.inputs["Height"])
                nt.links.new(bn.outputs["Normal"], b.inputs["Normal"])
    return m


def to_obj(bm, name, material, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if material:
        o.data.materials.append(material)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def ground(radius, material, z=0.0, fade=0.72):
    """Kruhová plocha země, jejíž okraj plynule mizí do průhledna (jako 0 A.D. portréty)."""
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, radius=radius, segments=96)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=0)
    o = to_obj(bm, "ground", material, smooth=False)
    o.location.z = z
    # průhledný okraj: mix Transparent / BSDF podle vzdálenosti od středu
    nt = material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    outn = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = radius * fade
    mr.inputs["From Max"].default_value = radius * 0.99
    mr.inputs["To Min"].default_value = 0.0
    mr.inputs["To Max"].default_value = 1.0
    nt.links.new(tc.outputs["Object"], ln.inputs[0])
    nt.links.new(ln.outputs["Value"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], mix.inputs["Fac"])
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], outn.inputs["Surface"])
    return o


def cyl(bm, p0, p1, r0, r1=None, seg=8):
    """Komolý kužel mezi dvěma body (stonky, tyče, kolíky)."""
    r1 = r0 if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat("Z", "Y")
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


def blob(bm, c, rad, seg=8, rings=5):
    """Elipsoid (klas, bochník, kámen): rad = (rx, ry, rz); osa elipsoidu = Z, otočení po Eulerovi v c[1]."""
    centre, rot = Vector(c[0]), c[1]
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in r["verts"]:
        v.co = Vector((v.co.x * rad[0], v.co.y * rad[1], v.co.z * rad[2]))
        v.co = centre + Euler(rot).to_matrix() @ v.co


def place_model(name, material_fix=None, folder=MODELS):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{folder}/{name}.glb")
    new = [o for o in bpy.data.objects if o not in before]
    # glTF Y-up → Blender Z-up už řeší importér; vchod míří do -Y
    return [o for o in new if o.type == "MESH"]


# ----------------------------------------------------------------- stavby ----


def icon_dwelling(name):
    objs = place_model(name)
    gr = ground(9.5, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.22, tint=(0.8, 0.74, 0.6)), z=0.0, fade=0.6)
    # vykopaná hlína u jámy
    bm = bmesh.new()
    for i in range(7):
        a = random.Random(i).uniform(0, 6.28)
        blob(bm, ((math.cos(a) * 3.9 + 0.2, math.sin(a) * 1.0 + 4.2, 0.0), (0, 0, a)), (1.6, 1.0, 0.45), 10, 6)
    mound = to_obj(bm, "spoil", mat("mud", tex=f"{TEX}/mud.jpg", scale=0.3, tint=(1.2, 0.9, 0.7)))
    sun(az=-55, el=46)
    pts = world_points(objs)
    pts = [Vector((p.x, p.y, max(p.z, 0.0))) for p in pts]
    camera(pts + [Vector((0, 0, -0.2))], az=32, el=33, margin=1.04, shift=(0, -0.02))


def icon_craft(name):
    """Řemeslná dílna (tools/blender/crafts.py) jako portrét obydlí. Hrnčíř a kovář zepředu
    do přístřešku (pec / výheň musí být v ikoně vidět), uhlíř i s kouřícím milířem – blíž
    a vzadu vlevo (ve vsi je MILIR_OFFSET v crafts.py), ať se do čtverce vejde obojí."""
    objs = place_model(name, folder=CRAFTS)
    if name == "uhlir":
        milir = place_model("milir", folder=CRAFTS)
        for o in milir:
            o.location.x -= 5.6
            o.location.y += 3.2
        objs += milir
        # dým z komínu milíře – v malé ikoně z něj teprve je poznat milíř, ne kopec
        smoke = mat("smoke", (0.78, 0.77, 0.74), 1.0)
        bsdf = next(n for n in smoke.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Alpha"].default_value = 0.55
        bm = bmesh.new()
        for k, (dx, dy, z, r) in enumerate(((0.0, 0.0, 2.7, 0.35), (0.25, 0.15, 3.3, 0.5), (0.65, 0.3, 4.0, 0.62), (1.2, 0.45, 4.7, 0.7))):
            blob(bm, ((-5.6 + dx, 3.2 + dy, z), (0, 0, k)), (r, r, r * 0.8), 12, 7)
        objs.append(to_obj(bm, "smoke", smoke))
    ground(11.5, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.22, tint=(0.8, 0.74, 0.6)), z=0.0, fade=0.6)
    bm = bmesh.new()
    for i in range(7):
        a = random.Random(i).uniform(0, 6.28)
        blob(bm, ((math.cos(a) * 3.9 + 0.2, math.sin(a) * 1.0 + 4.2, 0.0), (0, 0, a)), (1.6, 1.0, 0.45), 10, 6)
    to_obj(bm, "spoil", mat("mud", tex=f"{TEX}/mud.jpg", scale=0.3, tint=(1.2, 0.9, 0.7)))
    sun(az=-55, el=46)
    pts = [Vector((p.x, p.y, max(p.z, 0.0))) for p in world_points(objs)]
    if name == "uhlir":
        camera(pts + [Vector((0, 0, -0.2))], az=32, el=33, margin=1.06, shift=(0, -0.02))
    else:
        # přední polovina dílny s přístřeškem, pohled skoro zepředu pod střechu
        front = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
        front = [p for p in front if p.y < -0.5 and p.z > -0.1]
        camera(front, az=14, el=29, margin=1.04, shift=(0, -0.04))


def icon_pole():
    rng = random.Random(7)
    L, W, ROWS = 7.0, 7.0, 9
    soil = mat("soil", tex=f"{TEX}/mud.jpg", scale=0.35, tint=(0.85, 0.7, 0.55))
    gr = ground(7.6, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.25, tint=(0.85, 0.8, 0.65)), z=-0.02, fade=0.7)
    # pole: záhony jako podélné valy s brázdami
    bm = bmesh.new()
    nx, ny = 5, 26
    step = W / ROWS
    verts = {}
    for i in range(ny + 1):
        for j in range(ROWS * 5 + 1):
            x = -W / 2 + j * (W / (ROWS * 5))
            y = -L / 2 + i * L / ny
            h = 0.11 * (0.5 + 0.5 * math.cos((x + W / 2) / step * 2 * math.pi)) + 0.01 * rng.random()
            verts[i, j] = bm.verts.new((x, y, h))
    for i in range(ny):
        for j in range(ROWS * 5):
            bm.faces.new((verts[i, j], verts[i, j + 1], verts[i + 1, j + 1], verts[i + 1, j]))
    field = to_obj(bm, "field", soil)
    # klasy pšenice / žita v řadách na hřebenech
    stems, ears = bmesh.new(), bmesh.new()
    for r in range(ROWS):
        x0 = -W / 2 + (r + 0.0) * step + 0.0
        n = 30
        for k in range(n):
            y = -L / 2 + 0.25 + (L - 0.5) * k / n + rng.uniform(-0.05, 0.05)
            x = x0 + rng.uniform(-0.08, 0.08)
            for _ in range(2):
                xx, yy = x + rng.uniform(-0.1, 0.1), y + rng.uniform(-0.1, 0.1)
                h = rng.uniform(0.75, 0.95)
                lean = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0))
                top = Vector((xx, yy, 0.12 + h)) + lean
                cyl(stems, (xx, yy, 0.1), top, 0.012, 0.008, 4)
                blob(ears, ((top + Vector((0, 0, 0.1)))[:], (lean.y * 2, -lean.x * 2, rng.uniform(0, 6))), (0.04, 0.04, 0.16), 6, 4)
    s = to_obj(stems, "stems", mat("stem", (0.78, 0.62, 0.28), 0.8))
    e = to_obj(ears, "ears", mat("ear", (0.93, 0.72, 0.25), 0.75, noise=40))
    sun(az=-60, el=44)
    camera([Vector((-W / 2, -L / 2, 0)), Vector((W / 2, L / 2, 1.2)), Vector((-W / 2, L / 2, 0)), Vector((W / 2, -L / 2, 0))], az=28, el=40, margin=0.98)


def icon_hrbitov():
    rng = random.Random(3)
    gr = ground(8.5, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.22, tint=(0.8, 0.85, 0.65)), z=0.0, fade=0.7)
    # mohyly
    earth = mat("earth", tex=f"{TEX}/grass-dirt.jpg", scale=0.3, tint=(1.1, 0.85, 0.65))
    bm = bmesh.new()
    spots = [(-1.8, -0.4, 1.4, 1.0), (1.7, -0.9, 1.3, 0.9), (0.0, 1.5, 1.6, 1.1), (-2.2, 2.4, 0.9, 0.6)]
    for (x, y, r, h) in spots:
        blob(bm, ((x, y, -0.1 * h), (0, 0, rng.uniform(0, 3))), (r, r * 1.35, h), 18, 9)
    mounds = to_obj(bm, "mounds", earth)
    # plot z proutí: kůly + vodorovné pruty (upletené sinusovky)
    posts = bmesh.new()
    rods = bmesh.new()
    wood = mat("wood", (0.42, 0.29, 0.17), 0.9, noise=25, bump=0.3)
    wick = mat("wicker", (0.62, 0.45, 0.24), 0.9, noise=60, bump=0.5)
    # plot po půlkruhu za mohylami + kus vlevo
    path = []
    R = 4.6
    for i in range(0, 53):
        a = math.radians(-40 + i * (260 / 52) * 0.69)
        path.append((math.cos(a) * R * 1.05, math.sin(a) * R * 0.9 + 0.2))
    # pouze zadní a levý oblouk (od vrcholu doleva)
    path = [(R * 1.05 * math.cos(a), R * 0.92 * math.sin(a) + 0.3) for a in [math.radians(t) for t in range(-10, 200, 3)]]
    segN = len(path)
    for idx in range(0, segN, 2):
        x, y = path[idx]
        h = 0.85 + rng.uniform(-0.05, 0.06)
        cyl(posts, (x, y, -0.05), (x, y, h), 0.07, 0.055, 6)
    rod_levels = 7
    for lv in range(rod_levels):
        z = 0.1 + lv * 0.105
        pts = []
        for idx in range(segN):
            x, y = path[idx]
            # pruty se proplétají: střídavě vně a dovnitř plotu
            ph = (idx / 2.0) * math.pi + (lv % 2) * math.pi
            off = 0.075 * math.sin(ph)
            if idx + 1 < segN:
                dx, dy = path[idx + 1][0] - x, path[idx + 1][1] - y
            else:
                dx, dy = x - path[idx - 1][0], y - path[idx - 1][1]
            ln = math.hypot(dx, dy) or 1
            nx, ny = -dy / ln, dx / ln
            pts.append((x + nx * off, y + ny * off, z))
        for a, b in zip(pts, pts[1:]):
            cyl(rods, a, b, 0.05, 0.05, 5)
    to_obj(posts, "posts", wood)
    to_obj(rods, "rods", wick)
    # kameny a nádoba u mohyl
    st = bmesh.new()
    blob(st, ((-1.7, -2.0, 0.12), (0.2, 0.1, 0.5)), (0.42, 0.3, 0.26), 10, 6)
    blob(st, ((2.3, 0.3, 0.1), (0, 0.2, 1.0)), (0.34, 0.26, 0.2), 10, 6)
    blob(st, ((0.6, -2.3, 0.08), (0.1, 0, 2.0)), (0.3, 0.22, 0.16), 10, 6)
    to_obj(st, "stones", mat("stone", (0.5, 0.49, 0.45), 0.95, noise=18, bump=0.6))
    # dřevěné kůly (štít předka) na mohylách
    tot = bmesh.new()
    for (x, y, r, h) in spots[:3]:
        cyl(tot, (x, y - r * 0.2, h * 0.7), (x, y - r * 0.2, h * 0.7 + 0.95), 0.07, 0.06, 6)
        blob(tot, ((x, y - r * 0.2, h * 0.7 + 1.0), (0, 0, 0)), (0.11, 0.11, 0.13), 8, 5)
    to_obj(tot, "totems", wood)
    sun(az=-55, el=42)
    camera([Vector((-4.2, -2.4, 0)), Vector((4.2, 4.4, 1.6)), Vector((-4.2, 4.4, 0)), Vector((4.2, -2.4, 0))], az=22, el=38, margin=1.0, shift=(0, 0.0))


def lumpy(bm, centre, rad, rng, seg=16, rings=10, amp=0.16):
    """Hrbolatý elipsoid (chomáč listí koruny) – poloměr rozvlněný šumem."""
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    for v in r["verts"]:
        k = 1 + amp * noise.noise(v.co * 2.2 + off)
        v.co = Vector(centre) + Vector((v.co.x * rad[0], v.co.y * rad[1], v.co.z * rad[2])) * k


def apple_tree(trunk, leaves, apples, x, y, rng, size=1.0):
    """Malá jabloň: kmen s rozvětvením, koruna z chomáčů listí a červená jablka po jejím povrchu."""
    s = size
    top = Vector((x + rng.uniform(-0.05, 0.05), y, 1.05 * s))
    cyl(trunk, (x, y, -0.05), top, 0.14 * s, 0.1 * s, 8)
    for k in range(3):
        a = 2 * math.pi * k / 3 + rng.uniform(0, 1)
        cyl(trunk, top, top + Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.45)) * s, 0.08 * s, 0.04 * s, 6)
    crown = Vector((x, y, 1.85 * s))
    tufts = [(crown, (0.95, 0.95, 0.72))]
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
        c = crown + Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, rng.uniform(-0.2, 0.25))) * s
        tufts.append((c, (0.62, 0.62, 0.52)))
    tufts.append((crown + Vector((0, 0, 0.55)) * s, (0.6, 0.6, 0.45)))
    # drobné chomáčky po obvodu – členitý obrys koruny místo hladké koule
    for _ in range(22):
        a, e = rng.uniform(0, 2 * math.pi), rng.uniform(-0.5, 1.2)
        d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e) * 0.85))
        tufts.append((crown + d * 0.92 * s, (0.3, 0.3, 0.26)))
    for c, rad in tufts:
        lumpy(leaves, c, tuple(r * s for r in rad), rng, 12, 8, 0.22)
    # jablka na povrchu koruny – hlavně z boku a shora, kde je ve výřezu vidět
    for _ in range(14):
        a = rng.uniform(0, 2 * math.pi)
        e = rng.uniform(-0.35, 0.9)
        d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e) * 0.8))
        p = crown + Vector((d.x * 1.12, d.y * 1.12, d.z * 1.12 + 0.08)) * s
        blob(apples, (p[:], (0, 0, 0)), (0.12 * s, 0.12 * s, 0.11 * s), 10, 6)


def icon_sad():
    """Jabloňový sad: tři řady malých jabloní s červenými jablky v trávě, pár jablek pod stromy."""
    rng = random.Random(5)
    ground(8.5, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.22, tint=(0.8, 0.85, 0.65)), z=0.0, fade=0.7)
    trunk, leaves, apples = bmesh.new(), bmesh.new(), bmesh.new()
    gap = 2.7
    for r in range(3):
        for c in range(3):
            x = (c - 1) * gap + rng.uniform(-0.12, 0.12)
            y = (r - 1) * gap + rng.uniform(-0.12, 0.12)
            apple_tree(trunk, leaves, apples, x, y, rng, rng.uniform(0.92, 1.05))
            for _ in range(2):  # spadaná jablka
                a, d = rng.uniform(0, 6.28), rng.uniform(0.4, 1.0)
                blob(apples, ((x + math.cos(a) * d, y + math.sin(a) * d, 0.08), (0, 0, 0)), (0.11, 0.11, 0.1), 10, 6)
    objs = [
        to_obj(trunk, "trunks", mat("bark", (0.36, 0.26, 0.17), 0.9, noise=30, bump=0.4)),
        to_obj(leaves, "leaves", mat("leaves", (0.17, 0.34, 0.07), 0.8, noise=18, bump=0.8)),
        to_obj(apples, "apples", mat("apple", (0.75, 0.06, 0.03), 0.4)),
    ]
    sun(az=-55, el=44)
    camera(world_points(objs), az=16, el=40, margin=1.03)


# --------------------------------------------------------------- suroviny ----


def icon_food():
    """Snopek obilí převázaný provazem."""
    rng = random.Random(11)
    stems, ears, cord = bmesh.new(), bmesh.new(), bmesh.new()
    for i in range(22):
        a = rng.uniform(0, 6.28)
        sp = rng.uniform(0.0, 0.55)
        base = Vector((0, 0, -0.6))
        mid = Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, 0.0))
        top = Vector((math.cos(a) * (0.1 + sp), math.sin(a) * (0.1 + sp), 0.95 + rng.uniform(-0.08, 0.08)))
        cyl(stems, base, mid, 0.04, 0.045, 5)
        cyl(stems, mid, top, 0.045, 0.025, 5)
        d = (top - mid).normalized()
        ax = d.to_track_quat("Z", "Y").to_euler()
        c = top + d * 0.2
        blob(ears, ((c.x, c.y, c.z), tuple(ax)), (0.12, 0.12, 0.34), 7, 5)
        for k in range(1, 6):  # osiny
            cc = top + d * (0.1 + 0.07 * k)
            cyl(ears, cc, cc + d * 0.28 + Vector((0.06, 0, 0)), 0.012, 0.0, 3)
    for z, r in ((-0.15, 0.2), (-0.05, 0.21)):
        r0 = r
        segs = 20
        for k in range(segs):
            a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
            cyl(cord, (math.cos(a0) * r0, math.sin(a0) * r0, z), (math.cos(a1) * r0, math.sin(a1) * r0, z), 0.04, 0.04, 5)
    to_obj(stems, "stems", mat("stem", (0.8, 0.64, 0.3), 0.7))
    to_obj(ears, "ears", mat("ear", (0.95, 0.74, 0.27), 0.65, noise=30))
    to_obj(cord, "cord", mat("cord", (0.45, 0.3, 0.16), 0.9))
    sun(az=-50, el=50, strength=4.0)
    camera([Vector((-0.7, -0.7, -0.5)), Vector((0.7, 0.7, 1.5))], az=0, el=18, margin=1.06)
    return True


def icon_wood():
    """Hranice klád (3 + 2 + 1) – kůra a světlá čela s letokruhy."""
    rng = random.Random(7)
    r = 0.27
    bark, ends = bmesh.new(), bmesh.new()
    h = r * math.sqrt(3)
    logs = [(-2 * r, r), (0, r), (2 * r, r), (-r, r + h), (r, r + h), (0, r + 2 * h)]
    rings = (0.0, 0.3, 0.42, 0.7, 0.82, 0.93, 1.0)
    for y, z in logs:
        rr = r * rng.uniform(0.93, 1.0)
        x0 = -0.85 + rng.uniform(-0.08, 0.08)
        x1 = 0.85 + rng.uniform(-0.08, 0.08)
        cyl(bark, (x0, y, z), (x1, y, z), rr, rr * 0.97, 14)
        # čelo: soustředné mezikruží střídavě světlé a tmavší (letokruhy), okraj tmavý (lýko)
        seg = 20
        c = Vector((x1 + 0.004, y, z))
        prev = [c] * seg
        for k, f in enumerate(rings[1:], start=1):
            cur = [c + Vector((0, math.cos(2 * math.pi * i / seg), math.sin(2 * math.pi * i / seg))) * rr * 0.97 * f for i in range(seg)]
            pv = [ends.verts.new(v) for v in prev] if k > 1 else None
            cv = [ends.verts.new(v) for v in cur]
            for i in range(seg):
                j = (i + 1) % seg
                if k == 1:
                    cc = ends.verts.new(c)
                    face = ends.faces.new((cc, cv[i], cv[j]))
                else:
                    face = ends.faces.new((pv[i], pv[j], cv[j], cv[i]))
                face.material_index = k % 2
            prev = cur
    to_obj(bark, "bark", mat("bark", (0.17, 0.1, 0.05), 0.95, noise=26, bump=0.6))
    o = to_obj(ends, "ends", mat("sapwood", (0.95, 0.72, 0.4), 0.75, noise=40), smooth=False)
    o.data.materials.append(mat("ring", (0.6, 0.38, 0.17), 0.8))
    sun(az=40, el=45, strength=4.2)
    camera([Vector((-0.95, -0.85, 0)), Vector((0.95, 0.85, r + 2 * h + r))], az=58, el=24, margin=1.04)
    return True


def icon_labor():
    """Dřevěná motyka se železným (kovaným) listem."""
    wood = bmesh.new()
    cyl(wood, (-0.7, 0, -0.85), (0.15, 0, 1.0), 0.13, 0.1, 8)
    iron = bmesh.new()
    # list motyky: lichoběžník vpředu rukojeti, vodorovně z kovové objímky
    v = [(0.16, 0.0, 0.98), (0.2, 0.0, 0.82), (0.7, 0.0, 0.5), (0.75, 0.0, 0.4)]
    cyl(iron, (0.0, 0, 0.9), (0.4, 0, 0.8), 0.17, 0.17, 8)
    pts = [(0.3, -0.5, 0.78), (0.3, 0.5, 0.78), (0.7, 0.4, 0.05), (0.7, -0.4, 0.05)]
    vv = [iron.verts.new(p) for p in pts]
    iron.faces.new(vv)
    # tloušťka listu
    ext = bmesh.ops.extrude_face_region(iron, geom=iron.faces[-1:])
    for e in ext["geom"]:
        if isinstance(e, bmesh.types.BMVert):
            e.co += Vector((0.1, 0, -0.01))
    bmesh.ops.recalc_face_normals(iron, faces=iron.faces)
    to_obj(wood, "handle", mat("wood", (0.62, 0.42, 0.22), 0.8, noise=18, bump=0.3))
    to_obj(iron, "blade", mat("iron", (0.52, 0.52, 0.55), 0.45, noise=12))
    sun(az=-40, el=50, strength=4.0)
    camera([Vector((-0.7, -0.5, -0.85)), Vector((0.8, 0.5, 1.05))], az=-25, el=25, margin=1.04)
    return True


def icon_satiation():
    """Hliněná miska s bochníkem chleba."""
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.45, 0.0), (0.62, 0.1), (0.82, 0.38), (0.9, 0.52), (0.86, 0.54), (0.78, 0.4), (0.58, 0.16), (0.0, 0.14)]
    segs = 28
    rings = []
    for (r, z) in prof:
        rings.append([bm.verts.new((math.cos(2 * math.pi * k / segs) * r, math.sin(2 * math.pi * k / segs) * r, z)) for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    to_obj(bm, "bowl", mat("clay", (0.55, 0.3, 0.17), 0.75, noise=30, bump=0.2))
    br = bmesh.new()
    blob(br, ((0.0, 0.0, 0.42), (0, 0, 0.3)), (0.55, 0.4, 0.3), 16, 9)
    blob(br, ((0.0, 0.0, 0.42), (0, 0, 0.3)), (0.55, 0.4, 0.3), 16, 9) if False else None
    bread = to_obj(br, "bread", mat("bread", (0.76, 0.5, 0.2), 0.7, noise=22, bump=0.4))
    for p in bread.data.polygons:
        p.use_smooth = True
    # druhý menší bochník vedle
    br2 = bmesh.new()
    blob(br2, ((0.15, -0.3, 0.52), (0.2, 0.1, 1.0)), (0.34, 0.26, 0.22), 14, 8)
    to_obj(br2, "bread2", mat("bread2", (0.82, 0.55, 0.23), 0.7, noise=22, bump=0.4))
    sun(az=-45, el=52, strength=4.0)
    camera([Vector((-0.9, -0.9, 0)), Vector((0.9, 0.9, 0.9))], az=18, el=34, margin=1.1)
    return True


def icon_date():
    """Slunce: zlatý kotouč s paprsky nad pruhem země – den / datum."""
    disc, rays = bmesh.new(), bmesh.new()
    cyl(disc, (0, 0.05, 0), (0, -0.12, 0), 0.5, 0.5, 40)
    for k in range(12):
        a = 2 * math.pi * k / 12
        d = Vector((math.cos(a), 0, math.sin(a)))
        n = 0.8 if k % 2 == 0 else 0.62
        p0, p1 = d * 0.62, d * (0.62 + 0.5 * (1 if k % 2 == 0 else 0.7))
        # trojúhelníkový paprsek
        t = Vector((-d.z, 0, d.x))
        base1, base2, tip = p0 + t * 0.13, p0 - t * 0.13, p1
        vs = [rays.verts.new(v + Vector((0, 0.0, 0))) for v in (base1, base2, tip)]
        vb = [rays.verts.new(v + Vector((0, -0.07, 0))) for v in (base1, base2, tip)]
        rays.faces.new(vs[::-1])
        rays.faces.new(vb)
        for i in range(3):
            j = (i + 1) % 3
            rays.faces.new((vs[i], vs[j], vb[j], vb[i]))
    bmesh.ops.recalc_face_normals(rays, faces=rays.faces)
    d = to_obj(disc, "disc", mat("gold", (0.98, 0.72, 0.18), 0.35))
    to_obj(rays, "rays", mat("gold2", (0.95, 0.6, 0.12), 0.4))
    sun(az=-30, el=40, strength=4.5)
    camera([Vector((-1.2, -0.2, -1.2)), Vector((1.2, 0.2, 1.2))], az=0, el=0, margin=1.04)
    return True


def blade(bm, base, direction, length, width, bend, seg=6):
    """Úzký zahnutý list trávy / osení: pásek od `base` ve směru `direction`, ohnutý dolů o `bend`."""
    d = Vector(direction).normalized()
    side = Vector((-d.y, d.x, 0)).normalized() if abs(d.z) < 0.999 else Vector((1, 0, 0))
    left, right = [], []
    for i in range(seg + 1):
        t = i / seg
        p = Vector(base) + d * (length * t) + Vector((0, 0, -bend * t * t))
        w = width * (1 - t) ** 0.7
        left.append(bm.verts.new(p + side * w))
        right.append(bm.verts.new(p - side * w))
    for i in range(seg):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))


def icon_ozim():
    """Ozim: hustý chomáč zeleného osení z tmavé hroudy, poprášené sněhem – přezimuje na poli."""
    rng = random.Random(5)
    clod, leaves, snow = bmesh.new(), bmesh.new(), bmesh.new()
    lumpy(clod, (0, 0, -0.16), (0.8, 0.62, 0.24), rng, 20, 10, amp=0.25)
    for k in range(30):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.0, 0.38) ** 0.8
        base = Vector((math.cos(a) * r, math.sin(a) * r * 0.8, 0.03))
        tilt = rng.uniform(0.15, 0.6)
        out = Vector((math.cos(a + rng.uniform(-0.5, 0.5)), math.sin(a + rng.uniform(-0.5, 0.5)), 0))
        blade(leaves, base, out * tilt + Vector((0, 0, 1)), rng.uniform(0.7, 1.1), 0.06,
              rng.uniform(0.1, 0.3))
    for k in range(6):
        a = k * 2 * math.pi / 6 + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.5, 0.7)
        lumpy(snow, (math.cos(a) * r, math.sin(a) * r * 0.72, 0.03),
              (rng.uniform(0.16, 0.26), rng.uniform(0.1, 0.16), 0.035), rng, 12, 6, amp=0.35)
    to_obj(clod, "clod", mat("soil", (0.28, 0.18, 0.11), 0.95, noise=30, bump=0.5))
    to_obj(leaves, "blades", mat("sprout", (0.2, 0.5, 0.13), 0.55, noise=20))
    to_obj(snow, "snow", mat("snow", (0.93, 0.96, 1.0), 0.45))
    sun(az=-45, el=48, strength=4.0)
    camera([Vector((-0.85, -0.7, -0.35)), Vector((0.85, 0.7, 1.05))], az=12, el=24, margin=1.02)
    return True


def icon_jar():
    """Jař: tři klasy jarního ječmene s dlouhými osinami, ještě nazelenalé – zaseto na jaře."""
    stems, ears, awns = bmesh.new(), bmesh.new(), bmesh.new()
    for i, (x, lean) in enumerate(((-0.3, -0.4), (0.0, 0.08), (0.3, 0.45))):
        base = Vector((x * 0.35, 0, -0.8))
        top = Vector((x + lean * 0.3, 0, 0.45 - abs(lean) * 0.2))
        cyl(stems, base, top, 0.04, 0.03, 6)
        # klas se sklání ve směru náklonu
        d = Vector((lean * 0.9 + (0.2 if i == 1 else 0.0), 0, 1.0 - abs(lean) * 0.5)).normalized()
        for k in range(7):
            c = top + d * (0.07 + 0.085 * k)
            side = 1 if k % 2 == 0 else -1
            off = Vector((d.z, 0, -d.x)) * 0.055 * side
            ax = d.to_track_quat("Z", "Y").to_euler()
            blob(ears, ((c + off)[:], tuple(ax)), (0.068, 0.068, 0.11), 8, 5)
            tip = c + off + d * 0.09
            cyl(awns, tip, tip + d * 0.6 + off * 2.4, 0.015, 0.0, 3)
    to_obj(stems, "stems", mat("stem", (0.5, 0.62, 0.24), 0.7))
    to_obj(ears, "ears", mat("ear", (0.62, 0.72, 0.28), 0.55, noise=25))
    to_obj(awns, "awns", mat("awn", (0.74, 0.76, 0.36), 0.6))
    sun(az=-40, el=46, strength=4.2)
    camera([Vector((-0.8, -0.2, -0.8)), Vector((0.8, 0.2, 1.2))], az=0, el=10, margin=1.0)
    return True


def apple(bm, centre, r, tilt=(0, 0, 0)):
    """Jablko: koule rozšířená nahoře, s důlky u stopky a u kalichu; vrací vrchol důlku (stopka)."""
    sp = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=18, radius=1.0)
    rot = Euler(tilt).to_matrix()
    for v in sp["verts"]:
        x, y, z = v.co
        rho2 = x * x + y * y
        z -= (0.3 if z > 0 else 0.16) * math.copysign(1, z) * math.exp(-rho2 / 0.07)
        k = 1 + 0.08 * z
        v.co = Vector(centre) + rot @ (Vector((x * k, y * k, z * 0.9)) * r)
    return Vector(centre) + rot @ (Vector((0, 0, 0.62)) * r), rot


def apple_skin():
    """Slupka: sytě červená se žlutozelenými místy a jemnými podélnými proužky."""
    m = mat("apple", (0.7, 0.05, 0.03), 0.42)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    patch = nt.nodes.new("ShaderNodeTexNoise")
    patch.inputs["Scale"].default_value = 1.6
    patch.inputs["Detail"].default_value = 3
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.55
    ramp.inputs["From Max"].default_value = 0.7
    streak = nt.nodes.new("ShaderNodeTexNoise")  # proužky = šum natažený podél osy jablka
    streak.inputs["Scale"].default_value = 9
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 1.0, 0.15)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.66, 0.04, 0.03, 1)
    mix.inputs[7].default_value = (0.86, 0.55, 0.12, 1)
    dark = nt.nodes.new("ShaderNodeMix")
    dark.data_type, dark.blend_type = "RGBA", "MULTIPLY"
    dark.inputs["Factor"].default_value = 0.35
    nt.links.new(tc.outputs["Object"], patch.inputs["Vector"])
    nt.links.new(patch.outputs["Fac"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], streak.inputs["Vector"])
    nt.links.new(mix.outputs[2], dark.inputs[6])
    nt.links.new(streak.outputs["Fac"], dark.inputs[7])
    nt.links.new(dark.outputs[2], b.inputs["Base Color"])
    return m


def icon_apples():
    """Tři červená jablka se stopkou, jedno s lístkem."""
    skin, stems, leaf = bmesh.new(), bmesh.new(), bmesh.new()
    for (c, r, tilt) in (((-0.52, 0.0, 0.0), 0.5, (0.15, -0.25, 0)), ((0.5, -0.05, 0.0), 0.48, (-0.1, 0.3, 0)),
                         ((0.0, 0.45, 0.6), 0.47, (0.35, 0.05, 0))):
        tip, rot = apple(skin, c, r, tilt)
        cyl(stems, tip, tip + rot @ Vector((0.05, 0, 0.32)) * r * 1.6, 0.035, 0.025, 6)
    # lístek u stopky horního jablka, natočený ke kameře a šikmo vzhůru
    blob(leaf, ((tip + Vector((0.21, -0.03, 0.12)))[:], (1.1, -0.5, 0)), (0.27, 0.11, 0.025), 14, 6)
    to_obj(skin, "apples", apple_skin())
    to_obj(stems, "stems", mat("stem", (0.33, 0.22, 0.12), 0.8))
    to_obj(leaf, "leaf", mat("leaf", (0.22, 0.45, 0.12), 0.6))
    sun(az=-45, el=50, strength=4.0)
    camera([Vector((-1.1, -0.6, -0.5)), Vector((1.1, 1.0, 1.3))], az=0, el=22, margin=1.06)
    return True


# --------------------------------------------------------------- hlavní ----

BUILD = {
    "zemnice": lambda: icon_dwelling("zemnice"),
    "polozemnice": lambda: icon_dwelling("polozemnice"),
    "pole": icon_pole,
    "hrbitov": icon_hrbitov,
    "hrncir": lambda: icon_craft("hrncir"),
    "kovar": lambda: icon_craft("kovar"),
    "uhlir": lambda: icon_craft("uhlir"),
    "sad": icon_sad,
}
RESOURCES = {
    "food": icon_food,
    "wood": icon_wood,
    "labor": icon_labor,
    "satiation": icon_satiation,
    "date": icon_date,
    "apples": icon_apples,
    "ozim": icon_ozim,
    "jar": icon_jar,
}


def backdrop(src, dst, size):
    """Tmavě hnědé pozadí s vinětou a zaoblenými rohy (jako portréty 0 A.D.) + scéna přes ně."""
    r = max(6, size // 12)
    sh = f"{size}x{size}"
    mask = f"roundrectangle 0,0 {size - 1},{size - 1} {r},{r}"
    subprocess.run(
        ["magick", "-size", sh, "radial-gradient:#5b4c3b-#1c1712", "(", "-size", sh, "xc:none", "-fill", "white",
         "-draw", mask, ")", "-alpha", "off", "-compose", "CopyOpacity", "-composite", "PNG32:" + dst + ".bg.png"],
        check=True)
    subprocess.run(
        ["magick", dst + ".bg.png", "(", src, "-filter", "Lanczos", "-resize", sh, ")", "-compose", "over",
         "-composite", "(", "-size", sh, "xc:none", "-fill", "none", "-stroke", "#0d0a07", "-strokewidth", "2",
         "-draw", mask, ")", "-composite", "PNG32:" + dst],
        check=True)
    os.remove(dst + ".bg.png")


def small(src, dst, size):
    subprocess.run(["magick", src, "-trim", "+repage", "-filter", "Lanczos", "-resize", f"{size - 6}x{size - 6}",
                    "-background", "none", "-gravity", "center", "-extent", f"{size}x{size}", "PNG32:" + dst], check=True)


def want(k):
    return ONLY is None or k in ONLY


os.makedirs(f"{OUT}/build", exist_ok=True)
os.makedirs(f"{OUT}/resources", exist_ok=True)
random.seed(1)
for key, fn in BUILD.items():
    if not want(key):
        continue
    reset()
    fn()
    raw = f"{TMP}/{key}.png"
    render(raw)
    backdrop(raw, f"{OUT}/build/{key}.png", 128)
    print("hotovo", key)
for key, fn in RESOURCES.items():
    if not want(key):
        continue
    reset()
    fn()
    raw = f"{TMP}/{key}.png"
    render(raw)
    small(raw, f"{OUT}/resources/{key}.png", 64)
    print("hotovo", key)
if want("people"):
    pop = f"{TMP}/population.png"
    urllib.request.urlretrieve(POP_URL, pop)
    subprocess.run(["magick", pop, "PNG32:" + f"{OUT}/resources/people.png"], check=True)
    print("hotovo people")
