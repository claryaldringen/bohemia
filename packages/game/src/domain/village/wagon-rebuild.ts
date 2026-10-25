// Vozové cesty v jednorázové přestavbě sítě (paths.md – Jednorázová přestavba sítě; Martin
// 24. 10. 2026, varianta A: „vozové cesty se po nových osách přepočítají i se zemními pracemi
// a budou rovnou hotové (už jsou zaplacené); staré úvozy a náspy, které nové osy nepoužijí,
// zarostou.“).

import type { Landscape, ObstacleLayer } from '../landscape';
import { roadChain, roadChains } from './paths/road-chains';
import { axisSlice, resample } from './paths/roads-geometry';
import { ROAD_REBUILD } from './rules';
import type { Road, RoadPoint, VillageState } from './types';
import { buildWagonRoadNow, planWagonRoad, wagonPlanInputOf } from './wagon-road';

/** Krok vzorků osy při měření podílu délky u staré vozové cesty (m). */
const SHARE_STEP_M = 2;

/** Staré vozové cesty před přestavbou – osy (vzdálenost od nich) a jejich hotové zemní práce. */
export interface OldWagonRoads {
  near: (x: number, z: number) => number;
  earthworks: ReadonlySet<number>;
}

/** Výsledek přepočtu vozových cest – nové zemní práce a důvody řetězů, kde plán nevyšel. */
export interface WagonRebuild {
  built: number[];
  failed: string[];
}

/** Podíl délky osy `points`, který leží do `ROAD_REBUILD.nearM` od os `near`. */
function shareNear(points: readonly RoadPoint[], near: (x: number, z: number) => number): number {
  const samples = resample(points, null, SHARE_STEP_M).points;
  if (samples.length === 0) return 0;
  const close = samples.filter((p) => near(p.x, p.z) <= ROAD_REBUILD.nearM).length;
  return close / samples.length;
}

/**
 * Kusy osy `axis` (od–do v m), které leží do `ROAD_REBUILD.nearM` od os `near` souvisle aspoň
 * `minM` (paths.md – Jednorázová přestavba sítě, bod 8; návrh Clauda 25. 10. 2026 – Vlkov: řetěz
 * u hřbitova měl u staré vozové osy jen 33 %, a tak vozovou cestou nebyl ani jeho kus po ní).
 * Vzorky po SHARE_STEP_M. Nic nemění.
 */
export function nearStretches(
  axis: readonly RoadPoint[],
  near: (x: number, z: number) => number,
  minM: number,
): [number, number][] {
  const samples = resample(axis, null, SHARE_STEP_M).points;
  const out: [number, number][] = [];
  let from = -1;
  samples.forEach((p, k) => {
    const close = near(p.x, p.z) <= ROAD_REBUILD.nearM;
    if (close && from < 0) from = k;
    const last = k === samples.length - 1;
    if (from >= 0 && (!close || last)) {
      const to = close ? k : k - 1;
      if ((to - from) * SHARE_STEP_M >= minM) out.push([from * SHARE_STEP_M, to * SHARE_STEP_M]);
      from = -1;
    }
  });
  return out;
}

/** Osa řetězu v jeho pořadí (body úseků po směru řetězu, společné uzly jednou). */
function chainPoints(chain: readonly { road: Road; reversed: boolean }[]): RoadPoint[] {
  return chain.flatMap(({ road, reversed }, k) => {
    const points = reversed ? [...road.points].reverse() : road.points;
    return k === 0 ? points : points.slice(1);
  });
}

/** Úseky, které práce drží (vylepšení ve stavbě, nehotová zemská stezka) – řetěz s nimi se nemění. */
function busyRoads(state: VillageState): Set<number> {
  return new Set([
    ...state.constructions.flatMap((c) => c.roadIds ?? []),
    ...(state.trails ?? [])
      .filter((t) => typeof t.builtDay !== 'number')
      .flatMap((t) => t.pieces.map((p) => p.roadId)),
  ]);
}

/** Řetěz, který se přepočítá na vozovou cestu: živý, bez vozové a bez práce, u staré vozové osy. */
function wagonCandidate(
  chain: readonly { road: Road }[],
  old: OldWagonRoads,
  busy: ReadonlySet<number>,
): boolean {
  if (chain.length === 0) return false;
  if (chain.some((l) => l.road.grade === 'wagon' || l.road.abandoned || busy.has(l.road.id))) {
    return false;
  }
  return (
    shareNear(
      chain.flatMap((l) => l.road.points),
      old.near,
    ) >= ROAD_REBUILD.share
  );
}

