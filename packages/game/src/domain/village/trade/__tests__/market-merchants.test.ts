import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { isVillageDormant } from '../../people/departure';
import { MARKET, MERCHANTS } from '../../rules';
import type {
  ChronicleEvent,
  MarketArrival,
  MarketPrices,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  TradeGoods,
  VillageMarket,
  VillageState,
} from '../../types';
import { ARMS_GOODS, TRADE_GOODS } from '../goods';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { totalGoods } from '../market-clearing';
import { coinPriceOf, initialPrice } from '../market-prices';
import { marketStance } from '../market-stance';
import { merchantVisits, nextMerchantVisit } from '../merchant-plan';
import { affordableWants, extendMerchants, merchantsArrive } from '../merchants';
import { villageReport } from '../village-report';
import { D, marketVillage, report, withWorkshop } from './market-fixtures';

// Cizí kupci ve vsi u stezky (markets.md – Rozhodnutí plánu 4, body 3 a 5): v den plánu přijedou na
// trh s měšcem a zbrojí, obchodují jako strana zápočtů i mincovní fáze, na rušném trhu zůstanou déle
// a odjedou bez pošty – mince, zbroj a zboží vznikají jen jejich příjezdem a zanikají odjezdem.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** Druhé spojení křižovatky – průjezdy týchž dnů jako `STOP`. */
const CROSSING: MerchantStop = { ...STOP, key: '0,0,N' };
/** Křižovatka čtyř spojení – nejvíc, kolik jich uzel stezky má; každé má svoje průjezdy. */
const CROSSROADS: MerchantStop[] = ['0,0,E', '0,0,N', '-1,0,E', '0,-1,N'].map((key, index) => ({
  key,
  seed: 7 + index,
  index,
  length: 4,
}));
/** První příjezd kupců po D. */
const VISIT = nextMerchantVisit([STOP], D)!;
const DAY = VISIT.day;
const KEY = VISIT.key;
const PURSE = 60;
/** Ceny zbroje, kterou kupec veze – bez poptávky stojí na dně. */
const ARMS_PRICES: MarketPrices = { swords: 120, mailShirts: 480, helmets: 240 };

/** Dny prvních `n` průjezdů kupců od `DAY`. */
function visitDays(n: number): number[] {
  const days = merchantVisits([STOP], DAY, DAY + 26 * 366).map((visit) => visit.day);
  if (days.length < n) throw new Error(`Průjezdů je jen ${days.length}.`);
  return days.slice(0, n);
}

/**
 * Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců: chovné jádro krav a obilí `spareKg` kg
 * nad pojistkou – bez něj nic nenabízí. Med, vosk ani kožešiny nemá.
 */
function host(spareKg = 0, stops: MerchantStop[] = [STOP]): VillageState {
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, DAY).wants.grain! + spareKg;
  s.merchantStops = structuredClone(stops);
  return s;
}

/** Táž ves s obilím nad pojistkou a bez zastávek – jak je uložená dnes. */
function bareHost(): VillageState {
  const s = host(1_000);
  delete s.merchantStops;
  return s;
}

/** Výprava z vsi `key` s nákladem `goods`, která shání `wants`. */
function trip(
  key: string,
  goods: TradeGoods,
  wants: TradeGoods,
  fields: Partial<MarketArrival> = {},
): MarketArrival {
  return {
    key,
    fromVillageId: key.split(':')[1]!,
    fromName: 'Vlkov',
    stayDays: 1,
    travelDays: 0,
    goods,
    horses: [],
    wants,
    report,
    ...fields,
  };
}

/** `n` výprav na pivo – bez zboží a bez seznamu, `stayDays` dní na trhu. */
function beerTrips(n: number, stayDays: number): MarketArrival[] {
  return Array.from({ length: n }, (_, i) => trip(`market:p${i}:1`, {}, {}, { stayDays }));
}

/** Příjezd výpravy jako událost schránky vsi M v den `day`. */
function arriveEvent(arrival: MarketArrival, day: number, seq = 1): VillageEvent {
  return { id: arrival.key, seq, villageId: 'm', day, body: { kind: 'market-arrive', arrival } };
}

/** Cizí kupci na trhu. */
function merchantsOf(s: VillageState): MarketVisitor[] {
  return (s.market?.visitors ?? []).filter((v) => v.merchant);
}

/** Jediný cizí kupec na trhu – odkaz platí i po odjezdu. */
function merchantOf(s: VillageState): MarketVisitor {
  const [merchant, ...others] = merchantsOf(s);
  if (!merchant || others.length > 0) throw new Error('Na trhu není právě jeden kupec.');
  return merchant;
}

/** Výprava `key` na trhu. */
function visitorOf(s: VillageState, key: string): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
}

/** Výsledky trhu v odchozí schránce vsi. */
function results(s: VillageState): MarketResult[] {
  return (s.outbox ?? []).flatMap((mail) =>
    mail.body.kind === 'market-result' ? [mail.body.result] : [],
  );
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const result = results(s).find((r) => r.key === key);
  if (!result) throw new Error(`Výsledek ${key} chybí.`);
  return result;
}

/** Mince všude: ve vsi, u výprav a kupců na trhu a v odchozích výsledcích. */
function allCoins(s: VillageState): number {
  const carried = [
    ...(s.market?.visitors ?? []).map((v) => v.goods),
    ...results(s).map((r) => r.unsold),
  ];
  return (s.coins ?? 0) + carried.reduce((sum, goods) => sum + (goods.coins ?? 0), 0);
}

/** Zápisy kroniky o kupcích. */
function arrivedEvents(s: VillageState): ChronicleEvent[] {
  return s.chronicle.filter((e) => e.kind === 'merchants-arrived');
}

