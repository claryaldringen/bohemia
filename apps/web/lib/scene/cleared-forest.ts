import {
  NO_OBSTACLE_CHANGES,
  OBSTACLE_KINDS,
  SURFACE_CODES,
  obstacleIndex,
  type Landscape,
  type ObstacleChanges,
  type ObstacleLayer,
  type TileCell,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';

// Vymýcený les ve scéně a na minimapě (fields.md – Krajina sídla a scéna, forest.md – Les
// ustupuje): kde ves les vykácela nebo ho vymýtila pro pole, scéna tam les přestane kreslit –
// plocha korun zapadne pod zem, minimapa ukáže paseku. Maska po políčkách krajiny se počítá ze
// stavu vsi (odstraněné, pokácené a dorůstající stromy, založené díly polí) – levně, jen při
// změně. Čistý modul bez Babylonu.

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
  return { size: l.size, cellSizeM: l.cellSizeM, share, mask, tiles };
}

/**
 * Vymýcený les ze stavu vsi pro scénu: odstraněné a pokácené stromy a založené díly polí (díl,
 * který se teprve zakládá, má stromy ještě na sobě).
 */
export function villageClearedForest(
  l: Landscape,
  layer: ObstacleLayer,
  village: Pick<SceneVillage, 'fields' | 'obstacles'>,
): ClearedForest {
  const squares = village.fields.flatMap((field) =>
    field.parts.flatMap((part) => (part.stage === 'founding' ? [] : [part.cell])),
  );
  return clearedForest(l, layer, village.obstacles ?? NO_OBSTACLE_CHANGES, squares);
}

/** Stejná vymýcená políčka a podíly (po desetinách) – minimapu ani scénu není třeba měnit. */
export function sameClearing(a: ClearedForest | null, b: ClearedForest | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.share.length !== b.share.length) return false;
  for (let i = 0; i < a.share.length; i++) {
    if (a.mask[i] !== b.mask[i]) return false;
    if (Math.round(a.share[i]! * 10) !== Math.round(b.share[i]! * 10)) return false;
  }
  return true;
}

/**
 * Vzdálenost bodu světa (m) k nejbližšímu vymýcenému políčku – k jeho okraji, uvnitř 0. Hledá
 * jen do `maxM` (dál Infinity) – plocha korun se mění jen u paseky.
 */
export function clearingDistance(
  cleared: ClearedForest,
  x: number,
  z: number,
  maxM: number,
): number {
  if (cleared.tiles.length === 0) return Infinity;
  const { size, cellSizeM } = cleared;
  const half = (size * cellSizeM) / 2;
  const reach = Math.ceil(maxM / cellSizeM);
  const tx = Math.floor((x + half) / cellSizeM);
  const ty = Math.floor((z + half) / cellSizeM);
  let best = Infinity;
  for (let y = Math.max(0, ty - reach); y <= Math.min(size - 1, ty + reach); y++) {
    for (let xx = Math.max(0, tx - reach); xx <= Math.min(size - 1, tx + reach); xx++) {
      if (!cleared.mask[y * size + xx]) continue;
      const minX = xx * cellSizeM - half;
      const minZ = y * cellSizeM - half;
      const dx = Math.max(0, minX - x, x - (minX + cellSizeM));
      const dz = Math.max(0, minZ - z, z - (minZ + cellSizeM));
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best <= maxM ? best : Infinity;
}
