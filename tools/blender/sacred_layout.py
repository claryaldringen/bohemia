"""Půdorys svatyně a modly (metry, souřadnice Blenderu: předek v −Y) – sdílí ho model
(tools/blender/sacred.py) i malovaná mapa země v atlasu (tools/blender/sacred_atlas.py),
ať okraje příkopu v textuře sedí s geometrií. Čistý Python bez bpy a numpy.

Úhel a: 0 = předek (−Y), roste po směru +X; bod ve směru a ve vzdálenosti r je
(r · sin a, −r · cos a).
"""
import math

N_PETALS = 8  # výběžky příkopu (okvětí)
R_PAVE = 1.75  # kamenná dlažba kolem modly
R_TOP = 10.5  # okraj vyvýšené plochy (Ø 21 m)
Z_TOP = 0.45  # výška plochy nad terénem
R_IN = 11.1  # vnitřní okraj dna příkopu
Z_BOT = 0.05  # dno příkopu – těsně nad terénem (nad obtisky ušlapané trávy)
R_CUSP = 12.1  # vnější okraj dna mezi výběžky (hroty okvětí na osách a úhlopříčkách)
R_TIP = 13.9  # vnější okraj dna ve vrcholu výběžku
# val za příkopem: (odstup od vnějšího okraje dna, výška) – od paty vnější stěny po patu valu
BANK = [(0.0, Z_BOT), (0.45, 0.28), (0.62, 0.33), (1.0, 0.18), (1.35, -0.06)]
R_FIRE = (R_IN + R_TIP) / 2  # ohniště uprostřed výběžku
SHRINE_HALF = 15.3  # polovina strany čtverce, přes který je mapa země svatyně (oblast atlasu)

IDOL_GROUND_R = 2.0  # udusaný kruh modly (okraj drnu sahá o 0,2 m dál)
IDOL_HALF = 2.3  # polovina strany čtverce mapy země modly


def petal_angle(k):
    """Směr vrcholu výběžku k (0–7) – tam je ohniště."""
    return math.pi / N_PETALS + k * 2 * math.pi / N_PETALS


def petal_circle():
    """Kružnice oblouku výběžku: hroty na R_CUSP (±22,5°), vrchol na R_TIP (0°).
    Vrací vzdálenost středu kružnice od středu svatyně a její poloměr."""
    xc = R_CUSP * math.cos(math.pi / N_PETALS)
    d = (R_TIP**2 - R_CUSP**2) / (2 * (R_TIP - xc))
    return d, R_TIP - d


def r_out(a):
    """Vnější okraj dna příkopu ve směru a: osm oblouků, hroty mezi výběžky na a = k · 45°,
    vrcholy výběžků na 22,5° + k · 45°."""
    d, rho = petal_circle()
    phi = (a % (2 * math.pi / N_PETALS)) - math.pi / N_PETALS
    return d * math.cos(phi) + math.sqrt(rho * rho - (d * math.sin(phi)) ** 2)


def polar(x, y):
    """Bod (x, y) → (r, a) v úmluvě nahoře."""
    return math.hypot(x, y), math.atan2(x, -y) % (2 * math.pi)
