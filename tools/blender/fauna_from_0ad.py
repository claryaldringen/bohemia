"""Zvířata z 0 A.D. (skinované COLLADA) -> GLB pro scénu (ryby, ptáci a domácí zvířata).

blender -b --factory-startup --python tools/blender/fauna_from_0ad.py -- \
    tools/blender/fauna.json <0ad>/binaries/data/mods/public/art apps/web/public/models/fauna [náhled.png]

fauna.json: [{"name", "dae", "texture", "forward", "size": {"axis", "m"}, "pose"?, "keys"?,
"key_gain"?, "symmetric"?, "opaque"?, "texture_px"?}]
Kostra ani animace se nepřevádějí – model je statický mesh v základní póze a k ní nejvýš pár
klíčových póz jako morph targety (glTF), všechny napózované snímky animací 0 A.D. (skinning
v Pythonu). Scéna mezi pózami plynule přechází ve vertex shaderu (křídla nahoře / dole, ocas
vlevo / vpravo) – viz apps/web/lib/scene/fauna.ts.
"pose": {"animation", "time"} je základní póza (bez ní klidová póza skinu), "keys": {"jméno":
{"animation", "time"}} klíčové pózy – první je póza +1, druhá −1 (scéna mezi nimi přechází přes
základní pózu), nepovinná třetí se přidává lineárně (domácí zvířata: hlava dole při pastvě –
apps/web/lib/scene/livestock.ts). Klíč může místo animace nést {"bend": {"deg", "pivot", "along",
"above"}} – hlava a krk základní pózy se skloní (kůň, 0 A.D. u něj pastvu nemá). "key_gain" zesílí odchylku klíčových póz od základní, "symmetric" je zrcadlí
podle pravé poloviny (animace se při mávání naklánějí do strany). "forward" je osa,
kam model v 0 A.D. míří ("+y" / "-y"); výsledek míří vždy na -Y (v Babylonu +Z), křídla leží
v ose X a střed obrysu základní pózy je v počátku. "size" model zvětší nebo zmenší tak, aby měl
v dané ose ("x" rozpětí křídel, "y" délka) tolik metrů. "opaque" = textura bez průhlednosti
(JPEG), "texture_px" zmenší větší texturu.

Parser COLLADA je zkrácená kopie tools/blender/trees_from_0ad.py (Blender 5 COLLADA neumí;
ten skript se nedá importovat – po načtení rovnou převádí).
"""
import json
import math
import sys
import xml.etree.ElementTree as ET

import bpy
from mathutils import Matrix, Vector

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}


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
    """Transformace uzlu v pořadí prvků – kořen kostry kozy má měřítko v <scale>, ne v <matrix>."""
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


def skins(root):
    """Skinované meshe ve scéně: (geometry id, element <skin>)."""
    result = []
    for inst in root.findall(".//c:visual_scene//c:instance_controller", NS):
        ctrl = root.find(f".//c:controller[@id='{inst.get('url')[1:]}']", NS)
        skin = ctrl.find("c:skin", NS)
        result.append((skin.get("source")[1:], skin))
    return result


def joint_worlds(anim_root, time):
    """Světové matice kostí (podle jména) ve snímku animace nejblíž času `time` (s)."""
    animated = {}
    for anim in anim_root.findall(".//c:animation", NS):
        channel = anim.find("c:channel", NS)
        if channel is None or not channel.get("target").endswith("/transform"):
            continue
        sampler = anim.find("c:sampler", NS)
        inputs = {i.get("semantic"): i.get("source")[1:] for i in sampler.findall("c:input", NS)}
        times = [t[0] for t in source_data(anim_root, inputs["INPUT"])]
        values = source_data(anim_root, inputs["OUTPUT"])
        k = min(range(len(times)), key=lambda i: abs(times[i] - time))
        animated[channel.get("target").split("/")[0]] = matrix16(values[k])
    worlds = {}

    def walk(node, parent):
        local = animated.get(node.get("id"))
        world = parent @ (local if local is not None else node_matrix(node))
        worlds[node.get("sid") or node.get("name")] = world
        for child in node.findall("c:node", NS):
            walk(child, world)

    for node in anim_root.findall(".//c:visual_scene/c:node", NS):
        walk(node, Matrix.Identity(4))
    return worlds


