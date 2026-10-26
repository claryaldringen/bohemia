import type { Landscape, ObstacleLayer } from '../../landscape';
import { cloneState } from '../clone';
import { obstacleChangesAt } from '../obstacles';
import { ROAD_JOIN, ROAD_LAND, ROAD_REBUILD, ROAD_TREES, WEAR } from '../rules';
import { villageManor } from '../manor';
import { type OldWagonRoads, type WagonRebuild, rebuildWagonRoads } from '../wagon-rebuild';
import { trailAxisRoads, trailStart } from '../trail-axis';
import type {
  Road,
  RoadPoint,
  RoadTreeSpot,
  TrailPiece,
  VillageRoads,
  VillageState,
} from '../types';
import { lineRoads } from './road-lining';
import { rebuildRoadsPass } from './roads';
import { formRoad, splitRoadWork, splitTrailPieces } from './roads-form';
import { axisDistance, axisSlice, resample, roadLengthM, toSegment } from './roads-geometry';
import { type SpotContext, plantingBlocker } from './roads-trees';
import { pathCellM, trailTerrain } from './terrain';
import { refreshWalkDistances } from './village';
import { encodeWear, flushWear, trafficField, wearMap } from './wear';

/** Krok vzorků osy při měření podílu délky u staré cesty (m). */
const SHARE_STEP_M = 2;
/** Krok vzorků staré osy stezky při hledání nepokrytých kusů (m). */
const TRAIL_STEP_M = 1;
/** Úsek vozové cesty leží na ose rozestavěných zemních prací, když je od ní nejvýš tolik (m)… */
const BUILDING_M = 1;
/** …aspoň takovým podílem délky. */
const BUILDING_SHARE = 0.5;

type Distance = (x: number, z: number) => number;

/** Diagnostika přestavby pro testy a měření (parametr `report`) – hra ji nečte. */
export interface RebuildReport {
  /** Kolik průchodů proběhlo. */
  passes: number;
  /** Přepočet vozových cest (`rebuildWagonRoads`); null = ves bez vozových cest. */
  wagons: WagonRebuild | null;
}

/** Osy starých cest, z nichž se vylepšení přenášejí na nové úseky. */
interface Upgrades {
  improved: Distance;
  cart: Distance;
  swath: Distance;
}

/**
 * Jednorázová přestavba sítě cest (paths.md – Jednorázová přestavba sítě; Martin 24. 10. 2026,
 * varianta A). Čistá funkce – vstupní stav nemění. Vyšlapanost se naseje z dnešních tras (`seedWear`),
 * všechny cesty kromě pevných výjimek (cesty ve vylepšení, hotové úseky rozestavěné vozové cesty,
 * úseky rozestavěné stezky, opuštěné kusy pod stavbami) zmizí i s křižovatkami a vzniknou znovu týmiž
 * funkcemi jako za běhu (`rebuildRoadsPass` – vznik od kotvy ke kotvě, úklid, cesty k vchodům,
 * křižovatky) po průchodech,
 * mezi nimiž se přepočítají trasy (`refreshWalkDistances`), dokud se síť nemění (nejvýš
 * `ROAD_REBUILD.passes`). Vylepšení se přenesou (`transferUpgrades`), kusy hotových stezek, kam nová
 * síť nedosáhla, se vrátí (`patchAxes`) a stezky se znovu najdou po síti (`restoreTrails`);
 * stromy a jabloně u cest zůstanou a patří nejbližšímu novému úseku. Hotové vozové cesty se po
 * nových osách přepočítají a jsou hned hotové i se zemními pracemi, staré zemní práce zůstanou
 * jen terénem a zarostou (`rebuildWagonRoads`); pak se síť znovu ustálí. Kronika se nemění. Ves bez
 * cest nebo bez tras vrátí týž objekt.
 */
export function rebuildRoads(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RebuildReport,
): VillageState {
  return drain(rebuildRoadsSteps(state, landscape, obstacles, report));
}

/**
 * `rebuildRoads` po krocích – krok skončí po každém průchodu a kolem přepočtu vozových cest, aby
 * server mezi nimi mohl dát přestávku (port `Pause`, jako dlouhý dopočet). Výsledek na krocích
 * nezávisí.
 */
