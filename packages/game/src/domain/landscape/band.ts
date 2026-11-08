import { distanceToMask, maxStep } from './grid';
import { checkPremium } from './premium/check';
import { portTile } from './skeleton/ports-map';
import { SURFACE_CODES, type Landscape, type LayerVersions } from './types';

// Pásmo srovnatelnosti startovních krajin (docs/design/landscape.md).
export const VILLAGE_SITE_MIN_FERTILITY = 60;
export const VILLAGE_SITE_MAX_WATER_DISTANCE_CELLS = 20;
export const FLAT_MAX_STEP_M = 1.0;
/** Okolí vsi, kde hospodaří – 600 m (40 políček) od místa pro vesnici (fields.md). */
export const NEAR_SITE_RADIUS_CELLS = 40;
/**
 * Koryto a niva řeky kostry (world-skeleton.md – Mapa z kostry, pásmo): voda řeky a souš do tolika
 * políček od ní. Celomapové meze (podíl lesa, úrodná políčka) se na mapě s řekou měří bez nich.
 */
export const RIVER_CORRIDOR_CELLS = 8;

/** Meze pásma – každá krajina musí do všech padnout (dolní i horní mez). */
export interface Band {
  forestShare: readonly [number, number];
  /** Místo pro vesnici: největší souvislá rovinatá úrodná louka do 300 m od vody (políčka). */
  villageSiteCells: readonly [number, number];
  reliefM: readonly [number, number];
  /** Políčka s úrodností ≥ 60 v celé krajině. */
  fertileCells: readonly [number, number];
  /** Louka do 600 m od místa pro vesnici (políčka); null = verze bez požadavku. */
  nearMeadowCells: readonly [number, number] | null;
  /** Z toho s úrodností ≥ 60 (políčka); null = verze bez požadavku. */
  nearGoodMeadowCells: readonly [number, number] | null;
}

/**
 * Pásmo verze 1 (vegetace i úrodnost 1). Úrodná políčka podle měření
 * (scripts/measure-landscapes.ts): p5 a p95 z 500 seedů s rezervou ~150. Zvlněnější terén
 * (16. 10. 2026) má víc svahů, a proto méně úrodné půdy než původní 3800–5200.
 */
export const BAND_V1: Band = {
  forestShare: [0.55, 0.7],
  villageSiteCells: [400, 1200],
  reliefM: [10, 40],
  fertileCells: [3600, 4850],
  nearMeadowCells: null,
  nearGoodMeadowCells: null,
};

/**
 * Pásmo verze 2 (vegetace i úrodnost 2, Martin – víc kvalitní louky, 18. 10. 2026): do 600 m
 * od vsi ≈ 60 ha louky, z toho ≈ 30 ha s úrodností ≥ 60. Meze podle měření na 500 seedech.
 */
export const BAND_V2: Band = {
  forestShare: [0.55, 0.7],
  villageSiteCells: [600, 1400],
  reliefM: [10, 40],
  fertileCells: [2550, 3800],
  nearMeadowCells: [2500, 2850],
  nearGoodMeadowCells: [1300, 1800],
};

/** Pásmo pro verze vrstev – vegetace a úrodnost musí mít stejnou verzi. */
export function bandFor(versions: LayerVersions): Band {
  if (versions.vegetation === 1 && versions.fertility === 1) return BAND_V1;
  if (versions.vegetation === 2 && versions.fertility === 2) return BAND_V2;
  throw new RangeError(
    `Pásmo pro vegetaci ${String(versions.vegetation)} a úrodnost ${String(versions.fertility)} není.`,
  );
}

export interface LandscapeMetrics {
  waterSpansEdges: boolean;
  forestShare: number;
  villageSiteCells: number;
  reliefM: number;
  fertileCells: number;
  /** Louka do 600 m od místa pro vesnici (políčka). */
  nearMeadowCells: number;
  /** Louka do 600 m od místa pro vesnici s úrodností ≥ 60 (políčka). */
  nearGoodMeadowCells: number;
}

