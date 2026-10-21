import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  cartTripManDays,
  kilnCartDrive,
  kilnCartOffer,
  villageCartDrives,
  waterCartDrive,
  waterCartPlan,
} from '../cart-jobs';
import { newWorkshop } from '../crafts';
import { householdWater } from '../labor';
import {
  CART_JOBS,
  CHARCOAL_KILN,
  CRAFT_BASE,
  ORCHARD,
  SMITH_SUPPLY,
  WATER_FETCHING,
} from '../rules';
import { basketManDaysPerKg } from '../smith-supply';
import { advanceVillage } from '../simulate';
import type { Craft, FieldPart, LaborShare, Person, Position, VillageState } from '../types';
import { createCropWork } from '../year-plan';
import { LANDSCAPE } from './paths-fixtures';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Co vozy vozí mimo svoz (wagons.md – Co vozy vozí): uhlí z milíře ke kováři, osivo na pole, voda
// v sudech – v tomto pořadí, jen se spřežením doma, jen kam vůz dojede a jen když ušetří práci.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
/** 10. 1. – žádná polní práce, uhlíř nesází. */
const DAY = at(601, 1, 10);
const BURNER = 50;
const SMITH = 51;

const person = (id: number, years: number, dwellingId: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

function addWorkshop(s: VillageState, craft: Craft, id: number, position: Position): void {
  s.dwellings.push({
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { ...position },
    workshop: newWorkshop(craft),
  });
  s.people.push(person(id * 10, 24, id, s.lastDay), person(id * 10 + 1, 22, id, s.lastDay));
}

/** Ves s plnou domácností (obydlí 1 v `home`), ohradou se spřežením a dvoukolákem. */
function village(day = DAY, home: Position = { x: 0, z: 0, rotation: 0 }): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day, dwellingPosition: home }));
  s.people = [25, 25, 20, 19, 5].map((age, i) => person(2 + i, age, 1, day));
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
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: day - 10 }];
  return s;
}

/** Uhlíř (50) s vypáleným milířem u dílny a kovář (51) bez uhlí – uhlíř dnes nosí. */
function withCharcoal(s: VillageState): VillageState {
  addWorkshop(s, 'burner', BURNER, { x: 40, z: 0, rotation: 0 });
  addWorkshop(s, 'smith', SMITH, { x: 40, z: 40, rotation: 0 });
  s.dwellings.find((d) => d.id === BURNER)!.workshop!.kilns = [
    {
      id: 990,
      // milíř u dávky buků kus za zemnicí (crafts.md – Milíř u skácených buků)
      site: { x: 70, z: 0 },
      trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({ id: null, cost: 2 })),
      stage: 'draw',
      prepared: CHARCOAL_KILN.trees,
      done: 0,
      charcoalKg: CHARCOAL_KILN.trees * 120,
    },
  ];
  s.crafts = { charcoalKg: 0, potteryKg: 0 };
  return s;
}

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

/** Jarní setí: dva hektary jaře, kopání hotové – 10. 4. se seje. */
function withSowing(s: VillageState): VillageState {
  s.fields = [{ id: 1 }];
  s.parts = [part(1, 2), part(2, 3)];
  const work = createCropWork(s.parts, at(600, 9, 1), 0);
  work.done.dig = work.required.dig;
  work.done.reclaim = work.required.reclaim;
  s.plan = { plannedDay: at(600, 9, 1), ...work };
  return s;
}

const SOW_DAY = at(601, 4, 10);

const hauls = (s: VillageState): LaborShare[] =>
  (s.labor?.shares ?? []).filter((share) => share.activity === 'haul');

