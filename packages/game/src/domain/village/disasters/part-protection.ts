// Ochrana dílu před počasím ze zeleně a vlhkosti (disasters.md – Ochrana dílu). Počítá se 1. 4.,
// jednou za rok a za ves – zeleň se mezitím mění kácením, sadem a jabloněmi u cest.

import { dateOfDayIndex } from '../../calendar';
import { obstaclesNear, surfaceAt, type Landscape, type ObstacleLayer } from '../../landscape';
import { heightAboveStream } from '../../landscape/floodplain';
import { obstacleChangesAt, obstacleStatus } from '../core/obstacles';
import { villageRoadApples } from '../roads/road-apples';
import { PROTECTION } from '../rules/rules-disasters';
import { villageLandSquares } from '../placement/squares';
import type { PartProtection } from '../types/types-disasters';
import type { VillageState } from '../types';
import { greenEdgeScan } from '../wildlife/wildlife-land';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export { partProtectionOf, protectionAgainst } from './weather-effects';

/** Výška políček nad dnem nejbližší vody (m) – jednou pro každou krajinu. */
const streamHeightsCache = new WeakMap<Landscape, Float32Array>();

/** Výška políček krajiny nad potokem; voda 0 (`heightAboveStream` z masky vodních políček). */
export function streamHeights(landscape: Landscape): Float32Array {
  let heights = streamHeightsCache.get(landscape);
  if (!heights) {
    const size = landscape.size;
    const water = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (surfaceAt(landscape, x, y) === 'water') water[y * size + x] = 1;
      }
    }
    // bez vody v mapě nemá výška nad potokem smysl – žádný díl není v nivě ani vyvýšený
    heights = water.includes(1)
      ? heightAboveStream(water, landscape.heights, size)
      : new Float32Array(size * size).fill(Infinity);
    streamHeightsCache.set(landscape, heights);
  }
  return heights;
}

/** Strom nebo keř ve vrstvě překážek (a ve stromech vsi), který ten den stojí. */
interface StandingPlant {
  x: number;
  z: number;
  /** Dospělý strom (solitér smí jen on) – jinak mladý stromek nebo keř. */
  adult: boolean;
  /** Strom (ne keř) – počítá se jako soused solitéra. */
  tree: boolean;
  apple: boolean;
}

/** Index políčka krajiny pod bodem světa (m); mimo mapu −1. */
export function tileIndex(landscape: Landscape, x: number, z: number): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const tx = Math.floor((x + half) / landscape.cellSizeM);
  const ty = Math.floor((z + half) / landscape.cellSizeM);
  if (tx < 0 || ty < 0 || tx >= landscape.size || ty >= landscape.size) return -1;
  return ty * landscape.size + tx;
}

/** Výška bodu světa nad potokem (m, z políčka pod ním); mimo mapu a bez vody v mapě nekonečno. */
export function heightAboveStreamAt(landscape: Landscape, x: number, z: number): number {
  const tile = tileIndex(landscape, x, z);
  return tile < 0 ? Infinity : streamHeights(landscape)[tile]!;
}

/**
 * Stojící stromy a keře v obdélníku světa v den `day` – bez pokácených (pařez, souš, padlý strom)
 * a bez odstraněných (`obstacleChangesAt`), s jabloněmi a stromy u cest; stromy v lese
 * (`forest` maska) se nepočítají zvlášť, les je zeleň sám.
 */
function standingPlants(
  state: VillageState,
  day: number,
  landscape: Landscape,
  layer: ObstacleLayer,
  forest: Uint8Array,
  box: { minX: number; minZ: number; maxX: number; maxZ: number },
): StandingPlant[] {
  const status = obstacleStatus(obstacleChangesAt(state, day));
  const apples = new Set(villageRoadApples(state).map((a) => a.id));
  const out: StandingPlant[] = [];
  const add = (x: number, z: number, kind: string | null, apple: boolean): void => {
    if (kind !== 'tree' && kind !== 'youngTree' && kind !== 'shrub') return;
    const tile = tileIndex(landscape, x, z);
    if (tile < 0 || forest[tile]) return;
    out.push({ x, z, adult: kind === 'tree', tree: kind !== 'shrub', apple });
  };
  for (const i of obstaclesNear(layer, box.minX, box.minZ, box.maxX, box.maxZ)) {
    add(layer.x[i]!, layer.z[i]!, status.kindOf(layer, i), false);
  }
  for (const a of status.addedIn(box.minX, box.minZ, box.maxX, box.maxZ)) {
    add(a.x, a.z, a.kind, apples.has(a.id));
  }
  return out;
}