describe('příjezd cizích kupců (merchantsArrive)', () => {
  it('v den plánu stojí na trhu kupec s měšcem, zbrojí a seznamem; poznámka a kronika', () => {
    const s = host();
    expect(s).not.toHaveProperty('market');
    expect(merchantsArrive(s, DAY)).toStrictEqual([
      {
        day: DAY,
        kind: 'merchants-arrived',
        sells: { swords: 2, mailShirts: 1, helmets: 2 },
        buys: { honey: 100, wax: 24, furs: 60 },
        coins: 60,
      },
    ]);
    expect(s.market).toStrictEqual({
      prices: {},
      visitors: [
        {
          key: KEY,
          fromVillageId: '',
          fromName: '',
          order: 1,
          arrivedDay: DAY,
          lastDay: DAY,
          travelDays: 0,
          goods: { swords: 2, mailShirts: 1, helmets: 2, coins: 60 },
          horses: [],
          wants: { honey: 100, wax: 24, furs: 60 },
          sold: {},
          bought: {},
          boughtHorses: [],
          merchant: true,
        },
      ],
      nextOrder: 2,
      arrivals: [
        { name: '', day: DAY, goods: ['swords', 'mailShirts', 'helmets'], merchants: true },
      ],
    });
    // mince vznikly jen v měšci
    expect(s).not.toHaveProperty('coins');
    expect(allCoins(s)).toBe(PURSE);
  });

  it('zpráva na pivo uvádí i příjezd kupců – bez jména a bez vsi', () => {
    const s = host();
    merchantsArrive(s, DAY);
    expect(villageReport(s, DAY).traders).toStrictEqual([
      { name: '', day: DAY, goods: ['swords', 'mailShirts', 'helmets'], merchants: true },
    ]);
    // zpráva o vsi kupce nevzniká – žádnou nemá
    expect(s).not.toHaveProperty('news');
  });

  it('mimo den plánu, bez zastávek a na mapě bez stezky nic – trh nevznikne', () => {
    const dry = host(0, []);
    const unknown = host();
    delete unknown.merchantStops;
    for (const [s, day] of [
      [host(), DAY - 1],
      [host(), DAY + 1],
      [dry, DAY],
      [unknown, DAY],
    ] as const) {
      const before = structuredClone(s);
      expect(merchantsArrive(s, day)).toEqual([]);
      expect(s).toStrictEqual(before);
    }
  });

  it('týž klíč, který na trhu už stojí, se znovu nezaloží', () => {
    const s = host();
    merchantsArrive(s, DAY);
    const before = structuredClone(s);
    expect(merchantsArrive(s, DAY)).toEqual([]);
    expect(s).toStrictEqual(before);
  });

  it('na trhu, kde už někdo stojí, přijedou v pořadí za ním – ceny a hladina trhu zůstanou', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', {}, {}));
    s.market!.prices = { furs: 3 };
    s.market!.level = 1.5;
    merchantsArrive(s, DAY);
    expect(s.market!.visitors.map((v) => [v.key, v.order])).toEqual([
      ['market:a:1', 1],
      [KEY, 2],
    ]);
    expect(s.market).toMatchObject({ prices: { furs: 3 }, level: 1.5, nextOrder: 3 });
    expect(s.market!.arrivals.map((a) => a.name)).toEqual(['Vlkov', '']);
  });

  it('křižovatka: dva průjezdy téhož dne jsou dva kupci, každý se svým měšcem', () => {
    const s = host(0, [CROSSING, STOP]);
    const events = merchantsArrive(s, DAY);
    expect(events.map((e) => e.kind)).toEqual(['merchants-arrived', 'merchants-arrived']);
    expect(merchantsOf(s).map((v) => [v.key, v.order, v.goods.coins])).toEqual([
      ['merchants:0,0,E:601:2', 1, 60],
      ['merchants:0,0,N:601:2', 2, 60],
    ]);
    expect(s.market!.nextOrder).toBe(3);
    expect(s.market!.arrivals).toHaveLength(2);
    // výprava prodá víc, než na co má první – druhý dokoupí ze svého měšce
    joinMarket(s, DAY, trip('market:a:1', { furs: 120 }, {}));
    const [first, second] = merchantsOf(s) as [MarketVisitor, MarketVisitor];
    marketDay(s, DAY);
    expect([first.bought, first.goods.coins]).toEqual([{ furs: 60 }, 28]);
    expect([second.bought, second.goods.coins]).toEqual([{ furs: 60 }, 28]);
    expect(resultOf(s, 'market:a:1').unsold).toEqual({ coins: 64 });
  });

  it('obchod kupce nezmění čísla pravidel ani zápis kroniky', () => {
    const rules = structuredClone(MERCHANTS);
    const s = host();
    const [event] = merchantsArrive(s, DAY);
    joinMarket(s, DAY, trip('market:a:1', { honey: 100, coins: 300 }, { swords: 1 }));
    marketDay(s, DAY);
    expect(MERCHANTS).toEqual(rules);
    expect(event).toMatchObject({ sells: rules.goods, buys: rules.wants, coins: 60 });
    // další kupec přijede zase s plným nákladem
    const next = host();
    merchantsArrive(next, DAY);
    expect(merchantOf(next).goods).toEqual({ ...rules.goods, coins: 60 });
    expect(merchantOf(next).wants).toEqual(rules.wants);
  });

  it('vsi si pamatuje jen posledních MARKET.report.traders příjezdů – i s kupci', () => {
    const s = host();
    for (let i = 0; i < MARKET.report.traders; i++) {
      joinMarket(s, DAY - 1, trip(`market:p${i}:1`, {}, {}, { fromName: `Ves ${i}` }));
    }
    merchantsArrive(s, DAY);
    expect(s.market!.arrivals).toHaveLength(MARKET.report.traders);
    expect(s.market!.arrivals[0]!.name).toBe('Ves 1');
    expect(s.market!.arrivals.at(-1)).toMatchObject({ name: '', merchants: true });
  });
});

