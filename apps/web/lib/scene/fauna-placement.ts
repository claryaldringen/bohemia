import { SURFACE_CODES, type ForestField, type Landscape } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import type { RenderSurface } from './render-surface';
import {
  streamStations,
  waterClarity,
  waterVisibilityM,
  type StreamCenterline,
  type StreamSample,
} from './stream-geometry';
import { tileAt } from './tile-at';
import { iceFlowSpeed } from './water-ice';

// Ryby a ptáci jsou jen ozdoba krajiny (podle 0 A.D.: fauna/fish*, fauna/crow_circle, hawk) –
// žádná herní mechanika. Rozmístění je deterministické: stejná krajina = stejná zvířata.

/** Ryba v hejnu. Hejno krouží po elipse jako hejno ryb v 0 A.D. (fish_shoal_idle_01). */
export interface FishMember {
  /** Kde na dráze ryba je (rad) – ryby hejna plavou kousek za sebou. */
  phase: number;
  /** Násobek poloos dráhy – každá ryba plave po trochu jiném kole. */
  radius: number;
  /** Hloubka pod hladinou (m) – hlouběji je ryba hůř vidět. */
  depthM: number;
  scale: number;
}

export interface FishSchool {
  /** Střed dráhy (svět, m). */
  x: number;
  z: number;
  /** Výška hladiny ve scéně (m, s převýšením). */
  surfaceY: number;
  /** Směr toku (jednotkový) – delší osa dráhy. */
  flowX: number;
  flowZ: number;
  /** Poloosy dráhy podél toku a napříč (m). */
  alongM: number;
  acrossM: number;
  /** Směr kroužení (+1 / −1). */
  turn: 1 | -1;
  /** Průměrná rychlost (m/s). */
  speedMps: number;
  /** Do jaké hloubky je ve vodě vidět (m) – průzračnost jako u hladiny (stream-geometry.ts). */
  visibilityM: number;
  /**
   * Rychlost proudu ve středu dráhy pro led (`iceFlowSpeed` z water-ice.ts) – pod zamrzlou
   * hladinou ryby nejsou vidět.
   */
  iceFlow: number;
  /** Číslo hejna pro náhodu v pohybu (skoky). */
  seed: number;
  fish: FishMember[];
}

export type BirdSpecies = 'crow' | 'hawk';

export interface BirdMember {
  /** Úhel na kruhu (rad). */
  phase: number;
  /** Násobek poloměru kroužení. */
  radius: number;
  /** Výška nad rovinou hejna (m). */
  heightM: number;
  scale: number;
}

/** Hejno kroužících ptáků (0 A.D. fauna/crow_circle) nebo osamělý dravec (fauna/hawk). */
export interface BirdFlock {
  species: BirdSpecies;
  /** Střed kroužení (svět, m). */
  x: number;
  z: number;
  /** Výška letu ve scéně (m, absolutní – ptáci nekopírují terén). */
  y: number;
  radiusM: number;
  speedMps: number;
  turn: 1 | -1;
  /** Jak daleko se střed kroužení pomalu unáší (m) – káně ve stoupavém proudu. */
  driftM: number;
  seed: number;
  birds: BirdMember[];
}

/** Stanice podél řeky mají vlastní čísla (los hejna) – nesdílí ho se stanicemi potoka. */
const RIVER_STATION_BASE = 1_000_000;
/** Ryby: krok hledání podél osy potoka (m) a nejvýš tolik hejn. */
const FISH_STEP_M = 10;
const MAX_SCHOOLS = 7;
/** Hejna nejméně tak daleko od sebe (m). */
const SCHOOL_GAP_M = 150;
/** Ne v proudu a na mělčině (rychlost 0–1, mělčina 0–1). */
const FISH_MAX_SPEED = 0.5;
const FISH_MAX_SHALLOW = 0.3;
/** Celá dráha ryb dál od břehu (m) a nad dost hlubokým dnem (m). */
const FISH_BANK_M = 2;
const FISH_MIN_DEPTH_M = 0.6;
/**
 * Poloosa dráhy napříč tokem (m) – v 0 A.D. krouží hejno v poloměru 3,4–5 m – a o kolik je
 * dráha po proudu delší.
 */
const SCHOOL_ACROSS_M = { from: 2.5, to: 5 };
const SCHOOL_STRETCH = 1.6;
/** Rozptyl drah ryb v hejnu (násobek poloos). */
const FISH_RADIUS = { from: 0.8, to: 1.15 };
const FISH_COUNT = { from: 4, to: 8 };
/**
 * Ryby jsou stylizovaně velké (model 0,8 m → 0,8–1,15 m; v 0 A.D. jsou ryby taky přerostlé) –
 * z výchozí kamery (120 m) mají kolem 8 px, z nejbližší (50 m) kolem 20 px.
 */
