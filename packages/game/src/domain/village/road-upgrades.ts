import type { ObstacleLayer } from '../landscape';
import { obstacleChangesAt } from './obstacles';
import { roadLengthM, roadWetM, roadsInWork } from './paths/roads';
import type { Walk } from './paths/walking';
import { ROAD_UPGRADES } from './rules';
import type { Construction, Road, RoadGrade, VillageState } from './types';
import { claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';

// Vylepšení pevné cesty (roads.md – Vylepšení cesty, schváleno 18. 10. 2026): hráč vybere úsek
// a zadá vylepšení – stavba ze společné práce vsi. Upravená cesta (vyšlapaná → upravená: srovnat,
// strouha, kameny do bláta a brodu) 15 člověkodní na 100 m; hať a lávka (po upravené, jen na úseku
// přes mokřinu nebo brod) – hať 1 strom a 2 člověkodny na 2 m mokřiny, lávka 4 stromy
// a 15 člověkodní na brod. Dřevo jako obydlí: klády z hromady, pak nejbližší dospělé stromy
// k úseku. Rychlejší chůze po vylepšené cestě počítá walking.ts (ROAD_WALK).

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

/** Plán dřeva vylepšení – klády z hromady, zbytek nejbližší dospělé stromy k polovině úseku. */
function upgradeWood(
  state: VillageState,
  road: Road,
  trees: number,
  day: number,
  obstacles: ObstacleLayer | null,
  walk: Walk | undefined,
): WoodPlan {
  return planWoodFrom(
    trees,
    roadMidpoint(road),
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    { obstacles, ...(walk ? { walk } : {}) },
  );
}

/** Vylepšení, která úsek nabízí (bez úseku prázdné). */
export function roadUpgradeOptions(
  state: VillageState,
  roadId: number,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): RoadUpgradeOption[] {
  const road = state.roads?.roads.find((r) => r.id === roadId);
  if (!road) return [];
  const working = roadsInWork(state.constructions).has(roadId);
  const offered: RoadUpgrade[] = [];
  if (road.grade === 'trodden') offered.push('improved');
  if (road.grade !== 'causeway' && roadNeedsCauseway(road)) offered.push('causeway');
  return offered.map((upgrade) => {
    const cost = roadUpgradeCost(road, upgrade);
    const wood = cost.trees > 0 ? upgradeWood(state, road, cost.trees, day, obstacles, walk) : null;
    const felling = wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0;
    let blocked: string | null = null;
    if (working) blocked = 'Cesta se už vylepšuje.';
    else if (upgrade === 'causeway' && road.grade === 'trodden') {
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
 * Zahájí vylepšení úseku `roadId` (roads.md): stavba ze společné práce, dřevo z hromady a kácení
 * nejbližších stromů k úseku (vyhrazené od zahájení). RangeError, když vylepšení nejde
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
  const road = next.roads!.roads.find((r) => r.id === roadId)!;
  const cost = roadUpgradeCost(road, upgrade);
  const wood =
    cost.trees > 0
      ? takeWood(next, upgradeWood(next, road, cost.trees, day, obstacles, walk))
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
    roadIds: [roadId],
    roadGrade: upgrade,
    ...(wood ? { wood } : {}),
  });
  return next;
}

/** Dokončené vylepšení – úseky stavby dostanou nový stupeň (mutuje stav). */
export function finishRoadUpgrade(state: VillageState, c: Construction): void {
  if (!c.roadGrade) return;
  for (const road of state.roads?.roads ?? []) {
    if (c.roadIds?.includes(road.id)) road.grade = c.roadGrade;
  }
}
