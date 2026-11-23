import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { craftSources, ownCraftsmanWorks, purchaseRoute, purchaseTravelers } from '../craft-buying';
import { cartsAway, villageCarts } from '../carts';
import { craftCoverage, newWorkshop } from '../crafts';
import { oxenHome } from '../../livestock/oxen';
import { advanceVillage } from '../../core/simulate';
import type { Craft, CraftPurchase, FieldPart, Pen, Person, VillageState } from '../../types';

// Výrobky řemeslníků jen od vlastních řemeslníků – nákup u sousedů zrušen (markets.md – Pravidla 1;
// Martin 22. 11. 2026: „Ves by měla být schopná přežít a rozvíjet se dle současných pravidel i bez
// obchodu“). Nákup uložený na cestě ve starší vsi doběhne (markets.md bod 10).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const NOV15 = at(600, 11, 15);

/** Ves `households` rodin v polozemnici s osetým polem a zásobami `storesKg`, bez řemeslníků. */
function village(households = 3, storesKg = 8000, day = NOV15 - 1): VillageState {
  const s = foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.constructions = [];
  s.dwellings = [
    {
      id: 1,
      type: 'polozemnice',
      builtDay: day - 400,
      condition: 1,
      position: { x: 0, z: 0, rotation: 0 },
    },
  ];
  let id = 10;
  s.people = [];
  for (let h = 0; h < households; h++) {
    for (const [years, sex] of [
      [30, 'male'],
      [28, 'female'],
      [10, 'male'],
      [5, 'female'],
    ] as const) {
      s.people.push({
        id: id++,
        bornDay: day - Math.ceil(years * YEAR),
        dwellingId: 1,
        sex,
      } as Person);
    }
  }
  s.fields = [{ id: 1 }];
  s.parts = Array.from({ length: households * 60 }, (_, i): FieldPart => ({
    id: 100 + i,
    fieldId: 1,
    areaM2: 225,
    distanceM: 120,
    naturalFertility: 60,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x: i % 30, y: Math.floor(i / 30) },
    crop: 'spring',
  }));
  s.storesKg = storesKg;
  s.lastDay = day;
  s.nextId = 1000;
  return s;
}

/** Pracující dílna `craft` v obydlí 2 s řemeslníkem. */
function withWorkshop(s: VillageState, craft: Craft): VillageState {
  s.dwellings.push({
    id: 2,
    type: 'polozemnice',
    builtDay: s.lastDay - 400,
    condition: 1,
    position: { x: 30, z: 0, rotation: 0 },
    workshop: { ...newWorkshop(craft), activity: 'producing' },
  });
  s.people.push({ id: 90, bornDay: s.lastDay - 9000, dwellingId: 2, sex: 'male' } as Person);
  return s;
}

/** Hotová ohrada volů se dvěma vycvičenými voly. */
function withOxen(s: VillageState): VillageState {
  const pen: Pen = {
    id: 900,
    species: 'team',
    cell: { x: 3, y: 4 },
    x: 50,
    z: 60,
    builtDay: s.lastDay - 800,
    oxen: [{ trainedDay: s.lastDay - 10 }, { trainedDay: s.lastDay - 10 }],
  };
  s.pens = [pen];
  return s;
}

/** Nákup uložený ve starší vsi na cestě – ke kraji mapy na sever, `days` dní, `done` za sebou. */
function purchase(over: Partial<CraftPurchase> = {}): CraftPurchase {
  return {
    direction: 'N',
    startedDay: NOV15,
    group: 3,
    days: 8,
    tripDays: 8,
    done: 0,
    trailId: null,
    edge: { x: 0, z: 960 },
    get: { toolsKg: 9, potteryKg: 40 },
    pay: { grainKg: 520 },
    ...over,
  };
}