const FISH_SCALE = { from: 1, to: 1.45 };
/** Hloubka pod hladinou (m) – v kalné vodě je vidět jen ryby u hladiny. */
const FISH_DEPTH_M = { from: 0.06, to: 0.35 };
const FISH_SPEED_MPS = { from: 0.55, to: 0.85 };

/** Ptáci: rozteč kandidátních míst (m), nejvýš tolik hejn vran, rozestup hejn (m). */
const BIRD_GRID_M = 64;
const MAX_CROW_FLOCKS = 4;
const FLOCK_GAP_M = 320;
/** Vrány krouží nad loukou u lesa (m od hranice lesa, záporné v louce). */
const CROW_FOREST_M = { from: -200, to: -15 };
/** Káně loví nad otevřenou loukou dál od lesa. */
const HAWK_FOREST_M = -50;
/** Kroužení: poloměr (m), rychlost letu (m/s), výška nad nejvyšším terénem pod kruhem (m). */
const CROW_RADIUS_M = { from: 18, to: 32 };
const CROW_SPEED_MPS = { from: 9, to: 11 };
const CROW_ALTITUDE_M = { from: 34, to: 52 };
const HAWK_RADIUS_M = { from: 55, to: 80 };
const HAWK_SPEED_MPS = { from: 8, to: 10 };
const HAWK_ALTITUDE_M = { from: 55, to: 72 };
const HAWK_DRIFT_M = 25;
/** Rozptyl ptáků v hejnu: poloměr (násobek) a výška (m). */
const CROW_RADIUS = { from: 0.85, to: 1.12 };
/** Ptáci se od kruhu trochu vzdalují a zase přibližují (násobek poloměru) – fauna-motion.ts. */
export const BIRD_RADIUS_WOBBLE = 0.05;
const CROW_HEIGHT_M = 4;
/**
 * Počty vran v hejnu a jejich četnost podle variant fauna/crow_circle v 0 A.D.: dvakrát po
 * třech (100 + 100), dvě (100), pět (50) a výjimečně deset (5).
 */
const CROW_COUNTS: readonly { count: number; weight: number }[] = [
  { count: 3, weight: 200 },
  { count: 2, weight: 100 },
  { count: 5, weight: 50 },
  { count: 10, weight: 5 },
];
/** Okraj krajiny, přes který kruh nesmí (m). */
const EDGE_MARGIN_M = 30;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function between(range: { from: number; to: number }, t: number): number {
  return range.from + (range.to - range.from) * t;
}

/**
 * Bod dráhy ryby: elipsa protažená po proudu, `radius` je násobek poloos, `theta` úhel (rad).
 * Zapíše ho do `out` (pohyb v každém snímku tak nic nealokuje).
 */
export function fishLoopPoint<T extends { x: number; z: number }>(
  school: Pick<FishSchool, 'x' | 'z' | 'flowX' | 'flowZ' | 'alongM' | 'acrossM'>,
  radius: number,
  theta: number,
  out: T,
): T {
  const along = Math.cos(theta) * school.alongM * radius;
  const across = Math.sin(theta) * school.acrossM * radius;
  out.x = school.x + school.flowX * along - school.flowZ * across;
  out.z = school.z + school.flowZ * along + school.flowX * across;
  return out;
}

/**
 * Hejna ryb v tůních a klidných hlubších úsecích potoka (ne v peřejích a na mělčinách). Každé
 * hejno krouží po vlastní elipse, která se celá vejde do dost hluboké vody dál od břehu.
 */