export function* rebuildRoadsSteps(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RebuildReport,
): Generator<void, VillageState, void> {
  if (!state.roads || !state.routes || state.routes.list.length === 0) return state;
  const next = cloneState(state);
  const roads = next.roads!;
  const day = next.lastDay;
  const chronicle = next.chronicle.length;
  // hotové úseky rozestavěné vozové cesty leží na ose jejích zemních prací – zůstanou
  const building = axisDistance(
    (roads.earthworks ?? []).filter((e) => e.constructionId !== undefined).map((e) => e.profile),
  );
  const fixed = new Set<number>([
    ...next.constructions.flatMap((c) => c.roadIds ?? []),
    ...(next.trails ?? [])
      .filter((t) => typeof t.builtDay !== 'number')
      .flatMap((t) => t.pieces.map((p) => p.roadId)),
    ...roads.roads
      .filter(
        (r) => r.grade === 'wagon' && shareNear(r.points, building, BUILDING_M) >= BUILDING_SHARE,
      )
      .map((r) => r.id),
    // opuštěné kusy pod stavbami jen dál blednou (paths.md – Stavba přes cestu)
    ...roads.roads.filter((r) => r.abandoned).map((r) => r.id),
  ]);
  const old = roads.roads.filter((r) => !fixed.has(r.id));
  // hotové vozové cesty se po nových osách přepočítají (R2) – jejich osy a zemní práce
  const oldWagon: OldWagonRoads = {
    near: axisDistance(old.filter((r) => r.grade === 'wagon').map((r) => r.points)),
    earthworks: new Set(
      (roads.earthworks ?? [])
        .filter((e) => e.constructionId === undefined && e.abandonedDay === undefined)
        .map((e) => e.id),
    ),
  };
  const byId = new Map(roads.roads.map((r) => [r.id, r] as const));
  const oldTrails = new Map<number, Road[]>();
  for (const trail of next.trails ?? []) {
    if (typeof trail.builtDay !== 'number') continue;
    oldTrails.set(
      trail.id,
      trail.pieces.flatMap((p) => byId.get(p.roadId) ?? []),
    );
    trail.pieces = [];
  }
  const trailIds = new Set([...oldTrails.values()].flat().map((r) => r.id));
  // opuštěné kusy jsou všechny ve `fixed` – v `old` žádné není
  const upgrades: Upgrades = {
    improved: axisDistance(
      old.filter((r) => r.grade !== 'trodden' || trailIds.has(r.id)).map((r) => r.points),
    ),
    cart: axisDistance(old.filter((r) => r.cart).map((r) => r.points)),
    swath: axisDistance(old.filter((r) => r.swath).map((r) => r.points)),
  };
  const oldSpots = new Map<number, RoadTreeSpot>(
    old.flatMap((r) => r.spots.map((s): [number, RoadTreeSpot] => [s.id, s])),
  );
  const firstNew = roads.nextId;
  seedWear(next, landscape);
  roads.roads = roads.roads.filter((r) => fixed.has(r.id));
  roads.junctions = [];
  delete roads.cutEnds;
  delete roads.tidyKey;
  const context = (): SpotContext => ({
    terrain: trailTerrain(landscape, obstacles),
    blocked: plantingBlocker(next, landscape),
    layer: obstacles,
    changes: obstacleChangesAt(next, day),
    seed: next.seed,
    split: (from, to) => {
      splitRoadWork(next.constructions, from, to);
      splitTrailPieces(next.trails, from, to);
    },
  });
  // obejité kusy přepočtených vozových cest – opuštěné jako po stavbě, nemažou se
  const bypassed = new Set<number>();
  let patched = false;
  // úsek, ze kterého bude vozová cesta, má pro rozestup křižovatek šířku vozové – po přepočtu se
  // křižovatka s vozovým ramenem už nehne (mezipaměť podle pole bodů – posun uzlu ho nahradí)
  const widths = new WeakMap<readonly RoadPoint[], number | undefined>();
  const futureWagon = (road: Road): number | undefined => {
    if (!widths.has(road.points)) {
      const wagon =
        road.grade !== 'wagon' && shareNear(road.points, oldWagon.near) >= ROAD_REBUILD.share;
      widths.set(road.points, wagon ? ROAD_LAND.widthM.wagon : undefined);
    }
    return widths.get(road.points);
  };
  // vznik cest nahradí `next.roads` kopií (`commitDraft`) – po průchodu vždy znovu ze stavu
  function* settle(width?: (road: Road) => number | undefined): Generator<void, void, void> {
    for (let pass = 0; pass < ROAD_REBUILD.passes; pass++) {
      const before = networkOf(next.roads!);
      if (report) report.passes++;
      rebuildRoadsPass(next, day, landscape, obstacles, width);
      const current = next.roads!;
      // nová cesta, kterou průchod hned opustil (vede pod stavbou nebo zemními pracemi), zmizí
      current.roads = current.roads.filter(
        (r) => !r.abandoned || r.id < firstNew || bypassed.has(r.id),
      );
      if (!patched) patchAxes(current, [...oldTrails.values()].flat(), day, context());
      patched = true;
      transferUpgrades(current, upgrades, fixed);
      restoreTrails(next, landscape);
      relinkTrees(current, oldSpots);
      relinkApples(current);
      for (const road of current.roads) delete road.lined;
      lineRoads(next, day, true);
      refreshWalkDistances(next, day, landscape, obstacles);
      if (pass > 0 && networkOf(next.roads!) === before) break;
      yield;
    }
  }
  const hasWagon = oldWagon.earthworks.size > 0 || old.some((r) => r.grade === 'wagon');
  yield* settle(hasWagon ? futureWagon : undefined);
  // vozové cesty po nových osách hotové i se zemními pracemi, pak síť znovu ustálit (křižovatky,
  // úklid a trasy po vozových cestách)
  if (hasWagon) {
    // kus staré vozové cesty, kam nová síť nedosáhla (1 km k severnímu okraji Vlkova), nezmizí
    const wagonAxes = old.filter((r) => r.grade === 'wagon');
    patchAxes(next.roads!, wagonAxes, day, context(), ROAD_REBUILD.wagonPatchM);
    const gone = new Set(next.roads!.roads.filter((r) => r.abandoned).map((r) => r.id));
    yield;
    const wagons = rebuildWagonRoads(next, day, landscape, obstacles, oldWagon);
    if (report) report.wagons = wagons;
    for (const r of next.roads!.roads) if (r.abandoned && !gone.has(r.id)) bypassed.add(r.id);
    yield;
    yield* settle();
  }
  next.roads!.trailsRestored = true;
  next.chronicle.length = chronicle;
  if (next.roads!.wear) flushWear(next.roads!.wear);
  return next;
}

