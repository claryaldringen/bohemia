import { createRandom, deriveSeed } from '../../landscape/random';
import { AGE, LODGE, MASON_CRAFTS, MASTER_ORIGIN } from '../rules';
import type { ChronicleEvent, MasonCraft, Person, VillageState } from '../types';
import { removePeople } from './kinship';
import { villageHappiness } from './happiness';
import { ageYears } from './people';

// Odchod mistrů huti a noví mistři (stone-masonry.md – Svoboda, rodina a odchod, Zkušenost a noví
// mistři). Ves bez huti nic z toho nepočítá a nelosuje.

/** Domácnost mistra: manželka a jejich svobodné děti v jeho obydlí. */
export function masterHousehold(state: VillageState, master: Person): Person[] {
  const spouse = state.people.find((p) => p.id === master.spouseId);
  const parents = new Set([master.id, ...(spouse ? [spouse.id] : [])]);
  const children = state.people.filter(
    (p) =>
      p.spouseId === undefined &&
      p.dwellingId === master.dwellingId &&
      ((p.fatherId !== undefined && parents.has(p.fatherId)) ||
        (p.motherId !== undefined && parents.has(p.motherId))),
  );
  return [master, ...(spouse ? [spouse] : []), ...children];
}

/** Má mistr ve vsi manželku nebo dítě? */
function hasFamily(state: VillageState, master: Person): boolean {
  return state.people.some(
    (p) => p.id === master.spouseId || p.fatherId === master.id || p.motherId === master.id,
  );
}

/**
 * Den odchodu mistrů (mutuje stav; `foodCoverage` = dnešní pokrytí potřeby jídla vsi (energie, bez kvality stravy)). Počítadla `lodge.hungryDays`
 * a `lodge.unhappyDays` rostou, dokud pokrytí jídla (`LODGE.leaving.foodBelow`) a štěstí vsi
 * (`happinessBelow`) zůstávají pod mezí, jinak se vynulují. Po dosažení `hungryDays` nebo
 * `unhappyDays` rozhodne jeden los na mistra (ze seedu vsi, id mistra a dne – nezávisí na kouscích
 * dopočtu): bez manželky a dětí ve vsi odchází vždy, jinak s šancí `familyChance`; odchází s celou
 * domácností (`removePeople` s emigranty) a kronika to zapíše. Počítadla se po losu vynulují
 * (mistr, který zůstal, dostane další los až po další mezi). Ves bez huti nic.
 */
export function lodgeLeavingDay(state: VillageState, foodCoverage: number, day: number): void {
  const lodge = state.lodge;
  if (lodge === undefined) return;
  // bez mistrů ve vsi není kdo by odcházel – počítadla se nevedou (mistr, který právě dorazil, začíná od nuly)
  const present = state.people.some((p) => p.mason !== undefined);
  const hungry =
    present && foodCoverage < LODGE.leaving.foodBelow ? (lodge.hungryDays ?? 0) + 1 : 0;
  const unhappy =
    present && villageHappiness(state) < LODGE.leaving.happinessBelow
      ? (lodge.unhappyDays ?? 0) + 1
      : 0;
  const due = hungry >= LODGE.leaving.hungryDays || unhappy >= LODGE.leaving.unhappyDays;
  const rest = {
    circle: lodge.circle,
    invitedDay: lodge.invitedDay,
    ...(lodge.arriving === undefined ? {} : { arriving: lodge.arriving }),
  };
  if (!due) {
    state.lodge = {
      ...rest,
      ...(hungry > 0 ? { hungryDays: hungry } : {}),
      ...(unhappy > 0 ? { unhappyDays: unhappy } : {}),
    };
    return;
  }
  state.lodge = rest;
  const leaving = new Set<number>();
  const events: ChronicleEvent[] = [];
  const masters = state.people.filter((p) => p.mason !== undefined).sort((a, b) => a.id - b.id);
  for (const master of masters) {
    const random = createRandom(deriveSeed(state.seed, `lodge-leave:${master.id}:${day}`));
    const roll = random.next();
    if (hasFamily(state, master) && roll >= LODGE.leaving.familyChance) continue;
    const household = masterHousehold(state, master);
    for (const p of household) leaving.add(p.id);
    events.push({
      day,
      kind: 'master-left',
      craft: master.mason!,
      people: household.length,
      ...(master.name === undefined ? {} : { name: master.name }),
    });
  }
  if (leaving.size === 0) return;
  const direction = MASTER_ORIGIN[lodge.circle];
  removePeople(state, leaving, new Map([...leaving].map((id) => [id, direction])));
  state.chronicle.push(...events);
}

/** Zkušenost osoby v oboru (čd). */
function xpOf(p: Person, craft: MasonCraft): number {
  return p.masonryXp?.[craft] ?? 0;
}

/**
 * Noví mistři (mutuje stav): za každý obor bez živého mistra (ani na cestě) se mistrem stane
 * dospělý (od `AGE.fertile` let) bez `mason` a kněžství s nejvyšší zkušeností v oboru, nejméně
 * `LODGE.masterXpManDays`; při shodě nižší id. Jeden člověk je mistrem jen jednoho oboru. Kronika
 * zapíše nového mistra. Ves bez huti nic.
 */
export function promoteMasters(state: VillageState, day: number): void {
  const lodge = state.lodge;
  if (lodge === undefined) return;
  for (const craft of MASON_CRAFTS) {
    if (state.people.some((p) => p.mason === craft)) continue;
    if ((lodge.arriving ?? []).some((a) => a.role === craft)) continue;
    let best: Person | undefined;
    for (const p of state.people) {
      if (p.mason !== undefined || p.priest === true) continue;
      if (ageYears(p.bornDay, day) < AGE.fertile || xpOf(p, craft) < LODGE.masterXpManDays)
        continue;
      const better =
        best === undefined ||
        xpOf(p, craft) > xpOf(best, craft) ||
        (xpOf(p, craft) === xpOf(best, craft) && p.id < best.id);
      if (better) best = p;
    }
    if (best === undefined) continue;
    best.mason = craft;
    state.chronicle.push({
      day,
      kind: 'master-promoted',
      craft,
      ...(best.name === undefined ? {} : { name: best.name }),
    });
  }
}

/** Den mistrů huti ve vsi – odchod a noví mistři (volá se na konci dne po jídle a štěstí). */
export function lodgeLifeDay(state: VillageState, foodCoverage: number, day: number): void {
  if (state.lodge === undefined) return;
  lodgeLeavingDay(state, foodCoverage, day);
  promoteMasters(state, day);
}

/**
 * Učni mistra (stone-masonry.md – Svoboda, rodina a odchod): synové v domácnosti mistra od
 * `LODGE.apprenticeFromAge` let, kteří ještě nejsou mistry. Zkušenost jim přidá práce huti.
 */
export function masonApprentices(
  state: VillageState,
  master: Person,
  day: number = state.lastDay,
): readonly Person[] {
  return state.people.filter(
    (p) =>
      p.sex === 'male' &&
      p.mason === undefined &&
      p.fatherId === master.id &&
      p.dwellingId === master.dwellingId &&
      ageYears(p.bornDay, day) >= LODGE.apprenticeFromAge,
  );
}
