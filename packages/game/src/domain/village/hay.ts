import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import {
  length2,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
} from '../landscape';
import { distanceFactor, fallowStage, partWalkDistance } from './fields';
import { fastestWalkShare } from './paths/walking';
import { plotShapes } from './plot-cells';
import { NO_CRAFTS, hayWorkPerHa } from './productivity';
import { tilesUnder, villageLandSquares } from './squares';
import { HAY_CUTS } from './rules';
import { WEATHER_EFFECTS } from './rules-disasters';
import { hasWeather, hayWeatherFactor, mowingWeatherFactor, summerOf } from './weather-effects';
import type {
  FieldPart,
  HayMowing,
  HaySquare,
  HayState,
  HerdSpecies,
  TileCell,
  VillageState,
} from './types';

// Seno (oxen.md – Seno, diet.md – Dobytek): přes zimu (listopad–březen) žerou seno krávy, voli,
// ovce a kozy (Martin 19. 10. 2026 – ovce a kozy v zimě taky). Seno dává úhor ve fázi louky
// a přirozené louky krajiny do 600 m od vsi (Martin 18. 10. 2026: „měly by jít posekat všechny
// louky“) – ≈ 1,5 t/ha; ves seče všechny louky na dosah (Martin 24. 10. 2026: „posekat co nejvíc
// sena“) – ve dvou sečích (Martin 25. 10. 2026: „1. konec května – konec června 2. srpen – září“):
// 1. seč 25. 5. – 30. 6., otava 1. 8. – 30. 9. jen na posečených loukách (40 % sena). Seče se na zimu
// stád v cílové velikosti + 20 %, seno na dnešní stádo po polních pracích před stavbami, zbytek až
// z práce po stavbách (oxen.md – Seno, dvě seče); seč, sušení, svoz a stohování 10–15 čd/ha.
// Stoh ztrácí počasím a plísní (10 % ročně) a zbytek loňského sena se do nové seče zkazí.

/**
 * oxen.md – Seno (Martin 19. 10. 2026; čísla návrh Clauda podle rešerše
 * research/2026-10-19-herds-hay-meat.md): denní dávka sena v zimě (kg) – malý raně středověký
 * skot (≈ 200–250 kg živé váhy) kráva 5, vůl 6 (na jaře orá), ovce a koza 1 (část mohla být
 * letnina – hra ji počítá jako seno); prasata seno nežerou (přes zimu se drží jen chovná u domů –
 * diet.md). Louka 1,5 t/ha (nehnojená jednosečná – dřív i tak), stoh ztrácí 10 % ročně; když chybí
 * přes polovinu sena, voli i stádo hynou (oxen.md, diet.md – Zimní úhyn). Práce seče
 * HAY_WORK_PER_HA (rules.ts). Dřív 10 kg denně na krávu i vola, ovce a kozy nic.
 */
export const HAY = {
  dailyKg: { cow: 5, ox: 6, sheep: 1, goat: 1 },
  yieldKgPerHa: 1500,
  storageLossPerYear: 0.1,
  deathBelowCoverage: 0.5,
} as const;
/** Dní zimního krmení (listopad–březen, nepřestupný rok). */
export const HAY_WINTER_DAYS = 151;
/** Druhy stád, které v zimě žerou seno. */
export const HAY_EATERS: readonly Exclude<HerdSpecies, 'pig'>[] = ['cow', 'sheep', 'goat'];
/**
 * Průměrně tolik dní leží seno ve stohu od seče (≈ 1. 7.) do zkrmení (≈ 15. 1.) – plán seče
 * počítá se ztrátou za tu dobu.
 */
const PLAN_STORAGE_DAYS = 198;
/** Od začátku zimy (1. 11.) do zkrmení leží seno průměrně polovinu zimy. */
const WINTER_STORAGE_DAYS = 76;
const DAYS_PER_YEAR = 365;
/** Za den ve stohu zůstane tento podíl sena. */
const DAILY_HAY_KEEP = (1 - HAY.storageLossPerYear) ** (1 / DAYS_PER_YEAR);

/** Podíl sena, který ve stohu zůstane po `days` dnech. */
function hayKeep(days: number): number {
  return DAILY_HAY_KEEP ** days;
}

/** Podíl sena, který ze seče zbude do zkrmení – plán seče o tolik seče víc. */
export const PLAN_HAY_KEEP = hayKeep(PLAN_STORAGE_DAYS);

/**
 * Seno na zimu (kg) – stáda, voli a koně (`horsesKg` – seno koní za den, `horseHayDailyKg`) celou
 * zimu po denní dávce (bez ztrát ve stohu).
 */
export function winterHayKg(
  herds: Readonly<Record<HerdSpecies, number>>,
  oxen: number,
  horsesKg = 0,
): number {
  return (
    dailyHerdHayKg(herds) * HAY_WINTER_DAYS +
    oxen * HAY.dailyKg.ox * HAY_WINTER_DAYS +
    horsesKg * HAY_WINTER_DAYS
  );
}

