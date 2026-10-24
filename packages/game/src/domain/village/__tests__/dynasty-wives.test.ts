import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { NO_DYNASTY, isLineMan, mainWifeOf, wivesOf } from '../dynasty';
import { ensureMainWives, extraWivesDay } from '../dynasty-wives';
import { expectedYearlyFoodNeed } from '../food-outlook';
import { removePeople } from '../kinship';
import { isSingle } from '../marriage';
import { emigrantGroups, emigrantList } from '../people-trade';
import { populationDay } from '../population';
import { BIRTH_SPACING } from '../rules';
import { LORD } from '../rules-lord';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';
import { DAY, YEAR, couple, dwelling, kin, village, type KinSpec } from './kin-fixtures';

// Manželky mužů rodu (lord.md – Rod vojvody, Manželky): víc manželek, další z okolí, porody
// vedlejších manželek, nová hlavní manželka a výměna lidí, která rod nedá.

const LORD_ID = 10;

/** Sledovaná ves – vojvoda 10 v dvorci (1); příznak rodu má on a jeho synové. */
function tracked(
  specs: KinSpec[],
  dwellings = [dwelling(1), dwelling(2), dwelling(3)],
  extra: Partial<VillageState> = {},
): VillageState {
  const s = village(
    specs.map((k) => kin(k)),
    dwellings,
    { manorId: 1, dynasty: { lordId: LORD_ID, lords: [{ id: LORD_ID, fromDay: DAY }] }, ...extra },
  );
  for (const p of s.people) {
    if (p.sex === 'male' && (p.id === LORD_ID || p.fatherId === LORD_ID)) p.line = true;
  }
  return s;
}
const byId = (s: VillageState, id: number): Person | undefined => s.people.find((p) => p.id === id);
const ids = (people: readonly Person[]): number[] => people.map((p) => p.id);

/** `extraWivesDay` den po dni `years` let od DAY + 1 (mutuje stav); vrátí události. */
function wivesOver(s: VillageState, years: number, from = DAY + 1): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  for (let d = from; d < from + Math.round(years * YEAR); d++) events.push(...extraWivesDay(s, d));
  return events;
}

describe('extraWivesDay – další manželky z okolí (lord.md – Manželky)', () => {
  it('nejvýš 4 žijící, další z okolí 16–22 let; hlavní manželka zůstává', () => {
    const s = tracked(couple({ id: LORD_ID, age: 30 }, { id: 11, age: 28 }));
    const events = wivesOver(s, 25);
    const lord = byId(s, LORD_ID)!;
    const wives = wivesOf(s, lord);
    expect(wives).toHaveLength(LORD.maxWives);
    expect(events.filter((e) => e.kind === 'extra-wife')).toHaveLength(LORD.maxWives - 1);
    expect(lord.spouseId).toBe(11);
    expect(mainWifeOf(s, lord)?.id).toBe(11);
    for (const w of wives.slice(1)) {
      expect(w.origin).toBeDefined();
      expect(w.motherId).toBeUndefined();
      expect(w.dwellingId).toBe(1);
      // těhotenství nejdřív po svatební pauze, věk při příchodu 16–22 let
      const came = w.nextBirthFrom! - BIRTH_SPACING.afterWeddingDays;
      const age = (came - w.bornDay) / YEAR;
      expect(age).toBeGreaterThanOrEqual(LORD.extraWifeAge.from);
      expect(age).toBeLessThanOrEqual(LORD.extraWifeAge.to + 0.01);
    }
  });

  it('v hladu nepřijde', () => {
    const s = tracked(couple({ id: LORD_ID, age: 30 }, { id: 11, age: 28 }), undefined, {
      hungry: true,
    });
    expect(wivesOver(s, 25)).toEqual([]);
    expect(s.people).toHaveLength(2);
  });

  const fullManor: KinSpec[] = [
    ...couple({ id: LORD_ID, age: 30 }, { id: 11, age: 28 }),
    ...[2, 4, 6, 8].map((age, i): KinSpec => ({
      id: 20 + i,
      age,
      sex: 'female',
      mother: 11,
      father: LORD_ID,
    })),
  ];

  it('do plného domu ne – jde do prázdného obydlí (ne do dvorce), bez něj nepřijde', () => {
    const s = tracked(fullManor, [dwelling(1), dwelling(2)]);
    wivesOver(s, 25);
    const wives = wivesOf(s, byId(s, LORD_ID)!);
    expect(wives).toHaveLength(2);
    expect(wives[1]?.dwellingId).toBe(2);
    const alone = tracked(fullManor, [dwelling(1)]);
    expect(wivesOver(alone, 25)).toEqual([]);
  });

  it('po smrti manželky si vezme další', () => {
    const s = tracked([
      ...couple({ id: LORD_ID, age: 30 }, { id: 11, age: 28 }),
      ...[12, 13, 14].map((id): KinSpec => ({ id, age: 20, sex: 'female', spouse: LORD_ID })),
    ]);
    expect(wivesOver(s, 10)).toEqual([]);
    removePeople(s, new Set([13]));
    const events = wivesOver(s, 15, DAY + 4000);
    expect(events).toHaveLength(1);
    expect(wivesOf(s, byId(s, LORD_ID)!)).toHaveLength(4);
  });

  it('muži mimo rod a muži rodu do 18 let nikdy', () => {
    const s = tracked([
      { id: LORD_ID, age: 60, sex: 'male' },
      ...couple({ id: 40, age: 30, home: 2 }, { id: 41, age: 25, home: 2 }),
      ...couple({ id: 42, age: 16, father: LORD_ID, home: 3 }, { id: 43, age: 16, home: 3 }),
    ]);
    const events: ChronicleEvent[] = [];
    // rok – syn 42 je stále mladší 18 let
    for (let d = DAY + 1; d < DAY + 365; d++) events.push(...extraWivesDay(s, d));
    expect(events).toEqual([]);
    expect(wivesOver(s, 25, DAY + 365).length).toBeGreaterThan(0);
    expect(wivesOf(s, byId(s, 40)!)).toHaveLength(1);
  });

  it('ves bez rodu – nic, ani se zděděnými příznaky rodu', () => {
    const s = tracked(couple({ id: LORD_ID, age: 30 }, { id: 11, age: 28 }), undefined, {
      dynasty: NO_DYNASTY,
    });
    const before = structuredClone(s);
    expect(wivesOver(s, 25)).toEqual([]);
    expect(s).toEqual(before);
  });
});

