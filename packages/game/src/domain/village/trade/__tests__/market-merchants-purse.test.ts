import { describe, expect, it } from 'vitest';
import { dwelling } from '../../__tests__/kin-fixtures';
import { HONEY, MARKET, MERCHANTS } from '../../rules';
import type {
  ArmsGood,
  ChronicleEvent,
  MarketArrival,
  MarketPrices,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  TradeGood,
  TradeGoods,
  VillageState,
} from '../../types';
import { yearlyNeed } from '../../wares/hides';
import { TRADE_GOODS } from '../goods';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { coinPriceOf, initialPrice, priceOf } from '../market-prices';
import { marketStance } from '../market-stance';
import { nextMerchantVisit } from '../merchant-plan';
import { merchantDemand, merchantsArrive } from '../merchants';
import { D, marketVillage, report } from './market-fixtures';

// Měšec kupců bez dna (markets.md – Měšec kupců bez dna, body 1–5; Martin 27. 11. 2026: „Kupcům
// neomezuj měšec.“): kupec koupí za průjezd celý svůj seznam, co je na trhu, mince nedrží – jeho
// platbou mince vznikají, platbou jemu zanikají a ve stavu žádné nemá. Hladinou kupci nehýbou, cenu
// dne zvedá celý jejich seznam toho, co je na trhu.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** První příjezd kupců po D. */
const DAY = nextMerchantVisit([STOP], D)!.day;
/** Seznam kupce za průjezd – jediná mez jeho nákupu. */
const LIST: TradeGoods = { ...MERCHANTS.wants };

interface HostFields {
  /** Co ves nabízí nad potřebu – med a vosk kg, kožešiny kusy. */
  honey?: number;
  wax?: number;
  furs?: number;
  /** Otroci-pohané v nabídce hráče (`slavesForSale`), každý sám. */
  slaves?: number;
  /** Zlato (g) a mince ve vsi. */
  gold?: number;
  coins?: number;
  armsOrder?: Partial<Record<ArmsGood, number>>;
}

/**
 * Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců (vzor `host` plánů 4–6): obilí 1 000 kg
 * nad pojistkou, med, vosk a kožešiny nad potřebu, otroci na prodej, zlato, mince a objednávka zbroje
 * podle `fields`.
 */
function host(fields: HostFields = {}): VillageState {
  const { honey = 0, wax = 0, furs = 0, slaves = 0, gold = 0, coins = 0, armsOrder } = fields;
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.merchantStops = [{ ...STOP }];
  if (slaves > 0) {
    s.dwellings.push({ ...dwelling(600), position: { x: -40, z: 0, rotation: 0 } });
    const bornDay = DAY - Math.ceil(25.5 * 365.25);
    for (let i = 0; i < slaves; i++) {
      s.people.push({ id: 900 + i, bornDay, dwellingId: 600, sex: 'male', slave: true });
    }
    s.slavesForSale = slaves;
  }
  s.wares = {
    honeyKg: honey + HONEY.kgPerPersonYear * s.people.length,
    waxKg: wax,
    sheepFurs: furs + yearlyNeed(s, DAY).furs,
    wildFurs: 0,
    hides: 0,
  };
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, DAY).wants.grain! + 1_000;
  if (gold > 0) s.gold = gold;
  if (coins > 0) s.coins = coins;
  if (armsOrder) s.armsOrder = { ...armsOrder };
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

/** Jediný cizí kupec na trhu – odkaz platí i po odjezdu. */
function merchantOf(s: VillageState): MarketVisitor {
  const merchants = (s.market?.visitors ?? []).filter((v) => v.merchant);
  if (merchants.length !== 1) throw new Error('Na trhu není právě jeden kupec.');
  return merchants[0]!;
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return mail.body.result;
}

/** Co ves za tržní den prodala a koupila (kronika `market-held`); nic – null. */
function heldOf(
  chronicle: readonly ChronicleEvent[],
): { sold: TradeGoods; bought: TradeGoods } | null {
  const held = chronicle.find((e) => e.kind === 'market-held');
  return held?.kind === 'market-held' ? { sold: held.sold, bought: held.bought } : null;
}

