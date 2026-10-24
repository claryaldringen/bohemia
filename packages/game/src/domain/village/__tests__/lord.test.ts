import { describe, expect, it } from 'vitest';
import { householdHead } from '../households';
import { armsCap, decayArms, familyTrains, lordFamily, trainArms, trainingHours } from '../lord';
import { LORD } from '../rules';
import type { ArmsSkills, Person } from '../types';
import { DAY, couple, dwelling, kin, village, type KinSpec } from './kin-fixtures';

// Vojvodova rodina a dovednosti (lord.md): čisté funkce, nic se nezapojuje do simulace.

const ids = (people: Person[]): number[] => people.map((p) => p.id).sort((a, b) => a - b);
const build = (specs: KinSpec[]): ReturnType<typeof village> =>
  village(
    specs.map((k) => kin(k)),
    [dwelling(1), dwelling(2)],
  );

/** Vojvoda 10 + žena 11, syn 16 (12), vnuk 8 (13, otec 12), dcera 14 (20), snacha (21, žena 12). */
const manorSpecs: KinSpec[] = [
  ...couple({ id: 10, age: 48 }, { id: 11, age: 44 }),
  { id: 12, age: 16, sex: 'male', mother: 11, father: 10, spouse: 21 },
  { id: 21, age: 15, sex: 'female', spouse: 12 },
  { id: 13, age: 8, sex: 'male', mother: 21, father: 12 },
  { id: 20, age: 14, sex: 'female', mother: 11, father: 10 },
];

describe('lordFamily', () => {
  it('vojvoda, syn a vnuk cvičí; žena, dcera a snacha jen domácnost', () => {
    const f = lordFamily(build(manorSpecs), DAY);
    expect(f.lord?.id).toBe(10);
    expect(ids(f.trainees)).toEqual([10, 12, 13]);
    expect(ids(f.household)).toEqual([11, 20, 21]);
    expect(f.others).toEqual([]);
  });

  it('zeť je others, pracuje jako dosud', () => {
    const f = lordFamily(
      build([
        ...manorSpecs,
        { id: 30, age: 22, sex: 'male', spouse: 31, origin: 'N' },
        { id: 31, age: 19, sex: 'female', spouse: 30, mother: 11, father: 10 },
      ]),
      DAY,
    );
    expect(ids(f.others)).toEqual([30]);
    expect(f.household.map((p) => p.id)).toContain(31);
  });

  it('syn, který se odstěhoval do jiného obydlí, rodinou není', () => {
    const f = lordFamily(
      build(
        manorSpecs.map((k) => (k.id === 12 || k.id === 21 || k.id === 13 ? { ...k, home: 2 } : k)),
      ),
      DAY,
    );
    expect(ids(f.trainees)).toEqual([10]);
    expect(ids(f.household)).toEqual([11, 20]);
  });

  it('chlapec pod 7 let ještě necvičí', () => {
    const f = lordFamily(
      build([...manorSpecs, { id: 14, age: 5, sex: 'male', mother: 21, father: 12 }]),
      DAY,
    );
    expect(ids(f.trainees)).toEqual([10, 12, 13]);
    expect(ids(f.others)).toEqual([14]);
  });

  it('bez dvorce nikdo', () => {
    const s = { ...build(manorSpecs), dwellings: [] };
    expect(lordFamily(s, DAY).lord).toBeNull();
  });
});

describe('trainingHours', () => {
  const hours = (age: number, horse: boolean, lord = false): ReturnType<typeof trainingHours> => {
    const p = kin({ id: 5, age, sex: 'male' });
    return trainingHours(p, DAY, lord ? p : null, horse);
  };
  it('chlapec 7–9 let: 2 h luk', () => {
    expect(hours(8, true)).toEqual({ bow: 2, combat: 0, riding: 0 });
  });
  it('chlapec 10–13 let: 2/1/1, bez koně 2/2/0', () => {
    expect(hours(11, true)).toEqual({ bow: 2, combat: 1, riding: 1 });
    expect(hours(11, false)).toEqual({ bow: 2, combat: 2, riding: 0 });
  });
  it('muž 14–44 let: 2/2/2, bez koně 3/3/0', () => {
    expect(hours(30, true)).toEqual({ bow: 2, combat: 2, riding: 2 });
    expect(hours(30, false)).toEqual({ bow: 3, combat: 3, riding: 0 });
  });
  it('vojvoda a muž od 45 let: 3 h', () => {
    expect(hours(50, true)).toEqual({ bow: 1, combat: 1, riding: 1 });
    expect(hours(50, false)).toEqual({ bow: 1.5, combat: 1.5, riding: 0 });
    expect(hours(30, true, true)).toEqual({ bow: 1, combat: 1, riding: 1 });
    // vojvoda cvičí 3 h v každém věku – zbytek dne vsi vládne (lord.md – Den rodiny)
    expect(hours(30, false, true)).toEqual({ bow: 1.5, combat: 1.5, riding: 0 });
  });
  it('žena necvičí', () => {
    const w = kin({ id: 6, age: 30, sex: 'female' });
    expect(trainingHours(w, DAY, null, true)).toEqual({ bow: 0, combat: 0, riding: 0 });
  });
});