export function fishSchools(surface: RenderSurface): FishSchool[] {
  const stream = surface.stream;
  const depthAt = (x: number, z: number, near: StreamSample): number =>
    near.level - surface.heightAt(x, z);
  // stanice podél potoka a podél řeky prémiové krajiny (vlastní čísla – jiný los)
  const stations = [
    ...streamStations(stream, FISH_STEP_M),
    ...(surface.river
      ? streamStations(surface.river, FISH_STEP_M).map((station) => ({
          ...station,
          index: station.index + RIVER_STATION_BASE,
        }))
      : []),
  ];
  const candidates = stations
    .map((station) => {
      const near = stream.nearest(station.x, station.z);
      const suits =
        Number.isFinite(near.distance) &&
        near.speed <= FISH_MAX_SPEED &&
        near.shallow <= FISH_MAX_SHALLOW &&
        depthAt(station.x, station.z, near) >= FISH_MIN_DEPTH_M + 0.2;
      // Tůně a klidná voda přednostně, průzračnější voda (ryby jsou vidět) taky; mezi
      // podobnými místy rozhodne náhoda.
      const score =
        near.pool + (1 - near.speed) * 0.5 + waterClarity(near) + hash(station.index, 0, 301) * 0.4;
      return { station, near, suits, score };
    })
    .filter((c) => c.suits)
    .sort((a, b) => b.score - a.score);

  const schools: FishSchool[] = [];
  for (const { station, near } of candidates) {
    if (schools.length >= MAX_SCHOOLS) break;
    if (schools.some((s) => Math.hypot(s.x - station.x, s.z - station.z) < SCHOOL_GAP_M)) continue;
    const k = station.index;
    const shape = fittingLoop(station.x, station.z, near, (x, z) => {
      const here = stream.nearest(x, z);
      return here.bankDistance <= -FISH_BANK_M && depthAt(x, z, here) >= FISH_MIN_DEPTH_M;
    });
    if (!shape) continue;
    const count =
      FISH_COUNT.from + Math.floor(hash(k, 1, 302) * (FISH_COUNT.to - FISH_COUNT.from + 1));
    const fish: FishMember[] = [];
    // Hejno plave pohromadě: ryby kousek za sebou (po 0,15–0,35 rad), každá po svém kole.
    let phase = hash(k, 2, 302) * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      fish.push({
        phase,
        radius: between(FISH_RADIUS, hash(k, 10 + i, 303)),
        depthM: between(FISH_DEPTH_M, hash(k, 10 + i, 304)),
        scale: between(FISH_SCALE, hash(k, 10 + i, 305)),
      });
      phase -= 0.15 + hash(k, 10 + i, 306) * 0.2;
    }
    schools.push({
      x: station.x,
      z: station.z,
      surfaceY: near.level * HEIGHT_SCALE,
      flowX: near.flowX,
      flowZ: near.flowZ,
      alongM: shape.alongM,
      acrossM: shape.acrossM,
      turn: hash(k, 3, 302) < 0.5 ? 1 : -1,
      speedMps: between(FISH_SPEED_MPS, hash(k, 4, 302)),
      visibilityM: waterVisibilityM(waterClarity(near)),
      iceFlow: iceFlowSpeed(near.speed, near.bankDistance),
      seed: k,
      fish,
    });
  }
  return schools;
}

/** Největší dráha (z několika velikostí), jejíž všechny body leží ve vhodné vodě. */
function fittingLoop(
  x: number,
  z: number,
  near: StreamSample,
  inWater: (x: number, z: number) => boolean,
): { alongM: number; acrossM: number } | null {
  for (let across = SCHOOL_ACROSS_M.to; across >= SCHOOL_ACROSS_M.from - 1e-9; across -= 0.5) {
    const shape = { x, z, flowX: near.flowX, flowZ: near.flowZ, acrossM: across };
    const loop = { ...shape, alongM: across * SCHOOL_STRETCH };
    let fits = true;
    for (let k = 0; k < 32 && fits; k++) {
      const p = fishLoopPoint(loop, FISH_RADIUS.to, (k / 32) * Math.PI * 2, { x: 0, z: 0 });
      fits = inWater(p.x, p.z);
    }
    if (fits) return { alongM: loop.alongM, acrossM: across };
  }
  return null;
}

/**
 * Ptáci: pár hejn vran kroužících nad loukami u lesa (jako fauna/crow_circle v 0 A.D.) a jedno
 * káně kroužící výš nad otevřenou loukou. Letí ve stálé výšce nad nejvyšším terénem pod kruhem.
 */
