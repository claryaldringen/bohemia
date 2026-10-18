// VÝVOJOVÝ NÁSTROJ – ukázka pevné cesty se stromy v různém stáří na /dev/landscape (bez
// databáze a simulace). Skutečné pevné cesty a stromy u nich počítá herní jádro jednou za rok
// (roads.md, paths/roads.ts) – tady jedna cesta od vsi přes louku, místa na stromy ze stejné
// funkce jádra a na nich stromy po řadě v každém stadiu (keř, mladý, plný strom, souš, pařez);
// uprostřed z ní odbočuje krátká cesta (rozcestí tří úseků – udusaný plácek), další cesta vede
// k nejbližšímu brodu přes potok (mokřina a brod z terénu jádra). Všechny jdou přepnout po
// stupních vylepšení (`DEMO_ROAD_STAGES`). Podél cesty k brodu (bez ní podél odbočky) stojí
// jabloně po 10 m na místech z funkce jádra – přepínají se stadia (`DEMO_APPLE_STAGES`:
// vytyčení, mladé u kůlu, plodící, souše).
import {
  PATH_FORD,
  ROAD_APPLES,
  ROAD_TREE_ID_BASE,
  roadGroundOf,
  roadTreeSpots,
  walkGroundOf,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type RoadGrade,
  type RoadTreeSpecies,
} from '@bohemia/game';
import type { SceneRoad, SceneRoadApple, SceneRoadTree } from '@/lib/village-view';

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
export function demoRoad(l: Landscape): {
  roads: SceneRoad[];
  trees: SceneRoadTree[];
  apples: SceneRoadApple[];
  /** Rozcestí uprostřed první cesty – kam se podívá kamera. */
  focus: { x: number; z: number };
} {
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
  const ground = walkGroundOf(l).terrain;
  const spots = roadTreeSpots(points, 7, meadow);
  const trees = spots.map((p, k): SceneRoadTree => ({
    id: ROAD_TREE_ID_BASE + k,
    x: p.x,
    z: p.z,
    species: DEMO_SPECIES[k % DEMO_SPECIES.length]!,
    ...DEMO_STAGES[k % DEMO_STAGES.length]!,
  }));
  // uprostřed cesty odbočka – rozcestí tří úseků (udusaný plácek, roads.md – Úseky a rozcestí)
  const mid = Math.floor(points.length / 2);
  const node = points[mid]!;
  const prev = points[mid - 1]!;
  const len = Math.hypot(node.x - prev.x, node.z - prev.z) || 1;
  const nx = -(node.z - prev.z) / len;
  const nz = (node.x - prev.x) / len;
  const branch = [0, 25, 50].map((d, k) => ({
    x: Math.round((node.x + nx * d + ((node.x - prev.x) / len) * k * 6) * 100) / 100,
    z: Math.round((node.z + nz * d + ((node.z - prev.z) / len) * k * 6) * 100) / 100,
  }));
  const head = points.slice(0, mid + 1);
  const tail = points.slice(mid);
  const roads: SceneRoad[] = [
    { id: 1, points: head, grade: 'trodden', ground: roadGroundOf(head, ground) },
    { id: 3, points: tail, grade: 'trodden', ground: roadGroundOf(tail, ground) },
    { id: 4, points: branch, grade: 'trodden', ground: roadGroundOf(branch, ground) },
  ];
  // cesta k nejbližšímu brodu a kus za něj – mokřina a brod pro hať a lávku
  let ford: { x: number; z: number } | null = null;
  let fordD = Infinity;
  for (let j = 0; j < ground.height; j++) {
    for (let i = 0; i < ground.width; i++) {
      if (!(ground.flags[j * ground.width + i]! & PATH_FORD)) continue;
      const x = ground.originX + i * ground.cellM;
      const z = ground.originZ + j * ground.cellM;
      const d = Math.hypot(x - center.x, z - center.z);
      if (d < fordD) {
        fordD = d;
        ford = { x, z };
      }
    }
  }
  if (ford && fordD > 20) {
    const dx = (ford.x - center.x) / fordD;
    const dz = (ford.z - center.z) / fordD;
    const start = Math.min(30, fordD / 2);
    const axis = [0, 0.5, 1].map((t) => {
      const along = start + (fordD + 30 - start) * t;
      return {
        x: Math.round((center.x + dx * along) * 100) / 100,
        z: Math.round((center.z + dz * along) * 100) / 100,
      };
    });
    roads.push({ id: 2, points: axis, grade: 'trodden', ground: roadGroundOf(axis, ground) });
  }
  // jabloně podél poslední cesty – místa po 10 m jako v jádru (roads.md – Vysazení jabloní),
  // ne ve vodě, v lese ani u stromů první cesty
  const appleRoad = roads[roads.length - 1]!;
  const dry = (x: number, z: number): boolean => {
    const i = Math.round((x - ground.originX) / ground.cellM);
    const j = Math.round((z - ground.originZ) / ground.cellM);
    if (i < 0 || j < 0 || i >= ground.width || j >= ground.height) return false;
    const c = j * ground.width + i;
    return Number.isFinite(ground.cost[c]!) && !(ground.flags[c]! & PATH_FORD) && meadow(x, z);
  };
  const appleSpots = roadTreeSpots(
    appleRoad.points,
    11,
    (x, z) =>
      dry(x, z) && !trees.some((t) => Math.hypot(t.x - x, t.z - z) < ROAD_APPLES.treeClearM),
    {
      spacingM: { from: ROAD_APPLES.spacingM, to: ROAD_APPLES.spacingM },
      offsetM: ROAD_APPLES.offsetM,
      gapM: ROAD_APPLES.gapM,
    },
  );
  const apples = appleSpots.map((p, k): SceneRoadApple => ({
    id: ROAD_TREE_ID_BASE + 500 + k,
    roadId: appleRoad.id,
    x: p.x,
    z: p.z,
    stage: 'planting',
    growth: 0,
    fruit: false,
  }));
  return { roads, trees, apples, focus: { x: node.x, z: node.z } };
}

