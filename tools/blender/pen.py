"""Ohrada pro voly a krávy (raně slovanská ves, 6.–9. st. – docs/design/oxen.md): přístřešek
na sloupech s pultovou doškovou střechou a pletenou zadní stěnou, žlab z vydlabaného kmene,
jesle se senem a branka ze žerdí – díly z atlasu obydlí a řemesel, jeden materiál.

blender -b --factory-startup --python tools/blender/pen.py -- \
    <craft_atlas_dir> <art> apps/web/public/models/pen <render_dir|->

craft_atlas_dir: výstup tools/blender/craft_atlas.py (atlas.jpg + atlas.json – atlas obydlí
rozšířený o řemesla, postup v hlavičce crafts.py). art: <0ad>/binaries/data/mods/public/art –
skript z něj vezme texturu sena (textures/skins/props/wrld_hay_a.dds) a vloží ji do volného
místa atlasu jako oblast „hay“ (x 912–1016, řádky 1819–1923). GLB nesou atlas zmenšený na
polovinu (512 × 1280) – přístřešek je malý a z herní kamery (50–120 m) víc nepotřebuje.
render_dir: náhledy v Cycles, "-" = bez náhledů.

Tvary (Builder, rod, atlas_uv, thatch_roof…) se berou z dwellings.py – došky jsou stejné řady
jako na obydlí, jen pultová střecha (jedna strana sedlové střechy otočená hřebenem dopředu).
Souřadnice Blenderu: Z nahoru, otevřená strana přístřešku v −Y (v glTF a ve scéně při natočení
0 míří do +Z). Ve scéně je bod Blenderu (x, y) v osách (−x, −y). Počátek každého dílu leží na
zemi; kde co v ohradě stojí, počítá scéna (apps/web/lib/scene/pen-layout.ts).

Výstup (apps/web/public/models/pen):
  pen.glb               hotové díly, každý s vlastním počátkem (materiál „pen-atlas“ přístřešek,
                        „pen-atlas-low“ ostatní – stejný obrázek, scéna jim dá méně sněhu):
                        shelter   přístřešek 4,6 × 3,6 m (střecha), sloupy 4 × 3 m – tři vpředu
                                  (2,3 m), tři vzadu (1,0 m), vaznice, krokve, latě, pletená
                                  zadní stěna, došky po řadách, vpředu svázaný okraj; počátek =
                                  střed půdorysu sloupů (rozměry SHELTER_* v pen-layout.ts)
                        hay-rack  jesle 2,2 m – žebřík z žerdí šikmo od zdi, za ním seno, seno
                                  rozházené před nimi; zadní strana (+z ve scéně −z) ke zdi
                        trough    žlab z vydlabaného kmene 2 m na dvou podložkách, s vodou;
                                  délka podél x
                        gate      branka ze tří žerdí přes mezeru 1,6 m v pleteném plotu,
                                  přivázaná houžvemi ke kůlům branky; žerdě podél x
  pen-construction.glb  díly staveniště po fázích (uzly „ohrada-…“): posts, plates,
                        rafters-1…5, laths, wattle-1, wattle-2, thatch-1…9 (zdola od zadního
                        okapu), binding (svázaný přední okraj), rack, hay, trough-log (kmen
                        před vydlabáním), trough, gate a rekvizity timber, rods, straw.
Kdy se který díl ukáže, určuje apps/web/lib/scene/pen-layout.ts (PEN_PHASES); pletený plot je
společný (woven-fence.glb z dwellings.py), seno ve stohu je kupka z fields.py.
"""
import json
import math
import os
import sys
import tempfile

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
CRAFT_ATLAS, ART, OUT_DIR, RENDER_DIR = args[0], args[1], args[2], args[3] if len(args) > 3 else "-"

# oblast sena ve volném místě atlasu řemesel (pod pásy obydlí, vpravo od keramiky)
HAY_REGION = {"x0": 912, "x1": 1016, "r0": 1819, "r1": 1923}