def skin_transform(root, skin, pose):
    """Funkce (index vrcholu) -> matice pózy vrcholu; bez pózy jen bind_shape_matrix."""
    bsm_el = skin.find("c:bind_shape_matrix", NS)
    bsm = matrix16(floats(bsm_el)) if bsm_el is not None else Matrix.Identity(4)
    if pose is None:
        return lambda i: bsm
    joints_el = skin.find("c:joints", NS)
    by_sem = {i.get("semantic"): i.get("source")[1:] for i in joints_el.findall("c:input", NS)}
    names = root.find(f".//c:source[@id='{by_sem['JOINT']}']/c:Name_array", NS).text.split()
    inv_bind = [matrix16(m) for m in source_data(root, by_sem["INV_BIND_MATRIX"])]
    worlds = joint_worlds(ET.parse(pose["animation"]).getroot(), pose.get("time", 0.0))
    skinning = [worlds[n] @ inv_bind[j] @ bsm for j, n in enumerate(names)]

    vw = skin.find("c:vertex_weights", NS)
    inputs = vw.findall("c:input", NS)
    stride = max(int(i.get("offset")) for i in inputs) + 1
    j_off = int(next(i for i in inputs if i.get("semantic") == "JOINT").get("offset"))
    w_in = next(i for i in inputs if i.get("semantic") == "WEIGHT")
    w_off = int(w_in.get("offset"))
    weights = [w[0] for w in source_data(root, w_in.get("source")[1:])]
    counts = ints(vw.find("c:vcount", NS))
    v = ints(vw.find("c:v", NS))
    blended = []
    k = 0
    for count in counts:
        m = Matrix([[0.0] * 4 for _ in range(4)])
        total = 0.0
        for _ in range(count):
            w = weights[v[k + w_off]]
            m += skinning[v[k + j_off]] * w
            total += w
            k += stride
        blended.append(m * (1.0 / total) if total > 0 else bsm)
    return lambda i: blended[i]


def geometry_positions(root, geom_id):
    geom = root.find(f".//c:geometry[@id='{geom_id}']", NS)
    verts_el = geom.find("c:mesh/c:vertices", NS)
    pos_src = verts_el.find("c:input[@semantic='POSITION']", NS).get("source")[1:]
    return [Vector(v[:3]) for v in source_data(root, pos_src)]


