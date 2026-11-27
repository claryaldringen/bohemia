import { describe, expect, it } from 'vitest';
import { MARKET, TRADE_GOOD_VALUES } from '../../rules';
import type { MarketPrices } from '../../types';
import { TRADE_GOODS } from '../goods';
import { coinPriceOf, initialPrice, nextLevel, nextPrices, priceOf } from '../market-prices';

describe('ceny trhu v mincovní míře (markets.md – Rozhodnutí plánu 2, bod 3)', () => {
  it('výchozí cena je hodnota zboží v kg obilí ÷ 90 kg obilí za minci', () => {
    expect(MARKET.grainKgPerCoin).toBe(90);
    // kráva 600 kg obilí ÷ 90 = 20/3 mince, kg obilí 1/90 mince
    expect(initialPrice('cows')).toBeCloseTo(20 / 3, 12);
    expect(initialPrice('grain')).toBeCloseTo(1 / 90, 12);
    for (const good of TRADE_GOODS) {
      expect(initialPrice(good)).toBeCloseTo(TRADE_GOOD_VALUES[good].valueKg / 90, 12);
    }
  });

  it('trh si pamatuje cenu zboží, které na něm bylo – ostatní mají výchozí', () => {
    expect(priceOf(undefined, 'cows')).toBeCloseTo(20 / 3, 12);
    expect(priceOf({}, 'cows')).toBeCloseTo(20 / 3, 12);
    expect(priceOf({ cows: 8 }, 'cows')).toBe(8);
    expect(priceOf({ cows: 8 }, 'logs')).toBeCloseTo(initialPrice('logs'), 12);
  });

  it('po tržním dni se cena posune o 10 % × (poptávka − nabídka) / (poptávka + nabídka)', () => {
    expect(MARKET.priceStep).toBe(0.1);
    expect(nextPrices({}, { cows: 2 }, { cows: 6 }).cows).toBeCloseTo((20 / 3) * 1.05, 9); // × (1 + 0,1 × 4/8)
    expect(nextPrices({ cows: 8 }, { cows: 3 }, {}).cows).toBeCloseTo(7.2, 9); // 8 × 0,9
    expect(nextPrices({}, {}, { cows: 1 }).cows).toBeCloseTo((20 / 3) * 1.1, 9);
    // posune se zapamatovaná cena, ne výchozí
    expect(nextPrices({ cows: 8 }, {}, { cows: 1 }).cows).toBeCloseTo(8.8, 9);
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
    let high: MarketPrices = { cows: 10 };
    high = nextPrices(high, { cows: 3 }, {});
    expect(high.cows).toBeCloseTo(9, 9);
    for (let i = 0; i < 200; i++) high = nextPrices(high, { cows: 3 }, {});
    expect(high.cows).toBe(initialPrice('cows'));
  });

  it('s poptávkou cena nad dnem roste jako dosud', () => {
    let p: MarketPrices = {};
    for (let i = 0; i < 3; i++) p = nextPrices(p, {}, { cows: 1 });
    expect(p.cows).toBeCloseTo((20 / 3) * 1.1 ** 3, 9);
  });

  it('starší stav s cenou pod dnem se při dalším tržním dni zvedne na dno', () => {
    expect(nextPrices({ cows: 1 }, {}, {}).cows).toBeCloseTo(20 / 3, 12);
    expect(nextPrices({ cows: 1 }, { cows: 3 }, {}).cows).toBeCloseTo(20 / 3, 12);
    expect(nextPrices({ cows: 1 }, {}, { cows: 1 }).cows).toBeCloseTo((20 / 3) * 1.1, 9);
  });

  it('technická mez: cena nejvýš 1e9 × výchozí – dál neroste, klesat smí', () => {
    // poptávka bez nabídky po 218 tržních dnech: 1,1^218 ≈ 1,06e9
    const CAP = 1e9 * initialPrice('cows'); // 20e9 ÷ 3
    let p: MarketPrices = {};
    for (let i = 0; i < 217; i++) p = nextPrices(p, {}, { cows: 1, grain: 1 });
    expect(p.cows).toBeCloseTo((20 / 3) * 1.1 ** 217, -3);
    expect(p.cows!).toBeLessThan(CAP);
    for (let i = 0; i < 100; i++) p = nextPrices(p, {}, { cows: 1, grain: 1 });
    // násobek výchozí ceny, každé zboží podle své (kráva 20/3 mince)
    expect(p).toEqual({ cows: CAP, grain: 1e9 * initialPrice('grain') });
    expect(nextPrices({ cows: CAP }, {}, { cows: 1 }).cows).toBe(CAP);
    expect(nextPrices({ cows: CAP }, { cows: 1 }, { cows: 1 }).cows).toBe(CAP);
    expect(nextPrices({ cows: CAP }, { cows: 1 }, {}).cows).toBeCloseTo(0.9 * CAP, -2);
    // těsně pod mezí roste jen k ní
    expect(nextPrices({ cows: 0.975 * CAP }, {}, { cows: 1 }).cows).toBe(CAP);
    expect(nextPrices({ cows: 0.75 * CAP }, {}, { cows: 1 }).cows).toBeCloseTo(0.825 * CAP, -2);
  });

  it('technická mez: cena se nikdy nestane nekonečnem, které by JSON uložil jako null', () => {
    const huge: MarketPrices = { cows: Number.MAX_VALUE, honey: Number.MAX_VALUE };
    expect(Number.MAX_VALUE * (1 + MARKET.priceStep)).toBe(Infinity);
    const next = nextPrices(huge, {}, { cows: 1 });
    expect(next).toEqual({ cows: 1e9 * initialPrice('cows'), honey: 1e9 * initialPrice('honey') });
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });
});

describe('cena v mincích a hladina trhu (markets.md – Rozhodnutí plánu 4, bod 3)', () => {
  it('cena v mincích je cena zboží × hladina', () => {
    expect(coinPriceOf({}, 2, 'furs')).toBeCloseTo(16 / 90, 12);
    expect(coinPriceOf(undefined, 1, 'cows')).toBeCloseTo(20 / 3, 12);
    expect(coinPriceOf({ cows: 8 }, 1.5, 'cows')).toBe(12);
    expect(coinPriceOf({ cows: 8 }, 1.5, 'grain')).toBeCloseTo(1.5 / 90, 12);
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
