"""Bezešvá textura korun lesa pohledem shora, vyrenderovaná z modelů stromů (Cycles).

blender -b --factory-startup --python tools/blender/canopy_texture.py -- \
    apps/web/public/models/trees canopy.png 48 1024 mixed
(pak převést do JPEG: sips -s format jpeg -s formatOptions 85 canopy.png --out .../canopy.jpg)

<models_dir> <out.png> <tile_m> <px> <mix>
mix: "mixed" | "broadleaf" | "conifer"
Stromy se rozmístí na torus (kopie posunuté o ±tile), takže se textura plynule opakuje.
"""
import math
import random
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1 :]
MODELS, OUT, TILE, PX, MIX = args[0], args[1], float(args[2]), int(args[3]), args[4]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

POOLS = {
    "mixed": ["oak-1", "oak-2", "beech-1", "beech-2", "birch-1", "spruce-1", "spruce-2"],
    "broadleaf": ["oak-1", "oak-2", "beech-1", "beech-2", "birch-1", "birch-2"],
    "conifer": ["spruce-1", "spruce-2", "spruce-1", "beech-1"],
}

sources = {}
for name in set(POOLS[MIX]):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{MODELS}/{name}.glb")
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    sources[name] = new[0]
    if name.startswith("spruce"):
        # Stejný posun do modrozelena jako ve scéně (trees.ts).
        for mat in new[0].data.materials:
            nt = mat.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            link = bsdf.inputs["Base Color"].links[0]
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = (0.8, 1.1, 0.95, 1)
            nt.links.new(link.from_socket, mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    for o in bpy.data.objects:
        if o not in before:
            o.hide_render = True

# Poissonovo rozmístění na toru.
rng = random.Random(42)
points = []
min_d = 5.0 if MIX != "conifer" else 4.0
for _ in range(20000):
    x, y = rng.uniform(0, TILE), rng.uniform(0, TILE)
    ok = True
    for px, py, _ in points:
        dx = min(abs(x - px), TILE - abs(x - px))
        dy = min(abs(y - py), TILE - abs(y - py))
        if dx * dx + dy * dy < min_d * min_d:
            ok = False
            break
    if ok:
        points.append((x, y, rng.choice(POOLS[MIX])))
print("trees:", len(points))

for x, y, name in points:
    rot = rng.uniform(0, 2 * math.pi)
    s = rng.uniform(0.8, 1.15)
    for ox in (-TILE, 0, TILE):
        for oy in (-TILE, 0, TILE):
            o = bpy.data.objects.new("t", sources[name].data)
            o.location = (x + ox - TILE / 2, y + oy - TILE / 2, rng.uniform(-1.5, 1.5) * 0)
            o.rotation_euler = (0, 0, rot)
            o.scale = (s, s, s)
            scene.collection.objects.link(o)

# Lesní půda pod korunami – v mezerách tmavý stín.
bpy.ops.mesh.primitive_plane_add(size=TILE * 3, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new("floor")
fm.use_nodes = True
bsdf = next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.012, 0.022, 0.008, 1)
bsdf.inputs["Roughness"].default_value = 1
floor.data.materials.append(fm)

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = TILE
cam = bpy.data.objects.new("cam", cam_data)
cam.location = (0, 0, 100)
scene.collection.objects.link(cam)
scene.camera = cam

# Převážně shora: světlo z oblohy + slabé slunce téměř v zenitu (stíny nesmí mít výrazný směr).
world = bpy.data.worlds.new("w")
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.8, 0.88, 1.0, 1)
bg.inputs["Strength"].default_value = 1.2
scene.world = world
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 2.2
sun.data.angle = math.radians(25)
sun.rotation_euler = (math.radians(12), 0, math.radians(30))
scene.collection.objects.link(sun)

try:
    scene.render.engine = "CYCLES"
except TypeError as e:
    print("engine:", e)
scene.cycles.samples = 96
scene.cycles.use_denoising = True
try:
    scene.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
except Exception as e:
    print("gpu:", e)
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = PX
scene.render.resolution_y = PX
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("saved", OUT)
