import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { storedWaterCartDrive, waterCartPlan, type WaterCartPlan } from '../cart-jobs';
import { morningWater, ploughWindowsToday, waterHouseholdsToday } from '../morning-water';
import { MORNING_WATER } from '../rules';
import { ploughTeamsAfield } from '../plough-trip';
import { advanceVillage } from '../simulate';
import type { FieldPart, LaborShare, Person, VillageState } from '../types';
import { createCropWork } from '../year-plan';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Voda ráno ve dny orby (wagons.md – Voda ráno ve dny orby; Martin 24. 10. 2026: „Rozhodne
// ekonomika“): pár od rádla sveze ráno vodu, když orba dne nechá páru volnou chvíli, nebo když
// okno orby má rezervu – jinak má orba přednost.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;

const plan = (cartDays: number, saved = 0.17, crew = 0.05): WaterCartPlan => ({
  water: [0.01],
  crew,
  saved,
  litres: 300,
  trips: 1,
  cartDays,
  carts: 1,
  kind: 'four-wheel',
  spot: { x: 0, z: 0 },
});

describe('morningWater – rozhodne ekonomika', () => {
  const capacity = 1.8;
  it('s rezervou okna pár ráno sveze vodu a rádla zorají o jeho podíl dne méně', () => {
    const m = morningWater({
      plan: () => plan(0.125),
      capacity,
      pairs: 1,
      planned: capacity,
      windows: [{ need: 6, daysLeft: 30 }],
    })!;
    expect(m.share).toBe(0.125);
    expect(m.cut).toBeCloseTo(0.125 * capacity, 12);
    expect(m.gain).toBeCloseTo(0.12, 12);
  });

  it('těsné okno – orba má přednost', () => {
    const tight = { need: 8, daysLeft: 4 };
    expect(
      morningWater({
        plan: () => plan(0.125),
        capacity,
        pairs: 1,
        planned: capacity,
        windows: [tight],
      }),
    ).toBeNull();
    // i pozdější okno se počítá součtem s dřívějším
    expect(
      morningWater({
        plan: () => plan(0.125),
        capacity,
        pairs: 1,
        planned: capacity,
        windows: [
          { need: 2, daysLeft: 30 },
          { need: 45, daysLeft: 31 },
        ],
      }),
    ).toBeNull();
  });

  it('okno bez rezervy, ale s volným místem – cena orby je menší než přínos vody', () => {
    // zbytek 4,4 z 7,2 (r ≈ 0,61): riziko ≈ 0,28 × odložených 0,225 čd ≈ 0,06 < přínos 0,12
    const m = morningWater({
      plan: () => plan(0.125),
      capacity,
      pairs: 1,
      planned: capacity,
      windows: [{ need: 6, daysLeft: 4 }],
    })!;
    expect(m.cost).toBeGreaterThan(0);
    expect(m.cost).toBeLessThan(m.gain);
    // větší úspora vyhraje i nad dražší orbou (tentýž zbytek, těsnější okno), menší prohraje
    const tighter = [{ need: 7.2, daysLeft: 4 }];
    expect(
      morningWater({
        plan: () => plan(0.125, 0.6),
        capacity,
        pairs: 1,
        planned: capacity,
        windows: tighter,
      }),
    ).not.toBeNull();
    expect(
      morningWater({
        plan: () => plan(0.125),
        capacity,
        pairs: 1,
        planned: capacity,
        windows: tighter,
      }),
    ).toBeNull();
  });

  it('rezerva se měří proti skutečnému tempu orby, ne proti kapacitě rádel', () => {
    // pět párů (kapacita 9), ale lidé naplánovali orbu jen na 8,9 čd dnes: tempo je to, co se
    // opravdu zorá (8,9), ne kapacita; okno 40 čd na 5 dní by při plné kapacitě (45) vycházelo
    // jako 0,8 – při tempu 8,9 je to 0,9+ → orba má přednost
    const windows = [{ need: 40, daysLeft: 5 }];
    expect(
      morningWater({
        plan: () => plan(0.25),
        capacity: 9,
        pairs: 5,
        planned: 8.9,
        windows,
      }),
    ).toBeNull();
    // stejné okno a plně zaměstnaná rádla – zkrácení by stálo víc než voda dává
    expect(
      morningWater({ plan: () => plan(0.25), capacity: 9, pairs: 5, planned: 9, windows }),
    ).toBeNull();
    // ves s málo rukama (orba 1,0 z kapacity 9): pár stejně stojí, voda neubere z orby nic
    const few = morningWater({
      plan: () => plan(0.25),
      capacity: 9,
      pairs: 5,
      planned: 1,
      windows,
    })!;
    expect(few.cut).toBe(0);
    expect(few.cost).toBe(0);
  });

  it('plán vody se nepočítá, když osev nelze stihnout ani bez zkrácení orby', () => {
    let called = false;
    const m = morningWater({
      plan: () => {
        called = true;
        return plan(0.1);
      },
      capacity,
      pairs: 1,
      planned: capacity,
      windows: [{ need: 30, daysLeft: 3 }],
    });
    expect(m).toBeNull();
    expect(called).toBe(false);
  });

  it('den bez orby nebo s kouskem orby – voda nic nestojí, i v těsném okně', () => {
    const tight = [{ need: 60, daysLeft: 2 }];
    const none = morningWater({
      plan: () => plan(0.125),
      capacity,
      pairs: 1,
      planned: 0,
      windows: tight,
    });
    expect(none?.cut).toBe(0);
    const bit = morningWater({
      plan: () => plan(0.125),
      capacity,
      pairs: 1,
      planned: 0.1,
      windows: tight,
    });
    expect(bit?.cut).toBe(0);
    // dva páry – druhý pár orá dál, ztráta jen podílem jednoho páru
    const two = morningWater({
      plan: () => plan(0.125),
      capacity: 2 * capacity,
      pairs: 2,
      planned: 2 * capacity,
      windows: [{ need: 6, daysLeft: 30 }],
    })!;
    expect(two.cut).toBeCloseTo(0.125 * capacity, 12);
  });

  it('víc než ráno (čtvrtina dne) nebo bez úspory – pár zůstane u rádla', () => {
    const windows = [{ need: 6, daysLeft: 30 }];
    const long = plan(MORNING_WATER.maxTeamShare + 0.01);
    expect(morningWater({ plan: () => long, capacity, pairs: 1, planned: 0, windows })).toBeNull();
    const futile = plan(0.1, 0.05, 0.05);
    expect(
      morningWater({ plan: () => futile, capacity, pairs: 1, planned: 0, windows }),
    ).toBeNull();
    expect(
      morningWater({ plan: () => plan(0.1), capacity, pairs: 0, planned: 0, windows }),
    ).toBeNull();
  });
});

// --- ves ---------------------------------------------------------------------------------------

const person = (id: number, years: number, dwellingId: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

const part = (id: number, x: number): FieldPart => ({
  id,
  fieldId: 1,
  areaM2: 10_000,
  distanceM: 100,
  naturalFertility: 70,
  fertilityShare: 1,
  bonusUntilDay: null,
  state: 'sown',
  sownYears: 1,
  fallowSinceDay: null,
  foundingCost: 0,
  foundingDone: 0,
  surface: 'meadow',
  cell: { x, y: 3 },
});

/**
 * Ves daleko od vody, jedno spřežení, čtyřkolák a jarní orba dvou hektarů; s `hands` dospělými
 * navíc orají rádla celou kapacitu, bez nich lidem orba nezbude (setí má přednost).
 */
function ploughVillage(day: number, hands = 8): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: -135, rotation: 0 } }),
  );
  s.people = [25, 25, 20, 19, 5].map((age, i) => person(2 + i, age, 1, day));
  // pomocníci v sousedním obydlí (ne rodina vojvody – ta by cvičila)
  if (hands > 0) {
    s.dwellings.push({ ...s.dwellings[0]!, id: 2, position: { x: 15, z: -135, rotation: 0 } });
    for (let k = 0; k < hands; k++) s.people.push(person(20 + k, 30, 2, day));
  }
  s.constructions = [];
  s.storesKg = 5_000;
  s.lastDay = day;
  s.nextId = 100;
  s.pens = [
    {
      id: 900,
      cell: { x: 8, y: 9 },
      x: -22.5,
      z: -7.5,
      builtDay: day - 800,
      team: { readyDay: day - 10 },
      training: null,
    },
  ];
  s.carts = [{ id: 1, kind: 'four-wheel', builtDay: day - 10 }];
  s.fields = [{ id: 1 }];
  s.parts = [part(1, 2), part(2, 3)];
  s.plan = { plannedDay: at(600, 9, 1), ...createCropWork(s.parts, at(600, 9, 1), 0, true) };
  return s;
}

