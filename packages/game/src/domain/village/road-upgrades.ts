import type { ObstacleLayer } from '../landscape';
import { obstacleChangesAt } from './obstacles';
import { roadChain } from './paths/road-chains';
import { roadLengthM, roadWetM, roadsInWork } from './paths/roads';
import type { Walk } from './paths/walking';
import { ROAD_UPGRADES } from './rules';
import type { Construction, Road, RoadGrade, VillageState } from './types';
import { claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';

// Vylepšení pevné cesty (roads.md – Vylepšení cesty, schváleno 18. 10. 2026): hráč vybere úsek
// a zadá vylepšení – stavba ze společné práce vsi. Upravená cesta (vyšlapaná → upravená: srovnat
// a rozšířit – Martin, 19. 10. 2026: jen širší, bez strouhy) 15 člověkodní na 100 m; hať a lávka
// (po upravené, jen na úseku přes mokřinu nebo brod) – hať 1 strom a 2 člověkodny na 2 m
// mokřiny, lávka 4 stromy a 15 člověkodní na brod. Dřevo jako obydlí: klády z hromady, pak
// nejbližší dospělé stromy k úseku. Rychlejší chůze po vylepšené cestě počítá walking.ts
// (ROAD_WALK). Vylepšuje se celá cesta hráče – řetěz úseků (road-chains.ts): úseky, které to
// vylepšení ještě nemají, jednou stavbou (cena za ně dohromady, stupeň po úsecích).

/** Vylepšení úseku – na upravenou cestu, nebo hať a lávka. */
export type RoadUpgrade = Exclude<RoadGrade, 'trodden'>;

/** Vylepšení, které úsek nabízí: práce celkem (i s kácením), dřevo a proč teď nejde. */
export interface RoadUpgradeOption {
  upgrade: RoadUpgrade;
  /** Člověkodny celkem – práce na cestě a kácení stromů z plánu dřeva. */
  laborManDays: number;
  /** Dřevo (stromy) – klády z hromady, zbytek se kácí. */
  trees: number;
  /** Stromy ke kácení (dřevo, které hromada nepokryje). */
  treesToFell: number;
  /** Proč vylepšení teď nejde (česky), nebo null. */
  blocked: string | null;
}

/** Na desetiny člověkodne. */
function tenths(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Práce na cestě bez kácení a dřevo vylepšení úseku (roads.md – ceny). */
export function roadUpgradeCost(
  road: Pick<Road, 'points' | 'ground'>,
  upgrade: RoadUpgrade,
): { manDays: number; trees: number } {
  if (upgrade === 'improved') {
    return {
      manDays: tenths((ROAD_UPGRADES.improvedManDaysPer100M * roadLengthM(road)) / 100),
      trees: 0,
    };
  }
  const pieces = roadWetM(road.ground) / 2;
  const fords = road.ground?.fords.length ?? 0;
  const { causewayPer2M, footbridge } = ROAD_UPGRADES;
  return {
    manDays: tenths(pieces * causewayPer2M.manDays + fords * footbridge.manDays),
    trees: Math.ceil(pieces * causewayPer2M.trees - 1e-9) + fords * footbridge.trees,
  };
}

/** Úsek vede mokřinou nebo přes brod – nabízí hať a lávku. */
export function roadNeedsCauseway(road: Pick<Road, 'ground'>): boolean {
  return roadWetM(road.ground) > 0 || (road.ground?.fords.length ?? 0) > 0;
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
 * Úseky cesty hráče (řetěz úseku `roadId`), kterým vylepšení `upgrade` chybí, v pořadí cesty:
 * upravená – vyšlapané úseky, hať a lávka – úseky přes mokřinu nebo brod, které ji ještě nemají.
 */
function chainTargets(state: VillageState, roadId: number, upgrade: RoadUpgrade): Road[] {
  return roadChain(state.roads?.roads ?? [], roadId)
    .map((link) => link.road)
    .filter((road) =>
      upgrade === 'improved'
        ? road.grade === 'trodden'
        : road.grade !== 'causeway' && roadNeedsCauseway(road),
    );
}

/** Práce a dřevo vylepšení úseků dohromady. */
function chainCost(
  roads: readonly Road[],
  upgrade: RoadUpgrade,
): { manDays: number; trees: number } {
  let manDays = 0;
  let trees = 0;
  for (const road of roads) {
    const cost = roadUpgradeCost(road, upgrade);
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
 * Vylepšení, která cesta hráče nabízí – řetěz úseku `roadId` (road-chains.ts): upravená, když je
 * v něm vyšlapaný úsek, hať a lávka, když vede mokřinou nebo přes brod úsekem bez nich (až je ten
 * upravený). Cena za všechny úseky, kterým vylepšení chybí. Bez úseku prázdné.
 */
export function roadUpgradeOptions(
  state: VillageState,
  roadId: number,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): RoadUpgradeOption[] {
  const chain = roadChain(state.roads?.roads ?? [], roadId).map((link) => link.road);
  if (chain.length === 0) return [];
  // jen jiné vylepšení – výsadba jabloní vylepšení nebrání
  const building = roadsInWork(state.constructions.filter((c) => c.kind === 'road'));
  const working = chain.some((road) => building.has(road.id));
  const offered = (['improved', 'causeway'] as const).filter(
    (upgrade) => chainTargets(state, roadId, upgrade).length > 0,
  );
  return offered.map((upgrade) => {
    const targets = chainTargets(state, roadId, upgrade);
    const cost = chainCost(targets, upgrade);
    const wood =
      cost.trees > 0 ? upgradeWood(state, targets, cost.trees, day, obstacles, walk) : null;
    const felling = wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0;
    let blocked: string | null = null;
    if (working) blocked = 'Cesta se už vylepšuje.';
    else if (upgrade === 'causeway' && targets.some((road) => road.grade === 'trodden')) {
      blocked = 'Nejdřív je potřeba cestu upravit.';
    } else if (wood && wood.missing > 0) blocked = 'Na hať a lávku chybí dřevo.';
    return {
      upgrade,
      laborManDays: tenths(cost.manDays + felling),
      trees: cost.trees,
      treesToFell: wood ? wood.fell.length : 0,
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
): VillageState {
  const option = roadUpgradeOptions(state, roadId, day, obstacles, walk).find(
    (o) => o.upgrade === upgrade,
  );
  if (!option) throw new RangeError('Tohle vylepšení úsek nemá.');
  if (option.blocked) throw new RangeError(option.blocked);
  const next = structuredClone(state);
  const targets = chainTargets(next, roadId, upgrade);
  const cost = chainCost(targets, upgrade);
  const wood =
    cost.trees > 0
      ? takeWood(next, upgradeWood(next, targets, cost.trees, day, obstacles, walk))
      : undefined;
  next.constructions.push({
    id: next.nextId++,
    kind: 'road',
    startedDay: day,
    cost: tenths(cost.manDays + (wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0)),
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
 * délkou, hať mokřinou a brody). Jen pro rozdělení práce, postavy a scénu – stupeň dostanou úseky
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
    grade && grade !== 'trodden' ? roadUpgradeCost(road, grade).manDays : 0,
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

/** Dokončené vylepšení – úseky stavby dostanou nový stupeň (mutuje stav). */
export function finishRoadUpgrade(state: VillageState, c: Construction): void {
  if (!c.roadGrade) return;
  for (const road of state.roads?.roads ?? []) {
    if (c.roadIds?.includes(road.id)) road.grade = c.roadGrade;
  }
}
