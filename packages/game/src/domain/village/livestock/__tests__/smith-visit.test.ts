import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import { paymentPool } from '../../crafts/craft-buying';
import { craftCoverage, newWorkshop, workshopLabor } from '../../crafts/crafts';
import { isAway } from '../../people/people';
import { CARPENTRY, CRAFT_BASE, HORSE_SHOEING } from '../../rules';
import { marketStance } from '../../trade/market-stance';
import { joinMarket, marketDay } from '../../trade/market';
import { applyMarketResult } from '../../trade/market-trip';
import type { MarketArrival, MarketResult, SmithAsk, VillageMail, VillageState } from '../../types';
import { at, horse, horsePen, horseVillage } from '../../__tests__/horse-fixtures';
import { dwelling, trackedVillage, type KinSpec } from '../../__tests__/kin-fixtures';
import {
  D,
  asEvents,
  report,
  withWorkshop,
  withoutOutbox,
} from '../../trade/__tests__/market-fixtures';
import { finishShoeing } from '../horse-shoeing';
import { answerSmithAsk, askSmithDay, serveShoeing, smithFeeKg } from '../smith-visit';

// Kovář souseda ke koním (markets.md – Rozhodnutí plánu 3, bod 9; Martin: „kovář z jiné vsi …
// násobně dražší, protože musí přijít“): ves A s koňmi po termínu bez kováře pošle dotaz
// `smith-ask` vsi K s kovářem, kovář K přijde sám jako výprava na trh se `service`, u koní hned
// okuje a vezme poplatek; výsledek jde domů jako u každé výpravy.

/** Kovář K (id) a obydlí jeho kovárny. */
const SMITH_ID = 20;
const FORGE_ID = 600;

/** A (Vlkov): dva jezdečtí koně s termínem kování v den D, bez kováře; okolí K a zpráva o kováři. */
function horseHome(): VillageState {
  const s = horseVillage([horse(1, 8, 'male', 50), horse(2, 6, 'male', 10)]);
  s.lastDay = D - 1;
  s.shoeing = { lastDay: D - HORSE_SHOEING.everyDays };
  s.nearby = {
    day: D - 5,
    self: { villageId: 'a', name: 'Vlkov' },
    villages: [{ villageId: 'k', name: 'Kovářovice', cells: 1, firstStep: 'E' }],
  };
  s.news = [{ villageId: 'k', name: 'Kovářovice', report: { ...report, crafts: ['smith'] } }];
  return s;
}

/**
 * K (Kovářovice): pracující kovárna – kovář se ženou –, `barsKg` hřiven, bez jezdeckých koní; okolí
 * s A; dopočítaná do D.
 */
function smithVillage(barsKg = 10): VillageState {
  const s = horseVillage(null, 2, 4);
  s.lastDay = D;
  withWorkshop(s, 'smith', FORGE_ID);
  const smith = s.people.find((p) => p.id === SMITH_ID)!;
  const wife = s.people.find((p) => p.id === SMITH_ID + 1)!;
  wife.dwellingId = FORGE_ID;
  smith.spouseId = wife.id;
  wife.spouseId = smith.id;
  s.crafts = { charcoalKg: 200, potteryKg: 0, ironBarsKg: barsKg };
  s.nearby = {
    day: D - 5,
    self: { villageId: 'k', name: 'Kovářovice' },
    villages: [{ villageId: 'a', name: 'Vlkov', cells: 1, firstStep: 'W' }],
  };
  return s;
}

/** Dotaz ve zprávách odchozí schránky (poslední `smith-ask`). */
function askOf(s: VillageState): SmithAsk {
  const mail = s.outbox!.filter((m) => m.body.kind === 'smith-ask').at(-1)!;
  return (mail.body as { ask: SmithAsk }).ask;
}

/** Příjezd výpravy v odchozí schránce (`market-arrive`). */
function arrivalOf(s: VillageState): MarketArrival {
  const mail = s.outbox!.find((m) => m.body.kind === 'market-arrive')!;
  return (mail.body as { arrival: MarketArrival }).arrival;
}

/** Výsledek trhu v odchozí schránce (`market-result`). */
function resultOf(s: VillageState): VillageMail & { body: { result: MarketResult } } {
  return s.outbox!.find((m) => m.body.kind === 'market-result')! as VillageMail & {
    body: { result: MarketResult };
  };
}