/**
 * Starší ves jednou přestaví síť cest (`rebuildRoads`) a dostane příznak `roads.rebuilt`
 * (paths.md – Jednorázová přestavba sítě; jednou a idempotentně). Volá se při načtení po převodu
 * na nový systém (`withRoadsV2`) a po trasách. Ves bez cest, s příznakem nebo bez tras vrátí týž
 * objekt. Skončí-li přestavba chybou, ves zůstane jako dřív s příznakem a `rebuildFailed` – jinak
 * by chyba (pro týž vstup deterministická) zablokovala každé další načtení.
 */
export function withRoadsRebuilt(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RebuildReport,
): VillageState {
  return drain(withRoadsRebuiltSteps(state, landscape, obstacles, report));
}

/** `withRoadsRebuilt` po krocích (`rebuildRoadsSteps`) – server mezi nimi dává přestávky. */
export function* withRoadsRebuiltSteps(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  report?: RebuildReport,
): Generator<void, VillageState, void> {
  const roads = state.roads;
  if (!roads || roads.rebuilt || !roads.v2) return state;
  if (!state.routes || state.routes.list.length === 0) return state;
  let next: VillageState;
  try {
    next = yield* rebuildRoadsSteps(state, landscape, obstacles, report);
  } catch {
    const failed = cloneState(state);
    failed.roads!.rebuilt = 1;
    failed.roads!.rebuildFailed = 1;
    return failed;
  }
  const flagged = next === state ? cloneState(state) : next;
  flagged.roads!.rebuilt = 1;
  return flagged;
}

/** Doběhne kroky najednou. */
function drain<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * Otisk sítě mezi průchody: stupně, příznaky a osy živých úseků a středy a tvary křižovatek – bez
 * id, aby úsek, který vznikne znovu na témže místě, síť nezměnil.
 */
function networkOf(roads: VillageRoads): string {
  const parts = roads.roads
    .filter((r) => !r.abandoned)
    .map((r) => `${r.grade}${r.cart ? 'c' : ''}:` + r.points.map((p) => `${p.x},${p.z}`).join(';'));
  for (const j of roads.junctions ?? []) parts.push(`j${j.x},${j.z}:${j.shape}:${j.rotation}`);
  return parts.sort().join('|');
}

