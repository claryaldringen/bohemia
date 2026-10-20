"""Pohřeb žárem (raně slovanská ves, 6.–9. st. – docs/design/cemetery.md, Pohřeb ve scéně):
máry se zemřelým zabaleným v plátně, hranice z polen do kříže a ohořelé zbytky po spálení –
malý atlas (kůra a čela polen z atlasu cest, plátno, provaz, uhel a žhavé uhlíky procedurálně),
jeden materiál; k tomu sprity ohně (plameny, jiskra, záře) pro scénu.

blender -b --factory-startup --python tools/blender/funeral.py -- \
    apps/web/public/models/roads/road-log.glb apps/web/public/models/cemetery \
    apps/web/public/textures/particles <render_dir|->

road-log.glb: kmen hatě z tools/blender/roads.py – skript z něj vezme vložený atlas (kůra buku
z 0 A.D. ztmavená do dubu a letokruhy čela) a vyřízne z něj kůru a čelo polen. Plátno, provaz,
ohořelé dřevo, popel a uhlíky jsou procedurální (numpy). render_dir: náhled ve Workbenchi, "-" =
bez náhledu.

Souřadnice Blenderu: Z nahoru, vpřed = −Y (ve scéně model míří na +Z – bod Blenderu (x, y) je ve
scéně v osách (−x, −y)). Rozměry jsou skutečné (m) a musí sedět s konstantami ve scéně
(apps/web/lib/scene/funeral-plan.ts – PYRE, BIER).

Výstup funeral.glb – díly (uzly), každý s vlastním počátkem:
  bier     máry: dvě tyče délky BIER_LENGTH (2,6 m) podél Y ve vzdálenosti BIER_SPAN (0,8 m),
           na nich pět příček a zemřelý zabalený v lněném plátně, převázaný provazem (hlava
           vpředu, −Y). Počátek = osa tyčí uprostřed – scéna máry zvedá na ramena nosičů
           (BIER.carryM) a pokládá na vrch hranice.
  pyre     hranice z polen do kříže PYRE_LENGTH × PYRE_WIDTH (2 × 1,2 m), výška PYRE_HEIGHT
           (1 m): vrstvy střídavě podélně a napříč, nahoře podélně (máry leží podél). Počátek na
           zemi pod středem.
  remains  ohořelé zbytky: nízká kupa popela a uhlí (2,4 × 1,6 m, 0,22 m) s ohořelými pahýly
           polen. Počátek na zemi pod středem.
  embers   žhavé uhlíky: povrch kupy znovu nad ní (materiál „funeral-embers“ – stejný atlas,
           scéna ho kreslí jako záři, která slábne, jak uhlíky chladnou).
Výstup textures/particles/fire.png – sprity 4 × 128 px vedle sebe (aditivní míchání, barva
× alfa): plamen, druhý plamen (rozervaný), jiskra, měkká záře.
Licence: kůra a čela polen z 0 A.D. (CC BY-SA 3.0, Wildfire Games) – zbytek vlastní;
apps/web/public/models/cemetery/LICENSES.md, sprity apps/web/public/textures/particles/LICENSE.md.
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
ROAD_GLB, OUT_DIR, PARTICLES_DIR = args[0], args[1], args[2]
RENDER_DIR = args[3] if len(args) > 3 else "-"

# --- rozměry (m) – musí sedět s apps/web/lib/scene/funeral-plan.ts ---------------------------
BIER_LENGTH = 2.6
BIER_SPAN = 0.8
PYRE_LENGTH = 2.0
PYRE_WIDTH = 1.2
PYRE_HEIGHT = 1.0

ATLAS = 512
# oblasti atlasu (u0, v0, u1, v1) v 0–1, v odspodu jako v Blenderu
BARK = (0.0, 0.0, 0.5, 1.0)
LINEN = (0.5, 0.625, 1.0, 1.0)
ROPE = (0.5, 0.5, 1.0, 0.625)
CHAR = (0.5, 0.375, 1.0, 0.5)
ASH = (0.5, 0.25, 1.0, 0.375)
ENDGRAIN = (0.5, 0.0, 0.75, 0.25)
EMBERS = (0.75, 0.0, 1.0, 0.25)

random.seed(11)
rng = np.random.default_rng(11)


# --- atlas --------------------------------------------------------------------------------------


def glb_image(path):
    """První obrázek vložený v GLB (atlas cest) – uloží ho do dočasného souboru."""
    data = open(path, "rb").read()
    length = struct.unpack("<I", data[12:16])[0]
    meta = json.loads(data[20 : 20 + length])
    bin_start = 20 + length + 8
    view = meta["bufferViews"][meta["images"][0]["bufferView"]]
    start = bin_start + view.get("byteOffset", 0)
    blob = data[start : start + view["byteLength"]]
    fd, name = tempfile.mkstemp(suffix=".jpg")
    os.write(fd, blob)
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


def value_noise(h, w, cells, seed):
    """Hladký šum 0–1 (bilineárně z mřížky náhodných hodnot, opakuje se)."""
    r = np.random.default_rng(seed).random((cells + 1, cells + 1)).astype(np.float32)
    r[-1, :] = r[0, :]
    r[:, -1] = r[:, 0]
    ys = np.linspace(0, cells, h, endpoint=False)
    xs = np.linspace(0, cells, w, endpoint=False)
    y0 = ys.astype(int)
    x0 = xs.astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    a = r[y0][:, x0]
    b = r[y0][:, x0 + 1]
    c = r[y0 + 1][:, x0]
    d = r[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def cracks(h, w, points, seed):
    """Síť prasklin (Voroného hrany, opakuje se): 0 na hraně buněk, 1 uprostřed."""
    r = np.random.default_rng(seed)
    pts = r.random((points, 2)).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    yy = yy[..., None] / h
    xx = xx[..., None] / w
    dy = np.abs(yy - pts[None, None, :, 0])
    dx = np.abs(xx - pts[None, None, :, 1])
    dy = np.minimum(dy, 1 - dy)
    dx = np.minimum(dx, 1 - dx)
    dist = np.sort(np.sqrt(dx * dx + dy * dy), axis=-1)
    edge = dist[..., 1] - dist[..., 0]
    return np.clip(edge / 0.06, 0, 1)


def build_atlas():
    road = load_pixels(glb_image(ROAD_GLB))
    rh, rw = road.shape[:2]
    px = np.zeros((ATLAS, ATLAS, 3), dtype=np.float32)
    half = ATLAS // 2
    quarter = ATLAS // 4
    # kůra (levá polovina atlasu cest) a čelo polen (vpravo dole v atlasu cest)
    bark = road[:, : rw // 2]
    px[:, :half] = resample(bark, half, ATLAS)
    endgrain = road[: rh // 2, rw // 2 :]
    px[:quarter, half : half + quarter] = resample(endgrain, quarter, quarter)
    # lněné plátno: světle šedobéžová, jemná vazba a skvrny
    lh = ATLAS - int(LINEN[1] * ATLAS)
    yy, xx = np.mgrid[0:lh, 0:half].astype(np.float32)
    weave = 0.5 + 0.25 * np.sin(xx * 1.9) * np.sin(yy * 1.7)
    blot = value_noise(lh, half, 6, 3)
    linen = np.array([0.82, 0.77, 0.66], np.float32) * (0.86 + 0.1 * weave[..., None])
    linen *= (0.9 + 0.12 * blot)[..., None]
    px[int(LINEN[1] * ATLAS) :, half:] = np.clip(linen, 0, 1)
    # provaz z lýka (šikmé prameny)
    r0, r1 = int(ROPE[1] * ATLAS), int(ROPE[3] * ATLAS)
    yy, xx = np.mgrid[0 : r1 - r0, 0:half].astype(np.float32)
    strand = 0.5 + 0.5 * np.sin((xx + yy * 1.2) * 2 * math.pi / 6.0)
    px[r0:r1, half:] = np.array([0.5, 0.4, 0.26], np.float32) * (0.7 + 0.4 * strand[..., None])
    # ohořelé dřevo: černé „aligátoří“ uhlí s prasklinami a místy popel
    c0, c1 = int(CHAR[1] * ATLAS), int(CHAR[3] * ATLAS)
    ch = c1 - c0
    crack = cracks(ch, half, 70, 5)
    coal = np.array([0.07, 0.065, 0.06], np.float32) * (0.6 + 0.6 * crack[..., None])
    grey = np.array([0.42, 0.4, 0.38], np.float32) * (0.85 + 0.2 * value_noise(ch, half, 24, 9))[..., None]
    mix = np.clip((value_noise(ch, half, 8, 7) - 0.62) / 0.2, 0, 1)[..., None]
    px[c0:c1, half:] = coal * (1 - mix) + grey * mix
    # popel s uhlím: šedobílý popel, černé kusy uhlí
    a0, a1 = int(ASH[1] * ATLAS), int(ASH[3] * ATLAS)
    ah = a1 - a0
    ash = np.array([0.5, 0.48, 0.45], np.float32) * (0.75 + 0.35 * value_noise(ah, half, 28, 19))[..., None]
    lumps = np.clip((value_noise(ah, half, 14, 21) - 0.5) / 0.12, 0, 1)[..., None]
    lumps *= (0.5 + 0.5 * cracks(ah, half, 90, 29))[..., None]
    px[a0:a1, half:] = ash * (1 - lumps) + np.array([0.06, 0.055, 0.05], np.float32) * lumps
    # žhavé uhlíky: černé, v prasklinách oranžová až žlutá záře (scéna ji kreslí aditivně)
    e = quarter
    glow = 1 - cracks(e, e, 40, 13)
    hot = value_noise(e, e, 5, 17)
    heat = np.clip(glow * (0.55 + 0.6 * hot), 0, 1)[..., None]
    ember = np.concatenate([heat * 1.0, heat * heat * 0.55, heat ** 4 * 0.18], axis=-1)
    px[:quarter, half + quarter :] = np.clip(ember, 0, 1)
    image = bpy.data.images.new("funeral-atlas", ATLAS, ATLAS)
    rgba = np.concatenate([px, np.ones((ATLAS, ATLAS, 1), np.float32)], axis=-1)
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


# --- tvary --------------------------------------------------------------------------------------


def in_region(region, u, v):
    u0, v0, u1, v1 = region
    return (u0 + (u1 - u0) * (u % 1.0 if u > 1 else u), v0 + (v1 - v0) * min(max(v, 0.0), 1.0))


def rod(bm, uv, start, end, radius, region=BARK, sides=8, caps=True, cap_region=ENDGRAIN):
    """Poleno (válec) ze `start` do `end` – plášť z kůry (nebo uhlí), čela s letokruhy."""
    a = np.array(start, np.float64)
    b = np.array(end, np.float64)
    axis = b - a
    length = float(np.linalg.norm(axis))
    d = axis / length
    helper = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
    n1 = np.cross(d, helper)
    n1 /= np.linalg.norm(n1)
    n2 = np.cross(d, n1)
    jitter = [radius * (1 + random.uniform(-0.1, 0.1)) for _ in range(sides)]
    ring_a, ring_b = [], []
    for k in range(sides + 1):
        t = 2 * math.pi * k / sides
        rr = jitter[k % sides]
        off = n1 * math.cos(t) * rr + n2 * math.sin(t) * rr
        ring_a.append(bm.verts.new(a + off))
        ring_b.append(bm.verts.new(b + off))
    v0 = random.random() * 0.6
    vlen = min(0.4, length / 2.6)
    for k in range(sides):
        face = bm.faces.new((ring_a[k], ring_a[k + 1], ring_b[k + 1], ring_b[k]))
        u0, u1 = k / sides, (k + 1) / sides
        for loop, (u, v) in zip(face.loops, [(u0, v0), (u1, v0), (u1, v0 + vlen), (u0, v0 + vlen)]):
            loop[uv].uv = in_region(region, u, v)
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
                    loop[uv].uv = in_region(cap_region, u, v)


def box(bm, uv, center, size, region):
    """Kvádr (příčka már) – všechny stěny z jedné oblasti atlasu."""
    cx, cy, cz = center
    sx, sy, sz = (s / 2 for s in size)
    corners = [
        bm.verts.new((cx + dx * sx, cy + dy * sy, cz + dz * sz))
        for dx in (-1, 1)
        for dy in (-1, 1)
        for dz in (-1, 1)
    ]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for f in faces:
        face = bm.faces.new([corners[i] for i in f])
        for loop, (u, v) in zip(face.loops, [(0, 0), (1, 0), (1, 0.15), (0, 0.15)]):
            loop[uv].uv = in_region(region, u, v)


def shroud(bm, uv, length, z0):
    """Zemřelý zabalený v plátně: protáhlý oválný tvar (hlava vpředu −Y), dole plochý."""
    rings, sides = 28, 14
    verts = []
    for i in range(rings + 1):
        t = i / rings
        y = -length / 2 + t * length
        # profil od hlavy (t = 0) k nohám: hlava, krk, ramena, boky, nohy, chodidla
        if t < 0.12:
            w = 0.1 * math.sqrt(max(0.0, 1 - ((t - 0.12) / 0.12) ** 2))
        elif t < 0.16:
            w = 0.085
        elif t < 0.3:
            w = 0.085 + (0.23 - 0.085) * (t - 0.16) / 0.14
        elif t < 0.6:
            w = 0.23 - 0.03 * (t - 0.3) / 0.3
        elif t < 0.95:
            w = 0.2 - 0.09 * (t - 0.6) / 0.35
        else:
            w = 0.11 * math.sqrt(max(0.0, 1 - ((t - 0.95) / 0.05) ** 2))
        hgt = w * (1.05 if t < 0.16 else 0.95)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            x = math.cos(a) * w
            z = math.sin(a) * hgt
            z = max(z, -hgt * 0.15)
            ring.append(bm.verts.new((x, y, z0 + hgt * 0.15 + z)))
        verts.append(ring)
    for i in range(rings):
        for k in range(sides):
            k1 = (k + 1) % sides
            face = bm.faces.new((verts[i][k], verts[i][k1], verts[i + 1][k1], verts[i + 1][k]))
            for loop, (u, v) in zip(
                face.loops,
                [(k / sides, i / rings), ((k + 1) / sides, i / rings), ((k + 1) / sides, (i + 1) / rings), (k / sides, (i + 1) / rings)],
            ):
                loop[uv].uv = in_region(LINEN, u, v)
    # převázání provazem (krk, prsa, kolena, kotníky)
    for t in (0.15, 0.36, 0.66, 0.9):
        y = -length / 2 + t * length
        i = int(t * rings)
        ring = verts[i]
        cw = max(abs(v.co.x) for v in ring) + 0.012
        ch = (max(v.co.z for v in ring) - min(v.co.z for v in ring)) / 2 + 0.012
        cz = (max(v.co.z for v in ring) + min(v.co.z for v in ring)) / 2
        band_a, band_b = [], []
        for k in range(sides + 1):
            a = 2 * math.pi * k / sides
            x = math.cos(a) * cw
            z = cz + math.sin(a) * ch
            band_a.append(bm.verts.new((x, y - 0.018, z)))
            band_b.append(bm.verts.new((x, y + 0.018, z)))
        for k in range(sides):
            face = bm.faces.new((band_a[k], band_a[k + 1], band_b[k + 1], band_b[k]))
            for loop, (u, v) in zip(face.loops, [(k / sides, 0), ((k + 1) / sides, 0), ((k + 1) / sides, 1), (k / sides, 1)]):
                loop[uv].uv = in_region(ROPE, u, v)


def build_bier(bm, uv):
    # dvě tyče podél Y (počátek = osa tyčí)
    for x in (-BIER_SPAN / 2, BIER_SPAN / 2):
        rod(bm, uv, (x, -BIER_LENGTH / 2, 0), (x, BIER_LENGTH / 2, 0), 0.038, sides=8)
    # příčky
    for k in range(5):
        y = -0.84 + k * 0.42
        box(bm, uv, (0, y, 0.045), (BIER_SPAN + 0.12, 0.09, 0.03), BARK)
    shroud(bm, uv, 1.72, 0.062)


def build_pyre(bm, uv):
    """Hranice z polen do kříže: vrstvy střídavě podélně (Y) a napříč (X), nahoře podélně."""
    radius = 0.075
    pitch = 0.155
    layers = int(round((PYRE_HEIGHT - radius) / pitch)) + 1
    for layer in range(layers):
        z = radius + layer * pitch
        lengthwise = (layers - 1 - layer) % 2 == 0
        if lengthwise:
            count = 6
            for k in range(count):
                x = -PYRE_WIDTH / 2 + radius + k * (PYRE_WIDTH - 2 * radius) / (count - 1)
                over = random.uniform(0.0, 0.12)
                rod(bm, uv, (x + random.uniform(-0.02, 0.02), -PYRE_LENGTH / 2 - over, z), (x, PYRE_LENGTH / 2 + random.uniform(0, 0.12), z), radius * random.uniform(0.85, 1.1))
        else:
            count = 9
            for k in range(count):
                y = -PYRE_LENGTH / 2 + radius + k * (PYRE_LENGTH - 2 * radius) / (count - 1)
                rod(bm, uv, (-PYRE_WIDTH / 2 - random.uniform(0, 0.1), y, z), (PYRE_WIDTH / 2 + random.uniform(0, 0.1), y + random.uniform(-0.03, 0.03), z), radius * random.uniform(0.85, 1.1))
    # roští a třísky pod hranicí (podpal)
    for _ in range(14):
        a = random.uniform(0, 2 * math.pi)
        r = random.uniform(0.2, 0.75)
        x, y = math.cos(a) * r * 0.7, math.sin(a) * r * 1.1
        b = a + random.uniform(-0.8, 0.8)
        lng = random.uniform(0.3, 0.6)
        rod(bm, uv, (x, y, 0.03), (x + math.cos(b) * lng, y + math.sin(b) * lng, 0.06), 0.022, sides=5, caps=False)


def heap(bm, uv, region, lift):
    """Kupa popela a uhlí (elipsa 2,4 × 1,6 m, výška 0,22 m) – mřížka s náhodnou výškou."""
    n = 18
    noise = value_noise(n + 1, n + 1, 4, 23)
    grid = []
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            u = i / n * 2 - 1
            v = j / n * 2 - 1
            d = math.sqrt(u * u + v * v)
            if d > 1:
                u, v = u / d, v / d
                d = 1.0
            hgt = 0.22 * (1 - d * d) ** 1.3 * (0.7 + 0.6 * float(noise[j, i])) + lift
            row.append(bm.verts.new((u * 0.8, v * 1.2, hgt)))
        grid.append(row)
    for j in range(n):
        for i in range(n):
            face = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (a, b) in zip(face.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                loop[uv].uv = in_region(region, a / n, b / n)


def build_remains(bm, uv):
    heap(bm, uv, ASH, 0.0)
    # ohořelé pahýly polen napůl v popelu
    for _ in range(9):
        a = random.uniform(0, 2 * math.pi)
        x = random.uniform(-0.45, 0.45)
        y = random.uniform(-0.8, 0.8)
        lng = random.uniform(0.35, 0.9)
        r = random.uniform(0.04, 0.07)
        dx, dy = math.cos(a) * lng / 2, math.sin(a) * lng / 2
        rod(bm, uv, (x - dx, y - dy, 0.1), (x + dx, y + dy, 0.13), r, region=CHAR, sides=6, cap_region=CHAR)


def build_embers(bm, uv):
    heap(bm, uv, EMBERS, 0.012)


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


# --- sprity ohně --------------------------------------------------------------------------------


def fire_sprites(path):
    """Čtyři sprity 128 × 128 vedle sebe: plamen, rozervaný plamen, jiskra, záře (RGBA)."""
    s = 128
    out = np.zeros((s, s * 4, 4), np.float32)
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    u = (xx + 0.5) / s * 2 - 1
    v = 1 - (yy + 0.5) / s * 2  # nahoru +1 (řádek 0 = nahoře v PNG)

    def flame(seed, ragged):
        # kapka: široká dole, špička nahoře; okraj zvlněný šumem
        h = (v + 1) / 2
        width = 0.62 * np.sqrt(np.clip(1 - h, 0, 1)) * np.clip(h * 4.0, 0, 1) ** 0.5
        n = value_noise(s, s, 6, seed) * 2 - 1
        edge = width * (1 + ragged * 0.35 * n) - np.abs(u + 0.08 * n * h)
        body = np.clip(edge / 0.18, 0, 1) * np.clip((0.98 - h) / 0.12, 0, 1)
        core = np.clip(edge / 0.4, 0, 1) * np.clip(1 - h * 1.3, 0, 1)
        r = np.clip(0.95 + 0.05 * core, 0, 1)
        g = np.clip(0.38 + 0.5 * core, 0, 1)
        b = np.clip(0.06 + 0.42 * core ** 2, 0, 1)
        a = np.clip(body * (0.7 + 0.3 * core), 0, 1)
        return np.stack([r, g, b, a], axis=-1)

    out[:, 0:s] = flame(31, 0.4)
    out[:, s : 2 * s] = flame(37, 1.0)
    d = np.sqrt(u * u + v * v)
    spark = np.clip(1 - d / 0.22, 0, 1) ** 2 + 0.35 * np.clip(1 - d / 0.6, 0, 1) ** 3
    out[:, 2 * s : 3 * s] = np.stack(
        [np.ones_like(d), 0.75 + 0.2 * np.clip(1 - d / 0.2, 0, 1), 0.4 * np.clip(1 - d / 0.15, 0, 1), np.clip(spark, 0, 1)],
        axis=-1,
    )
    glow = np.clip(1 - d, 0, 1) ** 2.2
    out[:, 3 * s : 4 * s] = np.stack([np.ones_like(d), 0.55 * np.ones_like(d), 0.18 * np.ones_like(d), glow], axis=-1)
    image = bpy.data.images.new("fire", s * 4, s, alpha=True)
    image.pixels.foreach_set(out[::-1].reshape(-1))
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()


def render_preview(objs):
    os.makedirs(RENDER_DIR, exist_ok=True)
    for k, obj in enumerate(objs[:3]):
        obj.location.x = k * 3.4
    objs[0].location.z = 0.6
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (3.4, -9, 5.5)
    target = bpy.data.objects.new("target", None)
    bpy.context.scene.collection.objects.link(target)
    target.location = (3.4, 0, 0.4)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    bpy.context.scene.camera = cam
    bpy.context.scene.render.resolution_x = 1400
    bpy.context.scene.render.resolution_y = 600
    bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
    bpy.context.scene.display.shading.color_type = "TEXTURE"
    bpy.context.scene.render.filepath = os.path.join(RENDER_DIR, "funeral.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PARTICLES_DIR, exist_ok=True)
    atlas = build_atlas()
    material = make_material("funeral-atlas", atlas)
    embers = make_material("funeral-embers", atlas)
    objs = [
        new_object("bier", build_bier, material),
        new_object("pyre", build_pyre, material),
        new_object("remains", build_remains, material),
        new_object("embers", build_embers, embers),
    ]
    export(objs, os.path.join(OUT_DIR, "funeral.glb"))
    fire_sprites(os.path.join(PARTICLES_DIR, "fire.png"))
    if RENDER_DIR != "-":
        render_preview(objs)


main()
