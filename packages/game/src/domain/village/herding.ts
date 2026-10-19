import { dateOfDayIndex } from '../calendar';
import { HAY_WINTER_MONTHS } from './hay';
import { ageGroup, ageYears } from './people';
import { AGE } from './rules';
import type { HerdSpecies, Person, VillageState } from './types';

// Pasáci (diet.md – Pasáci; Martin 19. 10. 2026: „jeden ovčák/pasák krav – zvládne kočírovat jen
// omezené stádo ne? Že třeba vesnice, kde mohou pást jen 2 malí kluci, nezvládne udržet stádo 100
// krav“; „Zvířata a pasáci – to obstarají výrostci, takže do práce je nemusíme počítat, jsou úplně
// bokem.“; „Když bude ve vsi málo vhodných dětí na pasení, tak to omezí i velikost stád.“). Pasou
// jen děti 7–13 let (výrostci) – nejsou v pracovní síle vsi; dospělí ani starší pasáky nejsou
// (návrh Clauda – zůstávají v práci vsi na polích a stavbách). Krávy, voli, ovce a kozy se pasou od
// dubna do října (v zimě jsou v ohradě a u domů na seně), prasata v lese celý rok. Co přes rok
// nikdo neuhlídal, jde při porážce na maso (livestock.ts – `winterTargets`).

/**
 * diet.md – Pasáci (čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md):
 * kolik kusů uhlídá jeden plný pasák se psem (psa hra nevede – je v číslech, na raně
 * středověkých sídlištích jsou kosti psů běžné): krávy (i voli na pastvě) 40, ovce a kozy 100,
 * prasata v lese 50; dítě 7–13 let uhlídá 40 % toho (`childShare`). Rozpětí v literatuře je velké
 * (obecní pastýř pozdějších staletí pásl stovky kusů), ale nezávisí na řemeslech – proto jedno
 * číslo, ne meze.
 */
export const HERDING = {
  perHerder: { cow: 40, sheep: 100, goat: 100, pig: 50 },
  childShare: 0.4,
} as const satisfies {
  perHerder: Record<HerdSpecies, number>;
  childShare: number;
};

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Kolik pasáků (plných) stáda dnes potřebují: krávy, voli, ovce a kozy mimo zimu, prasata celý
 * rok.
 */
export function herdingDemand(
  herds: Readonly<Record<HerdSpecies, number>>,
  oxen: number,
  day: number,
): number {
  const { perHerder } = HERDING;
  const pigs = herds.pig / perHerder.pig;
  if (HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month)) return pigs;
  return (
    pigs +
    (herds.cow + oxen) / perHerder.cow +
    herds.sheep / perHerder.sheep +
    herds.goat / perHerder.goat
  );
}

/** Výrostek 7–13 let – pase (a obstará zvířata), do práce vsi nejde. */
export function isYoungster(person: Person, day: number): boolean {
  return ageGroup(person, day) === 'child' && ageYears(person.bornDay, day) >= AGE.olderChild;
}

/** Pasení dne – potřeba a co výrostci uhlídají. */
export interface HerdingDay {
  /** Potřeba pasáků (plných). */
  demand: number;
  /** Kolik z potřeby výrostci pokryjí (plných pasáků, nejvýš `demand`). */
  free: number;
  /** Kolik výrostků dnes pase (lidí – pro postavy u stád). */
  freeHerders: { children: number };
}

/** Pasení dne: výrostci 7–13 let – jen kolik jich stáda potřebují. */
export function herdingDay(
  state: Pick<VillageState, 'people' | 'livestock'>,
  day: number,
  oxen: number,
): HerdingDay {
  const herds = state.livestock?.herds;
  const demand = herds ? herdingDemand(herds, oxen, day) : 0;
  if (demand <= EPSILON) return { demand: 0, free: 0, freeHerders: { children: 0 } };
  const youngsters = state.people.filter((p) => isYoungster(p, day)).length;
  const children = Math.min(youngsters, Math.ceil(demand / HERDING.childShare - EPSILON));
  const free = Math.min(demand, children * HERDING.childShare);
  return { demand, free, freeHerders: { children } };
}

/**
 * Zapíše pasení dne do ročního součtu (mutuje stav – od porážky do porážky): potřeba a co
 * výrostci uhlídali.
 */
export function recordHerding(state: VillageState, herding: HerdingDay): void {
  const livestock = state.livestock;
  if (!livestock || herding.demand <= EPSILON) return;
  const year = (livestock.herding ??= { needDays: 0, watchedDays: 0 });
  year.needDays += herding.demand;
  year.watchedDays += Math.min(herding.demand, herding.free);
}

/** Podíl stáda, který pasáci od poslední porážky uhlídali (0–1; bez údaje 1). */
export function herdingCoverage(state: Pick<VillageState, 'livestock'>): number {
  const year = state.livestock?.herding;
  if (!year || year.needDays <= EPSILON) return 1;
  return Math.min(1, year.watchedDays / year.needDays);
}
