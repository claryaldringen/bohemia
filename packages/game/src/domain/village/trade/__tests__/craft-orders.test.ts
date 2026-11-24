import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import { restingCarpenters } from '../../crafts/carpentry';
import {
  craftTargets,
  newWorkshop,
  restingCrafters,
  smithBarsTargetKg,
  workshopLabor,
} from '../../crafts/crafts';
import {
  ironDeficit,
  ironWorkManDays,
  smeltRate,
  smithBellows,
  toolNeedKg,
} from '../../crafts/iron';
import { FORGE } from '../../crafts/iron-rates';
import { NO_CRAFTS } from '../../core/productivity';
import { missingCart } from '../../livestock/draft';
import { CRAFT_BASE, MARKET } from '../../rules';
import type {
  CraftOrder,
  MarketArrival,
  MarketResult,
  MarketTrip,
  MarketVisitor,
  TradeGoods,
  VillageState,
} from '../../types';
import {
  craftPayWants,
  fillOrders,
  liveOrders,
  markOrderReady,
  orderTargets,
  placedOrder,
  rememberOrders,
} from '../craft-orders';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { marketStance } from '../market-stance';
import { DAY, dwelling, trackedVillage, type KinSpec } from '../../__tests__/kin-fixtures';
import { D, marketVillage, report, withWorkshop } from './market-fixtures';

// Zakázky u řemeslníka a obilí za výrobky (markets.md – Rozhodnutí plánu 3, body 5 a 6; Martin
// 24. 11. 2026: „Ano, řemeslník bere obilí vždy“): hostitel s pracujícím řemeslníkem shání za své
// výrobky obilí a luštěniny, nekoupený výrobek zapíše jako zakázku, vyrobí ho a ohlásí; kupující
// si zakázky pamatuje.

/** Dílna kováře v M. */
const SMITH = 700;

/**
 * Ves M nad pojistkou zásob (obilí neshání) s pracujícím kovářem: uhlí, ruda, hřivny na zásobě,
 * kterou kovář drží (`smithBarsTargetKg`), a vybavení nástroji na potřebě + `toolsOver` kg.
 */
function smithVillage(toolsOver = 0): VillageState {
  const m = marketVillage(-1_000);
  withWorkshop(m, 'smith', SMITH, { oreKg: 500 });
  m.crafts = { charcoalKg: 5_000, potteryKg: 0 };
  m.crafts.ironBarsKg = smithBarsTargetKg(m, D);
  m.toolEquipmentKg = toolNeedKg(m, D) + toolsOver;
  return m;
}

/** Výprava na trhu M: ves `id`, co veze a co shání. */
function visitor(id: string, goods: TradeGoods, wants: TradeGoods): MarketVisitor {
  return {
    key: `market:${id}:1`,
    fromVillageId: id,
    fromName: id,
    order: 1,
    arrivedDay: D,
    lastDay: D,
    travelDays: 0,
    goods,
    horses: [],
    wants,
    sold: {},
    bought: {},
    boughtHorses: [],
  };
}

/** Výprava z Vlkova (H) na den: veze 900 kg obilí, shání 10 kg nástrojů. */
function arrival(fields: Partial<MarketArrival> = {}): MarketArrival {
  return {
    key: 'market:h:1',
    fromVillageId: 'h',
    fromName: 'Vlkov',
    stayDays: 1,
    travelDays: 0,
    goods: { grain: 900 },
    horses: [],
    wants: { tools: 10 },
    report,
    ...fields,
  };
}

/** Výsledek trhu výpravy `key` v odchozí schránce M. */
function resultOf(s: VillageState, key: string): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return mail.body.result;
}

/** Zakázka u hostitele. */
function order(villageId: string, amount: number, day: number): CraftOrder {
  return { villageId, name: villageId === 'h' ? 'Vlkov' : 'Kounice', good: 'tools', amount, day };
}

