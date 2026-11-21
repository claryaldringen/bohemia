import { describe, expect, it } from 'vitest';
import { newWorkshop } from '../../crafts/crafts';
import { isElite, markElite, markNewborn } from '../dynasty';
import { adultDailyMin, waterFetchingLabor } from '../../core/labor';
import {
  decayArms,
  familyHomes,
  lordApartIds,
  lordFamily,
  manorLabor,
  trainLordDay,
  type ManorLabor,
} from '../lord';
import { villagersToday } from '../../core/morning-water';
import { laborPerDay } from '../people';
import { dailyMinPerHousehold } from '../../core/productivity';
import { dynastyDay } from '../succession';
import type { Person, VillageState } from '../../types';
import { DAY, dwelling, kin, trackedVillage, type KinSpec } from '../../__tests__/kin-fixtures';

// Elita (hillfort.md – Elita, Martin 8. 11. 2026: „Elitou budou automaticky všichni muži rodu
// pocházející z hlavních manželek“, „stejné pravidlo jako rodina ve dvorci“): muži rodu z linie
// hlavních manželek cvičí celý život i ve vlastním domě. Dvorec je obydlí 1, vojvoda 10.

const ids = (people: readonly Person[]): number[] => people.map((p) => p.id).sort((a, b) => a - b);
const sorted = (set: ReadonlySet<number>): number[] => [...set].sort((a, b) => a - b);
const TRAINS = { lord: { trains: true } } as const;
const ARMS = { bow: 20, combat: 20, riding: 0 };

/**
 * Dvorec 1: vojvoda 10, hlavní 11, vedlejší 12. Dům 3: syn hlavní 24 se ženou 25, synem 26 (8 let,
 * matka 25 je hlavní 24) a dcerou 29. Dům 4: syn vedlejší 30 se ženou 31.
 */
const specs: KinSpec[] = [
  { id: 10, age: 50, sex: 'male', spouse: 11 },
  { id: 11, age: 45, sex: 'female', spouse: 10 },
  { id: 12, age: 40, sex: 'female', spouse: 10 },
  { id: 24, age: 28, sex: 'male', mother: 11, father: 10, spouse: 25, home: 3 },
  { id: 25, age: 26, sex: 'female', spouse: 24, home: 3 },
  { id: 26, age: 8, sex: 'male', mother: 25, father: 24, home: 3 },
  { id: 29, age: 5, sex: 'female', mother: 25, father: 24, home: 3 },
  { id: 30, age: 20, sex: 'male', mother: 12, father: 10, spouse: 31, home: 4 },
  { id: 31, age: 19, sex: 'female', spouse: 30, home: 4 },
];

const person = (s: VillageState, id: number): Person => s.people.find((p) => p.id === id)!;

/** Ves před denním pravidlem – příznak `elite` ještě nikdo nemá. */
function plain(extra: Partial<VillageState> = TRAINS): VillageState {
  const s = trackedVillage(specs, [dwelling(1), dwelling(2), dwelling(3), dwelling(4)], extra);
  // vnuk po meči a synové hlavních manželek (fixtura dává jen `line` synům vojvody)
  person(s, 26).line = true;
  person(s, 24).mainWifeSon = true;
  person(s, 26).mainWifeSon = true;
  person(s, 24).arms = { ...ARMS };
  person(s, 30).arms = { ...ARMS };
  return s;
}

/** Ves po denním pravidle (`markElite`). */
function elite(extra: Partial<VillageState> = TRAINS): VillageState {
  const s = plain(extra);
  markElite(s);
  return s;
}

const eliteIds = (s: VillageState): number[] => ids(s.people.filter((p) => p.elite === true));

describe('markElite – kdo je elita', () => {
  it('(a) syn hlavní manželky a jeho syn s hlavní manželkou ano, syn vedlejší ne; idempotentní', () => {
    const s = plain();
    markElite(s);
    expect(eliteIds(s)).toEqual([24, 26]);
    expect(isElite(s, person(s, 10))).toBe(true);
    expect(isElite(s, person(s, 30))).toBe(false);
    const once = structuredClone(s);
    markElite(s);
    expect(s).toEqual(once);
  });

  it('jedno volání označí i vnuka, jehož otec příznak právě dostal (vnuk dřív v pořadí)', () => {
    const s = plain();
    s.people.reverse();
    markElite(s);
    expect(eliteIds(s)).toEqual([24, 26]);
  });
});