/** Seno stád za den zimy (kg) – krávy, ovce a kozy, bez volů. */
export function dailyHerdHayKg(herds: Readonly<Record<HerdSpecies, number>>): number {
  return HAY_EATERS.reduce((sum, s) => sum + herds[s] * HAY.dailyKg[s], 0);
}

/**
 * Seno, které zimě zbude ze zásoby k 1. 11. (kg) – po ztrátách ve stohu za průměrnou dobu do
 * zkrmení (nosnost přes zimu, livestock.ts).
 */
export function winterHayAvailable(hayKg: number): number {
  return hayKg * hayKeep(WINTER_STORAGE_DAYS);
}

/**
 * Seno, které ze zásoby zbude na `days` zbývajících dní zimy (kg) – po ztrátách ve stohu za polovinu
 * té doby (jako `winterHayAvailable` k 1. 11.).
 */
export function hayLeftAvailable(hayKg: number, days: number): number {
  return hayKg * hayKeep(days / 2);
}

/**
 * Dní zimního krmení od dneška (včetně) do konce března – v dlouhé zimě (`longWinter`) do konce
 * dubna; mimo zimu 0.
 */
export function hayWinterDaysLeft(day: number, longWinter = false): number {
  if (!isHayWinter(day, longWinter)) return 0;
  const { year, month } = dateOfDayIndex(day);
  if (month <= 4) return dayIndexOf({ year, month: longWinter ? 5 : 4, day: 1 }) - day;
  // listopad a prosinec – do Silvestra a pak leden až březen příštího roku (bez dayIndexOf za
  // koncem světa)
  const newYear = dayIndexOf({ year, month: 12, day: 31 }) + 1;
  return newYear - day + 31 + (isLeapYear(year + 1) ? 29 : 28) + 31;
}

/** Den ve stohu (mutuje stav): seno ztrácí počasím a plísní (HAY.storageLossPerYear). */
export function rotHay(state: VillageState): void {
  if (state.hay && state.hay.kg > 0) state.hay.kg *= DAILY_HAY_KEEP;
}

/**
 * Den plánu seče (1. 6., mutuje stav): zbytek loňského sena se zkazil – stoh přes rok zplesniví
 * a vyluhuje (oxen.md – Seno). Vrátí zkažené kg.
 */
export function spoilOldHay(state: VillageState): number {
  const kg = state.hay?.kg ?? 0;
  if (state.hay && kg > 0) state.hay.kg = 0;
  return kg;
}
/** Den plánu 1. seče (25. 5.) – zkazí se loňské seno (`spoilOldHay`). */
export const MOWING_DAY = HAY_CUTS.first.from;
/** Den plánu otavy (1. 8.). */
export const AFTERMATH_DAY = HAY_CUTS.second.from;

/** Seč – 1. (chybí) nebo otava (2). */
export function mowingCut(mowing: Pick<HayMowing, 'cut'>): 1 | 2 {
  return mowing.cut ?? 1;
}

/** Seno z hektaru louky v této seči (kg) – otava `aftermathYieldShare` 1. seče. */
export function mowingYieldPerHa(mowing: Pick<HayMowing, 'cut'>): number {
  return HAY.yieldKgPerHa * (mowingCut(mowing) === 2 ? HAY_CUTS.aftermathYieldShare : 1);
}

/** Podíl práce na hektar proti 1. seči – otava `aftermathWorkShare`. */
export function mowingWorkShare(mowing: Pick<HayMowing, 'cut'>): number {
  return mowingCut(mowing) === 2 ? HAY_CUTS.aftermathWorkShare : 1;
}

/** Seno letošních sečí (kg) – plán dnešní seče a u otavy i co dala 1. seč. */
export function seasonHayYieldKg(mowing: HayMowing | null | undefined): number {
  return mowing ? mowing.yieldKg + (mowing.firstCut?.yieldKg ?? 0) : 0;
}
/** Zima s krmením senem: listopad–březen (měsíce včetně). */
export const HAY_WINTER_MONTHS: readonly number[] = [11, 12, 1, 2, 3];

const M2_PER_HA = 10_000;
/** Přirozené louky se sečou do této vzdálenosti od nejbližšího obydlí (m) – jako pastva. */
export const HAY_REACH_M = 600;

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Zásoba sena vsi (kg) – u vsí bez sena 0. */
export function villageHayKg(state: Pick<VillageState, 'hay'>): number {
  return state.hay?.kg ?? 0;
}

/** Seno vsi (vsi bez sena prázdné). */
export function villageHay(state: Pick<VillageState, 'hay'>): HayState {
  return state.hay ?? { kg: 0, mowing: null };
}

/**
 * Díl je úhor ve fázi louky – seče se na seno: příloh starší než mladý (1–2 roky) a ještě
 * nezarostlý křovím ani lesem (fields.md – Příloh a pastva, Zarůstání).
 */
