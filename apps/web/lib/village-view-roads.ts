// Cesty, zemní práce, stromy u cest a jabloně pro scénu a panel.

import { VillageRoad, DAYS_PER_YEAR } from './village-view-types';
import {
  SceneEarthwork,
  SceneOrePit,
  SceneOreSite,
  SceneRoad,
  SceneRoadApple,
  SceneRoadTree,
  SceneWood,
} from './village-view-scene-types';
import { DAYS_PER_TREE_YEAR } from './village-view-buildings';
import {
  earthworkProgressOf,
  earthworkSpansOf,
  villageWagonEarthworks,
  wagonChainConstruction,
  wagonChainStatus,
  ORCHARD_WINDOWS,
  dateOfDayIndex,
  monthInWindow,
  obstacleChangesAt,
  ORCHARD_PLANTING_WINDOWS,
  obstaclesOf,
  roadAppleBearing,
  roadAppleStage,
  roadApplesOption,
  roadLengthM,
  roadFullCondition,
  roadTreeLook,
  roadTreeSpeed,
  roadUpgradeOptions,
  roadUpgradeProgress,
  roadChains,
  roadKind,
  ROAD_KIND_ORDER,
  type RoadKind,
  villageRoadWalk,
  orePitOvergrowth,
  squareCenter,
  type ConstructionSummary,
  type Landscape,
  type ObstacleChanges,
  type Road,
  type RoadGrade,
  type VillageState,
  type VillageSummary,
  villageWoods,
  woodAgeYears,
} from '@bohemia/game';
import { fruitVisible, treeGrowth } from './orchard-look';

import { trailRoadWork } from './trail-view';

/**
 * Zemní práce vozových cest pro scénu (roads.md – Vozová cesta): profily, hotová délka (jako
 * terén sítě pěšin na serveru – `earthworkSpansOf`), úseky se stářím v celých letech.
 */
export function sceneEarthworks(state: VillageState, day: number): SceneEarthwork[] {
  const spans = earthworkSpansOf(state);
  const shown = earthworkProgressOf(state);
  return (state.roads?.earthworks ?? []).map((e, k) => ({
    id: e.id,
    profile: e.profile.map((p) => ({ x: p.x, z: p.z, y: p.y })),
    ...(e.fords ? { fords: [...e.fords] } : {}),
    reachedM: spans[k]!.reachedM,
    shownM: Math.round(shown[k]!.reachedM * 10) / 10,
    pieces: e.pieces.map((p) => ({
      toM: p.toM,
      ageYears:
        p.builtDay === null ? null : Math.max(0, Math.floor((day - p.builtDay) / DAYS_PER_YEAR)),
    })),
    ...(e.constructionId !== undefined ? { building: true as const } : {}),
  }));
}

/**
 * Rudiště a jámy kovářů pro scénu (crafts.md – Uhlí a ruda kováře): rudiště obývaných i prázdných
 * kováren s hromadou rudy u jámy a jámy se zarůstáním – po celých kg a dvacetinách, ať se scéna
 * nepřestavuje každý den.
 */
export function sceneOre(
  state: VillageState,
  day: number,
): { oreSites: SceneOreSite[]; orePits: SceneOrePit[] } {
  // rudiště kovářů a hliniště hrnčířů (crafts.md – Hlína hrnčíře)
  const oreSites = state.dwellings.flatMap((d): SceneOreSite[] => {
    const craft = d.workshop?.craft;
    const clay = craft === 'potter';
    const site = craft === 'smith' ? d.workshop!.oreSite : clay ? d.workshop!.claySite : null;
    if (!site) return [];
    const batch = (clay ? d.workshop!.clayBatch : d.workshop!.oreBatch) ?? null;
    return [
      {
        dwellingId: d.id,
        x: site.x,
        z: site.z,
        heapKg: Math.round(batch?.heap ?? 0),
        digging: batch !== null && batch.dug < batch.kg,
        ...(clay ? { clay: true as const } : {}),
      },
    ];
  });
  const orePits = (state.orePits ?? []).map((p) => ({
    x: p.x,
    z: p.z,
    kg: Math.round(p.kg),
    overgrowth: Math.round(orePitOvergrowth(p, day) * 20) / 20,
    ...(p.clay ? { clay: true as const } : {}),
  }));
  return { oreSites, orePits };
}

/**
 * Úsek `ids[k]` vylepšení leží v cestě obráceně – na předchozí úsek navazuje koncem své osy, nebo
 * na další začátkem (práce jde po cestě, tedy od konce jeho osy).
 */