/** M se zakázkami a okolím: Vlkov (H) na sousední mapě, Kounice (K) o mapu dál. */
function withOrders(m: VillageState, orders: CraftOrder[]): VillageState {
  m.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], orders };
  m.nearby = {
    day: D - 1,
    self: { villageId: 'm', name: 'Lhota' },
    villages: [
      { villageId: 'h', name: 'Vlkov', cells: 1, firstStep: 'W' },
      { villageId: 'k', name: 'Kounice', cells: 2, firstStep: 'N' },
    ],
  };
  return m;
}

describe('řemeslník bere obilí vždy (Rozhodnutí plánu 3, bod 5; Martin 24. 11. 2026)', () => {
  it('kovář nad pojistkou shání obilí za hodnotu nástrojů, které výpravy chtějí', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    // obilí neshání, nástroje nabízí 12 kg
    expect(stance.wants.grain).toBeUndefined();
    expect(stance.offer.tools).toBe(12);
    craftPayWants(m, D, stance, [visitor('h', { grain: 900 }, { tools: 10 })], {});
    // 10 kg × 4 mince = 40 mincí = 600 kg obilí (60 : 1), luštěniny ne
    expect(stance.wants.grain).toBeCloseTo(600, 9);
    expect(stance.wants.legumes).toBeUndefined();
  });

  it('obilí nestačí – zbytek hodnoty v luštěninách, nejvýš co výpravy vezou', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    craftPayWants(m, D, stance, [visitor('h', { grain: 300, legumes: 500 }, { tools: 10 })], {});
    expect(stance.wants.grain).toBeCloseTo(300, 9);
    expect(stance.wants.legumes).toBeCloseTo(300, 9);
  });

  it('dvě výpravy chtějí 20 kg – hodnota jen 12 kg nabídky', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    const visitors = [
      visitor('h', { grain: 900 }, { tools: 10 }),
      visitor('k', { grain: 900 }, { tools: 10 }),
    ];
    craftPayWants(m, D, stance, visitors, {});
    expect(stance.wants.grain).toBeCloseTo(720, 9);
  });

  it('bez pracujícího kováře se seznam nezmění', () => {
    const m = smithVillage(12);
    m.dwellings.find((d) => d.id === SMITH)!.workshop!.activity = 'no-charcoal';
    const stance = marketStance(m, D);
    const before = structuredClone(stance.wants);
    craftPayWants(m, D, stance, [visitor('h', { grain: 900 }, { tools: 10 })], {});
    expect(stance.wants).toEqual(before);
  });

  it('na trhu: kovář nad pojistkou prodá výpravě nástroje za obilí', () => {
    const m = smithVillage(12);
    joinMarket(m, D, arrival());
    marketDay(m, D);
    const result = resultOf(m, 'market:h:1');
    expect(result.bought).toEqual({ tools: 10 });
    expect(result.sold.grain).toBeCloseTo(600, 6);
    expect(result.ordered).toBeUndefined();
    expect(m.market!.orders).toBeUndefined();
  });
});

