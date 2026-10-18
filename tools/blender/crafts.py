"""Řemeslné stavby raně slovanské vsi (6.–9. st.) – varianty obydlí z dwellings.py.

blender -b --factory-startup --python tools/blender/crafts.py -- \
    <craft_atlas_dir> <props_glb_dir> apps/web/public/models/crafts <render_dir|->

craft_atlas_dir: výstup tools/blender/craft_atlas.py (atlas.jpg, atlas-moss.jpg, atlas.json –
atlas obydlí rozšířený o hlínu pece, kámen, zem milíře, uhlí, keramiku…). props_glb_dir: koše
z 0 A.D. jako u dwellings.py. render_dir: náhledy v Cycles, "-" = bez náhledů.

Tvary obydlí (Builder, thatch_roof, build_zemnice, build_polozemnice…) se berou z dwellings.py,
takže řemeslná stavba je opravdu zemnice / polozemnice a sedí do stejné jámy, kterou kreslí scéna
(apps/web/lib/scene/dwelling-pit.ts): hrnčíř a kovář = jáma polozemnice, uhlíř = jáma zemnice.
Souřadnice a počátek jako u obydlí: Z nahoru, hřeben podél Y, vchod v −Y (v glTF do +Z),
počátek = střed půdorysu na úrovni původního terénu. Jeden materiál (atlas) na model.

Výstup (apps/web/public/models/crafts):
  hrncir.glb  polozemnice, střecha vpředu prodloužená o PORCH m (přístřešek na sloupech; dvě
              nejnižší řady došků přístřešku chybí – okap je výš a pod střechu je vidět), pod ní
              hrnčířská pec (hliněná kopule na kamenném podstavci, topeniště se žárem vpředu,
              průduch nahoře), prkno se sušícími se hrnci, vypálené hrnce, hrouda hlíny,
              hrnčířský kruh; před dílnou koš (díl „yard“) – hráně polen ani kus pleteného
              plotu vedle domu nejsou (Martin: tak vyskládané dřevo tehdy neměli, navíc na dešti)
  kovar.glb   tentýž přístřešek, pod ním výheň (zvýšené ohniště z kamenů a hlíny se žhavým uhlím,
              hliněná zadní stěna, dvojitý měch s dmyšnou), kovadlina na špalku, kladivo,
              kleště, hromada uhlí, koryto s vodou; koše (díl „yard“)
  uhlir.glb   zemnice se střechou krytou mechem (stejný tvar, atlas-moss.jpg), volná hromada
              polen na milíř (polena po povrchu nízké kupy, ne vyskládaná hráň), koše s uhlím
  milir.glb   milíř – samostatný model: kupa polen pod hlínou a drny, dole věnec polen, průduchy,
              komín, kolem začernalá zem, žebřík, hrabice, drny a lopata. Stojí „kus od zemnice“:
              doporučený odstup MILIR_OFFSET níže (≈ 10 m, 8–12 m je v pořádku).
  construction.glb       díly staveniště hrnčíře a kováře („hrncir-…“, „kovar-…“: díly
                         polozemnice, přístřešek porch-posts / porch-rafters-N / porch-laths,
                         došky přes celou délku, pec kiln-base / kiln-dome-1…3 / kiln-mouth,
                         výheň forge-hearth / forge-fire / forge-wall / forge-bellows / anvil,
                         vybavení dílny, yard) a rekvizity „site-stones“, „site-clay“
  construction-moss.glb  díly uhlíře (zemnice s řadami mechu, hromada polen „wood“, koše)
                         a milíře („milir-…“:
                         stakes, pole, ground, ring, stack-1…4, cover-1…3, top, vents, tools)
Kdy se který díl ukáže, určuje apps/web/lib/scene/village-construction.ts (tabulka fází pro
každý druh stavby); hotové modely jsou tytéž díly spojené (bez dílů jen pro staveniště).

Celý postup (art = <0ad>/binaries/data/mods/public/art, PNG z DDS viz atlas.py; koše
basket-a.glb a basket-b.glb jako u dwellings.py přes trees_from_0ad.py a dwelling-props.json):
  python3 tools/blender/craft_atlas.py <celt_struct_1.png> <celt_struct.png> \
      apps/web/public/textures/terrain <basket_celt_1.png> /tmp/craft-atlas
  blender -b --factory-startup --python tools/blender/trees_from_0ad.py -- \
      tools/blender/dwelling-props.json art /tmp/dwelling-props
  blender -b --factory-startup --python tools/blender/crafts.py -- \
      /tmp/craft-atlas /tmp/dwelling-props apps/web/public/models/crafts -
Ikony do panelu staveb: tools/blender/icons.py (hrncir, kovar, uhlir).
"""
import math
import os
import sys
from contextlib import contextmanager

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True  # žádné __pycache__ v tools/blender
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dwellings as D  # noqa: E402 – argumenty (atlas, koše, výstup, náhledy) čte stejně

ATLAS, OUT, RENDER = D.ATLAS, D.OUT, D.RENDER

PORCH = 3.6  # o kolik přístřešek hrnčíře a kováře přečnívá před přední stěnu (m); obydlí 1,05
PORCH_CUT = 3  # kolik nejnižších řad došků přístřešku chybí – okap přístřešku ≈ 1,4 m nad zemí
# Milíř od středu uhlířovy zemnice v souřadnicích Blenderu (x napříč, y podél hřebene, vchod
# v −y): 9 m stranou, 3 m před štítem → ≈ 9,5 m (8–12 m je v pořádku). Ve scéně (souřadnice
# modelu, vchod do +z) je to (−x, −y) = (−9, 3) – MILIR_OFFSET_M v
# apps/web/lib/scene/building-showcase-layout.ts. Natočení milíře je jedno (je kulatý).
MILIR_OFFSET = (9.0, -3.0)

# rozměry polozemnice z dwellings.build_polozemnice (srub, střecha) – přístřešek na ně navazuje
PZ_O, PZ_T, PZ_TOP, PZ_SLOPE, PZ_TH, PZ_EAVE = 2.1, 0.22, 0.95, 1.0, 0.32, 2.6
PZ_RIDGE = PZ_TOP + PZ_TH * math.sqrt(2) + PZ_SLOPE * PZ_O


# ------------------------------------------------------------------ stavebnice


class CB(D.Builder):
    """Builder z dwellings.py + hladké plochy („soft“ – rotační tělesa: pec, hrnce, milíř)."""

    @contextmanager
    def smooth_mode(self, mode="soft"):
        prev = self._smooth_now
        self._smooth_now = mode
        try:
            yield self
        finally:
            self._smooth_now = prev

    def build(self, material):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        layer = mesh.uv_layers.new(name="UVMap")
        for poly, uvs in zip(mesh.polygons, self.uvs):
            for li, uv in zip(poly.loop_indices, uvs):
                layer.data[li].uv = uv
        mesh.materials.append(material)
        acc = {}

        def key(mode, v):
            return (mode, round(v.x, 3), round(v.y, 3), round(v.z, 3))

        for poly, sm in zip(mesh.polygons, self.smooth):
            if sm:
                for vi in poly.vertices:
                    k = key(sm, mesh.vertices[vi].co)
                    acc[k] = acc.get(k, Vector((0, 0, 0))) + poly.normal * poly.area
        normals = []
        for poly, sm in zip(mesh.polygons, self.smooth):
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                if not sm:
                    normals.append(poly.normal.copy())
                elif sm == "soft":
                    n = acc[key(sm, co)]
                    normals.append(n.normalized() if n.length > 1e-9 else poly.normal.copy())
                elif co.z < 0.01:
                    normals.append(Vector((0, 0, 1)))
                else:
                    normals.append((acc[key(sm, co)].normalized() + Vector((0, 0, 0.6))).normalized())
        for poly in mesh.polygons:
            poly.use_smooth = True
        mesh.normals_split_custom_set(normals)
        mesh.validate(clean_customdata=False)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


