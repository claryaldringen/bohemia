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
  toolEquipmentKg,
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
  TradeGood,
  TradeGoods,
  VillageState,
} from '../../types';
import {
  craftStance,
  fillOrders,
  liveOrders,
  markOrderReady,
  orderTargets,
  placedOrder,
  recordOrders,
  rememberOrders,
} from '../craft-orders';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { initialPrice } from '../market-prices';
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

/** M (Lhota) s okolím: Vlkov (H) na sousední mapě, Kounice (K) o mapu dál. */
function withNearby(m: VillageState): VillageState {
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

/** M se zakázkami a okolím. */
function withOrders(m: VillageState, orders: CraftOrder[]): VillageState {
  m.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], orders };
  return withNearby(m);
}

/** Výprava z Kounic (K) na den: veze 900 kg obilí, shání 10 kg nástrojů. */
function kounice(fields: Partial<MarketArrival> = {}): MarketArrival {
  return arrival({ key: 'market:k:1', fromVillageId: 'k', fromName: 'Kounice', ...fields });
}

/** Výprava kupujícího do Lhoty (M) se seznamem `wants`. */
function tripToLhota(key: string, wants: TradeGoods): MarketTrip {
  return {
    key,
    villageId: 'm',
    name: 'Lhota',
    wants,
    stayDays: 1,
    travelDays: 0,
    arriveDay: D,
    returnDay: D + 1,
  };
}

/** Co ves drží ze zboží, které se v testech obchoduje. */
function holdings(s: VillageState): TradeGoods {
  return {
    grain: s.storesKg,
    tools: toolEquipmentKg(s),
    pottery: s.crafts?.potteryKg ?? 0,
    cows: s.livestock?.herds.cow ?? 0,
  };
}

