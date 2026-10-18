"""Atlas posvátných míst (modla, svatyně, obětiny u dubu, kameny háje – tools/blender/sacred.py).

python3 tools/blender/sacred_atlas.py <craft_atlas_dir> apps/web/public/textures/terrain <out_dir>

craft_atlas_dir: výstup tools/blender/craft_atlas.py (atlas.png nebo atlas.jpg + atlas.json).
Z něj se beze změny přeberou pásy kůry, čel polen, kamenů v hlíně, drnů a vykopané hlíny
a oblasti uhlí, žhavých uhlíků, vypálené keramiky a hlíny (stejné U i V jako v atlasu řemesel,
takže funkce z dwellings.py a crafts.py – beam, log, lathe – fungují beze změny). Nové pásy
a oblasti jsou procedurální nad texturami terénu v repu. Atlas má 1024 × 1792 px.

  pásy (opakují se v U po 8 m, ve V metricky – 128 px/m):
    oak       ošlehané dubové dřevo modly – šedohnědé, svislá léta a praskliny (V = výška kůlu,
              modla pás zrcadlí po 1 m)
    oak_dark  totéž ve stínu – vyřezané prohlubně (oči, ústa, krk), ať je tvář čitelná i z dálky
    charred   ohořelá polena v ohništích (průřez jako beam, ±0,1875 m)
    rock      kámen hraničních kamenů, oltáře a ohnišť – šedá žula s lišejníkem a mechem (1 m)
    beam, logends, stone, turf, spoil – převzaté z atlasu řemesel
  oblasti (normalizované UV 0–1):
    shrine_ground  malovaná mapa země svatyně shora (768 px na 30,6 × 30,6 m, promítá se
                   svisle): udusaná plocha s vyšlapanými cestami k ohništím a světlejším
                   kruhem kolem modly, tmavá hlína příkopu se sazemi u ohnišť, val z hlíny
                   zarůstající k patě trávou; okraje podle tools/blender/sacred_layout.py
    idol_ground    mapa udusaného kruhu modly (192 px na 4,6 × 4,6 m): ušlapaný střed, cestička
                   zepředu, nepravidelný travnatý okraj
    ash (dno ohniště shora – popel uprostřed, saze, k okraji hlína příkopu), straw (snop –
    svislá stébla), grain (zrno v miskách), cloth_red / cloth_white / cloth_ochre (stužky),
    rope (provázek vytyčení), heap (hrubá navážka svatyně shora – staveniště); charcoal, embers,
    pottery_fired, clay, dark – převzaté

Výstup: atlas.jpg, atlas.json (stejný formát jako atlas.json obydlí), atlas_preview.jpg.

Zdroje: atlas řemesel (0 A.D., Wildfire Games, CC BY-SA 3.0 – viz
apps/web/public/models/crafts/LICENSES.md) a textury terénu v repu (0 A.D., CC BY-SA 3.0 – viz
apps/web/public/textures/terrain/LICENSE.md): mud.jpg (hlína, příkop, popel), grass-dirt.jpg
(udusaná zem s trávou), grass.jpg (tráva u paty valu – jako terén), gravel.jpg (tón kamene).
Dřevo modly, ohořelá polena, lišejník, stébla, zrno a látky jsou procedurální (šum, bez cizích
souborů).
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CRAFT, TERRAIN, OUT = sys.argv[1:4]
# atlas.py čte cesty z argumentů při importu – tady jen jeho pomocné funkce (šum, mapy barev)
sys.argv = [os.path.join(HERE, "atlas.py"), "-", "-", TERRAIN, "-", OUT]
sys.dont_write_bytecode = True  # žádné __pycache__ v tools/blender
sys.path.insert(0, HERE)
import atlas as A  # noqa: E402
import sacred_layout as L  # noqa: E402

W, PXM, GUT = A.W, A.PXM, A.GUT
H = 1792
GROUND_PX = 768  # mapa země svatyně
IDOL_PX = 192  # mapa země modly


def rgb(*c):
    return np.array(c, dtype=np.float32) / 255.0


def mix(a, b, f):
    f = np.asarray(f, dtype=np.float32)
    if f.ndim == 2:
        f = f[..., None]
    return a * (1 - f) + b * f


def terrain(name, size):
    return A.resize(A.load(os.path.join(TERRAIN, name)), size, size)


def tiled(tex, h, w=W):
    return A.tile_v(A.tile_h(tex, w), h)


def ramp(t, stops):
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, [s[0] for s in stops], [s[1][c] / 255 for s in stops])
    return out


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- pásy


def band_oak(h_px, dark=False):
    """Ošlehaný dub: šedohnědý, svislá léta (proužky v U, ve V skoro stálé), tmavé praskliny
    podél vláken a jemné skvrny lišejníku. dark = vyřezané prohlubně ve stínu."""
    grain = A.value_noise(h_px, W, [(180, 2, 0.5), (430, 3, 0.35), (70, 1, 0.4), (900, 4, 0.2)], 101)
    t = np.clip(0.5 + 0.55 * grain, 0, 1)
    out = ramp(t, [(0, (64, 56, 46)), (0.35, (110, 98, 82)), (0.7, (148, 136, 116)), (1, (184, 174, 154))])
    r = np.random.default_rng(102)
    y = np.arange(h_px)[:, None]
    x = np.arange(W)[None, :]
    for _ in range(70):
        cx = r.uniform(0, W)
        y0, y1 = sorted(r.uniform(-0.3 * h_px, 1.3 * h_px, 2))
        wid = r.uniform(0.6, 1.6)
        wob = 1.5 * np.sin(y / h_px * 2 * math.pi * r.uniform(1, 3) + r.uniform(0, 6))
        dx = np.abs(((x - cx - wob + W / 2) % W) - W / 2)
        line = np.clip(1 - dx / wid, 0, 1) * ((y >= y0) & (y <= y1))
        out *= (1 - 0.6 * line)[..., None]
    lichen = sstep(0.35, 0.65, A.value_noise(h_px, W, [(30, 3, 1), (90, 8, 0.5)], 103))
    out = mix(out, out * rgb(185, 200, 165) / 0.72, lichen * 0.2)
    if dark:
        out = out * rgb(140, 128, 116) / 0.75 * 0.62
    return np.clip(out, 0, 1)


def band_charred(beam):
    """Ohořelé dřevo: kůra beam převedená do uhlově černé s šedým popelem v prasklinách."""
    l = A.lum(beam)
    p0, p1 = np.percentile(l, 2), np.percentile(l, 98)
    t = np.clip((l - p0) / max(p1 - p0, 1e-6), 0, 1)
    out = mix(np.broadcast_to(rgb(14, 12, 11), beam.shape), np.broadcast_to(rgb(58, 52, 47), beam.shape), t[..., None])
    ash = sstep(0.4, 0.8, A.value_noise(beam.shape[0], W, [(60, 2, 1), (200, 4, 0.5)], 111))
    return mix(out, rgb(120, 116, 108), ash * 0.4)


def band_rock(h_px):
    """Žula: tón z rozmazaného štěrku (velké skvrny), jemné zrno, skvrny lišejníku, mech
    a tmavé praskliny."""
    grav = A.load(os.path.join(TERRAIN, "gravel.jpg"))
    g = A.seamless_v(A.seamless_h(A.resize(grav, 544, 544), 512), 512)
    big = A.blur(tiled(g, h_px), 6)
    t = A.lum(big)
    t = (t - t.min()) / max(t.max() - t.min(), 1e-6)
    grain = A.value_noise(h_px, W, [(300, 40, 0.5), (700, 90, 0.3)], 121)
    t = np.clip(0.1 + 0.7 * t + 0.2 * grain, 0, 1)
    out = ramp(t, [(0, (70, 68, 63)), (0.4, (112, 108, 100)), (0.75, (148, 144, 133)), (1, (180, 176, 164))])
    lich = A.value_noise(h_px, W, [(24, 3, 1), (80, 10, 0.5), (200, 26, 0.25)], 122)
    out = mix(out, rgb(160, 162, 134), sstep(0.45, 0.6, lich) * 0.5)
    moss = A.value_noise(h_px, W, [(16, 2, 1), (50, 6, 0.4)], 124)
    out = mix(out, rgb(64, 76, 40), sstep(0.5, 0.75, moss) * 0.55)
    cr = A.value_noise(h_px, W, [(40, 5, 1), (110, 14, 0.5)], 123)
    out = out * (1 - 0.45 * sstep(0.03, 0.0, np.abs(cr)))[..., None]
    return np.clip(out, 0, 1)


# ---------------------------------------------------------------- mapy země


def ground_textures(px, metres):
    """Textury terénu v měřítku mapy (px na metr): hlína, tráva s hlínou a tráva jako v terénu."""
    k = px / metres

    def tile(name, tile_m):
        t = terrain(name, max(16, int(round(tile_m * k))))
        return A.tile_v(A.tile_h(t, px), px)

    # mud a grass-dirt pokrývají v atlasu obydlí ≈ 4 m na dlaždici, tráva terénu 65 m
    return tile("mud.jpg", 4.0), tile("grass-dirt.jpg", 4.0), tile("grass.jpg", 65.0)


def noise2(px, octaves, seed):
    return A.value_noise(px, px, octaves, seed)


def region_shrine_ground(px):
    """Mapa země svatyně shora (oblast promítaná svisle přes čtverec 2 · SHRINE_HALF)."""
    S = L.SHRINE_HALF
    yy, xx = np.mgrid[0:px, 0:px].astype(np.float32)
    x = (xx + 0.5) / px * 2 * S - S
    y = S - (yy + 0.5) / px * 2 * S
    r = np.hypot(x, y)
    a = np.arctan2(x, -y) % (2 * math.pi)
    d, rho = L.petal_circle()
    phi = (a % (2 * math.pi / L.N_PETALS)) - math.pi / L.N_PETALS
    ro = d * np.cos(phi) + np.sqrt(rho * rho - (d * np.sin(phi)) ** 2)
    mud, gdirt, grass = ground_textures(px, 2 * S)
    n1 = noise2(px, [(12, 12, 1.0), (30, 30, 0.5), (70, 70, 0.25)], 201)
    n2 = noise2(px, [(40, 40, 1.0), (100, 100, 0.4)], 202)

    trod = A.gradient_map(mud, [(0, (80, 66, 50)), (0.45, (126, 108, 84)), (0.8, (158, 140, 112)), (1, (184, 168, 138))])
    dark_earth = A.gradient_map(mud, [(0, (30, 24, 19)), (0.45, (58, 47, 37)), (0.8, (82, 69, 54)), (1, (104, 90, 72))])
    spoil = A.gradient_map(mud, [(0, (60, 48, 36)), (0.5, (100, 84, 64)), (1, (140, 122, 96))])
    grass_t = grass * rgb(236, 246, 226) / 0.92

    # plocha: udusaná hlína, k okraji víc trávy; cesty k ohništím a kruh kolem modly vyšlapané
    path = np.zeros_like(r)
    for k in range(L.N_PETALS):
        pa = L.petal_angle(k)
        ux, uy = math.sin(pa), -math.cos(pa)
        along = x * ux + y * uy
        across = np.abs(-x * uy + y * ux + 0.25 * np.sin(along * 0.9 + k))
        on = sstep(0.75, 0.35, across) * sstep(L.R_PAVE, L.R_PAVE + 1.0, along) * sstep(L.R_TOP + 0.6, L.R_TOP - 0.8, along)
        path = np.maximum(path, on)
    ring = sstep(3.6, 2.6, r + 0.4 * n1)
    worn = np.clip(np.maximum(path, ring), 0, 1)
    grassy = sstep(0.15, 0.5, n2 * 0.6 + n1 * 0.6 + (r / L.R_TOP) * 0.7 - 0.3) * (1 - worn)
    plat = mix(trod, gdirt * 0.95, grassy * 0.85)
    plat = mix(plat, trod * rgb(255, 248, 236) / 0.86, worn * 0.55)
    # příkop: tmavá hlína, u ohnišť saze
    soot = np.zeros_like(r)
    for k in range(L.N_PETALS):
        pa = L.petal_angle(k)
        fx, fy = L.R_FIRE * math.sin(pa), -L.R_FIRE * math.cos(pa)
        df = np.hypot(x - fx, y - fy)
        soot = np.maximum(soot, sstep(1.9, 0.7, df + 0.35 * n1))
    ditch = mix(dark_earth, rgb(22, 19, 17), soot * 0.6)
    # val: hlína na hřbetu, k patě tráva (navazuje na terén)
    bank = mix(spoil, gdirt, sstep(0.35, 0.75, r - ro + 0.15 * n1))
    bank = mix(bank, grass_t, sstep(0.75, 1.2, r - ro + 0.12 * n2))

    out = plat
    out = mix(out, dark_earth * 1.15, sstep(L.R_TOP - 0.06, L.R_TOP + 0.12, r))  # horní hrana stěny
    out = mix(out, ditch, sstep(L.R_TOP + 0.1, L.R_IN - 0.15, r))
    out = mix(out, bank, sstep(0.25, 0.5, r - ro))
    return np.clip(out, 0, 1)


def region_heap(px):
    """Hrubá navážka svatyně shora (oblast přes celou plochu, 2 · R_IN): čerstvá hnědá hlína
    s tmavšími hroudami a pár zbytky drnů."""
    mud = terrain("mud.jpg", px)
    out = A.gradient_map(mud, [(0, (54, 42, 30)), (0.5, (98, 78, 56)), (1, (140, 116, 86))])
    clods = noise2(px, [(10, 10, 1.0), (26, 26, 0.6)], 221)
    out = out * (1 - 0.25 * sstep(0.2, 0.6, clods))[..., None]
    sod = sstep(0.45, 0.65, noise2(px, [(14, 14, 1.0), (40, 40, 0.4)], 222))
    return mix(out, rgb(84, 92, 44), sod * 0.5)


def region_idol_ground(px):
    """Mapa udusaného kruhu modly: ušlapaný střed a cestička zepředu (−Y), drnový okraj."""
    S = L.IDOL_HALF
    yy, xx = np.mgrid[0:px, 0:px].astype(np.float32)
    x = (xx + 0.5) / px * 2 * S - S
    y = S - (yy + 0.5) / px * 2 * S
    r = np.hypot(x, y)
    a = np.arctan2(x, -y)
    mud, gdirt, grass = ground_textures(px, 2 * S)
    n1 = noise2(px, [(8, 8, 1.0), (20, 20, 0.5)], 211)
    trod = A.gradient_map(mud, [(0, (78, 64, 48)), (0.45, (124, 106, 82)), (0.8, (156, 138, 110)), (1, (182, 166, 136))])
    edge_r = L.IDOL_GROUND_R * (1 + 0.07 * (0.6 * np.sin(3 * a + 1.3) + 0.4 * np.sin(5 * a + 2.6))) + 0.15 * n1
    path = sstep(0.45, 0.2, np.abs(x + 0.08 * np.sin(y * 2.0))) * sstep(0.3, -0.4, y)
    worn = np.maximum(sstep(1.0, 0.55, r + 0.15 * n1), path)
    out = mix(trod, gdirt, sstep(0.0, 0.6, n1 + r / L.IDOL_GROUND_R * 0.5 - 0.35) * (1 - worn) * 0.7)
    out = mix(out, trod * rgb(255, 246, 232) / 0.92, worn * 0.3)
    out = mix(out, gdirt, sstep(edge_r - 0.45, edge_r - 0.1, r) * (1 - path * 0.6))
    out = mix(out, grass * rgb(236, 246, 226) / 0.92, sstep(edge_r - 0.1, edge_r + 0.25, r))
    return np.clip(out, 0, 1)


# ---------------------------------------------------------------- malé oblasti


def region_ash(size, earth):
    """Dno ohniště shora (střed oblasti = střed ohniště): šedobílý popel s uhlíky uprostřed,
    černé saze, k okraji přechod do hlíny příkopu."""
    y, x = (np.mgrid[0:size, 0:size] + 0.5) / size * 2 - 1
    r = np.sqrt(x * x + y * y)
    n = A.value_noise(size, size, [(6, 6, 1), (18, 18, 0.5)], 151)
    fine = A.value_noise(size, size, [(40, 40, 1)], 152)
    soot = rgb(24, 21, 19) * (1 + 0.3 * n[..., None])
    ashc = rgb(150, 146, 138) * (1 + 0.12 * n[..., None])
    out = mix(earth, soot, sstep(0.95, 0.6, r + 0.15 * n))
    out = mix(out, ashc, sstep(0.55, 0.25, r + 0.2 * n) * 0.85)
    return mix(out, rgb(20, 18, 17), sstep(0.55, 0.75, fine) * sstep(0.6, 0.3, r) * 0.7)


def region_straw(w, h):
    """Stébla snopu: svislé zlatožluté proužky (U kolem snopu, V po délce)."""
    n = A.value_noise(h, w, [(40, 2, 0.6), (90, 3, 0.3), (14, 1, 0.3)], 161)
    return ramp(np.clip(0.5 + 0.6 * n, 0, 1), [(0, (96, 70, 30)), (0.4, (168, 128, 58)), (0.75, (212, 172, 92)), (1, (236, 208, 140))])


def region_grain(w, h):
    """Zrno (pšenice, proso) v misce shora: drobná zrnka se stíny mezi nimi."""
    r = np.random.default_rng(171)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    out = np.broadcast_to(rgb(92, 66, 32), (h, w, 3)).copy()
    for _ in range(int(w * h / 7)):
        cx, cy = r.uniform(0, w), r.uniform(0, h)
        rad = r.uniform(1.0, 1.8)
        d = np.hypot(xx - cx, (yy - cy) * 1.4)
        tone = rgb(*(np.array([214, 168, 88]) * r.uniform(0.8, 1.1)))
        out = mix(out, tone, np.clip(1 - d / rad, 0, 1) ** 0.6)
    return np.clip(out, 0, 1)


def region_cloth(w, h, color, seed):
    """Tkanina: plátnová vazba (jemná mřížka) a nepravidelné vyblednutí."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    weave = 0.5 + 0.25 * np.sin(xx * math.pi / 1.5) * np.sin(yy * math.pi / 1.5)
    n = A.value_noise(h, w, [(4, 4, 1.0), (12, 12, 0.4)], seed)
    return np.clip(rgb(*color) * (0.92 + 0.12 * weave[..., None]) * (1 + 0.1 * n[..., None]), 0, 1)


