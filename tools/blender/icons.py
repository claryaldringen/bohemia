"""Ikony pro rozhraní Bohemie ve stylu 0 A.D. – portréty staveb a ikony surovin.

Celé jedním příkazem z kořene repa (Blender 5, ImageMagick `magick`, internet jen pro ikony 0 A.D.):

    blender -b --factory-startup --python tools/blender/icons.py -- apps/web/public/icons [jen,vybrané,ikony]

Výstup (128 × 128 PNG, průhledné rohy) – `build/` zemnice, polozemnice, srub (nadzemní dům –
log-house.md, bez jámy), dvorec (dvorec vojvody –
trade.md), pole, hrbitov,
hrncir, kovar, tesar, uhlir (řemeslné dílny z `apps/web/public/models/crafts/`, tesař pod
přístřeškem s kozlíky a koly – wagons.md, uhlíř s milířem), sad
(jabloňový sad), modla, svatyne (posvátná místa z `apps/web/public/models/sacred/`), dub
(posvátný dub s obětinami), sous (posvátná souš – uschlý dub z `apps/web/public/models/decor/`
s obětinami), haj (dubový háj s kameny) a ohrada (přístřešek, žlab a branka
z `apps/web/public/models/pen/`, kráva ze stáda vsi, stoh sena), cesta, cesta-vyjezdena,
cesta-upravena, hat a cesta-vozova (druhy pevné cesty – pás cesty, vyježděná se dvěma kolejemi,
upravená širší, hať a lávka z `apps/web/public/models/roads/`, vozová cesta se zpevněnými
kolejemi v úvozu)
dvorec-srub (dvorec ze srubu), a jablone (jabloně s jablky střídavě podél cesty – tlačítko „Vysadit jabloně“), stezka (zemská
stezka od brány dvorce – trade.md), obchod (pytle obilí, hrnce, klády a sýr) a rudiste (jámy
s vodou a valem, hromádka bahenní rudy a motyka – crafts.md, Uhlí a ruda kováře), humno (mlat pod
širým nebem bez přístřešku, stoh slámy a cepy – production-chains.md, Humno), hliniste (jámy
se šedookrovou stěnou jílu, hromádka hlíny a rýč – crafts.md, Hlína hrnčíře) a milir (kouřící milíř
mezi pařezy skácených buků – crafts.md, Milíř u skácených buků) a krizovatka-kriz a krizovatka-y (kříž a Y cest se znamením – paths.md, Křižovatky) a obilna-jama (otevřená obilná
jáma se zrnem, hroudami pečeti a lopatou – production-chains.md, Obilné jámy) – portréty do panelu
výběru;
(64 × 64 PNG) – `resources/` people, food, wood, labor, satiation, date, apples, happiness
(štěstí – plamen ohniště nad zkříženými poleny v kruhu kamenů), fire (pálí se – hořící hromada
větví, klučení lesa), hay (seno – kupka sena
z `apps/web/public/models/fields/haystack.glb`), meat (maso – uzená kýta s kostí a provázkem),
cheese (mléko a sýr – bochník sýra s vykrojeným klínem a hrouda tvarohu), eggs (vejce v hnízdě
ze slámy), legumes (luštěniny – hromádka suchého hrachu a čočky, otevřený lusk s hrášky),
hourglass (přesýpací hodiny – kolik zbývá: služba spřežení, výcvik), balance (váhy s miskami –
bilance obchodu se sousedem, trade.md),
ozim (osení pod sněhem), jar (klasy jarního ječmene), flax (len – hrst stonků s modrými květy
a tobolkami, fields.md – Len), charcoal (hromádka dřevěného uhlí), tools
(kovaná sekera zkřížená se srpem), iron-bars (tři sekerovité hřivny) a bloom (železná houba –
production-chains.md, Kovář) a pottery (dva hrnce pražského typu, větší s vlnovkou) –
suroviny řemesel (crafts.md) –, ore (hromádka rezavých hrud bahenní rudy – crafts.md, Uhlí a ruda
kováře), clay (hromádka hladkých hrud vlhké hlíny seříznutých rýčem – crafts.md, Hlína hrnčíře), harvest (sklizeň – srp zkřížený s uříznutou hrstí zralých klasů,
panel dílu pole – fields.md), sheaves (dva svázané snopy – nevymlácené zrno v horní liště,
production-chains.md – Humno), walk (cesta z domu – dvě šlépěje bosých nohou ve vyšlapané hlíně, chůze
po pěšinách – paths.md), cart (dvoukolák s loukoťovými koly) a wood-tools (hrábě zkřížené
s dřevěnými vidlemi) – vozy a dřevěné nářadí od tesaře (wagons.md) –, skill (zkušenost
řemeslníka – dřevěná palička zkřížená s dlátem, crafts.md – Učení řemesla), overgrowth (zarůstání – keře
a mladá bříza z modelů krajiny
`apps/web/public/models/decor/` a `trees/`, fields.md – Zarůstání), condition (stav stavby –
zšedlý rozštípnutý kůl s prasklinou a mechem) a abandoned (opuštěná stavba – padlý kůl
v kopřivách z `apps/web/public/models/dwellings/decay.glb`, abandonment.md) a zvířata stád do panelu
ohrady – sheep, goat, pig, cow, chicken, foal, mare, horse, divoká zvěř a pes – boar, deer (jelen
s parožím), wolf, bear, hare, fox, fish, dog – spear (oštěp) a watch-fire (pochodeň hlídky)
(modely `apps/web/public/models/fauna/`) a ox (vůl ze spřežení `apps/web/public/models/plough/ox.glb`;
v obchodu vycvičený vůl) a young-ox (mladý vůl do výcviku – týž vůl světlejší a menší, stojí na
stejné zemi; trade.md – Dobytek ve třech druzích),
ard (rádlo z `apps/web/public/models/plough/ard.glb` – páry s rádlem v panelu ohrady volů)
a rodiny do panelu obydlí (kinship.md) – man, woman, child (chlapec a dívka), elder (starší s holí
a šedinami; vesničané z `apps/web/public/models/people/`) a ring (bronzový prsten – manželské
páry) a family (muž, žena a dítě – výměna lidí se sousedem, trade.md) a počasí a pohromy
(disasters.md – Co hráč vidí) – drought (prasklá zem), rain (dešťový mrak), frost (sněhová vločka),
good-summer (klasy se sluncem), flood (rozvodněná voda), hail (kroupy na stéblech), tornado (trychtýř
smrště pod mrakem), protection (větvička s listy – ochrana dílu) a dearth (hromada zrna se šipkou
vzhůru – zdražení u sousedů).
(128 × 128 PNG) – `premium/` portréty 19 typů prémiové krajiny (premium-landscapes.md – Co hráč
vidí; klíč = typ, např. `iron-ore`): kruh krajiny s výškovým polem, na něm prvek typu – zlatá žíla
ve skalnatém hřbetu, náplav se zlatem, řeka s molem a člunem, černozem s mandelemi, brod pod
pahorkem, sedlo s mohylou, hromada krevelu, jámy v šedém jílu, dub a buk s prasetem, niva se
senem, jižní svah s jabloněmi, vrch s kamenným kruhem, tůňka pod skalkou, soutok, ostrožna nad
meandrem, slanisko, brť s úly, mokřad s jelenem a lom (modely z `apps/web/public/models/`).
(64 × 64 PNG) – `house/`, `war/`, `newcomer/` ikony panelů rodu, vazalství, války a nováčka
(slovník `PANELS`, klíč s podsložkou, např. `house/seal`, `war/captive`) a `resources/steward.png`.
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


def icon_dwelling(name, pit=True):
    objs = place_model(name)
    gr = ground(9.5, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.22, tint=(0.8, 0.74, 0.6)), z=0.0, fade=0.6)
    if pit:
        # vykopaná hlína u jámy (nadzemní dům jámu ani hlínu nemá)
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
    """Řemeslná dílna (tools/blender/crafts.py) jako portrét obydlí. Hrnčíř, kovář a tesař
    zepředu do přístřešku (pec / výheň / kozlíky s koly musí být v ikoně vidět), uhlíř i s kouřícím milířem – blíž
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


# ---------------------------------------------------------------- opevnění ----

FORT = os.path.join(ROOT, "apps/web/public/models/fortifications")
RAMPART_DITCH, RAMPART_FOOT, RAMPART_DEPTH, RAMPART_HEIGHT = 4.0, 6.0, 1.5, 2.0  # rampart-mesh.ts, rules


def fort_parts():
    """Díly opevnění z `fortifications.glb` podle jména (originály se skryjí, kopie dělá `inst`)."""
    parts = {}
    for o in place_model("fortifications", folder=FORT):
        parts[o.name.split(".")[0]] = o
        o.hide_render = True
    return parts


def inst(src, loc, rot=0.0, scale=1.0, tilt=(0.0, 0.0)):
    o = src.copy()
    bpy.context.collection.objects.link(o)
    o.parent = None
    o.hide_render = False
    o.matrix_world = (
        Matrix.Translation(loc)
        @ Euler((tilt[0], tilt[1], rot)).to_matrix().to_4x4()
        @ Matrix.Scale(scale, 4)
        @ src.matrix_world
    )
    return o


def palisade_run(parts, path, rng, gap=None, sink=0.0):
    """Kůly palisády hustě vedle sebe podél lomené čáry; `gap(x, y)` vynechá průchod."""
    stakes = [parts["stake-a"], parts["stake-b"], parts["stake-c"]]
    n = 0
    for i, (x, y) in enumerate(path):
        if gap and gap(x, y):
            continue
        j = min(i + 1, len(path) - 1)
        k = max(i - 1, 0)
        rot_dir = math.atan2(path[j][1] - path[k][1], path[j][0] - path[k][0])
        inst(stakes[rng.randrange(3)], (x, y, sink), rot=rot_dir + rng.uniform(-0.3, 0.3), scale=rng.uniform(0.9, 1.08),
             tilt=(rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03)))
        n += 1
    return n


def front_corner_path(x0, x1, y0, y1, r, step):
    """Čelní stěna, zakulacený roh a pravá stěna z obvodu obdélníku (jen úsek, jako výřez z opevnění)."""
    pts = rounded_path(x0, y0, x1, y1, r, step)
    keep = [p for p in pts if p[0] >= x0 + r - 0.01 and p[1] <= y1 - r + 0.01]
    # pořadí od levého konce čelní stěny přes roh nahoru
    return sorted(keep, key=lambda p: (0 if p[1] <= y0 + r else 1, p[0] if p[1] <= y0 + r and p[0] < x1 - r else 0, p[1]))


def earth_ground(radius, hfn, tint=(0.8, 0.82, 0.62)):
    """Zem s výškovým polem (příkop a násep): ground() dá materiál s mizejícím okrajem, síť je hustá."""
    o = ground(radius, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.22, tint=tint), z=0.0, fade=0.62)
    bm = bmesh.new()
    n = 150
    vs = []
    for iy in range(n + 1):
        row = []
        for ix in range(n + 1):
            x = -radius + 2 * radius * ix / n
            y = -radius + 2 * radius * iy / n
            row.append(bm.verts.new((x, y, hfn(x, y))))
        vs.append(row)
    for iy in range(n):
        for ix in range(n):
            bm.faces.new((vs[iy][ix], vs[iy][ix + 1], vs[iy + 1][ix + 1], vs[iy + 1][ix]))
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def rampart_profile(d):
    """Výška země ve vzdálenosti `d` od vnějšího okraje: příkop (do -1,5 m), pak násep (2 m)."""
    if d < 0 or d > RAMPART_DITCH + RAMPART_FOOT:
        return 0.0
    if d < RAMPART_DITCH:
        return -RAMPART_DEPTH * math.sin(math.pi * d / RAMPART_DITCH) ** 1.4 * 0.95
    t = (d - RAMPART_DITCH) / RAMPART_FOOT
    return RAMPART_HEIGHT * math.sin(math.pi * t) ** 1.2


def icon_opevneni():
    """Opevnění (fortifications.md): úsek palisády se zakulaceným rohem a bránou z prken na vyšlapané zemi."""
    rng = random.Random(11)
    parts = fort_parts()
    x0, x1, y0, y1, r = -4.6, 4.4, -2.8, 4.6, 2.4
    earth_ground(8.6, lambda x, y: 0.0)
    path = front_corner_path(x0, x1, y0, y1, r, 0.27)
    gx = -0.4

    def gap(x, y):
        return abs(y - y0) < 0.05 and abs(x - gx) < 1.95

    palisade_run(parts, path, rng, gap)
    for s in (-1, 1):
        inst(parts["gate-post"], (gx + s * 2.05, y0, 0))
    inst(parts["gate-beam"], (gx, y0, 0))
    inst(parts["gate-planks"], (gx, y0, 0))
    inst(parts["gate-planks"], (gx, y0, 0), rot=math.pi)
    sun(az=-55, el=44)
    pts = [Vector((-4.8, -3.4, 0)), Vector((4.8, 5.0, 0)), Vector((-4.8, 5.0, 0)), Vector((4.8, -3.4, 0)), Vector((gx, y0, 4.0))]
    camera(pts, az=22, el=40, margin=0.98, shift=(0, 0.0))


def icon_fort_palisade():
    """Druh opevnění palisáda: lehce zakřivená řada špičatých kůlů."""
    rng = random.Random(4)
    parts = fort_parts()
    path = [(math.cos(a) * 7.0 - 3.5, math.sin(a) * 7.0 - 3.0) for a in [math.radians(t) for t in range(-52, -4, 1)]]
    # hustota: kůl na ~0.27 m
    out, acc = [path[0]], 0.0
    for a, b in zip(path, path[1:]):
        acc += math.hypot(b[0] - a[0], b[1] - a[1])
        if acc >= 0.27:
            out.append(b)
            acc = 0.0
    palisade_run(parts, out, rng)
    sun(az=-45, el=40, strength=4.2)
    camera([Vector((-1.5, -7.5, 0)), Vector((3.0, -1.5, 3.8)), Vector((3.0, -7.5, 0)), Vector((-1.5, -1.5, 0))], az=0, el=30, margin=1.04)
    return True


def icon_fort_fence():
    """Druh opevnění pletený plot: kůly s proplétanými pruty v mírném oblouku."""
    posts, rods = bmesh.new(), bmesh.new()
    path = [(math.cos(a) * 6.0 - 3.0, math.sin(a) * 6.0 - 3.0) for a in [math.radians(t) for t in range(-52, -8, 2)]]
    for i, (x, y) in enumerate(path):
        if i % 2 == 0:
            cyl(posts, (x, y, -0.05), (x, y, 1.55), 0.09, 0.065, 6)
    for lv in range(10):
        z = 0.14 + lv * 0.14
        run = []
        for i, (x, y) in enumerate(path):
            j = min(i + 1, len(path) - 1)
            k = max(i - 1, 0)
            dx, dy = path[j][0] - path[k][0], path[j][1] - path[k][1]
            ln = math.hypot(dx, dy) or 1
            off = 0.07 * math.sin((i / 2.0) * math.pi + (lv % 2) * math.pi)
            run.append((x - dy / ln * off, y + dx / ln * off, z))
        for a, b in zip(run, run[1:]):
            cyl(rods, a, b, 0.06, 0.06, 5)
    to_obj(posts, "posts", mat("wood", (0.42, 0.29, 0.17), 0.9, noise=25, bump=0.3))
    to_obj(rods, "rods", mat("wicker", (0.55, 0.4, 0.22), 0.9, noise=60, bump=0.5))
    sun(az=-45, el=40, strength=4.2)
    camera([Vector((-1.0, -6.4, 0)), Vector((3.0, -2.0, 1.7)), Vector((3.0, -6.4, 0)), Vector((-1.0, -2.0, 0))], az=0, el=30, margin=1.04)
    return True


