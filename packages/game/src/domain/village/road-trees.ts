import { ROAD_TREES } from './rules';
import type { RoadTree } from './types';

// Stromy u pevných cest (roads.md – Stromy u pevných cest): strom se uchytí na místě u cesty
// a roste z keře (Martin – napřed keř), po smrti stářím zbude souš a pak pařez. Vše se odvozuje
// ze dne – uložený je jen den uchycení a den smrti. Strom je i překážkou stavby: pole, obydlí,
// sad nebo hřbitov přes něj ho odstraní jako ostatní překážky (`ObstacleChanges.added`).

const DAYS_PER_YEAR = 365.25;

/**
 * Id stromů u cest leží nad rozsahem id vrstvy překážek (zdroj × 2^22, zdrojů je pod 32) – jako
 * zdroj 256. Strom odstraněný stavbou se tak zapíše mezi odstraněné překážky vsi a s id z vrstvy
 * se nikdy nepotká.
 */
export const ROAD_TREE_ID_BASE = 1_073_741_824;

/** Stadium stromu u cesty: keř, strom, souš, pařez. */
export type RoadTreeStage = 'shrub' | 'tree' | 'snag' | 'stump';

/**
 * Jak strom v daný den vypadá: stadium a velikost 0–1 – keř podle stáří keře (0 → 1 za
 * ROAD_TREES.shrubYears), strom od ROAD_TREES.youngScale do plné velikosti, souš a pařez 1.
 */
export interface RoadTreeLook {
  stage: RoadTreeStage;
  growth: number;
}

/** Druh překážky, jakou strom u cesty v daný den je (cena odstranění, kláda za dospělý strom). */
export type RoadTreeObstacleKind = 'shrub' | 'youngTree' | 'tree' | 'snag' | 'stump';

/** Velikost stromu (už ne keře) podle stáří v letech: 30 % po keři, plná ve 40 letech. */
export function roadTreeGrowth(ageYears: number): number {
  const span = ROAD_TREES.fullYears - ROAD_TREES.shrubYears;
  const t = Math.min(1, Math.max(0, (ageYears - ROAD_TREES.shrubYears) / span));
  return ROAD_TREES.youngScale + (1 - ROAD_TREES.youngScale) * t;
}

/** Vzhled stromu u cesty v den `day`; před uchycením a po zmizení pařezu null. */
export function roadTreeLook(
  tree: Pick<RoadTree, 'rootedDay' | 'diesDay'>,
  day: number,
): RoadTreeLook | null {
  if (day < tree.rootedDay) return null;
  if (day >= tree.diesDay) {
    const dead = (day - tree.diesDay) / DAYS_PER_YEAR;
    if (dead >= ROAD_TREES.snagYears + ROAD_TREES.stumpYears) return null;
    return { stage: dead >= ROAD_TREES.snagYears ? 'stump' : 'snag', growth: 1 };
  }
  const age = (day - tree.rootedDay) / DAYS_PER_YEAR;
  if (age < ROAD_TREES.shrubYears) return { stage: 'shrub', growth: age / ROAD_TREES.shrubYears };
  return { stage: 'tree', growth: roadTreeGrowth(age) };
}

/** Druh překážky stromu u cesty v den `day` (mladý strom do ROAD_TREES.logFromYears); null = není. */
export function roadTreeObstacleKind(
  tree: Pick<RoadTree, 'rootedDay' | 'diesDay'>,
  day: number,
): RoadTreeObstacleKind | null {
  const look = roadTreeLook(tree, day);
  if (look === null) return null;
  if (look.stage !== 'tree') return look.stage;
  const age = (day - tree.rootedDay) / DAYS_PER_YEAR;
  return age < ROAD_TREES.logFromYears ? 'youngTree' : 'tree';
}

/** Je to id stromu u cesty (ne překážky z vrstvy)? */
export function isRoadTreeId(id: number): boolean {
  return id >= ROAD_TREE_ID_BASE;
}
