// Jednorázová oprava sítě cest (paths.md – Jednorázová oprava sítě 25. 10. 2026; Martin 25. 10. 2026:
// „Prosím tě, ty cesty pořád zlobí“, „Jeden z největších problémů vidím tady u hřbitova“, „Žádná
// cesta nemůže existovat jen tak sama v prostoru, vždycky musí spojovat dvě místa – kombinaci budov
// a křižovatek.“).

import type { Landscape, ObstacleLayer } from '../../landscape';
import { cloneState } from '../core/clone';
import { ROAD_LOOSE_WAGON, ROAD_REBUILD } from '../rules';
import type { Road, RoadPoint, VillageState } from '../types';
import { roadChain, roadChains } from './road-chains';
import { anchorTermini } from './roads-tidy';
import { roadAnchors } from './road-anchors';
import { trafficOnRoads } from './road-condition';
import { tidyRoadsNow } from './roads';
import { axisDistance, resample } from './roads-geometry';
import { pathCellM } from './terrain';
import { refreshWalkDistances, villageBlockedAt } from './village';
import { abandonBlockedStretches } from './roads-overgrow';
import { buildWagonRoadNow, planWagonRoad, wagonPlanInputOf } from '../roads/wagon-road';

/** Konec úseku patří ke křižovatce, jejímž je ramenem, když je od jejího středu nejvýš tolik (m). */
const JUNCTION_END_M = 15;
/** Krok vzorků osy při měření podílu a provozu (m). */
const STEP_M = 2;

type Distance = (x: number, z: number) => number;

/** Diagnostika opravy pro testy a měření – hra ji nečte. */
export interface RepairReport {
  /** Nové zemní práce vozových spojek. */
  joined: number[];
  /** Vozové cesty bez napojení a bez provozu, které se opustily. */
  abandoned: number[];
  /** Důvody, proč plán spojky nevyšel. */
  failed: string[];
}

function endKey(p: RoadPoint): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/** Podíl délky osy do `ROAD_REBUILD.nearM` od os `near`. */
function shareNear(points: readonly RoadPoint[], near: Distance): number {
  const samples = resample(points, null, STEP_M).points;
  if (samples.length === 0) return 0;
  return samples.filter((p) => near(p.x, p.z) <= ROAD_REBUILD.nearM).length / samples.length;
}

/** Úseky, které drží práce (vylepšení ve stavbě, nehotová stezka) – oprava je nemění. */
function busyRoads(state: VillageState): Set<number> {
  return new Set([
    ...state.constructions.flatMap((c) => c.roadIds ?? []),
    ...(state.trails ?? [])
      .filter((t) => typeof t.builtDay !== 'number')
      .flatMap((t) => t.pieces.map((p) => p.roadId)),
  ]);
}

/**
 * Napojení konců úseků (nic nemění): `wagonAt(road, p)` – v konci `p` úseku `road` končí vozová
 * cesta, nebo je úsek ramenem křižovatky (do JUNCTION_END_M) s vozovým ramenem; `linked(road, p)` –
 * v konci končí jiný úsek, nebo je úsek tam ramenem křižovatky.
 */
function endsOf(state: VillageState): {
  wagonAt: (road: Road, p: RoadPoint) => boolean;
  linked: (road: Road, p: RoadPoint) => boolean;
} {
  const roads = state.roads!;
  const living = roads.roads.filter((r) => !r.abandoned && r.points.length >= 2);
  const byEnd = new Map<string, Road[]>();
  for (const r of living) {
    for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
      byEnd.set(endKey(p), [...(byEnd.get(endKey(p)) ?? []), r]);
    }
  }
  const grade = new Map(living.map((r) => [r.id, r.grade] as const));
  const junctionOf = (road: Road, p: RoadPoint): readonly (number | null)[] | null => {
    for (const j of roads.junctions ?? []) {
      if (!j.arms.includes(road.id)) continue;
      const dx = j.x - p.x;
      const dz = j.z - p.z;
      if (dx * dx + dz * dz <= JUNCTION_END_M * JUNCTION_END_M) return j.arms;
    }
    return null;
  };
  return {
    wagonAt: (road, p) =>
      (byEnd.get(endKey(p)) ?? []).some((r) => r !== road && r.grade === 'wagon') ||
      (junctionOf(road, p) ?? []).some(
        (a) => a !== null && a !== road.id && grade.get(a) === 'wagon',
      ),
    linked: (road, p) =>
      (byEnd.get(endKey(p)) ?? []).some((r) => r !== road) || junctionOf(road, p) !== null,
  };
}