describe('zakázka při odjezdu výpravy (Rozhodnutí plánu 3, bod 6)', () => {
  it('nekoupené nástroje od kováře s obilím ve voze → zakázka, i když hostitel obilí neshání', () => {
    const m = smithVillage();
    expect(marketStance(m, D).offer.tools).toBeUndefined();
    joinMarket(m, D, arrival());
    marketDay(m, D);
    expect(m.market!.orders).toEqual([
      { villageId: 'h', name: 'Vlkov', good: 'tools', amount: 10, day: D },
    ]);
    const result = resultOf(m, 'market:h:1');
    expect(result.ordered).toEqual({ tools: 10 });
    expect(result.unsold).toEqual({ grain: 900 });
  });

  it('bez kováře, nebo bez obilí, luštěnin a čehokoli, co hostitel shání → žádná zakázka', () => {
    const plain = marketVillage(-1_000);
    joinMarket(plain, D, arrival());
    marketDay(plain, D);
    expect(plain.market!.orders).toBeUndefined();
    expect(resultOf(plain, 'market:h:1').ordered).toBeUndefined();
    // med hostitel neshání
    const m = smithVillage();
    joinMarket(m, D, arrival({ goods: { honey: 5 } }));
    marketDay(m, D);
    expect(m.market!.orders).toBeUndefined();
    expect(resultOf(m, 'market:h:1').ordered).toBeUndefined();
  });

  it('další výprava téže vsi zakázku nahradí (4 kg, ne 14)', () => {
    const m = smithVillage();
    joinMarket(m, D, arrival());
    marketDay(m, D);
    joinMarket(m, D + 1, arrival({ key: 'market:h:2', wants: { tools: 4 } }));
    marketDay(m, D + 1);
    expect(m.market!.orders).toEqual([
      { villageId: 'h', name: 'Vlkov', good: 'tools', amount: 4, day: D + 1 },
    ]);
  });

  it('prodej kupujícímu zakázku zmenší, prodej všeho ji smaže', () => {
    const m = withOrders(smithVillage(6), [order('h', 10, D - 5)]);
    joinMarket(m, D, arrival({ goods: { grain: 900 }, wants: { tools: 6 } }));
    marketDay(m, D);
    expect(resultOf(m, 'market:h:1').bought).toEqual({ tools: 6 });
    expect(m.market!.orders).toEqual([order('h', 4, D - 5)]);
    const all = withOrders(smithVillage(12), [order('h', 10, D - 5)]);
    joinMarket(all, D, arrival());
    marketDay(all, D);
    expect(all.market!.orders).toBeUndefined();
  });

  it(`zakázka vyprší po MARKET.orderDays (${MARKET.orderDays}) dnech`, () => {
    const m = withOrders(smithVillage(), [order('h', 10, D)]);
    expect(orderTargets(m, D + MARKET.orderDays).tools).toBe(10);
    expect(orderTargets(m, D + MARKET.orderDays + 1).tools).toBe(0);
    expect(liveOrders(m, D + MARKET.orderDays + 1)).toEqual([]);
    // vypršelá zakázka zmizí i ze stavu – stav hostitele neroste
    fillOrders(m, D + MARKET.orderDays + 1);
    expect(m.market!.orders).toBeUndefined();
  });
});

describe('výroba na zakázku (Rozhodnutí plánu 3, bod 6)', () => {
  it('kovář kuje na zakázku aspoň na celý den práce, menší zakázka ho do dílny nepošle', () => {
    const m = smithVillage();
    const need = toolNeedKg(m, D);
    const bars = m.crafts!.ironBarsKg!;
    // práce celého řetězu na kg nástrojů navíc: kování, hřivny na ně a houba na hřivny
    const labor = workshopLabor(m, D, SMITH, NO_CRAFTS.pottery);
    const rate = smeltRate(smithBellows(m, SMITH, D));
    const workFor = (kg: number): number =>
      ironWorkManDays(
        ironDeficit({
          equipmentKg: need,
          needKg: need + kg,
          barsKg: bars,
          bloomKg: 0,
          barsTargetKg: bars,
        }),
        labor.skill,
        rate,
      );
    const fullDayKg = (1.5 * labor.craft) / workFor(1);
    expect(workFor(fullDayKg)).toBeGreaterThan(labor.craft);
    // bez zakázky je všeho dost – kovář pracuje se vsí
    expect(restingCrafters(m, D, NO_CRAFTS).get(SMITH)).toBe('resting');
    withOrders(m, [order('h', fullDayKg, D - 1)]);
    expect(restingCrafters(m, D, NO_CRAFTS).has(SMITH)).toBe(false);
    // zakázka na půl dne práce kovárnu nespustí (smithRests)
    withOrders(m, [order('h', fullDayKg / 3, D - 1)]);
    expect(workFor(fullDayKg / 3)).toBeLessThan(labor.craft);
    expect(restingCrafters(m, D, NO_CRAFTS).get(SMITH)).toBe('resting');
  });
});

