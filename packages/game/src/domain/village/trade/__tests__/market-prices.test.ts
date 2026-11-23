import { describe, expect, it } from 'vitest';
import { MARKET, TRADE_GOOD_VALUES } from '../../rules';
import type { MarketPrices } from '../../types';
import { TRADE_GOODS } from '../goods';
import { initialPrice, nextPrices, priceOf } from '../market-prices';

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
    expect(nextPrices({}, { cows: 3 }, {}).cows).toBeCloseTo(36, 9);
    expect(nextPrices({}, {}, { cows: 1 }).cows).toBeCloseTo(44, 9);
    // posune se zapamatovaná cena, ne výchozí
    expect(nextPrices({ cows: 50 }, {}, { cows: 1 }).cows).toBeCloseTo(55, 9);
  });

  it('zboží bez nabídky i poptávky cenu nemění; nové ceny jsou nový objekt', () => {
    const prices: MarketPrices = { honey: 0.5 };
    const next = nextPrices(prices, { grain: 600 }, { grain: 600 });
    expect(nextPrices({ honey: 0.5 }, {}, {})).toEqual({ honey: 0.5 });
    expect(next).not.toBe(prices);
    expect(prices).toEqual({ honey: 0.5 });
    // vyrovnaná nabídka a poptávka – cena se zapamatuje beze změny
    expect(next).toEqual({ honey: 0.5, grain: initialPrice('grain') });
  });

  it('cena za den klesne nejvýš o 10 % a nikdy na nulu', () => {
    let glut: MarketPrices = {};
    for (let i = 0; i < 200; i++) glut = nextPrices(glut, { cows: 3 }, {}); // 200 dní jen nabídky
    expect(glut.cows!).toBeGreaterThan(0);
    expect(glut.cows!).toBeCloseTo(40 * 0.9 ** 200, 12);
  });
});