def icon_fort_rampart():
    """Druh opevnění val: výsek země s příkopem a náspem, řez vpředu (profil 4 m / 1,5 m a 6 m / 2 m)."""
    L, X0, X1 = 3.2, -2.5, 6.5
    bm = bmesh.new()
    xs = [X0 + i * 0.1 for i in range(int((X1 - X0) / 0.1) + 1)]
    prof = [(x, rampart_profile(x)) for x in xs]
    base = -0.9
    ymin, ymax = -L / 2, L / 2
    top0 = [bm.verts.new((x, ymin, h)) for x, h in prof]
    top1 = [bm.verts.new((x, ymax, h)) for x, h in prof]
    for i in range(len(xs) - 1):
        bm.faces.new((top0[i], top0[i + 1], top1[i + 1], top1[i]))
    bl0, br0 = bm.verts.new((X0, ymin, base)), bm.verts.new((X1, ymin, base))
    bl1, br1 = bm.verts.new((X0, ymax, base)), bm.verts.new((X1, ymax, base))
    bm.faces.new([bl0, br0] + top0[::-1])  # čelní řez
    bm.faces.new([bl1] + top1 + [br1])  # zadní stěna
    bm.faces.new((bl0, bl1, top1[0], top0[0]))
    bm.faces.new((br0, top0[-1], top1[-1], br1))
    bm.faces.new((bl0, bl1, br1, br0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = to_obj(bm, "rampart", mat("earth", tex=f"{TEX}/mud.jpg", scale=0.3, tint=(0.95, 0.78, 0.6)), smooth=False)
    o.data.materials.append(mat("turf", tex=f"{TEX}/grass-lush.jpg", scale=0.3, tint=(0.8, 0.85, 0.6)))
    for poly in o.data.polygons:  # horní plocha je drn, řez a stěny holá hlína
        poly.material_index = 1 if poly.normal.z > 0.3 and abs(poly.normal.y) < 0.9 else 0
    sun(az=-45, el=40, strength=4.2)
    camera([Vector((X0, -L / 2, base)), Vector((X1, L / 2, 2.2)), Vector((X0, L / 2, base)), Vector((X1, -L / 2, base))], az=-18, el=30, margin=1.0)
    return True


# --------------------------------------------------------------- suroviny ----


def road_strip(width, length, material, z=0.004, wobble=0.12, seed=3, offset=0.0):
    """Pás cesty přes portrét (podél Y) s lehce zvlněnými okraji – `offset` posune pás napříč
    (koleje vyježděné cesty podél stejné osy)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    n = 24
    rows = []
    for i in range(n + 1):
        y = -length / 2 + length * i / n
        dx = math.sin(y * 0.6) * 0.25 + offset
        row = []
        for side in (-1, 1):
            x = dx + side * (width / 2 + rng.uniform(-wobble, wobble))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
    return to_obj(bm, "road", material, smooth=False)


def icon_road(grade):
    """Portrét druhu pevné cesty (roads.md): vyšlapaná, vyježděná (vyšlapaná vozy – širší pás
    prošlapané trávy se dvěma kolejemi, wagons.md), upravená (jen širší – Martin, 19. 10. 2026),
    hať a lávka."""
    rng = random.Random(11)
    gr = ground(6.4, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.25, tint=(0.8, 0.82, 0.6)), z=-0.02, fade=0.72)
    earth = mat("earth", tex=f"{TEX}/mud.jpg", scale=0.5, tint=(0.82, 0.66, 0.48))
    if grade == "cesta-vozova":
        # vozová cesta (roads.md – Vozová cesta): pás 3,5 m udusané hlíny se zpevněnými kolejemi
        # (štěrk a kameny – WAGON_GRAVEL_LAYER) v úvozu – svahy holé hlíny po obou stranách
        scale = 1.6 / 1.9
        road_strip(3.5 * scale, 12.0, earth)
        gravel = mat("gravel", tex=f"{TEX}/gravel.jpg", scale=0.6, tint=(0.86, 0.84, 0.8))
        for side in (-1, 1):
            road_strip(0.5 * scale, 12.0, gravel, z=0.008, wobble=0.0, seed=7 + side, offset=side * 0.65 * scale)
        bank = mat("bank", tex=f"{TEX}/mud.jpg", scale=0.45, tint=(0.66, 0.52, 0.38))
        for side in (-1, 1):
            bm = bmesh.new()
            n = 24
            rows = []
            for i in range(n + 1):
                y = -6.0 + 12.0 * i / n
                dx = math.sin(y * 0.6) * 0.25
                inner = dx + side * (3.5 * scale / 2 + 0.35)
                outer = dx + side * (3.5 * scale / 2 + 1.6)
                rows.append((bm.verts.new((inner, y, 0.0)), bm.verts.new((outer, y, 1.1))))
            for i in range(n):
                a, b = rows[i]
                c, d = rows[i + 1]
                bm.faces.new((a, b, d, c) if side < 0 else (a, c, d, b))
            to_obj(bm, f"bank{side}", bank, smooth=True)
        sun(az=-55, el=46)
        camera([Vector((-3.2, -4.6, 0)), Vector((3.2, 4.6, 1.4)), Vector((-3.2, 4.6, 0)), Vector((3.2, -4.6, 0))], az=24, el=42, margin=0.92)
        return
    if grade == "cesta-vyjezdena":
        # vyježděná cesta (ROAD_WIDTH_M ve scéně: 2,6 m proti 1,9 m vyšlapané): prošlapaná tráva,
        # uprostřed tráva, dvě koleje 0,65 m od osy (CART_RUT_LAYER)
        scale = 1.6 / 1.9
        worn = mat("worn", tex=f"{TEX}/grass-dirt.jpg", scale=0.5, tint=(0.8, 0.66, 0.46))
        road_strip(2.6 * scale, 12.0, worn)
        rut = mat("rut", tex=f"{TEX}/mud.jpg", scale=0.5, tint=(0.52, 0.38, 0.25))
        for side in (-1, 1):
            road_strip(0.36, 12.0, rut, z=0.008, wobble=0.03, seed=5 + side, offset=side * 0.65 * scale)
        sun(az=-55, el=46)
        camera([Vector((-3.2, -4.6, 0)), Vector((3.2, 4.6, 1.4)), Vector((-3.2, 4.6, 0)), Vector((3.2, -4.6, 0))], az=24, el=42, margin=0.92)
        return
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


def icon_junction(shape):
    """Portrét křižovatky (paths.md – Křižovatky): kříž ze dvou pásů, nebo Y ze tří, v mezeře
    znamení – vztyčený kámen (kříž), dřevěný kůl (Y)."""
    gr = ground(6.4, mat("g", tex=f"{TEX}/grass-dirt.jpg", scale=0.25, tint=(0.8, 0.82, 0.6)), z=-0.02, fade=0.72)
    earth = mat("earth", tex=f"{TEX}/mud.jpg", scale=0.5, tint=(0.82, 0.66, 0.48))
    if shape == "kriz":
        angles = [0.0, math.pi / 2, math.pi, 3 * math.pi / 2]
    else:
        beta = math.radians(40)
        angles = [0.0, math.pi - beta, math.pi + beta]
    for k, a in enumerate(angles):
        # pás ramene délky 5,5 m od středu (směr a od osy +Y proti směru hodin)
        strip = road_strip(1.6, 5.5, earth, wobble=0.1, seed=3 + k)
        strip.location = (-math.sin(a) * 2.75, math.cos(a) * 2.75, 0.0)
        strip.rotation_euler = (0.0, 0.0, a)
    # střed – plácek mezi rameny
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=1.5, segments=14)
    to_obj(bm, "hub", earth, smooth=False).location.z = 0.006
    if shape == "kriz":
        objs = place_model("junction-stone-1", folder=ROADS)
        place_root(objs, (2.9, 2.9, 0.0), 0.6, 1.0)
    else:
        objs = place_model("junction-post-2", folder=ROADS)
        place_root(objs, (0.0, -3.4, 0.0), 0.5, 1.0)
    sun(az=-55, el=46)
    camera([Vector((-4.2, -4.2, 0)), Vector((4.2, 4.2, 1.8)), Vector((-4.2, 4.2, 0)), Vector((4.2, -4.2, 0))], az=24, el=42, margin=0.92)


def icon_walk():
    """Cesta z domu (chůze po pěšinách – paths.md): dvě šlépěje bosých nohou ve vyšlapané hlíně."""
    walk_prints()
    sun(az=-55, el=46)
    camera([Vector((-1.15, -1.15, 0)), Vector((1.15, 1.15, 0.05))], az=0, el=70, margin=1.0)
    return True


def walk_prints():
    """Vyšlapaná hlína a dvě šlépěje bosých nohou šikmo přes střed (i do ikony průchodu)."""
    ground(1.6, mat("g", tex=f"{TEX}/mud.jpg", scale=0.8, tint=(1.0, 0.8, 0.56)), z=0.0, fade=0.66)
    prints = bmesh.new()
    # obrys chodidla (pravá noha, špička k +Y): pata úzká, přední část široká, klenba uvnitř
    sole = [(0.0, -0.42), (0.1, -0.38), (0.14, -0.22), (0.12, -0.02), (0.17, 0.14), (0.2, 0.26),
            (0.14, 0.33), (0.02, 0.32), (-0.12, 0.27), (-0.17, 0.14), (-0.1, 0.0), (-0.06, -0.2),
            (-0.1, -0.36)]
    toes = [(-0.13, 0.4, 0.06), (-0.04, 0.44, 0.045), (0.04, 0.43, 0.04), (0.11, 0.4, 0.035),
            (0.17, 0.35, 0.03)]

    def foot(centre, ang, mirror):
        ca, sa = math.cos(ang), math.sin(ang)
        place = lambda x, y: (centre[0] + (x * mirror) * ca - y * sa, centre[1] + (x * mirror) * sa + y * ca)  # noqa: E731
        verts = [prints.verts.new((*place(x, y), 0.006)) for x, y in sole]
        prints.faces.new(verts if mirror > 0 else verts[::-1])
        for x, y, r in toes:
            px, py = place(x, y)
            blob(prints, ((px, py, 0.0), (0, 0, 0)), (r, r * 1.2, 0.008), 10, 4)

    d = Vector((0.45, 1.0, 0)).normalized()
    ang = math.atan2(d.y, d.x) - math.pi / 2
    side = Vector((d.y, -d.x, 0))
    for k, mirror in ((0, -1), (1, 1)):
        c = d * (-0.45 + k * 0.9) + side * 0.2 * mirror
        foot((c.x, c.y), ang, mirror)
    bmesh.ops.recalc_face_normals(prints, faces=prints.faces)
    to_obj(prints, "prints", mat("print", (0.05, 0.03, 0.016), 0.98), smooth=False)


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


def icon_flax():
    """Len: hrst vytrhaných stonků lnu svázaná povříslem – nahoře modré květy a kulaté tobolky."""
    rng = random.Random(31)
    stems, band, petals, centres, bolls = (bmesh.new() for _ in range(5))
    tops = []
    for k in range(17):
        a = rng.uniform(0, 2 * math.pi)
        r = 0.09 * math.sqrt(rng.random())
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.95))
        waist = Vector((math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, -0.15))
        spread = rng.uniform(0.12, 0.42)
        top = Vector((math.cos(a) * spread, math.sin(a) * spread * 0.6, rng.uniform(0.62, 0.9)))
        cyl(stems, base, waist, 0.018, 0.016, 5)
        cyl(stems, waist, top, 0.016, 0.012, 5)
        tops.append(top)
    # povříslo kolem hrsti v pase
    for i in range(3):
        cyl(band, (0, 0, -0.24 + 0.05 * i), (0, 0, -0.2 + 0.05 * i), 0.14, 0.14, 24)
    for i, top in enumerate(tops):
        if i % 3 == 2:
            # tobolka se semeny na krátké stopce
            blob(bolls, (top + Vector((0, 0, 0.06)), (0, 0, 0)), (0.055, 0.055, 0.06), 10, 6)
            continue
        # květ: pět modrých okvětních lístků kolem žlutého středu, natočený k pozorovateli
        c = top + Vector((0, -0.02, 0.05))
        blob(centres, (c, (0, 0, 0)), (0.025, 0.025, 0.02), 8, 5)
        for j in range(5):
            ang = j * 2 * math.pi / 5 + rng.uniform(-0.15, 0.15)
            d = Vector((math.cos(ang), math.sin(ang) * 0.55, 0.45 + 0.1 * math.sin(ang)))
            blob(petals, (c + d.normalized() * 0.07, (math.radians(60), 0, ang)),
                 (0.07, 0.045, 0.012), 10, 5)
    objs = [
        to_obj(stems, "stems", mat("flax_stem", (0.46, 0.56, 0.2), 0.7, noise=20)),
        to_obj(band, "band", mat("flax_band", (0.62, 0.5, 0.26), 0.85, noise=30, bump=0.3)),
        to_obj(petals, "petals", mat("flax_flower", (0.2, 0.36, 0.86), 0.5)),
        to_obj(centres, "centres", mat("flax_centre", (0.85, 0.75, 0.25), 0.6)),
        to_obj(bolls, "bolls", mat("flax_boll", (0.58, 0.5, 0.22), 0.6, noise=20)),
    ]
    sun(az=-40, el=46, strength=4.2)
    camera(world_points(objs), az=0, el=12, margin=1.04)
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


def icon_fire():
    """Pálí se: hořící hromada větví a klestu na pasece – fáze pálení klučení (forest.md)."""
    logs, outer, inner = bmesh.new(), bmesh.new(), bmesh.new()
    for k in range(7):
        a = 2 * math.pi * k / 7 + 0.2
        d = Vector((math.cos(a), math.sin(a), 0))
        cyl(logs, (d * 0.75 + Vector((0, 0, 0.08)))[:], (-d * 0.12 + Vector((0, 0, 0.5 + 0.05 * (k % 3))))[:], 0.09, 0.07, 8)
    flame(outer, (0, 0, 0.25), 1.2, 0.4)
    flame(outer, (0.22, 0.06, 0.2), 0.75, 0.22, tilt=(0.25, 0.05))
    flame(outer, (-0.2, -0.07, 0.2), 0.8, 0.23, tilt=(-0.22, -0.05))
    flame(inner, (0, -0.05, 0.25), 0.65, 0.2)
    to_obj(logs, "branches", mat("branch", (0.2, 0.13, 0.07), 0.9, noise=26, bump=0.4))
    to_obj(outer, "flame", glow_mat("flame", (1.0, 0.36, 0.04), 2.2))
    to_obj(inner, "core", glow_mat("core", (1.0, 0.78, 0.25), 3.5))
    sun(az=-40, el=50, strength=3.5)
    camera([Vector((-0.9, -0.9, 0)), Vector((0.9, 0.9, 1.45))], az=0, el=20, margin=1.04)
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
    objs = hourglass_objs()
    sun(az=-40, el=35, strength=4.5)
    camera(world_points(objs), az=20, el=14, margin=1.04)
    return True


def hourglass_objs():
    """Díly přesýpacích hodin (rám, písek, sklo) – i do ikony štítu s hodinami."""
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
    return objs


def icon_balance(grain_in_pan=True):
    """Váhy (bilance obchodu se sousedem – trade.md): dřevěný sloupek s vahadlem, na krajích na
    šňůrách dvě bronzové misky, v jedné hromádka obilí (bez obilí – váhy rozsudku pána)."""
    wood, beam, pans, cords, grain = (bmesh.new() for _ in range(5))
    cyl(wood, (0, 0, 0), (0, 0, 0.08), 0.42, 0.4, 32)
    cyl(wood, (0, 0, 0.08), (0, 0, 1.28), 0.085, 0.07, 16)
    blob(wood, ((0, 0, 1.3), (0, 0, 0)), (0.08, 0.08, 0.08), 12, 8)
    cyl(beam, (-0.86, 0, 1.22), (0.86, 0, 1.22), 0.055, 0.055, 12)
    for x in (-0.86, 0.86):
        blob(beam, ((x, 0, 1.22), (0, 0, 0)), (0.05, 0.05, 0.05), 10, 6)
    pan_z = 0.46
    for x in (-0.78, 0.78):
        bowl = bmesh.new()
        revolve(bowl, [(0.0, 0.0), (0.03, 0.14), (0.08, 0.26), (0.13, 0.31), (0.135, 0.32)], seg=40)
        bmesh.ops.translate(bowl, verts=bowl.verts, vec=(x, 0, pan_z))
        me = bpy.data.meshes.new("tmp")
        bowl.to_mesh(me)
        bowl.free()
        pans.from_mesh(me)
        bpy.data.meshes.remove(me)
        for k in range(3):
            a = 2 * math.pi * k / 3 + math.pi / 2
            rim = (x + math.cos(a) * 0.3, math.sin(a) * 0.3, pan_z + 0.13)
            cyl(cords, (x * 1.1, 0, 1.2), rim, 0.016, 0.016, 5)
    rng = random.Random(9)
    for k in range(26 if grain_in_pan else 0):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.0, 0.2)
        blob(grain, ((-0.78 + math.cos(a) * r, math.sin(a) * r, pan_z + 0.12 + (0.2 - r) * 0.45),
                     (rng.uniform(0, 3), rng.uniform(0, 3), 0)), (0.045, 0.03, 0.03), 6, 4)
    objs = [
        to_obj(wood, "wood", mat("post", (0.42, 0.25, 0.12), 0.6, noise=16, bump=0.15)),
        to_obj(beam, "beam", mat("beam", (0.36, 0.22, 0.1), 0.55, noise=20, bump=0.1)),
        to_obj(pans, "pans", mat("bronze", (0.62, 0.4, 0.16), 0.38, noise=30)),
        to_obj(cords, "cords", mat("cord", (0.55, 0.45, 0.3), 0.9), smooth=False),
        to_obj(grain, "grain", mat("grain", (0.86, 0.66, 0.3), 0.8, noise=40)),
    ]
    sun(az=-40, el=40, strength=4.4)
    camera(world_points(objs), az=8, el=12, margin=1.04)
    return True


def icon_ard():
    """Rádlo (oxen.md – Ohrada volů, panel ohrady volů – páry s rádlem): dřevěné rádlo spřežení
    z `models/plough/ard.glb` (díl `ard` – tools/blender/plough.py) z boku ve 3/4, bez jha a oje."""
    objs = []
    for o in place_model("ard", folder=PLOUGH):
        if o.name.startswith("ard"):
            objs.append(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in objs:
        for slot in o.material_slots:
            bsdf = next((n for n in slot.material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf:  # dřevo rádla světlejší, ať je v malé ikoně vidět
                bsdf.inputs["Emission Color"].default_value = (0.45, 0.3, 0.16, 1)
                bsdf.inputs["Emission Strength"].default_value = 0.35
    sun(az=-30, el=50, strength=5.2)
    camera(world_points(objs), az=-70, el=30, margin=1.0)
    return True


MARE_FOAL_X, MARE_FOAL_Y = 1.6, -0.9  # hříbě u klisny (m, ladí se podle náhledu)
RIDER_LIFT, RIDER_TURN = 1.18, -115.0  # sedlo nad zemí a natočení jezdce ke směru koně


def stand_animal(name, folder=FAUNA, tint=None, turn=-115, loc=(0.0, 0.0), scale=1.0):
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
    if scale != 1.0 or loc != (0.0, 0.0):  # společník v ikoně (hříbě u klisny): menší a vedle
        shift = Matrix.Translation(Vector((loc[0], loc[1], 0.0))) @ Matrix.Scale(scale, 4)
        for o in roots:
            o.matrix_world = shift @ o.matrix_world
        bpy.context.view_layer.update()
    if tint:
        tint_imported(meshes, tint)
    return meshes


def icon_animal(name, folder=FAUNA, tint=None, turn=-115):
    meshes = stand_animal(name, folder, tint, turn)
    sun(az=-50, el=48, strength=4.0)
    camera(world_points(meshes), az=0, el=16, margin=1.06)
    return True


def icon_mare():
    """Klisna s hříbětem po boku (horses.md – Co hráč vidí): světlá klisna a vedle ní malé hříbě."""
    mare = stand_animal("horse", tint=(1.7, 1.5, 1.2))
    foal = stand_animal("foal", tint=(1.5, 1.35, 1.15), loc=(MARE_FOAL_X, MARE_FOAL_Y), scale=0.8)
    sun(az=-50, el=48, strength=4.0)
    camera(world_points(mare + foal), az=0, el=16, margin=1.06)
    return True


def icon_rider_horse():
    """Jezdecký kůň s jezdcem v sedle (klip `ride` z man.glb jako ve scéně)."""
    horse = stand_animal("horse")
    man = place_person("man", loc=(0.0, 0.0, RIDER_LIFT), turn=RIDER_TURN, frame=12, clip="ride")
    sun(az=-50, el=48, strength=4.0)
    camera(world_points(horse + man), az=0, el=16, margin=1.06)
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


def ore_nodule(bm, centre, size, rng):
    """Hrouda bahenní rudy: oblá, hrbolatá a pórovitá (limonit srážený v drnu)."""
    first = len(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    bm.verts.ensure_lookup_table()
    for v in list(bm.verts)[first:]:
        k = 1.0 + rng.uniform(-0.22, 0.22) + 0.2 * noise.noise(v.co * 2.7 + Vector(centre) * 5)
        v.co = Vector(centre) + Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) * k


def icon_ore():
    """Ruda: hromádka rezavých hrud bahenní rudy (crafts.md – Uhlí a ruda kováře) – okrové
    a rezavé, pórovité, matné."""
    rng = random.Random(31)
    bm = bmesh.new()
    lumps = [
        ((-0.46, 0.02, 0.14), (0.26, 0.22, 0.17)),
        ((-0.04, -0.2, 0.13), (0.28, 0.22, 0.16)),
        ((0.44, -0.02, 0.14), (0.25, 0.22, 0.17)),
        ((-0.22, 0.3, 0.13), (0.24, 0.2, 0.16)),
        ((0.24, 0.3, 0.13), (0.26, 0.2, 0.16)),
        ((-0.24, 0.02, 0.36), (0.25, 0.21, 0.17)),
        ((0.2, 0.0, 0.37), (0.26, 0.21, 0.18)),
        ((-0.02, 0.26, 0.35), (0.22, 0.19, 0.16)),
        ((-0.04, 0.08, 0.58), (0.24, 0.2, 0.17)),
        ((0.62, -0.3, 0.08), (0.12, 0.1, 0.08)),
        ((-0.66, -0.26, 0.07), (0.1, 0.09, 0.07)),
    ]
    for c, size in lumps:
        ore_nodule(bm, c, size, rng)
    m = mat("ore", (0.25, 0.1, 0.038), 0.95, noise=38, bump=1.6)
    o = to_obj(bm, "ore", m, smooth=False)
    o.data.update()
    sun(az=-45, el=42, strength=4.2, color=(1.0, 0.9, 0.75))
    sun(az=150, el=25, strength=2.5, color=(0.8, 0.88, 1.0))
    camera([Vector((-0.8, -0.45, 0)), Vector((0.8, 0.5, 0.78))], az=0, el=24, margin=1.04)
    return True


def clay_lump(bm, centre, size, rng):
    """Hrouda vlhké hlíny: oblá a hladká, místy seříznutá rýčem (rovná plocha nahoře)."""
    first = len(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    bm.verts.ensure_lookup_table()
    cut = rng.uniform(0.35, 0.7)
    for v in list(bm.verts)[first:]:
        k = 1.0 + rng.uniform(-0.04, 0.04) + 0.08 * noise.noise(v.co * 1.6 + Vector(centre) * 3)
        co = Vector((v.co.x * size[0], v.co.y * size[1], min(v.co.z, cut) * size[2])) * k
        v.co = Vector(centre) + co


def icon_clay():
    """Hlína: hromádka hladkých hrud vlhké hlíny, seříznutých rýčem (crafts.md – Hlína hrnčíře) –
    šedookrová, matná, s lesklejšími seříznutými plochami."""
    rng = random.Random(37)
    bm = bmesh.new()
    lumps = [
        ((-0.44, 0.02, 0.15), (0.3, 0.24, 0.2)),
        ((0.0, -0.22, 0.14), (0.32, 0.24, 0.19)),
        ((0.44, 0.0, 0.15), (0.28, 0.24, 0.2)),
        ((-0.2, 0.3, 0.14), (0.27, 0.22, 0.18)),
        ((0.22, 0.3, 0.14), (0.28, 0.22, 0.18)),
        ((-0.2, 0.04, 0.4), (0.28, 0.23, 0.19)),
        ((0.2, 0.02, 0.41), (0.28, 0.23, 0.2)),
        ((0.0, 0.18, 0.62), (0.25, 0.21, 0.18)),
        ((0.64, -0.3, 0.08), (0.12, 0.1, 0.08)),
    ]
    for c, size in lumps:
        clay_lump(bm, c, size, rng)
    m = mat("clay", (0.34, 0.2, 0.09), 0.45, noise=10, bump=0.25)
    o = to_obj(bm, "clay", m, smooth=True)
    o.data.update()
    sun(az=-45, el=42, strength=4.2, color=(1.0, 0.9, 0.75))
    sun(az=150, el=25, strength=2.5, color=(0.8, 0.88, 1.0))
    camera([Vector((-0.8, -0.45, 0)), Vector((0.8, 0.5, 0.82))], az=0, el=24, margin=1.04)
    return True
def ore_pit(bm, centre, radius, phase):
    """Jáma po rudě jako ve hře (ore-site-layout.ts – PIT_PROFILE): mokré dno těsně nad zemí,
    stěna, hřbet valu vykopané hlíny a vnější svah zanořený do drnu; okraj nepravidelný."""
    profile = [(0.0, 0.03), (0.3, 0.04), (0.55, 0.09), (0.8, 0.2), (1.0, 0.32), (1.3, 0.15), (1.7, -0.04)]
    seg = 40
    first = bm.verts.new((centre[0], centre[1], profile[0][1]))
    rings = []
    for t, up in profile[1:]:
        ring = []
        for s_ in range(seg):
            a = 2 * math.pi * s_ / seg
            wob = 1 + 0.12 * math.sin(3 * a + phase) + 0.06 * math.sin(5 * a + 2 * phase)
            r = radius * t * wob
            x, y = centre[0] + math.cos(a) * r, centre[1] + math.sin(a) * r
            lump = 0.03 * noise.noise(Vector((x * 3.1, y * 3.1, phase)))
            ring.append(bm.verts.new((x, y, up + (lump if t >= 0.8 else 0.0))))
        rings.append(ring)
    for s_ in range(seg):
        bm.faces.new((first, rings[0][s_], rings[0][(s_ + 1) % seg]))
    for inner, outer in zip(rings, rings[1:]):
        for s_ in range(seg):
            j = (s_ + 1) % seg
            bm.faces.new((inner[s_], outer[s_], outer[j], inner[j]))


def icon_rudiste():
    """Rudiště kováře (crafts.md – Uhlí a ruda kováře): mělké jámy v mokřině s kalnou vodou a valem
    vykopané hlíny, u nich hromádka rezavých hrud bahenní rudy a motyka – portrét panelu výběru."""
    ground(4.2, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.35, tint=(0.72, 0.8, 0.56)), z=0.0, fade=0.7)
    pits = [((-1.2, 0.6), 0.9, 0.4), ((1.0, 1.25), 0.72, 2.1), ((-0.1, -1.1), 0.6, 4.0)]
    earth = mat("pit", tex=f"{TEX}/mud.jpg", scale=0.9, tint=(0.66, 0.44, 0.27))
    pit_bm = bmesh.new()
    for c, r, ph in pits:
        ore_pit(pit_bm, c, r, ph)
    to_obj(pit_bm, "pits", earth)
    water = mat("water", (0.08, 0.075, 0.035), 0.12)
    for c, r, ph in pits:
        wb = bmesh.new()
        bmesh.ops.create_circle(wb, cap_ends=True, radius=r * 0.5, segments=32)
        w = to_obj(wb, "water", water, smooth=False)
        w.location = (c[0], c[1], 0.075)
    rng = random.Random(7)
    heap = bmesh.new()
    for k in range(22):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0, 0.55)
        z = 0.12 + (0.55 - d) * 0.8 + rng.uniform(-0.04, 0.04)
        size = rng.uniform(0.14, 0.21)
        ore_nodule(heap, (1.45 + math.cos(a) * d, -0.45 + math.sin(a) * d, z), (size, size * 0.9, size * 0.75), rng)
    to_obj(heap, "ore", mat("ore", (0.25, 0.1, 0.038), 0.95, noise=38, bump=1.6), smooth=False)
    hoe = bmesh.new()
    cyl(hoe, (2.15, -1.25, 0.05), (2.75, 0.1, 1.45), 0.05, 0.045, 10)
    box(hoe, (2.14, -1.3, 0.12), (0.09, 0.36, 0.26), (0.35, 0.0, 0.45))
    to_obj(hoe, "hoe", mat("wood", (0.33, 0.21, 0.11), 0.8, noise=60), smooth=True)
    sun(az=-50, el=44)
    sun(az=150, el=25, strength=1.4, color=(0.8, 0.88, 1.0))
    camera([Vector((-2.3, -1.9, 0)), Vector((2.8, 2.2, 0)), Vector((0, 0, 1.0))], az=14, el=38, margin=0.84)


def icon_humno():
    """Humno (production-chains.md – Humno): mlat pod širým nebem bez přístřešku – plochá
    udusaná světlá hlína 8 × 10 m s ostrým okrajem, na ní rozházená sláma a klasy a dva cepy,
    na kraji malý stoh slámy (`models/fields/haystack.glb`) – portrét mřížky staveb."""
    hay = place_model("haystack", folder=FIELDS)
    place_root(hay, (3.7, -3.6, 0), scale=0.7)
    tint_imported(hay, (1.08, 0.92, 0.55))
    ground(7.6, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.25, tint=(0.78, 0.84, 0.6)), z=0.0, fade=0.66)
    # mlat: světlá udusaná hlína, ostrý okraj, jen o fous nad trávou
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((x, y, 0.04)) for x, y in ((-4.0, -5.0), (4.0, -5.0), (4.0, 5.0), (-4.0, 5.0))])
    to_obj(bm, "floor", mat("floor", tex=f"{TEX}/mud.jpg", scale=0.6, tint=(1.5, 1.28, 1.0)), smooth=False)
    rng = random.Random(5)
    # rozházená sláma a klasy
    stalks, ears = bmesh.new(), bmesh.new()
    for _ in range(26):
        x, y = rng.uniform(-3.5, 3.3), rng.uniform(-4.5, 4.4)
        a = rng.uniform(0, math.pi)
        d = Vector((math.cos(a), math.sin(a), 0))
        p = Vector((x, y, 0.07))
        cyl(stalks, p - d * 0.45, p + d * 0.45, 0.028, 0.028, 6)
        blob(ears, ((p + d * 0.5)[:], (0, math.pi / 2, a)), (0.1, 0.12, 0.2), 8, 5)
    to_obj(stalks, "straw", mat("straw", (0.86, 0.66, 0.28), 0.8, noise=70, bump=0.4))
    to_obj(ears, "ears", mat("ear", (0.9, 0.68, 0.22), 0.75, noise=45, bump=0.4))
    # dva cepy: násada a bijec spojené řemenem, položené na mlatu
    wood = bmesh.new()
    cyl(wood, (-3.0, 2.6, 0.12), (-1.4, 1.1, 0.12), 0.075, 0.07, 10)
    cyl(wood, (-1.35, 1.05, 0.12), (-0.65, 1.3, 0.14), 0.1, 0.1, 10)
    cyl(wood, (-0.2, 3.6, 0.12), (1.6, 2.4, 0.12), 0.075, 0.07, 10)
    cyl(wood, (1.65, 2.35, 0.12), (2.3, 2.75, 0.14), 0.1, 0.1, 10)
    to_obj(wood, "flails", mat("wood", (0.44, 0.29, 0.15), 0.8, noise=50, bump=0.3))
    sun(az=-50, el=44)
    sun(az=150, el=25, strength=1.3, color=(0.8, 0.88, 1.0))
    pts = [Vector((-4.2, -5.2, 0)), Vector((4.6, 5.2, 0)), Vector((-4.2, 5.2, 0)), Vector((4.6, -5.2, 0))]
    camera(pts + [Vector((3.7, -3.6, 1.6))], az=24, el=40, margin=0.96)


def icon_milir():
    """Milíř uhlíře (crafts.md – Milíř u skácených buků): kouřící milíř z `models/crafts/milir.glb`
    na černém milířišti mezi pařezy skácených buků, kus hráně polen – portrét panelu výběru."""
    objs = place_model("milir", folder=CRAFTS)
    ground(6.2, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.3, tint=(0.66, 0.74, 0.5)), z=0.0, fade=0.7)
    smoke = mat("smoke", (0.78, 0.77, 0.74), 1.0)
    bsdf = next(n for n in smoke.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Alpha"].default_value = 0.55
    bm = bmesh.new()
    for k, (dx, dy, z, r) in enumerate(((0.0, 0.0, 2.7, 0.35), (0.25, 0.15, 3.3, 0.5), (0.65, 0.3, 4.0, 0.62))):
        blob(bm, ((dx, dy, z), (0, 0, k)), (r, r, r * 0.8), 12, 7)
    objs.append(to_obj(bm, "smoke", smoke))
    # pařezy skácených buků kolem milíře
    stumps = bmesh.new()
    for x, y, r in ((-2.9, 1.5, 0.3), (2.8, 1.9, 0.34), (-2.6, -2.0, 0.27)):
        cyl(stumps, (x, y, 0.0), (x, y, 0.42), r, r * 0.92, 12)
    objs.append(to_obj(stumps, "stumps", mat("bark", (0.36, 0.3, 0.24), 0.8, noise=40, bump=0.6)))
    tops = bmesh.new()
    for x, y, r in ((-2.9, 1.5, 0.29), (2.8, 1.9, 0.33), (-2.6, -2.0, 0.26)):
        bmesh.ops.create_circle(tops, cap_ends=True, radius=r, segments=12, matrix=Matrix.Translation((x, y, 0.425)))
    to_obj(tops, "stump-tops", mat("cut", (0.5, 0.38, 0.26), 0.75, noise=30), smooth=False)
    sun(az=-50, el=44)
    sun(az=150, el=25, strength=1.4, color=(0.8, 0.88, 1.0))
    pts = [Vector((p.x, p.y, max(p.z, 0.0))) for p in world_points(objs)]
    camera(pts, az=28, el=34, margin=0.9)


def icon_hliniste():
    """Hliniště hrnčíře (crafts.md – Hlína hrnčíře): mělké jámy u potoka se šedookrovou stěnou
    jílu, kalnou vodou a valem, u nich hromádka hladkých hrud vlhké hlíny seříznutých rýčem a rýč
    zabodnutý v hromadě – portrét panelu výběru (jako rudiště, jen hlína místo rudy)."""
    ground(4.2, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.35, tint=(0.72, 0.8, 0.56)), z=0.0, fade=0.7)
    pits = [((-1.2, 0.6), 0.9, 1.1), ((1.0, 1.25), 0.72, 2.9), ((-0.1, -1.1), 0.6, 4.6)]
    earth = mat("pit", tex=f"{TEX}/mud.jpg", scale=0.9, tint=(0.82, 0.72, 0.56))
    pit_bm = bmesh.new()
    for c, r, ph in pits:
        ore_pit(pit_bm, c, r, ph)
    to_obj(pit_bm, "pits", earth)
    water = mat("water", (0.13, 0.12, 0.08), 0.12)
    for c, r, ph in pits:
        wb = bmesh.new()
        bmesh.ops.create_circle(wb, cap_ends=True, radius=r * 0.5, segments=32)
        w = to_obj(wb, "water", water, smooth=False)
        w.location = (c[0], c[1], 0.075)
    rng = random.Random(11)
    heap = bmesh.new()
    for k in range(26):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0, 0.55)
        z = 0.1 + (0.55 - d) * 0.8 + rng.uniform(-0.03, 0.03)
        size = rng.uniform(0.13, 0.19)
        clay_lump(heap, (1.45 + math.cos(a) * d, -0.45 + math.sin(a) * d, z), (size, size * 0.85, size * 0.7), rng)
    to_obj(heap, "clay", mat("clay", (0.27, 0.19, 0.11), 0.4, noise=10, bump=0.25), smooth=True)
    # rýč: násada s příčnou rukojetí, dřevěný list s okovaným ostřím zabodnutý šikmo v hromadě
    wood, iron = bmesh.new(), bmesh.new()
    top, foot = Vector((2.4, 0.5, 2.0)), Vector((1.75, -0.35, 0.95))
    cyl(wood, top, foot, 0.06, 0.065, 10)
    d = (foot - top).normalized()
    side = d.cross(Vector((0, 0, 1))).normalized()
    cyl(wood, top - side * 0.2, top + side * 0.2, 0.05, 0.05, 8)
    # list v rovině násady a příčky: šířka podél `side`, délka podél násady, tloušťka kolmo
    axes = Matrix((side, side.cross(d).normalized(), d)).transposed()

    def blade(bm, centre, size):
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r["verts"]:
            v.co = centre + axes @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))

    blade(wood, foot + d * 0.2, (0.36, 0.06, 0.42))
    blade(iron, foot + d * 0.45, (0.37, 0.065, 0.1))
    to_obj(wood, "spade", mat("wood", (0.33, 0.21, 0.11), 0.8, noise=60), smooth=True)
    to_obj(iron, "spade-edge", mat("iron", (0.16, 0.15, 0.14), 0.45), smooth=False)
    sun(az=-50, el=44)
    sun(az=150, el=25, strength=1.4, color=(0.8, 0.88, 1.0))
    camera([Vector((-2.3, -1.9, 0)), Vector((2.8, 2.2, 0)), Vector((0, 0, 1.0))], az=14, el=38, margin=0.84)


def icon_obilna_jama():
    """Otevřená obilná jáma (production-chains.md – Obilné jámy): hrdlo hruškovité jámy v drnu
    s nízkým valem hlíny, uvnitř tmavá vypálená stěna a zrno, vedle hroudy hlíny z odkryté pečeti
    a dřevěná lopata – portrét panelu výběru otevřené jámy."""
    g = ground(3.4, mat("g", tex=f"{TEX}/grass-lush.jpg", scale=0.35, tint=(0.72, 0.8, 0.56)), z=0.0, fade=0.7)
    # v drnu díra pro hrdlo – země jako mezikruží (kraj díry schová val)
    ann = bmesh.new()
    radii = [0.7] + [0.9 + 0.25 * k for k in range(11)]
    rings_g = [
        [ann.verts.new((math.cos(2 * math.pi * s_ / 96) * r, math.sin(2 * math.pi * s_ / 96) * r, 0.0)) for s_ in range(96)]
        for r in radii
    ]
    for inner, outer in zip(rings_g, rings_g[1:]):
        for s_ in range(96):
            j = (s_ + 1) % 96
            ann.faces.new((inner[s_], outer[s_], outer[j], inner[j]))
    ann.to_mesh(g.data)
    ann.free()
    # stěna hrdla (tmavá, vypálená) a val z hlíny – prstence od zrna ven pod drn
    profile = [(0.55, -0.3), (0.66, -0.12), (0.74, 0.04), (0.86, 0.15), (1.0, 0.17), (1.45, -0.04)]
    seg = 48
    rings = []
    bm = bmesh.new()
    for t, up in profile:
        ring = []
        for s_ in range(seg):
            a = 2 * math.pi * s_ / seg
            wob = 1 + (0.06 * math.sin(3 * a + 0.7) if t >= 0.86 else 0.0)
            r = 1.0 * t * wob
            x, y = math.cos(a) * r, math.sin(a) * r
            lump = 0.025 * noise.noise(Vector((x * 3.3, y * 3.3, 1.7))) if t >= 0.86 else 0.0
            ring.append(bm.verts.new((x, y, up + lump)))
        rings.append(ring)
    wall_faces, rim_faces = [], []
    for k, (inner, outer) in enumerate(zip(rings, rings[1:])):
        for s_ in range(seg):
            j = (s_ + 1) % seg
            f = bm.faces.new((inner[s_], outer[s_], outer[j], inner[j]))
            (wall_faces if k < 2 else rim_faces).append(f)
    wall = mat("wall", (0.12, 0.085, 0.055), 0.95, noise=30, bump=0.4)
    clay = mat("rim", tex=f"{TEX}/mud.jpg", scale=0.9, tint=(0.7, 0.55, 0.36))
    pit = to_obj(bm, "pit", clay)
    pit.data.materials.append(wall)
    for f in pit.data.polygons:
        f.material_index = 1 if f.index < len(wall_faces) else 0
    # zrno v jámě – hrbolatá hladina, ze hrdla prosvítá
    grain = bmesh.new()
    blob(grain, ((0.0, 0.0, -0.24), (0, 0, 0)), (0.6, 0.6, 0.1), 40, 12)
    to_obj(grain, "grain", mat("grain", (0.78, 0.56, 0.22), 0.65, noise=160, bump=0.8))
    # hroudy pečeti vedle hrdla
    rng = random.Random(23)
    lumps = bmesh.new()
    for k in range(16):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0, 0.42)
        size = rng.uniform(0.15, 0.24)
        clay_lump(lumps, (1.6 + math.cos(a) * d, -0.5 + math.sin(a) * d, 0.1 + (0.42 - d) * 0.45), (size, size * 0.85, size * 0.62), rng)
    to_obj(lumps, "seal", mat("seal", (0.36, 0.25, 0.14), 0.5, noise=12, bump=0.3), smooth=True)
    # dřevěná lopata opřená o val
    wood = bmesh.new()
    cyl(wood, (-1.8, 1.25, 0.1), (-0.6, 0.55, 0.3), 0.05, 0.05, 10)
    box(wood, (-0.47, 0.47, 0.29), (0.34, 0.27, 0.04), (0.0, -0.2, -0.52))
    to_obj(wood, "shovel", mat("wood", (0.42, 0.28, 0.14), 0.8, noise=50, bump=0.3))
    sun(az=-50, el=55)
    sun(az=150, el=30, strength=1.5, color=(0.8, 0.88, 1.0))
    camera([Vector((-1.7, -1.3, 0)), Vector((2.05, 1.3, 0)), Vector((0, 0, 0.4))], az=14, el=55, margin=0.84)

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
    # sekera: topůrko zprava dole doleva nahoru, list s bradou míří doprava (list větší než
    # skutečně – ikona se čte i ve 26 px)
    axe(wood, iron, edge, Vector((0.74, 0.0, -0.78)), Vector((-0.46, 0.0, 0.76)))
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


def lying_plate(bm, pts, z, thickness):
    """Plochý díl ležící na zemi – obrys `pts` v rovině XY, tloušťka ve směru Z."""
    bottom = [bm.verts.new((x, y, z)) for x, y in pts]
    top = [bm.verts.new((x, y, z + thickness)) for x, y in pts]
    bm.faces.new(bottom[::-1])
    bm.faces.new(top)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))


def icon_iron_bars():
    """Hřivny: tři sekerovité železné hřivny (dlouhý plochý prut, na konci rozšířený do listu
    s ouškem) na sobě – zásoba železa u kovárny (production-chains.md – Kovář)."""
    bars = bmesh.new()
    # obrys hřivny podél osy x: úzký krček, list sekery na pravém konci, na levém zahnuté ouško
    outline = [
        (-0.95, -0.07), (-0.9, -0.12), (-0.78, -0.09), (0.35, -0.06), (0.62, -0.2),
        (0.86, -0.27), (0.92, 0.0), (0.86, 0.27), (0.62, 0.2), (0.35, 0.06),
        (-0.78, 0.09), (-0.9, 0.12), (-0.95, 0.07),
    ]
    for k, (dx, dy, ang) in enumerate([(0.0, -0.32, 0.06), (0.05, 0.3, -0.05), (-0.04, 0.0, 0.22)]):
        c, si = math.cos(ang), math.sin(ang)
        pts = [(dx + x * c - y * si, dy + x * si + y * c) for x, y in outline]
        lying_plate(bars, pts, 0.11 * k + (0.02 if k == 2 else 0.0), 0.1)
    bmesh.ops.recalc_face_normals(bars, faces=bars.faces)
    m = mat("bars", (0.22, 0.2, 0.19), 0.55, noise=22, bump=0.6)
    next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.55
    to_obj(bars, "bars", m, smooth=False)
    sun(az=-40, el=45, strength=4.4)
    sun(az=150, el=25, strength=2.2, color=(0.8, 0.88, 1.0))
    camera([Vector((-1.0, -0.65, 0)), Vector((1.0, 0.65, 0.35))], az=0, el=38, margin=1.04)
    return True


def icon_bloom():
    """Železná houba: struskovitý pórovitý bochník železa z redukční pece – tmavý, se šedou kůrou
    a rezavými skvrnami (production-chains.md – Kovář)."""
    rng = random.Random(17)
    bm = bmesh.new()
    first = len(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    bm.verts.ensure_lookup_table()
    for v in list(bm.verts)[first:]:
        k = 1.0 + 0.16 * noise.noise(v.co * 2.2) + 0.08 * noise.noise(v.co * 7.0) + rng.uniform(-0.03, 0.03)
        flat = 0.62 if v.co.z > 0 else 0.42
        v.co = Vector((v.co.x * 0.9 * k, v.co.y * 0.8 * k, v.co.z * flat * k))
    m = mat("bloom", (0.13, 0.11, 0.1), 0.9, noise=46, bump=2.4, tint=(0.32, 0.14, 0.06))
    to_obj(bm, "bloom", m, smooth=True)
    sun(az=-45, el=42, strength=4.4, color=(1.0, 0.9, 0.75))
    sun(az=150, el=25, strength=2.4, color=(0.8, 0.88, 1.0))
    camera([Vector((-0.95, -0.85, -0.42)), Vector((0.95, 0.85, 0.62))], az=0, el=24, margin=1.04)
    return True


def icon_harvest():
    """Sklizeň (žeň): srp zkřížený s uříznutou hrstí zralých klasů – panel dílu pole (fields.md)."""
    rng = random.Random(23)
    wood, iron, edge, stems, ears, awns = (bmesh.new() for _ in range(6))
    # hrst klasů: stébla od uříznutého konce vlevo dole vějířem doprava nahoru, nahoře plné klasy
    base_c, lean = Vector((-0.5, 0.2, -0.85)), Vector((0.38, 0.0, 1.0)).normalized()
    side = Vector((lean.z, 0, -lean.x))
    for i in range(9):
        fan = (i - 4) / 4
        base = base_c + side * fan * 0.1 + Vector((0, rng.uniform(-0.06, 0.06), 0))
        d = (lean + side * (fan * 0.32 + rng.uniform(-0.05, 0.05))).normalized()
        top = base + d * rng.uniform(1.15, 1.3)
        cyl(stems, base, top, 0.03, 0.022, 6)
        for k in range(5):
            c = top + d * (0.08 + 0.085 * k)
            alt = 1 if k % 2 == 0 else -1
            o2 = Vector((d.z, 0, -d.x)) * 0.05 * alt
            ax = d.to_track_quat("Z", "Y").to_euler()
            blob(ears, ((c + o2)[:], tuple(ax)), (0.075, 0.075, 0.12), 8, 5)
            tip = c + o2 + d * 0.1
            cyl(awns, tip, tip + d * 0.32 + o2 * 1.6, 0.012, 0.0, 3)
    # provázek kolem hrsti
    mid = base_c + lean * 0.38
    for k in range(18):
        a0, a1 = 2 * math.pi * k / 18, 2 * math.pi * (k + 1) / 18
        w = Vector((0, 1, 0))
        p0 = mid + (side * math.cos(a0) + w * math.sin(a0)) * 0.17
        p1 = mid + (side * math.cos(a1) + w * math.sin(a1)) * 0.17
        cyl(wood, p0, p1, 0.035, 0.035, 5)
    # srp vpředu: rukojeť vpravo dole, čepel srpkem doleva nahoru a dolů ke špičce
    c, R = Vector((0.18, 0.0, 0.02)), 0.56
    a0, a1 = math.radians(-28), math.radians(196)
    start = c + Vector((math.cos(a0), 0, math.sin(a0))) * R
    cyl(wood, (0.92, -0.24, -0.9), (start.x - 0.03, -0.24, start.z + 0.02), 0.1, 0.09, 10)
    steps = 28
    outer, inner, honed = [], [], []
    for i in range(steps + 1):
        t = i / steps
        a = a0 + (a1 - a0) * t
        w = 0.24 * (1 - t) ** 0.7 + 0.008
        rr = R + 0.04 * math.sin(math.pi * t)
        outer.append((c.x + math.cos(a) * rr, c.z + math.sin(a) * rr))
        inner.append((c.x + math.cos(a) * (rr - w), c.z + math.sin(a) * (rr - w)))
        honed.append((c.x + math.cos(a) * (rr - w * 0.7), c.z + math.sin(a) * (rr - w * 0.7)))
    flat_plate(iron, outer + inner[::-1], -0.24, 0.07)
    # broušené ostří – světlejší pruh na vnitřní (řezné) straně čepele
    flat_plate(edge, honed + inner[::-1], -0.24, 0.075)
    bmesh.ops.recalc_face_normals(iron, faces=iron.faces)
    bmesh.ops.recalc_face_normals(edge, faces=edge.faces)
    to_obj(stems, "stems", mat("stem", (0.84, 0.66, 0.3), 0.7))
    to_obj(ears, "ears", mat("ear", (0.95, 0.74, 0.27), 0.65, noise=30))
    to_obj(awns, "awns", mat("awn", (0.92, 0.76, 0.4), 0.6))
    to_obj(wood, "handle", mat("haft", (0.62, 0.42, 0.22), 0.75, noise=18, bump=0.3))
    ir = mat("forged", (0.36, 0.36, 0.38), 0.42, noise=14, bump=0.4)
    next(x for x in ir.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.65
    to_obj(iron, "iron", ir, smooth=False)
    ed = mat("edge", (0.74, 0.74, 0.76), 0.3)
    next(x for x in ed.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.8
    to_obj(edge, "edge", ed, smooth=False)
    sun(az=-35, el=45, strength=4.4)
    camera([Vector((-0.95, -0.3, -0.95)), Vector((0.95, 0.3, 1.15))], az=0, el=8, margin=1.02)
    return True


def icon_sheaves():
    """Snopy (production-chains.md – Humno): dva svázané snopy zralého obilí stojící opřené
    o sebe jako v panáku – stébla svázaná povříslem, nahoře hustý chochol klasů s osinami –
    nevymlácené zrno v horní liště."""
    rng = random.Random(41)
    stems, ears, awns, ties = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()

    def sheaf(base, axis, length, radius):
        """Snop od uříznutých stébel `base` ve směru `axis`: stébla, povříslo, chochol klasů."""
        axis = Vector(axis).normalized()
        side = axis.cross(Vector((0, 1, 0)))
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(axis).normalized()
        tie_at = 0.42
        for k in range(48):
            a = rng.uniform(0, 2 * math.pi)
            r = radius * rng.uniform(0.15, 1.0) ** 0.5
            off = side * math.cos(a) * r + up * math.sin(a) * r
            # u povřísla stažené, k uříznutým koncům a ke klasům se rozevírají
            b = Vector(base) + off * 1.15
            m = Vector(base) + axis * length * tie_at + off * 0.55
            t = Vector(base) + axis * length * rng.uniform(0.9, 1.0) + off * 1.9
            cyl(stems, b, m, 0.016, 0.014, 4)
            cyl(stems, m, t, 0.014, 0.012, 4)
            d = (t - m).normalized()
            for j in range(4):
                c = t + d * (0.04 + 0.06 * j)
                q = d.to_track_quat("Z", "Y").to_euler()
                blob(ears, (c[:], tuple(q)), (0.055, 0.055, 0.085), 7, 4)
            tip = t + d * 0.27
            cyl(awns, tip, tip + d * 0.22 + off * 0.4, 0.008, 0.0, 3)
        mid = Vector(base) + axis * length * tie_at
        cyl(ties, mid - axis * 0.05, mid + axis * 0.05, radius * 0.62, radius * 0.62, 16)

    sheaf((-0.42, 0.0, -0.95), (0.28, 0.0, 1.0), 1.45, 0.24)
    sheaf((0.42, 0.12, -0.95), (-0.28, 0.0, 1.0), 1.45, 0.24)
    to_obj(stems, "stems", mat("straw", (0.86, 0.66, 0.28), 0.8, noise=60, bump=0.35))
    to_obj(ears, "ears", mat("ear", (0.95, 0.74, 0.27), 0.65, noise=30))
    to_obj(awns, "awns", mat("awn", (0.92, 0.76, 0.4), 0.6))
    to_obj(ties, "ties", mat("tie", (0.56, 0.41, 0.18), 0.85, noise=40))
    sun(az=-35, el=45, strength=4.4)
    camera([Vector((-1.0, -0.4, -1.0)), Vector((1.0, 0.4, 1.0))], az=0, el=8, margin=1.02)
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


# ------------------------------------------------------------------ vozy ----
# wagons.md – vůz a dřevěné nářadí od tesaře (ikony surovin; portrét dílny tesaře je icon_craft).


def box(bm, centre, size, rot=(0.0, 0.0, 0.0)):
    """Kvádr (trám, prkno) se středem `centre`, rozměry `size` (x, y, z), natočený po Eulerovi `rot`."""
    r = bmesh.ops.create_cube(bm, size=1.0)
    m = Euler(rot).to_matrix()
    for v in r["verts"]:
        v.co = Vector(centre) + m @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))


def cart_wheel(bm, centre, radius, axis, spokes=8, rim=0.06, hub=0.11):
    """Loukoťové kolo: věnec z loukotí, náboj a paprsky; `axis` – osa kola (jednotkový vektor)."""
    c, a = Vector(centre), Vector(axis).normalized()
    u = a.cross(Vector((0, 0, 1)))
    if u.length < 1e-6:
        u = a.cross(Vector((1, 0, 0)))
    u.normalize()
    v = a.cross(u)
    seg = 24
    pts = [c + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * radius for i in range(seg)]
    for i in range(seg):
        cyl(bm, pts[i], pts[(i + 1) % seg], rim, rim, 8)
    cyl(bm, c - a * 0.16, c + a * 0.16, hub, hub * 0.85, 12)
    for k in range(spokes):
        ang = 2 * math.pi * k / spokes
        d = u * math.cos(ang) + v * math.sin(ang)
        cyl(bm, c + d * hub, c + d * (radius - rim), 0.03, 0.026, 6)


def two_wheel_cart(wood, rot=0.0, at=(0.0, 0.0, 0.0)):
    """Dvoukolák: korba z prken s bočnicemi na ose, dvě loukoťová kola, oj vpřed s jhem (+X)."""
    o = Vector(at)
    m = Euler((0, 0, rot)).to_matrix()
    P = lambda x, y, z: o + m @ Vector((x, y, z))  # noqa: E731
    R = 0.55
    box(wood, P(0.0, 0.0, R + 0.18), (1.7, 1.05, 0.07), (0, 0, rot))
    for y in (-0.5, 0.5):
        box(wood, P(0.0, y, R + 0.36), (1.7, 0.05, 0.3), (0, 0, rot))
    for x in (-0.82, 0.82):
        box(wood, P(x, 0.0, R + 0.32), (0.05, 1.0, 0.24), (0, 0, rot))
    cyl(wood, P(0.0, -0.72, R), P(0.0, 0.72, R), 0.06, 0.06, 10)
    for y in (-0.66, 0.66):
        cart_wheel(wood, P(0.0, y, R), R, m @ Vector((0, 1, 0)))
    # oj od korby k jhu, jho napříč
    cyl(wood, P(0.6, 0.0, R + 0.12), P(2.6, 0.0, R + 0.32), 0.06, 0.05, 10)
    cyl(wood, P(2.55, -0.6, R + 0.36), P(2.55, 0.6, R + 0.36), 0.06, 0.06, 10)


def icon_cart():
    """Vůz: dvoukolák s loukoťovými koly, korbou z prken a ojí s jhem (wagons.md – Vůz)."""
    wood = bmesh.new()
    two_wheel_cart(wood)
    to_obj(wood, "cart", mat("oak", (0.55, 0.37, 0.2), 0.8, noise=24, bump=0.3))
    sun(az=-40, el=48, strength=4.4)
    camera([Vector((-1.0, -0.85, 0.0)), Vector((2.75, 0.85, 1.05))], az=-28, el=22, margin=1.02)
    return True


def icon_wood_tools():
    """Dřevěné nářadí: hrábě zkřížené s dřevěnými vidlemi (wagons.md – Tesař)."""
    wood, light = bmesh.new(), bmesh.new()
    # hrábě: násada zleva dole doprava nahoru, příčka s kolíky
    h0, h1 = Vector((-0.85, 0.0, -0.9)), Vector((0.55, 0.0, 0.75))
    cyl(wood, h0, h1, 0.055, 0.05, 10)
    d = (h1 - h0).normalized()
    n = Vector((-d.z, 0, d.x))
    head = h1 + d * 0.04
    cyl(light, head - n * 0.55, head + n * 0.55, 0.07, 0.07, 10)
    for k in range(9):
        p = head - n * 0.48 + n * (0.96 * k / 8)
        cyl(light, p, p + d * 0.22, 0.025, 0.018, 6)
    # vidle: násada zprava dole doleva nahoru, tři ohnuté hroty
    f0, f1 = Vector((0.85, -0.12, -0.9)), Vector((-0.35, -0.12, 0.45))
    cyl(wood, f0, f1, 0.055, 0.05, 10)
    e = (f1 - f0).normalized()
    m = Vector((-e.z, 0, e.x))
    for k in (-1, 0, 1):
        prev = f1
        for t in range(1, 6):
            q = f1 + e * (0.12 * t) + m * (k * 0.06 * t)
            cyl(light, prev, q, 0.03 - 0.003 * t, 0.027 - 0.003 * t, 6)
            prev = q
    to_obj(wood, "handles", mat("haft", (0.62, 0.42, 0.22), 0.75, noise=18, bump=0.3))
    to_obj(light, "heads", mat("ash", (0.82, 0.64, 0.4), 0.7, noise=20, bump=0.2))
    sun(az=-35, el=45, strength=4.4)
    camera([Vector((-1.15, -0.3, -1.0)), Vector((1.0, 0.3, 1.25))], az=0, el=8, margin=1.02)
    return True


def icon_skill():
    """Zkušenost řemeslníka (crafts.md – Učení řemesla): dřevěná palička zkřížená s dlátem –
    nářadí, se kterým se učeň učí od mistra."""
    wood, light, iron, edge = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    # palička: násada zprava dole doleva nahoru, soudkovitá hlava napříč na horním konci
    h0, h1 = Vector((0.78, 0.0, -0.86)), Vector((-0.26, 0.0, 0.36))
    cyl(wood, h0, h1, 0.07, 0.064, 10)
    d = (h1 - h0).normalized()
    n = Vector((-d.z, 0, d.x))
    head = h1 + d * 0.16
    steps = 8
    prev = head - n * 0.4
    for i in range(1, steps + 1):
        t = i / steps
        q = head - n * 0.4 + n * (0.8 * t)
        r0 = 0.2 + 0.05 * math.sin(math.pi * (i - 1) / steps)
        r1 = 0.2 + 0.05 * math.sin(math.pi * t)
        cyl(light, prev, q, r0, r1, 18)
        prev = q
    # dláto: dřevěná rukojeť vlevo dole, železná čepel doprava nahoru, u rukojeti kroužek
    c0, c1 = Vector((-0.86, -0.22, -0.86)), Vector((-0.34, -0.22, -0.3))
    cyl(wood, c0, c1, 0.09, 0.075, 12)
    e = (c1 - c0).normalized()
    m = Vector((-e.z, 0, e.x))
    ring = c1 + e * 0.02
    cyl(iron, c1 - e * 0.03, ring + e * 0.04, 0.085, 0.085, 12)
    tip = c1 + e * 1.05
    shank = c1 + e * 0.16
    to_xz = lambda p: (p.x, p.z)  # noqa: E731
    blade = [
        shank - m * 0.04, shank + e * 0.1 - m * 0.07, tip - m * 0.075,
        tip + m * 0.075, shank + e * 0.1 + m * 0.07, shank + m * 0.04,
    ]
    flat_plate(iron, [to_xz(p) for p in blade], -0.22, 0.05)
    bevel = [tip - e * 0.12 - m * 0.075, tip - m * 0.075, tip + m * 0.075, tip - e * 0.12 + m * 0.075]
    flat_plate(edge, [to_xz(p) for p in bevel], -0.22, 0.055)
    bmesh.ops.recalc_face_normals(iron, faces=iron.faces)
    bmesh.ops.recalc_face_normals(edge, faces=edge.faces)
    to_obj(wood, "handles", mat("haft", (0.62, 0.42, 0.22), 0.75, noise=18, bump=0.3))
    to_obj(light, "mallet", mat("beech", (0.66, 0.46, 0.25), 0.7, noise=22, bump=0.25))
    ir = mat("forged", (0.36, 0.36, 0.38), 0.42, noise=14, bump=0.4)
    next(x for x in ir.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.65
    to_obj(iron, "iron", ir, smooth=False)
    ed = mat("edge", (0.72, 0.72, 0.74), 0.3)
    next(x for x in ed.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.8
    to_obj(edge, "edge", ed, smooth=False)
    sun(az=-35, el=45, strength=4.4)
    camera([Vector((-1.0, -0.3, -1.0)), Vector((0.95, 0.3, 1.0))], az=0, el=8, margin=1.02)
    return True


# --------------------------------------------------------------- hlavní ----

BUILD = {
    "zemnice": lambda: icon_dwelling("zemnice"),
    "polozemnice": lambda: icon_dwelling("polozemnice"),
    "dvorec": lambda: icon_dwelling("dvorec"),
    "srub": lambda: icon_dwelling("srub", pit=False),
    "dvorec-srub": lambda: icon_dwelling("dvorec-srub", pit=False),
    "pole": icon_pole,
    "hrbitov": icon_hrbitov,
    "hrncir": lambda: icon_craft("hrncir"),
    "kovar": lambda: icon_craft("kovar"),
    "tesar": lambda: icon_craft("tesar"),
    "uhlir": lambda: icon_craft("uhlir"),
    "sad": icon_sad,
    "modla": icon_modla,
    "svatyne": icon_svatyne,
    "dub": icon_dub,
    "sous": icon_sous,
    "haj": icon_haj,
    "ohrada": icon_ohrada,
    "opevneni": icon_opevneni,
    "cesta": lambda: icon_road("cesta"),
    "cesta-vyjezdena": lambda: icon_road("cesta-vyjezdena"),
    "cesta-vozova": lambda: icon_road("cesta-vozova"),
    "cesta-upravena": lambda: icon_road("cesta-upravena"),
    "hat": lambda: icon_road("hat"),
    "krizovatka-kriz": lambda: icon_junction("kriz"),
    "krizovatka-y": lambda: icon_junction("y"),
    "jablone": icon_jablone,
    "stezka": icon_stezka,
    "obchod": icon_obchod,
    "rudiste": icon_rudiste,
    "hliniste": icon_hliniste,
    "humno": icon_humno,
    "milir": icon_milir,
    "obilna-jama": icon_obilna_jama,
}

# ------------------------------------------------------------- rodiny ----
# Ikony panelu obydlí (kinship.md – Co hráč vidí): muž, žena, děti, starší a prsten (manželské
# páry). Postavy jsou vesničané hry (`apps/web/public/models/people/`, z 0 A.D.) v klidové pózy
# ze snímku klipu `idle`.


def place_person(name, loc=(0.0, 0.0, 0.0), scale=1.0, turn=-20.0, frame=12, clip="idle"):
    """Vesničan `man` / `woman` v pozici `loc`: klip `clip` (idle, ride) na snímku `frame`, natočený."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{PEOPLE}/{name}.glb")
    new = [o for o in bpy.data.objects if o not in before]
    helpers = [o for o in new if o.name.startswith("Icosphere")]
    new = [o for o in new if o not in helpers]
    for o in helpers:
        bpy.data.objects.remove(o, do_unlink=True)
    rig = next(o for o in new if o.type == "ARMATURE")
    idle = next(a for a in bpy.data.actions if a.name == clip or a.name.startswith(clip))
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


def icon_spear():
    """Oštěp (lov – wildlife.md): dřevěná tyč šikmo a listovitá železná hrot s krátkou objímkou."""
    wood, iron = bmesh.new(), bmesh.new()
    h0, h1 = Vector((-0.8, 0.0, -0.95)), Vector((0.55, 0.0, 0.62))
    cyl(wood, h0, h1, 0.09, 0.07, 10)
    d = (h1 - h0).normalized()
    n = Vector((d.z, 0, -d.x))
    cyl(iron, h1 - d * 0.05, h1 + d * 0.16, 0.12, 0.1, 10)  # objímka
    base = h1 + d * 0.14
    blade = [(0.0, -0.1), (0.2, -0.2), (0.5, -0.17), (0.82, 0.0), (0.5, 0.17), (0.2, 0.2), (0.0, 0.1)]
    pts = []
    for u, v in blade:
        q = base + d * u * 1.15 + n * v * 1.15
        pts.append((q.x, q.z))
    flat_plate(iron, pts, 0.0, 0.07)
    to_obj(wood, "shaft", mat("wood", (0.46, 0.3, 0.15), 0.9, noise=22, bump=0.4))
    to_obj(iron, "head", mat("iron", (0.52, 0.53, 0.56), 0.5, noise=14, bump=0.2))
    sun(az=-50, el=48, strength=4.0)
    camera([Vector((-1.0, -0.5, -1.0)), Vector((1.2, 0.5, 1.6))], az=0, el=20, margin=1.06)
    return True


def icon_watch_fire():
    """Oheň hlídky (zvěř – wildlife.md): pochodeň v kolu a plamen nad uhlíky – hlídka u stáda v noci."""
    wood, wrap, outer, inner = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    cyl(wood, (0.0, 0.0, -1.0), (0.0, 0.0, 0.55), 0.1, 0.085, 10)
    cyl(wrap, (0.0, 0.0, 0.3), (0.0, 0.0, 0.72), 0.17, 0.2, 12)  # hadry s pryskyřicí
    flame(outer, (0, 0, 0.62), 1.05, 0.3)
    flame(outer, (0.16, 0.03, 0.6), 0.62, 0.17, tilt=(0.25, 0.05))
    flame(outer, (-0.15, -0.04, 0.6), 0.7, 0.18, tilt=(-0.22, -0.05))
    flame(inner, (0, -0.04, 0.64), 0.56, 0.17)
    to_obj(wood, "pole", mat("wood", (0.4, 0.26, 0.13), 0.9, noise=22, bump=0.4))
    to_obj(wrap, "wrap", mat("wrap", (0.14, 0.1, 0.07), 0.95, noise=18, bump=0.4))
    to_obj(outer, "flame", glow_mat("flame", (1.0, 0.36, 0.04), 2.2))
    to_obj(inner, "core", glow_mat("core", (1.0, 0.78, 0.25), 3.5))
    sun(az=-40, el=50, strength=3.5)
    camera([Vector((-0.9, -0.6, -1.0)), Vector((0.9, 0.6, 1.8))], az=0, el=20, margin=1.06)
    return True


# ------------------------------------------------- počasí a pohromy (disasters.md) ----


def ear_on(bm, top, d, size=1.0):
    """Klas na konci stébla `top` ve směru `d` (jako ve snopku `food`) s osinami."""
    d = Vector(d).normalized()
    ax = d.to_track_quat("Z", "Y").to_euler()
    c = Vector(top) + d * 0.2 * size
    blob(bm, (c[:], tuple(ax)), (0.11 * size, 0.11 * size, 0.3 * size), 8, 6)
    side = d.cross(Vector((0, 1, 0))).normalized()
    for k in range(1, 6):
        cc = Vector(top) + d * (0.08 + 0.07 * k) * size
        cyl(bm, cc[:], (cc + d * 0.26 * size + side * 0.07 * size)[:], 0.011, 0.0, 3)


def icon_drought():
    """Sucho: rozpraskaná vyprahlá zem (kry hlíny se spárami) a uschlé stéblo se svěšeným klasem."""
    rng = random.Random(21)
    clods, stalk = bmesh.new(), bmesh.new()
    step = 0.52
    for i in range(-3, 4):
        for j in range(-3, 4):
            cx = i * step + (j % 2) * step / 2 + rng.uniform(-0.06, 0.06)
            cy = j * step * 0.87 + rng.uniform(-0.06, 0.06)
            if cx * cx + cy * cy > 1.25:
                continue
            k = rng.randint(5, 7)
            a0 = rng.uniform(0, 6.28)
            pts = []
            for m in range(k):
                a = a0 + 2 * math.pi * m / k + rng.uniform(-0.25, 0.25)
                rr = step * 0.5 * rng.uniform(0.84, 0.94)
                pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            h, tx, ty = rng.uniform(0.07, 0.1), rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1)
            top = [clods.verts.new((x, y, h + tx * (x - cx) + ty * (y - cy))) for x, y in pts]
            bot = [clods.verts.new((x, y, 0)) for x, y in pts]
            clods.faces.new(top)
            clods.faces.new(bot[::-1])
            for m in range(k):
                n = (m + 1) % k
                clods.faces.new((bot[m], bot[n], top[n], top[m]))
    bmesh.ops.recalc_face_normals(clods, faces=clods.faces)
    knee = Vector((0.22, 0.05, 0.85))
    cyl(stalk, (0.1, 0.05, 0.08), knee[:], 0.04, 0.032, 6)
    tip = knee + Vector((0.32, 0, -0.12))
    cyl(stalk, knee[:], tip[:], 0.032, 0.026, 6)
    ear_on(stalk, tip, (0.45, 0, -1.0), 0.85)
    ground(1.25, mat("crack", (0.08, 0.05, 0.03), 0.95), z=0.01)
    to_obj(clods, "clods", mat("clay_dry", (0.8, 0.62, 0.38), 0.95, noise=9, bump=0.3), smooth=False)
    to_obj(stalk, "stalk", mat("dry_straw", (0.62, 0.55, 0.38), 0.85))
    sun(az=-45, el=48, strength=4.2)
    camera([Vector((-1.2, -1.2, 0)), Vector((1.2, 1.2, 0.9))], az=0, el=55, margin=1.0)
    return True


