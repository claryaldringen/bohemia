"""Raně slovanská zemnice a polozemnice (6.–9. st.) procedurálně – omazané stěny
(mazanice), slámové došky, jeden atlas (trim sheet) z textur 0 A.D. → jeden materiál na model.

blender -b --factory-startup --python tools/blender/dwellings.py -- \
    <atlas_dir> <props_glb_dir> apps/web/public/models/dwellings <render_dir|->

props_glb_dir: koše z 0 A.D. (basket-a.glb, basket-b.glb) převedené přes trees_from_0ad.py
s tools/blender/dwelling-props.json. render_dir: náhledy v Cycles, "-" = bez náhledů.
atlas_dir: atlas.jpg + atlas.json z tools/blender/atlas.py (pásy opakované v U, plochy ve V uvnitř
pásu podle metrů; oblasti „veg“ a „soil“ pro zeleninu a záhony pozemku). Souřadnice Blenderu: Z nahoru, hřeben střechy podél osy Y, vchod na štítu
v -Y. Počátek = střed půdorysu na úrovni původního terénu. V glTF (a ve scéně při natočení 0)
míří vchod do +Z. Jámu se šíjí a schody kreslí scéna (apps/web/lib/scene/dwelling-pit.ts –
rozměry musí sedět s DOOR, *_RAMP a půdorysy jam tady); modely mají jen štíty, ostění dveří
a sloupy, které do jámy sahají. Střecha přečnívá před oba štíty o GABLE_OVERHANG.

Výstup: zemnice.glb, polozemnice.glb (hotová obydlí), woven-fence.glb (díly pleteného plotu
pozemku polozemnice i hřbitova: kůl, kůl branky, kus proplétané větve – rozmístí je scéna,
apps/web/lib/scene/woven-fence.ts a woven-fence-renderer.ts), homestead.glb (záhon a rostliny
pozemku – apps/web/lib/scene/homestead-layout.ts a homestead.ts) a construction.glb – díly staveniště
po fázích (uzly „zemnice-…“, „polozemnice-…“: kolíky, sloupy, krov, latě, výplet, srub, řady
došků zdola nahoru, hřeben, valy) a rekvizity („site-…“); kdy se který díl ukáže, určuje
apps/web/lib/scene/village-construction.ts (plot a záhony pozemku tam mají vlastní fáze).
Hráň polen ani samostatný kus plotu vedle obydlí nejsou (Martin). Polozemnice stojí na pozemku
velkém jako políčko pole (15 × 15 m) obehnaném polským plotem – řidší kůly a vodorovně
proplétané větve, zakulacené rohy (Martin: hranaté rohy se v polském plotu dělají špatně),
branka proti vchodu – a ve zbytku jsou záhony (zelí, řepa, cibule, kopr). Proutěný plot hřbitova
je týž pletený plot ze stejných dílů, jen s hustším pletivem (Martin).

Celý postup (art = <0ad>/binaries/data/mods/public/art, PNG z DDS viz atlas.py):
  python3 -I tools/blender/atlas.py <celt_struct_1.png> <celt_struct.png> \
      apps/web/public/textures/terrain <basket_celt_1.png> /tmp/dwelling-atlas
  blender -b --factory-startup --python tools/blender/trees_from_0ad.py -- \
      tools/blender/dwelling-props.json art /tmp/dwelling-props
  blender -b --factory-startup --python tools/blender/dwellings.py -- \
      /tmp/dwelling-atlas /tmp/dwelling-props apps/web/public/models/dwellings -
  blender -b --factory-startup --python tools/blender/trees_from_0ad.py -- \
      tools/blender/dwelling-grass.json art apps/web/public/models/dwellings
Poslední krok jsou trsy trávy u okapu (grass-tuft-1.glb, grass-tuft-2.glb).

Dvorec vojvody (docs/design/trade.md – Dvorec vojvody; dvorec.glb, brána pozemku dvorec-gate.glb
a díly staveniště dvorec-construction.glb – uzly „dvorec-…“) se exportuje zvlášť pátým argumentem
„dvorec“ – ostatní GLB se nepřepíšou, koše netřeba:
  blender -b --factory-startup --python tools/blender/dwellings.py -- \
      /tmp/dwelling-atlas - apps/web/public/models/dwellings /tmp/dvorec-renders dvorec

Rozpad obydlí (decay.glb – stupně sešlý, propadá se, zřícený a zbytek jámy po zániku, kopřivy;
podrobně v sekci „rozpad obydlí“ níže, který stupeň kdy, určuje apps/web/lib/scene/dwelling-decay.ts)
se exportuje zvlášť pátým argumentem „decay“ – ostatní GLB obydlí se tím nepřepíšou, koše netřeba:
  blender -b --factory-startup --python tools/blender/dwellings.py -- \
      /tmp/dwelling-atlas - apps/web/public/models/dwellings /tmp/decay-renders decay
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
ATLAS, PROPS, OUT, RENDER = args[0], args[1], args[2], args[3]
# pátý argument „decay“ = jen díly rozpadu obydlí (decay.glb), ostatní GLB se nepřepisují;
# „dvorec“ = jen dvorec vojvody (dvorec.glb, dvorec-gate.glb, dvorec-construction.glb)
DECAY_ONLY = len(args) > 4 and args[4] == "decay"
DVOREC_ONLY = len(args) > 4 and args[4] == "dvorec"
META = json.load(open(os.path.join(ATLAS, "atlas.json")))
AW, AH, UPER = META["W"], META["H"], META["uperiod_m"]
BANDS, REGIONS = META["bands"], META["regions"]

COURSES = META["thatch_courses"]  # hranice řad došků po spádu od okapu (m) – sedí s atlasem
LIP = 0.06  # o kolik spodní hrana řady přečnívá řadu pod ní (m)
THATCH_NY = 6  # dílků řady došků podél hřebene (díly rozpadu jemněji – díry nejsou po metru)


def noise(x, y):
    """Deterministický jemný šum (nezávislé plochy na sebe navazují)."""
    return (
        0.045 * math.sin(1.7 * x + 2.3 * y + 0.4)
        + 0.03 * math.sin(3.1 * y - 0.7 * x + 1.3)
        + 0.02 * math.sin(5.3 * x + 4.1 * y)
    )


def atlas_uv(mat, u, v):
    """Metrické (u, v) plochy → UV v atlasu. Pás: u se opakuje, v se mapuje do pásu.
    Oblast (region): u, v jsou normalizované 0–1."""
    if mat in BANDS:
        b = BANDS[mat]
        t = min(1.0, max(0.0, (v - b["vmin"]) / (b["vmax"] - b["vmin"])))
        row = b["r1"] - t * (b["r1"] - b["r0"])
        return (u / UPER, 1 - row / AH)
    r = REGIONS[mat]
    if mat == "dark":
        u = v = 0.5
    u = min(1.0, max(0.0, u))
    v = min(1.0, max(0.0, v))
    x = r["x0"] + u * (r["x1"] - r["x0"])
    row = r["r1"] - v * (r["r1"] - r["r0"])
    return (x / AW, 1 - row / AH)


class Builder:
    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.uvs = []
        self.smooth = []  # plochy valů – měkké normály, u paty svisle nahoru jako terén
        self._smooth_now = False

    def poly(self, pts, mat, frame=None, out=None, uvm=None):
        """Polygon; `out` = přibližný směr ven (převrátí pořadí vrcholů, když nesedí).
        uvm = metrické (u, v) každého vrcholu; jinak z frame = (origin, u_axis, v_axis), bez
        něj automaticky (svislá stěna: u vodorovně, v = výška z; vodorovná plocha: x, y)."""
        pts = [Vector(p) for p in pts]
        n = Vector((0, 0, 0))
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            n.x += (a.y - b.y) * (a.z + b.z)
            n.y += (a.z - b.z) * (a.x + b.x)
            n.z += (a.x - b.x) * (a.y + b.y)
        if uvm is not None:
            uvm = list(uvm)
        if out is not None and n.dot(Vector(out)) < 0:
            pts.reverse()
            if uvm is not None:
                uvm.reverse()
            n = -n
        if n.length < 1e-9:
            return
        n.normalize()
        if uvm is None:
            if frame is None:
                if abs(n.z) > 0.7:
                    frame = (Vector((0, 0, 0)), Vector((1, 0, 0)), Vector((0, 1, 0)))
                else:
                    u = Vector((0, 0, 1)).cross(n).normalized()
                    frame = (Vector((0, 0, 0)), -u, Vector((0, 0, 1)))
            o, u, v = frame
            uvm = [((p - o).dot(u), (p - o).dot(v)) for p in pts]
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(list(range(base, base + len(pts))))
        self.uvs.append([atlas_uv(mat, a, b) for a, b in uvm])
        self.smooth.append(self._smooth_now)

    def box(self, x0, x1, y0, y1, z0, z1, mat, skip=()):
        faces = {
            "-x": ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
            "+x": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            "+y": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
            "-z": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
            "+z": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        }
        for key, (pts, out) in faces.items():
            if key not in skip:
                self.poly(pts, mat, out=out)

    def log_stub(self, x0, x1, y0, y1, z0, z1, along, zoff=0.0):
        """Konec trámu přečnívající na nároží: boky kůra (trámy nad sebou), čelo letokruhy.
        along = 'x' nebo 'y' – směr trámu; u = výška (pás se opakuje po trámech)."""
        xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
        P = lambda x, y, z: (x, y, z)
        if along == "y":
            for x, out in ((x0, (-1, 0, 0)), (x1, (1, 0, 0))):
                pts = [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)]
                self.poly(pts, "logs_rot", out=out, uvm=[(p[2] + zoff, p[1] - yc) for p in pts])
            for y, out in ((y0, (0, -1, 0)), (y1, (0, 1, 0))):
                pts = [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)]
                self.poly(pts, "logends", out=out, uvm=[(p[2] + zoff, p[0] - xc) for p in pts])
        else:
            for y, out in ((y0, (0, -1, 0)), (y1, (0, 1, 0))):
                pts = [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)]
                self.poly(pts, "logs_rot", out=out, uvm=[(p[2] + zoff, p[0] - xc) for p in pts])
            for x, out in ((x0, (-1, 0, 0)), (x1, (1, 0, 0))):
                pts = [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)]
                self.poly(pts, "logends", out=out, uvm=[(p[2] + zoff, p[1] - yc) for p in pts])
        pts = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]
        self.poly(pts, "logs_rot", out=(0, 0, 1), uvm=[(p[0], p[1] - yc) for p in pts])

    def beam(self, a, b, size, mat="beam"):
        """Trám se čtvercovým průřezem z bodu a do b (u podél trámu, v přes stěnu)."""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        length = (b - a).length
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(d).normalized()
        h = size / 2
        ring = [side * h + up * h, -side * h + up * h, -side * h - up * h, side * h - up * h]
        off = (a.x * 3.1 + a.y * 1.7) % UPER  # každý trám jiný kus kůry
        for i in range(4):
            p, q = ring[i], ring[(i + 1) % 4]
            outv = (p + q).normalized()
            self.poly(
                [a + p, a + q, b + q, b + p],
                mat,
                out=outv,
                uvm=[(off, -h), (off, h), (off + length, h), (off + length, -h)],
            )
        for c, o in ((a, -d), (b, d)):
            self.poly([c + r for r in ring], mat, out=o, uvm=[(r.dot(side), r.dot(up)) for r in ring])

    def plank(self, a, b, width, thick, mat="beam"):
        """Prkno ve svislé rovině y = konst. (šířka v rovině XZ, tloušťka podél Y)."""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        length = (b - a).length
        t_ax = Vector((0, 1, 0))
        w_ax = t_ax.cross(d).normalized()
        hw, ht = width / 2, thick / 2
        ring = [w_ax * hw + t_ax * ht, -w_ax * hw + t_ax * ht, -w_ax * hw - t_ax * ht, w_ax * hw - t_ax * ht]
        half = [hw, ht, hw, ht]
        off = (a.x * 3.1 + a.y * 1.7) % UPER
        for i in range(4):
            p, q = ring[i], ring[(i + 1) % 4]
            span = (q - p).length / 2
            self.poly(
                [a + p, a + q, b + q, b + p],
                mat,
                out=(p + q).normalized(),
                uvm=[(off, -span), (off, span), (off + length, span), (off + length, -span)],
            )
        for c, o in ((a, -d), (b, d)):
            self.poly([c + r for r in ring], mat, out=o, uvm=[(r.dot(w_ax), r.dot(t_ax)) for r in ring])

    def berm(self, p0, p1, height, width, segments=3, mat="turf"):
        """Nízký val vykopané hlíny podél úsečky – trojúhelníkový průřez, zkosené konce.
        u podél valu, v od paty k hřbetu (pás drnů: dole tráva, nahoře hlína)."""
        self._smooth_now = True
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        length = d.length
        d.normalize()
        side = Vector((-d.y, d.x, 0))
        taper = min(width * 0.6, length * 0.3)
        top = []
        for i in range(segments + 1):
            t = i / segments
            c = p0 + d * (taper + (length - 2 * taper) * t)
            top.append(c + Vector((0, 0, height * (1 + 2.5 * noise(c.x, c.y)))))
        base_l = [p0 + d * (length * i / segments) + side * width / 2 for i in range(segments + 1)]
        base_r = [p0 + d * (length * i / segments) - side * width / 2 for i in range(segments + 1)]

        def uv_side(pts, origin):
            res = []
            for p in pts:
                r = p - origin
                along = r.dot(d)
                res.append((along, (r - d * along).length))
            return res

        def uv_end(pts, origin):
            res = []
            for p in pts:
                r = p - origin
                across = r.dot(side)
                res.append((across, (r - side * across).length))
            return res

        for i in range(segments):
            q = [base_l[i], base_l[i + 1], top[i + 1], top[i]]
            self.poly(q, mat, out=side + Vector((0, 0, 1)), uvm=uv_side(q, base_l[0]))
            q = [base_r[i], top[i], top[i + 1], base_r[i + 1]]
            self.poly(q, mat, out=-side + Vector((0, 0, 1)), uvm=uv_side(q, base_r[0]))
        q = [base_l[0], top[0], base_r[0]]
        self.poly(q, mat, out=-d + Vector((0, 0, 1)), uvm=uv_end(q, base_r[0]))
        q = [base_l[-1], base_r[-1], top[-1]]
        self.poly(q, mat, out=d + Vector((0, 0, 1)), uvm=uv_end(q, base_r[-1]))
        self._smooth_now = False

    def build(self, material):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        layer = mesh.uv_layers.new(name="UVMap")
        for poly, uvs in zip(mesh.polygons, self.uvs):
            for li, uv in zip(poly.loop_indices, uvs):
                layer.data[li].uv = uv
        mesh.materials.append(material)
        # normály: ostré plochy vlastní normálu, valy průměr podle polohy, pata valu nahoru;
        # „up“ = svisle nahoru (oboustranné listy zeleniny – osvětlené jako tráva)
        acc = {}
        key = lambda v: (round(v.x, 3), round(v.y, 3), round(v.z, 3))
        for poly, sm in zip(mesh.polygons, self.smooth):
            if sm is True:
                for vi in poly.vertices:
                    k = key(mesh.vertices[vi].co)
                    acc[k] = acc.get(k, Vector((0, 0, 0))) + poly.normal * poly.area
        normals = []
        for poly, sm in zip(mesh.polygons, self.smooth):
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                if not sm:
                    normals.append(poly.normal.copy())
                elif sm == "up" or co.z < 0.01:
                    normals.append(Vector((0, 0, 1)))
                else:
                    normals.append((acc[key(co)].normalized() + Vector((0, 0, 0.6))).normalized())
        for poly in mesh.polygons:
            poly.use_smooth = True
        mesh.normals_split_custom_set(normals)
        mesh.validate(clean_customdata=False)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def make_material(scale=1):
    """Materiál s atlasem; `scale` < 1 = zmenšená kopie atlasu (uloží se vedle něj) pro drobné
    díly, jejichž GLB nemá nést celý atlas – kůly a větve pleteného plotu."""
    mat = bpy.data.materials.new("dwelling-atlas" if scale == 1 else f"dwelling-atlas-{scale}")
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    image = bpy.data.images.load(os.path.join(ATLAS, "atlas.jpg"), check_existing=False)
    if scale != 1:
        w, h = image.size
        image.scale(max(1, round(w * scale)), max(1, round(h * scale)))
        image.filepath_raw = os.path.join(ATLAS, f"atlas-{image.size[0]}.jpg")
        image.file_format = "JPEG"
        image.save()
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


class Parts:
    """Části obydlí podle fází stavby – každá svůj Builder (staveniště je skládá postupně)."""

    def __init__(self, prefix):
        self.prefix = prefix
        self.builders = {}

    def __call__(self, key):
        if key not in self.builders:
            self.builders[key] = Builder(f"{self.prefix}-{key}")
        return self.builders[key]

    def build(self, mat):
        return [b.build(mat) for b in self.builders.values()]


def thatch_roof(part, half_len, z_ridge, slope, x_eave, thickness, ny=None, kozy=(1.5, 0.62)):
    """Sedlová slámová střecha z řad došků (kurzů): každá řada je nepatrně strmější než
    střecha, takže spodní hrana přečnívá řadu pod ní o LIP – stupeň vrhá stín a řady jsou
    čitelné i z dálky. part(klíč) vrátí Builder: řady 'thatch-1' … 'thatch-N' zdola nahoru
    (staveniště je kladou postupně), hřeben s kozami 'ridge'. Vrací z_in(x) – spodní plochu
    střechy."""
    ny = ny or THATCH_NY
    cs = 1 / math.sqrt(1 + slope * slope)
    t_v = thickness / cs  # svislá tloušťka
    L = x_eave / cs  # délka po spádu
    n_courses = next(k for k, b in enumerate(COURSES) if b >= L - 1e-6)
    ys = [-half_len + 2 * half_len * j / ny for j in range(ny + 1)]

    def x_of(sgn, s):
        return sgn * (x_eave - s * cs)

    def z_base(x, y):
        edge = abs(x) / x_eave
        # došky se u okapu trochu zvedají a hřeben se uprostřed lehce prohýbá
        sag = -0.06 * (1 - (y / half_len) ** 2) * (1 - edge)
        return z_ridge - slope * abs(x) + sag + 0.7 * noise(x, y) * edge

    def P(sgn, s, y, raise_):
        x = x_of(sgn, s)
        return (x, y, z_base(x, y) + raise_ / cs)

    def z_in(x):
        return z_ridge - slope * abs(x) - t_v

    for sgn in (-1, 1):
        out_top = (sgn * slope, 0, 1)
        for k in range(n_courses):
            b = part(f"thatch-{k + 1}")
            s0 = COURSES[k]
            s1 = min(COURSES[k + 1], L)
            r0 = LIP
            r1 = LIP * (1 - (s1 - s0) / (COURSES[k + 1] - COURSES[k]))
            for j in range(ny):
                ya, yb = ys[j], ys[j + 1]
                b.poly(
                    [P(sgn, s0, ya, r0), P(sgn, s0, yb, r0), P(sgn, s1, yb, r1), P(sgn, s1, ya, r1)],
                    "thatch",
                    out=out_top,
                    uvm=[(ya, s0), (yb, s0), (yb, s1), (ya, s1)],
                )
                if k < n_courses - 1:  # stupeň (čelo řady nad touto řadou)
                    b.poly(
                        [P(sgn, s1, ya, r1), P(sgn, s1, yb, r1), P(sgn, s1, yb, LIP), P(sgn, s1, ya, LIP)],
                        "thatch_edge",
                        out=(sgn, 0, -0.3),
                        uvm=[(ya, LIP), (yb, LIP), (yb, 0), (ya, 0)],
                    )
            # čela došků na štítech
            for y, out in ((-half_len, (0, -1, 0)), (half_len, (0, 1, 0))):
                o0, o1 = P(sgn, s0, y, r0), P(sgn, s1, y, r1)
                i0 = (o0[0], y, z_in(o0[0]))
                i1 = (o1[0], y, z_in(o1[0]))
                zt0 = z_base(o0[0], y) + LIP / cs
                zt1 = z_base(o1[0], y) + LIP / cs
                b.poly(
                    [o0, o1, i1, i0],
                    "thatch_edge",
                    out=out,
                    uvm=[(s0, (zt0 - o0[2]) * cs), (s1, (zt1 - o1[2]) * cs), (s1, (zt1 - i1[2]) * cs), (s0, (zt0 - i0[2]) * cs)],
                )
            # spodní strana řady
            xa, xb = x_of(sgn, s0), x_of(sgn, s1)
            b.poly(
                [(xb, -half_len, z_in(xb)), (xa, -half_len, z_in(xa)), (xa, half_len, z_in(xa)), (xb, half_len, z_in(xb))],
                "thatch",
                out=(-sgn, 0, -1),
                uvm=[(-half_len, s1), (-half_len, s0), (half_len, s0), (half_len, s1)],
            )
        ex = sgn * x_eave
        # okapová hrana (tloušťka došků) patří k první řadě
        b = part("thatch-1")
        for j in range(ny):
            ya, yb = ys[j], ys[j + 1]
            pa, pb = P(sgn, 0, ya, LIP), P(sgn, 0, yb, LIP)
            b.poly(
                [pa, pb, (ex, yb, z_in(ex)), (ex, ya, z_in(ex))],
                "thatch_edge",
                out=(sgn, 0, 0),
                uvm=[(ya, 0), (yb, 0), (yb, pb[2] - z_in(ex)), (ya, pa[2] - z_in(ex))],
            )
    # hřeben: jen nízká úzká převázaná sláma přes spoj obou stran (Martin: žádná „bakule“,
    # ať jsou vidět kozy na štítech)
    b = part("ridge")
    w, h = 0.17, 0.08
    Lr = half_len
    zr = z_ridge - 0.02
    z_edge = z_ridge - slope * w - 0.06  # spodní hrany zapuštěné do došků (i v prohnutém středu)
    prof = [(-w, z_edge), (-w * 0.5, zr + h * 0.7), (0, zr + h), (w * 0.5, zr + h * 0.7), (w, z_edge)]
    cum = [0.0]
    for k in range(len(prof) - 1):
        cum.append(cum[-1] + math.dist(prof[k], prof[k + 1]))
    mid = cum[-1] / 2
    for k in range(len(prof) - 1):
        (x0, z0), (x1, z1) = prof[k], prof[k + 1]
        outv = Vector(((x0 + x1) / 2, 0, (z0 + z1) / 2 - zr + 0.1))
        b.poly(
            [(x0, -Lr, z0), (x1, -Lr, z1), (x1, Lr, z1), (x0, Lr, z0)],
            "ridge",
            out=outv,
            uvm=[(-Lr, cum[k] - mid), (-Lr, cum[k + 1] - mid), (Lr, cum[k + 1] - mid), (Lr, cum[k] - mid)],
        )
    for y, out in ((-Lr, (0, -1, 0)), (Lr, (0, 1, 0))):
        b.poly([(x, y, z) for x, z in prof], "thatch_edge", out=out, uvm=[(x, zr + h - z) for x, z in prof])
    # kozy: zkřížená štítová prkna (větrná prkna) podél okraje došků na obou štítech,
    # nad hřebenem přečnívají do X
    if kozy:
        down, up = kozy  # jak daleko po spádu dolů / kolik přečnívá za hřeben (vodorovně, m)
        off = LIP / cs + 0.05
        for side in (-1, 1):
            for sgn in (-1, 1):
                # prkna přeplátovaná – jedno před druhým (jinak by se v překřížení prolínala)
                y = side * (half_len + 0.04 + (0.075 if sgn > 0 else 0))
                a = (sgn * down, y, z_ridge - slope * down + off)
                c = (-sgn * up, y, z_ridge + slope * up + off)
                b.plank(a, c, 0.2, 0.07)
    return z_in


def entrance_berms(b, y_wall, half_width, length, mound_h=0.3):
    """Valy vykopané hlíny po stranách vstupní šíje. Šíji samotnou (schody dolů do jámy)
    i jámu kreslí scéna – vyhloubí terén (dwelling-pit.ts)."""
    y0, y1 = y_wall, y_wall - length
    for sgn in (-1, 1):
        b.berm((sgn * (half_width + 0.4), y0 + 0.2, 0), (sgn * (half_width + 0.4), y1 - 0.1, 0), mound_h, 0.7, segments=2, mat="spoil")


def gable_frame(b, y, apex, slope, z_low, z_high, size=0.12):
    """Rám štítu: krokve podél střechy a vodorovný trám (práh / hambalek) před omítkou."""
    def x_at(z):
        return (apex - z) / slope

    yo = y + (-0.05 if y < 0 else 0.05)
    for sgn in (-1, 1):
        b.beam((sgn * (x_at(z_low) - 0.02), yo, z_low), (sgn * 0.05, yo, apex - 0.06), size)
    b.beam((-x_at(z_high) - 0.05, yo, z_high), (x_at(z_high) + 0.05, yo, z_high), size * 0.9)


DOOR = 0.42  # polovina šířky dveří a vstupní šíje (m)
GABLE_OVERHANG = 1.05  # o kolik střecha přečnívá před štíty vpředu i vzadu (m)
ZEMNICE_RAMP = 1.7  # délka vstupní šíje zemnice (m) – jako v dwelling-pit.ts
POLOZEMNICE_RAMP = 1.0


def stakes_and_string(b, outline):
    """Vytyčení: kolíky v rozích půdorysu i šíje, mezi nimi napnutý provázek."""
    for x, y in outline:
        b.beam((x, y, -0.15), (x, y, 0.5), 0.06)
    for i, (x0, y0) in enumerate(outline):
        x1, y1 = outline[(i + 1) % len(outline)]
        b.beam((x0, y0, 0.34), (x1, y1, 0.34), 0.022, mat="thatch_edge")


def outline_with_ramp(hx, hy, ramp):
    """Obrys jámy se šíjí v −y (Blender): rohy po obvodu."""
    return [(-hx, hy), (hx, hy), (hx, -hy), (DOOR, -hy), (DOOR, -hy - ramp), (-DOOR, -hy - ramp), (-DOOR, -hy), (-hx, -hy)]


def ridge_frame(part, posts_y, z_post_base, apex, half_len, slope, x_eave, z_in, n_rafters=5):
    """Krov: dva sloupy s rozsochou pod hřebenovou vaznicí, krokve po párech, latě."""
    b = part("posts")
    for y in posts_y:
        b.beam((0, y, z_post_base), (0, y, apex - 0.2), 0.17)
        for sgn in (-1, 1):  # rozsocha – vidlice, ve které leží vaznice
            b.beam((0, y, apex - 0.34), (sgn * 0.12, y, apex - 0.1), 0.08)
    b = part("ridge-beam")
    b.beam((0, -half_len + 0.05, apex - 0.1), (0, half_len - 0.05, apex - 0.1), 0.15)
    for i in range(n_rafters):
        y = -half_len + 0.14 + i * (2 * half_len - 0.28) / (n_rafters - 1)
        b = part(f"rafters-{i + 1}")
        for sgn in (-1, 1):
            xe = sgn * (x_eave - 0.03)
            b.beam((xe, y, z_in(xe) - 0.06), (sgn * 0.04, y, z_in(0) - 0.06), 0.1)
    b = part("laths")
    cs = 1 / math.sqrt(1 + slope * slope)
    L = x_eave / cs
    s = 0.22
    while s < L - 0.2:
        for sgn in (-1, 1):
            x = sgn * (x_eave - s * cs)
            b.beam((x, -half_len + 0.02, z_in(x) - 0.03), (x, half_len - 0.02, z_in(x) - 0.03), 0.05)
        s += 0.42


def wattle_gables(b, ys, apex, slope, z_low, z_high, door_top=None):
    """Pletené štíty (výplet z proutí) v pásech po ≈ 0,8 m – textura proutí má pás 0,94 m.
    U předního štítu (y < 0) zůstane otvor dveří do door_top."""
    def x_at(z):
        return (apex - z) / slope

    for y, out in ys:
        cuts = [z_low]
        if y < 0 and door_top is not None and door_top > z_low:
            cuts.append(door_top)
        while cuts[-1] + 0.8 < z_high:
            cuts.append(cuts[-1] + 0.8)
        cuts.append(z_high)
        for z0, z1 in zip(cuts, cuts[1:]):
            if y < 0 and door_top is not None and z1 <= door_top + 1e-6:
                pieces = [(-1, -DOOR), (1, DOOR)]
            else:
                pieces = [(0, 0)]
            for sgn, inner in pieces:
                if sgn == 0:
                    pts = [(-x_at(z0), y, z0), (x_at(z0), y, z0), (x_at(z1), y, z1), (-x_at(z1), y, z1)]
                else:
                    pts = [(sgn * x_at(z0), y, z0), (inner, y, z0), (inner, y, z1), (sgn * x_at(z1), y, z1)]
                b.poly(pts, "wattle", out=out, uvm=[(p[0], p[2] - z0 + 0.05) for p in pts])


def build_zemnice(part, stages=False):
    """Zemnice: jáma 1 m (kreslí ji scéna, terén se tam vyhloubí), střecha s okapem na zemi,
    štíty omazané hlínou. stages=True přidá díly staveniště (kolíky, krov, latě, výplet)."""
    D = 1.0  # hloubka jámy
    px, py = 1.85, 2.0  # půlrozměry jámy
    slope = 1.08  # ≈ 47°
    x_eave = 2.3
    z_ridge = slope * x_eave  # okap leží na zemi
    # střecha předsazená před štíty (Martin) – vpředu kryje šíji se schody dolů do jámy
    half_len = py + GABLE_OVERHANG
    th = 0.3
    z_in = thatch_roof(part, half_len, z_ridge, slope, x_eave, th, kozy=(1.35, 0.6))

    # štíty omazané hlínou (mazanice na výpleti), nahoře dýmník, rám z trámů. Omítka sahá pod
    # zem (ZG) – na svahu tak mezi štítem a okrajem jámy nezůstane škvíra.
    apex = z_in(0)
    zv = apex - 0.42
    ZG = -0.5

    def x_at(z):
        return (apex - z) / slope

    b = part("daub")
    for y, out in ((-py, (0, -1, 0)), (py, (0, 1, 0))):
        top = [(px, y, 0), (x_at(0), y, 0), (x_at(zv), y, zv), (-x_at(zv), y, zv), (-x_at(0), y, 0), (-px, y, 0)]
        if y < 0:
            # přední štít s otvorem dveří (0,84 m) až dolů na dno jámy – před ním schody šíje
            pts = [(-px, y, ZG), (-DOOR, y, ZG), (-DOOR, y, 0.78), (DOOR, y, 0.78), (DOOR, y, ZG), (px, y, ZG)] + top
        else:
            pts = [(-px, y, ZG), (px, y, ZG)] + top
        b.poly(pts, "daub", out=out)
        b.poly([(-x_at(zv), y, zv), (x_at(zv), y, zv), (0, y, apex)], "dark", out=out)
        gable_frame(b, y, apex, slope, 0.0, zv)
        # práh u země
        yo = y + (-0.05 if y < 0 else 0.05)
        if y > 0:
            b.beam((-x_at(0.06) + 0.05, yo, 0.06), (x_at(0.06) - 0.05, yo, 0.06), 0.12)
        else:
            for sgn in (-1, 1):
                b.beam((sgn * (x_at(0.06) - 0.05), yo, 0.06), (sgn * 0.55, yo, 0.06), 0.12)
    # dveřní otvor – tmavý výklenek až na dno jámy, rám z trámů
    yd = -py
    b.poly([(-DOOR, yd + 0.5, -D), (DOOR, yd + 0.5, -D), (DOOR, yd + 0.5, 0.78), (-DOOR, yd + 0.5, 0.78)], "dark", out=(0, -1, 0))
    for sgn in (-1, 1):
        b.poly([(sgn * DOOR, yd, -D), (sgn * DOOR, yd + 0.5, -D), (sgn * DOOR, yd + 0.5, 0.78), (sgn * DOOR, yd, 0.78)], "dark", out=(-sgn, 0, 0))
        b.beam((sgn * 0.48, yd - 0.06, -D), (sgn * 0.48, yd - 0.06, 0.9), 0.12)
    b.poly([(-DOOR, yd, 0.78), (DOOR, yd, 0.78), (DOOR, yd + 0.5, 0.78), (-DOOR, yd + 0.5, 0.78)], "dark", out=(0, 0, -1))
    b.beam((-0.62, yd - 0.06, 0.84), (0.62, yd - 0.06, 0.84), 0.13)

    # val drnů a hlíny podél okapů (okap leží na valu) a u zadního štítu, hlína u šíje
    b = part("berms")
    entrance_berms(b, yd - 0.05, DOOR, ZEMNICE_RAMP, mound_h=0.32)
    for sgn in (-1, 1):
        b.berm((sgn * (x_eave - 0.05), -half_len - 0.1, 0), (sgn * (x_eave - 0.05), half_len + 0.1, 0), 0.32, 0.9, segments=4)
    b.berm((-1.6, py + 0.15, 0), (1.6, py + 0.15, 0), 0.35, 0.8, segments=3)
    for sgn in (-1, 1):
        b.berm((sgn * 0.75, -py - 0.15, 0), (sgn * 1.75, -py - 0.15, 0), 0.3, 0.7, segments=1, mat="spoil")

    if stages:
        stakes_and_string(part("stakes"), outline_with_ramp(px, py, ZEMNICE_RAMP))
        # sloupy stojí v jámě kousek za štíty (přední je schovaný za tmavým výklenkem dveří)
        ridge_frame(part, (-(py - 0.6), py - 0.6), -D, apex, half_len, slope, x_eave, z_in)
        b = part("posts")
        for sx in (-1, 1):  # rohové kůly výdřevy jámy
            for sy in (-1, 1):
                b.beam((sx * (px - 0.08), sy * (py - 0.08), -D), (sx * (px - 0.08), sy * (py - 0.08), 0.12), 0.12)
        wattle_gables(part("wattle"), ((-py + 0.03, (0, -1, 0)), (py - 0.03, (0, 1, 0))), apex, slope, 0.0, zv, door_top=0.78)


def build_polozemnice(part, stages=False):
    """Polozemnice: jáma 0,5 m, ve které stojí srub omazaný hlínou. stages=True přidá díly
    staveniště (kolíky, řady trámů srubu, krov, latě, výplet štítů)."""
    D = 0.5
    o, t = 2.1, 0.22  # vnější půlrozměr srubu a tloušťka trámu
    over = 0.25  # přesah trámů na nárožích
    z_top = 0.95  # stěna nad terénem
    slope = 1.0
    th = 0.32
    t_v = th * math.sqrt(2)
    z_ridge = z_top + t_v + slope * o  # spodní plocha střechy sedí na hraně stěny
    x_eave = 2.6
    half_len = o + GABLE_OVERHANG  # předsazená střecha kryje vstupní šíji (Martin)

    # srub omazaný hlínou: stěny jako kvádry s omítkou, na nárožích přečnívají konce trámů
    b = part("daub")
    for sgn in (-1, 1):
        x0, x1 = sorted((sgn * o, sgn * (o - t)))
        b.box(x0, x1, -o, o, -D, z_top, "daub")
    b.box(-o + t, o - t, o - t, o, -D, z_top, "daub", skip=("-x", "+x"))
    b.box(-o + t, -DOOR, -o, -o + t, -D, z_top, "daub", skip=("-x",))
    b.box(DOOR, o - t, -o, -o + t, -D, z_top, "daub", skip=("+x",))
    b.box(-0.6, 0.6, -o, -o + t, 0.78, z_top, "daub", skip=("-z",))
    b.poly([(-DOOR, -o, 0.78), (DOOR, -o, 0.78), (DOOR, -o + t, 0.78), (-DOOR, -o + t, 0.78)], "beam", out=(0, 0, -1))
    # konce trámů na nárožích (střídají se o půl trámu)
    for sx in (-1, 1):
        for sy in (-1, 1):
            xa, xb = sorted((sx * o, sx * (o - t)))
            ya, yb = sorted((sy * o, sy * (o + over)))
            b.log_stub(xa, xb, ya, yb, -0.05, z_top - 0.04, "y")
            xa, xb = sorted((sx * o, sx * (o + over)))
            ya, yb = sorted((sy * o, sy * (o - t)))
            b.log_stub(xa, xb, ya, yb, -0.05, z_top - 0.04 - 0.11, "x", zoff=0.111)
    # tmavé nitro za dveřmi (až na dno jámy – před dveřmi schody šíje)
    b.poly([(-DOOR, -o + t + 0.3, -D), (DOOR, -o + t + 0.3, -D), (DOOR, -o + t + 0.3, 0.78), (-DOOR, -o + t + 0.3, 0.78)], "dark", out=(0, -1, 0))
    for sgn in (-1, 1):
        b.poly([(sgn * DOOR, -o, -D), (sgn * DOOR, -o + t + 0.3, -D), (sgn * DOOR, -o + t + 0.3, 0.78), (sgn * DOOR, -o, 0.78)], "dark", out=(-sgn, 0, 0))
        b.beam((sgn * 0.5, -o - 0.07, -D), (sgn * 0.5, -o - 0.07, 0.86), 0.13)
    b.beam((-0.66, -o - 0.07, 0.86), (0.66, -o - 0.07, 0.86), 0.12)

    # vaznice (pozednice) pod střechou – vystrčené až pod předsazenou střechu
    b = part("plates")
    for sgn in (-1, 1):
        b.beam((sgn * (o - t / 2), -half_len + 0.08, z_top + 0.07), (sgn * (o - t / 2), half_len - 0.08, z_top + 0.07), 0.16)

    z_in = thatch_roof(part, half_len, z_ridge, slope, x_eave, th, kozy=(1.6, 0.65))

    # štíty omazané nad srubem, nahoře dýmník, rám z trámů
    apex = z_in(0)
    zv = apex - 0.5

    def x_at(z):
        return (apex - z) / slope

    b = part("daub")
    for y, out in ((-o, (0, -1, 0)), (o, (0, 1, 0))):
        b.poly([(-x_at(z_top), y, z_top), (x_at(z_top), y, z_top), (x_at(zv), y, zv), (-x_at(zv), y, zv)], "daub", out=out)
        b.poly([(-x_at(zv), y, zv), (x_at(zv), y, zv), (0, y, apex)], "dark", out=out)
        gable_frame(b, y, apex, slope, z_top + 0.05, zv, size=0.12)
        # vrchní trám srubu pod štítem
        yo = y + (0.05 if y > 0 else -0.05)
        b.beam((-o - 0.1, yo, z_top + 0.03), (o + 0.1, yo, z_top + 0.03), 0.14)
    # hlína nahrnutá kolem srubu (val), u šíje hlína po stranách
    b = part("berms")
    for sgn in (-1, 1):
        b.berm((sgn * (o + 0.3), -o - 0.1, 0), (sgn * (o + 0.3), o + 0.1, 0), 0.22, 0.7, segments=3)
    b.berm((-o + 0.1, o + 0.3, 0), (o - 0.1, o + 0.3, 0), 0.22, 0.7, segments=3)
    for sgn in (-1, 1):
        b.berm((sgn * 0.85, -o - 0.3, 0), (sgn * (o - 0.1), -o - 0.3, 0), 0.2, 0.6, segments=1, mat="spoil")
    entrance_berms(b, -o - 0.05, DOOR, POLOZEMNICE_RAMP, mound_h=0.22)

    if stages:
        stakes_and_string(part("stakes"), outline_with_ramp(o, o, POLOZEMNICE_RAMP))
        # srub z neomítnutých trámů po řadách (na nárožích přečnívají, vpředu otvor dveří)
        n = 6
        for k in range(n):
            zc = -D + t / 2 + k * (z_top + D - t) / (n - 1)
            b = part(f"logs-{k + 1}")
            for sgn in (-1, 1):
                xc = sgn * (o - t / 2)
                b.beam((xc, -o - over, zc), (xc, o + over, zc), t)
                yc = sgn * (o - t / 2)
                zl = zc + 0.02
                if sgn < 0 and zc - t / 2 < 0.78:
                    b.beam((-o - over, yc, zl), (-DOOR, yc, zl), t * 0.96)
                    b.beam((DOOR, yc, zl), (o + over, yc, zl), t * 0.96)
                else:
                    b.beam((-o - over, yc, zl), (o + over, yc, zl), t * 0.96)
        ridge_frame(part, (-(o - t / 2), o - t / 2), z_top, apex, half_len, slope, x_eave, z_in)
        wattle_gables(part("wattle"), ((-o + 0.03, (0, -1, 0)), (o - 0.03, (0, 1, 0))), apex, slope, z_top + 0.02, zv)


# ------------------------------------------------------------------ dvorec vojvody

# Dvorec vojvody (trade.md – Dvorec vojvody, návrh Clauda): delší a vyšší polozemnice – srub
# 4,6 × 8,4 m s vyššími stěnami, zdobené štíty (vrch štítu bedněný prkny se zubořezem) a konce
# zkřížených štítových prken (koz) vyřezané do koňských hlav. Dvorec stojí na pozemku dvou políček
# (dům a dvůr) obehnaném pleteným plotem s bránou (dvorec-gate.glb) – rozmístí je scéna
# (apps/web/lib/scene/homestead-layout.ts). Jámu kreslí scéna (dwelling-pit.ts – PIT_SHAPES.dvorec).
DVOREC_RAMP = 1.0  # délka vstupní šíje dvorce (m) – jako v dwelling-pit.ts
DVOREC_O = (2.3, 4.2)  # vnější půlrozměry srubu napříč a podél hřebene (m)
DVOREC_EAVE = 2.78  # okap (m od osy) – délka po spádu se musí vejít do řad došků atlasu
DVOREC_KOZY = (1.85, 0.62)  # štítová prkna: po spádu dolů / přesah za hřeben (m)
DVOREC_DOOR_TOP = 1.0  # horní hrana dveří nad terénem (m) – vyšší než u polozemnice


def prism(b, pts2d, origin, u_axis, v_axis, thick, mat):
    """Hranol z obrysu `pts2d` (u, v) v rovině os u, v, tloušťka `thick` kolmo na ni."""
    o, u, v = Vector(origin), Vector(u_axis).normalized(), Vector(v_axis).normalized()
    n = u.cross(v).normalized()
    ring = list(zip(pts2d, pts2d[1:] + pts2d[:1]))
    ccw = sum(a0 * c1 - a1 * c0 for (a0, c0), (a1, c1) in ring) > 0
    front = [o + u * a + v * c + n * (thick / 2) for a, c in pts2d]
    back = [o + u * a + v * c - n * (thick / 2) for a, c in pts2d]
    b.poly(front, mat, out=n, uvm=list(pts2d))
    b.poly(back, mat, out=-n, uvm=list(pts2d))
    for i, ((a0, c0), (a1, c1)) in enumerate(ring):
        j = (i + 1) % len(pts2d)
        na, nc = (c1 - c0, a0 - a1) if ccw else (c0 - c1, a1 - a0)
        edge = math.hypot(a1 - a0, c1 - c0)
        b.poly([front[i], front[j], back[j], back[i]], mat, out=u * na + v * nc, uvm=[(0, 0), (edge, 0), (edge, thick), (0, thick)])


# Koňská hlava na konci štítového prkna (u = podél prkna ven za hřeben, v = kolmo nahoru): krk
# pokračuje prknem, hlava se sklání ven a dolů, nahoře dvě uši – vyřezaná z prkna (Martin).
HORSE_HEAD = [
    (-0.06, -0.1),
    (-0.06, 0.1),
    (0.16, 0.11),
    (0.3, 0.2),
    (0.34, 0.31),
    (0.38, 0.24),
    (0.42, 0.33),
    (0.46, 0.22),
    (0.6, 0.12),
    (0.66, 0.0),
    (0.6, -0.05),
    (0.47, -0.02),
    (0.37, -0.07),
    (0.28, -0.13),
    (0.14, -0.1),
]


def bowed_head(scale=1.3, bow=0.7):
    """Koňská hlava zvětšená a za krkem skloněná ven a dolů (o `bow` rad) – prkno stoupá pod 45°,
    hlava míří skoro vodorovně jako u koníků na štítech."""
    pivot = 0.14
    out = []
    for a, c in HORSE_HEAD:
        if a > pivot:
            da, dc = a - pivot, c
            a, c = pivot + da * math.cos(bow) + dc * math.sin(bow), -da * math.sin(bow) + dc * math.cos(bow)
        out.append((a * scale, c * scale))
    return out


def horse_heads(b, half_len, z_ridge, slope, kozy):
    """Koňské hlavy na koncích koz obou štítů – navazují na prkna z `thatch_roof`."""
    down, up = kozy
    cs = 1 / math.sqrt(1 + slope * slope)
    off = LIP / cs + 0.05
    for side in (-1, 1):
        for sgn in (-1, 1):
            y = side * (half_len + 0.04 + (0.075 if sgn > 0 else 0))
            a = Vector((sgn * down, y, z_ridge - slope * down + off))
            c = Vector((-sgn * up, y, z_ridge + slope * up + off))
            u = (c - a).normalized()
            v = Vector((0, 1, 0)).cross(u).normalized()
            if v.z < 0:
                v = -v
            prism(b, bowed_head(), c, u, v, 0.075, "beam")


def zigzag_boards(b, y, out, apex, slope, z_low, z_high, width=0.2):
    """Bednění vrchu štítu svislými prkny se zubořezem dole (zdobený štít): prkna od `z_low`
    (každé druhé o kus níž – zuby) po střechu, vrch štítu nad `z_high` tmavý (dýmník)."""
    def x_at(z):
        return (apex - z) / slope

    x = -x_at(z_low)
    k = 0
    yo = y + (0.03 if out[1] > 0 else -0.03)
    while x < x_at(z_low) - 0.05:
        x1 = min(x + width, x_at(z_low))
        xm = (x + x1) / 2
        z_top = min(z_high, apex - slope * max(abs(x), abs(x1)))
        z_bot = z_low - (0.16 if k % 2 else 0.0)
        if z_top > z_bot + 0.05:
            tip = z_bot - 0.08
            pts = [(x, yo, z_bot), (xm, yo, tip), (x1, yo, z_bot), (x1, yo, z_top), (x, yo, z_top)]
            b.poly(pts, "beam", out=out, uvm=[(p[2], p[0] - xm) for p in pts])
        x = x1 + 0.01
        k += 1


def build_dvorec(part, stages=False):
    """Dvorec: jáma 0,5 m, srub omazaný hlínou (delší a vyšší než polozemnice), zdobené štíty
    a koňské hlavy na kozách. stages=True přidá díly staveniště (kolíky, řady srubu, krov, latě,
    výplet štítů, řezby)."""
    D = 0.5
    ox, oy = DVOREC_O
    t = 0.24
    over = 0.28
    z_top = 1.3
    slope = 1.0
    th = 0.34
    t_v = th * math.sqrt(2)
    z_ridge = z_top + t_v + slope * ox
    x_eave = DVOREC_EAVE
    half_len = oy + GABLE_OVERHANG
    door_top = DVOREC_DOOR_TOP

    b = part("daub")
    for sgn in (-1, 1):
        x0, x1 = sorted((sgn * ox, sgn * (ox - t)))
        b.box(x0, x1, -oy, oy, -D, z_top, "daub")
    b.box(-ox + t, ox - t, oy - t, oy, -D, z_top, "daub", skip=("-x", "+x"))
    b.box(-ox + t, -DOOR, -oy, -oy + t, -D, z_top, "daub", skip=("-x",))
    b.box(DOOR, ox - t, -oy, -oy + t, -D, z_top, "daub", skip=("+x",))
    b.box(-0.6, 0.6, -oy, -oy + t, door_top, z_top, "daub", skip=("-z",))
    b.poly([(-DOOR, -oy, door_top), (DOOR, -oy, door_top), (DOOR, -oy + t, door_top), (-DOOR, -oy + t, door_top)], "beam", out=(0, 0, -1))
    # konce trámů na nárožích (střídají se o půl trámu)
    for sx in (-1, 1):
        for sy in (-1, 1):
            xa, xb = sorted((sx * ox, sx * (ox - t)))
            ya, yb = sorted((sy * oy, sy * (oy + over)))
            b.log_stub(xa, xb, ya, yb, -0.05, z_top - 0.04, "y")
            xa, xb = sorted((sx * ox, sx * (ox + over)))
            ya, yb = sorted((sy * oy, sy * (oy - t)))
            b.log_stub(xa, xb, ya, yb, -0.05, z_top - 0.04 - 0.12, "x", zoff=0.111)
    # tmavé nitro za dveřmi, ostění a vyřezávané sloupky u dveří (hlavice nad překladem)
    b.poly([(-DOOR, -oy + t + 0.3, -D), (DOOR, -oy + t + 0.3, -D), (DOOR, -oy + t + 0.3, door_top), (-DOOR, -oy + t + 0.3, door_top)], "dark", out=(0, -1, 0))
    for sgn in (-1, 1):
        b.poly([(sgn * DOOR, -oy, -D), (sgn * DOOR, -oy + t + 0.3, -D), (sgn * DOOR, -oy + t + 0.3, door_top), (sgn * DOOR, -oy, door_top)], "dark", out=(-sgn, 0, 0))
        b.beam((sgn * 0.52, -oy - 0.08, -D), (sgn * 0.52, -oy - 0.08, door_top + 0.36), 0.15)
        b.beam((sgn * 0.52, -oy - 0.08, door_top + 0.36), (sgn * 0.52, -oy - 0.08, door_top + 0.52), 0.21)
    b.beam((-0.72, -oy - 0.08, door_top + 0.08), (0.72, -oy - 0.08, door_top + 0.08), 0.13)

    b = part("plates")
    for sgn in (-1, 1):
        b.beam((sgn * (ox - t / 2), -half_len + 0.08, z_top + 0.07), (sgn * (ox - t / 2), half_len - 0.08, z_top + 0.07), 0.17)

    z_in = thatch_roof(part, half_len, z_ridge, slope, x_eave, th, ny=10, kozy=DVOREC_KOZY)
    horse_heads(part("carving"), half_len, z_ridge, slope, DVOREC_KOZY)

    apex = z_in(0)
    zv = apex - 0.48
    z_board = z_top + 0.62

    def x_at(z):
        return (apex - z) / slope

    b = part("daub")
    for y, out in ((-oy, (0, -1, 0)), (oy, (0, 1, 0))):
        b.poly([(-x_at(z_top), y, z_top), (x_at(z_top), y, z_top), (x_at(zv), y, zv), (-x_at(zv), y, zv)], "daub", out=out)
        b.poly([(-x_at(zv), y, zv), (x_at(zv), y, zv), (0, y, apex)], "dark", out=out)
        gable_frame(b, y, apex, slope, z_top + 0.05, zv, size=0.13)
        yo = y + (0.05 if y > 0 else -0.05)
        b.beam((-ox - 0.1, yo, z_top + 0.03), (ox + 0.1, yo, z_top + 0.03), 0.15)
    # zdobené štíty: bednění se zubořezem nad omítkou
    b = part("carving")
    for y, out in ((-oy - 0.02, (0, -1, 0)), (oy + 0.02, (0, 1, 0))):
        zigzag_boards(b, y, out, apex, slope, z_board, zv)
    # hlína nahrnutá kolem srubu (val), u šíje hlína po stranách
    b = part("berms")
    for sgn in (-1, 1):
        b.berm((sgn * (ox + 0.3), -oy - 0.1, 0), (sgn * (ox + 0.3), oy + 0.1, 0), 0.24, 0.75, segments=5)
    b.berm((-ox + 0.1, oy + 0.3, 0), (ox - 0.1, oy + 0.3, 0), 0.24, 0.75, segments=3)
    for sgn in (-1, 1):
        b.berm((sgn * 0.95, -oy - 0.3, 0), (sgn * (ox - 0.1), -oy - 0.3, 0), 0.2, 0.6, segments=1, mat="spoil")
    entrance_berms(b, -oy - 0.05, DOOR, DVOREC_RAMP, mound_h=0.22)

    if stages:
        stakes_and_string(part("stakes"), outline_with_ramp(ox, oy, DVOREC_RAMP))
        n = 6
        for k in range(n):
            zc = -D + t / 2 + k * (z_top + D - t) / (n - 1)
            b = part(f"logs-{k + 1}")
            for sgn in (-1, 1):
                xc = sgn * (ox - t / 2)
                b.beam((xc, -oy - over, zc), (xc, oy + over, zc), t)
                yc = sgn * (oy - t / 2)
                zl = zc + 0.02
                if sgn < 0 and zc - t / 2 < door_top:
                    b.beam((-ox - over, yc, zl), (-DOOR, yc, zl), t * 0.96)
                    b.beam((DOOR, yc, zl), (ox + over, yc, zl), t * 0.96)
                else:
                    b.beam((-ox - over, yc, zl), (ox + over, yc, zl), t * 0.96)
        ridge_frame(part, (-(oy - t / 2), 0.0, oy - t / 2), z_top, apex, half_len, slope, x_eave, z_in, n_rafters=7)
        wattle_gables(part("wattle"), ((-oy + 0.03, (0, -1, 0)), (oy - 0.03, (0, 1, 0))), apex, slope, z_top + 0.02, zv)


def build_dvorec_gate(b):
    """Brána pozemku dvorce: dva vyšší sloupy, překlad a stříška z prken – průchod 2,4 m široký
    (MANOR_FENCE.gateWidth ve scéně), počátek uprostřed průchodu na zemi, průchod podél osy y."""
    half = 1.3
    for sgn in (-1, 1):
        b.beam((sgn * half, 0, -0.3), (sgn * half, 0, 2.35), 0.2)
        b.beam((sgn * half, 0, 2.35), (sgn * half, 0, 2.5), 0.26)
    b.beam((-half - 0.35, 0, 2.18), (half + 0.35, 0, 2.18), 0.17)
    # stříška ze dvou prken nad překladem
    for sgn in (-1, 1):
        a = (-half - 0.5, sgn * 0.02, 2.32)
        c = (half + 0.5, sgn * 0.02, 2.32)
        b.poly(
            [(a[0], sgn * 0.02, 2.33), (c[0], sgn * 0.02, 2.33), (c[0], sgn * 0.42, 2.12), (a[0], sgn * 0.42, 2.12)],
            "beam",
            out=(0, sgn, 1),
            uvm=[(0, 0), (2 * half + 1, 0), (2 * half + 1, 0.3), (0, 0.3)],
        )
    # koňská hlava nad bránou (ze střechy dvorce)
    prism(b, bowed_head(1.1, 0.5), (0, 0, 2.42), (0.7, 0, 0.7), (-0.7, 0, 0.7), 0.075, "beam")


def site_props(part, mat):
    """Rekvizity staveniště (sdílené oběma typy, kreslí se v instancích): stoh drnů, hráň
    kmenů a tyčí, svazky proutí, snopy slámy, rýč, koš."""
    # hromadu vykopané hlíny kreslí scéna (leží na terénu, barvy jako stěny jámy)
    # stoh drnů – navrch tráva, boky hlína s kořeny
    b = part("turf")
    for layer in range(3):
        for i in range(3):
            for j in range(2):
                if layer == 2 and (i + j) % 2:
                    continue
                x0 = -0.62 + i * 0.42 + 0.03 * math.sin(layer * 3 + i)
                y0 = -0.32 + j * 0.33
                z0 = layer * 0.11
                x1, y1, z1 = x0 + 0.4, y0 + 0.31, z0 + 0.1
                top = [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
                b.poly(top, "turf", out=(0, 0, 1), uvm=[(p[0] + layer, 0.08 + 0.6 * (p[1] - y0)) for p in top])
                for pts, out in (
                    ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
                    ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
                    ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
                    ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
                ):
                    b.poly(pts, "spoil", out=out, uvm=[(p[0] + p[1] + layer, 0.32 + 1.2 * (p[2] - z0)) for p in pts])
    # hráň kmenů a tyčí na krov
    b = part("timber")
    for row, count in enumerate((4, 3, 2)):
        for k in range(count):
            x = (k - (count - 1) / 2) * 0.19
            z = 0.09 + row * 0.16
            b.beam((x, -1.4, z), (x, 1.4, z), 0.17)
    for k, (x, a) in enumerate(((-0.55, 0.06), (0.6, -0.05))):
        b.beam((x, -1.7, 0.05), (x + a, 1.7, 0.05), 0.1)
    # svazky proutí na výplet
    b = part("rods")
    for bundle, y0 in enumerate((-0.25, 0.25)):
        for k in range(12):
            ang = 2 * math.pi * k / 12
            r = 0.08 + 0.03 * ((k * 7) % 3)
            b.beam((-1.0, y0 + r * math.cos(ang), 0.14 + r * math.sin(ang)), (1.0, y0 + r * 0.8 * math.cos(ang + 0.3), 0.14 + r * math.sin(ang + 0.3)), 0.028)
    # snopy slámy na došky (osmiboké válce, čela z řezu slámy)
    b = part("straw")
    sheaves = [(-0.38, 0.17), (0.0, 0.17), (0.38, 0.17), (-0.19, 0.48), (0.19, 0.48)]
    for xc, zc in sheaves:
        n, r, hl = 8, 0.18, 0.55
        ring = [(xc + r * math.cos(2 * math.pi * k / n), zc + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            (x0, z0), (x1, z1) = ring[k], ring[(k + 1) % n]
            pts = [(x0, -hl, z0), (x1, -hl, z1), (x1, hl, z1), (x0, hl, z0)]
            b.poly(pts, "thatch", out=((x0 + x1) / 2 - xc, 0, (z0 + z1) / 2 - zc), uvm=[(k * 0.14, 1.0), ((k + 1) * 0.14, 1.0), ((k + 1) * 0.14, 2.1), (k * 0.14, 2.1)])
        for y, out in ((-hl, (0, -1, 0)), (hl, (0, 1, 0))):
            pts = [(x, y, z) for x, z in ring]
            b.poly(pts, "thatch_edge", out=out, uvm=[(x - xc, 0.25 + (z - zc)) for x, z in ring])
    # rýč zapíchnutý do země
    b = part("spade")
    b.beam((0, 0, 0.28), (0.08, 0.3, 1.25), 0.045)
    b.box(-0.11, 0.11, -0.02, 0.02, -0.15, 0.3, "beam")
    basket = import_prop("basket-a", 0.42, (0, 0, 0), mat)
    basket.name = f"{part.prefix}-basket"
    return [basket]


# ------------------------------------------------------------------ pozemek polozemnice

# Pozemek polozemnice (Martin, 18. 10. 2026): celé políčko 15 × 15 m obehnané polským plotem se
# zakulacenými rohy, dům uprostřed nebo v rohu, ve zbytku záhony. Kde co stojí, počítá scéna
# (apps/web/lib/scene/homestead-layout.ts, plot woven-fence.ts) – tady jsou jen díly, každý se
# v instancích staví na své místo terénu. Pletený plot (woven-fence.glb, i pro hřbitov): kůl,
# vyšší kůl u branky, kus proplétané větve 1 m (scéna ho natáhne od kůlu ke kůlu). Pozemek
# (homestead.glb): záhon 1 × 0,8 m (scéna ho natáhne na délku) a rostliny.
# Počátek každého dílu leží na zemi; ve scéně je bod Blenderu (x, y) v osách (−x, −y).
FENCE_STAKE_TOP = 1.0  # kůl nad zemí (m), u branky 1,22
FENCE_ROD = 0.05  # průřez větve (m)


def _rand(i, salt=0):
    """Deterministické číslo 0–1 (rozházení kůlů a rostlin bez náhody Blenderu)."""
    v = math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
    return v - math.floor(v)


def rod(b, pts, size, mat="beam", salt=0):
    """Větev / prut po lomené čáře – trojboký průřez (hřbet nahoru), konce zavřené. U podél
    délky, V přes průřez (pás kůry)."""
    pts = [Vector(p) for p in pts]
    dirs = []
    for i in range(len(pts)):
        a = pts[max(i - 1, 0)]
        c = pts[min(i + 1, len(pts) - 1)]
        dirs.append((c - a).normalized())
    rings = []
    for p, d in zip(pts, dirs):
        side = d.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
        up = side.cross(d).normalized()
        h = size / 2
        rings.append([p + up * h, p - up * h * 0.5 + side * h, p - up * h * 0.5 - side * h])
    off = (salt * 1.37) % UPER
    s = [0.0]
    for a, c in zip(pts, pts[1:]):
        s.append(s[-1] + (c - a).length)
    vs = (-size / 2, 0.0, size / 2, -size / 2)
    for i in range(len(pts) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(3):
            k1 = (k + 1) % 3
            outv = (r0[k] + r0[k1]) / 2 - pts[i]
            b.poly(
                [r0[k], r0[k1], r1[k1], r1[k]],
                mat,
                out=outv,
                uvm=[(off + s[i], vs[k]), (off + s[i], vs[k + 1]), (off + s[i + 1], vs[k + 1]), (off + s[i + 1], vs[k])],
            )
    for ring, d in ((rings[0], -dirs[0]), (rings[-1], dirs[-1])):
        b.poly(ring, mat, out=d, uvm=[(0.0, 0.0), (size / 2, 0.0), (0.0, size / 2)])


def woven_fence_parts(mat):
    """Díly pleteného plotu do woven-fence.glb (polský plot pozemku i plot hřbitova):
    fence-post, fence-post-gate, fence-rail (1 m podél Blender −x = ve scéně +x od počátku)."""
    objs = []
    b = Builder("fence-post")
    b.beam((0, 0, -0.15), (0.01, 0.01, FENCE_STAKE_TOP), 0.08)
    objs.append(b.build(mat))
    b = Builder("fence-post-gate")
    b.beam((0, 0, -0.15), (0.01, 0.01, 1.22), 0.09)
    objs.append(b.build(mat))
    b = Builder("fence-rail")
    # mírný průvěs uprostřed – větev není pravítko
    rod(b, [(0, 0, 0), (-0.5, 0, -0.012), (-1, 0, 0)], FENCE_ROD)
    objs.append(b.build(mat))
    return objs


def homestead_parts(mat):
    """Díly pozemku do homestead.glb: bed (1 × 0,8 m, délka podél x), plant-cabbage,
    plant-turnip, plant-onion, plant-dill (pata na vršku záhonu = počátek)."""
    objs = []

    def part(name):
        b = Builder(name)
        return b

    b = part("bed")
    b._smooth_now = True
    garden_bed(b, -0.5, 0.5, -0.4, 0.4, inset_x=0.04)
    b._smooth_now = False
    objs.append(b.build(mat))
    plants = {
        "plant-cabbage": lambda b: cabbage(b, 0, 0, 0, 1, 3),
        "plant-turnip": lambda b: leafy_tuft(b, 0, 0, 0, 1, 5, 5, 0.19, 0.13, 0.065),
        "plant-onion": lambda b: onion(b, 0, 0, 0, 1, 7),
        "plant-dill": lambda b: herb_bush(b, 0, 0, 0, 1, 11),
    }
    for name, build in plants.items():
        b = part(name)
        b._smooth_now = True
        build(b)
        b._smooth_now = False
        objs.append(b.build(mat))
    return objs


GARDEN_BED_H = 0.12  # výška záhonu nad terénem (m) – BED_TOP_M v apps/web/lib/scene/homestead.ts


def garden_bed(b, x0, x1, y0, y1, inset_x=0.1):
    """Vyvýšený záhon: plochý vršek zkypřené hlíny, šikmé boky (u paty tráva jako na valu).
    `inset_x` = sklon čel (scéna záhon natahuje podél x, čela se natáhnou s ním)."""
    h, inset = GARDEN_BED_H, 0.1
    o = [(x0, y0, -0.03), (x1, y0, -0.03), (x1, y1, -0.03), (x0, y1, -0.03)]
    t = [(x0 + inset_x, y0 + inset, h), (x1 - inset_x, y0 + inset, h), (x1 - inset_x, y1 - inset, h), (x0 + inset_x, y1 - inset, h)]
    b.poly(t, "soil", out=(0, 0, 1), uvm=[(0, 0), (1, 0), (1, 1), (0, 1)])
    slope_v = math.hypot(inset, h + 0.03)
    for i in range(4):
        j = (i + 1) % 4
        L = math.dist(o[i][:2], o[j][:2])
        b.poly([o[i], o[j], t[j], t[i]], "spoil", out=(0, 0, 1), uvm=[(0, 0), (L, 0), (L - inset, slope_v), (inset, slope_v)])


def _veg_uv(zone, u, v):
    """(u, v) uvnitř třetiny oblasti „veg“ (zone 0 zelí, 1 řepa, 2 bylinky a cibule – pořadí
    VEG_ZONES v atlas.py) → normalizované UV."""
    return ((zone + 0.08 + 0.84 * u) / 3, 0.05 + 0.9 * v)


def cabbage(b, x, y, z0, s, seed):
    """Hlávka zelí: nízká kopule ze šesti stran a čtyři odstávající vnější listy."""
    n, r, h = 6, 0.14 * s, 0.17 * s
    a0 = _rand(seed, 7) * math.pi
    ring = [(x + r * math.cos(a0 + 2 * math.pi * k / n), y + r * math.sin(a0 + 2 * math.pi * k / n)) for k in range(n)]
    mid = [(x + 0.7 * (px - x), y + 0.7 * (py - y)) for px, py in ring]
    top = (x, y, z0 + h)
    for k in range(n):
        k1 = (k + 1) % n
        q = [(*ring[k], z0 + 0.02), (*ring[k1], z0 + 0.02), (*mid[k1], z0 + 0.75 * h), (*mid[k], z0 + 0.75 * h)]
        b.poly(q, "veg", out=(ring[k][0] - x, ring[k][1] - y, 0.3), uvm=[_veg_uv(0, k / n, 0.2), _veg_uv(0, (k + 1) / n, 0.2), _veg_uv(0, (k + 1) / n, 0.7), _veg_uv(0, k / n, 0.7)])
        b.poly([(*mid[k], z0 + 0.75 * h), (*mid[k1], z0 + 0.75 * h), top], "veg", out=(0, 0, 1), uvm=[_veg_uv(0, k / n, 0.7), _veg_uv(0, (k + 1) / n, 0.7), _veg_uv(0, (k + 0.5) / n, 1.0)])
    for k in range(4):  # vnější listy – leží skoro naplocho kolem hlávky
        a = a0 + math.pi / 4 + k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        w = 0.1 * s
        p0 = (x + 0.08 * s * ca, y + 0.08 * s * sa, z0 + 0.02)
        p3 = (x + 0.23 * s * ca, y + 0.23 * s * sa, z0 + 0.08 * s)
        pl = (x + 0.16 * s * ca - w * sa, y + 0.16 * s * sa + w * ca, z0 + 0.07 * s)
        pr = (x + 0.16 * s * ca + w * sa, y + 0.16 * s * sa - w * ca, z0 + 0.07 * s)
        b.poly([p0, pr, p3, pl], "veg", out=(0, 0, 1), uvm=[_veg_uv(0, 0.5, 0.0), _veg_uv(0, 1.0, 0.5), _veg_uv(0, 0.5, 0.9), _veg_uv(0, 0.0, 0.5)])


def leafy_tuft(b, x, y, z0, s, seed, n, spread, height, width):
    """Růžice listů řepy: n listů ze středu šikmo vzhůru, sklon nejvýš ≈ 35° – z herní kamery
    (≈ 49° od svislice) je vidět líc každého listu i na odvrácené straně (plochy jsou
    jednostranné)."""
    prev, b._smooth_now = b._smooth_now, "up"
    a0 = _rand(seed, 8) * 2 * math.pi
    for k in range(n):
        a = a0 + 2 * math.pi * k / n + 0.3 * (_rand(seed * 5 + k, 9) - 0.5)
        ca, sa = math.cos(a), math.sin(a)
        rr = spread * s * (0.8 + 0.4 * _rand(seed * 3 + k, 10))
        hh = min(height * s * (0.8 + 0.4 * _rand(seed * 7 + k, 11)), 0.7 * rr)
        w = width * s
        base = (x, y, z0)
        tip = (x + rr * ca, y + rr * sa, z0 + hh)
        mid = (x + 0.55 * rr * ca, y + 0.55 * rr * sa, z0 + 0.65 * hh)
        left = (mid[0] - w * sa, mid[1] + w * ca, mid[2])
        right = (mid[0] + w * sa, mid[1] - w * ca, mid[2])
        uv = [_veg_uv(1, 0.5, 0.0), _veg_uv(1, 1.0, 0.55), _veg_uv(1, 0.5, 1.0), _veg_uv(1, 0.0, 0.55)]
        b.poly([base, right, tip, left], "veg", out=(-ca * 0.3, -sa * 0.3, 1), uvm=uv)
    b._smooth_now = prev


def onion(b, x, y, z0, s, seed):
    """Nať cibule: tři tenké trojboké jehlany (uzavřené – vidět z každé strany)."""
    prev, b._smooth_now = b._smooth_now, "up"
    for k in range(3):
        a = _rand(seed * 3 + k, 14) * 2 * math.pi
        lean = 0.05 * s * _rand(seed * 5 + k, 15)
        h = 0.26 * s * (0.75 + 0.5 * _rand(seed * 7 + k, 16))
        r = 0.018 * s
        bx, by = x + 0.03 * math.cos(a + 2), y + 0.03 * math.sin(a + 2)
        tip = (bx + lean * math.cos(a), by + lean * math.sin(a), z0 + h)
        ring = [(bx + r * math.cos(a + 2 * math.pi * j / 3), by + r * math.sin(a + 2 * math.pi * j / 3), z0) for j in range(3)]
        for j in range(3):
            j1 = (j + 1) % 3
            b.poly([ring[j], ring[j1], tip], "veg", out=(ring[j][0] + ring[j1][0] - 2 * bx, ring[j][1] + ring[j1][1] - 2 * by, 0), uvm=[_veg_uv(2, 0.3, 0.0), _veg_uv(2, 0.7, 0.0), _veg_uv(2, 0.5, 1.0)])
    b._smooth_now = prev


def herb_bush(b, x, y, z0, s, seed):
    """Keřík bylinek (kopr): nízký pětiboký kužel nati."""
    n, r, h = 5, 0.13 * s, 0.26 * s
    a0 = _rand(seed, 12) * math.pi
    ring = [(x + r * math.cos(a0 + 2 * math.pi * k / n), y + r * math.sin(a0 + 2 * math.pi * k / n), z0 + 0.03) for k in range(n)]
    top = (x + 0.02 * (_rand(seed, 13) - 0.5), y, z0 + h)
    for k in range(n):
        k1 = (k + 1) % n
        b.poly([ring[k], ring[k1], top], "veg", out=(ring[k][0] - x, ring[k][1] - y, 0.4), uvm=[_veg_uv(2, k / n, 0.1), _veg_uv(2, (k + 1) / n, 0.1), _veg_uv(2, (k + 0.5) / n, 1.0)])


def import_prop(name, scale, loc, mat, rot_z=0.0):
    """Koš z 0 A.D.: UV přemapované do oblasti „basket“ v atlasu, materiál atlasu."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(PROPS, f"{name}.glb"))
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in bpy.data.objects:
        if o not in before and o.type != "MESH":
            bpy.data.objects.remove(o)
    obj = new[0]
    obj.parent = None
    obj.scale = (scale, scale, scale)
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (0, 0, rot_z)
    obj.location = loc
    uv = obj.data.uv_layers.active
    us = [d.uv[0] for d in uv.data]
    vs = [d.uv[1] for d in uv.data]
    print(f"PROP {name}: uv u {min(us):.3f}..{max(us):.3f} v {min(vs):.3f}..{max(vs):.3f}")
    for d in uv.data:
        u, v = d.uv
        d.uv = atlas_uv("basket", u % 1.0 if not 0 <= u <= 1 else u, v % 1.0 if not 0 <= v <= 1 else v)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    # jeden materiál – sloty spojených částí sloučit
    mat = obj.data.materials[0]
    for p in obj.data.polygons:
        p.material_index = 0
    while len(obj.data.materials) > 1:
        obj.data.materials.pop(index=len(obj.data.materials) - 1)
    obj.data.materials[0] = mat
    return obj


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


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
        export_jpeg_quality=86,
        export_apply=True,
    )


