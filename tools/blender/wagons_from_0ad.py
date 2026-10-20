"""Vozy z 0 A.D. (dvoukolák a čtyřkolák) -> GLB pro scénu: korba, kola, oj a náklad jako díly.

blender -b --factory-startup --python tools/blender/wagons_from_0ad.py -- \
    <0ad>/binaries/data/mods/public/art <craft_atlas_dir> apps/web/public/models/wagons <render_dir|->

Zdroj (0 A.D., Wildfire Games, CC BY-SA 3.0 – licence v apps/web/public/models/wagons/LICENSES.md):
  meshes/props/special/wagon_two_wheel_empty.dae    dvoukolák (kostra: twowheel, l_wheel, r_wheel)
  meshes/props/special/wagon_four_wheel_empty.dae   čtyřkolák (RamBone, Wheel{Left,Right}{Front,Back})
  textures/skins/props/wooden_wagon.png             textura obou vozů
  textures/skins/structural/iber_struct.png         seno a sláma (výřez jako u hay_cart.dae)
craft_atlas_dir: výstup tools/blender/craft_atlas.py (atlas.jpg + atlas.json) – kůra a čela klád
jako u polen řemesel (crafts.py – log) a hromady klád ve vsi. render_dir: náhledy ve Workbenchi,
"-" = bez náhledů.

Blender 5 COLLADA neumí – vlastní parser (zkrácená kopie z people_from_0ad.py). Modely 0 A.D. jsou
skinované (kola na kostech); animace jízdy (animation/mechanical/wagon_*_empty_move.dae) jen
točí kosti kol kolem osy X v náboji (180° za 15 snímků), korba stojí. Proto se kostra
nepřevádí: každý trojúhelník patří kosti svého prvního vrcholu (váhy jsou všude 1) a podle ní se
model rozdělí na korbu a kolo – kola ve scéně otáčí matice instance podle ujeté dráhy
(apps/web/lib/scene/cart-layout.ts), ne zapečená animace (VAT by se s pohybem po terénu
nesešla a postava s kostrou má ve WebGPU vyčerpaný limit 8 vertex bufferů).

Úpravy: koňský postroj 0 A.D. (dvě oje dvoukoláku s chomoutem, zakřivená oj čtyřkoláku
s dvojitým chomoutem a železná pouzdra ojí) je pryč. Čtyřkolák táhne pár volů ve šíjovém jhu
spřežení (tools/blender/plough.py) – vlastní rovná oj na čepu předku (díl wagon4-pole, scéna ji
natahuje od špičky rozvory ke jhu). Dvoukolák táhne jeden vůl (oxen.md – Potah, Martin 20. 10.
2026) – vlastní oplení: dvě pevné oje po stranách vola (pod korbou, vpředu zahnuté nahoru k bokům
jednoduchého jha wagon2-yoke – korba se podle jha naklápí). Měřítko 0 A.D. se zmenší
na skutečnou velikost: kolo ⌀ 0,98 m (WHEEL_R), tím i korba (dvoukolák ≈ 1,0 × 2,0 m a se
zahnutou ojí ke jhu ≈ 3,9 m, čtyřkolák ≈ 1,25 × 3,2 m, rozvor 1,5 m). Oj je delší než u koně:
korba musí být za zadky volů (≈ 1,6 m za jhem – ox.glb), proto vpředu ≈ 1,9–2 m za jhem.

Souřadnice Blenderu: Z nahoru, vpřed = −Y (v glTF +Z, ve scéně model míří na +Z), +X = vlevo –
stejně jako 0 A.D. (koně vpředu v −Y, levé kolo v +X). Rozměry níže (WHEEL_R, YOKE_Y, …) musí
sedět s CART_PARTS v apps/web/lib/scene/cart-layout.ts (hlídá test podle obalu dílů v GLB).

Výstup wagons.glb – díly (uzly), každý s vlastním počátkem, jeden materiál (atlas 512 × 512):
  wagon2-body    dvoukolák: korba s nápravou a oplením (dvě oje po stranách vola – dvoukolák
                 táhne jeden vůl, oxen.md – Potah); počátek na zemi pod středem nápravy, střed
                 mezi špičkami ojí v POLE2_TIP (vpřed, výška) – tam leží spodek jha
  wagon2-yoke    jednoduché šíjové jho pro jednoho vola, oje oplení přivázané na koncích
                 (±SHAFT2_X); počátek = spodek středu jha (jako `yoke` v ard.glb)
  wagon4-body    čtyřkolák bez předku: korba, zadní náprava; počátek na zemi uprostřed mezi
                 nápravami (náprava vpředu WHEELBASE4 / 2, vzadu − WHEELBASE4 / 2)
  wagon4-front   předek čtyřkoláku (otáčí se na čepu kolem svislice): přední náprava,
                 ložiska a rozvora; počátek na zemi pod čepem (středem přední nápravy)
  wagon4-pole    oj čtyřkoláku délky POLE4_M vpřed od počátku (+ kus zasunutý do rozvory) –
                 scéna ji natáčí od špičky rozvory (HOUNDS_TIP) ke spodku jha
  wagon-wheel    kolo (levé – náboj ven v +X), počátek ve středu náboje, osa X; pravé kolo je
                 totéž otočené o 180° kolem svislice
  wagon2-hay, wagon2-sheaves, wagon2-logs, wagon2-goods, wagon2-water   náklad dvoukoláku
                 (počátek jako korba)
  wagon4-hay, wagon4-sheaves, wagon4-logs, wagon4-goods, wagon4-water   náklad čtyřkoláku
    hay      kupa sena přes korbu s pavuzou (žerď přes kupu přivázaná vpředu a vzadu)
    sheaves  snopy napříč v řadách, klasy dovnitř, po vrstvách
    logs     klády podél, v pyramidě, přes ně řetěz z provazu; přečnívají dozadu
    goods    pytle, soudek a balík kožešin (zboží obchodní výpravy)
    water    stojící sudy na vodu s víkem a čepem, převázané provazem (voda v sudech)

Atlas: výřez textury vozu (wooden_wagon.png celá), seno a sláma (iber_struct.png – výřez slámy,
seno přebarvené do zelena), kůra a čelo klády (atlas řemesel), pytlovina, kožešina a provaz
(procedurálně).
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
ART, CRAFT_ATLAS, OUT = args[0], args[1], args[2]
RENDER = args[3] if len(args) > 3 else "-"

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}

# --- rozměry (m) – musí sedět s CART_PARTS v apps/web/lib/scene/cart-layout.ts ---------------
WHEEL_R = 0.49  # poloměr kola – podle něj se zmenší celý model 0 A.D.
YOKE_Y = 1.19  # spodek jha nad zemí (TEAM_PARTS.yokeY v plough-team.ts)
POLE2_TIP = 2.9  # dvoukolák: od nápravy vpřed ke jhu (korba vpředu ≈ 2 m za jhem – zadky volů)
POLE4_M = 1.5  # čtyřkolák: délka oje modelu (scéna ji natáhne na skutečnou vzdálenost)
POLE4_R = 0.045  # poloměr oje
POLE2_R = 0.05
# dvoukolák táhne jeden vůl (oxen.md – Potah, Martin 20. 10. 2026): oplení – dvě oje po stranách
# vola (osy ±SHAFT2_X; vůl ox.glb je široký ± 0,35 m), na konci jednoduché šíjové jho (wagon2-yoke)
SHAFT2_X = 0.45

# --- atlas ---------------------------------------------------------------------------------
W = H = 512
GUT = 4
REGIONS = {
    "wagon": {"x0": 4, "x1": 260, "r0": 4, "r1": 260},
    "hay": {"x0": 268, "x1": 508, "r0": 4, "r1": 244},
    "straw": {"x0": 4, "x1": 260, "r0": 268, "r1": 380},
    "bark": {"x0": 268, "x1": 508, "r0": 252, "r1": 300},
    "endgrain": {"x0": 268, "x1": 332, "r0": 308, "r1": 372},
    "cloth": {"x0": 340, "x1": 468, "r0": 308, "r1": 436},
    "rope": {"x0": 4, "x1": 260, "r0": 388, "r1": 404},
    "fur": {"x0": 4, "x1": 132, "r0": 412, "r1": 508},
}
# výřezy textury vozu (px 256 × 256, řádky shora) – oj, soudek, kování
WAGON_SUB = {
    "plank": (6, 250, 196, 250),
    "iron": (4, 28, 56, 184),
}


def load_rgb(path, size=None):
    """Obrázek jako pole (řádky shora, RGB 0–1); size = (w, h) zmenší."""
    im = bpy.data.images.load(path)
    if size and tuple(im.size) != tuple(size):
        im.scale(*size)
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)[::-1, :, :3].copy()


def resize(img, w, h):
    """Bilineární změna velikosti (jen numpy)."""
    sh, sw, _ = img.shape
    ys = (np.arange(h) + 0.5) * sh / h - 0.5
    xs = (np.arange(w) + 0.5) * sw / w - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, sh - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, sw - 1)
    y1 = np.clip(y0 + 1, 0, sh - 1)
    x1 = np.clip(x0 + 1, 0, sw - 1)
    fy = np.clip(ys - np.floor(ys), 0, 1)[:, None, None]
    fx = np.clip(xs - np.floor(xs), 0, 1)[None, :, None]
    top = img[y0][:, x0] * (1 - fx) + img[y0][:, x1] * fx
    bot = img[y1][:, x0] * (1 - fx) + img[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def mirror_tile(img):
    """Zrcadlením do 2 × 2 – výřez navazuje na všech stranách."""
    top = np.concatenate([img, img[:, ::-1]], axis=1)
    return np.concatenate([top, top[::-1]], axis=0)


def value_noise(h, w, cell, seed):
    """Hladký šum 0–1 (bilineárně zvětšená mřížka náhodných hodnot)."""
    rng = np.random.default_rng(seed)
    grid = rng.random((h // cell + 2, w // cell + 2, 1)).astype(np.float32)
    return resize(grid, w + 2 * cell, h + 2 * cell)[cell : cell + h, cell : cell + w, 0]


def build_atlas():
    atlas = np.zeros((H, W, 3), np.float32)

    def put(name, pixels):
        r = REGIONS[name]
        w, h = r["x1"] - r["x0"], r["r1"] - r["r0"]
        tile = resize(pixels, w, h)
        # okraje: opakované krajní pixely (mipmapy nepřetečou do sousední oblasti)
        padded = np.pad(tile, ((GUT, GUT), (GUT, GUT), (0, 0)), mode="edge")
        atlas[r["r0"] - GUT : r["r1"] + GUT, r["x0"] - GUT : r["x1"] + GUT] = padded

    put("wagon", load_rgb(os.path.join(ART, "textures/skins/props/wooden_wagon.png")))
    iber = load_rgb(os.path.join(ART, "textures/skins/structural/iber_struct.png"))
    # výřez slámy z iber_struct (2048 × 1024, vpravo dole od kamenné zdi) – jako hay_cart 0 A.D.
    straw = mirror_tile(iber[892:1016, 778:948])
    put("straw", straw)
    lum = straw @ np.array([0.3, 0.59, 0.11], np.float32)
    # seno: sláma do olivova (sušená tráva je zelenošedá), skvrny podle šumu
    n = value_noise(straw.shape[0], straw.shape[1], 24, 5)[..., None]
    olive = lum[..., None] * np.array([0.86, 0.88, 0.58], np.float32) * (0.82 + 0.3 * n)
    hay = straw * 0.45 + olive * 0.55
    put("hay", np.clip(hay, 0, 1))
    # kůra a čelo klády z atlasu řemesel (pás beam = kůra trámů, logends = čela)
    meta = json.load(open(os.path.join(CRAFT_ATLAS, "atlas.json")))
    src = load_rgb(os.path.join(CRAFT_ATLAS, "atlas.jpg"))
    upm = meta["W"] / meta["uperiod_m"]
    beam = meta["bands"]["beam"]
    # kůra trámů je v atlasu obydlí tmavá (stín pod střechou) – klády na voze na slunci světlejší
    bark = src[beam["r0"] + 4 : beam["r1"] - 4, : int(round(2.5 * upm))]
    put("bark", np.clip(bark * np.array([1.75, 1.6, 1.45], np.float32) + 0.03, 0, 1))
    le = meta["bands"]["logends"]
    tile = int(round(0.222 * upm))
    x0 = int(round(0.111 * upm - tile / 2)) + tile * 2
    put("endgrain", src[le["r0"] : le["r1"], x0 : x0 + tile])
    # pytlovina: plátno (osnova a útek) s nerovnou barvou
    yy, xx = np.mgrid[0:128, 0:128].astype(np.float32)
    weave = 0.5 + 0.25 * np.sin(xx * math.pi / 2.0) * np.sign(np.sin(yy * math.pi / 2.0 + 0.3)) + 0.25 * np.sin(yy * math.pi / 2.0)
    blot = value_noise(128, 128, 16, 11)
    base = np.array([0.74, 0.64, 0.47], np.float32)
    cloth = base * (0.82 + 0.18 * weave[..., None]) * (0.88 + 0.2 * blot[..., None])
    put("cloth", cloth)
    # provaz z lýka: šikmé prameny (jako plough.py)
    yy, xx = np.mgrid[0:16, 0:512].astype(np.float32)
    strand = 0.5 + 0.5 * np.sin((xx + yy * 1.2) * 2 * math.pi / 6.0)
    put("rope", np.array([0.62, 0.52, 0.33], np.float32) * (0.72 + 0.38 * strand[..., None]))
    # kožešina: hnědá srst v pramenech
    yy, xx = np.mgrid[0:96, 0:128].astype(np.float32)
    hair = 0.5 + 0.5 * np.sin(xx * 0.9 + 3 * value_noise(96, 128, 8, 3))
    tone = value_noise(96, 128, 24, 7)
    fur = np.array([0.36, 0.25, 0.15], np.float32) * (0.7 + 0.3 * hair[..., None]) * (0.75 + 0.45 * tone[..., None])
    put("fur", fur)

    im = bpy.data.images.new("wagon-atlas", W, H, alpha=False)
    rgba = np.concatenate([np.clip(atlas[::-1], 0, 1), np.ones((H, W, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    path = os.path.join(RENDER if RENDER != "-" else (bpy.app.tempdir or "/tmp"), "wagon-atlas.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im


def region_uv(mat, u, v):
    """UV v atlasu: (u, v) normalizované 0–1 v oblasti (v = 0 dole). „plank“ a „iron“ jsou
    výřezy oblasti „wagon“ (textury vozu)."""
    u = min(1.0, max(0.0, u))
    v = min(1.0, max(0.0, v))
    if mat in WAGON_SUB:
        x0, x1, r0, r1 = WAGON_SUB[mat]
        r = REGIONS["wagon"]
        k = (r["x1"] - r["x0"]) / 256
        x = r["x0"] + (x0 + u * (x1 - x0)) * k
        row = r["r0"] + (r1 - v * (r1 - r0)) * k
        return (x / W, 1 - row / H)
    r = REGIONS[mat]
    x = r["x0"] + u * (r["x1"] - r["x0"])
    row = r["r1"] - v * (r["r1"] - r["r0"])
    return (x / W, 1 - row / H)


# --- COLLADA -------------------------------------------------------------------------------


def floats(el):
    return [float(v) for v in el.text.split()]


def ints(el):
    return [int(v) for v in el.text.split()]


def source_data(root, source_id):
    src = root.find(f".//c:source[@id='{source_id}']", NS)
    arr = floats(src.find("c:float_array", NS))
    stride = int(src.find(".//c:accessor", NS).get("stride", "1"))
    return [arr[i : i + stride] for i in range(0, len(arr), stride)]


def load_skinned(path):
    """Skinovaný mesh 0 A.D.: trojúhelníky (poloha, normála, uv po rozích), kost každého vrcholu
    (váhy jsou u vozů všude 1) a polohy kostí (sid → bod)."""
    root = ET.parse(path).getroot()
    if root.findtext(".//c:asset/c:up_axis", default="Z_UP", namespaces=NS).strip() != "Z_UP":
        raise SystemExit(f"{path}: čekám Z_UP")
    ctrl = root.find(".//c:controller", NS)
    skin = ctrl.find("c:skin", NS)
    bsm_el = skin.find("c:bind_shape_matrix", NS)
    if bsm_el is not None and any(abs(a - b) > 1e-6 for a, b in zip(floats(bsm_el), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])):
        raise SystemExit(f"{path}: bind shape matrix není jednotková")
    joints = skin.find("c:joints", NS)
    by_sem = {i.get("semantic"): i.get("source")[1:] for i in joints.findall("c:input", NS)}
    names = root.find(f".//c:source[@id='{by_sem['JOINT']}']/c:Name_array", NS).text.split()
    vw = skin.find("c:vertex_weights", NS)
    inputs = vw.findall("c:input", NS)
    stride = max(int(i.get("offset")) for i in inputs) + 1
    j_off = int(next(i for i in inputs if i.get("semantic") == "JOINT").get("offset"))
    counts = ints(vw.find("c:vcount", NS))
    v = ints(vw.find("c:v", NS))
    bone, k = [], 0
    for count in counts:
        bone.append(names[v[k + j_off]])
        k += stride * count
    geom = root.find(f".//c:geometry[@id='{skin.get('source')[1:]}']", NS)
    mesh = geom.find("c:mesh", NS)
    pos_src = mesh.find("c:vertices/c:input[@semantic='POSITION']", NS).get("source")[1:]
    positions = [Vector(p[:3]) for p in source_data(root, pos_src)]
    tris = []
    for prim in mesh.findall("c:triangles", NS):
        ins = prim.findall("c:input", NS)
        st = max(int(i.get("offset")) for i in ins) + 1
        sem = {i.get("semantic"): i for i in ins}
        nrm = [Vector(n[:3]) for n in source_data(root, sem["NORMAL"].get("source")[1:])]
        uvs = [t[:2] for t in source_data(root, sem["TEXCOORD"].get("source")[1:])]
        vo, no, to = (int(sem[s].get("offset")) for s in ("VERTEX", "NORMAL", "TEXCOORD"))
        p = ints(prim.find("c:p", NS))
        for t in range(len(p) // (st * 3)):
            corners = []
            for c in range(3):
                idx = p[(t * 3 + c) * st : (t * 3 + c + 1) * st]
                corners.append((idx[vo], nrm[idx[no]], uvs[idx[to]]))
            tris.append(corners)
    # polohy kostí (u vozů jen posunutí od kořene)
    bones = {}

    def walk(node, offset):
        m = node.find("c:matrix", NS)
        here = offset
        if m is not None:
            vals = floats(m)
            here = offset + Vector((vals[3], vals[7], vals[11]))
        if node.get("sid"):
            bones[node.get("sid")] = here
        for child in node.findall("c:node", NS):
            walk(child, here)

    for node in root.findall(".//c:visual_scene/c:node", NS):
        walk(node, Vector((0, 0, 0)))
    return {"positions": positions, "bone": bone, "tris": tris, "bones": bones}


def components(model, tri_ids):
    """Souvislé části (trojúhelníky sdílející vrchol nebo polohu) – seznam seznamů trojúhelníků."""
    pos = model["positions"]
    parent = list(range(len(pos)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[a] = b

    seen = {}
    for i, p in enumerate(pos):
        key = (round(p.x, 4), round(p.y, 4), round(p.z, 4))
        if key in seen:
            union(i, seen[key])
        else:
            seen[key] = i
    for t in tri_ids:
        c = model["tris"][t]
        union(c[0][0], c[1][0])
        union(c[0][0], c[2][0])
    groups = {}
    for t in tri_ids:
        groups.setdefault(find(model["tris"][t][0][0]), []).append(t)
    out = []
    for tris in groups.values():
        pts = [pos[c[0]] for t in tris for c in model["tris"][t]]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        u = sum(c[2][0] for t in tris for c in model["tris"][t]) / (3 * len(tris))
        out.append({"tris": tris, "lo": lo, "hi": hi, "u": u})
    return out


# --- stavebnice ----------------------------------------------------------------------------


def F(forward, up, left=0.0):
    """Bod (vpřed, nahoru, vlevo) → Blender."""
    return Vector((left, -forward, up))


class Builder:
    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.uvs, self.normals = [], [], [], []

    def tri_import(self, model, tris, origin, scale, uv_of=None):
        """Trojúhelníky modelu 0 A.D. (poloha − origin) · scale, normály a uv z modelu."""
        pos = model["positions"]
        for t in tris:
            corners = model["tris"][t]
            base = len(self.verts)
            for idx, _, _ in corners:
                self.verts.append((pos[idx] - origin) * scale)
            self.faces.append([base, base + 1, base + 2])
            self.uvs.append([uv_of(uv) if uv_of else region_uv("wagon", uv[0], uv[1]) for _, _, uv in corners])
            self.normals.append([n.normalized() for _, n, _ in corners])

    def poly(self, pts, mat, uvm, normals=None, out=None):
        pts = [Vector(p) for p in pts]
        uvm = list(uvm)
        n = Vector((0, 0, 0))
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            n.x += (a.y - b.y) * (a.z + b.z)
            n.y += (a.z - b.z) * (a.x + b.x)
            n.z += (a.x - b.x) * (a.y + b.y)
        if out is not None and n.dot(Vector(out)) < 0:
            pts.reverse()
            uvm.reverse()
            if normals:
                normals = list(reversed(normals))
            n = -n
        if n.length < 1e-12:
            return
        n.normalize()
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(list(range(base, base + len(pts))))
        self.uvs.append([region_uv(mat, a, b) for a, b in uvm])
        self.normals.append([Vector(x).normalized() for x in normals] if normals else [n] * len(pts))

    def rod(self, path, radii, mat, sides=7, caps="endgrain", squash=1.0, u_len=None, cap_mat=None):
        """Tyč po lomené čáře (měkké normály). u podél délky (normalizovaně, u_len = délka v m
        na celou oblast – jinak celá tyč), v po obvodu. Čela `caps` (oblast), None = bez čel."""
        path = [Vector(p) for p in path]
        tangents = []
        for i in range(len(path)):
            a = path[max(0, i - 1)]
            b = path[min(len(path) - 1, i + 1)]
            tangents.append((b - a).normalized())
        up = Vector((0, 0, 1))
        normal = up - tangents[0] * up.dot(tangents[0])
        if normal.length < 1e-6:
            normal = Vector((1, 0, 0)) - tangents[0] * tangents[0].x
        normal.normalize()
        rings, ring_normals, lengths = [], [], [0.0]
        for i, (p, t) in enumerate(zip(path, tangents)):
            if i > 0:
                normal = normal - t * normal.dot(t)
                normal.normalize()
                lengths.append(lengths[-1] + (p - path[i - 1]).length)
            binormal = t.cross(normal)
            ring, rn = [], []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                d = normal * (math.cos(a) * squash) + binormal * math.sin(a)
                ring.append(p + d * radii[i])
                rn.append((normal * (math.cos(a) / max(squash, 1e-3)) + binormal * math.sin(a)).normalized())
            rings.append(ring)
            ring_normals.append(rn)
        total = u_len or lengths[-1] or 1.0
        for i in range(len(path) - 1):
            for k in range(sides):
                k2 = k + 1
                u0, u1 = lengths[i] / total, lengths[i + 1] / total
                self.poly(
                    [rings[i][k], rings[i][k2 % sides], rings[i + 1][k2 % sides], rings[i + 1][k]],
                    mat,
                    [(u0, k / sides), (u0, k2 / sides), (u1, k2 / sides), (u1, k / sides)],
                    normals=[ring_normals[i][k], ring_normals[i][k2 % sides], ring_normals[i + 1][k2 % sides], ring_normals[i + 1][k]],
                )
        if caps:
            for idx, sign in ((0, -1), (len(path) - 1, 1)):
                ring = rings[idx]
                uvm = [(0.5 + 0.48 * math.cos(2 * math.pi * k / sides), 0.5 + 0.48 * math.sin(2 * math.pi * k / sides)) for k in range(sides)]
                self.poly(ring, cap_mat or caps, uvm, out=tangents[idx] * sign)

    def surface(self, grid, mat, closed_v=False, smooth=True):
        """Plocha z mřížky bodů grid[i][j] (i podél u, j podél v), uv normalizované po mřížce;
        měkké normály z mřížky (průměr sousedních ploch). closed_v = řada se uzavře (první bod
        se zopakuje na konci – šev v uv). Plochy míří ven od těžiště mřížky (většinou hlasů)."""
        if closed_v:
            grid = [list(row) + [row[0]] for row in grid]
        ni, nj = len(grid), len(grid[0])
        acc = {}

        def key(p):
            return (round(p.x, 5), round(p.y, 5), round(p.z, 5))

        quads = []
        for i in range(ni - 1):
            for j in range(nj - 1):
                a, b, c, d = grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]
                n = (c - a).cross(d - b)
                for p in (a, b, c, d):
                    acc[key(p)] = acc.get(key(p), Vector((0, 0, 0))) + n
                quads.append((i, j, n))
        center = sum((p for row in grid for p in row), Vector((0, 0, 0))) / (ni * nj)
        votes = sum(1 if n.dot(grid[i][j] - center) > 0 else -1 for i, j, n in quads)
        sign = 1 if votes >= 0 else -1
        for i, j, n in quads:
            idx = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if sign < 0:
                idx.reverse()
            pts = [grid[a][b] for a, b in idx]
            if n.length < 1e-12:
                continue
            uvm = [(a / (ni - 1), b / (nj - 1)) for a, b in idx]
            normals = []
            for p in pts:
                m = acc[key(p)] * sign
                normals.append(m.normalized() if smooth and m.length > 1e-12 else n.normalized() * sign)
            base = len(self.verts)
            self.verts.extend(pts)
            self.faces.append([base, base + 1, base + 2, base + 3])
            self.uvs.append([region_uv(mat, u, v) for u, v in uvm])
            self.normals.append(normals)

    def build(self, material):
        # stejné polohy jako jeden vrchol – exportér glTF pak spojí rohy se stejnou normálou a uv
        index, verts = {}, []
        remap = []
        for v in self.verts:
            key = (round(v[0], 5), round(v[1], 5), round(v[2], 5))
            if key not in index:
                index[key] = len(verts)
                verts.append(tuple(v))
            remap.append(index[key])
        faces = [[remap[i] for i in f] for f in self.faces]
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(verts, [], faces)
        layer = mesh.uv_layers.new(name="UVMap")
        normals = []
        for poly, uvs, ns in zip(mesh.polygons, self.uvs, self.normals):
            for li, uv, nrm in zip(poly.loop_indices, uvs, ns):
                layer.data[li].uv = uv
                normals.append(nrm)
            poly.use_smooth = True
        mesh.materials.append(material)
        mesh.normals_split_custom_set(normals)
        mesh.validate(clean_customdata=False)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def seeded(i):
    """Deterministický „náhodný“ šum 0–1 (stejné modely při každém běhu)."""
    return (math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1.0


def lashing(b, center, axis, radius, length, turns=3):
    """Ovinutí provazem: několik závitů kolem tyče (jako plough.py)."""
    axis = Vector(axis).normalized()
    for i in range(turns):
        t = (i + 0.5) / turns - 0.5
        c = Vector(center) + axis * (t * length)
        b.rod([c - axis * (length / turns * 0.42), c + axis * (length / turns * 0.42)], [radius, radius], "rope", sides=7, caps=None)


def bezier(p0, p1, p2, p3, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t**3
        pts.append(p0 * a + p1 * b + p2 * c + p3 * d)
    return pts


# --- vozy ------------------------------------------------------------------------------------


def wagon_parts():
    """Načte oba vozy 0 A.D., rozdělí je na díly a zmenší. Vrátí stavitele dílů a rozměry."""
    two = load_skinned(os.path.join(ART, "meshes/props/special/wagon_two_wheel_empty.dae"))
    four = load_skinned(os.path.join(ART, "meshes/props/special/wagon_four_wheel_empty.dae"))

    # kolo: levé kolo dvoukoláku (náboj ven v +X) – čtyřkolák má totéž kolo
    hub = two["bones"]["l_wheel"]
    wheel_tris = [t for t, c in enumerate(two["tris"]) if two["bone"][c[0][0]] == "l_wheel"]
    radius_0ad = max(
        math.hypot(two["positions"][c[0]].y - hub.y, two["positions"][c[0]].z - hub.z) for t in wheel_tris for c in two["tris"][t]
    )
    S = WHEEL_R / radius_0ad
    four_hub = four["bones"]["WheelLeftFront"]
    four_wheel = [t for t, c in enumerate(four["tris"]) if four["bone"][c[0][0]] == "WheelLeftFront"]
    if len(four_wheel) != len(wheel_tris):
        print(f"POZOR: kolo čtyřkoláku má {len(four_wheel)} trojúhelníků, dvoukoláku {len(wheel_tris)}")
    wheel = Builder("wagon-wheel")
    wheel.tri_import(two, wheel_tris, hub, S)

    # dvoukolák: bez dvou ojí s chomoutem (vpředu, y < −0,5) a železných pouzder ojí na korbě
    body2_tris = [t for t, c in enumerate(two["tris"]) if two["bone"][c[0][0]] == "twowheel"]
    keep2, drop2 = [], []
    for comp in components(two, body2_tris):
        cx = (comp["lo"].x + comp["hi"].x) / 2
        cy = (comp["lo"].y + comp["hi"].y) / 2
        shaft = comp["lo"].y < -0.5
        socket = comp["u"] < 0.1 and abs(cx) > 0.9 and cy < 1.0
        (drop2 if shaft or socket else keep2).append(comp)
    axle2 = Vector((0, hub.y, 0))
    body2 = Builder("wagon2-body")
    for comp in keep2:
        body2.tri_import(two, comp["tris"], axle2, S)
    print(f"dvoukolák: {len(keep2)} částí korby, pryč {len(drop2)} (oje, chomout, pouzdra)")
    bed2 = {
        "front": (hub.y - min(c["lo"].y for c in keep2)) * S,
        "back": (max(c["hi"].y for c in keep2) - hub.y) * S,
        "floor": 1.72 * S,
        "half_w": 1.15 * S,
        "side_top": 3.1 * S,
        "track": two["bones"]["l_wheel"].x * S,
        "hub_z": hub.z * S,
    }

    # čtyřkolák: bez oje s dvojitým chomoutem (y < −3,5); předek = přední náprava, její ložiska
    # a rozvora (sbíhá se do špičky vpředu)
    front_hub = four["bones"]["WheelLeftFront"]
    back_hub = four["bones"]["WheelLeftBack"]
    body4_tris = [t for t, c in enumerate(four["tris"]) if four["bone"][c[0][0]] == "RamBone"]
    keep4, front4, drop4 = [], [], []
    for comp in components(four, body4_tris):
        cy = (comp["lo"].y + comp["hi"].y) / 2
        dx = comp["hi"].x - comp["lo"].x
        dy = comp["hi"].y - comp["lo"].y
        if comp["lo"].y < -3.5:
            drop4.append(comp)
        elif abs(cy - front_hub.y) < 0.3 and dx > 3 and dy < 0.5:  # přední náprava
            front4.append(comp)
        elif comp["lo"].z < 1.05 and abs(cy - front_hub.y) < 0.6:  # ložiska přední nápravy
            front4.append(comp)
        elif -3.5 < comp["lo"].y < -2.5:  # rozvora
            front4.append(comp)
        else:
            keep4.append(comp)
    pin = Vector((0, front_hub.y, 0))
    mid = Vector((0, (front_hub.y + back_hub.y) / 2, 0))
    body4 = Builder("wagon4-body")
    for comp in keep4:
        body4.tri_import(four, comp["tris"], mid, S)
    front = Builder("wagon4-front")
    for comp in front4:
        front.tri_import(four, comp["tris"], pin, S)
    print(f"čtyřkolák: {len(keep4)} částí korby, {len(front4)} předku, pryč {len(drop4)} (oj, chomouty)")
    # špička rozvory: nejpřednější body rozvory (střed v x, horní hrana)
    hounds = [c for c in front4 if c["lo"].y < -2.5]
    tip_pts = [four["positions"][c[0]] for comp in hounds for t in comp["tris"] for c in four["tris"][t]]
    y_tip = min(p.y for p in tip_pts)
    near = [p for p in tip_pts if p.y < y_tip + 0.12]
    tip = Vector((0, y_tip, sum(p.z for p in near) / len(near)))
    bed4_lo = min(c["lo"].y for c in keep4 if c["hi"].z > 2.5)
    bed4 = {
        "front_axle": (mid.y - front_hub.y) * S,
        "wheelbase": (back_hub.y - front_hub.y) * S,
        "hounds_tip": ((front_hub.y - tip.y) * S, tip.z * S),
        "front": (mid.y - bed4_lo) * S,
        "back": (max(c["hi"].y for c in keep4) - mid.y) * S,
        "floor": 1.72 * S,
        "half_w": 1.52 * S,
        "side_top": 3.78 * S,
        "track": front_hub.x * S,
        "hub_z": front_hub.z * S,
        "bed_front": (mid.y - (-0.3)) * S,
        "bed_back": (7.9 - mid.y) * S,
    }
    return S, wheel, body2, bed2, body4, front, bed4


def shafts2(b, bed):
    """Oplení dvoukoláku (oxen.md – Potah: dvoukolák táhne jeden vůl): dvě oje po stranách vola
    (±SHAFT2_X) – pod podlahou od nápravy dopředu, za předkem korby zahnuté nahoru k bokům jha na
    šíji vola; na špičkách železné objímky a ovinutí provazem (sem se přiváže jho), před korbou
    rozpěra. Střed mezi špičkami leží v (POLE2_TIP, YOKE_Y) jako dřív špička oje – scéna naklápí
    korbu stejně."""
    z = bed["floor"] - 0.12  # pod příčnými trámy podlahy
    for side in (-1, 1):
        x = side * SHAFT2_X
        pts = bezier(F(-0.25, z, x), F(bed["front"] + 0.25, z, x), F(bed["front"] + 1.0, z + 0.25, x), F(POLE2_TIP, YOKE_Y, x), 14)
        # rovný kus pod korbou zvlášť (ať se oj pod podlahou nekřiví)
        path = [F(-0.25, z, x), F(bed["front"] * 0.5, z, x)] + [p for p in pts if -p.y > bed["front"] * 0.5 + 0.05]
        radii = [POLE2_R * 0.9 * (1 - 0.18 * max(0.0, -p.y) / POLE2_TIP) for p in path]
        b.rod(path, radii, "plank", sides=8, u_len=3.4)
        tip_dir = (path[-1] - path[-2]).normalized()
        tip = path[-1]
        b.rod([tip - tip_dir * 0.2, tip - tip_dir * 0.12], [POLE2_R * 0.85, POLE2_R * 0.85], "iron", sides=8, caps=None)
        lashing(b, tip - tip_dir * 0.06, tip_dir, POLE2_R * 0.85, 0.09)
        # oj je přibitá k příčníkům podlahy – dva železné pásy kolem
        for f in (0.05, bed["front"] * 0.55):
            p = F(f, z, x)
            b.rod([p - Vector((0, 0.025, 0)), p + Vector((0, 0.025, 0))], [POLE2_R * 1.02, POLE2_R * 1.02], "iron", sides=8, caps=None)
        for p in path:
            if p.z > YOKE_Y + 0.02:
                print("POZOR: oj dvoukoláku nad jhem")
    # rozpěra mezi ojemi těsně před korbou (za zadkem vola)
    f = bed["front"] + 0.12
    b.rod([F(f, z + 0.01, -SHAFT2_X), F(f, z + 0.01, SHAFT2_X)], [POLE2_R * 0.7, POLE2_R * 0.7], "plank", sides=6)


def yoke1():
    """Jednoduché šíjové jho pro jednoho vola (dvoukolák – oxen.md, Potah): břevno napříč šíjí se
    sedlem uprostřed, kolíky (houžve) po stranách krku a podbradní provaz (jako jho páru –
    plough.py), na koncích ovinutí, kde jsou přivázané oje oplení (±SHAFT2_X). Počátek = spodek
    středu jha (jako díl `yoke` v ard.glb)."""
    b = Builder("wagon2-yoke")
    end = SHAFT2_X + 0.07
    xs = [-end, -SHAFT2_X, -0.3, -0.16, 0.0, 0.16, 0.3, SHAFT2_X, end]

    def lift(x):
        d = min(abs(x), 0.3) / 0.3
        return 0.05 * (1 - d * d)  # sedlo nad šíjí výš

    half_h = 0.05
    path = [Vector((x, 0, half_h + lift(x))) for x in xs]
    radii = [0.05] * len(xs)
    radii[0] = radii[-1] = 0.038
    b.rod(path, radii, "plank", sides=8, squash=0.8)
    pegs = []
    for side in (-1, 1):
        x = side * 0.17
        top = Vector((x, 0, 0.1))
        bottom = Vector((x - side * 0.03, 0.0, -0.48))
        b.rod([top, bottom], [0.017, 0.015], "plank", sides=6)
        pegs.append(bottom)
    a, c = pegs
    sag = [a.lerp(c, t) + Vector((0, 0, -0.04 * math.sin(math.pi * t))) for t in (0, 0.25, 0.5, 0.75, 1)]
    b.rod(sag, [0.014] * 5, "rope", sides=5, caps=None)
    for side in (-1, 1):
        lashing(b, Vector((side * SHAFT2_X, 0, half_h)), Vector((1, 0, 0)), 0.062, 0.1)
    return b


def pole4(b):
    """Oj čtyřkoláku: od špičky rozvory vpřed (POLE4_M), kus zasunutý dozadu do rozvory."""
    path = [F(-0.3, 0), F(0.0, 0), F(POLE4_M * 0.5, 0), F(POLE4_M, 0)]
    b.rod(path, [POLE4_R * 1.05, POLE4_R, POLE4_R * 0.95, POLE4_R * 0.85], "plank", sides=8, u_len=2.2)
    lashing(b, F(POLE4_M - 0.06, 0), F(1, 0) - F(0, 0), POLE4_R * 0.95, 0.09)
    b.rod([F(POLE4_M - 0.18, 0), F(POLE4_M - 0.12, 0)], [POLE4_R * 0.98, POLE4_R * 0.98], "iron", sides=8, caps=None)


# --- náklad --------------------------------------------------------------------------------


def hay_load(b, front, back, half_w, floor, top, overhang=0.16):
    """Kupa sena: v řezu zaoblená (širší než korba – seno přečnívá přes bočnice), na koncích
    zaoblená, povrch rozcuchaný šumem; pavuza (žerď) přes hřbet přivázaná vpředu a vzadu."""
    ni, nj = 22, 18
    length = front + back
    w = half_w + overhang
    h = top - floor

    def shape(u, phi):
        # u ∈ [−1, 1] podél (−1 vzadu, 1 vpředu), phi ∈ [0, π] po řezu zprava doleva přes hřbet
        f = max(0.0, 1 - abs(u) ** 3.2) ** (1 / 3.2)
        r_side = math.sin(phi) ** 0.7
        x = math.cos(phi) * w * (0.75 + 0.25 * f)
        z = floor - 0.02 + h * f * r_side
        bump = 0.05 * math.sin(7 * u + 3 * phi) + 0.035 * math.sin(13 * u - 5 * phi + 1) + 0.025 * math.sin(23 * u + 11 * phi)
        y = back - (u + 1) / 2 * length
        return Vector((x * (1 + bump * 0.6), y, z + bump * h * 0.5 * r_side))

    grid = []
    for i in range(ni + 1):
        u = -1 + 2 * i / ni
        row = []
        for j in range(nj + 1):
            phi = math.pi * j / nj
            row.append(shape(u, phi))
        grid.append(row)
    b.surface(grid, "hay")
    # pavuza: žerď po hřbetu kupy a provazy dolů ke korbě vpředu a vzadu
    ridge = top + 0.03
    p0, p1 = F(front + 0.12, ridge - 0.25), F(-back - 0.12, ridge - 0.22)
    b.rod([p0, F(front * 0.4, ridge), F(-back * 0.4, ridge), p1], [0.035, 0.038, 0.038, 0.034], "plank", sides=7, u_len=2.5)
    for end, f in ((p0, front), (p1, -back)):
        b.rod([end, F(f, floor + 0.05)], [0.012, 0.012], "rope", sides=5, caps=None)


def sheaf(b, a, c, r, seed):
    """Snop: svazek slámy z bodu a (řezné konce stébel) do c (klasy), uprostřed povříslo;
    u klasů se rozšiřuje a rozčepýří."""
    a, c = Vector(a), Vector(c)
    d = c - a
    pts, radii = [], []
    prof = [(0.0, 0.9), (0.5, 0.72), (0.85, 1.2), (1.0, 0.75)]
    for t, k in prof:
        pts.append(a + d * t)
        radii.append(r * k * (1 + 0.06 * math.sin(seed * 3.1 + t * 9)))
    b.rod(pts, radii, "straw", sides=6, caps="straw")
    b.rod([a + d * 0.46, a + d * 0.54], [r * 0.76, r * 0.76], "rope", sides=6, caps=None)


def sheaves_load(b, front, back, half_w, floor, layers=3, r=0.13, length=0.8):
    """Snopy napříč korbou ve dvou řadách – řezné konce ven, klasy dovnitř (přes sebe), po
    vrstvách, každá vrstva o kus užší a posunutá."""
    seed = 0
    for layer in range(layers):
        z = floor + r + layer * r * 1.55
        span_f, span_b = front - 0.06 - layer * 0.08, back - 0.06 - layer * 0.08
        n = max(2, int((span_f + span_b) / (2 * r * 0.95)))
        shift = (layer % 2) * r * 0.5
        for side in (-1, 1):
            out = side * (half_w + 0.12 - layer * 0.05)
            inner = side * (half_w + 0.12 - layer * 0.05 - length)
            for i in range(n):
                f = -span_b + shift + (i + 0.5) * (span_f + span_b - shift) / n
                f += 0.02 * (seeded(seed) - 0.5)
                lift = 0.04 * seeded(seed + 7) + (0.05 if side > 0 else 0.0)
                sheaf(b, F(f, z, out), F(f + 0.03 * (seeded(seed + 3) - 0.5), z + lift + 0.06, inner), r, seed)
                seed += 1


def log(b, a, c, r, seed):
    """Kláda: kůra po délce (oblast bark), čela letokruhy."""
    a, c = Vector(a), Vector(c)
    d = c - a
    pts = [a, a + d * 0.5, c]
    radii = [r, r * 0.97, r * 0.92]
    b.rod(pts, radii, "bark", sides=9, caps="endgrain")


def logs_load(b, front, back, half_w, floor, rows, r, length, rope_at):
    """Klády podél korby v pyramidě (řady zdola `rows`), vpředu u čela korby, přečnívají
    dozadu; přes ně dva provazy."""
    seed = 0
    z = floor + r
    top = z
    for k, count in enumerate(rows):
        span = (count - 1) * 2 * r
        for i in range(count):
            x = -span / 2 + i * 2 * r
            rr = r * (0.9 + 0.15 * seeded(seed))
            f0 = front - 0.05 - 0.1 * seeded(seed + 5)
            log(b, F(f0, z + rr - r, x), F(f0 - length, z + rr - r, x + 0.03 * (seeded(seed + 9) - 0.5)), rr, seed)
            seed += 1
        top = z
        z += r * math.sqrt(3)
    for f in rope_at:
        # provaz přes hromadu: ze strany korby přes vrchol a zpět
        pts = [F(f, floor + 0.05, half_w + 0.02), F(f, top, half_w * 0.75), F(f, top + r + 0.015, 0), F(f, top, -half_w * 0.75), F(f, floor + 0.05, -half_w - 0.02)]
        b.rod(pts, [0.012] * len(pts), "rope", sides=5, caps=None)


def sack(b, a, c, r, seed=0):
    """Ležící pytel z bodu a (dno) do c (zavázaný konec): měkký „polštář“ z pytloviny, zploštělý
    a se zakulacenými konci, u c zaškrcený provazem a za ním ucho."""
    a, c = Vector(a), Vector(c)
    ax = c - a
    length = ax.length
    ax.normalize()
    side = Vector((0, 0, 1)).cross(ax).normalized()
    up = ax.cross(side).normalized()
    prof = [(0.0, 0.5), (0.08, 0.9), (0.5, 1.0), (0.86, 0.8), (0.97, 0.3), (1.06, 0.36), (1.1, 0.1)]
    nj = 8
    grid = []
    for t, k in prof:
        row = []
        for j in range(nj):
            ang = 2 * math.pi * j / nj
            bulge = 1 + 0.05 * math.sin(3 * ang + seed) + 0.04 * math.sin(5 * ang + 2 * seed + t * 4)
            rr = r * k * bulge
            # spodek zploštělý – pytel leží
            h = math.sin(ang) * rr * 0.62
            h = max(h, -r * 0.5 * k)
            row.append(a + ax * (t * length) + side * (math.cos(ang) * rr) + up * (h + r * 0.5))
        grid.append(row)
    b.surface(grid, "cloth", closed_v=True)
    tie = a + ax * (0.975 * length) + up * (r * 0.5)
    b.rod([tie - ax * 0.02, tie + ax * 0.02], [r * 0.33, r * 0.33], "rope", sides=7, caps=None)


def keg(b, base, h, r):
    """Soudek: duhy z prken (výřez textury vozu), dvě železné obruče, víko."""
    base = Vector(base)
    prof = [(0.0, 0.82), (0.25, 0.97), (0.5, 1.0), (0.75, 0.97), (1.0, 0.82)]
    grid = []
    nj = 12
    for t, k in prof:
        grid.append([base + Vector((math.cos(2 * math.pi * j / nj) * r * k, math.sin(2 * math.pi * j / nj) * r * k, t * h)) for j in range(nj)])
    b.surface(grid, "plank", closed_v=True)
    for t in (0.18, 0.82):
        k = 0.97 * 1.02
        b.rod([base + Vector((0, 0, t * h - 0.015)), base + Vector((0, 0, t * h + 0.015))], [r * k, r * k], "iron", sides=12, caps=None)
    top = [base + Vector((math.cos(2 * math.pi * j / nj) * r * 0.8, math.sin(2 * math.pi * j / nj) * r * 0.8, h)) for j in range(nj)]
    b.poly(top, "endgrain", [(0.5 + 0.48 * math.cos(2 * math.pi * j / nj), 0.5 + 0.48 * math.sin(2 * math.pi * j / nj)) for j in range(nj)], out=(0, 0, 1))


def fur_bundle(b, a, c, r):
    """Svinutý balík kožešin převázaný provazem."""
    a, c = Vector(a), Vector(c)
    d = c - a
    pts = [a + d * t for t in (0.0, 0.1, 0.5, 0.9, 1.0)]
    b.rod(pts, [r * 0.8, r, r * 1.05, r, r * 0.8], "fur", sides=10, caps="fur")
    for t in (0.28, 0.72):
        b.rod([a + d * (t - 0.02), a + d * (t + 0.02)], [r * 1.07, r * 1.07], "rope", sides=10, caps=None)


def goods_load(b, front, back, half_w, floor, big=False):
    """Zboží obchodní výpravy: pytle napříč ve dvou vrstvách (zavázané konce střídavě), vzadu
    soudek medu a navrchu balík kožešin."""
    r = 0.17
    step = 2 * r * 0.92
    length = 2 * half_w - 0.08
    n = int((front + back - (0.55 if big else 0.45)) / step)
    seed = 0
    for layer, count in ((0, n), (1, n - 1)):
        z = floor + layer * r * 1.05
        for i in range(count):
            f = front - r - 0.02 - (i + 0.5 * layer) * step
            side = 1 if (i + layer) % 2 else -1
            sack(b, F(f, z, side * length / 2), F(f + 0.03 * (seeded(seed) - 0.5), z, -side * length / 2), r * (0.95 + 0.1 * seeded(seed + 3)), seed)
            seed += 1
    keg(b, F(-back + 0.24, floor, -half_w * 0.45), 0.46 if big else 0.4, 0.17 if big else 0.15)
    if big:
        keg(b, F(-back + 0.24, floor, half_w * 0.45), 0.46, 0.17)
    top = floor + 2.05 * r + 0.1
    f = front - 0.6 if big else front - 0.45
    fur_bundle(b, F(f, top, half_w * 0.8), F(f - 0.12, top, -half_w * 0.8), 0.11)


def water_load(b, front, back, half_w, floor, big=False):
    """Voda v sudech (wagons.md – Co vozy vozí; CART_JOBS.water.barrelL): stojící sudy po ≈ 150 l
    (vnější ⌀ 0,5–0,58 m, výška 0,72–0,78 m) s víkem a dřevěným čepem, kolem každého provaz ke
    korbě – dvoukolák dva za sebou (300 l), čtyřkolák čtyři ve dvou řadách (600 l)."""
    if big:
        r, h = 0.25, 0.78
        spots = [(f, side) for f in (front - 0.5, -back + 0.62) for side in (-half_w + r + 0.01, half_w - r - 0.01)]
    else:
        r, h = 0.29, 0.72
        spots = [(front - r - 0.12, 0.0), (-back + r + 0.12, 0.0)]
    for i, (f, side) in enumerate(spots):
        keg(b, F(f, floor, side), h, r)
        # čep ve víku (trochu stranou, u každého sudu jinde)
        a = 2 * math.pi * seeded(i + 11)
        bung = F(f + math.cos(a) * r * 0.45, floor + h, side + math.sin(a) * r * 0.45)
        b.rod([bung, bung + Vector((0, 0, 0.035))], [0.03, 0.026], "plank", sides=7, caps="endgrain")
        # provaz kolem sudu ve dvou třetinách výšky – dokola a k bočnici
        z = floor + h * 0.62
        ring = [F(f + math.cos(2 * math.pi * k / 12) * r * 1.0, z, side + math.sin(2 * math.pi * k / 12) * r * 1.0) for k in range(13)]
        b.rod(ring, [0.013] * len(ring), "rope", sides=5, caps=None)
        for sign in (-1, 1):
            if big and sign * side < 0:
                continue
            edge = half_w + 0.02
            b.rod([F(f, z, sign * r), F(f + 0.04 * sign, z + 0.05, sign * edge)], [0.012, 0.012], "rope", sides=5, caps=None)


def cargo(prefix, bed, big):
    front, back = bed["bed_front"], bed["bed_back"]
    hw, floor = bed["half_w"], bed["floor"]
    out = []
    b = Builder(f"{prefix}-hay")
    hay_load(b, front + 0.08, back + 0.1, hw, floor, top=bed["side_top"] + (0.75 if big else 0.62))
    out.append(b)
    b = Builder(f"{prefix}-sheaves")
    sheaves_load(b, front, back, hw, floor, layers=4 if big else 3)
    out.append(b)
    b = Builder(f"{prefix}-logs")
    if big:
        logs_load(b, front, back, hw, floor, rows=(4, 3, 2), r=0.125, length=3.6, rope_at=(front - 0.5, -back + 0.6))
    else:
        logs_load(b, front, back, hw, floor, rows=(3, 2, 1), r=0.12, length=2.6, rope_at=(front - 0.3, -back + 0.3))
    out.append(b)
    b = Builder(f"{prefix}-goods")
    goods_load(b, front, back, hw, floor, big)
    out.append(b)
    b = Builder(f"{prefix}-water")
    water_load(b, front, back, hw, floor, big)
    out.append(b)
    return out


# --- výstup --------------------------------------------------------------------------------


def make_material(image):
    mat = bpy.data.materials.new("wagon-atlas")
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
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


def render_preview(objs, bed2, bed4, render_dir):
    """Náhledy ve Workbenchi: oba vozy se všemi náklady vedle sebe, zblízka z boku a 3/4."""
    scene = bpy.context.scene
    by = {o.name: o for o in objs}
    copies = []

    def place(name, loc, rot=0.0):
        src = by[name]
        o = src.copy()
        scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (0, 0, rot)
        o.hide_render = False
        copies.append(o)
        return o

    def wheels(origin, hubs):
        for fx, x in hubs:
            place("wagon-wheel", origin + Vector((x, -fx, bed2["hub_z"])))
            o = place("wagon-wheel", origin + Vector((-x, -fx, bed2["hub_z"])), math.pi)

    for o in objs:
        o.hide_render = True
    loads = [None, "hay", "sheaves", "logs", "goods", "water"]
    for k, load in enumerate(loads):
        o2 = Vector((k * 3.0, 0, 0))
        place("wagon2-body", o2)
        wheels(o2, [(0.0, bed2["track"])])
        if load:
            place(f"wagon2-{load}", o2)
        o4 = Vector((k * 3.0, 7.0, 0))
        place("wagon4-body", o4)
        place("wagon4-front", o4 + F(bed4["front_axle"], 0))
        tip = F(bed4["front_axle"] + bed4["hounds_tip"][0], bed4["hounds_tip"][1])
        pole = place("wagon4-pole", o4 + tip)
        rise = YOKE_Y - bed4["hounds_tip"][1]
        pole.rotation_euler = (-math.atan2(rise, POLE4_M), 0, 0)
        wheels(o4, [(bed4["front_axle"], bed4["track"]), (-bed4["front_axle"], bed4["track"])])
        if load:
            place(f"wagon4-{load}", o4)
    bpy.ops.mesh.primitive_plane_add(size=60, location=(6, 3, 0))
    copies.append(bpy.context.active_object)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, loc, target, lens in (
        ("wagons-all.png", Vector((6.0, -9.0, 9.0)), Vector((6.0, 3.0, 0.4)), 24),
        ("wagon2-side.png", Vector((-4.5, 1.2, 1.4)), Vector((0.0, 0.2, 0.7)), 35),
        ("wagon2-close.png", Vector((5.3, -4.6, 3.0)), Vector((3.0, -0.3, 0.8)), 35),
        ("wagon4-close.png", Vector((12.5, 2.0, 3.6)), Vector((9.0, 6.8, 0.8)), 32),
        ("wagons-top.png", Vector((6.0, 3.5, 22.0)), Vector((6.0, 3.5, 0.0)), 30),
        ("water-close.png", Vector((19.5, -4.0, 3.4)), Vector((15.0, 3.0, 0.8)), 28),
    ):
        cam.location = loc
        cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        scene.render.filepath = os.path.join(render_dir, name)
        bpy.ops.render.render(write_still=True)
    for o in copies:
        bpy.data.objects.remove(o)


def bounds(obj):
    pts = [v.co for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT, exist_ok=True)
    image = build_atlas()
    mat = make_material(image)
    S, wheel, body2, bed2, body4, front4, bed4 = wagon_parts()
    shafts2(body2, bed2)
    pole = Builder("wagon4-pole")
    pole4(pole)
    builders = [body2, body4, front4, pole, wheel, yoke1()] + cargo("wagon2", {**bed2, "bed_front": bed2["front"], "bed_back": bed2["back"]}, False) + cargo("wagon4", bed4, True)
    objs = [b.build(mat) for b in builders]
    path = os.path.join(OUT, "wagons.glb")
    export(objs, path)
    print(f"měřítko 0 A.D. → m: {S:.4f}")
    print("ROZMĚRY " + json.dumps({"two": bed2, "four": bed4}, default=lambda v: [round(x, 4) for x in v]))
    for o in objs:
        lo, hi = bounds(o)
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        # Blender (x vlevo, −y vpřed, z nahoru) → vpřed, nahoru, vlevo
        print(f"  {o.name}: {tris} tris, vpřed {-hi.y:.3f}…{-lo.y:.3f}, výška {lo.z:.3f}…{hi.z:.3f}, šířka {lo.x:.3f}…{hi.x:.3f}")
    print(f"wagons.glb: {os.path.getsize(path) / 1024:.0f} kB, atlas {W}×{H}")
    if RENDER != "-":
        os.makedirs(RENDER, exist_ok=True)
        render_preview(objs, bed2, bed4, RENDER)


main()
