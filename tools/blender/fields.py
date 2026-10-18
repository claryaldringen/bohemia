"""Pole ve scéně: textury obtisků a modely obilí, panáků a kupek sena z 0 A.D. -> public/.

blender -b --factory-startup --python tools/blender/fields.py -- \
    <0ad>/binaries/data/mods/public/art apps/web/public [náhled.png]

Pak textury obtisků do JPEG (Blender je uloží jako PNG vedle, JPEG kvalitu neumí spolehlivě):
    for f in farmland sown stubble crop; do
      magick apps/web/public/textures/fields/$f.png -quality 88 apps/web/public/textures/fields/$f.jpg
      rm apps/web/public/textures/fields/$f.png
    done

Výstupy (licence a původní soubory v LICENSE.md / LICENSES.md vedle nich):
- textures/fields/farmland.jpg – zorané pole s měkkými brázdami (terrain/types/temperate/
  farmland_01.png, brázdy svisle – scéna je natočí podél řádků pole),
- textures/fields/sown.jpg – zavláčená osetá zem: farmland_01 rozmazaný podél brázd, tmavší
  a bez slámy (hrudky zahrabané branami),
- textures/fields/stubble.jpg – strniště: jas farmland_01 přemapovaný do slámové a hnědé,
- textures/fields/crop.jpg – porost obilí shora pod trsy (terrain/types/furrows_dirt.dds) bez
  barvy – zelenou nebo zlatou mu dá scéna (z dálky, kde trsy řídnou, nese pole jen on),
- models/fields/crops.glb – trsy obilí (tři svislé karty do hvězdy, výška 1 m – scéna je
  zmenší podle růstu) v uzlech crop-green (zelené obilí s klasy – přebarvená pšenice
  farming_wheat_harvest_a.png), crop-ripe (zralá pšenice), crop-sprout (vzcházející obilí –
  tráva grass_field_lush_tall.dds) a crop-stubble (strniště – spodek stébel pšenice); jeden
  atlas 2 × 2 a jeden materiál,
- models/fields/stook.glb – panák: osm snopů opřených o sebe a jeden snop navrch jako čepice
  (procedurální tvar, textura ze sena wrld_hay_a.dds a klasů pšenice),
- models/fields/haystack.glb – kupka sena (meshes/props/wrld_hay_la.dae, wrld_hay_a.dds)
  zvýšená do tvaru stohu kolem tyče.

Žádný výřez nezasahuje do loga Wildfire Games (použité textury žádné logo nemají).
Výstup je deterministický.
"""
import math
import os
import sys
import tempfile
import xml.etree.ElementTree as ET

import bpy
import numpy as np
from mathutils import Matrix, Vector

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}

args = sys.argv[sys.argv.index("--") + 1 :]
ART, PUBLIC = args[0], args[1]
PREVIEW = args[2] if len(args) > 2 else None
TEX_OUT = f"{PUBLIC}/textures/fields"
MODEL_OUT = f"{PUBLIC}/models/fields"
# mezivýsledky (atlas trsů, textura panáku) – do GLB se vloží, do public/ ne
TMP = tempfile.mkdtemp(prefix="bohemia-fields-")

# Trs obilí: šířka karty a výška (m) – scéna trsy zmenšuje podle růstu (výška 1 = zralé obilí).
CARD_W = 0.8
CARD_H = 1.0
ATLAS = 512
CELL = ATLAS // 2


# --- obrázky (numpy, hodnoty 0–1, řádek 0 = spodek jako v Blenderu) ---------------------------


def load(path):
    image = bpy.data.images.load(path)
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(image)
    return px


def save_png(px, path):
    h, w = px.shape[:2]
    image = bpy.data.images.new("out", w, h, alpha=True)
    image.pixels.foreach_set(np.clip(px, 0, 1).astype(np.float32).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def resize(px, w, h):
    """Bilineární změna velikosti (bez knihoven navíc)."""
    sh, sw = px.shape[:2]
    ys = (np.arange(h) + 0.5) * sh / h - 0.5
    xs = (np.arange(w) + 0.5) * sw / w - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, sh - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, sw - 1)
    y1 = np.clip(y0 + 1, 0, sh - 1)
    x1 = np.clip(x0 + 1, 0, sw - 1)
    fy = np.clip(ys - y0, 0, 1)[:, None, None]
    fx = np.clip(xs - x0, 0, 1)[None, :, None]
    top = px[y0][:, x0] * (1 - fx) + px[y0][:, x1] * fx
    bottom = px[y1][:, x0] * (1 - fx) + px[y1][:, x1] * fx
    return top * (1 - fy) + bottom * fy


