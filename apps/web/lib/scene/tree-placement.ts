import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { tileCenter } from './tile-at';

export type TreeSpecies = 'deciduous-1' | 'deciduous-2' | 'conifer-1' | 'conifer-2';
export const TREE_SPECIES: readonly TreeSpecies[] = [
  'deciduous-1',
  'deciduous-2',
  'conifer-1',
  'conifer-2',
];

export interface TreePlacement {
  species: TreeSpecies;
  worldX: number;
  worldZ: number;
  rotationY: number;
  /** Násobek základní velikosti druhu (0,8–1,2). */
  scale: number;
}

/** Hash polohy políčka a pořadí stromu → číslo v [0, 1). Stejná krajina = stejný les. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 2–3 stromy na každé lesní políčko; ve vyšších polohách převažují jehličnany. */
export function treePlacements(l: Landscape): TreePlacement[] {
  let maxHeight = 0;
  for (const h of l.heights) maxHeight = Math.max(maxHeight, h);
  const placements: TreePlacement[] = [];
  for (let y = 0; y < l.size; y++) {
    for (let x = 0; x < l.size; x++) {
      const i = y * l.size + x;
      if (l.surface[i] !== SURFACE_CODES.forest) continue;
      const center = tileCenter(l, x, y);
      const count = hash(x, y, 0) < 0.5 ? 2 : 3;
      const coniferChance = 0.2 + 0.6 * (l.heights[i]! / (maxHeight || 1));
      for (let k = 1; k <= count; k++) {
        const conifer = hash(x, y, k * 7 + 1) < coniferChance;
        const variant = hash(x, y, k * 7 + 2) < 0.5 ? 1 : 2;
        placements.push({
          species: `${conifer ? 'conifer' : 'deciduous'}-${variant}`,
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
