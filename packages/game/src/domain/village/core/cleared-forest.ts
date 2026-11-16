import {
  OBSTACLE_KINDS,
  SURFACE_CODES,
  obstacleIndex,
  type Landscape,
  type ObstacleLayer,
} from '../../landscape';
import { forestClearingsOf } from '../placement/placement-land';
import type { Point } from '../placement/polygon';
import { rotationTurn } from '../placement/square-grid';
import { workshopKilns, kilnCircle } from '../crafts/charcoal';
import { KILN_SITE, MILIR } from '../rules';
import type { Craft, DwellingType, Position, SquareGrid, TileCell, VillageState } from '../types';
import { obstacleChangesAt, type ObstacleChanges } from './obstacles';
import { partStage } from './summary';

// Vymýcený les v jádru (fields.md – Krajina sídla a scéna, forest.md – Les ustupuje, Hustý les):
// maska po políčkách krajiny z odstraněných, pokácených a dorůstajících stromů, založených dílů
// polí a pasek pod stavbami. Počítá ho scéna a minimapa (apps/web/lib/scene/cleared-forest.ts)
// i hledání cesty vojska (war/dense-forest.ts) – ze stejných funkcí.

/** Od jakého podílu vykácených dospělých stromů je políčko lesa vymýcené. */
export const CLEARED_SHARE = 0.5;

/** Vymýcený les po políčkách krajiny. */
export interface ClearedForest {
  readonly size: number;
  readonly cellSizeM: number;
  /** Podíl vykácených dospělých stromů v políčku lesa 0–1 (index y × size + x); jinde 0. */
  readonly share: Float32Array;
  /** 1 = vymýcené políčko lesa (podíl aspoň CLEARED_SHARE, nebo založený díl pole). */
  readonly mask: Uint8Array;
  /** Vymýcená políčka vzestupně. */
  readonly tiles: readonly number[];
  /**
   * Paseky pod stavbami v lese menší než políčko (konvexní mnohoúhelníky ve světě, m) – plocha
   * korun zapadne nad nimi stejně jako nad vymýceným políčkem.
   */
  readonly areas: readonly (readonly Point[])[];
}

const TREE_KIND = OBSTACLE_KINDS.indexOf('tree');

/** Dospělé stromy (i vnitřek lesa – impostory) po políčkách – jednou na vrstvu. */
const treesPerTileCache = new WeakMap<ObstacleLayer, Uint16Array>();

function treesPerTile(layer: ObstacleLayer): Uint16Array {
  const cached = treesPerTileCache.get(layer);
  if (cached) return cached;
  const counts = new Uint16Array(layer.size * layer.size);
  for (let tile = 0; tile < counts.length; tile++) {
    for (let k = layer.tileStart[tile]!; k < layer.tileStart[tile + 1]!; k++) {
      if (layer.kind[layer.tileItems[k]!] === TREE_KIND) counts[tile] = counts[tile]! + 1;
    }
  }
  treesPerTileCache.set(layer, counts);
  return counts;
}

/** Políčko vrstvy, ve kterém leží pata překážky. */
function tileOf(layer: ObstacleLayer, index: number): number {
  const half = (layer.size * layer.cellSizeM) / 2;
  const at = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  return at(layer.z[index]!) * layer.size + at(layer.x[index]!);
}

/**
 * Vymýcený les vsi: v každém políčku lesa podíl dospělých stromů, které ves odstranila,
 * pokácela (pařez) nebo které teprve dorůstají z náletu; políčka `clearedSquares` (založené díly
 * polí) jsou vymýcená celá. Stromy, které už dorostly, mezi změnami nejsou – les se vrátí.
 */
export function clearedForest(
  l: Landscape,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  clearedSquares: readonly TileCell[] = [],
  areas: readonly (readonly Point[])[] = [],
): ClearedForest {
  const n = l.size * l.size;
  const trees = treesPerTile(layer);
  const gone = new Uint16Array(n);
  for (const list of [changes.removed, changes.stumps, changes.saplings]) {
    for (const id of list) {
      const index = obstacleIndex(layer, id);
      if (index < 0 || layer.kind[index] !== TREE_KIND) continue;
      const tile = tileOf(layer, index);
      gone[tile] = gone[tile]! + 1;
    }
  }
  const share = new Float32Array(n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (l.surface[i] !== SURFACE_CODES.forest || trees[i] === 0) continue;
    share[i] = Math.min(1, gone[i]! / trees[i]!);
    if (share[i]! >= CLEARED_SHARE) mask[i] = 1;
  }
  for (const { x, y } of clearedSquares) {
    if (x < 0 || y < 0 || x >= l.size || y >= l.size) continue;
    const i = y * l.size + x;
    if (l.surface[i] !== SURFACE_CODES.forest) continue;
    share[i] = 1;
    mask[i] = 1;
  }
  const tiles: number[] = [];
  for (let i = 0; i < n; i++) if (mask[i]) tiles.push(i);
  const inForest = areas.filter((area) => touchesForest(l, area));
  return { size: l.size, cellSizeM: l.cellSizeM, share, mask, tiles, areas: inForest };
}