export function isHayMeadow(part: FieldPart, day: number): boolean {
  return part.state === 'fallow' && fallowStage(part, day) === 'meadow';
}

/**
 * Váha louky v seči – její práce (plocha × příplatek za vzdálenost chůze po pěšinách – paths.md),
 * jako u polních prací. Vzdálenost louky se ukládá při plánu seče (`HaySquare.distanceM`).
 */
function mowWeight(square: { areaM2: number; distanceM: number }): number {
  return (square.areaM2 / M2_PER_HA) * distanceFactor(square.distanceM);
}

/** Vzdálenost se ukládá na desetiny metru (dolů – jako vzdálenost chůze dílů). */
const DISTANCE_ROUNDING = 10;

function roundDistance(m: number): number {
  return Math.floor(m * DISTANCE_ROUNDING) / DISTANCE_ROUNDING;
}

/**
 * Vzdálenosti chůze z obydlí po pěšinách ke středům políček (m) – `walkDistancesTo`
 * v paths/village.ts; null = bez sítě pěšin (přímé vzdálenosti).
 */
export type MeadowWalk = (targets: readonly { x: number; z: number }[]) => number[] | null;

/**
 * Políčka přirozené louky do HAY_REACH_M od nejbližšího obydlí, která nezabírá pole, sad,
 * hřbitov, pozemek, ohrada, obydlí ani les vsi (oxen.md – Seno), s přímou vzdáleností od obydlí. Bez
 * krajiny nebo obydlí žádná.
 */
function naturalMeadows(
  state: VillageState,
  landscape: Landscape | null,
): (HaySquare & { cell: TileCell; x: number; z: number })[] {
  if (!landscape) return [];
  const houses = [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null ? [c.position] : [],
    ),
  ];
  if (houses.length === 0) return [];
  const key = (c: TileCell): number => c.y * landscape.size + c.x;
  const taken = new Set<number>();
  // čtverce polí, sadů, hřbitovů, ohrad a lesa vsi – natočené (fields.md – Natočené stavby)
  // zaberou každé políčko, do kterého zasahují; les vsi už louka není (fields.md – Les vsi)
  for (const square of villageLandSquares(landscape, state)) {
    for (const tile of tilesUnder(landscape, square.corners, square.tile)) taken.add(tile);
  }
  for (const plot of [...state.dwellings, ...state.constructions].flatMap((d) =>
    d.plot ? [d.plot] : [],
  )) {
    for (const shape of plotShapes(landscape, plot)) {
      for (const tile of tilesUnder(landscape, shape.corners, shape.tile)) taken.add(tile);
    }
  }
  for (const h of houses) {
    const tile = tileOfWorldPoint(landscape, h.x, h.z);
    if (tile) taken.add(key(tile));
  }
  const reach = Math.ceil(HAY_REACH_M / landscape.cellSizeM) + 1;
  const tiles = houses.flatMap((h) => {
    const t = tileOfWorldPoint(landscape, h.x, h.z);
    return t ? [t] : [];
  });
  const minX = Math.max(0, Math.min(...tiles.map((t) => t.x)) - reach);
  const maxX = Math.min(landscape.size - 1, Math.max(...tiles.map((t) => t.x)) + reach);
  const minY = Math.max(0, Math.min(...tiles.map((t) => t.y)) - reach);
  const maxY = Math.min(landscape.size - 1, Math.max(...tiles.map((t) => t.y)) + reach);
  const area = landscape.cellSizeM * landscape.cellSizeM;
  const squares: (HaySquare & { cell: TileCell; x: number; z: number })[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (taken.has(y * landscape.size + x) || surfaceAt(landscape, x, y) !== 'meadow') continue;
      const c = tileCenterWorld(landscape, x, y);
      let distanceM = Infinity;
      for (const h of houses) distanceM = Math.min(distanceM, length2(h.x - c.x, h.z - c.z));
      if (distanceM <= HAY_REACH_M) {
        squares.push({ cell: { x, y }, areaM2: area, distanceM, x: c.x, z: c.z });
      }
    }
  }
  return squares;
}

/** Pořadí luk v seči: od nejbližší, při shodě díly úhoru (podle id) a pak políčka po řádcích. */
function byDistance(a: HaySquare, b: HaySquare): number {
  return (
    a.distanceM - b.distanceM ||
    (a.partId ?? Infinity) - (b.partId ?? Infinity) ||
    (a.cell?.y ?? 0) - (b.cell?.y ?? 0) ||
    (a.cell?.x ?? 0) - (b.cell?.x ?? 0)
  );
}

/** Vzdálenost, do které louky od nejbližší pokryjí `need` kg sena (jinak Infinity). */
function coverDistance(sorted: readonly HaySquare[], need: number): number {
  let yieldKg = 0;
  for (const square of sorted) {
    yieldKg += (square.areaM2 / M2_PER_HA) * HAY.yieldKgPerHa;
    if (yieldKg >= need - EPSILON) return square.distanceM;
  }
  return Infinity;
}