def icon_rain():
    """Deštivé léto: šedý dešťový mrak a šikmé kapky."""
    rng = random.Random(5)
    cloud, drops = bmesh.new(), bmesh.new()
    for x, z, r in ((-0.55, 0.55, 0.38), (-0.1, 0.78, 0.5), (0.45, 0.64, 0.42), (0.15, 0.45, 0.4),
                    (-0.35, 0.42, 0.34), (0.75, 0.45, 0.3)):
        blob(cloud, ((x, 0, z), (0, 0, 0)), (r, r * 0.8, r * 0.85), 16, 10)
    for k in range(8):
        x = -0.7 + k * 0.2 + rng.uniform(-0.04, 0.04)
        z = rng.uniform(-0.8, -0.05)
        bot = Vector((x, -0.45, z))
        cyl(drops, bot[:], (bot + Vector((0.1, 0, 0.32)))[:], 0.05, 0.01, 8)
        blob(drops, (bot[:], (0, 0, 0)), (0.05, 0.05, 0.06), 8, 5)
    to_obj(cloud, "cloud", mat("cloud", (0.56, 0.59, 0.66), 0.9))
    to_obj(drops, "drops", mat("drop", (0.33, 0.6, 0.98), 0.2))
    sun(az=-30, el=45, strength=4.0)
    camera([Vector((-1.15, -0.5, -0.95)), Vector((1.15, 0.5, 1.3))], az=0, el=8, margin=1.04)
    return True


def icon_frost():
    """Mráz: šestiramenná sněhová vločka z ledu – holomráz a dlouhá zima."""
    flake = bmesh.new()
    for k in range(6):
        a = math.pi / 2 + 2 * math.pi * k / 6
        d = Vector((math.cos(a), 0, math.sin(a)))
        cyl(flake, (0, 0, 0), (d * 1.0)[:], 0.075, 0.05, 6)
        for t, ln in ((0.45, 0.34), (0.72, 0.22)):
            p = d * t
            for s in (1, -1):
                b = Vector((math.cos(a + s * 0.8), 0, math.sin(a + s * 0.8)))
                cyl(flake, p[:], (p + b * ln)[:], 0.055, 0.035, 6)
    blob(flake, ((0, 0, 0), (0, 0, 0)), (0.17, 0.09, 0.17), 12, 8)
    to_obj(flake, "flake", glow_mat("ice", (0.72, 0.88, 1.0), 0.35))
    sun(az=-35, el=40, strength=4.0, color=(0.9, 0.95, 1.0))
    camera([Vector((-1.1, -0.2, -1.1)), Vector((1.1, 0.2, 1.1))], az=0, el=0, margin=1.04)
    return True


def icon_good_summer():
    """Dobré léto: zralé klasy před zlatým sluncem."""
    disc, rays, stems, ears = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    sc, sr = Vector((0.3, 0.6, 0.45)), 0.42
    cyl(disc, (sc + Vector((0, 0.05, 0)))[:], (sc - Vector((0, 0.05, 0)))[:], sr, sr, 40)
    for k in range(12):
        a = 2 * math.pi * k / 12
        d = Vector((math.cos(a), 0, math.sin(a)))
        p0, p1 = sc + d * (sr + 0.08), sc + d * (sr + (0.34 if k % 2 == 0 else 0.22))
        t = Vector((-d.z, 0, d.x))
        vs = [rays.verts.new(v) for v in (p0 + t * 0.1, p0 - t * 0.1, p1)]
        vb = [rays.verts.new(v + Vector((0, 0.06, 0))) for v in (p0 + t * 0.1, p0 - t * 0.1, p1)]
        rays.faces.new(vs[::-1])
        rays.faces.new(vb)
        for i in range(3):
            j = (i + 1) % 3
            rays.faces.new((vs[i], vs[j], vb[j], vb[i]))
    bmesh.ops.recalc_face_normals(rays, faces=rays.faces)
    for base, top in (((-0.35, -0.3, -1.0), (-0.45, -0.3, 0.35)), ((-0.25, -0.3, -1.0), (0.05, -0.3, 0.2)),
                      ((-0.3, -0.3, -1.0), (-0.75, -0.3, 0.1))):
        cyl(stems, base, top, 0.035, 0.03, 6)
        ear_on(ears, Vector(top), Vector(top) - Vector(base), 1.1)
    to_obj(disc, "disc", mat("gold", (0.98, 0.72, 0.18), 0.35))
    to_obj(rays, "rays", mat("gold2", (0.95, 0.6, 0.12), 0.4))
    to_obj(stems, "stems", mat("stem", (0.8, 0.64, 0.3), 0.7))
    to_obj(ears, "ears", mat("ear", (0.95, 0.74, 0.27), 0.65, noise=30))
    sun(az=-30, el=40, strength=4.5)
    camera([Vector((-1.1, -0.4, -1.0)), Vector((1.1, 0.7, 1.25))], az=0, el=0, margin=1.04)
    return True


def wave_plate(bm, z0, amp, phase, y, bottom=-0.95, n=48):
    """Vlna vody: deska v rovině XZ, horní okraj sinusovka."""
    pts = [(-1.15, bottom)]
    for i in range(n + 1):
        x = -1.15 + 2.3 * i / n
        pts.append((x, z0 + amp * math.sin(phase + x * 3.6)))
    pts.append((1.15, bottom))
    flat_plate(bm, pts, y, 0.16)


def icon_flood():
    """Povodeň: rozvodněná voda ve třech vlnách s pěnou a kůl plotu zatopený po pás."""
    post, foam = bmesh.new(), bmesh.new()
    layers = ((0.35, 0.36, 0.11, 0.3, (0.5, 0.72, 0.88)), (0.0, 0.08, 0.12, 1.4, (0.27, 0.52, 0.78)),
              (-0.35, -0.22, 0.13, 2.6, (0.15, 0.36, 0.62)))
    for y, z0, amp, phase, color in layers:
        bm = bmesh.new()
        wave_plate(bm, z0, amp, phase, y)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        to_obj(bm, f"wave{y}", mat(f"water{y}", color, 0.15), smooth=False)
        for i in range(-3, 4):
            x = (math.pi / 2 - phase) / 3.6 + i * 2 * math.pi / 3.6
            if -1.05 < x < 1.05:
                blob(foam, ((x, y - 0.09, z0 + amp), (0, 0, 0)), (0.13, 0.05, 0.05), 10, 6)
    cyl(post, (0.62, 0.17, -0.9), (0.66, 0.17, 0.85), 0.07, 0.06, 10)
    cyl(post, (0.66, 0.17, 0.85), (0.66, 0.17, 0.95), 0.06, 0.0, 10)
    to_obj(post, "post", mat("wood", (0.4, 0.26, 0.13), 0.9, noise=22, bump=0.4))
    to_obj(foam, "foam", mat("foam", (0.92, 0.95, 0.98), 0.6))
    sun(az=-35, el=45, strength=4.0)
    camera([Vector((-1.15, -0.5, -0.95)), Vector((1.15, 0.5, 1.0))], az=0, el=10, margin=1.04)
    return True


def icon_hail():
    """Kroupy: ledové kroupy padají na zlomená stébla obilí."""
    rng = random.Random(9)
    stones, stems, ears = bmesh.new(), bmesh.new(), bmesh.new()
    for x, d in ((-0.4, (0.9, 0, -0.35)), (0.1, (-0.85, 0, -0.45)), (0.45, (0.7, 0, 0.25))):
        base, knee = Vector((x, 0.15, -0.95)), Vector((x + 0.04, 0.15, -0.15))
        cyl(stems, base[:], knee[:], 0.04, 0.035, 6)
        top = knee + Vector(d).normalized() * 0.42
        cyl(stems, knee[:], top[:], 0.035, 0.03, 6)
        ear_on(ears, top, d, 1.0)
    placed = []
    while len(placed) < 9:
        x, z, r = rng.uniform(-0.95, 0.95), rng.uniform(-0.1, 1.05), rng.uniform(0.1, 0.16)
        if any((x - px) ** 2 + (z - pz) ** 2 < (r + pr + 0.05) ** 2 for px, pz, pr in placed):
            continue
        placed.append((x, z, r))
        blob(stones, ((x, -0.3, z), (0, 0, 0)), (r, r, r), 14, 9)
    for x in (-0.7, -0.15, 0.3, 0.8):
        blob(stones, ((x, -0.1, -0.88), (0, 0, 0)), (0.1, 0.1, 0.08), 12, 8)
    to_obj(stems, "stems", mat("stem", (0.62, 0.6, 0.32), 0.7))
    to_obj(ears, "ears", mat("ear", (0.8, 0.7, 0.3), 0.65, noise=30))
    to_obj(stones, "hail", glow_mat("hail", (0.82, 0.9, 1.0), 0.25))
    sun(az=-35, el=45, strength=4.0)
    camera([Vector((-1.1, -0.4, -1.0)), Vector((1.1, 0.4, 1.2))], az=0, el=8, margin=1.04)
    return True


