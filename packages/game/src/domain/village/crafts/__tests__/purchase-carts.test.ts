import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { createCropWork } from '../../core/year-plan';
import { groupCap, planPurchases, purchaseTravelers, tripOf } from '../craft-buying';
import { cartsAway } from '../carts';
import { craftCoverage, newWorkshop } from '../crafts';
import { oxenHome } from '../../livestock/oxen';
import { advanceVillage } from '../../core/simulate';
import { NEIGHBOR_DIRECTIONS } from '../../rules';
import type { CartKind, FieldPart, Pen, Person, VillageState } from '../../types';

// Vozy u nákupu u sousedů (crafts.md – Nákup u sousedů, Vozy; Martin 19. 10. 2026: „Až bude vůz,
// pojedou zásoby na voze a ušetří se člověkodny.“; Martin 22. 11. 2026 „ano“ – ves bez tesaře si
// vůz koupí u souseda, když se jí to vyplatí).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const NOV15 = at(600, 11, 15);

/** Ves `households` rodin s osetým polem a zásobami, bez řemeslníků (jako craft-buying.test.ts). */
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

/** Hotová ohrada volů s `oxen` voly (vycvičení od `trainedDay`) a rádlem. */
function withOxen(s: VillageState, oxen = 2, trainedDay = s.lastDay - 10): VillageState {
  const pen: Pen = {
    id: 900,
    species: 'team',
    cell: { x: 3, y: 4 },
    x: 50,
    z: 60,
    builtDay: s.lastDay - 800,
    oxen: Array.from({ length: oxen }, () => ({ trainedDay })),
  };
  s.pens = [pen];
  s.ards = 1;
  return s;
}

/** Hotové zemské stezky do všech směrů (bez krajiny sjízdné pro vozy). */
function withTrails(s: VillageState): VillageState {
  s.trails = NEIGHBOR_DIRECTIONS.map((direction, i) => ({
    id: i + 1,
    direction,
    pieces: [],
    lengthM: 960,
    startedDay: 0,
    builtDay: 1,
  }));
  return s;
}

function withCart(s: VillageState, kind: CartKind = 'four-wheel'): VillageState {
  s.carts = [{ id: 1, kind, builtDay: s.lastDay - 100 }];
  return s;
}

/** Loňský rok vozů (starší tvar – úspory k-tých vozů): dvoukolák ušetří `twoWheel` čd za rok. */
function withCartYear(s: VillageState, twoWheel: number): VillageState {
  s.draft = {
    lastYear: {
      from: s.lastDay - 365,
      'two-wheel': [twoWheel],
      'four-wheel': [],
      plough: [],
      oxCost: 10,
    },
  };
  return s;
}

/** Na podzim zbývá orba jaře – voli dnes orají (oxen.md – Voli se sdílí). */
function withPloughing(s: VillageState): VillageState {
  s.season = {
    startDay: at(600, 9, 1),
    crops: [{ crop: 'spring', ...createCropWork(s.parts.slice(0, 20), at(600, 9, 1), 0, true) }],
  };
  return s;
}

const plansOf = (s: VillageState): ReturnType<typeof planPurchases> =>
  planPurchases(s, NOV15, craftCoverage(s, NOV15), null);