/**
 * Koryto a niva řek kostry (1 = políčko patří k řece): vodní políčka u os řek (`rivers`) a souš do
 * `RIVER_CORRIDOR_CELLS` od nich. Mapa bez řek kostry dá prázdnou masku.
 */
export function riverCorridorMask(l: Landscape): Uint8Array {
  const { size } = l;
  const corridor = new Uint8Array(size * size);
  const rivers = l.rivers ?? [];
  if (rivers.length === 0) return corridor;
  const axis = new Uint8Array(size * size);
  let half = 0;
  for (const course of rivers) {
    for (const p of course) {
      axis[Math.round(p.y) * size + Math.round(p.x)] = 1;
      half = Math.max(half, p.halfWidthLeft, p.halfWidthRight);
    }
  }
  const toAxis = distanceToMask(axis, size);
  const riverWater = new Uint8Array(size * size);
  for (let i = 0; i < riverWater.length; i++) {
    if (l.surface[i] === SURFACE_CODES.water && toAxis[i]! <= half + 1.5) riverWater[i] = 1;
  }
  const toWater = distanceToMask(riverWater, size);
  for (let i = 0; i < corridor.length; i++) {
    if (toWater[i]! <= RIVER_CORRIDOR_CELLS) corridor[i] = 1;
  }
  return corridor;
}

export function measureLandscape(l: Landscape): LandscapeMetrics {
  const { size } = l;
  const water = l.surface.map((v) => (v === SURFACE_CODES.water ? 1 : 0));
  // Mapa s řekou kostry: podíl lesa a úrodná políčka bez koryta a nivy řeky (návrh Clauda) – řeka
  // úrodnou nivu přidá navíc, zbytek mapy má stejné meze jako suchá mapa.
  const corridor = riverCorridorMask(l);
  let forest = 0;
  let fertileCells = 0;
  let counted = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < l.surface.length; i++) {
    min = Math.min(min, l.heights[i]!);
    max = Math.max(max, l.heights[i]!);
    if (corridor[i]) continue;
    counted++;
    if (l.surface[i] === SURFACE_CODES.forest) forest++;
    if (l.fertility[i]! >= VILLAGE_SITE_MIN_FERTILITY) fertileCells++;
  }

  const waterDistance = distanceToMask(water, size);
  const site = new Uint8Array(size * size);
  let nearMeadowCells = 0;
  let nearGoodMeadowCells = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const near = Math.hypot(x - l.villageSite.x, y - l.villageSite.y) <= NEAR_SITE_RADIUS_CELLS;
      if (near && l.surface[i] === SURFACE_CODES.meadow) {
        nearMeadowCells++;
        if (l.fertility[i]! >= VILLAGE_SITE_MIN_FERTILITY) nearGoodMeadowCells++;
      }
      site[i] =
        l.surface[i] === SURFACE_CODES.meadow &&
        l.fertility[i]! >= VILLAGE_SITE_MIN_FERTILITY &&
        waterDistance[i]! <= VILLAGE_SITE_MAX_WATER_DISTANCE_CELLS &&
        maxStep(l.heights, size, x, y) <= FLAT_MAX_STEP_M
          ? 1
          : 0;
    }
  }

  return {
    waterSpansEdges: l.rivers?.length
      ? streamReachesOutflow(l, water)
      : spansOppositeEdges(water, size),
    forestShare: forest / Math.max(1, counted),
    villageSiteCells: largestComponent(site, size),
    reliefM: max - min,
    fertileCells,
    nearMeadowCells,
    nearGoodMeadowCells,
  };
}

/**
 * Padne krajina do pásma srovnatelnosti verzí, ze kterých vznikla? Prémiová krajina (návrh
 * Clauda): celé pásmo se měří na průměrné krajině jejího pokusu (`generateAcceptedLandscape`),
 * tady jen dolní meze – výhoda typu je navíc, start ale není horší – a kontrola typu
 * (`checkPremium`, premium-landscapes.md – Generátor). Ta se počítá až u pokusu, který jinak
 * prošel (hledání prvků může být drahé).
 */