describe('strop a růst', () => {
  const at = (age: number): number => armsCap(kin({ id: 5, age, sex: 'male' }), DAY);
  it('strop podle věku', () => {
    expect(at(5)).toBe(0);
    expect(at(7)).toBe(40);
    expect(at(13)).toBe(40);
    expect(at(14)).toBe(100);
    expect(at(44)).toBe(100);
    expect(at(45)).toBe(100);
    expect(at(65)).toBe(40);
    expect(at(80)).toBe(0);
  });

  const grow = (years: number): number => {
    let s: ArmsSkills = { bow: 0, combat: 0, riding: 0 };
    for (let d = 0; d < Math.round(years * 365); d++) {
      s = trainArms(s, { bow: 2, combat: 0, riding: 0 }, 100);
    }
    return s.bow;
  };
  it('2 h denně: rok ≈ 29, 5 let ≈ 80, 7 let ≈ 90', () => {
    expect(grow(1)).toBeCloseTo(29, 0);
    expect(Math.abs(grow(5) - 80)).toBeLessThan(3);
    expect(Math.abs(grow(7) - 90)).toBeLessThan(2);
  });
  it('nad stropem se nezvyšuje a vstup se nemění', () => {
    const s: ArmsSkills = { bow: 50, combat: 0, riding: 0 };
    const out = trainArms(s, { bow: 2, combat: 0, riding: 0 }, 40);
    expect(out.bow).toBe(50);
    expect(s).toEqual({ bow: 50, combat: 0, riding: 0 });
    expect(out.best?.bow).toBe(50);
  });
  it('nejvyšší dosažená hodnota se pamatuje', () => {
    const out = trainArms({ bow: 10, combat: 0, riding: 0 }, { bow: 2, combat: 0, riding: 0 }, 100);
    expect(out.best?.bow).toBe(out.bow);
  });
});

describe('decayArms', () => {
  it('−5 % ročně', () => {
    let s: ArmsSkills = { bow: 80, combat: 0, riding: 0, best: { bow: 80, combat: 0, riding: 0 } };
    for (let d = 0; d < 365; d++) s = decayArms(s);
    expect(s.bow).toBeGreaterThan(75.5);
    expect(s.bow).toBeLessThan(76.5);
    expect(s.best?.bow).toBe(80);
  });
  it('nejníž polovina nejvyšší dosažené', () => {
    let s: ArmsSkills = { bow: 80, combat: 0, riding: 0, best: { bow: 80, combat: 0, riding: 0 } };
    for (let d = 0; d < 365 * 30; d++) s = decayArms(s);
    expect(s.bow).toBeCloseTo(40, 6);
  });
  it('bez best bere současnou hodnotu', () => {
    const s = decayArms({ bow: 60, combat: 0, riding: 0 });
    expect(s.best?.bow).toBe(60);
    expect(s.bow).toBeLessThan(60);
  });
});

describe('familyTrains (lord.md – Zakládání vsi; Martin 24. 10. 2026)', () => {
  const adults = (n: number): KinSpec[] =>
    Array.from({ length: n }, (_, i) => ({ id: 100 + i, age: 30, sex: 'male' as const, home: 2 }));
  it('zakladatelé sami: rodina pracuje', () => {
    expect(familyTrains(build(manorSpecs), DAY)).toBe(false);
  });
  it('s 4 dospělými mimo rodinu začne cvičit, se 3 ne', () => {
    expect(familyTrains(build([...manorSpecs, ...adults(3)]), DAY)).toBe(false);
    expect(familyTrains(build([...manorSpecs, ...adults(4)]), DAY)).toBe(true);
  });
  it('hystereze: cvičící rodina se vrací k práci až pod 3', () => {
    expect(LORD.minVillageAdults).toBe(4);
    expect(familyTrains(build([...manorSpecs, ...adults(3)]), DAY, true)).toBe(true);
    expect(familyTrains(build([...manorSpecs, ...adults(2)]), DAY, true)).toBe(false);
  });
  it('bez vojvody (dvorec bez muže od 14 let) necvičí nikdo', () => {
    const widow: KinSpec[] = [{ id: 11, age: 44, sex: 'female' }, ...adults(6)];
    expect(familyTrains(build(widow), DAY)).toBe(false);
  });
  it('děti se nepočítají', () => {
    const kids = Array.from({ length: 5 }, (_, i) => ({
      id: 200 + i,
      age: 10,
      sex: 'male' as const,
      home: 2,
    }));
    expect(familyTrains(build([...manorSpecs, ...kids]), DAY)).toBe(false);
  });
});

describe('householdHead', () => {
  it('nejstarší muž; bez muže nejstarší žena; děti se nepočítají', () => {
    const s = build([
      ...couple({ id: 1, age: 40 }, { id: 2, age: 45 }),
      { id: 3, age: 10, sex: 'male' },
      { id: 4, age: 30, sex: 'female', home: 2 },
      { id: 5, age: 50, sex: 'female', home: 2 },
    ]);
    expect(householdHead(s.people, 1, DAY)?.id).toBe(1);
    expect(householdHead(s.people, 2, DAY)?.id).toBe(5);
    expect(householdHead(s.people, 9, DAY)).toBeUndefined();
  });
});
