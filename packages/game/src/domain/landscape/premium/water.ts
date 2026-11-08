import { length2, scatterHash } from '../det-math';
import { distanceToMask } from '../grid';
import { deriveSeed } from '../random';
import { buildRelief } from '../relief';
import { skeletonRoute } from '../skeleton/route';
import { streamCenterline, streamStations } from '../stream-geometry';
import type { Terrain } from '../terrain';
import { promontoriesOf, SURFACE_CODES, type Landscape, type StreamPoint } from '../types';
import { sampleTilesAtWorld, tileCenterWorld, tileOfWorldPoint } from '../world';
import type { PremiumPass, PremiumPassContext } from './generate';
import { ellipseOutline, streamPointWorld, type WorldPoint } from './geometry';
import {
  addConfluence,
  addSideRiver,
  addSkeletonConfluence,
  addSkeletonFordHill,
  landRegion,
  NAVIGABLE_FLOODPLAIN_CELLS,
  RIVER,
} from './river';
import {
  cellWorld,
  cellXY,
  lineKeepsAway,
  lineToEdges,
  onBorder,
  routeLeg,
  skeletonRouteSite,
  smoothLine,
  trailCellCost,
  VILLAGE_ROUTE,
  villageBypass,
} from './route';
import { promontorySiteOf } from './relief';
import type { PremiumSite, PremiumType } from './types';

// Prémiové typy vody (premium-landscapes.md – Typy krajin): splavná řeka, vyvýšenina nad brodem
// se stezkou, soutok, zlatonosný potok, solný a posvátný pramen. Řeka mění terén (`river.ts`),
// ostatní typy jen označí místa v průměrné krajině (náplavy, prameny) a posvátný pramen dostane
// ve vrstvě překážek skalku (`springRockPlacements`). Prvky hledá server i prohlížeč z krajiny
// s přesností prohlížeče – jen det-math. Hodnoty jsou návrh Clauda, doladí je kalibrace.

const { water: WATER, forest: FOREST, meadow: MEADOW } = SURFACE_CODES;

/**
 * Zlatonosný potok: 3–6 náplavů zlatonosného písku na vnitřní straně oblouků potoka – nejostřejší
 * oblouky (stočení toku aspoň `minTurnRad` na ± 40 m), aspoň `spacingM` od sebe, dál než
 * `villageMinM` od vsi. Náplav leží `bankM` za okrajem vody, obrys je čočka podél břehu.
 */
export const GOLD_PLACERS = {
  count: [3, 6],
  minTurnRad: 0.6,
  spacingM: 150,
  villageMinM: 200,
  edgeM: 60,
  bankM: 3,
  halfLengthM: 15,
  halfWidthM: 5,
} as const;

/**
 * Prameny: do 700 m od vsi (aspoň 200 m – mimo pole u vsi), nejraději kolem 450 m. Solný pramen
 * (slanisko) na rovné louce u potoka `saltBankM` od okraje vody; posvátný pramen na okraji lesa
 * pod svahem ve skalce – výchoz a balvany do `rockRadiusM`, do `clearingM` kolem pramene nic.
 */
export const SPRINGS = {
  minDistanceM: 200,
  maxDistanceM: 700,
  targetM: 450,
  edgeM: 60,
  saltBankM: 6,
  saltMaxSlope: 0.05,
  sacredSlope: [0.03, 0.2],
  sacredWaterCells: 3,
  rockRadiusM: 5,
  clearingM: 4,
} as const;

/**
 * Stezka přes brod (ford-hill): kolem vsi jako každá stezka (`VILLAGE_ROUTE` – nejblíž 150 m,
 * bod obejití ≈ 200 m od vsi); kolem brodu smí k vodě.
 */
export const FORD_ROUTE = {
  ...VILLAGE_ROUTE,
  /** Kolem brodu se smí k vodě (políčka). */
  fordReachCells: 3,
} as const;

function villageWorld(l: Landscape): { x: number; z: number } {
  return tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
}

function half(l: Landscape): number {
  return (l.size * l.cellSizeM) / 2;
}

function surfaceAtWorld(l: Landscape, x: number, z: number): number | null {
  const tile = tileOfWorldPoint(l, x, z);
  return tile ? l.surface[tile.y * l.size + tile.x]! : null;
}

function insideMap(l: Landscape, x: number, z: number, margin: number): boolean {
  const h = half(l) - margin;
  return x >= -h && x <= h && z >= -h && z <= h;
}