def icon_tornado():
    """Smršť: šedý trychtýř prohnutý ve větru a kotouč prachu a úlomků u země."""
    rng = random.Random(13)
    funnel, dust, debris = bmesh.new(), bmesh.new(), bmesh.new()
    profile = [(-0.95 + 2.1 * t, 0.06 + 0.72 * t ** 1.6 + 0.03 * math.sin(t * 25)) for t in
               [i / 24 for i in range(25)]]
    revolve(funnel, profile, 40, cap_bottom=True, cap_top=True)
    for v in funnel.verts:
        t = (v.co.z + 0.95) / 2.1
        a = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.16 * math.sin(3 * a + t * 16)
        v.co.x, v.co.y = v.co.x * k, v.co.y * k
        v.co.x += 0.7 * (t - 0.45) ** 2 - 0.15
    bmesh.ops.recalc_face_normals(funnel, faces=funnel.faces)
    for k in range(7):
        a = 2 * math.pi * k / 7
        blob(dust, ((math.cos(a) * 0.32, math.sin(a) * 0.2, -0.88), (0, 0, a)), (0.28, 0.2, 0.14), 12, 8)
    for k in range(7):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(0.35, 0.8)
        blob(debris, ((math.cos(a) * r, math.sin(a) * r * 0.4 - 0.2, rng.uniform(-0.6, 0.3)),
                      (rng.uniform(0, 3), rng.uniform(0, 3), 0)), (0.07, 0.025, 0.04), 6, 4)
    storm = bmesh.new()
    for x, r in ((-0.55, 0.42), (0.0, 0.55), (0.55, 0.45)):
        blob(storm, ((x + 0.1, 0.1, 1.15), (0, 0, 0)), (r, r * 0.7, 0.22), 16, 8)
    to_obj(storm, "storm", mat("storm", (0.25, 0.26, 0.3), 0.95, noise=5))
    to_obj(funnel, "funnel", mat("funnel", (0.48, 0.48, 0.5), 0.95, noise=6, bump=0.8))
    to_obj(dust, "dust", mat("dust", (0.5, 0.42, 0.32), 0.95, noise=10))
    to_obj(debris, "debris", mat("debris", (0.32, 0.22, 0.12), 0.9))
    sun(az=-40, el=40, strength=4.0)
    camera([Vector((-1.1, -0.4, -1.05)), Vector((1.1, 0.4, 1.35))], az=0, el=6, margin=1.02)
    return True


def icon_protection():
    """Ochrana dílu: větvička se čtyřmi listy – zeleň u pole chrání před suchem, mrazem a kroupami."""
    stem, leaves = bmesh.new(), bmesh.new()
    cyl(stem, (-0.2, 0, -1.0), (0.1, 0, 0.9), 0.05, 0.03, 8)
    for t, side, ang in ((0.25, 1, 0.9), (0.45, -1, 0.85), (0.65, 1, 0.7), (0.85, -1, 0.6), (1.0, 0, 0.0)):
        p = Vector((-0.2, 0, -1.0)).lerp(Vector((0.1, 0, 0.9)), t)
        d = Vector((math.sin(ang) * side, 0, math.cos(ang))).normalized()
        ax = d.to_track_quat("Z", "X").to_euler()
        blob(leaves, ((p + d * 0.32)[:], tuple(ax)), (0.17, 0.035, 0.34), 14, 9)
    to_obj(stem, "twig", mat("twig", (0.35, 0.24, 0.12), 0.9))
    to_obj(leaves, "leaves", mat("leaf", (0.27, 0.55, 0.16), 0.6, noise=18))
    sun(az=-40, el=45, strength=4.2)
    camera([Vector((-0.95, -0.3, -1.05)), Vector((0.95, 0.3, 1.25))], az=0, el=6, margin=1.04)
    return True


def icon_dearth():
    """Zdražení: hromada zrna a červená šipka vzhůru – kraj po zlém roce, obilí zdražilo."""
    rng = random.Random(17)
    heap, grain, arrow = bmesh.new(), bmesh.new(), bmesh.new()
    revolve(heap, [(-0.85, 0.82), (-0.75, 0.78), (-0.45, 0.6), (-0.1, 0.36), (0.12, 0.14), (0.2, 0.0)], 40,
            cap_bottom=True, cap_top=True)
    for v in heap.verts:
        v.co.x -= 0.3
    for _ in range(70):
        a, t = rng.uniform(0, 6.28), rng.uniform(0.05, 0.95)
        z = -0.85 + t * 1.02
        r = 0.8 * (1 - t) ** 0.9 + 0.02
        blob(grain, ((-0.3 + math.cos(a) * r, math.sin(a) * r, z + 0.03), (rng.uniform(0, 3), rng.uniform(0, 3), a)),
             (0.07, 0.045, 0.04), 6, 4)
    flat_plate(arrow, [(0.48, -0.75), (0.48, 0.25), (0.3, 0.25), (0.62, 0.8), (0.94, 0.25), (0.76, 0.25),
                       (0.76, -0.75)], -0.45, 0.12)
    bmesh.ops.recalc_face_normals(arrow, faces=arrow.faces)
    to_obj(heap, "heap", mat("heap", (0.86, 0.66, 0.3), 0.8, noise=60, bump=0.6))
    to_obj(grain, "grain", mat("grain", (0.95, 0.74, 0.33), 0.55))
    to_obj(arrow, "arrow", glow_mat("up", (0.85, 0.12, 0.06), 0.5), smooth=False)
    sun(az=-40, el=45, strength=4.2)
    camera([Vector((-1.0, -0.5, -0.9)), Vector((1.0, 0.5, 0.95))], az=0, el=10, margin=1.04)
    return True


def icon_hide():
    """Kůže: napnutá surová kůže na rámu z tyčí, svázaná provázky (tuhá, světle okrová)."""
    rng = random.Random(5)
    skin, frame, cord = bmesh.new(), bmesh.new(), bmesh.new()
    # obrys kůže: čtyři „nohy“ a krk, poloměr kolísá podle úhlu
    segs = 40
    ring = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        r = 0.72 + 0.16 * math.cos(4 * a + 0.8) + rng.uniform(-0.02, 0.02)
        ring.append((math.cos(a) * r * 0.95, math.sin(a) * r, 0.0))
    centre = skin.verts.new((0, 0, 0.03))
    vs = [skin.verts.new(p) for p in ring]
    for k in range(segs):
        skin.faces.new((centre, vs[k], vs[(k + 1) % segs]))
    bmesh.ops.recalc_face_normals(skin, faces=skin.faces)
    # rám: čtyři tyče kolem a provázky ke kůži
    h = 1.0
    corners = [(-h, -h * 0.9, 0.0), (h, -h * 0.9, 0.0), (h, h * 0.9, 0.0), (-h, h * 0.9, 0.0)]
    for i in range(4):
        cyl(frame, corners[i], corners[(i + 1) % 4], 0.05, 0.05, 8)
    for k in range(0, segs, 5):
        p = Vector(ring[k])
        q = Vector(ring[k]) * 1.28
        cyl(cord, p + Vector((0, 0, 0.03)), q, 0.012, 0.012, 5)
    to_obj(skin, "hide", mat("hide", (0.66, 0.5, 0.3), 0.7, noise=24, bump=0.3))
    to_obj(frame, "frame", mat("pole", (0.34, 0.24, 0.15), 0.85, noise=16, bump=0.4))
    to_obj(cord, "cord", mat("cord", (0.25, 0.18, 0.1), 0.9))
    sun(az=-45, el=50, strength=4.3)
    camera([Vector((-1.15, -1.05, -0.05)), Vector((1.15, 1.05, 0.15))], az=0, el=62, margin=1.04)
    return True


def icon_fur():
    """Kožešina: pevně stočená role, srst ven, z jednoho konce viditelný spirálový řez."""
    rng = random.Random(9)
    roll, hair = bmesh.new(), bmesh.new()
    axis_len = 1.5
    cyl(roll, (0, -axis_len / 2, 0.7), (0, axis_len / 2, 0.7), 0.62, 0.62, 28)
    for k in range(70):
        y = rng.uniform(-axis_len / 2, axis_len / 2)
        a = rng.uniform(0, 2 * math.pi)
        base = Vector((math.cos(a) * 0.62, y, math.sin(a) * 0.62 + 0.7))
        tip = base + Vector((math.cos(a) * 0.09, rng.uniform(-0.04, 0.04), math.sin(a) * 0.09))
        cyl(hair, base, tip, 0.03, 0.0, 4)
    ends, ties = bmesh.new(), bmesh.new()
    for sgn in (-1, 1):
        for j, r in enumerate((0.55, 0.42, 0.29, 0.16)):
            cyl(ends, (0, sgn * (axis_len / 2 + 0.002 * j), 0.7), (0, sgn * (axis_len / 2 + 0.012 + 0.002 * j), 0.7), r, r, 24)
    for y in (-0.35, 0.35):
        cyl(ties, (0, y - 0.03, 0.7), (0, y + 0.03, 0.7), 0.655, 0.655, 28)
    to_obj(roll, "fur", mat("fur", (0.42, 0.26, 0.14), 0.95, noise=60, bump=0.8))
    to_obj(hair, "hair", mat("hair", (0.55, 0.37, 0.2), 0.95, noise=60, bump=0.4))
    to_obj(ends, "ends", mat("leather-side", (0.76, 0.6, 0.4), 0.8, noise=20, bump=0.2))
    to_obj(ties, "ties", mat("tie", (0.2, 0.14, 0.09), 0.9))
    sun(az=-45, el=46, strength=4.3)
    camera([Vector((-0.95, -0.9, 0.0)), Vector((0.95, 0.9, 1.35))], az=-30, el=22, margin=1.04)
    return True


def icon_honey():
    """Med: hliněný hrnec s medem u okraje, zlatá kapka stékající po boku."""
    pot, honey, drip = bmesh.new(), bmesh.new(), bmesh.new()
    c, s = (0.0, 0.0, 0.0), 1.0
    lathe(pot, POT_OUTER + POT_INNER, c, s)
    # hladina medu v hrnci (kruh těsně pod okrajem) a stružka přes okraj
    cyl(honey, (0, 0, 0.9), (0, 0, 0.93), 0.41, 0.41, 36)
    blob(drip, ((0.4, -0.02, 0.9), (0, 0, 0)), (0.08, 0.1, 0.1), 10, 6)
    cyl(drip, (0.52, -0.02, 0.95), (0.6, -0.02, 0.62), 0.055, 0.075, 10)
    blob(drip, ((0.6, -0.02, 0.6), (0, 0, 0)), (0.095, 0.095, 0.13), 12, 7)
    to_obj(pot, "pot", mat("clay-pot", (0.3, 0.2, 0.13), 0.8, noise=16, bump=0.3))
    gold = mat("honey", (0.95, 0.58, 0.08), 0.15)
    bsdf = next(n for n in gold.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Emission Color"].default_value = (0.9, 0.45, 0.04, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 0.35
    to_obj(honey, "honey", gold)
    to_obj(drip, "drip", gold)
    sun(az=-45, el=46, strength=4.3)
    camera([Vector((-0.6, -0.6, 0.0)), Vector((0.7, 0.6, 1.05))], az=0, el=24, margin=1.04)
    return True


def icon_wax():
    """Vosk: žlutý koláč s reliéfem plástve a menší odlomený kus vedle."""
    cake, piece, comb = bmesh.new(), bmesh.new(), bmesh.new()
    cyl(cake, (-0.18, 0.1, 0.0), (-0.18, 0.1, 0.34), 0.78, 0.74, 40)
    cyl(piece, (0.72, -0.5, 0.0), (0.72, -0.5, 0.2), 0.34, 0.31, 6)
    # plástev na horní ploše: šestiúhelníky z tenkých válečků
    for q in range(-2, 3):
        for r in range(-2, 3):
            x = -0.18 + 0.27 * (q + 0.5 * (r % 2))
            y = 0.1 + 0.235 * r
            if (x + 0.18) ** 2 + (y - 0.1) ** 2 > 0.5 ** 2:
                continue
            ring = [(x + math.cos(math.pi / 6 + k * math.pi / 3) * 0.12, y + math.sin(math.pi / 6 + k * math.pi / 3) * 0.12) for k in range(6)]
            for k in range(6):
                a, b = ring[k], ring[(k + 1) % 6]
                cyl(comb, (a[0], a[1], 0.345), (b[0], b[1], 0.345), 0.022, 0.022, 4)
    to_obj(cake, "cake", mat("wax", (0.92, 0.74, 0.22), 0.45, noise=20, bump=0.2))
    to_obj(piece, "piece", mat("wax2", (0.88, 0.68, 0.2), 0.5, noise=20, bump=0.2))
    to_obj(comb, "comb", mat("comb", (0.74, 0.55, 0.12), 0.5))
    sun(az=-45, el=46, strength=4.4)
    camera([Vector((-1.0, -0.8, 0.0)), Vector((1.1, 0.9, 0.4))], az=0, el=34, margin=1.04)
    return True


RESOURCES = {
    "hide": icon_hide,
    "fur": icon_fur,
    "honey": icon_honey,
    "wax": icon_wax,
    "fort-fence": icon_fort_fence,
    "fort-palisade": icon_fort_palisade,
    "fort-rampart": icon_fort_rampart,
    "food": icon_food,
    "skill": icon_skill,
    "wood": icon_wood,
    "labor": icon_labor,
    "satiation": icon_satiation,
    "date": icon_date,
    "apples": icon_apples,
    "happiness": icon_happiness,
    "fire": icon_fire,
    "hay": icon_hay,
    "meat": icon_meat,
    "cheese": icon_cheese,
    "eggs": icon_eggs,
    "legumes": icon_legumes,
    "hourglass": icon_hourglass,
    "balance": icon_balance,
    "sheep": lambda: icon_animal("sheep"),
    "goat": lambda: icon_animal("goat"),
    "pig": lambda: icon_animal("pig"),
    "cow": lambda: icon_animal("cow"),
    # divoká zvěř a pes (wildlife.md): modely 0 A.D. z `models/fauna/`, jelen s parožím
    "boar": lambda: icon_animal("wild-boar"),
    "deer": lambda: icon_animal("wild-stag"),
    "wolf": lambda: icon_animal("wild-wolf"),
    "bear": lambda: icon_animal("wild-bear"),
    "hare": lambda: icon_animal("wild-hare"),
    "fox": lambda: icon_animal("wild-fox"),
    "fish": lambda: icon_animal("fish"),
    "dog": lambda: icon_animal("dog"),
    "spear": icon_spear,
    "watch-fire": icon_watch_fire,
    "chicken": lambda: icon_animal("chicken"),
    "ox": lambda: icon_animal("ox", folder=PLOUGH),
    # mladý vůl do výcviku (trade.md – Dobytek ve třech druzích): světlejší srst, v ikoně menší
    "young-ox": lambda: icon_animal("ox", folder=PLOUGH, tint=(1.3, 1.18, 1.0)),
    # koně (horses.md – Co hráč vidí): hříbě (světlejší, menší), klisna (světlejší srst) a jezdecký kůň z modelů 0 A.D.
    "foal": lambda: icon_animal("foal", tint=(1.5, 1.35, 1.15)),
    "mare": icon_mare,
    "horse": icon_rider_horse,
    "ard": icon_ard,
    "ozim": icon_ozim,
    "jar": icon_jar,
    "flax": icon_flax,
    "charcoal": icon_charcoal,
    "ore": icon_ore,
    "clay": icon_clay,
    "tools": icon_tools,
    "iron-bars": icon_iron_bars,
    "bloom": icon_bloom,
    "harvest": icon_harvest,
    "sheaves": icon_sheaves,
    "walk": icon_walk,
    "pottery": icon_pottery,
    "cart": icon_cart,
    "wood-tools": icon_wood_tools,
    "overgrowth": icon_overgrowth,
    "condition": icon_condition,
    "abandoned": icon_abandoned,
    "man": icon_man,
    "woman": icon_woman,
    "child": icon_child,
    "family": icon_family,
    "elder": icon_elder,
    "ring": icon_ring,
    # počasí a pohromy (disasters.md – Co hráč vidí)
    "drought": icon_drought,
    "rain": icon_rain,
    "frost": icon_frost,
    "good-summer": icon_good_summer,
    "flood": icon_flood,
    "hail": icon_hail,
    "tornado": icon_tornado,
    "protection": icon_protection,
    "dearth": icon_dearth,
}


# ------------------------------------------------------ prémiové krajiny ----
# Portréty typů prémiové krajiny (premium-landscapes.md – Co hráč vidí): kruh krajiny s výškovým
# polem a mizejícím okrajem, na něm prvek typu (žíla, náplav, řeka, brod, sedlo, pramen, lom…).

PR = 5.0


def sm(e0, e1, x):
    """Plynulý přechod 0 → 1 mezi e0 a e1 (smoothstep)."""
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def seg_dist(px, py, ax, ay, bx, by):
    """Vzdálenost bodu od úsečky."""
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def poly_dist(px, py, pts):
    return min(seg_dist(px, py, *pts[i], *pts[i + 1]) for i in range(len(pts) - 1))


def land(hfn, tex="grass-lush.jpg", tint=(0.74, 0.82, 0.56), scale=0.3, radius=PR, n=110):
    """Kruh krajiny s výškovým polem `hfn(x, y)` a mizejícím okrajem (jako ground())."""
    o = ground(radius, mat("land", tex=f"{TEX}/{tex}", scale=scale, tint=tint), z=0.0, fade=0.64)
    bm = bmesh.new()
    vs = [[bm.verts.new((-radius + 2 * radius * ix / n, -radius + 2 * radius * iy / n,
                         hfn(-radius + 2 * radius * ix / n, -radius + 2 * radius * iy / n)))
           for ix in range(n + 1)] for iy in range(n + 1)]
    for iy in range(n):
        for ix in range(n):
            bm.faces.new((vs[iy][ix], vs[iy][ix + 1], vs[iy + 1][ix + 1], vs[iy + 1][ix]))
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def water(z, color=(0.13, 0.27, 0.32), radius=PR):
    """Hladina vody ve výšce z – vidět jen tam, kde je krajina níž (koryto, tůň)."""
    m = mat("water", color, 0.06)
    return ground(radius * 0.99, m, z=z, fade=0.64)


def gold_mat():
    m = mat("gold", (1.0, 0.74, 0.22), 0.28)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Metallic"].default_value = 1.0
    return m


def put(name, folder, loc, size, rot=0.0, tint=None):
    """Model z repa: zmenší na největší rozměr `size` a postaví spodkem na `loc`."""
    objs = place_model(name, folder=folder)
    bpy.context.view_layer.update()
    pts = world_points(objs)
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    k = size / max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    place_root(objs, (loc[0], loc[1], loc[2] - lo[2] * k), rot, k)
    if tint:
        tint_imported(objs, tint)
    return objs


def ribbon(hfn, pts, width, material, lift=0.03, step=0.12):
    """Pás (stezka, cesta) po terénu podél lomené čáry."""
    bm = bmesh.new()
    prev = None
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        length = math.hypot(bx - ax, by - ay)
        nx, ny = -(by - ay) / length, (bx - ax) / length
        for k in range(int(length / step) + 1):
            t = k * step / length
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            w = width * (1 + 0.15 * math.sin(x * 3.1 + y * 2.3))
            l = bm.verts.new((x + nx * w / 2, y + ny * w / 2, hfn(x + nx * w / 2, y + ny * w / 2) + lift))
            r = bm.verts.new((x - nx * w / 2, y - ny * w / 2, hfn(x - nx * w / 2, y - ny * w / 2) + lift))
            if prev:
                bm.faces.new((prev[0], prev[1], r, l))
            prev = (l, r)
    return to_obj(bm, "ribbon", material)


def stones(hfn, centres, rng, material, size=(0.14, 0.24)):
    bm = bmesh.new()
    for x, y in centres:
        s = rng.uniform(*size)
        blob(bm, ((x, y, hfn(x, y) + s * 0.3), (rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, 3))),
             (s, s * 0.85, s * 0.6), 7, 5)
    return to_obj(bm, "stones", material)


def land_light_camera(top=2.0, az=18, el=40, margin=0.84):
    sun(az=-50, el=44)
    sun(az=150, el=25, strength=1.4, color=(0.8, 0.88, 1.0))
    r = PR * 0.82
    camera([Vector((-r, -r, 0)), Vector((r, r, 0)), Vector((0, 0, top))], az=az, el=el, margin=margin)


def river_y(x, amp=0.7, f=0.45, off=0.0):
    return off + amp * math.sin(x * f + 0.4)


def channel(x, y, half, depth=0.45, bank=0.9, amp=0.7, f=0.45, off=0.0):
    """Koryto podél vlnovky: dno −depth, břeh náběhem do `bank`."""
    d = abs(y - river_y(x, amp, f, off))
    return -depth * (1 - sm(half, half + bank, d))


def icon_premium_deep_gold():
    """Hluboká ložiska drahých kovů: skalnatý hřbet s výchozy a zlatou žilou."""
    rng = random.Random(3)
    h = lambda x, y: 1.5 * math.exp(-((y - 0.3) / 1.5) ** 2) + 0.12 * noise.noise(Vector((x, y, 0)) * 0.9)
    land(h, "rocky.jpg", (0.8, 0.78, 0.7), 0.35)
    for x, y, s, r in [(-1.8, 0.9, 2.8, 0.3), (0.6, 1.0, 3.2, 1.7), (2.4, 1.2, 2.4, 2.6)]:
        put("rock-tower", DECOR, (x, y, h(x, y) - 0.3), s, r, (0.8, 0.78, 0.74))
    vein = bmesh.new()
    for k in range(13):
        x = -2.4 + k * 0.4
        y = -0.45 + 0.2 * math.sin(k * 0.9)
        blob(vein, ((x, y, h(x, y) + 0.06), (0.2, 0.1, 0.15 * math.cos(k))), (0.3, 0.14, 0.1), 8, 5)
    to_obj(vein, "vein", gold_mat())
    stones(h, [(rng.uniform(-3, 3), rng.uniform(-2.6, -1.2)) for _ in range(9)], rng,
           mat("rock", (0.52, 0.5, 0.46), 0.9, noise=30, bump=0.8))
    land_light_camera(2.4)


def icon_premium_gold_stream():
    """Zlatonosný potok: potok s náplavem zlatonosného písku a valounky zlata."""
    rng = random.Random(5)
    h = lambda x, y: channel(x, y, 0.45, 0.35, 1.4) + 0.5 * sm(1.2, 4.5, abs(y - river_y(x)))
    land(h)
    water(-0.18)
    sand = bmesh.new()
    blob(sand, ((0.4, river_y(0.4) - 0.7, -0.12), (0, 0, 0.2)), (1.5, 0.55, 0.2), 16, 8)
    to_obj(sand, "sand", mat("sand", tex=f"{TEX}/sand.jpg", scale=0.6, tint=(1.05, 0.88, 0.6)))
    nug = bmesh.new()
    for _ in range(14):
        x = rng.uniform(-0.8, 1.6)
        y = river_y(0.4) - 0.7 + rng.uniform(-0.3, 0.3)
        s = rng.uniform(0.05, 0.1)
        blob(nug, ((x, y, 0.06), (rng.uniform(0, 3), 0, 0)), (s, s * 0.8, s * 0.6), 6, 4)
    to_obj(nug, "nuggets", gold_mat())
    land_light_camera(1.0)


def icon_premium_navigable_river():
    """Splavná řeka: široká řeka, rovná niva, molo a člun."""
    h = lambda x, y: channel(x, y, 1.3, 0.5, 0.5, 0.35, 0.3) + 0.15 * sm(2.5, 4.5, abs(y - river_y(x, 0.35, 0.3)))
    land(h)
    water(-0.25)
    deck = bmesh.new()
    y0 = river_y(-0.6, 0.35, 0.3) - 1.75
    box(deck, (-0.6, y0 + 0.75, 0.12), (0.7, 1.9, 0.08))
    for dx in (-0.28, 0.28):
        for dy in (0.0, 0.8, 1.5):
            cyl(deck, (-0.6 + dx, y0 + dy, -0.4), (-0.6 + dx, y0 + dy, 0.24), 0.06)
    to_obj(deck, "pier", mat("wood", (0.4, 0.27, 0.15), 0.8, noise=60))
    boat = bmesh.new()
    blob(boat, ((0.6, y0 + 1.4, -0.16), (0, 0, 0.25)), (1.1, 0.26, 0.16), 14, 6)
    to_obj(boat, "boat", mat("dugout", (0.33, 0.2, 0.1), 0.75, noise=40))
    land_light_camera(0.8)


def icon_premium_fertile():
    """Velmi úrodná krajina: černozem v brázdách a mandele snopů."""
    h = lambda x, y: 0.05 * math.sin(x * 7.0) + 0.05 * noise.noise(Vector((x, y, 0)) * 0.5)
    land(h, "mud.jpg", (0.42, 0.33, 0.25), 0.5)
    for x, y, r in [(-1.3, 0.8, 0.3), (1.0, -0.4, 1.2), (0.0, 2.0, 2.0)]:
        put("stook", FIELDS, (x, y, 0), 1.6, r, (1.1, 0.95, 0.6))
    land_light_camera(1.2)


def icon_premium_ford_hill():
    """Vyvýšenina nad brodem: řeka, světlý brod se stezkou a pahorek nad ním."""
    rng = random.Random(9)
    hill = lambda x, y: 1.9 * math.exp(-(((x - 1.6) / 1.6) ** 2 + ((y - 2.2) / 1.4) ** 2))
    h = lambda x, y: channel(x, y, 0.75, 0.4, 0.6, 0.3, 0.25, -0.4) * (1 - 0.8 * math.exp(-((x + 0.4) / 0.6) ** 2)) + hill(x, y)
    land(h)
    water(-0.15)
    path = [(-0.9, -4.5), (-0.5, -2.0), (-0.4, -0.4), (-0.2, 1.0), (-0.6, 3.0), (-1.4, 4.6)]
    ribbon(h, path, 0.45, mat("path", tex=f"{TEX}/gravel.jpg", scale=0.8, tint=(0.95, 0.85, 0.7)), 0.02)
    stones(h, [(-0.4 + rng.uniform(-0.3, 0.3), -0.4 + rng.uniform(-0.4, 0.4)) for _ in range(8)], rng,
           mat("pebble", (0.6, 0.56, 0.5), 0.8), (0.06, 0.11))
    land_light_camera(2.0)


def icon_premium_mountain_pass():
    """Horský průsmyk: hřbety po stranách, sedlo se stezkou a mohylou."""
    rng = random.Random(4)
    h = lambda x, y: 2.8 * sm(0.9, 3.6, abs(x)) * (0.75 + 0.25 * math.cos(y * 0.6)) + 0.15 * noise.noise(Vector((x, y, 0)))
    land(h, "rocky.jpg", (0.82, 0.84, 0.74), 0.3)
    ribbon(h, [(0.2, -5), (-0.1, -2), (0.1, 0.5), (-0.2, 3), (0.1, 5)], 0.4,
           mat("path", tex=f"{TEX}/gravel.jpg", scale=0.8, tint=(0.95, 0.85, 0.7)), 0.02)
    cairn = bmesh.new()
    for k in range(10):
        s = 0.22 - k * 0.014
        blob(cairn, ((0.8 + rng.uniform(-0.06, 0.06), 0.4 + rng.uniform(-0.06, 0.06), 0.12 + k * 0.1 + h(0.8, 0.4)),
                     (rng.uniform(0, 1), 0, rng.uniform(0, 3))), (s, s * 0.85, 0.09), 7, 5)
    to_obj(cairn, "cairn", mat("stone", (0.6, 0.58, 0.54), 0.9, noise=25))
    land_light_camera(2.6, az=0, el=30)


def icon_premium_iron_ore():
    """Bohatá železná ruda: rezavá zem a velká hromada krevelu."""
    rng = random.Random(7)
    h = lambda x, y: 0.1 * noise.noise(Vector((x, y, 0)) * 0.7)
    land(h, "mud.jpg", (0.8, 0.5, 0.34), 0.5)
    heap = bmesh.new()
    for k in range(48):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0, 1.3)
        s = rng.uniform(0.2, 0.32)
        ore_nodule(heap, (math.cos(a) * d, math.sin(a) * d, 0.15 + (1.3 - d) * 0.75), (s, s * 0.9, s * 0.75), rng)
    to_obj(heap, "ore", mat("ore", (0.36, 0.1, 0.05), 0.9, noise=38, bump=1.6), smooth=False)
    put("stone-1", DECOR, (2.2, 1.6, 0), 1.2, 0.5, (1.1, 0.62, 0.45))
    land_light_camera(1.4)


def icon_premium_fine_clay():
    """Dobrá keramická hlína: jámy v šedém jílu a hromada hladkých hrud."""
    rng = random.Random(8)
    land(lambda x, y: 0.0, "grass-lush.jpg", (0.72, 0.8, 0.56))
    pits = bmesh.new()
    for c, r, ph in [((-1.1, 0.5), 1.0, 0.4), ((1.0, 1.3), 0.8, 2.1)]:
        ore_pit(pits, c, r, ph)
    to_obj(pits, "pits", mat("clay-pit", tex=f"{TEX}/mud.jpg", scale=0.9, tint=(0.62, 0.62, 0.64)))
    lumps = bmesh.new()
    for _ in range(18):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0, 0.7)
        s = rng.uniform(0.18, 0.26)
        blob(lumps, ((1.0 + math.cos(a) * d, -1.0 + math.sin(a) * d, 0.12 + (0.7 - d) * 0.7), (0, 0, a)),
             (s, s * 0.8, s * 0.6), 8, 5)
    to_obj(lumps, "clay", mat("clay", (0.55, 0.56, 0.58), 0.5, noise=20, bump=0.3))
    land_light_camera(1.4)


def icon_premium_oak_beech():
    """Doubravy a bučiny: dub, buk a prase na žíru."""
    land(lambda x, y: 0.06 * noise.noise(Vector((x, y, 0))), "forest-floor.jpg", (0.85, 0.8, 0.62), 0.4)
    put("oak-large-1", TREES, (-1.5, 1.0, 0), 5.0, 0.3)
    put("beech-1", TREES, (1.7, 1.6, 0), 4.6, 1.2)
    stand_animal("pig", loc=(0.4, -1.3), scale=1.3)
    land_light_camera(4.0, margin=0.9)


def icon_premium_floodplain():
    """Rozsáhlé nivní louky: rovná niva s meandrem potoka a kupky sena."""
    h = lambda x, y: channel(x, y, 0.3, 0.3, 0.4, 1.0, 0.8, -1.4)
    land(h, "grass-flowers.jpg", (0.8, 0.95, 0.6), 0.3)
    water(-0.14)
    for x, y in [(-1.0, 1.2), (1.2, 1.8), (0.4, 0.2)]:
        put("haystack", FIELDS, (x, y, 0), 1.2, x)
    land_light_camera(0.9)


