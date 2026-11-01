"""Lidé z 0 A.D. (skinované COLLADA + propy) -> GLB s kostrou a animacemi pro scénu.

blender -b --factory-startup --python tools/blender/people_from_0ad.py -- \
    tools/blender/people.json <0ad>/binaries/data/mods/public/art apps/web/public/models/people

people.json: [{"name", "height_m" | "length_m", "body": {"dae", "texture", "tint", "pattern"?,
"flatten"?, "multiply"?, "coat"?}, "props": [{"name", "dae" | "procedural" (sickle | rod | yoke | bowl | stick | shovel | rattle | stump), "point", "texture",
"tint"?, "uv"?, "scale"? (měřítko kolem bodu, výchozí 1), "rotate_deg"? ([x, y, z] natočení v osách bodu),
"offset_m"? ([x, y, z] posun v osách bodu, v metrech)}], "clips": [{"name", "animation", "props": [jména propů viditelných v klipu],
"pose"?, "report"?, "report_tip"?}]}]

Totéž umí i zvířata s kostrou (voli spřežení – tools/blender/plough-team.json): bez propů,
měřítko podle délky těla („length_m“ – rozsah podél osy pohledu), „multiply“ přebarví texturu
(béžový dobytek 0 A.D. na hnědého), „coat“ = maska R přes celou srst kromě obdélníků
[x0, y0, x1, y1] (podíl obrázku, y shora – rohy), scéna pak srst barví na instanci.
„pose“ upraví klip na místě (z chůze se odvodí chůze za rádlem): „lean“ = [{"bone", "deg"}]
předklon podstromu kosti kolem její osy napříč tělem (kladný úhel = dopředu), „reach“ =
{"L"/"R": [stranou vlevo, vpřed, výška] v metrech od paty postavy} – ruce se dvoukloubovou IK
(rameno – loket – zápěstí, loket ven a dozadu) v každém snímku natáhnou k pevnému bodu
(rukojeti rádla), nohy dál kráčí. „report“ = jména uzlů, jejichž polohu v klipu (m, souřadnice
scény: x vlevo postavy, y nahoru, z dopředu) skript vypíše – podle nich sedí rádlo a jho
k rukám a šíjím (apps/web/lib/scene/plough-team.ts). U každého klipu „walk“ / „walk-…“ vypíše
i rychlost chůze při přehrání rychlostí 1 (podle chodidla na zemi). „report_tip“ = {"prop",
"tip" ([x, y, z] bod v osách propu před „rotate_deg“), "aim"? ([vpřed, vzhůru, vpravo])} vypíše
v prvním snímku klipu držadlo a špičku propu (m, vpřed / vzhůru / vpravo od paty postavy – prut
a vlasec, apps/web/lib/scene/fishing-lines.ts) a s „aim“ i „rotate_deg“, který by prop natočil
podél „aim“.

Klip bez animace 0 A.D. („keys“ místo „animation“ – dojení, předení, sezení…): vlastní smyčka
z klíčových póz nad jedním snímkem klipu 0 A.D. (keyed_frames – posun pánve, natočení kostí, ruce
a nohy dvoukloubovou IK; rozměry pro postavu 1,6 m). Prop, jehož „point“ v kostře není (sedátko
„seat“), je volný – stojí v počátku postavy (špalek pod sedící postavou).

Na rozdíl od fauna_from_0ad.py se kostra i animace převádějí: GLB má skin (48 kostí bipeda
0 A.D. + body propů jako další klouby) a každá animace 0 A.D. je jedna animace glTF (klíče
24 snímků/s jako v 0 A.D.). Propy (hlava, srp, nůše) jsou pevně přivázané ke svému bodu
(váha 1) – prop, který v klipu není, má v klipu měřítko 0. Všechny části sdílejí jeden atlas
textur, takže postava je jeden mesh s jedním materiálem (ve scéně jeden draw call pro všechny
postavy jednoho druhu – apps/web/lib/scene/villagers.ts).
Barvy: plochy pro barvu hráče (alfa < 1) dostanou barvu „tint“ (průměr plochy) a „pattern“
ztlumí kostkovaný vzor keltských šatů (1 = beze změny, 0 = jednolitá barva).
Maska částí (druhá textura atlasu, v glTF jako occlusionTexture): R = látka oděvu (plochy barvy
hráče a „flatten“ těla), G = vlasy (plochy barvy hráče hlavy) – scéna podle ní barví oděv
a vlasy (šátek, šediny) na instanci. Zvláštní textura místo atributu vrcholů: WebGPU dovoluje
jen 8 vertex bufferů a postava s kostrou, VAT a barvou instance jich má právě 8.
Rotace klíčů jsou normalizované int16 (glTF 2.0 to dovoluje) – poloviční velikost animací.

GLB se zapisuje ručně (struct + json) – Blender 5 COLLADA neumí a stavět z matic kostí
armaturu jen kvůli exportu by bylo křehčí. Blender je tu jen kvůli texturám (DDS, atlas, JPEG).
Parser COLLADA je zkrácená kopie z fauna_from_0ad.py.
"""
import json
import math
import os
import struct
import sys
import tempfile
import xml.etree.ElementTree as ET

import bpy
import numpy as np
from mathutils import Matrix, Vector

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
ATLAS_W = 512


def floats(el):
    return [float(v) for v in el.text.split()]


def ints(el):
    return [int(v) for v in el.text.split()]


def source_data(root, source_id):
    src = root.find(f".//c:source[@id='{source_id}']", NS)
    arr = floats(src.find("c:float_array", NS))
    stride = int(src.find(".//c:accessor", NS).get("stride", "1"))
    return [arr[i : i + stride] for i in range(0, len(arr), stride)]


def matrix16(v):
    return Matrix([v[0:4], v[4:8], v[8:12], v[12:16]])


def node_matrix(node):
    m = Matrix.Identity(4)
    for child in node:
        tag = child.tag.split("}")[1]
        vals = floats(child) if child.text else []
        if tag == "matrix":
            m = m @ matrix16(vals)
        elif tag == "translate":
            m = m @ Matrix.Translation(Vector(vals))
        elif tag == "rotate":
            m = m @ Matrix.Rotation(math.radians(vals[3]), 4, Vector(vals[:3]))
        elif tag == "scale":
            m = m @ Matrix.Diagonal(Vector(vals + [1.0]))
    return m


def up_fix(root):
    up = root.findtext(".//c:asset/c:up_axis", default="Z_UP", namespaces=NS).strip()
    return Matrix.Rotation(math.radians(90), 4, "X") if up == "Y_UP" else Matrix.Identity(4)


def scene_nodes(root):
    """Světové matice uzlů scény (podle sid / jména) a rodič každého uzlu."""
    worlds, parents = {}, {}
    fix = up_fix(root)

    def walk(node, parent_world, parent_key):
        key = node.get("sid") or node.get("name") or node.get("id")
        world = parent_world @ node_matrix(node)
        worlds[key] = world
        parents[key] = parent_key
        for child in node.findall("c:node", NS):
            walk(child, world, key)

    for node in root.findall(".//c:visual_scene/c:node", NS):
        walk(node, fix, None)
    return worlds, parents


