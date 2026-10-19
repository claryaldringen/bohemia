"""Ikony pro rozhraní Bohemie ve stylu 0 A.D. – portréty staveb a ikony surovin.

Celé jedním příkazem z kořene repa (Blender 5, ImageMagick `magick`, internet jen pro ikony 0 A.D.):

    blender -b --factory-startup --python tools/blender/icons.py -- apps/web/public/icons [jen,vybrané,ikony]

Výstup (128 × 128 PNG, průhledné rohy) – `build/` zemnice, polozemnice, dvorec (dvorec vojvody –
trade.md), pole, hrbitov,
hrncir, kovar, uhlir (řemeslné dílny z `apps/web/public/models/crafts/`, uhlíř s milířem), sad
(jabloňový sad), modla, svatyne (posvátná místa z `apps/web/public/models/sacred/`), dub
(posvátný dub s obětinami), sous (posvátná souš – uschlý dub z `apps/web/public/models/decor/`
s obětinami), haj (dubový háj s kameny) a ohrada (přístřešek, žlab a branka
z `apps/web/public/models/pen/`, kráva ze stáda vsi, stoh sena), cesta, cesta-upravena a hat
(stupně pevné cesty – pás cesty, upravená širší, hať a lávka z `apps/web/public/models/roads/`)
a jablone (jabloně s jablky střídavě podél cesty – tlačítko „Vysadit jabloně“), stezka (zemská
stezka od brány dvorce – trade.md) a obchod (pytle obilí, hrnce, klády a sýr) – portréty do
panelu výběru;
(64 × 64 PNG) – `resources/` people, food, wood, labor, satiation, date, apples, happiness
(štěstí – plamen ohniště nad zkříženými poleny v kruhu kamenů), hay (seno – kupka sena
z `apps/web/public/models/fields/haystack.glb`), meat (maso – uzená kýta s kostí a provázkem),
cheese (mléko a sýr – bochník sýra s vykrojeným klínem a hrouda tvarohu), eggs (vejce v hnízdě
ze slámy), legumes (luštěniny – hromádka suchého hrachu a čočky, otevřený lusk s hrášky),
hourglass (přesýpací hodiny – kolik zbývá: služba spřežení, výcvik),
ozim (osení pod sněhem), jar (klasy jarního ječmene), charcoal (hromádka dřevěného uhlí), tools
(kovaná sekera zkřížená se srpem) a pottery (dva hrnce pražského typu, větší s vlnovkou) –
suroviny řemesel (crafts.md) –, overgrowth (zarůstání – keře a mladá bříza z modelů krajiny
`apps/web/public/models/decor/` a `trees/`, fields.md – Zarůstání), condition (stav stavby –
zšedlý rozštípnutý kůl s prasklinou a mechem) a abandoned (opuštěná stavba – padlý kůl
v kopřivách z `apps/web/public/models/dwellings/decay.glb`, abandonment.md) a zvířata stád do panelu
ohrady – sheep, goat, pig, cow, chicken
(modely `apps/web/public/models/fauna/`) a ox (vůl ze spřežení `apps/web/public/models/plough/ox.glb`)
a rodiny do panelu obydlí (kinship.md) – man, woman, child (chlapec a dívka), elder (starší s holí
a šedinami; vesničané z `apps/web/public/models/people/`) a ring (bronzový prsten – manželské
páry) a family (muž, žena a dítě – výměna lidí se sousedem, trade.md).
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
from mathutils import Euler, Matrix, Vector, noise

args = sys.argv[sys.argv.index("--") + 1 :]
OUT = os.path.abspath(args[0])
ONLY = set(args[1].split(",")) if len(args) > 1 and args[1] else None
ROOT = os.getcwd()
MODELS = os.path.join(ROOT, "apps/web/public/models/dwellings")
CRAFTS = os.path.join(ROOT, "apps/web/public/models/crafts")
SACRED = os.path.join(ROOT, "apps/web/public/models/sacred")
TREES = os.path.join(ROOT, "apps/web/public/models/trees")
DECOR = os.path.join(ROOT, "apps/web/public/models/decor")
PEN = os.path.join(ROOT, "apps/web/public/models/pen")
PLOUGH = os.path.join(ROOT, "apps/web/public/models/plough")
FAUNA = os.path.join(ROOT, "apps/web/public/models/fauna")
FIELDS = os.path.join(ROOT, "apps/web/public/models/fields")
PEOPLE = os.path.join(ROOT, "apps/web/public/models/people")
ROADS = os.path.join(ROOT, "apps/web/public/models/roads")
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


def icon_modla():
    """Dřevěná modla (tools/blender/sacred.py) zepředu a trochu shora – tváře, čepice, obětiny."""
    objs = place_model("idol", folder=SACRED)
    ground(4.2, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.3, tint=(0.8, 0.74, 0.6)), z=-0.01, fade=0.6)
    sun(az=-25, el=36, strength=4.6)
    camera([Vector((-1.0, -1.1, 0.0)), Vector((1.0, 0.4, 0.0)), Vector((0, 0, 2.95))], az=14, el=18, margin=1.0, shift=(0, 0.0))


def icon_svatyne():
    """Svatyně podle Perynu shora – osm výběžků příkopu s ohništi, modla uprostřed."""
    objs = place_model("shrine", folder=SACRED)
    ground(22, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.08, tint=(0.8, 0.74, 0.6)), z=-0.01, fade=0.7)
    sun(az=-50, el=50)
    camera([Vector((-15, -15, 0)), Vector((15, 15, 0)), Vector((15, -15, 0)), Vector((-15, 15, 0)), Vector((0, 0, 4.5))], az=20, el=56, margin=0.92)


def oak_tree(name, loc=(0, 0, 0), rot=0.0, scale=1.0):
    objs = place_model(name, folder=TREES)
    for o in objs:
        o.location = Vector(loc)
        o.rotation_euler = (0, 0, rot)
        o.scale = (scale, scale, scale)
    return objs


def icon_dub():
    """Posvátný dub: kmen a spodní větve velkého dubu, u paty kruh kamenů, stužky na pahýlu."""
    objs = oak_tree("oak-large-1", rot=0.4) + place_model("oak-offerings", folder=SACRED)
    ground(16, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.12, tint=(0.8, 0.85, 0.65)), z=0.0, fade=0.65)
    sun(az=-50, el=46)
    camera([Vector((-4.0, -3.0, 0)), Vector((4.0, 2.5, 0)), Vector((0, 0, 8.5))], az=24, el=16, margin=1.0)


def icon_sous():
    """Posvátná souš: uschlý dub (souš dubu z dekorací 0 A.D.), u paty obětiny jako u dubu."""
    objs = place_model("snag-oak", folder=DECOR) + place_model("oak-offerings", folder=SACRED)
    for o in objs[:1]:
        o.rotation_euler = (0, 0, 0.9)
    ground(16, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.12, tint=(0.8, 0.85, 0.65)), z=0.0, fade=0.65)
    sun(az=-50, el=46)
    camera([Vector((-4.0, -3.0, 0)), Vector((4.0, 2.5, 0)), Vector((0, 0, 9.5))], az=24, el=16, margin=1.0)


def icon_haj():
    """Dubový háj: několik dubů pohromadě, na okraji kamenný oltář a hraniční kameny."""
    objs = []
    for (x, y, v, r) in ((-6, 3, 1, 0.3), (-1, 8, 2, 1.6), (5, 5, 3, 2.9), (7, -1, 1, 4.1), (0, 1, 2, 5.3), (-7, 9, 3, 0.9)):
        objs += oak_tree(f"oak-large-{v}", (x, y, 0), r, 0.75)
    stones = place_model("grove-stones", folder=SACRED)
    spots = {"altar": (0.5, -5.5, 0.2), "stone-a": (-4.2, -5.0, 0.4), "stone-b": (4.2, -5.8, 1.0)}
    for o in stones:
        x, y, r = spots.get(o.name.split(".")[0], (0, -6, 0))
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, r)
        o.scale = (2.2, 2.2, 2.2)
    ground(20, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.1, tint=(0.8, 0.85, 0.65)), z=0.0, fade=0.7)
    sun(az=-50, el=46)
    camera([Vector((-10, -8, 0)), Vector((10, 10, 0)), Vector((0, 0, 15))], az=18, el=26, margin=0.96)


def place_root(objs, loc, rot=0.0, scale=1.0):
    """Posune importovaný model za kořen (u modelu s kostrou je to armatura, ne mesh)."""
    roots = set()
    for o in objs:
        while o.parent is not None:
            o = o.parent
        roots.add(o)
    for o in roots:
        o.location = Vector(loc)
        o.rotation_mode = "XYZ"
        o.rotation_euler = (0, 0, rot)
        o.scale = (scale, scale, scale)


def tint_imported(objs, rgb):
    """Barevný tón importovaného materiálu (Base Color × rgb) – seno jako ve scéně (HAY_TINT)."""
    for o in objs:
        for m in o.data.materials:
            nt = m.node_tree
            b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            link = next((l for l in nt.links if l.to_socket == b.inputs["Base Color"]), None)
            if link is None:
                continue
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
            mx.inputs["Factor"].default_value = 1.0
            mx.inputs[7].default_value = (*rgb, 1)
            nt.links.new(link.from_socket, mx.inputs[6])
            nt.links.new(mx.outputs[2], b.inputs["Base Color"])


def rounded_path(x0, y0, x1, y1, r, step):
    """Body po obvodu obdélníku se zakulacenými rohy (proti směru hodinových ručiček)."""
    corners = [(x1 - r, y0 + r, -math.pi / 2), (x1 - r, y1 - r, 0.0), (x0 + r, y1 - r, math.pi / 2), (x0 + r, y0 + r, math.pi)]
    pts = []
    for k, (cx, cy, a0) in enumerate(corners):
        n = max(2, round(r * math.pi / 2 / step))
        pts += [(cx + r * math.cos(a0 + math.pi / 2 * i / n), cy + r * math.sin(a0 + math.pi / 2 * i / n)) for i in range(n + 1)]
        nx, ny, _ = corners[(k + 1) % 4]
        ex, ey = cx + r * math.cos(a0 + math.pi / 2), cy + r * math.sin(a0 + math.pi / 2)
        sx, sy = nx + r * math.cos(corners[(k + 1) % 4][2]), ny + r * math.sin(corners[(k + 1) % 4][2])
        L = math.hypot(sx - ex, sy - ey)
        m = max(1, round(L / step))
        pts += [(ex + (sx - ex) * i / m, ey + (sy - ey) * i / m) for i in range(1, m)]
    return pts


def icon_ohrada():
    """Ohrada: pletený plot se zakulacenými rohy a brankou ze žerdí, v zadním rohu přístřešek
    s doškovou střechou a jeslemi, u žlabu kráva, stoh sena; uvnitř ušlapaná zem."""
    parts = {o.name.split(".")[0]: o for o in place_model("pen", folder=PEN)}
    place_root([parts["shelter"]], (-1.0, 1.55, 0))
    place_root([parts["hay-rack"]], (-1.8, 2.73, 0))
    place_root([parts["trough"]], (2.7, 0.4, 0), rot=math.pi / 2)
    place_root([parts["gate"]], (0.4, -3.3, 0))
    # kráva ze stáda vsi (model bez kostry) – v malé ikoně čitelnější než vůl s kostrou
    cow = place_model("cow", folder=FAUNA)
    place_root(cow, (1.2, 0.5, 0), rot=math.pi / 2, scale=1.25)
    for o in cow:  # model je vystředěný – postavit nohama na zem
        low = min((o.matrix_world @ Vector(c)).z for c in o.bound_box)
        o.location.z -= low
    hay = place_model("haystack", folder=FIELDS)
    place_root(hay, (2.3, 2.85, 0), scale=0.38)
    tint_imported(hay, (0.95, 0.82, 0.52))
    ground(8.0, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.22, tint=(0.8, 0.78, 0.6)), z=0.0, fade=0.62)
    # ušlapaná zem uvnitř ohrady
    bm = bmesh.new()
    path = rounded_path(-3.75, -3.15, 3.75, 3.75, 0.9, 0.3)
    bm.faces.new([bm.verts.new((x, y, 0.01)) for x, y in path])
    to_obj(bm, "mud", mat("mud", tex=f"{TEX}/mud.jpg", scale=0.35, tint=(1.0, 0.85, 0.68)), smooth=False)
    # pletený plot: kůly a vodorovně proplétané větve, v přední straně mezera branky
    posts, rods = bmesh.new(), bmesh.new()
    path = rounded_path(-3.9, -3.3, 3.9, 3.9, 1.0, 0.25)

    def gap(x, y):
        return abs(y + 3.3) < 0.05 and abs(x - 0.4) < 0.8

    for i, (x, y) in enumerate(path):
        if i % 2 == 0 and not gap(x, y):
            gate_post = abs(y + 3.3) < 0.05 and abs(abs(x - 0.4) - 0.85) < 0.2
            cyl(posts, (x, y, -0.05), (x, y, 1.22 if gate_post else 1.02), 0.065, 0.05, 6)
    for lv in range(8):
        z = 0.14 + lv * 0.11
        run = []
        for i, (x, y) in enumerate(path + path[:1]):
            if gap(x, y):
                for a, b in zip(run, run[1:]):
                    cyl(rods, a, b, 0.035, 0.035, 5)
                run = []
                continue
            j = (i + 1) % len(path)
            dx, dy = path[j][0] - x, path[j][1] - y
            ln = math.hypot(dx, dy) or 1
            off = 0.055 * math.sin((i / 2.0) * math.pi + (lv % 2) * math.pi)
            run.append((x - dy / ln * off, y + dx / ln * off, z))
        for a, b in zip(run, run[1:]):
            cyl(rods, a, b, 0.035, 0.035, 5)
    to_obj(posts, "posts", mat("wood", (0.42, 0.29, 0.17), 0.9, noise=25, bump=0.3))
    to_obj(rods, "rods", mat("wicker", (0.5, 0.36, 0.2), 0.9, noise=60, bump=0.5))
    sun(az=-55, el=44)
    pts = [Vector((-4.0, -3.4, 0)), Vector((4.0, 4.0, 0)), Vector((-4.0, 4.0, 0)), Vector((4.0, -3.4, 0))]
    camera(pts + [Vector((-1.0, -0.2, 2.9))], az=20, el=40, margin=1.05, shift=(0, 0.01))


# --------------------------------------------------------------- suroviny ----


def road_strip(width, length, material, z=0.004, wobble=0.12, seed=3):
    """Pás cesty přes portrét (podél Y) s lehce zvlněnými okraji."""
    rng = random.Random(seed)
    bm = bmesh.new()
    n = 24
    rows = []
    for i in range(n + 1):
        y = -length / 2 + length * i / n
        dx = math.sin(y * 0.6) * 0.25
        row = []
        for side in (-1, 1):
            x = dx + side * (width / 2 + rng.uniform(-wobble, wobble))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
    return to_obj(bm, "road", material, smooth=False)


def icon_road(grade):
    """Portrét stupně pevné cesty (roads.md): vyšlapaná, upravená (jen širší – Martin, 19. 10. 2026),
    hať a lávka."""
    rng = random.Random(11)
    gr = ground(6.4, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.25, tint=(0.8, 0.82, 0.6)), z=-0.02, fade=0.72)
    earth = mat("earth", tex=f"{TEX}/mud.jpg", scale=0.5, tint=(0.82, 0.66, 0.48))
    # upravená cesta je o 60 % širší než vyšlapaná (ROAD_WIDTH_M ve scéně)
    width = 1.6 if grade == "cesta" else 2.56
    road_strip(width, 12.0, earth)
    if grade == "hat":
        # hať přes mokřinu vpředu a lávka přes potok vzadu
        water = mat("water", (0.22, 0.32, 0.36), 0.15)
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=1.0)
        for v in bm.verts:
            v.co = (v.co.x * 6.5, 2.6 + v.co.y * 1.0, -0.12)
        to_obj(bm, "water", water, smooth=False)
        # kmeny hatě na šířku upravené cesty (model 2,6 m – jako LOG_SCALE ve scéně)
        log_scale = width / 2.6
        for k in range(14):
            objs = place_model("road-log", folder=ROADS)
            y = -3.6 + k * 0.24 * log_scale
            place_root(objs, (math.sin(y * 0.6) * 0.25, y, 0.0), rng.uniform(-0.06, 0.06), log_scale)
        objs = place_model("road-bridge", folder=ROADS)
        place_root(objs, (math.sin(2.6 * 0.6) * 0.25, 2.6, -0.05), 0.0, 1.0)
    sun(az=-55, el=46)
    camera([Vector((-3.2, -4.6, 0)), Vector((3.2, 4.6, 1.4)), Vector((-3.2, 4.6, 0)), Vector((3.2, -4.6, 0))], az=24, el=42, margin=0.92)


def icon_jablone():
    """Jabloně podél cesty (roads.md – Vysazení jabloní): vyšlapaná cesta, jabloně s jablky střídavě po stranách."""
    rng = random.Random(17)
    ground(6.4, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.25, tint=(0.8, 0.82, 0.6)), z=-0.02, fade=0.72)
    road_strip(1.9, 12.0, mat("earth", tex=f"{TEX}/mud.jpg", scale=0.5, tint=(0.72, 0.56, 0.4)))
    trunk, leaves, apples = bmesh.new(), bmesh.new(), bmesh.new()
    for k in range(4):
        y = -3.9 + k * 2.6
        side = 1 if k % 2 == 0 else -1
        x = math.sin(y * 0.6) * 0.25 + side * 2.0
        apple_tree(trunk, leaves, apples, x, y, rng, rng.uniform(0.78, 0.86))
    objs = [
        to_obj(trunk, "trunks", mat("bark", (0.36, 0.26, 0.17), 0.9, noise=30, bump=0.4)),
        to_obj(leaves, "leaves", mat("leaves", (0.17, 0.34, 0.07), 0.8, noise=18, bump=0.8)),
        to_obj(apples, "apples", mat("apple", (0.75, 0.06, 0.03), 0.4)),
    ]
    sun(az=-55, el=46)
    camera(world_points(objs) + [Vector((-3.2, -4.6, 0)), Vector((3.2, 4.6, 0))], az=24, el=42, margin=0.95)


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


def flame(bm, base, height, radius, tilt=(0.0, 0.0), seg=14, rings=10):
    """Jazyk plamene: kapka zúžená nahoru do špičky, prohnutá podle tilt."""
    verts = []
    for j in range(rings + 1):
        t = j / rings
        r = radius * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.7 * (1 - t) ** 0.35 if j < rings else 0.0
        z = height * t
        off = Vector((tilt[0] * t * t, tilt[1] * t * t, 0)) * height
        ring = [bm.verts.new(Vector(base) + off + Vector((math.cos(2 * math.pi * i / seg) * r, math.sin(2 * math.pi * i / seg) * r, z))) for i in range(seg)]
        verts.append(ring)
    for a, b in zip(verts, verts[1:]):
        for i in range(seg):
            k = (i + 1) % seg
            bm.faces.new((a[i], a[k], b[k], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def glow_mat(name, color, strength):
    m = mat(name, color, 0.9)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    return m


def icon_happiness():
    """Štěstí: plamen ohniště nad zkříženými poleny v kruhu kamenů – teplo domova
    (snop je jídlo, slunce datum)."""
    logs, stones, outer, inner = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    for k in range(3):
        a = math.pi * k / 3 + 0.3
        d = Vector((math.cos(a), math.sin(a), 0))
        cyl(logs, (-d * 0.62 + Vector((0, 0, 0.1)))[:], (d * 0.62 + Vector((0, 0, 0.1 + 0.06 * k)))[:], 0.11, 0.1, 10)
    for k in range(9):
        a = 2 * math.pi * k / 9
        blob(stones, ((math.cos(a) * 0.82, math.sin(a) * 0.82, 0.06), (0, 0, a)), (0.17, 0.13, 0.12), 10, 6)
    flame(outer, (0, 0, 0.12), 1.15, 0.36)
    flame(outer, (0.18, 0.05, 0.1), 0.7, 0.2, tilt=(0.25, 0.05))
    flame(outer, (-0.17, -0.06, 0.1), 0.78, 0.21, tilt=(-0.22, -0.05))
    flame(inner, (0, -0.05, 0.12), 0.62, 0.2)
    to_obj(logs, "logs", mat("log", (0.24, 0.15, 0.08), 0.9, noise=26, bump=0.4))
    to_obj(stones, "stones", mat("stone", (0.42, 0.41, 0.38), 0.95, noise=18, bump=0.6))
    to_obj(outer, "flame", glow_mat("flame", (1.0, 0.36, 0.04), 2.2))
    to_obj(inner, "core", glow_mat("core", (1.0, 0.78, 0.25), 3.5))
    sun(az=-40, el=50, strength=3.5)
    camera([Vector((-1.0, -1.0, 0)), Vector((1.0, 1.0, 1.35))], az=0, el=20, margin=1.04)
    return True


def icon_hay():
    """Seno: kupka sena kolem tyče (model stohu z polí), sušší tón jako ve scéně."""
    hay = place_model("haystack", folder=FIELDS)
    tint_imported(hay, (1.08, 0.86, 0.42))
    sun(az=-50, el=46, strength=4.0)
    camera([Vector((-1.8, -1.8, 0)), Vector((1.8, 1.8, 3.3))], az=10, el=14, margin=1.04)
    return True


def icon_overgrowth():
    """Zarůstání přílohu: keře (trnka, šípek) a mladá bříza – modely krajiny, jako ve scéně."""
    objs = []
    for (name, folder, loc, rot, scale) in (
        ("birch-1", TREES, (0.3, 1.2, 0), 0.6, 0.42),
        ("shrub-3", DECOR, (-1.3, -0.6, 0), 1.2, 0.9),
        ("shrub-5", DECOR, (1.2, -0.9, 0), 2.6, 0.75),
    ):
        for o in place_model(name, folder=folder):
            o.location = Vector(loc)
            o.rotation_euler = (0, 0, rot)
            o.scale = (scale, scale, scale)
            objs.append(o)
    bpy.context.view_layer.update()
    sun(az=-50, el=46, strength=4.0)
    camera(world_points(objs), az=20, el=14, margin=1.04)
    return True


def icon_condition():
    """Stav stavby (abandonment.md – panel výběru): zšedlý tesaný kůl rozštípnutý nahoře,
    s prasklinou a mechem u paty."""
    wood, crack, moss = bmesh.new(), bmesh.new(), bmesh.new()
    cyl(wood, (0, 0, -0.1), (0.02, 0, 1.45), 0.24, 0.22, seg=6)
    cyl(wood, (0.08, 0.0, 1.4), (0.13, 0.02, 1.86), 0.11, 0.05, seg=5)
    cyl(wood, (-0.08, 0.0, 1.4), (-0.14, -0.02, 1.68), 0.1, 0.05, seg=5)
    # prasklina – tmavý zub po přední straně od rozštípnutého vršku dolů
    for (z0, x0), (z1, x1) in zip([(1.5, 0.0), (1.1, 0.05), (0.75, -0.02), (0.45, 0.03)], [(1.1, 0.05), (0.75, -0.02), (0.45, 0.03), (0.3, 0.0)]):
        cyl(crack, (x0, -0.232, z0), (x1, -0.232, z1), 0.028, 0.022, seg=4)
    rng = random.Random(5)
    for i in range(7):
        a = rng.uniform(0, 6.28)
        blob(moss, ((math.cos(a) * 0.24, math.sin(a) * 0.24, rng.uniform(0.0, 0.25)), (0, 0, a)), (0.16, 0.1, 0.1), 8, 5)
    blob(moss, ((0.05, -0.05, 1.42), (0, 0, 0.4)), (0.14, 0.12, 0.05), 8, 5)
    to_obj(wood, "post", mat("post", (0.46, 0.43, 0.38), 0.95, noise=18, bump=0.5), smooth=False)
    to_obj(crack, "crack", mat("crack", (0.08, 0.06, 0.05), 1.0), smooth=False)
    to_obj(moss, "moss", mat("moss", (0.26, 0.4, 0.12), 1.0, noise=30))
    sun(az=-45, el=40, strength=4.2)
    camera([Vector((-0.4, -0.4, -0.1)), Vector((0.4, 0.4, 1.9))], az=20, el=12, margin=1.04)
    return True


def icon_abandoned():
    """Opuštěno (abandonment.md – panel výběru): zšedlý padlý kůl zarůstající kopřivami
    a trávou – kopřivy z modelu rozpadu obydlí (models/dwellings/decay.glb)."""
    log, grass = bmesh.new(), bmesh.new()
    cyl(log, (-0.9, 0.1, 0.16), (0.85, -0.15, 0.13), 0.17, 0.15, seg=8)
    rng = random.Random(11)
    for i in range(26):
        x, y = rng.uniform(-1.0, 1.0), rng.uniform(-0.5, 0.45)
        h = rng.uniform(0.25, 0.55)
        cyl(grass, (x, y, 0), (x + rng.uniform(-0.12, 0.12), y + rng.uniform(-0.1, 0.1), h), 0.025, 0.0, seg=3)
    to_obj(log, "log", mat("log", (0.44, 0.42, 0.37), 0.95, noise=18, bump=0.5), smooth=False)
    to_obj(grass, "grass", mat("grass", (0.3, 0.46, 0.16), 1.0, noise=22), smooth=False)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{MODELS}/decay.glb")
    nettles = []
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.type == "MESH" and o.name.startswith("nettle"):
            nettles.append(o)
        elif o.type == "MESH":
            bpy.data.objects.remove(o)
    for k, (x, y, sc, rot) in enumerate(((0.45, 0.2, 1.25, 0.3), (-0.55, -0.15, 1.0, 1.7))):
        o = nettles[0] if k == 0 else nettles[0].copy()
        if k:
            bpy.context.collection.objects.link(o)
        o.location = (x, y, 0)
        o.scale = (sc, sc, sc)
        o.rotation_euler = (0, 0, rot)
    sun(az=-45, el=42, strength=4.2)
    camera([Vector((-1.0, -0.6, 0)), Vector((1.0, 0.6, 1.0))], az=15, el=22, margin=1.0)
    return True


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


def spin(bm, angle):
    """Otočí všechny vrcholy kolem svislé osy Z o `angle` (rad)."""
    rot = Euler((0, 0, angle)).to_matrix()
    for v in bm.verts:
        v.co = rot @ v.co


def icon_meat():
    """Maso: uzená kýta s kostí převázaná provázkem, seříznutý konec ukazuje maso a sádlo."""
    ham, bone, fat, cut, cord = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    flat = -0.78  # seříznutý tlustý konec (podíl délky)
    sp = bmesh.ops.create_uvsphere(ham, u_segments=40, v_segments=24, radius=1.0)
    for v in sp["verts"]:
        x, y, z = v.co
        t = min(1.0, max(0.0, (x + 1) / 2))  # 0 tlustý konec, 1 u kosti
        taper = 1 - 0.62 * t ** 1.6
        v.co = Vector((max(x, flat) * 0.95, y * 0.58 * taper, z * 0.52 * taper))
    # řez: sádlo po obvodu, uvnitř maso – elipsy těsně před seříznutým koncem
    edge = math.sqrt(1 - flat * flat) * (1 - 0.62 * ((flat + 1) / 2) ** 1.6)
    for bm, depth, k in ((fat, 0.006, 1.0), (cut, 0.012, 0.8)):
        ring = []
        for i in range(40):
            a = 2 * math.pi * i / 40
            ring.append(bm.verts.new(Vector((flat * 0.95 - depth, math.cos(a) * 0.58 * edge * k, math.sin(a) * 0.52 * edge * k))))
        bm.faces.new(ring[::-1])
    # kost z užšího konce s kloubem
    cyl(bone, (0.78, 0, 0), (1.42, 0, 0.07), 0.095, 0.085, 14)
    for dy in (-0.075, 0.075):
        blob(bone, ((1.46, dy, 0.075), (0, 0, 0)), (0.11, 0.1, 0.1), 12, 8)
    # provázek kolem kýty a smyčka na zavěšení do udírny
    rx, rz = 0.58 * 0.73 * 1.04, 0.52 * 0.73 * 1.04
    segs = 28
    for i in range(segs):
        a0, a1 = 2 * math.pi * i / segs, 2 * math.pi * (i + 1) / segs
        cyl(cord, (0.25, math.cos(a0) * rx, math.sin(a0) * rz), (0.25, math.cos(a1) * rx, math.sin(a1) * rz), 0.025, 0.025, 6)
    loop = [(0.25, 0.0, rz)] + [(0.25 + 0.16 * math.sin(math.pi * k / 8), 0.0, rz + 0.42 * math.sin(math.pi * k / 16)) for k in range(1, 17)]
    for p0, p1 in zip(loop, loop[1:]):
        cyl(cord, p0, p1, 0.022, 0.022, 6)
    objs = []
    for bm, name, material in (
        (ham, "ham", mat("smoked", (0.3, 0.1, 0.045), 0.5, noise=14, bump=0.5)),
        (fat, "fat", mat("fat", (0.92, 0.84, 0.72), 0.6)),
        (cut, "cut", mat("meat", (0.72, 0.24, 0.2), 0.45, noise=22)),
        (bone, "bone", mat("bone", (0.88, 0.84, 0.74), 0.55)),
        (cord, "cord", mat("cord", (0.45, 0.3, 0.16), 0.9)),
    ):
        spin(bm, math.radians(40))  # seříznutý konec ke kameře
        objs.append(to_obj(bm, name, material, smooth=name != "fat" and name != "cut"))
    sun(az=-45, el=50, strength=4.0)
    camera(world_points(objs), az=0, el=24, margin=1.06)
    return True


def sector(bm, r, h, a0, a1, segs=40, bevel=0.06):
    """Výseč válce (bochník sýra s vykrojeným klínem): poloměr r, výška h, úhly a0–a1 (rad).
    Horní a spodní hrana pláště je trochu sražená – kůrka bochníku není ostrá. Vrací rohy řezů
    (střed dole, střed nahoře, okraj a0 dole, nahoře, okraj a1 dole, nahoře)."""
    rings = []
    for z, rr in ((0.0, r - bevel), (bevel, r), (h - bevel, r), (h, r - bevel)):
        ring = []
        for i in range(segs + 1):
            a = a0 + (a1 - a0) * i / segs
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
    c0, c1 = bm.verts.new((0, 0, 0)), bm.verts.new((0, 0, h))
    for i in range(segs):
        bm.faces.new((c0, rings[0][i + 1], rings[0][i]))
        bm.faces.new((c1, rings[3][i], rings[3][i + 1]))
    # řezy: od osy k plášti na obou koncích výseče
    for end in (0, segs):
        side = [c0] + [ring[end] for ring in rings] + [c1]
        bm.faces.new(side if end == segs else side[::-1])
    return rings


def icon_cheese():
    """Mléko a sýr: bochník sýra s vykrojeným klínem, klín vedle a hrouda tvarohu na prkénku."""
    rng = random.Random(31)
    wheel, wedge, curd, board = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    cut = math.radians(52)
    sector(wheel, 0.82, 0.42, cut / 2, 2 * math.pi - cut / 2)
    sector(wedge, 0.8, 0.4, -cut / 2, cut / 2, segs=10)
    bmesh.ops.rotate(wedge, verts=wedge.verts, cent=(0, 0, 0), matrix=Euler((0, 0, math.radians(18))).to_matrix())
    bmesh.ops.translate(wedge, verts=wedge.verts, vec=(0.42, -0.62, 0.05))
    lumpy(curd, (-0.62, -0.62, 0.2), (0.34, 0.3, 0.2), rng, seg=20, rings=12, amp=0.22)
    cyl(board, (0, -0.2, -0.06), (0, -0.2, 0.0), 1.32, 1.32, 48)
    for bm in (wheel, wedge):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rind = mat("rind", (0.78, 0.55, 0.22), 0.55, noise=18, bump=0.3)
    paste = mat("paste", (0.95, 0.86, 0.6), 0.6, noise=30, bump=0.15)
    objs = [
        to_obj(wheel, "wheel", rind, smooth=False),
        to_obj(wedge, "wedge", paste, smooth=False),
        to_obj(curd, "curd", mat("curd", (0.97, 0.96, 0.9), 0.75, noise=40, bump=0.4)),
        to_obj(board, "board", mat("board", (0.5, 0.33, 0.18), 0.8, noise=12, bump=0.2), smooth=False),
    ]
    # řez bochníku světlejší (sýrové těsto) – druhý materiál na plochách řezu (normála ve vodorovné
    # rovině, ne na plášti)
    me = objs[0].data
    me.materials.append(paste)
    for poly in me.polygons:
        n, c = poly.normal, poly.center
        radial = Vector((c.x, c.y, 0))
        if abs(n.z) < 0.5 and radial.length > 1e-6 and abs(n.dot(radial.normalized())) < 0.3:
            poly.material_index = 1
    sun(az=-40, el=48, strength=4.2)
    camera(world_points(objs[:3]), az=0, el=30, margin=1.08)
    return True


def egg(bm, centre, r, tilt=(0, 0, 0)):
    """Vejce: koule protažená nahoru, horní konec užší."""
    sp = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1.0)
    m = Euler(tilt).to_matrix()
    for v in sp["verts"]:
        x, y, z = v.co
        k = 1 - 0.18 * max(0.0, z)
        v.co = Vector(centre) + m @ Vector((x * r * k, y * r * k, z * r * 1.3))


def icon_eggs():
    """Vejce: tři vejce v hnízdě ze slámy."""
    rng = random.Random(17)
    eggs, straw = bmesh.new(), bmesh.new()
    egg(eggs, (-0.28, 0.08, 0.36), 0.3, (0.2, -0.35, 0))
    egg(eggs, (0.3, 0.12, 0.36), 0.3, (-0.25, 0.3, 0))
    egg(eggs, (0.02, -0.32, 0.34), 0.3, (0.55, 0.1, 0))
    for i in range(140):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.55, 0.95)
        z = rng.uniform(0.02, 0.3) * (rr - 0.4)
        p0 = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
        d = Vector((-math.sin(a), math.cos(a), rng.uniform(-0.15, 0.25))) * rng.uniform(0.35, 0.6)
        cyl(straw, p0 - d / 2, p0 + d / 2, 0.018, 0.012, 5)
    objs = [
        to_obj(eggs, "eggs", mat("shell", (0.86, 0.72, 0.55), 0.5, noise=26, bump=0.1)),
        to_obj(straw, "straw", mat("straw", (0.82, 0.66, 0.32), 0.8, noise=20)),
    ]
    sun(az=-45, el=50, strength=4.2)
    camera(world_points(objs), az=0, el=34, margin=1.04)
    return True


def pea_pod(bm, centre, length, width, angle, open_pod, rng, peas=None):
    """Lusk hrachu: protáhlý, mírně prohnutý elipsoid se špičkou na obou koncích; otevřený
    lusk je jen spodní polovina (lodička) a hrášky v ní leží v řadě (`peas` – bmesh hrášků)."""
    sp = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=14, radius=1.0)
    rot = Euler((0, 0, angle)).to_matrix()
    drop = []
    for v in sp["verts"]:
        x, y, z = v.co
        if open_pod and z > 0.05:
            drop.append(v)
            continue
        taper = (1 - abs(x) ** 2.2) ** 0.5
        bend = 0.18 * (1 - x * x)  # lusk je prohnutý do oblouku
        v.co = Vector(centre) + rot @ Vector((x * length / 2, y * width * taper + bend * width, z * width * 0.8 * taper))
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
    if open_pod and peas is not None:
        n = 6
        for i in range(n):
            t = -0.68 + 1.36 * i / (n - 1)
            taper = (1 - abs(t) ** 2.2) ** 0.5
            r = width * 0.62 * taper
            p = Vector(centre) + rot @ Vector((t * length / 2, 0.18 * (1 - t * t) * width, r * 0.15))
            blob(peas, (p, (0, 0, rng.uniform(0, 3))), (r, r, r * 0.95), 14, 9)


def icon_legumes():
    """Luštěniny: hromádka suchého hrachu a čočky, před ní otevřený lusk s hrášky a zavřený lusk."""
    rng = random.Random(23)
    peas, lentils, pods, pod_peas = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    placed = []

    def free(p, r):
        return all((p - q).length >= (r + rq) * 0.92 for q, rq in placed)

    # hromádka – kužel: hrášky a čočka po povrchu kužele (vnitřek není vidět), bez překryvu
    R, H = 0.78, 0.62
    for _ in range(9000):
        if len(placed) > 150:
            break
        a = rng.uniform(0, 2 * math.pi)
        rr = R * math.sqrt(rng.random())
        z = H * (1 - rr / R) * rng.uniform(0.86, 1.0)
        lentil = 0.5 < a < 2.9 and rng.random() < 0.75  # čočka na zadní straně hromádky
        r = 0.095 if lentil else 0.11
        p = Vector((math.cos(a) * rr + 0.22, math.sin(a) * rr + 0.32, z + r * 0.6))
        if not free(p, r):
            continue
        placed.append((p, r))
        tilt = (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0, 3))
        if lentil:
            blob(lentils, (p, tilt), (r * 1.15, r * 1.15, r * 0.42), 16, 8)
        else:
            blob(peas, (p, tilt), (r, r * 0.96, r * 0.92), 14, 9)
    # jádro hromádky – mezi zrny není vidět skrz (tmavší jako stín mezi zrny)
    core = bmesh.new()
    cyl(core, (0.22, 0.32, 0.0), (0.22, 0.32, H * 0.97), R * 0.93, 0.04, 40)
    pea_pod(pods, (-0.3, -0.7, 0.12), 1.4, 0.24, math.radians(12), True, rng, pod_peas)
    pea_pod(pods, (0.62, -0.92, 0.1), 1.15, 0.2, math.radians(-28), False, rng)
    objs = [
        to_obj(peas, "peas", mat("dry_pea", (0.56, 0.54, 0.16), 0.5, noise=30, bump=0.15)),
        to_obj(lentils, "lentils", mat("lentil", (0.5, 0.22, 0.08), 0.45, noise=34, bump=0.1)),
        to_obj(pods, "pods", mat("pod", (0.24, 0.44, 0.08), 0.55, noise=16, bump=0.2)),
        to_obj(pod_peas, "pod_peas", mat("green_pea", (0.3, 0.54, 0.1), 0.4, noise=20)),
        to_obj(core, "core", mat("heap_core", (0.3, 0.26, 0.08), 0.9, noise=40), smooth=False),
    ]
    for o in objs[2:3]:
        # tenká stěna otevřeného lusku vidět z obou stran
        o.data.materials[0].use_backface_culling = False
    sun(az=-40, el=50, strength=3.6)
    camera(world_points(objs), az=0, el=34, margin=1.04)
    return True


def revolve(bm, profile, seg=40, cap_bottom=False, cap_top=False):
    """Rotační těleso kolem osy Z z profilu [(z, r), …] zdola nahoru; volitelně zavřené víčky."""
    rings = []
    for z, r in profile:
        rings.append([bm.verts.new((math.cos(2 * math.pi * i / seg) * r, math.sin(2 * math.pi * i / seg) * r, z))
                      for i in range(seg)])
    for lo, hi in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if cap_bottom:
        bm.faces.new(rings[0][::-1])
    if cap_top:
        bm.faces.new(rings[-1])


def glass_mat(name):
    """Sklo do ikony: uprostřed průhledné, k okrajům lesklé (vrstva podle úhlu) – obrys baňky
    je vidět a písek uvnitř taky."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.78, 0.88, 0.95, 1)
    b.inputs["Roughness"].default_value = 0.08
    outn = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = 0.6
    ramp.inputs["To Min"].default_value = 0.03
    ramp.inputs["To Max"].default_value = 0.8
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lw.outputs["Facing"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(b.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], outn.inputs["Surface"])
    return m