export function birdFlocks(
  l: Landscape,
  field: ForestField,
  stream: StreamCenterline,
  groundHeight: (x: number, z: number) => number,
): BirdFlock[] {
  const half = (l.size * l.cellSizeM) / 2;
  const cells = Math.floor((l.size * l.cellSizeM) / BIRD_GRID_M);
  // Pořadí míst míchá i krajina sama – jinak by v každé krajině kroužili na stejných místech.
  const salt = l.villageSite.x * 131 + l.villageSite.y * 7919;
  const candidates: { x: number; z: number; forest: number; k: number; score: number }[] = [];
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const x = -half + (gx + 0.2 + 0.6 * hash(gx, gz, 401)) * BIRD_GRID_M;
      const z = -half + (gz + 0.2 + 0.6 * hash(gx, gz, 402)) * BIRD_GRID_M;
      const tile = tileAt(l, x, z);
      if (!tile || l.surface[tile.y * l.size + tile.x] !== SURFACE_CODES.meadow) continue;
      if (stream.nearest(x, z).bankDistance < 10) continue;
      candidates.push({
        x,
        z,
        forest: field.distanceAt(x, z),
        k: gz * cells + gx,
        score: hash(gx + salt, gz, 403),
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const flocks: BirdFlock[] = [];
  const free = (x: number, z: number): boolean =>
    flocks.every((f) => Math.hypot(f.x - x, f.z - z) >= FLOCK_GAP_M);
  const withinMap = (x: number, z: number, reach: number): boolean =>
    Math.abs(x) + reach + EDGE_MARGIN_M < half && Math.abs(z) + reach + EDGE_MARGIN_M < half;

  // Káně: nejotevřenější louka mezi prvními kandidáty (pořadí určuje náhoda).
  const hawkSite = candidates
    .filter((c) => c.forest < HAWK_FOREST_M)
    .find((c) => withinMap(c.x, c.z, HAWK_RADIUS_M.to * (1 + BIRD_RADIUS_WOBBLE) + HAWK_DRIFT_M));
  if (hawkSite) {
    const k = hawkSite.k;
    const radiusM = between(HAWK_RADIUS_M, hash(k, 1, 404));
    const reach = radiusM * (1 + BIRD_RADIUS_WOBBLE) + HAWK_DRIFT_M;
    flocks.push({
      species: 'hawk',
      x: hawkSite.x,
      z: hawkSite.z,
      y:
        highestGround(hawkSite.x, hawkSite.z, reach, groundHeight) +
        between(HAWK_ALTITUDE_M, hash(k, 2, 404)),
      radiusM,
      speedMps: between(HAWK_SPEED_MPS, hash(k, 3, 404)),
      turn: hash(k, 4, 404) < 0.5 ? 1 : -1,
      driftM: HAWK_DRIFT_M,
      seed: k,
      birds: [{ phase: hash(k, 5, 404) * Math.PI * 2, radius: 1, heightM: 0, scale: 1 }],
    });
  }

  for (const site of candidates) {
    if (flocks.filter((f) => f.species === 'crow').length >= MAX_CROW_FLOCKS) break;
    if (site.forest < CROW_FOREST_M.from || site.forest > CROW_FOREST_M.to) continue;
    const k = site.k;
    const radiusM = between(CROW_RADIUS_M, hash(k, 1, 405));
    const reach = radiusM * CROW_RADIUS.to * (1 + BIRD_RADIUS_WOBBLE);
    if (!free(site.x, site.z) || !withinMap(site.x, site.z, reach)) continue;
    const count = crowCount(hash(k, 2, 405));
    const birds: BirdMember[] = [];
    for (let i = 0; i < count; i++) {
      // Rozestoupení po kruhu jako připojné body fish_01…fish_20 v 0 A.D. – nepravidelně.
      birds.push({
        phase: ((i + 0.6 * hash(k, 10 + i, 406)) / count) * Math.PI * 2,
        radius: between(CROW_RADIUS, hash(k, 10 + i, 407)),
        heightM: (hash(k, 10 + i, 408) - 0.5) * CROW_HEIGHT_M,
        scale: 0.9 + hash(k, 10 + i, 409) * 0.2,
      });
    }
    flocks.push({
      species: 'crow',
      x: site.x,
      z: site.z,
      y:
        highestGround(site.x, site.z, reach, groundHeight) +
        between(CROW_ALTITUDE_M, hash(k, 3, 405)) +
        CROW_HEIGHT_M / 2,
      radiusM,
      speedMps: between(CROW_SPEED_MPS, hash(k, 4, 405)),
      turn: hash(k, 5, 405) < 0.5 ? 1 : -1,
      driftM: 0,
      seed: k,
      birds,
    });
  }
  return flocks;
}

/** Nejdál od středu kroužení, kam pták z hejna doletí (m). */
export function flockReach(flock: Pick<BirdFlock, 'radiusM' | 'driftM' | 'birds'>): number {
  const widest = Math.max(...flock.birds.map((b) => b.radius));
  return flock.radiusM * widest * (1 + BIRD_RADIUS_WOBBLE) + flock.driftM;
}

function crowCount(pick: number): number {
  const total = CROW_COUNTS.reduce((sum, c) => sum + c.weight, 0);
  let acc = 0;
  for (const c of CROW_COUNTS) {
    acc += c.weight / total;
    if (pick < acc) return c.count;
  }
  return CROW_COUNTS[0]!.count;
}

/** Nejvyšší terén (ve scéně) v kruhu o poloměru `reach` kolem středu. */
function highestGround(
  x: number,
  z: number,
  reach: number,
  groundHeight: (x: number, z: number) => number,
): number {
  let highest = groundHeight(x, z);
  for (let ring = 1; ring <= 4; ring++) {
    const r = (reach * ring) / 4 + (ring === 4 ? 5 : 0);
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * Math.PI * 2;
      highest = Math.max(highest, groundHeight(x + Math.cos(angle) * r, z + Math.sin(angle) * r));
    }
  }
  return highest;
}