/**
 * Vyšlapanost, jako by se po dnešních trasách chodilo `ROAD_REBUILD.seedDays` dní (mutuje): na
 * políčku provozního pole (trasy za prací jen stálou částí, jako za běhu) clamp((provoz − dorůstání)
 * × dny, 0, strop); kde je vyšlapanost už vyšší, zůstane. Den sčtu se nemění.
 */
function seedWear(state: VillageState, landscape: Landscape): void {
  const roads = state.roads!;
  const field = trafficField(state.routes!, pathCellM(landscape));
  const cells = new Map(roads.wear ? wearMap(roads.wear) : []);
  for (const [c, trips] of field.cells) {
    const seeded = Math.min(WEAR.max, (trips - WEAR.regrowPerDay) * ROAD_REBUILD.seedDays);
    if (seeded > (cells.get(c) ?? 0)) cells.set(c, seeded);
  }
  roads.wear = {
    day: roads.wear?.day ?? state.lastDay + 1,
    cells: encodeWear(cells),
    labor: roads.wear?.labor ?? [],
    cellM: WEAR.cellM,
  };
}

/** Podíl délky osy `points`, který leží do `within` (m, jinak `ROAD_REBUILD.nearM`) od os `near`. */
function shareNear(
  points: readonly RoadPoint[],
  near: Distance,
  within: number = ROAD_REBUILD.nearM,
): number {
  const samples = resample(points, null, SHARE_STEP_M).points;
  if (samples.length === 0) return 0;
  const close = samples.filter((p) => near(p.x, p.z) <= within).length;
  return close / samples.length;
}

/**
 * Přenos vylepšení (mutuje): vyšlapaný úsek, jehož aspoň `ROAD_REBUILD.share` délky leží u osy staré
 * upravené cesty nebo stezky, je upravený s hatí a lávkou (hotové); stejně příznak vyježděná
 * a průsek lesem. Pevné úseky a opuštěné kusy se nemění; nic se nesnižuje.
 */
function transferUpgrades(
  roads: VillageRoads,
  upgrades: Upgrades,
  fixed: ReadonlySet<number>,
): void {
  for (const road of roads.roads) {
    if (fixed.has(road.id) || road.abandoned || road.grade === 'wagon') continue;
    if (
      road.grade === 'trodden' &&
      shareNear(road.points, upgrades.improved) >= ROAD_REBUILD.share
    ) {
      road.grade = 'improved';
      delete road.unbridged;
    }
    if (!road.cart && shareNear(road.points, upgrades.cart) >= ROAD_REBUILD.share) road.cart = true;
    if (
      road.grade === 'improved' &&
      !road.swath &&
      shareNear(road.points, upgrades.swath) >= ROAD_REBUILD.share
    ) {
      road.swath = true;
    }
  }
}

/**
 * Kusy starých os (`axes` – úseky hotových stezek, staré vozové cesty), kam nová síť nedosáhla (dál
 * než `ROAD_REBUILD.nearM` – typicky k okraji mapy, kudy se skoro nechodí), se vrátí jako úseky
 * téhož stupně napojené na síť (mutuje) – stezka tak dál vede od dvorce ke kraji mapy. Kus vozové
 * cesty se vrátí upravený (vozová se po něm přepočítá – R2). Konce se napojí na síť do
 * `ROAD_JOIN.gapM` (jako díra v úklidu). Kus kratší než `minM` (a než `ROAD_REBUILD.nearM`) se
 * nevrací.
 */
function patchAxes(
  roads: VillageRoads,
  axes: readonly Road[],
  day: number,
  context: SpotContext,
  minM: number = 0,
): void {
  const reach = ROAD_REBUILD.nearM + 1;
  for (const old of axes) {
    if (roads.roads.some((r) => r.id === old.id)) continue;
    const net = axisDistance(roads.roads.filter((r) => !r.abandoned).map((r) => r.points));
    const samples = resample(old.points, null, TRAIL_STEP_M).points;
    const length = roadLengthM(old);
    const runs: [number, number][] = [];
    let from = -1;
    samples.forEach((p, k) => {
      const far = net(p.x, p.z) > ROAD_REBUILD.nearM;
      if (far && from < 0) from = k;
      const last = k === samples.length - 1;
      if (from >= 0 && (!far || last)) {
        runs.push([from * TRAIL_STEP_M, (far ? k : k - 1) * TRAIL_STEP_M]);
        from = -1;
      }
    });
    for (const [a, b] of runs) {
      if (b - a < minM) continue;
      const points = axisSlice(
        old.points,
        Math.max(0, a - ROAD_REBUILD.nearM),
        Math.min(length, b + ROAD_REBUILD.nearM),
      );
      // napojí se do ROAD_JOIN.gapM jako díra v úklidu – vrácený kus nezůstane sám v prostoru
      // (Vlkov: vozová k severnímu okraji končila 6,2 m od cesty u hřbitova)
      const join = ROAD_JOIN.gapM;
      const road = formRoad(roads, points, join, join, day, () => 0, context, reach);
      if (!road) continue;
      // kus hotové vozové cesty se vrátí upravený – vozová se po nové ose přepočítá (R2)
      road.grade = old.grade === 'wagon' ? 'improved' : old.grade;
      road.bornDay = old.bornDay;
      if (old.swath) road.swath = true;
    }
  }
}