/**
 * Vzdálenosti chůze přirozených luk (mutuje `meadows`) – po pěšinách a pevných cestách jako díly
 * pole (paths/walking.ts; přes mokřinu a brod i dál než rovně). Měří se jen louky, které můžou
 * ležet v dosahu pokrytí potřeby: chůze je nejméně `share` × přímá vzdálenost (`fastestWalkShare` –
 * nejrychlejší chůze i se stromy u cest), takže louka, která leží rovně dál než dosah ÷ ten podíl,
 * se do seče nedostane. Když změřené louky dosah prodlouží, dorovnají se další (nejvýš pár kol).
 */
function walkMeadows(
  meadows: (HaySquare & { x: number; z: number })[],
  parts: readonly HaySquare[],
  need: number,
  walk: MeadowWalk,
  share: number,
): void {
  const measured = new Set<HaySquare>();
  for (let round = 0; round < WALK_ROUNDS; round++) {
    const reach = coverDistance([...parts, ...meadows].sort(byDistance), need);
    const near = meadows.filter((m) => !measured.has(m) && m.distanceM * share <= reach);
    if (near.length === 0) return;
    const walks = walk(near);
    if (!walks) return;
    near.forEach((m, k) => {
      measured.add(m);
      m.distanceM = walks[k] ?? m.distanceM;
    });
  }
}

/** Nejvýš tolik kol měření luk – další kolo jen, když chůze prodloužila dosah seče. */
const WALK_ROUNDS = 3;

/**
 * Kolik sena (kg v době zkrmení) ves na zimu chce (oxen.md – Seno, dvě seče): `necessaryKg` – dnešní
 * stádo i s letošními mláďaty, voli a koně (seč po polních pracích, před stavbami); `capKg` – stáda
 * v cílové velikosti s rezervou (`HAY_CUTS.reserve`; seč navíc jen z práce po stavbách). Víc ves
 * neseče – seno by shnilo.
 */
export interface MowingNeed {
  necessaryKg: number;
  capKg: number;
}

/**
 * Kolik sena se má ještě posekat (kg ze seče při běžném výnosu) – potřeba po ztrátě ve stohu bez
 * zásoby. Ves s počasím kraje seče s rezervou +15 % a podle sena roku, které už je vidět
 * (disasters.md – Dopady, Seno a pastva: v suchém roce poseče víc luk, dokud louky stačí).
 */
function mowingTargets(
  state: VillageState,
  need: MowingNeed,
  day: number | null = null,
): { necessary: number; cap: number } {
  const stock = villageHayKg(state);
  const scale = hasWeather(state)
    ? (1 + WEATHER_EFFECTS.hayReserve) /
      (day === null ? 1 : hayWeatherFactor(summerOf(state, day, true), undefined))
    : 1;
  return {
    necessary: (need.necessaryKg * scale) / PLAN_HAY_KEEP - stock,
    cap: (Math.max(need.necessaryKg, need.capKg) * scale) / PLAN_HAY_KEEP - stock,
  };
}

/**
 * Louky seče od první – dokud úroda nepokryje strop (`cap`); práce na seno, které je nutné
 * (`necessary`), je `needed`. Bez luk nebo bez potřeby null.
 */
function mowingPlan(
  candidates: readonly HaySquare[],
  targets: { necessary: number; cap: number },
  workPerHa: number,
  yieldPerHa: number,
): Omit<HayMowing, 'done'> | null {
  if (targets.cap <= EPSILON) return null;
  const squares: HaySquare[] = [];
  let required = 0;
  let yieldKg = 0;
  let needed = targets.necessary <= EPSILON ? 0 : null;
  for (const square of candidates) {
    if (yieldKg >= targets.cap - EPSILON) break;
    squares.push(square);
    required += mowWeight(square) * workPerHa;
    yieldKg += (square.areaM2 / M2_PER_HA) * yieldPerHa;
    if (needed === null && yieldKg >= targets.necessary - EPSILON) needed = required;
  }
  if (squares.length === 0) return null;
  const partIds = squares.flatMap((sq) => (sq.partId === undefined ? [] : [sq.partId]));
  return { partIds, squares, required, yieldKg, needed: needed ?? required };
}

/**
 * Plán 1. seče (25. 5. – oxen.md, Seno, dvě seče): louky na dosah od nejbližší k obydlí – díly
 * úhoru ve fázi louky a s krajinou i přirozené louky (`naturalMeadows`), jen tolik, kolik stáda
 * sní (`need` – strop stád v cílové velikosti s rezervou, bez zásoby). Práce na nutné seno
 * (`needed`) jde po polních pracích před stavbami, zbytek až z práce po stavbách
 * (simulate-work.ts). Práce na hektar podle pokrytí nástroji (kosy – `hayWorkPerHa`). Vzdálenost je
 * chůze po pěšinách jako u polních prací: díly `partWalkDistance`, přirozené louky přes `walk` (bez
 * něj rovně). Bez luk nebo potřeby null.
 */