def triangles(root, geom_id):
    """Trojúhelníky jako trojice rohů (index pozice, normály, uv) + zdrojová data."""
    geom = root.find(f".//c:geometry[@id='{geom_id}']", NS)
    mesh_el = geom.find("c:mesh", NS)
    pos_src = mesh_el.find("c:vertices/c:input[@semantic='POSITION']", NS).get("source")[1:]
    positions = [Vector(v[:3]) for v in source_data(root, pos_src)]
    normals, uvs, tris = [], [], []
    prims = (
        mesh_el.findall("c:triangles", NS)
        + mesh_el.findall("c:polylist", NS)
        + mesh_el.findall("c:polygons", NS)
    )
    for prim in prims:
        inputs = prim.findall("c:input", NS)
        stride = max(int(i.get("offset")) for i in inputs) + 1
        by_sem = {i.get("semantic"): i for i in inputs}
        v_off = int(by_sem["VERTEX"].get("offset"))
        n_in, t_in = by_sem.get("NORMAL"), by_sem.get("TEXCOORD")
        n_base, t_base = len(normals), len(uvs)
        if n_in is not None:
            normals += [Vector(n[:3]) for n in source_data(root, n_in.get("source")[1:])]
        if t_in is not None:
            uvs += [t[:2] for t in source_data(root, t_in.get("source")[1:])]
        if prim.tag.endswith("polygons"):
            # <polygons>: každý <p> je jeden mnohoúhelník (meče, luky, štíty z 0 A.D.)
            polys = [ints(el) for el in prim.findall("c:p", NS)]
            p = [i for poly in polys for i in poly]
            counts = [len(poly) // stride for poly in polys]
        else:
            p = ints(prim.find("c:p", NS))
            vcount_el = prim.find("c:vcount", NS)
            counts = ints(vcount_el) if vcount_el is not None else [3] * (len(p) // (stride * 3))
        k = 0
        for count in counts:
            corners = []
            for c in range(count):
                idx = p[k + c * stride : k + (c + 1) * stride]
                corners.append(
                    (
                        idx[v_off],
                        n_base + idx[int(n_in.get("offset"))] if n_in is not None else -1,
                        t_base + idx[int(t_in.get("offset"))] if t_in is not None else -1,
                    )
                )
            k += count * stride
            for c in range(1, count - 1):
                tris.append((corners[0], corners[c], corners[c + 1]))
    return positions, normals, uvs, tris


def load_body(path):
    root = ET.parse(path).getroot()
    inst = root.find(".//c:visual_scene//c:instance_controller", NS)
    ctrl = root.find(f".//c:controller[@id='{inst.get('url')[1:]}']", NS)
    skin = ctrl.find("c:skin", NS)
    bsm_el = skin.find("c:bind_shape_matrix", NS)
    bsm = matrix16(floats(bsm_el)) if bsm_el is not None else Matrix.Identity(4)
    joints_el = skin.find("c:joints", NS)
    by_sem = {i.get("semantic"): i.get("source")[1:] for i in joints_el.findall("c:input", NS)}
    names = root.find(f".//c:source[@id='{by_sem['JOINT']}']/c:Name_array", NS).text.split()
    inv_bind = [matrix16(m) for m in source_data(root, by_sem["INV_BIND_MATRIX"])]
    vw = skin.find("c:vertex_weights", NS)
    inputs = vw.findall("c:input", NS)
    stride = max(int(i.get("offset")) for i in inputs) + 1
    j_off = int(next(i for i in inputs if i.get("semantic") == "JOINT").get("offset"))
    w_in = next(i for i in inputs if i.get("semantic") == "WEIGHT")
    w_off = int(w_in.get("offset"))
    weights = [w[0] for w in source_data(root, w_in.get("source")[1:])]
    counts = ints(vw.find("c:vcount", NS))
    v = ints(vw.find("c:v", NS))
    influences = []
    k = 0
    for count in counts:
        pairs = []
        for _ in range(count):
            pairs.append((v[k + j_off], weights[v[k + w_off]]))
            k += stride
        pairs.sort(key=lambda p: -p[1])
        pairs = pairs[:4]
        total = sum(w for _, w in pairs) or 1.0
        influences.append([(j, w / total) for j, w in pairs])
    positions, normals, uvs, tris = triangles(root, skin.get("source")[1:])
    worlds, parents = scene_nodes(root)
    return {
        "bsm": up_fix(root) @ bsm,
        "names": names,
        "inv_bind": [ib @ up_fix(root).inverted() for ib in inv_bind],
        "influences": influences,
        "positions": positions,
        "normals": normals,
        "uvs": uvs,
        "tris": tris,
        "worlds": worlds,
        "parents": parents,
    }


def load_static(path):
    root = ET.parse(path).getroot()
    node = None
    for n in root.findall(".//c:visual_scene//c:node", NS):
        if n.find("c:instance_geometry", NS) is not None:
            node = n
            break
    worlds, _ = scene_nodes(root)
    key = node.get("sid") or node.get("name") or node.get("id")
    gid = node.find("c:instance_geometry", NS).get("url")[1:]
    positions, normals, uvs, tris = triangles(root, gid)
    return {"matrix": worlds[key], "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def procedural_sickle(uv_blade, uv_handle):
    """Srp (0 A.D. ho nemá): rukojeť podél osy z bodu propu (jako motyka) a čepel do oblouku."""
    positions, normals, uvs, tris = [], [], [], []

    def quad(a, b, c, d, n, uv_rect):
        base = len(positions)
        positions.extend([Vector(a), Vector(b), Vector(c), Vector(d)])
        normals.extend([Vector(n)] * 4)
        u0, v0, u1, v1 = uv_rect
        uvs.extend([[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))

    # Rukojeť: hranol 0,06 × 0,06, z = −0,30 … 0,20 (jednotky 0 A.D., postava ≈ 3,9).
    h, z0, z1 = 0.035, -0.30, 0.20
    for nx, ny in ((1, 0), (0, 1), (-1, 0), (0, -1)):
        tx, ty = -ny, nx
        a = (nx * h + tx * h, ny * h + ty * h, z0)
        b = (nx * h - tx * h, ny * h - ty * h, z0)
        quad(a, b, (b[0], b[1], z1), (a[0], a[1], z1), (nx, ny, 0), uv_handle)
    # Čepel: oblouk v rovině x–z od konce rukojeti (srp „C“), z obou stran.
    cx, cz, radius = 0.32, 0.20, 0.32
    segments = 9
    prev = None
    for s in range(segments + 1):
        t = math.pi - s / segments * math.pi * 1.15
        width = 0.07 * (1 - s / (segments + 2))
        inner = (cx + math.cos(t) * radius, 0.0, cz + math.sin(t) * radius)
        outer = (
            cx + math.cos(t) * (radius + width),
            0.0,
            cz + math.sin(t) * (radius + width),
        )
        if prev:
            quad(prev[0], inner, outer, prev[1], (0, -1, 0), uv_blade)
            quad(prev[1], outer, inner, prev[0], (0, 1, 0), uv_blade)
        prev = (inner, outer)
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def procedural_rod(uv_wood):
    """Prut (CC0, procedurálně): kuželovitý šestiboký válec podél osy z bodu propu, od držadla
    za rukou (z = −0,6) po špičku ≈ 3 m od ruky (z = 6,0; postava ≈ 3,9 jednotky = 1,75 m).
    Vlasec se kreslí až ve scéně."""
    positions, normals, uvs, tris = [], [], [], []
    sides, z0, z1, r0, r1 = 6, -0.6, 6.0, 0.05, 0.012
    u0, v0, u1, v1 = uv_wood
    for k in range(sides):
        a0, a1 = 2 * math.pi * k / sides, 2 * math.pi * (k + 1) / sides
        am = (a0 + a1) / 2
        n = Vector((math.cos(am), math.sin(am), 0.0))
        base = len(positions)
        positions.extend(
            [
                Vector((math.cos(a0) * r0, math.sin(a0) * r0, z0)),
                Vector((math.cos(a1) * r0, math.sin(a1) * r0, z0)),
                Vector((math.cos(a1) * r1, math.sin(a1) * r1, z1)),
                Vector((math.cos(a0) * r1, math.sin(a0) * r1, z1)),
            ]
        )
        normals.extend([n] * 4)
        uvs.extend([[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def procedural_yoke(uv_wood, uv_band, uv_rope):
    """Vahadlo se dvěma vědry (provaz pro vodu – docs/design/villagers.md, Provoz na cestách;
    0 A.D. ho nemá): prohnutá tyč přes ramena za krkem, z konců provazy a na nich dřevěná vědra
    s obručí a uchem. Souřadnice bodu prop-back (jednotky 0 A.D., postava ≈ 3,9; x napříč, y
    dozadu, z nahoru – bod leží za lopatkami ve výšce ≈ 3,08), ruce drží provazy nad vědry
    (klip carry-water – „reach“ v people.json)."""
    positions, normals, uvs, tris = [], [], [], []

    def tri_quad(a, b, c, d, na, nb, nc, nd, uv_rect, u0=0.0, u1=1.0, v0=0.0, v1=1.0):
        base = len(positions)
        positions.extend([Vector(a), Vector(b), Vector(c), Vector(d)])
        normals.extend([Vector(na), Vector(nb), Vector(nc), Vector(nd)])
        x0, y0, x1, y1 = uv_rect
        lerp = lambda t, lo, hi: lo + (hi - lo) * t  # noqa: E731
        uvs.extend(
            [
                [lerp(u0, x0, x1), lerp(v0, y0, y1)],
                [lerp(u1, x0, x1), lerp(v0, y0, y1)],
                [lerp(u1, x0, x1), lerp(v1, y0, y1)],
                [lerp(u0, x0, x1), lerp(v1, y0, y1)],
            ]
        )
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))

    def tube(path, radius, sides, uv_rect):
        """Trubka po lomené čáře (kolmý řez – osa z, jinak x) bez čel."""
        path = [Vector(q) for q in path]
        for k in range(len(path) - 1):
            a, b = path[k], path[k + 1]
            t = (b - a).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n1 = t.cross(ref).normalized()
            n2 = t.cross(n1).normalized()
            for j in range(sides):
                a0 = 2 * math.pi * j / sides
                a1 = 2 * math.pi * (j + 1) / sides
                d0 = n1 * math.cos(a0) + n2 * math.sin(a0)
                d1 = n1 * math.cos(a1) + n2 * math.sin(a1)
                tri_quad(a + d0 * radius, a + d1 * radius, b + d1 * radius, b + d0 * radius, d0, d1, d1, d0, uv_rect, j / sides, (j + 1) / sides, k / len(path), (k + 1) / len(path))

    def bucket(cx, cy, top, bottom, r_top, r_bottom, sides=8):
        """Vědro – komolý kužel z dužin, dno a obruč pod okrajem (zvenku i zevnitř)."""
        h = top - bottom
        slope = (r_top - r_bottom) / h
        for j in range(sides):
            a0 = 2 * math.pi * j / sides
            a1 = 2 * math.pi * (j + 1) / sides
            c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
            n0 = Vector((c0, s0, -slope)).normalized()
            n1 = Vector((c1, s1, -slope)).normalized()
            lo0 = (cx + c0 * r_bottom, cy + s0 * r_bottom, bottom)
            lo1 = (cx + c1 * r_bottom, cy + s1 * r_bottom, bottom)
            hi0 = (cx + c0 * r_top, cy + s0 * r_top, top)
            hi1 = (cx + c1 * r_top, cy + s1 * r_top, top)
            tri_quad(lo0, lo1, hi1, hi0, n0, n1, n1, n0, uv_wood, j / sides, (j + 1) / sides, 0.0, 1.0)
            # vnitřek (voda ani dno uvnitř nejsou vidět – tmavší dřevo stačí)
            tri_quad(hi0, hi1, lo1, lo0, -n0, -n1, -n1, -n0, uv_wood, j / sides, (j + 1) / sides, 0.0, 0.3)
            # dno
            base = len(positions)
            positions.extend([Vector((cx, cy, bottom)), Vector(lo1), Vector(lo0)])
            normals.extend([Vector((0, 0, -1))] * 3)
            x0, y0, x1, y1 = uv_wood
            uvs.extend([[(x0 + x1) / 2, (y0 + y1) / 2], [x0, y0], [x1, y0]])
            i = len(normals) - 3
            tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
            # obruč kousek pod okrajem
            band_hi, band_lo = top - h * 0.12, top - h * 0.24
            rb_hi = r_bottom + (band_hi - bottom) * slope + 0.025
            rb_lo = r_bottom + (band_lo - bottom) * slope + 0.025
            tri_quad(
                (cx + c0 * rb_lo, cy + s0 * rb_lo, band_lo),
                (cx + c1 * rb_lo, cy + s1 * rb_lo, band_lo),
                (cx + c1 * rb_hi, cy + s1 * rb_hi, band_hi),
                (cx + c0 * rb_hi, cy + s0 * rb_hi, band_hi),
                n0, n1, n1, n0, uv_band,
            )

    y = -0.15  # za krkem (bod prop-back je za lopatkami)
    bar_z, half, drop = 0.30, 1.3, 0.1
    bar = [(x, y, bar_z - drop * (x / half) ** 2) for x in [half * (k / 3 - 1) for k in range(7)]]
    tube(bar, 0.055, 6, uv_wood)
    top, bottom, r_top, r_bottom = -1.2, -1.9, 0.36, 0.3
    for side in (-1, 1):
        x = side * (half - 0.08)
        end_z = bar_z - drop * ((half - 0.08) / half) ** 2
        bail = top + 0.16
        # provaz z konce tyče k uchu vědra
        tube([(x, y, end_z), (x, y, bail)], 0.018, 4, uv_rope)
        # ucho přes vědro (oblouk napříč)
        arc = [(x + math.cos(math.pi * k / 4) * (r_top + 0.02), y, top + math.sin(math.pi * k / 4) * 0.16) for k in range(5)]
        tube(arc, 0.014, 4, uv_rope)
        bucket(x, y, top, bottom, r_top, r_bottom)
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def procedural_bowl(uv_wood, uv_liquid):
    """Miska na krev pro jelita (porážka ve scéně – docs/design/diet.md – Porážka ve scéně; 0 A.D. ji nemá):
    mělká komolá miska otevřená nahoru (osa z bodu propu, dno v bodě), uvnitř tmavá hladina.
    Bod propu „weapon_L“ má svislici v ose Y, proto je miska v people.json natočená o −90° kolem X."""
    positions, normals, uvs, tris = [], [], [], []

    def quad(a, b, c, d, na, nb, nc, nd, uv_rect, u0, u1, v0, v1):
        base = len(positions)
        positions.extend([Vector(a), Vector(b), Vector(c), Vector(d)])
        normals.extend([Vector(na), Vector(nb), Vector(nc), Vector(nd)])
        x0, y0, x1, y1 = uv_rect
        uvs.extend([[x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v0], [x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v0], [x0 + (x1 - x0) * u1, y0 + (y1 - y0) * v1], [x0 + (x1 - x0) * u0, y0 + (y1 - y0) * v1]])
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))

    sides, r_top, r_bottom, top, bottom = 10, 0.30, 0.17, 0.17, 0.0
    slope = (r_top - r_bottom) / (top - bottom)
    level = top - 0.05  # hladina kousek pod okrajem
    r_level = r_bottom + (level - bottom) * slope
    for j in range(sides):
        a0, a1 = 2 * math.pi * j / sides, 2 * math.pi * (j + 1) / sides
        c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
        n0 = Vector((c0, s0, -slope)).normalized()
        n1 = Vector((c1, s1, -slope)).normalized()
        lo0, lo1 = (c0 * r_bottom, s0 * r_bottom, bottom), (c1 * r_bottom, s1 * r_bottom, bottom)
        hi0, hi1 = (c0 * r_top, s0 * r_top, top), (c1 * r_top, s1 * r_top, top)
        quad(lo0, lo1, hi1, hi0, n0, n1, n1, n0, uv_wood, j / sides, (j + 1) / sides, 0.0, 1.0)
        quad(hi0, hi1, lo1, lo0, -n0, -n1, -n1, -n0, uv_wood, j / sides, (j + 1) / sides, 0.0, 0.5)
        # hladina: trojúhelník od středu
        base = len(positions)
        positions.extend([Vector((0, 0, level)), Vector((c1 * r_level, s1 * r_level, level)), Vector((c0 * r_level, s0 * r_level, level))])
        normals.extend([Vector((0, 0, 1))] * 3)
        x0, y0, x1, y1 = uv_liquid
        uvs.extend([[(x0 + x1) / 2, (y0 + y1) / 2], [x0, y0], [x1, y0]])
        i = len(normals) - 3
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def _tapered_rod(out, sides, z0, z1, r0, r1, uv_wood):
    """Kuželovitý mnohoboký válec podél osy z (do `out` – positions, normals, uvs, tris)."""
    positions, normals, uvs, tris = out
    u0, v0, u1, v1 = uv_wood
    for k in range(sides):
        a0, a1 = 2 * math.pi * k / sides, 2 * math.pi * (k + 1) / sides
        am = (a0 + a1) / 2
        n = Vector((math.cos(am), math.sin(am), 0.0))
        base = len(positions)
        positions.extend(
            [
                Vector((math.cos(a0) * r0, math.sin(a0) * r0, z0)),
                Vector((math.cos(a1) * r0, math.sin(a1) * r0, z0)),
                Vector((math.cos(a1) * r1, math.sin(a1) * r1, z1)),
                Vector((math.cos(a0) * r1, math.sin(a0) * r1, z1)),
            ]
        )
        normals.extend([n] * 4)
        uvs.extend([[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))


def procedural_stick(uv_wood):
    """Mlatcí hůl (production-chains.md – Humno: mlátí se holemi, cepy až později – Martin
    21. 10. 2026; CC0, procedurálně): rovná šestiboká hůl ≈ 1,2 m podél osy z bodu propu, drží se
    u konce (z = −0,25 … 2,45; postava ≈ 3,9 jednotky = 1,75 m), k úderovému konci mírně silnější."""
    out = ([], [], [], [])
    _tapered_rod(out, 6, -0.25, 2.45, 0.045, 0.06, uv_wood)
    positions, normals, uvs, tris = out
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def procedural_shovel(uv_wood):
    """Dřevěná lopata na prohazování zrna proti větru (production-chains.md – Humno; CC0,
    procedurálně): násada podél osy z bodu propu (z = −0,25 … 1,9) a plochý list z jednoho kusu
    dřeva (z = 1,9 … 2,75, šířka 0,5, tloušťka 0,05 jednotky – ≈ 38 × 22 cm)."""
    out = ([], [], [], [])
    _tapered_rod(out, 6, -0.25, 1.95, 0.045, 0.04, uv_wood)
    positions, normals, uvs, tris = out
    u0, v0, u1, v1 = uv_wood
    hx, hy, z0, z1 = 0.25, 0.025, 1.9, 2.75

    def quad(a, b, c, d, n):
        base = len(positions)
        positions.extend([Vector(a), Vector(b), Vector(c), Vector(d)])
        normals.extend([Vector(n)] * 4)
        uvs.extend([[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))

    # list: kvádr se zúženým krčkem u násady (spodní hrana užší)
    nx0 = 0.12
    quad((-nx0, -hy, z0), (nx0, -hy, z0), (hx, -hy, z1), (-hx, -hy, z1), (0, -1, 0))
    quad((nx0, hy, z0), (-nx0, hy, z0), (-hx, hy, z1), (hx, hy, z1), (0, 1, 0))
    quad((hx, -hy, z1), (hx, hy, z1), (-hx, hy, z1), (-hx, -hy, z1), (0, 0, 1))
    quad((-nx0, hy, z0), (-nx0, -hy, z0), (-hx, -hy, z1), (-hx, hy, z1), (-1, 0, 0))
    quad((nx0, -hy, z0), (nx0, hy, z0), (hx, hy, z1), (hx, -hy, z1), (1, 0, 0))
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def _box(out, x0, x1, y0, y1, z0, z1, uv_rect):
    """Kvádr (do `out` – positions, normals, uvs, tris), každá stěna celý obdélník `uv_rect`."""
    positions, normals, uvs, tris = out
    u0, v0, u1, v1 = uv_rect
    faces = [
        ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (0, -1, 0)),
        ((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (0, 1, 0)),
        ((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (-1, 0, 0)),
        ((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (1, 0, 0)),
        ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (0, 0, 1)),
        ((x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0), (0, 0, -1)),
    ]
    for a, b, c, d, n in faces:
        base = len(positions)
        positions.extend([Vector(a), Vector(b), Vector(c), Vector(d)])
        normals.extend([Vector(n)] * 4)
        uvs.extend([[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
        i = len(normals) - 4
        tris.append(((base, i, base), (base + 1, i + 1, base + 1), (base + 2, i + 2, base + 2)))
        tris.append(((base, i, base), (base + 2, i + 2, base + 2), (base + 3, i + 3, base + 3)))


def procedural_rattle(uv_wood):
    """Dřevěná řehtačka hlídacích dětí (wildlife.md – Ve scéně; CC0, procedurálně): držadlo podél
    osy z bodu propu (z = −0,2 … 0,85), na něm ozubené kolečko (silnější váleček) a rámeček
    s jazýčkem, který se točí kolem držadla (kvádr stranou, ≈ 30 × 13 × 6 cm; postava ≈ 3,9
    jednotky = 1,75 m)."""
    out = ([], [], [], [])
    _tapered_rod(out, 6, -0.2, 0.85, 0.045, 0.04, uv_wood)
    _tapered_rod(out, 8, 0.45, 0.6, 0.11, 0.11, uv_wood)
    _box(out, 0.04, 0.7, -0.065, 0.065, 0.5, 0.8, uv_wood)
    positions, normals, uvs, tris = out
    return {"matrix": Matrix.Identity(4), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


def procedural_stump(uv_wood):
    """Špalek k sezení (sedátko klíčových klipů – sezení starších, hrnčířský kruh; CC0,
    procedurálně): osmiboký kmínek v prostoru postavy (volný prop – bod „seat“ v počátku
    postavy), střed 0,3 m za patou, výška 0,42 m, poloměr 0,16 m (postava 1,6 m ≈ 3,55 jednotky)."""
    out = ([], [], [], [])
    u = 3.55 / 1.6
    _tapered_rod(out, 8, 0.0, 0.42 * u, 0.17 * u, 0.15 * u, uv_wood)
    # víko: plochý kvádr navrch
    _box(out, -0.11 * u, 0.11 * u, -0.11 * u, 0.11 * u, 0.4 * u, 0.42 * u, uv_wood)
    positions, normals, uvs, tris = out
    return {"matrix": Matrix.Translation((0.0, 0.3 * u, 0.0)), "positions": positions, "normals": normals, "uvs": uvs, "tris": tris}


PROCEDURAL = {
    "stump": lambda r: procedural_stump(r["wood"]),
    "sickle": lambda r: procedural_sickle(r["blade"], r["handle"]),
    "rod": lambda r: procedural_rod(r["wood"]),
    "yoke": lambda r: procedural_yoke(r["wood"], r["band"], r["rope"]),
    "bowl": lambda r: procedural_bowl(r["wood"], r["liquid"]),
    "stick": lambda r: procedural_stick(r["wood"]),
    "shovel": lambda r: procedural_shovel(r["wood"]),
    "rattle": lambda r: procedural_rattle(r["wood"]),
}


# --- Atlas -----------------------------------------------------------------------------------


def load_pixels(path, w, h):
    im = bpy.data.images.load(path)
    if tuple(im.size) != (w, h):
        im.scale(w, h)
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)


def box_blur(img, r):
    """Rozmazání čtvercem (2r + 1) – oddělitelně přes kumulativní součty, okraje opakované."""
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(img, pad, mode="edge"), axis=axis)
        n = img.shape[axis]
        img = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return img


def multiplied(px, multiply):
    """Přebarvení textury násobením (béžový dobytek na hnědého) – alfa zůstane."""
    if not multiply:
        return px
    out = px.copy()
    out[..., :3] *= np.array(multiply, np.float32)
    return out


def tinted(px, tint, pattern, flatten=None):
    """Plochy pro barvu hráče (alfa < 1) v barvě `tint` (průměr plochy), vzor ztlumený na
    `pattern` (0 A.D. barvu hráče násobí – šedý kostkovaný vzor by po vynásobení zůstal tmavý).
    `flatten`: obdélníky [x0, y0, x1, y1] (podíl obrázku, y shora), ve kterých se kostkovaný vzor
    látky (barva hráče i světlé nebarvené pruhy) nahradí jednolitou nebarvenou látkou – zůstane
    jen jemná struktura tkaniny; sytější barvy (opasek, váček, kůže) zůstanou."""
    rgb, a = px[..., :3].copy(), px[..., 3:4]
    if tint is None:
        return rgb
    h, w = a.shape[:2]
    lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    mask = a[..., 0] < 0.99
    if flatten:
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        region = np.zeros((h, w), bool)
        for x0, y0, x1, y1 in flatten:
            # obrázek Blenderu má řádky odspodu
            region[round((1 - y1) * h) : round((1 - y0) * h), round(x0 * w) : round(x1 * w)] = True
        cloth = region & (mask | (sat < 0.2))
        detail = lum - box_blur(lum, 1)
        out = rgb * a + np.array(tint, np.float32) * (1 - a)
        weave = np.array(tint, np.float32) * (1 + detail[..., None] * 0.8)
        out[cloth] = weave[cloth]
        return out
    mean = float(lum[mask].mean()) if mask.any() else 1.0
    contrast = 1.0 if pattern is None else pattern
    shade = 1 + (lum / max(mean, 1e-3) - 1) * contrast
    colored = np.array(tint, np.float32) * shade[..., None]
    return colored * (1 - a) + rgb * a


def part_masks(px, part):
    """Maska látky a vlasů části v rozlišení slotu (řádky odspodu jako obrázek Blenderu): tělo –
    plochy barvy hráče a oblasti „flatten“ s látkou, hlava – plochy barvy hráče (vlasy)."""
    rgb, a = px[..., :3], px[..., 3]
    h, w = a.shape
    player = (a < 0.99).astype(np.float32)
    zero = np.zeros((h, w), np.float32)
    if part["kind"] == "body" and "coat" in part:
        # zvíře: celá srst kromě vynechaných obdélníků (rohy)
        coat = np.ones((h, w), np.float32)
        for x0, y0, x1, y1 in part["coat"]:
            coat[round((1 - y1) * h) : round((1 - y0) * h), round(x0 * w) : round(x1 * w)] = 0
        return coat, zero
    if part["kind"] == "body":
        cloth = player.copy()
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        for x0, y0, x1, y1 in part.get("flatten") or []:
            rows = slice(round((1 - y1) * h), round((1 - y0) * h))
            cols = slice(round(x0 * w), round(x1 * w))
            cloth[rows, cols] = np.maximum(cloth[rows, cols], (sat[rows, cols] < 0.2).astype(np.float32))
        return cloth, zero
    if part.get("name") == "head":
        return zero, player
    return zero, zero


def build_atlas(parts, art):
    """Textury částí do jednoho atlasu (police po řádcích) – vrátí pixely a obdélník každé."""
    slots, x, y, row_h = {}, 0, 0, 0
    images = []
    for part in parts:
        key = (part["texture"], tuple(part.get("tint") or ()), part.get("pattern"), str(part.get("flatten")), part["kind"], part.get("name") == "head")
        part["slot_key"] = key
        if key in slots:
            part["slot"] = slots[key]
            continue
        im = bpy.data.images.load(os.path.join(art, part["texture"]))
        w, h = im.size
        bpy.data.images.remove(im)
        limit = part.get("texture_px", 256 if part.get("kind") == "body" else 128)
        f = min(1.0, limit / max(w, h))
        w, h = max(8, round(w * f)), max(8, round(h * f))
        if x + w > ATLAS_W:
            x, y, row_h = 0, y + row_h, 0
        slots[key] = (x, y, w, h)
        part["slot"] = slots[key]
        images.append((key, part, (x, y, w, h)))
        x += w
        row_h = max(row_h, h)
    height = 1
    while height < y + row_h:
        height *= 2
    atlas = np.zeros((height, ATLAS_W, 3), dtype=np.float32)
    mask = np.zeros((height, ATLAS_W, 3), dtype=np.float32)
    for key, part, (sx, sy, w, h) in images:
        px = multiplied(load_pixels(os.path.join(art, part["texture"]), w, h), part.get("multiply"))
        atlas[sy : sy + h, sx : sx + w] = tinted(px, part.get("tint"), part.get("pattern"), part.get("flatten"))
        cloth, hair = part_masks(px, part)
        mask[sy : sy + h, sx : sx + w, 0] = cloth
        mask[sy : sy + h, sx : sx + w, 1] = hair
    return atlas, height, mask


def atlas_jpeg(atlas, quality=92):
    h, w, _ = atlas.shape
    im = bpy.data.images.new("atlas", w, h, alpha=False)
    rgba = np.concatenate([np.clip(atlas, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    path = os.path.join(tempfile.mkdtemp(), "atlas.jpg")
    im.filepath_raw = path
    im.file_format = "JPEG"
    im.save(filepath=path, quality=quality)
    data = open(path, "rb").read()
    preview = path
    return data, preview


def image_png(pixels):
    """RGB obrázek (řádky odspodu jako v Blenderu) jako PNG – maska, bez ztrátové komprese."""
    h, w, _ = pixels.shape
    im = bpy.data.images.new("mask", w, h, alpha=False)
    rgba = np.concatenate([np.clip(pixels, 0, 1), np.ones((h, w, 1), np.float32)], axis=2)
    im.pixels.foreach_set(rgba.ravel())
    path = os.path.join(tempfile.mkdtemp(), "mask.png")
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    data = open(path, "rb").read()
    bpy.data.images.remove(im)
    return data


# --- Animace ---------------------------------------------------------------------------------


def animation_frames(path):
    """Pro každý klíč animace světové matice uzlů (podle sid) – klíče jsou u 0 A.D. společné."""
    root = ET.parse(path).getroot()
    fix = up_fix(root)
    channels = {}
    times = None
    for anim in root.findall(".//c:animation", NS):
        channel = anim.find("c:channel", NS)
        if channel is None or not channel.get("target").endswith("/transform"):
            continue
        sampler = anim.find("c:sampler", NS)
        inputs = {i.get("semantic"): i.get("source")[1:] for i in sampler.findall("c:input", NS)}
        t = [v[0] for v in source_data(root, inputs["INPUT"])]
        values = [matrix16(v) for v in source_data(root, inputs["OUTPUT"])]
        channels[channel.get("target").split("/")[0]] = (t, values)
        if times is None or len(t) > len(times):
            times = t
    frames = []
    children = {}
    for time in times:
        animated = {}
        for node_id, (t, values) in channels.items():
            k = min(range(len(t)), key=lambda i: abs(t[i] - time))
            animated[node_id] = values[k]
        worlds = {}

        def walk(node, parent):
            local = animated.get(node.get("id"))
            world = parent @ (local if local is not None else node_matrix(node))
            key = node.get("sid") or node.get("name")
            worlds[key] = world
            kids = node.findall("c:node", NS)
            children[key] = [k.get("sid") or k.get("name") for k in kids]
            for child in kids:
                walk(child, world)

        for node in root.findall(".//c:visual_scene/c:node", NS):
            walk(node, fix)
        frames.append(worlds)
    return times, frames, children


# --- Úprava pózy klipu (chůze za rádlem) -------------------------------------------------------


def subtree(children, name):
    out, stack = [], [name]
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(children.get(n, []))
    return out


def rotate_subtree(worlds, children, name, rotation, pivot):
    """Otočí kost i všechno pod ní (světové matice) o `rotation` (3×3) kolem bodu `pivot`."""
    m = Matrix.Translation(pivot) @ rotation.to_4x4() @ Matrix.Translation(-pivot)
    for n in subtree(children, name):
        if n in worlds:
            worlds[n] = m @ worlds[n]


def two_bone_ik(worlds, children, upper, lower, end, target, pole):
    """Rameno (upper) – loket (lower) – zápěstí (end): loket v rovině ramene, cíle a směru
    `pole`, zápěstí přesně v cíli (když dosáhne). Ruka si drží natočení vůči předloktí."""
    s = worlds[upper].to_translation()
    e = worlds[lower].to_translation()
    w = worlds[end].to_translation()
    a, b = (e - s).length, (w - e).length
    to_target = target - s
    d = min(max(to_target.length, 1e-4), (a + b) * 0.999)
    direction = to_target.normalized()
    cos_a = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
    side = pole - direction * pole.dot(direction)
    side.normalize()
    elbow = s + direction * (a * cos_a) + side * (a * math.sqrt(1 - cos_a * cos_a))
    rotate_subtree(worlds, children, upper, (e - s).rotation_difference(elbow - s).to_matrix(), s)
    w1 = worlds[end].to_translation()
    rotate_subtree(worlds, children, lower, (w1 - elbow).rotation_difference(target - elbow).to_matrix(), elbow)


def apply_pose(frames, children, pose, unit_m):
    """Předklon (lean) a ruce k pevnému bodu (reach) v každém snímku klipu – viz docstring."""
    for worlds in frames:
        for lean in pose.get("lean", []):
            bone = lean["bone"]
            pivot = worlds[bone].to_translation()
            # postava hledí na −Y, osa X míří vlevo – kladné otočení kolem X = předklon
            rotation = Matrix.Rotation(math.radians(lean["deg"]), 3, "X")
            rotate_subtree(worlds, children, bone, rotation, pivot)
        for side, (left, forward, up) in pose.get("reach", {}).items():
            target = Vector((left, -forward, up)) / unit_m
            sign = 1 if side == "L" else -1
            # loket ven do strany, dozadu a trochu dolů
            pole = Vector((sign * 0.8, 1.0, -0.4))
            two_bone_ik(worlds, children, f"arm_{side}", f"forearm_{side}", f"hand_{side}", target, pole)


KEY_ORDER = ["hip", "spine", "spine1", "chest", "neck", "head", "shoulder_L", "shoulder_R", "hand_L", "hand_R"]


def _blend_pose(poses, t, duration):
    """Póza klíčového klipu v čase t: mezi sousedními klíči hladce (kosinus), za posledním zpět
    k prvnímu (smyčka). Chybějící hodnota v jednom z klíčů = hodnota druhého (ruce, nohy)."""
    ts = [p["t"] for p in poses]
    k = max(i for i, s in enumerate(ts) if s <= t + 1e-9)
    a, b = poses[k], poses[(k + 1) % len(poses)]
    t1 = ts[k + 1] if k + 1 < len(poses) else duration
    u = 0.0 if t1 <= ts[k] else (t - ts[k]) / (t1 - ts[k])
    u = 0.5 - 0.5 * math.cos(math.pi * u)

    def mix(x, y):
        if x is None:
            return y
        if y is None:
            return x
        return [p + (q - p) * u for p, q in zip(x, y)]

    out = {"hip": mix(a.get("hip"), b.get("hip")), "turn": {}, "hands": {}, "feet": {}, "elbow": {}}
    for key in ("turn", "hands", "feet", "elbow"):
        for name in set(a.get(key, {})) | set(b.get(key, {})):
            zero = [0.0, 0.0, 0.0] if key == "turn" else None
            out[key][name] = mix(a.get(key, {}).get(name, zero), b.get(key, {}).get(name, zero))
    return out


def keyed_frames(path, keys, unit_m, size):
    """Vlastní klip z klíčových póz (vlastní práce, CC0) na kostře bipeda 0 A.D.: výchozí snímek
    klipu 0 A.D. (`base`, `base_frame`) a v `poses` po čase `t` (s, smyčka délky `duration_s`):
    „hip“ = posun pánve [vlevo, vpřed, nahoru] (m – sed, klek), „turn“ = {kost: [předklon, úklon
    vlevo, otočení vlevo]} (stupně kolem os postavy, pivot v kosti – podstrom s ní), „hands“ /
    „feet“ = {"L"/"R": [vlevo, vpřed, výška]} (m od paty, dvoukloubová IK; nohy bez údaje drží
    chodidlo, kde bylo, a chodidla zůstávají naplocho), „elbow“ = {"L"/"R": [ven, vpřed, nahoru]}
    směr lokte. Rozměry jsou pro postavu 1,6 m (`size` = výška postavy / 1,6). Uzel „seat“
    (sedátko – volný prop) stojí v počátku postavy."""
    _, base_frames, children = animation_frames(path)
    base = base_frames[keys.get("base_frame", 0)]
    duration = keys["duration_s"]
    poses = sorted(keys["poses"], key=lambda p: p["t"])
    n = max(2, round(duration * 24))
    times = [k * duration / n for k in range(n + 1)]
    m = size / unit_m

    def figure(v):
        return Vector((v[0], -v[1], v[2])) * m

    frames = []
    for t in times:
        pose = _blend_pose(poses, t % duration, duration)
        worlds = {k: v.copy() for k, v in base.items()}
        feet = {s: worlds[f"foot_{s}"].copy() for s in "LR"}
        if pose["hip"]:
            shift = Matrix.Translation(figure(pose["hip"]))
            for name in subtree(children, "hip"):
                if name in worlds:
                    worlds[name] = shift @ worlds[name]
        for bone in KEY_ORDER + sorted(set(pose["turn"]) - set(KEY_ORDER)):
            deg = pose["turn"].get(bone)
            if not deg or bone not in worlds:
                continue
            # postava hledí na −Y, X vlevo: předklon kolem +X, úklon vlevo kolem −Y, otočení kolem +Z
            rotation = (
                Matrix.Rotation(math.radians(deg[2]), 3, "Z")
                @ Matrix.Rotation(math.radians(-deg[1]), 3, "Y")
                @ Matrix.Rotation(math.radians(deg[0]), 3, "X")
            )
            rotate_subtree(worlds, children, bone, rotation, worlds[bone].to_translation())
        for side in "LR":
            sign = 1 if side == "L" else -1
            target = pose["feet"].get(side)
            goal = figure(target) if target else feet[side].to_translation()
            # koleno vpřed a trochu ven
            two_bone_ik(worlds, children, f"thigh_{side}", f"leg_{side}", f"foot_{side}", goal, Vector((sign * 0.25, -1.0, 0.0)))
            now = worlds[f"foot_{side}"]
            flat = feet[side].to_3x3() @ now.to_3x3().inverted()
            rotate_subtree(worlds, children, f"foot_{side}", flat, now.to_translation())
        for side, target in pose["hands"].items():
            sign = 1 if side == "L" else -1
            e = pose["elbow"].get(side)
            pole = Vector((sign * e[0], -e[1], e[2])) if e else Vector((sign * 0.8, 1.0, -0.4))
            two_bone_ik(worlds, children, f"arm_{side}", f"forearm_{side}", f"hand_{side}", figure(target), pole)
        worlds["seat"] = Matrix.Identity(4)
        frames.append(worlds)
    return times, frames, children


def report_points(clip, frames, names, unit_m):
    """Poloha uzlů v klipu v metrech – souřadnice scény (x vlevo postavy, y nahoru, z vpřed)."""
    for name in names:
        pts = [worlds[name].to_translation() * unit_m for worlds in frames if name in worlds]
        if not pts:
            print(f"    {clip}: uzel {name} chybí")
            continue
        xs, ys, zs = [p.x for p in pts], [p.z for p in pts], [-p.y for p in pts]
        print(
            f"    {clip}: {name} x {sum(xs) / len(xs):+.3f} y {sum(ys) / len(ys):.3f} "
            f"({min(ys):.3f}–{max(ys):.3f}) z {sum(zs) / len(zs):+.3f} ({min(zs):+.3f}–{max(zs):+.3f})"
        )


def walk_speed(frames, times, unit_m):
    """Rychlost chůze (m/s) při přehrání rychlostí 1: chodidlo na zemi (nejnižší pětina
    výšky kroku) jede vůči tělu dozadu stejnou rychlostí, jakou jde postava vpřed."""
    feet = [n for n in frames[0] if "foot" in n.lower() and "ik" not in n.lower() and "prop" not in n]
    speeds = []
    for foot in feet:
        pts = [worlds[foot].to_translation() * unit_m for worlds in frames]
        low, high = min(p.z for p in pts), max(p.z for p in pts)
        v = []
        for k in range(1, len(pts)):
            dt = times[k] - times[k - 1]
            if dt > 0 and max(pts[k].z, pts[k - 1].z) < low + 0.2 * (high - low):
                # postava hledí na −Y – chodidlo na zemi jede k +Y
                v.append((pts[k].y - pts[k - 1].y) / dt)
        if v:
            speeds.append(sorted(v)[len(v) // 2])
    return sum(speeds) / len(speeds) if speeds else 0.0


# --- GLB -------------------------------------------------------------------------------------


class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors = [], []
        # animace v jednom společném bufferView – JSON s tisícem pohledů by byl větší než data
        self.shared = bytearray()
        self.shared_accessors = []

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.bin += data
        self.views.append(view)
        return len(self.views) - 1

    def accessor(self, array, kind, component, target=None, minmax=False, normalized=False, shared=False):
        array = np.ascontiguousarray(array)
        acc = {"componentType": component, "count": int(array.shape[0]), "type": kind}
        if shared:
            while len(self.shared) % 4:
                self.shared.append(0)
            acc["byteOffset"] = len(self.shared)
            self.shared += array.tobytes()
            self.shared_accessors.append(len(self.accessors))
        else:
            acc["bufferView"] = self.view(array.tobytes(), target)
        if normalized:
            acc["normalized"] = True
        if minmax:
            flat = array.reshape(array.shape[0], -1)
            acc["min"] = [float(v) for v in flat.min(axis=0)]
            acc["max"] = [float(v) for v in flat.max(axis=0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def finish_shared(self):
        if not self.shared_accessors:
            return
        view = self.view(bytes(self.shared))
        for a in self.shared_accessors:
            self.accessors[a]["bufferView"] = view


def weights_u8(weights):
    """Váhy kostí jako normalizované bajty se součtem přesně 255 (zbytek dostane největší)."""
    w = np.array(weights, np.float32)
    q = np.floor(w * 255 + 0.5).astype(np.int32)
    for row, values in zip(q, w):
        row[int(np.argmax(values))] += 255 - int(row.sum())
    return q.astype(np.uint8)


def column_major(m):
    return [m[r][c] for c in range(4) for r in range(4)]


def trs(m):
    loc, rot, scale = m.decompose()
    return [loc.x, loc.y, loc.z], [rot.x, rot.y, rot.z, rot.w], [scale.x, scale.y, scale.z]


def prop_local(part, unit_m):
    """Natočení, měřítko a posun propu v osách jeho bodu („rotate_deg“, „scale“, „offset_m“)."""
    rx, ry, rz = (math.radians(a) for a in part.get("rotate_deg", [0, 0, 0]))
    local = Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Scale(part.get("scale", 1), 4)
    return Matrix.Translation(Vector(part.get("offset_m", [0, 0, 0])) / unit_m) @ local


def report_tip(clip, world, part, tip, aim, unit_m):
    """Držadlo a špička propu v prvním snímku klipu (m – vpřed, vzhůru, vpravo od paty postavy;
    0 A.D.: x vlevo, y vzad, z nahoru). S `aim` i natočení „rotate_deg“ podél `aim`."""

    def scene(p):
        return f"vpřed {-p.y * unit_m:+.2f} vzhůru {p.z * unit_m:.2f} vpravo {-p.x * unit_m:+.2f}"

    grip = world @ prop_local(part, unit_m) @ Vector((0.0, 0.0, 0.0))
    end = world @ prop_local(part, unit_m) @ Vector(tip)
    print(f"    {clip}: {part['name']} držadlo {scene(grip)}, špička {scene(end)}")
    if aim:
        # směr v osách bodu, z = Ry(b) · Rx(a) · (0, 0, 1) = (cos a · sin b, −sin a, cos a · cos b)
        forward, up, right = aim
        d = (world.to_3x3().inverted() @ Vector((-right, -forward, up))).normalized()
        a, b = -math.asin(max(-1.0, min(1.0, d.y))), math.atan2(d.x, d.z)
        print(f"    {clip}: {part['name']} podél {aim}: rotate_deg [{math.degrees(a):.0f}, {math.degrees(b):.0f}, 0]")


def convert(spec, art, out_dir):
    body = load_body(os.path.join(art, spec["body"]["dae"]))
    names = body["names"]
    worlds, parents = body["worlds"], body["parents"]
    # Klidová (bind) póza kloubů skinu = inverze inverse bind matic.
    rest_world = {n: body["inv_bind"][j].inverted() for j, n in enumerate(names)}

    # Části: tělo a propy (každý na svém bodu) se společným atlasem.
    parts = [dict(spec["body"], kind="body")]
    props = []
    for prop in spec.get("props", []):
        point = prop["point"]
        # Každý prop vlastní kloub (srp a motyka sdílejí bod weapon_R, ale skrývají se zvlášť).
        joint = f"prop_{prop['name']}"
        if point not in worlds:
            # volný prop (sedátko „seat“): v klidu v počátku postavy, klíčový klip ho drží tam
            parent = names[0]
            local = rest_world[parent].inverted()
            rest_world[joint] = Matrix.Identity(4)
        else:
            parent = parents[point]
            while parent not in rest_world:
                parent = parents[parent]
            local = worlds[parent].inverted() @ worlds[point]
            rest_world[joint] = rest_world[parent] @ local
        props.append(dict(prop, parent=parent, local=local, kind="prop", joint=joint))
        parts.append(props[-1])
    atlas, atlas_h, mask = build_atlas(parts, art)

    body_pts = [body["bsm"] @ p for p in body["positions"]]
    if "length_m" in spec:
        # zvíře: délka těla podél osy pohledu (Y v 0 A.D.)
        ys = [p.y for p in body_pts]
        scale = spec["length_m"] / (max(ys) - min(ys))
    else:
        zs = [p.z for p in body_pts]
        scale = spec["height_m"] / (max(zs) - min(zs))
    extent = [max(c) - min(c) for c in zip(*[(p.x, p.y, p.z) for p in body_pts])]
    print(f"  rozměry (m): šířka {extent[0] * scale:.2f}, délka {extent[1] * scale:.2f}, výška {extent[2] * scale:.2f}")

    joints = names + [p["joint"] for p in props]
    joint_index = {n: i for i, n in enumerate(joints)}

    def joint_parent(name):
        if name in [p["joint"] for p in props]:
            return next(p["parent"] for p in props if p["joint"] == name)
        p = parents.get(name)
        while p is not None and p not in joint_index:
            p = parents.get(p)
        return p

    # Vrcholy: (část, pozice, normála, uv) -> index; tělo se skinem, propy s vahou 1.
    pos, nor, uv, jnt, wgt, idx = [], [], [], [], [], []
    for part_i, part in enumerate(parts):
        if part["kind"] == "body":
            geo = body
            matrix = body["bsm"]
        elif "procedural" in part:
            geo = PROCEDURAL[part["procedural"]](part["uv"])
            matrix = rest_world[part["joint"]] @ geo["matrix"]
        else:
            geo = load_static(os.path.join(art, part["dae"]))
            matrix = rest_world[part["joint"]] @ geo["matrix"]
        if part["kind"] == "prop" and (part.get("scale", 1) != 1 or part.get("rotate_deg") or part.get("offset_m")):
            # měřítko a natočení propu v souřadnicích jeho bodu (ruka, rameno) – vrcholy v klidové póze
            local = prop_local(part, scale)
            matrix = rest_world[part["joint"]] @ local @ (rest_world[part["joint"]].inverted() @ matrix)
        normal_matrix = matrix.to_3x3().inverted().transposed()
        sx, sy, sw, sh = part["slot"]
        lookup = {}
        uvs_seen = [1e9, -1e9, 1e9, -1e9]
        for tri in geo["tris"]:
            for corner in tri:
                key = (part_i,) + corner
                if key not in lookup:
                    p_i, n_i, t_i = corner
                    p = matrix @ geo["positions"][p_i]
                    n = (normal_matrix @ geo["normals"][n_i]).normalized() if n_i >= 0 else Vector((0, 0, 1))
                    u, v = geo["uvs"][t_i] if t_i >= 0 else (0.5, 0.5)
                    uvs_seen = [min(uvs_seen[0], u), max(uvs_seen[1], u), min(uvs_seen[2], v), max(uvs_seen[3], v)]
                    u, v = min(max(u, 0.0), 1.0), min(max(v, 0.0), 1.0)
                    # Atlas: COLLADA v roste nahoru (Blender obrázek odspodu), glTF v shora.
                    au = (sx + u * sw) / ATLAS_W
                    av = (sy + v * sh) / atlas_h
                    if part["kind"] == "body":
                        infl = body["influences"][p_i]
                        js = [j for j, _ in infl] + [0] * (4 - len(infl))
                        ws = [w for _, w in infl] + [0.0] * (4 - len(infl))
                    else:
                        js = [joint_index[part["joint"]], 0, 0, 0]
                        ws = [1.0, 0.0, 0.0, 0.0]
                    lookup[key] = len(pos)
                    pos.append(p[:])
                    nor.append(n[:])
                    uv.append((au, 1.0 - av))
                    jnt.append(js)
                    wgt.append(ws)
                idx.append(lookup[key])
        if part["kind"] == "prop":
            pp = [matrix @ q for q in geo["positions"]]
            ext = [(max(c[i] for c in pp) - min(c[i] for c in pp)) * scale for i in range(3)]
            print(f"  {part['name']}: rozměry (m) {ext[0]:.2f} x {ext[1]:.2f} x {ext[2]:.2f}")
        print(f"  {part.get('name', 'body')}: uv u[{uvs_seen[0]:.2f},{uvs_seen[1]:.2f}] v[{uvs_seen[2]:.2f},{uvs_seen[3]:.2f}]")

    pos = np.array(pos, np.float32)
    # Kořen: 0 A.D. je Z nahoru a postava míří na −Y; glTF je Y nahoru a postava má mířit na +Z
    # (jako ostatní modely scény) – otočení −90° kolem X převede −Y na +Z.
    root_matrix = Matrix.Scale(scale, 4) @ Matrix.Rotation(math.radians(-90), 4, "X")
    if spec.get("forward", "-y") == "+y":
        root_matrix = root_matrix @ Matrix.Rotation(math.pi, 4, "Z")

    g = Gltf()
    nodes = [{"name": spec["name"], "matrix": column_major(root_matrix), "children": []}]
    joint_node = {}
    for name in joints:
        joint_node[name] = len(nodes)
        nodes.append({"name": name})

    def local_of(name, world_of):
        parent = joint_parent(name)
        return world_of(name) if parent is None else world_of(parent).inverted() @ world_of(name)

    rest_trs = {}
    for name in joints:
        t, r, s = trs(local_of(name, lambda n: rest_world[n]))
        rest_trs[name] = (t, r, s)
        node = nodes[joint_node[name]]
        node.update({"translation": t, "rotation": r, "scale": s})
        parent = joint_parent(name)
        target = nodes[0] if parent is None else nodes[joint_node[parent]]
        target.setdefault("children", []).append(joint_node[name])
    mesh_node = len(nodes)
    nodes.append({"name": f"{spec['name']}-mesh", "mesh": 0, "skin": 0})
    nodes[0]["children"].append(mesh_node)

    attributes = {
        "POSITION": g.accessor(pos, "VEC3", 5126, 34962, minmax=True),
        "NORMAL": g.accessor(np.array(nor, np.float32), "VEC3", 5126, 34962),
        "TEXCOORD_0": g.accessor(np.array(uv, np.float32), "VEC2", 5126, 34962),
        "JOINTS_0": g.accessor(np.array(jnt, np.uint8), "VEC4", 5121, 34962),
        "WEIGHTS_0": g.accessor(weights_u8(wgt), "VEC4", 5121, 34962, normalized=True),
    }
    indices = g.accessor(np.array(idx, np.uint16), "SCALAR", 5123, 34963)
    ibm = np.array([column_major(rest_world[n].inverted()) for n in joints], np.float32)
    ibm_acc = g.accessor(ibm, "MAT4", 5126)

    jpeg, preview = atlas_jpeg(atlas)
    image_view = g.view(jpeg)
    mask_view = g.view(image_png(mask))

    # Animace: každý klip vlastní animace glTF, kanál pro každý klouby (jen co se liší od klidu).
    animations = []
    prop_points = {p["joint"]: p for p in props}
    for clip in spec["clips"]:
        if clip.get("keys"):
            size = spec.get("height_m", 1.6) / 1.6
            times, frames, children = keyed_frames(os.path.join(art, clip["keys"]["base"]), clip["keys"], scale, size)
        else:
            times, frames, children = animation_frames(os.path.join(art, clip["animation"]))
        if clip.get("pose"):
            apply_pose(frames, children, clip["pose"], scale)
        if clip.get("report"):
            report_points(clip["name"], frames, clip["report"], scale)
        if clip["name"] == "walk" or clip["name"].startswith("walk-"):
            print(f"    {clip['name']}: rychlost chůze při přehrání 1× ≈ {walk_speed(frames, times, scale):.2f} m/s")
        visible = set(clip.get("props", []))
        samples = {n: [] for n in joints}
        for worlds_t in frames:
            cache = {}

            def world_at(name):
                if name in cache:
                    return cache[name]
                if name in prop_points:
                    p = prop_points[name]
                    # bod propu má v animaci vlastní kanál (nástroj se v ruce natáčí)
                    w = worlds_t.get(p["point"])
                    if w is None:
                        w = world_at(p["parent"]) @ p["local"]
                elif name in worlds_t:
                    w = worlds_t[name]
                else:
                    parent = joint_parent(name)
                    rest_local = local_of(name, lambda n: rest_world[n])
                    w = rest_local if parent is None else world_at(parent) @ rest_local
                cache[name] = w
                return w

            for name in joints:
                t, r, s = trs(local_of(name, world_at))
                if name in prop_points and prop_points[name]["name"] not in visible:
                    s = [0.0, 0.0, 0.0]
                samples[name].append((t, r, s))
            tip = clip.get("report_tip")
            if tip and worlds_t is frames[0]:
                part = next(p for p in props if p["name"] == tip["prop"])
                report_tip(clip["name"], world_at(part["joint"]), part, tip["tip"], tip.get("aim"), scale)
        t0 = times[0]
        input_acc = g.accessor(np.array([t - t0 for t in times], np.float32), "SCALAR", 5126, minmax=True, shared=True)
        # stálá hodnota celého klipu (měřítko propu, posun kloubu) – dva klíče se skokem
        end_acc = g.accessor(np.array([0.0, times[-1] - t0], np.float32), "SCALAR", 5126, minmax=True, shared=True)
        channels, samplers = [], []
        for name in joints:
            series = samples[name]
            # Kvaterniony bez přeskoků znaménka (interpolace by šla dlouhou cestou).
            for k in range(1, len(series)):
                a, b = series[k - 1][1], series[k][1]
                if sum(x * y for x, y in zip(a, b)) < 0:
                    series[k] = (series[k][0], [-x for x in b], series[k][2])
            for path, i, kind in (("translation", 0, "VEC3"), ("rotation", 1, "VEC4"), ("scale", 2, "VEC3")):
                values = np.array([s[i] for s in series], np.float32)
                rest = np.array(rest_trs[name][i], np.float32)
                if path == "rotation":
                    same = np.all(np.abs(np.abs(values @ rest) - 1) < 1e-6)
                    constant = np.all(np.abs(np.abs(values @ values[0]) - 1) < 1e-6)
                else:
                    # 1e-4 jednotky 0 A.D. (postava ≈ 3,9) – pod tím je jen šum rozkladu matic
                    same = np.all(np.abs(values - rest) < 1e-4)
                    constant = np.all(np.abs(values - values[0]) < 1e-4)
                # Propy mají měřítko v každém klipu – jinak by si přehrávač nechal 0 z minulého.
                if same and not (name in prop_points and path == "scale"):
                    continue
                interpolation, sampler_input = "LINEAR", input_acc
                if constant:
                    values = values[[0, 0]]
                    interpolation, sampler_input = "STEP", end_acc
                if path == "rotation":
                    # normalizované int16 (glTF 2.0 dovoluje u rotací) – poloviční velikost
                    quant = np.round(np.clip(values, -1, 1) * 32767).astype(np.int16)
                    out_acc = g.accessor(quant, kind, 5122, normalized=True, shared=True)
                else:
                    out_acc = g.accessor(values, kind, 5126, shared=True)
                samplers.append({"input": sampler_input, "output": out_acc, "interpolation": interpolation})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": joint_node[name], "path": path}})
        animations.append({"name": clip["name"], "channels": channels, "samplers": samplers})
        print(f"  klip {clip['name']}: {len(times)} klíčů, {times[-1] - t0:.3f} s, {len(channels)} kanálů")

    g.finish_shared()
    doc = {
        "asset": {"version": "2.0", "generator": "Bohemia people_from_0ad.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": [
            {
                "name": spec["name"],
                "primitives": [{"attributes": attributes, "indices": indices, "material": 0}],
            }
        ],
        "skins": [{"joints": [joint_node[n] for n in joints], "inverseBindMatrices": ibm_acc, "skeleton": 0}],
        "materials": [
            {
                "name": f"{spec['name']}-atlas",
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 1.0,
                },
                # maska látky (R) a vlasů (G) – scéna ji čte jako ambientTexture
                "occlusionTexture": {"index": 1},
            }
        ],
        "textures": [{"source": 0, "sampler": 0}, {"source": 1, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}],
        "images": [
            {"bufferView": image_view, "mimeType": "image/jpeg"},
            {"bufferView": mask_view, "mimeType": "image/png"},
        ],
        "animations": animations,
        "accessors": g.accessors,
        "bufferViews": g.views,
    }
    while len(g.bin) % 4:
        g.bin.append(0)
    doc["buffers"] = [{"byteLength": len(g.bin)}]
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    path = os.path.join(out_dir, f"{spec['name']}.glb")
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(g.bin)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(g.bin), 0x004E4942))
        f.write(g.bin)
    size = f"délka {spec['length_m']} m" if "length_m" in spec else f"výška {spec['height_m']} m"
    print(
        f"{spec['name']}: {len(idx) // 3} tris, {len(pos)} verts, {len(joints)} kloubů, "
        f"atlas {ATLAS_W}×{atlas_h}, {os.path.getsize(path) / 1024:.0f} kB, {size}"
    )
    return preview


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    job_path, art_dir, out_dir = args[0], args[1], args[2]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(out_dir, exist_ok=True)
    for spec in json.load(open(job_path)):
        preview = convert(spec, art_dir, out_dir)
        if len(args) > 3:
            os.replace(preview, os.path.join(args[3], f"{spec['name']}-atlas.jpg"))


main()