def build_mesh(root, geom_id, vertex_matrix, name):
    """Mesh z geometrie; `vertex_matrix(i)` je matice pózy vrcholu i."""
    geom = root.find(f".//c:geometry[@id='{geom_id}']", NS)
    mesh_el = geom.find("c:mesh", NS)
    positions = geometry_positions(root, geom_id)

    faces, uvs, normals = [], [], []
    prims = mesh_el.findall("c:triangles", NS) + mesh_el.findall("c:polylist", NS)
    for tris in prims:
        inputs = tris.findall("c:input", NS)
        stride = max(int(i.get("offset")) for i in inputs) + 1
        p = ints(tris.find("c:p", NS))
        by_sem = {i.get("semantic"): i for i in inputs}
        v_off = int(by_sem["VERTEX"].get("offset"))
        n_in = by_sem.get("NORMAL")
        t_in = by_sem.get("TEXCOORD")
        n_data = source_data(root, n_in.get("source")[1:]) if n_in is not None else None
        t_data = source_data(root, t_in.get("source")[1:]) if t_in is not None else None
        vcount_el = tris.find("c:vcount", NS)
        counts = ints(vcount_el) if vcount_el is not None else [3] * (len(p) // (stride * 3))
        k = 0
        for count in counts:
            corners = [p[k + c * stride : k + (c + 1) * stride] for c in range(count)]
            k += count * stride
            faces.append([c[v_off] for c in corners])
            if t_data:
                uvs.extend(t_data[c[int(t_in.get("offset"))]][:2] for c in corners)
            if n_data:
                normals.extend(
                    (vertex_matrix(c[v_off]).to_3x3() @ Vector(n_data[c[int(n_in.get("offset"))]][:3]))
                    .normalized()
                    for c in corners
                )

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([vertex_matrix(i) @ v for i, v in enumerate(positions)], [], faces)
    if uvs:
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(layer.data, uvs):
            loop.uv = uv
    if normals:
        mesh.normals_split_custom_set(normals)
    mesh.validate()
    # Shape keys se přiřazují podle pořadí vrcholů – validace žádný nesmí odebrat.
    assert len(mesh.vertices) == len(positions), f"{name}: validace změnila vrcholy"
    return mesh


def make_material(name, texture_path, opaque, texture_px):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    # Křídla a ploutve jsou jednoduché plochy – scéna kreslí obě strany sama.
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(texture_path)
    if texture_px and max(tex.image.size) > texture_px:
        w, h = tex.image.size
        f = texture_px / max(w, h)
        tex.image.scale(max(1, round(w * f)), max(1, round(h * f)))
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    if not opaque:
        # Ořez průhlednosti (glTF alphaMode MASK) – exportér ho pozná z „Round“.
        rnd = nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"
        links.new(tex.outputs["Alpha"], rnd.inputs[0])
        links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    return mat


def mirror_pairs(rest):
    """Pro každý vrchol jeho zrcadlový protějšek podle roviny x = 0 (v klidové póze)."""
    pairs = []
    for v in rest:
        target = Vector((-v.x, v.y, v.z))
        j = min(range(len(rest)), key=lambda k: (rest[k] - target).length_squared)
        if (rest[j] - target).length > 0.02 * max(r.length for r in rest):
            raise ValueError(f"vrchol {tuple(v)} nemá zrcadlový protějšek")
        pairs.append(j)
    return pairs


def symmetrize(points, rest, pairs):
    """Póza souměrná podle x = 0: polovina s x < 0 je zrcadlem poloviny s x > 0, střed na ose."""
    result = []
    for i, p in enumerate(points):
        q = points[pairs[i]]
        mirrored = Vector((-q.x, q.y, q.z))
        if pairs[i] == i or abs(rest[i].x) < 1e-5:
            result.append((p + mirrored) / 2)
        else:
            result.append(p.copy() if rest[i].x > 0 else mirrored)
    return result


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bend_pose(base, forward, bend):
    """Sklon přední části těla dolů (hlava při pastvě). bend: {"deg", "pivot": [podél těla od zadu,
    výška] jako podíl rozměrů, "along": [od, do] podíl délky těla a "above": [od, do] podíl výšky,
    kde váha roste z 0 na 1}. Otáčí se kolem osy X (napříč tělem) přes pivot, váha = součin
    hladkých přechodů podle polohy podél těla a výšky."""
    sign = 1.0 if forward == "+y" else -1.0
    ys = [sign * c.y for c in base]
    zs = [c.z for c in base]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    py = y0 + (y1 - y0) * bend["pivot"][0]
    pz = z0 + (z1 - z0) * bend["pivot"][1]
    out = []
    for c, y in zip(base, ys):
        w = smoothstep(*bend["along"], (y - y0) / (y1 - y0)) * smoothstep(
            *bend["above"], (c.z - z0) / (z1 - z0)
        )
        # v souřadnicích „dopředu“ (dy) úhel dolů otáčí dy nahoru k dz záporně
        a = -math.radians(bend["deg"]) * w
        dy, dz = y - py, c.z - pz
        ny = dy * math.cos(a) - dz * math.sin(a)
        nz = dy * math.sin(a) + dz * math.cos(a)
        out.append(Vector((c.x, sign * (py + ny), pz + nz)))
    return out


def import_animal(spec):
    root = ET.parse(spec["dae"]).getroot()
    up = root.findtext(".//c:asset/c:up_axis", default="Z_UP", namespaces=NS).strip()
    fix = Matrix.Rotation(math.radians(90), 4, "X") if up == "Y_UP" else Matrix.Identity(4)
    found = skins(root)
    if len(found) != 1:
        raise ValueError(f"{spec['name']}: čekám jeden skinovaný mesh, je jich {len(found)}")
    gid, skin = found[0]
    pose = skin_transform(root, skin, spec.get("pose"))
    mesh = build_mesh(root, gid, lambda i: fix @ pose(i), spec["name"])
    obj = bpy.data.objects.new(spec["name"], mesh)
    bpy.context.scene.collection.objects.link(obj)

    positions = geometry_positions(root, gid)
    keys = spec.get("keys", {})
    poses = {
        name: [fix @ transform(i) @ v for i, v in enumerate(positions)]
        for name, transform in [(None, pose)]
        + [(k, skin_transform(root, skin, p)) for k, p in keys.items() if "animation" in p]
    }
    # Klíč „bend“ (kůň nemá v 0 A.D. pastvu): hlava a krk se v základní póze skloní kolem
    # osy napříč tělem, viz bend_pose.
    for name, key in keys.items():
        if "bend" in key:
            poses[name] = bend_pose(poses[None], spec["forward"], key["bend"])
    if spec.get("symmetric"):
        # Animace 0 A.D. se při mávání naklání do strany – klíčové pózy mají být souměrné, náklon
        # (do zatáčky) dělá scéna sama. Zachová se pravá polovina (x > 0).
        rest_matrix = skin_transform(root, skin, None)
        rest = [fix @ rest_matrix(i) @ v for i, v in enumerate(positions)]
        pairs = mirror_pairs(rest)
        poses = {name: symmetrize(points, rest, pairs) for name, points in poses.items()}
        for v, co in zip(mesh.vertices, poses[None]):
            v.co = co
        # Normály skinu by k souměrné póze neseděly – Blender je spočítá z tvaru.
        mesh.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(mesh.loops))
        for poly in mesh.polygons:
            poly.use_smooth = True

    # Malý pohyb (ocas ryby se v 0 A.D. sotva hne) se dá zesílit – z dálky by nebyl vidět.
    gain = spec.get("key_gain", 1.0)
    for key_name in keys:
        poses[key_name] = [b + (k - b) * gain for b, k in zip(poses[None], poses[key_name])]

    # Klíčové pózy jako shape keys – glTF je vyveze jako morph targety ve stejném pořadí vrcholů.
    if keys:
        obj.shape_key_add(name="Basis", from_mix=False)
        for key_name in keys:
            key = obj.shape_key_add(name=key_name, from_mix=False)
            for point, co in zip(key.data, poses[key_name]):
                point.co = co

    obj.data.materials.append(
        make_material(
            f"{spec['name']}-material",
            spec["texture"],
            spec.get("opaque", False),
            spec.get("texture_px"),
        )
    )
    if spec["forward"] == "+y":
        mesh.transform(Matrix.Rotation(math.pi, 4, "Z"), shape_keys=True)
    lo = Vector([min(v.co[i] for v in mesh.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in mesh.vertices) for i in range(3)])
    mesh.transform(Matrix.Translation(-(lo + hi) / 2), shape_keys=True)
    axis = "xyz".index(spec["size"]["axis"])
    s = spec["size"]["m"] / (hi[axis] - lo[axis])
    mesh.transform(Matrix.Scale(s, 4), shape_keys=True)
    d = (hi - lo) * s
    if mesh.shape_keys:
        basis = mesh.shape_keys.key_blocks[0].data
        for kb in mesh.shape_keys.key_blocks[1:]:
            moved = max((p.co - b.co).length for p, b in zip(kb.data, basis))
            print(f"  {kb.name}: posun až {moved:.3f} m")
    print(
        f"{spec['name']}: {len(mesh.polygons)} tris, {len(mesh.vertices)} verts, "
        f"{d.x:.2f} x {d.y:.2f} x {d.z:.2f} m, keys {list(keys)}"
    )
    return obj