/** Body rozházené do mřížky po `CELL_M` metrech – dotaz „co je do r metrů“ bez průchodu všech. */
const POINT_CELL_M = 30;

class PointGrid {
  private readonly cells = new Map<number, { x: number; z: number }[]>();

  constructor(points: readonly { x: number; z: number }[]) {
    for (const p of points) {
      const k = this.key(Math.floor(p.x / POINT_CELL_M), Math.floor(p.z / POINT_CELL_M));
      const list = this.cells.get(k);
      if (list) list.push(p);
      else this.cells.set(k, [p]);
    }
  }

  private key(cx: number, cz: number): number {
    return cx * 100_000 + cz;
  }

  /** Vzdálenost k nejbližšímu bodu do `radius` m (jinak nekonečno) a počet bodů do `radius`. */
  within(x: number, z: number, radius: number): { nearest: number; count: number } {
    const span = Math.ceil(radius / POINT_CELL_M);
    const cx = Math.floor(x / POINT_CELL_M);
    const cz = Math.floor(z / POINT_CELL_M);
    let nearest = Infinity;
    let count = 0;
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        for (const p of this.cells.get(this.key(cx + dx, cz + dz)) ?? []) {
          const d = Math.hypot(p.x - x, p.z - z);
          if (d <= radius) {
            count++;
            if (d < nearest) nearest = d;
          }
        }
      }
    }
    return { nearest, count };
  }
}

/**
 * Remízy a solitéry z rostlin: remíz = strom nebo keř s aspoň `remizMinNeighbours` dalšími do
 * `remizLinkM`; solitér = dospělý strom bez dalšího stromu do `soloLinkM`, a jabloň u cesty vždy.
 */
function classify(plants: readonly StandingPlant[]): {
  remiz: StandingPlant[];
  solo: StandingPlant[];
} {
  const cell = Math.max(PROTECTION.remizLinkM, PROTECTION.soloLinkM);
  const key = (cx: number, cz: number): string => `${cx}:${cz}`;
  const grid = new Map<string, StandingPlant[]>();
  for (const p of plants) {
    const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  const around = (p: StandingPlant, radius: number, treesOnly: boolean): number => {
    let n = 0;
    const cx = Math.floor(p.x / cell);
    const cz = Math.floor(p.z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const q of grid.get(key(cx + dx, cz + dz)) ?? []) {
          if (q === p || (treesOnly && !q.tree)) continue;
          if (Math.hypot(q.x - p.x, q.z - p.z) <= radius) n++;
        }
      }
    }
    return n;
  };
  const remiz: StandingPlant[] = [];
  const solo: StandingPlant[] = [];
  for (const p of plants) {
    if (around(p, PROTECTION.remizLinkM, false) >= PROTECTION.remizMinNeighbours) remiz.push(p);
    if (p.apple ? p.tree : p.adult && around(p, PROTECTION.soloLinkM, true) === 0) solo.push(p);
  }
  return { remiz, solo };
}