def render(objs, path, cam_loc, target, size=(1400, 900), lens=50):
    scene = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == "MESH" and not o.name.startswith("ground"):
            o.hide_render = o not in objs
    cam = bpy.data.objects.get("cam")
    if cam is None:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.type = "PERSP"
    cam.location = cam_loc
    direction = Vector(target) - Vector(cam_loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def textured_material(name, path, tint=(1, 1, 1)):
    m = bpy.data.materials.new(name)
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    mix = m.node_tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    m.node_tree.links.new(tex.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*tint, 1)
    m.node_tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return m


def pit_ground(kind, grass_mat, earth_mat):
    """Jen pro náhledy: zem s vyhloubenou jámou a šíjí se schody jako ve scéně
    (dwelling-pit.ts). Vrací objekty, které se po renderu smažou."""
    if kind == "zemnice":
        hx, hy, re, D, steps = 1.85, 2.0, 2.0 + ZEMNICE_RAMP, 1.0, 4
    else:
        hx, hy, re, D, steps = 2.04, 2.04, 2.1 + POLOZEMNICE_RAMP, 0.5, 2

    def inside(x, y):
        return (abs(x) < hx and abs(y) < hy) or (abs(x) < DOOR and -re < y <= -hy + 1e-9)

    R, S = 8.0, 40.0
    xs = sorted({round(-R + 0.1 * i, 4) for i in range(int(2 * R / 0.1) + 1)} | {-hx, hx, -DOOR, DOOR})
    ys = sorted({round(-R + 0.1 * i, 4) for i in range(int(2 * R / 0.1) + 1)} | {-hy, hy, -re})
    verts, faces, uvs = [], [], []

    def quad(pts):
        base = len(verts)
        verts.extend(pts)
        faces.append([base, base + 1, base + 2, base + 3])
        uvs.append([((p[0] + S) / 65, (p[1] + S) / 65) for p in pts])

    for x0, x1 in zip(xs, xs[1:]):
        for y0, y1 in zip(ys, ys[1:]):
            if not inside((x0 + x1) / 2, (y0 + y1) / 2):
                quad([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)])
    for x0, x1, y0, y1 in ((-S, S, -S, -R), (-S, S, R, S), (-S, -R, -R, R), (R, S, -R, R)):
        quad([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)])

    def mesh(name, verts, faces, uvs, mat):
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        layer = me.uv_layers.new()
        for poly, uv in zip(me.polygons, uvs):
            for li, t in zip(poly.loop_indices, uv):
                layer.data[li].uv = t
        me.materials.append(mat)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    ground = mesh("ground-pit", verts, faces, uvs, grass_mat)
    # jáma: dno, stěny, šíje se schody
    pv, pf, pu = [], [], []

    def pquad(pts, uv):
        base = len(pv)
        pv.extend(pts)
        pf.append(list(range(base, base + len(pts))))
        pu.append(uv)

    tread = (re - hy) / steps
    level = lambda i: -D + D * i / steps
    pquad([(-hx, -hy, -D), (hx, -hy, -D), (hx, hy, -D), (-hx, hy, -D)], [(-hx / 3, -hy / 3), (hx / 3, -hy / 3), (hx / 3, hy / 3), (-hx / 3, hy / 3)])
    wall = lambda a, b, z0a, z0b: pquad([(a[0], a[1], z0a), (b[0], b[1], z0b), (b[0], b[1], 0.01), (a[0], a[1], 0.01)], [(0, z0a / 3), (math.dist(a, b) / 3, z0b / 3), (math.dist(a, b) / 3, 0), (0, 0)])
    wall((-hx, hy), (hx, hy), -D, -D)
    wall((-hx, -hy), (-hx, hy), -D, -D)
    wall((hx, hy), (hx, -hy), -D, -D)
    wall((-hx, -hy), (-DOOR, -hy), -D, -D)
    wall((DOOR, -hy), (hx, -hy), -D, -D)
    for i in range(steps):
        y0, y1 = -hy - i * tread, -hy - (i + 1) * tread
        z = level(i)
        pquad([(-DOOR, y0, z), (DOOR, y0, z), (DOOR, y1, z), (-DOOR, y1, z)], [(-DOOR / 3, y0 / 3), (DOOR / 3, y0 / 3), (DOOR / 3, y1 / 3), (-DOOR / 3, y1 / 3)])
        z_next = level(i + 1) if i + 1 < steps else 0.0
        pquad([(-DOOR, y1, z), (DOOR, y1, z), (DOOR, y1, z_next), (-DOOR, y1, z_next)], [(0, z / 3), (0.28, z / 3), (0.28, z_next / 3), (0, z_next / 3)])
        for sgn in (-1, 1):
            wall((sgn * DOOR, y0), (sgn * DOOR, y1), z, z)
    pit = mesh("ground-pit-walls", pv, pf, pu, earth_mat)
    return [ground, pit]


