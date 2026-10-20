import { dateOfDayIndex } from '../calendar';
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
import type { WindowSegment } from './rules';
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
// louky“) – ≈ 1,5 t/ha; ves seče jen tolik, kolik zimní stádo potřebuje, nejbližší louky napřed,
// v červnu–červenci jako polní práce (seč, sušení, svoz a stohování 10–15 člověkodní na hektar).
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

/** Seno na zimu (kg) – stáda a voli celou zimu po denní dávce (bez ztrát ve stohu). */
export function winterHayKg(herds: Readonly<Record<HerdSpecies, number>>, oxen: number): number {
  return dailyHerdHayKg(herds) * HAY_WINTER_DAYS + oxen * HAY.dailyKg.ox * HAY_WINTER_DAYS;
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
/** Okno sečení (červen–červenec) – práce se plánuje 1. 6. */
export const MOWING_WINDOWS: readonly WindowSegment[] = [[6, 7]];
export const MOWING_DAY = { month: 6, day: 1 } as const;
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
 * Plán seče (1. 6.): seno, které zimní stádo potřebuje (`needKg` – `winterHayKg`), se ztrátou ve
 * stohu do zkrmení a bez zásoby, z luk od nejbližší k obydlí – dílů úhoru ve fázi louky
 * a s krajinou i přirozených luk (`naturalMeadows`) –, dokud úroda sena potřebu nepokryje. Práce na hektar
 * podle pokrytí nástroji (kosy – `hayWorkPerHa`). Vzdálenost je chůze po pěšinách jako u polních
 * prací: díly `partWalkDistance`, přirozené louky přes `walk` (bez něj rovně). Bez potřeby nebo
 * bez luk null.
 */
export function planMowing(
  state: VillageState,
  day: number,
  needKg: number,
  toolCoverage: number = NO_CRAFTS.tools,
  landscape: Landscape | null = null,
  walk: MeadowWalk | null = null,
): HayMowing | null {
  const need = needKg / PLAN_HAY_KEEP - villageHayKg(state);
  if (need <= EPSILON) return null;
  const parts = state.parts
    .filter((p) => isHayMeadow(p, day))
    .map((p): HaySquare => ({ partId: p.id, areaM2: p.areaM2, distanceM: partWalkDistance(p) }));
  const meadows = naturalMeadows(state, landscape);
  if (walk && meadows.length > 0) {
    walkMeadows(meadows, parts, need, walk, fastestWalkShare(state.roads?.roads));
  }
  const candidates: HaySquare[] = [
    ...parts,
    ...meadows.map(({ cell, areaM2, distanceM }): HaySquare => ({
      cell,
      areaM2,
      distanceM: roundDistance(distanceM),
    })),
  ].sort(byDistance);
  const squares: HaySquare[] = [];
  const workPerHa = hayWorkPerHa(toolCoverage);
  let required = 0;
  let yieldKg = 0;
  for (const square of candidates) {
    if (yieldKg >= need - EPSILON) break;
    squares.push(square);
    required += mowWeight(square) * workPerHa;
    yieldKg += (square.areaM2 / M2_PER_HA) * HAY.yieldKgPerHa;
  }
  if (squares.length === 0) return null;
  const partIds = squares.flatMap((sq) => (sq.partId === undefined ? [] : [sq.partId]));
  return { partIds, squares, required, done: 0, yieldKg };
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
  return new Set(
    mowingSpans(mowing, partsById)
      .filter((span) => span.partId !== undefined && span.start + EPSILON < position)
      .map((span) => span.partId!),
  );
}

/** Leží měsíc dne v okně sečení? */
export function isMowingSeason(day: number): boolean {
  const { month } = dateOfDayIndex(day);
  return MOWING_WINDOWS.some(([from, to]) => month >= from && month <= to);
}

/** Zbývající práce seče (člověkodny); mimo okno sečení 0. */
export function mowingRemaining(state: VillageState, day: number): number {
  const mowing = state.hay?.mowing;
  if (!mowing || !isMowingSeason(day)) return 0;
  return Math.max(0, mowing.required - mowing.done);
}

/** Vloží práci do seče – posečené seno přibude do zásoby poměrně k práci (mutuje stav). */
export function mow(state: VillageState, amount: number): void {
  const hay = state.hay;
  const mowing = hay?.mowing;
  if (!hay || !mowing || amount <= 0 || mowing.required <= 0) return;
  const before = mowing.done;
  mowing.done = Math.min(mowing.required, before + amount);
  hay.kg += (mowing.yieldKg * (mowing.done - before)) / mowing.required;
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

/** Úseky luk seče v pořadí (od–do jako podíl celé práce); díl, který už není, vypadne. */
export function mowingSpans(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
): MowSpan[] {
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
    const span: MowSpan = {
      ...(square.partId === undefined ? {} : { partId: square.partId }),
      ...(fieldId === undefined ? {} : { fieldId }),
      ...(square.cell ? { cell: { x: square.cell.x, y: square.cell.y } } : {}),
      start,
      end,
    };
    start = end;
    return span;
  });
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

/** Je den v zimě s krmením senem (listopad–březen)? */
export function isHayWinter(day: number): boolean {
  return HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
}

/**
 * Den zimního krmení (mutuje stav): voli dostanou seno první (orají), krávy, ovce a kozy se
 * podělí o zbytek poměrně k dávce (HAY.dailyKg). Pamatuje si, kolik sena voli a stádo
 * potřebovali a dostali (`winter`).
 */
export function feedHay(
  state: VillageState,
  oxen: number,
  herds: Readonly<Record<HerdSpecies, number>>,
): void {
  const herdNeed = dailyHerdHayKg(herds);
  if (oxen <= 0 && herdNeed <= 0 && !state.hay) return;
  const hay = (state.hay ??= { kg: 0, mowing: null });
  const winter = (hay.winter ??= { oxenNeedKg: 0, oxenEatenKg: 0 });
  const oxenNeed = oxen * HAY.dailyKg.ox;
  const oxenEaten = Math.min(hay.kg, oxenNeed);
  hay.kg -= oxenEaten;
  winter.oxenNeedKg += oxenNeed;
  winter.oxenEatenKg += oxenEaten;
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
 * Pokrytí sena krav, ovcí a koz za zimu k 1. 3. (0–1, diet.md – Zimní úhyn): co dostaly do
 * včerejška a co jim ze zásoby po volech zbývá na březen, proti potřebě celé zimy (zima začatá
 * před senem pro ovce a kozy počítá jen svůj zbytek). Bez stáda 1.
 */
export function herdHayCoverage(
  state: VillageState,
  oxen: number,
  herds: Readonly<Record<HerdSpecies, number>>,
): number {
  const winter = state.hay?.winter;
  const march = dailyHerdHayKg(herds) * MARCH_DAYS;
  const need = (winter?.herdNeedKg ?? 0) + march;
  if (need <= EPSILON) return 1;
  const left = Math.max(0, villageHayKg(state) - oxen * HAY.dailyKg.ox * MARCH_DAYS);
  const eaten = (winter?.herdEatenKg ?? 0) + Math.min(left, march);
  return Math.min(1, eaten / need);
}
