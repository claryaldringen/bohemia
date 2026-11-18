import { dateOfDayIndex } from '../../calendar';
import { HAY_WINTER_MONTHS } from './hay';
import { lordTraineeIds } from '../people/lord';
import { ageGroup, ageYears, isAway } from '../people/people';
import { AGE } from '../rules';
import type { HerdSpecies, Person, VillageState } from '../types';

// Pasáci (diet.md – Pasáci; Martin 19. 10. 2026: „jeden ovčák/pasák krav – zvládne kočírovat jen
// omezené stádo ne? Že třeba vesnice, kde mohou pást jen 2 malí kluci, nezvládne udržet stádo 100
// krav“; „Zvířata a pasáci – to obstarají výrostci, takže do práce je nemusíme počítat, jsou úplně
// bokem.“; „Když bude ve vsi málo vhodných dětí na pasení, tak to omezí i velikost stád.“). Pasou
// děti 7–13 let (výrostci) – nejsou v pracovní síle vsi; starší pasáky nejsou. Dospělý pase, jen
// když ve vsi žádný výrostek není (Martin 2. 11. 2026 – dospělý pasák, když nejsou děti; čísla
// návrh Clauda): za jednoho výrostka, z práce vsi (`adultHerding`). Krávy, voli, ovce a kozy se
// pasou od dubna do října (v zimě jsou v ohradě a u domů na seně), prasata v lese celý rok. Co
// přes rok nikdo neuhlídal, jde při porážce na maso (livestock.ts – `winterTargets`).

/**
 * diet.md – Pasáci (čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md):
 * kolik kusů uhlídá jeden plný pasák se psem (psa hra nevede – je v číslech, na raně
 * středověkých sídlištích jsou kosti psů běžné): krávy (i voli na pastvě) 40, ovce a kozy 100,
 * prasata v lese 50; dítě 7–13 let uhlídá 40 % toho (`childShare`). Rozpětí v literatuře je velké
 * (obecní pastýř pozdějších staletí pásl stovky kusů), ale nezávisí na řemeslech – proto jedno
 * číslo, ne meze.
 *
 * diet.md – Pasáci, Dospělý pasák (Martin 2. 11. 2026; čísla návrh Clauda): ves bez výrostků pase
 * dospělým za jednoho výrostka – uhlídá nejvýš `adultShare` plného pasáka (jako výrostek, ať ves
 * s jedním dítětem nepase hůř než bez dětí) a stojí to tolik člověkodní práce vsi, kolik pase
 * (plný pasák = člověkoden; 3 krávy a 10 ovcí ≈ 0,18 člověkodne denně, nejvýš 0,4).
 */
export const HERDING = {
  perHerder: { cow: 40, sheep: 100, goat: 100, pig: 50 },
  childShare: 0.4,
  adultShare: 0.4,
} as const satisfies {
  perHerder: Record<HerdSpecies, number>;
  childShare: number;
  adultShare: number;
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
  // kdo je pryč (výprava od 12 let – expeditions.md), ves nepase, nepleje ani nehlídá
  return (
    ageGroup(person, day) === 'child' &&
    ageYears(person.bornDay, day) >= AGE.olderChild &&
    !isAway(person, day)
  );
}

/** Co pasení ze vsi potřebuje – lidé a vojvodova rodina (její synové nepasou). */
export type HerdingState = Pick<
  VillageState,
  'people' | 'manorId' | 'dwellings' | 'constructions' | 'lord'
>;

/**
 * Kolik výrostků 7–13 let bude ve vsi v den `day` (z dnešních lidí – i v budoucnu). Synové
 * cvičící vojvodovy rodiny nepasou (lord.md – Den rodiny); `busy` – kdo dnes pase nemůže.
 */
export function youngsterCount(
  state: HerdingState,
  day: number,
  busy: ReadonlySet<number> = new Set(),
): number {
  const family = lordTraineeIds(state, day);
  return state.people.filter((p) => isYoungster(p, day) && !busy.has(p.id) && !family.has(p.id))
    .length;
}

