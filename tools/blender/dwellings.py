"""Raně slovanská zemnice a polozemnice (6.–9. st.) procedurálně – omazané stěny
(mazanice), slámové došky, jeden atlas (trim sheet) z textur 0 A.D. → jeden materiál na model.

blender -b --factory-startup --python tools/blender/dwellings.py -- \
    <atlas_dir> <props_glb_dir> apps/web/public/models/dwellings <render_dir|->

props_glb_dir: koše z 0 A.D. (basket-a.glb, basket-b.glb) převedené přes trees_from_0ad.py
s tools/blender/dwelling-props.json. render_dir: náhledy v Cycles, "-" = bez náhledů.
atlas_dir: atlas.jpg + atlas.json z tools/blender/atlas.py (pásy opakované v U, plochy ve V uvnitř
pásu podle metrů). Souřadnice Blenderu: Z nahoru, hřeben střechy podél osy Y, vchod na štítu
v -Y. Počátek = střed půdorysu na úrovni původního terénu; jáma jde pod nulu. V glTF (a ve scéně
při natočení 0) míří vchod do +Z.

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
        # normály: ostré plochy vlastní normálu, valy průměr podle polohy, pata valu nahoru
        acc = {}
        key = lambda v: (round(v.x, 3), round(v.y, 3), round(v.z, 3))
        for poly, sm in zip(mesh.polygons, self.smooth):
            if sm:
                for vi in poly.vertices:
                    k = key(mesh.vertices[vi].co)
                    acc[k] = acc.get(k, Vector((0, 0, 0))) + poly.normal * poly.area
        normals = []
        for poly, sm in zip(mesh.polygons, self.smooth):
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                if not sm:
                    normals.append(poly.normal.copy())
                elif co.z < 0.01:
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


def thatch_roof(b, half_len, z_ridge, slope, x_eave, thickness, ny=4, kozy=(1.5, 0.62)):
    """Sedlová slámová střecha z řad došků (kurzů): každá řada je nepatrně strmější než
    střecha, takže spodní hrana přečnívá řadu pod ní o LIP – stupeň vrhá stín a řady jsou
    čitelné i z dálky. Vrací z_in(x) – spodní plochu střechy."""
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
        ex = sgn * x_eave
        # spodní strana
        b.poly(
            [(0, -half_len, z_in(0)), (ex, -half_len, z_in(ex)), (ex, half_len, z_in(ex)), (0, half_len, z_in(0))],
            "thatch",
            out=(-sgn, 0, -1),
            uvm=[(-half_len, L), (-half_len, 0), (half_len, 0), (half_len, L)],
        )
        # okapová hrana (tloušťka došků)
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


def entrance(b, y_wall, width=1.0, length=1.6, mound_h=0.3):
    """Vstupní šíje se schody dolů – terén se zatím nevyhlubuje, proto jen tmavý „obtisk“
    se schody těsně nad zemí a po stranách valy vykopané hlíny."""
    y0, y1 = y_wall, y_wall - length
    hw = width / 2
    z = 0.05
    pts = [(-hw, y1, z), (hw, y1, z), (hw, y0, z), (-hw, y0, z)]
    b.poly(pts, "trench", out=(0, 0, 1), uvm=[((p[0] + hw) / width, (p[1] - y1) / length) for p in pts])
    for sgn in (-1, 1):
        b.berm((sgn * (hw + 0.3), y0 + 0.2, 0), (sgn * (hw + 0.3), y1 - 0.1, 0), mound_h, 0.7, segments=2, mat="spoil")


def gable_frame(b, y, apex, slope, z_low, z_high, size=0.12):
    """Rám štítu: krokve podél střechy a vodorovný trám (práh / hambalek) před omítkou."""
    def x_at(z):
        return (apex - z) / slope

    yo = y + (-0.05 if y < 0 else 0.05)
    for sgn in (-1, 1):
        b.beam((sgn * (x_at(z_low) - 0.02), yo, z_low), (sgn * 0.05, yo, apex - 0.06), size)
    b.beam((-x_at(z_high) - 0.05, yo, z_high), (x_at(z_high) + 0.05, yo, z_high), size * 0.9)


def build_zemnice(mat, name="zemnice"):
    b = Builder(name)
    D = 1.0  # hloubka jámy
    px, py = 1.85, 2.0  # půlrozměry jámy
    slope = 1.08  # ≈ 47°
    x_eave = 2.3
    z_ridge = slope * x_eave  # okap leží na zemi
    half_len = 2.35
    th = 0.3
    z_in = thatch_roof(b, half_len, z_ridge, slope, x_eave, th, kozy=(1.35, 0.6))

    # jáma (pod zemí – uvidí se až po vyhloubení terénu)
    fl = [(-px, -py, -D), (px, -py, -D), (px, py, -D), (-px, py, -D)]
    b.poly(fl, "earth", out=(0, 0, 1), uvm=[(p[0] / (2 * px) + 0.5, p[1] / (2 * py) + 0.5) for p in fl])
    for pts, out in (
        ([(-px, -py, -D), (-px, py, -D), (-px, py, 0), (-px, -py, 0)], (1, 0, 0)),
        ([(px, -py, -D), (px, py, -D), (px, py, 0), (px, -py, 0)], (-1, 0, 0)),
        ([(-px, py, -D), (px, py, -D), (px, py, 0), (-px, py, 0)], (0, -1, 0)),
        ([(-px, -py, -D), (px, -py, -D), (px, -py, 0), (-px, -py, 0)], (0, 1, 0)),
    ):
        b.poly(pts, "earth", out=out, uvm=[(0.5, 0.5)] * 4)

    # štíty omazané hlínou (mazanice na výpleti), nahoře dýmník, rám z trámů
    apex = z_in(0)
    zv = apex - 0.42

    def x_at(z):
        return (apex - z) / slope

    for y, out in ((-py, (0, -1, 0)), (py, (0, 1, 0))):
        if y < 0:
            # přední štít s otvorem dveří (dveře 0,8 m, nad zemí 0,75 m – dole schody)
            pts = [
                (-x_at(0), y, 0), (-0.42, y, 0), (-0.42, y, 0.78), (0.42, y, 0.78),
                (0.42, y, 0), (x_at(0), y, 0), (x_at(zv), y, zv), (-x_at(zv), y, zv),
            ]
        else:
            pts = [(-x_at(0), y, 0), (x_at(0), y, 0), (x_at(zv), y, zv), (-x_at(zv), y, zv)]
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
    # dveřní otvor – tmavý výklenek, rám z trámů
    yd = -py
    b.poly([(-0.42, yd + 0.5, -D), (0.42, yd + 0.5, -D), (0.42, yd + 0.5, 0.78), (-0.42, yd + 0.5, 0.78)], "dark", out=(0, -1, 0))
    for sgn in (-1, 1):
        b.poly([(sgn * 0.42, yd, -D), (sgn * 0.42, yd + 0.5, -D), (sgn * 0.42, yd + 0.5, 0.78), (sgn * 0.42, yd, 0.78)], "dark", out=(-sgn, 0, 0))
        b.beam((sgn * 0.48, yd - 0.06, -0.2), (sgn * 0.48, yd - 0.06, 0.9), 0.12)
    b.poly([(-0.42, yd, 0.78), (0.42, yd, 0.78), (0.42, yd + 0.5, 0.78), (-0.42, yd + 0.5, 0.78)], "dark", out=(0, 0, -1))
    b.beam((-0.62, yd - 0.06, 0.84), (0.62, yd - 0.06, 0.84), 0.13)
    # tmavá podlaha v otvoru – jinak by dveřmi prosvítal terén (jáma v něm zatím není)
    b.poly([(-0.42, yd, 0.04), (0.42, yd, 0.04), (0.42, yd + 0.5, 0.04), (-0.42, yd + 0.5, 0.04)], "dark", out=(0, 0, 1))
    # vchod: schody dolů a hlína po stranách
    entrance(b, yd - 0.05, width=0.95, length=1.7, mound_h=0.32)
    # val drnů a hlíny podél okapů (okap leží na valu) a u zadního štítu
    for sgn in (-1, 1):
        b.berm((sgn * (x_eave - 0.05), -half_len - 0.1, 0), (sgn * (x_eave - 0.05), half_len + 0.1, 0), 0.32, 0.9, segments=4)
    b.berm((-1.6, py + 0.15, 0), (1.6, py + 0.15, 0), 0.35, 0.8, segments=3)
    for sgn in (-1, 1):
        b.berm((sgn * 0.75, -py - 0.15, 0), (sgn * 1.75, -py - 0.15, 0), 0.3, 0.7, segments=1, mat="spoil")
    return b.build(mat)


def build_polozemnice(mat):
    b = Builder("polozemnice")
    D = 0.5
    o, t = 2.1, 0.22  # vnější půlrozměr srubu a tloušťka trámu
    over = 0.25  # přesah trámů na nárožích
    z_top = 0.95  # stěna nad terénem
    slope = 1.0
    th = 0.32
    t_v = th * math.sqrt(2)
    z_ridge = z_top + t_v + slope * o  # spodní plocha střechy sedí na hraně stěny
    x_eave = 2.6
    half_len = o + over + 0.3

    # srub omazaný hlínou: stěny jako kvádry s omítkou, na nárožích přečnívají konce trámů
    for sgn in (-1, 1):
        x0, x1 = sorted((sgn * o, sgn * (o - t)))
        b.box(x0, x1, -o, o, -D, z_top, "daub")
    b.box(-o + t, o - t, o - t, o, -D, z_top, "daub", skip=("-x", "+x"))
    b.box(-o + t, -0.42, -o, -o + t, -D, z_top, "daub", skip=("-x",))
    b.box(0.42, o - t, -o, -o + t, -D, z_top, "daub", skip=("+x",))
    b.box(-0.6, 0.6, -o, -o + t, 0.78, z_top, "daub", skip=("-z",))
    b.poly([(-0.42, -o, 0.78), (0.42, -o, 0.78), (0.42, -o + t, 0.78), (-0.42, -o + t, 0.78)], "beam", out=(0, 0, -1))
    # konce trámů na nárožích (střídají se o půl trámu)
    for sx in (-1, 1):
        for sy in (-1, 1):
            xa, xb = sorted((sx * o, sx * (o - t)))
            ya, yb = sorted((sy * o, sy * (o + over)))
            b.log_stub(xa, xb, ya, yb, -0.05, z_top - 0.04, "y")
            xa, xb = sorted((sx * o, sx * (o + over)))
            ya, yb = sorted((sy * o, sy * (o - t)))
            b.log_stub(xa, xb, ya, yb, -0.05, z_top - 0.04 - 0.11, "x", zoff=0.111)
    # vaznice (pozednice) pod střechou
    for sgn in (-1, 1):
        b.beam((sgn * (o - t / 2), -o - over - 0.05, z_top + 0.07), (sgn * (o - t / 2), o + over + 0.05, z_top + 0.07), 0.16)
    # tmavé nitro za dveřmi
    b.poly([(-0.42, -o + t + 0.3, -D), (0.42, -o + t + 0.3, -D), (0.42, -o + t + 0.3, 0.78), (-0.42, -o + t + 0.3, 0.78)], "dark", out=(0, -1, 0))
    for sgn in (-1, 1):
        b.poly([(sgn * 0.42, -o, -D), (sgn * 0.42, -o + t + 0.3, -D), (sgn * 0.42, -o + t + 0.3, 0.78), (sgn * 0.42, -o, 0.78)], "dark", out=(-sgn, 0, 0))
        b.beam((sgn * 0.5, -o - 0.07, -0.3), (sgn * 0.5, -o - 0.07, 0.86), 0.13)
    b.beam((-0.66, -o - 0.07, 0.86), (0.66, -o - 0.07, 0.86), 0.12)
    b.poly([(-0.42, -o, 0.04), (0.42, -o, 0.04), (0.42, -o + t + 0.3, 0.04), (-0.42, -o + t + 0.3, 0.04)], "dark", out=(0, 0, 1))
    # podlaha jámy
    fl = [(-o + t, -o + t, -D), (o - t, -o + t, -D), (o - t, o - t, -D), (-o + t, o - t, -D)]
    b.poly(fl, "earth", out=(0, 0, 1), uvm=[(p[0] / (2 * o) + 0.5, p[1] / (2 * o) + 0.5) for p in fl])

    z_in = thatch_roof(b, half_len, z_ridge, slope, x_eave, th, kozy=(1.6, 0.65))

    # štíty omazané nad srubem, nahoře dýmník, rám z trámů
    apex = z_in(0)
    zv = apex - 0.5

    def x_at(z):
        return (apex - z) / slope

    for y, out in ((-o, (0, -1, 0)), (o, (0, 1, 0))):
        b.poly([(-x_at(z_top), y, z_top), (x_at(z_top), y, z_top), (x_at(zv), y, zv), (-x_at(zv), y, zv)], "daub", out=out)
        b.poly([(-x_at(zv), y, zv), (x_at(zv), y, zv), (0, y, apex)], "dark", out=out)
        gable_frame(b, y, apex, slope, z_top + 0.05, zv, size=0.12)
        # vrchní trám srubu pod štítem
        yo = y + (0.05 if y > 0 else -0.05)
        b.beam((-o - 0.1, yo, z_top + 0.03), (o + 0.1, yo, z_top + 0.03), 0.14)
    # hlína nahrnutá kolem srubu (val), vchod se schody
    for sgn in (-1, 1):
        b.berm((sgn * (o + 0.3), -o - 0.1, 0), (sgn * (o + 0.3), o + 0.1, 0), 0.22, 0.7, segments=3)
    b.berm((-o + 0.1, o + 0.3, 0), (o - 0.1, o + 0.3, 0), 0.22, 0.7, segments=3)
    for sgn in (-1, 1):
        b.berm((sgn * 0.85, -o - 0.3, 0), (sgn * (o - 0.1), -o - 0.3, 0), 0.2, 0.6, segments=1, mat="spoil")
    entrance(b, -o - 0.05, width=0.95, length=1.0, mound_h=0.22)
    return b.build(mat)


def wattle_fence(mat, length=4.0, height=0.9, name="fence"):
    b = Builder(name)
    n = 5
    for i in range(n):
        x = -length / 2 + length * i / (n - 1)
        b.beam((x, 0, -0.1), (x, 0, height + 0.12), 0.09)
    th = 0.06
    b.box(-length / 2, length / 2, -th / 2, th / 2, 0.08, height, "wattle")
    return b.build(mat)


def firewood_stack(mat, length=1.4, depth=0.45, height=0.75, name="firewood"):
    """Hráň polen – čela polen z textury 0 A.D., nahoře a na koncích kůra."""
    b = Builder(name)
    hl, hd = length / 2, depth / 2
    for y, out in ((-hd, (0, -1, 0)), (hd, (0, 1, 0))):
        b.poly([(-hl, y, 0), (hl, y, 0), (hl, y, height), (-hl, y, height)], "firewood", out=out)
    for x, out in ((-hl, (-1, 0, 0)), (hl, (1, 0, 0))):
        pts = [(x, -hd, 0), (x, hd, 0), (x, hd, height), (x, -hd, height)]
        b.poly(pts, "logs_rot", out=out, uvm=[(p[2], p[1]) for p in pts])
    pts = [(-hl, -hd, height), (hl, -hd, height), (hl, hd, height), (-hl, hd, height)]
    b.poly(pts, "logs_rot", out=(0, 0, 1), uvm=[(p[0], p[1]) for p in pts])
    # opěrné kůly na koncích
    for x in (-hl - 0.06, hl + 0.06):
        b.beam((x, 0, -0.1), (x, 0, height + 0.12), 0.08)
    return b.build(mat)


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

    z = build_zemnice(mat)
    fw = firewood_stack(mat)
    fw.location = (3.05, 0.9, 0)
    fw.rotation_euler = (0, 0, math.radians(90))
    zemnice = join([z, fw, import_prop("basket-a", 0.42, (-1.0, -3.2, 0.0), mat)], "zemnice")

    p = build_polozemnice(mat)
    f = wattle_fence(mat)
    f.location = (-3.6, 0.6, 0)
    f.rotation_euler = (0, 0, math.radians(90))
    fw2 = firewood_stack(mat, length=1.8, height=0.8)
    fw2.location = (3.15, -0.4, 0)
    fw2.rotation_euler = (0, 0, math.radians(90))
    p_props = [
        fw2,
        import_prop("basket-a", 0.42, (1.05, -2.75, 0.0), mat),
        import_prop("basket-b", 0.38, (1.55, -2.65, 0.0), mat, 0.6),
    ]
    polozemnice = join([p, f] + p_props, "polozemnice")

    os.makedirs(OUT, exist_ok=True)
    for obj in (zemnice, polozemnice):
        obj.location = (0, 0, 0)
        export(obj, os.path.join(OUT, f"{obj.name}.glb"))
        d = obj.dimensions
        print(f"STAT {obj.name}: {tri_count(obj)} tris, {len(obj.data.materials)} mat, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")

    if RENDER != "-":
        setup_world(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain", "grass.jpg"))
        os.makedirs(RENDER, exist_ok=True)
        for obj in (zemnice, polozemnice):
            render([obj], os.path.join(RENDER, f"{obj.name}_front.png"), (-7.5, -11.5, 5.2), (0.3, 0, 0.9))
            render([obj], os.path.join(RENDER, f"{obj.name}_back.png"), (9.5, 9.0, 6.0), (0, 0, 0.8))
            render([obj], os.path.join(RENDER, f"{obj.name}_close.png"), (-2.6, -6.2, 1.9), (0.2, -1.6, 1.0), size=(1200, 900), lens=35)
        # obě vedle sebe z herního úhlu (≈ 49° od svislice)
        zemnice.location = (-4.5, 0, 0)
        polozemnice.location = (4.5, 0, 0)
        render([zemnice, polozemnice], os.path.join(RENDER, "both_game_angle.png"), (0, -24, 21.5), (0, 0, 0.5), size=(1600, 900))


main()
