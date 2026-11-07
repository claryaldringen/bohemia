import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { secondaryWifeFamilies } from '../dynasty-housing';
import { familiesOf } from '../households';
import { removePeople } from '../kinship';
import { lordFamily } from '../lord';
import { weddingHome } from '../marriage';
import { advanceVillage } from '../simulate';
import { succeedLord, successorOf } from '../succession';
import type { Family } from '../households';
import type { Person, VillageState } from '../types';
import { DAY, trackedVillage, type KinSpec } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Nástupnictví (lord.md – Rod vojvody, Nástupnictví; Martin 24. 10. 2026 – „Nejstarší syn se
// vrátí“, nástupcem syn hlavní manželky). Dvorec je obydlí 1 (zemnice o 6 místech), vojvoda 10.

const home = (s: VillageState, id: number): number | undefined =>
  s.people.find((p) => p.id === id)?.dwellingId;
const heads = (families: readonly Family[]): number[] => families.map((f) => f.people[0]!.id);
const son = (id: number, age: number, mother: number, extra: Partial<KinSpec> = {}): KinSpec => ({
  id,
  age,
  sex: 'male',
  mother,
  father: 10,
  ...extra,
});

/** Sledovaná ves s vojvodou 10 (hlavní 11 v dvorci); `main` – synové s příznakem hlavní manželky. */
function tracked(specs: KinSpec[], main: number[] = []): VillageState {
  const s = trackedVillage([
    { id: 10, age: 60, sex: 'male', spouse: 11 },
    { id: 11, age: 50, sex: 'female', spouse: 10 },
    ...specs,
  ]);
  for (const p of s.people) if (main.includes(p.id)) p.mainWifeSon = true;
  return s;
}

/** Vojvoda zemřel (kinship – `removePeople`) a proběhl krok nástupnictví. */
function afterDeath(s: VillageState): ReturnType<typeof succeedLord> {
  removePeople(s, new Set([10]));
  return succeedLord(s, DAY + 1);
}

describe('kdo nastoupí (successorOf)', () => {
  it('syn hlavní manželky i po její smrti, před starším synem vedlejší', () => {
    const s = tracked(
      [
        { id: 12, age: 40, sex: 'female', spouse: 10, home: 2 },
        son(20, 10, 99),
        son(21, 20, 12, { home: 2 }),
      ],
      [20],
    );
    expect(successorOf(s, 10)?.id).toBe(20);
  });

  it('bez syna hlavní manželky nejstarší syn vedlejší', () => {
    const s = tracked([
      { id: 12, age: 40, sex: 'female', spouse: 10, home: 2 },
      son(21, 15, 12, { home: 2 }),
      son(22, 20, 12, { home: 2 }),
    ]);
    expect(successorOf(s, 10)?.id).toBe(22);
  });

  it('bez syna nejstarší vnuk po meči (i po zemřelém otci), pak muž rodu', () => {
    const s = tracked([
      { id: 30, age: 12, sex: 'male', father: 24, home: 2 },
      { id: 31, age: 14, sex: 'male', father: 25, home: 2 },
      { id: 40, age: 55, sex: 'male', father: 5, home: 3 },
    ]);
    s.ancestors = [
      { id: 24, fatherId: 10 },
      { id: 25, fatherId: 40 },
    ];
    for (const p of s.people) if ([30, 31, 40].includes(p.id)) p.line = true;
    s.people = s.people.filter((p) => p.id !== 10);
    expect(successorOf(s, 10)?.id).toBe(30);
    s.people = s.people.filter((p) => p.id !== 30);
    // synovec 31 je mladší než bratr 40 – vnuk už není, nejstarší muž rodu
    expect(successorOf(s, 10)?.id).toBe(40);
  });
});

describe('succeedLord – nástup a stěhování', () => {
  it('dospělý syn se vrátí s hlavní manželkou a dětmi, vedlejší jen, vejde-li se', () => {
    const s = tracked(
      [
        son(20, 30, 11, { home: 2, spouse: 21 }),
        { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
        { id: 22, age: 26, sex: 'female', spouse: 20, home: 2 },
        { id: 23, age: 24, sex: 'female', spouse: 20, home: 2 },
        { id: 30, age: 6, sex: 'male', mother: 21, father: 20, home: 2 },
        { id: 31, age: 3, sex: 'female', mother: 22, father: 20, home: 2 },
        { id: 32, age: 2, sex: 'female', mother: 23, father: 20, home: 2 },
        { id: 33, age: 1, sex: 'female', mother: 23, father: 20, home: 2 },
      ],
      [20],
    );
    expect(afterDeath(s)).toEqual([{ day: DAY + 1, kind: 'lord' }]);
    expect(s.dynasty).toEqual({
      lordId: 20,
      lords: [
        { id: 10, fromDay: DAY, toDay: DAY + 1 },
        { id: 20, fromDay: DAY + 1 },
      ],
    });
    // dvorec: vdova 11 + vojvoda 20, hlavní 21, syn 30 = 4; vedlejší 22 se 31 (2) se vejde, 23 se
    // dvěma dětmi už ne – zůstává v domě 2
    expect([20, 21, 30, 22, 31].map((id) => home(s, id))).toEqual([1, 1, 1, 1, 1]);
    expect([23, 32, 33].map((id) => home(s, id))).toEqual([2, 2, 2]);
    expect(lordFamily(s, DAY + 1).lord?.id).toBe(20);
    expect(lordFamily(s, DAY + 1).wivesApart.map((w) => w.id)).toEqual([23]);
  });

  it('nezletilý vojvoda s matkou a sourozenci do 16 let; starší bratr zůstává', () => {
    const s = tracked(
      [
        { id: 12, age: 35, sex: 'female', spouse: 10, home: 2 },
        son(20, 10, 12, { home: 2 }),
        { id: 21, age: 12, sex: 'female', mother: 12, father: 10, home: 2 },
        son(22, 17, 12, { home: 2 }),
      ],
      [20],
    );
    afterDeath(s);
    expect(s.dynasty?.lordId).toBe(20);
    expect([20, 12, 21].map((id) => home(s, id))).toEqual([1, 1, 1]);
    expect(home(s, 22)).toBe(2);
    // matka nezletilého vojvody vede domácnost dvorce, vdova po vojvodovi 11 pracuje
    const f = lordFamily(s, DAY + 1);
    expect(f.household.map((p) => p.id)).toEqual([12, 21]);
    expect(f.others.map((p) => p.id)).toEqual([11]);
  });

  it('nástupce v dvorci (ženatý syn čeká na dům) se nestěhuje, vdovy zůstávají', () => {
    const s = tracked([
      { id: 12, age: 40, sex: 'female', spouse: 10 },
      son(20, 22, 11, { spouse: 21 }),
      { id: 21, age: 20, sex: 'female', spouse: 20 },
      son(22, 12, 12),
    ]);
    s.people.find((p) => p.id === 20)!.mainWifeSon = true;
    afterDeath(s);
    expect(s.dynasty?.lordId).toBe(20);
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    // bratr 22 v dvorci cvičí
    expect(lordFamily(s, DAY + 1).trainees.map((p) => p.id)).toEqual([20, 22]);
  });

  it('bez muže rodu lordId = null, kronika rodu uzavřená a rod ve vsi skončil', () => {
    const s = tracked([{ id: 21, age: 20, sex: 'female', mother: 11, father: 10 }]);
    expect(afterDeath(s)).toEqual([{ day: DAY + 1, kind: 'line-ended' }]);
    expect(s.dynasty).toEqual({
      lordId: null,
      lords: [{ id: 10, fromDay: DAY, toDay: DAY + 1 }],
      endedDay: DAY + 1,
    });
    expect(succeedLord(s, DAY + 2)).toEqual([]);
    expect(s.dynasty?.lords).toEqual([{ id: 10, fromDay: DAY, toDay: DAY + 1 }]);
  });
});

describe('dvorec po nástupu (lord.md – Nástupnictví, Synové po sňatku)', () => {
  it('bez vojvody v dvorci odcházejí všichni ženatí synové, i nejstarší', () => {
    const s = tracked([
      son(20, 25, 11, { spouse: 21 }),
      { id: 21, age: 23, sex: 'female', spouse: 20 },
      son(22, 22, 11, { spouse: 23 }),
      { id: 23, age: 20, sex: 'female', spouse: 22 },
    ]);
    removePeople(s, new Set([10]));
    s.dynasty!.lordId = null;
    expect(heads(familiesOf(s, s.dwellings[0]!, DAY))).toEqual([20, 22]);
  });

  it('přeplněný dvorec: napřed vdova s nejstarším synem (ne matka vojvody), pak vedlejší nového', () => {
    const s = tracked(
      [
        { id: 12, age: 38, sex: 'female', spouse: 10 },
        son(22, 15, 12),
        son(20, 30, 11, { spouse: 21, home: 2 }),
        { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
        { id: 24, age: 26, sex: 'female', spouse: 20, home: 2 },
        { id: 30, age: 1, sex: 'male', mother: 24, father: 20, home: 2 },
      ],
      [20],
    );
    afterDeath(s);
    // dvorec: 11, 12, 22, 20, 21 = 5; vedlejší 24 se synem se vejde až na 7 > 6 – zůstává v domě 2
    expect(home(s, 24)).toBe(2);
    s.people.find((p) => p.id === 24)!.dwellingId = 1;
    s.people.find((p) => p.id === 30)!.dwellingId = 1;
    expect(heads(secondaryWifeFamilies(s, s.dwellings[0]!, DAY + 1))).toEqual([12]);
  });

  it('matka nezletilého vojvody drží dvorec – ženich se přižení k ní', () => {
    const s = tracked([son(20, 10, 11)], [20]);
    s.people.push({ id: 50, bornDay: DAY - 30 * 366, dwellingId: 2, sex: 'male' });
    s.people.push({ id: 51, bornDay: DAY - 50 * 366, dwellingId: 2, sex: 'male' });
    removePeople(s, new Set([10]));
    succeedLord(s, DAY + 1);
    const mother = s.people.find((p) => p.id === 11)!;
    const groom = s.people.find((p) => p.id === 50)!;
    expect(weddingHome(s, DAY + 1, groom, mother)).toEqual({ mover: groom, dwellingId: 1 });
    groom.dwellingId = 1;
    groom.spouseId = 11;
    mother.spouseId = 50;
    // rodina s vojvodou z dvorce neodchází, matka vede domácnost i vdaná, ženich pracuje
    expect(familiesOf(s, s.dwellings[0]!, DAY + 1)).toEqual([]);
    const f = lordFamily(s, DAY + 1);
    expect(f.household.map((p) => p.id)).toEqual([11]);
    expect(f.others.map((p) => p.id)).toEqual([50]);
  });

  it('vojvoda se nepřižení k vdově, která drží dům – nevěsta jde do dvorce', () => {
    const s = tracked([{ id: 60, age: 30, sex: 'female', home: 2 }]);
    s.people.push({ id: 61, bornDay: DAY - 5 * 366, dwellingId: 2, sex: 'male', motherId: 60 });
    const lord = s.people.find((p) => p.id === 10)!;
    delete lord.spouseId;
    s.people = s.people.filter((p) => p.id !== 11);
    const bride = s.people.find((p) => p.id === 60)!;
    expect(weddingHome(s, DAY, lord, bride)).toEqual({ mover: bride, dwellingId: 1 });
  });
});

describe('determinismus přes smrt vojvody', () => {
  const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
  const START = at(601, 3, 1);
  const person = (id: number, years: number, sex: Person['sex'], extra: Partial<Person> = {}) =>
    ({
      id,
      bornDay: START - Math.ceil(years * 365.25) - 10,
      dwellingId: 1,
      sex,
      ...extra,
    }) satisfies Person;

  /** Ves před rodem: starý vojvoda s ženou, ženatý syn se ženou a vnukem, cizí pár. */
  function oldLordVillage(): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.constructions = [];
    s.people = [
      person(2, 88, 'male', { spouseId: 3 }),
      person(3, 60, 'female', { spouseId: 2 }),
      person(4, 30, 'male', { spouseId: 5, fatherId: 2, motherId: 3 }),
      person(5, 25, 'female', { spouseId: 4 }),
      person(6, 6, 'male', { fatherId: 4, motherId: 5 }),
      person(7, 30, 'male', { spouseId: 8 }),
      person(8, 25, 'female', { spouseId: 7 }),
    ];
    s.storesKg = 30_000;
    s.lastDay = START;
    s.nextId = 1000;
    // ves založená před lety – šťastná léta (bez úmrtí dospělých) už skončila
    s.foundedDay = START - 30 * 365;
    delete s.dynasty;
    return s;
  }

  it('vcelku = po kouscích a nástupcem je syn', () => {
    const end = START + 6 * 365;
    const whole = advanceVillage(oldLordVillage(), end, null);
    let pieces = oldLordVillage();
    for (let d = START + 53; d < end; d += 53) pieces = advanceVillage(pieces, d, null);
    pieces = advanceVillage(pieces, end, null);
    expect(pieces.people).toEqual(whole.people);
    expect(pieces.dynasty).toEqual(whole.dynasty);
    expect(pieces.chronicle).toEqual(whole.chronicle);
    expect(whole.dynasty?.lords.map((l) => l.id).slice(0, 2)).toEqual([2, 4]);
    expect(whole.chronicle.some((e) => e.kind === 'lord')).toBe(true);
  });
});