def icon_premium_south_slopes():
    """Teplé jižní svahy: prosluněný svah s jabloněmi a slunce."""
    h = lambda x, y: 2.2 * sm(-4.0, 4.0, y)
    land(h, "grass-dry.jpg", (0.95, 0.9, 0.62), 0.3)
    for x, y in [(-1.4, 0.4), (1.0, -0.6), (0.2, 1.8)]:
        put("apple-1", TREES, (x, y, h(x, y)), 2.2, x)
    disc = bmesh.new()
    blob(disc, ((2.4, 3.2, 4.6), (0, 0, 0)), (0.5, 0.5, 0.5), 16, 10)
    to_obj(disc, "sun", glow_mat("sun", (1.0, 0.7, 0.18), 1.6))
    sun(az=-10, el=40, strength=5.2)
    camera([Vector((-4.1, -4.1, 0)), Vector((4.1, 4.1, 0)), Vector((2.4, 3.2, 5.4))], az=18, el=34, margin=0.84)


def icon_premium_sacred_mountain():
    """Posvátná hora: výrazný vrch s plošinou a kamenným kruhem."""
    rng = random.Random(11)
    h = lambda x, y: 2.6 * (1 - sm(1.0, 4.4, math.hypot(x, y * 1.15)))
    land(h, "grass.jpg", (0.78, 0.84, 0.6), 0.3)
    ring = [(0.85 * math.cos(a), 0.85 * math.sin(a)) for a in [k * 2 * math.pi / 9 for k in range(9)]]
    bm = bmesh.new()
    for x, y in ring:
        box(bm, (x, y, h(x, y) + 0.3), (0.16, 0.12, 0.7), (rng.uniform(-0.1, 0.1), 0, math.atan2(y, x)))
    to_obj(bm, "menhirs", mat("stone", (0.62, 0.6, 0.55), 0.9, noise=25, bump=0.6), smooth=False)
    land_light_camera(3.4)


def icon_premium_sacred_spring():
    """Posvátný pramen: tůňka pod skalkou, stužky na kůlu a bříza."""
    h = lambda x, y: -0.3 * (1 - sm(0.4, 1.1, math.hypot(x, y + 0.3))) + 0.5 * sm(0.5, 2.5, y)
    land(h, "grass-lush.jpg", (0.72, 0.84, 0.56))
    water(-0.12, (0.16, 0.34, 0.4))
    put("rock-moss-1", DECOR, (0.0, 1.1, 0.3), 1.9, 0.4)
    put("birch-1", TREES, (-1.9, 1.2, 0.3), 3.6, 0.7)
    post = bmesh.new()
    cyl(post, (1.2, -0.2, 0), (1.2, -0.2, 1.5), 0.06)
    to_obj(post, "post", mat("wood", (0.4, 0.27, 0.15), 0.8))
    rib = bmesh.new()
    for k, c in enumerate([0.0, 0.5, 1.0]):
        box(rib, (1.2 + 0.08, -0.2, 1.35 - k * 0.12), (0.02, 0.05, 0.36), (0.4, 0.2 * k, 0.6 * k))
    to_obj(rib, "ribbons", mat("ribbon", (0.75, 0.12, 0.08), 0.7), smooth=False)
    land_light_camera(2.6)


def icon_premium_confluence():
    """Soutok dvou toků: dvě koryta se slévají pod ostrožnou."""
    a = [(-4.8, 4.0), (-1.4, 1.2), (0.0, -0.4)]
    b = [(4.8, 3.6), (1.3, 1.0), (0.0, -0.4)]
    c = [(0.0, -0.4), (0.4, -2.6), (-0.3, -5.0)]
    def h(x, y):
        d = min(poly_dist(x, y, a), poly_dist(x, y, b), poly_dist(x, y, c))
        spur = 1.3 * math.exp(-((x / 1.3) ** 2 + ((y - 2.6) / 1.8) ** 2))
        return -0.4 * (1 - sm(0.35, 0.9, d)) + spur * sm(0.6, 1.4, d)
    land(h)
    water(-0.2)
    land_light_camera(1.6)


def icon_premium_natural_fortress():
    """Přirozená pevnost: vysoká ostrožna obtékaná zaříznutým meandrem."""
    loop = [(-4.8, -2.6), (-1.8, -2.2), (-0.4, 0.6), (0.0, 2.0), (1.2, 2.2), (1.8, 0.4), (1.6, -2.4), (4.8, -3.0)]
    def h(x, y):
        d = poly_dist(x, y, loop)
        inside = math.exp(-(((x - 0.6) / 1.5) ** 2 + ((y + 1.2) / 2.6) ** 2))
        base = -0.6 * (1 - sm(0.3, 0.7, d)) + 0.9 * sm(0.7, 1.6, d)
        return base + 1.5 * inside * sm(0.6, 1.0, d)
    land(h, "grass.jpg", (0.76, 0.82, 0.58))
    water(-0.4)
    land_light_camera(2.4)


def icon_premium_salt_spring():
    """Solný pramen: slanisko s bílou krustou a krystaly kolem tůňky."""
    rng = random.Random(13)
    h = lambda x, y: -0.25 * (1 - sm(0.5, 1.3, math.hypot(x, y)))
    land(h, "mud.jpg", (0.7, 0.6, 0.46), 0.5)
    crust = bmesh.new()
    for _ in range(40):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(1.25, 2.3)
        s = rng.uniform(0.25, 0.5)
        blob(crust, ((math.cos(a) * d, math.sin(a) * d, h(math.cos(a) * d, math.sin(a) * d)), (0, 0, a)),
             (s, s * 0.7, 0.03), 10, 4)
    to_obj(crust, "crust", mat("salt", (0.86, 0.85, 0.8), 0.7, noise=40))
    water(-0.08, (0.2, 0.36, 0.38))
    cr = bmesh.new()
    for _ in range(26):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(1.3, 2.3)
        s = rng.uniform(0.07, 0.15)
        box(cr, (math.cos(a) * d, math.sin(a) * d, 0.05 + s / 2), (s, s, s), (rng.uniform(0, 1), rng.uniform(0, 1), a))
    to_obj(cr, "crystals", mat("crystal", (0.9, 0.9, 0.88), 0.3), smooth=False)
    land_light_camera(0.8)


def icon_premium_wild_bees():
    """Brtě a lesní včely: starý dub s dutinou a klátové úly."""
    rng = random.Random(17)
    land(lambda x, y: 0.05 * noise.noise(Vector((x, y, 0))), "forest-floor.jpg", (0.85, 0.8, 0.62), 0.4)
    put("snag-oak", DECOR, (-1.0, 0.8, 0), 4.2, 0.6)
    hives = bmesh.new()
    for x, y in [(0.9, -0.4), (1.7, 0.4)]:
        cyl(hives, (x, y, 0), (x, y, 1.1), 0.32, 0.3, 14)
        box(hives, (x, y, 1.16), (0.42, 0.42, 0.06), (0, 0, 0.3))
    to_obj(hives, "hives", mat("log", (0.38, 0.27, 0.16), 0.85, noise=50, bump=0.5))
    bees = bmesh.new()
    for _ in range(16):
        blob(bees, ((rng.uniform(0.4, 2.2), rng.uniform(-1.0, 1.0), rng.uniform(0.9, 2.0)), (0, 0, 0)),
             (0.05, 0.035, 0.035), 6, 4)
    to_obj(bees, "bees", mat("bee", (0.95, 0.68, 0.12), 0.6))
    land_light_camera(3.4)


def icon_premium_game_furs():
    """Hojná zvěř a kožešiny: mokřad s rákosím a jelen."""
    h = lambda x, y: -0.25 * (1 - sm(0.2, 0.8, abs(noise.noise(Vector((x * 0.35, y * 0.35, 0.5)))) * 3)) + 0.05
    land(h, "grass-lush.jpg", (0.62, 0.74, 0.48))
    water(-0.1, (0.12, 0.22, 0.2))
    for x, y in [(-1.8, 1.4), (1.6, 1.8), (-0.6, -1.8)]:
        put("cattails", DECOR, (x, y, 0), 1.3, x)
    put("wild-stag", FAUNA, (0.4, 0.2, 0.05), 2.4, 2.4)
    land_light_camera(2.2)


def icon_premium_building_stone():
    """Stavební kámen a vápenec: lom se stupni světlé skály a vylámané kvádry."""
    rng = random.Random(19)
    h = lambda x, y: 0.05 * noise.noise(Vector((x, y, 0)))
    land(h, "gravel.jpg", (0.8, 0.76, 0.68), 0.5)
    lime = mat("limestone", (0.62, 0.58, 0.48), 0.95, noise=14, bump=1.2)
    wall = bmesh.new()
    for k, (y, z) in enumerate([(1.6, 0.5), (2.4, 1.3), (3.2, 2.1)]):
        box(wall, (0, y, z / 2), (5.6 - k * 0.5, 0.8, z))
    to_obj(wall, "wall", lime, smooth=False)
    blocks = bmesh.new()
    for x, y in [(-1.4, -0.4), (0.2, -1.2), (1.3, 0.1), (-0.3, 0.4)]:
        box(blocks, (x, y, 0.22), (0.7, 0.45, 0.42), (0, 0, rng.uniform(-0.4, 0.4)))
    to_obj(blocks, "blocks", lime, smooth=False)
    land_light_camera(2.2)


PREMIUM = {
    "deep-gold": icon_premium_deep_gold,
    "gold-stream": icon_premium_gold_stream,
    "navigable-river": icon_premium_navigable_river,
    "fertile": icon_premium_fertile,
    "ford-hill": icon_premium_ford_hill,
    "mountain-pass": icon_premium_mountain_pass,
    "iron-ore": icon_premium_iron_ore,
    "fine-clay": icon_premium_fine_clay,
    "oak-beech": icon_premium_oak_beech,
    "floodplain": icon_premium_floodplain,
    "south-slopes": icon_premium_south_slopes,
    "sacred-mountain": icon_premium_sacred_mountain,
    "sacred-spring": icon_premium_sacred_spring,
    "confluence": icon_premium_confluence,
    "natural-fortress": icon_premium_natural_fortress,
    "salt-spring": icon_premium_salt_spring,
    "wild-bees": icon_premium_wild_bees,
    "game-furs": icon_premium_game_furs,
    "building-stone": icon_premium_building_stone,
}


# ------------------------------------------------------ ikony rozhraní ----
# Ikony, které nejdřív vznikly jako ruční SVG (7.–9. 11. 2026) – Martin 9. 11. 2026: „ano“ k jejich
# předělání v Blenderu stejně jako ostatní ikony (o ruční ikoně opevnění 8. 11.: „vůbec nevypadá
# jako ostatní ikonky“). Panel úseku hradby (druhy, val, příkop, brány, obsazení, postupy útočníka),
# kámen, zbourat / opustit / vrátit stavbu, opustit díl, Probít se, Kronika, Upozornění a portrét
# lomu. Díly opevnění a obléhání jsou modely scény (`models/fortifications/`, `models/siege/`).

SIEGE = os.path.join(ROOT, "apps/web/public/models/siege")
AXE_BLADE = [
    (0.13, -0.16), (0.14, 0.12), (0.11, 0.3), (0.2, 0.62), (0.3, 0.86),
    (-0.06, 0.92), (-0.38, 0.86), (-0.42, 0.72), (-0.22, 0.5), (-0.12, 0.3),
    (-0.13, 0.12), (-0.11, -0.16),
]
AXE_EDGE = [(0.3, 0.86), (-0.06, 0.92), (-0.38, 0.86), (-0.34, 0.8), (-0.06, 0.85), (0.26, 0.8)]


def siege_parts():
    """Díly obléhání ze `siege.glb` (žebříky, otep, hromady kamení) – originály skryté, kopie `inst`."""
    parts = {}
    for o in place_model("siege", folder=SIEGE):
        parts[o.name.split(".")[0]] = o
        o.hide_render = True
    return parts


def metal(name, color, rough, metallic):
    m = mat(name, color, rough, noise=14, bump=0.4)
    next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = metallic
    return m


def seg_points(p0, p1, step=0.27):
    """Body kůlů po `step` na úsečce p0 → p1 (včetně konců)."""
    n = max(1, round(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / step))
    return [(p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n) for i in range(n + 1)]


def gate(parts, cx, cy, open_angle=0.0):
    """Brána podél X: dva kůly, trám navrch a dvě křídla z prken (o `open_angle` otevřená ven, k −Y)."""
    for k in (-1, 1):
        inst(parts["gate-post"], (cx + k * 2.05, cy, 0))
    inst(parts["gate-beam"], (cx, cy, 3.9))
    inst(parts["gate-planks"], (cx + 2.0, cy, 0), rot=open_angle)
    inst(parts["gate-planks"], (cx - 2.0, cy, 0), rot=math.pi - open_angle)


def axe(wood, iron, edge, h0, h1, k=1.25, y=-0.02):
    """Kovaná sekera s bradou: topůrko z h0 do h1 (rovina XZ), list u horního konce míří doprava."""
    cyl(wood, h0, h1, 0.1, 0.09, 10)
    d = (h1 - h0).normalized()
    n = Vector((d.z, 0, -d.x))  # kolmo doprava nahoru
    head = h0 + (h1 - h0) * 0.84

    def to_xz(u, v):
        p = head + d * u * k + n * v * k
        return (p.x, p.z)

    flat_plate(iron, [to_xz(u, v) for u, v in AXE_BLADE], y, 0.12)
    # broušené ostří – světlejší pruh podél břitu
    flat_plate(edge, [to_xz(u, v) for u, v in AXE_EDGE], y, 0.13)


def iron_objs(iron, edge):
    bmesh.ops.recalc_face_normals(iron, faces=iron.faces)
    bmesh.ops.recalc_face_normals(edge, faces=edge.faces)
    to_obj(iron, "iron", metal("forged", (0.36, 0.36, 0.38), 0.42, 0.65), smooth=False)
    to_obj(edge, "edge", metal("edge", (0.72, 0.72, 0.74), 0.3, 0.8), smooth=False)


def spade(wood, iron, foot, top, width=0.34, blade=0.46):
    """Rýč: dřevěný list s okovaným břitem u `foot`, násada s příčnou rukojetí k `top` (rovina XZ)."""
    foot, top = Vector(foot), Vector(top)
    d = (top - foot).normalized()
    n = Vector((d.z, 0, -d.x))

    def p(u, v):
        q = foot + d * u + n * v
        return (q.x, q.z)

    w = width / 2
    flat_plate(wood, [p(0.04, -w), p(blade * 0.8, -w * 0.95), p(blade, -w * 0.4), p(blade + 0.06, 0),
                      p(blade, w * 0.4), p(blade * 0.8, w * 0.95), p(0.04, w)], foot.y, 0.05)
    flat_plate(iron, [p(-0.03, -w - 0.015), p(0.09, -w - 0.015), p(0.09, w + 0.015), p(-0.03, w + 0.015)],
               foot.y, 0.07)
    cyl(wood, foot + d * blade, top, 0.045, 0.04, 8)
    cyl(wood, top - n * 0.13, top + n * 0.13, 0.042, 0.042, 8)


def mallet(bm, grip, head_c, length=0.7, r=0.22):
    """Dřevěná palice: topůrko od `grip` k hlavě, válcová hlava kolmo k němu (rovina XZ)."""
    grip, head_c = Vector(grip), Vector(head_c)
    d = (head_c - grip).normalized()
    n = Vector((d.z, 0, -d.x))
    cyl(bm, grip, head_c, 0.06, 0.07, 8)
    cyl(bm, head_c - n * length / 2, head_c + n * length / 2, r, r * 0.95, 14)


def lumpy_heap(bm, radius, height, rng, amp=0.08):
    """Hrouda / hromádka hlíny – rotační kopeček s hrbolatým povrchem."""
    revolve(bm, [(0.0, radius), (height * 0.3, radius * 0.86), (height * 0.65, radius * 0.55),
                 (height * 0.9, radius * 0.22), (height, 0.0)], 28, cap_bottom=True)
    off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), 0))
    for v in bm.verts:
        if v.co.z > 0.01:
            v.co += Vector((0, 0, amp * noise.noise(v.co * 3.0 + off)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)


def mud_mat(name="mud", scale=0.9):
    return mat(name, tex=f"{TEX}/mud.jpg", scale=scale, tint=(1.15, 0.92, 0.72))


def hud_light(az=-45, el=40, strength=4.2):
    sun(az=az, el=el, strength=strength)


def flat_arrow(tail, tip, w, head_w, head_len):
    """Obrys rovné šipky v rovině (body x, y) od `tail` k `tip`."""
    tail, tip = Vector((*tail, 0)), Vector((*tip, 0))
    d = (tip - tail).normalized()
    n = Vector((-d.y, d.x, 0))
    neck = tip - d * head_len
    pts = [tail - n * w / 2, neck - n * w / 2, neck - n * head_w / 2, tip, neck + n * head_w / 2,
           neck + n * w / 2, tail + n * w / 2]
    return [(p.x, p.y) for p in pts]


def arc_arrow(r, w, a0, a1, head=2.0, n=40):
    """Obrys zahnuté šipky v rovině: oblouk poloměru `r` a šířky `w` z úhlu a0 do a1, hrot na konci."""
    def at(a, rr):
        return (math.cos(a) * rr, math.sin(a) * rr)

    outer = [at(a0 + (a1 - a0) * i / n, r + w / 2) for i in range(n + 1)]
    inner = [at(a0 + (a1 - a0) * i / n, r - w / 2) for i in range(n + 1)][::-1]
    s = 1 if a1 > a0 else -1
    tx, ty = -math.sin(a1) * s, math.cos(a1) * s
    cx, cy = at(a1, r)
    tip = (cx + tx * w * 1.6, cy + ty * w * 1.6)
    return outer + [at(a1, r + w * head / 2), tip, at(a1, r - w * head / 2)] + inner


def icon_fort_walkway():
    """Palisáda s ochozem: řada kůlů a za ní fošny ochozu na sloupcích 2 m nad zemí (pohled zevnitř)."""
    rng = random.Random(5)
    parts = fort_parts()
    palisade_run(parts, seg_points((-3.0, 0.0), (3.0, 0.0)), rng)
    wood = bmesh.new()
    for x in (-2.9, -1.0, 1.0, 2.9):
        for y in (0.3, 1.2):
            cyl(wood, (x, y, 0), (x, y, 1.95), 0.08, 0.07, 8)
        cyl(wood, (x, 0.2, 1.9), (x, 1.3, 1.9), 0.07, 0.07, 8)
    to_obj(wood, "posts", mat("post", (0.45, 0.33, 0.21), 0.9, noise=25, bump=0.3))
    for x in (-2.0, 0.0, 2.0):
        for y in (0.42, 0.75, 1.08):
            inst(parts["walk-plank"], (x + rng.uniform(-0.05, 0.05), y, 1.97), rot=rng.uniform(-0.02, 0.02))
    hud_light(az=150, el=42)
    sun(az=-40, el=30, strength=1.2)
    camera([Vector((-3.1, -0.2, 0)), Vector((3.1, 1.4, 0)), Vector((-3.1, -0.2, 3.5)), Vector((3.1, 1.4, 3.5))],
           az=205, el=36, margin=1.03)
    return True


def icon_fort_crib():
    """Roštová hradba: rošt klád křížem zasypaný hlínou, vlevo vpředu kamenná plenta nasucho."""
    parts = fort_parts()
    for k in range(8):
        z = k * 0.28
        if k % 2 == 0:
            for y in (-1.15, 1.15):
                inst(parts["crib-log"], (0, y, z))
        else:
            for x in (-1.75, 0.0, 1.75):
                inst(parts["crib-log"], (x, 0, z), rot=math.pi / 2)
    fill = bmesh.new()
    box(fill, (0, 0, 1.12), (3.9, 2.3, 2.2))
    to_obj(fill, "fill", mud_mat(scale=0.4), smooth=False)
    for x in (-1.5, -0.5):
        inst(parts["facing-stone-a" if x < -1 else "facing-stone-b"], (x, -1.6, 0))
    hud_light()
    camera([Vector((-2.2, -2.1, 0)), Vector((2.2, 2.1, 0)), Vector((-2.2, -2.1, 2.5)), Vector((2.2, 2.1, 2.5))],
           az=-32, el=26, margin=1.0)
    return True


def icon_fort_chamber():
    """Komorová hradba: srubová komora z klád zasypaná hlínou, vlevo vpředu čelní kamenná zeď."""
    parts = fort_parts()
    inst(parts["chamber-box"], (0, 0, 0))
    fill = bmesh.new()
    box(fill, (0, 0, 1.95), (4.7, 2.7, 3.9))
    to_obj(fill, "fill", mud_mat(scale=0.4), smooth=False)
    for x in (-2.0, -1.0, 0.0):
        inst(parts["chamber-face"], (x, -1.95, 0))
    hud_light()
    camera([Vector((-2.6, -2.4, 0)), Vector((2.6, 1.6, 0)), Vector((-2.6, -2.4, 4.1)), Vector((2.6, 1.6, 4.1))],
           az=-32, el=24, margin=1.0)
    return True


def rampart_slice(L=3.2, X0=-2.5, X1=6.5, base=-0.9):
    """Výsek valu s příkopem v řezu (profil `rampart_profile`): drn nahoře, řez a stěny holá hlína."""
    bm = bmesh.new()
    xs = [X0 + i * 0.1 for i in range(int((X1 - X0) / 0.1) + 1)]
    prof = [(x, rampart_profile(x)) for x in xs]
    ymin, ymax = -L / 2, L / 2
    top0 = [bm.verts.new((x, ymin, h)) for x, h in prof]
    top1 = [bm.verts.new((x, ymax, h)) for x, h in prof]
    for i in range(len(xs) - 1):
        bm.faces.new((top0[i], top0[i + 1], top1[i + 1], top1[i]))
    bl0, br0 = bm.verts.new((X0, ymin, base)), bm.verts.new((X1, ymin, base))
    bl1, br1 = bm.verts.new((X0, ymax, base)), bm.verts.new((X1, ymax, base))
    bm.faces.new([bl0, br0] + top0[::-1])  # čelní řez
    bm.faces.new([bl1] + top1 + [br1])  # zadní stěna
    bm.faces.new((bl0, bl1, top1[0], top0[0]))
    bm.faces.new((br0, top0[-1], top1[-1], br1))
    bm.faces.new((bl0, bl1, br1, br0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = to_obj(bm, "rampart", mat("earth", tex=f"{TEX}/mud.jpg", scale=0.3, tint=(0.95, 0.78, 0.6)), smooth=False)
    o.data.materials.append(mat("turf", tex=f"{TEX}/grass-lush.jpg", scale=0.3, tint=(0.8, 0.85, 0.6)))
    for poly in o.data.polygons:
        poly.material_index = 1 if poly.normal.z > 0.3 and abs(poly.normal.y) < 0.9 else 0
    return o


def icon_fort_rampart_add():
    """Doplnit val: val s příkopem v řezu, na koruně valu palisáda a ve svahu náspu zaražený rýč."""
    rng = random.Random(8)
    L, X0, X1 = 4.4, -0.5, 10.6
    rampart_slice(L, X0, X1)
    parts = fort_parts()
    crest = RAMPART_DITCH + RAMPART_FOOT / 2
    palisade_run(parts, seg_points((crest, -L / 2 + 0.15), (crest, L / 2 - 0.15)), rng,
                 sink=rampart_profile(crest) - 0.12)
    wood, iron = bmesh.new(), bmesh.new()
    x = 5.0
    y = -L / 2 + 0.5
    spade(wood, iron, (x, y, rampart_profile(x) - 0.3), (x - 0.7, y, rampart_profile(x) + 1.9),
          width=0.6, blade=0.8)
    bmesh.ops.recalc_face_normals(wood, faces=wood.faces)
    to_obj(wood, "spade", mat("haft", (0.66, 0.45, 0.24), 0.75, noise=18, bump=0.3), smooth=False)
    to_obj(iron, "shoe", metal("shoe", (0.36, 0.36, 0.38), 0.42, 0.65), smooth=False)
    hud_light()
    camera([Vector((X0, -L / 2, -0.9)), Vector((X1, L / 2, 5.4)), Vector((X0, L / 2, -0.9)),
            Vector((X1, -L / 2, -0.9))], az=-42, el=28, margin=1.0)
    return True


def icon_fort_moat():
    """Napustit příkop: val s příkopem v řezu, příkop plný vody."""
    L = 3.2
    rampart_slice(L)
    wb = bmesh.new()
    box(wb, (2.0, 0, -0.97), (3.8, L - 0.04, 0.94))
    to_obj(wb, "water", mat("water", (0.09, 0.2, 0.26), 0.05), smooth=False)
    hud_light()
    camera([Vector((-2.5, -L / 2, -0.9)), Vector((6.5, L / 2, 2.2)), Vector((-2.5, L / 2, -0.9)),
            Vector((6.5, -L / 2, -0.9))], az=-18, el=30, margin=1.0)
    return True


def icon_fort_gate():
    """Brána v opevnění: kůly s trámem, jedno křídlo pootevřené, po stranách palisáda."""
    rng = random.Random(6)
    parts = fort_parts()
    palisade_run(parts, seg_points((-4.6, 0.0), (-2.35, 0.0)), rng)
    palisade_run(parts, seg_points((2.35, 0.0), (4.6, 0.0)), rng)
    for k in (-1, 1):
        inst(parts["gate-post"], (k * 2.05, 0, 0))
    inst(parts["gate-beam"], (0, 0, 3.9))
    inst(parts["gate-planks"], (2.0, 0, 0), rot=0.05)
    inst(parts["gate-planks"], (-2.0, 0, 0), rot=math.pi - 0.75)
    hud_light()
    camera([Vector((-4.7, -1.6, 0)), Vector((4.7, 0.3, 0)), Vector((-4.7, -1.6, 4.2)), Vector((4.7, 0.3, 4.2))],
           az=12, el=26, margin=1.0)
    return True


def icon_gate_pincer():
    """Klešťová brána: hradba se u brány stáčí dovnitř do dvou ramen, brána mezi nimi."""
    rng = random.Random(9)
    parts = fort_parts()
    palisade_run(parts, seg_points((-5.5, 0.0), (-2.3, 0.0)), rng)
    palisade_run(parts, seg_points((2.3, 0.0), (5.5, 0.0)), rng)
    for k in (-1, 1):
        palisade_run(parts, seg_points((k * 2.3, 0.27), (k * 2.3, 5.4)), rng)
    gate(parts, 0, 5.4, open_angle=0.0)
    hud_light()
    camera([Vector((-5.6, -0.4, 0)), Vector((5.6, 5.8, 0)), Vector((-5.6, 5.8, 4.2)), Vector((5.6, -0.4, 3.5))],
           az=32, el=56, margin=1.0)
    return True


def icon_gate_tower():
    """Věž nad branou: dřevěná věž na čtyřech kůlech nad vraty, po stranách palisáda."""
    rng = random.Random(10)
    parts = fort_parts()
    inst(parts["tower"], (0, 0, 0))
    gate(parts, 0, -2.4)
    palisade_run(parts, seg_points((-6.0, -2.4), (-2.65, -2.4)), rng)
    palisade_run(parts, seg_points((2.65, -2.4), (6.0, -2.4)), rng)
    hud_light()
    camera([Vector((-6.0, -2.7, 0)), Vector((6.0, 2.6, 0)), Vector((-2.6, -2.7, 8.1)), Vector((2.6, 2.6, 8.1))],
           az=18, el=18, margin=1.0)
    return True


def icon_fort_occupancy():
    """Obsazení hradby: tři muži rodu za palisádou, nad kůly jim jsou vidět hlavy a ramena."""
    rng = random.Random(12)
    parts = fort_parts()
    pts = seg_points((-1.5, 0.0), (1.5, 0.0), 0.12)
    for x, y in pts:
        inst(parts[rng.choice(["stake-a", "stake-b", "stake-c"])], (x, y, 0), rot=rng.uniform(0, 6.28),
             scale=0.4 * rng.uniform(0.95, 1.05))
    men = []
    for x, turn in ((-0.75, -10.0), (0.0, -24.0), (0.75, -38.0)):
        men += place_person("man", loc=(x, 0.45, 0.0), turn=turn)
    hud_light(az=-40, el=40, strength=4.4)
    camera([Vector((-1.5, -0.2, 0.55)), Vector((1.5, 0.6, 0.55)), Vector((-1.5, -0.2, 1.85)), Vector((1.5, 0.6, 1.85))],
           az=6, el=10, margin=1.02)
    return True


def icon_assault_ladder():
    """Žebříky: žebřík opřený o palisádu zvenčí, přečnívá přes špičky kůlů."""
    rng = random.Random(14)
    parts = fort_parts()
    siege = siege_parts()
    palisade_run(parts, seg_points((-2.0, 0.0), (2.0, 0.0)), rng)
    inst(siege["ladder-5"], (0.3, -1.95, 0), scale=1.25, tilt=(-0.32, 0.0))
    hud_light(az=-60, el=38)
    camera([Vector((-2.0, -2.1, 0)), Vector((2.0, 0.2, 0)), Vector((-2.0, -2.1, 5.9)), Vector((2.0, 0.2, 5.9))],
           az=-38, el=14, margin=1.02)
    return True


def icon_assault_axe():
    """Prosekat: kovaná sekera zaťatá do kůlu palisády (kůl přeseknutý napůl)."""
    wood, iron, edge, stake = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    cyl(stake, (0.0, 0.25, -1.0), (0.0, 0.25, 1.05), 0.3, 0.3, 10)
    cyl(stake, (0.0, 0.25, 1.05), (0.0, 0.25, 1.45), 0.3, 0.0, 10)
    axe(wood, iron, edge, Vector((0.95, 0.0, -0.75)), Vector((-0.3, 0.0, 0.62)))
    to_obj(stake, "stake", mat("stake", (0.45, 0.33, 0.21), 0.9, noise=25, bump=0.3), smooth=False)
    to_obj(wood, "handle", mat("haft", (0.66, 0.45, 0.24), 0.75, noise=18, bump=0.3))
    iron_objs(iron, edge)
    hud_light(az=-35, el=45, strength=4.4)
    camera([Vector((-0.9, -0.3, -1.0)), Vector((1.0, 0.6, 1.45))], az=-14, el=10, margin=1.02)
    return True


def icon_assault_fire():
    """Vypálit: otep chrastí u paty kůlů palisády, plameny šlehají po kůlech."""
    rng = random.Random(15)
    parts = fort_parts()
    siege = siege_parts()
    palisade_run(parts, seg_points((-0.8, 0.0), (0.8, 0.0)), rng)
    inst(siege["fagot"], (0.0, -0.45, 0), rot=0.1)
    outer, inner = bmesh.new(), bmesh.new()
    flame(outer, (0, -0.45, 0.2), 2.3, 0.6)
    flame(outer, (0.5, -0.4, 0.15), 1.5, 0.38, tilt=(0.2, 0.05))
    flame(outer, (-0.5, -0.45, 0.15), 1.6, 0.4, tilt=(-0.2, -0.05))
    flame(inner, (0, -0.55, 0.2), 1.3, 0.36)
    to_obj(outer, "flame", glow_mat("flame", (1.0, 0.36, 0.04), 2.2))
    to_obj(inner, "core", glow_mat("core", (1.0, 0.78, 0.25), 3.5))
    hud_light(az=-40, el=50, strength=3.5)
    camera([Vector((-1.0, -0.9, 0)), Vector((1.0, 0.2, 0)), Vector((-1.0, -0.9, 3.5)), Vector((1.0, 0.2, 3.5))],
           az=-10, el=14, margin=1.02)
    return True


def icon_assault_spade():
    """Odkopat / podkopat: rýč zaražený do hromádky vykopané hlíny."""
    rng = random.Random(16)
    heap, wood, iron = bmesh.new(), bmesh.new(), bmesh.new()
    lumpy_heap(heap, 0.85, 0.42, rng)
    to_obj(heap, "heap", mud_mat())
    spade(wood, iron, (0.08, 0.0, 0.05), (-0.42, 0.0, 1.55))
    bmesh.ops.recalc_face_normals(wood, faces=wood.faces)
    to_obj(wood, "spade", mat("haft", (0.66, 0.45, 0.24), 0.75, noise=18, bump=0.3), smooth=False)
    to_obj(iron, "shoe", metal("shoe", (0.36, 0.36, 0.38), 0.42, 0.65), smooth=False)
    hud_light(az=-40, el=45, strength=4.2)
    camera([Vector((-0.85, -0.85, 0)), Vector((0.85, 0.85, 0)), Vector((-0.55, 0, 1.6))], az=8, el=16, margin=1.02)
    return True


def icon_stone():
    """Kámen: hromada lomového kamení – díl `stone-pile-a` ze scény (hromady u cest a lomy)."""
    siege = siege_parts()
    inst(siege["stone-pile-a"], (0, 0, 0), rot=0.4)
    hud_light(az=-45, el=45)
    camera([Vector((-0.95, -0.95, 0)), Vector((0.95, 0.95, 0)), Vector((0, 0, 0.75))], az=10, el=26, margin=1.02)
    return True


def _heap(name, material, r=1.0, h=0.75, rough=0.07, seed=0):
    """Kupka sypkého materiálu: rotační kužel se zaobleným vrcholem, povrch rozvlněný šumem."""
    bm = bmesh.new()
    revolve(bm, [(0.0, r), (0.25 * h, 0.86 * r), (0.6 * h, 0.5 * r), (0.9 * h, 0.18 * r), (h, 0.0)], 40,
            cap_bottom=True)
    off = Vector((seed * 3.1, seed * 1.7, 0))
    for v in bm.verts:
        if v.co.z > 0.01:
            v.co += v.normal * rough * noise.noise(v.co * 3.0 + off) if v.normal.length else Vector()
    return to_obj(bm, name, material)


def icon_lime():
    """Vápno: kupka bílého hašeného vápna a pár hrud páleného vápna (churches.md – Velikost a cena)."""
    white = mat("lime", (0.93, 0.92, 0.87), 0.95, noise=8, bump=0.5)
    _heap("lime-heap", white, r=0.95, h=0.7, rough=0.05, seed=1)
    rng = random.Random(5)
    for k in range(5):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rng.uniform(0.13, 0.2))
        for v in bm.verts:
            v.co += Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03)))
            v.co += Vector((math.cos(k * 1.3) * 1.0, math.sin(k * 1.3) * 0.75 - 0.15, 0.08))
        to_obj(bm, f"lump{k}", mat("quick", (0.86, 0.84, 0.78), 0.9, noise=14, bump=0.8), smooth=False)
    hud_light(az=-45, el=45)
    camera([Vector((-1.25, -1.0, 0)), Vector((1.25, 1.0, 0)), Vector((0, 0, 0.75))], az=10, el=26, margin=1.02)
    return True