describe('uhlí z milíře ke kováři (wagons.md – Co vozy vozí, crafts.md – Uhlíř)', () => {
  it('vůz, který nesváží, odveze uhlí – jízda k milíři se uloží, posádka u milíře', () => {
    const s = withCharcoal(village());
    const next = advanceVillage(s, DAY + 1, null);
    const kiln = next.dwellings.find((d) => d.id === BURNER)!.workshop!.kilns![0]!;
    expect(kiln.cart).toBeTruthy();
    const haul = hauls(next).find((share) => share.job === 'charcoal');
    expect(haul?.carts).toBe(1);
    expect(haul?.target.kind).toBe('kiln');
    expect(next.crafts!.charcoalKg).toBeGreaterThan(0);
  });

  it('uhlí přiveze sedlák z práce vsi – kovář nenosí, uhlíř jen vytahá', () => {
    const run = (cart: boolean): VillageState => {
      const s = withCharcoal(village());
      if (!cart) delete s.carts;
      return advanceVillage(s, DAY + 1, null);
    };
    const withCart = run(true);
    const without = run(false);
    const shares = (s: VillageState): LaborShare[] => s.labor?.shares ?? [];
    const haul = hauls(withCart).find((share) => share.job === 'charcoal')!;
    // sedlák z práce vsi – před úlohami dne (DayAllocation.carting)
    expect(haul.carts).toBe(1);
    expect(haul.target).toMatchObject({ kind: 'kiln', id: BURNER });
    // s vozem nikdo z kovárny nenosí, bez vozu nosí kovář (syny nemá) – víc práce než sedlák
    expect(shares(withCart).some((share) => share.activity === 'fetch')).toBe(false);
    const fetch = shares(without).find((share) => share.activity === 'fetch')!;
    expect(fetch.target).toMatchObject({ kind: 'kiln', id: BURNER, from: SMITH });
    expect(fetch.manDays).toBeGreaterThan(haul.manDays);
    // uhlí dorazí stejně (u kováře + spálené v houbě – production-chains.md, Kovář)
    const charcoal = (s: VillageState): number =>
      s.crafts!.charcoalKg + (s.crafts!.bloomKg ?? 0) * 20;
    expect(charcoal(withCart)).toBeCloseTo(charcoal(without), 2);
    // uhlíř vytahá a vytřídí stejně – s vozem i bez něj (odnos dělá kovárna nebo vůz)
    const burner = (s: VillageState): number =>
      shares(s).find(
        (share) =>
          share.activity === 'craft' &&
          share.target.kind === 'dwelling' &&
          share.target.id === BURNER,
      )?.manDays ?? 0;
    expect(burner(withCart)).toBeCloseTo(burner(without), 6);
  });

  it('vůz se nevezme, když jízda stojí víc než nošení v koších', () => {
    const footPerKg = basketManDaysPerKg(40, SMITH_SUPPLY.basketKg.charcoal);
    expect(kilnCartOffer({ costM: 10_000, x: 0, z: 0 }, footPerKg)).toBeNull();
    expect(kilnCartOffer(null, footPerKg)).toBeNull();
    expect(kilnCartOffer({ costM: 50, x: 0, z: 0 }, footPerKg)).not.toBeNull();
    // sedlák jede sám – práce na kg = jedna jízda jednoho člověka ÷ náklad
    expect(kilnCartOffer({ costM: 50, x: 0, z: 0 }, footPerKg)!.manDaysPerKg).toBeCloseTo(
      cartTripManDays(50, CART_JOBS.charcoal.stopS, 1) / CART_JOBS.charcoal.loadKg,
      12,
    );
  });
});

describe('levnější vůz pro uhlí a vodu (wagons.md – Co se vozí a na čem)', () => {
  it('čtyřkolák veze dvakrát víc se stejnou posádkou – práce na kg poloviční', () => {
    const footPerKg = basketManDaysPerKg(400, SMITH_SUPPLY.basketKg.charcoal);
    const drive = { costM: 300, x: 0, z: 0 };
    const two = kilnCartOffer(drive, footPerKg)!;
    const four = kilnCartOffer(drive, footPerKg, 'four-wheel')!;
    expect(four.manDaysPerKg).toBeCloseTo(two.manDaysPerKg / 2, 12);
    expect(four.maxKg).toBeCloseTo(two.maxKg * 2, 9);
    const far = [{ dwellingId: 1, people: 10, labor: 2 }];
    const water2 = waterCartPlan(far, 1, drive)!;
    const water4 = waterCartPlan(far, 1, drive, 'four-wheel')!;
    expect(water4.kind).toBe('four-wheel');
    expect(water4.crew).toBeCloseTo(water2.crew / 2, 12);
  });

  it('bez krajiny (bez cest) čtyřkolák nikam nejede', () => {
    const s = withCharcoal(village(DAY));
    expect(villageCartDrives(s, DAY, null, null, 'four-wheel')).toBeNull();
    expect(villageCartDrives(s, DAY, null, null)).not.toBeNull();
  });
});