describe('ensureMainWives – nová hlavní manželka (lord.md – Nová hlavní manželka)', () => {
  /**
   * Vojvoda 10 v dvorci (1) s hlavní 11 a dcerami 24–27; vedlejší 12 v domě 2 se ženatým synem 20
   * (žena 30) a synem 22; vedlejší 13 v domě 3 se synem 21 a dcerou 23.
   */
  const wivesSpecs: KinSpec[] = [
    ...couple({ id: LORD_ID, age: 50 }, { id: 11, age: 45 }),
    ...[5, 6, 7, 8].map((age, i): KinSpec => ({
      id: 24 + i,
      age,
      sex: 'female',
      mother: 11,
      father: LORD_ID,
    })),
    { id: 12, age: 42, sex: 'female', spouse: LORD_ID, home: 2 },
    { id: 13, age: 40, sex: 'female', spouse: LORD_ID, home: 3 },
    ...couple(
      { id: 20, age: 25, mother: 12, father: LORD_ID, home: 2 },
      { id: 30, age: 22, home: 2 },
    ),
    { id: 21, age: 20, sex: 'male', mother: 13, father: LORD_ID, home: 3 },
    { id: 22, age: 10, sex: 'male', mother: 12, father: LORD_ID, home: 2 },
    { id: 23, age: 8, sex: 'female', mother: 13, father: LORD_ID, home: 3 },
  ];

  it('matka nejstaršího syna – přestěhuje se se svobodnými dětmi i do přeplněného dvorce', () => {
    const s = tracked(wivesSpecs);
    removePeople(s, new Set([11]));
    expect(byId(s, LORD_ID)?.spouseId).toBeUndefined();
    const events = ensureMainWives(s, DAY);
    expect(events).toEqual([{ day: DAY, kind: 'main-wife' }]);
    expect(byId(s, LORD_ID)?.spouseId).toBe(12);
    expect(byId(s, 12)?.dwellingId).toBe(1);
    expect(byId(s, 22)?.dwellingId).toBe(1);
    // ženatý syn zůstává se ženou ve svém domě
    expect(byId(s, 20)?.dwellingId).toBe(2);
    expect(byId(s, 30)?.dwellingId).toBe(2);
    expect(s.people.filter((p) => p.dwellingId === 1)).toHaveLength(7);
    expect(ids(s.people.filter((p) => p.mainWifeSon))).toEqual([20, 22]);
    // podruhé nic
    expect(ensureMainWives(s, DAY)).toEqual([]);
  });

  it('bez živé matky nejstaršího syna je hlavní matka dalšího syna', () => {
    const s = tracked(wivesSpecs);
    removePeople(s, new Set([11, 12]));
    ensureMainWives(s, DAY);
    expect(byId(s, LORD_ID)?.spouseId).toBe(13);
    expect([13, 21, 23].map((id) => byId(s, id)?.dwellingId)).toEqual([1, 1, 1]);
    expect(byId(s, 21)?.mainWifeSon).toBe(true);
  });

  it('bez synů nejdéle vdaná (nejnižší id)', () => {
    const s = tracked([
      ...couple({ id: LORD_ID, age: 50 }, { id: 11, age: 45 }),
      { id: 14, age: 30, sex: 'female', spouse: LORD_ID },
      { id: 13, age: 35, sex: 'female', spouse: LORD_ID },
    ]);
    removePeople(s, new Set([11]));
    ensureMainWives(s, DAY);
    expect(byId(s, LORD_ID)?.spouseId).toBe(13);
  });

  it('muž s hlavní manželkou ani ves bez vícežeňství se nemění', () => {
    const s = tracked(wivesSpecs);
    const before = structuredClone(s);
    expect(ensureMainWives(s, DAY)).toEqual([]);
    expect(s).toEqual(before);
  });
});

