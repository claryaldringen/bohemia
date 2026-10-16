"""Stromy z 0 A.D. (COLLADA) -> GLB pro scénu. Blender 5 už COLLADA neumí, proto vlastní parser.

blender -b --factory-startup --python tools/blender/trees_from_0ad.py -- \
    tools/blender/trees.json <0ad>/binaries/data/mods/public/art apps/web/public/models/trees [náhled.png]

trees.json: [{"name", "dae", "texture", "foliage"?, "scale"?} | {"name", "parts": [...], "scale"?}]
Cesty k .dae a texturám jsou relativní k art/ složce 0 A.D.; "foliage" nastaví normály listí
od středu koruny ("all", nebo {"u_below": u} pro atlas s kůrou vpravo).
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


def node_matrix(node):
    m = Matrix.Identity(4)
    for child in node:
        tag = child.tag.split("}")[1]
        vals = floats(child) if child.text else []
        if tag == "matrix":
            m = m @ Matrix([vals[0:4], vals[4:8], vals[8:12], vals[12:16]])
        elif tag == "translate":
            m = m @ Matrix.Translation(Vector(vals))
        elif tag == "rotate":
            m = m @ Matrix.Rotation(math.radians(vals[3]), 4, Vector(vals[:3]))
        elif tag == "scale":
            m = m @ Matrix.Diagonal(Vector(vals + [1.0]))
    return m


def geometry_instances(root):
    """(geometry id, světová matice) pro každou instanci geometrie ve scéně."""
    result = []

    def walk(node, parent):
        world = parent @ node_matrix(node)
        for inst in node.findall("c:instance_geometry", NS):
            result.append((inst.get("url")[1:], world))
        for child in node.findall("c:node", NS):
            walk(child, world)

    for node in root.findall(".//c:visual_scene/c:node", NS):
        walk(node, Matrix.Identity(4))
    return result


def build_mesh(root, geom_id, world, name):
    geom = root.find(f".//c:geometry[@id='{geom_id}']", NS)
    mesh_el = geom.find("c:mesh", NS)
    verts_el = mesh_el.find("c:vertices", NS)
    pos_src = verts_el.find("c:input[@semantic='POSITION']", NS).get("source")[1:]
    positions = source_data(root, pos_src)

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
            poly = [p[k + c * stride : k + (c + 1) * stride] for c in range(count)]
            k += count * stride
            corners = poly
            faces.append([c[v_off] for c in corners])
            if t_data:
                uvs.extend(t_data[c[int(t_in.get("offset"))]][:2] for c in corners)
            if n_data:
                normals.extend(n_data[c[int(n_in.get("offset"))]][:3] for c in corners)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([world @ Vector(v[:3]) for v in positions], [], faces)
    if uvs:
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(layer.data, uvs):
            loop.uv = uv
    if normals:
        rot = world.to_3x3().inverted().transposed()
        mesh.normals_split_custom_set([(rot @ Vector(n)).normalized() for n in normals])
    mesh.validate()
    return mesh


def make_material(name, texture_path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(texture_path)
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    # Ořez průhlednosti (glTF alphaMode MASK, cutoff 0,5) – exportér ho pozná z „Round“.
    rnd = nodes.new("ShaderNodeMath")
    rnd.operation = "ROUND"
    links.new(tex.outputs["Alpha"], rnd.inputs[0])
    links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def named_node_matrix(root, name):
    """Světová matice uzlu daného jména (bod pro připojení koruny)."""
    found = []

    def walk(node, parent):
        world = parent @ node_matrix(node)
        if node.get("name") == name or node.get("id") == name:
            found.append(world)
        for child in node.findall("c:node", NS):
            walk(child, world)

    for node in root.findall(".//c:visual_scene/c:node", NS):
        walk(node, Matrix.Identity(4))
    return found[0] if found else Matrix.Identity(4)



def foliage_normals(obj, rule):
    """Normály listí od středu koruny (mírně nahoru) – koruna se stínuje jako celek, ne po kartách."""
    mesh = obj.data
    uv = mesh.uv_layers[0].data if mesh.uv_layers else None

    def is_leaf(poly):
        if rule == "all":
            return True
        u = sum(uv[i].uv[0] for i in poly.loop_indices) / poly.loop_total
        return u < rule["u_below"]

    leaf_polys = [p for p in mesh.polygons if is_leaf(p)]
    if not leaf_polys:
        return
    pts = [mesh.vertices[v].co for p in leaf_polys for v in p.vertices]
    lo = Vector((min(c.x for c in pts), min(c.y for c in pts), min(c.z for c in pts)))
    hi = Vector((max(c.x for c in pts), max(c.y for c in pts), max(c.z for c in pts)))
    center = (lo + hi) / 2
    half = (hi - lo) / 2
    normals = [Vector(l.normal) for l in mesh.loops]
    for p in leaf_polys:
        for li in p.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            d = co - center
            d = Vector((d.x / max(half.x, 0.01), d.y / max(half.y, 0.01), d.z / max(half.z, 0.01)))
            n = d.normalized() if d.length > 1e-4 else Vector((0, 0, 1))
            normals[li] = (n + Vector((0, 0, 0.5))).normalized()
    mesh.normals_split_custom_set(normals)

def import_part(dae, texture, offset, name, foliage=None):
    root = ET.parse(dae).getroot()
    up = root.findtext(".//c:asset/c:up_axis", default="Z_UP", namespaces=NS).strip()
    # 0 A.D. jednotky z <unit> ignoruje – souřadnice jsou vždy v „metrech“ hry.
    fix = Matrix.Rotation(math.radians(90), 4, "X") if up == "Y_UP" else Matrix.Identity(4)
    objs = []
    for gid, w in geometry_instances(root):
        mesh = build_mesh(root, gid, fix @ offset @ w, name)
        o = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    mat = make_material(f"{name}-{len(bpy.data.materials)}", texture)
    for o in objs:
        o.data.materials.append(mat)
        if foliage:
            foliage_normals(o, foliage)
    return root, objs


def import_tree(spec):
    parts = spec.get("parts") or [
        {"dae": spec["dae"], "texture": spec["texture"], "foliage": spec.get("foliage")}
    ]
    base_root, objs = import_part(
        parts[0]["dae"], parts[0]["texture"], Matrix.Identity(4), spec["name"], parts[0].get("foliage")
    )
    for part in parts[1:]:
        offset = named_node_matrix(base_root, part["attach"]) if part.get("attach") else Matrix.Identity(4)
        objs += import_part(part["dae"], part["texture"], offset, spec["name"], part.get("foliage"))[1]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = spec["name"]

    # Kořen u paty kmene; měřítko 0 A.D. (≈ metry) ponechané, jen volitelně upravené.
    zs = [v.co.z for v in obj.data.vertices]
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    base = [v.co for v in obj.data.vertices if v.co.z < min(zs) + 0.05 * (max(zs) - min(zs))]
    cx = sum(c.x for c in base) / len(base)
    cy = sum(c.y for c in base) / len(base)
    obj.data.transform(Matrix.Translation((-cx, -cy, -min(zs))))
    s = spec.get("scale", 1.0)
    obj.data.transform(Matrix.Scale(s, 4))
    print(
        f"{spec['name']}: {len(obj.data.polygons)} tris, {len(obj.data.materials)} mat, "
        f"h={(max(zs) - min(zs)) * s:.1f} m, w={(max(xs) - min(xs)) * s:.1f}x{(max(ys) - min(ys)) * s:.1f} m"
    )
    return obj


def export(obj, path):
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
        export_image_format="AUTO",
        export_apply=True,
    )


def preview(objs, path):
    """Řada stromů zboku (ortho, EEVEE) pro rychlou kontrolu."""
    scene = bpy.context.scene
    gap = 14.0
    for i, o in enumerate(objs):
        o.location.x = (i - (len(objs) - 1) / 2) * gap
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.sensor_fit = "VERTICAL"
    cam_data.ortho_scale = 26
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, -60, 11)
    cam.rotation_euler = (math.radians(88), 0, 0)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.75, 0.82, 0.9, 1)
    bg.inputs["Strength"].default_value = 0.8
    scene.world = world
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError as e:
        print("engine:", e)
    scene.render.resolution_y = 400
    scene.render.resolution_x = int(400 * gap * len(objs) / 26)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :]
    job_path, art_dir, out_dir = args[0], args[1], args[2]
    preview_path = args[3] if len(args) > 3 else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = []
    for spec in json.load(open(job_path)):
        for part in spec.get("parts", [spec]):
            for key in ("dae", "texture"):
                if key in part:
                    part[key] = f"{art_dir}/{part[key]}"
        obj = import_tree(spec)
        export(obj, f"{out_dir}/{spec['name']}.glb")
        objs.append(obj)
    if preview_path:
        preview(objs, preview_path)


main()