export function planMowing(
  state: VillageState,
  day: number,
  need: MowingNeed,
  toolCoverage: number = NO_CRAFTS.tools,
  landscape: Landscape | null = null,
  walk: MeadowWalk | null = null,
): HayMowing | null {
  const targets = mowingTargets(state, need, day);
  if (targets.cap <= EPSILON) return null;
  const parts = state.parts
    .filter((p) => isHayMeadow(p, day))
    .map((p): HaySquare => ({ partId: p.id, areaM2: p.areaM2, distanceM: partWalkDistance(p) }));
  const meadows = naturalMeadows(state, landscape);
  if (walk && meadows.length > 0) {
    walkMeadows(meadows, parts, targets.cap, walk, fastestWalkShare(state.roads?.roads));
  }
  const candidates: HaySquare[] = [
    ...parts,
    ...meadows.map(({ cell, areaM2, distanceM }): HaySquare => ({
      cell,
      areaM2,
      distanceM: roundDistance(distanceM),
    })),
  ].sort(byDistance);
  const plan = mowingPlan(candidates, targets, hayWorkPerHa(toolCoverage), HAY.yieldKgPerHa);
  return plan ? { ...plan, done: 0 } : null;
}

/**
 * Plán otavy (1. 8. – oxen.md, Seno, dvě seče): louky, které se letos posekly v 1. seči (u
 * rozpracované jen posečená část), v pořadí 1. seče; seče se (`wanted`), dokud otava
 * (`aftermathYieldShare`) nepokryje, co stádům ze stropu chybí (`need` bez dnešní zásoby) – zbytek
 * luk zůstane pro dobytek, který přibude (`raiseAftermath`). Práce na hektar `aftermathWorkShare`
 * 1. seče. Bez 1. seče, posečených luk nebo potřeby null – 1. seč pak zůstane.
 */
export function planAftermath(
  state: VillageState,
  need: MowingNeed,
  toolCoverage: number = NO_CRAFTS.tools,
  day: number | null = null,
): HayMowing | null {
  const first = state.hay?.mowing;
  if (!first || mowingCut(first) !== 1) return null;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const mown = mownSquares(first, partsById);
  if (mown.length === 0) return null;
  const firstCut = {
    partIds: mown.flatMap((sq) => (sq.partId === undefined ? [] : [sq.partId])),
    naturalM2: mown.reduce((sum, sq) => sum + (sq.partId === undefined ? sq.areaM2 : 0), 0),
    yieldKg: Math.min(
      first.yieldKg,
      (first.yieldKg * first.done) / Math.max(EPSILON, first.required),
    ),
  };
  const aftermath = { cut: 2 as const };
  const targets = mowingTargets(state, need, day);
  if (targets.cap <= EPSILON) return null;
  // v seči jsou všechny posečené louky – strop práce `wanted` se zvedne, přibude-li dobytek
  // (`raiseAftermath`)
  const plan = mowingPlan(
    mown,
    { necessary: targets.necessary, cap: Infinity },
    hayWorkPerHa(toolCoverage) * mowingWorkShare(aftermath),
    mowingYieldPerHa(aftermath),
  );
  if (!plan) return null;
  const mowing: HayMowing = { ...plan, done: 0, ...aftermath, firstCut };
  return { ...mowing, wanted: workForYield(mowing, partsById, targets.cap) };
}

/**
 * Práce seče od začátku (člověkodny), po které seno dosáhne `kg` – celé louky v pořadí seče jako
 * `mowingPlan`; víc, než louky dají, = celá seč.
 */
function workForYield(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
  kg: number,
): number {
  if (kg <= EPSILON) return 0;
  const perHa = mowingYieldPerHa(mowing);
  let yieldKg = 0;
  for (const span of squareSpans(mowing, partsById)) {
    yieldKg += (span.square.areaM2 / M2_PER_HA) * perHa;
    if (yieldKg >= kg - EPSILON) return mowing.required * span.end;
  }
  return mowing.required;
}

/**
 * Otava, když přibyl dobytek (oxen.md – Seno, dvě seče; koupený i na cestě): strop práce
 * (`wanted`) a nutná práce (`needed`) se zvednou podle dnešní potřeby (`need`) – posečená otava
 * a co stádům ještě chybí; nikdy neklesnou (mutuje stav). Mimo otavu nic.
 */
export function raiseAftermath(
  state: VillageState,
  need: MowingNeed,
  day: number | null = null,
): void {
  const mowing = state.hay?.mowing;
  if (!mowing || mowingCut(mowing) !== 2 || mowing.required <= EPSILON) return;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const targets = mowingTargets(state, need, day);
  const mown = (mowing.yieldKg * mowing.done) / mowing.required;
  const work = (kg: number): number => workForYield(mowing, partsById, mown + Math.max(0, kg));
  mowing.wanted = Math.max(mowing.wanted ?? mowing.required, work(targets.cap));
  mowing.needed = Math.max(mowing.needed ?? mowing.required, work(targets.necessary));
}