def build_atlas():
    """Atlas řemesel + oblast „hay“ (seno z 0 A.D.) do dočasné složky; vrátí její cestu."""
    out = tempfile.mkdtemp(prefix="bohemia-pen-atlas-")
    meta = json.load(open(os.path.join(CRAFT_ATLAS, "atlas.json")))
    image = bpy.data.images.load(os.path.join(CRAFT_ATLAS, "atlas.jpg"))
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[::-1].copy()  # řádek 0 = nahoře jako v atlas.json
    hay = bpy.data.images.load(os.path.join(ART, "textures/skins/props/wrld_hay_a.dds"))
    hw, hh = hay.size
    hp = np.empty(hw * hh * 4, dtype=np.float32)
    hay.pixels.foreach_get(hp)
    hp = hp.reshape(hh, hw, 4)[::-1, :, :3]
    r = HAY_REGION
    rw, rh = r["x1"] - r["x0"], r["r1"] - r["r0"]
    ys = np.clip(((np.arange(rh) + 0.5) * hh / rh).astype(int), 0, hh - 1)
    xs = np.clip(((np.arange(rw) + 0.5) * hw / rw).astype(int), 0, hw - 1)
    patch = hp[ys][:, xs]
    # seno v 0 A.D. je světle zelenožluté – trochu sušší a tmavší, ať z dálky nesvítí
    lum = patch @ np.array([0.3, 0.59, 0.11], np.float32)
    patch = np.clip((patch * 0.7 + lum[..., None] * 0.3) * np.array([1.0, 0.92, 0.62], np.float32) * 0.92, 0, 1)
    px[r["r0"] : r["r1"], r["x0"] : r["x1"], :3] = patch
    # okraj oblasti: opakované krajní řádky a sloupce proti prolínání mipmap
    for g in range(1, 5):
        px[r["r0"] - g, r["x0"] : r["x1"], :3] = patch[0]
        px[r["r1"] - 1 + g, r["x0"] : r["x1"], :3] = patch[-1]
        px[r["r0"] : r["r1"], r["x0"] - g, :3] = patch[:, 0]
        px[r["r0"] : r["r1"], min(w - 1, r["x1"] - 1 + g), :3] = patch[:, -1]
    image.pixels.foreach_set(px[::-1].ravel())
    image.filepath_raw = os.path.join(out, "atlas.jpg")
    image.file_format = "JPEG"
    image.save()
    meta["regions"]["hay"] = HAY_REGION
    json.dump(meta, open(os.path.join(out, "atlas.json"), "w"), indent=1)
    bpy.data.images.remove(image)
    bpy.data.images.remove(hay)
    return out


bpy.ops.wm.read_factory_settings(use_empty=True)
PEN_ATLAS = build_atlas()
# dwellings.py čte argumenty (atlas, koše, výstup, náhledy) při importu
sys.argv = [sys.argv[0], "--", PEN_ATLAS, "-", OUT_DIR, RENDER_DIR]
sys.dont_write_bytecode = True  # žádné __pycache__ v tools/blender
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dwellings as D  # noqa: E402

from mathutils import Vector  # noqa: E402

# --- rozměry přístřešku (m) – musí sedět se SHELTER_* v apps/web/lib/scene/pen-layout.ts ---
POST_X = 1.9  # krajní sloupy od středu (podél délky)
POST_Y = 1.5  # přední sloupy v −y, zadní v +y
SLOPE = 0.4167  # pultová střecha klesá dozadu (≈ 23°)
TH = 0.25  # tloušťka došků
Y_FRONT = -1.75  # přední (horní) hrana střechy
Y_BACK = 1.85  # zadní okap
HALF_LEN = 2.3  # střecha přečnívá krajní sloupy o 0,4 m
Z_UNDER_FRONT = 2.35  # spodek střechy nad předními sloupy
CS = 1 / math.sqrt(1 + SLOPE * SLOPE)
T_V = TH / CS
X_EAVE = Y_BACK - Y_FRONT  # délka střechy ve vodorovném průmětu
Z_RIDGE = Z_UNDER_FRONT + SLOPE * (-POST_Y - Y_FRONT) + T_V
RAFTERS = 5