/** Práce řemesla kovárny K v den `day` (čd). */
function forgeCraft(s: VillageState, day: number): number {
  return workshopLabor(s, day, FORGE_ID, craftCoverage(s, day).pottery).craft;
}

describe('poplatek kováři souseda (Rozhodnutí plánu 3, bod 9)', () => {
  it('(0,5 čd × koně + 2 × cesta + pobyt) × den řemeslníka 4 kg + hřivny po 45 kg', () => {
    // dva koně u sousední mapy: (1 + 0 + 1) × 4 + 1 × 45
    expect(smithFeeKg(2, 0)).toBe(53);
    // o mapu dál: den tam a den zpět navíc
    expect(smithFeeKg(2, 1)).toBe(61);
    expect(smithFeeKg(1, 0)).toBeCloseTo((0.5 + 1) * 4 + 0.5 * 45, 9);
  });
});

describe('dotaz vsi s koňmi (askSmithDay)', () => {
  it('po termínu bez kováře jeden dotaz K na D + 1; další dny nic, dokud dotaz čeká', () => {
    const a = horseHome();
    askSmithDay(a, D);
    expect(a.outbox).toEqual([
      {
        villageId: 'k',
        day: D + 1,
        ref: `smith:a:${D}:ask`,
        body: {
          kind: 'smith-ask',
          ask: {
            key: `smith:a:${D}`,
            fromVillageId: 'a',
            fromName: 'Vlkov',
            cells: 1,
            firstStep: 'E',
            horses: 2,
            report: expect.objectContaining({ day: D }),
          },
        },
      },
    ]);
    expect(a.shoeing).toEqual({
      lastDay: D - HORSE_SHOEING.everyDays,
      asked: {
        key: `smith:a:${D}`,
        villageId: 'k',
        name: 'Kovářovice',
        untilDay: D + 3,
        nearbyDay: a.nearby!.day,
      },
    });
    for (let day = D + 1; day <= D + 3; day++) askSmithDay(a, day);
    expect(a.outbox).toHaveLength(1);
    // dotaz bez kování uplynul – jediná ves s kovářem kováře neposlala: další dotaz až s novým
    // okolím (jako rotace cílů správce)
    for (let day = D + 4; day <= D + 30; day++) askSmithDay(a, day);
    expect(a.outbox).toHaveLength(1);
    a.nearby = { ...a.nearby!, day: D + 31 };
    askSmithDay(a, D + 31);
    expect(a.outbox!.map((m) => [m.villageId, m.day, m.ref])).toEqual([
      ['k', D + 1, `smith:a:${D}:ask`],
      ['k', D + 32, `smith:a:${D + 31}:ask`],
    ]);
    expect(a.shoeing!.asked).toMatchObject({ key: `smith:a:${D + 31}`, untilDay: D + 34 });
    expect(a.shoeing!.asked!.tried).toBeUndefined();
  });

  it('bez odpovědi nejvýš jeden dotaz na ves s kovářem za okolí – za herní rok v mezích', () => {
    const a = horseHome();
    for (let day = D; day < D + 365; day++) {
      // okolí se obnovuje v pevné dny po 30 dnech (NEARBY_REFRESH_DAYS)
      if (day % 30 === 0) a.nearby = { ...a.nearby!, day };
      askSmithDay(a, day);
    }
    // dřív ~84 dotazů za rok (každé ~4 dny); teď nejvýš jeden na snímek okolí
    expect(a.outbox!.length).toBeGreaterThan(0);
    expect(a.outbox!.length).toBeLessThanOrEqual(Math.ceil(365 / 30) + 1);
  });

  it('vlastní kovář okuje – čekající dotaz zmizí a nový se nepošle', () => {
    const a = horseHome();
    askSmithDay(a, D);
    a.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 5 };
    finishShoeing(a, D + 1, { horses: 2, manDays: 2 * HORSE_SHOEING.manDays }, 1);
    expect(a.shoeing).toEqual({ lastDay: D + 1 });
    askSmithDay(a, D + 5);
    expect(a.outbox).toHaveLength(1);
  });

  it('bez okolí, před termínem, bez zprávy o kováři nebo s vlastním kovářem nic', () => {
    const none = horseHome();
    delete none.nearby;
    const early = horseHome();
    const unknown = horseHome();
    unknown.news = [{ villageId: 'k', name: 'Kovářovice', report: { ...report, crafts: [] } }];
    const own = horseHome();
    withWorkshop(own, 'smith', FORGE_ID);
    own.crafts = { charcoalKg: 100, potteryKg: 0, ironBarsKg: 5 };
    for (const [s, day] of [
      [none, D],
      [early, D - 1],
      [unknown, D],
      [own, D],
    ] as const) {
      askSmithDay(s, day);
      expect(s.outbox).toBeUndefined();
      expect(s.shoeing?.asked).toBeUndefined();
    }
  });

  it('rotace: K1 neodpoví → dotaz K2, pak až s novým okolím zase K1; ves bez zprávy o kováři se přeskočí', () => {
    const a = horseHome();
    a.nearby!.villages = [
      { villageId: 'k1', name: 'Kovářovice', cells: 1, firstStep: 'E' },
      { villageId: 'x', name: 'Lhota', cells: 1, firstStep: 'N' },
      { villageId: 'k2', name: 'Kladruby', cells: 2, firstStep: 'S' },
    ];
    a.news = [
      { villageId: 'k1', name: 'Kovářovice', report: { ...report, crafts: ['smith'] } },
      { villageId: 'x', name: 'Lhota', report: { ...report, crafts: ['potter'] } },
      { villageId: 'k2', name: 'Kladruby', report: { ...report, crafts: ['smith'] } },
    ];
    for (let day = D; day <= D + 20; day++) askSmithDay(a, day);
    // K1 sousední mapa: dotaz D + 1, čeká do D + 3; K2 o mapu dál: dotaz den + 2, čeká do den + 5;
    // obě kováře neposlaly – další dotaz až s novým okolím, zase od nejbližší
    expect(a.outbox!.map((m) => [m.villageId, m.day])).toEqual([
      ['k1', D + 1],
      ['k2', D + 6],
    ]);
    expect(a.shoeing!.asked!.tried).toEqual(['k1']);
    a.nearby = { ...a.nearby!, day: D + 21 };
    askSmithDay(a, D + 21);
    expect(a.outbox!.map((m) => [m.villageId, m.day]).at(-1)).toEqual(['k1', D + 22]);
  });
});