/**
 * Vozové spojky (mutuje): řetěz bez vozové cesty, jehož oba konce navazují na vozovou cestu
 * (`wagonAt`) a jehož aspoň `ROAD_REBUILD.share` délky leží u staré vozové osy (`oldAxes`), se upraví
 * (zaplaceno) a naplánuje jako hotová vozová cesta jako v přestavbě – vozová cesta tak vede vcelku
 * (Vlkov: #941 – kus #906 u hřbitova – #975). Nevyjde-li plán, řetěz zůstane upravený.
 */
function joinWagonChains(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  oldAxes: Distance,
  report: RepairReport,
): void {
  const busy = busyRoads(state);
  const { wagonAt } = endsOf(state);
  const candidates = roadChains(state.roads!.roads)
    .filter((chain) => {
      if (chain.length === 0) return false;
      if (chain.some((l) => l.road.grade === 'wagon' || busy.has(l.road.id))) return false;
      const head = chain[0]!;
      const tail = chain[chain.length - 1]!;
      const start = head.reversed
        ? head.road.points[head.road.points.length - 1]!
        : head.road.points[0]!;
      const end = tail.reversed
        ? tail.road.points[0]!
        : tail.road.points[tail.road.points.length - 1]!;
      if (!wagonAt(head.road, start) || !wagonAt(tail.road, end)) return false;
      return (
        shareNear(
          chain.flatMap((l) => l.road.points),
          oldAxes,
        ) >= ROAD_REBUILD.share
      );
    })
    .map((chain) => chain[0]!.road.id);
  for (const id of candidates) {
    const chain = roadChain(state.roads!.roads, id);
    if (chain.length === 0 || chain.some((l) => l.road.grade === 'wagon')) continue;
    for (const { road } of chain) {
      road.grade = 'improved';
      delete road.unbridged;
    }
    const plan = planWagonRoad(wagonPlanInputOf(state, day, id, landscape, obstacles));
    if (!plan.ok) {
      report.failed.push(plan.reason);
      continue;
    }
    report.joined.push(buildWagonRoadNow(state, plan, day, landscape, obstacles).id);
  }
}

/**
 * Den dostavění vozové cesty: poslední dostavěný kus hotových zemních prací (ne rozestavěných ani
 * opuštěných přestavbou), na kterých úsek leží (aspoň `ROAD_REBUILD.share` délky do `nearM` od
 * profilu); bez nich null.
 */
function wagonBuiltDay(road: Road, state: VillageState): number | null {
  let built: number | null = null;
  for (const e of state.roads!.earthworks ?? []) {
    if (e.constructionId !== undefined || e.abandonedDay !== undefined) continue;
    if (shareNear(road.points, axisDistance([e.profile])) < ROAD_REBUILD.share) continue;
    for (const piece of e.pieces) {
      if (piece.builtDay !== null && (built === null || piece.builtDay > built)) {
        built = piece.builtDay;
      }
    }
  }
  return built;
}

/**
 * Vozová cesta, která zůstala bez napojení (volný konec mimo kotvu i po úklidu – díra větší než
 * `ROAD_JOIN.gapM`) a po které nejde žádná trasa ani vůz, je opuštěná – bledne a zmizí (mutuje).
 * Ne čerstvá – do `ROAD_LOOSE_WAGON.freshDays` od dostavění (`wagonBuiltDay`, bez zemních prací
 * od vzniku úseku) po ní zatím nikdo jet nemusel – a nikdy vozová cesta na hotových zemních
 * pracích, která je aspoň jedním koncem napojená na síť (zarůstá pomalu podle druhu).
 */
