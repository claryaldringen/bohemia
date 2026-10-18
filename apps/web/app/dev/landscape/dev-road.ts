// VÝVOJOVÝ NÁSTROJ – ukázka pevné cesty se stromy v různém stáří na /dev/landscape (bez
// databáze a simulace). Skutečné pevné cesty a stromy u nich počítá herní jádro jednou za rok
// (roads.md, paths/roads.ts) – tady jen jedna cesta od vsi přes louku, místa na stromy ze stejné
// funkce jádra a na nich stromy po řadě v každém stadiu (keř, mladý, plný strom, souš, pařez).
import {
  ROAD_TREE_ID_BASE,
  roadTreeSpots,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type RoadTreeSpecies,
} from '@bohemia/game';
import type { SceneRoad, SceneRoadTree } from '@/lib/village-view';

/** Stadia stromů na ukázce po řadě (keř malý a velký, strom mladý, poloviční a plný, souš, pařez). */
const DEMO_STAGES: Pick<SceneRoadTree, 'stage' | 'growth'>[] = [
  { stage: 'shrub', growth: 0.3 },
  { stage: 'shrub', growth: 1 },
  { stage: 'tree', growth: 0.3 },
  { stage: 'tree', growth: 0.6 },
  { stage: 'tree', growth: 1 },
  { stage: 'snag', growth: 1 },
  { stage: 'stump', growth: 1 },
];
const DEMO_SPECIES: RoadTreeSpecies[] = ['oak', 'elm', 'poplar', 'oak'];
/** Cesta: body po 10 m, délka 170 m, začíná kus od středu vsi, mírný oblouk. */
const STEP_M = 10;
const POINTS = 18;
const START_M = 30;
const BEND_M = 14;

/**
 * Ukázková pevná cesta od vsi přes louku – ze směrů kolem vsi ten, kde vede nejvíc po louce
 * (ne přes vodu a les) – a stromy na místech u ní v každém stadiu.
 */
export function demoRoad(l: Landscape): { roads: SceneRoad[]; trees: SceneRoadTree[] } {
  const center = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const meadow = (x: number, z: number): boolean => {
    const tile = tileOfWorldPoint(l, x, z);
    return tile !== null && surfaceAt(l, tile.x, tile.y) === 'meadow';
  };
  const pathAt = (angle: number): { x: number; z: number }[] => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    return Array.from({ length: POINTS }, (_, k) => {
      const along = START_M + k * STEP_M;
      const side = BEND_M * Math.sin((k / (POINTS - 1)) * Math.PI);
      return {
        x: Math.round((center.x + dx * along - dz * side) * 100) / 100,
        z: Math.round((center.z + dz * along + dx * side) * 100) / 100,
      };
    });
  };
  let points = pathAt(0);
  let best = -1;
  for (let k = 0; k < 12; k++) {
    const candidate = pathAt((k / 12) * Math.PI * 2);
    const score = candidate.filter((p) => meadow(p.x, p.z)).length;
    if (score > best) {
      best = score;
      points = candidate;
    }
  }
  const spots = roadTreeSpots(points, 7, meadow);
  const trees = spots.map((p, k): SceneRoadTree => ({
    id: ROAD_TREE_ID_BASE + k,
    x: p.x,
    z: p.z,
    species: DEMO_SPECIES[k % DEMO_SPECIES.length]!,
    ...DEMO_STAGES[k % DEMO_STAGES.length]!,
  }));
  return { roads: [{ id: 1, points, grade: 'trodden' }], trees };
}
