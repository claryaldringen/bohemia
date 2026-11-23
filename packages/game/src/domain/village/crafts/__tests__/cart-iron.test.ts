import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import {
  cartIronDay,
  cartIronKg,
  ironTripHelpers,
  ironTripShares,
  withoutSameMapVillages,
} from '../cart-iron';
import { summarizeVillage } from '../../core/summary';
import {
  cartAwaitingIron,
  cartIronBarsKg,
  craftNeeds,
  ironOrderBarsKg,
  newWorkshop,
  restingCrafters,
  smithBarsTargetKg,
} from '../crafts';
import { barsReserveKg } from '../iron';
import { restingCarpenters } from '../carpentry';
import { NO_CRAFTS } from '../../core/productivity';
import { CARPENTRY, CART_IRON, CRAFT_BASE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { ChronicleEvent, Craft, Person, VillageState } from '../../types';
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

describe('vůz má kování (wagons.md – Kování vozů)', () => {
  it('dvoukolák 3 kg, čtyřkolák 6 kg', () => {
    expect(cartIronKg('two-wheel')).toBe(3);
    expect(cartIronKg('four-wheel')).toBe(6);
  });

  it('vůz bez kování se nedokončí – tesař mezitím dělá dřevěné nářadí', () => {
    const s = withWorkshop(withWaitingCart(village()), 'smith', SMITH_ID, 70, [], -40);
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 1 };
    expect(cartAwaitingIron(carpenter(s))).toBe(true);
    const events = cartIronDay(s, DAY + 1);
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
    const events = cartIronDay(s, DAY + 1);
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

describe('ves bez kováře – vůz čeká na kování (markets.md – Pravidla 1)', () => {
  it('bez kováře a bez hřiven nikdo nejde pro kování – vůz čeká, obilí zůstane', () => {
    const s = crowd(withWaitingCart(village(), [16]), 9);
    s.storesKg = 5000;
    const events: ChronicleEvent[] = [];
    for (let d = DAY + 1; d <= DAY + 30; d++) events.push(...cartIronDay(s, d));
    expect(events.filter((e) => e.kind === 'iron-trip')).toEqual([]);
    expect(carpenter(s).ironTrip ?? null).toBeNull();
    expect(carpenter(s).cart).not.toBeNull();
    expect(s.storesKg).toBe(5000);
    expect(ironTripHelpers(s)).toBe(0);
  });

  it('uložená cesta pro kování ze starší vsi doběhne – kování přinese a vůz je hotový', () => {
    const s = withWaitingCart(village(), [16]);
    carpenter(s).ironTrip = {
      personId: 62,
      son: true,
      startedDay: DAY - 5,
      days: 3,
      done: 2,
      kg: 3,
      grainKg: 170,
      to: {
        kind: 'neighbour',
        name: 'Lhota',
        direction: 'N',
        trailId: null,
        edge: { x: 0, z: 100 },
      },
    };
    expect(cartIronDay(s, DAY + 1)).toEqual([
      { day: DAY + 1, kind: 'iron-brought', cart: 'two-wheel', son: true },
      { day: DAY + 1, kind: 'cart-made', cart: 'two-wheel' },
    ]);
    expect(s.carts).toHaveLength(1);
    expect(carpenter(s).ironTrip).toBeNull();
  });

  it('kdo cestou zemřel, kování nepřinese – vůz čeká dál', () => {
    const s = withWaitingCart(village(), [16]);
    carpenter(s).ironTrip = {
      personId: 62,
      son: true,
      startedDay: DAY - 5,
      days: 3,
      done: 2,
      kg: 3,
      grainKg: 170,
      to: {
        kind: 'neighbour',
        name: 'Lhota',
        direction: 'N',
        trailId: null,
        edge: { x: 0, z: 100 },
      },
    };
    s.people = s.people.filter((p) => p.id !== 62);
    expect(cartIronDay(s, DAY + 1)).toEqual([]);
    expect(carpenter(s).ironTrip).toBeNull();
    expect(carpenter(s).cart).not.toBeNull();
  });

  it('uložená cesta ze starší vsi – nosiči a sedlák s vozem chybí v práci vsi (ironTripHelpers, ironTripShares)', () => {
    const s = withWaitingCart(village(), [16]);
    const trip = {
      personId: 62,
      son: true,
      startedDay: DAY - 5,
      days: 3,
      done: 1,
      kg: 3,
      grainKg: 170,
    };
    const edge = { x: 0, z: 100 };
    // nosiči krajinou ke kraji mapy
    carpenter(s).ironTrip = {
      ...trip,
      porters: 2,
      to: { kind: 'neighbour', name: 'Lhota', direction: 'N', trailId: null, edge },
    };
    expect(ironTripHelpers(s)).toBe(2);
    expect(ironTripShares(s)).toEqual([
      { target: { kind: 'edge', direction: 'N', x: 0, z: 100 }, manDays: 2 },
    ]);
    // vůz se sedlákem po zemské stezce
    carpenter(s).ironTrip = {
      ...trip,
      cartId: 7,
      to: { kind: 'neighbour', name: 'Lhota', direction: 'N', trailId: 3, edge },
    };
    expect(ironTripHelpers(s)).toBe(CART_IRON.cartCrew);
    expect(ironTripShares(s)).toEqual([
      { target: { kind: 'trail', id: 3 }, manDays: CART_IRON.cartCrew },
    ]);
    // jen tesař nebo syn – chybí v dílně, ne v práci vsi
    carpenter(s).ironTrip = {
      ...trip,
      to: { kind: 'neighbour', name: 'Lhota', direction: 'N', trailId: null, edge },
    };
    expect(ironTripHelpers(s)).toBe(0);
    expect(ironTripShares(s)).toEqual([]);
  });

  it('v simulaci: ves bez kováře a hřiven vůz nedokončí a dopočet nezávisí na kouscích', () => {
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
    s.draft = {
      ...s.draft,
      lastYear: { from: DAY - 365, 'two-wheel': [100], 'four-wheel': [], plough: [], oxCost: 12 },
    };
    const all = advanceVillage(s, DAY + 120, null);
    expect(all.carts ?? []).toHaveLength(0);
    expect(all.chronicle.some((e) => e.kind === 'iron-trip')).toBe(false);
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

  it('vůz čeká na kování; uložená cesta ze starší vsi se v panelu ukáže', () => {
    const s = withWaitingCart(village(), [16]);
    expect(ironOf(s, DAY)).toEqual({ kg: 3, trip: null });
    carpenter(s).ironTrip = {
      personId: 62,
      son: true,
      startedDay: DAY,
      days: 4,
      done: 0,
      kg: 3,
      grainKg: 170,
      porters: 2,
      to: {
        kind: 'neighbour',
        name: 'Lhota',
        direction: 'N',
        trailId: null,
        edge: { x: 0, z: 100 },
      },
    };
    expect(ironOf(s, DAY + 1)).toEqual({
      kg: 3,
      trip: {
        to: 'Lhota',
        direction: 'N',
        daysLeft: 4,
        son: true,
        age: 16,
        porters: 2,
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
