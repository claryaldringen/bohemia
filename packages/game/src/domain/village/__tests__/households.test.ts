import { describe, expect, it } from 'vitest';
import {
  availableSettlers,
  familiesOf,
  leavingFamilies,
  loneSonOf,
  waitingHouseholds,
} from '../households';
import type { Person, VillageState } from '../types';
import { DAY, type KinSpec, couple, dwelling, kin, village } from './kin-fixtures';

// Domácnosti po rodinách (kinship.md – Domácnosti; population.md – Nové obydlí, Martin): novou
// domácnost zakládá ženatý syn se ženou, nejstarší ženatý syn zůstává (dědic), z přeplněného domu
// smí odejít svobodný nejstarší syn; dcery odcházejí sňatkem.

/** Rodiče (otec 10, matka 11) v domě 1. */
const parents = (fatherAge = 50, motherAge = 40): KinSpec[] =>
  couple({ id: 10, age: fatherAge }, { id: 11, age: motherAge });
const child = (
  id: number,
  age: number,
  sex: KinSpec['sex'],
  extra: Partial<KinSpec> = {},
): KinSpec => ({
  id,
  age,
  sex,
  mother: 11,
  father: 10,
  ...extra,
});
const ids = (people: Person[]): number[] => people.map((p) => p.id);
const build = (
  specs: KinSpec[],
  extra: Parameters<typeof village>[1] = [dwelling(1)],
): VillageState =>
  village(
    specs.map((k) => kin(k)),
    extra,
  );

describe('rodiny, které se mohou oddělit', () => {
  it('mladší ženatý syn se ženou a dětmi – nejstarší ženatý syn zůstává (dědic)', () => {
    const s = build([
      ...parents(),
      ...couple({ id: 20, age: 26, mother: 11, father: 10 }, { id: 21, age: 22 }),
      ...couple({ id: 30, age: 23, mother: 11, father: 10 }, { id: 31, age: 20 }),
      { id: 32, age: 2, sex: 'female', mother: 31, father: 30 },
      child(40, 15, 'male'),
    ]);
    const families = familiesOf(s, s.dwellings[0]!, DAY);
    expect(families.map((f) => ids(f.people))).toEqual([[30, 31, 32]]);
  });

  it('jediný ženatý syn je dědic – nikdo neodchází; bez dětí rodičů starší ženatí bratři ano', () => {
    const heir = build([
      ...parents(),
      ...couple({ id: 20, age: 26, mother: 11, father: 10 }, { id: 21, age: 22 }),
    ]);
    expect(leavingFamilies(heir, DAY)).toEqual([]);
    // rodiče zemřeli – ženatí bratři v plném domě (6 lidí): zůstává starší, mladší se oddělí
    const brothers = build([
      ...couple({ id: 20, age: 30, mother: 91, father: 90 }, { id: 21, age: 27 }),
      ...couple({ id: 30, age: 26, mother: 91, father: 90 }, { id: 31, age: 24 }),
      { id: 40, age: 4, sex: 'male', mother: 21, father: 20 },
      { id: 41, age: 2, sex: 'female', mother: 31, father: 30 },
    ]);
    expect(leavingFamilies(brothers, DAY).map((f) => ids(f.people))).toEqual([[30, 31, 41]]);
  });

  it('vedle dědice smí odejít i ženatý muž bez rodičů v domě (Vlkov – přeplněný dvorec)', () => {
    // vdova s ženatým synem (dědic) a ženatý muž s neznámými rodiči (starší ves) – ten odejde
    const s = build([
      { id: 11, age: 50, sex: 'female' },
      ...couple({ id: 20, age: 20, mother: 11 }, { id: 21, age: 22 }),
      { id: 22, age: 3, sex: 'male', mother: 21, father: 20 },
      ...couple({ id: 30, age: 25 }, { id: 31, age: 25 }),
      { id: 32, age: 4, sex: 'male', mother: 31, father: 30 },
    ]);
    expect(familiesOf(s, s.dwellings[0]!, DAY).map((f) => ids(f.people))).toEqual([[30, 31, 32]]);
    expect(availableSettlers(s, DAY)).toBe(1);
  });

  it('otec dědice zůstává s ním – rodiče se neoddělí', () => {
    const s = build([
      ...parents(),
      ...couple({ id: 20, age: 26, mother: 11, father: 10 }, { id: 21, age: 22 }),
      child(40, 12, 'female'),
      child(41, 10, 'female'),
    ]);
    expect(familiesOf(s, s.dwellings[0]!, DAY)).toEqual([]);
  });

  it('z neplného domu žádná rodina – lidé k osídlení jen z plné domácnosti', () => {
    // dva páry ve 4 lidech v zemnici pro 6 – jako zakladatelé, když se jejich děti vezmou
    const notFull = build([
      ...couple({ id: 20, age: 30, mother: 91, father: 90 }, { id: 21, age: 27 }),
      ...couple({ id: 30, age: 26, mother: 91, father: 90 }, { id: 31, age: 24 }),
    ]);
    expect(familiesOf(notFull, notFull.dwellings[0]!, DAY)).toHaveLength(1);
    expect(leavingFamilies(notFull, DAY)).toEqual([]);
    expect(availableSettlers(notFull, DAY)).toBe(0);
  });

  it('z plného domu odejde jen tolik rodin, dokud dům zůstává plný – obvykle jedna', () => {
    // tři páry v plné zemnici: po odchodu první rodiny zbydou 4 lidé, druhá už nejde
    const s = build([
      ...couple({ id: 20, age: 32, mother: 91, father: 90 }, { id: 21, age: 29 }),
      ...couple({ id: 30, age: 28, mother: 91, father: 90 }, { id: 31, age: 25 }),
      ...couple({ id: 40, age: 24, mother: 91, father: 90 }, { id: 41, age: 22 }),
    ]);
    expect(familiesOf(s, s.dwellings[0]!, DAY)).toHaveLength(2);
    expect(availableSettlers(s, DAY)).toBe(1);
  });

  it('rodina neodejde, když by se zbytek domácnosti rozpadl', () => {
    // dědic se ženou už jsou starší (47 a 46) – po odchodu mladší rodiny by zůstali jen starší
    const s = build([
      ...parents(75, 70),
      ...couple({ id: 20, age: 47, mother: 11, father: 10 }, { id: 21, age: 46 }),
      ...couple({ id: 30, age: 40, mother: 11, father: 10 }, { id: 31, age: 35 }),
    ]);
    expect(leavingFamilies(s, DAY)).toEqual([]);
  });
});