class Parts(D.Parts):
    def __call__(self, key):
        if key not in self.builders:
            self.builders[key] = CB(f"{self.prefix}-{key}")
        return self.builders[key]


def material(name, image):
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(ATLAS, image))
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def is_region(mat):
    return mat in D.REGIONS


def lathe(b, c, prof, mat, seg=16, u_total=None, a0=0.0, out=1, wobble=None, v_mirror=None, smooth=True, v0=0.0):
    """Rotační plocha z profilu [(r, z)] kolem svislé osy v c = (x, y). Úhel 0 míří do −y
    (dopředu, ke vchodu). Pás: u = úhel/2π · u_total (m), v = v0 + délka po plášti (s v_mirror
    se v po každých v_mirror m zrcadlí – pás se opakuje bez švu; v0 = pokračování plochy
    rozdělené na díly staveniště); oblast: u = úhel/2π, v = 0–1. wobble(r, z, a) → (r, z)
    zvlní tvar (hroudy hlíny)."""
    cx, cy = c
    if v_mirror:
        # zlom zrcadlení musí ležet na prstenci, jinak by plocha přes zlom měla v stejné nahoře
        # i dole (rozmazaný pruh) – vložit body profilu na každý násobek v_mirror
        split, run = [prof[0]], v0
        for p, q in zip(prof, prof[1:]):
            d = math.dist(p, q)
            k = math.floor(run / v_mirror + 1e-9) + 1
            while k * v_mirror < run + d - 1e-6:
                f = (k * v_mirror - run) / d
                split.append((p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f))
                k += 1
            split.append(q)
            run += d
        prof = split
    cum = [0.0]
    for p, q in zip(prof, prof[1:]):
        cum.append(cum[-1] + math.dist(p, q))
    total = cum[-1] or 1.0
    if u_total is None:
        u_total = 2 * math.pi * max(r for r, _ in prof)

    def pt(j, i):
        r, z = prof[j]
        a = a0 + 2 * math.pi * i / seg
        if wobble and r > 1e-6:
            r, z = wobble(r, z, a)
        return (cx + r * math.sin(a), cy - r * math.cos(a), z)

    def uv(j, i):
        if is_region(mat):
            return (i / seg, cum[j] / total)
        v = v0 + cum[j]
        if v_mirror:
            t = v % (2 * v_mirror)
            v = t if t <= v_mirror + 1e-9 else 2 * v_mirror - t
        return (i / seg * u_total, v)

    with b.smooth_mode("soft" if smooth else False):
        for j in range(len(prof) - 1):
            (r0, z0), (r1, z1) = prof[j], prof[j + 1]
            nr, nz = (z1 - z0), -(r1 - r0)
            for i in range(seg):
                am = a0 + 2 * math.pi * (i + 0.5) / seg
                o = (math.sin(am) * nr * out, -math.cos(am) * nr * out, nz * out)
                if r1 < 1e-6:
                    idx = [(j, i), (j, i + 1), (j + 1, i)]
                elif r0 < 1e-6:
                    idx = [(j, i), (j + 1, i + 1), (j + 1, i)]
                else:
                    idx = [(j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)]
                b.poly([pt(*k) for k in idx], mat, out=o, uvm=[uv(*k) for k in idx])


def disc(b, c, r, z, mat, seg=12, up=True, uv_scale=None, uv0=(0.0, 0.0)):
    """Vodorovný kruh (víko, otvor). Oblast: mapovaná shora, střed oblasti = střed kruhu.
    Pás: u, v = metry od středu (· uv_scale) + uv0 – např. jedno čelo trámu na pařezu."""
    cx, cy = c
    pts = [(cx + r * math.sin(2 * math.pi * i / seg), cy - r * math.cos(2 * math.pi * i / seg), z) for i in range(seg)]
    if is_region(mat):
        uvm = [(0.5 + (p[0] - cx) / (2 * r), 0.5 + (p[1] - cy) / (2 * r)) for p in pts]
    else:
        k = uv_scale or 1.0
        uvm = [(uv0[0] + (p[0] - cx) * k, uv0[1] + (p[1] - cy) * k) for p in pts]
    b.poly(pts, mat, out=(0, 0, 1 if up else -1), uvm=uvm)


def stump_top(b, c, r, z):
    """Čelo pařezu / špalku: jedno čelo trámu z pásu logends roztažené na celý kruh."""
    disc(b, c, r, z, "logends", seg=10, uv_scale=0.1 / r, uv0=(0.111, 0.0))


def cbox(b, x0, x1, y0, y1, z0, z1, mat, top=None, skip=(), voff=0.0):
    """Kvádr s UV podle plochy: boky u podél strany, v = výška (+ voff), víko shora.
    Pro oblasti normalizovaně 0–1 přes celou plochu. top = jiný materiál víka."""
    def uvs(pts, ax_u, ax_v, base_u, base_v, lu, lv, m):
        if is_region(m):
            return [((p[ax_u] - base_u) / lu, (p[ax_v] - base_v) / lv) for p in pts]
        return [(p[ax_u] - base_u, p[ax_v] - base_v + (voff if ax_v == 2 else 0)) for p in pts]

    lx, ly, lz = x1 - x0, y1 - y0, z1 - z0
    faces = {
        "-x": ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0), 1, 2, y0, z0, ly, lz),
        "+x": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0), 1, 2, y0, z0, ly, lz),
        "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0), 0, 2, x0, z0, lx, lz),
        "+y": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0), 0, 2, x0, z0, lx, lz),
        "-z": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1), 0, 1, x0, y0, lx, ly),
        "+z": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1), 0, 1, x0, y0, lx, ly),
    }
    for k, (pts, out, au, av, bu, bv, lu, lv) in faces.items():
        if k in skip:
            continue
        m = top if (k == "+z" and top) else mat
        b.poly(pts, m, out=out, uvm=uvs(pts, au, av, bu, bv, lu, lv, m))


