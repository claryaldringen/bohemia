// Cesty k vchodům staveb (paths.md – Vchody; Martin, #6: „ke každé stavbě, kam se chodí, vede
// cesta až k jejímu vchodu, i když se tam chodí málo, třeba k hřbitovu jen na pohřby.“).
// Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin).

import { length2 } from '../../landscape';
import { ROAD_ACCESS, ROAD_ANCHORS, ROAD_GATE } from '../rules';
import type { Road, RoadPoint, StoredRoute, VillageRoads } from '../types';
import { anchorKindOf } from './road-anchors';
import {
  ATTACH_M,
  axisDistance,
  axisSlice,
  cm,
  lengthsAlong,
  roadGroundOf,
  toSegment,
} from './roads-geometry';
import { fieldTraffic, formRoad, plannedAxis } from './roads-form';
import { type SpotContext } from './roads-trees';
import { routeLine } from './routes';
import { type TrafficField } from './wear';

/**
 * Nejvytíženější trasa ke každé stavbě se vchodem, ke které se chodí (`StoredRoute.visit` – provoz
 * stavby, trasa končí ve vchodu – `anchorKindOf`), v pořadí tras. `built` vyřadí stavby, které
 * ještě nejsou hotové (rozestavěný hřbitov – trasy vedou ke čtvercům, ne do branky).
 */
function accessRoutes(
  routes: readonly StoredRoute[],
  built: (visit: string) => boolean,
): StoredRoute[] {
  const best = new Map<string, StoredRoute>();
  for (const route of routes) {
    if (!route.visit || anchorKindOf(route.to, route.purpose) !== 'entrance') continue;
    if (!built(route.visit)) continue;
    const known = best.get(route.visit);
    if (!known || route.trips > known.trips) best.set(route.visit, route);
  }
  return [...best.values()];
}

/** Vchod trasy bez pevné cesty (do `ROAD_ANCHORS.entranceM`) – bod vchodu, jinak null. */
function gateWithoutRoad(
  roads: VillageRoads,
  route: StoredRoute,
  cellM: number,
): { line: RoadPoint[]; near: (x: number, z: number) => number } | null {
  const line = routeLine(route, cellM);
  if (line.length < 2) return null;
  const near = axisDistance(roads.roads.filter((r) => !r.abandoned).map((r) => r.points));
  const gate = line[line.length - 1]!;
  return near(gate.x, gate.z) <= ROAD_ANCHORS.entranceM ? null : { line, near };
}

/** Cesta k vchodu, která by vznikla: body od vchodu zpět a jestli se připojí k pevné cestě. */
interface AccessPlan {
  points: RoadPoint[];
  joined: boolean;
}

/**
 * Plán cesty k vchodu trasy: od vchodu po trase zpět, dokud nedojde k pevné cestě (do ATTACH_M).
 * Null, když vchod cestu má, nebo by byla kratší než `ROAD_ACCESS.minM` (nevznikla by – `formRoad`).
 * Nic nemění.
 */
function accessPlan(roads: VillageRoads, route: StoredRoute, cellM: number): AccessPlan | null {
  const missing = gateWithoutRoad(roads, route, cellM);
  if (!missing) return null;
  const { line, near } = missing;
  const points: RoadPoint[] = [];
  let joined = false;
  for (let k = line.length - 1; k >= 0 && !joined; k--) {
    const p = line[k]!;
    points.push({ x: p.x, z: p.z });
    joined = near(p.x, p.z) <= ATTACH_M;
  }
  if (!plannedAxis(roads, points, false, joined ? ATTACH_M : false, ROAD_ACCESS.minM)) return null;
  return { points, joined };
}

/** Osa úseku ohnutá do vchodu (`gateBend`). */
interface GateBend {
  road: Road;
  points: RoadPoint[];
}

/**
 * Cesta jde kolem vchodu, ale nekončí v něm (paths.md – Vchody, Cesta do branky; Martin 25. 10.
 * 2026: „Jeden z největších problémů vidím tady u hřbitova“): živý úsek (ne vozový – zemní práce
 * se neohýbají) vede do `ROAD_ANCHORS.entranceM` od vchodu trasy, žádný úsek tam nekončí a osa
 * nevede bodem `ROAD_GATE.frontM` před vchodem (ve směru, odkud trasa přichází) – osa se ohne přes
 * ten bod, `ROAD_GATE.bendM` na každou stranu od nejbližšího bodu osy; konce úseku zůstanou.
 * Vrátí novou osu nejbližšího takového úseku, jinak null. Nic nemění.
 */
