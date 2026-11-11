// Společné součástky průvodů ve scéně – pohřbu (funeral-view.ts) a svatby (wedding-view.ts): kdo
// z vsi jde v průvodu, v jakém pořadí a deterministická náhoda z celých čísel. Jen zobrazení –
// pravidla simulace se nemění. Čistý modul na serveru.

import { ageYears, type Person, type Sex } from '@bohemia/game';

/**
 * Člověk vsi v průvodu: pohlaví, věk (roky) a domácnost (id obydlí), kam se pak vrátí; id člověka
 * (villagers.md – Výběr postavy – postava v průvodu je on; ukázky ho nemají).
 */
export interface ProcessionPerson {
  id?: number;
  sex: Sex;
  age: number;
  home: number;
}

/** Deterministická náhoda 0–1 z celých čísel. */
export function mix01(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function processionPersonOf(p: Person, day: number): ProcessionPerson {
  return {
    id: p.id,
    // vsi uložené před příbuzenstvím pohlaví nemají – střídavě podle id
    sex: p.sex ?? (p.id % 2 === 0 ? 'female' : 'male'),
    age: ageYears(p.bornDay, day),
    home: p.dwellingId,
  };
}

/** Pořadí, v jakém jdou lidé domácnosti: dospělí, pak starší, pak děti (každá skupina podle losu). */
export function byPriority(people: readonly Person[], day: number, seed: number): Person[] {
  const group = (p: Person): number => {
    const age = ageYears(p.bornDay, day);
    return age >= 14 && age < 60 ? 0 : age >= 60 ? 1 : 2;
  };
  return [...people].sort(
    (a, b) => group(a) - group(b) || mix01(seed, a.id, 5) - mix01(seed, b.id, 5) || a.id - b.id,
  );
}

/** Lidé vsi po domácnostech (podle id obydlí). */
export function peopleByHome(people: Iterable<Person>): Map<number, Person[]> {
  const homes = new Map<number, Person[]>();
  for (const p of people) {
    const list = homes.get(p.dwellingId);
    if (list) list.push(p);
    else homes.set(p.dwellingId, [p]);
  }
  return homes;
}

/**
 * Doplní `out` (až do `max` lidí) z domácností mimo `skip`: z každé jeden až dva lidé (los podle
 * `seed` – napřed dospělí), při `all` celá domácnost. Když je lidí víc, jde z domácností po jednom,
 * pak po druhém… (každá domácnost má v průvodu někoho, dokud to jde).
 */
export function fillFromOtherHomes(
  out: Person[],
  homes: ReadonlyMap<number, Person[]>,
  skip: ReadonlySet<number>,
  all: boolean,
  max: number,
  day: number,
  seed: number,
): void {
  const others = [...homes.entries()]
    .filter(([id]) => !skip.has(id))
    .sort((a, b) => a[0] - b[0])
    .map(([id, list]) => {
      const ordered = byPriority(list, day, seed + id);
      const count = all ? ordered.length : mix01(seed, id, 3) < 0.5 ? 1 : 2;
      return ordered.slice(0, count);
    });
  // z ostatních domácností po kolech – napřed první člověk z každé, pak druzí…
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const list of others) {
      const person = list[round];
      if (!person) continue;
      added = true;
      out.push(person);
      if (out.length >= max) break;
    }
    if (!added) break;
  }
}