describe('příbuzenství s víc manželkami (kinship.md, lord.md – Po smrti muže)', () => {
  const specs: KinSpec[] = [
    ...couple({ id: LORD_ID, age: 40 }, { id: 11, age: 46 }),
    { id: 12, age: 25, sex: 'female', spouse: LORD_ID, home: 2 },
    { id: 13, age: 22, sex: 'female', spouse: LORD_ID, home: 3 },
  ];

  it('vedlejší manželka se za živého muže nevdává, po jeho smrti jsou vdovy všechny', () => {
    const s = tracked(specs);
    expect(isSingle(s, byId(s, 12)!, DAY)).toBe(false);
    expect(isSingle(s, byId(s, LORD_ID)!, DAY)).toBe(false);
    removePeople(s, new Set([LORD_ID]));
    for (const id of [11, 12, 13]) expect(byId(s, id)?.spouseId).toBeUndefined();
    expect(isSingle(s, byId(s, 13)!, DAY)).toBe(true);
  });

  it('výhled jídla počítá i s dětmi vedlejších manželek', () => {
    const s = tracked(specs);
    const free = tracked(specs);
    for (const p of free.people) if (p.id === 12 || p.id === 13) delete p.spouseId;
    const need = (v: VillageState): number =>
      expectedYearlyFoodNeed(v, DAY, DAY + 3 * 365, DAY + 5 * 365);
    expect(need(s)).toBeGreaterThan(need(free));
  });

  it('osadníci výpravy – muž jen s vedlejší manželkou ji má za hlavní i ve vsi bez rodu', () => {
    const s = tracked(specs, undefined, { dynasty: NO_DYNASTY });
    removePeople(s, new Set([11, 13]));
    expect(ensureMainWives(s, DAY)).toHaveLength(1);
    expect(mainWifeOf(s, byId(s, LORD_ID)!)?.id).toBe(12);
    expect(byId(s, 12)?.dwellingId).toBe(1);
  });
});

describe('porody vedlejších manželek (lord.md – Návštěvy a porody)', () => {
  it('vedlejší manželka v jiném domě rodí, pár v různých domech jinak ne', () => {
    const s = tracked([
      ...couple({ id: LORD_ID, age: 30 }, { id: 11, age: 46 }),
      { id: 12, age: 22, sex: 'female', spouse: LORD_ID, home: 2 },
      // manželé v různých domech (mimo rod) – jako dosud bez dětí
      { id: 40, age: 30, sex: 'male', spouse: 41, home: 3 },
      { id: 41, age: 22, sex: 'female', spouse: 40, home: 2 },
    ]);
    // seed, se kterým vojvoda přežije, než se dítě narodí
    s.seed = 2;
    let child: Person | undefined;
    for (let d = DAY + 1; d < DAY + 4 * 365 && !child; d++) {
      populationDay(s, d, 1);
      child = s.people.find((p) => p.motherId === 12);
    }
    expect(child?.fatherId).toBe(LORD_ID);
    expect(child?.dwellingId).toBe(2);
    expect(s.people.some((p) => p.motherId === 41)).toBe(false);
  });
});