describe('jablka ze sadu vozem (orchard.md – Jablka vozem)', () => {
  const HARVEST = at(601, 9, 20);
  /** Sad 40 čtverců (0,9 ha) v plné úrodě (30 let) – sklizeň na víc dní. */
  function withOrchard(s: VillageState): VillageState {
    s.orchards = [
      {
        id: 700,
        squares: Array.from({ length: 40 }, (_, k) => ({
          cell: { x: 2 + (k % 10), y: 6 + Math.floor(k / 10) },
          areaM2: 225,
          distanceM: 60,
          plantingCost: 2,
          plantingDone: 2,
          plantedDay: HARVEST - Math.ceil(30 * YEAR),
        })),
      },
    ];
    const ha = (40 * 225) / 10_000;
    s.orchardWork = {
      task: 'harvest',
      required: ORCHARD.harvestPerHa * ha,
      done: 0,
      yieldKg: ORCHARD.fullYieldKgPerHa * ha,
    };
    return s;
  }

  it('vůz převezme odnos jablek v koších – sklizeň postoupí víc, jablek přibude víc', () => {
    const withCart = advanceVillage(withOrchard(village(HARVEST - 1)), HARVEST, null);
    const noCart = withOrchard(village(HARVEST - 1));
    delete noCart.carts;
    const plain = advanceVillage(noCart, HARVEST, null);
    const haul = withCart.labor!.shares.find((share) => share.activity === 'haul')!;
    expect(haul.target).toEqual({ kind: 'orchard', id: 700 });
    expect(haul.carts).toBe(1);
    const work = withCart.orchardWork!;
    expect(work.hauled).toBeGreaterThan(0);
    // vůz převezme nejvýš ORCHARD.harvestCarryShare sklizně
    expect(work.hauled!).toBeLessThanOrEqual(work.required * ORCHARD.harvestCarryShare + 1e-9);
    expect(withCart.applesKg!).toBeGreaterThan(plain.applesKg!);
    expect(plain.orchardWork!.hauled).toBeUndefined();
  });
});

describe('osivo na pole (wagons.md – Co vozy vozí)', () => {
  it('v den setí vůz převezme nošení osiva – setí postoupí víc', () => {
    const s = withSowing(village(SOW_DAY - 1));
    const next = advanceVillage(s, SOW_DAY, null);
    expect(next.plan!.seedHauled).toBeGreaterThan(0);
    expect(next.plan!.seedReach?.share).toBe(1);
    const haul = hauls(next).find((share) => share.job === 'seed');
    expect(haul?.target.kind).toBe('field');
    // bez vozu (vůz nejel – vůz bez spřežení) setí postoupí méně
    const noTeam = withSowing(village(SOW_DAY - 1));
    noTeam.pens![0]!.team = null;
    const slower = advanceVillage(noTeam, SOW_DAY, null);
    expect(next.plan!.done.sow).toBeGreaterThan(slower.plan!.done.sow);
    expect(slower.plan!.seedHauled).toBeUndefined();
    // nejvýš podíl setí
    expect(next.plan!.seedHauled!).toBeLessThanOrEqual(
      next.plan!.required.sow * CART_JOBS.seed.carryShare + 1e-9,
    );
  });
});

