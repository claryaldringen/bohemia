"""Posvátná místa raně slovanské vsi (6.–9. st.) procedurálně – dřevěná modla, svatyně podle
Perynu, obětiny u posvátného dubu a kameny dubového háje (docs/design/happiness.md). Jeden atlas
(tools/blender/sacred_atlas.py) → jeden materiál na model.

blender -b --factory-startup --python tools/blender/sacred.py -- \
    <sacred_atlas_dir> apps/web/public/models/sacred <render_dir|->

Souřadnice jako u obydlí a řemesel (dwellings.py, crafts.py): Z nahoru, předek (tváře modly,
obětiny) v −Y – v glTF a ve scéně při natočení 0 míří do +Z. Počátek = střed půdorysu na úrovni
terénu. Všechno leží na terénu nebo nad ním: příkop svatyně má dno 5 cm nad zemí a hloubku mu
dělá vyvýšená plocha uvnitř a nízký val venku – scéna nemusí terén prořezávat.

Výstup (apps/web/public/models/sacred):
  idol.glb    modla na půdorysu 4 × 4 m: dubový kůl (Ø ≈ 0,5 m, 2,9 m nad zemí) osekaný nahoře
              do čtyřhranu se čtyřmi tvářemi pod jednou kulatou čepicí (podle modly ze Zbruče),
              pod tvářemi paže, na přední straně roh, opasek; ošlehané šedohnědé dřevo; u paty
              klínové kameny, červená stužka; udusaný kruh Ø ≈ 4 m s drnovým okrajem a vpředu
              obětiny – misky se zrnem, snop opřený o kůl, kameny
  idol-construction.glb   díly staveniště modly („modla-…“): stakes (kolíky a provázek
              kruhu), ground (udusaný kruh), log (kmen na podložkách), struts (vzpěry při
              vztyčení), post (vztyčený kmen v kůře), stones (klínové kameny), chips (třísky),
              hewn (kůl osekaný do čtyřhranu, čepice jako špalek), carved (tváře nahrubo), idol
              (hotová řezba), ribbon, offerings
  shrine.glb  svatyně podle Perunovy svatyně v Perynu na půdorysu 30 × 30 m: vyvýšená kruhová
              plocha Ø 21 m (udusaná hlína), kolem příkop s osmi oblými výběžky (okvětí), za ním
              nízký val; v každém výběžku ohniště (kruh kamenů, popel, ohořelá polena, žhavé
              uhlíky); jedna síť „shrine“ a k ní prázdné uzly fire-1…fire-8 ve středu ohnišť na
              dně příkopu (pro dým a záři) – fire-k leží pod úhlem 22,5° + (k − 1) · 45° od
              předku (−Y v Blenderu, +Z v glTF) po směru +X; uprostřed modla (stejná řezba
              ×1,55, ≈ 4,4 m) na kruhové kamenné dlažbě, před ní obětiny
  shrine-construction.glb díly staveniště svatyně („svatyne-…“): stakes (střed, provaz,
              kolíky kruhu a okvětí), ditch-1…8 (příkop výběžek po výběžku s valem),
              platform-1 (hrubá navážka), platform-2 (udusaná plocha), fire-1…8, log, struts,
              post, hewn, carved, idol, chips, paving, offerings
  oak-offerings.glb  obětiny u paty posvátného dubu (kmen Ø 1–1,5 m, počátek = osa kmene):
              kruh kamenů r ≈ 1,5–1,9 m, pahýl větve ve výšce ≈ 2,3 m (začíná 0,35 m od osy
              uvnitř kmene, míří dopředu) s uvázanými stužkami (červená, bílá, okrová), vpředu
              miska se zrnem – vše v okruhu ≈ 2 m
  grove-stones.glb  kameny na okraj dubového háje pro instance – uzly stone-a (vysoký hraniční
              kámen ≈ 1 m), stone-b (nízký balvan), altar (plochý kámen na třech podpěrách
              s miskou a popelem); každý uzel má počátek u své paty (všechny v bodě 0)
  sacred-decay.glb  díly rozpadu opuštěné modly a svatyně (docs/design/abandonment.md – jen se
              čtvrtým argumentem „decay“, ostatní GLB se tím nepřepíšou); počátek jako hotové
              modely, barvy materiálů jsou glTF baseColorFactor (atlas × odstín):
              idol-weathered (zšedlé dřevo modly – „decay-weathered“) a idol-weathered-moss
              (mech u paty a na čepici – „decay-moss“), idol-ground-overgrown (udusaný kruh
              zarostlý trávou – „decay-grass“), idol-stones-scattered (klínové kameny rozvalené),
              idol-fallen a idol-fallen-moss (modla zlomená u země leží na zemi tváří vzhůru),
              idol-stump (shnilý pahýl kůlu); totéž pro modlu svatyně (×1,55 na dlažbě):
              shrine-idol-weathered, -weathered-moss, -fallen, -fallen-moss, -stump;
              shrine-fires-cold (vyhaslá ohniště – popel, kameny, sesunutá ohořelá polena bez
              uhlíků), shrine-ground-overgrown (plocha a příkop s valem – scéna je potáhne trávou
              terénu) a shrine-paving-overgrown (dlažba v trávě – „decay-grass“). Který díl kdy, určuje apps/web/lib/scene/structure-decay.ts.
Kdy se který díl staveniště ukáže, určuje apps/web/lib/scene/village-construction.ts (fáze
„modla“ a „svatyne“); hotové modely jsou tytéž díly spojené (bez dílů jen pro staveniště).
Obětiny u dubu a kameny háje mají atlas zmenšený na polovinu (drobné dekorace).

Celý postup (craft_atlas.py viz hlavička crafts.py – atlas řemesel z textur 0 A.D.):
  python3 tools/blender/craft_atlas.py <celt_struct_1.png> <celt_struct.png> \
      apps/web/public/textures/terrain <basket_celt_1.png> /tmp/craft-atlas
  python3 tools/blender/sacred_atlas.py /tmp/craft-atlas apps/web/public/textures/terrain \
      /tmp/sacred-atlas
  blender -b --factory-startup --python tools/blender/sacred.py -- \
      /tmp/sacred-atlas apps/web/public/models/sacred -
  # jen díly rozpadu (sacred-decay.glb), náhledy do /tmp/sacred-decay:
  blender -b --factory-startup --python tools/blender/sacred.py -- \
      /tmp/sacred-atlas apps/web/public/models/sacred /tmp/sacred-decay decay
Ikony (modla, svatyne, dub, haj, štěstí): tools/blender/icons.py.
"""
import math
import os
import sys
import tempfile
from contextlib import contextmanager

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
_DASH = sys.argv.index("--")
_ARGS = sys.argv[_DASH + 1 :]
SACRED_ATLAS, OUT_DIR = _ARGS[0], _ARGS[1]
RENDER_DIR = _ARGS[2] if len(_ARGS) > 2 else "-"
# čtvrtý argument „decay“ = jen díly rozpadu (sacred-decay.glb), ostatní GLB se nepřepisují
DECAY_ONLY = len(_ARGS) > 3 and _ARGS[3] == "decay"
# dwellings.py čte při importu (atlas, koše z 0 A.D., výstup, náhledy) – koše tu nejsou potřeba
sys.argv = sys.argv[: _DASH + 1] + [SACRED_ATLAS, "-", OUT_DIR, RENDER_DIR]
sys.dont_write_bytecode = True  # žádné __pycache__ v tools/blender
sys.path.insert(0, HERE)
import dwellings as D  # noqa: E402
import crafts as C  # noqa: E402
import sacred_layout as L  # noqa: E402

seeded = C.seeded
TERRAIN = os.path.join(HERE, "..", "..", "apps", "web", "public", "textures", "terrain")
TREES = os.path.join(HERE, "..", "..", "apps", "web", "public", "models", "trees")


def sstep(e0, e1, x):
    """Plynulý přechod 0 → 1 mezi e0 a e1 (funguje i pro e0 > e1)."""
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def gauss(x, s):
    return math.exp(-x * x / (2 * s * s))


def mirror(v, period):
    """Souřadnice v zrcadlená do 0–period (pás se opakuje bez švu)."""
    t = v % (2 * period)
    return t if t <= period else 2 * period - t


# ------------------------------------------------------------------ stavebnice