describe('výměna lidí – rod se sousedovi nedává (návrh Clauda)', () => {
  /** Dvorec: vojvoda a hlavní 11; dům 2 vedlejší 12 se ženatými syny 21, 22 a svobodným 20. */
  const specs: KinSpec[] = [
    ...couple({ id: LORD_ID, age: 50 }, { id: 11, age: 45 }),
    { id: 12, age: 42, sex: 'female', spouse: LORD_ID, home: 2 },
    ...couple(
      { id: 21, age: 25, mother: 12, father: LORD_ID, home: 2 },
      { id: 31, age: 22, home: 2 },
    ),
    ...couple(
      { id: 22, age: 23, mother: 12, father: LORD_ID, home: 2 },
      { id: 32, age: 21, home: 2 },
    ),
    { id: 20, age: 18, sex: 'male', mother: 12, father: LORD_ID, home: 2 },
    ...couple({ id: 40, age: 30, home: 3 }, { id: 41, age: 28, home: 3 }),
  ];
  const want = { families: 3, men: 3, women: 3 };
  const given = (s: VillageState): number[] =>
    emigrantList(emigrantGroups(s, DAY, want)).flatMap((g) => ids(g.people));

  it('muž rodu ani jeho žena mezi dávanými nejsou', () => {
    const out = given(tracked(specs));
    for (const id of [LORD_ID, 11, 12, 20, 21, 22, 31, 32]) expect(out).not.toContain(id);
    // ves bez rodu by syny dala (srovnání)
    const free = given(tracked(specs, undefined, { dynasty: NO_DYNASTY }));
    expect(free).toEqual(expect.arrayContaining([22, 32, 20]));
  });
});

describe('sledovaná ves se dvěma manželkami – vcelku = po kouscích, příbuzenství drží', () => {
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

  /** Ves před rodem: vojvoda s hlavní a vedlejší manželkou, ženatý syn a cizí pár. */
  function wivesVillage(): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.people = [
      person(2, 30, 'male', { spouseId: 3 }),
      person(3, 24, 'female', { spouseId: 2 }),
      person(8, 19, 'female', { spouseId: 2 }),
      person(4, 30, 'male', { spouseId: 5 }),
      person(5, 25, 'female', { spouseId: 4 }),
    ];
    s.constructions = [];
    s.storesKg = 30_000;
    s.lastDay = START;
    s.nextId = 1000;
    delete s.dynasty;
    return s;
  }

  it('rok dopočtu nezávisí na kouscích', () => {
    const end = START + 365;
    const whole = advanceVillage(wivesVillage(), end, null);
    let pieces = wivesVillage();
    for (let d = START + 37; d < end; d += 37) pieces = advanceVillage(pieces, d, null);
    pieces = advanceVillage(pieces, end, null);
    expect(pieces.people).toEqual(whole.people);
    expect(pieces.dynasty).toEqual(whole.dynasty);
    expect(pieces.chronicle).toEqual(whole.chronicle);
    // vedlejší manželka 8 je stále vojvodova
    expect(whole.people.find((p) => p.id === 8)?.spouseId).toBe(2);
  });

  it('vícežeňství nerozbije manžele ostatních', () => {
    const s = advanceVillage(wivesVillage(), START + 12 * 365, null);
    const people = new Map(s.people.map((p) => [p.id, p]));
    for (const p of s.people) {
      if (p.spouseId === undefined) continue;
      const spouse = people.get(p.spouseId);
      expect(spouse?.sex).not.toBe(p.sex);
      if (p.sex === 'male') expect(spouse?.spouseId).toBe(p.id);
      const husband = p.sex === 'male' ? p : spouse!;
      const wives = s.people.filter((w) => w.spouseId === husband.id);
      expect(wives.length).toBeLessThanOrEqual(isLineMan(husband) ? LORD.maxWives : 1);
      // každý ženatý muž má hlavní manželku (konec dne – `ensureMainWives`)
      expect(husband.spouseId).toBeDefined();
    }
  });
});