/**
 * Volná práce na seč (oxen.md – Stáda podle práce na seč; mutuje stav): práce dne `labor`, která
 * po polních pracích zbyla na seč (postup nutné seče – s vozy víc než práce, svoz – a co šlo dál:
 * stavby, seč navíc, nic), převedená na seno podle dnešní seče (kg na člověkoden plánu – i s chůzí na louky), bez ní podle práce na
 * hektar (`hayWorkPerHa`). V oknech 1. seče a otavy zvlášť; jen se zápisem sezóny (`mowFree`).
 */
export function recordMowingLabor(
  state: VillageState,
  day: number,
  labor: number,
  toolCoverage: number,
): void {
  const free = state.hay?.mowFree;
  if (!free || labor <= EPSILON) return;
  const cut = isMowingSeason(day, 1) ? 1 : isMowingSeason(day, 2) ? 2 : null;
  if (cut === null) return;
  const kind = cut === 2 ? { cut: 2 as const } : {};
  const mowing = state.hay?.mowing;
  const kgPerManDay =
    mowing && mowingCut(mowing) === cut && mowing.required > EPSILON
      ? mowing.yieldKg / mowing.required
      : mowingYieldPerHa(kind) / (hayWorkPerHa(toolCoverage) * mowingWorkShare(kind));
  if (cut === 1) free.first += labor * kgPerManDay;
  else free.second += labor * kgPerManDay;
}

/** Začátek sezóny seče (25. 5.) – zápis volné práce od nuly (mutuje stav; bez sena nic). */
export function startMowingSeason(state: VillageState): void {
  if (state.hay) state.hay.mowFree = { first: 0, second: 0 };
}

/**
 * Konec sezóny seče (po otavě – mutuje stav): kolik sena ves v obou oknech stihla posekat
 * (`mowCapacityKg`) – 1. seč a otava nejvýš `aftermathYieldShare` 1. seče (jen na jejích loukách).
 */
export function closeMowingSeason(state: VillageState): void {
  const hay = state.hay;
  const free = hay?.mowFree;
  if (!hay || !free) return;
  hay.mowCapacityKg = free.first + Math.min(free.second, free.first * HAY_CUTS.aftermathYieldShare);
  delete hay.mowFree;
}

/** Je den po konci okna otavy (`HAY_CUTS.second.to`)? – sezóna seče se uzavře. */
export function isAfterMowingSeason(day: number): boolean {
  const { month, day: d } = dateOfDayIndex(day);
  const { to } = HAY_CUTS.second;
  return month * 100 + d > to.month * 100 + to.day;
}

/** Seno (kg ze seče), které ves loni stihla posekat prací po polních pracích; bez zápisu undefined. */
export function mowingCapacityKg(state: Pick<VillageState, 'hay'>): number | undefined {
  return state.hay?.mowCapacityKg;
}

/** Posečené louky seče (díl, který už není, vypadne) – rozpracovaná jen posečenou plochou. */
function mownSquares(mowing: HayMowing, partsById: ReadonlyMap<number, FieldPart>): HaySquare[] {
  const position = mowingPosition(mowing);
  return squareSpans(mowing, partsById).flatMap(({ square, start, end }) => {
    if (start + EPSILON >= position) return [];
    const share = end - start > EPSILON ? Math.min(1, (position - start) / (end - start)) : 1;
    return [{ ...square, areaM2: square.areaM2 * share }];
  });
}

/**
 * Díly přílohu, které se letos posekly (fields.md – Zarůstání): díly letošní seče, ke kterým
 * došla práce (i rozpracovaný). Bez seče žádné.
 */
export function mownPartIds(state: Pick<VillageState, 'hay' | 'parts'>): Set<number> {
  const mowing = state.hay?.mowing;
  if (!mowing) return new Set();
  const position = mowingPosition(mowing);
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  return new Set([
    // otava – díly posečené v 1. seči
    ...(mowing.firstCut?.partIds ?? []),
    ...mowingSpans(mowing, partsById)
      .filter((span) => span.partId !== undefined && span.start + EPSILON < position)
      .map((span) => span.partId!),
  ]);
}

/** Leží den v okně seče `cut` (1. seč 25. 5. – 30. 6., otava 1. 8. – 30. 9.)? */
export function isMowingSeason(day: number, cut: 1 | 2 = 1): boolean {
  const { month, day: d } = dateOfDayIndex(day);
  const { from, to } = cut === 2 ? HAY_CUTS.second : HAY_CUTS.first;
  const at = month * 100 + d;
  return at >= from.month * 100 + from.day && at <= to.month * 100 + to.day;
}

