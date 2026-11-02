import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cattleRoom } from '../cattle-trade';
import {
  HAY,
  HAY_WINTER_DAYS,
  PLAN_HAY_KEEP,
  mowingCapacityKg,
  mowingRemaining,
  recordMowingLabor,
  winterHayAvailable,
} from '../hay';
import { oxenTrainingTarget } from '../draft';
import { breedingCows, hayOxen, mowingNeed } from '../husbandry';
import { LIVESTOCK, roomForWinter, winterTargets } from '../livestock';
import { herdRoom, penCapacity } from '../pens';
import { HAY_CUTS } from '../rules';
import { advanceVillage } from '../simulate';
import type {
  FieldPart,
  Pen,
  PenSpecies,
  TradeExpedition,
  TradeGoods,
  VillageState,
} from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stáda jen na seno, které ves stihne posekat (oxen.md – Stáda podle práce na seč; návrh Clauda,
// Martin 25. 10. 2026: seče vložit tak, „aby to neohrozilo ostatní polní práce“), koupený dobytek
// v plánu seče a místa v ohradách před senem.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const winterHay = (s: 'sheep' | 'goat' | 'cow'): number => HAY.dailyKg[s] * HAY_WINTER_DAYS;

function meadow(id: number, distanceM: number): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM,
    naturalFertility: 70,
    fertilityShare: 0.8,
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: at(595, 9, 1),
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
}

/** Ves se třemi loukami bez sena (plán seče od nuly). */
function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.fields = [{ id: 1 }];
  s.parts = [meadow(1, 100), meadow(2, 150), meadow(3, 200)];
  delete s.hay;
  return s;
}

/** Ves s velkou pastvou (nosnost omezí jen seno a místa). */
function grazing(): VillageState {
  const s = village(at(600, 3, 15));
  s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
  return s;
}

/** Hotová ohrada druhu o jednom čtverci. */
function pen(id: number, species: PenSpecies, x: number, y: number): Pen {
  return {
    id,
    species,
    cell: { x, y },
    x: x * 15 - 112.5,
    z: y * 15 - 112.5,
    builtDay: at(599, 1, 1),
    team: null,
    training: null,
  };
}

/** Výprava na cestě, která přivede dobytek `get`. */
function coming(s: VillageState, get: TradeGoods): void {
  const expedition: TradeExpedition = {
    id: 1,
    direction: 'S',
    trailId: 1,
    startedDay: s.lastDay,
    give: {},
    get,
    porters: 1,
    days: 10,
    cost: 10,
    done: 0,
  };
  s.trade = { neighbours: s.trade?.neighbours ?? [], nextId: 2, expeditions: [expedition] };
}

