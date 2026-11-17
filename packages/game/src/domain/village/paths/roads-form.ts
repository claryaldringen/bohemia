// Vznik pevných cest z roční sítě: provoz cest, nové a dělené úseky, slučování úseků v uzlu bez odbočky (roads.md).

import { length2, type Landscape, type ObstacleLayer } from '../../landscape';
import { cloneState } from '../core/clone';
import { restoredTrailPieces } from '../trade/trail-axis';
import { obstacleChangesAt, type ObstacleChanges } from '../core/obstacles';
import { ROAD_REBUILD, WEAR } from '../rules';
import {
  type Construction,
  type Road,
  type RoadGround,
  type RoadPoint,
  type Trail,
  type VillageRoads,
  type VillageState,
} from '../types';
import { villagePathBounds, simplifyPathLine, type PathTraffic } from './network';
import { pathTerrainOf, pathWindowFor, withObstacles, type PathTerrain } from './terrain';
import { pathVillageOf } from './village';
import {
  ATTACH_M,
  END_SNAP_M,
  FORD_GAP_M,
  GROUND_GAP_M,
  MEASURE_STEP_M,
  MIN_ROAD_M,
  ON_ROAD_M,
  ROAD_CLEAR_M,
  RoadHit,
  SAMPLE_M,
  SIMPLIFY_M,
  axisDistance,
  cm,
  dm,
  groundPart,
  lengthsAlong,
  nearestOnRoads,
  resample,
  roadGroundOf,
  roadLengthM,
} from './roads-geometry';
import { type RoadAnchors, nearAnchor } from './road-anchors';
import { junctionSnap } from './junctions';
import { roadLandWidthM } from './road-land';
import { SpotContext, spotsForRoad } from './roads-trees';
import { type TrafficField, trafficAt, wearNear } from './wear';

/** Pevné cesty prázdné vsi – práce se začne sčítat od dne `day`. */
export function emptyRoads(day: number): VillageRoads {
  return {
    nextId: 1,
    roads: [],
    trees: [],
    labor: { from: day, days: 0, shares: [] },
    visits: { from: day, byKey: [] },
    conditionSeeded: true,
    bridgesSeeded: true,
    trailsRestored: true,
    v2: true,
    rebuilt: ROAD_REBUILD.version,
    repaired: 1,
  };
}

/**
 * Terén roční kontroly (1. 11.): okno pěšin kolem vsi s překážkami krajiny a změnami stavem – pro
 * trasy vozů a úklid sítě. Ves bez obydlí null. (Roční síť pěšin už se nepočítá – cesty vznikají
 * měsíčně z vyšlapanosti, paths.md.)
 */
export function annualTerrain(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  changes: ObstacleChanges = obstacleChangesAt(state, day),
): PathTerrain | null {
  const village = pathVillageOf(state, day, landscape);
  const bounds = villagePathBounds(village, landscape);
  if (!bounds) return null;
  const window = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  return obstacles ? withObstacles(window, obstacles, changes) : window;
}

/** Úseky, které se právě vylepšují (stavby `road` – roads.md). */
export function roadsInWork(constructions: readonly Construction[]): Set<number> {
  return new Set(constructions.flatMap((c) => c.roadIds ?? []));
}

/**
 * Úsek `from` se rozdělil – stavby na něm patří i novému úseku `to` hned za ním (pořadí po cestě
 * – průběh vylepšení po úsecích, `roadUpgradeProgress`; mutuje).
 */
export function splitRoadWork(constructions: Construction[], from: number, to: number): void {
  for (const c of constructions) {
    const k = c.roadIds?.indexOf(from) ?? -1;
    if (k >= 0) c.roadIds!.splice(k + 1, 0, to);
  }
}

/**
 * Úsek `from` se rozdělil – zemská stezka (trade.md), která po něm vede, vede i po novém úseku
 * `to` hned za ním: stejný stupeň, práce zůstane u prvního kusu (mutuje).
 */
export function splitTrailPieces(
  trails: readonly Trail[] | undefined,
  from: number,
  to: number,
): void {
  for (const trail of trails ?? []) {
    const at = trail.pieces.findIndex((p) => p.roadId === from);
    if (at < 0) continue;
    trail.pieces.splice(at + 1, 0, { roadId: to, grade: trail.pieces[at]!.grade, manDays: 0 });
  }
}

// --- provoz a vznik cest ----------------------------------------------------------------------

/**
 * Provoz pevné cesty v roční síti (cest za den): medián bodů osy po MEASURE_STEP_M, v bodě
 * nejvyšší provoz buněk 3 × 3 kolem něj (trasa vede po cestě nebo těsně vedle). Na setiny.
 */