/**
 * Vozové cesty po nových osách (paths.md – Jednorázová přestavba sítě, R2; mutuje stav): staré
 * hotové zemní práce přestanou patřit cestě (`RoadEarthwork.abandonedDay` – terén zůstává, svahy
 * zarostou; kde vede nová zemní práce, kreslí svahy ta); řetěz nové sítě, jehož aspoň
 * `ROAD_REBUILD.share` délky leží do `ROAD_REBUILD.nearM` od osy staré vozové cesty, se upraví
 * (zaplaceno) a naplánuje jako vozová cesta stejně jako na serveru (`planWagonRoad` – narovnání,
 * objížďka, serpentiny) a je hned hotová (`buildWagonRoadNow`). Nevyjde-li plán, řetěz zůstane
 * upravený. Řetězy v pořadí `roadChains`; řetěz, který předchozí vozová cesta změnila, se vezme
 * znovu od svého prvního živého úseku.
 */
export function rebuildWagonRoads(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  old: OldWagonRoads,
): WagonRebuild {
  const out: WagonRebuild = { built: [], failed: [] };
  if (!state.roads) return out;
  for (const e of state.roads.earthworks ?? []) {
    if (old.earthworks.has(e.id) && e.abandonedDay === undefined) e.abandonedDay = day;
  }
  const busy = busyRoads(state);
  const candidates = roadChains(state.roads.roads)
    .filter((chain) => wagonCandidate(chain, old, busy))
    .map((chain) => chain.map((l) => l.road.id));
  for (const ids of candidates) {
    const roads = state.roads!.roads;
    const live = new Set(roads.filter((r) => !r.abandoned).map((r) => r.id));
    const first = ids.find((id) => live.has(id));
    if (first === undefined) continue;
    const chain = roadChain(roads, first);
    if (!wagonCandidate(chain, old, busy)) continue;
    // úprava je zaplacená – „Napřed uprav cestu.“ přestavbu nezastaví
    for (const { road } of chain) {
      road.grade = 'improved';
      delete road.unbridged;
    }
    const plan = planWagonRoad(wagonPlanInputOf(state, day, first, landscape, obstacles));
    if (!plan.ok) {
      out.failed.push(plan.reason);
      continue;
    }
    out.built.push(buildWagonRoadNow(state, plan, day, landscape, obstacles).id);
  }
  // řetěz pod podílem: jeho kus u staré vozové osy delší než `wagonPatchM` je vozový sám – plán po
  // ose kusu jako samostatného řetězu (uzly na koncích kusu), stará cesta pod ním zmizí
  // (`absorbParallelRoads`) a zbytky řetězu se napojí v dalším ustálení sítě
  const stretches = roadChains(state.roads.roads)
    .filter((chain) => partialCandidate(chain, old, busy))
    .flatMap((chain) => {
      const axis = chainPoints(chain);
      return nearStretches(axis, old.near, ROAD_REBUILD.wagonPatchM).map(([a, b]) =>
        axisSlice(axis, a, b),
      );
    });
  for (const points of stretches) {
    const stretch: Road = {
      id: -1,
      points,
      bornDay: day,
      grade: 'improved',
      traffic: [],
      spots: [],
    };
    const input = {
      ...wagonPlanInputOf(state, day, stretch.id, landscape, obstacles),
      roads: [stretch],
    };
    const plan = planWagonRoad(input);
    if (!plan.ok) {
      out.failed.push(plan.reason);
      continue;
    }
    out.built.push(buildWagonRoadNow(state, plan, day, landscape, obstacles).id);
  }
  return out;
}

/** Řetěz pod podílem `ROAD_REBUILD.share` – bez vozové, opuštěné a bez práce (kusy `nearStretches`). */
function partialCandidate(
  chain: readonly { road: Road }[],
  old: OldWagonRoads,
  busy: ReadonlySet<number>,
): boolean {
  if (chain.length === 0) return false;
  if (chain.some((l) => l.road.grade === 'wagon' || l.road.abandoned || busy.has(l.road.id))) {
    return false;
  }
  return !wagonCandidate(chain, old, busy);
}