/** Ochrana všech dílů vsi podle krajiny a vrstvy překážek (bez vrstvy bez remízů a solitérů). */
export function computePartProtections(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): Record<string, PartProtection> {
  const parts: Record<string, PartProtection> = {};
  const squares = villageLandSquares(landscape, state, ['field']).filter(
    (sq) => sq.partId !== undefined,
  );
  if (squares.length === 0) return parts;
  const size = landscape.size;
  const cellM = landscape.cellSizeM;
  // sad je zeleň jako remíz (středy jeho políček); les jen vzdáleností od okraje
  const orchardGrid = new PointGrid(
    villageLandSquares(landscape, state, ['orchard']).map((sq) => sq.center),
  );
  const { distances, forest } = greenEdgeScan(landscape, state, []);
  // rostliny v okolí dílů
  const reach = PROTECTION.noGreenM + 2 * PROTECTION.remizLinkM;
  const box = {
    minX: Math.min(...squares.map((s) => s.center.x)) - reach,
    maxX: Math.max(...squares.map((s) => s.center.x)) + reach,
    minZ: Math.min(...squares.map((s) => s.center.z)) - reach,
    maxZ: Math.max(...squares.map((s) => s.center.z)) + reach,
  };
  const plants = obstacles ? standingPlants(state, day, landscape, obstacles, forest, box) : [];
  const { remiz, solo } = classify(plants);
  const remizGrid = new PointGrid(remiz);
  const soloGrid = new PointGrid(solo);
  const above = streamHeights(landscape);
  const radiusTiles = Math.round(PROTECTION.raisedRadiusM / cellM);
  const waterTiles = Math.round(PROTECTION.nearWaterM / cellM);
  for (const sq of squares) {
    const partId = sq.partId!;
    const { x, z } = sq.center;
    const tile = sq.tile ?? tileIndex(landscape, x, z);
    // les chrání jen díl přímo u okraje, ostatní zeleň do `noGreenM`
    const forestEdge = distances.get(partId) ?? Infinity;
    const edge = Math.min(
      forestEdge <= PROTECTION.forestEdgeM ? forestEdge : Infinity,
      remizGrid.within(x, z, PROTECTION.noGreenM).nearest,
      orchardGrid.within(x, z, PROTECTION.noGreenM).nearest,
    );
    let green = clamp01(
      (PROTECTION.noGreenM - edge) / (PROTECTION.noGreenM - PROTECTION.fullGreenM),
    );
    green += soloGrid.within(x, z, PROTECTION.soloM).count * PROTECTION.soloBonus;
    const result: PartProtection = { green: Math.round(clamp01(green) * 1000) / 1000 };
    if (tile >= 0) {
      const tx = tile % size;
      const ty = (tile - tx) / size;
      const lowland = above[tile]! <= PROTECTION.lowlandM;
      let nearWater = lowland;
      let sum = 0;
      let count = 0;
      for (
        let dy = -Math.max(radiusTiles, waterTiles);
        dy <= Math.max(radiusTiles, waterTiles);
        dy++
      ) {
        for (
          let dx = -Math.max(radiusTiles, waterTiles);
          dx <= Math.max(radiusTiles, waterTiles);
          dx++
        ) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const dist = Math.hypot(dx, dy) * cellM;
          if (dist <= PROTECTION.nearWaterM && surfaceAt(landscape, nx, ny) === 'water') {
            nearWater = true;
          }
          if (dist <= PROTECTION.raisedRadiusM) {
            sum += landscape.heights[ny * size + nx]!;
            count++;
          }
        }
      }
      if (lowland) result.lowland = true;
      if (nearWater) result.nearWater = true;
      if (above[tile]! > PROTECTION.raisedM && landscape.heights[tile]! > sum / count) {
        result.raised = true;
      }
      let steepest = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        steepest = Math.max(
          steepest,
          Math.abs(landscape.heights[ny * size + nx]! - landscape.heights[tile]!),
        );
      }
      if (steepest >= PROTECTION.slopeM) result.slope = true;
    }
    parts[String(partId)] = result;
  }
  // díly bez čtverce (bez údaje o poloze) dostanou typickou zeleň
  for (const part of state.parts) {
    parts[String(part.id)] ??= { green: PROTECTION.noLandscapeGreen };
  }
  return parts;
}

/**
 * Den ochrany dílů (krok za `weatherDay`): 1. 4. ves se `weatherSeed` zapíše
 * `disasters.protection`. Bez krajiny má každý díl typickou zeleň 0,25. Jednou za rok, ne denně;
 * výsledek nezávisí na tom, po jakých kouscích se ves dopočítá (mutuje stav).
 */
export function partProtectionDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  if (state.weatherSeed === undefined) return;
  const date = dateOfDayIndex(day);
  if (date.month !== PROTECTION.day.month || date.day !== PROTECTION.day.day) return;
  const parts = landscape
    ? computePartProtections(state, day, landscape, obstacles)
    : Object.fromEntries(
        state.parts.map((part) => [String(part.id), { green: PROTECTION.noLandscapeGreen }]),
      );
  state.disasters = { ...state.disasters, protection: { year: date.year, parts } };
}