describe('lordFamily – dům elity jako dvorec', () => {
  it('(b) elitní muž a jeho syn cvičí, žena a dcera vedou domácnost; syn vedlejší v rodině není', () => {
    const f = lordFamily(elite(), DAY);
    expect(ids(f.trainees)).toEqual([10, 24, 26]);
    expect(ids(f.household)).toEqual([11, 12, 25, 29]);
    expect(f.others).toEqual([]);
    expect(f.wivesApart).toEqual([]);
    expect(f.eliteHomes).toEqual([3]);
  });

  it('(c) dům elity kryje rodina a jeho lidé jsou mimo práci vsi', () => {
    const s = elite();
    expect(familyHomes(lordFamily(s, DAY))).toEqual(new Set([1, 3]));
    expect(sorted(lordApartIds(s, DAY))).toEqual([10, 11, 12, 24, 25, 26, 29]);
    const { villagers, manorSkip } = villagersToday(s, DAY, new Set());
    expect(ids(villagers)).toEqual([30, 31]);
    expect(sorted(manorSkip)).toEqual([1, 3]);
  });

  it('(g) obydlí s dílnou domem elity není – muž dělá řemeslo', () => {
    const s = elite();
    s.dwellings.find((d) => d.id === 3)!.workshop = newWorkshop('smith');
    const f = lordFamily(s, DAY);
    expect(f.eliteHomes).toEqual([]);
    expect(ids(f.trainees)).toEqual([10]);
    expect(ids(f.household)).toEqual([11, 12]);
  });

  it('elitní muž bydlící v dvorci (čeká na dům) dům elity nedělá', () => {
    const s = elite();
    for (const id of [24, 25, 26, 29]) person(s, id).dwellingId = 1;
    const f = lordFamily(s, DAY);
    expect(f.eliteHomes).toEqual([]);
    expect(ids(f.trainees)).toEqual([10, 24, 26]);
  });
});

describe('manorLabor – po domech rodiny', () => {
  // dům 3: 4 lidé bez starších, voda u domu (bez údaje cesty)
  const homeNeed = (productivity: number): number =>
    adultDailyMin(dailyMinPerHousehold(0) + waterFetchingLabor(4, undefined), 0, productivity);

  it('(d) práce 24 po minimu domu 3 jde do freeMen; minimum domu 3 kryje rodina', () => {
    const base = manorLabor(plain(), DAY, 0, 1, lordFamily(plain(), DAY));
    const s = elite();
    const m = manorLabor(s, DAY, 0, 1);
    // dům 3: žena 25 a muž 24 (dospělí), děti práci nedávají
    const cap = laborPerDay(person(s, 25), DAY) + laborPerDay(person(s, 24), DAY);
    const men = laborPerDay(person(s, 24), DAY);
    const need = homeNeed(1);
    expect(need).toBeLessThan(cap);
    expect(m.dailyMin - base.dailyMin).toBeCloseTo(need);
    expect(m.uncovered).toBeCloseTo(base.uncovered);
    expect(m.free - base.free).toBeCloseTo(cap - need);
    expect(m.freeMen - base.freeMen).toBeCloseTo(Math.min(cap - need, men));
    expect(m.freeMen - base.freeMen).toBeGreaterThan(0);
  });

  it('(d) při nízké produktivitě nekryté minimum domů 1 i 3 platí ves', () => {
    const p = 0.2;
    const base = manorLabor(plain(), DAY, 0, p, lordFamily(plain(), DAY));
    const m = manorLabor(elite(), DAY, 0, p);
    const cap = 2 * p;
    const need = homeNeed(p);
    expect(need).toBeGreaterThan(cap);
    expect(base.uncovered).toBeGreaterThan(0);
    expect(m.uncovered - base.uncovered).toBeCloseTo(need - cap);
    expect(m.freeMen).toBeCloseTo(base.freeMen);
    expect(m.free).toBeCloseTo(base.free);
  });
});

describe('výcvik elity', () => {
  it('(e) elitní muž ve vlastním domě cvičí, syn vedlejší manželky zapomíná', () => {
    const s = elite();
    trainLordDay(s, DAY);
    expect(person(s, 24).arms!.bow).toBeGreaterThan(ARMS.bow);
    expect(person(s, 30).arms).toEqual(decayArms(ARMS));
  });

  it('(f) narozený syn elitního muže s hlavní manželkou je elita, s vedlejší jen muž rodu', () => {
    const s = elite();
    s.people.push(kin({ id: 32, age: 20, sex: 'female', spouse: 24, home: 3 }));
    const born = (id: number, mother: number, father: number): Person => {
      const child: Person = {
        id,
        bornDay: DAY,
        dwellingId: person(s, father).dwellingId,
        sex: 'male',
        motherId: mother,
        fatherId: father,
      };
      s.people.push(child);
      markNewborn(s, child, DAY);
      return child;
    };
    const main = born(40, 25, 24);
    const side = born(41, 32, 24);
    // syn vedlejší manželky vojvody (30) s jeho hlavní manželkou – syn hlavní, ale ne elita
    const outside = born(42, 31, 30);
    dynastyDay(s, DAY);
    expect(main.line).toBe(true);
    expect(main.elite).toBe(true);
    expect(side.line).toBe(true);
    expect(side.elite).toBeUndefined();
    expect(outside.mainWifeSon).toBe(true);
    expect(outside.elite).toBeUndefined();
  });
});