def setup_world(grass_path):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4.5
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(52), 0, math.radians(-35))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.63, 0.75, 0.88, 1)
    bg.inputs["Strength"].default_value = 0.9
    scene.view_settings.view_transform = "Standard"
    gmat = bpy.data.materials.new("ground")
    bsdf = next(n for n in gmat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex = gmat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(grass_path)
    gmat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    S = 40.0
    me = bpy.data.meshes.new("ground")
    me.from_pydata([(-S, -S, 0), (S, -S, 0), (S, S, 0), (-S, S, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for li, (u, v) in zip(range(4), [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u * 2 * S / 65, v * 2 * S / 65)
    me.materials.append(gmat)
    g = bpy.data.objects.new("ground", me)
    scene.collection.objects.link(g)


# ------------------------------------------------------------------ rozpad obydlí

# Rozpad obydlí (population.md – Co hráč vidí, Martin 18. 10. 2026: „jako se nový dům postupně
# staví, tak starý a opuštěný dům se musí postupně rozpadat“). Stupně podle stavu obydlí – který
# kdy, určuje scéna (apps/web/lib/scene/dwelling-decay.ts):
#   1 sešlý (70–45 %)     došky vybledlé a prořídlé, místy díry, mech a tráva na střeše, omítka
#                         místy opadaná (vidět výplet, u polozemnice trámy srubu)
#   2 propadá se (45–20)  část došků pryč, vidět latě a krokve, hřeben prověšený a nakřivo
#   3 zřícený (20–0 %)    střecha spadlá do jámy, trčí krokve a sloupy, stěny rozpadlé
#   zbytek jámy           (po zániku obydlí) trámy v zarůstající prohlubni, nízké valy, kopřivy
# Díly jsou tvary obydlí (build_zemnice / build_polozemnice se stages=True) přeskládané po plochách:
# díry = vynechané plochy, prověšení a zřícení = posunuté vrcholy (plochy se nejdřív rozdělí na
# dílky ≈ 0,5 m, aby se daly ohnout). Uzly decay.glb (souřadnice a počátek jako hotové obydlí):
#   <typ>-<stupeň>          konstrukce (omítka, valy, krov, srub) – atlas obydlí
#   <typ>-<stupeň>-thatch   zbylé došky a hřeben – materiál „decay-faded“ (atlas × vybledlá barva)
#   <typ>-<stupeň>-moss     zarostlé kousky došků (mech, tráva) – „decay-moss“ (atlas × olivová)
#   <typ>-ruin              trámy a pahýly sloupů na dně prohlubně (počátek = dno uprostřed)
#   <typ>-ruin-late         totéž o pár let později – míň trámů, nižší pahýl
#   <typ>-ruin-berms        nízké zarostlé valy kolem prohlubně (počátek = původní terén)
#   nettle                  trs kopřiv (počátek = zem) – „decay-nettle“
# Barvy materiálů jsou glTF baseColorFactor (obrázek atlasu je v GLB jen jednou).

# rozměry z build_zemnice / build_polozemnice: jáma, půlrozměry, střecha; `collapse` = jak hluboko
# spadne hřeben zřícené střechy pod terén, `wall` = val zbytků srubu, přes který se došky přehnou
DECAY_SHAPES = {
    "zemnice": {
        "pit": 1.0,
        "hx": 1.85,
        "hy": 2.0,
        "slope": 1.08,
        "x_eave": 2.3,
        "z_ridge": 1.08 * 2.3,
        "half_len": 2.0 + GABLE_OVERHANG,
        "collapse": 0.72,
        "wall": 0.0,
    },
    "polozemnice": {
        "pit": 0.5,
        "hx": 2.1,
        "hy": 2.1,
        "slope": 1.0,
        "x_eave": 2.6,
        "z_ridge": 0.95 + 0.32 * math.sqrt(2) + 2.1,
        "half_len": 2.1 + GABLE_OVERHANG,
        "collapse": 0.3,
        "wall": 0.3,
    },
}
DECAY_TINTS = {
    "decay-faded": (0.66, 0.63, 0.56),  # vybledlé, zašedlé došky a hřeben
    "decay-moss": (0.46, 0.6, 0.3),  # došky zarostlé mechem a trávou
    "decay-nettle": (0.5, 0.66, 0.4),  # kopřivy
}
DECAY_STEP = 0.55  # největší dílek plochy, která se ohýbá (m)


def tinted_material(base, name, tint):
    """Materiál s týmž obrázkem atlasu jako `base`, barva = atlas × tint (baseColorFactor)."""
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = next(n for n in base.node_tree.nodes if n.type == "TEX_IMAGE").image
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mat.node_tree.links.new(tex.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*tint, 1)
    mat.node_tree.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def _polys(b):
    """Plochy Builderu jako (body, uv, hladkost) – kopie vrcholů."""
    return [([b.verts[i].copy() for i in face], list(uv), sm) for face, uv, sm in zip(b.faces, b.uvs, b.smooth)]


def _put(b, pts, uv, sm=False):
    """Plocha s hotovými UV atlasu (přeskládaná z jiného Builderu)."""
    base = len(b.verts)
    b.verts.extend(Vector(p) for p in pts)
    b.faces.append(list(range(base, base + len(pts))))
    b.uvs.append([tuple(t) for t in uv])
    b.smooth.append(sm)


def _normal(pts):
    n = Vector((0, 0, 0))
    for i, a in enumerate(pts):
        c = pts[(i + 1) % len(pts)]
        n.x += (a.y - c.y) * (a.z + c.z)
        n.y += (a.z - c.z) * (a.x + c.x)
        n.z += (a.x - c.x) * (a.y + c.y)
    return n.normalized() if n.length > 1e-9 else n


def _center(pts):
    return sum(pts, Vector((0, 0, 0))) / len(pts)


def _bilinear(a, b, c, d, s, t):
    return a * ((1 - s) * (1 - t)) + b * (s * (1 - t)) + c * (s * t) + d * ((1 - s) * t)


def _subdivide(pts, uv, step=DECAY_STEP):
    """Čtyřúhelník rozdělený na dílky nejvýš `step` m (aby se dal ohnout), UV bilineárně."""
    if len(pts) != 4:
        return [(pts, uv)]
    p0, p1, p2, p3 = pts
    na = max(1, math.ceil(max((p1 - p0).length, (p2 - p3).length) / step - 1e-6))
    nb = max(1, math.ceil(max((p3 - p0).length, (p2 - p1).length) / step - 1e-6))
    if na == 1 and nb == 1:
        return [(pts, uv)]
    u0, u1, u2, u3 = (Vector((t[0], t[1], 0)) for t in uv)
    out = []
    for i in range(na):
        for j in range(nb):
            st = ((i / na, j / nb), ((i + 1) / na, j / nb), ((i + 1) / na, (j + 1) / nb), (i / na, (j + 1) / nb))
            out.append((
                [_bilinear(p0, p1, p2, p3, s, t) for s, t in st],
                [tuple(_bilinear(u0, u1, u2, u3, s, t))[:2] for s, t in st],
            ))
    return out


def _blot(x, y, salt):
    """Skvrny ≈ 1 m (zhruba 0–1, deterministicky) – kde chybí došky, kde roste mech."""
    return (
        0.5
        + 0.22 * math.sin(1.9 * x + 2.7 * y + 1.3 * salt)
        + 0.16 * math.sin(3.3 * y - 1.1 * x + 2.1 * salt)
        + 0.12 * math.sin(5.7 * x + 4.3 * y + 0.7 * salt)
    )


def _sag(shape, amount, lean):
    """Prověšená střecha (stupeň 2): mezi štíty klesne hřeben o `amount`, přesah za štíty se
    sveze dolů, okapy zůstanou na valech; celá střecha se nakloní na stranu (`lean` m ve výšce
    hřebene)."""
    hy, half_len, x_eave, z_ridge = shape["hy"], shape["half_len"], shape["x_eave"], shape["z_ridge"]

    def f(p):
        mid = max(0.0, 1 - (p.y / hy) ** 2)
        over = max(0.0, (abs(p.y) - hy) / (half_len - hy))
        k = max(0.0, 1 - abs(p.x) / x_eave) ** 0.7
        h = max(0.0, p.z) / z_ridge
        return Vector((p.x + lean * h, p.y, p.z - (amount * mid + 0.8 * amount * over) * k))

    return f


def _collapse(shape):
    """Zřícená střecha (stupeň 3): hřeben spadl do jámy, okapy zůstaly na valech (u polozemnice
    se došky přehnou přes zbytky srubu) – došky a krov leží v korytě, přesah za štíty na zemi,
    vrstva se slehne."""
    hy, half_len, x_eave = shape["hy"], shape["half_len"], shape["x_eave"]
    z_ridge, slope, depth, wall = shape["z_ridge"], shape["slope"], shape["collapse"], shape["wall"]

    def f(p):
        ax = min(1.0, abs(p.x) / x_eave)
        ay = abs(p.y)
        w = 1.0 if ay <= hy else max(0.2, 1 - 0.8 * (ay - hy) / (half_len - hy))
        below = p.z - (z_ridge - slope * abs(p.x))  # pod lícem střechy (tloušťka, krokve)
        z = -depth * (1 - ax) ** 1.2 * w + 1.6 * noise(2.1 * p.x, 1.7 * p.y)
        z += wall * math.exp(-(((abs(p.x) - 2.0) / 0.35) ** 2)) * min(1.0, w * 1.4)
        return Vector((p.x * 0.94, p.y * 0.97, z + 0.45 * below + 0.05))

    return f


def _beams(b):
    """Plochy Builderu po trámech (beam/plank = 6 ploch za sebou)."""
    polys = _polys(b)
    return [polys[i : i + 6] for i in range(0, len(polys), 6)]


def _copy(dst, polys, deform=None, step=None):
    """Plochy do `dst` – volitelně rozdělené na dílky a posunuté."""
    for pts, uv, sm in polys:
        pieces = _subdivide(pts, uv, step) if step else [(pts, uv)]
        for p, u in pieces:
            _put(dst, [deform(q) for q in p] if deform else p, u, sm)


def _patch(b, origin, ax_u, ax_v, out, size, mat, uv_at, seed):
    """Nepravidelná skvrna (osmiúhelník) těsně před plochou – opadaná omítka (výplet, trámy),
    mech na doškách. `uv_at(du, dv)` = metrické (u, v) atlasu bodu skvrny."""
    pts, uvm = [], []
    for k in range(8):
        a = 2 * math.pi * (k + 0.3 * (_rand(seed * 8 + k, 21) - 0.5)) / 8
        r = 0.72 + 0.3 * _rand(seed * 8 + k, 22)
        du, dv = 0.5 * size[0] * r * math.cos(a), 0.5 * size[1] * r * math.sin(a)
        pts.append(Vector(origin) + Vector(ax_u) * du + Vector(ax_v) * dv + Vector(out) * 0.014)
        uvm.append(uv_at(du, dv))
    b.poly(pts, mat, out=out, uvm=uvm)


def _wall_patches(b, kind, stage):
    """Opadaná omítka: na štítech vidět výplet z proutí, u polozemnice na stěnách trámy srubu."""
    count = 3 if stage == 1 else 6
    grow = 1.0 if stage == 1 else 1.35
    wattle = lambda du, dv, z: (du, z + dv + 0.05)  # noqa: E731
    if kind == "zemnice":
        spots = [(2.0, 0.9, 0.5), (2.0, -0.6, 1.0), (-2.0, 1.15, 0.38), (2.0, -0.2, 0.25), (-2.0, -1.2, 0.55), (-2.0, 0.65, 1.15)]
        for i, (y, x, z) in enumerate(spots[:count]):
            out = (0, 1 if y > 0 else -1, 0)
            _patch(b, (x, y, z), (1, 0, 0), (0, 0, 1), out, (0.62 * grow, 0.42 * grow), "wattle", lambda du, dv, z=z: wattle(du, dv, z), 31 + i)
        return
    # polozemnice: boky srubu (x = ±2,1) – trámy pod mazanicí, štíty nad srubem – výplet
    spots = [(2.1, 0.8, 0.45), (-2.1, -0.9, 0.3), (2.1, -1.1, 0.12), (-2.1, 1.2, 0.6), (2.1, 0.0, 0.7), (-2.1, 0.2, 0.2)]
    for i, (x, y, z) in enumerate(spots[:count]):
        out = (1 if x > 0 else -1, 0, 0)
        _patch(b, (x, y, z), (0, 1, 0), (0, 0, 1), out, (0.7 * grow, 0.4 * grow), "logs_rot", lambda du, dv, y=y, z=z: (y + du, (z + dv) % 0.44 - 0.22), 41 + i)
    for i, (y, x, z) in enumerate([(2.1, 0.5, 1.45), (-2.1, -0.6, 1.3)][: 1 if stage == 1 else 2]):
        out = (0, 1 if y > 0 else -1, 0)
        _patch(b, (x, y, z), (1, 0, 0), (0, 0, 1), out, (0.55 * grow, 0.38 * grow), "wattle", lambda du, dv, z=z: wattle(du, dv, z - 0.95), 51 + i)


def _mossy(pts, salt, level):
    """Zarůstá kousek došků mechem a trávou? Jen horní plochy, skvrny podle šumu (≈ 2 m)."""
    c = _center(pts)
    return _normal(pts).z > 0.3 and _blot(0.6 * c.x + 4.0, 0.6 * c.y, salt + 5) + 0.1 * _rand(int(97 * (c.x + 3.1 * c.y + 7)), 23) > level


def decay_parts(kind, stage):
    """Díly stupně rozpadu `stage` (1–3) obydlí `kind`: (konstrukce, došky, mech) – Buildery."""
    shape = DECAY_SHAPES[kind]
    src = Parts("src")
    (build_zemnice if kind == "zemnice" else build_polozemnice)(src, stages=True)
    parts = src.builders
    main = Builder(f"{kind}-{stage}")
    thatch = Builder(f"{kind}-{stage}-thatch")
    moss = Builder(f"{kind}-{stage}-moss")
    salt = 3 * stage + (0 if kind == "zemnice" else 11)
    deform = {1: None, 2: _sag(shape, 0.5, 0.26), 3: _collapse(shape)}[stage]
    hole = {1: 0.8, 2: 0.6, 3: 0.55}[stage]
    moss_level = {1: 0.68, 2: 0.6, 3: 0.52}[stage]
    x_eave, half_len = shape["x_eave"], shape["half_len"]

    def missing(c):
        """Chybí kousek došků v bodě c (původní poloha)? Díry jako skvrny ≈ 2 m s roztřepaným
        okrajem; stupeň 2 hlavně kolem středu hřebene."""
        bias = 0.1 * _rand(int(97 * (c.x + 3.1 * c.y + 11)), salt)
        if stage == 2:
            bias += 0.3 * max(0.0, 1 - abs(c.y) / half_len) * max(0.0, 1 - abs(c.x) / x_eave)
        return _blot(0.55 * c.x, 0.55 * c.y, salt) + bias > hole

    # došky a hřeben: díry, prověšení / zřícení, mech na horních plochách
    for key, b in parts.items():
        if not (key.startswith("thatch") or key == "ridge"):
            continue
        for pts, uv, sm in _polys(b):
            # dílky ≈ 0,5 m: ohnou se, hřeben chybí po kusech (řady došků je mají z THATCH_NY)
            for p, u in _subdivide(pts, uv) if deform or key == "ridge" else [(pts, uv)]:
                if missing(_center(p)):
                    continue
                q = [deform(v) for v in p] if deform else p
                _put(moss if _mossy(q, salt, moss_level) else thatch, q, u, sm)

    # krov: latě, krokve a hřebenová vaznice – vidět děrami; ve stupni 2 a 3 část chybí
    frame = [k for k in parts if k in ("laths", "ridge-beam") or k.startswith("rafters")]
    for key in frame:
        for i, beam in enumerate(_beams(parts[key])):
            seed = sum(ord(ch) for ch in key) * 31 + i
            drop = {1: 0.0, 2: 0.3 if key == "laths" else 0.15, 3: 0.55}[stage]
            if _rand(seed, salt) < drop:
                continue
            _copy(main, beam, deform, DECAY_STEP if deform else None)

    # valy hlíny zůstávají
    _copy(main, _polys(parts["berms"]))

    if stage < 3:
        # stěny stojí, omítka místy opadala; sloupy krovu jdou s prověšeným hřebenem
        _copy(main, _polys(parts["daub"]))
        _wall_patches(main, kind, stage)
        for key in ("posts", "plates"):
            if key in parts:
                _copy(main, _polys(parts[key]), deform, DECAY_STEP if deform else None)
        return main, thatch, moss

    if kind == "zemnice":
        _zemnice_rubble(main, parts)
    else:
        _polozemnice_rubble(main, parts, deform)
    _sticking_rafters(main, kind)
    return main, thatch, moss


def _gable_stub(b, y, x0, x1, top, seed):
    """Zbytek omazaného štítu zemnice: pruh od ZG (pod zemí) po zubatou horní hranu `top`
    (m nad terénem) – líc ven a hrana omítky nahoře."""
    out = (0, 1 if y > 0 else -1, 0)
    n = max(2, math.ceil((x1 - x0) / 0.4))
    xs = [x0 + (x1 - x0) * i / n for i in range(n + 1)]
    hs = [max(0.05, top * (0.75 + 0.5 * _blot(2.3 * x, 0.0, seed) - 0.25 * _rand(seed * 17 + i, 24))) for i, x in enumerate(xs)]
    for i in range(n):
        pts = [(xs[i], y, -0.5), (xs[i + 1], y, -0.5), (xs[i + 1], y, hs[i + 1]), (xs[i], y, hs[i])]
        b.poly(pts, "daub", out=out, uvm=[(p[0], p[2]) for p in pts])
        inner = y - 0.09 * out[1]
        cap = [(xs[i], y, hs[i]), (xs[i + 1], y, hs[i + 1]), (xs[i + 1], inner, hs[i + 1] - 0.03), (xs[i], inner, hs[i] - 0.03)]
        b.poly(cap, "wattle", out=(0, 0, 1), uvm=[(p[0], 0.1 + 0.4 * (p[1] - inner) * out[1]) for p in cap])


def _zemnice_rubble(b, parts):
    """Zřícená zemnice: ze štítů zbyly nízké zubaté pahýly, u dveří jeden sloup ostění, nadpraží
    leží; ze dvou sloupů krovu jeden ulomený trčí, druhý leží v jámě; rohové kůly jámy stojí."""
    px, py, door = 1.85, 2.0, DOOR
    _gable_stub(b, py, -px, px, 0.55, 3)
    _gable_stub(b, -py, -px, -door - 0.06, 0.42, 5)
    _gable_stub(b, -py, door + 0.06, px, 0.3, 7)
    b.beam((-0.48, -py - 0.06, -1.0), (-0.5, -py - 0.08, 0.72), 0.12)
    b.beam((0.1, -py - 0.35, 0.05), (1.15, -py - 0.75, 0.0), 0.13)
    # sloupy krovu: ulomený nakřivo, druhý spadl do jámy; rozsochy pryč
    b.beam((0, -1.4, -1.0), (0.18, -1.32, 0.62), 0.17)
    b.beam((-0.55, 1.15, -0.9), (1.1, 0.25, -0.62), 0.17)
    for beam in _beams(parts["posts"])[6:]:  # rohové kůly výdřevy jámy
        _copy(b, beam)


def _polozemnice_rubble(b, parts, deform):
    """Zřícená polozemnice: ze srubu zbyly spodní řady trámů (horní napůl, ještě výš jednotlivé
    trámy), pár trámů spadlo dovnitř; vaznice se zřítily se střechou."""
    keep = {1: 1.0, 2: 1.0, 3: 1.0, 4: 0.55, 5: 0.25, 6: 0.0}
    for course, share in keep.items():
        for i, beam in enumerate(_beams(parts[f"logs-{course}"])):
            if _rand(course * 13 + i, 25) < share:
                _copy(b, beam)
    for a, c in (((-1.9, -0.8, 0.25), (-0.5, 0.9, -0.36)), ((1.95, 1.2, 0.3), (0.4, 0.2, -0.38)), ((0.6, -2.3, 0.12), (-0.9, -1.0, -0.4))):
        b.beam(a, c, 0.21)
    for i, beam in enumerate(_beams(parts["plates"])):
        if i % 2 == 0:
            _copy(b, beam, deform, DECAY_STEP)


def _sticking_rafters(b, kind):
    """Pár krokví trčí ze zřícené střechy – pata na valu (zemnice) nebo na zbytku srubu, ulomený
    konec šikmo nahoru."""
    if kind == "zemnice":
        rafters = [((2.2, -1.2, 0.05), (1.15, -1.0, 1.2)), ((-2.2, 0.4, 0.05), (-1.0, 0.65, 1.0)), ((2.15, 1.8, 0.08), (1.35, 1.55, 0.85))]
    else:
        rafters = [((2.05, -1.0, 0.32), (0.95, -0.85, 1.45)), ((-2.05, 0.6, 0.3), (-0.85, 0.75, 1.25)), ((1.95, 2.0, 0.28), (1.2, 1.7, 1.0))]
    for a, c in rafters:
        b.beam(a, c, 0.1)


def _overgrown_uv(uv):
    """UV valu přemapované do trávy pásu drnů (zarostlý val): poloha v pásu (od paty valu)
    se zachová, jen se stáhne do spodní, travnaté části pásu drnů."""
    row = (1 - uv[1]) * AH
    src = next((b for b in (BANDS["turf"], BANDS["spoil"]) if b["r0"] - 1 <= row <= b["r1"] + 1), BANDS["turf"])
    t = min(1.0, max(0.0, (src["r1"] - row) / (src["r1"] - src["r0"])))
    turf = BANDS["turf"]
    return (uv[0], 1 - (turf["r1"] - 3 - 0.5 * t * (turf["r1"] - turf["r0"])) / AH)


def ruin_parts(kind):
    """Zbytek jámy: trámy a pahýly sloupů na dně prohlubně (dva stupně) a nízké zarostlé valy."""
    shape = DECAY_SHAPES[kind]
    hx, hy = shape["hx"] - 0.6, shape["hy"] - 0.6
    early, late = Builder(f"{kind}-ruin"), Builder(f"{kind}-ruin-late")
    logs = [
        ((-hx, -0.4 * hy, 0.06), (0.7 * hx, 0.5 * hy, 0.02), 0.17),
        ((0.2 * hx, -hy, 0.04), (0.9 * hx, 0.4 * hy, 0.09), 0.14),
        ((-0.6 * hx, 0.75 * hy, 0.05), (0.5 * hx, 0.95 * hy, 0.03), 0.15),
        ((-0.9 * hx, -0.95 * hy, 0.08), (-0.2 * hx, -0.3 * hy, 0.04), 0.12),
    ]
    for i, (a, c, size) in enumerate(logs):
        early.beam(a, c, size)
        if i in (0, 2):
            late.beam((a[0], a[1], a[2] - 0.05), (c[0], c[1], c[2] - 0.05), size * 0.9)
    stumps = [(0.15, -0.55 * hy), (-0.25, 0.6 * hy)] if kind == "zemnice" else [(-hx, -hy), (hx, hy)]
    for i, (x, y) in enumerate(stumps):
        early.beam((x, y, -0.25), (x + 0.03, y + 0.02, 0.45 - 0.15 * i), 0.15)
    late.beam((stumps[0][0], stumps[0][1], -0.25), (stumps[0][0], stumps[0][1], 0.22), 0.14)
    # valy: tvar valů obydlí, nižší a zarostlé trávou
    src = Parts("src-ruin")
    (build_zemnice if kind == "zemnice" else build_polozemnice)(src)
    berms = Builder(f"{kind}-ruin-berms")
    berms._smooth_now = True
    for pts, uv, sm in _polys(src.builders["berms"]):
        _put(berms, [Vector((p.x, p.y, p.z * 0.6)) for p in pts], [_overgrown_uv(t) for t in uv], sm)
    return early, late, berms


def nettle_clump(b):
    """Trs kopřiv: sedm lodyh 0,5–0,95 m, na každé čtyři až pět párů křižmostojných listů
    (lodyha z pásu drnů, list z oblasti zeleniny – řepa); listy šikmo, líc nahoru."""
    prev = b._smooth_now
    for k in range(7):
        a = 2 * math.pi * (k + 0.4 * _rand(k, 26)) / 7
        r0 = 0.04 + 0.14 * _rand(k, 27)
        base = Vector((r0 * math.cos(a), r0 * math.sin(a), 0))
        h = 0.5 + 0.45 * _rand(k, 28)
        lean = 0.06 + 0.08 * _rand(k, 29)
        tip = base + Vector((lean * math.cos(a), lean * math.sin(a), h))
        b._smooth_now = False
        b.beam(base, tip, 0.018, mat="turf")
        b._smooth_now = "up"
        n = 4 + k % 2
        for j in range(n):
            t = 0.28 + 0.68 * j / n
            p = base.lerp(tip, t)
            size = 0.13 * (1.15 - 0.55 * j / n)
            phi = a + (math.pi / 2 if j % 2 else 0) + 0.4 * (_rand(k * 7 + j, 30) - 0.5)
            for side in (-1, 1):
                d = Vector((side * math.cos(phi), side * math.sin(phi), 0))
                perp = Vector((-d.y, d.x, 0))
                length, width = 1.6 * size, 0.5 * size
                mid = p + d * (0.5 * length) + Vector((0, 0, 0.03))
                leaf = [p, mid + perp * width, p + d * length - Vector((0, 0, 0.04)), mid - perp * width]
                uv = [_veg_uv(1, 0.5, 0.0), _veg_uv(1, 1.0, 0.55), _veg_uv(1, 0.5, 1.0), _veg_uv(1, 0.0, 0.55)]
                b.poly(leaf, "veg", out=(0, 0, 1), uvm=uv)
    b._smooth_now = prev


def decay_main():
    """Jen díly rozpadu obydlí → decay.glb (ostatní GLB obydlí zůstanou beze změny)."""
    global THATCH_NY
    bpy.ops.wm.read_factory_settings(use_empty=True)
    THATCH_NY = 12
    mat = make_material()
    mats = {name: tinted_material(mat, name, tint) for name, tint in DECAY_TINTS.items()}
    objs = []
    for kind in ("zemnice", "polozemnice"):
        for stage in (1, 2, 3):
            main, thatch, moss = decay_parts(kind, stage)
            objs.append(main.build(mat))
            objs.append(thatch.build(mats["decay-faded"]))
            if moss.faces:
                objs.append(moss.build(mats["decay-moss"]))
        early, late, berms = ruin_parts(kind)
        objs += [early.build(mat), late.build(mat), berms.build(mat)]
    nettle = Builder("nettle")
    nettle_clump(nettle)
    objs.append(nettle.build(mats["decay-nettle"]))
    os.makedirs(OUT, exist_ok=True)
    export(objs, os.path.join(OUT, "decay.glb"))
    for obj in objs:
        print(f"PART {obj.name}: {tri_count(obj)} tris")
    if RENDER != "-":
        render_decay(objs)


def render_decay(objs):
    """Náhledy rozpadu: každý stupeň obou obydlí nad jámou, zbytek jámy a kopřivy."""
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain")
    setup_world(os.path.join(root, "grass.jpg"))
    os.makedirs(RENDER, exist_ok=True)
    scene = bpy.context.scene
    scene.cycles.samples = 24
    grass_mat = bpy.data.materials["ground"]
    earth_mat = textured_material("pit-earth", os.path.join(root, "mud.jpg"), (0.8, 0.62, 0.45))
    by_name = {o.name: o for o in objs}
    for kind in ("zemnice", "polozemnice"):
        bpy.data.objects["ground"].hide_render = True
        extra = pit_ground(kind, grass_mat, earth_mat)
        for stage in (1, 2, 3):
            shown = [by_name[n] for n in (f"{kind}-{stage}", f"{kind}-{stage}-thatch", f"{kind}-{stage}-moss") if n in by_name]
            render(shown, os.path.join(RENDER, f"{kind}-{stage}.png"), (-7.5, -11.5, 7.0), (0.3, 0, 0.6), size=(900, 640))
        for o in extra:
            bpy.data.objects.remove(o)
        bpy.data.objects["ground"].hide_render = False
        ruin = [by_name[f"{kind}-ruin"], by_name[f"{kind}-ruin-berms"]]
        render(ruin, os.path.join(RENDER, f"{kind}-ruin.png"), (-6.5, -9.5, 6.0), (0, 0, 0), size=(900, 640))
    nettle = by_name["nettle"]
    render([nettle], os.path.join(RENDER, "nettle.png"), (-1.6, -2.2, 1.4), (0, 0, 0.4), size=(700, 600))


def dvorec_main():
    """Jen dvorec vojvody → dvorec.glb, dvorec-gate.glb a dvorec-construction.glb (trade.md)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    dp = Parts("f-dvorec")
    build_dvorec(dp)
    dvorec = join(dp.build(mat), "dvorec")
    gate_b = Builder("dvorec-gate")
    build_dvorec_gate(gate_b)
    # brána je malý díl – jako pletený plot s polovičním atlasem
    gate = gate_b.build(make_material(0.5))
    os.makedirs(OUT, exist_ok=True)
    for obj in (dvorec, gate):
        obj.location = (0, 0, 0)
        export([obj], os.path.join(OUT, f"{obj.name}.glb"))
        d = obj.dimensions
        print(f"STAT {obj.name}: {tri_count(obj)} tris, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")
    ds = Parts("dvorec")
    build_dvorec(ds, stages=True)
    stage_objs = ds.build(mat)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in stage_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = stage_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    export(stage_objs, os.path.join(OUT, "dvorec-construction.glb"))
    for obj in stage_objs:
        print(f"PART {obj.name}: {tri_count(obj)} tris")
    if RENDER != "-":
        terrain = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain")
        setup_world(os.path.join(terrain, "grass.jpg"))
        os.makedirs(RENDER, exist_ok=True)
        for o in stage_objs:
            o.hide_render = True
        gate.location = (0, -12, 0)
        render([dvorec, gate], os.path.join(RENDER, "dvorec_front.png"), (-9.5, -16.5, 6.5), (0.3, -2, 1.2))
        render([dvorec], os.path.join(RENDER, "dvorec_side.png"), (17.0, -3.5, 5.0), (0, -0.3, 1.4), lens=35)
        render([dvorec], os.path.join(RENDER, "dvorec_heads.png"), (-2.5, -9.5, 5.6), (0, -5.3, 4.2), size=(1200, 900), lens=40)
        render([dvorec, gate], os.path.join(RENDER, "dvorec_game_angle.png"), (0, -26, 23.0), (0, -3, 0.5), size=(1600, 900))


def main():
    if DECAY_ONLY:
        decay_main()
        return
    if DVOREC_ONLY:
        dvorec_main()
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()

    # hráň polen vedle obydlí už není (Martin: tak vyskládané dřevo tehdy neměli, navíc na dešti),
    # u polozemnice ani samotný kus pleteného plotu vedle domu (Martin) – plot má jen pozemek
    zp = Parts("f-zemnice")
    build_zemnice(zp)
    zemnice = join(zp.build(mat) + [import_prop("basket-a", 0.42, (-1.55, -3.55, 0.0), mat)], "zemnice")

    pp = Parts("f-polozemnice")
    build_polozemnice(pp)
    p_props = [
        import_prop("basket-a", 0.42, (1.5, -3.0, 0.0), mat),
        import_prop("basket-b", 0.38, (2.0, -2.85, 0.0), mat, 0.6),
    ]
    polozemnice = join(pp.build(mat) + p_props, "polozemnice")

    os.makedirs(OUT, exist_ok=True)
    for obj in (zemnice, polozemnice):
        obj.location = (0, 0, 0)
        export([obj], os.path.join(OUT, f"{obj.name}.glb"))
        d = obj.dimensions
        print(f"STAT {obj.name}: {tri_count(obj)} tris, {len(obj.data.materials)} mat, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")
    # pletený plot (pozemek i hřbitov) a díly pozemku polozemnice (záhony, rostliny) – rozmístí
    # je scéna
    fence_parts = woven_fence_parts(make_material(0.5))
    export(fence_parts, os.path.join(OUT, "woven-fence.glb"))
    plot_parts = homestead_parts(mat)
    export(plot_parts, os.path.join(OUT, "homestead.glb"))
    for obj in fence_parts + plot_parts:
        print(f"PART {obj.name}: {tri_count(obj)} tris")

    # staveniště: díly obou obydlí podle fází stavby a rekvizity – jeden GLB, jeden atlas
    zs = Parts("zemnice")
    build_zemnice(zs, stages=True)
    ps = Parts("polozemnice")
    build_polozemnice(ps, stages=True)
    sp = Parts("site")
    extra = site_props(sp, mat)
    stage_objs = zs.build(mat) + ps.build(mat) + sp.build(mat) + extra
    bpy.ops.object.select_all(action="DESELECT")
    for obj in stage_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = stage_objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    export(stage_objs, os.path.join(OUT, "construction.glb"))
    for obj in stage_objs:
        print(f"PART {obj.name}: {tri_count(obj)} tris")

    if RENDER != "-":
        setup_world(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain", "grass.jpg"))
        os.makedirs(RENDER, exist_ok=True)
        terrain = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain")
        grass_mat = bpy.data.materials["ground"]
        earth_mat = textured_material("pit-earth", os.path.join(terrain, "mud.jpg"), (0.8, 0.62, 0.45))
        bpy.data.objects["ground"].hide_render = True
        for obj in (zemnice, polozemnice):
            extra = pit_ground(obj.name, grass_mat, earth_mat)
            render([obj], os.path.join(RENDER, f"{obj.name}_front.png"), (-7.5, -11.5, 5.2), (0.3, 0, 0.9))
            render([obj], os.path.join(RENDER, f"{obj.name}_side.png"), (15.0, -2.5, 4.2), (0, -0.3, 1.0), lens=35)
            render([obj], os.path.join(RENDER, f"{obj.name}_back.png"), (9.5, 9.0, 6.0), (0, 0, 0.8))
            render([obj], os.path.join(RENDER, f"{obj.name}_close.png"), (-2.4, -8.6, 3.9), (0.05, -2.7, 0.0), size=(1200, 900), lens=30)
            for o in extra:
                bpy.data.objects.remove(o)
        bpy.data.objects["ground"].hide_render = False
        # obě vedle sebe z herního úhlu (≈ 49° od svislice)
        zemnice.location = (-4.5, 0, 0)
        polozemnice.location = (4.5, 0, 0)
        render([zemnice, polozemnice], os.path.join(RENDER, "both_game_angle.png"), (0, -24, 21.5), (0, 0, 0.5), size=(1600, 900))


# crafts.py importuje tvary obydlí (Builder, thatch_roof, build_*) – jen při spuštění skriptu
if __name__ == "__main__":
    main()
