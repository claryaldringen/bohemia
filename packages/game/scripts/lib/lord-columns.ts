// Sloupce kalibrace pro vojvodovu rodinu a koně (docs/design/lord.md – Dopad na pracovní sílu,
// docs/design/horses.md): práce rodiny na rok, její podíl na práci vsi, koně a dny šetření.
// Jen měření ze stavu – žádné pravidlo hry. `measure-village.ts` je volá po každém kroku.
import {
  horseGrainToday,
  laborPerDay,
  trainingFamily,
  villageHorses,
  type VillageState,
} from '../../src/domain/village';
import { ageYears } from '../../src/domain/village/people';

/** Dovednosti cvičících mužů od 14 let na konci roku (průměr nejlepších hodnot a počet). */
export interface ArmsSnapshot {
  bow: number;
  combat: number;
  riding: number;
  men: number;
}

/** Měření jednoho roku (člověkodny, kg, dny). */
export interface LordYear {
  /** Práce rodiny, která cvičí (čd): výcvik, a když jde na pole (hlad), pole. */
  trainingCd: number;
  fieldCd: number;
  /** Kapacita cvičících mužů a domácnosti dvorce (čd) – podíl na kapacitě vsi je `familyCd / kapacita`. */
  familyCd: number;
  /** Koně × dny (průměr koní = horseDays / dny roku) a obilí koní (kg). */
  horseDays: number;
  horseGrainKg: number;
  /** Dny, kdy ves šetřila jídlem (`state.hungry`), a dny kroku celkem. */
  savingDays: number;
  days: number;
  arms: ArmsSnapshot | null;
}

export const EMPTY_LORD_YEAR: LordYear = {
  trainingCd: 0,
  fieldCd: 0,
  familyCd: 0,
  horseDays: 0,
  horseGrainKg: 0,
  savingDays: 0,
  days: 0,
  arms: null,
};

/** Přičte krok (`days` dní, stav na jeho konci) k měření roku; vrací nový objekt. */
export function addLordStep(
  year: LordYear | undefined,
  after: VillageState,
  days: number,
): LordYear {
  const out = { ...(year ?? EMPTY_LORD_YEAR) };
  const day = after.lastDay;
  const family = trainingFamily(after, day);
  if (family) {
    const cd =
      [...family.trainees, ...family.household].reduce((s, p) => s + laborPerDay(p, day), 0) * days;
    out.familyCd += cd;
    if (after.lord?.field) out.fieldCd += cd;
    else out.trainingCd += cd;
    const men = family.trainees.filter((p) => ageYears(p.bornDay, day) >= 14 && p.arms);
    out.arms = {
      bow: men.reduce((s, p) => s + (p.arms?.best?.bow ?? p.arms?.bow ?? 0), 0) / (men.length || 1),
      combat:
        men.reduce((s, p) => s + (p.arms?.best?.combat ?? p.arms?.combat ?? 0), 0) /
        (men.length || 1),
      riding:
        men.reduce((s, p) => s + (p.arms?.best?.riding ?? p.arms?.riding ?? 0), 0) /
        (men.length || 1),
      men: men.length,
    };
  }
  const horses = villageHorses(after);
  out.horseDays += horses.length * days;
  if (horses.length > 0 && !after.hungry && after.horsesFed !== false) {
    out.horseGrainKg += horseGrainToday(horses, day) * days;
  }
  if (after.hungry) out.savingDays += days;
  out.days += days;
  return out;
}

const fmt = (v: number, digits = 1): string => v.toFixed(digits).replace('.', ',');

/**
 * Řádek tabulky pro rody v ustáleném stavu: podíl práce rodiny na kapacitě vsi, výcvik a pole
 * (čd na ves a rok), koně, obilí koní, dny šetření a dovednosti. `capacity` = kapacita vsi stejných
 * let (čd).
 */
export function lordColumns(years: readonly LordYear[], capacity: number): string {
  const sum = (pick: (y: LordYear) => number): number => years.reduce((s, y) => s + pick(y), 0);
  const days = sum((y) => y.days);
  if (days === 0) return 'bez dat';
  const n = years.length;
  const withArms = years.flatMap((y) => (y.arms && y.arms.men > 0 ? [y.arms] : []));
  const arm = (pick: (a: ArmsSnapshot) => number): string =>
    withArms.length === 0
      ? '–'
      : fmt(withArms.reduce((s, a) => s + pick(a), 0) / withArms.length, 0);
  return [
    `podíl rodiny na kapacitě ${fmt((100 * sum((y) => y.familyCd)) / Math.max(1, capacity))} %`,
    `výcvik ${fmt(sum((y) => y.trainingCd) / n, 0)} čd, pole ${fmt(sum((y) => y.fieldCd) / n, 0)} čd na ves a rok`,
    `koní ${fmt(sum((y) => y.horseDays) / days)}, obilí koní ${fmt(sum((y) => y.horseGrainKg) / n, 0)} kg na rok`,
    `šetření jídlem ${fmt((100 * sum((y) => y.savingDays)) / days)} % dní`,
    `dovednosti mužů luk ${arm((a) => a.bow)} | boj ${arm((a) => a.combat)} | jízda ${arm((a) => a.riding)}`,
  ].join(' | ');
}