describe('ves kováře na dotaz (answerSmithAsk)', () => {
  it('kovář doma s hřivnami vyrazí sám: bez nosičů, hřivny na koně, `service`, pryč do návratu', () => {
    const a = horseHome();
    askSmithDay(a, D);
    const k = smithVillage();
    expect(answerSmithAsk(k, D + 1, askOf(a))).toEqual([]);
    const trips = k.trade!.expeditions;
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      by: 'smith',
      kind: 'market',
      direction: 'W',
      porters: 0,
      cost: 0,
      give: { ironBars: 1 },
      startedDay: D + 2,
      market: { villageId: 'a', name: 'Vlkov', arriveDay: D + 2, returnDay: D + 3 },
    });
    expect(trips[0]!.carts).toBeUndefined();
    expect(k.crafts!.ironBarsKg).toBeCloseTo(9, 9);
    expect(k.people.find((p) => p.id === SMITH_ID)!.away).toEqual({
      kind: 'craft',
      untilDay: D + 3,
    });
    expect(k.outbox).toEqual([
      expect.objectContaining({
        villageId: 'a',
        day: D + 2,
        body: {
          kind: 'market-arrive',
          arrival: expect.objectContaining({
            fromVillageId: 'k',
            fromName: 'Kovářovice',
            goods: { ironBars: 1 },
            wants: {},
            firstStep: 'W',
            service: { kind: 'shoeing', horses: 2 },
          }),
        },
      }),
    ]);
    expect(k.chronicle.at(-1)).toMatchObject({
      kind: 'market-departed',
      by: 'smith',
      villageName: 'Vlkov',
      villageId: 'a',
    });
    // posel zašel na pivo – K ví o vsi, která se ptala
    expect(k.news).toEqual([expect.objectContaining({ villageId: 'a', name: 'Vlkov' })]);
  });

  it('bez hřiven nad vlastní rezervu, s kovářem pryč nebo bez okolí nikdo nevyrazí', () => {
    const a = horseHome();
    askSmithDay(a, D);
    const ask = askOf(a);
    const poor = smithVillage(0.9);
    // K má vlastního jezdeckého koně – rezerva 0,5 kg na jeho kování
    const reserve = smithVillage(1.4);
    reserve.pens = [horsePen(91, [horse(5, 6, 'male', 0)])];
    const away = smithVillage();
    away.people.find((p) => p.id === SMITH_ID)!.away = { kind: 'journey', untilDay: D + 10 };
    const lost = smithVillage();
    delete lost.nearby;
    for (const k of [poor, reserve, away, lost]) {
      expect(answerSmithAsk(k, D + 1, ask)).toEqual([]);
      expect(k.outbox).toBeUndefined();
      expect(k.trade?.expeditions ?? []).toEqual([]);
    }
    expect(poor.people.find((p) => p.id === SMITH_ID)!.away).toBeUndefined();
    // s rezervou i na koně A vyrazí
    const enough = smithVillage(1.5);
    enough.pens = [horsePen(91, [horse(5, 6, 'male', 0)])];
    answerSmithAsk(enough, D + 1, ask);
    expect(enough.trade!.expeditions).toHaveLength(1);
  });

  it('kovárna K ve dnech, kdy je kovář pryč, nekuje – žena ho v dílně nezastoupí', () => {
    const a = horseHome();
    askSmithDay(a, D);
    const k = smithVillage();
    expect(forgeCraft(k, D + 1)).toBeGreaterThan(0);
    answerSmithAsk(k, D + 1, askOf(a));
    expect(forgeCraft(k, D + 1)).toBe(0);
    expect(forgeCraft(k, D + 2)).toBe(0);
    // první den doma zase kuje
    expect(forgeCraft(k, D + 3)).toBeGreaterThan(0);
  });
});