describe('hrnčíř a tesař vyrábějí i na zakázku (Rozhodnutí plánu 3, bod 6)', () => {
  it('hrnčíř se zásobou na craftTargets odpočívá, se zakázkou keramiky ne', () => {
    const m = marketVillage(-1_000);
    withWorkshop(m, 'potter', 701);
    m.crafts = { charcoalKg: 0, potteryKg: craftTargets(m, D).potteryKg };
    expect(restingCrafters(m, D, NO_CRAFTS).get(701)).toBe('resting');
    withOrders(m, [{ ...order('h', 5, D - 1), good: 'pottery' }]);
    expect(restingCrafters(m, D, NO_CRAFTS).has(701)).toBe(false);
  });

  it('tesař bez potřeby vsi odpočívá; zakázka vozu nebo dřevěného nářadí ho pošle do dílny', () => {
    const m = marketVillage(-1_000);
    withWorkshop(m, 'carpenter', 702);
    m.crafts = { charcoalKg: 0, potteryKg: 0, woodToolsKg: craftTargets(m, D).woodToolsKg };
    // bez ohrady volů ves vozy nechce
    expect(missingCart(m)).toBeNull();
    expect(restingCarpenters(m, D).get(702)).toBe('resting');
    withOrders(m, [{ ...order('h', 1, D - 1), good: 'twoWheelCarts' }]);
    expect(restingCarpenters(m, D).has(702)).toBe(false);
    // vůz pro zakázku se už dělá – druhý tesař další nezačne
    m.dwellings.find((d) => d.id === 702)!.workshop!.cart = { kind: 'two-wheel', done: 1 };
    withWorkshop(m, 'carpenter', 703);
    expect(restingCarpenters(m, D).get(703)).toBe('resting');
    withOrders(m, [{ ...order('h', 2, D - 1), good: 'woodTools' }]);
    expect(restingCarpenters(m, D).has(703)).toBe(false);
  });
});