class SB(C.CB):
    """Builder řemesel + transformace bodů (kameny, snop a vzpěry natočené a nakloněné)."""

    def __init__(self, name):
        super().__init__(name)
        self._xf = None

    @contextmanager
    def transform(self, m):
        prev = self._xf
        self._xf = m if prev is None else prev @ m
        try:
            yield self
        finally:
            self._xf = prev

    def poly(self, pts, mat, frame=None, out=None, uvm=None):
        if self._xf is not None:
            pts = [self._xf @ Vector(p) for p in pts]
            if out is not None:
                out = self._xf.to_3x3() @ Vector(out)
        super().poly(pts, mat, frame=frame, out=out, uvm=uvm)


class Parts(D.Parts):
    def __call__(self, key):
        if key not in self.builders:
            self.builders[key] = SB(f"{self.prefix}-{key}")
        return self.builders[key]


def xf(loc=(0.0, 0.0, 0.0), yaw=0.0, tilt_x=0.0, tilt_y=0.0, scale=1.0):
    return (
        Matrix.Translation(Vector(loc))
        @ Matrix.Rotation(yaw, 4, "Z")
        @ Matrix.Rotation(tilt_x, 4, "X")
        @ Matrix.Rotation(tilt_y, 4, "Y")
        @ Matrix.Scale(scale, 4)
    )


def seam_u(r):
    """Délka U kolem kruhu o poloměru r zaokrouhlená na periodu atlasu (pás bez švu)."""
    return D.UPER * max(1, round(2 * math.pi * r / D.UPER))


ROCK = [(0.92, 0.0), (1.0, 0.3), (0.88, 0.68), (0.5, 0.94), (0.0, 1.0)]
PILLAR = [(0.95, 0.0), (1.0, 0.25), (0.93, 0.6), (0.72, 0.84), (0.36, 0.97), (0.0, 1.0)]
SLAB = [(0.95, 0.0), (1.0, 0.4), (0.96, 0.82), (0.72, 0.98), (0.0, 1.03)]


def rock(b, c, rx, ry, rz, seed, yaw=0.0, z0=-0.04, prof=ROCK, seg=7, mat="rock"):
    """Kámen: hrouda z prstenců profilu (r, z) × seg úhlů, vrcholy rozházené šumem podle seedu.
    U = obvod (m), V = výška nad patou (pás rock, nad 1 m zrcadlený). Ostré hrany (fasety)."""
    cx, cy = c
    cy_, sy_ = math.cos(yaw), math.sin(yaw)
    rings = []
    for j, (pr, pz) in enumerate(prof):
        ring = []
        inner = 0 < j < len(prof) - 1
        for i in range(seg):
            t = 2 * math.pi * (i + 0.3 * seeded(seed * 7 + i)) / seg
            n = 1 + 0.36 * (seeded(seed * 97 + j * 13 + i) - 0.5)
            x, y = rx * pr * n * math.cos(t), ry * pr * n * math.sin(t)
            z = z0 + rz * pz * ((1 + 0.22 * (seeded(seed * 31 + j * 7 + i) - 0.5)) if inner else 1)
            ring.append(Vector((cx + x * cy_ - y * sy_, cy + x * sy_ + y * cy_, z)))
        rings.append(ring)
    centre = Vector((cx, cy, z0 + rz * 0.35))
    per = 2 * math.pi * (rx + ry) / 2
    v_off = seeded(seed + 5) * 0.3

    def uv(j, i):
        p = rings[j][i % seg]
        return (per * i / seg * max(prof[j][0], 0.25), mirror(p.z - z0 + v_off, 1.0))

    for j in range(len(prof) - 1):
        for i in range(seg):
            i1 = (i + 1) % seg
            if prof[j + 1][0] < 1e-6:
                pts = [rings[j][i], rings[j][i1], rings[j + 1][0]]
                uvm = [uv(j, i), uv(j, i + 1), uv(j + 1, i)]
            else:
                pts = [rings[j][i], rings[j][i1], rings[j + 1][i1], rings[j + 1][i]]
                uvm = [uv(j, i), uv(j, i + 1), uv(j + 1, i + 1), uv(j + 1, i)]
            mid = sum(pts, Vector()) / len(pts)
            b.poly(pts, mat, out=mid - centre, uvm=uvm)