describe('kovář u koní (serveShoeing)', () => {
  it('A na příjezd: okuje hned, termín dnes, 53 kg obilí do `bought`, hřivny do `sold`', () => {
    const a = horseHome();
    askSmithDay(a, D);
    const k = smithVillage();
    answerSmithAsk(k, D + 1, askOf(a));
    const before = structuredClone(a);
    const events = joinMarket(a, D + 2, arrivalOf(k));
    expect(events).toContainEqual({
      day: D + 2,
      kind: 'horses-shod',
      horses: 2,
      own: false,
      direction: 'E',
      villageName: 'Kovářovice',
      villageId: 'k',
    });
    expect(a.shoeing).toEqual({ lastDay: D + 2 });
    expect(before.storesKg - a.storesKg).toBeCloseTo(53, 9);
    const visitor = a.market!.visitors[0]!;
    expect(visitor.bought.grain).toBeCloseTo(53, 9);
    expect(visitor.bought.legumes).toBeUndefined();
    expect(visitor.sold).toEqual({ ironBars: 1 });
    expect(visitor.goods).toEqual({});
    // hřivny A zůstaly – kovář kuje ze svých
    expect(a.crafts?.ironBarsKg ?? 0).toBe(before.crafts?.ironBarsKg ?? 0);
    // druhá výprava se stejnou službou už nemá co kovat
    expect(serveShoeing(a, D + 2, visitor)).toEqual([]);
  });

  it('poplatek i z pojistky, obilí, pak luštěniny, nejvýš co ves má – okuje i tak', () => {
    const arrive = (storesKg: number, legumesKg: number) => {
      const a = horseHome();
      askSmithDay(a, D);
      const k = smithVillage();
      answerSmithAsk(k, D + 1, askOf(a));
      a.storesKg = storesKg;
      a.legumesKg = legumesKg;
      const coverage = craftCoverage(a, D + 2);
      const pool = paymentPool(a, D + 2, coverage, true);
      const noBuffer = paymentPool(a, D + 2, coverage);
      joinMarket(a, D + 2, arrivalOf(k));
      expect(a.shoeing).toEqual({ lastDay: D + 2 });
      return { a, pool, noBuffer, bought: a.market!.visitors[0]!.bought };
    };
    // pod pojistkou: bez ní by ves nezaplatila nic, z pojistky celých 53 kg
    const buffer = arrive(1_000, 0);
    expect(buffer.noBuffer.energyKg).toBe(0);
    expect(buffer.bought).toEqual({ grain: 53 });
    expect(buffer.a.storesKg).toBeCloseTo(947, 9);
    // málo vymláceného zrna: napřed obilí, zbytek luštěniny
    const legumes = arrive(30, 2_000);
    expect(legumes.pool.grainKg).toBeLessThan(53);
    expect(legumes.bought.grain).toBeCloseTo(legumes.pool.grainKg, 9);
    expect(legumes.bought.legumes).toBeCloseTo(53 - legumes.pool.grainKg, 9);
    expect(legumes.a.legumesKg).toBeCloseTo(2_000 - (53 - legumes.pool.grainKg), 9);
    // přebytek menší než poplatek: ves dá, co má
    const short = arrive(560, 0);
    expect(short.pool.energyKg).toBeGreaterThan(0);
    expect(short.pool.energyKg).toBeLessThan(53);
    expect(short.bought.grain).toBeCloseTo(short.pool.energyKg, 9);
  });

  it('K po výsledku: obilí +53, hřivny −1, kovář doma v `untilDay`; obilí A + K beze změny', () => {
    const a = horseHome();
    askSmithDay(a, D);
    const k = smithVillage();
    const a0 = structuredClone(a);
    const k0 = structuredClone(k);
    answerSmithAsk(k, D + 1, askOf(a));
    joinMarket(a, D + 2, arrivalOf(k));
    // výprava kováře do zápočtu nevstupuje – tržní den jen odjezd
    expect(marketDay(a, D + 2)).toEqual([]);
    expect(a.market!.visitors).toEqual([]);
    const mail = resultOf(a);
    expect(mail).toMatchObject({ villageId: 'k', day: D + 3 });
    expect(mail.body.result).toMatchObject({
      sold: { ironBars: 1 },
      bought: { grain: 53 },
      unsold: {},
    });
    const events = applyMarketResult(k, D + 3, mail.body.result);
    expect(events).toEqual([
      expect.objectContaining({ kind: 'market-returned', by: 'smith', villageId: 'a' }),
    ]);
    expect(k.storesKg - k0.storesKg).toBeCloseTo(53, 9);
    expect(k0.crafts!.ironBarsKg! - k.crafts!.ironBarsKg!).toBeCloseTo(1, 9);
    expect(a.storesKg + k.storesKg).toBeCloseTo(a0.storesKg + k0.storesKg, 9);
    expect(k.trade!.expeditions).toEqual([]);
    const smith = k.people.find((p) => p.id === SMITH_ID)!;
    expect(isAway(smith, D + 2)).toBe(true);
    expect(isAway(smith, D + 3)).toBe(false);
  });

  it('A mezitím okovaná: kovář nic nebere, A hřivny nekoupí, i když je shání; K je dostane zpět', () => {
    const a = horseHome();
    askSmithDay(a, D);
    const k = smithVillage();
    answerSmithAsk(k, D + 1, askOf(a));
    // A okoval mezitím vlastní kovář; vůz čeká na kování a hřivny A nemá – shání je
    a.shoeing = { lastDay: D + 1 };
    withWorkshop(a, 'carpenter', 710, {
      cart: { kind: 'two-wheel', done: CARPENTRY.cartManDays['two-wheel'] },
    });
    a.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 0 };
    expect(marketStance(a, D + 2).wants.ironBars).toBeGreaterThan(0);
    const storesBefore = a.storesKg;
    expect(joinMarket(a, D + 2, arrivalOf(k)).map((e) => e.kind)).toEqual(['market-arrived']);
    expect(a.storesKg).toBe(storesBefore);
    expect(a.market!.visitors[0]).toMatchObject({ sold: {}, bought: {}, goods: { ironBars: 1 } });
    marketDay(a, D + 2);
    expect(a.crafts.ironBarsKg).toBe(0);
    expect(resultOf(a).body.result).toMatchObject({
      sold: {},
      bought: {},
      unsold: { ironBars: 1 },
    });
  });
});