describe('bez nákupu u sousedů', () => {
  it('ves bez hrnčíře a kováře s přebytkem obilí a hotovou stezkou nic nekoupí', () => {
    const s = village(3, 8000, at(600, 11, 1));
    s.trails = [{ id: 7, direction: 'N', pieces: [], lengthM: 960, startedDay: 0, builtDay: 1 }];
    const next = advanceVillage(s, at(600, 12, 1), null);
    expect(next.purchases ?? []).toEqual([]);
    expect(next.chronicle.some((e) => e.kind === 'crafts-bought')).toBe(false);
  });

  it('kde ves výrobky bere – jen vlastní pracující řemeslník', () => {
    const s = withWorkshop(village(), 'potter');
    expect(craftSources(s)).toEqual([
      { product: 'toolsKg', own: false },
      { product: 'potteryKg', own: true },
      { product: 'woodToolsKg', own: false },
    ]);
    expect(craftSources(village()).every((source) => !source.own)).toBe(true);
  });

  it('vlastní řemeslník bez vstupů se nepočítá', () => {
    const s = withWorkshop(village(), 'smith');
    expect(ownCraftsmanWorks(s, 'smith')).toBe(true);
    s.dwellings[1]!.workshop!.activity = 'no-charcoal';
    expect(ownCraftsmanWorks(s, 'smith')).toBe(false);
  });

  it('cesta ke kraji mapy (karavany zásilek) – po stezce kratší než krajinou', () => {
    const s = village();
    const off = purchaseRoute(s, 'N', null);
    expect(off.trailId).toBeNull();
    // kraj mapy na sever (+z) – 960 m od středu
    expect(off.edge).toEqual({ x: 0, z: 960 });
    s.trails = [{ id: 7, direction: 'N', pieces: [], lengthM: 960, startedDay: 0, builtDay: 1 }];
    const trail = purchaseRoute(s, 'N', null);
    expect(trail.trailId).toBe(7);
    expect(trail.days).toBeLessThan(off.days);
  });
});

describe('nákup na cestě doběhne (markets.md bod 10)', () => {
  it('lidé jsou s nákupem pryč, jdou ke kraji mapy a s návratem přinesou výrobky', () => {
    const s = village();
    s.purchases = [purchase()];
    const day1 = advanceVillage(s, NOV15, null);
    expect(purchaseTravelers(day1)).toBe(3);
    expect(day1.labor!.shares.some((x) => x.activity === 'trade' && x.target.kind === 'edge')).toBe(
      true,
    );
    const back = advanceVillage(day1, NOV15 + 10, null);
    expect(back.purchases).toBeUndefined();
    expect(back.chronicle.filter((e) => e.kind === 'crafts-bought')).toEqual([
      {
        day: NOV15 + 7,
        kind: 'crafts-bought',
        direction: 'N',
        get: purchase().get,
        pay: purchase().pay,
      },
    ]);
    // nástroje jdou do vybavení domácností (production-chains.md)
    expect(back.toolEquipmentKg).toBeGreaterThan(0);
    expect(back.crafts!.potteryKg).toBeGreaterThan(0);
    expect(craftCoverage(back, NOV15 + 10).tools).toBeGreaterThan(0);
  });

  it('uložený nákup keramiky a vozu den před návratem – po dni keramika v zásobě a vůz přibude', () => {
    const s = withOxen(village());
    s.purchases = [purchase({ done: 7, get: { potteryKg: 40 }, cart: 'two-wheel' })];
    const cartsBefore = villageCarts(s).length;
    // vůl táhne koupený vůz – do návratu je se skupinou pryč
    expect(oxenHome(s, s.lastDay)).toBe(1);
    const next = advanceVillage(s, NOV15, null);
    expect(next.purchases).toBeUndefined();
    expect(next.crafts!.potteryKg).toBeGreaterThan(39);
    expect(villageCarts(next)).toHaveLength(cartsBefore + 1);
    expect(villageCarts(next)[0]!.kind).toBe('two-wheel');
    expect(oxenHome(next, NOV15)).toBe(2);
    expect(next.chronicle.filter((e) => e.kind === 'crafts-bought')).toEqual([
      {
        day: NOV15,
        kind: 'crafts-bought',
        direction: 'N',
        get: { potteryKg: 40 },
        pay: { grainKg: 520 },
        cart: 'two-wheel',
      },
    ]);
  });

  it('vůz vsi jede s nákupem – do návratu je pryč', () => {
    const s = withOxen(village());
    s.carts = [{ id: 1, kind: 'four-wheel', builtDay: s.lastDay - 100 }];
    s.purchases = [purchase({ carts: [1] })];
    const day1 = advanceVillage(s, NOV15, null);
    expect(cartsAway(day1).has(1)).toBe(true);
    expect(oxenHome(day1, NOV15)).toBe(0);
    const back = advanceVillage(day1, NOV15 + 10, null);
    expect(cartsAway(back).size).toBe(0);
    expect(oxenHome(back, back.lastDay)).toBe(2);
  });

  it('na kouscích dopočtu nezávisí', () => {
    const s = village();
    s.purchases = [purchase()];
    const whole = advanceVillage(s, NOV15 + 40, null);
    let pieces = s;
    for (const to of [NOV15, NOV15 + 3, NOV15 + 17, NOV15 + 40]) {
      pieces = advanceVillage(pieces, to, null);
    }
    expect(pieces).toEqual(whole);
  });
});