/** Mapa vody z povrchu. */
function waterMask(l: Landscape): Uint8Array {
  return l.surface.map((v) => (v === WATER ? 1 : 0));
}

/** Políčko bodu ve světě (oříznuté na krajinu). */
function cellOf(l: Landscape, x: number, z: number): number {
  const h = half(l);
  const tx = Math.min(l.size - 1, Math.max(0, Math.floor((x + h) / l.cellSizeM)));
  const ty = Math.min(l.size - 1, Math.max(0, Math.floor((z + h) / l.cellSizeM)));
  return ty * l.size + tx;
}

// ── Řeka: prvky ──────────────────────────────────────────────────────────────────────────────

/** Středy brodů – souvislé úseky mělčin na ose řeky (index bodu uprostřed). */
function fordCenters(river: readonly StreamPoint[]): number[] {
  const centers: number[] = [];
  let start = -1;
  river.forEach((p, k) => {
    if (p.shallow && start < 0) start = k;
    if ((!p.shallow || k === river.length - 1) && start >= 0) {
      const end = p.shallow ? k : k - 1;
      centers.push(Math.round((start + end) / 2));
      start = -1;
    }
  });
  return centers;
}

/** Řeka a její brody jako prvky typu – řeka prémie (`l.river`), nebo hlavní tok kostry. */
function riverSites(
  l: Landscape,
  river: readonly StreamPoint[] | undefined = l.river,
): PremiumSite[] | null {
  if (!river || river.length < 2) return null;
  const line = lineToEdges(
    l,
    river.map((p) => streamPointWorld(l, p)),
  );
  const middle = line[Math.floor(line.length / 2)]!;
  const sites: PremiumSite[] = [{ kind: 'river', x: middle[0], z: middle[1], line }];
  for (const k of fordCenters(river)) {
    const [x, z] = streamPointWorld(l, river[k]!);
    sites.push({ kind: 'ford', x, z });
  }
  return sites;
}

/** Jednotková normála osy (levá strana) v bodě `k` ve světě. */
function leftNormal(points: readonly StreamPoint[], k: number): { x: number; z: number } {
  const a = points[Math.max(0, k - 1)]!;
  const b = points[Math.min(points.length - 1, k + 1)]!;
  const length = length2(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / length, z: (b.x - a.x) / length };
}

/**
 * Místo pro přístaviště: na břehu řeky na straně vsi (souš dosažitelná z místa vsi), u bodu
 * řeky nejblíž vsi – `RIVER.portBankM` za okrajem vody. Řeka prémie, nebo hlavní tok kostry.
 */
function portSite(l: Landscape, river: readonly StreamPoint[] = l.river!): PremiumSite | null {
  const village = villageWorld(l);
  const side = landRegion(waterMask(l), l.size, l.villageSite);
  const order = river
    .map((p, k) => {
      const [x, z] = streamPointWorld(l, p);
      return { k, d: length2(x - village.x, z - village.z) };
    })
    .sort((a, b) => a.d - b.d || a.k - b.k);
  for (const { k } of order.slice(0, 80)) {
    const p = river[k]!;
    const [x, z] = streamPointWorld(l, p);
    const n = leftNormal(river, k);
    for (const s of [1, -1] as const) {
      const reach = (s > 0 ? p.halfWidthLeft : p.halfWidthRight) * l.cellSizeM + RIVER.portBankM;
      const px = x + n.x * s * reach;
      const pz = z + n.z * s * reach;
      if (!insideMap(l, px, pz, l.cellSizeM)) continue;
      if (side[cellOf(l, px, pz)]) return { kind: 'port', x: px, z: pz };
    }
  }
  return null;
}

/** Ostrožna daného druhu z dat krajiny jako prvek typu (obrys plochy nahoře). */
function promontorySite(l: Landscape, kind: 'ford-hill' | 'confluence'): PremiumSite | null {
  const promontory = promontoriesOf(l).find((p) => p.kind === kind);
  if (!promontory) return null;
  return promontorySiteOf(l, promontory);
}

// ── Stezka přes brod ─────────────────────────────────────────────────────────────────────────

/**
 * Stezka přes brod pod vyvýšeninou: od okraje mapy na straně vsi kolem vsi (nejblíž 150 m –
 * bodem obejití `passCells` od vsi, bokem ke směru od brodu) k brodu, přes něj a na druhém
 * břehu k okraji. Hledá se po políčkách souše (sklon a les zdražují) mimo břehy (kromě brodu);
 * vyhlazená, konce na okraji mapy.
 */