export function roadTraffic(points: readonly RoadPoint[], traffic: PathTraffic): number {
  const samples = resample(points, null, MEASURE_STEP_M).points;
  const values = samples.map((p) => {
    const ci = Math.round((p.x - traffic.originX) / traffic.cellM);
    const cj = Math.round((p.z - traffic.originZ) / traffic.cellM);
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= traffic.width || j >= traffic.height) continue;
        best = Math.max(best, traffic.raw[j * traffic.width + i]!);
      }
    }
    return best;
  });
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return Math.round(values[Math.floor(values.length / 2)]! * 100) / 100;
}

/**
 * Provoz nové cesty z provozního pole tras (cest za den): medián bodů osy po MEASURE_STEP_M
 * (`trafficAt` – celý provoz tras v pásu ± 1 políčka). Na setiny.
 */
export function fieldTraffic(points: readonly RoadPoint[], field: TrafficField): number {
  const values = resample(points, null, MEASURE_STEP_M).points.map((p) =>
    trafficAt(field, p.x, p.z),
  );
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)]! / 100;
}

/** Kus čáry trasy, ze kterého má vzniknout cesta (`formRoadsFromWear`). */
export interface WearRun {
  /**
   * Klíč kusu podle polohy konců zaokrouhlené na 1 m (`wearRunKey`) – stálý i mezi měsíci, kus,
   * jehož cestu úklid smazal, si ves pod ním pamatuje (`VillageRoads.lostRuns`).
   */
  key: string;
  points: RoadPoint[];
  /** Připojit začátek / konec k pevné cestě do tolika metrů (false = konec u kotvy). */
  start: number | false;
  end: number | false;
}

/**
 * Projde kusy čar tras, ze kterých má vzniknout cesta (paths.md – Vyšlapanost a vznik cesty):
 * kus s vyšlapaností od `WEAR.roadAt` dál než ON_ROAD_M od pevné cesty (blíž jde trasa po cestě)
 * se prodlouží po čáře oběma směry, dokud je vyšlapanost aspoň `WEAR.extendFrom`. Kus se nabídne
 * `visit` jen celý od kotvy ke kotvě: každý konec u kotvy (`nearAnchor`), nebo u pevné cesty, ke
 * které se připojí; jinak počká na další měsíc. `visit` vrátí `formed` (cesta vznikla – pevné cesty
 * se změnily), `next`, nebo `stop`. Nic nemění.
 */