describe('tržní den s kupci (marketDay)', () => {
  it('kupec koupí od výpravy 30 kožešin za 16 mincí a 4 kg vosku za 8, výprava je odveze', () => {
    const s = host();
    expect(marketStance(s, DAY).offer).toEqual({});
    joinMarket(s, DAY, trip('market:a:1', { furs: 30, wax: 4 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(marketDay(s, DAY)).toEqual([]); // hostitel nic neprodal ani nekoupil
    const result = resultOf(s, 'market:a:1');
    expect(result.sold).toEqual({ furs: 30, wax: 4 });
    expect(result.bought).toEqual({});
    expect(result.unsold).toEqual({ coins: 24 });
    expect(merchant.bought).toEqual({ furs: 30, wax: 4 });
    expect(merchant.sold).toEqual({});
    expect(merchant.goods).toEqual({ ...MERCHANTS.goods, coins: 36 });
    expect(merchant.wants).toEqual({ honey: 100, wax: 20, furs: 30 });
    expect(s).not.toHaveProperty('coins');
  });

  it('kupec večer odjede bez pošty, výprava s výsledkem; bez výprav odchozí schránka nevznikne', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    expect(s.market!.visitors).toEqual([]);
    expect(s.outbox!.map((mail) => mail.ref)).toEqual([marketResultRef('market:a:1')]);
    expect(s.market).not.toHaveProperty('orders');

    const alone = host();
    merchantsArrive(alone, DAY);
    marketDay(alone, DAY);
    expect(alone.market!.visitors).toEqual([]);
    expect(alone).not.toHaveProperty('outbox');
    expect(allCoins(alone)).toBe(0); // měšec i zbroj odjely ze světa
    expect(alone).not.toHaveProperty('arms');

    // výprava, která zůstává, stojí na trhu dál
    const stays = host();
    joinMarket(stays, DAY, trip('market:a:1', {}, {}, { stayDays: 2 }));
    merchantsArrive(stays, DAY);
    marketDay(stays, DAY);
    expect(stays.market!.visitors.map((v) => v.key)).toEqual(['market:a:1']);
    expect(stays).not.toHaveProperty('outbox');
  });

  it('zápočtem vymění výprava plný náklad za 120 mincí za meč – měšec kupce zůstane', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { honey: 100, wax: 24, furs: 60 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    expect(result.sold).toEqual({ honey: 100, wax: 24, furs: 60 });
    expect(result.bought).toEqual({ swords: 1 });
    expect(result.unsold).toEqual({});
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2, coins: 60 });
    expect(merchant.sold).toEqual({ swords: 1 });
    expect(merchant.bought).toEqual({ honey: 100, wax: 24, furs: 60 });
    expect(merchant.wants).toEqual({});
  });

  it('náklad za 112 mincí meč zápočtem nekoupí: kupec ho vykoupí za celý měšec 60 mincí', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { honey: 100, wax: 20, furs: 60 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    expect(result.bought).toEqual({});
    // med 40 mincí, 37 kožešin 19,73 a zbytek vosk
    expect(result.sold).toEqual({ honey: 100, furs: 37, wax: expect.closeTo(0.1333333, 6) });
    expect(result.unsold).toEqual({ furs: 23, wax: expect.closeTo(19.8666667, 6), coins: 60 });
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(merchant.sold).toEqual({});
  });

  it('výprava s mincemi koupí od kupce meč za 120 a odveze ho, kupci zbude o jeden míň', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { coins: 300 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(allCoins(s)).toBe(300 + PURSE);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    expect(result.bought).toEqual({ swords: 1 });
    expect(result.unsold).toEqual({ coins: 180 });
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2, coins: 180 });
    expect(merchant.sold).toEqual({ swords: 1 });
  });

  it('součet světa: mince jdou od kupce přes výpravu k hostiteli, s odjezdem zmizí jen zbytek měšce', () => {
    const s = host();
    s.crafts = { charcoalKg: 0, potteryKg: 500 };
    expect(marketStance(s, DAY).offer.pottery).toBeGreaterThanOrEqual(50);
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, { pottery: 50 }, { stayDays: 2 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(allCoins(s)).toBe(PURSE);
    expect(marketDay(s, DAY)).toEqual([
      { day: DAY, kind: 'market-held', sold: { pottery: 50 }, bought: { coins: 10 } },
    ]);
    // kožešiny 16 mincí, výprava za 10 z nich keramiku
    expect(merchant.goods.coins).toBe(44);
    expect(visitorOf(s, 'market:a:1').goods).toEqual({ coins: 6 });
    expect(s.coins).toBe(10);
    expect(merchant.goods.coins! + visitorOf(s, 'market:a:1').goods.coins! + s.coins!).toBe(PURSE);
    // odjel kupec – zbytek měšce a zbroj s ním, nikde jinde nic nepřibylo ani nezmizelo
    expect(allCoins(s)).toBe(PURSE - 44);
    expect(s).not.toHaveProperty('arms');
    expect(s.crafts.potteryKg).toBe(450);
    marketDay(s, DAY + 1);
    expect(resultOf(s, 'market:a:1')).toMatchObject({
      sold: { furs: 30 },
      bought: { pottery: 50 },
      unsold: { coins: 6 },
    });
    expect(allCoins(s)).toBe(PURSE - 44);
  });

  it('kupec a hostitel sami: nic nevzniká – ves nemá co prodat a zbroj nekupuje', () => {
    const s = host(1_000);
    s.coins = 500;
    const before = structuredClone(s);
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(marketDay(s, DAY)).toEqual([]);
    expect(merchant.goods).toEqual({ ...MERCHANTS.goods, coins: 60 });
    const after: Partial<VillageState> = structuredClone(s);
    delete after.market;
    expect(after).toStrictEqual(before);
  });

  it('náhodné trhy: zboží i mince jen přecházejí mezi vsí, výpravami a kupci', () => {
    const goods = ['grain', 'pottery', 'cows', 'honey', 'wax', 'furs', ...ARMS_GOODS] as const;
    /** Kolik zboží drží ves – jen druhy, se kterými se v testu obchoduje. */
    const held = (s: VillageState): TradeGoods => ({
      grain: s.storesKg,
      pottery: s.crafts?.potteryKg ?? 0,
      cows: s.livestock!.herds.cow,
      honey: s.wares?.honeyKg ?? 0,
      wax: s.wares?.waxKg ?? 0,
      furs: (s.wares?.sheepFurs ?? 0) + (s.wares?.wildFurs ?? 0),
      ...s.arms,
      coins: s.coins ?? 0,
    });
    const random = createRandom(11);
    const some = (max: number): number => Math.floor(random.next() * max);
    const list = (share: number, max: number): TradeGoods =>
      Object.fromEntries(
        goods.filter(() => random.next() < share).map((good) => [good, some(max) + 1]),
      );
    let sold = 0;
    let bought = 0;
    for (let i = 0; i < 60; i++) {
      const s = host(some(3_000), [STOP, CROSSING]);
      s.livestock!.herds.cow = 3 + some(5);
      s.crafts = { charcoalKg: 0, potteryKg: some(500) };
      for (let n = some(4); n >= 0; n--) {
        const purse = random.next() < 0.5 ? { coins: some(400) + 1 } : {};
        const load = { ...list(0.4, 120), ...purse };
        joinMarket(s, DAY, trip(`market:p${n}:1`, load, list(0.4, 60)));
      }
      merchantsArrive(s, DAY);
      const visitors = [...s.market!.visitors]; // odkazy platí i po odjezdu
      const sums = (): TradeGoods[] => [held(s), ...visitors.flatMap((v) => [v.goods, v.bought])];
      const before = totalGoods(sums());
      // rušný trh kupce zdrží do druhého dne – nejpozději pak odjedou všichni
      for (const day of [DAY, DAY + 1]) {
        marketDay(s, day);
        const after = totalGoods(sums());
        for (const good of goods) expect(after[good] ?? 0).toBeCloseTo(before[good] ?? 0, 6);
        expect(after.coins).toBe(before.coins);
      }
      expect(s.market!.visitors).toEqual([]);
      for (const v of visitors) {
        expect(Number.isInteger(v.goods.coins ?? 0)).toBe(true);
        for (const good of TRADE_GOODS) expect(v.goods[good] ?? 0).toBeGreaterThanOrEqual(0);
        if (!v.merchant) continue;
        sold += (v.sold.swords ?? 0) + (v.sold.helmets ?? 0);
        bought += (v.bought.honey ?? 0) + (v.bought.wax ?? 0) + (v.bought.furs ?? 0);
      }
    }
    expect(sold).toBeGreaterThan(0);
    expect(bought).toBeGreaterThan(0);
  });
});