describe('práce na seč – kolik sena ves stihne posekat', () => {
  it('volná práce po polních pracích se v oknech seče zapíše, 1. 10. z ní ves ví strop sena', () => {
    const s = advanceVillage(village(at(600, 5, 20)), at(600, 5, 24), null);
    s.livestock!.herds.cow = 2;
    expect(mowingCapacityKg(s)).toBeUndefined();
    const june = advanceVillage(s, at(600, 7, 1), null);
    expect(june.hay!.mowFree!.first).toBeGreaterThan(0);
    expect(june.hay!.mowFree!.second).toBe(0);
    expect(mowingCapacityKg(june)).toBeUndefined();
    const october = advanceVillage(june, at(600, 10, 2), null);
    expect(october.hay!.mowFree).toBeUndefined();
    const { first, second } = june.hay!.mowFree!;
    // otava jen z posečených luk 1. seče – nejvýš `aftermathYieldShare` jejího sena
    expect(mowingCapacityKg(october)).toBeGreaterThanOrEqual(first - 1e-6);
    expect(mowingCapacityKg(october)).toBeLessThanOrEqual(
      first * (1 + HAY_CUTS.aftermathYieldShare) + 1e-6,
    );
    expect(second).toBe(0);
  }, 60_000);

  it('práce se převede na seno podle dnešní seče; mimo okna a bez zápisu se nic nezapíše', () => {
    const s = village(at(600, 6, 10));
    s.hay = {
      kg: 0,
      mowing: { partIds: [1, 2, 3], required: 300, done: 0, yieldKg: 4500 },
      mowFree: { first: 0, second: 0 },
    };
    recordMowingLabor(s, at(600, 6, 10), 10, 0);
    expect(s.hay.mowFree!.first).toBeCloseTo(150, 9);
    recordMowingLabor(s, at(600, 7, 10), 10, 0);
    expect(s.hay.mowFree!.first).toBeCloseTo(150, 9);
    // seč rozjetá před zápisem (převod) – letos bez stropu
    delete s.hay.mowFree;
    recordMowingLabor(s, at(600, 6, 11), 10, 0);
    expect(s.hay.mowFree).toBeUndefined();
  });

  it('cílové stádo nad seno, které ves stihne posekat, neroste – voli, krávy, ovce v pořadí', () => {
    const s = grazing();
    s.livestock!.herds = { sheep: 100, goat: 0, pig: 0, cow: 10 };
    const all = winterTargets(s, at(600, 3, 15), {
      oxen: 0,
      hayKg: Infinity,
      mowKg: 10 * winterHay('cow') + 20 * winterHay('sheep'),
    });
    expect(all.cow).toBeCloseTo(10, 9);
    expect(all.sheep).toBeCloseTo(20, 9);
    // seno jen na 4 krávy – ovce jen chovný pár
    const few = winterTargets(s, at(600, 3, 15), {
      oxen: 0,
      hayKg: Infinity,
      mowKg: 4 * winterHay('cow'),
    });
    expect(few.cow).toBeCloseTo(4, 9);
    expect(few.sheep).toBe(LIVESTOCK.breedingMin);
  });

  it('plán seče bere strop práce na seč – nutná seč i strop menší', () => {
    const day = at(600, 5, 25);
    const s = village(day);
    s.livestock!.herds = { sheep: 30, goat: 0, pig: 0, cow: 6 };
    const free = mowingNeed(s, day);
    s.hay = { kg: 0, mowing: null, mowCapacityKg: (3 * winterHay('cow')) / PLAN_HAY_KEEP };
    const capped = mowingNeed(s, day);
    expect(capped.capKg).toBeLessThan(free.capKg);
    expect(capped.necessaryKg).toBeLessThan(free.necessaryKg);
  });
});

describe('místa v ohradách před senem', () => {
  it('krávy nad místa ve skotu seno neberou – zbude ovcím', () => {
    const s = grazing();
    s.pens = [pen(3, 'sheep', 1, 4), pen(4, 'cattle', 1, 6)];
    s.livestock!.herds = { sheep: 100, goat: 0, pig: 0, cow: 60 };
    const room = herdRoom(s);
    const cows = roomForWinter(room, 'cow');
    expect(cows).toBeLessThan(60);
    // seno na 60 krav
    const hayKg = (60 * winterHay('cow')) / winterHayAvailable(1);
    const t = winterTargets(s, at(600, 3, 15), { oxen: 0, hayKg, room });
    expect(t.cow).toBeCloseTo(cows, 9);
    const sheep = Math.min(
      100,
      roomForWinter(room, 'sheep'),
      ((60 - cows) * winterHay('cow')) / winterHay('sheep'),
    );
    expect(t.sheep).toBeCloseTo(sheep, 6);
  });
});