/** Zbývající práce seče (člověkodny); mimo okno její seče 0. */
export function mowingRemaining(state: VillageState, day: number): number {
  const mowing = state.hay?.mowing;
  if (!mowing || !isMowingSeason(day, mowingCut(mowing))) return 0;
  return Math.max(0, Math.min(mowing.required, mowing.wanted ?? mowing.required) - mowing.done);
}

/**
 * Zbývající práce seče na nutné seno (člověkodny – dnešní stádo; po polních pracích, před
 * stavbami); zbytek luk až z práce po stavbách. Seč uložená bez `needed` (před 24. 10. 2026) je
 * celá nutná. Mimo okno její seče 0.
 */
export function mowingNeededRemaining(state: VillageState, day: number): number {
  const mowing = state.hay?.mowing;
  if (!mowing || !isMowingSeason(day, mowingCut(mowing))) return 0;
  const wanted = Math.min(mowing.required, mowing.wanted ?? mowing.required);
  return Math.max(0, Math.min(wanted, mowing.needed ?? mowing.required) - mowing.done);
}

/**
 * Vloží práci do seče – posečené seno přibude do zásoby poměrně k práci (mutuje stav); seno roku
 * s ochranou luk (`mowingWeatherFactor` – disasters.md, Léto; bez `day` a bez počasí plný výnos).
 */
export function mow(state: VillageState, amount: number, day: number | null = null): void {
  const hay = state.hay;
  const mowing = hay?.mowing;
  if (!hay || !mowing || amount <= 0 || mowing.required <= 0) return;
  const before = mowing.done;
  mowing.done = Math.min(mowing.required, before + amount);
  const weather = day === null ? 1 : mowingWeatherFactor(state, day, mowing);
  hay.kg += (mowing.yieldKg * weather * (mowing.done - before)) / mowing.required;
}

/** Kolik práce seče je hotové 0–1 (bez práce 1). */
export function mowingPosition(mowing: HayMowing, done = mowing.done): number {
  return mowing.required > 0 ? Math.min(1, done / mowing.required) : 1;
}

/** Úsek louky v seči – díl úhoru (`partId`, `fieldId`), nebo políčko přirozené louky. */
export interface MowSpan {
  partId?: number;
  fieldId?: number;
  cell?: TileCell;
  start: number;
  end: number;
}

/** Louky seče v pořadí – seče uložené před přirozenými loukami mají jen díly. */
function mowingSquares(mowing: HayMowing, partsById: ReadonlyMap<number, FieldPart>): HaySquare[] {
  if (mowing.squares) return mowing.squares;
  return mowing.partIds.flatMap((id) => {
    const part = partsById.get(id);
    return part ? [{ partId: id, areaM2: part.areaM2, distanceM: partWalkDistance(part) }] : [];
  });
}

/** Louky seče s úsekem práce (od–do jako podíl) a polem dílu; díl, který už není, vypadne. */
function squareSpans(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
): { square: HaySquare; fieldId: number | undefined; start: number; end: number }[] {
  const weighted = mowingSquares(mowing, partsById).flatMap(
    (square): { square: HaySquare; fieldId: number | undefined; weight: number }[] => {
      if (square.partId !== undefined) {
        const part = partsById.get(square.partId);
        return part ? [{ square, fieldId: part.fieldId, weight: mowWeight(square) }] : [];
      }
      return [{ square, fieldId: undefined, weight: mowWeight(square) }];
    },
  );
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let start = 0;
  return weighted.map(({ square, fieldId, weight }) => {
    const end = total > 0 ? start + weight / total : 1;
    const span = { square, fieldId, start, end };
    start = end;
    return span;
  });
}

/** Úseky luk seče v pořadí (od–do jako podíl celé práce); díl, který už není, vypadne. */
export function mowingSpans(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
): MowSpan[] {
  return squareSpans(mowing, partsById).map(({ square, fieldId, start, end }): MowSpan => ({
    ...(square.partId === undefined ? {} : { partId: square.partId }),
    ...(fieldId === undefined ? {} : { fieldId }),
    ...(square.cell ? { cell: { x: square.cell.x, y: square.cell.y } } : {}),
    start,
    end,
  }));
}

/**
 * Louky, přes které dnes seč postoupila (z `before` do `after` člověkodní), s podílem dnešní
 * práce – pro postavy (labor-report.ts).
 */
export function mowingSquaresWorked(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
  before: number,
  after: number,
): (MowSpan & { share: number })[] {
  const from = mowingPosition(mowing, before);
  const to = mowingPosition(mowing, after);
  if (to - from <= EPSILON) return [];
  return mowingSpans(mowing, partsById).flatMap((span) => {
    const overlap = Math.min(to, span.end) - Math.max(from, span.start);
    return overlap > EPSILON ? [{ ...span, share: overlap / (to - from) }] : [];
  });
}

/**
 * Je den v zimě s krmením senem (listopad–březen; v dlouhé zimě – `longWinter` – i duben,
 * disasters.md – Zima)?
 */
