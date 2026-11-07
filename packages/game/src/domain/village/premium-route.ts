// Stezka kostry prémiové krajiny (premium-landscapes.md – Kostra světa; Vyvýšenina nad brodem
// s obchodní stezkou, Horský průsmyk s obchodní stezkou): hotová dálková cesta od počátku.
import type { Landscape, ObstacleLayer } from '../landscape';
import { cloneState } from './clone';
import { addTrailRoads, roadLengthM } from './paths/roads';
import { trailTerrain } from './paths/terrain';
import { villageOrigin } from './placement-squares';
import { premiumSites } from './premium-effects';
import { cutRoadSwath } from './road-swath';
import { upgradePieces, villageTrails } from './trail';
import { DIRECTION_VECTORS } from './trail-axis';
import type { Direction8, RoadPoint, Trail, VillageState } from './types';

/** Směr z osmi, kterým bod `to` leží od `from` (nejbližší paprsek). */
function directionTo(from: RoadPoint, to: RoadPoint): Direction8 {
  let best: Direction8 = 'N';
  let bestDot = -Infinity;
  for (const [direction, v] of Object.entries(DIRECTION_VECTORS) as [
    Direction8,
    { x: number; z: number },
  ][]) {
    const dot = (to.x - from.x) * v.x + (to.z - from.z) * v.z;
    if (dot > bestDot) {
      bestDot = dot;
      best = direction;
    }
  }
  return best;
}

/**
 * Obě poloviny osy stezky od místa nejblíž vsi ke krajům mapy (od vsi ven); polovina kratší než
 * dva body vypadne.
 */
function routeHalves(line: readonly RoadPoint[], origin: RoadPoint): RoadPoint[][] {
  let k = 0;
  let bestD = Infinity;
  line.forEach((p, i) => {
    const d = (p.x - origin.x) * (p.x - origin.x) + (p.z - origin.z) * (p.z - origin.z);
    if (d < bestD) {
      bestD = d;
      k = i;
    }
  });
  return [line.slice(0, k + 1).reverse(), line.slice(k)].filter((half) => half.length >= 2);
}

/**
 * Stezka kostry pro novou ves (premium-landscapes.md – Kostra světa: „Stezka kostry je hotová
 * dálková cesta od počátku … obchod se sousedy v obou jejích směrech jde hned, jako po hotové
 * zemské stezce – bez stavby“): osa prvku `route` (brod, průsmyk) se uloží jako pevné cesty
 * (`addTrailRoads`), úseky dostanou stupeň hotové zemské stezky (upravená cesta, hať a lávka přes
 * mokřinu a brod) a průsek lesem bez klád (`cutRoadSwath` – stezka nevede pod korunami) a ves má
 * hotovou zemskou stezku v obou směrech, kam osa vede (`Trail.builtDay` = den založení). Vrátí
 * kopii; krajina bez prvku `route` nebo ves, která už stezku má, beze změny.
 */
export function withPremiumRoute(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  day: number,
): VillageState {
  const line = premiumSites(landscape, 'route')[0]?.line;
  const origin = villageOrigin(state);
  if (!line || line.length < 2 || !origin || villageTrails(state).length > 0) return state;
  const next = cloneState(state);
  const terrain = trailTerrain(landscape, obstacles);
  const seen = new Set<Direction8>();
  for (const half of routeHalves(
    line.map(([x, z]) => ({ x, z })),
    origin,
  )) {
    const direction = directionTo(origin, half[half.length - 1]!);
    if (seen.has(direction)) continue;
    seen.add(direction);
    const ids = addTrailRoads(next, half, day, landscape, obstacles, terrain);
    if (ids.length === 0) continue;
    const trail: Trail = {
      id: next.nextId++,
      direction,
      pieces: ids.map((roadId) => ({ roadId, grade: 'improved', manDays: 0 })),
      lengthM: Math.round(roadLengthM({ points: half }) * 10) / 10,
      startedDay: day,
      builtDay: day,
    };
    (next.trails ??= []).push(trail);
    upgradePieces(next, trail, trail.pieces.length);
    if (obstacles) {
      for (const id of ids) {
        const road = next.roads?.roads.find((r) => r.id === id);
        if (road && !road.swath)
          cutRoadSwath(next, road, day, obstacles, landscape, { logs: false });
      }
    }
  }
  return next;
}
