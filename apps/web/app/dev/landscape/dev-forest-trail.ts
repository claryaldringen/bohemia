// VÝVOJOVÝ NÁSTROJ – ukázka zemské stezky lesem na /dev/landscape (roads.md – Průsek lesem; Martin,
// 19. 10. 2026: „Tam, kde zemská stezka prochází lesem, ať se les vykácí.“). Od vsi směrem, kde
// vede nejvíc lesem, jedna cesta: nejdřív vyšlapaná (les stojí), pak upravená s průsekem – co se
// vykácí, spočítá stejná funkce jádra jako stavba stezky (`swathTally`).
import {
  NO_OBSTACLE_CHANGES,
  PATH_WOODLAND,
  swathTally,
  tileCenterWorld,
  trailTerrain,
  type Landscape,
  type ObstacleLayer,
  type RoadPoint,
} from '@bohemia/game';
import type { SceneRoad } from '@/lib/village-view';

/** Stadia ukázky: vyšlapaná cesta lesem, pak upravená s průsekem. */
export const FOREST_TRAIL_STAGES = ['vyšlapaná', 'průsek'] as const;

export interface ForestTrailDemo {
  stage: number;
  road: SceneRoad;
  /** Odstraněné (pás cesty) a pokácené (po stranách – pařez) překážky průseku. */
  cleared: number[];
  felled: number[];
  /** Kam se podívá kamera – nejhlubší místo v lese na ose. */
  focus: { x: number; z: number };
}

const LENGTH_M = 520;
const START_M = 30;
const STEP_M = 10;

/** Ukázková stezka lesem od vsi – směr s nejdelším úsekem v lese (z 16). */
export function forestTrailDemo(
  l: Landscape,
  layer: ObstacleLayer,
  stage: number,
): ForestTrailDemo {
  const center = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const terrain = trailTerrain(l, layer);
  const woodland = (x: number, z: number): boolean => {
    const i = Math.round((x - terrain.originX) / terrain.cellM);
    const j = Math.round((z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return false;
    return (terrain.flags[j * terrain.width + i]! & PATH_WOODLAND) !== 0;
  };
  const axis = (angle: number): RoadPoint[] => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const points: RoadPoint[] = [];
    for (let d = START_M; d <= LENGTH_M; d += STEP_M) {
      // mírné vlnění osy – stezka není podle pravítka
      const side = 4 * Math.sin(d / 40);
      points.push({
        x: Math.round((center.x + dx * d - dz * side) * 100) / 100,
        z: Math.round((center.z + dz * d + dx * side) * 100) / 100,
      });
    }
    return points;
  };
  let best = axis(0);
  let bestScore = -1;
  for (let k = 0; k < 16; k++) {
    const points = axis((k / 16) * Math.PI * 2);
    const score = points.filter((p) => woodland(p.x, p.z)).length;
    if (score > bestScore) {
      bestScore = score;
      best = points;
    }
  }
  const inForest = best.filter((p) => woodland(p.x, p.z));
  const focus = inForest[Math.floor(inForest.length / 2)] ?? best[Math.floor(best.length / 2)]!;
  const cut = stage > 0;
  const tally = cut ? swathTally(best, layer, l, NO_OBSTACLE_CHANGES) : { cleared: [], felled: [] };
  return {
    stage,
    road: {
      id: 97,
      points: best,
      grade: cut ? 'improved' : 'trodden',
      ...(cut ? { swath: true as const } : {}),
    },
    cleared: tally.cleared,
    felled: tally.felled,
    focus,
  };
}