describe('poptávka kupců v ceně dne (affordableWants)', () => {
  /** Kupec s měšcem `coins`, který shání `wants`. */
  function merchant(coins: number, wants: TradeGoods): MarketVisitor {
    const s = host();
    merchantsArrive(s, DAY);
    const visitor = merchantOf(s);
    visitor.goods = { ...MERCHANTS.goods, ...(coins > 0 ? { coins } : {}) };
    visitor.wants = wants;
    return visitor;
  }

  it('nejvýš tolik celých jednotek, kolik by koupil za celý měšec', () => {
    const m = merchant(60, { furs: 60 });
    expect(affordableWants(m, {}, 1)).toEqual({ furs: 60 });
    expect(affordableWants(m, { furs: 10 }, 1)).toEqual({ furs: 6 });
    expect(affordableWants(m, { furs: 60 }, 1)).toEqual({ furs: 1 });
    expect(affordableWants(m, { furs: 61 }, 1)).toEqual({});
    // zboží v kg také po celých jednotkách: 60 ÷ 7 je 8,57 kg
    expect(affordableWants(merchant(60, { honey: 100 }), { honey: 7 }, 1)).toEqual({ honey: 8 });
  });

  it('každé zboží seznamu zvlášť, v ceně s hladinou a za měšec, který má', () => {
    const m = merchant(60, { honey: 100, wax: 24, furs: 60 });
    expect(affordableWants(m, {}, 1)).toEqual({ honey: 100, wax: 24, furs: 60 });
    // hladina 2: kožešina 16 ÷ 15 mince → 56, hladina 4: vosk 8 mincí → 7
    expect(affordableWants(m, {}, 2)).toEqual({ honey: 75, wax: 15, furs: 56 });
    expect(affordableWants(m, {}, 4)).toEqual({ honey: 37, wax: 7, furs: 28 });
    expect(affordableWants(merchant(5, { wax: 24, furs: 60 }), {}, 1)).toEqual({ wax: 2, furs: 9 });
    expect(affordableWants(merchant(0, { wax: 24, furs: 60 }), {}, 1)).toEqual({});
    expect(affordableWants(merchant(60, {}), {}, 1)).toEqual({});
  });

  it('dělení, které vyjde jen šumem pod celé číslo, jednotku neztratí', () => {
    // 60 ÷ 0,6 = 100, ale 60 ÷ (0,1 × 6) je v plovoucí čárce 99,99…
    expect(60 / (0.1 * 6)).toBeLessThan(100);
    expect(affordableWants(merchant(60, { honey: 100 }), { honey: 0.1 * 6 }, 1)).toEqual({
      honey: 100,
    });
  });
});

