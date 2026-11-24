import { describe, expect, it } from 'vitest';
import { createRandom, deriveSeed, type Random } from '../../../landscape/random';
import type { MarketParty, MarketPrices, TradeGood, TradeGoods } from '../../types';
import { TRADE_GOODS, isPieceGood } from '../goods';
import { clearMarket, partyTotals } from '../market-clearing';
import { initialPrice, nextPrices, priceOf } from '../market-prices';

const party = (key: string, offer: TradeGoods, wants: TradeGoods): MarketParty => ({
  key,
  offer,
  wants,
});

/** Hodnota zboží v mincích za ceny dne. */
function worth(goods: TradeGoods, prices: MarketPrices): number {
  let sum = 0;
  for (const good of TRADE_GOODS) sum += (goods[good] ?? 0) * priceOf(prices, good);
  return sum;
}

describe('zápočet tržního dne (markets.md – Pravidla 5, Rozhodnutí plánu 2, bod 4)', () => {
  // Martinův příklad (markets.md – Pravidla 3): hostitel B, A přijel dřív než C
  const B = party('B', { cows: 2 }, { grain: 600 });
  const A = party('A', { cows: 3 }, { grain: 1200 });
  const C = party('C', { grain: 3000 }, { cows: 4 });
  const c = clearMarket([B, A, C], {});

  it('kupující bere napřed zboží hostitele, pak přespolních podle příjezdu', () => {
    expect(partyTotals(c, 'C').bought).toEqual({ cows: 3 }); // 1 od B, 2 od A
    expect(c.trades.filter((t) => t.good === 'cows').map((t) => [t.seller, t.amount])).toEqual([
      ['B', 1],
      ['A', 2],
    ]);
    expect(partyTotals(c, 'B').bought.grain).toBeCloseTo(600, 6);
    expect(partyTotals(c, 'A').bought.grain).toBeCloseTo(1200, 6);
    expect(partyTotals(c, 'C').sold.grain).toBeCloseTo(1800, 6);
    expect(c.offered).toEqual({ grain: 3000, cows: 5 });
    expect(c.wanted).toEqual({ grain: 1800, cows: 4 });
  });

  it('nikdo nic nechce → bez obchodů, offered / wanted jsou součty vstupů', () => {
    expect(clearMarket([party('A', { cows: 2 }, {}), party('B', { grain: 600 }, {})], {})).toEqual({
      trades: [],
      offered: { cows: 2, grain: 600 },
      wanted: {},
    });
  });

  it('kus nevyjde: klisna (106,67) je dražší než seznam A (1 000 kg = 66,67) – neprodá se', () => {
    const mare = [
      party('A', { mares: 1 }, { grain: 1000 }),
      party('B', { grain: 5000 }, { mares: 1 }),
    ];
    expect(clearMarket(mare, {}).trades).toEqual([]);
  });

  it('drobné: strop A je 66,67 – prodá 1 krávu (40) za 600 kg', () => {
    const small = clearMarket(
      [party('A', { cows: 2 }, { grain: 1000 }), party('B', { grain: 5000 }, { cows: 2 })],
      {},
    );
    expect(partyTotals(small, 'A').sold).toEqual({ cows: 1 });
    expect(partyTotals(small, 'A').bought.grain).toBeCloseTo(600, 6);
  });

  it('výprava jen „na pivo“ (bez zboží a seznamu) v obchodech není a nic nezmění', () => {
    expect(clearMarket([B, A, C, party('P', {}, {})], {})).toEqual(c);
  });

  it('strana prodá, o co kupci stojí – obilí hostitele nevytlačí jeho klády (návrh Clauda)', () => {
    // hostitel nabízí obilí (333 mincí) i klády (133), shání 2 krávy (80); výprava veze 2 krávy
    // a chce 20 klád (53,33) – vymění se 1 kráva za 15 klád (40 mincí)
    const host = party('H', { grain: 5000, logs: 50 }, { cows: 2 });
    const trader = party('E', { cows: 2 }, { logs: 20 });
    const market = clearMarket([host, trader], {});
    expect(partyTotals(market, 'H')).toEqual({ sold: { logs: 15 }, bought: { cows: 1 } });
    expect(partyTotals(market, 'E')).toEqual({ sold: { cows: 1 }, bought: { logs: 15 } });
  });

  it('po dlouhém přebytku klád výprava zaplatí aspoň výchozí hodnotu a neprodané zůstane (Martin 23. 11.)', () => {
    let prices: MarketPrices = {};
    for (let i = 0; i < 200; i++) prices = nextPrices(prices, { logs: 20 }, {});
    expect(prices.logs).toBe(initialPrice('logs'));
    // hostitel nabízí 20 klád, výprava veze 5 g sýra (jen 5 g – za 20 klád by nestačilo)
    const host = party('H', { logs: 20 }, { cheese: 5 });
    const trader = party('E', { cheese: 5 }, { logs: 20 });
    const market = clearMarket([host, trader], prices);
    const t = partyTotals(market, 'E');
    const paid = (t.sold.cheese ?? 0) * priceOf(prices, 'cheese');
    const got = t.bought.logs ?? 0;
    expect(paid).toBeGreaterThanOrEqual(got * initialPrice('logs') - 1e-9);
    expect(got).toBeLessThan(20); // zbytek klád hostiteli zůstane
  });

  it('ceny dne rozhodují: dražší kráva se vymění za víc obilí', () => {
    const prices: MarketPrices = { cows: 50 };
    const market = clearMarket(
      [party('A', { cows: 1 }, { grain: 2000 }), party('B', { grain: 2000 }, { cows: 1 })],
      prices,
    );
    expect(partyTotals(market, 'A').sold).toEqual({ cows: 1 });
    expect(partyTotals(market, 'A').bought.grain).toBeCloseTo(750, 6); // 50 mincí × 15 kg
  });

  it('kupující koupí jen od strany svého kruhu – dvě dvojice se vymění obě (návrh Clauda)', () => {
    // B chce obilí a A ho nabízí, A ale za utrženou hodnotu nic od B ani od D nekoupí – kdyby B
    // koupil obilí napřed od A (je dřív), A by zůstal nevyrovnaný a obchod by se rozpadal
    const market = clearMarket(
      [
        party('A', { cheese: 1500, grain: 150 }, { honey: 1500 }),
        party('B', { meat: 500 }, { grain: 1500 }),
        party('C', { honey: 1500 }, { cheese: 1500 }),
        party('D', { grain: 1500 }, { meat: 500 }),
      ],
      {},
    );
    expect(partyTotals(market, 'A').sold).toEqual({ cheese: 1500 }); // 400 mincí
    expect(partyTotals(market, 'A').bought.honey).toBeCloseTo(1000, 6);
    expect(partyTotals(market, 'B')).toEqual({ sold: { meat: 500 }, bought: { grain: 1500 } });
    expect(market.trades.some((t) => t.buyer === 'B' && t.seller === 'A')).toBe(false);
  });

  it('známá mez heuristiky: strana, která se do posledního kola neustálí, ten den neobchoduje', () => {
    // dvojice A s B a C s E spojuje obilí: A chce víc obilí, než má B, a dokupuje od C – stropy
    // klesají kolo po kole o kousek a do posledního kola se neustálí. Poslední nevyrovnaná strana
    // (C) se vyřadí, E pak nemá od koho koupit obilí a A s B se vymění bez nich
    const parties = [
      party('A', { cheese: 3000 }, { grain: 2500, honey: 1600 }),
      party('B', { honey: 700, grain: 2400 }, { cheese: 1900 }),
      party('C', { grain: 2700 }, { meat: 800 }),
      party('D', { cheese: 2100, grain: 600 }, {}),
      party('E', { meat: 2000 }, { grain: 2400 }),
    ];
    const market = clearMarket(parties, {});
    const a = partyTotals(market, 'A');
    expect(a.bought.grain).toBeCloseTo(2400, 6);
    expect(a.bought.honey).toBeCloseTo(700, 6);
    expect(a.sold.cheese).toBeCloseTo(1650, 6); // 440 mincí
    expect(market.trades.every((t) => t.seller !== 'C' && t.buyer !== 'C')).toBe(true);
    expect(market.trades.every((t) => t.seller !== 'E' && t.buyer !== 'E')).toBe(true);
    expect(market.offered).toEqual({ grain: 5700, cheese: 5100, meat: 2000, honey: 700 });
  });

  describe('měřítko cen (technická mez zápočtu – relativní tolerance)', () => {
    const scaled = (factor: number): MarketPrices => {
      const prices: MarketPrices = {};
      for (const good of TRADE_GOODS) prices[good] = initialPrice(good) * factor;
      return prices;
    };
    const trio = [B, A, C];
    // trh, kde se strana C do posledního kola neustálí (viz výš) – při malých cenách by ji
    // absolutní tolerance nechala projít nevyrovnanou
    const unsettled = [
      party('A', { cheese: 3000 }, { grain: 2500, honey: 1600 }),
      party('B', { honey: 700, grain: 2400 }, { cheese: 1900 }),
      party('C', { grain: 2700 }, { meat: 800 }),
      party('D', { cheese: 2100, grain: 600 }, {}),
      party('E', { meat: 2000 }, { grain: 2400 }),
    ];
    // X nabízí maso, ale nikdo ho nechce a sama nic nechce: strana bez protějšku nic neprodá
    const lonely = [
      party('A', { cheese: 1000 }, { honey: 1000 }),
      party('B', { honey: 1000 }, { cheese: 1000 }),
      party('X', { meat: 500 }, {}),
    ];

    it.each([1e-9, 1e9])('ceny ×%s dají tytéž výměny jako běžné ceny', (factor) => {
      for (const parties of [trio, lonely, unsettled]) {
        const base = clearMarket(parties, scaled(1));
        const other = clearMarket(parties, scaled(factor));
        expect(other.trades.length).toBe(base.trades.length);
        other.trades.forEach((t, i) => {
          const b = base.trades[i]!;
          expect([t.seller, t.buyer, t.good]).toEqual([b.seller, b.buyer, b.good]);
          expect(t.amount).toBeCloseTo(b.amount, 6);
        });
      }
    });

    it.each([1e-9, 1e9])(
      'při cenách ×%s strana bez protějšku nic neprodá ani nekoupí',
      (factor) => {
        const market = clearMarket(lonely, scaled(factor));
        expect(partyTotals(market, 'X')).toEqual({ sold: {}, bought: {} });
        const settled = clearMarket(unsettled, scaled(factor));
        expect(partyTotals(settled, 'C')).toEqual({ sold: {}, bought: {} });
        expect(partyTotals(settled, 'E')).toEqual({ sold: {}, bought: {} });
      },
    );
  });

  it('vstup se nemění', () => {
    const parties = [B, A, C];
    const before = structuredClone(parties);
    clearMarket(parties, {});
    expect(parties).toEqual(before);
  });

  it('kusové zboží: dobytek, koně, klády, vozy, kámen, kůže a kožešiny', () => {
    expect(TRADE_GOODS.filter(isPieceGood)).toEqual([
      'cows',
      'youngOxen',
      'trainedOxen',
      'foals',
      'mares',
      'ridingHorses',
      'logs',
      // vozy (markets.md – Rozhodnutí plánu 3, bod 4)
      'twoWheelCarts',
      'fourWheelCarts',
      'stone',
      'hides',
      'furs',
    ]);
  });
});