describe('zakázka po kouscích dopočtu (determinismus)', () => {
  /** Ves rodu (vojvoda se ženou a synem ve dvorci) a kovář se ženou v kovárně. */
  const FAMILY: KinSpec[] = [
    { id: 10, age: 40, sex: 'male', spouse: 11 },
    { id: 11, age: 36, sex: 'female', spouse: 10 },
    { id: 12, age: 12, sex: 'male', father: 10, mother: 11 },
    { id: 20, age: 30, sex: 'male', spouse: 21, home: 2 },
    { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
  ];

  it('kovárna se zakázkou – vcelku = po kouscích, i ohlášení v odchozí schránce', () => {
    const smithy = {
      ...dwelling(2, CRAFT_BASE.smith),
      position: { x: 40, z: 0, rotation: 0 },
      workshop: { ...newWorkshop('smith'), activity: 'producing' as const, oreKg: 500 },
    };
    const s: VillageState = {
      ...trackedVillage(FAMILY, [dwelling(1), smithy], { storesKg: 2_000 }),
      lastDay: DAY,
    };
    s.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    s.crafts.ironBarsKg = smithBarsTargetKg(s, DAY + 1) + 6 * FORGE.barsKgPerKg;
    s.toolEquipmentKg = toolNeedKg(s, DAY + 1);
    withOrders(s, [order('h', 6, DAY)]);
    const end = DAY + 40;
    const whole = advanceVillage(s, end, null, null);
    let parts = s;
    for (const day of [DAY + 7, DAY + 19, DAY + 20, end]) {
      parts = advanceVillage(parts, day, null, null);
    }
    expect(parts).toEqual(whole);
    expect(whole.outbox).toEqual([
      expect.objectContaining({ villageId: 'h', ref: `order:m:h:tools:${DAY}` }),
    ]);
  });
});

describe('hotová zakázka – ohlášení (Rozhodnutí plánu 3, bod 6)', () => {
  it('zásoba 12 kg nad potřebou pokryje dřívější zakázku H (10), K (5) ne; podruhé nic', () => {
    const m = withOrders(smithVillage(12), [order('k', 5, D), order('h', 10, D - 1)]);
    fillOrders(m, D);
    expect(m.market!.orders).toEqual([order('k', 5, D), { ...order('h', 10, D - 1), readyDay: D }]);
    expect(m.outbox).toEqual([
      {
        villageId: 'h',
        day: D + 1,
        ref: `order:m:h:tools:${D - 1}`,
        body: {
          kind: 'order-ready',
          ready: { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10 },
        },
      },
    ]);
    // H je hotová (zásoba je pro ni), na K zbývají 2 kg – nic dalšího
    fillOrders(m, D + 1);
    expect(m.outbox).toHaveLength(1);
    // s 15 kg nad potřebou se ohlásí i K – posel o mapu dál jde den
    m.toolEquipmentKg! += 3;
    fillOrders(m, D + 2);
    expect(m.outbox!.at(-1)).toMatchObject({ villageId: 'k', day: D + 4 });
  });

  it('bez okolí se neohlašuje; kupující mimo okolí – posel jako na sousední mapu', () => {
    const lone = withOrders(smithVillage(12), [order('h', 10, D)]);
    delete lone.nearby;
    fillOrders(lone, D);
    expect(lone.outbox).toBeUndefined();
    expect(lone.market!.orders![0]!.readyDay).toBeUndefined();
    const far = withOrders(smithVillage(12), [order('x', 10, D)]);
    fillOrders(far, D);
    expect(far.outbox).toEqual([expect.objectContaining({ villageId: 'x', day: D + 1 })]);
  });
});

describe('zakázky kupujícího (Rozhodnutí plánu 3, bod 6)', () => {
  const trip: MarketTrip = {
    key: 'market:h:1',
    villageId: 'm',
    name: 'Lhota',
    wants: { tools: 10, pottery: 5 },
    stayDays: 1,
    travelDays: 0,
    arriveDay: D,
    returnDay: D + 1,
  };
  const result: MarketResult = {
    key: 'market:h:1',
    sold: {},
    bought: {},
    unsold: { grain: 900 },
    horses: [],
    ordered: { tools: 10 },
  };

  it('objednané → open, nekoupené a neobjednané → refused, ohlášení → ready', () => {
    const h = marketVillage();
    rememberOrders(h, D + 1, trip, result);
    expect(h.orders).toEqual([
      { villageId: 'm', name: 'Lhota', good: 'pottery', amount: 5, day: D + 1, status: 'refused' },
      { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10, day: D + 1, status: 'open' },
    ]);
    expect(placedOrder(h, D + 1, 'tools')).toMatchObject({ villageId: 'm', status: 'open' });
    expect(placedOrder(h, D + 1, 'pottery')).toBeNull();
    const events = markOrderReady(h, D + 5, {
      villageId: 'm',
      name: 'Lhota',
      good: 'tools',
      amount: 10,
    });
    expect(events).toEqual([
      { day: D + 5, kind: 'order-ready', villageName: 'Lhota', villageId: 'm', good: 'tools' },
    ]);
    expect(placedOrder(h, D + 5, 'tools')).toMatchObject({ status: 'ready' });
    // zakázka kupujícího vyprší jako zakázka u hostitele
    expect(placedOrder(h, D + 1 + MARKET.orderDays + 1, 'tools')).toBeNull();
  });

  it('koupené zakázku uzavře, i když hostitel zapsal zbytek', () => {
    const h = marketVillage();
    rememberOrders(h, D + 1, trip, result);
    markOrderReady(h, D + 5, { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10 });
    const pickup: MarketResult = {
      ...result,
      key: 'market:h:2',
      bought: { tools: 9.95 },
      ordered: { tools: 0.05 },
    };
    rememberOrders(h, D + 7, { ...trip, key: 'market:h:2', wants: { tools: 10 } }, pickup);
    expect(placedOrder(h, D + 7, 'tools')).toBeNull();
    expect(h.orders).toEqual([expect.objectContaining({ good: 'pottery', status: 'refused' })]);
  });

  it('ohlášení bez otevřené zakázky nic nezmění; výprava vrácená zaniklým hostitelem nic neodmítne', () => {
    const h = marketVillage();
    expect(
      markOrderReady(h, D, { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10 }),
    ).toEqual([]);
    expect(h.orders).toBeUndefined();
    rememberOrders(h, D + 1, trip, { ...result, ordered: undefined, returned: true });
    expect(h.orders).toBeUndefined();
  });
});