def luma(px):
    return px[..., 0] * 0.299 + px[..., 1] * 0.587 + px[..., 2] * 0.114


def blur_rows(px, radius, axis):
    """Rozmazání po ose (0 = svisle, podél brázd) s opakováním přes okraj – textura dál navazuje."""
    out = np.zeros_like(px)
    for d in range(-radius, radius + 1):
        out += np.roll(px, d, axis=axis)
    return out / (2 * radius + 1)


def bleed(px, steps=8):
    """Barva neprůhledných pixelů do průhledných okolo – mipmapy pak nemají tmavý lem."""
    rgb = px[..., :3].copy()
    known = px[..., 3] > 0.5
    for _ in range(steps):
        acc = np.zeros_like(rgb)
        count = np.zeros(known.shape, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                shifted = np.roll(np.roll(known, dy, 0), dx, 1)
                acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * shifted[..., None]
                count += shifted
        grow = (~known) & (count > 0)
        rgb[grow] = acc[grow] / count[grow][:, None]
        known = known | grow
    rgb[~known] = rgb[known].mean(axis=0)
    out = px.copy()
    out[..., :3] = rgb
    return out


def gradient_map(values, stops):
    """Jas 0–1 → barva podle bodů [(jas, (r, g, b))]."""
    xs = np.array([s[0] for s in stops])
    out = np.zeros(values.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(values, xs, np.array([s[1][c] for s in stops]))
    return out


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.max(rgb, axis=-1)
    mn = np.min(rgb, axis=-1)
    d = mx - mn + 1e-8
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4))
    return np.stack([h / 6, np.where(mx > 0, (mx - mn) / (mx + 1e-8), 0), mx], axis=-1)


def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0] * 6, hsv[..., 1], hsv[..., 2]
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    table = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    out = np.zeros(hsv.shape, dtype=np.float32)
    for k, (r, g, b) in enumerate(table):
        m = i == k
        out[..., 0][m], out[..., 1][m], out[..., 2][m] = r[m], g[m], b[m]
    return out


# --- textury obtisků ---------------------------------------------------------------------------


def field_textures():
    farmland = load(f"{ART}/textures/terrain/types/temperate/farmland_01.png")
    # Brázdy v originále vedou svisle (podél v) – scéna mapuje v podél řádků pole.
    save_png(farmland, f"{TEX_OUT}/farmland.png")

    # Osetá zem: brány zahrabou slámu i hrudky – rozmazat podél brázd, ubrat slámu, ztmavit.
    small = resize(farmland, 512, 512)
    soft = blur_rows(small, 6, 0)
    soft = soft * 0.55 + small * 0.45
    hsv = rgb_to_hsv(soft[..., :3])
    hsv[..., 1] *= 0.8
    hsv[..., 2] = hsv[..., 2] * 0.78
    sown = np.concatenate([hsv_to_rgb(hsv), np.ones(soft.shape[:2] + (1,), np.float32)], -1)
    save_png(sown, f"{TEX_OUT}/sown.png")

    # Strniště: světlá sláma s hnědými stíny brázd (jas originálu, větší kontrast).
    value = luma(small)
    value = np.clip((value - value.mean()) * 1.6 + 0.5, 0, 1)
    stubble = gradient_map(
        value,
        [
            (0.0, (0.36, 0.29, 0.19)),
            (0.35, (0.6, 0.51, 0.34)),
            (0.6, (0.8, 0.72, 0.52)),
            (1.0, (0.96, 0.91, 0.74)),
        ],
    )
    save_png(
        np.concatenate([stubble, np.ones(value.shape + (1,), np.float32)], -1),
        f"{TEX_OUT}/stubble.png",
    )

    # Porost shora: jen jas se slabě teplým nádechem – zelenou nebo zlatou dá scéna.
    crop = load(f"{ART}/textures/terrain/types/furrows_dirt.dds")
    value = luma(crop)
    value = np.clip((value - value.mean()) * 1.4 + 0.62, 0, 1)
    tone = np.stack([value * 1.02, value, value * 0.94, np.ones_like(value)], -1)
    save_png(tone, f"{TEX_OUT}/crop.png")


