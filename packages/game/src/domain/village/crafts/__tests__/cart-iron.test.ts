import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import {
  cartIronDay,
  cartIronKg,
  ironCarrier,
  ironPriceKg,
  ironOptions,
  ironPlan,
  smithAtHome,
  ironTripHelpers,
  withoutSameMapVillages,
} from '../cart-iron';
import { cartsAway, haulCartsToday } from '../carts';
import { withOxen } from '../../livestock/oxen';
import { neighbourCrafts, productPrice, purchaseRoute } from '../craft-buying';
import { summarizeVillage } from '../../core/summary';
import {
  cartAwaitingIron,
  cartIronBarsKg,
  craftNeeds,
  ironOrderBarsKg,
  newWorkshop,
  restingCrafters,
  smithBarsTargetKg,
  workshopLabor,
} from '../crafts';
import { barsReserveKg } from '../iron';
import { restingCarpenters } from '../carpentry';
import { NO_CRAFTS } from '../../core/productivity';
import { CARPENTRY, CRAFT_BASE, NEIGHBOR_DIRECTIONS } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { Craft, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Kování vozů (wagons.md – Kování vozů; Martin 20. 10. 2026: „Ano. A taky přidej tedy pravidlo, že
// vozy mají železnou složku. Pokud vesnice nemá kováře, musí tesař (nebo jeho syn, pokud ho má)
// dojít do nejbližší vesnice, kde kovář je“): vůz se bez kování nedokončí, kování z hřiven vsi
// (production-chains.md – Kovář), ves bez kováře pošle tesaře nebo syna do nejbližší vsi s kovářem.

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

/** Přidá do první zemnice `n` dospělých – malá skupina vsi (polovina dospělých) je pak větší. */
function crowd(s: VillageState, n: number): VillageState {
  for (let i = 0; i < n; i++) {
    s.people.push(person(200 + i, 25, 1, { sex: i % 2 === 0 ? 'male' : 'female' }));
  }
  return s;
}

/** Ohrada volů s vycvičeným párem (převod starší ohrady – `withOxen`). */
function withTeamPen(s: VillageState): VillageState {
  s.pens = [
    {
      id: 900,
      species: 'team',
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: DAY - 800,
      team: { readyDay: DAY - 10 },
      training: null,
    },
  ];
  return s;
}

describe('vůz má kování (wagons.md – Kování vozů)', () => {
  it('dvoukolák 3 kg, čtyřkolák 6 kg', () => {
    expect(cartIronKg('two-wheel')).toBe(3);
    expect(cartIronKg('four-wheel')).toBe(6);
  });

  it('vůz bez kování se nedokončí – tesař mezitím dělá dřevěné nářadí', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 1 };
    expect(cartAwaitingIron(carpenter(s))).toBe(true);
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([]);
    expect(s.carts ?? []).toHaveLength(0);
    expect(carpenter(s).cart).not.toBeNull();
    // ves má kováře – nikdo nikam nejde, kovář má zakázku
    expect(carpenter(s).ironTrip ?? null).toBeNull();
    // 3 kg kování z 1,2 kg hřiven na kg
    expect(ironOrderBarsKg(s)).toBeCloseTo(3 * 1.2, 9);
    expect(cartIronBarsKg('four-wheel')).toBeCloseTo(6 * 1.2, 9);
    // tesař neodpočívá kvůli vozu – vyrábí nářadí (nebo odpočívá, má-li ho dost)
    expect(restingCarpenters(s, DAY + 1, null).get(CARPENTER_ID)).toBeUndefined();
  });

  it('kovář kování připraví přednostně – drží hřivny i na zakázku, dokud vůz čeká', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    const reserve = barsReserveKg(s, DAY);
    expect(smithBarsTargetKg(s, DAY)).toBeCloseTo(reserve + 3.6, 9);
    // s plným vybavením a zásobou hřiven by kovář odpočíval – zakázka kování k vozu ho drží
    // v kovárně (production-chains.md – Kovář)
    s.toolEquipmentKg = craftNeeds(s, DAY).toolsKg;
    s.crafts = { charcoalKg: 500, potteryKg: 0, ironBarsKg: reserve + 0.5 };
    expect(restingCrafters(s, DAY, NO_CRAFTS).get(SMITH_ID)).toBeUndefined();
    // bez vozu, který čeká, odpočívá
    carpenter(s).cart = null;
    expect(ironOrderBarsKg(s)).toBe(0);
    expect(restingCrafters(s, DAY, NO_CRAFTS).get(SMITH_ID)).toBe('resting');
  });

  it('kování z hřiven vsi – vůz je hotový', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 10 };
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([{ day: DAY + 1, kind: 'cart-made', cart: 'two-wheel' }]);
    expect(s.carts).toHaveLength(1);
    expect(s.crafts!.ironBarsKg).toBeCloseTo(10 - 3.6, 9);
    expect(carpenter(s).cart).toBeNull();
  });

  it('v simulaci: tesař dodělá vůz a s kováním z hřiven ho dokončí týž den', () => {
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
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 20 };
    const next = advanceVillage(s, DAY + 90, null);
    expect(next.carts).toHaveLength(1);
    expect(next.crafts!.ironBarsKg).toBeLessThan(20 - 3.6 + 1e-6);
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
    const s = crowd(withWaitingCart(village(), [16]), 9);
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
        porters: 6,
      }),
    ]);
    const trip = carpenter(s).ironTrip!;
    expect(trip).toMatchObject({ personId: 62, son: true, days: nearest.days, done: 0, kg: 3 });
    // 173 kg obilí neunese sám – jde s ním 6 nosičů z vsi (7 nákladů po 25 kg)
    expect(trip.porters).toBe(6);
    expect(trip.tripDays).toBeUndefined();
    expect(ironTripHelpers(s)).toBe(6);
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

  it('malá ves – nosičů je, kolik jich skupina vsi dá, a jdou víckrát', () => {
    // 5 dospělých – skupina nejvýš 2 (polovina), 7 nákladů po 25 kg → 4 cesty tam a zpět
    const s = withWaitingCart(village(), [16]);
    cartIronDay(s, DAY + 1, null);
    const trip = carpenter(s).ironTrip!;
    expect(trip.porters).toBe(1);
    expect(trip.tripDays).toBeGreaterThan(0);
    expect(trip.days).toBe(trip.tripDays! * 4);
    expect(ironTripHelpers(s)).toBe(1);
  });

  it('čtyřkolák – 346 kg obilí nese skupina 8 lidí dvakrát', () => {
    const s = crowd(withWaitingCart(village(), [16]), 13);
    carpenter(s).cart = { kind: 'four-wheel', done: CARPENTRY.cartManDays['four-wheel'] };
    cartIronDay(s, DAY + 1, null);
    const trip = carpenter(s).ironTrip!;
    expect(trip.grainKg).toBeCloseTo(ironPriceKg(6), 2);
    expect(trip.porters).toBe(7);
    expect(trip.days).toBe(trip.tripDays! * 2);
  });

  it('volný vůz s volem po stezce sjízdné pro vozy – platbu veze vůz se sedlákem, nosiči nejdou', () => {
    const base = withTeamPen(crowd(withWaitingCart(village(), [16]), 9));
    base.carts = [{ id: 7, kind: 'two-wheel', builtDay: DAY - 10 }];
    const direction = NEIGHBOR_DIRECTIONS.find((d) =>
      neighbourCrafts(base.seed, d).includes('smith'),
    )!;
    base.trails = [
      { id: 1, direction, pieces: [], lengthM: 300, startedDay: DAY - 50, builtDay: DAY - 10 },
    ];
    const s = withOxen(base);
    expect(haulCartsToday(s, DAY + 1, false)).toBe(1);
    const events = cartIronDay(s, DAY + 1, null);
    expect(events).toEqual([
      expect.objectContaining({ kind: 'iron-trip', direction, byCart: true, son: true }),
    ]);
    const trip = carpenter(s).ironTrip!;
    expect(trip).toMatchObject({ cartId: 7, to: { kind: 'neighbour', trailId: 1 } });
    expect(trip.porters).toBeUndefined();
    // vůz i vůl jsou pryč, jede s nimi sedlák z vsi
    expect(cartsAway(s).has(7)).toBe(true);
    expect(haulCartsToday(s, DAY + 2, false)).toBe(0);
    expect(ironTripHelpers(s)).toBe(1);
    // bez stezky jdou nosiči – vůz krajinou nejede
    const foot = withOxen(withTeamPen(crowd(withWaitingCart(village(), [16]), 9)));
    foot.carts = [{ id: 7, kind: 'two-wheel', builtDay: DAY - 10 }];
    cartIronDay(foot, DAY + 1, null);
    expect(carpenter(foot).ironTrip).toMatchObject({ porters: 6 });
    expect(carpenter(foot).ironTrip!.cartId).toBeUndefined();
  });

  it('nosiči chybí v práci vsi – v rozdělení práce dne jsou na cestě', () => {
    const s = crowd(withWaitingCart(village(), [16]), 9);
    cartIronDay(s, DAY, null);
    s.lastDay = DAY;
    const next = advanceVillage(s, DAY + 1, null);
    const trade = next.labor!.shares.filter((share) => share.activity === 'trade');
    expect(trade.reduce((sum, share) => sum + share.manDays, 0)).toBeCloseTo(6, 9);
    // bez cesty nikdo pryč není
    const home = crowd(withWaitingCart(village(), [16]), 9);
    home.storesKg = 0;
    const stay = advanceVillage(home, DAY + 1, null);
    expect(stay.labor!.shares.some((share) => share.activity === 'trade')).toBe(false);
  });

  it('ves, která šetří jídlem nebo nemá obilí na platbu, nikoho nepošle – vůz čeká', () => {
    const s = withWaitingCart(village(), [16]);
    s.hungry = true;
    expect(cartIronDay(s, DAY + 1, null)).toEqual([]);
    expect(carpenter(s).ironTrip ?? null).toBeNull();
    s.hungry = false;
    s.storesKg = 50;
    expect(cartIronDay(s, DAY + 1, null)).toEqual([]);
    expect(s.storesKg).toBe(50);
  });

  it('při shodě práce kratší cesta', () => {
    const s = crowd(withWaitingCart(village(), [16]), 9);
    const options = ironOptions(s, DAY, { x: 40, z: 0 }, null, ironPriceKg(3));
    const best = ironPlan(options, false)!;
    expect(options.every((o) => o.labor > best.labor || o.days >= best.days)).toBe(true);
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
        porters: trip.porters ?? 0,
        cart: null,
      },
    });
  });

  it('bez vozu, který čeká, nic', () => {
    const s = withWorkshop(village(), 'carpenter', CARPENTER_ID, CARPENTER);
    expect(ironOf(s, DAY)).toBeNull();
  });
});

describe('převod vsí rodu na téže mapě (zrušeno – migration.md)', () => {
  it('zahodí zbylý přehled sousedů i cestu pro kování do jiné vsi, podruhé nic nemění', () => {
    const s = withWaitingCart(village(), [16]);
    const legacy = JSON.parse(JSON.stringify(s)) as VillageState & { neighbours?: unknown };
    legacy.neighbours = { dwellings: [], cells: [], smithies: [{ x: 1, z: 2, name: 'Lhota' }] };
    const dwelling = legacy.dwellings.find((d) => d.id === CARPENTER_ID)!;
    dwelling.workshop!.ironTrip = {
      to: { kind: 'village', name: 'Lhota', x: 340, z: 0 },
    } as never;
    const once = withoutSameMapVillages(legacy);
    expect('neighbours' in once).toBe(false);
    expect(once.dwellings.find((d) => d.id === CARPENTER_ID)!.workshop!.ironTrip).toBeNull();
    // idempotence: druhý průchod vrátí tentýž objekt
    expect(withoutSameMapVillages(once)).toBe(once);
    // ves bez zbytků se nezmění
    expect(withoutSameMapVillages(s)).toBe(s);
  });
});