function fordRoute(l: Landscape, ford: number): WorldPoint[] | null {
  const { size } = l;
  const river = l.river!;
  const water = waterMask(l);
  const nearWater = distanceToMask(water, size);
  const p = river[ford]!;
  const n = leftNormal(river, ford);
  const village = l.villageSite;
  const side = landRegion(water, size, village);
  // Břehy brodu: jeden na straně vsi, druhý za řekou.
  const bankCell = (s: 1 | -1): number => {
    const reach = (s > 0 ? p.halfWidthLeft : p.halfWidthRight) + 1.5;
    const x = Math.min(size - 1, Math.max(0, Math.round(p.x + n.x * s * reach)));
    const y = Math.min(size - 1, Math.max(0, Math.round(p.y + n.z * s * reach)));
    return y * size + x;
  };
  const left = bankCell(1);
  const right = bankCell(-1);
  if (water[left] || water[right]) return null;
  const near = side[left] ? left : side[right] ? right : -1;
  if (near < 0) return null;
  const far = near === left ? right : left;
  if (side[far]) return null;
  const farSide = landRegion(water, size, cellXY(far, size));
  const cellCost = trailCellCost(l);
  const allowedIn =
    (region: Uint8Array) =>
    (i: number): boolean => {
      if (!region[i] || water[i]) return false;
      const c = cellXY(i, size);
      const fordNear = length2(c.x - p.x, c.y - p.y) <= FORD_ROUTE.fordReachCells + 1.5;
      if (nearWater[i]! < 1.5 && !fordNear) return false;
      return length2(c.x - village.x, c.y - village.y) >= FORD_ROUTE.villageMinCells;
    };
  const leg = (from: number, region: Uint8Array, goal: (i: number) => boolean): number[] | null =>
    routeLeg(size, from, allowedIn(region), cellCost, goal);
  const border = (i: number): boolean => onBorder(i, size);
  // Bod obejití vsi: na kružnici kolem vsi bokem ke směru od brodu, na straně vsi.
  const bank = cellXY(near, size);
  const pass = villageBypass(size, village, bank, allowedIn(side));
  if (pass < 0) return null;
  const toPass = leg(near, side, (i) => i === pass);
  // Za obejitím dál od brodu – k okraji za vsí.
  const ux = village.x - bank.x;
  const uy = village.y - bank.y;
  const beyondVillage = (i: number): boolean => {
    const c = cellXY(i, size);
    return border(i) && (c.x - village.x) * ux + (c.y - village.y) * uy > 0;
  };
  const onward = leg(pass, side, beyondVillage) ?? leg(pass, side, border);
  const across = leg(far, farSide, border);
  if (!toPass || !onward || !across) return null;
  const toWorld = (i: number): WorldPoint => cellWorld(l, i);
  const [fx, fz] = streamPointWorld(l, p);
  // Od okraje za vsí přes obejití k brodu, přes brod a za řekou k okraji.
  const villageLeg = [...[...onward].reverse(), ...[...toPass].reverse().slice(1)].map(toWorld);
  const legA = smoothLine(villageLeg, 2);
  const legB = smoothLine(across.map(toWorld), 2);
  const line = lineToEdges(l, [...legA, [fx, fz], ...legB]);
  return lineKeepsAway(line, villageWorld(l), FORD_ROUTE.villageMinM) ? line : null;
}

// ── Průchody typů s řekou ────────────────────────────────────────────────────────────────────

function riverSeed(ctx: PremiumPassContext): number {
  return deriveSeed(ctx.seed, 'river');
}

const navigableRiver = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    return addSideRiver(terrain, riverSeed(ctx), {
      floodplainCells: NAVIGABLE_FLOODPLAIN_CELLS,
      fordHill: false,
    });
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const sites = riverSites(landscape);
    const port = sites ? portSite(landscape) : null;
    return sites && port ? [...sites, port] : null;
  },
} satisfies PremiumPass;

const fordHill = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    return addSideRiver(terrain, riverSeed(ctx), {
      floodplainCells: RIVER.floodplainCells,
      fordHill: true,
    });
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const sites = riverSites(landscape);
    const hill = promontorySite(landscape, 'ford-hill');
    if (!sites || !hill) return null;
    // Brod pod vyvýšeninou – nejblíž ostrožně.
    const river = landscape.river!;
    let ford = -1;
    let best = Infinity;
    for (const k of fordCenters(river)) {
      const [x, z] = streamPointWorld(landscape, river[k]!);
      const d = length2(x - hill.x, z - hill.z);
      if (d < best) {
        best = d;
        ford = k;
      }
    }
    if (ford < 0) return null;
    const line = fordRoute(landscape, ford);
    if (!line) return null;
    const middle = line[Math.floor(line.length / 2)]!;
    return [...sites, hill, { kind: 'route', x: middle[0], z: middle[1], line }];
  },
} satisfies PremiumPass;