def z_under(y):
    """Spodní plocha střechy nad bodem y (od přední hrany dozadu klesá)."""
    return Z_RIDGE - SLOPE * (y - Y_FRONT) - T_V


def copy_side(src, dst):
    """Z dílu sedlové střechy (hřeben podél y v x = 0) vezme jen stranu x < 0 a otočí ji
    hřebenem dopředu: (x, y) → (y, Y_FRONT − x) – vlastní otočení, pořadí vrcholů zůstává."""
    for face, uvs, smooth in zip(src.faces, src.uvs, src.smooth):
        pts = [src.verts[i] for i in face]
        if sum(p.x for p in pts) / len(pts) > -1e-4:
            continue
        base = len(dst.verts)
        dst.verts.extend(Vector((p.y, Y_FRONT - p.x, p.z)) for p in pts)
        dst.faces.append(list(range(base, base + len(pts))))
        dst.uvs.append(uvs)
        dst.smooth.append(smooth)


def lean_to_roof(part):
    """Pultová došková střecha: řady došků (thatch-1 u zadního okapu … thatch-N u přední
    hrany) z dwellings.thatch_roof a svázaný přední okraj (binding)."""
    tmp = D.Parts("tmp")
    D.thatch_roof(tmp, HALF_LEN, Z_RIDGE, SLOPE, X_EAVE, TH, ny=6, kozy=None)
    for key, b in tmp.builders.items():
        if key.startswith("thatch-"):
            copy_side(b, part(key))
    # přední okraj: čela došků (seříznutá sláma) a nad nimi tenký svazek slámy převázaný
    # provázky – drží řady došků u horní hrany; prohýbá se se střechou
    b = part("binding")
    L = HALF_LEN
    ny = 6
    xs = [-L + 2 * L * j / ny for j in range(ny + 1)]

    def sag(x):
        return -0.06 * (1 - (x / L) ** 2)

    z_low = Z_RIDGE - T_V
    for xa, xb in zip(xs, xs[1:]):
        za, zb = Z_RIDGE + sag(xa) + 0.01, Z_RIDGE + sag(xb) + 0.01
        b.poly(
            [(xa, Y_FRONT, z_low), (xb, Y_FRONT, z_low), (xb, Y_FRONT, zb), (xa, Y_FRONT, za)],
            "thatch_edge",
            out=(0, -1, 0),
            uvm=[(xa, 0.02), (xb, 0.02), (xb, 0.02 + zb - z_low), (xa, 0.02 + za - z_low)],
        )
    r, n = 0.09, 6
    yc = Y_FRONT + 0.05
    ring = [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    xr = [-L - 0.03 + (2 * L + 0.06) * j / 12 for j in range(13)]
    for xa, xb in zip(xr, xr[1:]):
        za, zb = Z_RIDGE + sag(xa) + 0.03, Z_RIDGE + sag(xb) + 0.03
        for k in range(n):
            (y0, z0), (y1, z1) = ring[k], ring[(k + 1) % n]
            b.poly(
                [(xa, yc + y0, za + z0), (xb, yc + y0, zb + z0), (xb, yc + y1, zb + z1), (xa, yc + y1, za + z1)],
                "ridge",
                out=(0, (y0 + y1) / 2, (z0 + z1) / 2),
                uvm=[(xa, -0.2 + 0.4 * k / n), (xb, -0.2 + 0.4 * k / n), (xb, -0.2 + 0.4 * (k + 1) / n), (xa, -0.2 + 0.4 * (k + 1) / n)],
            )
    for x, out in ((xr[0], (-1, 0, 0)), (xr[-1], (1, 0, 0))):
        z = Z_RIDGE + sag(x) + 0.03
        b.poly([(x, yc + y, z + zz) for y, zz in ring], "thatch_edge", out=out, uvm=[(y, zz + 0.2) for y, zz in ring])
    # provázky přes svazek (po ≈ 0,9 m) – tmavé pásky
    for x in (-1.8, -0.9, 0.0, 0.9, 1.8):
        z = Z_RIDGE + sag(x) + 0.03
        for k in range(n):
            (y0, z0), (y1, z1) = ring[k], ring[(k + 1) % n]
            s = 1.15
            b.poly(
                [(x - 0.03, yc + y0 * s, z + z0 * s), (x + 0.03, yc + y0 * s, z + z0 * s), (x + 0.03, yc + y1 * s, z + z1 * s), (x - 0.03, yc + y1 * s, z + z1 * s)],
                "beam",
                out=(0, (y0 + y1) / 2, (z0 + z1) / 2),
                uvm=[(0, -0.03), (0.06, -0.03), (0.06, 0.03), (0, 0.03)],
            )


def frame(part):
    """Sloupy s rozsochami, vaznice, krokve a latě."""
    b = part("posts")
    for sx in (-1, 0, 1):
        x = sx * POST_X
        top_f = z_under(-POST_Y) - 0.11 - 0.15
        b.beam((x, -POST_Y, -0.3), (x + 0.01, -POST_Y, top_f + 0.02), 0.16)
        for sgn in (-1, 1):  # rozsocha – vidlice, ve které leží vaznice
            b.beam((x, -POST_Y, top_f - 0.18), (x, -POST_Y + sgn * 0.11, top_f + 0.08), 0.07)
        top_b = z_under(POST_Y) - 0.11 - 0.15
        b.beam((x, POST_Y, -0.3), (x - 0.01, POST_Y, top_b + 0.02), 0.15)
    b = part("plates")
    for y in (-POST_Y, POST_Y):
        z = z_under(y) - 0.11 - 0.075
        b.beam((-POST_X - 0.3, y, z), (POST_X + 0.3, y, z + 0.01), 0.15)
    for i in range(RAFTERS):
        x = -HALF_LEN + 0.2 + i * (2 * HALF_LEN - 0.4) / (RAFTERS - 1)
        b = part(f"rafters-{i + 1}")
        y0, y1 = Y_BACK - 0.05, Y_FRONT + 0.06
        b.beam((x, y0, z_under(y0) - 0.06), (x, y1, z_under(y1) - 0.06), 0.1)
    b = part("laths")
    y = Y_BACK - 0.2
    while y > Y_FRONT + 0.1:
        b.beam((-HALF_LEN + 0.05, y, z_under(y) - 0.03), (HALF_LEN - 0.05, y, z_under(y) - 0.03), 0.05)
        y -= 0.42


def back_wall(part):
    """Pletená zadní stěna za zadními sloupy (z obou stran) – dva pásy výpletu zdola."""
    y = POST_Y + 0.1
    z_top = z_under(POST_Y) - 0.11 - 0.15
    cuts = [(-0.03, 0.62), (0.62, z_top)]
    for k, (z0, z1) in enumerate(cuts):
        b = part(f"wattle-{k + 1}")
        x0, x1 = -POST_X - 0.15, POST_X + 0.15
        pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
        uv = [(p[0], p[2] - z0 + 0.05) for p in pts]
        # líc a rub o centimetr od sebe (výplet má tloušťku)
        b.poly([(p[0], p[1] + 0.012, p[2]) for p in pts], "wattle", out=(0, 1, 0), uvm=uv)
        b.poly([(p[0], p[1] - 0.012, p[2]) for p in pts], "wattle", out=(0, -1, 0), uvm=uv)
        # horní hrana výpletu (vidět shora mezi zdí a střechou)
        if k == len(cuts) - 1:
            b.box(x0, x1, y - 0.03, y + 0.03, z1 - 0.02, z1 + 0.02, "beam")
        # kůly výpletu po stranách
        for x in (x0 + 0.02, x1 - 0.02):
            b.beam((x, y, z0 - 0.1), (x, y, z1 + 0.05), 0.06)


def build_shelter(part):
    frame(part)
    back_wall(part)
    lean_to_roof(part)


# ------------------------------------------------------------------ jesle se senem


def hay_offset(i, j):
    """Posun výřezu sena pro buňku sítě (0–0,5) – každá buňka jiný kus, ať se neopakuje."""
    return (0.5 * D._rand(i * 7 + j, 21), 0.5 * D._rand(i * 3 + j * 11, 22))


def hay_surface(b, x0, x1, y0, y1, height, step=0.25, out=(0, 0, 1)):
    """Hrbolatá plocha sena nad obdélníkem: height(x, y) → z; buňky sítě po `step`."""
    nx = max(1, round((x1 - x0) / step))
    ny = max(1, round((y1 - y0) / step))
    for i in range(nx):
        for j in range(ny):
            xa, xb = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx
            ya, yb = y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny
            pts = [(xa, ya, height(xa, ya)), (xb, ya, height(xb, ya)), (xb, yb, height(xb, yb)), (xa, yb, height(xa, yb))]
            du, dv = hay_offset(i, j)
            # dlaždice sena 0,5 m (buňka nejvýš 0,5 m – výřez zůstane uvnitř oblasti)
            b.poly(pts, "hay", out=out, uvm=[(du + (p[0] - xa) / 1.0, dv + (p[1] - ya) / 1.0) for p in pts])


RACK_LEN = 1.1  # půldélka jeslí


def build_rack(rack, hay):
    """Jesle: dvě kozy na koncích, spodní žerď u zdi, horní žerď šikmo vpředu a mezi nimi
    příčky; za nimi seno (klín ke zdi), před nimi seno rozházené po zemi."""
    bot = (0.22, 0.4)  # (y, z) spodní žerdi
    top = (-0.34, 1.2)  # (y, z) horní žerdi
    for sx in (-1, 1):
        x = sx * (RACK_LEN - 0.02)
        rack.beam((x, 0.3, -0.15), (x, 0.3, 1.18), 0.09)  # zadní noha u zdi
        rack.beam((x, -0.12, -0.15), (x, bot[0] - 0.02, bot[1] + 0.05), 0.08)  # přední vzpěra
        rack.beam((x, 0.3, 1.0), (x, top[0], top[1]), 0.07)  # rameno k horní žerdi
    rack.beam((-RACK_LEN - 0.12, bot[0], bot[1]), (RACK_LEN + 0.12, bot[0], bot[1]), 0.09)
    rack.beam((-RACK_LEN - 0.1, top[0], top[1]), (RACK_LEN + 0.1, top[0], top[1]), 0.08)
    rack.beam((-RACK_LEN - 0.1, 0.3, 1.12), (RACK_LEN + 0.1, 0.3, 1.12), 0.07)
    n = 13
    for k in range(n):
        x = -RACK_LEN + 0.12 + k * (2 * RACK_LEN - 0.24) / (n - 1)
        D.rod(rack, [(x, bot[0] - 0.02, bot[1]), (x, top[0] + 0.01, top[1])], 0.04, salt=k)

    # seno: klín mezi příčkami a zdí, nahoře hrbolatá kupa
    def lean_y(z):
        t = (z - bot[1]) / (top[1] - bot[1])
        return bot[0] + (top[0] - bot[0]) * t + 0.05

    def top_z(x, y):
        return 1.2 + 0.1 * math.cos(1.7 * x + 0.6) * math.cos(4.0 * y) + 0.06 * math.sin(5.3 * x)

    X = RACK_LEN - 0.08
    hay_surface(hay, -X, X, top[0] + 0.05, 0.3, top_z, step=0.25)
    # přední plocha (za příčkami) – po pásech od spodní žerdi nahoru
    zs = [bot[1] + (top[1] + 0.04 - bot[1]) * k / 4 for k in range(5)]
    nx = 8
    for i in range(nx):
        xa, xb = -X + 2 * X * i / nx, -X + 2 * X * (i + 1) / nx
        for za, zb in zip(zs, zs[1:]):
            pts = [(xa, lean_y(za), za), (xb, lean_y(za), za), (xb, lean_y(zb), zb), (xa, lean_y(zb), zb)]
            du, dv = hay_offset(i, round(za * 10))
            hay.poly(pts, "hay", out=(0, -1, 0.6), uvm=[(du + p[0] - xa, dv + p[2] - za) for p in pts])
    # boky klínu
    for sx in (-1, 1):
        x = sx * X
        prof = [(lean_y(z), z) for z in zs] + [(0.3, top_z(x, 0.3)), (0.3, bot[1])]
        hay.poly([(x, y, z) for y, z in prof], "hay", out=(sx, 0, 0), uvm=[((y + 0.35) / 0.7, (z - bot[1]) / 0.9) for y, z in prof])
    # seno rozházené před jeslemi: nízký nepravidelný chomáč (vějíř trojúhelníků)
    n = 14
    cx, cy = 0.1, -0.5
    rim = []
    for k in range(n):
        a = 2 * math.pi * k / n
        rr = 0.42 + 0.14 * math.sin(3 * a + 0.7) + 0.08 * math.sin(5 * a)
        rim.append((cx + 1.7 * rr * math.cos(a), cy + 0.75 * rr * math.sin(a), 0.01))
    peak = (cx, cy, 0.07)
    for k in range(n):
        a, c = rim[k], rim[(k + 1) % n]
        hay.poly([a, c, peak], "hay", out=(0, 0, 1), uvm=[(0.5 + (p[0] - cx) * 0.6, 0.5 + (p[1] - cy) * 0.6) for p in (a, c, peak)])


# ------------------------------------------------------------------ žlab


TROUGH_LEN = 1.0  # půldélka
TROUGH_R = 0.27
TROUGH_IN = 0.2
TROUGH_ZC = 0.42  # osa kmene (vršek žlabu)


def build_trough(b, hollow=True):
    """Žlab z vydlabaného kmene na dvou příčných podložkách. hollow=False: celý kmen před
    vydlabáním (staveniště)."""
    n = 10
    zc, r, ri, L = TROUGH_ZC, TROUGH_R, TROUGH_IN, TROUGH_LEN
    # podložky
    for x in (-0.62, 0.62):
        b.beam((x, -0.38, 0.08), (x + 0.02, 0.38, 0.08), 0.15)
    angles = [math.pi + math.pi * k / n for k in range(n + 1)]  # spodní půlkruh
    if not hollow:
        angles = [2 * math.pi * k / (2 * n) for k in range(2 * n + 1)]
    ring = [(r * math.cos(a), zc + r * math.sin(a)) for a in angles]
    for k in range(len(ring) - 1):
        (y0, z0), (y1, z1) = ring[k], ring[k + 1]
        ya, za = (y0 + y1) / 2, (z0 + z1) / 2 - zc
        b.poly(
            [(-L, y0, z0), (L, y0, z0), (L, y1, z1), (-L, y1, z1)],
            "beam",
            out=(0, ya, za),
            uvm=[(-L, -0.18 + 0.36 * k / (len(ring) - 1)), (L, -0.18 + 0.36 * k / (len(ring) - 1)), (L, -0.18 + 0.36 * (k + 1) / (len(ring) - 1)), (-L, -0.18 + 0.36 * (k + 1) / (len(ring) - 1))],
        )
    if not hollow:
        for x, out in ((-L, (-1, 0, 0)), (L, (1, 0, 0))):
            b.poly([(x, y, z) for y, z in ring[:-1]], "logends", out=out, uvm=[(y, z - zc) for y, z in ring[:-1]])
        return
    inner = [(ri * math.cos(a), zc + ri * math.sin(a)) for a in angles]
    Li = L - 0.1
    for k in range(len(inner) - 1):
        (y0, z0), (y1, z1) = inner[k], inner[k + 1]
        b.poly(
            [(-Li, y0, z0), (Li, y0, z0), (Li, y1, z1), (-Li, y1, z1)],
            "beam",
            out=(0, -(y0 + y1) / 2, zc - (z0 + z1) / 2),
            uvm=[(-Li + 0.7, -0.15 + 0.3 * k / n), (Li + 0.7, -0.15 + 0.3 * k / n), (Li + 0.7, -0.15 + 0.3 * (k + 1) / n), (-Li + 0.7, -0.15 + 0.3 * (k + 1) / n)],
        )
    # okraje (rovný řez kmene) a čela: plný půlkruh na koncích, uvnitř stěna dlabu
    for sgn in (-1, 1):
        b.poly(
            [(-L, sgn * ri, zc), (L, sgn * ri, zc), (L, sgn * r, zc), (-L, sgn * r, zc)],
            "logs_rot",
            out=(0, 0, 1),
            uvm=[(0.0, -L), (0.0, L), (0.07, L), (0.07, -L)],
        )
    for x, out, xi in ((-L, (-1, 0, 0), -Li), (L, (1, 0, 0), Li)):
        b.poly([(x, y, z) for y, z in ring], "logends", out=out, uvm=[(y, z - zc) for y, z in ring])
        b.poly([(x, -r, zc), (x, r, zc), (xi, ri, zc), (xi, -ri, zc)], "logs_rot", out=(0, 0, 1), uvm=[(0, -0.12), (0, 0.12), (0.07, 0.1), (0.07, -0.1)])
        b.poly([(xi, y, z) for y, z in inner], "beam", out=(-out[0], 0, 0), uvm=[(y, z - zc) for y, z in inner])
    # voda
    zw = zc - 0.05
    yw = math.sqrt(ri * ri - 0.05 * 0.05)
    b.poly([(-Li, -yw, zw), (Li, -yw, zw), (Li, yw, zw), (-Li, yw, zw)], "water", out=(0, 0, 1), uvm=[(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)])


# ------------------------------------------------------------------ branka


GATE_HALF = 0.98  # půldélka žerdí (mezera branky 1,6 m – kůly branky v ±0,8)
GATE_RAILS = (0.38, 0.72, 1.06)


def build_gate(b):
    """Tři žerdě přes mezeru branky (konce leží za kůly branky), přivázané houžvemi."""
    for k, z in enumerate(GATE_RAILS):
        y = -0.09 if k % 2 == 0 else -0.07
        D.rod(b, [(-GATE_HALF, y, z + 0.01 * k), (0, y, z - 0.03), (GATE_HALF, y, z - 0.01 * k)], 0.08, salt=31 + k)
    # houžve kolem kůlů branky (svislé pruty od spodní k horní žerdi)
    for x in (-0.86, 0.86):
        D.rod(b, [(x, -0.06, GATE_RAILS[0] - 0.06), (x, -0.06, GATE_RAILS[-1] + 0.07)], 0.035, mat="thatch_edge", salt=7)
        for z in GATE_RAILS:
            D.rod(b, [(x - 0.06, -0.12, z), (x + 0.06, -0.12, z)], 0.04, mat="thatch_edge", salt=11)


# ------------------------------------------------------------------ rekvizity staveniště


def build_props(part):
    """Hráň žerdí a kůlů, svazky prutů na výplet a snopy slámy na došky."""
    b = part("timber")
    for row, count in enumerate((4, 3, 2)):
        for k in range(count):
            x = (k - (count - 1) / 2) * 0.17
            z = 0.08 + row * 0.14
            b.beam((x, -1.5, z), (x + 0.02, 1.5, z), 0.15)
    for x, a in ((-0.5, 0.06), (0.55, -0.05)):
        b.beam((x, -1.7, 0.05), (x + a, 1.7, 0.05), 0.09)
    b = part("rods")
    for y0 in (-0.25, 0.25):
        for k in range(12):
            ang = 2 * math.pi * k / 12
            r = 0.08 + 0.03 * ((k * 7) % 3)
            b.beam((-1.0, y0 + r * math.cos(ang), 0.14 + r * math.sin(ang)), (1.0, y0 + r * 0.8 * math.cos(ang + 0.3), 0.14 + r * math.sin(ang + 0.3)), 0.028)
    b = part("straw")
    for xc, zc in ((-0.38, 0.17), (0.0, 0.17), (0.38, 0.17), (-0.19, 0.48), (0.19, 0.48)):
        n, r, hl = 8, 0.18, 0.55
        ring = [(xc + r * math.cos(2 * math.pi * k / n), zc + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            (x0, z0), (x1, z1) = ring[k], ring[(k + 1) % n]
            pts = [(x0, -hl, z0), (x1, -hl, z1), (x1, hl, z1), (x0, hl, z0)]
            b.poly(pts, "thatch", out=((x0 + x1) / 2 - xc, 0, (z0 + z1) / 2 - zc), uvm=[(k * 0.14, 1.0), ((k + 1) * 0.14, 1.0), ((k + 1) * 0.14, 2.1), (k * 0.14, 2.1)])
        for y, out in ((-hl, (0, -1, 0)), (hl, (0, 1, 0))):
            b.poly([(x, y, z) for x, z in ring], "thatch_edge", out=out, uvm=[(x - xc, 0.25 + (z - zc)) for x, z in ring])


# ------------------------------------------------------------------ hlavní


def preview(objs, path):
    """Náhled hotové ohrady v Cycles: přístřešek, jesle, žlab a branka vedle sebe."""
    terrain = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "textures", "terrain")
    D.setup_world(os.path.join(terrain, "grass.jpg"))
    by = {o.name: o for o in objs}
    by["hay-rack"].location = (-0.6, 1.05, 0)
    by["trough"].location = (3.4, -1.0, 0)
    by["trough"].rotation_euler = (0, 0, math.pi / 2)
    by["gate"].location = (0.5, -5.0, 0)
    D.render(objs, os.path.join(path, "pen_front.png"), (-6.5, -11.0, 6.0), (0.3, -0.8, 1.0))
    D.render(objs, os.path.join(path, "pen_side.png"), (11.0, -3.0, 4.5), (0, -0.5, 1.0), lens=35)
    D.render(objs, os.path.join(path, "pen_game.png"), (0, -16.0, 14.5), (0.4, -1.2, 0.5), size=(1400, 1000))


def main():
    # dva materiály se stejným obrázkem: „pen-atlas“ (přístřešek – v zimě plný sníh na
    # střeše) a „pen-atlas-low“ (jesle a seno pod střechou, žlab, branka, rekvizity – scéna jim
    # dá jen poprašek sněhu: tenké žerdě by jinak zbělely a pod střechu nesněží)
    mat = D.make_material(0.5)
    mat.name = "pen-atlas"
    low = mat.copy()
    low.name = "pen-atlas-low"
    os.makedirs(OUT_DIR, exist_ok=True)

    # hotové díly
    sp = D.Parts("f-shelter")
    build_shelter(sp)
    shelter = D.join(sp.build(mat), "shelter")
    rack, hay = D.Builder("rack"), D.Builder("hay")
    build_rack(rack, hay)
    hay_rack = D.join([rack.build(low), hay.build(low)], "hay-rack")
    b = D.Builder("trough")
    build_trough(b)
    trough = b.build(low)
    b = D.Builder("gate")
    build_gate(b)
    gate = b.build(low)
    finished = [shelter, hay_rack, trough, gate]
    D.export(finished, os.path.join(OUT_DIR, "pen.glb"))
    for obj in finished:
        d = obj.dimensions
        print(f"STAT {obj.name}: {D.tri_count(obj)} tris, {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m")

    # staveniště: díly přístřešku po fázích, jesle, žlab, branka a rekvizity
    cp = D.Parts("ohrada")
    build_shelter(cp)
    build_rack(cp("rack"), cp("hay"))
    build_trough(cp("trough-log"), hollow=False)
    build_trough(cp("trough"))
    build_gate(cp("gate"))
    build_props(cp)
    sheltered = ("rack", "hay", "trough-log", "trough", "gate", "timber", "rods", "straw")
    stage = [b.build(low if key in sheltered else mat) for key, b in cp.builders.items()]
    D.export(stage, os.path.join(OUT_DIR, "pen-construction.glb"))
    for obj in stage:
        print(f"PART {obj.name}: {D.tri_count(obj)} tris")

    if RENDER_DIR != "-":
        os.makedirs(RENDER_DIR, exist_ok=True)
        for obj in stage:
            obj.hide_render = True
        preview(finished, RENDER_DIR)


main()
