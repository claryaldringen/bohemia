import { dateOfDayIndex } from '../calendar';
import { HAY_WINTER_MONTHS } from './hay';
import { ageGroup, ageYears } from './people';
import { AGE } from './rules';
import type { HerdSpecies, Person, VillageState } from './types';

// Pasáci (diet.md – Pasáci; Martin 19. 10. 2026: „jeden ovčák/pasák krav – zvládne kočírovat jen
// omezené stádo ne? Že třeba vesnice, kde mohou pást jen 2 malí kluci, nezvládne udržet stádo 100
// krav“). Jeden pasák uhlídá jen omezené stádo – dítě méně než dospělý. Pasou napřed děti od 7 let
// a starší lidé (jejich pasení se z práce vsi neodečítá – pasou při své malé práci, jako dosud), co
// nezvládnou, pasou dospělí – nejvýš jeden z domácnosti – ze společné práce (úloha `herding`
// v rozdělení práce dne, hned po dojení a péči o zvířata – stáda nepočkají). Krávy, voli, ovce
// a kozy se pasou od dubna do října (v zimě jsou v ohradě a u domů na seně), prasata v lese celý
// rok. Co přes rok nikdo neuhlídal, jde při porážce na maso (livestock.ts – `winterTargets`).

/**
 * diet.md – Pasáci (čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md):
 * kolik kusů uhlídá jeden dospělý pasák se psem (psa hra nevede – je v číslech, na raně
 * středověkých sídlištích jsou kosti psů běžné): krávy (i voli na pastvě) 40, ovce a kozy 100,
 * prasata v lese 50; dítě 7–13 let uhlídá 40 % toho, starší člověk 75 %; dospělý pase nejvýš jeden
 * z domácnosti (ostatní jsou na poli – rozhodnutí Clauda: bez stropu by velkou vesnici
 * neomezovalo nic, jen práce). Rozpětí v literatuře je velké (obecní pastýř pozdějších staletí
 * pásl stovky kusů), ale nezávisí na řemeslech – proto jedno číslo, ne meze.
 */
export const HERDING = {
  perHerder: { cow: 40, sheep: 100, goat: 100, pig: 50 },
  share: { olderChild: 0.4, adult: 1, elder: 0.75 },
  adultsPerHousehold: 1,
} as const satisfies {
  perHerder: Record<HerdSpecies, number>;
  share: { olderChild: number; adult: number; elder: number };
  adultsPerHousehold: number;
};

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Kolik pasáků (v dospělých – plných pasácích) stáda dnes potřebují: krávy, voli, ovce a kozy
 * mimo zimu, prasata celý rok.
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

/** Pasák bez práce vsi – dítě od 7 let nebo starší člověk – a jak velké stádo uhlídá (0–1). */
function freeHerderShare(person: Person, day: number): number {
  const group = ageGroup(person, day);
  if (group === 'elder') return HERDING.share.elder;
  if (group === 'child' && ageYears(person.bornDay, day) >= AGE.olderChild) {
    return HERDING.share.olderChild;
  }
  return 0;
}

/** Pasení dne – potřeba, kdo pase bez práce vsi a co zbude na dospělé. */
export interface HerdingDay {
  /** Potřeba pasáků (plných). */
  demand: number;
  /** Děti od 7 let a starší – kolik pasáků z nich je (plných). */
  free: number;
  /** Kolik dětí a starších dnes pase (lidí – pro postavy u stád). */
  freeHerders: { children: number; elders: number };
  /** Co musí pást dospělí (člověkodny ze společné práce – nejvýš jeden z domácnosti). */
  adults: number;
}

/**
 * Pasení dne: napřed děti od 7 let, pak starší lidé – jen kolik jich stáda potřebují; co
 * nezvládnou, zbude na dospělé – nejvýš jeden z každé z `households` domácností.
 */
export function herdingDay(
  state: Pick<VillageState, 'people' | 'livestock'>,
  day: number,
  oxen: number,
  households: number,
): HerdingDay {
  const herds = state.livestock?.herds;
  const demand = herds ? herdingDemand(herds, oxen, day) : 0;
  const freeHerders = { children: 0, elders: 0 };
  if (demand <= EPSILON) return { demand: 0, free: 0, freeHerders, adults: 0 };
  const shares = state.people
    .map((p) => freeHerderShare(p, day))
    .filter((share) => share > 0)
    // děti napřed (Martin – pasou děti), starší až po nich
    .sort((a, b) => a - b);
  let free = 0;
  for (const share of shares) {
    if (free >= demand - EPSILON) break;
    free += share;
    if (share === HERDING.share.elder) freeHerders.elders++;
    else freeHerders.children++;
  }
  const covered = Math.min(free, demand);
  const adults = Math.min(demand - covered, households * HERDING.adultsPerHousehold);
  return { demand, free: covered, freeHerders, adults: Math.max(0, adults) };
}

/**
 * Zapíše pasení dne do ročního součtu (mutuje stav – od porážky do porážky): potřeba a co děti,
 * starší a dospělí (`adultsWorked` člověkodní) uhlídali.
 */
export function recordHerding(
  state: VillageState,
  herding: HerdingDay,
  adultsWorked: number,
): void {
  const livestock = state.livestock;
  if (!livestock || herding.demand <= EPSILON) return;
  const year = (livestock.herding ??= { needDays: 0, watchedDays: 0 });
  year.needDays += herding.demand;
  year.watchedDays += Math.min(herding.demand, herding.free + Math.max(0, adultsWorked));
}

/** Podíl stáda, který pasáci od poslední porážky uhlídali (0–1; bez údaje 1). */
export function herdingCoverage(state: Pick<VillageState, 'livestock'>): number {
  const year = state.livestock?.herding;
  if (!year || year.needDays <= EPSILON) return 1;
  return Math.min(1, year.watchedDays / year.needDays);
}
