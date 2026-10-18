"""Lidé z 0 A.D. (skinované COLLADA + propy) -> GLB s kostrou a animacemi pro scénu (SPIKE).

blender -b --factory-startup --python tools/blender/people_from_0ad.py -- \
    tools/blender/people.json <0ad>/binaries/data/mods/public/art apps/web/public/models/people

people.json: [{"name", "height_m", "body": {"dae", "texture", "tint", "pattern"?, "flatten"?},
"props": [{"name", "dae" | "procedural", "point", "texture", "tint"?, "uv"?}],
"clips": [{"name", "animation", "props": [jména propů viditelných v klipu]}]}]

Na rozdíl od fauna_from_0ad.py se kostra i animace převádějí: GLB má skin (48 kostí bipeda
0 A.D. + body propů jako další klouby) a každá animace 0 A.D. je jedna animace glTF (klíče
24 snímků/s jako v 0 A.D.). Propy (hlava, srp, nůše) jsou pevně přivázané ke svému bodu
(váha 1) – prop, který v klipu není, má v klipu měřítko 0. Všechny části sdílejí jeden atlas
textur, takže postava je jeden mesh s jedním materiálem (ve scéně jeden draw call pro všechny
postavy jednoho druhu – apps/web/lib/scene/villagers.ts).
Barvy: plochy pro barvu hráče (alfa < 1) dostanou barvu „tint“ (průměr plochy) a „pattern“
ztlumí kostkovaný vzor keltských šatů (1 = beze změny, 0 = jednolitá barva).

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
    prims = mesh_el.findall("c:triangles", NS) + mesh_el.findall("c:polylist", NS)
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


def build_atlas(parts, art):
    """Textury částí do jednoho atlasu (police po řádcích) – vrátí pixely a obdélník každé."""
    slots, x, y, row_h = {}, 0, 0, 0
    images = []
    for part in parts:
        key = (part["texture"], tuple(part.get("tint") or ()), part.get("pattern"), str(part.get("flatten")))
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
    for _, part, (sx, sy, w, h) in images:
        px = load_pixels(os.path.join(art, part["texture"]), w, h)
        atlas[sy : sy + h, sx : sx + w] = tinted(px, part.get("tint"), part.get("pattern"), part.get("flatten"))
    return atlas, height


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
    for time in times:
        animated = {}
        for node_id, (t, values) in channels.items():
            k = min(range(len(t)), key=lambda i: abs(t[i] - time))
            animated[node_id] = values[k]
        worlds = {}

        def walk(node, parent):
            local = animated.get(node.get("id"))
            world = parent @ (local if local is not None else node_matrix(node))
            worlds[node.get("sid") or node.get("name")] = world
            for child in node.findall("c:node", NS):
                walk(child, world)

        for node in root.findall(".//c:visual_scene/c:node", NS):
            walk(node, fix)
        frames.append(worlds)
    return times, frames


# --- GLB -------------------------------------------------------------------------------------


class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors = [], []

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.bin += data
        self.views.append(view)
        return len(self.views) - 1

    def accessor(self, array, kind, component, target=None, minmax=False, normalized=False):
        array = np.ascontiguousarray(array)
        view = self.view(array.tobytes(), target)
        acc = {
            "bufferView": view,
            "componentType": component,
            "count": int(array.shape[0]),
            "type": kind,
        }
        if normalized:
            acc["normalized"] = True
        if minmax:
            flat = array.reshape(array.shape[0], -1)
            acc["min"] = [float(v) for v in flat.min(axis=0)]
            acc["max"] = [float(v) for v in flat.max(axis=0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1


def column_major(m):
    return [m[r][c] for c in range(4) for r in range(4)]


def trs(m):
    loc, rot, scale = m.decompose()
    return [loc.x, loc.y, loc.z], [rot.x, rot.y, rot.z, rot.w], [scale.x, scale.y, scale.z]


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
        parent = parents[point]
        while parent not in rest_world:
            parent = parents[parent]
        local = worlds[parent].inverted() @ worlds[point]
        # Každý prop vlastní kloub (srp a motyka sdílejí bod weapon_R, ale skrývají se zvlášť).
        joint = f"prop_{prop['name']}"
        rest_world[joint] = rest_world[parent] @ local
        props.append(dict(prop, parent=parent, local=local, kind="prop", joint=joint))
        parts.append(props[-1])
    atlas, atlas_h = build_atlas(parts, art)

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
            r = part["uv"]
            geo = procedural_sickle(r["blade"], r["handle"])
            matrix = rest_world[part["joint"]] @ geo["matrix"]
        else:
            geo = load_static(os.path.join(art, part["dae"]))
            matrix = rest_world[part["joint"]] @ geo["matrix"]
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
        print(f"  {part.get('name', 'body')}: uv u[{uvs_seen[0]:.2f},{uvs_seen[1]:.2f}] v[{uvs_seen[2]:.2f},{uvs_seen[3]:.2f}]")

    pos = np.array(pos, np.float32)
    body_z = [(body["bsm"] @ p).z for p in body["positions"]]
    scale = spec["height_m"] / (max(body_z) - min(body_z))
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
        "WEIGHTS_0": g.accessor(np.array(wgt, np.float32), "VEC4", 5126, 34962),
    }
    indices = g.accessor(np.array(idx, np.uint16), "SCALAR", 5123, 34963)
    ibm = np.array([column_major(rest_world[n].inverted()) for n in joints], np.float32)
    ibm_acc = g.accessor(ibm, "MAT4", 5126)

    jpeg, preview = atlas_jpeg(atlas)
    image_view = g.view(jpeg)

    # Animace: každý klip vlastní animace glTF, kanál pro každý klouby (jen co se liší od klidu).
    animations = []
    prop_points = {p["joint"]: p for p in props}
    for clip in spec["clips"]:
        times, frames = animation_frames(os.path.join(art, clip["animation"]))
        visible = set(clip.get("props", []))
        samples = {n: [] for n in joints}
        for worlds_t in frames:
            cache = {}

            def world_at(name):
                if name in cache:
                    return cache[name]
                if name in prop_points:
                    p = prop_points[name]
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
        t0 = times[0]
        input_acc = g.accessor(np.array([t - t0 for t in times], np.float32), "SCALAR", 5126, minmax=True)
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
                else:
                    same = np.all(np.abs(values - rest) < 1e-5)
                # Propy mají měřítko v každém klipu – jinak by si přehrávač nechal 0 z minulého.
                if same and not (name in prop_points and path == "scale"):
                    continue
                out_acc = g.accessor(values, kind, 5126)
                samplers.append({"input": input_acc, "output": out_acc, "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": joint_node[name], "path": path}})
        animations.append({"name": clip["name"], "channels": channels, "samplers": samplers})
        print(f"  klip {clip['name']}: {len(times)} klíčů, {times[-1] - t0:.3f} s, {len(channels)} kanálů")

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
            }
        ],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": image_view, "mimeType": "image/jpeg"}],
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
    print(
        f"{spec['name']}: {len(idx) // 3} tris, {len(pos)} verts, {len(joints)} kloubů, "
        f"atlas {ATLAS_W}×{atlas_h}, {os.path.getsize(path) / 1024:.0f} kB, výška {spec['height_m']} m"
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