def seeded(i):
    """Deterministický „náhodný“ šum 0–1 (bez modulu random – stejné modely při každém běhu)."""
    return (math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1.0


# ------------------------------------------------------------------ přístřešek


def porch_roof(part, y_front, y_back, y_cut, k_cut, z_ridge, slope, x_eave, thickness, kozy=(1.6, 0.65)):
    """Sedlová došková střecha jako dwellings.thatch_roof, jen nesouměrná: od y_front (přístřešek)
    po y_back. Řady k < k_cut (nejnižší) sahají jen od y_cut dozadu – přístřešek má okap výš.
    Šum a průhyb hřebene počítá přes celou délku, řady došků tak na sebe navazují."""
    LIP, COURSES, noise = D.LIP, D.COURSES, D.noise
    cs = 1 / math.sqrt(1 + slope * slope)
    t_v = thickness / cs
    L = x_eave / cs
    n_courses = next(k for k, b in enumerate(COURSES) if b >= L - 1e-6)
    ys_main = [y_cut + (y_back - y_cut) * j / 6 for j in range(7)]
    ys_porch = [y_front + (y_cut - y_front) * j / 4 for j in range(5)]
    cy, half = (y_front + y_back) / 2, (y_back - y_front) / 2

    def x_of(sgn, s):
        return sgn * (x_eave - s * cs)

    def z_base(x, y):
        edge = abs(x) / x_eave
        sag = -0.06 * (1 - ((y - cy) / half) ** 2) * (1 - edge)
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
            ys = ys_main if k < k_cut else ys_porch[:-1] + ys_main
            for ya, yb in zip(ys, ys[1:]):
                b.poly(
                    [P(sgn, s0, ya, r0), P(sgn, s0, yb, r0), P(sgn, s1, yb, r1), P(sgn, s1, ya, r1)],
                    "thatch",
                    out=out_top,
                    uvm=[(ya, s0), (yb, s0), (yb, s1), (ya, s1)],
                )
                if k < n_courses - 1:
                    b.poly(
                        [P(sgn, s1, ya, r1), P(sgn, s1, yb, r1), P(sgn, s1, yb, LIP), P(sgn, s1, ya, LIP)],
                        "thatch_edge",
                        out=(sgn, 0, -0.3),
                        uvm=[(ya, LIP), (yb, LIP), (yb, 0), (ya, 0)],
                    )
            for y, out in ((ys[0], (0, -1, 0)), (y_back, (0, 1, 0))):
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
            xa, xb = x_of(sgn, s0), x_of(sgn, s1)
            y_lo = ys[0]
            b.poly(
                [(xb, y_lo, z_in(xb)), (xa, y_lo, z_in(xa)), (xa, y_back, z_in(xa)), (xb, y_back, z_in(xb))],
                "thatch",
                out=(-sgn, 0, -1),
                uvm=[(y_lo, s1), (y_lo, s0), (y_back, s0), (y_back, s1)],
            )
        # okapová hrana: hlavní střecha od první řady, přístřešek od řady k_cut
        for s_edge, ys, key in ((0.0, ys_main, "thatch-1"), (COURSES[k_cut], ys_porch, f"thatch-{k_cut + 1}")):
            b = part(key)
            ex = x_of(sgn, s_edge)
            for ya, yb in zip(ys, ys[1:]):
                pa, pb = P(sgn, s_edge, ya, LIP), P(sgn, s_edge, yb, LIP)
                b.poly(
                    [pa, pb, (ex, yb, z_in(ex)), (ex, ya, z_in(ex))],
                    "thatch_edge",
                    out=(sgn, 0, 0),
                    uvm=[(ya, 0), (yb, 0), (yb, pb[2] - z_in(ex)), (ya, pa[2] - z_in(ex))],
                )
    # hřeben přes celou délku a kozy na obou koncích (jako thatch_roof)
    b = part("ridge")
    w, h = 0.17, 0.08
    zr = z_ridge - 0.02
    z_edge = z_ridge - slope * w - 0.06
    prof = [(-w, z_edge), (-w * 0.5, zr + h * 0.7), (0, zr + h), (w * 0.5, zr + h * 0.7), (w, z_edge)]
    cum = [0.0]
    for k in range(len(prof) - 1):
        cum.append(cum[-1] + math.dist(prof[k], prof[k + 1]))
    mid = cum[-1] / 2
    for k in range(len(prof) - 1):
        (x0, z0), (x1, z1) = prof[k], prof[k + 1]
        outv = Vector(((x0 + x1) / 2, 0, (z0 + z1) / 2 - zr + 0.1))
        b.poly(
            [(x0, y_front, z0), (x1, y_front, z1), (x1, y_back, z1), (x0, y_back, z0)],
            "ridge",
            out=outv,
            uvm=[(y_front, cum[k] - mid), (y_front, cum[k + 1] - mid), (y_back, cum[k + 1] - mid), (y_back, cum[k] - mid)],
        )
    for y, out in ((y_front, (0, -1, 0)), (y_back, (0, 1, 0))):
        b.poly([(x, y, z) for x, z in prof], "thatch_edge", out=out, uvm=[(x, zr + h - z) for x, z in prof])
    down, up = kozy
    off = LIP / cs + 0.05
    for y_end, side in ((y_front, -1), (y_back, 1)):
        for sgn in (-1, 1):
            y = y_end + side * (0.04 + (0.075 if sgn > 0 else 0))
            b.plank((sgn * down, y, z_ridge - slope * down + off), (-sgn * up, y, z_ridge + slope * up + off), 0.2, 0.07)
    return z_in


def build_porch_house(part, stages=False):
    """Polozemnice z dwellings.py s přístřeškem: střecha vpředu prodloužená o PORCH na sloupech,
    vaznice po stranách, příčný trám vpředu, sloup s rozsochou pod hřebenem a krokve (zespodu
    vidět). Díly: jako polozemnice (srub, krov, došky po řadách přes celou délku) + „porch-posts“
    a „porch-rafters-1…5“, na staveništi i „porch-laths“. Vrací spodní plochu střechy z_in."""
    D.build_polozemnice(part, stages=stages)
    for key in list(part.builders):
        if key.startswith("thatch-") or key in ("ridge", "plates"):
            del part.builders[key]
    o, slope, x_eave = PZ_O, PZ_SLOPE, PZ_EAVE
    y_back = o + D.GABLE_OVERHANG
    y_front = -(o + PORCH)
    y_cut = -(o + 0.3)
    z_in = porch_roof(part, y_front, y_back, y_cut, PORCH_CUT, PZ_RIDGE, slope, x_eave, PZ_TH)
    # pozednice srubu jen pod hlavní střechou
    b = part("plates")
    for sgn in (-1, 1):
        b.beam((sgn * (o - PZ_T / 2), y_cut + 0.08, PZ_TOP + 0.07), (sgn * (o - PZ_T / 2), y_back - 0.08, PZ_TOP + 0.07), 0.16)
    # přístřešek: sloupy, vaznice, příčný trám, sloup s rozsochou a vaznice hřebene
    b = part("porch-posts")
    px = 1.5
    z_plate = z_in(px) - 0.17
    post_ys = (y_front + 0.25, (y_front + y_cut) / 2 + 0.1)
    for sgn in (-1, 1):
        for y in post_ys:
            b.beam((sgn * px, y, -0.15), (sgn * px, y, z_plate + 0.05), 0.17)
        b.beam((sgn * px, y_front + 0.08, z_plate), (sgn * px, -o - 0.02, z_plate), 0.16)
    b.beam((-px - 0.12, y_front + 0.25, z_plate + 0.13), (px + 0.12, y_front + 0.25, z_plate + 0.13), 0.15)
    apex = z_in(0)
    b.beam((0, y_front + 0.25, z_plate + 0.2), (0, y_front + 0.25, apex - 0.2), 0.15)
    for sgn in (-1, 1):  # rozsocha pod vaznicí hřebene
        b.beam((0, y_front + 0.25, apex - 0.36), (sgn * 0.12, y_front + 0.25, apex - 0.1), 0.08)
    b.beam((0, y_front + 0.06, apex - 0.1), (0, -o - 0.05, apex - 0.1), 0.15)
    cs = 1 / math.sqrt(1 + slope * slope)
    x_porch_eave = x_eave - D.COURSES[PORCH_CUT] * cs
    n = 5
    for i in range(n):
        b = part(f"porch-rafters-{i + 1}")
        y = y_front + 0.14 + i * (y_cut - y_front - 0.2) / (n - 1)
        for sgn in (-1, 1):
            xe = sgn * (x_porch_eave - 0.04)
            b.beam((xe, y, z_in(xe) - 0.06), (sgn * 0.04, y, z_in(0) - 0.06), 0.1)
    if stages:
        # latě přístřešku (jen nad krokvemi přístřešku – nižší řady došků tu nejsou)
        b = part("porch-laths")
        s = D.COURSES[PORCH_CUT] + 0.12
        while s < x_eave / cs - 0.2:
            for sgn in (-1, 1):
                x = sgn * (x_eave - s * cs)
                b.beam((x, y_front + 0.04, z_in(x) - 0.03), (x, y_cut + 0.05, z_in(x) - 0.03), 0.05)
            s += 0.42
    return z_in


# ------------------------------------------------------------------ hrnčíř


def pot(b, c, h, r, kind="pottery", z0=0.0, neck=0.75, seg=10, lip=True):
    """Hrnec raně slovanského typu (vejčité tělo, krátké hrdlo, vyhnutý okraj)."""
    prof = [
        (r * 0.55, z0),
        (r * 0.85, z0 + h * 0.18),
        (r, z0 + h * 0.5),
        (r * 0.9, z0 + h * 0.72),
        (r * neck, z0 + h * 0.88),
        (r * (neck + 0.1 if lip else neck), z0 + h),
    ]
    lathe(b, c, prof, kind, seg=seg)
    disc(b, c, prof[-1][0] * 0.92, z0 + h - 0.01, "dark", seg=seg)


def arc_lengths(prof):
    cum = [0.0]
    for p, q in zip(prof, prof[1:]):
        cum.append(cum[-1] + math.dist(p, q))
    return cum


KILN_DOME = [(0.69, 0.26), (0.72, 0.42), (0.71, 0.62), (0.64, 0.82), (0.5, 1.0), (0.33, 1.12), (0.18, 1.19), (0.15, 1.22)]


def kiln(part, c):
    """Hrnčířská pec (výšlehová, raný středověk) po dílech stavby: kamenný podstavec
    („kiln-base“), hliněná kopule po prstencích zdola („kiln-dome-1…3“, nedostavěná kopule má
    navrchu okraj a zevnitř stěnu), topeniště vpředu (−y) s tmavým otvorem a žárem („kiln-mouth“).
    Nad topeništěm a navrchu je hlína očazená (pás kiln, u = 0 vpředu)."""
    cx, cy = c
    b = part("kiln-base")
    lathe(b, c, [(0.82, -0.05), (0.84, 0.1), (0.8, 0.24), (0.68, 0.27)], "stone", seg=18, a0=math.pi)

    def bulge(r, z, a):
        return r * (1 + 0.025 * math.sin(3 * a + z * 5) + 0.015 * math.sin(7 * a)), z

    cum = arc_lengths(KILN_DOME)
    for k, (i0, i1) in enumerate(((0, 2), (2, 4), (4, len(KILN_DOME) - 1))):
        b = part(f"kiln-dome-{k + 1}")
        prof = KILN_DOME[i0 : i1 + 1]
        lathe(b, c, prof, "kiln", seg=18, u_total=4.0, wobble=bulge, v0=cum[i0])
        if k < 2:
            # rozestavěná kopule: vnitřní stěna (očazená) a okraj navrchu – u hotové jsou skryté
            inner = [(r - 0.07, z) for r, z in prof]
            lathe(b, c, inner, "kiln", seg=18, u_total=4.0, out=-1, wobble=bulge, v0=1.1, smooth=False)
            r_top, z_top = prof[-1]
            lathe(b, c, [(r_top, z_top), (r_top - 0.07, z_top)], "kiln", seg=18, u_total=4.0, wobble=bulge, v0=cum[i1], smooth=False)
    # průduch – vyvýšený hliněný věnec, uvnitř tma
    b = part("kiln-dome-3")
    lathe(b, c, [(0.15, 1.22), (0.16, 1.28), (0.12, 1.3), (0.1, 1.26)], "kiln", seg=12, u_total=4.0)
    disc(b, c, 0.105, 1.265, "dark", seg=10)
    # topeniště: hliněný oblouk předsazený před kopuli, uvnitř tma a žhavé uhlíky
    b = part("kiln-mouth")
    y_in, y_out = cy - 0.55, cy - 0.92
    hw, hh = 0.24, 0.48  # polovina šířky a výška otvoru
    th = 0.09
    n = 7
    arch = [(cx + (hw + th) * math.cos(math.pi * i / n), 0.26 + (hh - hw) + (hw + th) * math.sin(math.pi * i / n)) for i in range(n + 1)]
    inner = [(cx + hw * math.cos(math.pi * i / n), 0.26 + (hh - hw) + hw * math.sin(math.pi * i / n)) for i in range(n + 1)]
    outer_pts = [(cx + hw + th, 0.18)] + arch + [(cx - hw - th, 0.18)]
    inner_pts = [(cx + hw, 0.26)] + inner + [(cx - hw, 0.26)]
    for (xa, za), (xb, zb) in zip(outer_pts, outer_pts[1:]):
        o = (xa + xb - 2 * cx, 0, (za + zb) / 2 - 0.26 - (hh - hw))
        b.poly([(xa, y_out, za), (xb, y_out, zb), (xb, y_in, zb), (xa, y_in, za)], "kiln", out=o, uvm=[(xa - cx, za), (xb - cx, zb), (xb - cx, zb), (xa - cx, za)])
    for k in range(len(inner_pts) - 1):
        (xa, za), (xb, zb) = outer_pts[k], outer_pts[k + 1]
        (xc, zc), (xd, zd) = inner_pts[k + 1], inner_pts[k]
        b.poly([(xa, y_out, za), (xb, y_out, zb), (xc, y_out, zc), (xd, y_out, zd)], "kiln", out=(0, -1, 0), uvm=[(xa - cx, za), (xb - cx, zb), (xc - cx, zc), (xd - cx, zd)])
    b.poly([(p[0], y_in + 0.02, p[1]) for p in inner_pts], "dark", out=(0, -1, 0))
    for (xa, za), (xb, zb) in zip(inner_pts, inner_pts[1:]):
        b.poly([(xa, y_out, za), (xa, y_in, za), (xb, y_in, zb), (xb, y_out, zb)], "dark", out=(cx - (xa + xb) / 2, 0, 0.26 + (hh - hw) - (za + zb) / 2))
    b.poly([(cx - hw, y_out, 0.27), (cx + hw, y_out, 0.27), (cx + hw, y_in, 0.27), (cx - hw, y_in, 0.27)], "embers", out=(0, 0, 1), uvm=[(0, 0), (1, 0), (1, 1), (0, 1)])
    b.poly([(cx - hw * 0.8, y_in + 0.03, 0.27), (cx + hw * 0.8, y_in + 0.03, 0.27), (cx + hw * 0.6, y_in + 0.03, 0.5), (cx - hw * 0.6, y_in + 0.03, 0.5)], "embers", out=(0, -1, 0), uvm=[(0, 0), (1, 0), (1, 0.6), (0, 0.6)])


def potter_wheel(b, c):
    """Ruční hrnčířský kruh: nízký špalek s osou a dřevěný kotouč, na něm rozpracovaný hrnec."""
    lathe(b, c, [(0.2, -0.05), (0.19, 0.42), (0.0, 0.42)], "beam", seg=10, smooth=False)
    lathe(b, c, [(0.31, 0.42), (0.3, 0.52)], "beam", seg=14, smooth=False)
    stump_top(b, c, 0.3, 0.52)
    pot(b, c, 0.22, 0.11, "clay", z0=0.52, seg=10)


def build_hrncir(mat, stages=False):
    """Hrnčíř: díly (Parts) a rekvizity z jiných modelů po klíčích dílů (polena, plot, koš)."""
    part = Parts("hrncir")
    build_porch_house(part, stages)
    kiln(part, (0.72, -4.55))
    # police: prkno na dvou špalcích, na něm sušící se hrnce (vlevo pod přístřeškem)
    sx = -1.2
    b = part("shelf")
    for y in (-3.65, -5.0):
        lathe(b, (sx, y), [(0.15, -0.05), (0.15, 0.4)], "beam", seg=8, smooth=False)
        stump_top(b, (sx, y), 0.15, 0.4)
    cbox(b, sx - 0.17, sx + 0.17, -5.35, -3.3, 0.4, 0.46, "beam")
    b = part("pots")
    for i, y in enumerate((-3.45, -3.8, -4.15, -4.5, -4.85, -5.2)):
        h = 0.24 + 0.08 * seeded(i)
        pot(b, (sx + 0.03 * (seeded(i + 9) - 0.5), y), h, 0.1 + 0.03 * seeded(i + 3), "pottery", z0=0.46)
    for x, y, h in ((1.65, -3.35, 0.3), (1.95, -3.55, 0.26), (1.7, -3.7, 0.22)):
        pot(b, (x, y), h, 0.12, "pottery_fired", seg=10)
    b = part("clay")
    cbox(b, -0.85, -0.3, -3.65, -3.3, -0.02, 0.06, "beam")
    with b.smooth_mode():
        lathe(b, (-0.58, -3.48), [(0.22, 0.06), (0.2, 0.14), (0.12, 0.22), (0.0, 0.24)], "clay", seg=10, wobble=lambda r, z, a: (r * (1 + 0.1 * math.sin(3 * a + 1)), z))
    potter_wheel(part("wheel"), (-0.55, -4.45))
    # dvorek: koš (hráně polen ani kus pleteného plotu vedle domu tu nejsou – Martin)
    extras = {
        "yard": [
            D.import_prop("basket-b", 0.38, (-1.75, -2.75, 0.0), mat, 0.6),
        ]
    }
    return part, extras


# ------------------------------------------------------------------ kovář


def bellows(b, x, y_back, y_front, w=0.3):
    """Klínový měch: dvě prkna (spodní a šikmé horní), kožené boky, vpředu hubice."""
    zb, zt, zf = 0.06, 0.34, 0.12
    hb, hf = w / 2, 0.05
    bl, br = (x - hb, y_back), (x + hb, y_back)
    fl, fr = (x - hf, y_front), (x + hf, y_front)
    cbox(b, x - hb - 0.02, x + hb + 0.02, y_back - 0.03, y_front, 0.0, zb, "beam")
    b.poly([(bl[0], bl[1], zt), (br[0], br[1], zt), (fr[0], fr[1], zf), (fl[0], fl[1], zf)], "beam", out=(0, -0.3, 1), uvm=[(0, 0), (w, 0), (w * 0.3, 0.7), (0, 0.7)])
    b.poly([(bl[0], bl[1], zb), (fl[0], fl[1], zb), (fl[0], fl[1], zf), (bl[0], bl[1], zt)], "leather", out=(-1, 0, 0), uvm=[(0, 0), (1, 0), (1, 0.4), (0, 1)])
    b.poly([(br[0], br[1], zb), (fr[0], fr[1], zb), (fr[0], fr[1], zf), (br[0], br[1], zt)], "leather", out=(1, 0, 0), uvm=[(0, 0), (1, 0), (1, 0.4), (0, 1)])
    b.poly([(bl[0], bl[1], zb), (br[0], br[1], zb), (br[0], br[1], zt), (bl[0], bl[1], zt)], "leather", out=(0, 1, 0), uvm=[(0, 0), (1, 0), (1, 1), (0, 1)])
    b.beam((x, y_back + 0.02, zt + 0.02), (x, y_back + 0.28, zt + 0.12), 0.05)


def forge(part, c):
    """Výheň po dílech stavby: ohniště z kamenů v hlíně („forge-hearth“), uhlí a žár navrchu
    („forge-fire“), hliněná zadní stěna k okapu s dmyšnou („forge-wall“), dva měchy za ohništěm
    směrem ke vchodu s hubicí do boku ohniště („forge-bellows“)."""
    cx, cy = c
    x0, x1, y0, y1, h = cx - 0.5, cx + 0.45, cy - 0.45, cy + 0.45, 0.7
    cbox(part("forge-hearth"), x0, x1, y0, y1, -0.05, h, "stone", top="stone")
    b = part("forge-fire")
    with b.smooth_mode():
        lathe(b, (cx - 0.05, cy), [(0.4, h + 0.005), (0.36, h + 0.06), (0.27, h + 0.1)], "charcoal", seg=12, wobble=lambda r, z, a: (r * (1 + 0.06 * math.sin(5 * a)), z))
        lathe(b, (cx - 0.05, cy), [(0.27, h + 0.1), (0.14, h + 0.14), (0.0, h + 0.15)], "embers", seg=12)
    b = part("forge-wall")
    cbox(b, x1 - 0.14, x1 + 0.04, y0 - 0.02, y1 + 0.02, h, h + 0.55, "daub", voff=0.5)
    b.beam((x1 - 0.3, cy + 0.12, h + 0.12), (x1 + 0.1, cy + 0.12, h + 0.12), 0.09, mat="clay")
    b = part("forge-bellows")
    for bx in (cx - 0.2, cx + 0.16):
        bellows(b, bx, y1 + 0.95, y1 + 0.12, 0.3)
    b.beam((cx - 0.02, y1 + 0.13, 0.12), (cx - 0.06, y1 - 0.12, h - 0.06), 0.08, mat="clay")


def anvil(b, c):
    """Kovadlina (železný špalek bez rohu jako v raném středověku) zaražená do pařezu."""
    cx, cy = c
    lathe(b, c, [(0.26, -0.05), (0.25, 0.5)], "beam", seg=10, smooth=False)
    stump_top(b, c, 0.25, 0.5)
    cbox(b, cx - 0.14, cx + 0.14, cy - 0.09, cy + 0.09, 0.45, 0.6, "iron")
    cbox(b, cx - 0.25, cx + 0.25, cy - 0.12, cy + 0.12, 0.6, 0.74, "iron")
    # kladivo položené na kovadlině, kleště opřené o pařez
    b.beam((cx - 0.05, cy - 0.02, 0.75), (cx + 0.38, cy - 0.18, 0.76), 0.035)
    cbox(b, cx - 0.1, cx + 0.0, cy - 0.06, cy + 0.04, 0.72, 0.79, "iron")
    for d in (-0.03, 0.03):
        b.beam((cx + 0.26 + d, cy + 0.27, 0.0), (cx + 0.2 + d, cy + 0.2, 0.62), 0.025, mat="iron")


def build_kovar(mat, stages=False):
    part = Parts("kovar")
    build_porch_house(part, stages)
    forge(part, (0.85, -4.75))
    anvil(part("anvil"), (-0.35, -4.7))
    lathe(part("charcoal"), (-2.15, -4.6), [(0.58, -0.03), (0.52, 0.08), (0.42, 0.18), (0.28, 0.29), (0.12, 0.35), (0.0, 0.37)], "charcoal", seg=14, smooth=False, wobble=lambda r, z, a: (r * (1 + 0.1 * math.sin(4 * a + z * 6) + 0.07 * math.sin(9 * a + z * 17)), z + 0.03 * math.sin(7 * a + r * 13)))
    # koryto s vodou na kalení (vydlabaný kmen)
    b = part("trough")
    cbox(b, -1.38, -0.98, -5.55, -4.6, -0.03, 0.34, "logs_rot", skip=("+z", "-z"), voff=-0.18)
    cbox(b, -1.36, -1.0, -5.53, -4.62, 0.2, 0.3, "water", skip=("-z", "-x", "+x", "-y", "+y"))
    for x in (-1.38, -0.98):
        b.beam((x, -5.55, 0.33), (x, -4.6, 0.33), 0.06)
    # zásoba železa – houby a pruty na špalku
    b = part("iron")
    lathe(b, (1.85, -3.35), [(0.22, -0.05), (0.21, 0.35)], "beam", seg=8, smooth=False)
    stump_top(b, (1.85, -3.35), 0.21, 0.35)
    for i in range(3):
        b.beam((1.72, -3.45 + i * 0.09, 0.39), (2.02, -3.3 + i * 0.07, 0.39), 0.045, mat="iron")
    cb = CB("kovar-basket-coal")
    with cb.smooth_mode():
        lathe(cb, (-1.75, -3.0), [(0.2, 0.3), (0.12, 0.36), (0.0, 0.38)], "charcoal", seg=10)
    extras = {
        "yard": [
            D.import_prop("basket-a", 0.42, (-1.75, -3.0, 0.0), mat),
            cb.build(mat),
        ]
    }
    return part, extras


# ------------------------------------------------------------------ uhlíř a milíř


def coal_basket(mat, name, loc, scale=0.42, rot=0.0):
    """Koš z 0 A.D. a v něm kopeček uhlí (výška koše podle jeho obalu)."""
    basket = D.import_prop("basket-a", scale, loc, mat, rot)
    bpy.context.view_layer.update()
    top = max((basket.matrix_world @ Vector(c)).z for c in basket.bound_box)
    b = CB(name)
    with b.smooth_mode():
        lathe(b, loc[:2], [(0.19, top - 0.06), (0.12, top + 0.02), (0.0, top + 0.05)], "charcoal", seg=10)
    return [basket, b.build(mat)]


def log(b, a, c, r, seed):
    """Poleno (kulatina) z bodu a do c: šestiboký hranol, boky kůra (pás beam), čela letokruhy
    (jedno čelo z pásu logends podle seedu)."""
    a, c = Vector(a), Vector(c)
    d = (c - a).normalized()
    length = (c - a).length
    side = d.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
    up = side.cross(d).normalized()
    n = 6
    ring = [side * (r * math.cos(2 * math.pi * k / n)) + up * (r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    off = seeded(seed) * D.UPER
    for k in range(n):
        k1 = (k + 1) % n
        v0, v1 = (k / n - 0.5) * 0.3, ((k + 1) / n - 0.5) * 0.3
        b.poly([a + ring[k], a + ring[k1], c + ring[k1], c + ring[k]], "beam", out=ring[k] + ring[k1], uvm=[(off, v0), (off, v1), (off + length, v1), (off + length, v0)])
    tile = int(seeded(seed + 17) * 9)
    uc, k = 0.111 + tile * 0.222, 0.1 / r
    for e, o in ((a, -d), (c, d)):
        b.poly([e + q for q in ring], "logends", out=o, uvm=[(uc + q.dot(side) * k, q.dot(up) * k) for q in ring])


def log_heap(b, c, rx=0.85, ry=1.3, height=0.72, count=22, seed=3):
    """Volná hromada polen na milíř (ne vyskládaná hráň – Martin): polena různě dlouhá, natočená
    převážně podél delší osy hromady, leží po povrchu nízké kupy (výš uprostřed) a pár jich je
    opřených z boku."""
    cx, cy = c

    def surface(x, y):
        q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        return height * max(0.0, 1 - q) ** 0.8

    def place(x0, y0, x1, y1, r):
        z0 = max(surface(x0, y0), 0) + r * 0.75
        z1 = max(surface(x1, y1), 0) + r * 0.75
        return (x0, y0, z0), (x1, y1, z1)

    for i in range(count):
        t = (i + 0.5) / count
        rr = math.sqrt(t) * 0.85
        ang = i * 2.39996 + seeded(seed * 31 + i) * 0.6
        px, py = cx + rr * rx * math.cos(ang), cy + rr * ry * math.sin(ang)
        yaw = math.radians(90 + (seeded(seed * 7 + i) - 0.5) * 70)
        length = 0.95 + 0.35 * seeded(seed * 11 + i)
        r = 0.06 + 0.035 * seeded(seed * 13 + i)
        dx, dy = math.cos(yaw) * length / 2, math.sin(yaw) * length / 2
        a, e = place(px - dx, py - dy, px + dx, py + dy, r)
        log(b, a, e, r, seed * 100 + i)
    for i, (ang, yaw) in enumerate(((0.3, 20), (2.4, 160), (4.2, 250))):  # opřená z boku
        px, py = cx + 1.25 * rx * math.cos(ang), cy + 1.1 * ry * math.sin(ang)
        r = 0.07
        top = (cx + 0.45 * rx * math.cos(ang), cy + 0.45 * ry * math.sin(ang))
        log(b, (px, py, r), (top[0], top[1], surface(*top) + r), r, seed * 200 + i)


def build_uhlir(mat, stages=False):
    """Uhlíř: zemnice z dwellings.py (střecha z atlasu s mechem), volná hromada polen na milíř,
    koše uhlí."""
    part = Parts("uhlir")
    D.build_zemnice(part, stages=stages)
    b = part("tools")
    b.beam((-2.62, -1.42, 0.22), (-2.7, -1.3, 1.3), 0.045)  # lopata zapíchnutá u hromady polen
    b.box(-2.75, -2.49, -1.45, -1.39, -0.1, 0.25, "beam")
    heap = CB("uhlir-log-heap")
    log_heap(heap, (-3.55, 0.3))
    extras = {
        "wood": [
            heap.build(mat),
            D.import_prop("basket-a", 0.42, (-1.55, -3.55, 0.0), mat),
        ],
        "coal": coal_basket(mat, "coal-1", (1.45, -3.4, 0.0)) + coal_basket(mat, "coal-2", (1.95, -3.15, 0.0), 0.38, 0.5),
    }
    return part, extras


MILIR_R, MILIR_H = 2.3, 2.15  # poloměr a výška kupy (m)
MILIR_CAP_R = 0.95  # od tohoto poloměru výš je vrchol shora (oblast clamp_top)
MILIR_COVER_Z = (0.95, 1.55)  # hranice prstenců krytu zdola nahoru (díly cover-1…3)
MILIR_STACK_Z = (0.36, 0.8, 1.25, 1.7, 2.0)  # vrstvy polen (díly stack-1…4)


def milir_profile():
    """Profil kupy po stejných kouscích délky (≈ 0,25 m)."""
    pts = []
    for i in range(200 + 1):
        t = i / 200
        z = 0.32 + (MILIR_H - 0.32) * t
        r = MILIR_R * (1 - t**2.4) ** (1 / 2.4)
        pts.append((r, z))
    cum = [0.0]
    for p, q in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(p, q))
    step, out, k = 0.25, [pts[0]], 1
    s = step
    while s < cum[-1] - 0.05:
        while cum[k] < s:
            k += 1
        f = (s - cum[k - 1]) / (cum[k] - cum[k - 1])
        out.append((pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f))
        s += step
    return out


def cut_profile(prof, z0, z1):
    """Úsek profilu (zdola nahoru) mezi výškami z0 a z1 – krajní body dopočítané."""
    def at(z):
        for (ra, za), (rb, zb) in zip(prof, prof[1:]):
            if za <= z <= zb and zb > za:
                f = (z - za) / (zb - za)
                return (ra + (rb - ra) * f, z)
        return None

    out = [at(z0)] + [p for p in prof if z0 < p[1] < z1] + [at(z1)]
    return [p for p in out if p is not None]


def milir_lumps(r, z, a):
    k = 1 + 0.025 * math.sin(5 * a + 1.3 * z) + 0.018 * math.sin(11 * a - 2.1 * z + 1) + 0.02 * math.sin(3 * a + 4 * z)
    return r * k, z


def build_milir(mat, stages=False):
    """Milíř po dílech stavby: milířiště – začernalá zem do trávy („ground“), věnec polen
    („ring“), kryt z hlíny a drnů po prstencích zdola („cover-1…3“), vrchol s komínem („top“),
    průduchy („vents“), žebřík, hrabice, drny s lopatou a koš uhlí („tools“). Na staveništi
    navíc kolíky po obvodu („stakes“), fíra uprostřed („pole“) a polena po vrstvách („stack-1…4“),
    které kryt pak schová."""
    part = Parts("milir")
    R = MILIR_R
    lumps = milir_lumps
    # věnec polen u země (pod okrajem hlíny) – čela polen
    lathe(part("ring"), (0, 0), [(R - 0.12, -0.05), (R - 0.1, 0.36)], "firewood", seg=24, u_total=16.0, smooth=False)
    # kryt: okraj hlíny přečnívá přes věnec, pak kupa až k vrcholu – po prstencích zdola nahoru
    prof = milir_profile()
    body = [(R - 0.1, 0.36)] + [p for p in prof if p[0] > MILIR_CAP_R]
    bounds = (body[0][1], *MILIR_COVER_Z, body[-1][1] + 1e-6)
    v0 = 0.0
    for k in range(3):
        if k == 0:  # okraj přes věnec (první dva body) zůstane celý
            piece = [p for p in body if p[1] < bounds[1]] + cut_profile(body[1:], bounds[1], bounds[1])[:1]
        else:
            piece = cut_profile(body[1:], bounds[k], bounds[k + 1])
        lathe(part(f"cover-{k + 1}"), (0, 0), piece, "clamp", seg=24, u_total=16.0, wobble=lumps, v_mirror=1.5, v0=v0)
        v0 += arc_lengths(piece)[-1]
    # vrchol shora (oblast clamp_top) – kužel z posledního prstence do středu, komín
    b = part("top")
    last = body[-1]
    seg = 24
    with b.smooth_mode():
        for ring_r, ring_z, nxt_r, nxt_z in (
            (last[0], last[1], MILIR_CAP_R * 0.55, MILIR_H - 0.06),
            (MILIR_CAP_R * 0.55, MILIR_H - 0.06, 0.16, MILIR_H),
        ):
            for i in range(seg):
                a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
                pts = []
                for r, z, a in ((ring_r, ring_z, a0), (ring_r, ring_z, a1), (nxt_r, nxt_z, a1), (nxt_r, nxt_z, a0)):
                    rr, zz = lumps(r, z, a) if r > 0.5 else (r, z)
                    pts.append((rr * math.sin(a), -rr * math.cos(a), zz))
                b.poly(pts, "clamp_top", out=(math.sin(a0) * 0.5, -math.cos(a0) * 0.5, 1), uvm=[(0.5 + p[0] / (2 * last[0]), 0.5 + p[1] / (2 * last[0])) for p in pts])
    lathe(b, (0, 0), [(0.16, MILIR_H), (0.17, MILIR_H + 0.08), (0.11, MILIR_H + 0.07)], "clamp_top", seg=10)
    disc(b, (0, 0), 0.115, MILIR_H + 0.06, "dark", seg=10)
    # průduchy v plášti (dva věnce, některé zasypané)
    b = part("vents")
    for ring, (z_ring, n, sz) in enumerate(((1.35, 7, 0.055), (0.8, 6, 0.05))):
        for i in range(n):
            if seeded(i + 31 * ring) < 0.25:
                continue
            zz = z_ring + 0.12 * (seeded(i + 17 * ring) - 0.5)
            r_at = R * (1 - ((zz - 0.32) / (MILIR_H - 0.32)) ** 2.4) ** (1 / 2.4)
            a = 2 * math.pi * (i + 0.5 * ring + 0.35 * seeded(i + 7 * ring)) / n
            r, _ = lumps(r_at, zz, a)
            r += 0.03
            nx, ny = math.sin(a), -math.cos(a)
            tx, ty = math.cos(a), math.sin(a)
            c = Vector((r * nx, r * ny, zz))
            t = Vector((tx, ty, 0)) * sz
            up = Vector((-nx * 0.35, -ny * 0.35, 1)).normalized() * sz * 0.8
            b.poly([c - t - up, c + t - up, c + t + up, c - t + up], "dark", out=(nx, ny, 0.4))
    # milířiště: začernalá zem a popel kolem, dál do trávy (pás turf), zapadá pod terén
    b = part("ground")
    lathe(b, (0, 0), [(R + 0.3, 0.03), (R + 0.05, 0.06), (R - 0.12, 0.05)], "clamp", seg=24, u_total=16.0, smooth=False)
    with b.smooth_mode():
        for i in range(24):
            a0, a1 = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
            ro = [2.95 * (1 + 0.06 * math.sin(3 * a + 0.5) + 0.04 * math.sin(7 * a)) for a in (a0, a1)]
            pts = [
                (ro[0] * math.sin(a0), -ro[0] * math.cos(a0), -0.08),
                (ro[1] * math.sin(a1), -ro[1] * math.cos(a1), -0.08),
                ((R + 0.3) * math.sin(a1), -(R + 0.3) * math.cos(a1), 0.03),
                ((R + 0.3) * math.sin(a0), -(R + 0.3) * math.cos(a0), 0.03),
            ]
            u0, u1 = 16.0 * i / 24, 16.0 * (i + 1) / 24
            b.poly(pts, "turf", out=(0, 0, 1), uvm=[(u0, 0.0), (u1, 0.0), (u1, 0.4), (u0, 0.4)])
    # žebřík opřený o kupu (vpravo vpředu), hrabice z druhé strany, stoh drnů a lopata
    b = part("tools")
    a = math.radians(-35)
    base = Vector((math.sin(a) * (R + 1.05), -math.cos(a) * (R + 1.05), -0.05))
    top = Vector((math.sin(a) * 1.85, -math.cos(a) * 1.85, 1.8))  # nad pláštěm, ne v něm
    side = Vector((math.cos(a), math.sin(a), 0)) * 0.24
    for s in (-1, 1):
        b.beam(base + side * s, top + side * s, 0.07)
    length = (top - base).length
    k = 0.3
    while k < length - 0.2:
        p = base + (top - base) * (k / length)
        b.beam(p - side * 1.15, p + side * 1.15, 0.04)
        k += 0.32
    a = math.radians(140)
    hb = Vector((math.sin(a) * (R + 0.9), -math.cos(a) * (R + 0.9), -0.02))
    ht = Vector((math.sin(a) * 2.0, -math.cos(a) * 2.0, 1.5))
    b.beam(hb, ht, 0.045)
    side = Vector((math.cos(a), math.sin(a), 0)) * 0.3
    b.beam(hb - side + Vector((0, 0, 0.05)), hb + side + Vector((0, 0, 0.05)), 0.06)
    for i in range(7):
        p = hb - side + side * (2 * i / 6)
        b.beam(p, p + Vector((0, 0, -0.15)) + (hb - ht).normalized() * 0.05, 0.025)
    for layer in range(2):
        for i in range(3 - layer):
            x0 = -3.6 + i * 0.4 + layer * 0.2
            y0 = -1.8 + 0.05 * layer
            z0 = layer * 0.11
            cbox(b, x0, x0 + 0.38, y0, y0 + 0.32, z0, z0 + 0.1, "spoil", top="turf", skip=("-z",))
    b.beam((-2.75, -1.4, 0.2), (-2.6, -1.05, 1.3), 0.045)
    b.box(-2.86, -2.62, -1.52, -1.47, -0.15, 0.25, "beam")
    extras = {"tools": coal_basket(mat, "milir-coal", (-2.6, -2.55, 0.0))}
    if stages:
        # kolíky po obvodu kruhu, fíra (středový kůl, kolem ní komín) a polena po vrstvách
        b = part("stakes")
        for i in range(12):
            a = 2 * math.pi * i / 12
            b.beam((math.sin(a) * (R + 0.35), -math.cos(a) * (R + 0.35), -0.15), (math.sin(a) * (R + 0.35), -math.cos(a) * (R + 0.35), 0.5), 0.06)
        part("pole").beam((0, 0, -0.3), (0, 0, MILIR_H + 0.45), 0.14)
        stack = [(r * 0.92, z) for r, z in prof]
        for k in range(len(MILIR_STACK_Z) - 1):
            b = part(f"stack-{k + 1}")
            z0, z1 = MILIR_STACK_Z[k], MILIR_STACK_Z[k + 1]
            piece = cut_profile(stack, z0, z1)
            lathe(b, (0, 0), piece, "firewood", seg=24, u_total=16.0, v_mirror=0.8, smooth=False)
            # navrchu vrstvy čela polen (stojí nastojato) – soustředné kruhy
            lathe(b, (0, 0), [(piece[-1][0], z1), (0.0, z1)], "firewood", seg=24, u_total=16.0, v_mirror=0.8, smooth=False)
    return part, extras


# ------------------------------------------------------------------ rekvizity staveniště


def site_stones(part):
    """Hromada kamenů na podstavec pece a výheň (rekvizita staveniště „site-stones“)."""
    b = part("stones")
    for i in range(11):
        layer = 0 if i < 7 else 1
        a = 2 * math.pi * seeded(i + 40)
        d = (0.45 if layer == 0 else 0.18) * math.sqrt(seeded(i + 50))
        x, y = d * math.cos(a), d * math.sin(a) * 0.75
        r = 0.13 + 0.06 * seeded(i + 60)
        z0 = layer * 0.14
        lathe(b, (x, y), [(r * 0.8, z0 - 0.02), (r, z0 + r * 0.45), (r * 0.6, z0 + r * 0.9), (0.0, z0 + r * 1.0)], "stone", seg=7, u_total=1.0, smooth=False, wobble=lambda rr, zz, aa, s=i: (rr * (1 + 0.18 * math.sin(3 * aa + s)), zz))


def site_clay(part):
    """Hromada hlíny na pec a mazanici (rekvizita staveniště „site-clay“)."""
    b = part("clay")
    with b.smooth_mode():
        lathe(b, (0, 0), [(0.55, -0.03), (0.48, 0.12), (0.32, 0.25), (0.0, 0.3)], "clay", seg=12, wobble=lambda r, z, a: (r * (1 + 0.12 * math.sin(3 * a + 1) + 0.06 * math.sin(7 * a)), z))


# ------------------------------------------------------------------ výstup


def join(objs, name):
    """D.join, jen jeden objekt se nespojuje (operátor by nic neudělal) – zapéct a přejmenovat."""
    if len(objs) > 1:
        return D.join(objs, name)
    obj = objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name
    return obj


def finished(name, parts, extras, mat):
    """Hotová stavba: všechny díly a rekvizity spojené do jednoho meshe."""
    objs = parts.build(mat) + [o for lst in extras.values() for o in lst]
    return join(objs, name)


def staged(parts, extras, mat):
    """Díly staveniště: každý klíč jeden objekt „druh-díl“ (rekvizity se spojí s dílem svého klíče)."""
    objs = []
    for key, builder in parts.builders.items():
        obj = builder.build(mat)
        objs.append(join([obj] + extras.get(key, []), f"{parts.prefix}-{key}"))
    for key, lst in extras.items():
        if key not in parts.builders:
            objs.append(join(lst, f"{parts.prefix}-{key}"))
    return objs


def export_parts(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    D.export(objs, path)
    for obj in objs:
        print(f"PART {obj.name}: {D.tri_count(obj)} tris")


def preview(models, render_dir):
    D.setup_world(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain", "grass.jpg"))
    scene = bpy.context.scene
    scene.cycles.samples = 40
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    terrain = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain")
    grass_mat = bpy.data.materials["ground"]
    earth_mat = D.textured_material("pit-earth", os.path.join(terrain, "mud.jpg"), (0.8, 0.62, 0.45))
    bpy.data.objects["ground"].hide_render = True
    os.makedirs(render_dir, exist_ok=True)
    for obj, kind in ((models["hrncir"], "polozemnice"), (models["kovar"], "polozemnice"), (models["uhlir"], "zemnice")):
        extra = D.pit_ground(kind, grass_mat, earth_mat)
        objs = [obj]
        if obj.name == "uhlir":
            models["milir"].location = (*MILIR_OFFSET, 0)
            objs.append(models["milir"])
            D.render(objs, os.path.join(render_dir, "uhlir_game.png"), (4.5, -30, 26.5), (4.5, -2.0, 0.5), size=(1100, 760), lens=40)
            D.render(objs, os.path.join(render_dir, "uhlir_side.png"), (-10.0, -14.0, 6.5), (4.0, -1.5, 0.9), size=(1100, 760), lens=32)
            mx, my = MILIR_OFFSET
            D.render(objs, os.path.join(render_dir, "milir_close.png"), (mx - 3.5, my - 8.5, 4.0), (mx, my, 1.0), size=(1100, 760), lens=32)
        else:
            D.render(objs, os.path.join(render_dir, f"{obj.name}_game.png"), (0, -22, 19.5), (0, -1.5, 0.5), size=(1100, 760))
            D.render(objs, os.path.join(render_dir, f"{obj.name}_close.png"), (-4.5, -11.5, 4.2), (0.3, -4.2, 0.6), size=(1100, 760), lens=32)
            D.render(objs, os.path.join(render_dir, f"{obj.name}_side.png"), (12.5, -7.5, 5.0), (0, -2.0, 1.0), size=(1100, 760), lens=32)
        for o in extra:
            bpy.data.objects.remove(o)
        models["milir"].location = (0, 0, 0)


BUILDERS = {"hrncir": build_hrncir, "kovar": build_kovar, "uhlir": build_uhlir, "milir": build_milir}
MOSS = {"uhlir", "milir"}  # střecha / zem z atlasu s mechem (atlas-moss.jpg)


def main():
    os.makedirs(OUT, exist_ok=True)
    # staveniště: díly po fázích (apps/web/lib/scene/village-construction.ts) – construction.glb
    # (hrnčíř, kovář a rekvizity „site-stones“, „site-clay“) a construction-moss.glb (uhlíř, milíř)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = material("craft-atlas", "atlas.jpg")
    moss = material("craft-atlas-moss", "atlas-moss.jpg")
    plain, mossy = [], []
    for name, build in BUILDERS.items():
        m = moss if name in MOSS else mat
        parts, extras = build(m, stages=True)
        (mossy if name in MOSS else plain).extend(staged(parts, extras, m))
    site = Parts("site")
    site_stones(site)
    site_clay(site)
    plain += site.build(mat)
    export_parts(plain, os.path.join(OUT, "construction.glb"))
    export_parts(mossy, os.path.join(OUT, "construction-moss.glb"))

    # hotové stavby (čistá scéna – jména objektů staveniště se neopakují)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = material("craft-atlas", "atlas.jpg")
    moss = material("craft-atlas-moss", "atlas-moss.jpg")
    models = {}
    for name, build in BUILDERS.items():
        m = moss if name in MOSS else mat
        parts, extras = build(m)
        models[name] = finished(name, parts, extras, m)
    for name, obj in models.items():
        obj.location = (0, 0, 0)
        D.export([obj], os.path.join(OUT, f"{name}.glb"))
        d = obj.dimensions
        print(f"STAT {name}: {D.tri_count(obj)} tris, {len(obj.data.materials)} mat, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")
    if RENDER != "-":
        preview(models, RENDER)


if __name__ == "__main__":
    main()