function upgradeFromEnd(roads: readonly Road[], ids: readonly number[], k: number): boolean {
  const find = (id: number | undefined): Road | undefined =>
    id === undefined ? undefined : roads.find((r) => r.id === id);
  const road = find(ids[k]);
  if (!road || road.points.length < 2) return false;
  const same = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
    Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
  const ends = (r: Road): { x: number; z: number }[] => [
    r.points[0]!,
    r.points[r.points.length - 1]!,
  ];
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  const prev = find(ids[k - 1]);
  if (prev) return ends(prev).some((p) => same(p, last)) && !ends(prev).some((p) => same(p, first));
  const next = find(ids[k + 1]);
  if (next) return ends(next).some((p) => same(p, first)) && !ends(next).some((p) => same(p, last));
  return false;
}

/** Pevné cesty vsi pro scénu (roads.md) – i s rozestavěným vylepšením. */
export function sceneRoads(
  state: Pick<VillageState, 'roads'> & Partial<Pick<VillageState, 'trails' | 'constructions'>>,
  constructions: readonly ConstructionSummary[] = [],
): SceneRoad[] {
  // zemské stezky (trade.md) se staví po úsecích – průběh každého úseku zvlášť
  const trailWork = trailRoadWork({
    trails: state.trails ?? [],
    constructions: state.constructions ?? [],
  });
  const trailRoads = new Set(
    (state.constructions ?? []).flatMap((c) => (c.trail !== undefined ? (c.roadIds ?? []) : [])),
  );
  // vylepšení cesty hráče (víc úseků – roads.md, Cesta pro hráče) jde po úsecích v pořadí cesty
  const upgrades = new Map<
    number,
    { roadGrade: RoadGrade; buildProgress: number; fromEnd: boolean }
  >();
  for (const c of constructions) {
    if (c.kind !== 'road' || !c.roadGrade || !c.roadIds) continue;
    const ids = c.roadIds.filter((id) => !trailRoads.has(id));
    const progress = roadUpgradeProgress(
      state,
      { roadIds: ids, roadGrade: c.roadGrade },
      c.buildProgress,
    );
    ids.forEach((id, k) => {
      upgrades.set(id, {
        roadGrade: c.roadGrade!,
        buildProgress: progress.get(id) ?? 0,
        fromEnd: upgradeFromEnd(state.roads?.roads ?? [], ids, k),
      });
    });
  }
  return (state.roads?.roads ?? []).map((r) => {
    const onTrail = trailWork.get(r.id);
    // dostavěný úsek rozestavěné stezky už stavbu nemá
    const work = onTrail
      ? { roadGrade: onTrail.grade, buildProgress: onTrail.progress, fromEnd: false }
      : trailRoads.has(r.id)
        ? undefined
        : upgrades.get(r.id);
    return {
      id: r.id,
      points: r.points.map((p) => ({ x: p.x, z: p.z })),
      grade: r.grade,
      // upravená bez hatě a lávky (starší cesta) – ve scéně je nemá
      ...(r.unbridged ? { unbridged: true as const } : {}),
      // vozová cesta (wagons.md – Vyjeté cesty) – dvě koleje
      ...(r.cart ? { cart: true as const } : {}),
      // průsek lesem (roads.md – Průsek lesem) – plocha korun nad ním zapadne
      ...(r.swath ? { swath: true as const } : {}),
      // stromy u cesty zrychlí chůzi (roads.md) – síť pěšin a cena kácení u kurzoru jako na
      // serveru; jen kde nějaké jsou
      ...(roadTreeSpeed(r.lined) > 0 ? { lined: { ...r.lined! } } : {}),
      ...(r.ground
        ? {
            ground: {
              wet: r.ground.wet.map(([a, b]): [number, number] => [a, b]),
              fords: [...r.ground.fords],
            },
          }
        : {}),
      // opuštěný kus pod stavbou a bledé kusy zarůstající cesty (paths.md – Zarůstání)
      ...(r.abandoned ? { abandoned: true as const } : {}),
      ...(fadeOf(r) ? { fade: fadeOf(r)! } : {}),
      // skutečné volné konce (brána, cíl) – jen tam se pás cesty vytrácí
      ...(r.openEnds ? { openEnds: [r.openEnds[0], r.openEnds[1]] as [boolean, boolean] } : {}),
      // loňské jízdy vozů – náhled vozové cesty (roads.md – Vozová cesta); jen kde vozy jezdí
      ...((r.cartTraffic?.at(-1) ?? 0) > 0
        ? { cartTrips: Math.round(r.cartTraffic!.at(-1)! * 100) / 100 }
        : {}),
      ...(work?.roadGrade
        ? {
            upgrade: {
              grade: work.roadGrade,
              progress: Math.round(work.buildProgress * 1000) / 1000,
              ...(work.fromEnd ? { fromEnd: true as const } : {}),
            },
          }
        : {}),
    };
  });
}