describe('přednost a spřežení (wagons.md – Co vozy vozí)', () => {
  it('uhlí má přednost před osivem – s druhým spřežením jedou oba vozy', () => {
    const one = withCharcoal(withSowing(village(SOW_DAY - 1)));
    const next = advanceVillage(one, SOW_DAY, null);
    expect(hauls(next).map((h) => h.job)).toEqual(['charcoal']);
    const two = withCharcoal(withSowing(village(SOW_DAY - 1)));
    two.pens!.push({ ...two.pens![0]!, id: 901, x: -22.5, z: 22.5 });
    two.carts!.push({ id: 2, kind: 'two-wheel', builtDay: SOW_DAY - 20 });
    const both = advanceVillage(two, SOW_DAY, null);
    expect(new Set(hauls(both).map((h) => h.job))).toEqual(new Set(['charcoal', 'seed']));
  });

  it('ve dny orby voli orají – uhlí se nosí v koších', () => {
    const s = withCharcoal(village(SOW_DAY - 1));
    s.fields = [{ id: 1 }];
    s.parts = [part(1, 2), part(2, 3)];
    s.plan = { plannedDay: at(600, 9, 1), ...createCropWork(s.parts, at(600, 9, 1), 0, true) };
    const next = advanceVillage(s, SOW_DAY, null);
    expect(next.labor!.shares.some((share) => share.activity === 'plough')).toBe(true);
    expect(hauls(next)).toEqual([]);
    // vůz nejel, ale ves si zapsala, co by vůz s vlastním volem ušetřil (wagons.md – Kolik vozů
    // ves chce)
    expect(next.draft!.demand!.days!.some((d) => d.p && (d.j?.[0] ?? 0) > 0)).toBe(true);
  });

  it('bez spřežení vůz stojí – ves jako bez vozu', () => {
    const s = withCharcoal(withSowing(village(SOW_DAY - 1)));
    s.pens![0]!.team = null;
    const next = advanceVillage(s, SOW_DAY, null);
    expect(hauls(next)).toEqual([]);
    const none = withCharcoal(withSowing(village(SOW_DAY - 1)));
    none.pens![0]!.team = null;
    delete none.carts;
    const plain = advanceVillage(none, SOW_DAY, null);
    expect({ ...next, carts: undefined }).toEqual({ ...plain, carts: undefined });
  });

  it('dopočet najednou = po kouscích', () => {
    const s = withCharcoal(withSowing(village(SOW_DAY - 1)));
    const whole = advanceVillage(s, SOW_DAY + 40, null);
    let pieces = s;
    for (const to of [SOW_DAY + 3, SOW_DAY + 17, SOW_DAY + 40]) {
      pieces = advanceVillage(pieces, to, null);
    }
    expect(pieces).toEqual(whole);
  });
});