def round_log(b, a, c, r, seed, n=8, mat="beam", end="logends", r_end=None):
    """Kulatina z bodu a do c (n boků): boky kůra (pás beam / charred – U podél, V kolem),
    čela letokruhy z pásu logends, nebo oblast (uhlí) přes celé čelo."""
    a, c = Vector(a), Vector(c)
    d = (c - a).normalized()
    length = (c - a).length
    side = d.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
    up = side.cross(d).normalized()
    r1 = r if r_end is None else r_end
    ring0 = [side * (r * math.cos(2 * math.pi * k / n)) + up * (r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    ring1 = [q * (r1 / r) for q in ring0]
    off = seeded(seed) * D.UPER
    for k in range(n):
        k1 = (k + 1) % n
        v0, v1 = (k / n - 0.5) * 0.36, ((k + 1) / n - 0.5) * 0.36
        b.poly(
            [a + ring0[k], a + ring0[k1], c + ring1[k1], c + ring1[k]],
            mat,
            out=ring0[k] + ring0[k1],
            uvm=[(off, v0), (off, v1), (off + length, v1), (off + length, v0)],
        )
    for e, ring, o, rr in ((a, ring0, -d, r), (c, ring1, d, r1)):
        if end == "logends":
            tile = int(seeded(seed + 17) * 9)
            uc, k = 0.111 + tile * 0.222, 0.1 / rr
            uvm = [(uc + q.dot(side) * k, q.dot(up) * k) for q in ring]
        else:
            uvm = [(0.5 + q.dot(side) / (2 * rr), 0.5 + q.dot(up) / (2 * rr)) for q in ring]
        b.poly([e + q for q in ring], end, out=o, uvm=uvm)


def planar_uv(c, half):
    """Svislá projekce do oblasti atlasu přes čtverec o polovině strany half kolem c."""
    return lambda x, y: ((x - c[0]) / (2 * half) + 0.5, (y - c[1]) / (2 * half) + 0.5)


def polar_surface(b, c, prof, mat, uv, seg=32, a0=0.0):
    """Výšková plocha kolem bodu c z profilu [(r, z)] od okraje ke středu (r klesá), lícem
    nahoru; UV z uv(x, y) – malovaná mapa země promítaná shora."""
    cx, cy = c
    rings = [[(cx + r * math.sin(a0 + 2 * math.pi * i / seg), cy - r * math.cos(a0 + 2 * math.pi * i / seg), z) for i in range(seg)] for r, z in prof]
    with b.smooth_mode("soft"):
        for j in range(len(prof) - 1):
            for i in range(seg):
                i1 = (i + 1) % seg
                if prof[j + 1][0] < 1e-6:
                    pts = [rings[j][i], rings[j][i1], (cx, cy, prof[j + 1][1])]
                else:
                    pts = [rings[j][i], rings[j][i1], rings[j + 1][i1], rings[j + 1][i]]
                b.poly(pts, mat, out=(0, 0, 1), uvm=[uv(p[0], p[1]) for p in pts])


IDOL_GROUND_TOP = 0.08  # povrch udusaného kruhu modly – na něm leží kameny a obětiny


def idol_ground(b, c):
    """Udusaný kruh modly Ø ≈ 4 m: malovaná mapa (oblast idol_ground – ušlapaný střed,
    cestička zepředu, travnatý okraj), mírně vyvýšený (povrch ≈ IDOL_GROUND_TOP – obtisky
    ušlapané trávy ve scéně ho nepřekryjí), okraj pod úrovní terénu."""
    R = L.IDOL_GROUND_R + 0.25
    prof = [(R, -0.03), (R - 0.4, 0.07), (R * 0.55, 0.085), (0.0, 0.09)]
    polar_surface(b, c, prof, "idol_ground", planar_uv(c, L.IDOL_HALF), seg=32)


def bowl(b, c, r=0.13, z0=0.0, grain=True, seed=0):
    """Hliněná miska: vnější plášť, okraj, vnitřek a zrno (oblast grain)."""
    prof_out = [(r * 0.45, z0), (r * 0.8, z0 + r * 0.18), (r, z0 + r * 0.5), (r * 1.02, z0 + r * 0.66)]
    C.lathe(b, c, prof_out, "pottery_fired", seg=12)
    prof_in = [(r * 0.94, z0 + r * 0.66), (r * 0.85, z0 + r * 0.42), (r * 0.5, z0 + r * 0.2)]
    C.lathe(b, c, prof_in, "pottery_fired", seg=12, out=-1)
    C.disc(b, c, r * 0.9 if grain else r * 0.55, z0 + (r * 0.5 if grain else r * 0.2), "grain" if grain else "dark", seg=12)


def sheaf(b, base, height=0.72, lean=(0.0, 0.0), yaw=0.0, seed=0):
    """Snop obilí: stébla svázaná povříslem, nahoře rozevřené klasy (oblast straw)."""
    h = height
    prof = [(0.1, 0.0), (0.085, 0.06 * h), (0.07, 0.36 * h), (0.072, 0.42 * h), (0.11, 0.62 * h), (0.15, 0.8 * h), (0.13, 0.93 * h), (0.0, h)]
    with b.transform(xf((base[0], base[1], base[2]), yaw, lean[0], lean[1])):
        C.lathe(b, (0, 0), prof, "straw", seg=10, wobble=lambda rr, zz, aa: (rr * (1 + 0.1 * math.sin(4 * aa + seed)), zz))
        C.lathe(b, (0, 0), [(0.078, 0.36 * h), (0.08, 0.39 * h), (0.078, 0.42 * h)], "rope", seg=10)
        C.disc(b, (0, 0), 0.1, 0.0, "straw", seg=10, up=False)


def ribbon(b, top, length, seed, mat="cloth_red", width=0.045, sway=(0.0, 0.0)):
    """Stužka visící z bodu top: pás látky se zvlněním, oboustranná (dvě plochy)."""
    top = Vector(top)
    n = 5
    ang = seeded(seed) * math.pi
    across = Vector((math.cos(ang), math.sin(ang), 0)) * (width / 2)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = top + Vector((sway[0] * t * t + 0.02 * math.sin(7 * t + seed), sway[1] * t * t + 0.02 * math.cos(5 * t + seed), -length * t))
        pts.append(p)
    normal = across.cross(Vector((0, 0, -1))).normalized()
    back = normal * 0.002  # rub o 2 mm vedle – svaření vrcholů (weld) líc a rub nespojí
    for k in range(n):
        q = [pts[k] - across, pts[k] + across, pts[k + 1] + across, pts[k + 1] - across]
        uvm = [(0, k / n), (1, k / n), (1, (k + 1) / n), (0, (k + 1) / n)]
        b.poly(q, mat, out=normal, uvm=uvm)
        b.poly([p - back for p in q], mat, out=-normal, uvm=uvm)


def stakes_ring(b, points, closed=True, top=0.55, rope_z=0.38):
    """Vytyčení: kolíky v bodech a mezi nimi napnutý provázek."""
    for x, y in points:
        b.beam((x, y, -0.15), (x, y, top), 0.06)
    pairs = zip(points, points[1:] + (points[:1] if closed else []))
    for (x0, y0), (x1, y1) in pairs:
        b.beam((x0, y0, rope_z), (x1, y1, rope_z), 0.022, mat="rope")


def chips(b, c, r0, r1, count, seed, z=0.045):
    """Třísky po tesání: drobné světlé plošky rozházené kolem kůlu (čela polen – světlé dřevo)."""
    for i in range(count):
        a = 2 * math.pi * seeded(seed + i * 3)
        d = r0 + (r1 - r0) * math.sqrt(seeded(seed + i * 3 + 1))
        x, y = c[0] + d * math.cos(a), c[1] + d * math.sin(a)
        rot = seeded(seed + i * 3 + 2) * math.pi
        w, l = 0.025 + 0.02 * seeded(seed + i), 0.05 + 0.05 * seeded(seed + i + 9)
        ca, sa = math.cos(rot), math.sin(rot)
        q = [(x + ca * l - sa * w, y + sa * l + ca * w), (x - ca * l - sa * w, y - sa * l + ca * w), (x - ca * l + sa * w, y - sa * l - ca * w), (x + ca * l + sa * w, y + sa * l - ca * w)]
        u0 = 0.111 + int(seeded(seed + i + 4) * 9) * 0.222
        b.poly([(px, py, z + 0.01 * seeded(seed + i + 7)) for px, py in q], "logends", out=(0, 0, 1), uvm=[(u0 - 0.03, -0.03), (u0 + 0.03, -0.03), (u0 + 0.03, 0.03), (u0 - 0.03, 0.03)])


# ------------------------------------------------------------------ modla (řezba)

# Rozměry modly v metrech (modla na návsi; svatyně má tutéž řezbu zvětšenou ×IDOL_SHRINE_SCALE)
IDOL_SINK = -0.15  # kůl zapuštěný do země
IDOL_R = 0.235  # poloměr kmene u země
IDOL_HW = 0.2  # polovina šířky čtyřhranu nahoře
IDOL_SQUARE = (0.95, 1.3)  # přechod kulatiny do čtyřhranu
IDOL_NECK = 2.02
IDOL_CAP = 2.52  # pata čepice
IDOL_TOP = 2.87
IDOL_SHRINE_SCALE = 1.55
CAP = [(0.21, 2.52), (0.3, 2.53), (0.315, 2.575), (0.3, 2.615), (0.262, 2.64), (0.258, 2.7), (0.225, 2.78), (0.145, 2.845), (0.0, 2.87)]
CAP_BLOCK = [(0.3, 2.52), (0.3, 2.84), (0.0, 2.86)]


def seg_dist(p, a, c):
    """Vzdálenost bodu p od úsečky a–c v rovině (s, z)."""
    ax, az = a
    cx, cz = c
    px, pz = p
    dx, dz = cx - ax, cz - az
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(px - ax - t * dx, pz - az - t * dz), t


ARM = [(0.19, 1.96), (0.172, 1.66), (0.035, 1.7)]  # rameno → loket → dlaň (|s|, z)
HORN = ((0.0, 1.7), (0.055, 1.9))  # roh v rukou na přední straně


def idol_relief(a, z, detail):
    """Poloměr řezby ve směru a (0 = předek, −Y) a výšce z (nezvětšené míry): kulatina dole,
    nahoře čtyřhran se zaoblenými hranami; na každé straně tvář (obočí, oči, nos, knír, ústa),
    pod ní paže, vpředu roh, opasek. detail 0 = jen osekaný čtyřhran, 0,5 = tváře nahrubo."""
    t = sstep(IDOL_SQUARE[0], IDOL_SQUARE[1], z)
    rl = (IDOL_R - 0.012 * min(1.0, max(0.0, z))) * (1 + 0.025 * math.sin(3 * a + 1.3 * z) * (1 - t))
    phi = (a + math.pi / 4) % (math.pi / 2) - math.pi / 4
    rs = IDOL_HW / (abs(math.cos(phi)) ** 4 + abs(math.sin(phi)) ** 4) ** 0.25
    r0 = rl * (1 - t) + rs * t
    s = r0 * math.sin(phi)
    side = int(round(a / (math.pi / 2))) % 4
    as_ = abs(s)
    d = 0.012 * sstep(2.05, 2.12, z) * (1 - sstep(2.46, 2.52, z))  # hlava o kousek širší
    d -= (0.014 + 0.014 * min(detail, 1.0)) * gauss(z - IDOL_NECK, 0.022)  # krk
    if detail > 0:
        f = 0.022 * gauss(z - 2.405, 0.016) * (1 - sstep(0.11, 0.15, as_))  # obočí
        f -= 0.03 * gauss(as_ - 0.068, 0.026) * gauss(z - 2.36, 0.02)  # oči
        tn = min(1.0, max(0.0, (2.39 - z) / 0.14))
        f += 0.05 * tn**0.7 * gauss(s, 0.022) * (1 - sstep(2.262, 2.245, z))  # nos
        f += 0.016 * gauss(z - (2.218 - 1.6 * s * s), 0.011) * (1 - sstep(0.075, 0.1, as_))  # knír
        f -= 0.016 * gauss(z - 2.19, 0.007) * (1 - sstep(0.045, 0.065, as_))  # ústa
        f += 0.01 * gauss(z - 2.13, 0.03) * (1 - sstep(0.06, 0.1, as_))  # brada
        d += min(detail, 1.0) * f
    if detail >= 1:
        dist = min(seg_dist((as_, z), ARM[0], ARM[1])[0], seg_dist((as_, z), ARM[1], ARM[2])[0])
        d += 0.034 * (1 - sstep(0.022, 0.042, dist))  # paže
        if side == 0:
            dh, th = seg_dist((s, z), *HORN)
            rad = 0.026 + 0.016 * th
            d += 0.036 * (1 - sstep(rad * 0.6, rad, dh))  # roh
        d += 0.028 * gauss(z - 1.47, 0.017)  # opasek
        d -= 0.018 * gauss(z - 1.3, 0.014)
    return r0, d


def idol_radius(a, z, detail):
    r0, d = idol_relief(a, z, detail)
    return r0 + d


def idol_column(b, c, scale=1.0, detail=1.0, z_base=0.0):
    """Sloup modly z prstenců (výška × úhel), soft normály; nahoře zakrytý čepicí. Pás oak:
    U kolem sloupu (šev vzadu), V = výška zrcadlená po 1 m."""
    fine = detail > 0
    n = 48 if fine else 24
    zs = [IDOL_SINK, 0.0, 0.3, 0.65, IDOL_SQUARE[0]]
    step_body, step_head = (0.055, 0.016) if fine else (0.12, 0.03)
    z = IDOL_SQUARE[0]
    while z < 1.95:
        z += step_body
        zs.append(min(z, 1.95))
    while z < IDOL_CAP + 0.015:
        z += step_head
        zs.append(min(z, IDOL_CAP + 0.015))
    # zlomy zrcadlení V (každý metr skutečné výšky) jako prstence – pás se nerozmaže
    k = 1
    while k / scale < IDOL_CAP:
        zs.append(k / scale)
        k += 1
    zs = sorted(set(round(v, 5) for v in zs))
    cx, cy = c
    u_total = 2 * math.pi * IDOL_R * scale
    grid, depth = [], []
    for zz in zs:
        row, drow = [], []
        for i in range(n + 1):
            a = math.pi + 2 * math.pi * i / n  # šev pásu vzadu
            r0, d = idol_relief(a % (2 * math.pi), zz, detail)
            r = (r0 + d) * scale
            row.append(Vector((cx + r * math.sin(a), cy - r * math.cos(a), z_base + zz * scale)))
            drow.append(d)
        grid.append(row)
        depth.append(drow)
    with b.smooth_mode("soft"):
        for j in range(len(zs) - 1):
            v0, v1 = mirror(zs[j] * scale, 1.0), mirror(zs[j + 1] * scale, 1.0)
            for i in range(n):
                p = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                u0, u1 = u_total * i / n, u_total * (i + 1) / n
                mid = (p[0] + p[2]) / 2
                # vyřezané prohlubně (oči, ústa, krk, rýhy) tmavší – tvář je čitelná i z dálky
                d = (depth[j][i] + depth[j][i + 1] + depth[j + 1][i] + depth[j + 1][i + 1]) / 4
                mat = "oak_dark" if d < -0.009 else "oak"
                b.poly(p, mat, out=(mid.x - cx, mid.y - cy, 0), uvm=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)])