/** Cena zboží v mincích za ceny `prices` a hladinu `level`. */
function price(good: TradeGood, prices: MarketPrices = {}, level = 1): number {
  return coinPriceOf(prices, level, good);
}

/** Hodnota zboží v mincích (bez zaokrouhlení). */
function worth(goods: TradeGoods, prices: MarketPrices = {}, level = 1): number {
  return TRADE_GOODS.reduce(
    (sum, good) => sum + (goods[good] ?? 0) * price(good, prices, level),
    0,
  );
}

/** Cesty k číslům, která nejsou konečná (`Infinity`, `NaN`) – JSON by z nich udělal `null`. */
function nonFinite(value: unknown, path = '$'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinite(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => nonFinite(v, `${path}.${key}`));
  }
  return [];
}

/** Cena po tržním dni podle `MARKET.priceStep`: poptávka `wanted` proti nabídce `offered`. */
function stepped(from: number, wanted: number, offered: number): number {
  return from * (1 + (MARKET.priceStep * (wanted - offered)) / (wanted + offered));
}

describe('měšec kupců bez dna – nákup (markets.md – Měšec kupců bez dna, body 1 a 2)', () => {
  it('kupec koupí celý seznam, co je na trhu, a ves dostane přesně součet plateb', () => {
    const s = host({ honey: 150, wax: 30, furs: 80, slaves: 12, gold: 1_200 });
    expect(marketStance(s, DAY).offer).toMatchObject({ honey: 150, wax: 30, furs: 80, slaves: 12 });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    const chronicle = marketDay(s, DAY);
    // seznam za průjezd: zlato 1 000 g, med 100 kg, vosk 24 kg, kožešiny 60 a otroci 10; zlato jen
    // po celých mincích: 1 000 ÷ 2,4 = 416,67 → 416 mincí = 998,4 g
    const bought = { gold: 998.4, honey: 100, wax: 24, furs: 60, slaves: 10 };
    expect({ ...LIST, gold: 998.4 }).toEqual(bought);
    expect(merchant.bought).toEqual(bought);
    // na seznamu zbude jen zlato pod minci (1 000 − 998,4 g)
    expect(Object.keys(merchant.wants)).toEqual(['gold']);
    expect(merchant.wants.gold).toBe(1.6);
    expect(merchant.boughtPeople?.flatMap((g) => g.people)).toHaveLength(10);
    // jedna platba za celý košík od hostitele – součet hodnot v cenách dne nahoru
    const pay = Math.ceil(worth(bought) - 1e-9);
    // s měšcem 60 mincí by koupil jen zlomek
    expect(pay).toBeGreaterThan(60);
    expect(heldOf(chronicle)).toEqual({ sold: bought, bought: { coins: pay } });
    expect(s.coins).toBe(pay);
    expect(s.gold).toBeCloseTo(201.6, 9); // 1 200 − 998,4
    expect(s.slavesForSale).toBe(2);
    expect(s.people.filter((p) => p.slave)).toHaveLength(2);
  });

  it('starý kupec s měšcem 60 mincí ve stavu nakupuje jako bez dna a mince mu nikdo nepřipíše', () => {
    const s = host({
      honey: 150,
      wax: 30,
      furs: 80,
      gold: 1_200,
      coins: 500,
      armsOrder: { swords: 1 },
    });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    // stav uložený před 27. 11. 2026 – kupec přijel s měšcem 60 mincí
    merchant.goods.coins = 60;
    const chronicle = marketDay(s, DAY);
    const bought = { gold: 998.4, honey: 100, wax: 24, furs: 60 }; // zlato po celých mincích
    expect(merchant.bought).toEqual(bought);
    // měšec ze stavu nikdo nepoužil: za meč ho hostitel nedoplnil a kupec z něj neplatil
    expect(merchant.goods).toEqual({
      ...MERCHANTS.goods,
      swords: MERCHANTS.goods.swords - 1,
      coins: 60,
    });
    const pay = Math.ceil(worth(bought) - 1e-9);
    const sword = Math.ceil(price('swords') - 1e-9);
    expect(heldOf(chronicle)).toEqual({
      sold: { ...bought, coins: sword },
      bought: { swords: 1, coins: pay },
    });
    expect(s.coins).toBe(500 + pay - sword);
    // kupec odjel – jeho mince zanikly s ním
    expect(s.market?.visitors ?? []).toEqual([]);
  });
});