def icon_sand():
    """Písek: kupka žlutohnědého písku z písníku (churches.md – Velikost a cena)."""
    _heap("sand-heap", mat("sand", (0.78, 0.64, 0.4), 0.95, noise=25, bump=0.6), r=1.0, h=0.72, seed=2)
    hud_light(az=-45, el=45)
    camera([Vector((-1.05, -1.05, 0)), Vector((1.05, 1.05, 0)), Vector((0, 0, 0.75))], az=10, el=26, margin=1.02)
    return True


def icon_demolish():
    """Zbourat stavbu: dřevěná palice nad rozbořenou palisádou – pahýly a padlé kůly."""
    rng = random.Random(18)
    parts = fort_parts()
    for x, h in ((-0.7, 0.55), (0.0, 0.42), (0.55, 0.6)):
        inst(parts[rng.choice(["stake-a", "stake-b", "stake-c"])], (x, 0.3, -3.5 * (1 - h) * 0.7),
             rot=rng.uniform(0, 6.28), scale=0.7, tilt=(rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15)))
    inst(parts["stake-a"], (-1.3, -0.2, 0.1), rot=0.25, scale=0.7, tilt=(0.0, math.pi / 2 - 0.05))
    inst(parts["stake-b"], (0.2, -0.75, 0.1), rot=-0.35, scale=0.7, tilt=(0.0, -math.pi / 2 + 0.05))
    wood = bmesh.new()
    mallet(wood, (1.75, -0.1, 0.9), (0.45, -0.1, 2.5), length=1.1, r=0.36)
    to_obj(wood, "mallet", mat("mallet", (0.46, 0.31, 0.17), 0.8, noise=18, bump=0.35))
    hud_light()
    camera([Vector((-1.6, -1.0, 0)), Vector((1.8, 0.6, 0)), Vector((-1.6, -1.0, 2.8)), Vector((1.8, 0.6, 2.8))],
           az=-12, el=18, margin=1.02)
    return True


def icon_breakout():
    """Probít se: palisáda s bránou otevřenou ven a červená šipka z brány ven."""
    rng = random.Random(20)
    parts = fort_parts()
    palisade_run(parts, seg_points((-5.0, 0.0), (-2.35, 0.0)), rng)
    palisade_run(parts, seg_points((2.35, 0.0), (5.0, 0.0)), rng)
    gate(parts, 0, 0, open_angle=1.15)
    arrow = bmesh.new()
    lying_plate(arrow, flat_arrow((0.0, 1.6), (0.0, -5.4), 1.5, 3.4, 2.3), 0.9, 0.36)
    bmesh.ops.recalc_face_normals(arrow, faces=arrow.faces)
    to_obj(arrow, "arrow", glow_mat("out", (0.85, 0.12, 0.06), 0.5), smooth=False)
    hud_light()
    camera([Vector((-5.0, -5.6, 0)), Vector((5.0, 0.4, 0)), Vector((-5.0, 0.4, 4.2)), Vector((5.0, -5.6, 0))],
           az=14, el=36, margin=0.98)
    return True


def page_z(u):
    """Výška stránky otevřené knihy ve vzdálenosti `u` (0 hřbet, 1 okraj)."""
    return 0.06 + 0.22 * (1 - (1 - u) ** 3) - 0.05 * u ** 4


def icon_chronicle():
    """Kronika: otevřená kniha – pergamenové stránky s řádky písma a červenou iniciálou, kožená vazba."""
    rng = random.Random(21)
    pages, ink, red, cover = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    n = 24
    for s in (-1, 1):
        prof = [(s * (0.015 + 0.985 * i / n), page_z(0.015 + 0.985 * i / n)) for i in range(n + 1)]
        flat_plate(pages, prof + [(s * 1.0, 0.05), (s * 0.015, 0.05)], 0.0, 1.4)
        lying_plate(cover, [(0, -0.78), (s * 1.09, -0.78), (s * 1.09, 0.78), (0, 0.78)], 0.0, 0.05)
        for j in range(8):
            y = 0.5 - j * 0.135
            u = 0.14
            while u < 0.86:
                ln = rng.uniform(0.07, 0.2)
                u1 = min(u + ln, 0.86)
                target = red if (j < 2 and u < 0.2 and s < 0) else ink
                k = 4
                for i in range(k):
                    a = u + (u1 - u) * i / k
                    b = u + (u1 - u) * (i + 1) / k
                    hw = 0.05 if target is red else 0.022
                    v = [target.verts.new((s * a, y - hw, page_z(a) + 0.004)),
                         target.verts.new((s * b, y - hw, page_z(b) + 0.004)),
                         target.verts.new((s * b, y + hw, page_z(b) + 0.004)),
                         target.verts.new((s * a, y + hw, page_z(a) + 0.004))]
                    target.faces.new(v if s > 0 else v[::-1])
                u = u1 + rng.uniform(0.03, 0.05)
    bmesh.ops.recalc_face_normals(pages, faces=pages.faces)
    bmesh.ops.recalc_face_normals(cover, faces=cover.faces)
    to_obj(pages, "pages", mat("parchment", (0.93, 0.85, 0.66), 0.9, noise=8, bump=0.15), smooth=False)
    to_obj(ink, "ink", mat("ink", (0.16, 0.1, 0.07), 0.9), smooth=False)
    to_obj(red, "initial", mat("initial", (0.62, 0.1, 0.06), 0.8), smooth=False)
    to_obj(cover, "cover", mat("leather", (0.36, 0.17, 0.08), 0.7, noise=20, bump=0.3), smooth=False)
    hud_light(az=-35, el=55, strength=4.0)
    camera([Vector((-1.1, -0.8, 0)), Vector((1.1, 0.8, 0)), Vector((0, 0, 0.3))], az=0, el=50, margin=1.02)
    return True


def icon_bell():
    """Upozornění: bronzový zvon s okem a srdcem, lehce rozhoupaný, na dřevěném břevnu."""
    bell, wood, iron = bmesh.new(), bmesh.new(), bmesh.new()
    revolve(bell, [(0.0, 0.0), (0.0, 0.66), (0.06, 0.68), (0.13, 0.6), (0.35, 0.49), (0.62, 0.42), (0.86, 0.4),
                   (1.0, 0.35), (1.08, 0.22), (1.11, 0.0)], 48, cap_top=True)
    for i in range(16):
        a0, a1 = 2 * math.pi * i / 16, 2 * math.pi * (i + 1) / 16
        cyl(bell, (math.cos(a0) * 0.13, 0, 1.24 + math.sin(a0) * 0.13), (math.cos(a1) * 0.13, 0, 1.24 + math.sin(a1) * 0.13),
            0.04, 0.04, 6)
    cyl(iron, (0, 0, 1.0), (0, 0, 0.0), 0.03, 0.03, 6)
    blob(iron, ((0, 0, -0.04), (0, 0, 0)), (0.11, 0.11, 0.13), 12, 8)
    box(wood, (0, 0, 1.42), (1.6, 0.2, 0.18))
    objs = [to_obj(bell, "bell", metal("bronze", (0.7, 0.47, 0.2), 0.32, 0.85)),
            to_obj(iron, "clapper", metal("clapper", (0.3, 0.3, 0.32), 0.5, 0.7))]
    to_obj(wood, "yoke", mat("yoke", (0.45, 0.31, 0.18), 0.85, noise=20, bump=0.3), smooth=False)
    pivot = Vector((0, 0, 1.42))
    swing = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(14), 4, "Y") @ Matrix.Translation(-pivot)
    for o in objs:
        o.matrix_world = swing @ o.matrix_world
    hud_light(az=-40, el=40, strength=4.4)
    camera([Vector((-0.9, -0.2, -0.1)), Vector((0.9, 0.2, 1.55))], az=0, el=8, margin=1.04)
    return True


def house_model(name="zemnice"):
    objs = place_model(name)
    bpy.context.view_layer.update()
    return objs, world_points(objs)


def icon_abandon_structure():
    """Opustit stavbu: zšedlá zemnice, ke které už se prodírají kopřivy."""
    objs, pts = house_model()
    tint_imported(objs, (0.62, 0.62, 0.6))
    lo = [min(p[i] for p in pts) for i in range(2)]
    hi = [max(p[i] for p in pts) for i in range(2)]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{MODELS}/decay.glb")
    nettles = []
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.type == "MESH" and o.name.startswith("nettle"):
            nettles.append(o)
        elif o.type == "MESH":
            bpy.data.objects.remove(o)
    size = (hi[0] - lo[0]) * 0.32
    spots = ((lo[0] + 0.1 * (hi[0] - lo[0]), lo[1] - 0.2, 0.3), (hi[0] - 0.2 * (hi[0] - lo[0]), lo[1] - 0.4, 2.1),
             ((lo[0] + hi[0]) / 2, lo[1] - 0.8, 4.0))
    for k, (x, y, rot) in enumerate(spots):
        o = nettles[0] if k == 0 else nettles[0].copy()
        if k:
            bpy.context.collection.objects.link(o)
        o.location = (x, y, 0)
        o.scale = (size, size, size)
        o.rotation_euler = (0, 0, rot)
    hud_light(az=-55, el=46)
    camera(pts + [Vector((x, y, 0)) for x, y, _ in spots], az=32, el=26, margin=1.02)
    return True


def icon_restore():
    """Vrátit opuštěnou stavbu: zemnice a kolem ní zelená šipka zpět."""
    objs, pts = house_model()
    lo = [min(p[i] for p in pts) for i in range(2)]
    hi = [max(p[i] for p in pts) for i in range(2)]
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    r = max(hi[0] - lo[0], hi[1] - lo[1]) * 0.62
    arrow = bmesh.new()
    lying_plate(arrow, [(cx + x, cy + y) for x, y in arc_arrow(r, r * 0.16, math.radians(-30), math.radians(250))],
                0.15, r * 0.06)
    bmesh.ops.recalc_face_normals(arrow, faces=arrow.faces)
    to_obj(arrow, "arrow", glow_mat("back", (0.22, 0.62, 0.12), 0.45), smooth=False)
    hud_light(az=-55, el=46)
    ring = [Vector((cx + math.cos(a) * r * 1.2, cy + math.sin(a) * r * 1.2, 0)) for a in range(0, 7)]
    camera(pts + ring, az=20, el=34, margin=1.0)
    return True


def icon_abandon_part():
    """Opustit díl pole: zoraný díl s brázdami, do kterého se vrací keř a mladá bříza."""
    soil, ridges, grass = bmesh.new(), bmesh.new(), bmesh.new()
    lying_plate(soil, [(-1.6, -1.2), (1.6, -1.2), (1.6, 1.2), (-1.6, 1.2)], -0.1, 0.1)
    for i in range(8):
        y = -1.05 + i * 0.3
        cyl(ridges, (-1.55, y, -0.02), (1.55, y, -0.02), 0.1, 0.1, 6)
    rng = random.Random(22)
    for _ in range(40):
        x, y = rng.uniform(-1.5, 1.5), rng.uniform(-1.1, 1.1)
        h = rng.uniform(0.12, 0.32)
        cyl(grass, (x, y, 0), (x + rng.uniform(-0.06, 0.06), y + rng.uniform(-0.06, 0.06), h), 0.02, 0.0, 3)
    soil_mat = mud_mat("soil", 0.5)
    to_obj(soil, "soil", soil_mat, smooth=False)
    to_obj(ridges, "ridges", soil_mat)
    to_obj(grass, "grass", mat("grass", (0.3, 0.46, 0.16), 1.0, noise=22), smooth=False)
    objs = []
    for (name, folder, loc, rot, scale) in (
        ("birch-1", TREES, (0.55, 0.45, 0), 0.6, 0.16),
        ("shrub-3", DECOR, (-0.75, 0.1, 0), 1.2, 0.42),
        ("shrub-5", DECOR, (0.1, -0.6, 0), 2.6, 0.3),
    ):
        for o in place_model(name, folder=folder):
            o.location = Vector(loc)
            o.rotation_euler = (0, 0, rot)
            o.scale = (scale, scale, scale)
            objs.append(o)
    bpy.context.view_layer.update()
    hud_light(az=-50, el=46, strength=4.0)
    camera(world_points(objs) + [Vector((-1.6, -1.2, 0)), Vector((1.6, 1.2, 0)), Vector((1.6, -1.2, 0)),
                                 Vector((-1.6, 1.2, 0))], az=20, el=30, margin=1.02)
    return True


def icon_lom():
    """Lom (portrét stavby): vylomená stěna světlé skály ve stupních, hromady kamení a kvádry."""
    rng = random.Random(23)
    earth_ground(6.5, lambda x, y: 0.03 * noise.noise(Vector((x * 0.8, y * 0.8, 0))), tint=(0.86, 0.8, 0.68))
    lime = mat("limestone", (0.64, 0.6, 0.52), 0.95, noise=12, bump=1.2)
    wall = bmesh.new()
    for k, (y, z, w) in enumerate([(1.0, 1.0, 6.6), (1.9, 2.0, 6.0), (2.8, 3.0, 5.4)]):
        box(wall, (0.2 * k, y, z / 2), (w, 0.95, z))
    bmesh.ops.subdivide_edges(wall, edges=wall.edges[:], cuts=3, use_grid_fill=True)
    for v in wall.verts:
        if v.co.z > 0.05:
            v.co += Vector((0.12 * noise.noise(v.co * 1.7), 0.18 * noise.noise(v.co * 1.3 + Vector((5, 5, 5))),
                            0.1 * noise.noise(v.co * 2.1 + Vector((9, 9, 9)))))
    to_obj(wall, "wall", lime, smooth=False)
    siege = siege_parts()
    inst(siege["stone-pile-b"], (-2.0, -1.1, 0), rot=0.6)
    inst(siege["stone-pile-a"], (1.9, -1.7, 0), rot=1.9)
    blocks = bmesh.new()
    for x, y in [(0.2, -0.5), (0.9, 0.0), (-0.5, -2.2)]:
        box(blocks, (x, y, 0.2), (0.7, 0.45, 0.4), (0, 0, rng.uniform(-0.5, 0.5)))
    to_obj(blocks, "blocks", lime, smooth=False)
    wood = bmesh.new()
    mallet(wood, (0.6, -1.15, 0.12), (-0.35, -1.6, 0.15), length=0.45, r=0.13)
    to_obj(wood, "mallet", mat("mallet", (0.6, 0.42, 0.24), 0.8, noise=18, bump=0.35))
    sun(az=-55, el=46)
    pts = [Vector((-3.6, -3.0, 0)), Vector((3.6, 3.4, 0)), Vector((-3.6, 3.4, 0)), Vector((3.6, -3.0, 0)),
           Vector((0.4, 2.8, 3.0))]
    camera(pts, az=22, el=36, margin=1.0)
    return True


# ------------------------------------------- panely rodu, vazalství a války ----
# Druhá várka ručních SVG (5.–7. 11. 2026) – panely rodu, vazalství, války, nováčka a správce vsi.
# Martin 9. 11. 2026: „ano“ k předělání všech ručně kreslených ikon v Blenderu stejně jako ostatní
# ikony. Stejná scéna, světlo a zmenšení jako ikony surovin (64 × 64, `small`); zbraně, štíty,
# prapory, pečeti a nářadí jsou jednoduché modelované tvary (výcvikové rekvizity postav jsou na ikonu
# moc hrubé), brána a palisáda jsou díly scény (`fortifications.glb`), smrky modely krajiny
# a zajatec i prosebník vesničan hry (`models/people/`). Výstup do `house/`, `war/`, `newcomer/`.

PAINT_RED = (0.46, 0.06, 0.035)


def move(objs, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=1.0):
    """Posune, natočí a zvětší hotové objekty jako celek (skládání ikony z dílů)."""
    m = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Scale(scale, 4)
    for o in objs:
        o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()
    return objs


def wood_mat(name="wood", color=(0.46, 0.3, 0.15)):
    return mat(name, color, 0.8, noise=20, bump=0.3)


def iron_mat(name="iron"):
    return metal(name, (0.36, 0.36, 0.38), 0.42, 0.65)


def gold_metal(name="gilt"):
    return metal(name, (0.8, 0.56, 0.2), 0.3, 0.9)


def parchment_mat(name="parchment"):
    return mat(name, (0.93, 0.85, 0.66), 0.9, noise=8, bump=0.15)


def wax_mat(name="wax"):
    return mat(name, (0.42, 0.03, 0.02), 0.32, noise=24, bump=0.15)


def red_mark(name="red"):
    """Červená šipka ven (poslat muže na ochranu) – stejná jako šipka Probít se."""
    return glow_mat(name, (0.85, 0.12, 0.06), 0.5)


def green_mark(name="green"):
    """Zelená značka (šipka zpět) – stejná jako šipka Vrátit stavbu."""
    return glow_mat(name, (0.22, 0.62, 0.12), 0.45)


def sweep(bm, pts, radius, seg=10, closed=False):
    """Trubka podél lomené čáry `pts` (poloměr číslo nebo funkce t 0…1) – článek, roh, popruh."""
    n = len(pts) - (0 if closed else 1)
    for i in range(n):
        j = (i + 1) % len(pts)
        r0 = radius(i / n) if callable(radius) else radius
        r1 = radius((i + 1) / n) if callable(radius) else radius
        cyl(bm, pts[i], pts[j], r0, r1, seg)


def ellipse_arc(centre, a, b, t0, t1, rot=(0.0, 0.0, 0.0), n=28):
    """Body oblouku elipsy (poloosy a, b) v rovině XZ od úhlu t0 do t1, natočené a posunuté."""
    m = Euler(rot).to_matrix()
    return [Vector(centre) + m @ Vector((math.cos(t) * a, 0.0, math.sin(t) * b))
            for t in (t0 + (t1 - t0) * i / n for i in range(n + 1))]


def ring_pts(centre, a, b, rot=(0.0, 0.0, 0.0), n=28):
    """Body celé elipsy bez opakovaného posledního bodu (pro `sweep(..., closed=True)`)."""
    return ellipse_arc(centre, a, b, 0.0, 2 * math.pi, rot, n)[:-1]


def shield_objs(paint=PAINT_RED, name="shield"):
    """Kulatý štít z prken: natřený líc s klenbou, železná puklice, kožený lem a nýty – líc k −Y."""
    face, boss, rim, rivets = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    revolve(face, [(0.0, 1.0), (0.07, 1.0), (0.12, 0.86), (0.16, 0.56), (0.18, 0.04)], 64,
            cap_bottom=True, cap_top=True)
    revolve(boss, [(0.16, 0.32), (0.21, 0.32), (0.28, 0.26), (0.36, 0.14), (0.38, 0.02)], 40, cap_top=True)
    sweep(rim, ring_pts((0, 0, 0.07), 1.0, 1.0, rot=(math.pi / 2, 0, 0), n=64), 0.055, 8, closed=True)
    for k in range(10):
        a = 2 * math.pi * k / 10 + 0.3
        blob(rivets, ((math.cos(a) * 0.82, math.sin(a) * 0.82, 0.13), (0, 0, 0)), (0.04, 0.04, 0.03), 8, 5)
    objs = [to_obj(face, name, mat(name, paint, 0.75, noise=10, bump=0.25)),
            to_obj(boss, "boss", iron_mat()),
            to_obj(rim, "rim", mat("rim", (0.22, 0.14, 0.08), 0.7, noise=20, bump=0.2)),
            to_obj(rivets, "rivets", iron_mat("rivet"))]
    return move(objs, rot=(math.pi / 2, 0, 0))


def sword_objs():
    """Meč: dvojbřitá čepel se žlábkem, bronzová záštita a hlavice, rukojeť ovinutá kůží – svisle (XZ)."""
    blade, fuller, grip, gilt = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    L = 2.0
    flat_plate(blade, [(-0.12, 0.0), (0.12, 0.0), (0.105, L * 0.82), (0.06, L * 0.95), (0.0, L),
                       (-0.06, L * 0.95), (-0.105, L * 0.82)], 0.0, 0.05)
    flat_plate(fuller, [(-0.035, 0.06), (0.035, 0.06), (0.02, L * 0.78), (-0.02, L * 0.78)], -0.028, 0.006)
    box(gilt, (0, 0, -0.03), (0.66, 0.13, 0.1))
    cyl(grip, (0, 0, -0.08), (0, 0, -0.52), 0.065, 0.06, 10)
    blob(gilt, ((0, 0, -0.6), (0, 0, 0)), (0.17, 0.09, 0.11), 12, 8)
    bmesh.ops.recalc_face_normals(blade, faces=blade.faces)
    return [to_obj(blade, "blade", metal("blade", (0.7, 0.71, 0.74), 0.28, 0.85), smooth=False),
            to_obj(fuller, "fuller", metal("fuller", (0.3, 0.31, 0.34), 0.4, 0.7), smooth=False),
            to_obj(grip, "grip", mat("grip", (0.3, 0.17, 0.08), 0.7, noise=30, bump=0.4)),
            to_obj(gilt, "guard", gold_metal())]


def spear_into(wood, iron, h0, h1, y=0.0):
    """Oštěp do dvou bmesh: násada h0 → h1 a listovitý hrot s objímkou (rovina XZ v hloubce y)."""
    h0, h1 = Vector(h0), Vector(h1)
    cyl(wood, h0, h1, 0.07, 0.06, 10)
    d = (h1 - h0).normalized()
    n = Vector((d.z, 0, -d.x))
    cyl(iron, h1 - d * 0.05, h1 + d * 0.16, 0.1, 0.085, 10)
    base = h1 + d * 0.14
    blade = [(0.0, -0.1), (0.2, -0.2), (0.5, -0.17), (0.82, 0.0), (0.5, 0.17), (0.2, 0.2), (0.0, 0.1)]
    flat_plate(iron, [((base + d * u * 1.1 + n * v * 1.1).x, (base + d * u * 1.1 + n * v * 1.1).z)
                      for u, v in blade], y, 0.07)


def cloth_wave(x, z, amp=0.14):
    return amp * math.sin(x * 3.1 - 0.5) * min(1.0, x / 0.5) + 0.03 * math.sin(z * 5.0 + x * 2.0)


def banner_objs(color, emblem=None, notch=0.42, L=1.7, H=1.05, top=1.55, pole=(-0.75, 1.8)):
    """Prapor na žerdi: látka s vlnou (vlaštovčí ocas o hloubce `notch`), volitelně zlaté znamení
    `emblem` (obrys v rovině látky, střed a velikost v látce) – žerď v ose Z, látka k +X."""
    staff, cloth, gilt, sign = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    cyl(staff, (0, 0, pole[0]), (0, 0, pole[1]), 0.05, 0.045, 10)
    blob(gilt, ((0, 0, pole[1] + 0.05), (0, 0, 0)), (0.085, 0.085, 0.1), 12, 8)

    def sag(x):
        return 0.14 * max(0.0, (x - 0.05) / (L - 0.05)) ** 1.5

    nu, nv = 30, 16
    rows = []
    for j in range(nv + 1):
        v = j / nv
        z = top - H * v
        xend = L - notch * (1 - abs(2 * v - 1))
        row = []
        for i in range(nu + 1):
            x = 0.05 + (xend - 0.05) * i / nu
            row.append(cloth.verts.new((x, cloth_wave(x, z), z - sag(x))))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            cloth.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    objs = [to_obj(staff, "staff", wood_mat("staff", (0.4, 0.26, 0.13))),
            to_obj(cloth, "cloth", mat("cloth", color, 0.88, noise=14, bump=0.2)),
            to_obj(gilt, "finial", gold_metal())]
    if emblem:
        pts, (cx, cz), size = emblem
        f = sign.faces.new([sign.verts.new((cx + x * size, 0.0, cz + z * size)) for x, z in pts])
        bmesh.ops.triangulate(sign, faces=[f])
        bmesh.ops.subdivide_edges(sign, edges=sign.edges[:], cuts=3, use_grid_fill=True)
        for vv in sign.verts:
            x, z = vv.co.x, vv.co.z
            vv.co = Vector((x, cloth_wave(x, z) - 0.018, z - sag(x)))
        objs.append(to_obj(sign, "sign", mat("sign", (0.86, 0.62, 0.2), 0.45, noise=20)))
    return objs


CROWN = [(-1.0, -0.6), (1.0, -0.6), (1.0, 0.55), (0.55, 0.05), (0.0, 0.8), (-0.55, 0.05), (-1.0, 0.55)]
DIAMOND = [(0.0, -1.0), (0.68, 0.0), (0.0, 1.0), (-0.68, 0.0)]


def banner_icon(color, emblem=None, notch=0.42):
    objs = banner_objs(color, emblem, notch)
    move(objs, rot=(0, math.radians(-8), 0))
    hud_light(az=-40, el=40, strength=4.4)
    camera(world_points(objs), az=-18, el=10, margin=1.04)
    return True


def seal_outline(r, rng, n=44):
    return [(math.cos(2 * math.pi * i / n) * r * (1 + 0.035 * math.sin(5 * 2 * math.pi * i / n) + rng.uniform(-0.015, 0.015)),
             math.sin(2 * math.pi * i / n) * r * (1 + 0.035 * math.sin(5 * 2 * math.pi * i / n) + rng.uniform(-0.015, 0.015)))
            for i in range(n)]


SEAL_CRACK = [(0.04, 1.0), (-0.07, 0.62), (0.09, 0.28), (-0.06, -0.05), (0.08, -0.4), (-0.05, -0.72), (0.03, -1.0)]


def seal_objs(broken=False, rng=None):
    """Vosková pečeť na pergamenu se šňůrou: okraj s raženým kruhem a křížem; rozlomená = dvě
    poloviny od sebe s klikatým lomem."""
    rng = rng or random.Random(31)
    wax, sheet, cord = bmesh.new(), bmesh.new(), bmesh.new()
    lying_plate(sheet, [(-1.25, -0.95), (1.2, -1.0), (1.25, 0.9), (-1.2, 0.95)], -0.04, 0.03)
    sweep(cord, [Vector((0.2, -0.5, 0.0)), Vector((0.55, -1.05, 0.0)), Vector((0.75, -1.4, -0.02))], 0.04, 8)
    sweep(cord, [Vector((-0.1, -0.5, 0.0)), Vector((-0.25, -1.1, 0.0)), Vector((-0.2, -1.45, -0.02))], 0.04, 8)
    if not broken:
        lying_plate(wax, seal_outline(0.82, rng), 0.0, 0.14)
        lying_plate(wax, seal_outline(0.62, rng, 40), 0.14, 0.04)
        sweep(wax, [Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.2)) for a in
                    (2 * math.pi * i / 40 for i in range(40))], 0.03, 6, closed=True)
        box(wax, (0, 0, 0.21), (0.08, 0.62, 0.05))
        box(wax, (0, 0.05, 0.21), (0.46, 0.08, 0.05))
    else:
        for side, shift, turn in ((1, (0.2, -0.05), -0.16), (-1, (-0.17, 0.05), 0.12)):
            half = bmesh.new()
            for r, z, h in ((0.82, 0.0, 0.14), (0.62, 0.14, 0.04)):
                arc = [(math.cos(a) * r, math.sin(a) * r) for a in
                       (math.radians(-86 + 172 * i / 24) for i in range(25))]
                crack = [(x * r, y * r) for x, y in SEAL_CRACK if abs(y) < 0.97]
                if side > 0:
                    pts = arc + crack
                else:
                    pts = [(-x, -y) for x, y in arc] + [(x * r, y * r) for x, y in SEAL_CRACK[::-1] if abs(y) < 0.97]
                lying_plate(half, pts, z, h)
            bmesh.ops.rotate(half, verts=half.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(turn, 3, "Z"))
            bmesh.ops.translate(half, verts=half.verts, vec=(shift[0], shift[1], 0))
            bmesh.ops.recalc_face_normals(half, faces=half.faces)
            me = bpy.data.meshes.new("tmp")
            half.to_mesh(me)
            half.free()
            wax.from_mesh(me)
            bpy.data.meshes.remove(me)
    bmesh.ops.recalc_face_normals(wax, faces=wax.faces)
    bmesh.ops.recalc_face_normals(sheet, faces=sheet.faces)
    return [to_obj(wax, "wax", wax_mat(), smooth=False),
            to_obj(sheet, "sheet", parchment_mat(), smooth=False),
            to_obj(cord, "cord", mat("cord", (0.72, 0.6, 0.3), 0.85, noise=40))]