def idol_cap(b, c, scale=1.0, block=False, z_base=0.0):
    prof = [(r * scale, z_base + z * scale) for r, z in (CAP_BLOCK if block else CAP)]
    C.lathe(b, c, prof, "oak", seg=16 if block else 28, u_total=2 * math.pi * 0.3 * scale, v_mirror=1.0, smooth=not block)
    C.disc(b, c, prof[0][0] + 0.002, prof[0][1] - 0.002, "oak", seg=16 if block else 28, up=False, uv_scale=1.0)


def bark_post(b, c, scale=1.0, z_base=0.0, seed=5):
    """Vztyčený kmen ještě v kůře (před tesáním)."""
    cx, cy = c
    round_log(b, (cx, cy, z_base + IDOL_SINK * scale), (cx, cy, z_base + (IDOL_TOP + 0.05) * scale), (IDOL_R + 0.035) * scale, seed, n=10, r_end=(IDOL_R + 0.015) * scale)


def packing_stones(b, c, scale=1.0, z_base=0.0, count=10, seed=40):
    for i in range(count):
        a = 2 * math.pi * (i + 0.35 * seeded(seed + i)) / count
        d = (0.36 + 0.12 * seeded(seed + 20 + i)) * scale
        s = (0.09 + 0.06 * seeded(seed + 40 + i)) * scale
        rock(b, (c[0] + d * math.sin(a), c[1] - d * math.cos(a)), s * 1.2, s, s * 0.8, seed + i, yaw=a, z0=z_base - 0.04)


def struts(b, c, scale=1.0, z_base=0.0, seed=60):
    """Tři vzpěry opřené o kůl při vztyčování a provaz kolem kůlu."""
    top = (IDOL_TOP * 0.68) * scale
    for k in range(3):
        a = 2 * math.pi * (k / 3 + 0.08) + 0.4
        foot = (c[0] + 1.55 * scale * math.sin(a), c[1] - 1.55 * scale * math.cos(a), z_base - 0.1)
        head = (c[0] + 0.3 * scale * math.sin(a), c[1] - 0.3 * scale * math.cos(a), z_base + top)
        round_log(b, foot, head, 0.05 * scale, seed + k, n=6)
    C.lathe(b, c, [(0.29 * scale, z_base + top - 0.06), (0.3 * scale, z_base + top), (0.29 * scale, z_base + top + 0.06)], "rope", seg=12)


def lying_log(b, c, length, r, yaw, seed=80, z_base=0.0):
    """Kmen na modlu na dvou podložkách (před vztyčením)."""
    dx, dy = math.cos(yaw) * length / 2, math.sin(yaw) * length / 2
    z = z_base + r + 0.11
    round_log(b, (c[0] - dx, c[1] - dy, z), (c[0] + dx, c[1] + dy, z * 0.97), r, seed, n=10, r_end=r * 0.88)
    for t in (-0.3, 0.3):
        px, py = c[0] + dx * 2 * t, c[1] + dy * 2 * t
        ox, oy = -math.sin(yaw) * 0.5, math.cos(yaw) * 0.5
        round_log(b, (px - ox, py - oy, z_base + 0.06), (px + ox, py + oy, z_base + 0.06), 0.07, seed + 7 + int(t * 10), n=6)


def offerings(b, front, spread=1.0, seed=100, sheaf_at=None, lean_to=None, z0=0.0):
    """Obětiny před modlou na zemi ve výšce z0: dvě misky se zrnem, třetí prázdná, hromádka
    kamenů a snop (opřený o kůl, když je dán lean_to)."""
    fx, fy = front
    s = spread
    bowl(b, (fx - 0.22 * s, fy - 0.05 * s), 0.12, z0 + 0.02, seed=seed)
    bowl(b, (fx + 0.12 * s, fy - 0.12 * s), 0.1, z0 + 0.02, seed=seed + 1)
    bowl(b, (fx + 0.42 * s, fy + 0.08 * s), 0.09, z0 + 0.02, grain=False, seed=seed + 2)
    for i in range(4):
        rock(b, (fx - 0.5 * s + 0.12 * i * s, fy + 0.18 * s + 0.07 * seeded(seed + i)), 0.08 + 0.03 * seeded(seed + i + 3), 0.07, 0.07, seed + 10 + i, yaw=i, z0=z0 - 0.04)
    if sheaf_at is not None:
        lean = (0.0, 0.0)
        if lean_to is not None:
            dx, dy = lean_to[0] - sheaf_at[0], lean_to[1] - sheaf_at[1]
            dist = math.hypot(dx, dy)
            k = 0.28
            lean = (-dy / dist * k, dx / dist * k)
        sheaf(b, (sheaf_at[0], sheaf_at[1], z0 + 0.02), 0.78, lean=lean, seed=seed)


