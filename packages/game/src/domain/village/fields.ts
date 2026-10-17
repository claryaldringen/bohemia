import { dateOfDayIndex } from '../calendar';
import {
  DISTANCE,
  FERTILITY,
  FOUNDING_COST_PER_HA,
  RECLAIM_COST_PER_HA,
  SEED_KG_PER_HA,
  YIELD_BASE_KG_PER_HA,
} from './rules';
import type { ChronicleEvent, FieldPart, FieldSurface } from './types';

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel při porovnání podílů úrodnosti. */
const EPSILON = 1e-9;
/** Po kolika letech přílohu se z dílu stane les (spec: „přes 15 let“). */
export const FOREST_AFTER_YEARS = 16;

/** Úrodnost dílu v daný den: přirozená × podíl + bonus po vymýcení lesa, nejvýš 100. */
export function effectiveFertility(part: FieldPart, day: number): number {
  const bonus =
    part.bonusUntilDay !== null && part.bonusUntilDay >= day ? FERTILITY.forestBonus : 0;
  return Math.min(100, part.naturalFertility * part.fertilityShare + bonus);
}

/** Hrubá úroda v kg na hektar podle úrodnosti (0–100). */
export function grossYieldPerHa(fertility: number): number {
  return YIELD_BASE_KG_PER_HA * (0.4 + (0.6 * fertility) / 100);
}

/** Násobek práce podle vzdálenosti od obydlí (+1 % za každých 10 m nad volnou vzdáleností). */
export function distanceFactor(distanceM: number): number {
  return 1 + ((Math.max(0, distanceM - DISTANCE.freeM) / 10) * DISTANCE.percentPer10M) / 100;
}

/** Celé kalendářní roky od `fallowSinceDay` do `day`; 0, pokud díl nikdy neležel v přílohu. */
export function fallowYears(part: FieldPart, day: number): number {
  if (part.fallowSinceDay === null) return 0;
  const since = dateOfDayIndex(part.fallowSinceDay);
  const now = dateOfDayIndex(day);
  const beforeAnniversary =
    now.month < since.month || (now.month === since.month && now.day < since.day);
  return Math.max(0, now.year - since.year - (beforeAnniversary ? 1 : 0));
}

/** Cena vymýcení hektaru zarostlého dílu v člověkodnech podle let přílohu. */
export function reclaimCostPerHa(years: number): number {
  const step = RECLAIM_COST_PER_HA.find((s) => years <= s.maxYears);
  return step?.cost ?? 0;
}

/** Cena založení dílu: povrch × hektary + překážky. */
export function partFoundingCost(
  surface: FieldSurface,
  areaM2: number,
  obstacleCost: number,
): number {
  return FOUNDING_COST_PER_HA[surface] * (areaM2 / M2_PER_HA) + obstacleCost;
}

/**
 * Konec hospodářského roku (1. 9.) pro jeden díl – mění ho na místě.
 * Vrací událost, pokud se díl právě změnil v les.
 */
export function endOfSeason(part: FieldPart, day: number): ChronicleEvent | null {
  if (part.state === 'sown') {
    part.fertilityShare -= FERTILITY.sowDepletion;
    part.sownYears += 1;
    if (part.fertilityShare < FERTILITY.sowableMin - EPSILON) {
      part.state = 'fallow';
      part.fallowSinceDay = day;
      part.sownYears = 0;
    }
    return null;
  }
  if (part.state === 'fallow') {
    part.fertilityShare = Math.min(1, part.fertilityShare + FERTILITY.fallowRecovery);
    if (fallowYears(part, day) === FOREST_AFTER_YEARS) {
      return { day, kind: 'part-became-forest', partId: part.id };
    }
  }
  return null;
}

/**
 * Vybere díly k osevu v pořadí ze spec: osetý (≥ 0,7), připravený, příloh ≥ 0,95
 * (nejmladší první), příloh ≥ 0,7 (nejúrodnější první). Přidává, dokud očekávaná čistá
 * úroda nepokryje cíl, a nepřekročí `maxHa`. Díly nemění.
 */
export function selectPartsToSow(
  parts: FieldPart[],
  targetKg: number,
  maxHa: number,
  day: number,
): FieldPart[] {
  const sowable = (p: FieldPart): boolean => p.fertilityShare >= FERTILITY.sowableMin - EPSILON;
  const full = (p: FieldPart): boolean => p.fertilityShare >= FERTILITY.fallowReady - EPSILON;
  const since = (p: FieldPart): number => p.fallowSinceDay ?? -Infinity;

  const byDistance = (a: FieldPart, b: FieldPart): number => a.distanceM - b.distanceM;
  const group1 = parts.filter((p) => p.state === 'sown' && sowable(p)).sort(byDistance);
  const group2 = parts.filter((p) => p.state === 'ready').sort(byDistance);
  const group3 = parts
    .filter((p) => p.state === 'fallow' && full(p))
    .sort((a, b) => since(b) - since(a) || byDistance(a, b));
  const group4 = parts
    .filter((p) => p.state === 'fallow' && sowable(p) && !full(p))
    .sort((a, b) => b.fertilityShare - a.fertilityShare || byDistance(a, b));

  const chosen: FieldPart[] = [];
  let net = 0;
  let ha = 0;
  for (const p of [...group1, ...group2, ...group3, ...group4]) {
    if (net >= targetKg) break;
    const partHa = p.areaM2 / M2_PER_HA;
    if (ha + partHa > maxHa + EPSILON) break;
    chosen.push(p);
    ha += partHa;
    net += (grossYieldPerHa(effectiveFertility(p, day)) - SEED_KG_PER_HA) * partHa;
  }
  return chosen;
}