def icon_hourglass():
    """Přesýpací hodiny: dřevěný rám (dvě desky, tři sloupky), skleněné baňky, písek dole
    v kopečku, nahoře ubývá a tenký proud mezi nimi – čas, který zbývá."""
    H, NECK = 0.62, 0.045

    def bulb_r(t):
        # t = 0 u hrdla, 1 u desky: úzké hrdlo, baňka se rozšíří a k desce se zase zúží
        return NECK + 0.34 * math.sin(math.pi * 0.88 * t) ** 0.7

    steps = 24
    glass = bmesh.new()
    lower = [(-H + H * k / steps, bulb_r(1 - k / steps)) for k in range(steps + 1)]
    upper = [(H * k / steps, bulb_r(k / steps)) for k in range(1, steps + 1)]
    revolve(glass, lower + upper, seg=48)
    sand = bmesh.new()
    # dole kopeček písku: od dna po hladinu ve třetině baňky, nahoře špička
    base_z, top_z = -H + 0.02, -H + 0.34
    pile = []
    for k in range(13):
        z = base_z + (top_z - base_z) * k / 12
        t = 1 - (z + H) / H
        r = bulb_r(t) * 0.93
        if k == 12:
            r = 0.0
        else:
            r *= (1 - (k / 12) ** 2.2) ** 0.35
        pile.append((z, max(r, 0.0)))
    revolve(sand, pile, seg=40, cap_bottom=True)
    # nahoře zbytek písku: od hrdla po hladinu s mělkým důlkem
    upper_sand = []
    for k in range(10):
        z = 0.02 + 0.2 * k / 9
        upper_sand.append((z, bulb_r(z / H) * 0.9))
    revolve(sand, upper_sand + [(0.2, 0.06)], seg=40, cap_bottom=True, cap_top=True)
    cyl(sand, (0, 0, 0.03), (0, 0, top_z - 0.02), 0.011, 0.011, 8)
    frame = bmesh.new()
    cyl(frame, (0, 0, H), (0, 0, H + 0.11), 0.56, 0.56, 48)
    cyl(frame, (0, 0, -H - 0.11), (0, 0, -H), 0.56, 0.56, 48)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        p = (math.cos(a) * 0.46, math.sin(a) * 0.46)
        cyl(frame, (p[0], p[1], -H), (p[0], p[1], H), 0.045, 0.045, 12)
    objs = [
        to_obj(frame, "frame", mat("frame", (0.42, 0.25, 0.12), 0.55, noise=16, bump=0.12)),
        to_obj(sand, "sand", mat("sand", (0.88, 0.56, 0.22), 0.9, noise=60)),
        to_obj(glass, "glass", glass_mat("glass")),
    ]
    sun(az=-40, el=35, strength=4.5)
    camera(world_points(objs), az=20, el=14, margin=1.04)
    return True