function eachWearRun(
  roads: VillageRoads,
  lines: readonly (readonly RoadPoint[])[],
  wear: ReadonlyMap<number, number>,
  anchors: RoadAnchors,
  visit: (run: WearRun) => 'formed' | 'next' | 'stop',
): void {
  let roadAt: ((x: number, z: number) => number) | null = null;
  for (const line of lines) {
    const run = resample(line, null, SAMPLE_M).points;
    if (run.length < 2) continue;
    const level = run.map((p) => wearNear(wear, p.x, p.z));
    if (!level.some((w) => w >= WEAR.roadAt)) continue;
    roadAt ??= axisDistance(roads.roads.filter((r) => !r.abandoned).map((r) => r.points));
    const at = roadAt;
    // blízkost k cestám této čáry (síť z jejího začátku) jen u vzorků, na kterých záleží –
    // vyšlapaných a jejich sousedů; líně
    const near = new Int8Array(run.length);
    const onRoad = (k: number): boolean => {
      if (near[k] === 0) near[k] = at(run[k]!.x, run[k]!.z) <= ON_ROAD_M ? 1 : -1;
      return near[k] === 1;
    };
    // kus vznikne jen kolem vyšlapaného vzorku mimo cestu – čára bez něj nic nedá
    if (!level.some((w, k) => w >= WEAR.roadAt && !onRoad(k))) continue;
    const warm = (k: number): boolean => level[k]! >= WEAR.extendFrom && !onRoad(k);
    // konec kusu: u pevné cesty (připojí se do ATTACH_M), u kotvy (false – bez připojení), jinak
    // null – cesta zatím nevznikne
    const endAt = (k: number, outside: number): number | false | null => {
      if (outside >= 0 && outside < run.length && onRoad(outside)) return ATTACH_M;
      return nearAnchor(anchors, run[k]!.x, run[k]!.z) ? false : null;
    };
    let i = 0;
    while (i < run.length) {
      if (!warm(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < run.length && warm(j + 1)) j++;
      const next = j + 1;
      const hot = level.slice(i, next).some((w) => w >= WEAR.roadAt);
      const start = hot ? endAt(i, i - 1) : null;
      const end = hot && start !== null ? endAt(j, next) : null;
      if (start !== null && end !== null) {
        const points = run.slice(i, next);
        const done = visit({ key: wearRunKey(points), points, start, end });
        if (done === 'stop') return;
        if (done === 'formed') roadAt = null;
      }
      i = next;
    }
  }
}

/** Klíč kusu (`WearRun.key`): začátek a konec zaokrouhlené na 1 m. */
export function wearRunKey(points: readonly RoadPoint[]): string {
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return `${Math.round(a.x)},${Math.round(a.z)}|${Math.round(b.x)},${Math.round(b.z)}`;
}

/**
 * Vznikla by z vyšlapanosti aspoň jedna cesta (`formRoadsFromWear`)? Levná kontrola před
 * měsíčním vznikem – bez kontextu míst na stromy a bez kopie stavu. Kusy s klíčem v `lost`
 * (cestu z nich úklid smazal) vynechá a do `seen` zapíše, které z nich jsou dál vyšlapané – pak
 * projde všechny kusy. Nic nemění.
 */
export function wearRoadDue(
  roads: VillageRoads,
  lines: readonly (readonly RoadPoint[])[],
  wear: ReadonlyMap<number, number>,
  anchors: RoadAnchors,
  lost: ReadonlySet<string> = new Set(),
  seen?: Set<string>,
): boolean {
  let due = false;
  eachWearRun(roads, lines, wear, anchors, (run) => {
    if (lost.has(run.key)) {
      seen?.add(run.key);
      return 'next';
    }
    if (!due) due = plannedAxis(roads, run.points, run.start, run.end) !== null;
    return due && !seen ? 'stop' : 'next';
  });
  return due;
}

/**
 * Nové pevné cesty z vyšlapanosti (paths.md – Vyšlapanost a vznik cesty; mutuje `roads`): po
 * čarách tras `lines` (od brány k cíli, nejsilnější napřed) z kusů od kotvy ke kotvě
 * (`eachWearRun`), kus s klíčem ve `skip` vynechá. Konec u pevné cesty se k ní připojí (rozcestí
 * – `splitRoad`). Kratší než MIN_ROAD_M nic. Souběžné cesty sloučí úklid (`tidyRoads`). Vrátí nové
 * cesty s klíči kusů.
 */
export function formWearRuns(
  roads: VillageRoads,
  lines: readonly (readonly RoadPoint[])[],
  wear: ReadonlyMap<number, number>,
  anchors: RoadAnchors,
  day: number,
  context: SpotContext,
  field: TrafficField | null = null,
  skip: ReadonlySet<string> = new Set(),
): { road: Road; key: string }[] {
  const formed: { road: Road; key: string }[] = [];
  const traffic = (points: readonly RoadPoint[]): number =>
    field ? fieldTraffic(points, field) : 0;
  eachWearRun(roads, lines, wear, anchors, (run) => {
    if (skip.has(run.key)) return 'next';
    const road = formRoad(roads, run.points, run.start, run.end, day, traffic, context);
    if (!road) return 'next';
    formed.push({ road, key: run.key });
    return 'formed';
  });
  return formed;
}

/** Nové pevné cesty z vyšlapanosti (`formWearRuns` – mutuje `roads`); vrátí nové cesty. */
export function formRoadsFromWear(
  roads: VillageRoads,
  lines: readonly (readonly RoadPoint[])[],
  wear: ReadonlyMap<number, number>,
  anchors: RoadAnchors,
  day: number,
  context: SpotContext,
  field: TrafficField | null = null,
): Road[] {
  return formWearRuns(roads, lines, wear, anchors, day, context, field).map((f) => f.road);
}

/** Vzdálenost bodu `hit` po ose cesty od jejího začátku (m). */
export function hitAt(road: Road, hit: RoadHit): number {
  const a = road.points[hit.segment]!;
  return lengthsAlong(road.points)[hit.segment]! + length2(hit.point.x - a.x, hit.point.z - a.z);
}

/** Bod osy cesty ve vzdálenosti `d` m od začátku (úsek a bod – pro `splitRoad`). */
export function hitAlongRoad(roads: VillageRoads, road: Road, d: number): RoadHit {
  const at = lengthsAlong(road.points);
  let k = 1;
  while (k < road.points.length - 1 && at[k]! < d) k++;
  const a = road.points[k - 1]!;
  const b = road.points[k]!;
  const span = at[k]! - at[k - 1]!;
  const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[k - 1]!) / span)) : 0;
  return {
    road: roads.roads.indexOf(road),
    segment: k - 1,
    point: { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u },
    distance: 0,
  };
}