function gateBend(roads: VillageRoads, route: StoredRoute, cellM: number): GateBend | null {
  const line = routeLine(route, cellM);
  if (line.length < 2) return null;
  const gate = line[line.length - 1]!;
  const living = roads.roads.filter((r) => !r.abandoned && r.points.length >= 2);
  const reach = ROAD_ANCHORS.entranceM;
  const near = (p: RoadPoint): boolean => length2(p.x - gate.x, p.z - gate.z) <= reach;
  if (living.some((r) => near(r.points[0]!) || near(r.points[r.points.length - 1]!))) return null;
  // bod před vchodem – po čáře trasy zpět, první bod aspoň `frontM` od vchodu
  let back: RoadPoint | null = null;
  for (let k = line.length - 2; k >= 0 && !back; k--) {
    const p = line[k]!;
    if (length2(p.x - gate.x, p.z - gate.z) >= ROAD_GATE.frontM) back = p;
  }
  if (!back) return null;
  const d = length2(back.x - gate.x, back.z - gate.z);
  const front = {
    x: cm(gate.x + ((back.x - gate.x) * ROAD_GATE.frontM) / d),
    z: cm(gate.z + ((back.z - gate.z) * ROAD_GATE.frontM) / d),
  };
  // nejbližší živý úsek k vchodu
  let best: { road: Road; at: number; distance: number } | null = null;
  for (const road of living) {
    const along = lengthsAlong(road.points);
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const hit = toSegment(gate.x, gate.z, a, b);
      if (hit.distance > reach || (best && hit.distance >= best.distance)) continue;
      best = {
        road,
        at: along[k - 1]! + (along[k]! - along[k - 1]!) * hit.t,
        distance: hit.distance,
      };
    }
  }
  if (!best || best.road.grade === 'wagon') return null;
  const { road, at } = best;
  if (axisDistance([road.points])(front.x, front.z) <= ROAD_GATE.toleranceM) return null;
  const along = lengthsAlong(road.points);
  const length = along[along.length - 1]!;
  const from = at - ROAD_GATE.bendM;
  const to = at + ROAD_GATE.bendM;
  if (from < ROAD_GATE.toleranceM || to > length - ROAD_GATE.toleranceM) return null;
  return {
    road,
    points: [...axisSlice(road.points, 0, from), front, ...axisSlice(road.points, to, length)],
  };
}

/** Chybí cesta k vchodu některé stavby (`accessRoads` by něco založil)? Nic nemění. */
export function accessDue(
  roads: VillageRoads,
  routes: readonly StoredRoute[],
  cellM: number,
  built: (visit: string) => boolean = () => true,
): boolean {
  return accessRoutes(routes, built).some(
    (route) => accessPlan(roads, route, cellM) !== null || gateBend(roads, route, cellM) !== null,
  );
}

/**
 * Cesty k vchodům (paths.md – Vchody; mutuje `roads`): u hotové stavby, ke které vede trasa
 * s provozem stavby a u jejíhož vchodu (do `ROAD_ANCHORS.entranceM`) nekončí ani nevede pevná
 * cesta, vznikne vyšlapaná cesta po nejvytíženější trase od vchodu k první pevné cestě (připojí se
 * do ATTACH_M – rozcestí), jinak celou trasou až k bráně domu – bez ohledu na vyšlapanost. Kratší
 * než `ROAD_ACCESS.minM` nevznikne. Cesta, která jde kolem vchodu a nekončí v něm, se do něj ohne
 * (`gateBend`). Dokud se ke stavbě chodí, cesta nezarůstá (končí ve vchodu –
 * `settleRoadCondition`). Vrátí nové cesty.
 */
export function accessRoads(
  roads: VillageRoads,
  routes: readonly StoredRoute[],
  cellM: number,
  day: number,
  context: SpotContext,
  field: TrafficField | null,
  built: (visit: string) => boolean = () => true,
): Road[] {
  const made: Road[] = [];
  const traffic = (points: readonly RoadPoint[]): number =>
    field ? fieldTraffic(points, field) : 0;
  for (const route of accessRoutes(routes, built)) {
    const plan = accessPlan(roads, route, cellM);
    if (!plan) {
      // cesta jde kolem vchodu – ohne se do něj (paths.md – Vchody, Cesta do branky)
      const bend = gateBend(roads, route, cellM);
      if (bend) {
        bend.road.points = bend.points;
        bend.road.ground = roadGroundOf(bend.points, context.terrain);
        delete bend.road.lined;
      }
      continue;
    }
    const { points, joined } = plan;
    const road = formRoad(
      roads,
      points,
      false,
      joined ? ATTACH_M : false,
      day,
      traffic,
      context,
      ROAD_ACCESS.minM,
    );
    if (road) made.push(road);
  }
  return made;
}
