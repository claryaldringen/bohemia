import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { craftCoverage, craftHouseholds, craftLightLabor } from '../../crafts/crafts';
import { allocateDay } from '../../core/labor';
import { manorLabor, trainLordDay, withoutSowingHelp } from '../lord';
import { laborPerDay } from '../people';
import { dailyMinPerHousehold, NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import { sowingCapacity, villageProductivity } from '../../core/simulate-plan';
import type { FarmSeason, Person, VillageState } from '../../types';
import { DAY, couple, dwelling, kin, village, type KinSpec } from '../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Vojvodova rodina mimo práci vsi (lord.md – Den rodiny, Kdy jde rodina na pole): rodina cvičí,
// ženy kryjí denní minimum dvorce, na pole jde rodina jen při hladu a vrací se po 30 dnech plného
// přídělu.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const START = at(601, 1, 10);
const OUTSIDE = 500;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: START - Math.ceil(years * 365.25) - 10, dwellingId, sex, ...extra });

/** Dvorec (vojvoda 40, žena 38, syn 17 se snachou 16, syn 11) a `outside` dospělých jinde. */
function lordVillage(outside = 4): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const manor = s.dwellings[0]!.id;
  s.dwellings.push({ ...dwelling(OUTSIDE), position: { x: 30, z: 0, rotation: 0 } });
  s.people = [
    person(10, 40, manor, 'male', { spouseId: 11 }),
    person(11, 38, manor, 'female', { spouseId: 10 }),
    person(12, 17, manor, 'male', { fatherId: 10, motherId: 11, spouseId: 13 }),
    person(13, 16, manor, 'female', { spouseId: 12 }),
    person(14, 11, manor, 'male', { fatherId: 10, motherId: 11 }),
    ...Array.from({ length: outside }, (_, i) =>
      person(20 + i, 26 + i, OUTSIDE, i % 2 === 0 ? 'male' : 'female'),
    ),
  ];
  s.manorId = manor;
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = START;
  s.nextId = 1000;
  return s;
}

const sumShares = (s: VillageState): number =>
  (s.labor?.shares ?? []).reduce((sum, share) => sum + share.manDays, 0);