/** Jedna nová pevná cesta z bodů `points` – s připojením konců k pevné cestě. */
export function formRoad(
  roads: VillageRoads,
  points: RoadPoint[],
  /** Připojit začátek / konec k pevné cestě do tolika metrů (false = ne). */
  joinStart: number | false,
  joinEnd: number | false,
  day: number,
  /** Provoz roční sítě, nebo provoz nové osy (cest za den – vznik z vyšlapanosti). */
  traffic: PathTraffic | ((points: readonly RoadPoint[]) => number),
  context: SpotContext,
  /** Nejkratší osa (m) – cesta k vchodu smí být kratší než MIN_ROAD_M (`accessRoads`). */
  minM: number = MIN_ROAD_M,
): Road | null {
  // napřed bez rozdělení: krátká cesta nevznikne a cizí cesty se nerozdělí
  if (!plannedAxis(roads, points, joinStart, joinEnd, minM)) return null;
  const axis = points.map((p) => ({ x: cm(p.x), z: cm(p.z) }));
  // napojení na pevnou cestu (případné rozdělení cesty v rozcestí) – nejdřív začátek, pak konec
  const start = joinStart !== false ? joinPoint(roads, axis[0]!, context, joinStart) : null;
  if (start) axis.unshift(start);
  const end = joinEnd !== false ? joinPoint(roads, axis[axis.length - 1]!, context, joinEnd) : null;
  if (end) axis.push(end);
  const simple = roadAxisOf(axis, minM);
  if (!simple) return null;
  const road: Road = {
    id: roads.nextId++,
    points: simple,
    bornDay: day,
    grade: 'trodden',
    traffic: [typeof traffic === 'function' ? traffic(simple) : roadTraffic(simple, traffic)],
    spots: [],
    ground: roadGroundOf(simple, context.terrain),
  };
  roads.roads.push(road);
  // volná místa jiných cest, přes která nová cesta vede, zmizí (stromy na nich stojí dál)
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const alongNew = axisDistance([simple]);
  for (const other of roads.roads) {
    other.spots = other.spots.filter(
      (s) => occupied.has(s.id) || alongNew(s.x, s.z) >= ROAD_CLEAR_M,
    );
  }
  road.spots = spotsForRoad(roads, road, context);
  return road;
}