def build_idol(part, scale=1.0, stages=False, c=(0.0, 0.0), z_base=0.0, ground=True, seed=0):
    """Modla na návsi (scale 1) i ve svatyni (z_base = výška plochy). Díly podle fází stavby:
    stakes, ground, log, struts, post, stones, chips, hewn, carved, idol, ribbon, offerings."""
    if ground:
        idol_ground(part("ground"), c)
    floor = z_base + (IDOL_GROUND_TOP if ground else 0.0)  # povrch udusaného kruhu
    packing_stones(part("stones"), c, scale, floor, seed=40 + seed)
    idol_column(part("idol"), c, scale, 1.0, z_base)
    idol_cap(part("idol"), c, scale, z_base=z_base)
    # stužka uvázaná kolem kůlu pod opaskem, dva volné konce vpředu vpravo
    rz = z_base + 1.12 * scale
    rb = part("ribbon")
    C.lathe(rb, c, [(IDOL_R * 0.99 * scale + 0.012, rz - 0.035), (IDOL_R * 0.99 * scale + 0.016, rz), (IDOL_R * 0.99 * scale + 0.012, rz + 0.035)], "cloth_red", seg=20, smooth=False)
    ka = math.radians(35)
    knot = (c[0] + (IDOL_R * scale + 0.02) * math.sin(ka), c[1] - (IDOL_R * scale + 0.02) * math.cos(ka), rz)
    ribbon(rb, knot, 0.42 * scale, seed + 3, "cloth_red", sway=(0.05, -0.06))
    ribbon(rb, (knot[0] + 0.03, knot[1] - 0.01, rz), 0.34 * scale, seed + 4, "cloth_red", sway=(0.09, -0.03))
    front = (c[0], c[1] - 0.75 * scale)
    sheaf_at = (c[0] - 0.36 * scale, c[1] - 0.5 * scale)
    offerings(part("offerings"), front, spread=scale ** 0.5, seed=100 + seed, sheaf_at=sheaf_at, lean_to=c, z0=floor)
    if not stages:
        return
    if ground:
        pts = [(c[0] + 2.0 * math.sin(2 * math.pi * k / 10), c[1] - 2.0 * math.cos(2 * math.pi * k / 10)) for k in range(10)]
        stakes_ring(part("stakes"), pts)
        part("stakes").beam((c[0], c[1], -0.15), (c[0], c[1], 0.6), 0.07)
    lying_log(part("log"), (c[0] + 0.2 * scale, c[1] + 0.25 * scale), 3.2 * scale, (IDOL_R + 0.035) * scale, math.radians(-38), seed=80 + seed, z_base=floor)
    struts(part("struts"), c, scale, z_base, seed=60 + seed)
    bark_post(part("post"), c, scale, z_base, seed=5 + seed)
    chips(part("chips"), c, 0.35 * scale, 1.5 * scale, int(55 * scale), 300 + seed, z=floor + 0.012)
    idol_column(part("hewn"), c, scale, 0.0, z_base)
    idol_cap(part("hewn"), c, scale, block=True, z_base=z_base)
    idol_column(part("carved"), c, scale, 0.5, z_base)
    idol_cap(part("carved"), c, scale, z_base=z_base)


# ------------------------------------------------------------------ svatyně (Peryn)

N_PETALS = L.N_PETALS
SEG_PETAL = 24  # úhlových dílků na výběžek (hroty okvětí ostré, oblouky hladké)
R_PAVE, R_TOP, Z_TOP, R_IN, Z_BOT = L.R_PAVE, L.R_TOP, L.Z_TOP, L.R_IN, L.Z_BOT
R_CUSP, R_TIP, BANK, R_FIRE = L.R_CUSP, L.R_TIP, L.BANK, L.R_FIRE
r_out = L.r_out
GROUND_UV = planar_uv((0.0, 0.0), L.SHRINE_HALF)  # mapa země svatyně (oblast shrine_ground)


def ring_point(a, r, z):
    return Vector((r * math.sin(a), -r * math.cos(a), z))


def radial_strip(b, angles, profile, mat, uv=GROUND_UV):
    """Pás kolem dokola: profile(a) → [(r, z)] od středu ven, výšková plocha lícem nahoru,
    UV z uv(x, y) – malovaná mapa země promítaná shora."""
    profs = [profile(a) for a in angles]
    with b.smooth_mode("soft"):  # hladká zem – měkké normály, sdílené vrcholy
        for i in range(len(angles) - 1):
            p0, p1 = profs[i], profs[i + 1]
            for k in range(len(p0) - 1):
                q = [ring_point(angles[i], *p0[k]), ring_point(angles[i + 1], *p1[k]), ring_point(angles[i + 1], *p1[k + 1]), ring_point(angles[i], *p0[k + 1])]
                b.poly(q, mat, out=(0, 0, 1), uvm=[uv(p.x, p.y) for p in q])


def ditch_profile(a):
    """Dno a vnější stěna příkopu s valem ve směru a (od vnitřního okraje dna ven)."""
    ro = r_out(a)
    pts = [(R_IN, Z_BOT), ((R_IN + ro) / 2, Z_BOT - 0.005), (ro, Z_BOT)]
    pts += [(ro + dr, z) for dr, z in BANK[1:]]
    return pts


def build_ditch(part, petal):
    """Výběžek příkopu k (0–7): dno, vnější stěna a val od hrotu k hrotu okvětí."""
    step = 2 * math.pi / (N_PETALS * SEG_PETAL)
    angles = [(petal * SEG_PETAL + i) * step for i in range(SEG_PETAL + 1)]
    radial_strip(part(f"ditch-{petal + 1}"), angles, ditch_profile, "shrine_ground")


def platform_profile(z_top, lumpy):
    radii = (R_PAVE - 0.05, 3.0, 4.5, 6.0, 7.5, 9.0, R_TOP) if lumpy else (R_PAVE - 0.05, 4.0, 7.0, R_TOP)

    def prof(a):
        pts = []
        for r in radii:
            p = ring_point(a, r, 0)
            # hroudy navážky – u středu (napojení na střed plochy) a u okraje hladší
            lump = sstep(R_PAVE, 3.5, r) * sstep(R_TOP, R_TOP - 1.0, r)
            z = z_top + (0.07 * D.noise(p.x * 0.9, p.y * 0.9) / 0.095 * lump if lumpy else 0.0)
            pts.append((r, z))
        pts += [(R_TOP + 0.14, z_top - 0.05), (R_IN, Z_BOT)]
        return pts

    return prof


def build_platform(b, z_top, rough=False):
    """Vyvýšená plocha s vnitřní stěnou příkopu. Hotová: malovaná mapa země (udusaná hlína,
    cesty k ohništím, tmavá stěna příkopu); hrubá navážka: nižší a hrbolatá, z vykopané hlíny
    (oblast heap, méně úhlových dílků – je jen na staveništi)."""
    n = N_PETALS * SEG_PETAL // (3 if rough else 1)
    angles = [2 * math.pi * i / n for i in range(n + 1)]
    prof = platform_profile(z_top, rough)
    if rough:
        heap_uv = planar_uv((0.0, 0.0), R_IN)
        radial_strip(b, angles, prof, "heap", uv=heap_uv)
        polar_surface(b, (0, 0), [(R_PAVE - 0.05, z_top), (0.0, z_top + 0.03)], "heap", heap_uv, seg=n)
    else:
        radial_strip(b, angles, prof, "shrine_ground")
        # střed plochy pod dlažbou (dokud dlažba nestojí, je vidět)
        polar_surface(b, (0, 0), [(R_PAVE - 0.05, z_top), (0.0, z_top + 0.01)], "shrine_ground", GROUND_UV, seg=n)


def build_paving(b, seed=500):
    """Kruhová kamenná dlažba kolem modly, po obvodu větší kameny."""
    C.lathe(b, (0, 0), [(R_PAVE, Z_TOP - 0.02), (R_PAVE - 0.12, Z_TOP + 0.06), (0.0, Z_TOP + 0.075)], "stone", seg=32, u_total=seam_u(R_PAVE), v_mirror=0.75)
    for i in range(26):
        a = 2 * math.pi * (i + 0.3 * seeded(seed + i)) / 26
        s = 0.13 + 0.05 * seeded(seed + 30 + i)
        rock(b, (R_PAVE * math.sin(a), -R_PAVE * math.cos(a)), s * 1.25, s, s * 0.7, seed + i, yaw=a, z0=Z_TOP - 0.05)


def build_fire(b, k, seed=700):
    """Ohniště ve výběžku k (0–7) na dně příkopu: popel a saze (oblast ash), kruh kamenů,
    ohořelá polena křížem a žhavé uhlíky uprostřed."""
    a = math.pi / N_PETALS + k * 2 * math.pi / N_PETALS
    c = ring_point(a, R_FIRE, Z_BOT)
    cx, cy = c.x, c.y
    C.disc(b, (cx, cy), 0.78, Z_BOT + 0.006, "ash", seg=14)
    for i in range(10):
        t = 2 * math.pi * (i + 0.3 * seeded(seed + k * 20 + i)) / 10
        s = 0.11 + 0.05 * seeded(seed + k * 20 + 10 + i)
        rock(b, (cx + 0.6 * math.cos(t), cy + 0.6 * math.sin(t)), s * 1.2, s, s * 0.85, seed + k * 20 + i, yaw=t, z0=Z_BOT - 0.03)
    for i in range(4):
        t = a + i * math.pi / 4 + 0.3 * seeded(seed + k * 7 + i)
        dx, dy = 0.42 * math.cos(t), 0.42 * math.sin(t)
        r = 0.05 + 0.02 * seeded(seed + k * 9 + i)
        z0, z1 = Z_BOT + r + 0.01 + 0.05 * (i % 2), Z_BOT + r + 0.01 + 0.05 * ((i + 1) % 2)
        round_log(b, (cx - dx, cy - dy, z0), (cx + dx, cy + dy, z1), r, seed + k * 11 + i, n=6, mat="charred", end="charcoal")
    C.lathe(b, (cx, cy), [(0.26, Z_BOT + 0.005), (0.18, Z_BOT + 0.05), (0.0, Z_BOT + 0.07)], "embers", seg=10)
    return c