/** Zasahuje mnohoúhelník (obdélníkem kolem něj) do políčka lesa krajiny? */
export function touchesForest(l: Landscape, polygon: readonly Point[]): boolean {
  const half = (l.size * l.cellSizeM) / 2;
  const at = (v: number): number =>
    Math.min(l.size - 1, Math.max(0, Math.floor((v + half) / l.cellSizeM)));
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  for (let y = at(Math.min(...zs)); y <= at(Math.max(...zs)); y++) {
    for (let x = at(Math.min(...xs)); x <= at(Math.max(...xs)); x++) {
      if (l.surface[y * l.size + x] === SURFACE_CODES.forest) return true;
    }
  }
  return false;
}

/** Je mřížka pole natočená mimo osy krajiny (ne o násobek 90°)? */
function turnedGrid(grid: SquareGrid | undefined): boolean {
  if (!grid) return false;
  const turn = rotationTurn(grid.rotation);
  return turn === null || turn % 24 !== 0;
}

/**
 * Vymýcený les vsi ze stavu k `day` (jako `villageClearedForest` ve scéně, jen ze `VillageState`):
 * změny překážek, políčka založených dílů polí (natočené díly jen přes podíl pokácených stromů),
 * paseky pod obydlími a dílnami bez pozemku (i rozestavěnými), posvátnými stavbami a milířiště
 * s pruhem pod korunami (i po rozebraném milíři).
 */
export function villageClearings(
  l: Landscape,
  layer: ObstacleLayer,
  village: VillageState,
  day: number,
): ClearedForest {
  const changes = obstacleChangesAt(village, day);
  const squares: TileCell[] = [];
  for (const field of village.fields) {
    if (turnedGrid(field.grid)) continue;
    for (const part of village.parts) {
      if (part.fieldId !== field.id || part.cell === undefined) continue;
      if (partStage(part, day) === 'founding') continue;
      squares.push({ x: part.cell.x, y: part.cell.y });
    }
  }
  const areas: (readonly Point[])[] = [];
  const dwelling = (d: {
    type: DwellingType;
    position: Position;
    craft?: Craft;
    plainShape?: true;
  }): void => {
    areas.push(
      ...forestClearingsOf({
        type: d.type,
        position: d.position,
        ...(d.craft ? { craft: d.craft } : {}),
        ...(d.plainShape ? { plainShape: true as const } : {}),
      }),
    );
  };
  for (const d of village.dwellings) {
    if (d.plot) continue;
    dwelling({
      type: d.type,
      position: d.position,
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      ...(d.plainShape ? { plainShape: true as const } : {}),
    });
  }
  for (const c of village.constructions) {
    if (c.kind !== 'dwelling' && c.kind !== 'rebuild') continue;
    if (c.dwellingType === null || c.position === null || c.plot) continue;
    dwelling({
      type: c.dwellingType,
      position: c.position,
      ...(c.craft ? { craft: c.craft } : {}),
      ...(c.plainShape ? { plainShape: true as const } : {}),
    });
  }
  for (const b of village.sacredBuildings ?? []) {
    areas.push(...forestClearingsOf({ sacred: b.kind, position: b.position }));
  }
  for (const c of village.constructions) {
    if ((c.kind === 'idol' || c.kind === 'shrine') && c.position !== null) {
      areas.push(...forestClearingsOf({ sacred: c.kind, position: c.position }));
    }
  }
  const radius = MILIR.footprintM / 2 + KILN_SITE.clearAroundM;
  for (const d of village.dwellings) {
    for (const kiln of workshopKilns(d.workshop)) {
      if (kiln.site) areas.push(kilnCircle(kiln.site, radius));
    }
  }
  for (const r of village.kilnRemnants ?? []) areas.push(kilnCircle(r, radius));
  return clearedForest(l, layer, changes, squares, areas);
}