const confluence = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    return addConfluence(terrain, riverSeed(ctx));
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const sites = riverSites(landscape);
    const spur = promontorySite(landscape, 'confluence');
    if (!sites || !spur) return null;
    const [x, z] = streamPointWorld(landscape, landscape.stream.at(-1)!);
    return [...sites, { kind: 'confluence', x, z }, spur];
  },
} satisfies PremiumPass;

// ── Prémie na kostře (premium: 2) ────────────────────────────────────────────────────────────

/**
 * Řeka kostry na místě „řeka“ (jeden vtok, jeden výtok – `SKELETON_PREMIUM_SLOTS`): hlavní tok
 * je jediná řeka mapy. Mapa bez řeky kostry (trasa nevedla) undefined.
 */
function skeletonRiver(l: Landscape): readonly StreamPoint[] | undefined {
  return l.rivers?.[0];
}

/**
 * Splavná řeka na kostře (world-skeleton.md – Mapa z kostry): řeka z výřezu se širší rovnou nivou
 * (terén mapy z kostry znovu s `NAVIGABLE_FLOODPLAIN_CELLS`) a přístaviště na břehu na straně vsi.
 */
const skeletonNavigableRiver = {
  skeletonTerrainOptions: { floodplainCells: NAVIGABLE_FLOODPLAIN_CELLS },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const river = skeletonRiver(landscape);
    const sites = riverSites(landscape, river);
    const port = sites && river ? portSite(landscape, river) : null;
    return sites && port ? [...sites, port] : null;
  },
} satisfies PremiumPass;

/**
 * Soutok na kostře: potok mapy už do řeky kostry ústí (přítok), průchod přidá jen ostrožnu mezi
 * řekou a potokem nad ústím potoka (`addSkeletonConfluence`).
 */
const skeletonConfluence = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    return addSkeletonConfluence(terrain, riverSeed(ctx));
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const sites = riverSites(landscape, skeletonRiver(landscape));
    const spur = promontorySite(landscape, 'confluence');
    if (!sites || !spur) return null;
    const [x, z] = streamPointWorld(landscape, landscape.stream.at(-1)!);
    return [...sites, { kind: 'confluence', x, z }, spur];
  },
} satisfies PremiumPass;

/**
 * Vyvýšenina nad brodem na kostře: řeka kostry s jediným brodem (terén mapy z kostry znovu se
 * `singleFord`), takže stezka kostry řeku přejde právě jím, a ostrožna nad ním
 * (`addSkeletonFordHill`). Prvky řeka a brod, ostrožna a stezka kostry (`skeletonRoute`, ne vlastní
 * stezka) – jen když trasa opravdu vede brodem pod ostrožnou.
 */
const skeletonFordHill = {
  skeletonTerrainOptions: { singleFord: true },
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    return addSkeletonFordHill(terrain, riverSeed(ctx));
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const river = skeletonRiver(landscape);
    const sites = riverSites(landscape, river);
    const hill = promontorySite(landscape, 'ford-hill');
    const route = skeletonRoute(landscape);
    if (!river || !sites || !hill || !route) return null;
    // Brod pod vyvýšeninou – nejblíž ostrožně; trasa jím musí vést.
    const ford = fordCenters(river)
      .map((k) => streamPointWorld(landscape, river[k]!))
      .reduce<WorldPoint | null>(
        (best, p) =>
          !best ||
          length2(p[0] - hill.x, p[1] - hill.z) < length2(best[0] - hill.x, best[1] - hill.z)
            ? p
            : best,
        null,
      );
    const crossed =
      ford !== null &&
      route.fords.some(([x, z]) => length2(x - ford[0], z - ford[1]) <= landscape.cellSizeM);
    const trail = skeletonRouteSite(route);
    return crossed && trail ? [...sites, hill, trail] : null;
  },
} satisfies PremiumPass;

/** Průchody typů vody na kostře (prémiový průchod 2). */
export const SKELETON_WATER_PASSES = {
  'navigable-river': skeletonNavigableRiver,
  confluence: skeletonConfluence,
  'ford-hill': skeletonFordHill,
} satisfies Partial<Record<PremiumType, PremiumPass>>;

