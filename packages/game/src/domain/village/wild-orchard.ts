import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { createRandom, deriveSeed } from '../landscape/random';
import { ORCHARD_WILD } from './rules';
import { rotationCosSin, squareCenter } from './square-grid';
import type { Orchard, VillageState, WildTree } from './types';
import { WOOD_TREE_ID_BASE } from './woods';

// Zdivočelý sad (orchard.md – Zdivočelý sad; Martin 8. 11. 2026, demolition.md – Rozhodnutí):
// opuštěný sad se neošetřuje, staré stromy dožijí, ale mezi nimi každý rok vyrostou nové –
// jabloně ze spadaných plodů a trochu jiných dřevin z okolí. Náletové stromy jsou herní data
// jako strom lesa vsi (`obstacleChangesAt`), nezávisí na čtverci sadu: čtverec v 60. roce zanikne,
// ale nálet zůstane – z opuštěného sadu je neuspořádaný les s převahou jabloní.

/**
 * Id náletových stromů leží nad stromy lesa vsi (jejich id jsou pod 2^30 nad WOOD_TREE_ID_BASE;
 * `woodTreeOf` z nich dá políčko mimo krajinu, takže žádný les nevyberou). Celé id se vejde
 * do Uint32.
 */
export const WILD_TREE_ID_BASE = WOOD_TREE_ID_BASE + 1_073_741_824;
const GEOMETRY = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M } as const;
const DAYS_PER_YEAR = 365.25;

/** Náletové stromy vsi (bez nich prázdné). */
export function villageWildTrees(state: Pick<VillageState, 'wildTrees'>): readonly WildTree[] {
  return state.wildTrees ?? [];
}

/** Stáří náletového stromu v den `day` (roky). */
export function wildTreeAgeYears(tree: Pick<WildTree, 'day'>, day: number): number {
  return Math.max(0, day - tree.day) / DAYS_PER_YEAR;
}

/** Je náletový strom dospělý (dá kládu, ve scéně plná velikost)? */
export function wildTreeMature(tree: Pick<WildTree, 'day'>, day: number): boolean {
  return wildTreeAgeYears(tree, day) >= ORCHARD_WILD.matureYears;
}

/**
 * Roční krok zdivočení (1. 3., před dosloužením čtverců; mutuje stav): na každém vysazeném čtverci
 * opuštěného sadu vyroste s pravděpodobností ORCHARD_WILD.saplingChance nový stromek (nejvýš
 * maxPerSquare na čtverec), jabloň z appleShare. Náhoda je ze seedu vsi, dne, sadu a čtverce –
 * výsledek nezávisí na tom, po jakých kouscích se ves dopočítá. Ves bez opuštěného sadu stav
 * nemění.
 */
export function growWildOrchards(state: VillageState, day: number): void {
  for (const orchard of state.orchards ?? []) {
    if (orchard.disusedDay === undefined) continue;
    for (const square of orchard.squares) {
      const count = square.wild ?? 0;
      if (square.plantedDay === null || count >= ORCHARD_WILD.maxPerSquare) continue;
      const random = createRandom(
        deriveSeed(
          state.seed,
          `wild-orchard:${day}:${orchard.id}:${square.cell.x},${square.cell.y}`,
        ),
      );
      if (random.next() >= ORCHARD_WILD.saplingChance) continue;
      const apple = random.next() < ORCHARD_WILD.appleShare;
      const half = CELL_SIZE_M / 2 - ORCHARD_WILD.marginM;
      const lx = (random.next() * 2 - 1) * half;
      const lz = (random.next() * 2 - 1) * half;
      const center = squareCenter(GEOMETRY, orchard.grid, square.cell);
      // natočený sad: odchylka v osách čtverce (jako ve scéně)
      const [c, s] = orchard.grid ? rotationCosSin(orchard.grid.rotation) : [1, 0];
      const trees = (state.wildTrees ??= []);
      trees.push({
        id: nextWildId(trees),
        orchardId: orchard.id,
        x: Math.round((center.x + lx * c + lz * s) * 100) / 100,
        z: Math.round((center.z - lx * s + lz * c) * 100) / 100,
        apple,
        day,
      });
      square.wild = count + 1;
    }
  }
}

function nextWildId(trees: readonly WildTree[]): number {
  return trees.reduce((max, t) => Math.max(max, t.id + 1), WILD_TREE_ID_BASE);
}

/**
 * Nálet sadu zmizí (mutuje stav) – vesničané ho vyklučí: při vrácení opuštěného sadu (sad je zase
 * pravidelný) a při zbourání (vykácený sad nedá klády – demolition.md). Čtverce sadu zapomenou
 * počet.
 */
export function clearWildTrees(
  state: VillageState,
  orchard: Pick<Orchard, 'id' | 'squares'>,
): void {
  for (const square of orchard.squares) delete square.wild;
  if (!state.wildTrees) return;
  state.wildTrees = state.wildTrees.filter((t) => t.orchardId !== orchard.id);
  if (state.wildTrees.length === 0) delete state.wildTrees;
}