/**
 * Hotové stezky po přestavbě (mutuje): stezka, jejíž úseky zmizely, se znovu najde po síti od dvorce
 * ke kraji mapy (`trailAxisRoads` – napřed po upravených a vozových cestách, jinak i po vyšlapaných)
 * a vyšlapané úseky na ní se upraví (stezka je upravená cesta, práce 0 – je hotová). Bez spojení
 * zůstane bez úseků jako dřív.
 */
function restoreTrails(state: VillageState, landscape: Landscape): void {
  const roads = state.roads!;
  const manor = villageManor(state);
  if (!manor) return;
  const start = trailStart(landscape, manor);
  const ids = new Set(roads.roads.map((r) => r.id));
  for (const trail of state.trails ?? []) {
    if (typeof trail.builtDay !== 'number') continue;
    if (trail.pieces.length > 0 && trail.pieces.every((p) => ids.has(p.roadId))) continue;
    const axis =
      trailAxisRoads(roads.roads, trail.direction, start, landscape, roads.junctions) ??
      trailAxisRoads(roads.roads, trail.direction, start, landscape, roads.junctions, true);
    if (!axis || axis.length === 0) continue;
    for (const road of axis) {
      if (road.grade !== 'trodden') continue;
      road.grade = 'improved';
      delete road.unbridged;
    }
    trail.pieces = axis.map((r) => ({
      roadId: r.id,
      grade: r.grade as TrailPiece['grade'],
      manDays: 0,
    }));
  }
}

/**
 * Stromy u cest zůstávají (mutuje): strom, jehož místo po přestavbě nepatří žádnému úseku ani
 * křižovatce, dostane místo u nejbližšího živého úseku do vzdálenosti stromu od osy + `nearM`;
 * dál zůstane bez cesty (stojí do smrti, křižovatka ho může převzít za znamení).
 */
function relinkTrees(roads: VillageRoads, oldSpots: ReadonlyMap<number, RoadTreeSpot>): void {
  const owned = new Set(roads.roads.flatMap((r) => r.spots.map((s) => s.id)));
  for (const j of roads.junctions ?? []) owned.add(j.id);
  const living = roads.roads.filter((r) => !r.abandoned);
  const axes = living.map((r) => axisDistance([r.points]));
  const reach = ROAD_TREES.offsetM.to + ROAD_REBUILD.nearM;
  for (const tree of roads.trees) {
    if (owned.has(tree.spot)) continue;
    const spot = oldSpots.get(tree.spot);
    if (!spot) continue;
    let best = -1;
    let bestD = reach;
    axes.forEach((axis, k) => {
      const d = axis(spot.x, spot.z);
      if (d <= bestD) {
        best = k;
        bestD = d;
      }
    });
    if (best >= 0) {
      living[best]!.spots.push({ ...spot });
      owned.add(spot.id);
    }
  }
}

/** Jabloně úseků, které po přestavbě nejsou, patří nejbližšímu živému úseku (mutuje). */
function relinkApples(roads: VillageRoads): void {
  const living = roads.roads.filter((r) => !r.abandoned);
  if (!roads.apples || living.length === 0) return;
  const ids = new Set(roads.roads.map((r) => r.id));
  const distance = (road: Road, x: number, z: number): number => {
    let d = Infinity;
    for (let k = 1; k < road.points.length; k++) {
      d = Math.min(d, toSegment(x, z, road.points[k - 1]!, road.points[k]!).distance);
    }
    return d;
  };
  for (const apple of roads.apples) {
    if (ids.has(apple.roadId)) continue;
    let best = living[0]!;
    let bestD = Infinity;
    for (const road of living) {
      const d = distance(road, apple.x, apple.z);
      if (d < bestD) {
        best = road;
        bestD = d;
      }
    }
    apple.roadId = best.id;
  }
}