describe('kovář souseda mezi dvěma vsemi (schránky a dopočet)', () => {
  it('dotaz D, kovář vyrazí D + 1, kuje D + 2, doma s poplatkem D + 3', () => {
    const a1 = advanceVillage(horseHome(), D, null, null);
    expect(a1.outbox!.filter((m) => m.body.kind === 'smith-ask')).toHaveLength(1);
    const k1 = advanceVillage(smithVillage(), D + 1, null, null, asEvents(a1.outbox!));
    expect(k1.trade!.expeditions.filter((e) => e.by === 'smith')).toHaveLength(1);
    expect(k1.people.find((p) => p.id === SMITH_ID)!.away?.kind).toBe('craft');
    const a2 = advanceVillage(withoutOutbox(a1), D + 2, null, null, asEvents(k1.outbox!));
    expect(a2.shoeing!.lastDay).toBe(D + 2);
    expect(a2.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'horses-shod', own: false, villageName: 'Kovářovice' }),
    );
    const k2 = advanceVillage(withoutOutbox(k1), D + 3, null, null, asEvents(a2.outbox!));
    expect(k2.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'market-returned', by: 'smith', bought: { grain: 53 } }),
    );
    expect(k2.people.find((p) => p.id === SMITH_ID)!.away).toBeUndefined();
    expect(k2.trade!.expeditions).toEqual([]);
  });
});