def icon_animal(name, folder=FAUNA, tint=None, turn=-115):
    """Zvíře stáda (model z `models/fauna/`, vůl ze spřežení `models/plough/`) z boku ve 3/4:
    morph targety pózy (krok, pastva) vypnuté – stojí; pomocná koule v GLB vola pryč."""
    objs = []
    for o in place_model(name, folder=folder):
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            objs.append(o)
    # kořeny modelu (u vola armatura – place_model vrací jen meshe); klipy GLB by přepsaly
    # natočení kostry – zvíře jen stojí
    roots = set()
    for o in objs:
        while o.parent is not None:
            o = o.parent
        roots.add(o)
    meshes = [o for o in objs if o.type == "MESH"]
    for o in meshes + list(roots):
        o.animation_data_clear()
        if o.type == "ARMATURE":  # klidová póza kostry místo snímku chůze
            for bone in o.pose.bones:
                bone.matrix_basis = Matrix.Identity(4)
    for o in meshes:
        for key in (o.data.shape_keys.key_blocks if o.data.shape_keys else [])[1:]:
            key.value = 0.0
    spin_z = Matrix.Rotation(math.radians(turn), 4, "Z")
    for o in roots:
        o.matrix_world = spin_z @ o.matrix_world
    bpy.context.view_layer.update()
    low = min((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
    for o in roots:
        o.location.z -= low
    bpy.context.view_layer.update()
    if tint:
        tint_imported(meshes, tint)
    sun(az=-50, el=48, strength=4.0)
    camera(world_points(meshes), az=0, el=16, margin=1.06)
    return True


def charcoal_lump(bm, centre, size, rot, rng):
    """Kus dřevěného uhlí: hranolek s nepravidelnými lomy (rozštípnuté poleno po pálení)."""
    first = len(bm.verts)
    r = bmesh.ops.create_cube(bm, size=1.0)
    edges = list({e for v in r["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
    m = Euler(rot).to_matrix()
    bm.verts.ensure_lookup_table()
    # nové vrcholy jsou na konci (obal BMVert se pro set nehodí – vzniká znovu)
    for v in list(bm.verts)[first:]:
        j = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12)))
        local = Vector(((v.co.x + j.x) * size[0], (v.co.y + j.y) * size[1], (v.co.z + j.z) * size[2]))
        v.co = Vector(centre) + m @ local


def charcoal_mat():
    """Uhlí: skoro černé se stříbřitým leskem na lomech a jemnými příčnými trhlinami."""
    m = mat("charcoal", (0.035, 0.035, 0.04), 0.28, noise=40, bump=0.5)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Specular IOR Level"].default_value = 0.85
    # trhliny napříč vlákny – pruhy vlnové textury jako výška
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 7.0
    wave.inputs["Distortion"].default_value = 3.0
    wave.inputs["Detail"].default_value = 2.0
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    bn = nt.nodes.new("ShaderNodeBump")
    bn.inputs["Strength"].default_value = 0.35
    bn.inputs["Distance"].default_value = 0.02
    nt.links.new(wave.outputs["Fac"], bn.inputs["Height"])
    nt.links.new(bn.outputs["Normal"], b.inputs["Normal"])
    return m


def icon_charcoal():
    """Uhlí: hromádka kusů dřevěného uhlí – lesklé lomy čtou se i na tmavé liště."""
    rng = random.Random(23)
    bm = bmesh.new()
    lumps = [
        # spodní vrstva
        ((-0.46, 0.0, 0.13), (0.34, 0.24, 0.24)),
        ((-0.02, -0.2, 0.12), (0.36, 0.25, 0.22)),
        ((0.44, -0.04, 0.13), (0.32, 0.26, 0.24)),
        ((-0.2, 0.3, 0.12), (0.32, 0.24, 0.22)),
        ((0.26, 0.32, 0.12), (0.34, 0.24, 0.22)),
        # druhá vrstva
        ((-0.26, 0.02, 0.36), (0.32, 0.24, 0.22)),
        ((0.2, -0.02, 0.38), (0.34, 0.24, 0.24)),
        ((0.0, 0.28, 0.36), (0.3, 0.22, 0.22)),
        # třetí vrstva a vršek
        ((-0.08, 0.06, 0.6), (0.32, 0.24, 0.22)),
        ((0.22, 0.14, 0.58), (0.24, 0.2, 0.2)),
        ((0.04, 0.12, 0.82), (0.26, 0.2, 0.2)),
    ]
    for (c, s) in lumps:
        rot = (rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(0, math.pi))
        charcoal_lump(bm, c, s, rot, rng)
    o = to_obj(bm, "charcoal", charcoal_mat(), smooth=False)
    o.data.update()
    sun(az=-45, el=42, strength=4.0, color=(1.0, 0.9, 0.75))
    # protisvětlo zezadu – světlé hrany oddělí černé uhlí od tmavé lišty
    sun(az=150, el=25, strength=4.0, color=(0.8, 0.88, 1.0))
    camera([Vector((-0.7, -0.45, 0)), Vector((0.7, 0.5, 0.98))], az=0, el=24, margin=1.04)
    return True


def flat_plate(bm, pts, y, thickness):
    """Plochý díl (list sekery) z obrysu `pts` v rovině XZ, tloušťka ve směru Y."""
    front = [bm.verts.new((x, y - thickness / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, y + thickness / 2, z)) for x, z in pts]
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))