def build_shrine(part, stages=False):
    """Svatyně: plocha, příkop po výběžcích, ohniště, dlažba a modla s obětinami."""
    build_platform(part("platform-2"), Z_TOP)
    for k in range(N_PETALS):
        build_ditch(part, k)
    fires = [build_fire(part(f"fire-{k + 1}"), k) for k in range(N_PETALS)]
    build_paving(part("paving"))
    # modla stojí na dlažbě – stejné díly jako modla na návsi, jen bez udusaného kruhu
    build_idol(part, IDOL_SHRINE_SCALE, stages, z_base=Z_TOP + 0.06, ground=False, seed=7)
    if stages:
        build_platform(part("platform-1"), 0.27, rough=True)
        stakes = part("stakes")
        circle = [(R_IN * math.sin(2 * math.pi * k / 16), -R_IN * math.cos(2 * math.pi * k / 16)) for k in range(16)]
        stakes_ring(stakes, circle)
        for k in range(N_PETALS):  # okvětí: od hrotu k vrcholu výběžku a k dalšímu hrotu
            a0, a1 = k * 2 * math.pi / N_PETALS, (k + 1) * 2 * math.pi / N_PETALS
            am = (a0 + a1) / 2
            pts = [(r * math.sin(a), -r * math.cos(a)) for a, r in ((a0, R_CUSP), (am, R_TIP), (a1, R_CUSP))]
            stakes_ring(stakes, pts, closed=False)
        stakes.beam((0, 0, -0.15), (0, 0, 0.7), 0.08)
        stakes.beam((0, 0, 0.5), (0, -R_IN, 0.36), 0.024, mat="rope")  # provaz od středu (kružidlo)
    return fires


# ------------------------------------------------------------------ obětiny u dubu a háj


def build_oak_offerings(b, seed=900):
    """Obětiny u paty velkého dubu: kruh kamenů kolem kořenových náběhů, pahýl větve se
    stužkami (míří dopředu −Y, kousek doprava) a miska se zrnem vpředu."""
    for i in range(15):
        a = 2 * math.pi * (i + 0.4 * seeded(seed + i)) / 15
        d = 1.62 + 0.18 * seeded(seed + 20 + i)
        s = 0.12 + 0.08 * seeded(seed + 40 + i)
        rock(b, (d * math.sin(a), -d * math.cos(a)), s * 1.25, s, s * 0.8, seed + i, yaw=a)
    a0 = Vector((0.22, -0.28, 2.22))
    a1 = Vector((1.22, -1.12, 2.58))
    round_log(b, a0, a1, 0.1, seed + 60, n=8, r_end=0.065)
    colours = ["cloth_red", "cloth_white", "cloth_red", "cloth_ochre", "cloth_white", "cloth_red", "cloth_ochre"]
    for i, mat in enumerate(colours):
        t = 0.55 + 0.065 * i
        p = a0.lerp(a1, t)
        r = 0.1 + (0.065 - 0.1) * t
        C.lathe(b, (p.x, p.y), [(r + 0.008, p.z - 0.035), (r + 0.013, p.z), (r + 0.008, p.z + 0.035)], mat, seg=8, smooth=False)
        ribbon(b, (p.x + 0.01, p.y, p.z - r), 0.6 + 0.3 * seeded(seed + 70 + i), seed + 80 + i, mat, width=0.06, sway=(0.05 * (i % 3 - 1), 0.06))
    bowl(b, (0.25, -1.3), 0.12, 0.02, seed=seed + 90)
    bowl(b, (-0.3, -1.32), 0.1, 0.02, grain=False, seed=seed + 91)


def build_grove_stones(part, seed=950):
    """Kameny háje: vysoký hraniční kámen, nízký balvan a plochý oltář na třech kamenech
    s miskou a hromádkou popela a uhlíků."""
    rock(part("stone-a"), (0, 0), 0.36, 0.22, 1.3, seed, yaw=0.3, z0=-0.15, prof=PILLAR, seg=9)
    rock(part("stone-b"), (0, 0), 0.44, 0.34, 0.52, seed + 1, yaw=-0.4, z0=-0.1, seg=9)
    alt = part("altar")
    for i, (x, y) in enumerate(((-0.5, -0.2), (0.5, -0.25), (0.05, 0.3))):
        rock(alt, (x, y), 0.24, 0.2, 0.42, seed + 10 + i, yaw=i, z0=-0.08)
    rock(alt, (0, 0), 0.78, 0.52, 0.2, seed + 20, yaw=0.08, z0=0.3, prof=SLAB, seg=10)
    bowl(alt, (-0.22, -0.08), 0.12, 0.5, seed=seed + 30)
    C.lathe(alt, (0.28, 0.06), [(0.2, 0.5), (0.12, 0.54), (0.0, 0.56)], "charcoal", seg=10)
    C.disc(alt, (0.28, 0.06), 0.1, 0.56, "ash", seg=10)


# ------------------------------------------------------------------ výstup