describe('kovář souseda po kouscích dopočtu (determinismus)', () => {
  /** Vojvoda se ženou a synem ve dvorci, v domě 2 muž se ženou. */
  const FAMILY: KinSpec[] = [
    { id: 10, age: 40, sex: 'male', spouse: 11 },
    { id: 11, age: 36, sex: 'female', spouse: 10 },
    { id: 12, age: 12, sex: 'male', father: 10, mother: 11 },
    { id: 20, age: 30, sex: 'male', spouse: 21, home: 2 },
    { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
  ];
  // DAY (kin-fixtures) je 1. 1. 600 – lidé jsou o necelý rok starší
  const start = at(600, 6, 10);

  it('ves s koňmi: dotazy po termínu vcelku = po kouscích, i odchozí schránka', () => {
    const s: VillageState = {
      ...trackedVillage(FAMILY, [dwelling(1), dwelling(2)], { storesKg: 4_000 }),
      lastDay: start,
    };
    s.pens = [horsePen(90, [horse(1, 8, 'male', 50, start), horse(2, 6, 'male', 10, start)])];
    s.shoeing = { lastDay: start + 3 - HORSE_SHOEING.everyDays };
    s.nearby = {
      day: start - 5,
      self: { villageId: 'a', name: 'Vlkov' },
      villages: [{ villageId: 'k', name: 'Kovářovice', cells: 1, firstStep: 'E' }],
    };
    s.news = [{ villageId: 'k', name: 'Kovářovice', report: { ...report, crafts: ['smith'] } }];
    const end = start + 20;
    const whole = advanceVillage(s, end, null, null);
    for (const cut of [start + 3, start + 5, start + 6]) {
      expect(advanceVillage(advanceVillage(s, cut, null, null), end, null, null)).toEqual(whole);
    }
    // bez odpovědi jediná ves s kovářem další dotaz nedostane, dokud nepřijde nové okolí
    expect(whole.outbox!.map((m) => [m.villageId, m.day])).toEqual([['k', start + 4]]);
  });

  it('ves kováře: odpověď na dotaz vcelku = po kouscích, kovář doma v den návratu', () => {
    const forge = {
      ...dwelling(2, CRAFT_BASE.smith),
      workshop: { ...newWorkshop('smith'), activity: 'producing' as const },
    };
    const s: VillageState = {
      ...trackedVillage(FAMILY, [dwelling(1), forge], { storesKg: 4_000 }),
      lastDay: start,
      crafts: { charcoalKg: 200, potteryKg: 0, ironBarsKg: 10 },
      nearby: {
        day: start - 5,
        self: { villageId: 'k', name: 'Kovářovice' },
        villages: [{ villageId: 'a', name: 'Vlkov', cells: 2, firstStep: 'W' }],
      },
    };
    const ask: SmithAsk = {
      key: `smith:a:${start}`,
      fromVillageId: 'a',
      fromName: 'Vlkov',
      cells: 2,
      firstStep: 'E',
      horses: 2,
      report,
    };
    const inbox = asEvents([
      { villageId: 'k', day: start + 2, ref: `${ask.key}:ask`, body: { kind: 'smith-ask', ask } },
    ]);
    const end = start + 10;
    const whole = advanceVillage(s, end, null, null, inbox);
    for (const cut of [start + 1, start + 2, start + 4]) {
      const parts = advanceVillage(
        advanceVillage(s, cut, null, null, inbox),
        end,
        null,
        null,
        inbox,
      );
      expect(parts).toEqual(whole);
    }
    // o mapu dál: vyrazí start + 3, u koní start + 4, doma start + 6
    expect(whole.chronicle).toContainEqual(
      expect.objectContaining({ day: start + 2, kind: 'market-departed', by: 'smith' }),
    );
    expect(whole.outbox).toEqual([
      expect.objectContaining({ villageId: 'a', day: start + 4, ref: 'market:k:1:in' }),
    ]);
    const mid = advanceVillage(s, start + 5, null, null, inbox);
    expect(mid.people.find((p) => p.id === 20)!.away).toEqual({
      kind: 'craft',
      untilDay: start + 6,
    });
    expect(whole.people.find((p) => p.id === 20)!.away).toBeUndefined();
  });
});