// Náhodné případy: kg i kusy (dobytek, koně, klády, kámen, kůže); seznam strany je ze zboží, které
// nabízí někdo jiný – jinak by se skoro nikdy neobchodovalo.
const CASE_GOODS: readonly TradeGood[] = [
  'grain',
  'cheese',
  'cows',
  'mares',
  'logs',
  'stone',
  'honey',
  'hides',
];

function pick<T>(random: Random, list: readonly T[]): T {
  return list[Math.floor(random.next() * list.length)]!;
}

function randomAmount(random: Random, good: TradeGood): number {
  return isPieceGood(good)
    ? 1 + Math.floor(random.next() * 8)
    : Math.round(random.next() * 30000) / 10 + 1;
}

function randomCase(i: number): { parties: MarketParty[]; prices: MarketPrices } {
  const random = createRandom(deriveSeed(7, 'case:' + i));
  const count = 3 + Math.floor(random.next() * 3);
  const offers = Array.from({ length: count }, () => {
    const offer: TradeGoods = {};
    const kinds = 1 + Math.floor(random.next() * 2);
    for (let k = 0; k < kinds; k++) {
      const good = pick(random, CASE_GOODS);
      offer[good] = randomAmount(random, good);
    }
    return offer;
  });
  const parties = offers.map((offer, k) => {
    const others = CASE_GOODS.filter((g) => offers.some((o, j) => j !== k && o[g] !== undefined));
    const wants: TradeGoods = {};
    const kinds = 1 + Math.floor(random.next() * 2);
    for (let n = 0; n < kinds && others.length > 0; n++) {
      const good = pick(random, others);
      wants[good] = randomAmount(random, good);
    }
    return party(`P${k}`, offer, wants);
  });
  // lichý případ má ceny posunuté od výchozích (0,5× až 2×)
  const prices: MarketPrices = {};
  if (i % 2 === 1) {
    for (const good of CASE_GOODS) prices[good] = initialPrice(good) * (0.5 + random.next() * 1.5);
  }
  return { parties, prices };
}