describe('ceny v den kupců (marketDay)', () => {
  /** Den kupce: hladina, výpravy na trhu, hostitel a úprava trhu před obchodem. */
  interface MerchantDay {
    level?: number;
    trips?: MarketArrival[];
    s?: VillageState;
    change?: (s: VillageState) => void;
  }

  /** Ceny po tržním dni vsi, kde stojí kupec, při uložených cenách `prices`. */
  function pricesAfter(prices: MarketPrices, setup: MerchantDay = {}): MarketPrices {
    const { level, trips = [], s = host(), change } = setup;
    s.market = {
      prices: { ...prices },
      visitors: [],
      nextOrder: 1,
      arrivals: [],
      ...(level === undefined ? {} : { level }),
    };
    for (const arrival of trips) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    change?.(s);
    marketDay(s, DAY);
    return s.market.prices;
  }

  it('co na trhu nikdo nenabízí, kupci nezdraží – sami ani v den s výpravou', () => {
    expect(pricesAfter({})).toEqual(ARMS_PRICES);
    const stored: MarketPrices = { honey: 5, wax: 10, furs: 20 };
    expect(pricesAfter(stored)).toEqual({ ...stored, ...ARMS_PRICES });
    // výprava veze jen med (12 ku 50) – vosk a kožešiny stojí, i když je kupec shání
    const after = pricesAfter(stored, { trips: [trip('market:a:1', { honey: 50 }, {})] });
    expect(after.honey).toBeCloseTo(5 * (1 + (0.1 * (12 - 50)) / 62), 12);
    expect(after).toMatchObject({ wax: 10, furs: 20 });
  });

  it('co je na trhu ke koupi, zdraží nejvýš do měšce – víc než měšec zlevní', () => {
    /** Cena kožešiny po dni, kdy výprava přivezla jednu. */
    const oneFur = (prices: MarketPrices, level?: number): number =>
      pricesAfter(prices, {
        trips: [trip('market:a:1', { furs: 1 }, {})],
        ...(level === undefined ? {} : { level }),
      }).furs!;
    // 60 kožešin ku jedné, za 10 mincí šest ku jedné
    expect(oneFur({})).toBeCloseTo((8 / 15) * (1 + (0.1 * 59) / 61), 12);
    expect(oneFur({ furs: 10 })).toBeCloseTo(10 * (1 + (0.1 * 5) / 7), 12);
    // poslední celá kožešina za celý měšec: jedna ku jedné
    expect(oneFur({ furs: 60 })).toBe(60);
    expect(oneFur({ furs: 61 })).toBeCloseTo(54.9, 12);
    // cena v mincích je i s hladinou: 31 × 2 = 62
    expect(oneFur({ furs: 31 })).toBe(31);
    expect(oneFur({ furs: 31 }, 2)).toBeCloseTo(27.9, 12);
  });

  it('den jen s kupci: ceny zboží, které kupci nevezou ani neshánějí, stojí', () => {
    const s = host(1_000);
    expect(marketStance(s, DAY)).toEqual({
      offer: { grain: 1_000 },
      wants: { tools: 27, pottery: 70, woodTools: expect.closeTo(46.8, 9) },
    });
    // nabídka hostitele obilí nezlevní, jeho poptávka nic nezdraží
    const stored: MarketPrices = { grain: 0.2, tools: 12, pottery: 5, cows: 90, honey: 5 };
    expect(pricesAfter(stored, { s })).toEqual({ ...stored, ...ARMS_PRICES });
    expect(pricesAfter({}, { s: host(1_000) })).toEqual(ARMS_PRICES);
    // dva kupci na křižovatce totéž
    const crossing = host(1_000, [STOP, CROSSING]);
    expect(pricesAfter(stored, { s: crossing })).toEqual({ ...stored, ...ARMS_PRICES });
    expect(crossing.market!.arrivals).toHaveLength(2);
  });

  it('kovář souseda ani doprovod partnera výprava nejsou, výprava na pivo a vesničanů ano', () => {
    const stored: MarketPrices = { grain: 0.2, tools: 12 };
    const after = (fields: Partial<MarketVisitor>): MarketPrices =>
      pricesAfter(stored, {
        s: host(1_000),
        trips: beerTrips(1, 1),
        change: (s) => Object.assign(visitorOf(s, 'market:p0:1'), fields),
      });
    expect(after({ service: { kind: 'shoeing', horses: 1 } })).toMatchObject(stored);
    expect(after({ kin: { seekerId: 1 } })).toMatchObject(stored);
    for (const prices of [after({}), after({ by: 'villagers' })]) {
      expect(prices.grain).toBeCloseTo(0.18, 12);
      expect(prices.tools).toBeCloseTo(13.2, 12);
    }
  });

  it('den jen s kupci: zboží kupců se hýbe podle celé nabídky i poptávky trhu', () => {
    /** Cena obilí po dni, kdy ho kupec shání 3 t a hostitel ho nabízí `spareKg`. */
    const grain = (spareKg: number, prices: MarketPrices = {}): number =>
      pricesAfter(prices, {
        s: host(spareKg),
        change: (s) => (merchantOf(s).wants = { grain: 3_000 }),
      }).grain!;
    // za 60 mincí 900 kg ku 100: zdraží; 300 kg ku 1 000: zlevní
    expect(grain(100)).toBeCloseTo((1 / 15) * (1 + (0.1 * 800) / 1_000), 9);
    expect(grain(1_000, { grain: 0.2 })).toBeCloseTo(0.2 * (1 - (0.1 * 700) / 1_300), 9);
    // za měšec by nekoupil ani kilo – pořád ho ale shání, cena klesá
    expect(grain(1_000, { grain: 61 })).toBeCloseTo(54.9, 9);
    // zbroj, kterou veze: nabídka bez poptávky
    expect(pricesAfter({ swords: 200 }).swords).toBeCloseTo(180, 12);
    // stačí, že ho shání jeden z kupců
    const crossing = pricesAfter(
      {},
      {
        s: host(100, [STOP, CROSSING]),
        change: (s) => {
          const [first, second] = merchantsOf(s) as [MarketVisitor, MarketVisitor];
          first.wants = {};
          second.wants = { grain: 3_000 };
        },
      },
    );
    expect(crossing.grain).toBeCloseTo((1 / 15) * (1 + (0.1 * 800) / 1_000), 9);
  });

  it('den s výpravou: hýbou se všechny ceny, jen kupci nezdraží, co na trhu není', () => {
    const stored: MarketPrices = {
      grain: 0.2,
      tools: 12,
      pottery: 5,
      cows: 90,
      logs: 4,
      honey: 5,
      wax: 10,
      furs: 20,
      swords: 200,
    };
    const after = pricesAfter(stored, {
      s: host(1_000),
      trips: [trip('market:a:1', { honey: 50, cows: 1 }, { logs: 3, furs: 2 })],
    });
    const expected: MarketPrices = {
      grain: 0.2 * 0.9, // nabízí hostitel, nikdo ho neshání
      tools: 12 * 1.1, // shání hostitel, nikdo je nenabízí
      pottery: 5 * 1.1,
      woodTools: initialPrice('woodTools') * 1.1,
      cows: 90 * 0.9, // veze výprava
      logs: 4 * 1.1, // shání výprava
      honey: 5 * (1 + (0.1 * (12 - 50)) / 62), // kupec za měšec 12 kg, výprava veze 50
      wax: 10, // shání jen kupec a na trhu není
      furs: 20 * 1.1, // shání je i výprava – ta cenou hýbe i bez nabídky
      ...ARMS_PRICES,
      swords: 200 * 0.9,
    };
    expect(Object.keys(after).sort()).toEqual(Object.keys(expected).sort());
    for (const good of TRADE_GOODS) {
      if (expected[good] === undefined) continue;
      expect(after[good], good).toBeCloseTo(expected[good], 9);
    }
  });

  it('zbroj kupec nabízí – bez poptávky drží cenu na dně, poptávka výpravy ji zvedne', () => {
    expect(pricesAfter({ swords: 200 }).swords).toBeCloseTo(180, 12);
    expect(pricesAfter({})).toMatchObject({ swords: 120, mailShirts: 480, helmets: 240 });
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { coins: 1 }, { swords: 6 }));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // shání se 6 a nabízí 2 → × (1 + 0,1 × 4 ÷ 8)
    expect(s.market!.prices.swords).toBeCloseTo(126, 12);
  });

  it('do ceny jde poptávka podle měšce ráno, ne po nákupech dne', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // shání 60, nabízí se 30 → × (1 + 0,1 × 30 ÷ 90)
    expect(s.market!.prices.furs).toBeCloseTo((8 / 15) * (1 + 1 / 30), 12);
    // ráno má měšec na jednu (60 ÷ 59), večer na žádnou – nabídka 1 a poptávka 1 cenou nehnou
    const dear = host();
    dear.market = { prices: { furs: 59 }, visitors: [], nextOrder: 1, arrivals: [] };
    joinMarket(dear, DAY, trip('market:a:1', { furs: 1 }, {}));
    merchantsArrive(dear, DAY);
    marketDay(dear, DAY);
    expect(resultOf(dear, 'market:a:1').unsold).toEqual({ coins: 59 });
    expect(dear.market.prices.furs).toBe(59);
  });

  it('seznam výpravy měšec neomezuje a v mincovní fázi kupuje kupec podle celého seznamu', () => {
    const s = host();
    s.market = { prices: { honey: 7 }, visitors: [], nextOrder: 1, arrivals: [] };
    joinMarket(s, DAY, trip('market:a:1', { honey: 50 }, { wax: 90 }));
    joinMarket(s, DAY, trip('market:b:1', { wax: 10 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    // za celý měšec 60 ÷ 7 kg, ne jen 8 celých kg
    expect(merchant.bought).toEqual({ honey: expect.closeTo(60 / 7, 9) });
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    // medu se shání 8 a nabízí 50; vosku shání 90 výprava bez mincí a 24 kupec, nabízí se 10
    expect(s.market.prices.honey).toBeCloseTo(7 * (1 + (0.1 * (8 - 50)) / 58), 12);
    expect(s.market.prices.wax).toBeCloseTo(2 * (1 + (0.1 * (114 - 10)) / 124), 12);
  });

  it('hladina se s kupci hýbe podle celého seznamu a měšce; bez zboží pro ně stojí', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // C = 60 (seznam má hodnotu 120), W = 30 kožešin = 16 mincí
    expect(s.market!.level).toBeCloseTo(1 + (0.1 * (60 - 16)) / (60 + 16), 12);
    expect(resultOf(s, 'market:a:1').level).toBe(s.market!.level);

    const alone = host();
    merchantsArrive(alone, DAY);
    marketDay(alone, DAY);
    expect(alone.market).not.toHaveProperty('level');
  });

  it('den s výpravou: do poptávky patří i obilí, za které řemeslníci prodávají výrobky', () => {
    const s = host();
    withWorkshop(s, 'potter', 701);
    s.crafts = { charcoalKg: 0, potteryKg: 500 };
    s.storesKg = 0;
    s.storesKg = marketStance(s, DAY).wants.grain!;
    const { offer, wants } = marketStance(s, DAY);
    expect([offer.grain, wants.grain]).toEqual([undefined, undefined]);
    expect(offer.pottery).toBeGreaterThanOrEqual(50);
    const after = pricesAfter(
      { grain: 0.2 },
      { s, trips: [trip('market:a:1', { grain: 300 }, { pottery: 50 })] },
    );
    // 50 kg keramiky za 10 mincí = 50 kg obilí, které hrnčíř shání, ku 300 kg výpravy
    expect(after.grain).toBeCloseTo(0.2 * (1 - (0.1 * 250) / 350), 9);
  });

  it('100 průjezdů do vsi bez nabídky: ceny medu, vosku, kožešin, nástrojů a krav zůstanou', () => {
    const s = host();
    s.livestock!.herds.cow = 1;
    s.storesKg = 0;
    const stored: MarketPrices = { honey: 5, wax: 10, furs: 20, tools: 12, cows: 90, grain: 0.2 };
    s.market = { prices: { ...stored }, visitors: [], nextOrder: 1, arrivals: [] };
    for (const day of visitDays(100)) {
      // hostitel nástroje, krávy i obilí pořád shání, nikdo je nenabízí
      const { offer, wants } = marketStance(s, day);
      expect(offer).toEqual({});
      expect(wants.cows).toBe(2);
      expect(wants.tools).toBeGreaterThanOrEqual(27);
      expect(wants.grain).toBeGreaterThan(0);
      expect(merchantsArrive(s, day)).toHaveLength(1);
      marketDay(s, day);
      expect(s.market.visitors).toEqual([]);
      expect(s.market.prices).toEqual({ ...stored, ...ARMS_PRICES });
      expect(s.market).not.toHaveProperty('level');
    }
    // zásoby vsi ani mince se za tu dobu nehnuly
    expect(s).not.toHaveProperty('coins');
    expect(s).not.toHaveProperty('outbox');
    expect(s.market.arrivals).toHaveLength(MARKET.report.traders);
  });

  it('10 let na křižovatce (4 spojení) jen s kupci: ceny v mezích, žádné Infinity ani NaN', () => {
    const start = host(1_000, CROSSROADS);
    expect(marketStance(start, DAY)).toMatchObject({
      offer: { grain: 1_000 },
      wants: { tools: 27 },
    });
    const end = DAY - 1 + 3_652;
    expect(merchantVisits(CROSSROADS, DAY, end).length).toBeGreaterThan(150);
    const after = advanceVillage(start, end, null);
    expect(isVillageDormant(after)).toBe(false);
    for (const [good, price] of Object.entries(after.market!.prices)) {
      expect(Number.isFinite(price), good).toBe(true);
    }
    // jen zbroj na dně – ceny, které by poptávka hostitele zvedla, se ani nezapsaly
    expect(after.market!.prices).toEqual(ARMS_PRICES);
    expect(after.market).not.toHaveProperty('level');
    expect(after).not.toHaveProperty('coins');
  });

  /** Průjezd: cena medu (obilí) v mincích před ním, kolik kg kupec koupil a za kolik mincí. */
  interface Passage {
    price: number;
    kg: number | undefined;
    coins: number;
  }

  /** 20 kg na průjezd: cena roste k 60 mincím ÷ 20 kg – celý měšec za celý náklad –, výš nejde. */
  function expectSettled(passages: Passage[]): void {
    passages.forEach(({ price, kg }, i) => {
      expect(kg).toBeCloseTo(20, 9);
      if (i > 0) expect(price).toBeGreaterThan(passages[i - 1]!.price);
    });
    const last = passages.at(-1)!;
    expect(last.price).toBeLessThan(3);
    expect(last.price).toBeCloseTo(3, 1);
    expect(last.coins).toBe(PURSE);
  }

  it('s nabídkou medu cena roste (D > S) a ustálí se tam, kde kupec za měšec koupí, co je na trhu', () => {
    const s = host();
    const relative: number[] = [];
    const passages = visitDays(100).map((day, i): Passage => {
      joinMarket(s, day, trip(`market:a:${i}`, { honey: 20 }, {}));
      merchantsArrive(s, day);
      const merchant = merchantOf(s);
      const price = coinPriceOf(s.market!.prices, s.market!.level ?? 1, 'honey');
      marketDay(s, day);
      relative.push(s.market!.prices.honey!);
      return { price, kg: merchant.bought.honey, coins: PURSE - (merchant.goods.coins ?? 0) };
    });
    // první den: 100 kg ku 20 → × (1 + 0,1 × 80 ÷ 120); 20 kg za 8 mincí
    expect(passages[0]).toEqual({ price: 0.4, kg: 20, coins: 8 });
    expect(relative[0]).toBeCloseTo(0.4 * (1 + (0.1 * 80) / 120), 12);
    expectSettled(passages);
    // D = S: cena stojí, k rovnováze dojde už jen hladina
    expect(relative.at(-1)).toBe(relative.at(-30));
  });

  it('totéž v den jen s kupci z nabídky hostitele', () => {
    let market: Pick<VillageMarket, 'prices' | 'level'> = { prices: {} };
    const passages = Array.from({ length: 120 }, (): Passage => {
      const s = host(20);
      s.market = { ...market, visitors: [], nextOrder: 1, arrivals: [] };
      merchantsArrive(s, DAY);
      const merchant = merchantOf(s);
      merchant.wants = { grain: 3_000 };
      const price = coinPriceOf(s.market.prices, s.market.level ?? 1, 'grain');
      marketDay(s, DAY);
      const { prices, level } = s.market;
      market = { prices, ...(level === undefined ? {} : { level }) };
      return { price, kg: merchant.bought.grain, coins: PURSE - (merchant.goods.coins ?? 0) };
    });
    expect(passages[0]).toMatchObject({ price: 1 / 15, coins: 2 });
    expectSettled(passages);
  });

  it('technická mez ceny: dál neroste a dopočet po kouscích dá týž stav', () => {
    const top = 1e9 * initialPrice('tools');
    // výprava na pivo 20 dní: hostitel každý den shání nástroje, nikdo je nenabízí
    const inbox = [arriveEvent(trip('market:a:1', {}, {}, { stayDays: 20 }), DAY)];
    const end = DAY + 19;
    // i cena u konce rozsahu čísla: bez meze Infinity, v JSON null a po načtení zase výchozí
    for (const price of [top, Number.MAX_VALUE]) {
      const start = host();
      start.market = { prices: { tools: price }, visitors: [], nextOrder: 1, arrivals: [] };
      const whole = advanceVillage(start, end, null, null, inbox);
      expect(whole.market!.prices.tools).toBe(top);
      let parts: VillageState = start;
      for (const to of [DAY, DAY + 7, end]) {
        parts = advanceVillage(parts, to, null, null, inbox);
        parts = JSON.parse(JSON.stringify(parts)) as VillageState;
      }
      expect(parts).toEqual(JSON.parse(JSON.stringify(whole)));
    }
  });
});

