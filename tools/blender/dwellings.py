"""Raně slovanská zemnice a polozemnice (6.–9. st.) procedurálně – omazané stěny
(mazanice), slámové došky, jeden atlas (trim sheet) z textur 0 A.D. → jeden materiál na model.

blender -b --factory-startup --python tools/blender/dwellings.py -- \
    <atlas_dir> <props_glb_dir> apps/web/public/models/dwellings <render_dir|->

props_glb_dir: koše z 0 A.D. (basket-a.glb, basket-b.glb) převedené přes trees_from_0ad.py
s tools/blender/dwelling-props.json. render_dir: náhledy v Cycles, "-" = bez náhledů.
atlas_dir: atlas.jpg + atlas.json z tools/blender/atlas.py (pásy opakované v U, plochy ve V uvnitř
pásu podle metrů; oblasti „veg“ a „soil“ pro zeleninu a záhony zahrádky). Souřadnice Blenderu: Z nahoru, hřeben střechy podél osy Y, vchod na štítu
v -Y. Počátek = střed půdorysu na úrovni původního terénu. V glTF (a ve scéně při natočení 0)
míří vchod do +Z. Jámu se šíjí a schody kreslí scéna (apps/web/lib/scene/dwelling-pit.ts –
rozměry musí sedět s DOOR, *_RAMP a půdorysy jam tady); modely mají jen štíty, ostění dveří
a sloupy, které do jámy sahají. Střecha přečnívá před oba štíty o GABLE_OVERHANG.

Výstup: zemnice.glb, polozemnice.glb (hotová obydlí), garden.glb (zahrádka polozemnice – počátek
uprostřed zahrádky, scéna ji staví vedle domu na terén zvlášť a nakloní podle svahu) a
construction.glb – díly staveniště
po fázích (uzly „zemnice-…“, „polozemnice-…“: kolíky, sloupy, krov, latě, výplet, srub, řady
došků zdola nahoru, hřeben, valy, u polozemnice nakonec zahrádka garden-posts / garden-rails /
garden-beds / garden-plants) a rekvizity („site-…“); kdy se který díl ukáže, určuje
apps/web/lib/scene/village-construction.ts. Hráň polen vedle obydlí není (Martin: tak
vyskládané dřevo tehdy neměli, navíc na dešti). K polozemnici patří po pravé straně
(Blender +x) zahrádka ≈ 3,8 × 5 m obehnaná polským plotem – řidší kůly a vodorovně proplétané
větve, u domu mezera branky – se čtyřmi záhony (zelí, řepa, cibule, kopr); řemeslné dílny
z polozemnice ji nemají (build_garden volá jen main). Rozměry v GARDEN musí sedět
s DWELLING_GARDEN_M v packages/game/src/domain/village/rules.ts (hlídá test podle garden.glb).

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
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
ATLAS, PROPS, OUT, RENDER = args[0], args[1], args[2], args[3]
META = json.load(open(os.path.join(ATLAS, "atlas.json")))
AW, AH, UPER = META["W"], META["H"], META["uperiod_m"]
BANDS, REGIONS = META["bands"], META["regions"]

COURSES = META["thatch_courses"]  # hranice řad došků po spádu od okapu (m) – sedí s atlasem
LIP = 0.06  # o kolik spodní hrana řady přečnívá řadu pod ní (m)


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


def make_material():
    mat = bpy.data.materials.new("dwelling-atlas")
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(ATLAS, "atlas.jpg"))
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


def thatch_roof(part, half_len, z_ridge, slope, x_eave, thickness, ny=6, kozy=(1.5, 0.62)):
    """Sedlová slámová střecha z řad došků (kurzů): každá řada je nepatrně strmější než
    střecha, takže spodní hrana přečnívá řadu pod ní o LIP – stupeň vrhá stín a řady jsou
    čitelné i z dálky. part(klíč) vrátí Builder: řady 'thatch-1' … 'thatch-N' zdola nahoru
    (staveniště je kladou postupně), hřeben s kozami 'ridge'. Vrací z_in(x) – spodní plochu
    střechy."""
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


def wattle_fence(mat, length=4.0, height=0.9, name="fence"):
    b = Builder(name)
    n = 5
    for i in range(n):
        x = -length / 2 + length * i / (n - 1)
        b.beam((x, 0, -0.1), (x, 0, height + 0.12), 0.09)
    th = 0.06
    b.box(-length / 2, length / 2, -th / 2, th / 2, 0.08, height, "wattle")
    return b.build(mat)


# ------------------------------------------------------------------ zahrádka polozemnice

# Zahrádka vedle polozemnice (Martin): obdélník ≈ 3,8 × 5 m po pravé straně domu (Blender +x,
# ve scéně −x modelu) za trsy trávy u okapu, ne před vchodem ani na vyšlapané hlíně. Plot má
# u domu, kousek za předním rohem, mezeru (branku). Vyklízená plocha obydlí (DWELLING_CLEARING_M
# v packages/game/src/domain/village/rules.ts) ji musí pokrýt – minX polozemnice ≤ −(GARDEN x1 + okraj).
GARDEN = {"x0": 3.45, "x1": 7.25, "y0": -1.7, "y1": 3.3}
GARDEN_GATE = (-1.35, -0.55)  # mezera v plotu u domu (y od–do na straně x0)
GARDEN_STAKE_STEP = 1.0  # rozestup kůlů (m) – řidší než u pleteného plotu
GARDEN_RODS = (0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88)  # výšky proplétaných větví (m)
GARDEN_STAKE_TOP = 1.0
# střed zahrádky = počátek modelu garden.glb a dílů garden-* v construction.glb; ve scéně (souřadnice
# modelu, vchod do +z) je to (−x, −y) – střed DWELLING_GARDEN_M polozemnice v rules.ts
GARDEN_CENTER = ((GARDEN["x0"] + GARDEN["x1"]) / 2, (GARDEN["y0"] + GARDEN["y1"]) / 2)


def garden_origin(objs):
    """Posune díly zahrádky tak, aby počátek ležel v jejím středu (transformaci zapeče join /
    export staveniště)."""
    for o in objs:
        o.location = (-GARDEN_CENTER[0], -GARDEN_CENTER[1], 0)
    return objs


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


def garden_stakes():
    """Kůly plotu po obvodu zahrádky v pořadí obcházení – od branky podél domu dozadu, kolem
    a zpět k brance. Vrací [(x, y, směr ven (nx, ny), u_branky)]."""
    g = GARDEN
    corners = [(g["x0"], GARDEN_GATE[1]), (g["x0"], g["y1"]), (g["x1"], g["y1"]), (g["x1"], g["y0"]), (g["x0"], g["y0"]), (g["x0"], GARDEN_GATE[0])]
    out = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:]):
        length = math.hypot(bx - ax, by - ay)
        n = max(1, round(length / GARDEN_STAKE_STEP))
        for i in range(n + (1 if (bx, by) == corners[-1] else 0)):
            t = i / n
            out.append([ax + (bx - ax) * t, ay + (by - ay) * t])
    cx, cy = (g["x0"] + g["x1"]) / 2, (g["y0"] + g["y1"]) / 2
    res = []
    for i, (x, y) in enumerate(out):
        # směr ven: kolmo ke straně (v rozích úhlopříčně)
        nx = (1 if abs(x - g["x1"]) < 1e-6 else -1 if abs(x - g["x0"]) < 1e-6 else 0)
        ny = (1 if abs(y - g["y1"]) < 1e-6 else -1 if abs(y - g["y0"]) < 1e-6 else 0)
        if nx == 0 and ny == 0:
            nx, ny = x - cx, y - cy
        ln = math.hypot(nx, ny)
        gate = i == 0 or i == len(out) - 1
        res.append((x, y, (nx / ln, ny / ln), gate))
    return res


def build_garden(part):
    """Zahrádka polozemnice obehnaná polským plotem: řidší kůly a mezi nimi vodorovně
    proplétané větve (střídavě před a za kůlem – lehčí hrazení než pletený plot), u domu mezera
    branky s vyššími kůly. Uvnitř podél plotu u domu ulička a napříč čtyři vyvýšené záhony:
    zelí, řepa, cibule a bylinky (kopr). Díly pro staveniště: garden-posts (kůly),
    garden-rails (proplétání), garden-beds (záhony), garden-plants (zelenina)."""
    stakes = garden_stakes()
    b = part("garden-posts")
    for i, (x, y, _, gate) in enumerate(stakes):
        top = (1.22 if gate else GARDEN_STAKE_TOP) + 0.08 * (_rand(i, 1) - 0.5)
        lean = 0.03 * (_rand(i, 2) - 0.5)
        b.beam((x, y, -0.15), (x + lean, y + lean, top), 0.08)
    b = part("garden-rails")
    for k, z in enumerate(GARDEN_RODS):
        pts = []
        for i, (x, y, (nx, ny), _) in enumerate(stakes):
            side = 1 if (i + k) % 2 == 0 else -1
            off = 0.065 * side
            sag = 0.025 * (_rand(i * 7 + k, 3) - 0.5)
            pts.append((x + nx * off, y + ny * off, z + sag))
        rod(b, pts, 0.05, salt=k)
    # záhony napříč (podél x), ulička podél plotu u domu
    g = GARDEN
    bx0, bx1 = g["x0"] + 0.75, g["x1"] - 0.3
    beds = [(-1.45, -0.65, "cabbage"), (-0.3, 0.5, "turnip"), (0.85, 1.65, "onion"), (2.0, 2.8, "herb")]
    b = part("garden-beds")
    b._smooth_now = True
    for y0, y1, _ in beds:
        garden_bed(b, bx0, bx1, y0, y1)
    b._smooth_now = False
    b = part("garden-plants")
    b._smooth_now = True
    zt = GARDEN_BED_H
    for j, (y0, y1, kind) in enumerate(beds):
        rows = (y0 + 0.24, y1 - 0.24)
        if kind == "onion":
            rows = (y0 + 0.18, (y0 + y1) / 2, y1 - 0.18)
        step = {"cabbage": 0.46, "turnip": 0.34, "onion": 0.24, "herb": 0.36}[kind]
        for r, yr in enumerate(rows):
            x = bx0 + 0.2 + (step / 2 if r % 2 else 0)
            i = 0
            while x < bx1 - 0.15:
                seed = j * 100 + r * 30 + i
                px = x + 0.05 * (_rand(seed, 4) - 0.5)
                py = yr + 0.05 * (_rand(seed, 5) - 0.5)
                s = 0.85 + 0.3 * _rand(seed, 6)
                if kind == "cabbage":
                    cabbage(b, px, py, zt, s, seed)
                elif kind == "turnip":
                    leafy_tuft(b, px, py, zt, s, seed, 5, 0.19, 0.13, 0.065)
                elif kind == "onion":
                    onion(b, px, py, zt, s, seed)
                else:
                    herb_bush(b, px, py, zt, s, seed)
                x += step
                i += 1
    b._smooth_now = False


GARDEN_BED_H = 0.12  # výška záhonu nad terénem (m)


def garden_bed(b, x0, x1, y0, y1):
    """Vyvýšený záhon: plochý vršek zkypřené hlíny, šikmé boky (u paty tráva jako na valu)."""
    h, inset = GARDEN_BED_H, 0.1
    o = [(x0, y0, -0.03), (x1, y0, -0.03), (x1, y1, -0.03), (x0, y1, -0.03)]
    t = [(x0 + inset, y0 + inset, h), (x1 - inset, y0 + inset, h), (x1 - inset, y1 - inset, h), (x0 + inset, y1 - inset, h)]
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


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()

    # hráň polen vedle obydlí už není (Martin: tak vyskládané dřevo tehdy neměli, navíc na dešti)
    zp = Parts("f-zemnice")
    build_zemnice(zp)
    zemnice = join(zp.build(mat) + [import_prop("basket-a", 0.42, (-1.55, -3.55, 0.0), mat)], "zemnice")

    pp = Parts("f-polozemnice")
    build_polozemnice(pp)
    f = wattle_fence(mat)
    f.location = (-3.6, 0.6, 0)
    f.rotation_euler = (0, 0, math.radians(90))
    p_props = [
        import_prop("basket-a", 0.42, (1.5, -3.0, 0.0), mat),
        import_prop("basket-b", 0.38, (2.0, -2.85, 0.0), mat, 0.6),
    ]
    polozemnice = join(pp.build(mat) + [f] + p_props, "polozemnice")
    # zahrádka je samostatný model s počátkem uprostřed (scéna ji položí na terén a nakloní)
    gp = Parts("f-garden")
    build_garden(gp)
    garden = join(garden_origin(gp.build(mat)), "garden")

    os.makedirs(OUT, exist_ok=True)
    for obj in (zemnice, polozemnice, garden):
        obj.location = (0, 0, 0)
        export([obj], os.path.join(OUT, f"{obj.name}.glb"))
        d = obj.dimensions
        print(f"STAT {obj.name}: {tri_count(obj)} tris, {len(obj.data.materials)} mat, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")

    # staveniště: díly obou obydlí podle fází stavby a rekvizity – jeden GLB, jeden atlas
    zs = Parts("zemnice")
    build_zemnice(zs, stages=True)
    ps = Parts("polozemnice")
    build_polozemnice(ps, stages=True)
    build_garden(ps)  # zahrádka až nakonec (village-construction.ts – fáze „garden“)
    sp = Parts("site")
    extra = site_props(sp, mat)
    house = ps.build(mat)
    garden_origin([o for o in house if o.name.startswith("polozemnice-garden-")])
    stage_objs = zs.build(mat) + house + sp.build(mat) + extra
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
            if obj is polozemnice:
                gx, gy = GARDEN_CENTER
                garden.location = (gx, gy, 0)
                both = [obj, garden]
                render(both, os.path.join(RENDER, "polozemnice_garden.png"), (gx + 1.5, -9.5, 4.2), (gx - 0.5, 0.6, 0.2), size=(1200, 900), lens=32)
                render(both, os.path.join(RENDER, "polozemnice_game.png"), (2.5, -15.5, 14.0), (2.5, 0.3, 0.3), size=(1200, 900), lens=40)
            for o in extra:
                bpy.data.objects.remove(o)
        bpy.data.objects["ground"].hide_render = False
        # obě vedle sebe z herního úhlu (≈ 49° od svislice)
        zemnice.location = (-6.0, 0, 0)
        polozemnice.location = (3.0, 0, 0)
        garden.location = (3.0 + GARDEN_CENTER[0], GARDEN_CENTER[1], 0)
        render([zemnice, polozemnice, garden], os.path.join(RENDER, "both_game_angle.png"), (0, -24, 21.5), (0, 0, 0.5), size=(1600, 900))


# crafts.py importuje tvary obydlí (Builder, thatch_roof, build_*) – jen při spuštění skriptu
if __name__ == "__main__":
    main()