describe('svobodný syn smí odejít sám', () => {
  /** Zemnice přeplněná (7 lidí): rodiče, synové a malé děti. */
  const crowded = (motherAge: number, sons: KinSpec[]): VillageState =>
    build([
      ...parents(50, motherAge),
      ...sons,
      ...[50, 51, 52, 53, 54].slice(0, 5 - sons.length).map((id) => child(id, 5, 'female')),
    ]);

  it('nejstarší svobodný syn od 16 let z přeplněného domu', () => {
    const s = crowded(40, [child(20, 19, 'male'), child(21, 17, 'male')]);
    expect(loneSonOf(s, s.dwellings[0]!, DAY)?.id).toBe(20);
  });

  it('neplodní rodiče bez ženatého syna – nejstarší syn je dědic, odejde druhý', () => {
    const s = crowded(47, [child(20, 22, 'male'), child(21, 19, 'male')]);
    expect(loneSonOf(s, s.dwellings[0]!, DAY)?.id).toBe(21);
  });

  // Martin, 18. 10. 2026: „ať prázdný dům obsadí i plná domácnost“
  it('i z plného domu (6 lidí v zemnici) – z neplného ne; patnáctiletý ani dcery ne', () => {
    const full = build([
      ...parents(),
      child(20, 19, 'male'),
      child(21, 10, 'female'),
      child(22, 6, 'female'),
      child(23, 3, 'male'),
    ]);
    expect(loneSonOf(full, full.dwellings[0]!, DAY)?.id).toBe(20);
    expect(availableSettlers(full, DAY)).toBe(1);
    const roomy = build([...parents(), child(20, 19, 'male'), child(21, 10, 'female')]);
    expect(loneSonOf(roomy, roomy.dwellings[0]!, DAY)).toBeUndefined();
    const young = crowded(40, [child(20, 15, 'male')]);
    expect(loneSonOf(young, young.dwellings[0]!, DAY)).toBeUndefined();
    const daughters = crowded(40, [child(20, 19, 'female')]);
    expect(loneSonOf(daughters, daughters.dwellings[0]!, DAY)).toBeUndefined();
  });
});

describe('lidé k osídlení', () => {
  it('rodiny ženatých synů a svobodní synové plných domů, minus čekající obydlí', () => {
    const s = build(
      [
        // dům 1: dědic a mladší ženatý syn – jedna rodina
        ...parents(),
        ...couple({ id: 20, age: 26, mother: 11, father: 10 }, { id: 21, age: 22 }),
        ...couple({ id: 30, age: 23, mother: 11, father: 10 }, { id: 31, age: 20 }),
        // dům 2: přeplněný, svobodný syn 18
        ...couple({ id: 60, age: 45, home: 2 }, { id: 61, age: 40, home: 2 }),
        ...[18, 12, 10, 8, 5].map((age, i) => ({
          id: 70 + i,
          age,
          sex: i === 0 ? ('male' as const) : ('female' as const),
          home: 2,
          mother: 61,
          father: 60,
        })),
      ],
      [dwelling(1), dwelling(2)],
    );
    expect(availableSettlers(s, DAY)).toBe(2);
    expect(waitingHouseholds(s, DAY)).toBe(2);
    s.dwellings.push(dwelling(3));
    expect(availableSettlers(s, DAY)).toBe(1);
    s.constructions.push({
      id: 99,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 60,
      done: 0,
      dwellingType: 'zemnice',
      position: null,
      dwellingId: null,
      fieldId: null,
    });
    expect(availableSettlers(s, DAY)).toBe(0);
  });

  it('startovní ves (manželé a dvě děti) nikoho k osídlení nemá', () => {
    const s = build([...parents(25, 25), child(20, 13, 'male'), child(21, 12, 'female')]);
    expect(availableSettlers(s, DAY)).toBe(0);
  });
});