describe('voda v sudech (wagons.md – Co vozy vozí, paths.md – Pochůzky pro vodu)', () => {
  const households = [
    { dwellingId: 1, people: 5, labor: 0 },
    { dwellingId: 2, people: 5, labor: 0 },
  ];
  /** Přirážka za vodu domácnosti `people` lidí `walkM` m od vody (jako labor.ts). */
  const walk = (people: number, walkM: number): number =>
    (WATER_FETCHING.tripsPerPerson * people * 2 * Math.max(0, walkM - 100)) /
    WATER_FETCHING.speedMps /
    (WATER_FETCHING.dayHours * 3600);

  it('přirážka za vodu klesne o přivezenou vodu – přičte se díl posádky; blízko vůz nejede', () => {
    const far = [
      { ...households[0]!, labor: walk(5, 400) },
      { ...households[1]!, labor: walk(5, 120) },
    ];
    const plan = waterCartPlan(far, 1, { costM: 80, x: 0, z: 70 })!;
    // vzdálené domácnosti vůz vodu přiveze, blízké ne (chůze je levnější než jízda)
    expect(plan.water[0]).toBeLessThan(far[0]!.labor / 2);
    expect(plan.water[1]).toBe(far[1]!.labor);
    expect(plan.litres).toBe(5 * CART_JOBS.water.litresPerPerson);
    expect(plan.saved).toBeGreaterThan(plan.crew);
    expect(plan.crew).toBeCloseTo(
      (cartTripManDays(80, CART_JOBS.water.fillS + CART_JOBS.water.unloadS) * plan.litres) /
        CART_JOBS.water.barrelL['two-wheel'],
      12,
    );
    expect(plan.water.reduce((a, b) => a + b, 0)).toBeCloseTo(
      far[0]!.labor + far[1]!.labor - plan.saved + plan.crew,
      12,
    );
    // blízko vody (do WATER_FETCHING.includedM) nic neušetří; k vodě nesjede – nic
    expect(waterCartPlan(households, 1, { costM: 80, x: 0, z: 70 })).toBeNull();
    expect(waterCartPlan(far, 1, null)).toBeNull();
    expect(waterCartPlan(far, 0, { costM: 80, x: 0, z: 70 })).toBeNull();
  });

  it('vůz uveze za den nejvýš CARTS.loadsPerCartDay sudů – zbytek se nosí', () => {
    const many = Array.from({ length: 40 }, (_, k) => ({
      dwellingId: k + 1,
      people: 10,
      labor: walk(10, 600),
    }));
    const plan = waterCartPlan(many, 1, { costM: 50, x: 0, z: 0 })!;
    expect(plan.trips).toBeLessThanOrEqual(8 + 1e-9);
    expect(plan.carts).toBe(1);
    expect(plan.water.filter((w, k) => w === many[k]!.labor).length).toBeGreaterThan(0);
  });

  it('břeh, kam vůz sjede – vozová síť; bez vody nic', () => {
    const s = village();
    const drives = villageCartDrives(s, DAY, LANDSCAPE, null)!;
    const drive = waterCartDrive(s, LANDSCAPE, drives)!;
    expect(drive).not.toBeNull();
    expect(drive.z).toBeGreaterThan(60);
    expect(drive.z).toBeLessThan(76);
    expect(s.waterCart?.drive).toEqual(drive);
    const dry = makeLandscape({ size: 20 });
    const t = village();
    expect(waterCartDrive(t, dry, villageCartDrives(t, DAY, dry, null)!)).toBeNull();
  }, 60_000);

  it('k milíři v lese vůz jen po pevné cestě, na louce ano (crafts.md – Milíř u skácených buků)', () => {
    const s = village();
    const drives = villageCartDrives(s, DAY, LANDSCAPE, null)!;
    expect(kilnCartDrive(s, { x: -135, z: 0 }, drives)).toBeNull();
    expect(kilnCartDrive(s, { x: 40, z: 0 }, drives)).not.toBeNull();
    // pevná cesta do lesa k milíři – vůz po ní dojede
    s.roads = {
      nextId: 2,
      roads: [
        {
          id: 1,
          points: [
            { x: -60, z: 0 },
            { x: -135, z: 0 },
          ],
          bornDay: DAY - 400,
          grade: 'trodden',
          traffic: [],
          spots: [],
        },
      ],
      trees: [],
      candidates: [],
      labor: { from: DAY - 30, days: 30, shares: [] },
    };
    const road = villageCartDrives(s, DAY, LANDSCAPE, null)!;
    expect(kilnCartDrive(s, { x: -135, z: 0 }, road)).not.toBeNull();
  }, 60_000);

  it('ves daleko od vody vozí vodu vozem – jízdy jdou do ročního provozu cest', () => {
    const day = at(601, 1, 10);
    const s = village(day, { x: 0, z: -135, rotation: 0 });
    const next = advanceVillage(s, day + 2, null, LANDSCAPE);
    const haul = hauls(next).find((share) => share.job === 'water');
    expect(haul?.target.kind).toBe('water');
    const water = householdWater(next.people, next.dwellings);
    expect(water[0]!.labor).toBeGreaterThan(0);
    const trips = next.roads?.labor.cart ?? [];
    expect(trips.some((t) => t.trips > 0)).toBe(true);
    // domácí práce dne bez posádky vozu
    const domestic = next.labor!.shares.find((share) => share.activity === 'domestic')!;
    expect(domestic.manDays).toBeGreaterThan(0);
    // bez vozu se voda nosí
    const plain = village(day, { x: 0, z: -135, rotation: 0 });
    delete plain.carts;
    const walking = advanceVillage(plain, day + 2, null, LANDSCAPE);
    expect(hauls(walking)).toEqual([]);
  }, 60_000);
});
