import { ageGroup, ageYears, canBear } from './people';
import {
  ADULT_DEATHS_PER_YEAR,
  ELDER_DEATHS_PER_YEAR,
  FOOD_NEED_KG_PER_YEAR,
  childDeathsPerYear,
  maritalFertility,
} from './rules';
import type { Person, VillageState } from './types';

// Výhled potřeby jídla podle růstu vsi (fields.md – Osev podle růstu vsi; Martin 19. 10. 2026:
// „Ano, udělej to všechno“, odhad návrh Clauda). Ves k 1. 9. seje úrodu, kterou bude jíst za rok
// a dva – do té doby děti dorostou (dospělý jí skoro dvakrát tolik co dítě), dospělí zestárnou
// a narodí se děti. Odhad je čistá funkce lidí a dne: dnešní lidé podle věku v každém měsíci
// období, ubývající podle běžné úmrtnosti skupiny, a děti dnešních manželských párů podle
// plodnosti věku ženy (population.md – Růst populace). Sňatky, stěhování, hlad a přeplnění
// nezná – je to jen výhled pro osev, simulace lidí se jím neřídí.

const DAYS_PER_YEAR = 365;
/** Krok výhledu (dní) – po měsících. */
const STEP_DAYS = 30;

/** Roční úmrtnost skupiny bez přeplnění, hygieny a hladu (population.md – Růst populace). */
function deathsPerYear(group: 'child' | 'adult' | 'elder'): number {
  if (group === 'child') return childDeathsPerYear();
  return group === 'adult' ? ADULT_DEATHS_PER_YEAR : ELDER_DEATHS_PER_YEAR;
}

/**
 * Průměrná roční potřeba energie vsi (kg obilí za rok) mezi dny `from` a `to` včetně podle výhledu
 * od dne `day` (dnešek – lidé, jak jsou dnes): lidé dorůstají a stárnou, ubývají běžnou úmrtností
 * a přibývají děti manželských párů (žena může rodit a manžel žije ve vsi). `from` = `to` = `day`
 * dá dnešní potřebu.
 */
export function expectedYearlyFoodNeed(
  state: Pick<VillageState, 'people'>,
  day: number,
  from: number,
  to: number,
): number {
  const people: readonly Person[] = state.people;
  if (people.length === 0) return 0;
  const end = Math.max(from, to);
  const index = new Map(people.map((p, i) => [p.id, i]));
  const husbands = people.map((p) =>
    p.spouseId === undefined ? -1 : (index.get(p.spouseId) ?? -1),
  );
  // pravděpodobnost, že člověk ještě žije, a očekávaný počet dětí narozených od dneška
  const alive = people.map(() => 1);
  let newborns = 0;
  let need = 0;
  let weight = 0;
  for (let t = day; t <= end; t += STEP_DAYS) {
    // krok [t, t + STEP_DAYS) – jeho část v období váží potřebou dne t
    const overlap = Math.min(t + STEP_DAYS, end + 1) - Math.max(t, from);
    if (overlap > 0) {
      let kg = newborns * FOOD_NEED_KG_PER_YEAR.child;
      people.forEach((p, i) => {
        kg += alive[i]! * FOOD_NEED_KG_PER_YEAR[ageGroup(p, t)];
      });
      need += kg * overlap;
      weight += overlap;
    }
    const years = STEP_DAYS / DAYS_PER_YEAR;
    // porody v kroku – oba rodiče ještě žijí (součin pravděpodobností)
    let births = 0;
    people.forEach((p, i) => {
      const husband = husbands[i]!;
      if (husband < 0 || !canBear(p, t)) return;
      births += alive[i]! * alive[husband]! * maritalFertility(ageYears(p.bornDay, t)) * years;
    });
    people.forEach((p, i) => {
      alive[i] = alive[i]! * (1 - deathsPerYear(ageGroup(p, t))) ** years;
    });
    newborns = newborns * (1 - deathsPerYear('child')) ** years + births;
  }
  return weight > 0 ? need / weight : 0;
}