/** Stadia jabloní ukázky: žádné, vytyčení, mladé u kůlu, plodící s jablky, staré, souše. */
export const DEMO_APPLE_STAGES: readonly {
  label: string;
  apple?: Pick<SceneRoadApple, 'stage' | 'growth' | 'fruit'>;
}[] = [
  { label: 'žádné' },
  { label: 'vytyčení', apple: { stage: 'planting', growth: 0, fruit: false } },
  { label: 'mladé', apple: { stage: 'tree', growth: 0.4, fruit: false } },
  { label: 's jablky', apple: { stage: 'tree', growth: 1, fruit: true } },
  { label: 'bez jablek', apple: { stage: 'tree', growth: 1, fruit: false } },
  { label: 'souše', apple: { stage: 'snag', growth: 1, fruit: false } },
];

/** Jabloně ukázky ve stadiu `stage` (index v DEMO_APPLE_STAGES). */
export function demoApplesStage(
  apples: readonly SceneRoadApple[],
  stage: number,
): SceneRoadApple[] {
  const s = DEMO_APPLE_STAGES[stage % DEMO_APPLE_STAGES.length]!;
  return s.apple ? apples.map((a) => ({ ...a, ...s.apple })) : [];
}

/** Stupně ukázky: vyšlapaná, úprava rozestavěná, upravená, hať rozestavěná, hať a lávka. */
export const DEMO_ROAD_STAGES: readonly {
  label: string;
  grade: RoadGrade;
  upgrade?: { grade: RoadGrade; progress: number };
}[] = [
  { label: 'vyšlapaná', grade: 'trodden' },
  { label: 'úprava 40 %', grade: 'trodden', upgrade: { grade: 'improved', progress: 0.4 } },
  { label: 'upravená', grade: 'improved' },
  { label: 'hať 50 %', grade: 'improved', upgrade: { grade: 'causeway', progress: 0.5 } },
  { label: 'hať a lávka', grade: 'causeway' },
];

/** Ukázkové cesty ve stupni `stage` (index v DEMO_ROAD_STAGES). */
export function demoRoadStage(roads: readonly SceneRoad[], stage: number): SceneRoad[] {
  const s = DEMO_ROAD_STAGES[stage % DEMO_ROAD_STAGES.length]!;
  return roads.map((r) => {
    const { upgrade: _old, ...rest } = r;
    void _old;
    return { ...rest, grade: s.grade, ...(s.upgrade ? { upgrade: s.upgrade } : {}) };
  });
}
