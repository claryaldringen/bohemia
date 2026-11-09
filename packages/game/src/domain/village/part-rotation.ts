import { dateOfDayIndex, dayIndexOf } from '../calendar';
import { partYearWork, type PartYearWork } from './field-progress';
import {
  nextSowing,
  onTurn,
  rotateAfterSeason,
  sowingCropToday,
  type SowingKind,
} from './rotation';
import { FERTILITY } from './rules';
import type { Crop, FieldPart, VillageState } from './types';

// Co hráč vidí u dílu z osevního postupu (fields.md – Osevní postup po dílech a setí do konce
// okna, bod 6 – návrh Clauda): co na dílu poroste příště, kolikátý osev oběhu, úhor s odpočinkem
// k 95 % a díly na řadě. Jen čte stav – žádná náhoda, pravidla z `rotation.ts`.

/** Tolerance porovnání úrodnosti a práce. */
const EPSILON = 1e-9;
/** Nejdál dopředu, kam se hledá den, kdy plodina na dílu začne (o něco víc než rok). */
const LOOKAHEAD_DAYS = 400;

/** Co na dílu poroste příště – plodina, nebo úhor (příloh odpočívá). */
export type NextCrop = Crop | 'fallow';

/** Postup dílu pro panel (fields.md – Osevní postup po dílech, bod 6). */
export interface PartRotation {
  /**
   * Co na dílu poroste příště: nezasetá plodina letošní práce (i luštěniny a len), po zasetí to,
   * co přijde po sezóně (`rotateAfterSeason`), u dílu na řadě ozim či jař podle oken, jinak úhor.
   */
  next: NextCrop;
  /** Úhor: odpočinek k 95 % (podíl 0–1, setiny) a celé roky do osevu (≈). */
  rest?: { share: number; years: number };
  /** Díl letošní práce: kolikátý osev oběhu (1., 2.). */
  round?: number;
  /** Díl na řadě mimo letošní práci – čeká na ozim či jař. */
  onTurn?: true;
}

/** Úhor: odpočinek k `FERTILITY.fallowReady` a roky do osevu (příloh +2,5 % ročně 1. 9.). */
function restOf(part: FieldPart, extraYears: number): { share: number; years: number } {
  const share = Math.min(1, part.fertilityShare / FERTILITY.fallowReady);
  const missing = Math.max(0, FERTILITY.fallowReady - part.fertilityShare);
  const years = Math.max(1, Math.ceil(missing / FERTILITY.fallowRecovery - EPSILON) + extraYears);
  return { share: Math.round(share * 100) / 100, years };
}

/** Den dalšího 1. 9. (konec hospodářského roku) po dni `day`. */
function seasonEndAfter(day: number): number {
  const { year, month } = dateOfDayIndex(day);
  return dayIndexOf({ year: month >= 9 ? year + 1 : year, month: 9, day: 1 });
}

/**
 * Obilí, které na dílu postupu `kind` začne nejdřív ode dne `day` (`sowingCropToday` den po dni):
 * hotový díl ozim, dokud po dnešku zbývá den setí ozimu, potom jař, v létě zase ozim.
 */
function cropFrom(kind: SowingKind, day: number): 'winter' | 'spring' {
  for (let d = day; d < day + LOOKAHEAD_DAYS; d++) {
    const crop = sowingCropToday(kind, d);
    if (crop) return crop;
  }
  return kind === 'spring' ? 'spring' : 'winter';
}

/**
 * Postup dílů vsi pro panel v den `day` (díl id → postup); zakládané díly chybí. `yearWork` –
 * letošní práce dílů, když ji volající už má (`partYearWork`).
 */
export function partRotation(
  state: VillageState,
  day: number,
  yearWork: ReadonlyMap<number, PartYearWork> = partYearWork(state, day),
): Map<number, PartRotation> {
  const result = new Map<number, PartRotation>();
  const crops = new Map<string, 'winter' | 'spring'>();
  const cropOf = (kind: SowingKind, from: number): 'winter' | 'spring' => {
    const key = `${kind}:${from}`;
    const known = crops.get(key);
    if (known) return known;
    const crop = cropFrom(kind, from);
    crops.set(key, crop);
    return crop;
  };
  // díl, který čeká (hotový, po prvním osevu, příloh): na řadě s obilím, nebo úhor
  // `from` – od kdy se obilí hledá (zasetý díl až od začátku dalšího hospodářského roku)
  const waiting = (part: FieldPart, extraYears: number, from: number): PartRotation => {
    const kind = nextSowing(part);
    if (kind !== null && onTurn(kind)) return { next: cropOf(kind, from) };
    // opuštěný díl leží ladem napořád – odpočinek k osevu nemá (fields.md – Opuštěný díl)
    if (part.abandoned) return { next: 'fallow' };
    return { next: 'fallow', rest: restOf(part, extraYears) };
  };
  for (const part of state.parts) {
    if (part.state === 'founding') continue;
    if (part.state !== 'sown') {
      const shown = waiting(part, 0, day);
      result.set(part.id, shown.next === 'fallow' ? shown : { ...shown, onTurn: true });
      continue;
    }
    const work = yearWork.get(part.id);
    const crop = work?.crop;
    const round = { round: part.sownYears + 1 };
    if (crop && crop.sow < 1 - EPSILON && crop.harvest < 1 - EPSILON) {
      result.set(part.id, { next: crop.crop, ...round });
      continue;
    }
    // zaseto: co přijde po sezóně – postup na kopii dílu (stav se nemění)
    const after = { ...part };
    rotateAfterSeason(after, seasonEndAfter(day));
    // setí po sezóně proběhne až od 1. 9., ne dnes (jař v březnu by jinak ukázala jař místo ozimu)
    result.set(part.id, {
      ...waiting(after, 1, Math.max(day, seasonEndAfter(day))),
      ...round,
    });
  }
  return result;
}
