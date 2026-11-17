// Stezka kostry prémiové krajiny (premium-landscapes.md – Kostra světa; Vyvýšenina nad brodem
// s obchodní stezkou, Horský průsmyk s obchodní stezkou): hotová dálková cesta od počátku.
import { skeletonFeaturesOf, type Landscape, type ObstacleLayer } from '../../landscape';
import { cloneState } from '../core/clone';
import { addTrailRoads, roadLengthM } from '../paths/roads';
import { trailTerrain } from '../paths/terrain';
import { villageOrigin } from '../placement/placement-squares';
import { premiumSites } from '../core/premium-effects';
import { cutRoadSwath } from '../roads/road-swath';
import { upgradePieces, villageTrails } from './trail';
import { DIRECTION_VECTORS } from './trail-axis';
import type { Direction8, RoadPoint, Trail, VillageState } from '../types';

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

/** Osa prvku `route` prémiové krajiny (brod, průsmyk, premium 1 i 2), nebo null. */
function premiumRouteLine(l: Landscape): RoadPoint[] | null {
  const line = premiumSites(l, 'route')[0]?.line;
  return line && line.length >= 2 ? line.map(([x, z]) => ({ x, z })) : null;
}

/**
 * Osy stezky krajiny (plán 2026-11-16-dense-forest – Rozhodnutí 2): prémiová krajina s prvkem
 * `route` jednu osu prvku, mapa se stezkou kostry úseky `skeletonFeaturesOf(l).route.legs` v jejich
 * pořadí (každý od okraje mapy k místu vsi) – tytéž zdroje jako stezka kostry nové vsi
 * (`withSkeletonRoute`), jen bez dělení u vsi. Závisí jen na krajině, proto je průsekem mřížky
 * pochodu i na mapě bez vsi. Krajina bez stezky (suchá mapa, NPC) [].
 */
export function landscapeTrailLines(l: Landscape): RoadPoint[][] {
  const premium = premiumRouteLine(l);
  if (premium) return [premium];
  const route = skeletonFeaturesOf(l)?.route;
  return route ? route.legs.map((leg) => leg.map(([x, z]) => ({ x, z }))) : [];
}

/**
 * Větve stezky kostry krajiny od vsi ven se směrem každé (osy `landscapeTrailLines`): prémiová
 * krajina s prvkem `route` jde po ose prvku rozdělené u vsi, mapa se stezkou kostry (lidský hráč)
 * po úsecích – směr dává strana mapy, kde úsek končí (křižovatka = 3 směry, konec stezky = 1).
 * Krajina bez stezky (suchá mapa, NPC) nemá nic.
 */
function routeBranches(
  landscape: Landscape,
  origin: RoadPoint,
): { direction: Direction8; points: RoadPoint[] }[] {
  const lines = landscapeTrailLines(landscape);
  if (premiumRouteLine(landscape)) {
    return routeHalves(lines[0]!, origin).map((half) => ({
      direction: directionTo(origin, half[half.length - 1]!),
      points: half,
    }));
  }
  const ends = skeletonFeaturesOf(landscape)?.route?.ends ?? [];
  const branches: { direction: Direction8; points: RoadPoint[] }[] = [];
  lines.forEach((leg, i) => {
    const side = ends[i]?.side;
    if (!side || leg.length < 2) return;
    // úsek vede od okraje k vsi, stezka od vsi ven
    branches.push({ direction: side, points: leg.reverse() });
  });
  return branches;
}

/**
 * Stezka kostry pro novou ves (premium-landscapes.md – Kostra světa: „Stezka kostry je hotová
 * dálková cesta od počátku … obchod se sousedy v obou jejích směrech jde hned, jako po hotové
 * zemské stezce – bez stavby“): osa stezky (prvek `route` prémiové krajiny nebo trasa kostry
 * světa na mapě lidského hráče) se uloží jako pevné cesty (`addTrailRoads`), úseky dostanou
 * stupeň hotové zemské stezky (upravená cesta, hať a lávka přes mokřinu a brod) a průsek lesem
 * bez klád (`cutRoadSwath` – stezka nevede pod korunami) a ves má hotovou zemskou stezku v každém
 * směru, kam osa vede (`Trail.builtDay` = den založení). Vrátí kopii; krajina bez stezky nebo ves,
 * která už stezku má, beze změny.
 */
export function withSkeletonRoute(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  day: number,
): VillageState {
  const origin = villageOrigin(state);
  if (!origin || villageTrails(state).length > 0) return state;
  const branches = routeBranches(landscape, origin);
  if (branches.length === 0) return state;
  const next = cloneState(state);
  const terrain = trailTerrain(landscape, obstacles);
  const seen = new Set<Direction8>();
  for (const { direction, points: half } of branches) {
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
