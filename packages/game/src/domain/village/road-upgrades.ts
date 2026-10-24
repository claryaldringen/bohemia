import type { Landscape, ObstacleLayer } from '../landscape';
import { obstacleChangesAt } from './obstacles';
import { roadChain } from './paths/road-chains';
import { roadLengthM, roadWetM, roadsInWork } from './paths/roads';
import type { Walk } from './paths/walking';
import { roadSwathTally } from './road-swath';
import { ROAD_UPGRADES } from './rules';
import type { Construction, Road, RoadGrade, VillageState } from './types';
import { claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';

// Vylepšení pevné cesty (roads.md – Vylepšení cesty, schváleno 18. 10. 2026): hráč vybere úsek
// a zadá úpravu – stavba ze společné práce vsi. Upravená cesta (vyšlapaná → upravená: srovnat
// a rozšířit – Martin, 19. 10. 2026: jen širší, bez strouhy) 15 člověkodní na 100 m; hať a lávka
// (jen na úseku přes mokřinu nebo brod) jsou součástí téže stavby (Martin, 24. 10. 2026: „Hať
// a lávka se postaví samy jako součást úpravy cesty“) – hať 1 strom a 2 člověkodny na 2 m
// mokřiny, lávka 4 stromy a 15 člověkodní na brod. Starší upravená cesta bez nich (`unbridged`)
// nabídne jen hať a lávku. Dřevo jako obydlí: klády z hromady, pak
// nejbližší dospělé stromy k úseku. Rychlejší chůze po vylepšené cestě počítá walking.ts
// (ROAD_WALK). Vylepšuje se celá cesta hráče – řetěz úseků (road-chains.ts): úseky, které to
// vylepšení ještě nemají, jednou stavbou (cena za ně dohromady, stupeň po úsecích). Upravená
// cesta lesem vykácí průsek (road-swath.ts – kácení je součást práce, klády na hromadu); posvátný
// dub v pásu cesty úpravu nedovolí.

/**
 * Vylepšení úseku – úprava cesty (i s hatí a lávkou). Vozová cesta (roads.md – Vozová cesta) má
 * vlastní trasu a stavbu (wagon-road.ts).
 */
export type RoadUpgrade = Exclude<RoadGrade, 'trodden' | 'wagon'>;

/** Vylepšení, které úsek nabízí: práce celkem (i s kácením), dřevo a proč teď nejde. */
export interface RoadUpgradeOption {
  upgrade: RoadUpgrade;
  /** Člověkodny celkem – práce na cestě a kácení stromů z plánu dřeva. */
  laborManDays: number;
  /** Dřevo (stromy) – klády z hromady, zbytek se kácí. */
  trees: number;
  /** Stromy ke kácení (dřevo, které hromada nepokryje). */
  treesToFell: number;
  /** Dospělé stromy v průseku lesem (roads.md – Průsek lesem) – klády na hromadu. */
  swathTrees: number;
  /** Rozpad ceny pro popisek: úprava, hať a lávka (bez kácení a průseku); dřevo jen hať a lávka. */
  parts: RoadUpgradeParts;
  /** Proč vylepšení teď nejde (česky), nebo null. */
  blocked: string | null;
}

/** Rozpad ceny úpravy cesty – úprava, hať přes mokřinu a lávka přes brod (člověkodny a dřevo). */
export interface RoadUpgradeParts {
  improved: { manDays: number; trees: number };
  causeway: { manDays: number; trees: number };
  footbridge: { manDays: number; trees: number };
}

/** Úpravu cesty lesem nedovolí posvátný dub nebo strom háje v pásu cesty (happiness.md). */
export const ROAD_SACRED = 'Úpravě cesty brání posvátný dub – kácet se nesmí.';

/** Průsek lesem úseků upravované cesty (bez krajiny nic): práce, stromy a posvátný dub v pásu. */
function chainSwath(
  state: VillageState,
  roads: readonly Road[],
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | undefined,
): { manDays: number; trees: number; sacred: boolean } {
  const out = { manDays: 0, trees: 0, sacred: false };
  if (!obstacles || !landscape) return out;
  for (const road of roads) {
    // průsek jen vyšlapané cestě – upravená ho už má; hať ho nepřidává
    if (road.swath || road.grade !== 'trodden') continue;
    const tally = roadSwathTally(state, road, day, obstacles, landscape);
    out.manDays += tally.cost;
    out.trees += tally.trees;
    out.sacred ||= tally.sacred;
  }
  out.manDays = tenths(out.manDays);
  return out;
}

/** Na desetiny člověkodne. */
function tenths(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Práce a dřevo na hať přes mokřinu a na lávku přes brod úseku zvlášť (roads.md – ceny). */
export function roadBridgeParts(
  road: Pick<Road, 'ground'>,
): Pick<RoadUpgradeParts, 'causeway' | 'footbridge'> {
  const pieces = roadWetM(road.ground) / 2;
  const fords = road.ground?.fords.length ?? 0;
  const { causewayPer2M, footbridge } = ROAD_UPGRADES;
  return {
    causeway: {
      manDays: pieces * causewayPer2M.manDays,
      trees: Math.ceil(pieces * causewayPer2M.trees - 1e-9),
    },
    footbridge: { manDays: fords * footbridge.manDays, trees: fords * footbridge.trees },
  };
}

/** Práce na hati a lávce úseku a dřevo na ně (roads.md – ceny). */
export function roadBridgeCost(road: Pick<Road, 'ground'>): { manDays: number; trees: number } {
  const { causeway, footbridge } = roadBridgeParts(road);
  return {
    manDays: tenths(causeway.manDays + footbridge.manDays),
    trees: causeway.trees + footbridge.trees,
  };
}

/** Rozpad ceny úpravy úseků dohromady (člověkodny na desetiny). */
function chainParts(roads: readonly Road[]): RoadUpgradeParts {
  const out: RoadUpgradeParts = {
    improved: { manDays: 0, trees: 0 },
    causeway: { manDays: 0, trees: 0 },
    footbridge: { manDays: 0, trees: 0 },
  };
  for (const road of roads) {
    if (road.grade === 'trodden') {
      out.improved.manDays += (ROAD_UPGRADES.improvedManDaysPer100M * roadLengthM(road)) / 100;
    }
    if (!roadNeedsCauseway(road)) continue;
    const { causeway, footbridge } = roadBridgeParts(road);
    out.causeway.manDays += causeway.manDays;
    out.causeway.trees += causeway.trees;
    out.footbridge.manDays += footbridge.manDays;
    out.footbridge.trees += footbridge.trees;
  }
  for (const part of Object.values(out)) part.manDays = tenths(part.manDays);
  return out;
}

/**
 * Práce na cestě bez kácení a dřevo úpravy úseku (roads.md – ceny): vyšlapaná úsek srovná
 * a rozšíří, vede-li mokřinou nebo přes brod, postaví i hať a lávku; upravená bez hatě
 * (`unbridged`) jen hať a lávku; ostatní nic.
 */
export function roadUpgradeCost(road: Pick<Road, 'points' | 'ground' | 'grade' | 'unbridged'>): {
  manDays: number;
  trees: number;
} {
  if (road.grade === 'wagon' || (road.grade === 'improved' && !road.unbridged)) {
    return { manDays: 0, trees: 0 };
  }
  const bridge = roadNeedsCauseway(road) ? roadBridgeCost(road) : { manDays: 0, trees: 0 };
  const improve =
    road.grade === 'trodden'
      ? tenths((ROAD_UPGRADES.improvedManDaysPer100M * roadLengthM(road)) / 100)
      : 0;
  return { manDays: tenths(improve + bridge.manDays), trees: bridge.trees };
}

/** Úsek vede mokřinou nebo přes brod – úprava postaví hať a lávku. */
export function roadNeedsCauseway(road: Pick<Road, 'ground'>): boolean {
  return roadWetM(road.ground) > 0 || (road.ground?.fords.length ?? 0) > 0;
}

/**
 * Úseku chybí úprava cesty: je vyšlapaný, nebo upravený přes mokřinu či brod bez hatě a lávky.
 * Vozová cesta (roads.md – Postupná úprava) se odemkne, až když to neplatí pro žádný úsek řetězu.
 */
export function roadNeedsUpgrade(road: {
  grade?: RoadGrade | undefined;
  ground?: Road['ground'];
  unbridged?: boolean | undefined;
}): boolean {
  return (
    road.grade === 'trodden' ||
    (road.grade === 'improved' && road.unbridged === true && roadNeedsCauseway(road))
  );
}

/** Bod v polovině osy úseku – odtud se kácí dřevo vylepšení. */
export function roadMidpoint(road: Pick<Road, 'points'>): { x: number; z: number } {
  const half = roadLengthM(road) / 2;
  let along = 0;
  for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1]!;
    const b = road.points[k]!;
    const length = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
    if (along + length >= half && length > 0) {
      const u = (half - along) / length;
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }
    along += length;
  }
  const first = road.points[0]!;
  return { x: first.x, z: first.z };
}

