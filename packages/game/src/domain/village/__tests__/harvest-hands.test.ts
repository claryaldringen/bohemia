import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { craftCoverage, craftHarvestLabor, newWorkshop, workshopLabor } from '../crafts';
import { harvestHandsDay, harvestHelperLabor, HARVEST_HANDS_MONTHS } from '../harvest-hands';
import { allocateDay } from '../labor';
import { harvestFieldIds, lordApartIds, lordFamily, lordRides, manorLabor } from '../lord';
import { NO_CRAFTS, dailyMinPerHousehold } from '../productivity';
import {
  CRAFT_BASE,
  DAY_CHORES,
  FIELD_WORK_PER_HA,
  HARVEST_HELPERS,
  HARVEST_WORK_PER_HA,
  LABOR_PER_DAY,
} from '../rules';
import { SOWING_CAPACITY_WINDOWS, windowDaylightLeft, windowDaylightWithout } from '../sowing';
import { advanceVillage } from '../simulate';
import { sowingCapacity, villageProductivity } from '../simulate-plan';
import type { Person, VillageState } from '../types';
import { dwelling } from './kin-fixtures';
import { threshTasks } from '../threshing';
import { seasonCrops } from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

// Žně a výmlat všemi rukama (fields.md – Žně všemi rukama; Martin 24. 10. 2026: „Dílny i vojvodova
// rodina“): ve žňové dny jdou na žeň a výmlat i řemeslníci se syny a cvičící muži vojvodovy
// rodiny, výrostci od 10 let a starší dají po 0,5 čd; mimo žně řemeslo a výcvik.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const START = at(600, 8, 31);
const WORKSHOP = 50;
const OUTSIDE = 60;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: START - Math.ceil(years * 365.25) - 10, dwellingId, sex, ...extra });

const parts = (count: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves k 31. 8. 600: cvičící dvorec (vojvoda 40 se ženou, syn 17 se snachou), hrnčířská dílna
 * (hrnčíř 30 se ženou a synem 11), 4 dospělí jinde a 40 osetých dílů jaře.
 */
function harvestVillage(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({
      seed: 42,
      day: at(600, 6, 1),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: parts(40),
      },
    }),
  );
  const manor = s.dwellings[0]!.id;
  s.dwellings.push(
    { ...dwelling(OUTSIDE), position: { x: 30, z: 0, rotation: 0 } },
    {
      id: WORKSHOP,
      type: CRAFT_BASE.potter,
      builtDay: START,
      condition: 1,
      position: { x: 40, z: 0, rotation: 0 },
      workshop: newWorkshop('potter'),
    },
  );
  s.people = [
    person(10, 40, manor, 'male', { spouseId: 11 }),
    person(11, 38, manor, 'female', { spouseId: 10 }),
    person(12, 17, manor, 'male', { fatherId: 10, motherId: 11, spouseId: 13 }),
    person(13, 16, manor, 'female', { spouseId: 12 }),
    person(30, 30, WORKSHOP, 'male', { spouseId: 31 }),
    person(31, 28, WORKSHOP, 'female', { spouseId: 30 }),
    person(32, 11, WORKSHOP, 'male', { fatherId: 30, motherId: 31 }),
    ...Array.from({ length: 4 }, (_, i) =>
      person(20 + i, 26 + i, OUTSIDE, i % 2 === 0 ? 'male' : 'female'),
    ),
  ];
  s.manorId = manor;
  s.constructions = [];
  s.storesKg = 8000;
  s.lastDay = START;
  s.nextId = 1000;
  s.lord = { trains: true };
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
    p.sownYears = 1;
    p.fertilityShare = 0.9;
  }
  return s;
}

