import { describe, expect, it } from 'vitest';
import { harvestHelperLabor } from '../harvest-hands';
import { familyHomes, lordApartIds, lordFamily, manorLabor, trainingHours } from '../lord';
import { villagersToday } from '../morning-water';
import { dailyMinPerHousehold } from '../productivity';
import { LORD } from '../rules';
import type { Person, VillageState } from '../types';
import { DAY, trackedVillage, type KinSpec } from './kin-fixtures';

// Vojvodova rodina ve vsi s rodem (lord.md – Rod vojvody: Manželky – Výcvik a Práce, Synové po
// sňatku – „Cvičí, dokud neodejde“, Vojvoda cvičí celý život). Dvorec je obydlí 1, vojvoda 10.

const ids = (people: readonly Person[]): number[] => people.map((p) => p.id).sort((a, b) => a - b);
const TRAINS = { lord: { trains: true } } as const;

/**
 * Dvorec: vojvoda 10, hlavní 11, vedlejší 12, synové 20 (12 let, hlavní), 21 (9 let, vedlejší),
 * 23 (5 let), ženatý syn 24 se snachou 25 a vnukem 26, dcera 27. Dům 2: vedlejší 13 se synem 22
 * (18 let) a dcerou 28.
 */
const specs: KinSpec[] = [
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

function manor(extra: Partial<VillageState> = TRAINS): VillageState {
  const s = trackedVillage(specs, undefined, extra);
  // vnuk po meči (fixtura dává příznak jen synům vojvody)
  s.people.find((p) => p.id === 26)!.line = true;
  return s;
}

describe('lordFamily ve vsi s rodem', () => {
  it('cvičí synové obou manželek v dvorci, ženatý syn i vnuk; vedlejší mimo dvorec je wivesApart', () => {
    const f = lordFamily(manor(), DAY);
    expect(f.lord?.id).toBe(10);
    expect(ids(f.trainees)).toEqual([10, 20, 21, 24, 26]);
    expect(ids(f.household)).toEqual([11, 12, 25, 27]);
    expect(ids(f.others)).toEqual([23]);
    expect(ids(f.wivesApart)).toEqual([13]);
  });

  it('syn s matkou mimo dvorec necvičí a pracuje se vsí, ona je mimo práci vsi', () => {
    const s = manor();
    const apart = lordApartIds(s, DAY);
    expect([...apart].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 20, 21, 24, 25, 26, 27]);
    const { villagers, manorSkip } = villagersToday(s, DAY, new Set());
    expect(ids(villagers)).toEqual([22, 23, 28]);
    expect([...manorSkip].sort()).toEqual([1, 2]);
    expect(familyHomes(lordFamily(s, DAY))).toEqual(new Set([1, 2]));
  });

  it('vojvoda cvičí i ve stáří – 3 h', () => {
    const s = manor();
    s.people.find((p) => p.id === 10)!.bornDay = DAY - Math.ceil(70.5 * 365.25);
    const f = lordFamily(s, DAY);
    expect(ids(f.trainees)).toContain(10);
    const h = trainingHours(f.lord!, DAY, f.lord, false);
    expect(h.bow + h.combat + h.riding).toBeCloseTo(LORD.hours.older);
  });

  it('bez vojvody (rod skončil) nikdo necvičí', () => {
    const s = manor();
    s.dynasty = { lordId: null, lords: [{ id: 10, fromDay: 0, toDay: DAY }] };
    const f = lordFamily(s, DAY);
    expect(f.lord).toBeNull();
    expect(f.trainees).toEqual([]);
    expect(lordApartIds(s, DAY).size).toBe(0);
  });
});

describe('manorLabor – domy vedlejších manželek', () => {
  /** Ves, ve které 13 není vojvodova manželka (jen vdova v domě 2). */
  const withoutApart = (): VillageState => {
    const s = manor();
    delete s.people.find((p) => p.id === 13)!.spouseId;
    return s;
  };

  it('vedlejší manželka kryje minimum svého domu, nekryté platí ves', () => {
    const p = 0.2;
    const min = dailyMinPerHousehold(0);
    expect(min).toBeGreaterThan(p);
    const s = manor();
    const withWife = manorLabor(s, DAY, 0, p);
    const without = manorLabor(withoutApart(), DAY, 0, p, lordFamily(withoutApart(), DAY));
    expect(withWife.dailyMin - without.dailyMin).toBeCloseTo(p);
    expect(withWife.uncovered - without.uncovered).toBeCloseTo(min - p);
    // na pole (hlad) ani na žeň nejde nic navíc – její práce stačí sotva na dům
    expect(withWife.freeMen).toBeCloseTo(without.freeMen);
  });

  it('práce mužů (žeň a osev) jen z cvičících – i ženatý syn v dvorci, vedlejší manželka ne', () => {
    const m = manorLabor(manor(), DAY, 0, 1);
    // ženatý syn 24 (1); vojvoda je starší (jen minimum dvorce), chlapci a vnuk jsou děti
    expect(m.freeMen).toBeCloseTo(1);
    // co zbude ženám (i vedlejší manželce), je domácí výroba – v `free` jen pro hlad
    expect(m.free).toBeGreaterThan(m.freeMen);
  });

  it('žně: starší vedlejší manželka mimo dvorec mezi žňovými pomocníky není', () => {
    const s = manor();
    s.people.find((p) => p.id === 13)!.bornDay = DAY - Math.ceil(50.5 * 365.25);
    // jen starší (bez výrostků) – pasení se nepočítá
    s.people = s.people.filter((p) => ![20, 21, 26, 28].includes(p.id));
    const apart = lordApartIds(s, DAY);
    expect(apart.has(13)).toBe(true);
    // s hrnčířským nádobím jí nad minimum domu zbude – mimo rodinu by šla na žeň
    expect(harvestHelperLabor(s, DAY, apart, 1, 1)).toBe(0);
    expect(harvestHelperLabor(s, DAY, new Set([10]), 1, 1)).toBeGreaterThan(0);
  });
});