describe('zápočet – 20 pevných náhodných případů', () => {
  const cases = Array.from({ length: 20 }, (_, i) => randomCase(i));

  it.each(cases.map((x, i) => [i, x] as const))('případ %i', (_, { parties, prices }) => {
    const clearing = clearMarket(parties, prices);
    // stejný vstup dá týž výstup
    expect(clearMarket(structuredClone(parties), { ...prices })).toEqual(clearing);
    for (const trade of clearing.trades) {
      expect(trade.seller).not.toBe(trade.buyer); // nikdo neobchoduje sám se sebou
      expect(trade.amount).toBeGreaterThan(0);
      if (isPieceGood(trade.good)) expect(Number.isInteger(trade.amount)).toBe(true);
    }
    const totals = parties.map((p) => partyTotals(clearing, p.key));
    parties.forEach((p, k) => {
      const { sold, bought } = totals[k]!;
      // prodané hodnotou = koupené
      expect(worth(sold, prices)).toBeCloseTo(worth(bought, prices), 6);
      for (const good of TRADE_GOODS) {
        // nikdo neprodá víc, než nabídl, a nekoupí víc, než chtěl
        expect(sold[good] ?? 0).toBeLessThanOrEqual((p.offer[good] ?? 0) * (1 + 1e-12));
        expect(bought[good] ?? 0).toBeLessThanOrEqual((p.wants[good] ?? 0) * (1 + 1e-12));
      }
    });
    for (const good of TRADE_GOODS) {
      // součet prodaného = součet koupeného u každého zboží
      const sold = totals.reduce((sum, t) => sum + (t.sold[good] ?? 0), 0);
      const bought = totals.reduce((sum, t) => sum + (t.bought[good] ?? 0), 0);
      expect(sold).toBeCloseTo(bought, 9);
    }
  });

  it('většina případů obchoduje (podmínky výš nejsou prázdné)', () => {
    const trading = cases.filter((x) => clearMarket(x.parties, x.prices).trades.length > 0);
    expect(trading.length).toBeGreaterThanOrEqual(10);
  });
});