def icon_tools():
    """Nástroje: kovaná sekera s bradou na topůrku zkřížená se srpem – železo od kováře."""
    wood, iron, edge = bmesh.new(), bmesh.new(), bmesh.new()
    # sekera: topůrko zprava dole doleva nahoru, list s bradou míří doprava
    h0, h1 = Vector((0.74, 0.0, -0.78)), Vector((-0.46, 0.0, 0.76))
    cyl(wood, h0, h1, 0.1, 0.09, 10)
    d = (h1 - h0).normalized()
    n = Vector((d.z, 0, -d.x))  # kolmo doprava nahoru
    head = h0 + (h1 - h0) * 0.84
    k = 1.25  # list sekery větší než skutečně – ikona se čte i ve 26 px
    to_xz = lambda u, v: ((head + d * u * k + n * v * k).x, (head + d * u * k + n * v * k).z)  # noqa: E731
    blade_pts = [
        (0.13, -0.16), (0.14, 0.12), (0.11, 0.3), (0.2, 0.62), (0.3, 0.86),
        (-0.06, 0.92), (-0.38, 0.86), (-0.42, 0.72), (-0.22, 0.5), (-0.12, 0.3),
        (-0.13, 0.12), (-0.11, -0.16),
    ]
    flat_plate(iron, [to_xz(u, v) for u, v in blade_pts], -0.02, 0.12)
    # broušené ostří – světlejší pruh podél břitu
    edge_pts = [(0.3, 0.86), (-0.06, 0.92), (-0.38, 0.86), (-0.34, 0.8), (-0.06, 0.85), (0.26, 0.8)]
    flat_plate(edge, [to_xz(u, v) for u, v in edge_pts], -0.02, 0.13)
    # srp: rukojeť vlevo dole, čepel obloukem nahoru a doprava
    c, R = Vector((0.04, 0.0, 0.0)), 0.55
    start = c + Vector((math.cos(math.radians(212)), 0, math.sin(math.radians(212)))) * R
    cyl(wood, (-0.86, -0.18, -0.86), (start.x + 0.02, -0.18, start.z - 0.02), 0.1, 0.09, 10)
    steps = 26
    outer, inner = [], []
    a0, a1 = math.radians(212), math.radians(-38)
    for i in range(steps + 1):
        t = i / steps
        a = a0 + (a1 - a0) * t
        w = 0.22 * (1 - t) ** 0.6 + 0.006
        rr = R + 0.03 * math.sin(math.pi * t)
        outer.append((c.x + math.cos(a) * rr, c.z + math.sin(a) * rr))
        inner.append((c.x + math.cos(a) * (rr - w), c.z + math.sin(a) * (rr - w)))
    flat_plate(iron, outer + inner[::-1], -0.18, 0.07)
    bmesh.ops.recalc_face_normals(iron, faces=iron.faces)
    bmesh.ops.recalc_face_normals(edge, faces=edge.faces)
    to_obj(wood, "handles", mat("haft", (0.66, 0.45, 0.24), 0.75, noise=18, bump=0.3))
    ir = mat("forged", (0.36, 0.36, 0.38), 0.42, noise=14, bump=0.4)
    next(x for x in ir.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.65
    to_obj(iron, "iron", ir, smooth=False)
    ed = mat("edge", (0.72, 0.72, 0.74), 0.3)
    next(x for x in ed.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.8
    to_obj(edge, "edge", ed, smooth=False)
    sun(az=-35, el=45, strength=4.4)
    camera([Vector((-0.9, -0.3, -1.0)), Vector((0.9, 0.3, 1.25))], az=0, el=8, margin=1.02)
    return True


# Hrnec pražského typu: vnější profil (poloměr, výška) od dna k okraji, pak vnitřek zpět ke dnu
POT_OUTER = [(0.0, 0.0), (0.3, 0.0), (0.36, 0.05), (0.48, 0.25), (0.57, 0.5), (0.58, 0.6),
             (0.53, 0.76), (0.45, 0.86), (0.43, 0.9), (0.47, 0.97), (0.51, 1.0)]
POT_INNER = [(0.46, 1.0), (0.39, 0.92), (0.4, 0.86), (0.51, 0.62), (0.44, 0.25), (0.0, 0.08)]


def lathe(bm, profile, centre, scale, segs=36):
    """Rotační těleso z profilu (poloměr, výška) kolem svislé osy v bodě `centre`."""
    rings = []
    for (r, z) in profile:
        rings.append([bm.verts.new((centre[0] + math.cos(2 * math.pi * k / segs) * r * scale,
                                    centre[1] + math.sin(2 * math.pi * k / segs) * r * scale,
                                    centre[2] + z * scale)) for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((a[k], a[j], b[j], b[k]))


def pot_radius(z):
    """Vnější poloměr hrnce ve výšce z (lineárně mezi body profilu)."""
    for (r0, z0), (r1, z1) in zip(POT_OUTER, POT_OUTER[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return POT_OUTER[-1][0]


def icon_pottery():
    """Keramika: dva hrnce pražského typu v ruce dělané, větší s vlnovkou a rýhami na plecích."""
    big, small_pot, lines = bmesh.new(), bmesh.new(), bmesh.new()
    big_c, big_s = (-0.32, 0.12, 0.0), 1.0
    lathe(big, POT_OUTER + POT_INNER, big_c, big_s)
    lathe(small_pot, POT_OUTER + POT_INNER, (0.5, -0.22, 0.0), 0.72)
    # výzdoba hřebenem: dvě vodorovné rýhy a vlnovka mezi nimi (tmavé, mírně zapuštěné)
    segs = 72

    def groove(zf, wave=0.0, waves=7):
        pts = []
        for k in range(segs + 1):
            a = 2 * math.pi * k / segs
            z = zf + wave * math.sin(waves * a)
            r = pot_radius(z) * big_s + 0.004
            pts.append(Vector((big_c[0] + math.cos(a) * r, big_c[1] + math.sin(a) * r, big_c[2] + z * big_s)))
        for p, q in zip(pts, pts[1:]):
            cyl(lines, p, q, 0.014, 0.014, 5)

    groove(0.74)
    groove(0.64, wave=0.035)
    groove(0.54)
    to_obj(big, "pot", mat("clay-pot", (0.24, 0.18, 0.13), 0.8, noise=16, bump=0.3))
    to_obj(small_pot, "pot2", mat("clay-pot2", (0.2, 0.17, 0.14), 0.82, noise=16, bump=0.3))
    to_obj(lines, "ornament", mat("incised", (0.07, 0.05, 0.04), 0.9))
    sun(az=-45, el=46, strength=4.3)
    camera([Vector((-0.92, -0.6, 0.0)), Vector((0.92, 0.7, 1.02))], az=0, el=20, margin=1.04)
    return True



# ------------------------------------------------- dvorec, stezka a obchod (trade.md) ----


def icon_stezka():
    """Zemská stezka: upravená (širší) cesta vede od brány dvorce do dálky."""
    ground(7.4, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.25, tint=(0.8, 0.82, 0.6)), z=-0.02, fade=0.72)
    earth = mat("earth", tex=f"{TEX}/mud.jpg", scale=0.5, tint=(0.82, 0.66, 0.48))
    road = road_strip(2.56, 16.0, earth, seed=7)
    road.location.y = 3.0
    gate = place_model("dvorec-gate")
    place_root(gate, (math.sin(-7.0 * 0.6) * 0.25, -4.2, 0.0), 0.0, 1.0)
    sun(az=-55, el=46)
    camera([Vector((-3.6, -5.2, 0)), Vector((3.6, 8.5, 0.6)), Vector((0, -4.2, 3.2))], az=18, el=34, margin=0.86, shift=(0, -0.02))


def sack(bm, centre, size, rot, rng):
    """Pytel: zploštělý bochník s uvázaným hrdlem nahoře."""
    blob(bm, (centre, (0, 0, rot)), (0.42 * size, 0.36 * size, 0.46 * size), 16, 10)
    top = Vector(centre) + Vector((0, 0, 0.42 * size))
    cyl(bm, top, top + Vector((0.03, 0.0, 0.16 * size)), 0.12 * size, 0.16 * size, 10)


def icon_obchod():
    """Obchod se sousedy: pytle obilí vyměněné za hrnce, klády a sýr – jen to, co má i ves."""
    rng = random.Random(5)
    ground(2.6, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.45, tint=(0.8, 0.78, 0.6)), z=0.0, fade=0.7)
    sacks = bmesh.new()
    sack(sacks, (-0.85, 0.35, 0.42), 1.0, 0.3, rng)
    sack(sacks, (-0.25, 0.7, 0.36), 0.85, -0.4, rng)
    to_obj(sacks, "sacks", mat("linen", (0.42, 0.33, 0.2), 0.95, noise=40, bump=0.4))
    pots = bmesh.new()
    lathe(pots, POT_OUTER + POT_INNER, (0.75, 0.45, 0.0), 0.6)
    lathe(pots, POT_OUTER + POT_INNER, (1.05, -0.05, 0.0), 0.45)
    to_obj(pots, "pots", mat("clay-pot", (0.24, 0.18, 0.13), 0.8, noise=16, bump=0.3))
    logs = bmesh.new()
    for k, (y, z) in enumerate(((-0.62, 0.15), (-0.32, 0.15), (-0.47, 0.41))):
        cyl(logs, (-0.75 + 0.04 * k, y, z), (0.45 + 0.04 * k, y, z), 0.15, 0.14, 12)
    to_obj(logs, "logs", mat("bark", (0.24, 0.17, 0.11), 0.9, noise=60, bump=0.8))
    cheese = bmesh.new()
    cyl(cheese, (0.75, -0.6, 0.0), (0.75, -0.6, 0.22), 0.3, 0.3, 24)
    to_obj(cheese, "cheese", mat("rind", (0.78, 0.55, 0.22), 0.55, noise=18, bump=0.3))
    sun(az=-45, el=46, strength=4.3)
    camera([Vector((-1.4, -1.2, 0)), Vector((1.4, 1.2, 0.95))], az=22, el=40, margin=1.02)


# --------------------------------------------------------------- hlavní ----

BUILD = {
    "zemnice": lambda: icon_dwelling("zemnice"),
    "polozemnice": lambda: icon_dwelling("polozemnice"),
    "dvorec": lambda: icon_dwelling("dvorec"),
    "pole": icon_pole,
    "hrbitov": icon_hrbitov,
    "hrncir": lambda: icon_craft("hrncir"),
    "kovar": lambda: icon_craft("kovar"),
    "uhlir": lambda: icon_craft("uhlir"),
    "sad": icon_sad,
    "modla": icon_modla,
    "svatyne": icon_svatyne,
    "dub": icon_dub,
    "sous": icon_sous,
    "haj": icon_haj,
    "ohrada": icon_ohrada,
    "cesta": lambda: icon_road("cesta"),
    "cesta-upravena": lambda: icon_road("cesta-upravena"),
    "hat": lambda: icon_road("hat"),
    "jablone": icon_jablone,
    "stezka": icon_stezka,
    "obchod": icon_obchod,
}

# ------------------------------------------------------------- rodiny ----
# Ikony panelu obydlí (kinship.md – Co hráč vidí): muž, žena, děti, starší a prsten (manželské
# páry). Postavy jsou vesničané hry (`apps/web/public/models/people/`, z 0 A.D.) v klidové pózy
# ze snímku klipu `idle`.


def place_person(name, loc=(0.0, 0.0, 0.0), scale=1.0, turn=-20.0, frame=12):
    """Vesničan `man` / `woman` stojící v pozici `loc`: klip idle na snímku `frame`, natočený."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{PEOPLE}/{name}.glb")
    new = [o for o in bpy.data.objects if o not in before]
    helpers = [o for o in new if o.name.startswith("Icosphere")]
    new = [o for o in new if o not in helpers]
    for o in helpers:
        bpy.data.objects.remove(o, do_unlink=True)
    rig = next(o for o in new if o.type == "ARMATURE")
    idle = next(a for a in bpy.data.actions if a.name.startswith("idle"))
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = idle
    bpy.context.scene.frame_set(frame)
    # importér glTF už kostru natočil z Y-up do Z-up – posun, otočení a měřítko se k tomu přidají
    place = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(math.radians(turn), 4, "Z")
    rig.matrix_world = place @ Matrix.Scale(scale, 4) @ rig.matrix_world
    bpy.context.view_layer.update()
    return [o for o in new if o.type == "MESH"]


def grey_hair(objs, amount=0.55):
    """Starší: šediny – barva textury se smíchá s šedou (celá postava trochu vybledne)."""
    for o in objs:
        for m in o.data.materials:
            nt = m.node_tree
            b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            link = next((l for l in nt.links if l.to_socket == b.inputs["Base Color"]), None)
            if link is None:
                continue
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type, mx.blend_type = "RGBA", "MIX"
            mx.inputs["Factor"].default_value = amount
            mx.inputs[7].default_value = (0.62, 0.6, 0.57, 1)
            nt.links.new(link.from_socket, mx.inputs[6])
            nt.links.new(mx.outputs[2], b.inputs["Base Color"])


def box_points(meshes, z_from=0.0, z_to=1.0):
    """Rohy kvádru kolem postav, jen pásmo výšky z_from–z_to (podíl výšky) – výřez portrétu."""
    pts = world_points(meshes)
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    lo, hi = min(zs), max(zs)
    z0, z1 = lo + (hi - lo) * z_from, lo + (hi - lo) * z_to
    return [Vector((x, y, z)) for x in (min(xs), max(xs)) for y in (min(ys), max(ys)) for z in (z0, z1)]


def bust_icon(meshes):
    """Portrét – hlava a ramena jako ikona obyvatel 0 A.D."""
    sun(az=-40, el=40, strength=4.4)
    camera(box_points(meshes, 0.62, 1.0), az=12, el=6, margin=1.0)


def icon_man():
    bust_icon(place_person("man"))


def icon_woman():
    bust_icon(place_person("woman"))


def icon_child():
    """Děti: malá postava (vesničan zmenšený na dětskou výšku) u matky, matka jen do pasu."""
    kid = place_person("man", loc=(-0.3, -0.25, 0), scale=0.55, turn=-15)
    mother = place_person("woman", loc=(0.22, 0.05, 0), turn=-25)
    sun(az=-40, el=40, strength=4.4)
    pts = world_points(kid)
    top = max(p.z for p in pts)
    frame = [p for p in box_points(kid + mother) if p.z <= top] + [Vector((p.x, p.y, top * 1.08)) for p in pts]
    camera(frame, az=12, el=6, margin=1.02, shift=(0.0, 0.02))


def icon_family():
    """Rodina (výměna lidí se sousedem – trade.md): muž a žena, mezi nimi před nimi dítě."""
    man = place_person("man", loc=(-0.32, 0.12, 0), turn=-12)
    woman = place_person("woman", loc=(0.34, 0.16, 0), turn=-28)
    kid = place_person("man", loc=(0.02, -0.3, 0), scale=0.62, turn=-18)
    sun(az=-40, el=40, strength=4.4)
    camera(box_points(man + woman, 0.5, 1.0), az=12, el=6, margin=1.0)


def icon_elder():
    """Starší: portrét muže se šedinami (vybledlá barva) a hůl u ramene."""
    meshes = place_person("man", turn=-25, frame=40)
    grey_hair(meshes)
    bm = bmesh.new()
    cyl(bm, (0.3, -0.24, 0.0), (0.34, -0.22, 1.62), 0.024, 0.02)
    stick = to_obj(bm, "hul", mat("hul", (0.32, 0.2, 0.11), rough=0.7))
    sun(az=-40, el=40, strength=4.4)
    camera(box_points(meshes, 0.62, 1.0), az=12, el=6, margin=1.0)
    del stick


def icon_ring():
    """Manželské páry: bronzový prsten s rytým páskem, mírně nakloněný."""
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.16, major_segments=96, minor_segments=24)
    ring = bpy.context.active_object
    bronze = bpy.data.materials.new("bronz")
    bronze.use_nodes = True
    b = next(n for n in bronze.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.78, 0.52, 0.22, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.32
    ring.data.materials.append(bronze)
    bpy.ops.object.shade_smooth()
    ring.rotation_euler = (math.radians(62), 0, math.radians(18))
    ring.scale = (1, 1, 1.35)
    bpy.context.view_layer.update()
    sun(az=-50, el=48, strength=4.4)
    camera(world_points([ring]), az=0, el=20, margin=1.12)


RESOURCES = {
    "food": icon_food,
    "wood": icon_wood,
    "labor": icon_labor,
    "satiation": icon_satiation,
    "date": icon_date,
    "apples": icon_apples,
    "happiness": icon_happiness,
    "hay": icon_hay,
    "meat": icon_meat,
    "cheese": icon_cheese,
    "eggs": icon_eggs,
    "legumes": icon_legumes,
    "hourglass": icon_hourglass,
    "sheep": lambda: icon_animal("sheep"),
    "goat": lambda: icon_animal("goat"),
    "pig": lambda: icon_animal("pig"),
    "cow": lambda: icon_animal("cow"),
    "chicken": lambda: icon_animal("chicken"),
    "ox": lambda: icon_animal("ox", folder=PLOUGH),
    "ozim": icon_ozim,
    "jar": icon_jar,
    "charcoal": icon_charcoal,
    "tools": icon_tools,
    "pottery": icon_pottery,
    "overgrowth": icon_overgrowth,
    "condition": icon_condition,
    "abandoned": icon_abandoned,
    "man": icon_man,
    "woman": icon_woman,
    "child": icon_child,
    "family": icon_family,
    "elder": icon_elder,
    "ring": icon_ring,
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