/** Bod v polovině os úseků za sebou (řetěz – úseky v pořadí cesty; jeden úsek jako dřív). */
function chainMidpoint(roads: readonly Pick<Road, 'points'>[]): { x: number; z: number } {
  if (roads.length === 1) return roadMidpoint(roads[0]!);
  const half = roads.reduce((sum, r) => sum + roadLengthM(r), 0) / 2;
  let along = 0;
  for (const road of roads) {
    const length = roadLengthM(road);
    if (along + length >= half && length > 0) return pointOnRoad(road, half - along);
    along += length;
  }
  return roadMidpoint(roads[0]!);
}

/** Bod osy úseku `d` m od jeho začátku. */
function pointOnRoad(road: Pick<Road, 'points'>, d: number): { x: number; z: number } {
  let along = 0;
  for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1]!;
    const b = road.points[k]!;
    const length = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
    if (along + length >= d && length > 0) {
      const u = (d - along) / length;
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }
    along += length;
  }
  const end = road.points[road.points.length - 1]!;
  return { x: end.x, z: end.z };
}

/**
 * Úseky cesty hráče (řetěz úseku `roadId`), kterým úprava chybí, v pořadí cesty: vyšlapané úseky
 * a upravené přes mokřinu nebo brod bez hatě a lávky (`unbridged`).
 */