describe('řemeslník bere obilí vždy (Rozhodnutí plánu 3, bod 5; Martin 24. 11. 2026)', () => {
  it('zápočet řemeslníků: kovář nad pojistkou prodá nástroje a shání za ně obilí', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    // obilí neshání, nástroje nabízí 12 kg
    expect(stance.wants.grain).toBeUndefined();
    expect(stance.offer.tools).toBe(12);
    const before = structuredClone(stance);
    const craft = craftStance(m, stance, [visitor('h', { grain: 900 }, { tools: 10 })], {});
    // jen výrobky dílen; 10 kg × 4 mince = 40 mincí = 600 kg obilí (60 : 1), luštěniny ne
    expect(craft!.offer).toEqual({ tools: 12 });
    expect(Object.keys(craft!.wants)).toEqual(['grain']);
    expect(craft!.wants.grain).toBeCloseTo(600, 9);
    // seznam hostitele pro dnešní zápočet se nemění – obilí shání jen podle výpočtu potřeby
    expect(stance).toEqual(before);
  });

  it('obilí nestačí – zbytek hodnoty v luštěninách, nejvýš co výpravy vezou', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    const craft = craftStance(
      m,
      stance,
      [visitor('h', { grain: 300, legumes: 500 }, { tools: 10 })],
      {},
    );
    expect(craft!.wants.grain).toBeCloseTo(300, 9);
    expect(craft!.wants.legumes).toBeCloseTo(300, 9);
  });

  it('dvě výpravy chtějí 20 kg – hodnota jen 12 kg nabídky', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    const visitors = [
      visitor('h', { grain: 900 }, { tools: 10 }),
      visitor('k', { grain: 900 }, { tools: 10 }),
    ];
    expect(craftStance(m, stance, visitors, {})!.wants.grain).toBeCloseTo(720, 9);
  });

  it('bez pracujícího kováře, bez platby nebo bez zájmu výprav zápočet řemeslníků není', () => {
    const m = smithVillage(12);
    const stance = marketStance(m, D);
    expect(craftStance(m, stance, [visitor('h', { honey: 5 }, { tools: 10 })], {})).toBeNull();
    expect(craftStance(m, stance, [visitor('h', { grain: 900 }, { cows: 1 })], {})).toBeNull();
    m.dwellings.find((d) => d.id === SMITH)!.workshop!.activity = 'no-charcoal';
    expect(
      craftStance(m, marketStance(m, D), [visitor('h', { grain: 900 }, { tools: 10 })], {}),
    ).toBeNull();
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

  it('obilí jen za výrobky: výprava, která chce krávu, ji za obilí nekoupí, výprava pro nástroje je koupí', () => {
    const m = smithVillage(12);
    const cows = m.livestock!.herds.cow;
    // krávu hostitel nabízí, obilí neshání
    expect(marketStance(m, D).offer.cows).toBeGreaterThan(0);
    // A přijela první a chce krávu, B chce nástroje – obě vezou obilí
    joinMarket(m, D, arrival({ key: 'market:a:1', fromVillageId: 'a', wants: { cows: 1 } }));
    joinMarket(m, D, arrival({ key: 'market:b:1', fromVillageId: 'b' }));
    marketDay(m, D);
    const a = resultOf(m, 'market:a:1');
    const b = resultOf(m, 'market:b:1');
    expect(a.bought).toEqual({});
    expect(a.sold).toEqual({});
    expect(a.unsold).toEqual({ grain: 900 });
    expect(b.bought).toEqual({ tools: 10 });
    expect(b.sold.grain).toBeCloseTo(600, 9);
    expect(m.livestock!.herds.cow).toBe(cows);
    expect(b.ordered).toBeUndefined();
    expect(m.market!.orders).toBeUndefined();
  });

  it('výprava, která chce krávu i nástroje, koupí za obilí jen nástroje – bez zakázky', () => {
    const m = smithVillage(12);
    joinMarket(m, D, arrival({ wants: { cows: 1, tools: 10 } }));
    marketDay(m, D);
    const result = resultOf(m, 'market:h:1');
    expect(result.bought).toEqual({ tools: 10 });
    expect(result.sold.grain).toBeCloseTo(600, 9);
    expect(result.ordered).toBeUndefined();
    expect(m.market!.orders).toBeUndefined();
  });

  it('tržní den ve dvou zápočtech je vyrovnaný – nic nevznikne ani nezmizí', () => {
    const m = smithVillage(12);
    const before = holdings(m);
    // A chce krávu za obilí (nedostane ji), P prodá keramiku, kterou hostitel shání, za obilí
    // hostitele, C koupí nástroje za obilí v zápočtu řemeslníků
    const sent = {
      a: { goods: { grain: 900 }, wants: { cows: 1 } },
      p: { goods: { pottery: 70 }, wants: { grain: 210 } },
      c: { goods: { grain: 900 }, wants: { tools: 10 } },
    };
    for (const [id, { goods, wants }] of Object.entries(sent)) {
      joinMarket(m, D, arrival({ key: `market:${id}:1`, fromVillageId: id, goods, wants }));
    }
    const held = marketDay(m, D)[0];
    const results = Object.keys(sent).map((id) => resultOf(m, `market:${id}:1`));
    const [a, p, c] = results;
    expect(a!.bought).toEqual({});
    expect(p!.bought.grain).toBeCloseTo(210, 9);
    expect(p!.sold).toEqual({ pottery: 70 });
    expect(c!.bought).toEqual({ tools: 10 });
    expect(c!.sold.grain).toBeCloseTo(600, 9);
    // co výprava prodala nebo jí zbylo, přivezla
    for (const [i, { goods }] of Object.values(sent).entries()) {
      const r = results[i]!;
      for (const [good, kg] of Object.entries(goods)) {
        const g = good as keyof TradeGoods;
        expect((r.sold[g] ?? 0) + (r.unsold[g] ?? 0)).toBeCloseTo(kg, 9);
      }
    }
    // co hostitel získal nebo ztratil, výpravy ztratily nebo získaly
    const after = holdings(m);
    for (const good of ['grain', 'tools', 'pottery', 'cows'] as const) {
      const visitors = results.reduce(
        (sum, r) => sum + (r.sold[good] ?? 0) - (r.bought[good] ?? 0),
        0,
      );
      expect(after[good]! - before[good]!).toBeCloseTo(visitors, 9);
    }
    // kronika hostitele: oba zápočty dohromady – hodnota prodaného = hodnota koupeného za ceny dne
    // (výchozí – trh je nový)
    if (held?.kind !== 'market-held') throw new Error('Trh se nekonal.');
    expect(held.sold.tools).toBe(10);
    expect(held.sold.grain).toBeCloseTo(210, 9);
    expect(held.bought.grain).toBeCloseTo(600, 9);
    expect(held.bought.pottery).toBe(70);
    const worth = (goods: TradeGoods): number =>
      Object.entries(goods).reduce(
        (sum, [g, n]) => sum + (n ?? 0) * initialPrice(g as TradeGood),
        0,
      );
    expect(worth(held.sold)).toBeCloseTo(worth(held.bought), 9);
  });

  it('dvě výpravy po 10 kg při zásobě 12 kg: první 10 kg, druhá 2 kg a zakázku na zbytek', () => {
    const m = withNearby(smithVillage(12));
    joinMarket(m, D, arrival());
    joinMarket(m, D, kounice());
    marketDay(m, D);
    const h = resultOf(m, 'market:h:1');
    const k = resultOf(m, 'market:k:1');
    expect(h.bought.tools).toBeCloseTo(10, 9);
    expect(h.ordered).toBeUndefined();
    expect(k.bought.tools).toBeCloseTo(2, 9);
    expect(k.ordered!.tools).toBeCloseTo(8, 9);
    expect(m.market!.orders).toEqual([
      { villageId: 'k', name: 'Kounice', good: 'tools', amount: k.ordered!.tools, day: D },
    ]);
    // kupující K vede tutéž zakázku – i když něco koupil, má přednost `ordered` hostitele
    const kv = marketVillage();
    rememberOrders(kv, D + 1, tripToLhota('market:k:1', { tools: 10 }), k);
    expect(kv.orders).toEqual([
      {
        villageId: 'm',
        name: 'Lhota',
        good: 'tools',
        amount: k.ordered!.tools,
        day: D + 1,
        status: 'open',
      },
    ]);
    // M zbytek vykove a ohlásí – ohlášení nezapadne
    m.toolEquipmentKg = toolNeedKg(m, D) + k.ordered!.tools!;
    fillOrders(m, D + 1);
    const mail = m.outbox!.find((x) => x.body.kind === 'order-ready');
    if (mail?.body.kind !== 'order-ready') throw new Error('Zakázka se neohlásila.');
    expect(mail.villageId).toBe('k');
    expect(markOrderReady(kv, mail.day, mail.body.ready)).toHaveLength(1);
    expect(placedOrder(kv, mail.day, 'tools')).toMatchObject({ status: 'ready' });
    // vyzvednutí – opotřebení od ohlášení ubralo 0,03 kg; po něm nezbude nic na žádné straně
    m.toolEquipmentKg -= 0.03;
    joinMarket(m, mail.day, kounice({ key: 'market:k:2', wants: { tools: 8 } }));
    marketDay(m, mail.day);
    const pickup = resultOf(m, 'market:k:2');
    expect(pickup.bought.tools).toBeCloseTo(7.97, 9);
    expect(pickup.ordered).toBeUndefined();
    expect(m.market!.orders).toBeUndefined();
    rememberOrders(kv, mail.day + 1, tripToLhota('market:k:2', { tools: 8 }), pickup);
    expect(kv.orders).toBeUndefined();
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

  it('bez obilí s mincemi → zakázka jako u obilí; bez mincí a bez obilí nic (Rozhodnutí plánu 4, bod 4)', () => {
    const m = smithVillage();
    expect(marketStance(m, D).offer.tools).toBeUndefined();
    joinMarket(m, D, arrival({ goods: { coins: 12 } }));
    marketDay(m, D);
    expect(m.market!.orders).toEqual([order('h', 10, D)]);
    const result = resultOf(m, 'market:h:1');
    expect(result.ordered).toEqual({ tools: 10 });
    expect(result.unsold).toEqual({ coins: 12 });
    expect(m.coins).toBeUndefined();
    const none = smithVillage();
    joinMarket(none, D, arrival({ goods: {} }));
    marketDay(none, D);
    expect(none.market!.orders).toBeUndefined();
    expect(resultOf(none, 'market:h:1').ordered).toBeUndefined();
    // bez pracujícího kováře ani s mincemi
    const plain = marketVillage(-1_000);
    joinMarket(plain, D, arrival({ goods: { coins: 12 } }));
    marketDay(plain, D);
    expect(plain.market!.orders).toBeUndefined();
  });

  it('co kovář má, koupí výprava za mince, zakázku na zbytek zapíše, dokud jí mince zbývají', () => {
    // 2 kg nástrojů nad potřebu po 4 mincích, na zbylých 8 kg má výprava ještě 12 mincí
    const m = smithVillage(2);
    joinMarket(m, D, arrival({ goods: { coins: 20 } }));
    marketDay(m, D);
    const result = resultOf(m, 'market:h:1');
    expect(result.bought).toEqual({ tools: 2 });
    expect(result.ordered).toEqual({ tools: 8 });
    expect(m.market!.orders).toEqual([order('h', 8, D)]);
    expect(result.unsold).toEqual({ coins: 12 });
    expect(m.coins).toBe(8);
    // mince utracené – na zbytek už nemá čím zaplatit
    const spent = smithVillage(2);
    joinMarket(spent, D, arrival({ goods: { coins: 8 } }));
    marketDay(spent, D);
    expect(resultOf(spent, 'market:h:1').bought).toEqual({ tools: 2 });
    expect(resultOf(spent, 'market:h:1').ordered).toBeUndefined();
    expect(spent.market!.orders).toBeUndefined();
    expect(spent.coins).toBe(8);
    // koupila celý seznam – mince navíc zakázku nezaloží
    const full = smithVillage(12);
    joinMarket(full, D, arrival({ goods: { coins: 60 } }));
    marketDay(full, D);
    expect(resultOf(full, 'market:h:1').bought).toEqual({ tools: 10 });
    expect(resultOf(full, 'market:h:1').unsold).toEqual({ coins: 20 });
    expect(full.market!.orders).toBeUndefined();
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

  it('prodej kupujícímu zakázku za pobytu zmenší, při odjezdu ji nahradí zbytek seznamu', () => {
    // zakázka H na 10 kg, M má 6 kg nad potřebou; výprava H stojí na trhu dva dny
    const m = withOrders(smithVillage(6), [order('h', 10, D - 5)]);
    joinMarket(m, D, arrival({ stayDays: 2 }));
    marketDay(m, D);
    expect(m.market!.orders).toEqual([order('h', 4, D - 5)]);
    marketDay(m, D + 1);
    const result = resultOf(m, 'market:h:1');
    expect(result.bought).toEqual({ tools: 6 });
    expect(result.ordered).toEqual({ tools: 4 });
    expect(m.market!.orders).toEqual([order('h', 4, D + 1)]);
  });

  it('vyzvednutí hotové zakázky ji uzavře celou; kdo koupil, co chtěl, starou zakázku nemá', () => {
    // hotová zakázka H na 10 kg, od ohlášení se opotřebilo 0,03 kg – zbytek se znovu nezapíše
    const ready = withOrders(smithVillage(9.97), [{ ...order('h', 10, D - 5), readyDay: D - 1 }]);
    joinMarket(ready, D, arrival());
    marketDay(ready, D);
    expect(resultOf(ready, 'market:h:1').bought.tools).toBeCloseTo(9.97, 9);
    expect(resultOf(ready, 'market:h:1').ordered).toBeUndefined();
    expect(ready.market!.orders).toBeUndefined();
    // neohlášená zakázka 10 kg, nová výprava H chce jen 6 a koupí je – kupující zakázku smaže
    // (koupil bez `ordered`), hostitel taky
    const less = withOrders(smithVillage(6), [order('h', 10, D - 5)]);
    joinMarket(less, D, arrival({ wants: { tools: 6 } }));
    marketDay(less, D);
    expect(resultOf(less, 'market:h:1').bought).toEqual({ tools: 6 });
    expect(resultOf(less, 'market:h:1').ordered).toBeUndefined();
    expect(less.market!.orders).toBeUndefined();
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

  it('po částečném nákupu má přednost `ordered` hostitele; koupené bez `ordered` zakázku uzavře', () => {
    const h = marketVillage();
    const partial: MarketResult = { ...result, bought: { tools: 3 }, ordered: { tools: 7 } };
    rememberOrders(h, D + 1, { ...trip, wants: { tools: 10 } }, partial);
    expect(h.orders).toEqual([
      { villageId: 'm', name: 'Lhota', good: 'tools', amount: 7, day: D + 1, status: 'open' },
    ]);
    markOrderReady(h, D + 5, { villageId: 'm', name: 'Lhota', good: 'tools', amount: 7 });
    // vyzvednutí: hostitel hotovou zakázku uzavřel a zbytek znovu nezapsal
    const pickup: MarketResult = {
      ...result,
      key: 'market:h:2',
      bought: { tools: 6.97 },
      ordered: undefined,
    };
    rememberOrders(h, D + 7, { ...trip, key: 'market:h:2', wants: { tools: 7 } }, pickup);
    expect(placedOrder(h, D + 7, 'tools')).toBeNull();
    expect(h.orders).toBeUndefined();
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

  it('zakázky u zaniklého hostitele zmizí s výpravou, kterou vrátil (ne až za rok)', () => {
    const h = marketVillage();
    rememberOrders(h, D + 1, trip, result);
    markOrderReady(h, D + 5, { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10 });
    // zakázka u jiné vsi zůstane
    const elsewhere = { ...trip, key: 'market:x:1', villageId: 'x', name: 'Kounice' };
    rememberOrders(h, D + 6, elsewhere, { ...result, key: 'market:x:1' });
    rememberOrders(
      h,
      D + 9,
      { ...trip, key: 'market:h:2' },
      {
        ...result,
        key: 'market:h:2',
        ordered: undefined,
        returned: true,
      },
    );
    expect(placedOrder(h, D + 9, 'tools')).toMatchObject({ villageId: 'x', status: 'open' });
    expect(h.orders!.every((o) => o.villageId === 'x')).toBe(true);
  });
});

describe('zakázka na mince (Rozhodnutí plánu 4, bod 4; Martin 25. 11. 2026)', () => {
  /** Hostitel s kovářem, výprava jen s mincemi a bez obilí; `by` říká, kdo ji poslal. */
  function recorded(by?: MarketVisitor['by']): TradeGoods {
    const m = withNearby(smithVillage(0));
    m.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], orders: [] };
    const v = { ...visitor('k', { coins: 50 }, { tools: 10 }), ...(by ? { by } : {}) };
    return recordOrders(m, D, v, {});
  }

  it('výprava vesničanů mince neutratí: zakázka jen na mince se nezapíše', () => {
    expect(recorded('villagers')).toEqual({});
  });

  it('výprava hráče (bez `by`) i správce zaplatí mincemi', () => {
    expect(recorded('steward')).toEqual({ tools: 10 });
    expect(recorded()).toEqual({ tools: 10 });
  });
});