describe('koupený dobytek', () => {
  it('obchod koupí jen krávy, které se i s jarními telaty vejdou – 1. 11. zůstanou', () => {
    const s = grazing();
    s.pens = [pen(4, 'cattle', 1, 6)];
    s.livestock!.herds.cow = 2;
    const winter = roomForWinter(herdRoom(s), 'cow');
    const room = Math.floor(Math.min(penCapacity(s).cow, winter) - 2 + 1e-9);
    expect(cattleRoom(s, 'cows')).toBe(room);
    // krávy na cestě místo zabírají
    coming(s, { cows: room });
    expect(cattleRoom(s, 'cows')).toBe(0);
    // po návratu – porážka kvůli místům je nechá
    s.livestock!.herds.cow += room;
    s.trade!.expeditions = [];
    const t = winterTargets(s, at(600, 11, 1), { oxen: 0, hayKg: Infinity, room: herdRoom(s) });
    expect(t.cow).toBeCloseTo(s.livestock!.herds.cow, 9);
  });

  it('krávy a voli, které výprava teprve vede, se počítají do seče', () => {
    const day = at(600, 5, 25);
    const s = village(day);
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 0, cow: 2 };
    const before = mowingNeed(s, day);
    coming(s, { cows: 3 });
    const cows = mowingNeed(s, day);
    expect(cows.necessaryKg).toBeCloseTo(before.necessaryKg + 3 * winterHay('cow'), 6);
    coming(s, { trainedOxen: 2 });
    const oxen = mowingNeed(s, day);
    expect(oxen.necessaryKg).toBeCloseTo(
      before.necessaryKg + 2 * HAY.dailyKg.ox * HAY_WINTER_DAYS,
      6,
    );
  });

  it('seno jen na skutečné voly – ohrada volů bez telat do výcviku seno navíc nechce', () => {
    // Martin 2. 11. 2026 (návrh Clauda): voli ves má nebo přicházejí a telata, která výcvik
    // opravdu dostane – ne voli, které ves chce, ale telata na ně nemá
    const day = at(600, 5, 25);
    const s = village(day);
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 0, cow: 2 };
    const before = mowingNeed(s, day);
    s.pens = [{ ...pen(5, 'team', 1, 8), training: null }];
    expect(oxenTrainingTarget(s)).toBeGreaterThan(0);
    const noCalves = mowingNeed(s, day);
    expect(noCalves.necessaryKg).toBeCloseTo(before.necessaryKg, 6);
    expect(hayOxen(s, day)).toBe(0);
    // stádo s telaty nad chovné krávy – seno i na telata, která do výcviku půjdou
    s.livestock!.herds.cow = 20;
    const calves = Math.min(oxenTrainingTarget(s), Math.floor(20 - breedingCows(s) + 1e-9));
    expect(calves).toBeGreaterThan(0);
    expect(hayOxen(s, day)).toBe(calves);
  });

  it('kráva koupená po 1. 8. – otava na ni seče, dokud běží její okno', () => {
    const s = village(at(600, 7, 30));
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 0, cow: 1 };
    s.hay = {
      kg: 0,
      mowing: { partIds: [1, 2, 3], required: 300, done: 300, yieldKg: 4500 },
    };
    const august = advanceVillage(s, at(600, 8, 2), null);
    const plan = august.hay!.mowing!;
    expect(plan.cut).toBe(2);
    const left = mowingRemaining(august, at(600, 8, 2));
    august.livestock!.herds.cow = 6;
    const more = advanceVillage(august, at(600, 8, 3), null);
    // otava s novými kravami – víc práce, než stihl jeden den
    expect(more.hay!.mowing!.done + mowingRemaining(more, at(600, 8, 3))).toBeGreaterThan(
      plan.done + left + 1,
    );
  });

  it('seč uložená bez nutné práce a bez čísla seče v červenci – otava z posečené části', () => {
    const s = village(at(600, 7, 20));
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 0, cow: 4 };
    s.hay = { kg: 0, mowing: { partIds: [1, 2, 3], required: 300, done: 150, yieldKg: 4500 } };
    const july = advanceVillage(s, at(600, 7, 31), null);
    expect(july.hay!.mowing!.done).toBe(150);
    const august = advanceVillage(july, at(600, 8, 2), null);
    expect(august.hay!.mowing!.cut).toBe(2);
    expect(august.hay!.mowing!.firstCut!.yieldKg).toBeCloseTo(2250, 6);
  });
});