// ── Zlatonosný potok ─────────────────────────────────────────────────────────────────────────

/** Náplavy zlatonosného písku na vnitřní straně nejostřejších oblouků potoka. */
export function goldPlacerSites(l: Landscape): PremiumSite[] | null {
  const stream = streamCenterline(l);
  const points = stream.points;
  const village = villageWorld(l);
  const window = 6;
  const apexes: number[] = [];
  for (let k = 1; k < points.length - 1; k++) {
    const turn = Math.abs(points[k]!.turn);
    if (turn < GOLD_PLACERS.minTurnRad) continue;
    let peak = true;
    for (let j = Math.max(0, k - window); j <= Math.min(points.length - 1, k + window); j++) {
      const other = Math.abs(points[j]!.turn);
      if (other > turn || (other === turn && j < k)) {
        peak = false;
        break;
      }
    }
    if (peak) apexes.push(k);
  }
  apexes.sort((a, b) => Math.abs(points[b]!.turn) - Math.abs(points[a]!.turn) || a - b);
  const sites: PremiumSite[] = [];
  for (const k of apexes) {
    if (sites.length >= GOLD_PLACERS.count[1]) break;
    const p = points[k]!;
    const a = points[k - 1]!;
    const b = points[k + 1]!;
    const length = length2(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / length;
    const tz = (b.z - a.z) / length;
    // Vnitřní strana: doleva při stočení doleva (kladné), jinak doprava.
    const s = p.turn > 0 ? 1 : -1;
    const half0 = s > 0 ? p.halfLeft : p.halfRight;
    const x = p.x - tz * s * (half0 + GOLD_PLACERS.bankM);
    const z = p.z + tx * s * (half0 + GOLD_PLACERS.bankM);
    if (!insideMap(l, x, z, GOLD_PLACERS.edgeM)) continue;
    if (length2(x - village.x, z - village.z) < GOLD_PLACERS.villageMinM) continue;
    if (sites.some((o) => length2(o.x - x, o.z - z) < GOLD_PLACERS.spacingM)) continue;
    // Musí to být opravdu vnitřní břeh oblouku u vody (jinde podle osy nejblíž jiný úsek).
    const here = stream.nearest(x, z);
    if (here.innerBend <= 0.3 || Math.abs(here.bankDistance) > GOLD_PLACERS.bankM + 3) continue;
    sites.push({ kind: 'gold-placer', x, z, outline: lens(x, z, tx, tz) });
  }
  return sites.length >= GOLD_PLACERS.count[0] ? sites : null;
}

/** Čočka náplavu podél břehu (8 vrcholů). */
function lens(x: number, z: number, tx: number, tz: number): WorldPoint[] {
  return ellipseOutline(x, z, tx, tz, GOLD_PLACERS.halfLengthM, GOLD_PLACERS.halfWidthM);
}

const goldStream = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    return goldPlacerSites(landscape);
  },
} satisfies PremiumPass;

// ── Solný pramen ─────────────────────────────────────────────────────────────────────────────

/**
 * Solný pramen (slanisko u potoka): rovná louka u potoka do 700 m od vsi, nejraději na straně vsi
 * a kolem 450 m. Krajina zůstane průměrná – slanisko je místo na mokré louce u vody, kde se pole
 * nezakládá (návrh Clauda).
 */
export function saltSpringSite(l: Landscape): PremiumSite | null {
  const stream = streamCenterline(l);
  const relief = buildRelief(l);
  const village = villageWorld(l);
  const side = landRegion(waterMask(l), l.size, l.villageSite);
  let best: { x: number; z: number; score: number } | null = null;
  for (const station of streamStations(stream, 15)) {
    for (const s of [1, -1] as const) {
      const here = stream.nearest(station.x + station.nx * s, station.z + station.nz * s);
      if (!Number.isFinite(here.distance)) continue;
      const reach = here.halfWidth + SPRINGS.saltBankM;
      const x = station.x + station.nx * s * reach;
      const z = station.z + station.nz * s * reach;
      if (!insideMap(l, x, z, SPRINGS.edgeM)) continue;
      const d = length2(x - village.x, z - village.z);
      if (d < SPRINGS.minDistanceM || d > SPRINGS.maxDistanceM) continue;
      if (surfaceAtWorld(l, x, z) !== MEADOW) continue;
      if (stream.nearest(x, z).bankDistance > SPRINGS.saltBankM + 0.5) continue;
      const slope = relief.slopeAt(x, z);
      if (slope > SPRINGS.saltMaxSlope) continue;
      const score =
        Math.abs(d - SPRINGS.targetM) / 250 + slope * 10 + (side[cellOf(l, x, z)] ? 0 : 1);
      if (!best || score < best.score) best = { x, z, score };
    }
  }
  return best ? { kind: 'salt', x: best.x, z: best.z } : null;
}