export function checkBand(
  l: Landscape,
  versions: LayerVersions,
): { ok: boolean; failures: string[] } {
  const band = bandFor(versions);
  const lowerOnly = l.premium !== undefined;
  const m = measureLandscape(l);
  const riversOk = skeletonRiversOk(l);
  const within = (value: number, range: readonly [number, number] | null): boolean =>
    range === null || (value >= range[0] && (lowerOnly || value <= range[1]));
  const failures = [
    !riversOk && 'skeleton-rivers',
    !m.waterSpansEdges && 'water-edges',
    !within(m.forestShare, band.forestShare) && 'forest-share',
    !within(m.villageSiteCells, band.villageSiteCells) && 'village-site',
    !within(m.reliefM, band.reliefM) && 'relief',
    !within(m.fertileCells, band.fertileCells) && 'fertile-cells',
    !within(m.nearMeadowCells, band.nearMeadowCells) && 'near-meadow',
    !within(m.nearGoodMeadowCells, band.nearGoodMeadowCells) && 'near-good-meadow',
  ].filter((failure): failure is string => failure !== false);
  if (failures.length === 0) {
    const premium = checkPremium(l);
    if (!premium.ok) failures.push(`premium-${premium.reason}`);
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Mapa z výřezu s řekou má řeky kostry – hlavní tok a přítok za každý další vtok (terén z kostry
 * bez řeky = trasa nevedla, pokus neprojde).
 */
function skeletonRiversOk(l: Landscape): boolean {
  const ports = l.skeleton?.rivers ?? [];
  if (ports.length === 0) return true;
  const inflows = ports.filter((p) => p.flow === 'in').length;
  return (l.rivers?.length ?? 0) === Math.max(1, inflows);
}

function neighbours8(i: number, size: number): number[] {
  const x = i % size;
  const y = Math.floor(i / size);
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) result.push(ny * size + nx);
    }
  }
  return result;
}

/**
 * Mapa s řekou kostry: potok teče do řeky a ta z mapy vytéká – voda od začátku potoka souvisí
 * s políčkem výtoku řeky (u mapy s řekou místo „voda od okraje k okraji“).
 */
function streamReachesOutflow(l: Landscape, water: Uint8Array): boolean {
  const { size } = l;
  const out = l.skeleton?.rivers.find((p) => p.flow === 'out');
  const first = l.stream[0];
  if (!out || !first) return false;
  const goal = portTile(out.side, out.at, size);
  const start = Math.round(first.y) * size + Math.round(first.x);
  if (!water[start]) return false;
  const seen = new Uint8Array(water.length);
  const queue = [start];
  seen[start] = 1;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    if (i === goal.y * size + goal.x) return true;
    for (const n of neighbours8(i, size)) {
      if (water[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return false;
}

function spansOppositeEdges(water: Uint8Array, size: number): boolean {
  const seen = new Uint8Array(water.length);
  for (let start = 0; start < water.length; start++) {
    if (!water[start] || seen[start]) continue;
    let left = false;
    let right = false;
    let top = false;
    let bottom = false;
    const queue = [start];
    seen[start] = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      left ||= x === 0;
      right ||= x === size - 1;
      top ||= y === 0;
      bottom ||= y === size - 1;
      for (const n of neighbours8(i, size)) {
        if (water[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    if ((left && right) || (top && bottom)) return true;
  }
  return false;
}

function largestComponent(mask: Uint8Array, size: number): number {
  const seen = new Uint8Array(mask.length);
  let largest = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const n of [i - 1, i + 1, i - size, i + size]) {
        const nx = n % size;
        const ny = Math.floor(n / size);
        if (n < 0 || n >= mask.length || Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (mask[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    largest = Math.max(largest, queue.length);
  }
  return largest;
}