# --- atlas trsů --------------------------------------------------------------------------------


def fit_cell(sprite, crop_rows=None):
    """Sprite do buňky atlasu (spodek u spodního okraje), volitelně jen řádky (od, do) v podílu výšky."""
    if crop_rows:
        h = sprite.shape[0]
        sprite = sprite[int(crop_rows[0] * h) : int(crop_rows[1] * h)]
    return resize(sprite, CELL, CELL)


def crops_atlas():
    wheat = load(f"{ART}/textures/skins/gaia/farming_wheat_harvest_a.png")
    grass = load(f"{ART}/textures/skins/gaia/grass_field_lush_tall.dds")

    ripe = fit_cell(wheat)
    # zralá pšenice o kousek méně sytá a tmavší – v plném slunci by v poli svítila do oranžova
    hsv = rgb_to_hsv(ripe[..., :3])
    hsv[..., 1] = np.clip(hsv[..., 1] * 0.85, 0, 1)
    hsv[..., 2] *= 0.92
    ripe[..., :3] = hsv_to_rgb(hsv)

    # zelené obilí s klasy: odstín pšenice do modrozelené (listy pšenice jsou ojíněné), tmavší
    green = fit_cell(wheat)
    hsv = rgb_to_hsv(green[..., :3])
    hsv[..., 0] = 0.27 + (hsv[..., 0] - 0.12) * 0.4
    hsv[..., 1] = np.clip(hsv[..., 1] * 0.95 + 0.06, 0, 1)
    hsv[..., 2] *= 0.66
    green[..., :3] = hsv_to_rgb(hsv)

    # vzcházející obilí: tráva, mírně do modrozelené
    sprout = fit_cell(grass)
    sprout[..., :3] *= np.array([0.86, 1.0, 0.86], np.float32)

    # strniště: spodních 35 % stébel natažených na celou buňku, sušší a tmavší
    stubble = fit_cell(wheat, (0.0, 0.35))
    stubble[..., :3] *= np.array([0.82, 0.76, 0.6], np.float32)

    atlas = np.zeros((ATLAS, ATLAS, 4), np.float32)
    # řádek 0 = spodek obrázku (Blender): spodní řada buněk = vzcházející a strniště
    atlas[:CELL, :CELL] = sprout
    atlas[:CELL, CELL:] = stubble
    atlas[CELL:, :CELL] = green
    atlas[CELL:, CELL:] = ripe
    atlas = bleed(atlas)
    path = f"{TMP}/crops.png"
    save_png(atlas, path)
    return path


