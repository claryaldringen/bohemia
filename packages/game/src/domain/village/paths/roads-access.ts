// Cesty k vchodům staveb (paths.md – Vchody; Martin, #6: „ke každé stavbě, kam se chodí, vede
// cesta až k jejímu vchodu, i když se tam chodí málo, třeba k hřbitovu jen na pohřby.“).
// Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin).

import { ROAD_ACCESS, ROAD_ANCHORS } from '../rules';
import type { Road, RoadPoint, StoredRoute, VillageRoads } from '../types';
import { anchorKindOf } from './road-anchors';
import { ATTACH_M, axisDistance } from './roads-geometry';
import { fieldTraffic, formRoad } from './roads-form';
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

/** Chybí cesta k vchodu některé stavby (`accessRoads` by něco založil)? Nic nemění. */
export function accessDue(
  roads: VillageRoads,
  routes: readonly StoredRoute[],
  cellM: number,
  built: (visit: string) => boolean = () => true,
): boolean {
  return accessRoutes(routes, built).some((route) => gateWithoutRoad(roads, route, cellM) !== null);
}

/**
 * Cesty k vchodům (paths.md – Vchody; mutuje `roads`): u hotové stavby, ke které vede trasa
 * s provozem stavby a u jejíhož vchodu (do `ROAD_ANCHORS.entranceM`) nekončí ani nevede pevná
 * cesta, vznikne vyšlapaná cesta po nejvytíženější trase od vchodu k první pevné cestě (připojí se
 * do ATTACH_M – rozcestí), jinak celou trasou až k bráně domu – bez ohledu na vyšlapanost. Kratší
 * než `ROAD_ACCESS.minM` nevznikne. Dokud se ke stavbě chodí, cesta nezarůstá (končí ve vchodu –
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
    const missing = gateWithoutRoad(roads, route, cellM);
    if (!missing) continue;
    const { line, near } = missing;
    // od vchodu po trase zpět, dokud nedojde k pevné cestě
    const points: RoadPoint[] = [];
    let joined = false;
    for (let k = line.length - 1; k >= 0 && !joined; k--) {
      const p = line[k]!;
      points.push({ x: p.x, z: p.z });
      joined = near(p.x, p.z) <= ATTACH_M;
    }
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