const saltSpring = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const salt = saltSpringSite(landscape);
    return salt ? [salt] : null;
  },
} satisfies PremiumPass;

// ── Posvátný pramen ──────────────────────────────────────────────────────────────────────────

/** Posvátný pramen – políčko (pro id skalky), pata pramene a směr do svahu nad ním. */
export interface SacredSpringSpot {
  readonly cell: number;
  readonly x: number;
  readonly z: number;
  /** Jednotkový směr do svahu (vodorovně) – tam je skalka. */
  readonly uphillX: number;
  readonly uphillZ: number;
}

const springCache = new WeakMap<Landscape, SacredSpringSpot | null>();

/**
 * Posvátný pramen krajiny typu `sacred-spring` (návrh Clauda): na okraji lesa pod mírným svahem
 * do 700 m od vsi (aspoň 200 m – mimo pole), dál od vody (pramen má vlastní vývěr); skalku
 * kolem něj přidá vrstva překážek (`springRockPlacements`). Čistá funkce krajiny a seedu vrstvy
 * překážek – rozmisťovač i prvky typu vyjdou stejně na serveru i v prohlížeči. Jiný typ null.
 */
export function sacredSpringSpot(landscape: Landscape): SacredSpringSpot | null {
  if (landscape.premium !== 'sacred-spring' || landscape.obstacleLayer === null) return null;
  const cached = springCache.get(landscape);
  if (cached !== undefined) return cached;
  const spot = findSacredSpring(landscape);
  springCache.set(landscape, spot);
  return spot;
}

function findSacredSpring(l: Landscape): SacredSpringSpot | null {
  const { size, surface } = l;
  const relief = buildRelief(l);
  const water = distanceToMask(waterMask(l), size);
  const village = villageWorld(l);
  const hash = scatterHash(deriveSeed(l.obstacleLayer!.seed, 'sacred-spring'));
  let best: { cell: number; score: number } | null = null;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (surface[i] !== FOREST || water[i]! < SPRINGS.sacredWaterCells) continue;
      const edge =
        surface[i - 1] === MEADOW ||
        surface[i + 1] === MEADOW ||
        surface[i - size] === MEADOW ||
        surface[i + size] === MEADOW;
      if (!edge) continue;
      const c = tileCenterWorld(l, x, y);
      if (!insideMap(l, c.x, c.z, SPRINGS.edgeM)) continue;
      const d = length2(c.x - village.x, c.z - village.z);
      if (d < SPRINGS.minDistanceM || d > SPRINGS.maxDistanceM) continue;
      const slope = relief.slopeAt(c.x, c.z);
      if (slope < SPRINGS.sacredSlope[0] || slope > SPRINGS.sacredSlope[1]) continue;
      const score =
        Math.abs(d - SPRINGS.targetM) / 250 + Math.abs(slope - 0.1) * 5 + hash(x, y, 1) * 0.3;
      if (!best || score < best.score) best = { cell: i, score };
    }
  }
  if (!best) return null;
  const x = best.cell % size;
  const y = Math.floor(best.cell / size);
  const c = tileCenterWorld(l, x, y);
  // Směr do svahu z výšek kolem (± 5 m).
  const h = (dx: number, dz: number): number =>
    sampleTilesAtWorld(l, l.heights, c.x + dx, c.z + dz);
  const gx = h(5, 0) - h(-5, 0);
  const gz = h(0, 5) - h(0, -5);
  const g = length2(gx, gz);
  return {
    cell: best.cell,
    x: c.x,
    z: c.z,
    uphillX: g > 0 ? gx / g : 1,
    uphillZ: g > 0 ? gz / g : 0,
  };
}

const sacredSpring = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const spot = sacredSpringSpot(landscape);
    return spot ? [{ kind: 'spring', x: spot.x, z: spot.z }] : null;
  },
} satisfies PremiumPass;

/** Průchody typů vody (registr `PREMIUM_PASSES` v `generate.ts`). */
export const WATER_PASSES = {
  'navigable-river': navigableRiver,
  'gold-stream': goldStream,
  confluence,
  'ford-hill': fordHill,
  'salt-spring': saltSpring,
  'sacred-spring': sacredSpring,
};