/** Les vsi pro scénu (fields.md – Les vsi) – stáří v celých letech (scéna se mění jen občas). */
export function sceneWoods(
  state: Pick<VillageState, 'woods'>,
  landscape: Landscape,
  day: number,
): SceneWood[] {
  return villageWoods(state).map((w) => {
    // les z natočeného pole stojí v jeho mřížce (fields.md – Natočené stavby)
    const center = squareCenter(landscape, w.grid, w.cell);
    return {
      cell: { x: w.cell.x, y: w.cell.y },
      x: center.x,
      z: center.z,
      size: landscape.cellSizeM,
      ...(w.grid ? { grid: w.grid, rotation: w.grid.rotation } : {}),
      surface: w.surface,
      age: Math.floor(woodAgeYears(w, day)),
    };
  });
}

/** Pořadí stupňů cesty – od vyšlapané po hať (panel, převládající stupeň při shodě lepší). */

/**
 * Zrychlení chůze od stromů u cesty pro panel (roads.md – Stromy u cesty zrychlí chůzi): průměr
 * úseků cesty podle délky, na tisíciny.
 */
function chainTreeSpeed(members: readonly Road[]): number {
  let length = 0;
  let sum = 0;
  for (const m of members) {
    const l = roadLengthM(m);
    length += l;
    sum += l * roadTreeSpeed(m.lined);
  }
  return length > 0 ? Math.round((sum / length) * 1000) / 1000 : 0;
}

/** Vozová cesta u cesty hráče pro panel – stav, průběh stavby a proč ji teď nejde zadat. */
function wagonView(
  state: VillageState,
  roadId: number,
  earthworks: ReturnType<typeof villageWagonEarthworks>,
): VillageRoad['wagon'] {
  const status = wagonChainStatus(state.roads?.roads ?? [], earthworks, roadId);
  const c = status.status === 'building' ? wagonChainConstruction(state, roadId) : null;
  const progress =
    status.status === 'built' ? 1 : c && c.cost > 0 ? Math.min(1, c.done / c.cost) : 0;
  return {
    status: status.status,
    progress: Math.round(progress * 1000) / 1000,
    blocked: status.blocked,
  };
}

/**
 * Pevné cesty pro panel výběru – cesta hráče = řetěz úseků (roads.md – Cesta pro hráče), i
 * vylepšení, která nabízí (s cenou a důvodem).
 */
export function roadViews(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): VillageRoad[] {
  const roads = state.roads?.roads ?? [];
  if (roads.length === 0) return [];
  const obstacles = obstaclesOf(landscape);
  const walk = villageRoadWalk(state, landscape);
  const standing = (state.roads?.trees ?? []).filter((t) => {
    const look = roadTreeLook(t, day);
    return look !== null && (look.stage === 'shrub' || look.stage === 'tree');
  });
  const removed = new Set(obstacleChangesAt(state, day).removed);
  const apples = (state.roads?.apples ?? []).filter((a) => !removed.has(a.id));
  const earthworks = villageWagonEarthworks(state);
  return roadChains(roads).map((chain) => {
    const members = chain.map((link) => link.road);
    const ids = new Set(members.map((r) => r.id));
    const r = members[0]!;
    const spots = new Set(members.flatMap((m) => m.spots.map((s) => s.id)));
    const touches = (c: ConstructionSummary): boolean =>
      (c.roadIds ?? []).some((id) => ids.has(id));
    const work = summary.constructions.find((c) => c.kind === 'road' && touches(c));
    const planting = summary.constructions.find((c) => c.kind === 'road-apples' && touches(c));
    const mine = apples.filter((a) => ids.has(a.roadId));
    const living = mine.filter((a) => roadAppleStage(a, day) === 'tree');
    const byKind = new Map<RoadKind, number>();
    for (const m of members) {
      const kind = roadKind(m);
      byKind.set(kind, (byKind.get(kind) ?? 0) + roadLengthM(m));
    }
    const kinds = ROAD_KIND_ORDER.filter((k) => (byKind.get(k) ?? 0) > 0).map((kind) => ({
      kind,
      lengthM: Math.round(byKind.get(kind)!),
    }));
    // převládající druh – nejdelší, při shodě lepší
    const prevailing = kinds.reduce((best, k) => (k.lengthM >= best.lengthM ? k : best)).kind;
    return {
      id: r.id,
      segments: members.map((m) => m.id),
      roadKind: prevailing,
      lengthM: Math.round(members.reduce((sum, m) => sum + roadLengthM(m), 0)),
      kinds,
      ageYears: Math.max(
        0,
        Math.floor((day - Math.min(...members.map((m) => m.bornDay))) / DAYS_PER_YEAR),
      ),
      trees: standing.filter((t) => spots.has(t.spot) && !removed.has(t.id)).length,
      treeSpeed: chainTreeSpeed(members),
      wetM: Math.round(
        members.reduce(
          (sum, m) => sum + (m.ground?.wet ?? []).reduce((acc, [a, b]) => acc + (b - a), 0),
          0,
        ),
      ),
      fords: members.reduce((sum, m) => sum + (m.ground?.fords.length ?? 0), 0),
      building:
        work && work.roadGrade
          ? { grade: work.roadGrade, progress: work.progress, treesToFell: work.treesToFell }
          : null,
      upgrades: roadUpgradeOptions(state, r.id, day, obstacles, walk, landscape),
      wagon: wagonView(state, r.id, earthworks),
      apples: {
        trees: living.length,
        bearing: living.filter((a) => roadAppleBearing(a, day)).length,
        planting: planting
          ? {
              trees: mine.filter((a) => a.constructionId === planting.id).length,
              progress: planting.progress,
              waits: !monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month),
            }
          : null,
        option: roadApplesOption(state, r.id, day, landscape, obstacles) ?? {
          trees: 0,
          laborManDays: 0,
          blocked: null,
          warning: null,
        },
      },
    };
  });
}

