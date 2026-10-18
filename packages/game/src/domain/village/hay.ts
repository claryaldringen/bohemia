import { dateOfDayIndex } from '../calendar';
import {
  length2,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
} from '../landscape';
import { distanceFactor, fallowStage, partWalkDistance } from './fields';
import { FASTEST_WALK_SHARE } from './paths/walking';
import type { WindowSegment } from './rules';
import type { FieldPart, HayMowing, HaySquare, HayState, TileCell, VillageState } from './types';

// Seno (oxen.md – Seno, diet.md – Dobytek): krávy a voli přes zimu (listopad–březen) sežerou
// ≈ 1,5 t sena na kus. Seno dává úhor ve fázi louky (≈ 1,5 t/ha); ves seče jen tolik, kolik
// stádo na zimu potřebuje – v červnu–červenci po loukách od obydlí jako polní práce (6 člověkodní
// na hektar). Seče se úhor ve fázi louky i přirozené louky krajiny do 600 m od vsi (Martin
// 18. 10. 2026: „měly by jít posekat všechny louky“), nejbližší napřed.

/**
 * oxen.md – Seno (návrh Clauda, Martin schválil): 1,5 t sena na kus za zimu (≈ 10 kg denně
 * listopad–březen), louka 1,5 t/ha, sečení, sušení a stohování 6 člověkodní/ha v červnu–červenci;
 * když chybí přes polovinu sena voli, jeden uhyne.
 */
export const HAY = {
  perHeadKg: 1500,
  dailyKgPerHead: 10,
  yieldKgPerHa: 1500,
  mowManDaysPerHa: 6,
  deathBelowCoverage: 0.5,
} as const;
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
  for (const part of state.parts) if (part.cell) taken.add(key(part.cell));
  for (const o of state.orchards ?? []) for (const sq of o.squares) taken.add(key(sq.cell));
  for (const c of state.cemeteries ?? []) for (const sq of c.squares) taken.add(key(sq.cell));
  for (const pen of state.pens ?? []) taken.add(key(pen.cell));
  for (const d of state.dwellings) if (d.plot) taken.add(key(d.plot.cell));
  for (const c of state.constructions) if (c.plot) taken.add(key(c.plot.cell));
  // les vsi už louka není (fields.md – Les vsi)
  for (const w of state.woods ?? []) taken.add(key(w.cell));
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
 * ležet v dosahu pokrytí potřeby: chůze je nejméně FASTEST_WALK_SHARE × přímá vzdálenost, takže
 * louka, která leží rovně dál než dosah ÷ ten podíl, se do seče nedostane. Když změřené louky
 * dosah prodlouží, dorovnají se další (nejvýš pár kol).
 */
function walkMeadows(
  meadows: (HaySquare & { x: number; z: number })[],
  parts: readonly HaySquare[],
  need: number,
  walk: MeadowWalk,
): void {
  const measured = new Set<HaySquare>();
  for (let round = 0; round < WALK_ROUNDS; round++) {
    const reach = coverDistance([...parts, ...meadows].sort(byDistance), need);
    const near = meadows.filter(
      (m) => !measured.has(m) && m.distanceM * FASTEST_WALK_SHARE <= reach,
    );
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
 * Plán seče (1. 6.): seno, které stádo na zimu potřebuje (`heads` kusů dobytka × 1,5 t) bez
 * zásoby, z luk od nejbližší k obydlí – dílů úhoru ve fázi louky a s krajinou i přirozených luk
 * (`naturalMeadows`) –, dokud úroda sena potřebu nepokryje. Vzdálenost je chůze po pěšinách jako
 * u polních prací: díly `partWalkDistance`, přirozené louky přes `walk` (bez něj rovně). Bez
 * potřeby nebo bez luk null.
 */
export function planMowing(
  state: VillageState,
  day: number,
  heads: number,
  landscape: Landscape | null = null,
  walk: MeadowWalk | null = null,
): HayMowing | null {
  const need = heads * HAY.perHeadKg - villageHayKg(state);
  if (need <= EPSILON) return null;
  const parts = state.parts
    .filter((p) => isHayMeadow(p, day))
    .map((p): HaySquare => ({ partId: p.id, areaM2: p.areaM2, distanceM: partWalkDistance(p) }));
  const meadows = naturalMeadows(state, landscape);
  if (walk && meadows.length > 0) walkMeadows(meadows, parts, need, walk);
  const candidates: HaySquare[] = [
    ...parts,
    ...meadows.map(({ cell, areaM2, distanceM }): HaySquare => ({
      cell,
      areaM2,
      distanceM: roundDistance(distanceM),
    })),
  ].sort(byDistance);
  const squares: HaySquare[] = [];
  let required = 0;
  let yieldKg = 0;
  for (const square of candidates) {
    if (yieldKg >= need - EPSILON) break;
    squares.push(square);
    required += mowWeight(square) * HAY.mowManDaysPerHa;
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
 * Den zimního krmení (mutuje stav): voli dostanou seno první (orají), krávy zbytek – každý kus
 * HAY.dailyKgPerHead. Pamatuje si, kolik sena voli potřebovali a dostali (`winter`).
 */
export function feedHay(state: VillageState, oxen: number, cows: number): void {
  if (oxen <= 0 && cows <= 0 && !state.hay) return;
  const hay = (state.hay ??= { kg: 0, mowing: null });
  const winter = (hay.winter ??= { oxenNeedKg: 0, oxenEatenKg: 0 });
  const oxenNeed = oxen * HAY.dailyKgPerHead;
  const oxenEaten = Math.min(hay.kg, oxenNeed);
  hay.kg -= oxenEaten;
  winter.oxenNeedKg += oxenNeed;
  winter.oxenEatenKg += oxenEaten;
  hay.kg = Math.max(0, hay.kg - Math.min(hay.kg, cows * HAY.dailyKgPerHead));
}

/** Dní v březnu – zbytek zimy, se kterým počítá pokrytí sena k 1. 3. */
const MARCH_DAYS = 31;

/**
 * Pokrytí sena volů za zimu k 1. 3. (0–1): co dostali do včerejška a co jim ze zásoby zbývá na
 * březen, proti potřebě celé zimy. Bez volů (a bez zimy) 1.
 */
export function oxenHayCoverage(state: VillageState, oxen: number): number {
  const winter = state.hay?.winter;
  const march = oxen * HAY.dailyKgPerHead * MARCH_DAYS;
  const need = (winter?.oxenNeedKg ?? 0) + march;
  if (need <= EPSILON) return 1;
  const eaten = (winter?.oxenEatenKg ?? 0) + Math.min(villageHayKg(state), march);
  return Math.min(1, eaten / need);
}