export function isHayWinter(day: number, longWinter = false): boolean {
  const month = dateOfDayIndex(day).month;
  return (
    HAY_WINTER_MONTHS.includes(month) ||
    (longWinter && (WEATHER_EFFECTS.longWinterHayMonths as readonly number[]).includes(month))
  );
}

/**
 * Den zimního krmení (mutuje stav): voli dostanou seno první (orají), pak koně (`horsesKg` – jejich
 * dávka dne, horses.md – Krmení), krávy, ovce a kozy se podělí o zbytek poměrně k dávce
 * (HAY.dailyKg). Pamatuje si, kolik sena voli, koně a stádo potřebovali a dostali (`winter`; koně
 * jen ves s koňmi).
 */
export function feedHay(
  state: VillageState,
  oxen: number,
  herds: Readonly<Record<HerdSpecies, number>>,
  horsesKg = 0,
): void {
  const herdNeed = dailyHerdHayKg(herds);
  if (oxen <= 0 && herdNeed <= 0 && horsesKg <= 0 && !state.hay) return;
  const hay = (state.hay ??= { kg: 0, mowing: null });
  const winter = (hay.winter ??= { oxenNeedKg: 0, oxenEatenKg: 0 });
  const oxenNeed = oxen * HAY.dailyKg.ox;
  const oxenEaten = Math.min(hay.kg, oxenNeed);
  hay.kg -= oxenEaten;
  winter.oxenNeedKg += oxenNeed;
  winter.oxenEatenKg += oxenEaten;
  if (horsesKg > 0) {
    const horsesEaten = Math.min(hay.kg, horsesKg);
    hay.kg -= horsesEaten;
    winter.horsesNeedKg = (winter.horsesNeedKg ?? 0) + horsesKg;
    winter.horsesEatenKg = (winter.horsesEatenKg ?? 0) + horsesEaten;
  }
  const herdEaten = Math.min(hay.kg, herdNeed);
  hay.kg = Math.max(0, hay.kg - herdEaten);
  winter.herdNeedKg = (winter.herdNeedKg ?? 0) + herdNeed;
  winter.herdEatenKg = (winter.herdEatenKg ?? 0) + herdEaten;
}

/** Dní v březnu – zbytek zimy, se kterým počítá pokrytí sena k 1. 3. */
const MARCH_DAYS = 31;

/**
 * Pokrytí sena volů za zimu k 1. 3. (0–1): co dostali do včerejška a co jim ze zásoby zbývá na
 * březen, proti potřebě celé zimy. Bez volů (a bez zimy) 1.
 */
export function oxenHayCoverage(state: VillageState, oxen: number): number {
  const winter = state.hay?.winter;
  const march = oxen * HAY.dailyKg.ox * MARCH_DAYS;
  const need = (winter?.oxenNeedKg ?? 0) + march;
  if (need <= EPSILON) return 1;
  const eaten = (winter?.oxenEatenKg ?? 0) + Math.min(villageHayKg(state), march);
  return Math.min(1, eaten / need);
}

/**
 * Pokrytí sena koní za zimu k 1. 3. (0–1, horses.md – Krmení): co dostali do včerejška a co jim ze
 * zásoby po volech zbývá na březen (`horsesKg` – jejich dávka dne), proti potřebě celé zimy. Bez
 * koní 1.
 */
export function horsesHayCoverage(state: VillageState, oxen: number, horsesKg: number): number {
  const winter = state.hay?.winter;
  const march = horsesKg * MARCH_DAYS;
  const need = (winter?.horsesNeedKg ?? 0) + march;
  if (need <= EPSILON) return 1;
  const left = Math.max(0, villageHayKg(state) - oxen * HAY.dailyKg.ox * MARCH_DAYS);
  const eaten = (winter?.horsesEatenKg ?? 0) + Math.min(left, march);
  return Math.min(1, eaten / need);
}

/**
 * Pokrytí sena krav, ovcí a koz za zimu k 1. 3. (0–1, diet.md – Zimní úhyn): co dostaly do
 * včerejška a co jim ze zásoby po volech a koních (`horsesKg` – jejich dávka dne) zbývá na březen,
 * proti potřebě celé zimy (zima začatá před senem pro ovce a kozy počítá jen svůj zbytek). Bez
 * stáda 1.
 */
export function herdHayCoverage(
  state: VillageState,
  oxen: number,
  herds: Readonly<Record<HerdSpecies, number>>,
  horsesKg = 0,
): number {
  const winter = state.hay?.winter;
  const march = dailyHerdHayKg(herds) * MARCH_DAYS;
  const need = (winter?.herdNeedKg ?? 0) + march;
  if (need <= EPSILON) return 1;
  const left = Math.max(
    0,
    villageHayKg(state) - (oxen * HAY.dailyKg.ox + Math.max(0, horsesKg)) * MARCH_DAYS,
  );
  const eaten = (winter?.herdEatenKg ?? 0) + Math.min(left, march);
  return Math.min(1, eaten / need);
}