/**
 * Kolik plných pasáků výrostci vsi v den `day` dají (výrostek = HERDING.childShare) – kolik
 * potřeby pasáků (`herdingDemand`) uhlídají. Tatáž kapacita jako v pasení dne (`herdingDay`);
 * s budoucím dnem odhad z věku dnešních dětí (diet.md – Porážka v zimě, místo pro mláďata).
 */
export function youngsterHerders(state: HerdingState, day: number): number {
  return youngsterCount(state, day) * HERDING.childShare;
}

/**
 * Kolik plných pasáků ves v den `day` dá (diet.md – Pasáci, Dospělý pasák): výrostci, a když žádný
 * není, dospělý za jednoho výrostka (`HERDING.adultShare`). S budoucím dnem odhad z věku dnešních
 * dětí – místo pro mláďata (`youngRoomTargets`).
 */
export function herderCapacity(state: HerdingState, day: number): number {
  const youngsters = youngsterCount(state, day);
  return youngsters > 0 ? youngsters * HERDING.childShare : HERDING.adultShare;
}

/**
 * Kolik dnes pase dospělý (plných pasáků = člověkodní z práce vsi – diet.md, Pasáci, Dospělý
 * pasák): jen když ve vsi není výrostek (synové cvičící vojvodovy rodiny se nepočítají), co stáda
 * potřebují (i `oxen` voli na pastvě), nejvýš `HERDING.adultShare`. Vesničané to dělají sami – hráč nic nezadává.
 */
export function adultHerding(
  state: HerdingState & Pick<VillageState, 'livestock'>,
  day: number,
  oxen: number,
): number {
  const herds = state.livestock?.herds;
  if (!herds || youngsterCount(state, day) > 0) return 0;
  const demand = herdingDemand(herds, oxen, day);
  return demand > EPSILON ? Math.min(demand, HERDING.adultShare) : 0;
}

/** Pasení dne – potřeba a co výrostci uhlídají. */
export interface HerdingDay {
  /** Potřeba pasáků (plných). */
  demand: number;
  /** Kolik z potřeby výrostci pokryjí (plných pasáků, nejvýš `demand`). */
  free: number;
  /** Kolik výrostků dnes pase (lidí – pro postavy u stád). */
  freeHerders: { children: number };
  /**
   * Kusy, které ves letos v létě porazila (`LivestockState.summerSlaughtered`), jako by žily
   * (`summerHerding`): jejich potřeba pasáků, kolik z ní by uhlídali výrostci, kteří dnes
   * nepásli, a kolik by navíc pásl dospělý ve vsi bez výrostků. Bez letní porážky chybí.
   */
  summer?: { demand: number; free: number; adult: number };
}

/**
 * Pasení dne: výrostci 7–13 let – jen kolik jich stáda potřebují. Synové kováře, kteří dnes nosí
 * uhlí (`busy` – id; crafts.md – Uhlí a ruda kováře), ani synové cvičící vojvodovy rodiny
 * (lord.md – Den rodiny) nepasou. S kusy z letní porážky, jako by žily (`summerHerding`).
 */
export function herdingDay(
  state: HerdingState & Pick<VillageState, 'livestock'>,
  day: number,
  oxen: number,
  busy: ReadonlySet<number> = new Set(),
): HerdingDay {
  const herds = state.livestock?.herds;
  const demand = herds ? herdingDemand(herds, oxen, day) : 0;
  const today: HerdingDay = { demand: 0, free: 0, freeHerders: { children: 0 } };
  let youngsters: number | null = null;
  if (demand > EPSILON) {
    youngsters = youngsterCount(state, day, busy);
    const children = Math.min(youngsters, Math.ceil(demand / HERDING.childShare - EPSILON));
    today.demand = demand;
    today.free = Math.min(demand, children * HERDING.childShare);
    today.freeHerders.children = children;
  }
  const summer = summerHerding(
    state,
    day,
    today,
    () => youngsters ?? youngsterCount(state, day, busy),
  );
  return summer ? { ...today, summer } : today;
}