function chainTargets(state: VillageState, roadId: number): Road[] {
  return roadChain(state.roads?.roads ?? [], roadId)
    .map((link) => link.road)
    .filter(roadNeedsUpgrade);
}

/** Práce a dřevo úpravy úseků dohromady. */
function chainCost(roads: readonly Road[]): { manDays: number; trees: number } {
  let manDays = 0;
  let trees = 0;
  for (const road of roads) {
    const cost = roadUpgradeCost(road);
    manDays += cost.manDays;
    trees += cost.trees;
  }
  return { manDays: tenths(manDays), trees };
}

/** Plán dřeva vylepšení – klády z hromady, zbytek nejbližší dospělé stromy k polovině úseků. */
function upgradeWood(
  state: VillageState,
  road: readonly Road[],
  trees: number,
  day: number,
  obstacles: ObstacleLayer | null,
  walk: Walk | undefined,
): WoodPlan {
  return planWoodFrom(
    trees,
    chainMidpoint(road),
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    { obstacles, ...(walk ? { walk } : {}) },
  );
}

/**
 * Vylepšení, které cesta hráče nabízí – řetěz úseku `roadId` (road-chains.ts): „Upravit cestu“,
 * když je v něm vyšlapaný úsek (úprava, hať přes mokřinu a lávka přes brod v jedné stavbě), nebo
 * úsek upravený bez hatě a lávky (jen ty). Cena za všechny úseky, kterým úprava chybí. Bez úseku
 * prázdné.
 */
export function roadUpgradeOptions(
  state: VillageState,
  roadId: number,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
  landscape?: Landscape,
): RoadUpgradeOption[] {
  const chain = roadChain(state.roads?.roads ?? [], roadId).map((link) => link.road);
  if (chain.length === 0) return [];
  // jen jiné vylepšení – výsadba jabloní vylepšení nebrání
  const building = roadsInWork(state.constructions.filter((c) => c.kind === 'road'));
  const working = chain.some((road) => building.has(road.id));
  const targets = chainTargets(state, roadId);
  const offered = targets.length > 0 ? (['improved'] as const) : [];
  return offered.map((upgrade) => {
    const cost = chainCost(targets);
    const swath = chainSwath(state, targets, day, obstacles, landscape);
    const wood =
      cost.trees > 0 ? upgradeWood(state, targets, cost.trees, day, obstacles, walk) : null;
    const felling = wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0;
    let blocked: string | null = null;
    if (working) blocked = 'Cesta se už vylepšuje.';
    else if (swath.sacred) blocked = ROAD_SACRED;
    else if (wood && wood.missing > 0) blocked = 'Na hať a lávku chybí dřevo.';
    return {
      upgrade,
      laborManDays: tenths(cost.manDays + swath.manDays + felling),
      trees: cost.trees,
      treesToFell: wood ? wood.fell.length : 0,
      swathTrees: swath.trees,
      parts: chainParts(targets),
      blocked,
    };
  });
}

/**
 * Zahájí vylepšení cesty hráče – řetězu úseku `roadId` (roads.md): jedna stavba ze společné práce
 * pro úseky, kterým vylepšení chybí (`roadIds` v pořadí cesty – stupeň dostanou po dokončení),
 * dřevo z hromady a kácení nejbližších stromů k úsekům (vyhrazené od zahájení). RangeError, když vylepšení nejde
 * (`roadUpgradeOptions` – důvod česky). Konvence dne jako u ostatních akcí – volá se na ves
 * dopočítanou do dne `day`, práci stavba dostane od dalšího dne.
 */
