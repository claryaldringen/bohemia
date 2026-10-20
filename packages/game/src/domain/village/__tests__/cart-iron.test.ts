import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  cartIronDay,
  cartIronKg,
  ironCarrier,
  ironPriceKg,
  ironRoute,
  mapTripDays,
  smithAtHome,
} from '../cart-iron';
import { neighbourCrafts, productPrice, purchaseRoute } from '../craft-buying';
import { neighbourSnapshot } from '../neighbourhood';
import { summarizeVillage } from '../summary';
import {
  cartAwaitingIron,
  ironOrderKg,
  newWorkshop,
  restingCrafters,
  smithToolsTarget,
  craftTargets,
  workshopLabor,
} from '../crafts';
import { restingCarpenters } from '../carpentry';
import { NO_CRAFTS } from '../productivity';
import { CARPENTRY, CRAFT_BASE, NEIGHBOR_DIRECTIONS } from '../rules';
import { advanceVillage } from '../simulate';
import type { Craft, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Kování vozů (wagons.md – Kování vozů; Martin 20. 10. 2026: „Ano. A taky přidej tedy pravidlo, že
// vozy mají železnou složku. Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má)
// dojít do nejbližší vesnice, kde kovář je“): vůz se bez kování nedokončí, kování ze zásoby
// nástrojů od kováře, ves bez kováře pošle tesaře nebo syna do nejbližší vsi s kovářem.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const CARPENTER_ID = 50;
const SMITH_ID = 51;
const CARPENTER = 60;

const person = (id: number, years: number, dwellingId: number, extra: Partial<Person> = {}) => ({
  id,
  bornDay: DAY - Math.ceil(years * YEAR),
  dwellingId,
  ...extra,
});

/** Ves s hotovou zemnicí, zásobou obilí a hromadou klád; bez polí a staveb. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 25, 1, { sex: 'male', spouseId: 3 }),
    person(3, 25, 1, { sex: 'female', spouseId: 2 }),
    person(4, 6, 1, { sex: 'male', fatherId: 2, motherId: 3 }),
  ];
  s.constructions = [];
  s.storesKg = 50_000;
  s.woodLogs = 10;
  s.lastDay = DAY;
  s.nextId = 100;
  return s;
}

/** Dílna `craft` (id) s domácností – muž, žena a synové (věky). */
function withWorkshop(
  s: VillageState,
  craft: Craft,
  id: number,
  first: number,
  sons: number[] = [],
  x = 40,
): VillageState {
  s.dwellings.push({
    id,
    type: CRAFT_BASE[craft],
    builtDay: s.lastDay,
    condition: 1,
    position: { x, z: 0, rotation: 0 },
    workshop: { ...newWorkshop(craft), activity: 'producing' },
  });
  s.people.push(
    person(first, 40, id, { sex: 'male', spouseId: first + 1 }),
    person(first + 1, 38, id, { sex: 'female', spouseId: first }),
    ...sons.map((years, i) =>
      person(first + 2 + i, years, id, { sex: 'male', fatherId: first, motherId: first + 1 }),
    ),
  );
  return s;
}

/** Tesař s dvoukolákem, kterému chybí jen kování (hotová dřevěná práce). */
function withWaitingCart(s: VillageState, sons: number[] = []): VillageState {
  withWorkshop(s, 'carpenter', CARPENTER_ID, CARPENTER, sons);
  s.dwellings.find((d) => d.id === CARPENTER_ID)!.workshop!.cart = {
    kind: 'two-wheel',
    done: CARPENTRY.cartManDays['two-wheel'],
  };
  return s;
}

const carpenter = (s: VillageState) => s.dwellings.find((d) => d.id === CARPENTER_ID)!.workshop!;

describe('vůz má kování (wagons.md – Kování vozů)', () => {
  it('dvoukolák 3 kg, čtyřkolák 6 kg', () => {
    expect(cartIronKg('two-wheel')).toBe(3);
    expect(cartIronKg('four-wheel')).toBe(6);
  });

  it('vůz bez kování se nedokončí – tesař mezitím dělá dřevěné nářadí', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    s.crafts = { charcoalKg: 0, toolsKg: 1, potteryKg: 0 };
    expect(cartAwaitingIron(carpenter(s))).toBe(true);
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([]);
    expect(s.carts ?? []).toHaveLength(0);
    expect(carpenter(s).cart).not.toBeNull();
    // ves má kováře – nikdo nikam nejde, kovář má zakázku
    expect(carpenter(s).ironTrip ?? null).toBeNull();
    expect(ironOrderKg(s)).toBe(3);
    // tesař neodpočívá kvůli vozu – vyrábí nářadí (nebo odpočívá, má-li ho dost)
    expect(restingCarpenters(s, DAY + 1, null).get(CARPENTER_ID)).toBeUndefined();
  });

  it('kovář kování vyrobí přednostně – kove nad zásobu do potřeby, dokud vůz čeká', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    const target = craftTargets(s, DAY).toolsKg;
    expect(smithToolsTarget(s, DAY)).toBe(target + 3);
    // s plnou zásobou do potřeby by kovář odpočíval – zakázka kování k vozu ho drží v kovárně
    s.crafts = { charcoalKg: 500, toolsKg: target + 1, potteryKg: 0 };
    expect(restingCrafters(s, DAY, NO_CRAFTS).get(SMITH_ID)).toBeUndefined();
    // bez vozu, který čeká, odpočívá
    carpenter(s).cart = null;
    expect(ironOrderKg(s)).toBe(0);
    expect(restingCrafters(s, DAY, NO_CRAFTS).get(SMITH_ID)).toBe('resting');
  });

  it('kování ze zásoby nástrojů od kováře – vůz je hotový', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    s.crafts = { charcoalKg: 0, toolsKg: 10, potteryKg: 0 };
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([{ day: DAY + 1, kind: 'cart-made', cart: 'two-wheel' }]);
    expect(s.carts).toHaveLength(1);
    expect(s.crafts.toolsKg).toBeCloseTo(7, 9);
    expect(carpenter(s).cart).toBeNull();
  });

  it('v simulaci: tesař dodělá vůz a s kováním ze zásoby ho dokončí týž den', () => {
    const s = withWorkshop(village(), 'carpenter', CARPENTER_ID, CARPENTER);
    s.pens = [
      {
        id: 900,
        cell: { x: 3, y: 4 },
        x: 50,
        z: 60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    // loňský rok vozů – dvoukolák by ušetřil 100 čd, ves ho chce (wagons.md – kolik vozů ves chce)
    s.draft = {
      ...s.draft,
      lastYear: { from: DAY - 365, 'two-wheel': [100], 'four-wheel': [], plough: [], oxCost: 12 },
    };
    s.crafts = { charcoalKg: 0, toolsKg: 20, potteryKg: 0 };
    const next = advanceVillage(s, DAY + 90, null);
    expect(next.carts).toHaveLength(1);
    expect(next.crafts!.toolsKg).toBeLessThan(20 - 3 + 1e-6);
    expect(next.chronicle.some((e) => e.kind === 'iron-trip')).toBe(false);
  });
});

describe('ves bez kováře – tesař jde pro kování (wagons.md – Kování vozů)', () => {
  it('jde syn tesaře od 14 let, jinak tesař sám', () => {
    const s = withWaitingCart(village(), [15, 12]);
    expect(ironCarrier(s, CARPENTER_ID, DAY)).toMatchObject({ son: true, person: { id: 62 } });
    const young = withWaitingCart(village(), [13]);
    expect(ironCarrier(young, CARPENTER_ID, DAY)).toMatchObject({
      son: false,
      person: { id: CARPENTER },
    });
  });

  it('syn jde k nejbližšímu sousedovi s kovářem, ves platí obilím a vůz dostaví po návratu', () => {
    const s = withWaitingCart(village(), [16]);
    expect(smithAtHome(s)).toBe(false);
    const from = { x: 40, z: 0 };
    const routes = NEIGHBOR_DIRECTIONS.filter((d) => neighbourCrafts(s.seed, d).includes('smith'))
      .map((d) => purchaseRoute(s, d, null, from))
      .sort((a, b) => a.days - b.days);
    const nearest = routes[0]!;
    const stores = s.storesKg;
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'iron-trip',
        cart: 'two-wheel',
        son: true,
        direction: nearest.direction,
      }),
    ]);
    const trip = carpenter(s).ironTrip!;
    expect(trip).toMatchObject({ personId: 62, son: true, days: nearest.days, done: 0, kg: 3 });
    // platba obilím jako nákup nástrojů u souseda (0,96 hodnoty)
    expect(ironPriceKg(3)).toBeCloseTo(3 * productPrice('toolsKg'), 9);
    expect(stores - s.storesKg).toBeCloseTo(ironPriceKg(3), 6);
    // syn chybí v dílně
    const home = workshopLabor(s, DAY + 2, CARPENTER_ID, 0);
    const before = workshopLabor(
      {
        ...s,
        dwellings: s.dwellings.map((d) =>
          d.id === CARPENTER_ID ? { ...d, workshop: { ...d.workshop!, ironTrip: null } } : d,
        ),
      },
      DAY + 2,
      CARPENTER_ID,
      0,
    );
    expect(home.capacity).toBeCloseTo(before.capacity - 1, 9);
    // cesta: den za dnem, po návratu je vůz hotový
    for (let d = 2; d <= nearest.days; d++) expect(cartIronDay(s, DAY + d, null)).toEqual([]);
    const back = cartIronDay(s, DAY + nearest.days + 1, null);
    expect(back).toEqual([
      { day: DAY + nearest.days + 1, kind: 'iron-brought', cart: 'two-wheel', son: true },
      { day: DAY + nearest.days + 1, kind: 'cart-made', cart: 'two-wheel' },
    ]);
    expect(s.carts).toHaveLength(1);
    expect(carpenter(s).ironTrip).toBeNull();
  });

  it('bez přebytku obilí nikdo nejde – vůz čeká', () => {
    const s = withWaitingCart(village(), [16]);
    s.storesKg = 50;
    expect(cartIronDay(s, DAY + 1, null)).toEqual([]);
    expect(carpenter(s).ironTrip ?? null).toBeNull();
    expect(s.storesKg).toBe(50);
  });

  it('druhá ves hráče na téže mapě s kovárnou, když je blíž než soused', () => {
    const s = withWaitingCart(village(), [16]);
    s.neighbours = {
      dwellings: [],
      sacredBuildings: [],
      cells: [],
      cleared: [],
      felled: [],
      reserved: [],
      smithies: [{ x: 340, z: 0, name: 'Lhota' }],
    };
    const near = ironRoute(s, { x: 40, z: 0 }, null)!;
    expect(near.to).toEqual({ kind: 'village', name: 'Lhota', x: 340, z: 0 });
    expect(near.days).toBe(mapTripDays(300));
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([
      { day: DAY + 1, kind: 'iron-trip', cart: 'two-wheel', to: 'Lhota', son: true },
    ]);
    // se zemskou stezkou ke kováři souseda je soused blíž než kovárna na kraji mapy
    const direction = NEIGHBOR_DIRECTIONS.find((d) =>
      neighbourCrafts(s.seed, d).includes('smith'),
    )!;
    s.trails = [
      { id: 1, direction, pieces: [], lengthM: 300, startedDay: DAY - 50, builtDay: DAY - 10 },
    ];
    s.neighbours.smithies = [{ x: 2_000, z: 0, name: 'Daleko' }];
    expect(mapTripDays(1_960)).toBeGreaterThan(purchaseRoute(s, direction, null).days);
    expect(ironRoute(s, { x: 40, z: 0 }, null)!.to).toMatchObject({
      kind: 'neighbour',
      direction,
      trailId: 1,
    });
  });

  it('kdo cestou zemřel, kování nepřinese – vůz čeká a jde jiný', () => {
    const s = withWaitingCart(village(), [16]);
    cartIronDay(s, DAY + 1, null);
    s.people = s.people.filter((p) => p.id !== 62);
    const events = cartIronDay(s, DAY + 2, null);
    expect(events).toEqual([expect.objectContaining({ kind: 'iron-trip', son: false })]);
    expect(carpenter(s).ironTrip!.personId).toBe(CARPENTER);
  });

  it('v simulaci: vůz se dokončí po návratu tesaře a dopočet nezávisí na kouscích', () => {
    const s = withWorkshop(village(), 'carpenter', CARPENTER_ID, CARPENTER);
    s.pens = [
      {
        id: 900,
        cell: { x: 3, y: 4 },
        x: 50,
        z: 60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    // loňský rok vozů – dvoukolák by ušetřil 100 čd, ves ho chce (wagons.md – kolik vozů ves chce)
    s.draft = {
      ...s.draft,
      lastYear: { from: DAY - 365, 'two-wheel': [100], 'four-wheel': [], plough: [], oxCost: 12 },
    };
    const all = advanceVillage(s, DAY + 120, null);
    expect(all.carts).toHaveLength(1);
    expect(all.chronicle.some((e) => e.kind === 'iron-trip' && !e.son)).toBe(true);
    expect(all.chronicle.some((e) => e.kind === 'iron-brought')).toBe(true);
    let piece = s;
    for (let d = DAY + 7; d <= DAY + 120; d += 7)
      piece = advanceVillage(piece, Math.min(d, DAY + 120), null);
    piece = advanceVillage(piece, DAY + 120, null);
    expect(JSON.stringify(piece)).toBe(JSON.stringify(all));
  });
});