/** Zjednodušená osa nové cesty z bodů na cm; kratší než MIN_ROAD_M null. */
function roadAxisOf(axis: readonly RoadPoint[], minM: number = MIN_ROAD_M): RoadPoint[] | null {
  const simple = simplifyPathLine([...axis], [], SIMPLIFY_M).points.filter(
    (p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z,
  );
  const along = lengthsAlong(simple);
  const length = along[along.length - 1] ?? 0;
  return simple.length < 2 || length < minM ? null : simple;
}

/**
 * Osa, kterou by nová cesta z bodů `points` měla (připojení konců jako `formRoad`, ale bez
 * rozdělení cest – bod rozcestí je týž); kratší než MIN_ROAD_M null. Nic nemění.
 */
export function plannedAxis(
  roads: VillageRoads,
  points: readonly RoadPoint[],
  joinStart: number | false,
  joinEnd: number | false,
  minM: number = MIN_ROAD_M,
): RoadPoint[] | null {
  const axis = points.map((p) => ({ x: cm(p.x), z: cm(p.z) }));
  const start = joinStart !== false ? joinTarget(roads, axis[0]!, joinStart) : null;
  const end = joinEnd !== false ? joinTarget(roads, axis[axis.length - 1]!, joinEnd) : null;
  if (start) axis.unshift(start.point);
  if (end) axis.push(end.point);
  return roadAxisOf(axis, minM);
}

/**
 * Kam se konec nové cesty připojí k pevné cestě (do `reach`): u konce pevné cesty do jejího konce
 * (`hit` null), jinak do nejbližšího bodu osy (na cm) – tam se pevná cesta rozdělí. Nic nemění.
 */
export function joinTarget(
  roads: VillageRoads,
  from: RoadPoint,
  reach: number,
): { point: RoadPoint; hit: RoadHit | null } | null {
  const hit = nearestOnRoads(roads.roads, from.x, from.z);
  if (!hit || hit.distance > reach) return null;
  const road = roads.roads[hit.road]!;
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  if (length2(hit.point.x - first.x, hit.point.z - first.z) <= END_SNAP_M) {
    return { point: { ...first }, hit: null };
  }
  if (length2(hit.point.x - last.x, hit.point.z - last.z) <= END_SNAP_M) {
    return { point: { ...last }, hit: null };
  }
  // blíž než rozestup od křižovatky na konci pevné cesty → přímo do ní (Martin 3. 11. 2026)
  const snap = junctionSnap(roads, road, hit.point, roadLandWidthM({ grade: 'trodden' }));
  if (snap) return { point: snap, hit: null };
  return { point: { x: cm(hit.point.x), z: cm(hit.point.z) }, hit };
}

/**
 * Bod, kde se konec nové cesty připojí k pevné cestě (do ATTACH_M – `joinTarget`); uprostřed osy
 * se pevná cesta rozdělí na dva úseky (rozcestí).
 */
function joinPoint(
  roads: VillageRoads,
  from: RoadPoint,
  context: SpotContext,
  reach = ATTACH_M,
): RoadPoint | null {
  const target = joinTarget(roads, from, reach);
  if (!target) return null;
  return target.hit ? splitRoad(roads, target.hit, context) : target.point;
}

/**
 * Rozdělí pevnou cestu v bodě `hit` na dva úseky (první si nechá id, druhý dostane nové); oba
 * zdědí den vzniku, stupeň a provoz, místa na stromy se rozdělí podle polohy. Vrátí bod rozcestí.
 */
export function splitRoad(roads: VillageRoads, hit: RoadHit, context: SpotContext): RoadPoint {
  const road = roads.roads[hit.road]!;
  const at = { x: cm(hit.point.x), z: cm(hit.point.z) };
  const along = lengthsAlong(road.points);
  const a = road.points[hit.segment]!;
  const splitAt = along[hit.segment]! + length2(at.x - a.x, at.z - a.z);
  const total = along[along.length - 1]!;
  const same = (p: RoadPoint): boolean => p.x === at.x && p.z === at.z;
  const oldStart = road.points[0]!;
  const oldEnd = road.points[road.points.length - 1]!;
  const head = road.points.slice(0, hit.segment + 1);
  const tail = road.points.slice(hit.segment + 1);
  const first = same(head[head.length - 1]!) ? head : [...head, at];
  const second = same(tail[0]!) ? tail : [at, ...tail];
  const firstAxis = axisDistance([first]);
  const secondAxis = axisDistance([second]);
  const rest: Road = {
    id: roads.nextId++,
    points: second,
    bornDay: road.bornDay,
    grade: road.grade,
    traffic: [...road.traffic],
    spots: road.spots.filter((s) => secondAxis(s.x, s.z) < firstAxis(s.x, s.z)),
    ...(road.ground ? { ground: groundPart(road.ground, splitAt, total) } : {}),
    ...(road.cart ? { cart: true as const } : {}),
    ...(road.unbridged ? { unbridged: true as const } : {}),
    ...(road.swath ? { swath: true as const } : {}),
    ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
  };
  road.spots = road.spots.filter((s) => secondAxis(s.x, s.z) >= firstAxis(s.x, s.z));
  // stav kusů podle polohy (paths.md – Zarůstání)
  if (road.condition) {
    const tail = road.condition.filter((q) => secondAxis(q.x, q.z) < firstAxis(q.x, q.z));
    const head = road.condition.filter((q) => secondAxis(q.x, q.z) >= firstAxis(q.x, q.z));
    if (tail.length > 0) rest.condition = tail;
    if (head.length > 0) road.condition = head;
    else delete road.condition;
  }
  // jabloně podél druhé části patří novému úseku (roads.md – Vysazení jabloní)
  for (const apple of roads.apples ?? []) {
    if (apple.roadId === road.id && secondAxis(apple.x, apple.z) < firstAxis(apple.x, apple.z)) {
      apple.roadId = rest.id;
    }
  }
  if (road.ground) road.ground = groundPart(road.ground, 0, splitAt);
  // rozcestí uprostřed – vnitřní konce nejsou volné
  if (road.openEnds) {
    rest.openEnds = [false, road.openEnds[1]];
    road.openEnds = [road.openEnds[0], false];
  }
  road.points = first;
  // ramena křižovatek u zadního konce přejdou na druhou část (paths.md – Křižovatky)
  for (const junction of roads.junctions ?? []) {
    if (!junction.arms.includes(road.id)) continue;
    const toStart = length2(junction.x - oldStart.x, junction.z - oldStart.z);
    const toEnd = length2(junction.x - oldEnd.x, junction.z - oldEnd.z);
    // uzavřená smyčka (oba konce stejně daleko) nechá rameno na první části – měsíční `updateJunctions` ho srovná
    if (toEnd < toStart) junction.arms = junction.arms.map((id) => (id === road.id ? rest.id : id));
  }
  // osa se změnila – olemování stromy se určí znovu (roads.md – Stromy u cesty zrychlí chůzi)
  delete road.lined;
  roads.roads.splice(hit.road + 1, 0, rest);
  context.split(road.id, rest.id);
  return at;
}

// --- slučování úseků v uzlu bez odbočky -------------------------------------------------------

/** Klíč konce úseku – rozcestí sdílejí bod (na cm). */
export function endKey(p: RoadPoint): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/** Mokřina a brody osy obráceně (od konce) – délka osy `length`. */
function reversedGround(ground: RoadGround, length: number): RoadGround {
  return {
    wet: ground.wet
      .map(([a, b]): [number, number] => [dm(length - b), dm(length - a)])
      .sort((p, q) => p[0] - q[0]),
    fords: ground.fords.map((f) => dm(length - f)).sort((a, b) => a - b),
  };
}

/**
 * Mokřina a brody dvou navazujících os (druhá začíná v `offset` m první): mokřiny, mezi kterými
 * je nejvýš GROUND_GAP_M, se slijí (jako při určení z krajiny), brody blíž než FORD_GAP_M jsou
 * jeden.
 */
function joinedGround(first: RoadGround, second: RoadGround, offset: number): RoadGround {
  const wet: [number, number][] = [];
  for (const [a, b] of [
    ...first.wet,
    ...second.wet.map(([a, b]): [number, number] => [dm(a + offset), dm(b + offset)]),
  ]) {
    const last = wet[wet.length - 1];
    if (last && a - last[1] <= GROUND_GAP_M) last[1] = Math.max(last[1], b);
    else wet.push([a, b]);
  }
  const fords: number[] = [];
  for (const f of [...first.fords, ...second.fords.map((f) => dm(f + offset))]) {
    const last = fords[fords.length - 1];
    if (last === undefined || f - last > FORD_GAP_M) fords.push(f);
  }
  return { wet, fords };
}

/** Provoz posledních let dvou spojených úseků – po letech od nejnovějšího, vážený délkou. */
function joinedTraffic(
  a: Pick<Road, 'traffic'>,
  b: Pick<Road, 'traffic'>,
  lengthA: number,
  lengthB: number,
): number[] {
  const years = Math.max(a.traffic.length, b.traffic.length);
  const out: number[] = [];
  for (let k = years; k >= 1; k--) {
    const ta = a.traffic[a.traffic.length - k];
    const tb = b.traffic[b.traffic.length - k];
    if (ta === undefined) out.push(tb!);
    else if (tb === undefined) out.push(ta);
    else out.push(Math.round(((ta * lengthA + tb * lengthB) / (lengthA + lengthB)) * 100) / 100);
  }
  return out;
}

/** Stavby vylepšení (`road`) na úseku – id staveb. */
function upgradesOf(constructions: readonly Construction[], roadId: number): string {
  return constructions
    .filter((c) => c.kind === 'road' && c.roadIds?.includes(roadId))
    .map((c) => c.id)
    .join(',');
}

/**
 * Úseky, které se potkávají v uzlu, kde žádný další úsek nekončí (falešné rozcestí – zbytek po
 * rozdělení, když odbočka zarostla, nebo nová cesta navázaná na konec jiné), se spojí do jednoho
 * (mutuje – roads.md, Martin: „úsek mezi dvěma rozcestími je v pohodě“): osa za sebou, místa na
 * stromy, jabloně, mokřina a brody, provoz (vážený délkou), den vzniku staršího a jeho id – úsek
 * vznikl dřív. Různý stupeň zůstane rozdělený (skutečná hranice vylepšení), stejně tak úseky, kde
 * se vylepšuje jen jeden z nich (nebo každý jinou stavbou) – po dokončení se spojí, mají-li
 * stejný stupeň. Stavby na úsecích (výsadba jabloní, společné vylepšení) přejdou na spojený
 * úsek, zemské stezky (`trails`) také – zmizelé id v nich nahradí ponechaný úsek (paths.md –
 * Stavba přes cestu). Uzavřený okruh z jednoho úseku zůstane, dva úseky mezi stejnými uzly se do
 * okruhu nespojí. Vrátí, jestli něco spojil.
 */
export function mergeRoadChains(
  roads: VillageRoads,
  constructions: Construction[],
  trails?: readonly Trail[],
): boolean {
  let merged = false;
  for (let pair = chainPair(roads, constructions); pair; pair = chainPair(roads, constructions)) {
    joinRoads(roads, constructions, trails, pair[0], pair[1]);
    merged = true;
  }
  return merged;
}

/**
 * Starší ves s falešnými rozcestími (z doby před slučováním úseků) – při načtení se úseky spojí
 * (`mergeRoadChains`). Idempotentní a levné: bez takového uzlu vrátí týž objekt (nic se neukládá).
 * Simulace pak spojuje sama (roční kontrola, dokončené vylepšení), takže po prvním převodu je
 * každý další beze změny a dopočet po kouscích dá totéž co vcelku. Zemská stezka, která odkazuje
 * na zmizelý úsek (staré spojování id stezkám nepřepsalo), je s krajinou hotová znovu najde po
 * síti pevných cest od dvorce ke kraji mapy (`restoredTrailPieces` – trade.md, Zemská stezka);
 * bez spojení (nebo bez krajiny) z ní zmizelé úseky jen vypadnou.
 */
export function withMergedRoads(
  state: VillageState,
  landscape?: Pick<Landscape, 'size' | 'cellSizeM'>,
): VillageState {
  if (!state.roads) return state;
  let next: VillageState | null = null;
  if (chainPair(state.roads, state.constructions) !== null) {
    next = cloneState(state);
    mergeRoadChains(next.roads!, next.constructions, next.trails);
  }
  const base = next ?? state;
  const ids = new Set(base.roads!.roads.map((r) => r.id));
  const stale = (base.trails ?? []).some((t) => t.pieces.some((p) => !ids.has(p.roadId)));
  // obnova jen jednou jako převod – pozdější ztráta úseků za běhu je legitimní
  const convert = !!landscape && !base.roads!.trailsRestored;
  const restored = convert ? restoredTrailPieces(base, landscape) : new Map<number, never>();
  if (!next && !stale && !convert) return state;
  next ??= cloneState(state);
  if (convert) next.roads!.trailsRestored = true;
  for (const trail of next.trails ?? []) {
    const pieces = restored.get(trail.id);
    if (pieces) trail.pieces = pieces;
  }
  dropGoneTrailPieces(next.roads!, next.trails);
  return next;
}

type RoadEnd = { road: Road; atStart: boolean };

/** První uzel (v pořadí úseků), kde se potkávají právě dva úseky, které jde spojit; jinak null. */
function chainPair(
  roads: VillageRoads,
  constructions: readonly Construction[],
): [RoadEnd, RoadEnd] | null {
  const ends = new Map<string, RoadEnd[]>();
  const endOf = (road: Road, atStart: boolean): RoadPoint =>
    atStart ? road.points[0]! : road.points[road.points.length - 1]!;
  const valid = roads.roads.filter((r) => r.points.length >= 2 && !r.abandoned);
  for (const road of valid) {
    for (const atStart of [true, false]) {
      const key = endKey(endOf(road, atStart));
      const list = ends.get(key) ?? [];
      list.push({ road, atStart });
      ends.set(key, list);
    }
  }
  /** Směr osy od konce do úseku (jednotkový). */
  const away = (end: RoadEnd): RoadPoint => {
    const pts = end.road.points;
    const p = end.atStart ? pts[0]! : pts[pts.length - 1]!;
    const q = end.atStart ? pts[1]! : pts[pts.length - 2]!;
    const l = length2(q.x - p.x, q.z - p.z) || 1;
    return { x: (q.x - p.x) / l, z: (q.z - p.z) / l };
  };
  // ze všech uzlů nejrovnější pokračování první (kusy jedné cesty před odbočkou k jiné trase –
  // u okruhu z několika úseků tak zůstane rovná cesta celá), při shodě v pořadí úseků
  let best: { pair: [RoadEnd, RoadEnd]; turn: number } | null = null;
  for (const road of valid) {
    for (const atStart of [true, false]) {
      const list = ends.get(endKey(endOf(road, atStart)))!;
      if (list.length !== 2 || list[0]!.road !== road || list[0]!.atStart !== atStart) continue;
      const [a, b] = list as [RoadEnd, RoadEnd];
      if (a.road === b.road || a.road.grade !== b.road.grade) continue;
      // vozová a pěší cesta zůstanou dva úseky (wagons.md – Vyjeté cesty)
      if (!!a.road.cart !== !!b.road.cart) continue;
      if (!!a.road.unbridged !== !!b.road.unbridged) continue;
      // dva úseky mezi stejnými uzly (dvě trasy) se nespojí do okruhu – copánek řeší
      // `removeBraids`, vzdálené trasy zůstanou dvě
      if (endKey(endOf(a.road, !a.atStart)) === endKey(endOf(b.road, !b.atStart))) continue;
      if (upgradesOf(constructions, a.road.id) !== upgradesOf(constructions, b.road.id)) continue;
      const da = away(a);
      const db = away(b);
      const turn = da.x * db.x + da.z * db.z;
      if (!best || turn < best.turn - 1e-9) best = { pair: [a, b], turn };
    }
  }
  return best?.pair ?? null;
}

/** Spojí dva úseky v jejich společném konci (starší zůstane, mladší zmizí – mutuje). */
function joinRoads(
  roads: VillageRoads,
  constructions: Construction[],
  trails: readonly Trail[] | undefined,
  first: RoadEnd,
  second: RoadEnd,
): void {
  const older = (a: Road, b: Road): boolean =>
    a.bornDay < b.bornDay || (a.bornDay === b.bornDay && a.id < b.id);
  const [keep, gone] = older(first.road, second.road) ? [first, second] : [second, first];
  const road = keep.road;
  const other = gone.road;
  const lengthKeep = roadLengthM(road);
  const lengthOther = roadLengthM(other);
  // druhý úsek natočený tak, aby navazoval; směr ponechaného úseku zůstane
  const otherPoints = gone.atStart === keep.atStart ? [...other.points].reverse() : other.points;
  const otherGround =
    other.ground && gone.atStart === keep.atStart
      ? reversedGround(other.ground, lengthOther)
      : other.ground;
  const points = keep.atStart
    ? [...otherPoints.slice(0, -1), ...road.points]
    : [...road.points, ...otherPoints.slice(1)];
  const ground =
    road.ground && otherGround
      ? keep.atStart
        ? joinedGround(otherGround, road.ground, lengthOther)
        : joinedGround(road.ground, otherGround, lengthKeep)
      : undefined;
  // volné konce spojeného úseku – vnější konce obou (bez údaje u některého bez údaje)
  const otherOpen = other.openEnds
    ? gone.atStart === keep.atStart
      ? ([other.openEnds[1], other.openEnds[0]] as [boolean, boolean])
      : other.openEnds
    : undefined;
  if (road.openEnds && otherOpen) {
    road.openEnds = keep.atStart
      ? [otherOpen[0], road.openEnds[1]]
      : [road.openEnds[0], otherOpen[1]];
  } else {
    delete road.openEnds;
  }
  road.traffic = joinedTraffic(road, other, lengthKeep, lengthOther);
  if (road.cartTraffic || other.cartTraffic) {
    road.cartTraffic = joinedTraffic(
      { traffic: road.cartTraffic ?? [] },
      { traffic: other.cartTraffic ?? [] },
      lengthKeep,
      lengthOther,
    );
  }
  road.points = points.map((p) => ({ x: p.x, z: p.z }));
  road.spots = [...road.spots, ...other.spots];
  // osa se změnila – olemování stromy se určí znovu (roads.md – Stromy u cesty zrychlí chůzi)
  delete road.lined;
  // průsek lesem (roads.md) – spojený úsek ho má, když ho měl kterýkoli
  if (other.swath) road.swath = true;
  if (ground) road.ground = ground;
  else delete road.ground;
  // stav kusů obou (paths.md – Zarůstání) – po bodech, osa se nemění
  const condition = [...(road.condition ?? []), ...(other.condition ?? [])];
  if (condition.length > 0) road.condition = condition;
  else delete road.condition;
  for (const apple of roads.apples ?? []) if (apple.roadId === other.id) apple.roadId = road.id;
  for (const c of constructions) {
    if (!c.roadIds?.includes(other.id)) continue;
    c.roadIds = [...new Set(c.roadIds.map((id) => (id === other.id ? road.id : id)))];
  }
  joinTrailPieces(trails, other.id, road.id);
  // ramena křižovatek u vnějšího konce zmizelého úseku přejdou na spojený (paths.md – Křižovatky)
  for (const junction of roads.junctions ?? []) {
    junction.arms = junction.arms.map((id) => (id === other.id ? road.id : id));
  }
  roads.roads = roads.roads.filter((r) => r !== other);
}

/**
 * Stezka nesmí odkazovat na úsek, který zmizel (vyříznutý souběžný kus, pahýl; mutuje): id
 * neexistujícího úseku z ní vypadne. Délku a stupeň stezka nese sama (`Trail.lengthM`).
 */
export function dropGoneTrailPieces(
  roads: VillageRoads,
  trails: readonly Trail[] | undefined,
): void {
  if (!trails) return;
  const ids = new Set(roads.roads.map((r) => r.id));
  for (const trail of trails) {
    if (trail.pieces.some((p) => !ids.has(p.roadId))) {
      trail.pieces = trail.pieces.filter((p) => ids.has(p.roadId));
    }
  }
}

/**
 * Úsek `gone` se spojil s úsekem `keep` – zemská stezka (trade.md), která po něm vedla, vede po
 * `keep` (mutuje): na místě prvního z nich, práce se sečte, druhý výskyt zmizí.
 */
function joinTrailPieces(trails: readonly Trail[] | undefined, gone: number, keep: number): void {
  for (const trail of trails ?? []) {
    if (!trail.pieces.some((p) => p.roadId === gone)) continue;
    const pieces: Trail['pieces'] = [];
    for (const piece of trail.pieces) {
      const id = piece.roadId === gone ? keep : piece.roadId;
      const same = pieces.find((p) => p.roadId === id);
      if (same && id === keep) same.manDays += piece.manDays;
      else pieces.push(id === piece.roadId ? piece : { ...piece, roadId: id });
    }
    trail.pieces = pieces;
  }
}