export function startRoadUpgrade(
  state: VillageState,
  day: number,
  roadId: number,
  upgrade: RoadUpgrade,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
  landscape?: Landscape,
): VillageState {
  const option = roadUpgradeOptions(state, roadId, day, obstacles, walk, landscape).find(
    (o) => o.upgrade === upgrade,
  );
  if (!option) throw new RangeError('Tohle vylepšení úsek nemá.');
  if (option.blocked) throw new RangeError(option.blocked);
  const next = structuredClone(state);
  const targets = chainTargets(next, roadId);
  const cost = chainCost(targets);
  // průsek lesem – kácí se, až práce na úsek dojde (roadSwathDay); cena předem
  const swath = chainSwath(state, targets, day, obstacles, landscape);
  const wood =
    cost.trees > 0
      ? takeWood(next, upgradeWood(next, targets, cost.trees, day, obstacles, walk))
      : undefined;
  next.constructions.push({
    id: next.nextId++,
    kind: 'road',
    startedDay: day,
    cost: tenths(
      cost.manDays + swath.manDays + (wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0),
    ),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    roadIds: targets.map((road) => road.id),
    roadGrade: upgrade,
    ...(wood ? { wood } : {}),
  });
  return next;
}

/**
 * Průběh vylepšení `c` po jeho úsecích (0–1, klíč id úseku) při průběhu celé stavby `progress`:
 * stavba jde po cestě úsek po úseku (`roadIds` v pořadí cesty), každý váží svou cenou (upravená
 * délkou a hatí s lávkou). Jen pro rozdělení práce, postavy a scénu – stupeň dostanou úseky
 * po dokončení.
 */
export function roadUpgradeProgress(
  state: Pick<VillageState, 'roads'>,
  c: Pick<Construction, 'roadIds' | 'roadGrade'>,
  progress: number,
): Map<number, number> {
  const roads = (c.roadIds ?? []).flatMap((id) => {
    const road = state.roads?.roads.find((r) => r.id === id);
    return road ? [road] : [];
  });
  const grade = c.roadGrade;
  const byCost = roads.map((road) =>
    grade && grade !== 'trodden' && grade !== 'wagon' ? roadUpgradeCost(road).manDays : 0,
  );
  // bez ceny (krátké úseky) po délce
  const weights = byCost.some((w) => w > 0) ? byCost : roads.map((road) => roadLengthM(road));
  const reached = progress * weights.reduce((sum, w) => sum + w, 0);
  const out = new Map<number, number>();
  let along = 0;
  roads.forEach((road, k) => {
    const w = weights[k]!;
    out.set(
      road.id,
      w > 0
        ? Math.max(0, Math.min(1, (reached - along) / w))
        : reached > along || progress >= 1
          ? 1
          : 0,
    );
    along += w;
  });
  return out;
}

/**
 * Úsek, na kterém se teď pracuje – první nedokončený podle `roadUpgradeProgress` (rozdělení práce
 * a postavy); bez úseků první id stavby, nebo null.
 */
export function roadWorkFront(state: Pick<VillageState, 'roads'>, c: Construction): number | null {
  const progress = roadUpgradeProgress(
    state,
    c,
    c.cost > 0 ? Math.min(c.cost, c.done) / c.cost : 0,
  );
  for (const [id, p] of progress) if (p < 1) return id;
  const ids = [...progress.keys()];
  return ids[ids.length - 1] ?? c.roadIds?.[0] ?? null;
}

/**
 * Převod starší vsi na úpravu s hatí a lávkou (roads.md – Vylepšení cesty; plán cest v2, Úloha 10):
 * stupeň `causeway` (uložený úsek, stavba, úsek stezky) je upravená cesta; upravená přes mokřinu
 * nebo brod, která hať a lávku nemá, dostane `unbridged` (nabídne se jí jen hať a lávka). Jednou
 * a idempotentně (`bridgesSeeded`); vstupní stav se nemění, vrátí se kopie.
 */
export function withBridgedRoads(state: VillageState): VillageState {
  const roads = state.roads;
  if (!roads || roads.bridgesSeeded) return state;
  // starý uložený stupeň, který typ už nezná
  const legacy = (grade: string): boolean => grade === 'causeway';
  const copy = structuredClone(state);
  for (const road of copy.roads!.roads) {
    if (legacy(road.grade)) road.grade = 'improved';
    else if (road.grade === 'improved' && roadNeedsCauseway(road)) road.unbridged = true;
  }
  copy.roads!.bridgesSeeded = true;
  for (const c of copy.constructions) {
    if (c.roadGrade && legacy(c.roadGrade)) c.roadGrade = 'improved';
  }
  for (const trail of copy.trails ?? []) {
    for (const piece of trail.pieces) if (legacy(piece.grade)) piece.grade = 'improved';
  }
  return copy;
}

/** Dokončené vylepšení – úseky stavby dostanou nový stupeň (mutuje stav). */
export function finishRoadUpgrade(state: VillageState, c: Construction): void {
  if (!c.roadGrade) return;
  for (const road of state.roads?.roads ?? []) {
    if (!c.roadIds?.includes(road.id)) continue;
    road.grade = c.roadGrade;
    // hať a lávka jsou hotové s úpravou
    delete road.unbridged;
  }
}