/**
 * Jabloně u pevných cest pro scénu (roads.md – Vysazení jabloní): velikost podle stáří jako
 * v sadu (po setinách – instance se nepřestavují při každém dotazu), plody od srpna do sklizně
 * u plodících stromů; odstraněné stavbou a zmizelé souše chybí.
 */
export function sceneRoadApples(
  state: Pick<VillageState, 'roads' | 'orchardWork'>,
  day: number,
  obstacles: ObstacleChanges,
): SceneRoadApple[] {
  const removed = new Set(obstacles.removed);
  const month = dateOfDayIndex(day).month;
  const work = state.orchardWork ?? null;
  const harvested = work?.task === 'harvest' ? work.done >= work.required : true;
  const harvestWindow = monthInWindow(ORCHARD_WINDOWS.harvest, month);
  return (state.roads?.apples ?? []).flatMap((a): SceneRoadApple[] => {
    const stage = roadAppleStage(a, day);
    if (stage === null || removed.has(a.id)) return [];
    const planted = a.plantedDay;
    const growth =
      planted === null
        ? 0
        : Math.round(treeGrowth((day - planted) / DAYS_PER_TREE_YEAR) * 100) / 100;
    const fruit =
      stage === 'tree' &&
      fruitVisible({ bearing: roadAppleBearing(a, day), month, harvestWindow, harvested });
    return [{ id: a.id, roadId: a.roadId, x: a.x, z: a.z, stage, growth, fruit }];
  });
}

/** Velikost stromu u cesty ve scéně po dvacetinách – strom se překreslí jen po znatelném přírůstku. */
const ROAD_TREE_GROWTH_STEPS = 20;

/**
 * Stromy u pevných cest pro scénu v den `day` (roads.md) – bez stromů, které odstranila stavba
 * a které už zmizely; velikost po dvacetinách (scéna se mění jen občas).
 */
export function sceneRoadTrees(
  state: Pick<VillageState, 'roads'>,
  day: number,
  obstacles: ObstacleChanges,
): SceneRoadTree[] {
  const removed = new Set(obstacles.removed);
  return (state.roads?.trees ?? []).flatMap((t): SceneRoadTree[] => {
    const look = roadTreeLook(t, day);
    if (look === null || removed.has(t.id)) return [];
    const growth = Math.round(look.growth * ROAD_TREE_GROWTH_STEPS) / ROAD_TREE_GROWTH_STEPS;
    return [{ id: t.id, x: t.x, z: t.z, species: t.species, stage: look.stage, growth }];
  });
}

/** Bledé kusy cesty – krytí pásu od poloviny plného stavu úměrně klesá, na desetiny. */
function fadeOf(road: Road): { x: number; z: number; strength: number }[] | undefined {
  if (!road.condition) return undefined;
  const full = roadFullCondition(road);
  const fade = road.condition
    .map((q) => ({
      x: q.x,
      z: q.z,
      strength: Math.round(Math.max(0, Math.min(1, (2 * q.c) / full)) * 10) / 10,
    }))
    .filter((q) => q.strength < 1);
  return fade.length > 0 ? fade : undefined;
}
