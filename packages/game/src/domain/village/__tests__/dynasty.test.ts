import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  NO_DYNASTY,
  currentLord,
  dynastyDay,
  isDynastyTracked,
  isLineMan,
  isSecondaryWife,
  lineMen,
  mainWifeOf,
  markNewborn,
  wivesOf,
  withDynasty,
} from '../dynasty';
import { LINE_NAMES, generatedLineName, suggestLineName } from '../dynasty-names';
import { advanceVillage } from '../simulate';
import type { Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';
import { DAY, couple, dwelling, kin, village, type KinSpec } from './kin-fixtures';

// Rod vojvody v jádru (lord.md – Rod vojvody, fáze 1): příznak rodu, jména, převod starších vsí
// a jména vnuků při narození. Chování vsi se nemění.

const build = (specs: KinSpec[], extra: Partial<VillageState> = {}): VillageState =>
  village(
    specs.map((k) => kin(k)),
    [dwelling(1), dwelling(2), dwelling(3)],
    extra,
  );
const byId = (s: VillageState, id: number): Person | undefined => s.people.find((p) => p.id === id);
const homes = (s: VillageState): Record<number, number> =>
  Object.fromEntries(s.people.map((p) => [p.id, p.dwellingId]));

/**
 * Vojvoda 10 a žena 11 v dvorci (1); syn 12 se ženou 21 a vnukem 13 v dvorci; syn 14 se ženou 22
 * a vnukem 15 v domě 2; zemřelý syn 16 (jen v rodokmenu) a jeho syn 17 v domě 3; dcera 20 se
 * zetěm 30 a jejich synem 31 v domě 3; cizí muž 40 v domě 3.
 */
const familySpecs: KinSpec[] = [
  ...couple({ id: 10, age: 60 }, { id: 11, age: 58 }),
  ...couple({ id: 12, age: 35, mother: 11, father: 10 }, { id: 21, age: 33 }),
  { id: 13, age: 12, sex: 'male', mother: 21, father: 12 },
  ...couple({ id: 14, age: 30, mother: 11, father: 10, home: 2 }, { id: 22, age: 28, home: 2 }),
  { id: 15, age: 8, sex: 'male', mother: 22, father: 14, home: 2 },
  { id: 17, age: 20, sex: 'male', father: 16, home: 3 },
  ...couple({ id: 30, age: 27, home: 3 }, { id: 20, age: 25, mother: 11, father: 10, home: 3 }),
  { id: 31, age: 5, sex: 'male', mother: 20, father: 30, home: 3 },
  { id: 40, age: 50, sex: 'male', home: 3 },
];
const family = (): VillageState =>
  build(familySpecs, { ancestors: [{ id: 16, motherId: 11, fatherId: 10 }] });

describe('withDynasty – převod starších vsí (lord.md – Převod starších vsí)', () => {
  it('vojvoda a jeho potomci po meči dostanou příznak rodu, ženy a synové dcer ne', () => {
    const s = withDynasty(family());
    expect(lineMen(s).map((p) => p.id)).toEqual([10, 12, 13, 14, 15, 17]);
    for (const id of [11, 20, 21, 22, 30, 31, 40]) expect(byId(s, id)?.line).toBeUndefined();
    expect(s.dynasty).toEqual({ lordId: 10, lords: [{ id: 10, fromDay: DAY }] });
    expect(currentLord(s)?.id).toBe(10);
    expect(isDynastyTracked(s)).toBe(true);
  });

  it('vojvoda a synové bez jména, vnuci se jménem ze seznamu – každý jiným', () => {
    const s = withDynasty(family());
    for (const id of [10, 12, 14]) expect(byId(s, id)?.name).toBeUndefined();
    const names = [13, 15, 17].map((id) => byId(s, id)?.name);
    for (const name of names) expect(LINE_NAMES).toContain(name);
    expect(new Set(names).size).toBe(3);
  });

  it('muži rodu kromě vojvody jsou synové hlavní manželky (jako u narození)', () => {
    const s = withDynasty(family());
    const flagged = s.people.filter((p) => p.mainWifeSon).map((p) => p.id);
    expect(flagged).toEqual([12, 13, 14, 15, 17]);
    expect(mainWifeOf(s, byId(s, 10)!)?.id).toBe(11);
    expect(wivesOf(s, byId(s, 10)!).map((w) => w.id)).toEqual([11]);
    expect(isSecondaryWife(s, byId(s, 11)!)).toBe(false);
  });

  it('nikdo se nestěhuje a převod je idempotentní', () => {
    const before = family();
    const once = withDynasty(before);
    expect(homes(once)).toEqual(homes(before));
    expect(withDynasty(once)).toBe(once);
    expect(withDynasty(withDynasty(family()))).toEqual(once);
    // vstupní stav se nemění
    expect(before.dynasty).toBeUndefined();
    expect(before.people.some((p) => p.line)).toBe(false);
  });

  it('dvorec jen s chlapcem – vojvodou je chlapec, nikdo se nestěhuje', () => {
    const before = build([
      { id: 50, age: 40, sex: 'female' },
      { id: 51, age: 10, sex: 'male', mother: 50 },
      ...couple({ id: 60, age: 45, home: 2 }, { id: 61, age: 40, home: 2 }),
    ]);
    const s = withDynasty(before);
    expect(s.dynasty?.lordId).toBe(51);
    expect(lineMen(s).map((p) => p.id)).toEqual([51]);
    expect(homes(s)).toEqual(homes(before));
  });

  it('dvorec bez muže – nejstarší muž vsi se se ženou a svobodnými dětmi přestěhuje', () => {
    const before = build([
      { id: 50, age: 60, sex: 'female' },
      { id: 52, age: 20, sex: 'female', mother: 50 },
      ...couple({ id: 60, age: 50, home: 2 }, { id: 61, age: 45, home: 2 }),
      { id: 62, age: 10, sex: 'male', mother: 61, father: 60, home: 2 },
      { id: 65, age: 16, sex: 'female', mother: 61, father: 60, home: 2 },
      ...couple({ id: 63, age: 22, mother: 61, father: 60, home: 2 }, { id: 64, age: 20, home: 2 }),
      ...couple({ id: 70, age: 40, home: 3 }, { id: 71, age: 38, home: 3 }),
    ]);
    const s = withDynasty(before);
    expect(s.dynasty?.lordId).toBe(60);
    expect(homes(s)).toEqual({ ...homes(before), 60: 1, 61: 1, 62: 1, 65: 1 });
    expect(lineMen(s).map((p) => p.id)).toEqual([60, 62, 63]);
    expect(s.people.filter((p) => p.mainWifeSon).map((p) => p.id)).toEqual([62, 63]);
  });

  it('ves bez muže rod nemá', () => {
    const s = withDynasty(
      build([
        { id: 50, age: 60, sex: 'female' },
        { id: 52, age: 20, sex: 'female', mother: 50 },
      ]),
    );
    expect(s.dynasty).toEqual(NO_DYNASTY);
    expect(isDynastyTracked(s)).toBe(false);
    expect(currentLord(s)).toBeUndefined();
  });
});

describe('markNewborn – narození (lord.md – Kdo patří k rodu, Jména)', () => {
  const tracked = (): VillageState => withDynasty(family());
  const newborn = (s: VillageState, id: number, sex: Person['sex'], mother: number): Person => {
    const father = byId(s, mother)?.spouseId;
    const child: Person = { id, bornDay: DAY, dwellingId: 1, sex, motherId: mother };
    if (father !== undefined) child.fatherId = father;
    s.people.push(child);
    return child;
  };

  it('syn vojvody – příznak rodu, syn hlavní manželky, bez jména, v kronice', () => {
    const s = tracked();
    const child = newborn(s, 500, 'male', 11);
    const events = markNewborn(s, child, DAY);
    expect(child).toMatchObject({ line: true, mainWifeSon: true });
    expect(child.name).toBeUndefined();
    expect(events).toEqual([{ day: DAY, kind: 'line-birth' }]);
  });

  it('dcera vojvody příznak nemá', () => {
    const s = tracked();
    const child = newborn(s, 500, 'female', 11);
    expect(markNewborn(s, child, DAY)).toEqual([]);
    expect(child.line).toBeUndefined();
    expect(child.mainWifeSon).toBeUndefined();
  });

  it('syn ženatého syna dostane jméno, které nenosí žijící muž rodu', () => {
    const s = tracked();
    const child = newborn(s, 500, 'male', 21);
    expect(markNewborn(s, child, DAY)).toEqual([]);
    expect(child.line).toBe(true);
    expect(LINE_NAMES).toContain(child.name);
    const others = lineMen(s).filter((p) => p.id !== 500);
    expect(others.map((p) => p.name)).not.toContain(child.name);
  });

  it('syn dcery a syn cizího muže do rodu nepatří', () => {
    const s = tracked();
    const child = newborn(s, 500, 'male', 20);
    expect(markNewborn(s, child, DAY)).toEqual([]);
    expect(child).toEqual({
      id: 500,
      bornDay: DAY,
      dwellingId: 1,
      sex: 'male',
      motherId: 20,
      fatherId: 30,
    });
  });

  it('ves bez rodu – nic se nemění', () => {
    const s = build(familySpecs, { dynasty: NO_DYNASTY });
    const child = newborn(s, 500, 'male', 11);
    expect(markNewborn(s, child, DAY)).toEqual([]);
    expect(isLineMan(child)).toBe(false);
    expect(child.name).toBeUndefined();
  });
});

describe('dynastyDay – vojvoda po smrti (dočasně do nástupnictví)', () => {
  it('zemřel-li vojvoda, vojvodou je nejstarší muž rodu v dvorci', () => {
    const s = withDynasty(family());
    s.people = s.people.filter((p) => p.id !== 10);
    const events = dynastyDay(s, DAY + 5);
    expect(s.dynasty).toEqual({
      lordId: 12,
      lords: [
        { id: 10, fromDay: DAY, toDay: DAY + 5 },
        { id: 12, fromDay: DAY + 5 },
      ],
    });
    expect(events).toEqual([{ day: DAY + 5, kind: 'lord' }]);
    expect(dynastyDay(s, DAY + 6)).toEqual([]);
  });

  it('bez muže rodu v dvorci vojvoda není', () => {
    const s = withDynasty(family());
    s.people = s.people.filter((p) => ![10, 12, 13].includes(p.id));
    dynastyDay(s, DAY + 5);
    expect(s.dynasty?.lordId).toBeNull();
    expect(s.dynasty?.lords).toEqual([{ id: 10, fromDay: DAY, toDay: DAY + 5 }]);
  });
});

describe('jména vnuků (lord.md – Generovaná jména vnuků)', () => {
  it('seznam má aspoň 60 různých jmen jen z písmen', () => {
    expect(new Set(LINE_NAMES).size).toBe(LINE_NAMES.length);
    expect(LINE_NAMES.length).toBeGreaterThanOrEqual(60);
    for (const name of LINE_NAMES) expect(name).toMatch(/^\p{L}{1,20}$/u);
  });

  it('jméno je deterministické ze seedu, dne a člověka', () => {
    const s = withDynasty(family());
    expect(generatedLineName(s, DAY + 1, 500)).toBe(generatedLineName(s, DAY + 1, 500));
  });

  it('vyčerpaný seznam – jméno ze seznamu', () => {
    const s = withDynasty(family());
    s.people.push(
      ...LINE_NAMES.map((name, i): Person => ({
        id: 600 + i,
        bornDay: DAY - 400,
        dwellingId: 2,
        sex: 'male',
        line: true,
        name,
      })),
    );
    expect(LINE_NAMES).toContain(generatedLineName(s, DAY + 1, 500));
  });

  it('kostka nabízí jméno, které rod nenosí', () => {
    const taken = LINE_NAMES.slice(1);
    expect(suggestLineName(7, taken)).toBe(LINE_NAMES[0]);
    expect(LINE_NAMES).toContain(suggestLineName(7, LINE_NAMES));
  });
});

describe('sledovaná ves – vcelku = po kouscích', () => {
  const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
  const START = at(601, 3, 1);
  const person = (
    id: number,
    years: number,
    sex: Person['sex'],
    extra: Partial<Person> = {},
  ): Person => ({
    id,
    bornDay: START - Math.ceil(years * 365.25) - 10,
    dwellingId: 1,
    sex,
    ...extra,
  });

  /** Starší ves před rodem: vojvoda se ženou a dva ženatí synové se ženami – páry plodné. */
  function olderVillage(): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 5, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.people = [
      person(2, 38, 'male', { spouseId: 3 }),
      person(3, 34, 'female', { spouseId: 2 }),
      person(4, 18, 'male', { spouseId: 5, fatherId: 2, motherId: 3 }),
      person(5, 17, 'female', { spouseId: 4 }),
      person(6, 20, 'male', { spouseId: 7, fatherId: 2, motherId: 3 }),
      person(7, 19, 'female', { spouseId: 6 }),
    ];
    s.constructions = [];
    s.storesKg = 30_000;
    s.lastDay = START;
    s.nextId = 1000;
    delete s.dynasty;
    return s;
  }

  it('jména i příznaky rodu nezávisí na kouscích dopočtu', () => {
    const end = START + 5 * 365;
    const whole = advanceVillage(olderVillage(), end, null);
    let pieces = olderVillage();
    for (let d = START + 37; d < end; d += 37) pieces = advanceVillage(pieces, d, null);
    pieces = advanceVillage(pieces, end, null);
    const view = (s: VillageState): unknown => ({
      dynasty: s.dynasty,
      people: s.people.map((p) => [p.id, p.line, p.name, p.mainWifeSon]),
    });
    expect(view(pieces)).toEqual(view(whole));
    // muži rodu: vojvoda a jeho synové; synové synů se jménem, synové vojvody bez jména
    expect(whole.dynasty?.lords[0]?.id).toBe(2);
    expect(whole.people.some((p) => p.line && p.name !== undefined)).toBe(true);
    for (const p of whole.people) {
      if (p.sex !== 'male' || p.fatherId === undefined) continue;
      const father = whole.people.find((f) => f.id === p.fatherId);
      if (!father?.line) continue;
      expect(p.line).toBe(true);
      if (father.id === 2) expect(p.name).toBeUndefined();
      else expect(LINE_NAMES).toContain(p.name);
    }
  });
});
