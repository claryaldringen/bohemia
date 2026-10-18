"""Rádlo, jho a oj pro spřežení volů (raně slovanská ves, 6.–9. st.) – jeden malý atlas
z textur obydlí, jeden materiál.

blender -b --factory-startup --python tools/blender/plough.py -- \
    <craft_atlas_dir> apps/web/public/models/plough <render_dir|->

craft_atlas_dir: výstup tools/blender/craft_atlas.py (atlas.jpg + atlas.json – atlas obydlí
rozšířený o železo a kůži, postup viz crafts.py). Skript z něj vyřízne, co rádlo potřebuje,
do malého atlasu 256 × 128 px (pásy se opakují v U po 4 m, okraje pásů jsou prolnuté, aby
navazovaly): „wood“ = kůra trámů (pás beam), „worn“ = totéž ohlazené a zesvětlené (kleč,
rukojeť, radlice – omak rukou a hlíny), „rope“ = provaz z lýka (procedurálně, do barvy
sena), oblasti „endgrain“ (čela polen – logends), „iron“ a „leather“. render_dir: náhled
ve Workbenchi, "-" = bez náhledu.

Souřadnice Blenderu: Z nahoru, vpřed = −Y (v glTF +Z, ve scéně model míří na +Z), +X = vlevo.
Rozměry jsou skutečné (m); scéna celé spřežení zvětší stejně jako postavy (FIGURE_SCALE).

Výstup ard.glb – díly (uzly), každý s vlastním počátkem, scéna je skládá podle
apps/web/lib/scene/plough-team.ts (rozměry níže musí sedět s konstantami tam):
  ard   plazové rádlo: plaz (dřevěný hranol v brázdě), dřevěná radlice se železnou
        špičkou (radličkou), kleč šikmo dozadu s příčnou rukojetí (oráč ji drží oběma
        rukama – klip „plough“ v plough-team.json), hřídel z mírně zahnuté větve
        čepovaná do kleče, slupice mezi plazem a hřídelí, na konci hřídele ovinutí
        provazem (sem se připojí oj). Počátek = na zemi pod středem plazu.
        ARD_HITCH = konec hřídele, ARD_GRIP = střed rukojeti.
  yoke  šíjové jho pro pár volů: hraněné břevno se dvěma prohnutými sedly na šíje
        (osy volů YOKE_SPAN od středu), na každý krk dva kolíky (houžve) a pod krkem
        podbradní provaz, uprostřed ovinutí, kde je přivázaná oj. Počátek = spodek
        středu jha (místo, kde začíná oj).
  pole  oj (hřídel spřežení) délky POLE_M od počátku vpřed (+Z ve scéně), na obou koncích
        ovinutá provazem; scéna ji natáčí od hřídele rádla ke jhu a nepatrně natahuje.
  rope  vodicí provaz délky 1 m vpřed – scéna ho natahuje od ruky honáčka k hlavě vola.
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
ATLAS_DIR, OUT, RENDER = args[0], args[1], args[2] if len(args) > 2 else "-"

# --- rozměry (m) – musí sedět s apps/web/lib/scene/plough-team.ts --------------------------
ARD_HITCH = (1.55, 0.78)  # konec hřídele (vpřed, výška)
ARD_GRIP = (-0.87, 1.0)  # střed příčné rukojeti (vpřed, výška)
GRIP_HALF = 0.25  # polovina délky rukojeti
YOKE_SPAN = 0.45  # osa vola od středu jha
POLE_M = 1.3  # délka oje

# --- malý atlas ----------------------------------------------------------------------------
W, H = 256, 128
PERIOD_M = 4.0  # pásy se opakují v U po 4 m (64 px/m)
GUT = 4
# pásy: řádky shora (r0, r1) a rozsah V v metrech (napříč plochou, obvod tyče)
BANDS = {
    "wood": {"r0": 4, "r1": 36, "vmin": -0.45, "vmax": 0.45},
    "worn": {"r0": 44, "r1": 76, "vmin": -0.45, "vmax": 0.45},
    "rope": {"r0": 84, "r1": 96, "vmin": -0.06, "vmax": 0.06},
}
REGIONS = {
    "endgrain": {"x0": 4, "x1": 36, "r0": 104, "r1": 124},
    "iron": {"x0": 44, "x1": 68, "r0": 104, "r1": 124},
    "leather": {"x0": 76, "x1": 100, "r0": 104, "r1": 124},
}


def load_rgb(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    # řádky shora jako v atlas.json
    return px.reshape(h, w, 4)[::-1, :, :3].copy()


def resize(img, w, h):
    """Zmenšení průměrem bloků / lineárně (jen numpy)."""
    sh, sw, _ = img.shape
    ys = (np.arange(h) + 0.5) * sh / h - 0.5
    xs = (np.arange(w) + 0.5) * sw / w - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, sh - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, sw - 1)
    y1 = np.clip(y0 + 1, 0, sh - 1)
    x1 = np.clip(x0 + 1, 0, sw - 1)
    fy = (ys - np.floor(ys))[:, None, None]
    fx = (xs - np.floor(xs))[None, :, None]
    top = img[y0][:, x0] * (1 - fx) + img[y0][:, x1] * fx
    bot = img[y1][:, x0] * (1 - fx) + img[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def seamless(img, n=24):
    """Konec pásu prolne do začátku – pás navazuje při opakování v U."""
    out = img.copy()
    w = out.shape[1]
    for i in range(n):
        t = (i + 1) / (n + 1)
        out[:, w - n + i] = img[:, w - n + i] * (1 - t) + img[:, i] * t
    return out


def build_atlas():
    meta = json.load(open(os.path.join(ATLAS_DIR, "atlas.json")))
    src = load_rgb(os.path.join(ATLAS_DIR, "atlas.jpg"))
    upm = meta["W"] / meta["uperiod_m"]  # px na metr zdroje v U
    atlas = np.zeros((H, W, 3), np.float32)

    def put_band(name, pixels):
        b = BANDS[name]
        rows = b["r1"] - b["r0"]
        band = seamless(resize(pixels, W, rows))
        atlas[b["r0"] : b["r1"]] = band
        # okraje pásu – opakované krajní řádky proti prolínání mipmap
        atlas[b["r0"] - GUT : b["r0"]] = band[:1]
        atlas[b["r1"] : b["r1"] + GUT] = band[-1:]

    beam = meta["bands"]["beam"]
    # jen prostřední řádky pásu – kraje jsou ztmavené stínem kulatiny
    bark = src[beam["r0"] + 13 : beam["r1"] - 13, : int(round(PERIOD_M * upm))]
    # hřídel, oj a jho jsou z oloupaného dřeva – kůra trámů zesvětlená do šedohnědé
    lum = bark @ np.array([0.3, 0.59, 0.11], np.float32)
    wood = np.clip((lum[..., None] * 0.55 + bark * 0.45) * np.array([1.24, 1.13, 0.97], np.float32) + 0.02, 0, 1)
    put_band("wood", wood)
    # ohlazené dřevo: světlejší, méně syté, jemnější kresba (omak a hlína)
    smooth = lum[..., None] * 0.5 + bark * 0.5
    worn = np.clip(smooth * np.array([1.52, 1.4, 1.2], np.float32) + 0.05, 0, 1)
    put_band("worn", worn)
    # provaz z lýka: šikmé prameny do barvy sena
    rows = BANDS["rope"]["r1"] - BANDS["rope"]["r0"]
    yy, xx = np.mgrid[0:rows, 0 : W * 2]
    strand = 0.5 + 0.5 * np.sin((xx + yy * 1.2) * 2 * math.pi / 6.0)
    base = np.array([0.62, 0.52, 0.33], np.float32)
    rope = base * (0.72 + 0.38 * strand[..., None])
    put_band("rope", rope)

    def region(name, crop):
        r = REGIONS[name]
        atlas[r["r0"] - 2 : r["r1"] + 2, r["x0"] - 2 : r["x1"] + 2] = resize(
            crop, r["x1"] - r["x0"] + 4, r["r1"] - r["r0"] + 4
        )

    le = meta["bands"]["logends"]
    region("endgrain", src[le["r0"] : le["r1"], 0:64])
    for name in ("iron", "leather"):
        r = meta["regions"][name]
        region(name, src[r["r0"] : r["r1"], r["x0"] : r["x1"]])

    im = bpy.data.images.new("plough-atlas", W, H, alpha=False)
    rgba = np.concatenate([np.clip(atlas[::-1], 0, 1), np.ones((H, W, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    path = os.path.join(RENDER if RENDER != "-" else (bpy.app.tempdir or "/tmp"), "plough-atlas.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im


def atlas_uv(mat, u, v):
    """Pás: u (m) se opakuje po PERIOD_M, v (m) do pásu; oblast: u, v normalizované 0–1."""
    if mat in BANDS:
        b = BANDS[mat]
        t = min(1.0, max(0.0, (v - b["vmin"]) / (b["vmax"] - b["vmin"])))
        row = b["r1"] - t * (b["r1"] - b["r0"])
        return (u / PERIOD_M, 1 - row / H)
    r = REGIONS[mat]
    u = min(1.0, max(0.0, u))
    v = min(1.0, max(0.0, v))
    x = r["x0"] + u * (r["x1"] - r["x0"])
    row = r["r1"] - v * (r["r1"] - r["r0"])
    return (x / W, 1 - row / H)


# --- stavebnice ----------------------------------------------------------------------------


def F(forward, up, left=0.0):
    """Bod ve stavebních souřadnicích rádla (vpřed, nahoru, vlevo) → Blender."""
    return Vector((left, -forward, up))


class Builder:
    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.uvs, self.normals = [], [], [], []

    def poly(self, pts, mat, uvm, normals=None, out=None):
        pts = [Vector(p) for p in pts]
        uvm = list(uvm)
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
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
        self.uvs.append([atlas_uv(mat, a, b) for a, b in uvm])
        self.normals.append([Vector(x).normalized() for x in normals] if normals else [n] * len(pts))

    def rod(self, path, radii, mat, sides=7, caps=True, uoff=0.0, squash=1.0):
        """Tyč po lomené čáře s poloměry v bodech (měkké normály, u podél délky v m,
        v po obvodu v m; čela letokruhy). squash < 1 zploští průřez do výšky (hraněné jho)."""
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
                # paralelní přenos rámce – tyč se po délce nekroutí
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
        for i in range(len(path) - 1):
            r = (radii[i] + radii[i + 1]) / 2
            for k in range(sides):
                k2 = (k + 1) % sides
                v0 = (k / sides - 0.5) * 2 * math.pi * r
                v1 = ((k + 1) / sides - 0.5) * 2 * math.pi * r
                u0, u1 = uoff + lengths[i], uoff + lengths[i + 1]
                self.poly(
                    [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]],
                    mat,
                    [(u0, v0), (u0, v1), (u1, v1), (u1, v0)],
                    normals=[ring_normals[i][k], ring_normals[i][k2], ring_normals[i + 1][k2], ring_normals[i + 1][k]],
                )
        if caps:
            for idx, sign in ((0, -1), (len(path) - 1, 1)):
                ring = rings[idx]
                uvm = [(0.5 + 0.5 * math.cos(2 * math.pi * k / sides), 0.5 + 0.5 * math.sin(2 * math.pi * k / sides)) for k in range(sides)]
                self.poly(ring, "endgrain", uvm, out=tangents[idx] * sign)

    def solid(self, rings, mat, caps=("endgrain", "endgrain")):
        """Hranol po průřezech (stejný počet bodů) – ostré hrany, u podél délky, v napříč."""
        lengths = [0.0]
        for i in range(1, len(rings)):
            ca = sum(rings[i - 1], Vector()) / len(rings[i - 1])
            cb = sum(rings[i], Vector()) / len(rings[i])
            lengths.append(lengths[-1] + (cb - ca).length)
        n = len(rings[0])
        center = sum((sum(r, Vector()) / n for r in rings), Vector()) / len(rings)
        for i in range(len(rings) - 1):
            for k in range(n):
                k2 = (k + 1) % n
                a, b, c, d = rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]
                half = (b - a).length / 2
                mid = (a + b + c + d) / 4
                self.poly(
                    [a, b, c, d],
                    mat,
                    [(lengths[i], -half), (lengths[i], half), (lengths[i + 1], half), (lengths[i + 1], -half)],
                    out=mid - center,
                )
        for ring, cap, sign in ((rings[0], caps[0], -1), (rings[-1], caps[1], 1)):
            if cap is None:
                continue
            c = sum(ring, Vector()) / n
            other = sum(rings[1 if sign < 0 else -2], Vector()) / n
            if cap in REGIONS:
                uvm = [(0.5 + (p - c).x * 4, 0.5 + (p - c).z * 4) for p in ring]
            else:
                uvm = [((p - c).x, (p - c).z) for p in ring]
            self.poly(ring, cap, uvm, out=c - other)

    def build(self, material):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
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


def box_ring(forward, up, half_w, half_h):
    """Obdélníkový průřez kolmo k ose vpřed (střed `up`)."""
    return [F(forward, up - half_h, half_w), F(forward, up - half_h, -half_w), F(forward, up + half_h, -half_w), F(forward, up + half_h, half_w)]


def lerp(a, b, t):
    return a + (b - a) * t


def lashing(b, center, axis, radius, length, turns=3):
    """Ovinutí provazem: několik závitů (krátké silnější prstence) kolem tyče."""
    axis = Vector(axis).normalized()
    for i in range(turns):
        t = (i + 0.5) / turns - 0.5
        c = Vector(center) + axis * (t * length)
        b.rod([c - axis * (length / turns * 0.42), c + axis * (length / turns * 0.42)], [radius, radius], "rope", sides=7, caps=False, uoff=i * 0.3)


# --- rádlo ---------------------------------------------------------------------------------


def build_ard():
    b = Builder("ard")
    # Plaz: hranol v brázdě (vrch 4 cm pod zemí), vpředu se zužuje do radlice.
    sole = [box_ring(f, -0.09, 0.055, 0.05) for f in (-0.34, 0.0, 0.26)]
    b.solid(sole, "wood")
    # Radlice: dřevěný klín na předku plazu, špička mírně nahoru (stále v zemi).
    share = [box_ring(0.24, -0.09, 0.056, 0.051), box_ring(0.38, -0.095, 0.04, 0.032), box_ring(0.44, -0.1, 0.03, 0.022)]
    b.solid(share, "worn", caps=(None, None))
    # Železná radlička: botka přes špičku radlice.
    tip = [box_ring(0.42, -0.1, 0.036, 0.027), box_ring(0.5, -0.104, 0.024, 0.016), box_ring(0.56, -0.106, 0.004, 0.004)]
    b.solid(tip, "iron", caps=("iron", None))
    # Kleč: z konce plazu šikmo dozadu nahoru k rukojeti.
    stilt_a = F(-0.27, -0.07)
    stilt_b = F(ARD_GRIP[0], ARD_GRIP[1] - 0.02)
    b.rod([stilt_a, lerp(stilt_a, stilt_b, 0.5) + Vector((0, 0.01, 0.01)), stilt_b], [0.036, 0.033, 0.03], "worn", sides=7)
    # Příčná rukojeť – oráč ji drží oběma rukama.
    gf, gz = ARD_GRIP
    b.rod([F(gf, gz, GRIP_HALF), F(gf, gz + 0.006, 0), F(gf, gz, -GRIP_HALF)], [0.021, 0.024, 0.021], "worn", sides=7)
    # Hřídel: mírně zahnutá větev čepovaná do kleče, vpředu nahoru ke spřežení.
    hf, hz = ARD_HITCH
    t0 = 0.47  # kde hřídel prochází klečí (podíl délky kleče)
    joint = lerp(stilt_a, stilt_b, t0)
    jf, jz = -joint.y, joint.z
    beam_pts = []
    for i in range(7):
        t = i / 6
        f = lerp(jf - 0.08, hf, t)
        z = lerp(jz - 0.012, hz, t) + 0.07 * math.sin(math.pi * t)  # oblouk větve
        beam_pts.append(F(f, z))
    b.rod(beam_pts, [0.046, 0.047, 0.046, 0.044, 0.042, 0.04, 0.038], "wood", sides=8)
    # Slupice: svislá vzpěra z předku plazu do hřídele.
    sf = 0.16
    beam_z = None
    for i in range(1, len(beam_pts)):
        a, c = beam_pts[i - 1], beam_pts[i]
        if -a.y <= sf <= -c.y:
            beam_z = lerp(a.z, c.z, (sf + a.y) / ((-c.y) - (-a.y)))
    b.rod([F(sf, -0.05), F(sf + 0.01, beam_z + 0.02)], [0.026, 0.024], "worn", sides=6)
    # Klínky v čepech (kleč–hřídel, slupice–hřídel) – drobné hranolky.
    for f, z in ((jf - 0.1, jz + 0.03), (sf, beam_z + 0.05)):
        b.solid([box_ring(f - 0.015, z, 0.012, 0.012), box_ring(f + 0.015, z, 0.012, 0.012)], "worn")
    # Ovinutí na konci hřídele – sem je přivázaná oj.
    end_dir = (beam_pts[-1] - beam_pts[-2]).normalized()
    lashing(b, beam_pts[-1] - end_dir * 0.06, end_dir, 0.054, 0.1)
    return b


# --- jho -----------------------------------------------------------------------------------


def build_yoke():
    b = Builder("yoke")
    # Břevno po ose X (napříč spřežením); spodek prohnutý do dvou sedel nad šíjemi.
    xs = [-0.8, -0.66, -0.56, -YOKE_SPAN, -0.34, -0.16, 0.0, 0.16, 0.34, YOKE_SPAN, 0.56, 0.66, 0.8]

    def lift(x):
        d = min(abs(abs(x) - YOKE_SPAN), 0.3) / 0.3
        saddle = 0.05 * (1 - d * d)  # sedlo – spodek nad šíjí výš
        end = 0.025 * max(0.0, (abs(x) - 0.62) / 0.18)  # konce mírně nahoru
        return saddle + end

    half_h = 0.05
    path = [Vector((x, 0, half_h + lift(x))) for x in xs]
    radii = [0.055 if abs(abs(x) - YOKE_SPAN) < 0.12 else 0.05 for x in xs]
    radii[0] = radii[-1] = 0.04
    b.rod(path, radii, "wood", sides=8, squash=0.8)
    # Kolíky (houžve) po obou stranách každé šíje a podbradní provaz pod krkem.
    for cx in (-YOKE_SPAN, YOKE_SPAN):
        pegs = []
        for side in (-1, 1):
            x = cx + side * 0.17
            top = Vector((x, 0, 0.1))
            bottom = Vector((x - side * 0.03, 0.0, -0.48))
            b.rod([top, bottom], [0.017, 0.015], "worn", sides=6)
            pegs.append(bottom)
        a, c = pegs
        sag = [lerp(a, c, t) + Vector((0, 0, -0.04 * math.sin(math.pi * t))) for t in (0, 0.25, 0.5, 0.75, 1)]
        b.rod(sag, [0.014] * 5, "rope", sides=5, caps=False)
    # Uprostřed ovinutí a smyčka, kterou je přivázaná oj (vede dozadu dolů).
    lashing(b, Vector((0, 0, half_h)), Vector((1, 0, 0)), 0.072, 0.12)
    return b


def build_pole():
    b = Builder("pole")
    # od počátku vpřed (Blender −Y) – scéna ji natočí od hřídele ke jhu
    pts = [F(t * POLE_M, 0) for t in (0, 0.5, 1)]
    b.rod(pts, [0.04, 0.042, 0.036], "wood", sides=7)
    lashing(b, F(0.07, 0), F(1, 0) - F(0, 0), 0.05, 0.1)
    lashing(b, F(POLE_M - 0.06, 0), F(1, 0) - F(0, 0), 0.046, 0.09)
    return b


def build_rope():
    b = Builder("rope")
    b.rod([F(0, 0), F(0.5, 0), F(1, 0)], [0.011, 0.011, 0.011], "rope", sides=5, caps=False)
    return b


def make_material(image):
    mat = bpy.data.materials.new("plough-atlas")
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


def render_preview(objs, path):
    """Náhled ve Workbenchi: rádlo, jho a oj složené jako ve scéně (bez volů)."""
    scene = bpy.context.scene
    yoke = next(o for o in objs if o.name == "yoke")
    pole = next(o for o in objs if o.name == "pole")
    yoke.location = F(ARD_HITCH[0] + POLE_M, 1.08)
    pole.location = F(*ARD_HITCH)
    pole.rotation_euler = (-math.atan2(1.08 - ARD_HITCH[1], POLE_M), 0, 0)
    for o in objs:
        if o.name == "rope":
            o.hide_render = True
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 900, 480
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = Vector((4.2, -0.4, 2.0))
    target = F(1.3, 0.55)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 24
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT, exist_ok=True)
    image = build_atlas()
    mat = make_material(image)
    objs = [p.build(mat) for p in (build_ard(), build_yoke(), build_pole(), build_rope())]
    for o in objs:
        print(f"  {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    path = os.path.join(OUT, "ard.glb")
    export(objs, path)
    print(f"ard.glb: {os.path.getsize(path) / 1024:.0f} kB, atlas {W}×{H}")
    if RENDER != "-":
        os.makedirs(RENDER, exist_ok=True)
        render_preview(objs, os.path.join(RENDER, "plough.png"))


main()