describe('měšec kupců bez dna – stav a součet mincí (bod 1)', () => {
  it('měšec se do stavu nezapíše: kupec nemá mince, stav projde JSON beze změny', () => {
    const s = host({
      honey: 150,
      wax: 30,
      furs: 80,
      slaves: 12,
      gold: 1_200,
      coins: 500,
      armsOrder: { swords: 1 },
    });
    merchantsArrive(s, DAY);
    // tři výpravy na pivo – kupec zůstane další den (`extendMerchants`) a stav ho drží na trhu
    for (const i of [0, 1, 2]) joinMarket(s, DAY, trip(`market:p${i}:1`, {}, {}, { stayDays: 2 }));
    marketDay(s, DAY);
    const merchant = merchantOf(s);
    expect(merchant.lastDay).toBe(DAY + 1);
    expect(merchant.sold).toEqual({ swords: 1 });
    expect(merchant.goods).not.toHaveProperty('coins');
    expect(nonFinite(s)).toEqual([]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    // druhý den kupec nemá co koupit ani prodat – stav zůstane bez mincí kupce
    marketDay(s, DAY + 1);
    expect(nonFinite(s)).toEqual([]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('mince = před + utržené od kupce − zaplacené kupci; nic jiného nevznikne ani nezmizí', () => {
    const s = host({ honey: 150, gold: 1_200, coins: 500, armsOrder: { swords: 1 } });
    merchantsArrive(s, DAY);
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    joinMarket(s, DAY, trip('market:b:1', { coins: 300 }, { helmets: 1 }));
    const chronicle = marketDay(s, DAY);
    // kupec platí hostiteli za zlato a med a výpravě A za kožešiny, hostitel mu platí za meč a B
    // za helmu
    const sold = { gold: 998.4, honey: 100 }; // 416 celých mincí ze zlata

    const earned = Math.ceil(worth(sold) - 1e-9);
    const furs = Math.ceil(30 * price('furs') - 1e-9);
    const sword = Math.ceil(price('swords') - 1e-9);
    const helmet = Math.ceil(price('helmets') - 1e-9);
    expect(heldOf(chronicle)).toEqual({
      sold: { ...sold, coins: sword },
      bought: { swords: 1, coins: earned },
    });
    expect(s.coins).toBe(500 + earned - sword);
    const a = resultOf(s, 'market:a:1');
    expect([a.sold, a.unsold, a.coinsGot]).toEqual([{ furs: 30 }, { coins: furs }, furs]);
    const b = resultOf(s, 'market:b:1');
    expect([b.bought, b.unsold, b.coinsPaid]).toEqual([
      { helmets: 1 },
      { coins: 300 - helmet },
      helmet,
    ]);
    // mince světa: 800 + od kupce (zlato, med, kožešiny) − kupci (meč, helma)
    const world = (s.coins ?? 0) + (a.unsold.coins ?? 0) + (b.unsold.coins ?? 0);
    expect(world).toBe(500 + 300 + earned + furs - sword - helmet);
  });
});

describe('měšec kupců bez dna – hladina (bod 4)', () => {
  /** Trh vsi s hladinou `level` ještě před příjezdem kupců. */
  function withLevel(s: VillageState, level: number): VillageState {
    s.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], level };
    return s;
  }

  it('den jen s kupci hladinu nemění, i když kupec ve vsi nakoupí', () => {
    const s = withLevel(host({ honey: 20 }), 1.5);
    merchantsArrive(s, DAY);
    const chronicle = marketDay(s, DAY);
    expect(heldOf(chronicle)?.sold).toEqual({ honey: 20 });
    expect(s.market!.level).toBe(1.5);
  });

  it('den s výpravou s mincemi hýbe hladinou jako dřív – jen z mincí výpravy a hostitele', () => {
    const s = withLevel(host({ honey: 20 }), 1.5);
    merchantsArrive(s, DAY);
    joinMarket(s, DAY, trip('market:a:1', { coins: 100 }, { honey: 50 }));
    marketDay(s, DAY);
    // C = min(100, 50 kg × cena), W = 20 kg na trhu × cena; seznam kupce ani jeho měšec se nepočítá
    const unit = price('honey', {}, 1.5);
    const available = Math.min(100, 50 * unit);
    const sought = 20 * unit;
    const level = 1.5 * (1 + (MARKET.priceStep * (available - sought)) / (available + sought));
    expect(s.market!.level).toBeCloseTo(level, 12);
    // kupec kupuje první – med hostitele koupil on, výprava nic
    expect(resultOf(s, 'market:a:1').bought).toEqual({});
  });
});

describe('měšec kupců bez dna – cena dne (body 3 a 6)', () => {
  it('za výchozí cenu shánějí kupci celý seznam – zboží, kterého je na trhu míň, zdraží', () => {
    const s = host({ honey: 50, slaves: 3 });
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // med: kupec shání 100 kg, na trhu je 50; otroci: shání 10, na trhu jsou 3
    const prices = s.market!.prices;
    expect(prices.honey).toBeCloseTo(stepped(price('honey'), LIST.honey!, 50), 12);
    expect(prices.slaves).toBeCloseTo(stepped(price('slaves'), LIST.slaves!, 3), 12);
    expect(prices.honey).toBeGreaterThan(price('honey'));
  });

  it('za drahé zboží chtějí kupci méně – med za třicetinásobek výchozí ceny zlevní', () => {
    const s = host({ honey: 50 });
    s.market = { prices: { honey: 2 }, visitors: [], nextOrder: 1, arrivals: [] };
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // 2 mince za kg je 30 × výchozí cena – kupec chce 100 ÷ 30 = 3,33 kg, na trhu je 50
    const wanted = (LIST.honey! * price('honey')) / 2;
    expect(s.market.prices.honey).toBeCloseTo(stepped(2, wanted, 50), 12);
    expect(s.market.prices.honey).toBeLessThan(2);
  });

  it('zboží, které nikdo nenabízí, kupci cenou nehnou', () => {
    const s = host({ honey: 50 });
    s.market = { prices: { furs: 3 }, visitors: [], nextOrder: 1, arrivals: [] };
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    expect(s.market.prices.furs).toBe(3);
    expect(s.market.prices).not.toHaveProperty('wax');
    expect(s.market.prices).not.toHaveProperty('slaves');
  });
});

describe('zákon nabídky a poptávky – kupec chce tím méně, čím je zboží dražší (bod 6)', () => {
  /** Výchozí cena medu P0 (`initialPrice`). */
  const P0 = initialPrice('honey');

  /** Poptávka kupce po medu za cenu `ratio` × P0 se zbytkem seznamu `left` a koupeným `had`. */
  function honeyDemand(ratio: number, left = 100, had = 0): number | undefined {
    return merchantDemand({ honey: left }, had > 0 ? { honey: had } : {}, { honey: ratio * P0 })
      .honey;
  }

  /**
   * Cena medu po každém z `passes` průjezdů kupců, při kterých ves nabízí `honey` kg medu nad
   * potřebu – ceny trhu se přenášejí z průjezdu na průjezd (30 let = 120 průjezdů po 4 za rok).
   */
  function honeyPrices(honey: number, passes: number, from: MarketPrices = {}): number[] {
    const base = host({ honey });
    const out: number[] = [];
    let prices = from;
    for (let i = 0; i < passes; i++) {
      const s = structuredClone(base);
      s.market = { prices: { ...prices }, visitors: [], nextOrder: 1, arrivals: [] };
      merchantsArrive(s, DAY);
      marketDay(s, DAY);
      prices = s.market.prices;
      out.push(priceOf(prices, 'honey'));
    }
    return out;
  }

  it('za výchozí cenu celý seznam, za dvojnásobnou polovinu, za pětinásobnou pětinu', () => {
    expect(honeyDemand(1)).toBe(100);
    expect(honeyDemand(2)).toBe(50);
    expect(honeyDemand(5)).toBeCloseTo(20, 12);
    // po nákupu 20 kg za průjezd: 100 × ½ − 20 = 30
    expect(honeyDemand(2, 80, 20)).toBe(30);
    // nejvýš zbytek seznamu; kdo za průjezd koupil víc, než za cenu chce, nechce nic
    expect(honeyDemand(1, 30, 70)).toBe(30);
    expect(honeyDemand(4, 50, 50)).toBeUndefined();
    // otroci stejně jako med: 10 za dvojnásobek výchozí ceny (4 mince) je 5
    expect(merchantDemand({ slaves: 10 }, {}, { slaves: 8 })).toEqual({ slaves: 5 });
  });

  it('zlato má pevnou cenu – poptávka po něm se cenou nemění', () => {
    expect(merchantDemand({ gold: 1_000, honey: 100 }, {}, { honey: 5 * P0 }).gold).toBe(1_000);
    expect(merchantDemand({ gold: 500 }, { gold: 500 }, {})).toEqual({ gold: 500 });
    // kupec vykoupí zlato i za drahý med: 416 celých mincí = 998,4 g, na seznamu zbude 1,6 g
    const s = host({ honey: 80, gold: 1_200 });
    s.market = { prices: { honey: 4 * P0 }, visitors: [], nextOrder: 1, arrivals: [] };
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.bought).toEqual({ gold: 998.4, honey: 25 });
    expect(merchant.wants.gold).toBe(1.6);
  });

  it('při čtyřnásobku výchozí ceny koupí kupec nejvýš 25 kg medu, i když je na trhu 80 kg', () => {
    const s = host({ honey: 80 });
    s.market = { prices: { honey: 4 * P0 }, visitors: [], nextOrder: 1, arrivals: [] };
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    const chronicle = marketDay(s, DAY);
    expect(merchant.bought).toEqual({ honey: 25 });
    expect(merchant.wants.honey).toBe(75);
    expect(heldOf(chronicle)).toEqual({
      sold: { honey: 25 },
      bought: { coins: Math.ceil(25 * 4 * P0 - 1e-9) },
    });
    // cena dne: kupec chce 25 kg, na trhu je 80 – med zlevní
    expect(s.market.prices.honey).toBeCloseTo(stepped(4 * P0, 25, 80), 12);
  });

  it('rovnováha: ves nabízí každý průjezd 20 kg medu – cena se zastaví u pětinásobku výchozí', () => {
    // s měšcem bez dna a celým seznamem by cena rostla o 6,7 % každý průjezd bez konce (≈ 2 300 ×)
    const prices = honeyPrices(20, 120);
    expect(Math.max(...prices)).toBeLessThanOrEqual(5.1 * P0);
    const [before, last] = prices.slice(-2) as [number, number];
    expect(last).toBeGreaterThan(4.9 * P0);
    expect(Math.abs(last - before) / before).toBeLessThan(1e-3);
  });

  it('ves s nabídkou aspoň 100 kg medu má cenu medu výchozí – drahý med zlevní až na ni', () => {
    expect(honeyPrices(100, 8)).toEqual(Array.from({ length: 8 }, () => P0));
    const falling = honeyPrices(150, 120, { honey: 5 * P0 });
    expect(falling.at(-1)).toBe(P0);
    // klesá průjezd po průjezdu, nikdy pod výchozí
    expect(falling.every((p, i) => p >= P0 && (i === 0 || p <= falling[i - 1]!))).toBe(true);
  });
});