describe('nákup vozem', () => {
  it('ves s vozem a volnými voly jede vozem – méně čd než pěšky; vůz a voli jsou do návratu pryč', () => {
    const s = withCart(withTrails(withOxen(village())));
    // napřed dřevěné nářadí (nejlepší poměr) – s ním jede jediný vůz
    const wood = plansOf(s).find((p) => p.product === 'woodToolsKg')!;
    expect(wood.carts).toEqual(['four-wheel']);
    const day1 = advanceVillage(s, NOV15, null);
    const trip = day1.purchases!.find((p) => (p.carts ?? []).length > 0)!;
    expect(trip.carts).toEqual([1]);
    // s vozem honák a pomocník místo nosičů po 25 kg – méně práce než pěšky
    const loadKg = Math.max(
      (trip.pay.grainKg ?? 0) + (trip.pay.legumesKg ?? 0),
      Object.values(trip.get).reduce((sum, kg) => sum + (kg ?? 0), 0),
    );
    const walk = tripOf(loadKg, trip.tripDays!, groupCap(s, NOV15));
    expect(trip.group * trip.days).toBeLessThan(walk.labor);
    expect(purchaseTravelers(day1)).toBeGreaterThanOrEqual(2);
    // vůz i jeho voli jsou s nákupem pryč – doma nevozí a neorají
    expect(cartsAway(day1).has(1)).toBe(true);
    expect(oxenHome(day1, NOV15)).toBe(0);
    const back = advanceVillage(day1, NOV15 + 70, null);
    expect(back.purchases).toBeUndefined();
    expect(cartsAway(back).size).toBe(0);
    expect(oxenHome(back, back.lastDay)).toBe(2);
    expect(back.crafts!.woodToolsKg).toBeGreaterThan(0);
  });

  it('pěšky, když voli orají, ves vůz nemá nebo k sousedovi nevede stezka', () => {
    const cartTrips = (s: VillageState): number =>
      plansOf(s).filter((p) => p.carts.length > 0).length;
    expect(cartTrips(withCart(withTrails(withOxen(village()))))).toBeGreaterThan(0);
    // voli orají (orba jaře v okně zbývá) – vozy se vsí, nákup pěšky
    const ploughing = withPloughing(withCart(withTrails(withOxen(village()))));
    expect(plansOf(ploughing).length).toBeGreaterThan(0);
    expect(cartTrips(ploughing)).toBe(0);
    const day1 = advanceVillage(ploughing, NOV15, null);
    expect(day1.purchases!.length).toBeGreaterThan(0);
    expect(day1.purchases!.every((p) => p.carts === undefined)).toBe(true);
    // bez vozu
    const noCart = withTrails(withOxen(village()));
    expect(plansOf(noCart).length).toBeGreaterThan(0);
    expect(cartTrips(noCart)).toBe(0);
    // bez stezky – krajinou ke kraji mapy vůz nejede
    const noTrail = withCart(withOxen(village()));
    expect(plansOf(noTrail).length).toBeGreaterThan(0);
    expect(cartTrips(noTrail)).toBe(0);
  });
});

describe('vůz od tesaře souseda', () => {
  it('ves bez tesaře, která vůz chce a má vola, ho koupí; voli ho dovedou domů', () => {
    const s = withCartYear(withTrails(withOxen(village())), 90);
    const cart = plansOf(s).find((p) => p.product === 'cart')!;
    expect(cart.cart).toBe('two-wheel');
    expect(cart.worthIt).toBe(true);
    // dvoukolák ušetří 90 čd za rok, slouží 10 let
    expect(cart.savedManDays).toBeCloseTo(900, 6);
    expect(cart.savedManDays).toBeGreaterThan(cart.costManDays);
    expect((cart.pay.grainKg ?? 0) + (cart.pay.legumesKg ?? 0)).toBeGreaterThan(200);
    const day1 = advanceVillage(s, NOV15, null);
    const trip = day1.purchases!.find((p) => p.cart)!;
    expect(trip.cart).toBe('two-wheel');
    // vůl jde se skupinou pro vůz
    expect(oxenHome(day1, NOV15)).toBe(1);
    const back = advanceVillage(day1, NOV15 + 70, null);
    expect(back.carts!.map((c) => c.kind)).toEqual(['two-wheel']);
    expect(oxenHome(back, back.lastDay)).toBe(2);
    const bought = back.chronicle.filter((e) => e.kind === 'crafts-bought' && e.cart);
    expect(bought).toHaveLength(1);
  });

  it('bez tažného zvířete ani když se nevyplatí vůz nekupuje', () => {
    // voli teprve ve výcviku – vůz by nikdo nedovedl domů
    const young = withCartYear(withTrails(withOxen(village(), 2, NOV15 + 300)), 90);
    expect(plansOf(young).some((p) => p.product === 'cart')).toBe(false);
    // vůz ušetří 3 čd za rok – za 10 let méně, než stojí platba a cesta
    const small = withCartYear(withTrails(withOxen(village())), 3);
    const cart = plansOf(small).find((p) => p.product === 'cart');
    expect(cart?.worthIt ?? false).toBe(false);
    expect(advanceVillage(small, NOV15, null).purchases?.some((p) => p.cart) ?? false).toBe(false);
  });

  it('ves s vlastním tesařem vůz nekupuje', () => {
    const s = withCartYear(withTrails(withOxen(village())), 90);
    s.dwellings.push({
      id: 2,
      type: 'polozemnice',
      builtDay: NOV15 - 400,
      condition: 1,
      position: { x: 30, z: 0, rotation: 0 },
      workshop: { ...newWorkshop('carpenter'), activity: 'producing' },
    });
    s.people.push({ id: 90, bornDay: NOV15 - 9000, dwellingId: 2, sex: 'male' } as Person);
    expect(plansOf(s).some((p) => p.product === 'cart')).toBe(false);
  });
});