describe('pobyt kupců na rušném trhu (extendMerchants)', () => {
  /** Dny, kdy kupec na trhu stojí (`marketDay` po dnech od příjezdu), s výpravami `trips`. */
  function daysOnMarket(trips: MarketArrival[], change?: (s: VillageState) => void): number[] {
    const s = host();
    for (const arrival of trips) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    change?.(s);
    const days: number[] = [];
    for (let day = DAY; day < DAY + 10; day++) {
      if (merchantsOf(s).some((v) => v.key === KEY)) days.push(day);
      marketDay(s, day);
    }
    return days;
  }

  it('dvě výpravy: kupec stojí den', () => {
    expect(daysOnMarket([])).toEqual([DAY]);
    expect(daysOnMarket(beerTrips(2, 10))).toEqual([DAY]);
  });

  it('tři výpravy v den příjezdu: dva dny; stále tři: tři dny a odjede', () => {
    expect(daysOnMarket(beerTrips(3, 1))).toEqual([DAY, DAY + 1]);
    expect(daysOnMarket(beerTrips(3, 10))).toEqual([DAY, DAY + 1, DAY + 2]);
    expect(daysOnMarket(beerTrips(5, 10))).toHaveLength(MERCHANTS.maxStayDays);
    // druhý den už jen dvě – třetí den nezůstane
    const [first, ...others] = beerTrips(3, 10);
    expect(daysOnMarket([{ ...first!, stayDays: 1 }, ...others])).toEqual([DAY, DAY + 1]);
  });

  it('kovář, doprovod partnera ani druhý kupec se do výprav nepočítají', () => {
    const extra = (fields: Partial<MarketVisitor>): ((s: VillageState) => void) => {
      return (s) => {
        s.market!.visitors.push({
          ...structuredClone(visitorOf(s, 'market:p0:1')),
          key: 'market:x:1',
          order: s.market!.nextOrder++,
          ...fields,
        });
      };
    };
    const two = beerTrips(2, 10);
    expect(daysOnMarket(two, extra({ service: { kind: 'shoeing', horses: 1 } }))).toEqual([DAY]);
    expect(daysOnMarket(two, extra({ kin: { seekerId: 1 } }))).toEqual([DAY]);
    expect(daysOnMarket(two, extra({ merchant: true }))).toEqual([DAY]);
    // obyčejná třetí výprava i výprava vesničanů ano
    expect(daysOnMarket(two, extra({}))).toHaveLength(3);
    expect(daysOnMarket(two, extra({ by: 'villagers' }))).toHaveLength(3);
  });

  it('prodlouží jen kupce, kterému pobyt dnes končí – výpravy ne', () => {
    const s = host(0, [STOP, CROSSING]);
    for (const arrival of beerTrips(3, 1)) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    const [first, second] = merchantsOf(s) as [MarketVisitor, MarketVisitor];
    second.lastDay = DAY + 4;
    extendMerchants(s.market!, DAY);
    expect(first.lastDay).toBe(DAY + 1);
    expect(second.lastDay).toBe(DAY + 4);
    expect(s.market!.visitors.slice(0, 3).map((v) => v.lastDay)).toEqual([DAY, DAY, DAY]);
  });

  it('druhý den kupuje za to, co mu v měšci zbylo – mince nepřibudou', () => {
    const s = host();
    s.market = { prices: { honey: 0.5 }, visitors: [], nextOrder: 1, arrivals: [] };
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.goods).toEqual({ ...MERCHANTS.goods, coins: 44 });
    expect(allCoins(s)).toBe(PURSE);
    joinMarket(s, DAY + 1, trip('market:b:1', { honey: 200 }, {}));
    expect(merchantsArrive(s, DAY + 1)).toEqual([]);
    // med první den na trhu nebyl – cena stojí, jen hladina stoupla
    const price = 0.5 * s.market.level!;
    const kg = 44 / price;
    expect(kg).toBeLessThan(100);
    marketDay(s, DAY + 1);
    expect(merchant.bought).toEqual({ furs: 30, honey: expect.closeTo(kg, 9) });
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(resultOf(s, 'market:b:1').unsold).toEqual({
      honey: expect.closeTo(200 - kg, 9),
      coins: 44,
    });
    // odjeli všichni: 16 a 44 mincí jede domů s výpravami, kupec s prázdným měšcem
    expect(s.market!.visitors).toEqual([]);
    expect(allCoins(s)).toBe(PURSE);
  });

  it('druhý den shání jen to, co mu na seznamu zbylo – koupené kožešiny znovu ne', () => {
    const s = host();
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { furs: 60 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.bought).toEqual({ furs: 60 });
    expect(merchant.goods.coins).toBe(28);
    expect(merchant.lastDay).toBe(DAY + 1);
    joinMarket(s, DAY + 1, trip('market:b:1', { furs: 10, wax: 2 }, {}));
    marketDay(s, DAY + 1);
    expect(merchant.bought).toEqual({ furs: 60, wax: 2 });
    expect(merchant.wants).toEqual({ honey: 100, wax: 22 });
    const { sold, unsold } = resultOf(s, 'market:b:1');
    expect(sold).toEqual({ wax: 2 });
    expect(unsold).toMatchObject({ furs: 10 });
  });

  it('druhý den utratí i mince za prodaný meč – měšec 180 a podle něj i poptávka v ceně dne', () => {
    const s = host();
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { coins: 120 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2, coins: 180 });
    expect(affordableWants(merchant, { honey: 2 }, 1)).toEqual({ honey: 90, wax: 24, furs: 60 });
    s.market!.prices = { honey: 2 };
    delete s.market!.level;
    joinMarket(s, DAY + 1, trip('market:b:1', { honey: 10 }, {}));
    marketDay(s, DAY + 1);
    // za 180 mincí 90 kg ku 10 → × (1 + 0,1 × 80 ÷ 100)
    expect(s.market!.prices.honey).toBeCloseTo(2 * 1.08, 12);
    expect(merchant.bought).toEqual({ honey: 10 });
    expect(merchant.goods.coins).toBe(160);
  });
});