describe('kovárny jiných vsí na téže mapě (wagons.md – Kování vozů)', () => {
  it('přehled sousedních vsí nese obývané kovárny se jménem vsi', () => {
    const other = withWorkshop(village(), 'smith', SMITH_ID, 70, [], 200);
    const snapshot = neighbourSnapshot([other], DAY, ['Lhota'])!;
    expect(snapshot.smithies).toEqual([{ x: 200, z: 0, name: 'Lhota' }]);
    // prázdná kovárna se nepočítá, ves bez kovárny pole nemá
    other.people = other.people.filter((p) => p.dwellingId !== SMITH_ID);
    expect(neighbourSnapshot([other], DAY, ['Lhota'])!.smithies).toBeUndefined();
  });
});

describe('kování v panelu dílny tesaře (wagons.md – Kování vozů)', () => {
  const ironOf = (s: VillageState, day: number) =>
    summarizeVillage(s, day).crafts.workshops.find((w) => w.dwellingId === CARPENTER_ID)!.carpenter!
      .iron;

  it('vůz čeká na kování, pak syn jde do vsi a vrátí se za dny', () => {
    const s = withWaitingCart(village(), [16]);
    s.storesKg = 50;
    expect(ironOf(s, DAY)).toEqual({ kg: 3, trip: null });
    s.storesKg = 50_000;
    cartIronDay(s, DAY + 1, null);
    const trip = carpenter(s).ironTrip!;
    expect(ironOf(s, DAY + 1)).toEqual({
      kg: 3,
      trip: {
        to: trip.to.name,
        direction: trip.to.kind === 'neighbour' ? trip.to.direction : null,
        daysLeft: trip.days,
        son: true,
        age: 16,
      },
    });
  });

  it('bez vozu, který čeká, nic', () => {
    const s = withWorkshop(village(), 'carpenter', CARPENTER_ID, CARPENTER);
    expect(ironOf(s, DAY)).toBeNull();
  });
});