describe('ves bez synů hlavních manželek mimo dvorec – beze změny', () => {
  /** Fixtura `lord-dynasty.test.ts` – ženatý syn 24 v dvorci, vedlejší 13 v domě 2. */
  const old: KinSpec[] = [
    { id: 10, age: 50, sex: 'male', spouse: 11 },
    { id: 11, age: 40, sex: 'female', spouse: 10 },
    { id: 12, age: 30, sex: 'female', spouse: 10 },
    { id: 13, age: 34, sex: 'female', spouse: 10, home: 2 },
    { id: 20, age: 12, sex: 'male', mother: 11, father: 10 },
    { id: 21, age: 9, sex: 'male', mother: 12, father: 10 },
    { id: 22, age: 18, sex: 'male', mother: 13, father: 10, home: 2 },
    { id: 23, age: 5, sex: 'male', mother: 11, father: 10 },
    { id: 24, age: 20, sex: 'male', mother: 11, father: 10, spouse: 25 },
    { id: 25, age: 19, sex: 'female', spouse: 24 },
    { id: 26, age: 8, sex: 'male', mother: 25, father: 24 },
    { id: 27, age: 15, sex: 'female', mother: 11, father: 10 },
    { id: 28, age: 14, sex: 'female', mother: 13, father: 10, home: 2 },
  ];
  const manor = (): VillageState => {
    const s = trackedVillage(old, undefined, TRAINS);
    person(s, 26).line = true;
    return s;
  };

  /** `manorLabor` před elitou (8. 11. 2026) – musí vyjít bit po bitu stejně. */
  const golden: [number, number, ManorLabor][] = [
    [1, 0, { dailyMin: 0.5, uncovered: 0, help: 0, sowing: 0, free: 5.5, freeMen: 1, freeLord: 0 }],
    [
      1,
      1,
      { dailyMin: 0.45, uncovered: 0, help: 0, sowing: 0, free: 5.55, freeMen: 1, freeLord: 0 },
    ],
    [
      0.2,
      0,
      {
        dailyMin: 0.6000000000000001,
        uncovered: 0.29999999999999993,
        help: 0,
        sowing: 0,
        free: 0.6,
        freeMen: 0.2,
        freeLord: 0,
      },
    ],
    [
      0.2,
      1,
      {
        dailyMin: 0.55,
        uncovered: 0.25,
        help: 0,
        sowing: 0,
        free: 0.65,
        freeMen: 0.2,
        freeLord: 0,
      },
    ],
    [
      0.73,
      0,
      {
        dailyMin: 0.635,
        uncovered: 0,
        help: 0,
        sowing: 0,
        free: 3.7449999999999997,
        freeMen: 0.73,
        freeLord: 0,
      },
    ],
    [
      0.73,
      1,
      {
        dailyMin: 0.535,
        uncovered: 0,
        help: 0,
        sowing: 0,
        free: 3.8449999999999998,
        freeMen: 0.73,
        freeLord: 0,
      },
    ],
  ];

  it('(h) markElite nic neoznačí, eliteHomes prázdné, rodina jako dřív', () => {
    const s = manor();
    const before = structuredClone(s);
    markElite(s);
    expect(s).toEqual(before);
    const f = lordFamily(s, DAY);
    expect(f.eliteHomes).toEqual([]);
    expect(ids(f.trainees)).toEqual([10, 20, 21, 24, 26]);
    expect(ids(f.household)).toEqual([11, 12, 25, 27]);
    expect(ids(f.others)).toEqual([23]);
    expect(ids(f.wivesApart)).toEqual([13]);
    expect(familyHomes(f)).toEqual(new Set([1, 2]));
  });

  it('(h) manorLabor bit po bitu jako před elitou', () => {
    for (const [productivity, pottery, expected] of golden) {
      const s = manor();
      markElite(s);
      expect(manorLabor(s, DAY, pottery, productivity, lordFamily(s, DAY))).toEqual(expected);
    }
    // ve žňový den s pomocí rodiny (lord.md – Kdy jde rodina na pole) dá podíl celé rodiny
    const s = manor();
    s.lord = { trains: true };
    expect(manorLabor(s, DAY, 0.5, 0.9, lordFamily(s, DAY))).toEqual({
      dailyMin: 0.49999999999999994,
      uncovered: 0,
      help: 0,
      sowing: 0,
      free: 4.8999999999999995,
      freeMen: 0.9,
      freeLord: 0,
    });
  });

  it('(h) i se synem hlavní manželky v dvorci (elita, ale bez vlastního domu) – bit po bitu', () => {
    const s = manor();
    person(s, 24).mainWifeSon = true;
    markElite(s);
    expect(person(s, 24).elite).toBe(true);
    expect(lordFamily(s, DAY).eliteHomes).toEqual([]);
    expect(manorLabor(s, DAY, 0, 1)).toEqual(golden[0]![2]);
  });
});