export function abandonLooseWagons(
  state: VillageState,
  day: number,
  landscape: Landscape,
  report: RepairReport,
): void {
  const roads = state.roads!;
  const routes = state.routes!.list;
  const isEnd = anchorTermini(roadAnchors(routes, landscape));
  const traffic = trafficOnRoads(routes, pathCellM(landscape));
  const { linked } = endsOf(state);
  const busy = busyRoads(state);
  for (const road of roads.roads) {
    if (road.grade !== 'wagon' || road.abandoned || road.points.length < 2 || busy.has(road.id)) {
      continue;
    }
    const ends = [road.points[0]!, road.points[road.points.length - 1]!];
    const joined = ends.filter((p) => linked(road, p) || isEnd(p)).length;
    if (joined === ends.length) continue;
    const built = wagonBuiltDay(road, state);
    if (day - (built ?? road.bornDay) < ROAD_LOOSE_WAGON.freshDays) continue;
    if (built !== null && joined > 0) continue;
    if ((road.cartTraffic?.[road.cartTraffic.length - 1] ?? 0) > 0) continue;
    if (resample(road.points, null, STEP_M).points.some((p) => traffic(p.x, p.z) > 0)) continue;
    road.abandoned = true;
    report.abandoned.push(road.id);
  }
}

/**
 * Oprava sítě (čistá funkce – vstup nemění): kusy pod stavbami opuštěné a s krátkým stavem
 * (`abandonBlockedStretches`), úklid se zacelením děr i u hotových vozových cest (do
 * `ROAD_JOIN.gapM`), cesty do branek a křižovatky (`tidyRoadsNow`); vozové spojky po staré vozové
 * ose (`joinWagonChains`); nenapojené vozové cesty bez provozu opuštěné (`abandonLooseWagons`); po
 * změně přepočet tras a znovu úklid a křižovatky.
 */
export function repairRoads(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RepairReport,
): VillageState {
  return drain(repairRoadsSteps(state, landscape, obstacles, report));
}

/** `repairRoads` po krocích – server mezi nimi dává přestávky (port `Pause`); výsledek na nich nezávisí. */
export function* repairRoadsSteps(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report: RepairReport = { joined: [], abandoned: [], failed: [] },
): Generator<void, VillageState, void> {
  const next = cloneState(state);
  const roads = next.roads!;
  const day = next.lastDay;
  const chronicle = next.chronicle.length;
  // staré vozové osy – hotové zemní práce (i ty, které přestavba opustila)
  const oldAxes = axisDistance(
    (roads.earthworks ?? []).filter((e) => e.constructionId === undefined).map((e) => e.profile),
  );
  // kusy pod stavbami opuštěné a s krátkým stavem hned – zmizí do roka
  const blocked = villageBlockedAt(next, day, landscape);
  if (blocked) abandonBlockedStretches(roads, next.constructions, next.trails, blocked);
  tidyRoadsNow(next, landscape, obstacles);
  yield;
  joinWagonChains(next, day, landscape, obstacles, oldAxes, report);
  if (report.joined.length > 0) {
    yield;
    refreshWalkDistances(next, day, landscape, obstacles, true);
    yield;
    tidyRoadsNow(next, landscape, obstacles);
  }
  abandonLooseWagons(next, day, landscape, report);
  yield;
  refreshWalkDistances(next, day, landscape, obstacles, true);
  yield;
  tidyRoadsNow(next, landscape, obstacles);
  next.chronicle.length = chronicle;
  return next;
}

/**
 * Ves jednou opraví síť cest (`repairRoads`) a dostane příznak `roads.repaired` (paths.md –
 * Jednorázová oprava sítě; jednou a idempotentně). Volá se při načtení po přestavbě
 * (`withRoadsRebuilt`). Ves bez cest, bez přestavby, s příznakem nebo bez tras vrátí týž objekt.
 * Skončí-li oprava chybou, ves zůstane jako dřív s příznakem a `repairFailed` – chyba je pro týž
 * vstup deterministická a jinak by zablokovala každé načtení.
 */
export function withRoadsRepaired(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RepairReport,
): VillageState {
  return drain(withRoadsRepairedSteps(state, landscape, obstacles, report));
}

/** `withRoadsRepaired` po krocích (`repairRoadsSteps`). */
export function* withRoadsRepairedSteps(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RepairReport,
): Generator<void, VillageState, void> {
  const roads = state.roads;
  if (!roads || roads.repaired || !roads.rebuilt) return state;
  if (!state.routes || state.routes.list.length === 0) return state;
  let next: VillageState;
  try {
    next = yield* repairRoadsSteps(state, landscape, obstacles, report);
  } catch {
    const failed = cloneState(state);
    failed.roads!.repaired = 1;
    failed.roads!.repairFailed = 1;
    return failed;
  }
  next.roads!.repaired = 1;
  return next;
}

/** Doběhne kroky najednou. */
function drain<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