def stook_texture():
    """Textura panáku: vlevo stébla (seno natažené svisle, do zlaté), vpravo klasy pšenice."""
    hay = load(f"{ART}/textures/skins/props/wrld_hay_a.dds")
    wheat = load(f"{ART}/textures/skins/gaia/farming_wheat_harvest_a.png")
    size = 256
    stalks = resize(resize(hay, 32, 128), size // 2, size)
    stalks[..., :3] *= np.array([1.08, 0.98, 0.72], np.float32)
    stalks[..., 3] = 1
    ears = resize(wheat[int(wheat.shape[0] * 0.55) :], size // 2, size)
    base = np.array([0.72, 0.6, 0.34], np.float32)
    alpha = ears[..., 3:4]
    ears = np.concatenate([ears[..., :3] * alpha + base * (1 - alpha), np.ones_like(alpha)], -1)
    out = np.concatenate([stalks, ears], axis=1)
    path = f"{TMP}/stook.png"
    save_png(out, path)
    return path


# --- modely ------------------------------------------------------------------------------------


def material(name, texture_path, alpha):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not alpha
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(texture_path)
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    if alpha:
        # ořez průhlednosti (glTF alphaMode MASK) – exportér ho pozná z „Round“
        rnd = nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"
        links.new(tex.outputs["Alpha"], rnd.inputs[0])
        links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    return mat


def mesh_object(name, verts, faces, uvs, normals=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for loop, uv in zip(layer.data, uvs):
        loop.uv = uv
    if normals:
        mesh.normals_split_custom_set(normals)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def crop_clump(name, cell, mat):
    """Tři svislé karty do hvězdy (0°, 60°, 120°), pata v počátku; normály skoro nahoru jako tráva."""
    u0, v0 = cell[0] * 0.5 + 0.004, cell[1] * 0.5 + 0.004
    u1, v1 = u0 + 0.492, v0 + 0.492
    verts, faces, uvs, normals = [], [], [], []
    for k in range(3):
        a = math.radians(60 * k + 15)
        dx, dy = math.cos(a) * CARD_W / 2, math.sin(a) * CARD_W / 2
        n = Vector((-math.sin(a), math.cos(a), 0)) * 0.25 + Vector((0, 0, 1))
        n.normalize()
        i = len(verts)
        verts += [(-dx, -dy, 0), (dx, dy, 0), (dx, dy, CARD_H), (-dx, -dy, CARD_H)]
        faces.append((i, i + 1, i + 2, i + 3))
        uvs += [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        normals += [n, n, n, n]
    obj = mesh_object(name, verts, faces, uvs, normals)
    obj.data.materials.append(mat)
    return obj


def stook(mat):
    """Panák: osm snopů v kruhu opřených o sebe a jeden snop navrch klasy dolů (čepice)."""
    verts, faces, uvs = [], [], []
    sides = 7

    def sheaf(base, top, r_base, r_tie, flare, ears_up=True):
        """Snop: stébla od paty k povřislu, nad ním rozevřené klasy."""
        axis = Vector(top) - Vector(base)
        length = axis.length
        axis.normalize()
        side = axis.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = Vector((1, 0, 0))
        side.normalize()
        other = axis.cross(side)
        tie = Vector(base) + axis * length * 0.72
        tip = Vector(top) + axis * (0.22 if ears_up else 0.18)
        # stébla: pata → povříslo (levá půlka textury); klasy: povříslo → rozevřený vrchol
        # → špička (pravá půlka) – povříslo má dva prstence, aby se UV nepřelévala přes šev
        rings = [
            (Vector(base), r_base, 0.0, 0.0),
            (tie, r_tie, 0.0, 1.0),
            (tie, r_tie, 0.5, 0.0),
            (Vector(top), flare, 0.5, 0.45),
            (tip, flare * 0.55, 0.5, 1.0),
        ]
        start = len(verts)
        for center, radius, u_off, v in rings:
            for s in range(sides + 1):
                a = 2 * math.pi * s / sides
                p = center + (side * math.cos(a) + other * math.sin(a)) * radius
                verts.append(tuple(p))
                uvs.append((u_off + 0.5 * s / sides, v))
        row = sides + 1
        for ring in (0, 2, 3):
            for s in range(sides):
                a = start + ring * row + s
                faces.append((a, a + 1, a + row + 1, a + row))

    count = 8
    for k in range(count):
        ang = 2 * math.pi * (k + 0.5) / count
        base = (math.cos(ang) * 0.36, math.sin(ang) * 0.36, 0.0)
        top = (math.cos(ang) * 0.1, math.sin(ang) * 0.1, 0.95)
        sheaf(base, top, 0.12, 0.085, 0.15)
    # čepice: snop klasy dolů přes vrcholy panáku, klasy visí přes snopy jako stříška
    sheaf((0.0, 0.0, 1.45), (0.0, 0.0, 1.12), 0.09, 0.07, 0.3, ears_up=False)

    # UV klasů (horní dva prstence) do pravé poloviny textury: u 0,5–1
    mesh = bpy.data.meshes.new("stook")
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
    mesh.validate()
    obj = bpy.data.objects.new("stook", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def floats(el):
    return [float(v) for v in el.text.split()]


def haystack():
    """Kupka sena z 0 A.D. (nízký kopec) zvýšená do stohu a s tyčí nahoře."""
    root = ET.parse(f"{ART}/meshes/props/wrld_hay_la.dae").getroot()
    geom = root.find(".//c:geometry", NS)
    sources = {s.get("id"): s for s in geom.iter(f"{{{NS['c']}}}source")}

    def data(source_id, stride):
        arr = floats(sources[source_id].find("c:float_array", NS))
        return [arr[i : i + stride] for i in range(0, len(arr), stride)]

    tris = geom.find(".//c:triangles", NS)
    inputs = {i.get("semantic"): i.get("source")[1:] for i in tris.findall("c:input", NS)}
    vertices = geom.find(".//c:vertices", NS)
    pos_src = vertices.find("c:input", NS).get("source")[1:]
    positions = data(pos_src, 3)
    uv_data = data(inputs["TEXCOORD"], 2)
    idx = [int(v) for v in tris.find("c:p", NS).text.split()]
    faces = [tuple(idx[i : i + 3]) for i in range(0, len(idx), 3)]
    # stoh: o polovinu vyšší a užší
    verts = [(p[0] * 0.72, p[1] * 0.72, p[2] * 1.45) for p in positions]
    mesh = bpy.data.meshes.new("haystack")
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uv_data[mesh.loops[li].vertex_index][:2]
    mesh.validate()
    obj = bpy.data.objects.new("haystack", mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # oblé stínování: normály od středu pod kupkou (vrcholy modelu 0 A.D. nejsou sdílené)
    height = max(v[2] for v in verts)
    mesh.normals_split_custom_set(
        [
            Vector((verts[l.vertex_index][0], verts[l.vertex_index][1], (verts[l.vertex_index][2] - height * 0.25) * 1.3)).normalized()
            for l in mesh.loops
        ]
    )
    # tyč stohu: tenký šestiboký kůl z vrcholu (tmavé místo textury sena)
    top = max(v[2] for v in verts)
    pole_verts, pole_faces, pole_uv = [], [], []
    for ring, z in enumerate((top - 0.4, top + 0.55)):
        for s in range(7):
            a = 2 * math.pi * s / 6
            pole_verts.append((math.cos(a) * 0.05, math.sin(a) * 0.05 - 0.09, z))
            pole_uv.append((0.08 + 0.02 * s / 6, 0.1 + 0.05 * ring))
    for s in range(6):
        pole_faces.append((s, s + 1, s + 8, s + 7))
    pole = mesh_object("pole", pole_verts, pole_faces, [pole_uv[i] for f in pole_faces for i in f])
    pole.data.materials.clear()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    pole.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    return obj


def export(objs, path, opaque):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG" if opaque else "AUTO",
        export_apply=True,
    )


def preview(objs, path):
    """Řada modelů zboku pod úhlem kamery hry (rychlá kontrola)."""
    scene = bpy.context.scene
    x = 0.0
    for o in objs:
        width = max(o.dimensions.x, o.dimensions.y)
        o.location = (x + width / 2, 0, 0)
        x += width + 0.6
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = x + 0.4
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    beta = 0.85
    cam.location = (x / 2, -30 * math.sin(beta), 1.2 + 30 * math.cos(beta))
    cam.rotation_euler = (beta, 0, 0)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("w")
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.75, 0.82, 0.9, 1)
    bg.inputs["Strength"].default_value = 0.8
    scene.world = world
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError as e:
        print("engine:", e)
    scene.render.resolution_x = 1600
    scene.render.resolution_y = int(1600 * 0.32)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(TEX_OUT, exist_ok=True)
    os.makedirs(MODEL_OUT, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    field_textures()
    atlas = crops_atlas()
    crop_mat = material("crops", atlas, alpha=True)
    clumps = [
        crop_clump("crop-green", (0, 1), crop_mat),
        crop_clump("crop-ripe", (1, 1), crop_mat),
        crop_clump("crop-sprout", (0, 0), crop_mat),
        crop_clump("crop-stubble", (1, 0), crop_mat),
    ]
    export(clumps, f"{MODEL_OUT}/crops.glb", opaque=False)

    stook_mat = material("stook", stook_texture(), alpha=False)
    stook_obj = stook(stook_mat)
    export([stook_obj], f"{MODEL_OUT}/stook.glb", opaque=True)

    hay_mat = material("haystack", f"{ART}/textures/skins/props/wrld_hay_a.dds", alpha=False)
    hay = haystack()
    hay.data.materials.clear()
    hay.data.materials.append(hay_mat)
    export([hay], f"{MODEL_OUT}/haystack.glb", opaque=True)

    for o in clumps + [stook_obj, hay]:
        print(f"{o.name}: {len(o.data.polygons)} polygonů, rozměr {tuple(round(d, 2) for d in o.dimensions)}")
    if PREVIEW:
        preview(clumps + [stook_obj, hay], PREVIEW)


main()
