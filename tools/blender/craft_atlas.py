"""Atlas řemeslných staveb (hrnčíř, kovář, uhlíř, milíř – modely v apps/web/public/models/crafts).

python3 tools/blender/craft_atlas.py <celt_struct_1.png> <celt_struct.png> \
    apps/web/public/textures/terrain <basket_celt_1.png> <out_dir>

Vstupy jako u atlas.py (textury 0 A.D. převedené z DDS do PNG). Skript nejdřív sestaví atlas
obydlí (atlas.py – pásy i oblasti zůstanou na stejném místě, modely sdílejí kód s dwellings.py)
a pak ho rozšíří na 1024 × 2560 px:

  pásy pod atlasem obydlí (opakují se v U, ve V metricky jako v atlas.py):
    clamp  zem milíře (1,5 m) – začernalá hlína, popel a drny (V se po kopuli zrcadlí)
    kiln   hliněná kopule pece – u paty světlá hlína, výš vypálená do cihlova, nahoře očazená;
           U = celý obvod kopule (0 = topeniště, nad ním sazový pruh)
    stone  kameny v hlíně (podstavec pece, výheň) – štěrk z gravel.jpg zvětšený na kameny
  oblasti vedle oblastí obydlí (normalizované UV 0–1):
    clamp_top (vrchol milíře shora – sazový střed, popel), charcoal, embers, pottery (sušící
    se hrnce), pottery_fired, leather (měch), clay (hrouda hlíny), iron, water

Výstup: atlas.jpg (obydlí + řemesla), atlas-moss.jpg (totéž, jen došky, čela došků
a hřebenáč přemalované na mech – střecha uhlířovy zemnice), atlas.json (rozložení, nadmnožina
atlas.json obydlí), náhledy *_preview.jpg.

Zdroje: textury terénu v repu (0 A.D., Wildfire Games, CC BY-SA 3.0 – viz
apps/web/public/textures/terrain/LICENSE.md): grass-lush.jpg + forest-floor.jpg (mech),
mud.jpg + grass-lush.jpg (milíř), gravel.jpg (kameny), mud.jpg (hlína pece); výřezy atlasu obydlí
viz atlas.py. Ostatní (uhlí, žhavé uhlíky, železo, keramika, kůže, voda) jsou procedurální.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
C1, C0, TERRAIN, BASKET, OUT = sys.argv[1:6]
# atlas.py čte své argumenty při importu – stejné vstupy, výstup do OUT
sys.argv = [os.path.join(HERE, "atlas.py"), C1, C0, TERRAIN, BASKET, OUT]
sys.dont_write_bytecode = True  # žádné __pycache__ v tools/blender
sys.path.insert(0, HERE)
import atlas as A  # noqa: E402

W, PXM, GUT = A.W, A.PXM, A.GUT
H = 2560
BASE_H = 2048
rng = np.random.default_rng(17)


def terrain(name, size=512):
    """Textura terénu zmenšená na size × size (dlaždice navazuje – textury 0 A.D. jsou bezešvé)."""
    return A.resize(A.load(os.path.join(TERRAIN, name)), size, size)


def tiled(tex, h, w=W):
    return A.tile_v(A.tile_h(tex, w), h)


def mix(a, b, f):
    f = np.asarray(f, dtype=np.float32)
    if f.ndim == 2:
        f = f[..., None]
    return a * (1 - f) + b * f


def rgb(*c):
    return np.array(c, dtype=np.float32) / 255.0


# ---------------------------------------------------------------- mech (střecha uhlíře)


def moss_base(h_px, seed):
    """Mechové polštáře: zelený mech (grass-lush) s tmavými škvírami (forest-floor), bez
    opakující se mřížky – skvrny z hodnotového šumu navazujícího v U."""
    lush = tiled(terrain("grass-lush.jpg", 384), h_px)
    floor = tiled(terrain("forest-floor.jpg", 384), h_px)
    cushions = A.value_noise(h_px, W, [(48, max(2, h_px // 22), 1.0), (120, max(3, h_px // 9), 0.5)], seed)
    patches = A.value_noise(h_px, W, [(9, max(2, h_px // 90), 1.0), (22, max(2, h_px // 40), 0.6)], seed + 1)
    detail = A.gradient_map(lush, [(0, (24, 34, 12)), (0.35, (66, 88, 26)), (0.7, (118, 140, 48)), (1, (172, 182, 86))])
    # polštáře světlejší uprostřed, škvíry mezi nimi tmavé s hrabankou
    crevice = A.smoothstep(-0.15, -0.55, cushions)
    out = detail * (1 + 0.22 * np.clip(cushions, -1, 1))[..., None]
    out = mix(out, floor * 0.55, crevice * 0.7)
    # místy rezavě hnědý (suchý) a místy žlutozelený mech
    dry = A.smoothstep(0.45, 0.8, patches)
    out = mix(out, A.gradient_map(lush, [(0, (40, 30, 14)), (0.5, (104, 84, 40)), (1, (150, 128, 70))]), dry * 0.55)
    bright = A.smoothstep(-0.5, -0.8, patches)
    out = out * (1 + 0.18 * bright)[..., None] * np.array([1.0, 1.05, 0.85], dtype=np.float32) ** bright[..., None]
    return out


def band_moss(h_px, bounds):
    """Mech po řadách jako došky (stejné hranice řad – geometrie střechy je stejná): nahoře řady
    stín pod přesahem řady nad ní, spodní hrana zvlněná, polštáře přes hranu přetékají."""
    base = moss_base(h_px + 16, 41)
    out = np.zeros((h_px, W, 3), dtype=np.float32)
    EXT = 9
    for k in range(len(bounds) - 1):
        top = h_px - bounds[k + 1] * PXM
        bottom = h_px - bounds[k] * PXM
        y0 = int(round(top))
        ch = int(round(bottom)) - y0
        rows = np.arange(ch + EXT)
        yy = (rows / max(ch - 1, 1))[:, None, None]
        shade = 1 - 0.5 * A.smoothstep(0.22, 0.0, yy) + 0.1 * A.smoothstep(0.6, 1.0, yy)
        src = np.roll(base, int(rng.integers(0, W)), axis=1)
        ya, yb = max(y0, 0), min(y0 + ch + EXT, h_px)
        seg = (src[ya:yb] * shade[ya - y0 : yb - y0])
        ext = np.round(EXT * (0.5 + 0.5 * A.value_noise(1, W, [(30, 1, 0.7), (90, 1, 0.3)], 200 + k)[0])).astype(int)
        mask = rows[:, None] < (ch + ext)[None, :]
        m = mask[ya - y0 : yb - y0]
        out[ya:yb][m] = seg[m]
    return out


def band_moss_edge(h_px):
    """Čela mechových řad: tmavší udusaný mech s hlínou a kořínky."""
    base = moss_base(h_px, 43)
    mud = tiled(terrain("mud.jpg", 256), h_px)
    yy = np.linspace(0, 1, h_px)[:, None]
    out = mix(base * 0.75, mud * np.array([0.55, 0.5, 0.4], dtype=np.float32), 0.25 + 0.35 * yy)
    return out


def band_moss_ridge(h_px):
    """Hřeben: přehnuté mechové polštáře, uprostřed nejvyšší a nejsvětlejší, s vazbami po 0,8 m."""
    base = moss_base(h_px, 47)
    x = np.arange(W)
    d = np.minimum(x % (W // 10), (W // 10) - x % (W // 10))
    bind = 1 - 0.3 * np.exp(-((d / 3.0) ** 2))
    yy = np.linspace(-1, 1, h_px)[:, None]
    return base * (bind[None, :] * (0.8 + 0.28 * (1 - yy**2)))[..., None]


# ---------------------------------------------------------------- pásy řemesel


def band_clamp(h_px):
    """Zem milíře: hlína ztmavlá sazemi a uhelným prachem, popel, nepravidelné drny se
    sežloutlou trávou (milíř se kryje drny a hlínou). Ve V bez přechodu – kopule pás
    opakuje se zrcadlením po prstencích."""
    mud = tiled(terrain("mud.jpg", 384), h_px)
    lush = tiled(terrain("grass-lush.jpg", 384), h_px)
    earth = A.gradient_map(mud, [(0, (26, 22, 18)), (0.45, (70, 58, 45)), (0.8, (108, 92, 72)), (1, (138, 120, 96))])
    soot = A.value_noise(h_px, W, [(14, 3, 1), (40, 8, 0.6), (110, 20, 0.3)], 51)
    out = earth * (1 - 0.5 * A.smoothstep(0.15, 0.75, soot))[..., None]
    ash = A.smoothstep(0.45, 0.85, A.value_noise(h_px, W, [(24, 5, 1), (80, 14, 0.5)], 52))
    out = mix(out, A.gradient_map(mud, [(0, (96, 92, 86)), (1, (168, 162, 150))]), ash * 0.45)
    # drny: nepravidelné ostrůvky trávy, okraje rozbité hlínou
    grass = A.gradient_map(lush, [(0, (36, 38, 18)), (0.5, (84, 88, 40)), (1, (140, 132, 72))])
    patch = A.value_noise(h_px, W, [(26, 5, 1.0), (70, 12, 0.5), (180, 30, 0.25)], 53)
    sod_mask = A.smoothstep(0.2, 0.42, patch) * (1 - 0.6 * A.smoothstep(0.2, 0.7, soot))
    out = mix(out, grass, sod_mask * 0.85)
    return out


def region_clamp_top(size):
    """Vrchol milíře shora (planární projekce, střed = komín): nepravidelná skvrna sazí
    a popela kolem komínu, k okraji hlína jako pás clamp."""
    clamp = band_clamp(size)[:, :size]
    y, x = (np.mgrid[0:size, 0:size] + 0.5) / size * 2 - 1
    r = np.sqrt(x * x + y * y)
    n = A.value_noise(size, size, [(6, 6, 1), (16, 16, 0.5)], 57)
    black = rgb(16, 14, 12) * (1 + 0.4 * n[..., None])
    ashc = rgb(132, 126, 116) * (1 + 0.15 * n[..., None])
    soot = A.smoothstep(0.75, 0.2, r + 0.25 * n)
    out = mix(clamp, ashc, A.smoothstep(0.9, 0.45, r + 0.3 * n) * 0.5)
    return mix(out, black, soot * 0.9)


def band_kiln(h_px):
    """Kopule pece (V = výška po plášti od paty, U = obvod 4 m – pás se opakuje po půl šířce
    atlasu, kopule ho obtočí jednou; U = 0 je nad topeništěm)."""
    hw = W // 2
    mud = tiled(terrain("mud.jpg", 256), h_px, hw)
    v = (h_px - 1 - np.arange(h_px)) / PXM  # metry od paty
    vv = v[:, None]
    u = (np.arange(hw) / hw)[None, :]  # 0–1 = celý obvod
    du = np.minimum(u, 1 - u)  # vzdálenost od přední strany (topeniště)
    clay = A.gradient_map(mud, [(0, (96, 60, 38)), (0.4, (150, 96, 60)), (0.8, (186, 124, 80)), (1, (210, 160, 116))])
    # vypálená hlína: nahoře cihlová, u paty světlá okrová, jemné praskliny
    pale = A.gradient_map(mud, [(0, (110, 92, 70)), (0.5, (170, 148, 116)), (1, (210, 192, 160))])
    out = mix(clay, pale, A.smoothstep(0.35, 0.05, vv) * np.ones_like(u))
    cracks = A.value_noise(h_px, hw, [(30, 24, 1), (76, 50, 0.5)], 61)
    out = out * (1 - 0.35 * A.smoothstep(0.06, 0.0, np.abs(cracks)))[..., None]
    n = A.value_noise(h_px, hw, [(6, 4, 1), (16, 10, 0.5)], 62)
    # saze: nahoře u průduchu a sazový pruh nad topeništěm (rozšiřuje se nahoru)
    top_soot = A.smoothstep(0.75, 1.15, vv + 0.08 * n)
    plume = A.smoothstep(0.05 + 0.08 * vv, 0.0, du + 0.02 * n) * A.smoothstep(0.1, 0.3, vv)
    soot = np.clip(top_soot + plume, 0, 1)
    out = mix(out, rgb(22, 18, 16) * (1 + 0.5 * n[..., None]), soot * 0.85)
    return np.concatenate([out, out], axis=1)


def band_stone(h_px):
    """Kameny v hlíně: štěrk zvětšený na lomový kámen, mezi kameny tmavší hlína."""
    grav = A.load(os.path.join(TERRAIN, "gravel.jpg"))
    g = A.resize(grav[:384, :384], 384, 384)  # 1024 px textury ≈ 2,5 m → kameny ≈ 8–15 cm
    g = A.seamless_v(A.seamless_h(A.resize(g, 352, 352), 320), 320)
    t = tiled(g, h_px)
    stones = A.gradient_map(t, [(0, (42, 36, 30)), (0.35, (98, 90, 80)), (0.7, (146, 138, 124)), (1, (190, 182, 166))])
    stones = stones * np.array([1.05, 1.0, 0.92], dtype=np.float32)
    return stones


# ---------------------------------------------------------------- oblasti


def region_charcoal(w, h):
    """Dřevěné uhlí: černé hranaté kusy (Voroného buňky), šedomodrý lesk na hranách, tmavé spáry."""
    r = np.random.default_rng(71)
    pts = r.uniform(0, 1, (int(w * h / 90), 2)) * [w, h]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.full((h, w, 2), 1e9, dtype=np.float32)
    shade = np.zeros((h, w), dtype=np.float32)
    tone = r.uniform(0.6, 1.4, len(pts))
    for (px_, py_), t in zip(pts, tone):
        dist = np.hypot(xx - px_, yy - py_)
        closer = dist < d[..., 0]
        d[..., 1] = np.where(closer, d[..., 0], np.minimum(d[..., 1], dist))
        d[..., 0] = np.where(closer, dist, d[..., 0])
        shade = np.where(closer, t, shade)
    edge = d[..., 1] - d[..., 0]  # malé u hrany kusu
    base = rgb(26, 24, 23) * shade[..., None]
    gloss = A.smoothstep(2.5, 0.8, edge) * (shade > 1.0)
    base = mix(base, rgb(78, 78, 80), gloss * 0.45)
    return base * (1 - 0.7 * A.smoothstep(0.9, 0.0, edge))[..., None]


def region_embers(w, h):
    """Žhavé uhlíky: oranžové až žluté jádro mezi černými kusy uhlí."""
    n = A.value_noise(h, w, [(8, 8, 1.0), (20, 20, 0.5)], 75)
    hot = A.smoothstep(-0.2, 0.6, n)
    col = mix(rgb(120, 28, 8), rgb(255, 196, 70), hot)
    dark = A.smoothstep(-0.25, -0.6, A.value_noise(h, w, [(14, 14, 1.0)], 76))
    return mix(col, rgb(26, 20, 18), dark * 0.85)


def region_pottery(w, h, fired):
    """Hrnce: U kolem nádoby, V = výška. Nevypálené šedookrové s vodorovnými stopami prstů,
    vypálené červenohnědé s tmavými skvrnami od ohně."""
    yy = np.linspace(0, 1, h)[:, None]
    rings = 0.5 + 0.5 * np.sin(yy * 2 * math.pi * 9 + A.value_noise(h, w, [(4, 1, 1.0)], 77) * 0.6)
    n = A.value_noise(h, w, [(6, 4, 1.0), (14, 8, 0.4)], 78 + fired)
    if fired:
        col = rgb(160, 92, 58) * (1 + 0.1 * n[..., None])
        cloud = A.smoothstep(0.2, 0.7, A.value_noise(h, w, [(5, 3, 1.0)], 79))
        col = mix(col, rgb(52, 40, 34), cloud * 0.7)
    else:
        col = rgb(150, 132, 108) * (1 + 0.06 * n[..., None])
    return col * (0.93 + 0.1 * rings)[..., None]


def region_flat(w, h, color, amp, seed, scale=(6, 6)):
    n = A.value_noise(h, w, [(scale[0], scale[1], 1.0), (scale[0] * 3, scale[1] * 3, 0.4)], seed)
    return rgb(*color) * (1 + amp * n[..., None])


def region_leather(w, h):
    base = region_flat(w, h, (98, 64, 38), 0.12, 81)
    wr = A.value_noise(h, w, [(3, 12, 1.0)], 82)
    return base * (1 - 0.25 * A.smoothstep(0.05, 0.0, np.abs(wr)))[..., None]


def main():
    A.main()  # atlas obydlí (atlas.png, atlas.json) do OUT
    base = np.asarray(Image.open(os.path.join(OUT, "atlas.png")).convert("RGB"), dtype=np.float32) / 255.0
    meta = json.load(open(os.path.join(OUT, "atlas.json")))
    assert base.shape[:2] == (BASE_H, W), base.shape
    atlas = np.zeros((H, W, 3), dtype=np.float32)
    atlas[:BASE_H] = base
    meta["H"] = H
    cursor = BASE_H

    def put_band(name, img, vmin, vmax):
        nonlocal cursor
        h = img.shape[0]
        r0 = cursor + GUT
        atlas[r0 : r0 + h] = img
        atlas[cursor:r0] = img[0]
        atlas[r0 + h : r0 + h + GUT] = img[-1]
        meta["bands"][name] = {"r0": r0, "r1": r0 + h, "vmin": vmin, "vmax": vmax}
        cursor = r0 + h + GUT

    def px(m):
        return int(round(m * PXM))

    put_band("clamp", band_clamp(px(1.5)), 0.0, 1.5)
    put_band("kiln", band_kiln(px(1.25)), 0.0, 1.25)
    put_band("stone", band_stone(px(0.75)), 0.0, 0.75)
    meta["used_rows"] = cursor
    atlas[cursor:] = atlas[cursor - 1]

    # oblasti vpravo od oblastí obydlí (řada oblastí atlasu obydlí má vpravo volné místo)
    regs = meta["regions"]
    row0 = regs["trench"]["r0"]
    x_free = max(r["x1"] for r in regs.values()) + 2 * GUT

    def put_region(name, img, x, r0):
        h, w = img.shape[:2]
        padded = np.pad(img, ((GUT, GUT), (GUT, GUT), (0, 0)), mode="edge")
        atlas[r0 - GUT : r0 + h + GUT, x - GUT : x + w + GUT] = padded
        regs[name] = {"x0": x, "x1": x + w, "r0": r0, "r1": r0 + h}
        return x + w + 2 * GUT

    x = put_region("clamp_top", region_clamp_top(128), x_free, row0)
    x_b = x  # druhá řada malých oblastí začíná až za vrcholem milíře
    x = put_region("charcoal", region_charcoal(96, 64), x, row0)
    x = put_region("embers", region_embers(64, 64), x, row0)
    x = put_region("pottery", region_pottery(64, 64, 0), x, row0)
    x = put_region("pottery_fired", region_pottery(64, 64, 1), x, row0)
    row1 = row0 + 64 + 2 * GUT
    xb = put_region("leather", region_leather(64, 64), x_b, row1)
    xb = put_region("clay", region_flat(64, 64, (122, 104, 84), 0.1, 83), xb, row1)
    xb = put_region("iron", region_flat(32, 32, (58, 58, 62), 0.12, 84, (4, 4)), xb, row1)
    xb = put_region("water", region_flat(32, 32, (30, 36, 36), 0.08, 85, (3, 3)), xb, row1)
    assert x <= W and xb <= W, (x, xb)
    assert row1 + 64 + GUT <= regs["trench"]["r1"] + GUT

    def save(img, name):
        im = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8))
        im.save(os.path.join(OUT, f"{name}.jpg"), quality=88)
        im.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, f"{name}_preview.jpg"), quality=85)

    save(atlas, "atlas")
    Image.fromarray(np.clip(atlas * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, "atlas.png"))
    moss = atlas.copy()
    for name, img in (
        ("thatch", band_moss(px(3.75), meta["thatch_courses"])),
        ("thatch_edge", band_moss_edge(px(0.5))),
        ("ridge", band_moss_ridge(px(1.0))),
    ):
        b = meta["bands"][name]
        assert img.shape[0] == b["r1"] - b["r0"], (name, img.shape)
        moss[b["r0"] : b["r1"]] = img
        moss[b["r0"] - GUT : b["r0"]] = img[0]
        moss[b["r1"] : b["r1"] + GUT] = img[-1]
    save(moss, "atlas-moss")
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(json.dumps({"bands": list(meta["bands"]), "regions": list(regs), "used_rows": meta["used_rows"]}))


if __name__ == "__main__":
    main()