/**
 * Pasení kusů, které ves letos v létě porazila (`LivestockState.summerSlaughtered`), jako by žily
 * (diet.md – Strava po vrstvách a porážka celý rok; návrh Clauda): jejich potřeba pasáků, kolik
 * z ní by uhlídali výrostci, kteří dnes nepásli (`youngsters` – kolik jich dnes může pást), a kolik
 * by navíc pásl dospělý – jen ve vsi bez výrostků a nejvýš do HERDING.adultShare i s dnešním
 * stádem (jako `adultHerding`). Bez letní porážky null.
 */
function summerHerding(
  state: HerdingState & Pick<VillageState, 'livestock'>,
  day: number,
  today: HerdingDay,
  youngsters: () => number,
): HerdingDay['summer'] | null {
  const taken = state.livestock?.summerSlaughtered;
  if (!taken) return null;
  const heads = {
    sheep: taken.sheep ?? 0,
    goat: taken.goat ?? 0,
    pig: taken.pig ?? 0,
    cow: taken.cow ?? 0,
  };
  const demand = herdingDemand(heads, 0, day);
  if (demand <= EPSILON) return null;
  const spare = Math.max(0, youngsters() * HERDING.childShare - today.free);
  const { adultShare } = HERDING;
  const adult =
    youngsterCount(state, day) > 0
      ? 0
      : Math.max(
          0,
          Math.min(today.demand + demand, adultShare) - Math.min(today.demand, adultShare),
        );
  return { demand, free: Math.min(demand, spare), adult };
}

/**
 * Zapíše pasení dne do ročního součtu (mutuje stav – od porážky do porážky): potřeba a co
 * výrostci a dospělý (`adult` – kolik dnes z práce vsi opravdu pásl, plných pasáků) uhlídali.
 * Kusy z letní porážky zvlášť (`HerdingDay.summer` – `LivestockState.herding.summer`): dospělý by
 * je pásl stejným dílem své dnešní práce, jaký ves dala.
 */
export function recordHerding(state: VillageState, herding: HerdingDay, adult = 0): void {
  const livestock = state.livestock;
  if (!livestock) return;
  const given = Math.max(0, adult);
  if (herding.demand > EPSILON) {
    const year = (livestock.herding ??= { needDays: 0, watchedDays: 0 });
    year.needDays += herding.demand;
    year.watchedDays += Math.min(herding.demand, herding.free + given);
  }
  const summer = herding.summer;
  if (!summer || summer.demand <= EPSILON) return;
  const wanted = Math.min(herding.demand, HERDING.adultShare);
  const share = wanted > EPSILON ? Math.min(1, given / wanted) : 1;
  const year = (livestock.herding ??= { needDays: 0, watchedDays: 0 });
  const part = (year.summer ??= { needDays: 0, watchedDays: 0 });
  part.needDays += summer.demand;
  part.watchedDays += Math.min(summer.demand, summer.free + summer.adult * share);
}

/** Podíl stáda, který pasáci od poslední porážky uhlídali (0–1; bez údaje 1). */
export function herdingCoverage(state: Pick<VillageState, 'livestock'>): number {
  const year = state.livestock?.herding;
  if (!year || year.needDays <= EPSILON) return 1;
  return Math.min(1, year.watchedDays / year.needDays);
}

/**
 * Podíl stáda, který pasáci od poslední porážky uhlídali, ze stáda i s kusy, které ves letos
 * v létě porazila, jako by žily (0–1; bez údaje 1 – `LivestockState.herding.summer`): odhad zimy
 * počítá se stádem i s nimi (`winterKeepTargets`), tak i s jejich pasením – letní porážka tak
 * stádo přes zimu nezvětší (dřív podíl dnešního, menšího stáda – ves s málo pasáky si po letní
 * porážce nechala přes zimu o 15–25 % víc koz). Pastva a zarůstání dál podle dnešního stáda
 * (`herdingCoverage`).
 */
export function winterHerdingCoverage(state: Pick<VillageState, 'livestock'>): number {
  const year = state.livestock?.herding;
  if (!year) return 1;
  const need = year.needDays + (year.summer?.needDays ?? 0);
  if (need <= EPSILON) return 1;
  return Math.min(1, (year.watchedDays + (year.summer?.watchedDays ?? 0)) / need);
}