def export(obj, path, opaque):
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
        export_image_format="JPEG" if opaque else "AUTO",
        # Modifikátory model nemá; jejich aplikace by shape keys zahodila.
        export_apply=False,
        export_morph=True,
        export_morph_normal=False,
        export_morph_animation=False,
    )


def preview(objs, path):
    """Každé zvíře ve všech pózách (základní + klíčové) šikmo zepředu – hlava míří ke kameře."""
    scene = bpy.context.scene
    columns = []
    for o in objs:
        columns.append((o, None))
        if o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks[1:]:
                copy = o.copy()
                copy.data = o.data.copy()
                scene.collection.objects.link(copy)
                for other in copy.data.shape_keys.key_blocks[1:]:
                    other.value = 1.0 if other.name == kb.name else 0.0
                columns.append((copy, kb.name))
    gap = 2.6
    for i, (o, _) in enumerate(columns):
        o.location = ((i - (len(columns) - 1) / 2) * gap, 0, 0)
        o.scale = (1.0 / max(o.dimensions.x, o.dimensions.y) * 2.0,) * 3
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = gap * len(columns)
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    # Šikmo zepředu a shora (model míří na -Y).
    cam.location = (0, -20, 12)
    cam.rotation_euler = (math.radians(59), 0, 0)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.75, 0.82, 0.9, 1)
    scene.world = world
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError as e:
        print("engine:", e)
    scene.render.resolution_x = 260 * len(columns)
    scene.render.resolution_y = 300
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    job_path, art_dir, out_dir = args[0], args[1], args[2]
    preview_path = args[3] if len(args) > 3 else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = []
    for spec in json.load(open(job_path)):
        spec["dae"] = f"{art_dir}/{spec['dae']}"
        spec["texture"] = f"{art_dir}/{spec['texture']}"
        for pose in [spec.get("pose"), *spec.get("keys", {}).values()]:
            if pose and "animation" in pose:
                pose["animation"] = f"{art_dir}/{pose['animation']}"
        obj = import_animal(spec)
        export(obj, f"{out_dir}/{spec['name']}.glb", spec.get("opaque", False))
        objs.append(obj)
    if preview_path:
        preview(objs, preview_path)


main()