def quill_objs():
    """Husí brk: světlý prapor pera podél stvolu, tmavý seříznutý hrot – rovina XZ, hrot dole vlevo."""
    shaft, vane, nib = bmesh.new(), bmesh.new(), bmesh.new()
    a, b = Vector((-0.95, 0.0, -1.0)), Vector((0.85, 0.0, 1.05))
    d = (b - a).normalized()
    n = Vector((d.z, 0, -d.x))
    cyl(shaft, a + d * 0.12, b, 0.03, 0.012, 8)
    cyl(nib, a, a + d * 0.14, 0.004, 0.03, 8)
    L = (b - a).length
    left, right = [], []
    for i in range(25):
        t = 0.28 + 0.72 * i / 24
        w = max(0.0, math.sin(math.pi * (t - 0.28) / 0.72)) ** 0.55
        p = a + d * (t * L)
        left.append(p - n * (0.3 * w) + d * 0.04 * w)
        right.append(p + n * (0.17 * w) + d * 0.03 * w)
    pts = [(p.x, p.z) for p in left] + [(p.x, p.z) for p in right[::-1]]
    flat_plate(vane, pts, 0.0, 0.02)
    bmesh.ops.recalc_face_normals(vane, faces=vane.faces)
    return [to_obj(shaft, "quill", mat("quill", (0.9, 0.86, 0.74), 0.6)),
            to_obj(vane, "vane", mat("vane", (0.92, 0.89, 0.8), 0.85, noise=40, bump=0.4), smooth=False),
            to_obj(nib, "nib", mat("nib", (0.08, 0.06, 0.05), 0.5))]


def key_objs():
    """Kovaný klíč: kruhové oko, dřík a zub s vruby – rovina XZ, oko nahoře."""
    iron = bmesh.new()
    sweep(iron, ring_pts((0, 0, 0.62), 0.3, 0.3, n=32), 0.075, 10, closed=True)
    cyl(iron, (0, 0, 0.32), (0, 0, -1.05), 0.075, 0.07, 12)
    box(iron, (0, 0, 0.28), (0.24, 0.24, 0.08))
    box(iron, (0.2, 0, -0.82), (0.3, 0.09, 0.42))
    box(iron, (0.36, 0, -0.95), (0.1, 0.09, 0.16))
    return [to_obj(iron, "key", metal("key", (0.4, 0.38, 0.36), 0.4, 0.7))]


def chain_objs(n=4, gap_at=None):
    """Řetěz ze `n` článků podél osy X (každý druhý natočený); článek `gap_at` je uprostřed
    rozetnutý a obě půlky řetězu od sebe."""
    iron = bmesh.new()
    pitch = 0.62
    for k in range(n):
        x = (k - (n - 1) / 2) * pitch
        rot = (math.pi / 2, 0, 0) if k % 2 else (0, 0, 0)
        if k == gap_at:
            # levá půlka článku (oblouk vlevo) a pravá půlka, mezi nimi mezera
            sweep(iron, ellipse_arc((x - 0.16, 0, 0), 0.42, 0.24, math.pi / 2 + 0.35, 3 * math.pi / 2 - 0.35, rot, 14),
                  0.1, 10)
            sweep(iron, ellipse_arc((x + 0.16, 0, 0), 0.42, 0.24, -math.pi / 2 + 0.35, math.pi / 2 - 0.35, rot, 14),
                  0.1, 10)
        else:
            shift = 0.0 if gap_at is None else (0.16 if k > gap_at else -0.16)
            sweep(iron, ring_pts((x + shift, 0, 0), 0.42, 0.24, rot=rot, n=28), 0.1, 10, closed=True)
    return [to_obj(iron, "chain", metal("chain", (0.38, 0.38, 0.4), 0.42, 0.7))]


def cuff_objs(centre, axis, open_angle=0.0, r=0.16, tube=0.05):
    """Železné pouto (obruč) kolem zápěstí s osou `axis`; otevřené = horní půlka odklopená."""
    iron = bmesh.new()
    axis = Vector(axis).normalized()
    q = axis.to_track_quat("Y", "Z")
    lower = [Vector(centre) + q @ Vector((math.cos(t) * r, 0, math.sin(t) * r))
             for t in (math.pi + math.pi * i / 12 for i in range(13))]
    hinge = Vector(centre) + q @ Vector((r, 0, 0))
    rot = Matrix.Rotation(open_angle, 3, q @ Vector((0, 1, 0)))
    upper = [hinge + rot @ (Vector(centre) + q @ Vector((math.cos(t) * r, 0, math.sin(t) * r)) - hinge)
             for t in (math.pi * i / 12 for i in range(13))]
    sweep(iron, lower, tube, 8)
    sweep(iron, upper, tube, 8)
    for p in (lower[0], lower[-1]):
        blob(iron, ((p.x, p.y, p.z), (0, 0, 0)), (tube * 1.4, tube * 1.4, tube * 1.4), 8, 6)
    return [to_obj(iron, "cuff", metal("cuff", (0.34, 0.33, 0.33), 0.45, 0.7))]


# -------------------------------------------------------------- rod a vazalství ----


def icon_house_banner():
    """Rod a páni: červený prapor s vlaštovčím ocasem na žerdi se zlatou hlavicí."""
    return banner_icon(PAINT_RED)


def icon_banner_crown():
    """Nováček – Vybrat pána: modrý prapor se zlatou korunou."""
    return banner_icon((0.12, 0.2, 0.45), (CROWN, (0.84, 1.02), 0.36))


def icon_banner_free():
    """Nováček – Svobodný: zelený prapor se zlatým kosočtvercem."""
    return banner_icon((0.13, 0.34, 0.14), (DIAMOND, (0.84, 1.02), 0.36))


def icon_white_flag():
    """Vzdát se při přesile: bílá plachetka na šikmé žerdi."""
    objs = banner_objs((0.9, 0.88, 0.8), None, notch=0.0)
    move(objs, rot=(0, math.radians(-16), 0))
    hud_light(az=-40, el=40, strength=4.0)
    camera(world_points(objs), az=-18, el=10, margin=1.04)
    return True


def icon_seal():
    objs = seal_objs()
    hud_light(az=-40, el=50, strength=4.2)
    camera(world_points(objs), az=0, el=52, margin=1.0)
    return True


def icon_seal_broken():
    objs = seal_objs(broken=True)
    hud_light(az=-40, el=50, strength=4.2)
    camera(world_points(objs), az=0, el=52, margin=1.0)
    return True


def icon_seal_pen():
    """Nové podmínky: pečeť na pergamenu a přes ni položený brk."""
    objs = seal_objs()
    q = quill_objs()
    move(q, loc=(0.35, -0.15, 0.32), rot=(-math.pi / 2, 0, math.radians(-15)), scale=0.85)
    hud_light(az=-40, el=50, strength=4.2)
    camera(world_points(objs + q), az=0, el=52, margin=1.0)
    return True


def icon_pen():
    """Protinávrh: brk namočený v hliněném kalamáři."""
    q = quill_objs()
    move(q, loc=(0.95, 0.0, 1.4))
    ink = bmesh.new()
    revolve(ink, [(0.0, 0.32), (0.08, 0.42), (0.3, 0.46), (0.48, 0.36), (0.56, 0.2), (0.62, 0.22), (0.66, 0.2),
                  (0.6, 0.15)], 36, cap_bottom=True, cap_top=True)
    pot = to_obj(ink, "inkwell", mat("pot", (0.5, 0.3, 0.18), 0.7, noise=12, bump=0.2))
    hud_light(az=-40, el=40)
    camera(world_points(q + [pot]), az=10, el=14, margin=1.04)
    return True


def icon_copy():
    """Kopírovat odkaz: dva listy pergamenu přes sebe, horní s řádky písma."""
    rng = random.Random(33)
    sheets, ink = bmesh.new(), bmesh.new()
    for (ox, oy, z, turn) in ((-0.3, 0.28, 0.0, 0.08), (0.25, -0.22, 0.05, -0.06)):
        m = Matrix.Rotation(turn, 3, "Z")
        corner = [(-0.75, -1.0), (0.75, -1.0), (0.75, 1.0), (-0.75, 1.0)]
        lying_plate(sheets, [((m @ Vector((x, y, 0))).x + ox, (m @ Vector((x, y, 0))).y + oy) for x, y in corner],
                    z, 0.03)
        for j in range(7):
            y = 0.72 - j * 0.24
            x1 = 0.55 if j < 6 else rng.uniform(-0.1, 0.2)
            line = [(-0.55, y - 0.035), (x1, y - 0.035), (x1, y + 0.035), (-0.55, y + 0.035)]
            lying_plate(ink, [((m @ Vector((x, yy, 0))).x + ox, (m @ Vector((x, yy, 0))).y + oy) for x, yy in line],
                        z + 0.03, 0.004)
    bmesh.ops.recalc_face_normals(sheets, faces=sheets.faces)
    objs = [to_obj(sheets, "sheets", parchment_mat(), smooth=False),
            to_obj(ink, "ink", mat("ink", (0.16, 0.1, 0.07), 0.9), smooth=False)]
    hud_light(az=-40, el=55)
    camera(world_points(objs), az=0, el=58, margin=1.0)
    return True


def icon_cross():
    """Zrušit / zavřít: červený křížek ze dvou břeven."""
    bm = bmesh.new()
    for a, t in ((math.radians(45), 0.3), (math.radians(-45), 0.36)):  # různá tloušťka – líce se nepřekrývají
        box(bm, (0, 0, 0), (2.2, t, 0.42), rot=(0, a, 0))
    to_obj(bm, "cross", mat("cross", (0.55, 0.05, 0.03), 0.55), smooth=False)
    hud_light(az=-35, el=45)
    camera([Vector((-0.95, -0.3, -0.95)), Vector((0.95, 0.3, 0.95))], az=0, el=8, margin=1.02)
    return True


def gate_icon(closed):
    """Brána v palisádě: zavřená se závorou (Blokovat), nebo obě křídla dokořán (Odblokovat)."""
    rng = random.Random(7)
    parts = fort_parts()
    palisade_run(parts, seg_points((-3.4, 0.0), (-2.35, 0.0)), rng)
    palisade_run(parts, seg_points((2.35, 0.0), (3.4, 0.0)), rng)
    gate(parts, 0, 0, open_angle=0.0 if closed else 1.25)
    if closed:
        bar = bmesh.new()
        box(bar, (0, -0.42, 1.9), (4.6, 0.32, 0.36))
        for x in (-1.6, 1.6):
            box(bar, (x, -0.3, 1.9), (0.22, 0.2, 0.62))
        to_obj(bar, "bar", wood_mat("bar", (0.34, 0.22, 0.12)), smooth=False)
    hud_light()
    camera([Vector((-3.5, -2.4, 0)), Vector((3.5, 0.3, 0)), Vector((-3.5, -2.4, 4.2)), Vector((3.5, 0.3, 4.2))],
           az=12, el=26, margin=1.0)
    return True


def icon_gift():
    """Dar: dřevěná truhlička s kováním a zámkem."""
    wood, iron = bmesh.new(), bmesh.new()
    box(wood, (0, 0, 0.32), (1.4, 0.9, 0.64))
    box(wood, (0, 0, 0.74), (1.46, 0.96, 0.2))
    box(wood, (0, 0, 0.88), (1.3, 0.8, 0.1))
    for x in (-0.48, 0.48):
        box(iron, (x, 0, 0.47), (0.1, 0.94, 0.95))
        box(iron, (x, 0, 0.94), (0.1, 0.84, 0.06))
    box(iron, (0, -0.47, 0.58), (0.24, 0.04, 0.3))
    box(iron, (0, -0.5, 0.56), (0.05, 0.03, 0.1))
    bmesh.ops.recalc_face_normals(wood, faces=wood.faces)
    objs = [to_obj(wood, "chest", wood_mat("chest", (0.5, 0.3, 0.14)), smooth=False),
            to_obj(iron, "bands", iron_mat("bands"), smooth=False)]
    hud_light()
    camera(world_points(objs), az=28, el=24, margin=1.04)
    return True


def icon_loan():
    """Půjčka a splátky: sloupek stříbrných denárů a kolem dvě šipky dokola (dát a vrátit)."""
    coins, arrows = bmesh.new(), bmesh.new()
    rng = random.Random(34)
    for k in range(6):
        cyl(coins, (rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), k * 0.09),
            (rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), k * 0.09 + 0.08), 0.34, 0.34, 32)
    for a0, a1 in ((math.radians(200), math.radians(340)), (math.radians(20), math.radians(160))):
        lying_plate(arrows, arc_arrow(0.95, 0.18, a0, a1), 0.05, 0.08)
    bmesh.ops.recalc_face_normals(arrows, faces=arrows.faces)
    objs = [to_obj(coins, "coins", metal("silver", (0.78, 0.78, 0.8), 0.3, 0.9), smooth=False),
            to_obj(arrows, "arrows", glow_mat("loan", (0.85, 0.6, 0.12), 0.35), smooth=False)]
    hud_light(az=-40, el=50)
    camera(world_points(objs), az=0, el=46, margin=1.0)
    return True


def icon_aid():
    """Žádost o pomoc: otevřený pytel obilí a v něm dřevěná naběračka."""
    rng = random.Random(35)
    sack_bm, grain, scoop = bmesh.new(), bmesh.new(), bmesh.new()
    revolve(sack_bm, [(0.0, 0.42), (0.18, 0.62), (0.55, 0.68), (0.88, 0.58), (1.02, 0.52), (1.1, 0.6),
                      (1.14, 0.56), (1.06, 0.48), (0.98, 0.45)], 36, cap_bottom=True)
    off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), 0))
    for v in sack_bm.verts:
        flat = Vector((v.co.x, v.co.y, 0))
        if flat.length > 0.01:
            v.co += flat.normalized() * 0.05 * noise.noise(v.co * 3.5 + off)
    lumpy_heap(grain, 0.5, 0.22, rng, amp=0.03)
    bmesh.ops.translate(grain, verts=grain.verts, vec=(0, 0, 0.97))
    cyl(scoop, (0.12, -0.05, 1.05), (0.55, -0.35, 1.7), 0.04, 0.035, 8)
    blob(scoop, ((0.06, 0.0, 1.06), (0.4, -0.5, 0)), (0.2, 0.15, 0.1), 12, 8)
    objs = [to_obj(sack_bm, "sack", mat("burlap", (0.62, 0.5, 0.32), 0.95, noise=60, bump=0.5)),
            to_obj(grain, "grain", mat("grain", (0.86, 0.66, 0.3), 0.8, noise=40, bump=0.4)),
            to_obj(scoop, "scoop", wood_mat("scoop", (0.55, 0.36, 0.18)))]
    hud_light()
    camera(world_points(objs), az=14, el=26, margin=1.04)
    return True


def icon_faith_cross():
    """Křest rodu (christianity.md): jednoduchý dřevěný latinský kříž – svislé břevno, kratší
    příčné v horní třetině a ovázání provazem v místě spoje (`house/cross` je červený křížek
    „zavřít“)."""
    beam, bar, rope = bmesh.new(), bmesh.new(), bmesh.new()
    box(beam, (0, 0, 0), (0.3, 0.26, 2.5))
    box(bar, (0, -0.02, 0.52), (1.5, 0.26, 0.28))
    # ovázání přes spoj do kříže – dva šikmé pásky provazu na líci
    for a in (math.radians(40), math.radians(-40)):
        box(rope, (0, -0.16, 0.52), (0.5, 0.04, 0.07), rot=(0, a, 0))
    objs = [to_obj(beam, "beam", wood_mat("beam", (0.36, 0.22, 0.1)), smooth=False),
            to_obj(bar, "bar", wood_mat("bar", (0.39, 0.24, 0.11)), smooth=False),
            to_obj(rope, "rope", mat("rope", (0.62, 0.52, 0.34), 0.95, noise=80, bump=0.3), smooth=False)]
    hud_light(az=-35, el=45)
    camera(world_points(objs), az=18, el=10, margin=1.04)
    return True


def icon_hunger():
    """Hlad: prázdná dřevěná mísa a vedle ní lžíce."""
    bowl, spoon = bmesh.new(), bmesh.new()
    revolve(bowl, [(0.0, 0.3), (0.05, 0.42), (0.22, 0.64), (0.5, 0.8), (0.66, 0.86), (0.66, 0.8),
                   (0.52, 0.73), (0.26, 0.56), (0.12, 0.3), (0.12, 0.02)], 48, cap_bottom=True, cap_top=True)
    cyl(spoon, (0.65, -0.55, 0.03), (1.45, -0.95, 0.03), 0.035, 0.03, 8)
    blob(spoon, ((0.55, -0.48, 0.04), (0, 0, math.radians(-27))), (0.17, 0.11, 0.04), 12, 6)
    objs = [to_obj(bowl, "bowl", wood_mat("bowl", (0.55, 0.35, 0.17))),
            to_obj(spoon, "spoon", wood_mat("spoon", (0.6, 0.4, 0.2)))]
    hud_light(az=-40, el=50)
    camera(world_points(objs), az=0, el=32, margin=1.04)
    return True


def icon_chain_broken():
    """Vypovězení: rozetnutý železný řetěz – prostřední článek přerušený, půlky od sebe."""
    objs = chain_objs(4, gap_at=2)
    move(objs, rot=(0, math.radians(-28), 0))
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=0, el=14, margin=1.04)
    return True


def icon_horn():
    """Svolání: zahnutý volský roh s bronzovým nátrubkem, kováním a koženým popruhem."""
    horn, tip, band, strap, inner = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    pts = [Vector((math.cos(a) * 1.0, 0, math.sin(a) * 0.62)) for a in
           (math.radians(200 + 150 * i / 30) for i in range(31))]

    def rad(t):
        return 0.05 + 0.31 * t ** 1.5

    sweep(tip, pts[:6], lambda t: rad(t * 5 / 30), 16)
    sweep(horn, pts[5:], lambda t: rad((5 + t * 25) / 30), 20)
    for k in (11, 24):
        d = (pts[k + 1] - pts[k]).normalized()
        cyl(band, pts[k] - d * 0.05, pts[k] + d * 0.05, rad(k / 30) + 0.03, rad(k / 30) + 0.03, 20)
    d = (pts[-1] - pts[-2]).normalized()
    cyl(inner, pts[-1] - d * 0.02, pts[-1] + d * 0.002, rad(1.0) * 0.86, rad(1.0) * 0.86, 24)
    a, b = pts[11], pts[24]
    sweep(strap, [a.lerp(b, t) + Vector((0, 0.05, 0.55 * math.sin(math.pi * t) + 0.1)) for t in
                  (i / 12 for i in range(13))], 0.03, 6)
    objs = [to_obj(horn, "horn", mat("horn", (0.86, 0.76, 0.56), 0.45, noise=18, bump=0.15)),
            to_obj(tip, "tip", gold_metal("mouth")),
            to_obj(band, "bands", gold_metal("band")),
            to_obj(strap, "strap", mat("strap", (0.3, 0.17, 0.08), 0.7)),
            to_obj(inner, "bell", mat("bell", (0.06, 0.04, 0.03), 0.9))]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=0, el=12, margin=1.04)
    return True


def icon_passage():
    """Ohlášení průchodu: šlépěje přes hranici – řada mezníků napříč vyšlapanou hlínou."""
    walk_prints()
    rng = random.Random(36)
    stones = bmesh.new()
    d = Vector((0.45, 1.0, 0)).normalized()
    side = Vector((d.y, -d.x, 0))
    for k in range(-3, 4):
        c = side * (k * 0.36) + d * rng.uniform(-0.04, 0.04)
        blob(stones, ((c.x, c.y, 0.05), (0, 0, rng.uniform(0, 3))), (0.13, 0.1, 0.12 if k else 0.3), 10, 7)
    for v in stones.verts:
        v.co += Vector((0, 0, 0.02 * noise.noise(v.co * 6)))
    to_obj(stones, "stones", mat("stone", (0.55, 0.53, 0.5), 0.9, noise=12, bump=0.5))
    hud_light(az=-55, el=46)
    camera([Vector((-1.15, -1.15, 0)), Vector((1.15, 1.15, 0.05))], az=0, el=62, margin=1.0)
    return True


def icon_scales():
    """Rozsudek pána: tytéž váhy jako bilance obchodu, misky prázdné."""
    return icon_balance(grain_in_pan=False)


def icon_shield():
    objs = shield_objs()
    hud_light(az=-40, el=40)
    camera(world_points(objs), az=-22, el=12, margin=1.04)
    return True


def icon_shield_hourglass():
    """Ochrana nového rodu: štít a před ním přesýpací hodiny."""
    objs = shield_objs()
    h = hourglass_objs()
    move(h, loc=(0.62, -0.75, -0.45), scale=0.62)
    hud_light(az=-40, el=40)
    camera(world_points(objs + h), az=-14, el=12, margin=1.04)
    return True


def guard_icon(back):
    """Poslat muže na ochranu (šipka ze štítu ven) / odvolat (zelená šipka zpět ke štítu)."""
    objs = shield_objs()
    move(objs, loc=(-0.45, 0, 0), scale=0.85)
    arrow = bmesh.new()
    if back:
        pts = [(x + 0.75, z + 0.1) for x, z in arc_arrow(0.75, 0.24, math.radians(-30), math.radians(190), head=2.2)]
    else:
        pts = flat_arrow((0.05, -0.15), (1.75, 0.45), 0.3, 0.72, 0.5)
    flat_plate(arrow, pts, -0.4, 0.1)
    bmesh.ops.recalc_face_normals(arrow, faces=arrow.faces)
    objs.append(to_obj(arrow, "arrow", green_mark() if back else red_mark(), smooth=False))
    hud_light(az=-40, el=40)
    camera(world_points(objs), az=-10, el=10, margin=1.04)
    return True


def icon_spears():
    """Válka a opověď: dva zkřížené oštěpy."""
    wood, iron = bmesh.new(), bmesh.new()
    spear_into(wood, iron, (-1.0, 0.0, -1.0), (0.62, 0.0, 0.62), y=0.06)
    spear_into(wood, iron, (1.0, 0.0, -1.0), (-0.62, 0.0, 0.62), y=-0.06)
    objs = [to_obj(wood, "shafts", wood_mat("shaft")), to_obj(iron, "heads", iron_mat("head"))]
    hud_light(az=-45, el=45)
    camera(world_points(objs), az=0, el=12, margin=1.02)
    return True


def icon_sword():
    objs = sword_objs()
    move(objs, rot=(0, math.radians(38), 0))
    hud_light(az=-40, el=42, strength=4.4)
    camera(world_points(objs), az=0, el=10, margin=1.02)
    return True


def icon_succession():
    """Nástupnictví: zlatá čelenka koruny s pěti hroty zakončenými kuličkou a kameny na obruči."""
    gilt, gems = bmesh.new(), bmesh.new()
    revolve(gilt, [(0.0, 0.78), (0.36, 0.78), (0.36, 0.7), (0.0, 0.7), (0.0, 0.78)], 64)
    for k in range(5):
        a = 2 * math.pi * k / 5 + math.pi / 2 + math.radians(18)
        base = Vector((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.34))
        tip = Vector((math.cos(a) * 0.86, math.sin(a) * 0.86, 0.92))
        cyl(gilt, base, tip, 0.16, 0.02, 12)
        blob(gilt, ((tip.x, tip.y, tip.z + 0.04), (0, 0, 0)), (0.08, 0.08, 0.08), 10, 6)
        g = a + math.pi / 5
        blob(gems, ((math.cos(g) * 0.79, math.sin(g) * 0.79, 0.18), (0, 0, g)), (0.05, 0.09, 0.09), 10, 6)
    objs = [to_obj(gilt, "crown", gold_metal("crown")),
            to_obj(gems, "gems", mat("gem", (0.62, 0.05, 0.08), 0.15))]
    hud_light(az=-40, el=45, strength=4.4)
    camera(world_points(objs), az=0, el=22, margin=1.04)
    return True


def icon_throne():
    """Senior rodu: vyřezávaný stolec s vysokým opěradlem, područkami a červeným polštářem."""
    wood, cushion = bmesh.new(), bmesh.new()
    box(wood, (0, 0, 0.9), (1.1, 1.0, 0.14))
    for x in (-0.48, 0.48):
        for y in (-0.42, 0.42):
            top = 2.25 if y > 0 else 1.35
            cyl(wood, (x, y, 0.0), (x, y, top), 0.07, 0.065, 10)
            blob(wood, ((x, y, top + 0.06), (0, 0, 0)), (0.1, 0.1, 0.1), 10, 6)
        box(wood, (x, 0, 1.3), (0.12, 0.92, 0.1))
    for z in (1.55, 2.08):
        box(wood, (0, 0.42, z), (0.96, 0.08, 0.16))
    for x in (-0.24, 0.0, 0.24):
        box(wood, (x, 0.42, 1.8), (0.08, 0.06, 0.42))
    box(wood, (0, -0.42, 0.25), (0.9, 0.06, 0.08))
    blob(cushion, ((0, -0.02, 1.02), (0, 0, 0)), (0.5, 0.44, 0.09), 20, 10)
    objs = [to_obj(wood, "throne", wood_mat("throne", (0.4, 0.24, 0.11)), smooth=False),
            to_obj(cushion, "cushion", mat("cushion", PAINT_RED, 0.85, noise=12))]
    hud_light()
    camera(world_points(objs), az=-30, el=16, margin=1.04)
    return True


def icon_village_key():
    """Správa vsi: zemnice a před ní velký kovaný klíč."""
    house, pts = house_model()
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    h = hi[2] - lo[2]
    k = key_objs()
    move(k, loc=(hi[0] - h * 0.15, lo[1] - h * 0.5, h * 0.62), rot=(0, math.radians(-20), 0), scale=h * 0.7)
    hud_light(az=-45, el=42)
    camera(pts + world_points(k), az=-12, el=16, margin=1.0)
    return True


def icon_steward():
    """Správce vsi: kovaný klíč."""
    k = key_objs()
    move(k, rot=(0, math.radians(-35), 0))
    hud_light(az=-40, el=42, strength=4.4)
    camera(world_points(k), az=0, el=12, margin=1.04)
    return True


def person_hands(name, clip, frame):
    """Vesničan v pozici klipu a světové polohy jeho zápěstí (kost `hand_L` / `hand_R`)."""
    meshes = place_person(name, clip=clip, frame=frame, turn=-20)
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    wrist = {s: rig.matrix_world @ rig.pose.bones[f"hand_{s}"].head for s in ("L", "R")}
    fore = {s: rig.matrix_world @ rig.pose.bones[f"forearm_{s}"].head for s in ("L", "R")}
    return meshes, wrist, fore


def icon_hands():
    """Požádat o přijetí: vesničan klečí na koleni se skloněnou hlavou (klip `bind`, prostřední snímek)."""
    meshes = place_person("man", clip="bind", frame=12, turn=-60)
    act = next(a for a in bpy.data.actions if a.name.startswith("bind"))
    bpy.context.scene.frame_set(int((act.frame_range[0] + act.frame_range[1]) / 2))
    bpy.context.view_layer.update()
    sun(az=-40, el=40, strength=4.4)
    camera(box_points(meshes), az=0, el=8, margin=1.02)
    return True


def icon_handshake():
    """Přijmout jednání: dvě předloktí v rukávech (červený a modrý) a stisk rukou uprostřed."""
    cloth_a, cloth_b, skin = bmesh.new(), bmesh.new(), bmesh.new()
    cyl(cloth_a, (-1.45, 0, -0.85), (-0.38, 0, -0.12), 0.24, 0.19, 16)
    cyl(cloth_b, (1.45, 0, -0.85), (0.38, 0, -0.12), 0.24, 0.19, 16)
    cyl(cloth_a, (-0.52, 0, -0.2), (-0.36, 0, -0.1), 0.22, 0.22, 16)
    cyl(cloth_b, (0.52, 0, -0.2), (0.36, 0, -0.1), 0.22, 0.22, 16)
    blob(skin, ((-0.16, 0.02, 0.0), (0, math.radians(-30), 0)), (0.17, 0.15, 0.25), 14, 10)
    blob(skin, ((0.14, -0.06, 0.02), (0, math.radians(30), 0)), (0.17, 0.15, 0.25), 14, 10)
    cyl(skin, (-0.22, -0.13, 0.08), (0.06, -0.2, 0.2), 0.055, 0.045, 8)
    for k in range(3):
        cyl(skin, (0.2, -0.16, 0.12 - k * 0.1), (-0.06, -0.22, 0.16 - k * 0.1), 0.045, 0.04, 8)
    objs = [to_obj(cloth_a, "sleeve-a", mat("sleeve-a", PAINT_RED, 0.9, noise=16, bump=0.2)),
            to_obj(cloth_b, "sleeve-b", mat("sleeve-b", (0.15, 0.24, 0.48), 0.9, noise=16, bump=0.2)),
            to_obj(skin, "hands", mat("skin", (0.8, 0.56, 0.42), 0.6))]
    hud_light(az=-35, el=45)
    camera(world_points(objs), az=0, el=14, margin=1.02)
    return True


# --------------------------------------------------------------------- válka ----


def icon_shield_wall():
    """Bránit se: tři štíty vedle sebe, prostřední vpředu."""
    objs = []
    for x, y, paint in ((-1.2, 0.25, (0.42, 0.05, 0.03)), (1.2, 0.25, (0.44, 0.07, 0.035)), (0.0, -0.1, PAINT_RED)):
        objs += move(shield_objs(paint, f"shield{x}"), loc=(x, y, 0))
    hud_light(az=-40, el=40)
    camera(world_points(objs), az=-8, el=12, margin=1.02)
    return True


def icon_forest():
    """Raději utéct: dva smrky z modelů krajiny."""
    objs = []
    for name, loc, scale in (("spruce-1", (-0.9, 0.4, 0), 1.0), ("spruce-2", (0.8, -0.4, 0), 0.85)):
        for o in place_model(name, folder=TREES):
            o.location = Vector(loc)
            o.scale = (scale, scale, scale)
            objs.append(o)
    bpy.context.view_layer.update()
    hud_light(az=-50, el=46, strength=4.0)
    camera(world_points(objs), az=10, el=12, margin=1.04)
    return True


def icon_captive():
    """Zajatec: vesničan s rukama před sebou spoutanýma železnými pouty s řetízkem."""
    meshes, wrist, fore = person_hands("man", "pray", 20)
    cuffs = []
    for s in ("L", "R"):
        cuffs += cuff_objs(wrist[s] - (wrist[s] - fore[s]) * 0.12, wrist[s] - fore[s], r=0.06, tube=0.02)
    chain = bmesh.new()
    a, b = wrist["L"], wrist["R"]
    mid = (a + b) / 2 - Vector((0, 0, 0.12))
    sweep(chain, [a, mid, b], 0.025, 6)
    cuffs.append(to_obj(chain, "chain", metal("chain", (0.34, 0.33, 0.33), 0.45, 0.7)))
    sun(az=-40, el=40, strength=4.4)
    camera(box_points(meshes, 0.42, 1.0), az=12, el=6, margin=1.0)
    return True


def icon_hold():
    """Držet zajatce: železný visací zámek se třmenem a klíčovou dírkou."""
    iron, trim, dark = bmesh.new(), bmesh.new(), bmesh.new()
    cyl(iron, (0, -0.22, 0.0), (0, 0.22, 0.0), 0.6, 0.6, 40)
    sweep(iron, ellipse_arc((0, 0, 0.45), 0.36, 0.55, -0.1, math.pi + 0.1, n=24), 0.09, 12)
    cyl(trim, (0, -0.25, 0.0), (0, -0.2, 0.0), 0.62, 0.62, 40)
    cyl(trim, (0, 0.2, 0.0), (0, 0.25, 0.0), 0.62, 0.62, 40)
    cyl(dark, (0, -0.27, 0.02), (0, -0.25, 0.02), 0.09, 0.09, 16)
    box(dark, (0, -0.26, -0.13), (0.08, 0.02, 0.26))
    objs = [to_obj(iron, "lock", iron_mat("lock")), to_obj(trim, "trim", gold_metal("trim")),
            to_obj(dark, "hole", mat("hole", (0.03, 0.02, 0.02), 0.9), smooth=False)]
    hud_light(az=-40, el=42)
    camera(world_points(objs), az=-15, el=12, margin=1.04)
    return True


