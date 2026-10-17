"""Jeden atlas (trim sheet) pro zemnici i polozemnici (modely v apps/web/public/models/dwellings).

python3 -I tools/blender/atlas.py <celt_struct_1.png> <celt_struct.png> \
    apps/web/public/textures/terrain <basket_celt_1.png> <out_dir> [trench.jpg]

Vstupní PNG jsou textury 0 A.D. převedené z DDS (např. Pillow: Image.open(x.dds).save(x.png)):
art/textures/skins/structural/celt_struct_1.dds, celt_struct.dds a skins/props/basket_celt_1.dds.
trench.jpg (dno vstupní šíje se schody, 256 × 512) je volitelný – bez něj se odvodí z mud.jpg.

Pásy přes celou šířku atlasu se opakují ve směru U (textura REPEAT), ve směru V leží každá
plocha uvnitř svého pásu (metricky – v metadatech je rozsah v metrech). Hustota 128 px/m,
šířka 1024 px = 8 m. Výstup: atlas.png (+ náhled), atlas.json s rozložením pro Blender.

Zdroje (vše 0 A.D., Wildfire Games, CC BY-SA 3.0) – souřadnice výřezů v pixelech atlasu:
  celt_struct_1 (512²): došky 0–380 × 45–128, omítka 256–512 × 412–510, proutí 250–343 × 133–229,
                        čela trámů 362–500 × 358–382
  celt_struct (1024²):  kůra 546–586 × 520–875, polena 704–767 × 930–960, seno 612–680 × 542–606
  terén (repo):         mud.jpg (mud_01), turf = grass.jpg + mud.jpg
Logo Wildfire Games je jen v celt_struct na 345–512 × 130–210 – žádný výřez do něj nezasahuje.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

C1, C0, TERRAIN, BASKET, OUT = sys.argv[1:6]
TRENCH = sys.argv[6] if len(sys.argv) > 6 else None
W = 1024
PXM = 128  # px na metr
H = 2048
GUT = 8  # okraj pásu (opakované krajní řádky) proti prolínání mipmap
rng = np.random.default_rng(7)

# Výřezy (x0, y0, x1, y1) – kontrola loga je v check_crops()
CROPS = {
    "thatch": (C1, (0, 45, 380, 128)),
    "plaster": (C1, (256, 412, 512, 510)),
    "wattle": (C1, (250, 133, 343, 229)),
    "logends": (C1, (362, 358, 500, 382)),
    "bark": (C0, (546, 520, 586, 875)),
    "firewood": (C0, (704, 930, 767, 960)),
    "hay": (C0, (612, 542, 680, 606)),
}
LOGO = (C0, (345, 130, 512, 210))


def load(path, box=None):
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    return np.asarray(im, dtype=np.float32) / 255.0


def crop(name):
    path, box = CROPS[name]
    return load(path, box)


def resize(a, w, h):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.resize((int(w), int(h)), Image.LANCZOS), dtype=np.float32) / 255.0


def seamless_h(a, period):
    """Z obrázku širšího než period udělá vodorovně navazující dlaždici (prolnutí přesahu)."""
    f = a.shape[1] - period
    assert f > 4, (a.shape, period)
    out = a[:, :period].copy()
    ramp = (np.arange(f) / f)[None, :, None]
    out[:, :f] = a[:, :f] * ramp + a[:, period : period + f] * (1 - ramp)
    return out


def seamless_v(a, period):
    return seamless_h(a.transpose(1, 0, 2), period).transpose(1, 0, 2)


def tile_h(t, width=W):
    n = math.ceil(width / t.shape[1])
    return np.concatenate([t] * n, axis=1)[:, :width]


def tile_v(t, height):
    n = math.ceil(height / t.shape[0])
    return np.concatenate([t] * n, axis=0)[:height]


def blur(a, radius):
    """Přibližně gaussovské rozmazání (3× krabicový filtr), v U zabalené, ve V s okrajem."""
    out = a.astype(np.float32)
    r = int(radius)
    k = 2 * r + 1
    for _ in range(3):
        p = np.concatenate([out[:, -r:], out, out[:, :r]], axis=1)
        c = np.cumsum(np.pad(p, ((0, 0), (1, 0), (0, 0))), axis=1)
        out = (c[:, k:] - c[:, :-k]) / k
        p = np.pad(out, ((r, r), (0, 0), (0, 0)), mode="edge")
        c = np.cumsum(np.pad(p, ((1, 0), (0, 0), (0, 0))), axis=0)
        out = (c[k:] - c[:-k]) / k
    return out


def lum(a):
    return a @ np.array([0.3, 0.59, 0.11], dtype=np.float32)


def gradient_map(a, stops, lo=2, hi=98):
    l = lum(a)
    p0, p1 = np.percentile(l, lo), np.percentile(l, hi)
    t = np.clip((l - p0) / max(p1 - p0, 1e-6), 0, 1)
    xs = [s[0] for s in stops]
    out = np.zeros(a.shape, dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, xs, [s[1][c] / 255.0 for s in stops])
    return out


def wave_noise(h, w, terms, seed):
    """Plynulý šum navazující v U (celočíselné frekvence přes šířku)."""
    r = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    n = np.zeros((h, w), dtype=np.float32)
    for kx, ky, amp in terms:
        ph = r.uniform(0, 2 * math.pi)
        n += amp * np.sin(2 * math.pi * (kx * x / w) + ky * y / PXM * 2 * math.pi + ph)
    return n


def value_noise(h, w, octaves, seed):
    """Hodnotový šum (−1…1) navazující v U; octaves = [(buněk_x, buněk_y, amplituda)]."""
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    xs = np.arange(w, dtype=np.float32)
    for cx, cy, amp in octaves:
        g = r.uniform(-1, 1, (cy + 2, cx)).astype(np.float32)
        gx = xs / w * cx
        gy = ys / h * cy
        i0 = np.floor(gx).astype(int)
        j0 = np.floor(gy).astype(int)
        fx = gx - i0
        fy = gy - j0
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        i0 %= cx
        i1 = (i0 + 1) % cx
        a = g[j0][:, i0] * (1 - fx) + g[j0][:, i1] * fx
        b = g[j0 + 1][:, i0] * (1 - fx) + g[j0 + 1][:, i1] * fx
        out += amp * (a * (1 - fy[:, None]) + b * fy[:, None])
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- pásy

def thatch_courses(total_m, course_m):
    """Hranice řad došků (m po spádu od okapu) – výška řady ±12 %, ať střecha nepůsobí jako prkna."""
    r = np.random.default_rng(3)
    b = [0.0]
    while b[-1] < total_m:
        b.append(round(b[-1] + course_m * (1 + r.uniform(-0.12, 0.12)), 4))
    return b


def band_thatch(h_px, bounds):
    """Došky: řady (kurzy) podle bounds odspodu (okap), světlá zlatá sláma. Spodní hrana řady
    je zvlněná a přesahuje přes tmavý stín nahoře řady pod ní; konce stébel jsou světlejší."""
    src = crop("thatch")  # dvě celé řady došků
    rows = [src[0:43], src[43:83]]
    out = np.zeros((h_px, W, 3), dtype=np.float32)
    EXT = 7  # max. přesah zvlněné spodní hrany (px)
    for k in range(len(bounds) - 1):
        top = h_px - bounds[k + 1] * PXM
        bottom = h_px - bounds[k] * PXM
        y0 = int(round(top))
        y1 = int(round(bottom))
        ch = y1 - y0
        row = rows[k % 2]
        hgt = ch + EXT + 2
        r = resize(row, row.shape[1] * hgt / row.shape[0], hgt)
        t = tile_h(seamless_h(r, W // 3))
        t = np.roll(t, int(rng.integers(0, W)), axis=1)[: ch + EXT]
        yy = (np.arange(ch + EXT) / max(ch - 1, 1))[:, None, None]
        shade = 1 - 0.4 * smoothstep(0.2, 0.0, yy) + 0.14 * smoothstep(0.65, 1.0, yy)
        t = t * shade
        ext = np.round(EXT * (0.5 + 0.5 * value_noise(1, W, [(40, 1, 0.7), (110, 1, 0.3)], 100 + k)[0])).astype(int)
        mask = np.arange(ch + EXT)[:, None] < (ch + ext)[None, :]
        ya, yb = max(y0, 0), min(y0 + ch + EXT, h_px)
        seg = t[ya - y0 : yb - y0]
        m = mask[ya - y0 : yb - y0]
        out[ya:yb][m] = seg[m]
    gm = gradient_map(out, [(0, (58, 42, 20)), (0.3, (150, 118, 62)), (0.65, (204, 172, 102)), (1, (238, 214, 150))])
    # trochu původní barevnosti, ať to není plochý přechod; o něco méně syté
    gm = gm * 0.85 + out * 0.15 * (gm.mean() / max(out.mean(), 1e-6))
    gm = gm * 0.88 + lum(gm)[..., None] * 0.12
    gm *= 1 + 0.07 * value_noise(h_px, W, [(6, 4, 1), (16, 10, 0.5)], 11)[..., None]
    return gm


def band_thatch_edge(h_px):
    """Čela došků (okap, štíty, stupně mezi řadami): stébla podél hrany, tmavší a hutnější."""
    src = crop("thatch")
    inner = np.concatenate([src[6:38], src[49:79]], axis=0)  # vnitřky řad bez tmavých linek
    rot = np.rot90(inner, 1)  # 62 široké × 380 vysoké, stébla vodorovně
    piece = rot[100 : 100 + h_px + 8]
    r = resize(piece, 140, piece.shape[0])
    t = tile_h(seamless_h(r, W // 8))[:h_px]
    return gradient_map(t, [(0, (34, 24, 10)), (0.4, (104, 80, 40)), (0.8, (156, 126, 70)), (1, (190, 160, 100))])


def band_ridge(h_px):
    """Hřebenáč: sláma přehnutá přes hřeben (stébla napříč), měkké vazby po 0,8 m, zaoblený vršek."""
    src = crop("thatch")
    inner = src[6:38]  # vnitřek jedné řady – stébla (přes hřeben) bez tmavých linek
    r = resize(inner, inner.shape[1] * 1.3, h_px)
    t = tile_h(seamless_h(r, W // 3))
    gm = gradient_map(t, [(0, (52, 40, 20)), (0.35, (128, 104, 62)), (0.7, (178, 152, 96)), (1, (212, 190, 130))])
    x = np.arange(W)
    d = np.minimum(x % (W // 10), (W // 10) - x % (W // 10))  # vzdálenost od vazby (px)
    bind = 1 - 0.38 * np.exp(-((d / 2.5) ** 2)) + 0.06 * np.clip(d / 50, 0, 1)
    yy = np.linspace(-1, 1, h_px)[:, None]
    return gm * (bind[None, :] * (0.84 + 0.2 * (1 - yy**2)))[..., None]


def band_daub(h_px, zmin):
    """Mazanice: světle teple okrová šedá, jemná nerovnost, u země ostřik hlíny."""
    pl = crop("plaster")
    pl = resize(pl, pl.shape[1] * 1.5, pl.shape[0] * 1.5)  # 384 × 147
    tile = seamless_v(seamless_h(pl, W // 3), 110)
    a = tile_v(tile_h(tile), h_px)
    gm = gradient_map(a, [(0, (124, 98, 66)), (0.3, (170, 142, 104)), (0.65, (202, 177, 135)), (1, (228, 208, 168))])
    # jen jemný detail omítky (horní propust) – skvrny velikosti dlaždice by se opakovaly v mřížce
    gm = 0.75 * (gm - blur(gm, 10)) + np.array([190, 165, 124], dtype=np.float32) / 255.0
    # nerovnost: skvrny (různě vlhká / jinak namíchaná hlína) a vodorovné šmouhy po uhlazení dlaní
    n = value_noise(h_px, W, [(6, 3, 1), (14, 7, 0.6), (40, 18, 0.35)], 21)
    smear = value_noise(h_px, W, [(10, 40, 1), (24, 90, 0.5)], 22)
    gm *= (1 + 0.06 * n + 0.035 * smear)[..., None]
    # ostřik hlíny u země (z 0–0,35 m), nepravidelná horní hrana
    mud = load(os.path.join(TERRAIN, "mud.jpg"))
    mud = tile_v(tile_h(resize(mud[:256, :256], 512, 512)), h_px)
    z = zmin + (h_px - 1 - np.arange(h_px)) / PXM  # řádek → výška (m)
    edge = 0.3 + 0.08 * value_noise(1, W, [(12, 1, 1), (31, 1, 0.6), (70, 1, 0.4)], 5)[0]
    f = 0.65 * smoothstep(edge[None, :], np.zeros((1, W)), z[:, None])
    gm = gm * (1 - f[..., None]) + mud * 0.85 * f[..., None]
    return gm


def band_bark(h_px):
    b = crop("bark")
    rot = np.rot90(b, 1)  # kůra vodorovně
    r = resize(rot, rot.shape[1] * h_px / rot.shape[0], h_px)
    t = tile_h(seamless_h(r, W // 3))
    # starší dřevo: tmavší, méně syté
    g = lum(t)[..., None]
    t = (t * 0.7 + g * 0.3) * 0.85
    yy = np.linspace(-1, 1, h_px)[:, None, None]
    return t * (0.85 + 0.2 * (1 - yy**2))


def band_logs_rot(h_px, log_px):
    """Boky přečnívajících trámů na nárožích: trámy svisle v obrázku (U = výška stěny)."""
    b = crop("bark")  # kůra svisle
    n = W // log_px
    lw = W / n
    out = np.zeros((h_px, W, 3), dtype=np.float32)
    col = resize(b, int(math.ceil(lw)) + 1, b.shape[0] * (lw / b.shape[1]))
    for i in range(n):
        x0 = int(round(i * lw))
        x1 = int(round((i + 1) * lw))
        off = int(rng.integers(0, col.shape[0] - h_px))
        seg = col[off : off + h_px, : x1 - x0]
        xx = np.linspace(-1, 1, x1 - x0)[None, :, None]
        out[:, x0:x1] = seg * (0.35 + 0.75 * np.sqrt(np.clip(1 - xx**2, 0, 1)))
    return out * 0.9


def band_logends(h_px, log_px):
    le = crop("logends")  # 9 čel
    n9 = 9
    w9 = W / (W // log_px) * n9
    r = resize(le, w9, le.shape[0] * w9 / le.shape[1])
    off = (r.shape[0] - h_px) // 2
    r = r[off : off + h_px]
    g = lum(r)[..., None]
    return tile_h((r * 0.75 + g * 0.25) * 0.72)


def band_firewood(h_px):
    fw = crop("firewood")
    r = resize(fw, fw.shape[1] * 2.2, fw.shape[0] * 2.2)
    t = seamless_v(seamless_h(r, W // 8), 52)
    t = tile_v(tile_h(t), h_px)
    return (t * 0.7 + lum(t)[..., None] * 0.3) * 0.85  # méně křiklavě oranžová


def band_wattle(h_px):
    wt = crop("wattle")
    r = resize(wt, 144, 144)
    t = seamless_v(seamless_h(r, 128), 128)
    a = tile_v(tile_h(t), h_px)
    g = lum(a)[..., None]
    return a * 0.8 + g * 0.2


def band_turf(h_px, earthy):
    grass = load(os.path.join(TERRAIN, "grass.jpg"))
    mud = load(os.path.join(TERRAIN, "mud.jpg"))
    g = tile_v(tile_h(resize(grass[:512, :512], 1024, 1024)), h_px)
    m = tile_v(tile_h(resize(mud[:512, :512], 1024, 1024)), h_px)
    yy = np.linspace(1, 0, h_px)[:, None]  # 0 = pata valu (dole), 1 = hřbet
    n = value_noise(h_px, W, [(10, 2, 1), (26, 4, 0.6), (60, 6, 0.4)], 31)
    if earthy:  # vykopaná hlína u vchodu – hlavně hlína, u paty tráva; teplejší jako udusaná hlína
        f = np.clip(0.35 + 0.65 * yy + 0.25 * n, 0, 1)
        m = m * np.array([1.05, 0.9, 0.74], dtype=np.float32)
    else:  # drny – tráva, na hřbetu prosvítá hlína
        f = np.clip(-0.1 + 0.55 * yy + 0.3 * n, 0, 0.75)
    return g * (1 - f[..., None]) + m * f[..., None] * 0.95


def region_trench():
    """Dno vstupní šíje: tmavší udusaná hlína se třemi schody (tmavé hrany stupňů)."""
    if TRENCH:
        return resize(load(TRENCH), 120, 192)
    t = resize(load(os.path.join(TERRAIN, "mud.jpg"))[:512, :256], 256, 512) * 0.55
    t = t * np.array([1.0, 0.9, 0.75], dtype=np.float32)
    for row in (100, 212, 322):
        t[row : row + 12] *= 0.35
    return resize(t, 120, 192)


# ---------------------------------------------------------------- skladba

def main():
    os.makedirs(OUT, exist_ok=True)
    atlas = np.zeros((H, W, 3), dtype=np.float32)
    meta = {"W": W, "H": H, "uperiod_m": W / PXM, "bands": {}, "regions": {}}
    cursor = 0
    LOG_PX = 28  # ≈ 0,22 m

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

    meta["thatch_courses"] = thatch_courses(3.75, 0.45)
    put_band("thatch", band_thatch(px(3.75), meta["thatch_courses"]), 0.0, 3.75)
    put_band("thatch_edge", band_thatch_edge(px(0.5)), 0.0, 0.5)
    put_band("ridge", band_ridge(px(1.0)), -0.5, 0.5)
    put_band("daub", band_daub(px(3.4), -0.6), -0.6, 2.8)
    put_band("beam", band_bark(48), -24 / PXM, 24 / PXM)
    put_band("logs_rot", band_logs_rot(64, LOG_PX), -0.25, 0.25)
    put_band("logends", band_logends(32, LOG_PX), -0.125, 0.125)
    put_band("firewood", band_firewood(104), 0.0, 104 / PXM)
    put_band("wattle", band_wattle(120), 0.0, 120 / PXM)
    put_band("turf", band_turf(80, False), 0.0, 80 / PXM)
    put_band("spoil", band_turf(80, True), 0.0, 80 / PXM)

    # oblasti bez opakování (normalizované UV 0–1 uvnitř obdélníku)
    r0 = cursor + GUT
    x = GUT
    basket = load(BASKET)
    regions = {
        "trench": region_trench(),
        "basket": resize(basket, 64, 128),
        "earth": resize(load(os.path.join(TERRAIN, "mud.jpg"))[:512, :512], 128, 128),
        "dark": np.full((32, 32, 3), [0.035, 0.028, 0.022], dtype=np.float32),
    }
    for name, img in regions.items():
        h, w = img.shape[:2]
        padded = np.pad(img, ((GUT, GUT), (GUT, GUT), (0, 0)), mode="edge")
        atlas[r0 - GUT : r0 + h + GUT, x - GUT : x + w + GUT] = padded
        meta["regions"][name] = {"x0": x, "x1": x + w, "r0": r0, "r1": r0 + h}
        x += w + 2 * GUT
    cursor = r0 + max(img.shape[0] for img in regions.values()) + GUT
    assert cursor <= H, cursor
    meta["used_rows"] = cursor
    # zbytek atlasu – opakovat poslední řádek (ať mipmapy nemají černou)
    atlas[cursor:] = atlas[cursor - 1]

    img = Image.fromarray(np.clip(atlas * 255, 0, 255).astype(np.uint8))
    img.save(os.path.join(OUT, "atlas.png"))
    img.save(os.path.join(OUT, "atlas.jpg"), quality=88)
    img.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, "atlas_preview.jpg"), quality=85)
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(json.dumps(meta))


def check_crops(out):
    """Náhled zdrojových atlasů s vyznačenými výřezy (zeleně) a logem (červeně)."""
    from PIL import ImageDraw

    for path in (C1, C0):
        im = Image.open(path).convert("RGB")
        d = ImageDraw.Draw(im)
        for name, (p, box) in CROPS.items():
            if p == path:
                d.rectangle(box, outline=(0, 255, 0), width=2)
                d.text((box[0] + 3, box[1] + 3), name, fill=(0, 255, 0))
        if LOGO[0] == path:
            d.rectangle(LOGO[1], outline=(255, 0, 0), width=3)
        im.save(os.path.join(out, "crops_" + os.path.basename(path)))


if __name__ == "__main__":
    main()
    check_crops(OUT)