def half_atlas_material():
    """Atlas zmenšený na polovinu pro drobné dekorace (obětiny u dubu, kameny háje)."""
    img = bpy.data.images.load(os.path.join(SACRED_ATLAS, "atlas.jpg"))
    img.scale(img.size[0] // 2, img.size[1] // 2)
    tmp = os.path.join(tempfile.mkdtemp(prefix="sacred-atlas-"), "atlas-half.jpg")
    img.filepath_raw = tmp
    img.file_format = "JPEG"
    img.save()
    bpy.data.images.remove(img)
    mat = bpy.data.materials.new("sacred-atlas-half")
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(tmp)
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def weld(obj):
    """Svaří vrcholy na stejném místě (Builder dává každé ploše vlastní) – UV a normály zůstanou
    na rozích ploch, exportér pak sdílí vrcholy hladkých ploch a GLB je skoro o polovinu menší."""
    me = obj.data
    # vlastní normály jsou uložené vůči prostorům normál, které se svařením změní – podržet je
    # jako obyčejný atribut rohů a po svaření nastavit znovu
    keep = me.attributes.new("weld_normal", "FLOAT_VECTOR", "CORNER")
    keep.data.foreach_set("vector", [c for cn in me.corner_normals for c in cn.vector])
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    keep = me.attributes["weld_normal"]
    normals = [tuple(d.vector) for d in keep.data]
    me.attributes.remove(keep)
    me.normals_split_custom_set(normals)
    return obj


def stat(obj):
    d = obj.dimensions
    print(f"STAT {obj.name}: {D.tri_count(obj)} tris, {len(obj.data.materials)} mat, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")


FINISHED_IDOL = ("ground", "stones", "idol", "ribbon", "offerings")
FINISHED_SHRINE = (
    "platform-2",
    *(f"ditch-{k + 1}" for k in range(N_PETALS)),
    *(f"fire-{k + 1}" for k in range(N_PETALS)),
    "paving",
    "stones",
    "idol",
    "ribbon",
    "offerings",
)


def build_finished(parts, keys, mat, name):
    objs = [parts.builders[k].build(mat) for k in keys if k in parts.builders]
    return weld(C.join(objs, name))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # staveniště: díly po fázích (village-construction.ts – druhy „modla“ a „svatyne“)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = C.material("sacred-atlas", "atlas.jpg")
    ip = Parts("modla")
    build_idol(ip, stages=True)
    idol_parts = [weld(o) for o in ip.build(mat)]
    C.export_parts(idol_parts, os.path.join(OUT_DIR, "idol-construction.glb"))
    sp = Parts("svatyne")
    build_shrine(sp, stages=True)
    shrine_parts = [weld(o) for o in sp.build(mat)]
    C.export_parts(shrine_parts, os.path.join(OUT_DIR, "shrine-construction.glb"))
    if RENDER_DIR != "-":
        preview_stages(idol_parts, shrine_parts)

    # hotové modely (čistá scéna – jména dílů staveniště se neopakují)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = C.material("sacred-atlas", "atlas.jpg")
    ip = Parts("f-idol")
    build_idol(ip)
    idol = build_finished(ip, FINISHED_IDOL, mat, "idol")
    sp = Parts("f-shrine")
    fires = build_shrine(sp)
    shrine = build_finished(sp, FINISHED_SHRINE, mat, "shrine")
    # ohniště jsou v síti svatyně; prázdné uzly fire-1…8 jen nesou jejich střed (dým, záře).
    # Jedna síť na model: loadMergedModel (instanced-model.ts) spojuje sítě z GLB a u více sítí
    # by Babylon otočil pořadí vrcholů jinak než u jedné – ořezaly by se přední stěny.
    fire_nodes = []
    for k, centre in enumerate(fires):
        node = bpy.data.objects.new(f"fire-{k + 1}", None)
        node.location = centre
        bpy.context.scene.collection.objects.link(node)
        fire_nodes.append(node)
    D.export([idol], os.path.join(OUT_DIR, "idol.glb"))
    stat(idol)
    D.export([shrine] + fire_nodes, os.path.join(OUT_DIR, "shrine.glb"))
    stat(shrine)

    half = half_atlas_material()
    ob = SB("oak-offerings")
    build_oak_offerings(ob)
    oak = weld(ob.build(half))
    D.export([oak], os.path.join(OUT_DIR, "oak-offerings.glb"))
    stat(oak)
    gp = Parts("grove")
    build_grove_stones(gp)
    grove = []
    for key, builder in gp.builders.items():
        obj = weld(builder.build(half))
        obj.name = obj.data.name = key
        grove.append(obj)
    D.export(grove, os.path.join(OUT_DIR, "grove-stones.glb"))
    for obj in grove:
        stat(obj)
    if RENDER_DIR != "-":
        preview_finished(idol, shrine, oak, grove)


# ------------------------------------------------------------------ rozpad (abandonment.md)

# Opuštěná modla a svatyně chátrají (docs/design/abandonment.md – Martin 18. 10. 2026): zšedlé
# dřevo s mechem, rozvalené klínové kameny, zarostlý udusaný kruh, modla zlomená u země leží na
# zemi u shnilého pahýlu; svatyni vyhasnou ohniště a plocha s příkopem zarůstá. Náklon stojící
# modly a zapadání zbytků do trávy dělá scéna (apps/web/lib/scene/structure-decay.ts).
DECAY_TINTS = {
    "decay-weathered": (0.7, 0.71, 0.64),  # zšedlé, ošlehané dřevo
    "decay-moss": (0.46, 0.6, 0.3),  # mech a lišejník (jako došky obydlí – dwellings.py)
    "decay-grass": (0.62, 0.74, 0.44),  # udusaná hlína a dlažba zarostlé trávou
}
IDOL_BREAK = 0.3  # modla se zlomí v prstenci 0,3 m nad zemí (shnilá pata – idol_column zs)


def decay_polys(builders):
    """Plochy Builderů (body, uv atlasu, hladkost) – kopie vrcholů (dwellings._polys)."""
    return [poly for b in builders for poly in D._polys(b)]


def is_mossy(pts, z_base, scale, salt):
    """Mech na modle: u paty (vlhko od země) a na horních plochách čepice, skvrnitě."""
    c = D._center(pts)
    n = D._normal(pts)
    rel = (c.z - z_base) / scale
    blot = D._blot(3.0 * c.x + 1.1 * rel, 3.0 * c.y - 0.7 * rel, salt)
    if rel < 0.55:
        return blot > 0.38 + 0.5 * rel
    return n.z > 0.45 and blot > 0.45


def weathered_idol(src, name, z_base, scale, salt):
    """Zšedlá modla a mech na ní: (dřevo, mech) – Buildery se stejnými plochami jako `src`."""
    wood, moss = SB(name), SB(f"{name}-moss")
    for pts, uv, sm in decay_polys([src]):
        D._put(moss if is_mossy(pts, z_base, scale, salt) else wood, pts, uv, sm)
    return wood, moss


def fallen_idol(src, name, z_base, scale, heading, salt):
    """Modla zlomená v IDOL_BREAK leží na zemi tváří vzhůru ve směru `heading` (úhel od −Y po
    směru +X) – nad zlomem z `src` (dřevo, mech), pod zlomem pahýl se zubem zlomu."""
    wood, moss = SB(name), SB(f"{name}-moss")
    stump = SB(name.replace("-fallen", "-stump"))
    brk = z_base + IDOL_BREAK * scale
    d = Vector((math.sin(heading), -math.cos(heading), 0.0))  # směr pádu
    side = Vector((-d.y, d.x, 0.0))
    rest = IDOL_R * scale * 0.9  # osa ležící modly nad zemí (lehce zapadlá)
    start = d * (IDOL_R * scale * 1.2)  # zlom leží kousek od pahýlu
    for pts, uv, sm in decay_polys([src]):
        c = D._center(pts)
        if c.z < brk:
            D._put(stump, pts, uv, sm)
            continue
        # tvář (−Y modelu) míří nahoru: x → bok, −y → nahoru, výška nad zlomem → podél pádu
        moved = [start + d * (p.z - brk) + side * p.x + Vector((0, 0, rest - p.y)) for p in pts]
        # mech ve skvrnách po celé modle, souvisle na spodní straně u země
        mossy = D._blot(2.2 * c.x + 0.8 * c.z, 2.2 * c.y, salt + 3) > 0.56 or c.y > 0.1 * scale
        D._put(moss if mossy else wood, moved, uv, sm)
    # zub zlomu na pahýlu: nízký nepravidelný jehlan shnilého dřeva nad prstencem zlomu
    r = IDOL_R * scale
    n = 9
    ring = [Vector((r * 0.98 * math.cos(2 * math.pi * k / n), r * 0.98 * math.sin(2 * math.pi * k / n), brk)) for k in range(n)]
    for k in range(n):
        a, b = ring[k], ring[(k + 1) % n]
        tip = Vector((0.25 * r * math.cos(2.1 * k), 0.25 * r * math.sin(2.1 * k), brk + (0.06 + 0.1 * D._rand(k, salt)) * scale))
        uv = [
            (0.111 + 0.05 * math.cos(2 * math.pi * k / n), 0.05 * math.sin(2 * math.pi * k / n)),
            (0.111 + 0.05 * math.cos(2 * math.pi * (k + 1) / n), 0.05 * math.sin(2 * math.pi * (k + 1) / n)),
            (0.111, 0.0),
        ]
        stump.poly([a, b, tip], "logends", out=(a + b) / 2 - Vector((0, 0, brk - 0.3)), uvm=uv)
    return wood, moss, stump


def scattered_stones(b, c, scale=1.0, z_base=0.0, count=8, seed=40):
    """Klínové kameny vyvalené od shnilé paty – dál od kůlu, nakřivo, napůl v zemi."""
    for i in range(count):
        a = 2 * math.pi * (i + 0.6 * seeded(seed + i)) / count
        d = (0.55 + 0.6 * seeded(seed + 20 + i)) * scale
        s = (0.09 + 0.06 * seeded(seed + 40 + i)) * scale
        z0 = z_base - 0.04 - 0.05 * seeded(seed + 60 + i)
        rock(b, (c[0] + d * math.sin(a), c[1] - d * math.cos(a)), s * 1.2, s, s * 0.8, seed + i, yaw=a + 1.3, z0=z0)


def build_fire_cold(b, k, seed=700):
    """Vyhaslé ohniště ve výběžku k: popel, kruh kamenů (pár vyvalených), ohořelá polena
    sesunutá na zem – bez žhavých uhlíků."""
    a = math.pi / N_PETALS + k * 2 * math.pi / N_PETALS
    c = ring_point(a, R_FIRE, Z_BOT)
    cx, cy = c.x, c.y
    C.disc(b, (cx, cy), 0.7, Z_BOT + 0.006, "ash", seg=14)
    for i in range(10):
        t = 2 * math.pi * (i + 0.3 * seeded(seed + k * 20 + i)) / 10
        s = 0.11 + 0.05 * seeded(seed + k * 20 + 10 + i)
        out = 0.6 + (0.35 if seeded(seed + k * 20 + 30 + i) > 0.7 else 0.0)
        rock(b, (cx + out * math.cos(t), cy + out * math.sin(t)), s * 1.2, s, s * 0.85, seed + k * 20 + i, yaw=t, z0=Z_BOT - 0.05)
    for i in range(3):
        t = a + i * 1.1 + 0.4 * seeded(seed + k * 7 + i)
        dx, dy = 0.36 * math.cos(t), 0.36 * math.sin(t)
        r = 0.045 + 0.015 * seeded(seed + k * 9 + i)
        z = Z_BOT + r * 0.8
        round_log(b, (cx - dx, cy - dy, z), (cx + dx, cy + dy, z), r, seed + k * 11 + i, n=6, mat="charred", end="charcoal")


def decay_main():
    """Jen díly rozpadu modly a svatyně → sacred-decay.glb (ostatní GLB zůstanou beze změny)."""
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = C.material("sacred-atlas", "atlas.jpg")
    mats = {name: D.tinted_material(mat, name, tint) for name, tint in DECAY_TINTS.items()}
    objs = []

    def out(builder, material):
        if builder.faces:
            objs.append(weld(builder.build(material)))

    # modla na návsi
    ip = Parts("src-idol")
    build_idol(ip)
    wood, moss = weathered_idol(ip.builders["idol"], "idol-weathered", 0.0, 1.0, 5)
    out(wood, mats["decay-weathered"])
    out(moss, mats["decay-moss"])
    ground = SB("idol-ground-overgrown")
    for pts, uv, sm in decay_polys([ip.builders["ground"]]):
        D._put(ground, pts, uv, sm)
    out(ground, mats["decay-grass"])
    stones = SB("idol-stones-scattered")
    scattered_stones(stones, (0.0, 0.0), 1.0, IDOL_GROUND_TOP, seed=41)
    out(stones, mat)
    fwood, fmoss, stump = fallen_idol(ip.builders["idol"], "idol-fallen", 0.0, 1.0, math.radians(205), 9)
    out(fwood, mats["decay-weathered"])
    out(fmoss, mats["decay-moss"])
    out(stump, mats["decay-weathered"])

    # svatyně: modla ×1,55 na dlažbě, ohniště, plocha s příkopem
    sp = Parts("src-shrine")
    build_shrine(sp)
    z_base = Z_TOP + 0.06
    wood, moss = weathered_idol(sp.builders["idol"], "shrine-idol-weathered", z_base, IDOL_SHRINE_SCALE, 7)
    out(wood, mats["decay-weathered"])
    out(moss, mats["decay-moss"])
    fwood, fmoss, stump = fallen_idol(sp.builders["idol"], "shrine-idol-fallen", z_base, IDOL_SHRINE_SCALE, math.radians(140), 13)
    out(fwood, mats["decay-weathered"])
    out(fmoss, mats["decay-moss"])
    out(stump, mats["decay-weathered"])
    fires = SB("shrine-fires-cold")
    for k in range(N_PETALS):
        build_fire_cold(fires, k)
    out(fires, mat)
    # plocha a příkop s valem zarostlé (scéna jim dá trávu terénu po světových souřadnicích –
    # sacred-renderer.ts; tady jen zelenější mapa země), dlažba zarostlá mechem a trávou
    grown = SB("shrine-ground-overgrown")
    keys = ["platform-2"] + [f"ditch-{k + 1}" for k in range(N_PETALS)]
    for pts, uv, sm in decay_polys([sp.builders[k] for k in keys]):
        D._put(grown, pts, uv, sm)
    out(grown, mats["decay-grass"])
    paving = SB("shrine-paving-overgrown")
    for pts, uv, sm in decay_polys([sp.builders["paving"]]):
        D._put(paving, pts, uv, sm)
    out(paving, mats["decay-grass"])

    C.export_parts(objs, os.path.join(OUT_DIR, "sacred-decay.glb"))
    if RENDER_DIR != "-":
        preview_decay(objs)


def preview_decay(objs):
    """Náhledy rozpadu: modla zšedlá a padlá, svatyně s vyhaslými ohništi a zarostlá."""
    setup_preview()
    by = {o.name: o for o in objs}
    show([by[k] for k in ("idol-ground-overgrown", "idol-stones-scattered", "idol-weathered", "idol-weathered-moss")], "idol_decay_weathered", (2.6, -7.5, 4.2), (0, 0, 1.0), lens=35)
    show([by[k] for k in ("idol-ground-overgrown", "idol-stones-scattered", "idol-fallen", "idol-fallen-moss", "idol-stump")], "idol_decay_fallen", game_cam((0, 0, 0.3), 14), (0, 0, 0.3), lens=40)
    show([by[k] for k in ("shrine-ground-overgrown", "shrine-paving-overgrown", "shrine-fires-cold", "shrine-idol-weathered", "shrine-idol-weathered-moss")], "shrine_decay_weathered", game_cam((0, 0, 0), 52), (0, 0, 0), lens=38)
    show([by[k] for k in ("shrine-ground-overgrown", "shrine-paving-overgrown", "shrine-idol-fallen", "shrine-idol-fallen-moss", "shrine-idol-stump")], "shrine_decay_fallen", (6.0, -13.0, 6.5), (0, 0, 0.8), lens=35)


# ------------------------------------------------------------------ náhledy (jen pro kontrolu)

# Herní kamera: ≈ 49° od svislice (BETA v apps/web/lib/scene/camera.ts)
GAME_TILT = 0.85


def game_cam(target, dist, yaw=0.0):
    tx, ty, tz = target
    return (tx + dist * math.sin(GAME_TILT) * math.sin(yaw), ty - dist * math.sin(GAME_TILT) * math.cos(yaw), tz + dist * math.cos(GAME_TILT))


def setup_preview():
    D.setup_world(os.path.join(TERRAIN, "grass.jpg"))
    scene = bpy.context.scene
    scene.cycles.samples = 32
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    os.makedirs(RENDER_DIR, exist_ok=True)


def show(objs, name, cam, target, lens=40, size=(1000, 700)):
    for o in bpy.data.objects:
        if o.type == "MESH" and not o.name.startswith("ground"):
            o.hide_render = o not in objs
    D.render(objs, os.path.join(RENDER_DIR, f"{name}.png"), cam, target, size=size, lens=lens)


def preview_stages(idol_parts, shrine_parts):
    setup_preview()
    by = {o.name: o for o in idol_parts + shrine_parts}
    idol_steps = [
        ("1-layout", ["stakes"]),
        ("2-log", ["ground", "log"]),
        ("3-raise", ["ground", "post", "struts", "stones"]),
        ("4-hewn", ["ground", "hewn", "stones", "chips"]),
        ("5-carved", ["ground", "carved", "stones", "chips"]),
        ("6-done", ["ground", "idol", "stones", "ribbon", "offerings"]),
    ]
    for name, keys in idol_steps:
        show([by[f"modla-{k}"] for k in keys], f"idol_stage_{name}", (2.6, -7.5, 4.2), (0, 0, 1.0), lens=35)
    shrine_steps = [
        ("1-layout", ["stakes"]),
        ("2-dig", ["stakes", "ditch-1", "ditch-2", "ditch-3"]),
        ("3-platform", [f"ditch-{k + 1}" for k in range(8)] + ["platform-1"]),
        ("4-fires", [f"ditch-{k + 1}" for k in range(8)] + ["platform-2"] + [f"fire-{k + 1}" for k in range(8)]),
        ("5-raise", [f"ditch-{k + 1}" for k in range(8)] + ["platform-2", "post", "struts"] + [f"fire-{k + 1}" for k in range(8)]),
    ]
    for name, keys in shrine_steps:
        show([by[f"svatyne-{k}"] for k in keys], f"shrine_stage_{name}", game_cam((0, 0, 0), 52), (0, 0, 0), lens=38)


def preview_finished(idol, shrine, oak, grove):
    setup_preview()
    show([idol], "idol_game", game_cam((0, 0, 1.0), 14), (0, 0, 1.0), lens=40)
    show([idol], "idol_front", (0.9, -5.2, 2.2), (0, 0, 1.6), lens=40)
    show([idol], "idol_face", (0.25, -2.0, 2.5), (0, 0, 2.3), lens=50)
    show([shrine], "shrine_game", game_cam((0, 0, 0), 52), (0, 0, 0), lens=38)
    show([shrine], "shrine_top", (0, -0.01, 60), (0, 0, 0), lens=35)
    show([shrine], "shrine_fire", (9.0, -13.5, 3.8), (5.2, -11.2, 0.3), lens=35)
    show([shrine], "shrine_idol", (2.4, -9.5, 3.6), (0, 0, 2.2), lens=40)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(TREES, "oak-large-1.glb"))
    tree = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    show([oak] + tree, "oak_offerings", (2.5, -7.5, 3.4), (0.2, -0.6, 1.4), lens=35)
    show([oak] + tree, "oak_game", game_cam((0, 0, 3), 40), (0, 0, 3), lens=40)
    for i, obj in enumerate(grove):
        obj.location = (-2.2 + i * 2.2, 0, 0)
    show(grove, "grove_stones", (0.5, -5.5, 2.4), (0.2, 0, 0.4), lens=40)
    for obj in grove:
        obj.location = (0, 0, 0)


if __name__ == "__main__":
    if DECAY_ONLY:
        decay_main()
    else:
        main()
