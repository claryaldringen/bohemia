import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { forestDepth } from './forest-depth';
import { tileCenter } from './tile-at';

export type TreeModel =
  'spruce-1' | 'spruce-2' | 'oak-1' | 'oak-2' | 'beech-1' | 'beech-2' | 'birch-1' | 'birch-2';
export const TREE_MODELS: readonly TreeModel[] = [
  'spruce-1',
  'spruce-2',
  'oak-1',
  'oak-2',
  'beech-1',
  'beech-2',
  'birch-1',
  'birch-2',
];

export interface TreePlacement {
  model: TreeModel;
  worldX: number;
  worldZ: number;
  rotationY: number;
  /** Násobek velikosti modelu (0,8–1,2). */
  scale: number;
}

/** Hash polohy políčka a pořadí stromu → číslo v [0, 1). Stejná krajina = stejný les. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Stromy jen na okraji lesa: krajní řada 3–4 na políčko, druhá řada 2 – vnitřek lesa kreslí
 * plocha korun. Ve vyšších polohách převažují smrky, níž duby, buky a břízy.
 */
export function treePlacements(l: Landscape): TreePlacement[] {
  let maxHeight = 0;
  for (const h of l.heights) maxHeight = Math.max(maxHeight, h);
  const depth = forestDepth(l);
  const placements: TreePlacement[] = [];
  for (let y = 0; y < l.size; y++) {
    for (let x = 0; x < l.size; x++) {
      const i = y * l.size + x;
      if (l.surface[i] !== SURFACE_CODES.forest || depth[i]! > 2) continue;
      const center = tileCenter(l, x, y);
      const count = depth[i] === 2 ? 2 : hash(x, y, 0) < 0.5 ? 3 : 4;
      const coniferChance = 0.2 + 0.6 * (l.heights[i]! / (maxHeight || 1));
      for (let k = 1; k <= count; k++) {
        placements.push({
          model: pickModel(hash(x, y, k * 7 + 1), coniferChance, hash(x, y, k * 7 + 2)),
          worldX: center.worldX + (hash(x, y, k * 7 + 3) - 0.5) * l.cellSizeM * 0.8,
          worldZ: center.worldZ + (hash(x, y, k * 7 + 4) - 0.5) * l.cellSizeM * 0.8,
          rotationY: hash(x, y, k * 7 + 5) * Math.PI * 2,
          scale: 0.8 + hash(x, y, k * 7 + 6) * 0.4,
        });
      }
    }
  }
  return placements;
}

/** Smrk s pravděpodobností coniferChance, jinak listnáč: dub 40 %, buk 35 %, bříza 25 %. */
function pickModel(kind: number, coniferChance: number, variant: number): TreeModel {
  const v = variant < 0.5 ? 1 : 2;
  if (kind < coniferChance) return `spruce-${v}`;
  const broadleaf = (kind - coniferChance) / (1 - coniferChance);
  if (broadleaf < 0.4) return `oak-${v}`;
  if (broadleaf < 0.75) return `beech-${v}`;
  return `birch-${v}`;
}