describe('žňový den (harvestHandsDay)', () => {
  it('okna žní a výmlatu všech plodin – červenec až září', () => {
    expect([...HARVEST_HANDS_MONTHS].sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });

  it('jen když je v okně co sklízet nebo mlátit', () => {
    const s = harvestVillage();
    s.season = null;
    expect(harvestHandsDay(s, at(600, 9, 10))).toBe(false);
    s.sheaves = { grainKg: 100, legumesKg: 0, work: { spring: 5 } };
    expect(harvestHandsDay(s, at(600, 9, 10))).toBe(true);
    // výmlat jaře po okně (říjen) už žňový den není
    expect(harvestHandsDay(s, at(600, 10, 10))).toBe(false);
  });

  it('výmlat bez humna a bez nouzového výmlatu žňový den není – řemeslo a výcvik běží', () => {
    const s = harvestVillage();
    s.season = null;
    s.sheaves = { grainKg: 100, legumesKg: 0, work: { spring: 5 } };
    const day = at(600, 9, 10);
    const canThresh = threshTasks(s, day).length > 0;
    expect(harvestHandsDay(s, day)).toBe(canThresh);
    if (!canThresh) {
      expect(workshopLabor(s, day, WORKSHOP, 0, 1).harvest).toBe(0);
      expect(manorLabor(s, day, 0, 1).help).toBe(0);
    }
  });

  it('žeň z plánu: v okně sklizně ano, před ním ne', () => {
    const s = advanceVillage(harvestVillage(), at(600, 9, 1), null, null);
    expect(s.season).not.toBeNull();
    s.sheaves = { grainKg: 0, legumesKg: 0 };
    // plán zasetý a zapletý – žeň čeká
    for (const { work } of seasonCrops(s.season!)) {
      for (const task of ['reclaim', 'dig', 'sow', 'weed'] as const) {
        work.done[task] = work.required[task];
      }
      if (work.plough) work.plough.done = work.plough.required;
    }
    expect(harvestHandsDay(s, at(601, 6, 10))).toBe(false);
    expect([at(601, 7, 10), at(601, 8, 10)].some((d) => harvestHandsDay(s, d))).toBe(true);
  });
});

describe('jízdy vojvodovy rodiny ve žních (lordRides)', () => {
  it('ve žňový den, kdy rodina pomáhá na poli, nejezdí jen ten, kdo jde na pole', () => {
    const s = advanceVillage(harvestVillage(), at(600, 9, 1), null, null);
    s.lord = { trains: true };
    for (const { work } of seasonCrops(s.season!)) {
      for (const task of ['reclaim', 'dig', 'sow', 'weed'] as const) {
        work.done[task] = work.required[task];
      }
      if (work.plough) work.plough.done = work.plough.required;
    }
    s.sheaves = { grainKg: 0, legumesKg: 0 };
    const harvestDay = [at(601, 7, 10), at(601, 8, 10)].find((d) => harvestHandsDay(s, d))!;
    expect(harvestDay).toBeDefined();
    const family = lordFamily(s, harvestDay);
    delete s.season!.lordHelp;
    expect(lordRides(s, harvestDay)).not.toBeNull();
    expect(harvestFieldIds(s, harvestDay, family)).toEqual(new Set());
    // malá pomoc pokryjí ženy rodiny – muži jezdí (lord.md – Kdy jde rodina na pole, pořadí)
    s.season!.lordHelp = { july: 0.05, august: 0.05 };
    expect(harvestFieldIds(s, harvestDay, family)).toEqual(new Set());
    // celá rodina na poli: syn i vojvoda nejezdí, jízdy dne zůstávají pro ostatní
    s.season!.lordHelp = { july: 1, august: 1 };
    expect(harvestFieldIds(s, harvestDay, family)).toEqual(new Set([10, 12]));
    expect(lordRides(s, harvestDay)).not.toBeNull();
    // mimo žně se jezdí (výcvik běží)
    expect(lordRides(s, at(601, 5, 10))).not.toBeNull();
  });
});

describe('řemeslníci ve žních (workshopLabor, craftHarvestLabor)', () => {
  it('ve žňový den řemeslo stojí, hrnčíř jde na žeň; žena dál domácnost a lehké práce', () => {
    const s = harvestVillage();
    s.season = null;
    s.sheaves = { grainKg: 100, legumesKg: 0, work: { spring: 5 } };
    const day = at(600, 9, 10);
    const calm = workshopLabor(s, at(600, 10, 10), WORKSHOP, 0);
    const harvest = workshopLabor(s, day, WORKSHOP, 0);
    expect(calm.harvest).toBe(0);
    expect(calm.craft).toBeGreaterThan(0);
    expect(harvest.craft).toBe(0);
    expect(harvest.harvest).toBeCloseTo(calm.craft, 12);
    // ve žňový den poloviční minimum domácnosti – ženě zbude víc na lehké práce (population.md –
    // Skladba dne podle ročního období)
    expect(harvest.light).toBeCloseTo(
      calm.light + dailyMinPerHousehold(0) * (1 - DAY_CHORES.harvestMinimumShare),
      12,
    );
    expect(craftHarvestLabor(s, day, new Set([WORKSHOP]), 0, 1)).toBeCloseTo(calm.craft, 12);
    expect(craftHarvestLabor(s, at(600, 10, 10), new Set([WORKSHOP]), 0, 1)).toBe(0);
  });
});

describe('vojvodova rodina ve žních (manorLabor)', () => {
  it('ve žňový den dá celá rodina jen podíl z plánu, když ves žně nestíhá; jinak nic', () => {
    const s = advanceVillage(harvestVillage(), at(600, 9, 1), null, null);
    s.sheaves = { grainKg: 0, legumesKg: 0 };
    for (const { work } of seasonCrops(s.season!)) {
      for (const task of ['reclaim', 'dig', 'sow', 'weed'] as const) {
        work.done[task] = work.required[task];
      }
      if (work.plough) work.plough.done = work.plough.required;
    }
    const day = [at(601, 7, 10), at(601, 8, 10)].find((d) => harvestHandsDay(s, d))!;
    const coverage = craftCoverage(s, day);
    const p = villageProductivity(s, coverage);
    // ves žně stihne sama – rodina cvičí
    delete s.season!.lordHelp;
    expect(manorLabor(s, day, coverage.pottery, p).help).toBe(0);
    // ves nestíhá – celá rodina (muži, ženy i dcery) dá podíl dne, který chybí
    s.season!.lordHelp = { july: 0.4, august: 0.4 };
    const helping = manorLabor(s, day, coverage.pottery, p);
    expect(helping.free).toBeGreaterThan(helping.freeMen);
    expect(helping.help).toBeCloseTo(0.4 * helping.free, 12);
    // mimo žňový den nic
    expect(manorLabor(s, at(601, 6, 10), coverage.pottery, p).help).toBe(0);
  });
});

describe('výrostci a starší ve žních (harvestHelperLabor)', () => {
  it('výrostek od 10 let a starší po 0,5 čd, mladší dítě a dospělý ne, cvičící rodina ne', () => {
    const day = START;
    const people = [
      person(1, 9, 1, 'male'),
      person(2, 10, 1, 'female'),
      person(3, 13, 1, 'male'),
      person(4, 30, 1, 'male'),
      person(5, 50, 1, 'female'),
      person(6, 12, 2, 'male'),
    ];
    const base = harvestVillage();
    const view = (list: Person[]): VillageState => ({
      ...base,
      people: list,
      livestock: undefined,
    });
    // bez stád pasení 0, starší bez dvorce nad minimum (jediný starší nekryje ani minimum domácnosti)
    expect(harvestHelperLabor(view(people.filter((p) => p.id !== 5)), day)).toBeCloseTo(
      3 * HARVEST_HELPERS.perDay,
      12,
    );
    expect(
      harvestHelperLabor(view(people.filter((p) => p.id !== 5)), day, new Set([6])),
    ).toBeCloseTo(2 * HARVEST_HELPERS.perDay, 12);
  });

  it('starší kryje napřed poloviční minimum žňového dne, žeň dá zbytek (celkem 0,5, ne +0,5)', () => {
    const base = harvestVillage();
    const elder = (id: number, dwellingId: number): Person => person(id, 55, dwellingId, 'female');
    const view = (list: Person[]): VillageState => ({
      ...base,
      people: list,
      livestock: undefined,
    });
    const one = [elder(1, OUTSIDE), person(2, 30, OUTSIDE, 'male')];
    // ve žňový den se vaří méně – minimum poloviční (population.md – Skladba dne podle ročního
    // období), starší dá žni, co mu nad ně zbude
    expect(harvestHelperLabor(view(one), START)).toBeCloseTo(
      LABOR_PER_DAY.elder - dailyMinPerHousehold(0) * DAY_CHORES.harvestMinimumShare,
      12,
    );
    // dva starší v domácnosti: minimum (< 1 čd) kryjí napřed, žeň dá jen zbytek
    const two = [elder(1, OUTSIDE), elder(3, OUTSIDE), person(2, 30, OUTSIDE, 'male')];
    const labor = harvestHelperLabor(view(two), START);
    expect(labor).toBeGreaterThan(0);
    expect(labor).toBeLessThan(2 * HARVEST_HELPERS.perDay);
  });

  it('výrostek, který pase stáda, dá žeň jen do celkových 0,5 čd', () => {
    const base = harvestVillage();
    const list = [person(1, 11, OUTSIDE, 'male'), person(2, 30, OUTSIDE, 'male')];
    const noHerds = harvestHelperLabor({ ...base, people: list, livestock: undefined }, START);
    expect(noHerds).toBeCloseTo(HARVEST_HELPERS.perDay, 12);
    const herds = harvestVillage().livestock;
    if (herds) {
      const withHerds = harvestHelperLabor({ ...base, people: list, livestock: herds }, START);
      expect(withHerds).toBeLessThanOrEqual(noHerds);
    }
  });
});

describe('práce žní na hektar (fields.md – Práce)', () => {
  it('sklizeň srpem a vázání 20 (s řemesly 15), odnos 10 – žeň 30 (25)', () => {
    expect(HARVEST_WORK_PER_HA.reap).toEqual({ worst: 20, best: 15 });
    expect(HARVEST_WORK_PER_HA.carry).toEqual({ worst: 10, best: 10 });
    expect(FIELD_WORK_PER_HA.harvest).toEqual({ worst: 30, best: 25 });
  });
});

describe('práce dne (allocateDay – harvestHands, lordHelp)', () => {
  const base = { householdElders: [0], potteryCoverage: NO_CRAFTS.pottery };

  it('žňové ruce jen na žeň a výmlat, před prací vsi – ves má víc volné práce', () => {
    const tasks = [
      { name: 'harvest' as const, remaining: 3 },
      { name: 'dig' as const, remaining: 2 },
      { name: 'thresh' as const, remaining: 1 },
    ];
    const alone = allocateDay({ ...base, capacity: 10, tasks });
    const hands = allocateDay({ ...base, capacity: 10, harvestHands: 2, lordHelp: 1, tasks });
    expect(hands.tasks.harvest).toBeCloseTo(3, 12);
    expect(hands.tasks.dig).toBeCloseTo(2, 12);
    expect(hands.harvestHands).toBeCloseTo(2, 12);
    // rodina až po práci vsi – ves dnes žně stihla, rodina nepomůže
    expect(hands.lordField).toBe(0);
    expect(hands.common).toBeCloseTo(alone.common + 2, 12);
  });

  it('kopání žňové ruce nedělají a nevyužitá práce propadne', () => {
    const a = allocateDay({
      ...base,
      capacity: 0,
      harvestHands: 0.5,
      lordHelp: 5,
      tasks: [
        { name: 'dig', remaining: 2 },
        { name: 'thresh', remaining: 1 },
      ],
    });
    expect(a.tasks.dig).toBe(0);
    expect(a.tasks.thresh).toBeCloseTo(1, 12);
    expect(a.harvestHands).toBeCloseTo(0.5, 12);
    // rodina jen výmlat, který ves nestihla – kopání ne
    expect(a.lordField).toBeCloseTo(0.5, 12);
    expect(a.common).toBe(0);
  });
});

describe('plán osevu (sowingCapacity)', () => {
  it('červenec a srpen počítají i se žňovými rukama dílny, jaro ne', () => {
    const s = harvestVillage();
    const day = at(600, 9, 1);
    const coverage = craftCoverage(s, day);
    const p = villageProductivity(s, coverage);
    const capacity = sowingCapacity(s, day, coverage);
    const labor = workshopLabor(s, day, WORKSHOP, coverage.pottery, p);
    // syn hrnčíře (11 let) je výrostek – celkem 0,5 čd (po odečtení pasení)
    const helpers = harvestHelperLabor(s, day, lordApartIds(s, day), p, coverage.pottery) * p;
    expect(helpers).toBeGreaterThan(0);
    expect(helpers).toBeLessThanOrEqual(HARVEST_HELPERS.perDay * p + 1e-9);
    // rodina vojvody ve žních jen s `lord` (lord.md – Kdy jde rodina na pole)
    const hands = labor.craft + labor.harvest + helpers;
    // žně se skladbou žňového dne – domácnost OUTSIDE má poloviční minimum (population.md –
    // Skladba dne podle ročního období; dvorec kryje cvičící rodina)
    const gain = dailyMinPerHousehold(coverage.pottery) * (1 - DAY_CHORES.harvestMinimumShare);
    // plán kapacity počítá světlé dny oken (délka dne) a den rezervy v okně setí
    // (SOW_AFTER_DIG_DAYS)
    const w = SOWING_CAPACITY_WINDOWS;
    const springPerDay = capacity.spring / windowDaylightWithout(day, w.spring, 1);
    expect(capacity.july / windowDaylightLeft(day, w.july) - springPerDay).toBeCloseTo(
      hands + gain,
      9,
    );
    expect(capacity.august / windowDaylightLeft(day, w.august) - springPerDay).toBeCloseTo(
      hands + gain,
      9,
    );
  });
});
