import { dateOfDayIndex } from '../calendar';
import { distanceFactor, fallowStage, partWalkDistance } from './fields';
import type { WindowSegment } from './rules';
import type { FieldPart, HayMowing, HayState, VillageState } from './types';

// Seno (oxen.md – Seno, diet.md – Dobytek): krávy a voli přes zimu (listopad–březen) sežerou
// ≈ 1,5 t sena na kus. Seno dává úhor ve fázi louky (≈ 1,5 t/ha); ves seče jen tolik, kolik
// stádo na zimu potřebuje – v červnu–červenci po dílech od obydlí jako polní práce (6 člověkodní
// na hektar). Louky na seno kolem vsi jsou zatím jen vzhled scény – seno dávají jen díly úhoru.

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
 * Váha dílu v seči – jeho práce (plocha × příplatek za vzdálenost chůze po pěšinách – paths.md),
 * jako u polních prací.
 */
function mowWeight(part: FieldPart): number {
  return (part.areaM2 / M2_PER_HA) * distanceFactor(partWalkDistance(part));
}

/**
 * Plán seče (1. 6.): seno, které stádo na zimu potřebuje (`heads` kusů dobytka × 1,5 t) bez
 * zásoby, z dílů úhoru ve fázi louky od nejbližšího k obydlí, dokud úroda sena potřebu nepokryje.
 * Bez potřeby nebo bez luk null.
 */
export function planMowing(state: VillageState, day: number, heads: number): HayMowing | null {
  const need = heads * HAY.perHeadKg - villageHayKg(state);
  if (need <= EPSILON) return null;
  const meadows = state.parts
    .filter((p) => isHayMeadow(p, day))
    .sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
  const partIds: number[] = [];
  let required = 0;
  let yieldKg = 0;
  for (const part of meadows) {
    if (yieldKg >= need - EPSILON) break;
    partIds.push(part.id);
    required += mowWeight(part) * HAY.mowManDaysPerHa;
    yieldKg += (part.areaM2 / M2_PER_HA) * HAY.yieldKgPerHa;
  }
  return partIds.length > 0 ? { partIds, required, done: 0, yieldKg } : null;
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
      .filter((span) => span.start + EPSILON < position)
      .map((span) => span.id),
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

/** Úseky dílů seče v pořadí (od–do jako podíl celé práce). */
export function mowingSpans(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
): { id: number; fieldId: number; start: number; end: number }[] {
  const weighted = mowing.partIds.flatMap((id) => {
    const part = partsById.get(id);
    return part ? [{ part, weight: mowWeight(part) }] : [];
  });
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let start = 0;
  return weighted.map(({ part, weight }) => {
    const end = total > 0 ? start + weight / total : 1;
    const span = { id: part.id, fieldId: part.fieldId, start, end };
    start = end;
    return span;
  });
}

/**
 * Díly, přes které dnes seč postoupila (z `before` do `after` člověkodní), s podílem dnešní
 * práce – pro postavy (labor-report.ts).
 */
export function mowingPartsWorked(
  mowing: HayMowing,
  partsById: ReadonlyMap<number, FieldPart>,
  before: number,
  after: number,
): { id: number; fieldId: number; share: number }[] {
  const from = mowingPosition(mowing, before);
  const to = mowingPosition(mowing, after);
  if (to - from <= EPSILON) return [];
  return mowingSpans(mowing, partsById).flatMap((span) => {
    const overlap = Math.min(to, span.end) - Math.max(from, span.start);
    return overlap > EPSILON
      ? [{ id: span.id, fieldId: span.fieldId, share: overlap / (to - from) }]
      : [];
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