def icon_release():
    """Propustit zajatce: otevřené železné pouto s řetízkem a zelená šipka ven."""
    objs = cuff_objs((0.0, 0.0, 0.0), (0, 1, 0), open_angle=math.radians(70), tube=0.065)
    move(objs, scale=3.0)
    chain = chain_objs(3)
    move(chain, loc=(-1.25, 0.05, -0.7), rot=(0, math.radians(20), 0), scale=0.75)
    arrow = bmesh.new()
    flat_plate(arrow, flat_arrow((0.0, 0.2), (1.35, 1.3), 0.26, 0.66, 0.45), -0.3, 0.1)
    bmesh.ops.recalc_face_normals(arrow, faces=arrow.faces)
    objs += chain + [to_obj(arrow, "arrow", green_mark(), smooth=False)]
    hud_light(az=-40, el=42)
    camera(world_points(objs), az=0, el=14, margin=1.04)
    return True


def icon_execute():
    """Popravit zajatce: sekera zaťatá do špalku."""
    block, end, wood, iron, edge = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    cyl(block, (0, 0, 0), (0, 0, 0.8), 0.78, 0.74, 32)
    cyl(end, (0, 0, 0.8), (0, 0, 0.81), 0.73, 0.73, 32)
    axe(wood, iron, edge, Vector((-1.45, -0.05, 1.62)), Vector((0.5, -0.05, 1.42)))
    to_obj(block, "block", mat("bark", (0.3, 0.2, 0.12), 0.95, noise=30, bump=0.6))
    to_obj(end, "end", mat("endgrain", (0.72, 0.55, 0.34), 0.85, noise=40, bump=0.2))
    to_obj(wood, "handle", mat("haft", (0.66, 0.45, 0.24), 0.75, noise=18, bump=0.3))
    iron_objs(iron, edge)
    hud_light(az=-40, el=45, strength=4.4)
    camera([Vector((-1.5, -0.8, 0)), Vector((0.85, 0.8, 0)), Vector((-1.5, -0.8, 1.9)), Vector((0.85, 0.8, 1.9))],
           az=0, el=16, margin=1.02)
    return True


# ------------------------------------------- varování a útěk do hradiště ----
# Ikony v panelu dvorce při varování (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09,
# Úloha 13): Poslat posla, Ukrýt v lese, Do hradiště – jen lidé / se vším, Vrátit se, Varovat doménu
# a zaškrtnutí po příchodu. Lidé jsou vesničané hry (`models/people/`), ovce model stád, brána
# a palisáda díly scény (`fortifications.glb`), smrky modely krajiny, zemnice model stavby.


def walker(name="man", loc=(0.0, 0.0, 0.0), turn=-100.0, clip="walk", phase=0.3, lean=0.0, scale=1.0):
    """Vesničan v kroku: klip `clip` na podílu `phase` délky klipu, předklon `lean` stupňů ve směru
    chůze (běh). Vrátí meshe a armaturu (ruce pro hůl)."""
    meshes = place_person(name, loc=loc, scale=scale, turn=turn, clip=clip)
    rig = next(m.find_armature() for m in meshes if m.find_armature() is not None)
    act = rig.animation_data.action
    lo, hi = act.frame_range
    bpy.context.scene.frame_set(int(lo + (hi - lo) * phase))
    if lean:
        bpy.context.view_layer.update()
        # směr chůze = osa +Y kostry po natočení; předklon kolem vodorovné osy kolmé k němu
        ahead = rig.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
        ahead.z = 0.0
        axis = Vector((0.0, 0.0, 1.0)).cross(ahead.normalized())
        at = Vector(loc)
        rig.matrix_world = (Matrix.Translation(at) @ Matrix.Rotation(math.radians(lean), 4, axis)
                            @ Matrix.Translation(-at) @ rig.matrix_world)
    bpy.context.view_layer.update()
    return meshes, rig


def staff_in_hand(rig, side="R", length=1.75, name="staff"):
    """Hůl posla v ruce: šikmo před tělem, spodní konec před chodidly."""
    hand = rig.matrix_world @ rig.pose.bones[f"hand_{side}"].head
    ahead = rig.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
    k = ahead.length  # měřítko postavy (zvětšený posel v ikoně domény)
    ahead.z = 0.0
    ahead.normalize()
    foot = Vector((hand.x, hand.y, 0.02)) + ahead * 0.42 * k
    d = (hand - foot).normalized()
    bm = bmesh.new()
    cyl(bm, foot, foot + d * length * k, 0.026 * k, 0.021 * k, 10)
    return to_obj(bm, name, mat(name, (0.36, 0.23, 0.12), rough=0.7))


def runner(loc=(0.0, 0.0, 0.0), turn=-100.0, scale=1.0):
    """Posel: vesničan v dlouhém kroku s předklonem a holí."""
    meshes, rig = walker(loc=loc, turn=turn, phase=0.25, lean=10.0, scale=scale)
    return meshes + [staff_in_hand(rig)]


def hillfort_gate(rng, half=3.4):
    """Brána hradiště dokořán mezi dvěma úseky palisády (jako Probít se, bez šipky)."""
    parts = fort_parts()
    palisade_run(parts, seg_points((-half, 0.0), (-2.35, 0.0)), rng)
    palisade_run(parts, seg_points((2.35, 0.0), (half, 0.0)), rng)
    gate(parts, 0, 0, open_angle=1.25)
    return [Vector((-half, 0.4, 0.0)), Vector((half, 0.4, 0.0)), Vector((-half, 0.4, 4.0)), Vector((half, 0.4, 4.0))]


def icon_alarm_messenger():
    """Poslat posla: vesničan v běhu s holí."""
    objs = runner()
    hud_light(az=-40, el=40, strength=4.4)
    camera(world_points(objs), az=0, el=8, margin=1.02)
    return True


def icon_alarm_forest():
    """Ukrýt v lese: muž, žena a dítě mezi dvěma smrky."""
    trees = []
    for name, loc, height in (("spruce-1", (-1.0, 0.6, 0), 3.1), ("spruce-2", (1.05, 0.45, 0), 2.7)):
        objs = place_model(name, folder=TREES)
        bpy.context.view_layer.update()
        top = max(p.z for p in world_points(objs)) or 1.0
        for o in objs:
            o.location = Vector(loc)
            o.scale = (height / top,) * 3
        trees += objs
    bpy.context.view_layer.update()
    people = place_person("man", loc=(-0.3, -0.35, 0), turn=-12)
    people += place_person("woman", loc=(0.35, -0.2, 0), turn=-28)
    people += place_person("man", loc=(0.05, -0.85, 0), scale=0.6, turn=-18)
    hud_light(az=-50, el=46, strength=4.2)
    camera(world_points(trees) + world_points(people), az=8, el=12, margin=1.0)
    return True


def icon_alarm_people():
    """Do hradiště – jen lidé: brána hradiště dokořán a vesničan, který do ní jde."""
    frame = hillfort_gate(random.Random(31))
    man, _ = walker(loc=(0.55, -2.2, 0), turn=-165, phase=0.3, scale=1.75)
    woman, _ = walker("woman", loc=(-1.0, -2.9, 0), turn=-160, phase=0.3, scale=1.75)
    hud_light(az=-40, el=42)
    camera(frame + world_points(man + woman), az=14, el=26, margin=1.0)
    return True


def icon_alarm_all():
    """Do hradiště – se vším: brána hradiště, vesničan, ovce a vůz s nákladem."""
    frame = hillfort_gate(random.Random(32))
    man, _ = walker(loc=(1.3, -2.0, 0), turn=-165, phase=0.3, scale=1.7)
    sheep = stand_animal("sheep", turn=-75, loc=(-0.1, -2.9), scale=1.7)
    wood = bmesh.new()
    two_wheel_cart(wood, rot=math.radians(80))
    cart = to_obj(wood, "cart", mat("oak", (0.55, 0.37, 0.2), 0.8, noise=24, bump=0.3))
    load = bmesh.new()
    rng = random.Random(5)
    for k, (dx, dy) in enumerate(((-0.25, -0.25), (0.25, -0.2), (0.0, 0.3), (-0.2, 0.25))):
        sack(load, Vector((dx, dy, 1.05 + (0.18 if k > 1 else 0.0))), 0.36, rng.uniform(0, 3), rng)
    sacks = to_obj(load, "sacks", mat("linen", (0.72, 0.62, 0.45), 0.9, noise=30, bump=0.2))
    move([cart, sacks], loc=(-2.3, -4.0, 0.0), scale=1.45)
    hud_light(az=-40, el=42)
    camera(frame + world_points(man + sheep + [cart, sacks]), az=14, el=26, margin=0.98)
    return True


def icon_alarm_return():
    """Vrátit se: zemnice a zelená šipka k ní (lidé zpět domů)."""
    objs, pts = house_model()
    lo = [min(p[i] for p in pts) for i in range(2)]
    hi = [max(p[i] for p in pts) for i in range(2)]
    cx = (lo[0] + hi[0]) / 2
    w = hi[0] - lo[0]
    arrow = bmesh.new()
    lying_plate(arrow, flat_arrow((cx, lo[1] - w * 1.05), (cx, lo[1] - w * 0.08), w * 0.28, w * 0.62, w * 0.38),
                0.15, w * 0.06)
    bmesh.ops.recalc_face_normals(arrow, faces=arrow.faces)
    to_obj(arrow, "arrow", green_mark("back"), smooth=False)
    hud_light(az=-55, el=46)
    camera(pts + [Vector((cx - w * 0.3, lo[1] - w * 1.08, 0)), Vector((cx + w * 0.3, lo[1] - w * 1.08, 0))],
           az=20, el=34, margin=1.0)
    return True


def icon_alarm_domain():
    """Varovat doménu: posel s holí běží ke dvěma zemnicím vsi."""
    houses = []
    for loc, rot in (((2.2, 4.2, 0.0), 0.4), ((-1.4, 5.4, 0.0), -0.3)):
        objs, _ = house_model()
        move(objs, loc=loc, rot=(0, 0, rot), scale=0.55)
        houses += objs
    objs = runner(loc=(-0.6, -0.6, 0.0), turn=-150.0, scale=2.0)
    hud_light(az=-45, el=42)
    camera(world_points(houses + objs), az=10, el=20, margin=1.0)
    return True


def icon_alarm_done():
    """Lidé došli (zaškrtnutí): zelená fajfka."""
    bm = bmesh.new()
    flat_plate(bm, [(-1.0, 0.25), (-0.62, 0.62), (-0.28, 0.24), (0.72, 1.32), (1.08, 0.96), (-0.28, -0.52)], 0.0,
               0.22)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    objs = [to_obj(bm, "tick", green_mark("tick"), smooth=False)]
    hud_light(az=-40, el=42)
    camera(world_points(objs), az=0, el=14, margin=1.04)
    return True


# --- Stavební huť (stone-masonry.md – Stavební huť, churches.md – Typy podle okruhu huti) ---------

def _stone():
    return mat("stone", (0.6, 0.57, 0.5), 0.95, noise=14, bump=1.2)


def _lime_white():
    return mat("limewhite", (0.9, 0.88, 0.8), 0.95, noise=10, bump=0.4)


def _roof(bm, centre, width, length, height, thick=0.12):
    """Sedlová střecha: dvě šikmé desky nad osou X (délka `length` podél X)."""
    ang = math.atan2(height, width / 2)
    run = math.hypot(width / 2, height) + 0.08
    for side in (-1, 1):
        box(bm, (centre[0], centre[1] + side * width / 4, centre[2] + height / 2),
            (length, run, thick), rot=(side * ang, 0, 0))


def _wall_blocks(bm, x0, x1, y, z0, rows, h=0.34, depth=0.5):
    """Zeď z kvádrů v řadách (střídavě posunuté spáry)."""
    w = 0.7
    for r in range(rows):
        off = (w / 2) if r % 2 else 0.0
        x = x0 - off
        while x < x1:
            lo, hi = max(x, x0), min(x + w, x1)
            if hi - lo > 0.05:
                box(bm, ((lo + hi) / 2, y, z0 + h * (r + 0.5)), (hi - lo - 0.04, depth, h - 0.04))
            x += w


def icon_lodge():
    """Stavební huť: kamenná chata z kvádrů s dřevěnou sedlovou střechou a dveřmi."""
    wall, roof, door = bmesh.new(), bmesh.new(), bmesh.new()
    _wall_blocks(wall, -1.4, 1.4, 0, 0, 4)
    _wall_blocks(wall, -1.4, 1.4, 1.0, 0, 4)
    _wall_blocks(wall, -1.4, 1.4, 0.5, 0, 4)
    box(door, (0, -0.28, 0.5), (0.7, 0.08, 1.0))
    _roof(roof, (0, 0.5, 1.36), 2.0, 3.3, 0.8)
    objs = [to_obj(wall, "wall", _stone(), smooth=False),
            to_obj(roof, "roof", wood_mat("roof", (0.4, 0.26, 0.12)), smooth=False),
            to_obj(door, "door", wood_mat("door", (0.3, 0.19, 0.09)), smooth=False)]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=-8, el=18, margin=1.04)
    return True


def icon_circle_adriatic():
    """Adriatický okruh: bazilika – podélná loď se sedlovou střechou a nižší pravoúhlé kněžiště."""
    nave, chancel, roof, roof2 = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    box(nave, (0, 0, 0.7), (2.4, 1.3, 1.4))
    box(chancel, (1.7, 0, 0.5), (1.0, 0.8, 1.0))
    _roof(roof, (0, 0, 1.4), 1.5, 2.6, 0.7)
    _roof(roof2, (1.7, 0, 1.0), 1.0, 1.2, 0.4)
    objs = [to_obj(nave, "nave", _lime_white(), smooth=False),
            to_obj(chancel, "chancel", _lime_white(), smooth=False),
            to_obj(roof, "roof", mat("tile", (0.58, 0.28, 0.16), 0.9, noise=30, bump=0.5), smooth=False),
            to_obj(roof2, "roof2", mat("tile2", (0.58, 0.28, 0.16), 0.9, noise=30, bump=0.5), smooth=False)]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=25, el=24, margin=1.04)
    return True


def icon_circle_carolingian():
    """Karolinský okruh: rotunda s kopulí a půlkruhovou apsidou."""
    body, dome, apse = bmesh.new(), bmesh.new(), bmesh.new()
    revolve(body, [(0, 1.0), (1.2, 1.0)], 40, cap_bottom=True)
    revolve(dome, [(1.2, 1.05), (1.35, 1.0), (1.7, 0.85), (2.0, 0.6), (2.2, 0.3), (2.3, 0.0)], 40)
    revolve(apse, [(0, 0.5), (0.9, 0.5), (1.0, 0.0)], 20)
    move_by = Vector((1.15, 0, 0))
    for v in apse.verts:
        v.co += move_by
    objs = [to_obj(body, "rotunda", _lime_white()),
            to_obj(dome, "dome", mat("tile", (0.58, 0.28, 0.16), 0.9, noise=30, bump=0.5)),
            to_obj(apse, "apse", _lime_white())]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=20, el=22, margin=1.04)
    return True


def icon_mason_builder():
    """Stavbyvedoucí: tesařský úhelník a olovnice na šňůře."""
    sq, bob, cord = bmesh.new(), bmesh.new(), bmesh.new()
    box(sq, (0, 0, 0.0), (0.22, 0.1, 2.2))
    box(sq, (0.9, 0, -1.0), (2.0, 0.1, 0.22))
    cyl(cord, (1.2, 0, 1.3), (1.2, 0, 0.1), 0.02, 0.02, 6)
    cyl(bob, (1.2, 0, 0.1), (1.2, 0, -0.55), 0.2, 0.0, 12)
    objs = [to_obj(sq, "square", wood_mat("sq", (0.5, 0.33, 0.16)), smooth=False),
            to_obj(cord, "cord", mat("rope", (0.62, 0.52, 0.34), 0.95), smooth=False),
            to_obj(bob, "bob", iron_mat("bob"))]
    hud_light(az=-35, el=45)
    camera(world_points(objs), az=0, el=6, margin=1.04)
    return True


def icon_mason_limeburner():
    """Vápeník: hromádka bílých hrud páleného vápna s žhavým jádrem."""
    lumps = bmesh.new()
    rng = random.Random(7)
    for k in range(9):
        a = rng.uniform(0, 6.28)
        d = rng.uniform(0.0, 0.7)
        blob(lumps, ((math.cos(a) * d, math.sin(a) * d, 0.2 + (0.25 if d < 0.35 else 0.0)),
                     (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))),
             (rng.uniform(0.28, 0.4), rng.uniform(0.25, 0.35), rng.uniform(0.2, 0.3)), 10, 6)
    ember = bmesh.new()
    blob(ember, ((0, -0.5, 0.18), (0, 0, 0)), (0.3, 0.16, 0.14), 10, 6)
    objs = [to_obj(lumps, "lime", _lime_white()),
            to_obj(ember, "ember", glow_mat("ember", (1.0, 0.42, 0.08), 3.0))]
    hud_light(az=-40, el=50)
    camera(world_points(objs), az=10, el=30, margin=1.04)
    return True


def icon_mason_stonemason():
    """Kameník: otesaný kvádr, dláto a palička."""
    block, chisel, head, haft = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    box(block, (0, 0, 0.4), (1.5, 1.0, 0.8))
    cyl(chisel, (-0.2, -0.1, 0.8), (-0.2, -0.1, 1.9), 0.05, 0.1, 8)
    box(head, (0.7, 0.2, 1.05), (0.7, 0.34, 0.34), rot=(0, 0, math.radians(20)))
    cyl(haft, (0.55, 0.2, 0.3), (0.85, 0.2, 0.95), 0.05, 0.05, 8)
    objs = [to_obj(block, "block", _stone(), smooth=False),
            to_obj(chisel, "chisel", iron_mat("chisel")),
            to_obj(head, "head", wood_mat("head", (0.5, 0.33, 0.16)), smooth=False),
            to_obj(haft, "haft", wood_mat("haft", (0.55, 0.38, 0.2)))]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=15, el=22, margin=1.04)
    return True


def icon_mason_mason():
    """Zedník: zeď z kvádrů v řadách a zednická lžíce."""
    wall, blade, grip = bmesh.new(), bmesh.new(), bmesh.new()
    _wall_blocks(wall, -1.2, 1.2, 0, 0, 3)
    flat_plate(blade, [(-0.1, 1.35), (0.3, 1.5), (0.9, 1.35), (0.3, 1.2)], -0.45, 0.04)
    bmesh.ops.recalc_face_normals(blade, faces=blade.faces)
    cyl(grip, (-0.1, -0.45, 1.35), (-0.75, -0.45, 1.35), 0.06, 0.06, 8)
    objs = [to_obj(wall, "wall", _stone(), smooth=False),
            to_obj(blade, "trowel", iron_mat("trowel"), smooth=False),
            to_obj(grip, "grip", wood_mat("grip", (0.5, 0.33, 0.16)))]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=-10, el=24, margin=1.04)
    return True


def icon_mason_plasterer():
    """Štukatér a malíř: sokl omítky na hladítku, štětec a hrnek s barvou."""
    board, grip, mud, pot, paint, brush, bristle = (bmesh.new() for _ in range(7))
    box(board, (-0.5, 0, 0.55), (1.3, 1.3, 0.1))
    cyl(grip, (-0.5, 0, 0.5), (-0.5, 0, 0.2), 0.07, 0.07, 8)
    blob(mud, ((-0.5, 0, 0.78), (0, 0, 0)), (0.5, 0.5, 0.2), 12, 6)
    revolve(pot, [(0, 0.3), (0.5, 0.36), (0.55, 0.34)], 24, cap_bottom=True)
    revolve(paint, [(0.5, 0.33), (0.52, 0.0)], 24)
    cyl(brush, (0.95, 0.25, 0.45), (0.55, 0.25, 1.55), 0.045, 0.045, 8)
    cyl(bristle, (0.55, 0.25, 1.55), (0.45, 0.25, 1.95), 0.12, 0.05, 8)
    for v in pot.verts:
        v.co += Vector((0.95, -0.3, 0.0))
    for v in paint.verts:
        v.co += Vector((0.95, -0.3, 0.0))
    objs = [to_obj(board, "board", wood_mat("board", (0.5, 0.33, 0.16)), smooth=False),
            to_obj(grip, "grip", wood_mat("grip", (0.45, 0.3, 0.14))),
            to_obj(mud, "plaster", _lime_white()),
            to_obj(pot, "pot", mat("clay", (0.5, 0.3, 0.18), 0.9, noise=20, bump=0.4)),
            to_obj(paint, "paint", mat("ochre", (0.72, 0.18, 0.1), 0.6)),
            to_obj(brush, "brush", wood_mat("brush", (0.5, 0.33, 0.16))),
            to_obj(bristle, "bristle", mat("bristle", (0.78, 0.7, 0.55), 0.9))]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=10, el=28, margin=1.04)
    return True


def icon_priest():
    """Kněz kostela: zlatý kalich."""
    cup = bmesh.new()
    revolve(cup, [(0, 0.55), (0.08, 0.55), (0.14, 0.12), (0.8, 0.1), (0.9, 0.2), (1.0, 0.3), (1.15, 0.5),
                  (1.55, 0.62), (1.62, 0.56), (1.55, 0.0)], 32, cap_bottom=True)
    objs = [to_obj(cup, "chalice", gold_metal("chalice"))]
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=0, el=10, margin=1.04)
    return True


def _church_apse(objs, name, cx, r, h, roof_mat):
    """Půlkruhová apsida na ose X (válec, půlku schová loď) s kuželovou střechou."""
    wall, cone = bmesh.new(), bmesh.new()
    revolve(wall, [(0, r), (h, r)], 24, cap_top=True)
    revolve(cone, [(h - 0.02, r + 0.08), (h + 0.5 * r, 0.0)], 24)
    for bm in (wall, cone):
        for v in bm.verts:
            v.co.x += cx
    objs.append(to_obj(wall, name, _lime_white()))
    objs.append(to_obj(cone, name + "-roof", roof_mat, smooth=False))


def icon_church(kind):
    """Portrét kostela podle typu (churches.md – Typy podle okruhu huti): omítnuté zdi, šindel."""
    earth_ground(4.5, lambda x, y: 0.02 * noise.noise(Vector((x * 0.8, y * 0.8, 0))), tint=(0.8, 0.82, 0.62))
    shingle = mat("shingle", (0.4, 0.29, 0.19), 0.9, noise=30, bump=0.6)
    objs = []

    def part(name, centre, size):
        bm = bmesh.new()
        box(bm, centre, size)
        objs.append(to_obj(bm, name, _lime_white(), smooth=False))

    def gable(name, centre, width, length, height):
        bm = bmesh.new()
        _roof(bm, centre, width, length, height)
        objs.append(to_obj(bm, name, shingle, smooth=False))

    if kind == "rotunda":
        body, cone = bmesh.new(), bmesh.new()
        revolve(body, [(0, 1.0), (1.4, 1.0)], 40, cap_bottom=True, cap_top=True)
        revolve(cone, [(1.38, 1.12), (2.3, 0.0)], 40)
        objs += [to_obj(body, "rotunda", _lime_white()), to_obj(cone, "cone", shingle, smooth=False)]
        _church_apse(objs, "apse-e", 1.0, 0.45, 0.85, shingle)
        _church_apse(objs, "apse-w", -1.0, 0.45, 0.85, shingle)
    elif kind == "basilica":
        part("nave", (0, 0, 0.9), (2.6, 1.0, 1.8))
        gable("nave-roof", (0, 0, 1.8), 1.2, 2.8, 0.45)
        for s in (-1, 1):
            part(f"aisle{s}", (0, s * 0.75, 0.55), (2.6, 0.5, 1.1))
            lean = bmesh.new()
            box(lean, (0, s * 0.78, 1.2), (2.7, 0.66, 0.08), rot=(s * 0.38, 0, 0))
            objs.append(to_obj(lean, f"lean{s}", shingle, smooth=False))
            part(f"atrium{s}", (-1.85, s * 1.0, 0.3), (1.1, 0.12, 0.6))
        part("atrium-w", (-2.38, 0, 0.3), (0.12, 2.1, 0.6))
        _church_apse(objs, "apse", 1.3, 0.45, 1.1, shingle)
    else:
        part("nave", (0, 0, 0.7), (2.4, 1.4, 1.4))
        gable("nave-roof", (0, 0, 1.4), 1.6, 2.6, 0.75)
        if kind == "chancel":
            part("chancel", (1.65, 0, 0.55), (0.9, 0.9, 1.1))
            gable("chancel-roof", (1.65, 0, 1.1), 1.1, 1.0, 0.45)
        else:
            _church_apse(objs, "apse", 1.2, 0.5, 1.1, shingle)
    hud_light(az=-40, el=45)
    camera(world_points(objs), az=25, el=26, margin=1.12)
    return True


LODGE_PANELS = {
    "house/lodge": icon_lodge,
    "house/circle-adriatic": icon_circle_adriatic,
    "house/circle-carolingian": icon_circle_carolingian,
    "house/mason-builder": icon_mason_builder,
    "house/mason-limeburner": icon_mason_limeburner,
    "house/mason-stonemason": icon_mason_stonemason,
    "house/mason-mason": icon_mason_mason,
    "house/mason-plasterer": icon_mason_plasterer,
    "house/priest": icon_priest,
}


# Výstup do podsložek (`house/aid.png`…) – klíč = cesta bez přípony. Obilí, klády a přesýpací hodiny
# panelů rodu jsou ikony surovin (`food`, `wood`, `hourglass`).
PANELS = {
    "house/aid": icon_aid,
    "house/banner": icon_house_banner,
    "house/copy": icon_copy,
    "house/cross": icon_cross,
    "house/faith-cross": icon_faith_cross,
    "house/gate": lambda: gate_icon(True),
    "house/gate-open": lambda: gate_icon(False),
    "house/gift": icon_gift,
    "house/guard-recall": lambda: guard_icon(True),
    "house/guard-send": lambda: guard_icon(False),
    "house/hands": icon_hands,
    "house/handshake": icon_handshake,
    "house/horn": icon_horn,
    "house/hunger": icon_hunger,
    "house/chain-broken": icon_chain_broken,
    "house/loan": icon_loan,
    "house/passage": icon_passage,
    "house/pen": icon_pen,
    "house/scales": icon_scales,
    "house/seal": icon_seal,
    "house/seal-broken": icon_seal_broken,
    "house/seal-pen": icon_seal_pen,
    "house/shield": icon_shield,
    "house/shield-hourglass": icon_shield_hourglass,
    "house/spears": icon_spears,
    "house/succession": icon_succession,
    "house/sword": icon_sword,
    "house/throne": icon_throne,
    "house/village-key": icon_village_key,
    "war/captive": icon_captive,
    "war/execute": icon_execute,
    "war/forest": icon_forest,
    "war/hold": icon_hold,
    "war/release": icon_release,
    "war/shield-wall": icon_shield_wall,
    "war/white-flag": icon_white_flag,
    "war/alarm-messenger": icon_alarm_messenger,
    "war/alarm-forest": icon_alarm_forest,
    "war/alarm-people": icon_alarm_people,
    "war/alarm-all": icon_alarm_all,
    "war/alarm-return": icon_alarm_return,
    "war/alarm-domain": icon_alarm_domain,
    "war/alarm-done": icon_alarm_done,
    "newcomer/banner-crown": icon_banner_crown,
    "newcomer/banner-free": icon_banner_free,
}


HUD = {
    "fort-walkway": icon_fort_walkway,
    "fort-crib": icon_fort_crib,
    "fort-chamber": icon_fort_chamber,
    "fort-rampart-add": icon_fort_rampart_add,
    "fort-moat": icon_fort_moat,
    "fort-gate": icon_fort_gate,
    "gate-pincer": icon_gate_pincer,
    "gate-tower": icon_gate_tower,
    "fort-occupancy": icon_fort_occupancy,
    "assault-ladder": icon_assault_ladder,
    "assault-axe": icon_assault_axe,
    "assault-fire": icon_assault_fire,
    "assault-spade": icon_assault_spade,
    "stone": icon_stone,
    "lime": icon_lime,
    "sand": icon_sand,
    "demolish": icon_demolish,
    "breakout": icon_breakout,
    "chronicle": icon_chronicle,
    "bell": icon_bell,
    "abandon-structure": icon_abandon_structure,
    "restore": icon_restore,
    "abandon-part": icon_abandon_part,
    "steward": icon_steward,
}
RESOURCES.update(HUD)
PANELS.update(LODGE_PANELS)
BUILD["lom"] = icon_lom
# kostely podle typu (churches.md – Typy podle okruhu huti) – tlačítka nabídky staveb a portrét panelu
for _kind in ("chancel", "apse", "rotunda", "basilica"):
    BUILD[f"kostel-{_kind}"] = (lambda k: lambda: icon_church(k))(_kind)


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


# Ikony surovin vykreslené menší než ostatní (podíl velikosti) – stojí na stejné zemi jako plná ikona.
SMALLER = {"young-ox": 0.72, "foal": 0.7}


def small(src, dst, size, fit=1.0):
    if fit >= 1.0:
        subprocess.run(["magick", src, "-trim", "+repage", "-filter", "Lanczos", "-resize", f"{size - 6}x{size - 6}",
                        "-background", "none", "-gravity", "center", "-extent", f"{size}x{size}", "PNG32:" + dst],
                       check=True)
        return
    inner = round((size - 6) * fit)
    subprocess.run(["magick", src, "-trim", "+repage", "-filter", "Lanczos", "-resize", f"{inner}x{inner}",
                    "-background", "none", "-gravity", "south", "-extent", f"{size}x{size - 3}",
                    "-gravity", "north", "-extent", f"{size}x{size}", "PNG32:" + dst], check=True)


def want(k):
    return ONLY is None or k in ONLY


os.makedirs(f"{OUT}/build", exist_ok=True)
os.makedirs(f"{OUT}/resources", exist_ok=True)
os.makedirs(f"{OUT}/premium", exist_ok=True)
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
    small(raw, f"{OUT}/resources/{key}.png", 64, SMALLER.get(key, 1.0))
    print("hotovo", key)
for key, fn in PREMIUM.items():
    # portréty typů prémiové krajiny (premium-landscapes.md – Co hráč vidí) – `premium/<typ>.png`
    if not want(key):
        continue
    reset()
    fn()
    raw = f"{TMP}/premium-{key}.png"
    render(raw)
    backdrop(raw, f"{OUT}/premium/{key}.png", 128)
    print("hotovo", key)
for key, fn in PANELS.items():
    # panely rodu, vazalství, války a nováčka – `house/…`, `war/…`, `newcomer/…` (64 × 64 jako suroviny)
    if not want(key):
        continue
    reset()
    fn()
    raw = f"{TMP}/{key.replace('/', '-')}.png"
    render(raw)
    os.makedirs(os.path.dirname(f"{OUT}/{key}.png"), exist_ok=True)
    small(raw, f"{OUT}/{key}.png", 64)
    print("hotovo", key)
if want("people"):
    pop = f"{TMP}/population.png"
    urllib.request.urlretrieve(POP_URL, pop)
    subprocess.run(["magick", pop, "PNG32:" + f"{OUT}/resources/people.png"], check=True)
    print("hotovo people")