describe('kupci v dopočtu vsi (advanceVillage)', () => {
  it('přijedou po události schránky a obchodují týž den; druhý den na trhu nejsou', () => {
    const s = host();
    const event = arriveEvent(trip('market:a:1', { furs: 30, wax: 4 }, {}), DAY);
    const after = advanceVillage(s, DAY, null, null, [event]);
    const kinds = after.chronicle.map((e) => e.kind);
    expect(kinds.filter((k) => k.startsWith('market') || k.startsWith('merchants'))).toEqual([
      'market-arrived',
      'merchants-arrived',
    ]);
    expect(arrivedEvents(after)).toEqual([
      {
        day: DAY,
        kind: 'merchants-arrived',
        sells: MERCHANTS.goods,
        buys: MERCHANTS.wants,
        coins: 60,
      },
    ]);
    expect(after.market!.arrivals.map((a) => a.merchants)).toEqual([undefined, true]);
    expect(resultOf(after, 'market:a:1').unsold).toEqual({ coins: 24 });
    expect(merchantsOf(after)).toEqual([]);
    // vstup se nemění
    expect(s).not.toHaveProperty('market');
    const next = advanceVillage(after, DAY + 1, null);
    expect(next.market!.visitors).toEqual([]);
    expect(arrivedEvents(next)).toHaveLength(1);
  });

  it('kronika příjezdu je před zápisem tržního dne', () => {
    const s = host();
    s.crafts = { charcoalKg: 0, potteryKg: 500 };
    const event = arriveEvent(trip('market:a:1', { furs: 30 }, { pottery: 50 }), DAY);
    const after = advanceVillage(s, DAY, null, null, [event]);
    const kinds = after.chronicle.map((e) => e.kind);
    expect(kinds.indexOf('market-arrived')).toBeLessThan(kinds.indexOf('merchants-arrived'));
    expect(kinds.indexOf('merchants-arrived')).toBeLessThan(kinds.indexOf('market-held'));
    expect(after.coins).toBe(10);
  });

  it('přijedou v každý den plánu, i když na trhu jinak nikdo není', () => {
    const whole = advanceVillage(host(1_000), DAY + 400, null);
    expect(isVillageDormant(whole)).toBe(false);
    const planned = merchantVisits([STOP], DAY, DAY + 400).map((visit) => visit.day);
    expect(planned).toHaveLength(5);
    expect(arrivedEvents(whole).map((e) => e.day)).toEqual(planned);
    expect(whole.market!.visitors).toEqual([]);
    expect(whole).not.toHaveProperty('coins');
    expect(whole).not.toHaveProperty('outbox');
  });

  it('dopočet 400 dní vcelku a po kouscích dá týž stav i kroniku', () => {
    const start = host(1_000, [STOP, { key: '0,0,N', seed: 11, index: 2, length: 5 }]);
    const inbox = [
      // rušný trh: tři výpravy v den kupců, kupec zůstane přes hranici dávek
      ...beerTrips(3, 1).map((arrival, i) => arriveEvent(arrival, DAY, i + 1)),
      arriveEvent(trip('market:a:1', { furs: 90, honey: 120 }, { swords: 1 }), DAY + 1, 4),
    ];
    const end = DAY - 1 + 400;
    const whole = advanceVillage(start, end, null, null, inbox);
    expect(isVillageDormant(whole)).toBe(false);
    const planned = merchantVisits(start.merchantStops!, DAY, end).map((visit) => visit.day);
    expect(planned.length).toBeGreaterThanOrEqual(8);
    expect(arrivedEvents(whole).map((e) => e.day)).toEqual(planned);
    for (const splits of [[DAY - 1 + 100], [DAY], [DAY, DAY + 1], [DAY + 133, DAY + 239]]) {
      let parts = start;
      for (const to of [...splits, end]) {
        parts = advanceVillage(parts, to, null, null, inbox);
        // uložení do DB a načtení
        parts = JSON.parse(JSON.stringify(parts)) as VillageState;
      }
      expect(parts).toEqual(JSON.parse(JSON.stringify(whole)));
    }
    // na hranici dávek kupec na trhu opravdu stál a druhý den kupoval
    expect(merchantOf(advanceVillage(start, DAY, null, null, inbox)).lastDay).toBe(DAY + 1);
    expect(resultOf(whole, 'market:a:1').unsold.coins).toBe(PURSE);
  });

  it('ves bez zastávek i s prázdnými žije bit po bitu jako bez kupců', () => {
    const without = advanceVillage(bareHost(), DAY + 90, null);
    expect(without).not.toHaveProperty('market');
    expect(without).not.toHaveProperty('merchantStops');
    const dry = advanceVillage({ ...bareHost(), merchantStops: [] }, DAY + 90, null);
    expect(dry).toStrictEqual({ ...without, merchantStops: [] });
    // zastávka, kam v těch dnech nikdo nepřijel, nic nezmění
    expect(merchantVisits([STOP], DAY + 1, DAY + 90)).toEqual([]);
    const later: VillageState = { ...bareHost(), lastDay: DAY };
    expect(advanceVillage({ ...later, merchantStops: [STOP] }, DAY + 90, null)).toStrictEqual({
      ...advanceVillage(later, DAY + 90, null),
      merchantStops: [STOP],
    });
  });

  it('ves na suché mapě s výpravami obchoduje beze změny', () => {
    const event = arriveEvent(trip('market:a:1', { coins: 50 }, { grain: 300 }), DAY);
    const without = advanceVillage(bareHost(), DAY + 90, null, null, [event]);
    expect(without.coins).toBe(20);
    const dry = { ...bareHost(), merchantStops: [] };
    expect(advanceVillage(dry, DAY + 90, null, null, [event])).toStrictEqual({
      ...without,
      merchantStops: [],
    });
  });

  it.each([
    ['vymřelá', { extinctDay: DAY - 5 }],
    ['opuštěná', { abandonedDay: DAY - 5 }],
    [
      'na cestě',
      { journey: { direction: 'E', departedDay: DAY - 5, arrivalDay: DAY + 500 } as const },
    ],
  ])('do spící vsi (%s) kupci nepřijedou', (_name, fields) => {
    const s: VillageState = { ...host(), ...fields };
    expect(isVillageDormant(s)).toBe(true);
    const after = advanceVillage(s, DAY + 100, null);
    expect(after).not.toHaveProperty('market');
    expect(arrivedEvents(after)).toEqual([]);
  });

  it('zánik vsi s kupcem na trhu mince nezdvojí ani nikomu nedá', () => {
    const s = host();
    const inbox = beerTrips(3, 1).map((arrival, i) => arriveEvent(arrival, DAY, i + 1));
    const busy = advanceVillage(s, DAY, null, null, inbox);
    expect(merchantOf(busy).lastDay).toBe(DAY + 1);
    const outbox = structuredClone(busy.outbox);
    const gone = advanceVillage({ ...busy, abandonedDay: DAY }, DAY + 100, null);
    expect(gone).not.toHaveProperty('coins');
    expect(gone.outbox).toEqual(outbox);
    expect(allCoins(gone)).toBe(PURSE); // jen v měšci kupce
  });
});
