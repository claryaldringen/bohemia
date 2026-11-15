// Křestní jména lidí vsi (population.md – Jména; Martin 15. 11. 2026: „Kdyby měli jména všichni
// vesničané, bylo by to super“ – „Ano“): každý člověk má staročeské jméno podle pohlaví, bez
// příjmení. Dostane ho při narození, kdo přijde, při příchodu; jméno se pak nemění. Muži rodu mají
// jména svým postupem (lord.md – Jména, `dynasty-names.ts`) – muž rodu bez jména čeká na hráče.
// Čisté funkce bez I/O; náhoda jen ze seedu vsi a id člověka.
import { createRandom, deriveSeed } from '../../landscape/random';
import { cloneState } from '../core/clone';
import { FEMALE_NAMES, MALE_NAMES } from '../rules/rules-names';
import type { Person, VillageState } from '../types';

/**
 * Potřebuje jméno: nemá ho a není muž rodu – vojvodu a jeho syny pojmenuje hráč (lord.md – Kde se
 * jméno zadává), vnuci a synové pod správcem ho dostanou při narození z `generatedLineName`.
 */
export function needsPersonName(p: Person): boolean {
  return p.name === undefined && p.line !== true;
}

/** Jména, která ve vsi nosí žijící lidé. */
function namesTaken(people: readonly Person[]): Set<string> {
  const taken = new Set<string>();
  for (const p of people) if (p.name !== undefined) taken.add(p.name);
  return taken;
}

/** Jméno ze seznamu podle pohlaví losem ze seedu vsi a id – přednostně to, které není v `taken`. */
function pickName(
  seed: number,
  person: Pick<Person, 'id' | 'sex'>,
  taken: ReadonlySet<string>,
): string {
  const names = person.sex === 'female' ? FEMALE_NAMES : MALE_NAMES;
  const free = names.filter((n) => !taken.has(n));
  // víc žijících lidí jednoho pohlaví než jmen – libovolné ze seznamu
  const pool = free.length > 0 ? free : names;
  const roll = createRandom(deriveSeed(seed, `person-name:${person.id}`)).next();
  return pool[Math.floor(roll * pool.length)] ?? names[0] ?? '';
}

/**
 * Jméno pro člověka `person` (population.md – Jména): ze seznamu jeho pohlaví (`MALE_NAMES`,
 * `FEMALE_NAMES`), deterministicky ze seedu vsi a id člověka (vlastní proud – losy vsi se nemění),
 * přednostně jméno, které nenosí nikdo žijící ve vsi. Čistá funkce, nic nemění.
 */
export function personName(
  state: Pick<VillageState, 'people' | 'seed'>,
  person: Pick<Person, 'id' | 'sex'>,
): string {
  return pickName(state.seed, person, namesTaken(state.people));
}

/**
 * Dá jméno každému člověku vsi bez jména (`needsPersonName`) v pořadí id – lidé, kteří dnes přišli
 * (nevěsta a ženich z okolí, rodina od souseda, kněz, …), a lidé ve vsích uložených před jmény.
 * Mutuje stav; vrací, jestli někoho pojmenoval.
 */
export function nameUnnamed(state: VillageState): boolean {
  const unnamed = state.people.filter(needsPersonName);
  if (unnamed.length === 0) return false;
  const taken = namesTaken(state.people);
  for (const p of unnamed.sort((a, b) => a.id - b.id)) {
    p.name = pickName(state.seed, p, taken);
    taken.add(p.name);
  }
  return true;
}

/**
 * Převod `people-names` (population.md – Jména): lidé ve vsích uložených před jmény dostanou jméno
 * jednou při načtení (i ve vsi z dřívějška bez rodu). Jména mužů rodu se nemění. Idempotentní –
 * ves, kde jméno mají všichni, vrací týž objekt; vstupní stav nemění.
 */
export function withPeopleNames(state: VillageState): VillageState {
  if (!state.people.some(needsPersonName)) return state;
  const next = cloneState(state);
  nameUnnamed(next);
  return next;
}