# ---------------------------------------------------------------- sestavení


def main():
    os.makedirs(OUT, exist_ok=True)
    src_path = os.path.join(CRAFT, "atlas.png")
    if not os.path.exists(src_path):
        src_path = os.path.join(CRAFT, "atlas.jpg")
    craft = np.asarray(Image.open(src_path).convert("RGB"), dtype=np.float32) / 255.0
    cmeta = json.load(open(os.path.join(CRAFT, "atlas.json")))
    assert craft.shape[1] == W and abs(cmeta["uperiod_m"] - W / PXM) < 1e-6

    atlas = np.zeros((H, W, 3), dtype=np.float32)
    meta = {"W": W, "H": H, "uperiod_m": W / PXM, "bands": {}, "regions": {}}
    # dwellings.py čte při importu řady došků – posvátná místa došky nemají, hodnoty jen převzaté
    meta["thatch_courses"] = cmeta["thatch_courses"]
    cursor = 0

    def put_band(name, img, vmin, vmax):
        nonlocal cursor
        h = img.shape[0]
        r0 = cursor + GUT
        atlas[r0 : r0 + h] = img
        atlas[cursor:r0] = img[0]
        atlas[r0 + h : r0 + h + GUT] = img[-1]
        meta["bands"][name] = {"r0": r0, "r1": r0 + h, "vmin": vmin, "vmax": vmax}
        cursor = r0 + h + GUT

    def craft_band(name):
        b = cmeta["bands"][name]
        put_band(name, craft[b["r0"] : b["r1"]], b["vmin"], b["vmax"])

    def craft_region(name):
        r = cmeta["regions"][name]
        return craft[r["r0"] : r["r1"], r["x0"] : r["x1"]]

    def px(m):
        return int(round(m * PXM))

    put_band("oak", band_oak(px(1.0)), 0.0, 1.0)
    put_band("oak_dark", band_oak(px(1.0), dark=True), 0.0, 1.0)
    craft_band("beam")
    b = cmeta["bands"]["beam"]
    put_band("charred", band_charred(craft[b["r0"] : b["r1"]]), b["vmin"], b["vmax"])
    craft_band("logends")
    craft_band("stone")
    put_band("rock", band_rock(px(1.0)), 0.0, 1.0)
    craft_band("turf")
    craft_band("spoil")

    def put_region(name, img, x, r0):
        h, w = img.shape[:2]
        padded = np.pad(img, ((GUT, GUT), (GUT, GUT), (0, 0)), mode="edge")
        atlas[r0 - GUT : r0 + h + GUT, x - GUT : x + w + GUT] = padded
        meta["regions"][name] = {"x0": x, "x1": x + w, "r0": r0, "r1": r0 + h}
        return x + w + 2 * GUT

    # mapa země svatyně vlevo, malé oblasti ve sloupci vpravo od ní (po řádcích)
    r0 = cursor + GUT
    xs = put_region("shrine_ground", region_shrine_ground(GROUND_PX), GUT, r0)
    ditch_earth = A.gradient_map(terrain("mud.jpg", 128), [(0, (30, 24, 19)), (0.45, (58, 47, 37)), (0.8, (82, 69, 54)), (1, (104, 90, 72))])
    rows = [
        [("idol_ground", region_idol_ground(IDOL_PX))],
        [("ash", region_ash(128, ditch_earth)), ("straw", region_straw(64, 128))],
        [("charcoal", craft_region("charcoal")), ("embers", craft_region("embers"))],
        [("pottery_fired", craft_region("pottery_fired")), ("clay", craft_region("clay")), ("grain", region_grain(64, 64))],
        [
            ("cloth_red", region_cloth(48, 48, (156, 34, 26), 181)),
            ("cloth_white", region_cloth(48, 48, (218, 208, 186), 182)),
            ("cloth_ochre", region_cloth(48, 48, (196, 146, 58), 183)),
            ("dark", craft_region("dark")),
        ],
        [("rope", region_cloth(32, 32, (176, 150, 108), 184)), ("heap", region_heap(128))],
    ]
    row = r0
    for items in rows:
        x = xs
        for name, img in items:
            x = put_region(name, img, x, row)
            assert x - GUT <= W, (name, x)
        row += max(img.shape[0] for _, img in items) + 2 * GUT
    assert row - GUT <= r0 + GROUND_PX + GUT, row
    cursor = r0 + GROUND_PX + GUT
    assert cursor <= H, cursor
    meta["used_rows"] = cursor
    atlas[cursor:] = atlas[cursor - 1]

    img = Image.fromarray(np.clip(atlas * 255, 0, 255).astype(np.uint8))
    img.save(os.path.join(OUT, "atlas.jpg"), quality=88)
    img.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, "atlas_preview.jpg"), quality=85)
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(json.dumps({"bands": list(meta["bands"]), "regions": list(meta["regions"]), "used_rows": cursor}))


if __name__ == "__main__":
    main()
