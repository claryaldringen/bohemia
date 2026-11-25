import { describe, expect, it } from 'vitest';
import { MARKET, TRADE_GOOD_VALUES } from '../../rules';
import type { MarketPrices } from '../../types';
import { TRADE_GOODS } from '../goods';
import { coinPriceOf, initialPrice, nextLevel, nextPrices, priceOf } from '../market-prices';

describe('ceny trhu v mincovní míře (markets.md – Rozhodnutí plánu 2, bod 3)', () => {
  it('výchozí cena je hodnota zboží v kg obilí ÷ 15 kg obilí za minci', () => {
    expect(MARKET.grainKgPerCoin).toBe(15);
    expect(initialPrice('cows')).toBe(40);
    expect(initialPrice('grain')).toBeCloseTo(1 / 15, 12);
    for (const good of TRADE_GOODS) {
      expect(initialPrice(good)).toBeCloseTo(TRADE_GOOD_VALUES[good].valueKg / 15, 12);
    }
  });

  it('trh si pamatuje cenu zboží, které na něm bylo – ostatní mají výchozí', () => {
    expect(priceOf(undefined, 'cows')).toBe(40);
    expect(priceOf({}, 'cows')).toBe(40);
    expect(priceOf({ cows: 50 }, 'cows')).toBe(50);
    expect(priceOf({ cows: 50 }, 'logs')).toBeCloseTo(40 / 15, 12);
  });

  it('po tržním dni se cena posune o 10 % × (poptávka − nabídka) / (poptávka + nabídka)', () => {
    expect(MARKET.priceStep).toBe(0.1);
    expect(nextPrices({}, { cows: 2 }, { cows: 6 }).cows).toBeCloseTo(42, 9); // 40 × (1 + 0,1 × 4/8)
    expect(nextPrices({ cows: 50 }, { cows: 3 }, {}).cows).toBeCloseTo(45, 9);
    expect(nextPrices({}, {}, { cows: 1 }).cows).toBeCloseTo(44, 9);
    // posune se zapamatovaná cena, ne výchozí
    expect(nextPrices({ cows: 50 }, {}, { cows: 1 }).cows).toBeCloseTo(55, 9);
  });

  it('zboží bez nabídky i poptávky cenu nemění; nové ceny jsou nový objekt', () => {
    const prices: MarketPrices = { honey: 5 };
    const next = nextPrices(prices, { grain: 600 }, { grain: 600 });
    expect(nextPrices({ honey: 5 }, {}, {})).toEqual({ honey: 5 });
    expect(next).not.toBe(prices);
    expect(prices).toEqual({ honey: 5 });
    // vyrovnaná nabídka a poptávka – cena se zapamatuje beze změny
    expect(next).toEqual({ honey: 5, grain: initialPrice('grain') });
  });

  it('spodní cena: 200 dní nabídky bez poptávky nechá cenu na výchozí hodnotě (Martin 23. 11.)', () => {
    let glut: MarketPrices = {};
    for (let i = 0; i < 200; i++) glut = nextPrices(glut, { logs: 20 }, {});
    expect(glut.logs).toBe(initialPrice('logs'));
    // cena nad dnem klesá po krocích, ale ne pod dno
    let high: MarketPrices = { cows: 60 };
    high = nextPrices(high, { cows: 3 }, {});
    expect(high.cows).toBeCloseTo(54, 9);
    for (let i = 0; i < 200; i++) high = nextPrices(high, { cows: 3 }, {});
    expect(high.cows).toBe(40);
  });

  it('s poptávkou cena nad dnem roste jako dosud', () => {
    let p: MarketPrices = {};
    for (let i = 0; i < 3; i++) p = nextPrices(p, {}, { cows: 1 });
    expect(p.cows).toBeCloseTo(40 * 1.1 ** 3, 9);
  });

  it('starší stav s cenou pod dnem se při dalším tržním dni zvedne na dno', () => {
    expect(nextPrices({ cows: 10 }, {}, {}).cows).toBe(40);
    expect(nextPrices({ cows: 10 }, { cows: 3 }, {}).cows).toBe(40);
    expect(nextPrices({ cows: 10 }, {}, { cows: 1 }).cows).toBeCloseTo(44, 9);
  });
});

describe('cena v mincích a hladina trhu (markets.md – Rozhodnutí plánu 4, bod 3)', () => {
  it('cena v mincích je cena zboží × hladina', () => {
    expect(coinPriceOf({}, 2, 'furs')).toBeCloseTo(16 / 15, 12);
    expect(coinPriceOf(undefined, 1, 'cows')).toBe(40);
    expect(coinPriceOf({ cows: 50 }, 1.5, 'cows')).toBe(75);
    expect(coinPriceOf({ cows: 50 }, 1.5, 'grain')).toBeCloseTo(0.1, 12);
  });

  it('hladina po mincovní fázi: × (1 + 10 % × (C − W) / (C + W)), nejméně 1', () => {
    expect(nextLevel(1, 32, 10 + 2 / 3)).toBeCloseTo(1.05, 12);
    expect(nextLevel(1.5, 5, 100)).toBeCloseTo(1.3643, 4);
    expect(nextLevel(1, 5, 100)).toBe(1);
    // mince a zboží v rovnováze – hladina stojí, samé mince ji zvednou nejvýš o 10 %
    expect(nextLevel(1.5, 20, 20)).toBe(1.5);
    expect(nextLevel(2, 1e9, 1)).toBeCloseTo(2.2, 6);
    expect(nextLevel(2, 0, 100)).toBeCloseTo(1.8, 12);
  });

  it('W = 0 (na trhu není nic z toho, co kupující shánějí) hladinu nemění', () => {
    expect(nextLevel(1, 60, 0)).toBe(1);
    expect(nextLevel(1.5, 60, 0)).toBe(1.5);
    expect(nextLevel(2, 0, 0)).toBe(2);
  });

  it('cena mincí se nezapíše, i když jsou v nabídce nebo na seznamu', () => {
    expect(nextPrices({}, { coins: 50, grain: 600 }, { coins: 10, grain: 600 })).toEqual({
      grain: initialPrice('grain'),
    });
    expect(nextPrices({}, { coins: 50 }, {})).toEqual({});
    expect(nextPrices({}, {}, { coins: 10 })).toEqual({});
  });
});