describe('rodina mimo práci vsi (lord.md – Den rodiny)', () => {
  it('práce vsi je bez rodiny a minimum dvorce kryje rodina', () => {
    const s = lordVillage();
    const coverage = craftCoverage(s, START + 1);
    const p = villageProductivity(s, coverage);
    const manor = manorLabor(s, START + 1, coverage.pottery, p);
    expect(manor.dailyMin).toBeGreaterThan(0);
    expect(manor.help).toBe(0);
    const next = advanceVillage(s, START + 1, null);
    // ves dala jen práci 4 dospělých mimo rodinu (dřív 8), k tomu minimum dvorce v domácí práci
    expect(sumShares(next)).toBeCloseTo(4 * p + manor.dailyMin, 1);
    expect(next.lord).toEqual({ trains: true });
    expect(next.labor?.lord).toEqual({ training: 3, field: 0, household: 2 });
  });

  it('se 2 dospělými mimo rodinu pracuje rodina jako dosud (Martin 24. 10. 2026)', () => {
    const next = advanceVillage(lordVillage(2), START + 30, null);
    expect(next.lord).toBeUndefined();
    expect(next.labor?.lord).toBeUndefined();
    expect(next.people.some((p) => p.arms)).toBe(false);
  });

  it('zakladatelé postaví první zemnici – rodina pracuje', () => {
    const s = foundVillage({ seed: 3, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    const next = advanceVillage(s, START + 400, null);
    expect(next.dwellings.length).toBeGreaterThan(0);
    expect(next.constructions.some((c) => c.kind === 'dwelling' && c.dwellingId !== null)).toBe(
      false,
    );
    expect(next.lord).toBeUndefined();
  }, 60_000);
});

describe('zásobník lordHelp v rozdělení dne (rodina ve žních)', () => {
  const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery };
  it('pokryje jen žeň a výmlat, které ves nestihne; co nevyužije, propadne', () => {
    const r = allocateDay({
      ...base,
      capacity: 0,
      lordHelp: 3,
      tasks: [
        { name: 'sow', remaining: 1 },
        { name: 'harvest', remaining: 1 },
      ],
    });
    expect(r.tasks.sow).toBe(0);
    expect(r.tasks.harvest).toBeCloseTo(1);
    expect(r.lordField).toBeCloseTo(1);
    expect(r.common).toBe(0);
  });
  it('minimum dvorce, které rodina nepokryje, jde z práce vsi', () => {
    const r = allocateDay({ ...base, capacity: 2, manorMin: 0.3, tasks: [] });
    expect(r.dailyMin).toBeCloseTo(dailyMinPerHousehold(NO_CRAFTS.pottery) + 0.3);
  });
});

describe('hlad – rodina na pole nejde (lord.md – Kdy jde rodina na pole; Martin 9. 11. 2026)', () => {
  it('při hladu rodina cvičí dál – na pole jde jen ve žních', () => {
    const s = lordVillage();
    s.storesKg = 0;
    const hungry = advanceVillage(s, START + 3, null);
    expect(hungry.chronicle.filter((e) => e.kind === 'hunger-began')).toHaveLength(1);
    expect(hungry.chronicle.some((e) => e.kind === 'lord-to-field')).toBe(false);
    expect(hungry.lord).toEqual({ trains: true });
    expect(hungry.labor?.lord?.field).toBe(0);
  }, 60_000);

  it('převod: rodina na poli z doby pomoci při hladu a pomoc s osevem zmizí – jednou', () => {
    const s = village([kin({ id: 1, age: 40, sex: 'male' })], [dwelling(1)], {
      lord: { trains: true },
    });
    const legacy = s as VillageState & { lord: { field?: unknown; fedDays?: number } };
    legacy.lord.field = { since: DAY, reason: 'hunger' };
    legacy.lord.fedDays = 3;
    s.season = { startDay: DAY, lordHelp: { autumnWinter: 0.3, july: 0.2 } } as FarmSeason;
    const next = withoutSowingHelp(s);
    expect(next.lord).toEqual({ trains: true });
    expect(next.season?.lordHelp).toEqual({ july: 0.2 });
    expect(legacy.lord.fedDays).toBe(3);
    expect(withoutSowingHelp(next)).toBe(next);
  });
});

describe('výcvik den po dni (lord.md – Výcvik a zkušenost)', () => {
  const specs: KinSpec[] = [
    ...couple({ id: 10, age: 50 }, { id: 11, age: 46 }),
    { id: 12, age: 16, sex: 'male', father: 10, mother: 11 },
    { id: 30, age: 30, sex: 'male', home: 2 },
  ];
  it('syn 16 po roce luk ≈ 20 (strop doma 50), vojvoda 50 nepřeroste strop, muž mimo dvorec zapomíná', () => {
    const s = village(
      specs.map((k) => kin(k)),
      [dwelling(1), dwelling(2)],
      { lord: { trains: true } },
    );
    s.people.find((p) => p.id === 10)!.arms = { bow: 90, combat: 0, riding: 0 };
    s.people.find((p) => p.id === 30)!.arms = { bow: 80, combat: 80, riding: 0 };
    for (let d = 1; d <= 365; d++) trainLordDay(s, DAY + d);
    const arms = (id: number): NonNullable<Person['arms']> =>
      s.people.find((p) => p.id === id)!.arms!;
    // strop výcviku doma 50 (war.md – Síla): růst míří k 50, ne ke 100
    expect(arms(12).bow).toBeCloseTo(20, 0);
    expect(arms(12).riding).toBe(0);
    expect(arms(10).bow).toBe(90);
    expect(arms(10).combat).toBeGreaterThan(8);
    expect(arms(10).combat).toBeLessThan(15);
    expect(arms(30).bow).toBeCloseTo(76, 0);
  });
  it('na poli celý den (žně) muži zapomínají, chlapci cvičí dál', () => {
    const s = village(
      [...specs, { id: 13, age: 9, sex: 'male' as const, father: 10, mother: 11 }].map((k) =>
        kin(k),
      ),
      [dwelling(1), dwelling(2)],
      { lord: { trains: true } },
    );
    s.people.find((p) => p.id === 12)!.arms = { bow: 50, combat: 50, riding: 0 };
    trainLordDay(s, DAY + 1, 1);
    expect(s.people.find((p) => p.id === 12)!.arms!.bow).toBeLessThan(50);
    expect(s.people.find((p) => p.id === 13)!.arms!.bow).toBeGreaterThan(0);
  });
});

describe('dopočet po kouscích a starší ves bez `lord` a `arms`', () => {
  it('1 × 365 dní = 73 × 5 dní', () => {
    const s = lordVillage();
    const once = advanceVillage(s, START + 365, null);
    let parts = s;
    for (let k = 1; k <= 73; k++) parts = advanceVillage(parts, START + 5 * k, null);
    expect(JSON.stringify(parts)).toBe(JSON.stringify(once));
    expect(once.people.find((p) => p.id === 12)?.arms?.bow).toBeGreaterThan(20);
  }, 120_000);
});

describe('cvičící rodina a plánování (lord.md – Den rodiny)', () => {
  it('kapacita práce v oknech nepočítá práci cvičící rodiny jako práci vsi', () => {
    const training = lordVillage();
    training.lord = { trains: true };
    const working = lordVillage();
    const day = at(601, 9, 5);
    const coverage = craftCoverage(training, day);
    const withFamily = sowingCapacity(working, day, coverage);
    const without = sowingCapacity(training, day, coverage);
    expect(without.autumnWinter).toBeLessThan(withFamily.autumnWinter);
    expect(without.spring).toBeLessThan(withFamily.spring);
  });

  it('v den přechodu na výcvik vidí všichni čtenáři dne týž stav', () => {
    const transition = lordVillage();
    const trained = lordVillage();
    trained.lord = { trains: true };
    // plánovací den (1. 9.) čte kapacitu osevu před prací dne
    const day = at(601, 9, 1);
    transition.lastDay = day - 1;
    trained.lastDay = day - 1;
    const a = advanceVillage(transition, day, null);
    const b = advanceVillage(trained, day, null);
    expect(a.lord).toEqual({ trains: true });
    // pořadí klíčů se liší (zvěř se doplní před `lord`), obsah ne
    expect(a).toEqual(b);
  });

  it('ženy rodiny nejdou do lehké práce a chlapec 7–13 let na pole', () => {
    const s = lordVillage();
    const day = START + 1;
    const coverage = craftCoverage(s, day);
    const p = villageProductivity(s, coverage);
    expect(craftLightLabor(s, day, craftHouseholds(s), coverage.pottery, p)).toBe(0);
    const boy = s.people.find((x) => x.id === 14)!;
    expect(laborPerDay(boy, day)).toBe(0);
    // ve žních dá rodina podíl dne celé práce dospělých po minimu dvorce (muži i ženy)
    const manor = manorLabor(s, day, coverage.pottery, p);
    const adults = s.people.filter((x) => [10, 11, 12, 13].includes(x.id));
    const capacity = adults.reduce((sum, x) => sum + laborPerDay(x, day), 0) * p;
    expect(manor.free).toBeCloseTo(capacity - manor.dailyMin, 5);
  });
});