const shares = (s: VillageState, activity: LaborShare['activity']): LaborShare[] =>
  (s.labor?.shares ?? []).filter((share) => share.activity === activity);
const manDays = (list: readonly LaborShare[]): number =>
  list.reduce((sum, share) => sum + share.manDays, 0);

describe('voda ráno ve dny orby (wagons.md – Voda ráno ve dny orby)', () => {
  const EARLY = at(601, 3, 2);
  const LATE = at(601, 4, 29);

  it('okno s rezervou – v den výjezdu ráno voda vozem, orba o podíl dne páru menší', () => {
    const s = ploughVillage(EARLY - 3);
    expect(ploughWindowsToday(s, EARLY, () => 1)[0]!.daysLeft).toBe(59);
    // chůze k vodě se změří první den (v únoru, bez orby) – voda vozem v den výjezdu (1. 3.)
    const next = advanceVillage(s, EARLY - 1, null, LANDSCAPE);
    const water = shares(next, 'haul').filter((h) => h.job === 'water');
    expect(water).toHaveLength(1);
    expect(water[0]!.fourWheel).toBe(1);
    const plain = ploughVillage(EARLY - 3);
    delete plain.carts;
    const walking = advanceVillage(plain, EARLY - 1, null, LANDSCAPE);
    const ploughed = manDays(shares(next, 'plough'));
    expect(ploughed).toBeGreaterThan(0);
    expect(ploughed).toBeLessThan(manDays(shares(walking, 'plough')));
    // scéna = simulace: tytéž domácnosti a týž plán vozu jako práce dne
    const plan = waterCartPlan(
      waterHouseholdsToday(next, next.lastDay, new Set()),
      water[0]!.carts ?? 1,
      storedWaterCartDrive(next, 'four-wheel'),
      'four-wheel',
    )!;
    expect(plan.crew).toBeCloseTo(water[0]!.manDays, 3);
  }, 60_000);

  it('těsné okno osevu – voli celý den orají, voda se nosí', () => {
    const s = ploughVillage(LATE - 2);
    const next = advanceVillage(s, LATE, null, LANDSCAPE);
    expect(manDays(shares(next, 'plough'))).toBeGreaterThan(0);
    expect(shares(next, 'haul').filter((h) => h.job === 'water')).toEqual([]);
  }, 60_000);

  it('pár na poli vodu nesveze – další dny orby se voda nosí (oxen.md – Spřežení zůstane na poli)', () => {
    const s = advanceVillage(ploughVillage(EARLY - 3), EARLY - 1, null, LANDSCAPE);
    expect(ploughTeamsAfield(s)).toBe(true);
    const next = advanceVillage(s, EARLY, null, LANDSCAPE);
    expect(manDays(shares(next, 'plough'))).toBeGreaterThan(0);
    expect(shares(next, 'haul').filter((h) => h.job === 'water')).toEqual([]);
  }, 60_000);

  it('dopočet najednou = po kouscích', () => {
    const s = ploughVillage(EARLY - 2);
    const whole = advanceVillage(s, EARLY + 5, null, LANDSCAPE);
    let pieces = s;
    for (const to of [EARLY + 1, EARLY + 3, EARLY + 5]) {
      pieces = advanceVillage(pieces, to, null, LANDSCAPE);
    }
    expect(pieces).toEqual(whole);
  }, 120_000);
});
