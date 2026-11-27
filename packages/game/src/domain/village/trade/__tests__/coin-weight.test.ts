import { describe, expect, it } from 'vitest';
import { GOLD, JEWELLER } from '../../rules/rules-gold';
import { MARKET } from '../../rules/rules-market';
import { TRADE_GOOD_VALUES } from '../../rules/rules-trade';
import type { MarketPrices } from '../../types';
import { coinClearing, jewelledPayment, type CoinClearing, type CoinParty } from '../market-coins';
import { coinsGold, goldCoinPrice, goldCoins, initialPrice, roundGold } from '../market-prices';

// Mince 2,4 g zlata za 90 kg obilí (gold.md – Mince 2,4 g zlata za 90 kg obilí, body 1, 2, 4 a 6;
// Martin 27. 11. 2026: „1 mince = 2.4g zlata = 90 kg obilí“): ceny v mincích šestkrát nižší, zlato
// za mince jen po celých mincích (2,4 g, od šperkaře prodávajícího 1,6 g), zbytek pod minci zůstane
// prodávajícímu.

const PRICES: MarketPrices = {};

function party(key: string, fields: Partial<CoinParty> = {}): CoinParty {
  return { key, coins: 0, stock: {}, wants: {}, ...fields };
}

const merchant = (fields: Partial<CoinParty> = {}): CoinParty =>
  party('kupec', { coins: Infinity, merchant: true, wants: { gold: 1_000 }, ...fields });

/** Zlato (g), které strana `key` v obchodech dne dostala. */
function goldTo(clearing: CoinClearing, key: string): number {
  return clearing.trades
    .filter((t) => t.good === 'gold' && t.buyer === key)
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Mince, které strana `key` za den zaplatila. */
function coinsFrom(clearing: CoinClearing, key: string): number {
  return clearing.payments.filter((p) => p.buyer === key).reduce((sum, p) => sum + p.coins, 0);
}

describe('čísla (bod 1 a 2)', () => {
  it('mince = 2,4 g zlata = 90 kg obilí', () => {
    expect(GOLD.coinGrams).toBe(2.4);
    expect(MARKET.grainKgPerCoin).toBe(90);
    expect(TRADE_GOOD_VALUES.coins.valueKg).toBe(90);
    expect(TRADE_GOOD_VALUES.gold.valueKg).toBe(37.5);
    expect(goldCoinPrice()).toBeCloseTo(1 / 2.4, 12);
  });

  it('výchozí ceny: meč 20, košile 80, helma 40, otrok 4 mince', () => {
    expect(initialPrice('swords')).toBe(20);
    expect(initialPrice('mailShirts')).toBe(80);
    expect(initialPrice('helmets')).toBe(40);
    expect(initialPrice('slaves')).toBe(4);
    expect(initialPrice('grain')).toBeCloseTo(1 / 90, 12);
  });

  it('gramy na setiny bez šumu: 3 × 2,4 g je 7,2 g, 4,8 g jsou dvě mince', () => {
    expect(coinsGold(3)).toBe(7.2);
    expect(roundGold(0.1 + 0.2)).toBe(0.3);
    expect(goldCoins(4.8)).toBe(2);
    expect(goldCoins(4.79)).toBe(1);
    expect(goldCoins(2.39)).toBe(0);
  });
});

describe('zlato za mince po celých mincích (bod 4)', () => {
  it('ves prodá kupci 5 g → 2 mince, 0,2 g jí zůstane', () => {
    const c = coinClearing([party('host', { stock: { gold: 5 } }), merchant()], PRICES, 1);
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 4.8 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 2 }]);
  });

  it('se šperkařem prodávajícího 5 g → 3 mince (1,6 g za minci), 0,2 g zůstane', () => {
    const host = party('host', { stock: { gold: 5 }, jewelleryG: 10 });
    const c = coinClearing([host, merchant()], PRICES, 1);
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 4.8 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 3 }]);
    expect(c.jewelleryUsed).toEqual({ host: 4.8 });
  });

  it('šperkař jen na část zlata: dráž jen kapacita, platba pořád celé mince', () => {
    // 1 g za 1 ÷ 1,6 mince + 1,4 g za 1,4 ÷ 2,4 mince = 1,208… → jedna mince: 1 g dráž (0,625
    // mince) a za zbylých 0,375 mince 0,9 g – kupec dostane 1,9 g, 0,5 g zůstane
    const host = party('host', { stock: { gold: 2.4 }, jewelleryG: 1 });
    const c = coinClearing([host, merchant()], PRICES, 1);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 1 }]);
    expect(goldTo(c, 'kupec')).toBeCloseTo(1 + 0.375 * 2.4, 9);
  });

  it('výměna u hostitele: 5 g výpravy za 2 mince hostitele, 0,2 g výpravě zůstane', () => {
    const host = party('host', { coins: 10, exchangesGold: true });
    const trip = party('výprava', { stock: { gold: 5 } });
    const c = coinClearing([host, trip], PRICES, 1);
    expect(c.trades).toEqual([{ seller: 'výprava', buyer: 'host', good: 'gold', amount: 4.8 }]);
    expect(c.payments).toEqual([{ buyer: 'host', seller: 'výprava', coins: 2 }]);
  });

  it('doplatek zbroje zlatem: meč za 20 – 18 mincí a 4,8 g zlata', () => {
    const host = party('host', {
      coins: 18,
      goldPurse: 10,
      stock: { gold: 10 },
      wants: { swords: 1 },
      fromMerchants: true,
    });
    const seller = party('kupec', { coins: Infinity, merchant: true, stock: { swords: 2 } });
    const c = coinClearing([host, seller], PRICES, 1);
    expect(c.payments).toEqual([{ buyer: 'host', seller: 'kupec', coins: 18 }]);
    expect(c.trades).toEqual([
      { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
      { seller: 'host', buyer: 'kupec', good: 'gold', amount: 4.8 },
    ]);
  });

  it('zlato pod minci nic nekoupí a doplatkem nezaplatí', () => {
    const c = coinClearing([party('host', { stock: { gold: 2.3 } }), merchant()], PRICES, 1);
    expect(c.trades).toEqual([]);
    const host = party('host', {
      goldPurse: 2.3,
      stock: { gold: 2.3 },
      wants: { swords: 1 },
      fromMerchants: true,
    });
    const seller = party('kupec', { coins: Infinity, merchant: true, stock: { swords: 1 } });
    expect(coinClearing([host, seller], PRICES, 1).trades).toEqual([]);
  });

  it('nikdo nedostane méně zlata, než zaplatil, a prodávajícímu zbude méně než na minci', () => {
    for (let tenth = 10; tenth <= 300; tenth += 7) {
      const grams = tenth / 10;
      for (const jewelleryG of [0, 1.5, 3, 50]) {
        const host = party('host', {
          stock: { gold: grams },
          ...(jewelleryG ? { jewelleryG } : {}),
        });
        const c = coinClearing([host, merchant()], PRICES, 1);
        const got = goldTo(c, 'kupec');
        const coins = coinsFrom(c, 'kupec');
        expect(Number.isInteger(coins), `${grams} g`).toBe(true);
        expect(got, `${grams} g, šperkař ${jewelleryG}`).toBeGreaterThanOrEqual(coins * 1.6 - 1e-9);
        if (jewelleryG === 0) expect(got).toBeCloseTo(coins * 2.4, 9);
        expect(got).toBeLessThanOrEqual(grams + 1e-9);
        // zbytek u prodávajícího nestojí ani za jednu minci (ani za dražší cenu šperkaře)
        expect(grams - got).toBeLessThan(2.4);
        expect(Math.round(got * 100) / 100).toBe(got);
      }
      const trip = party('výprava', { stock: { gold: grams } });
      const host = party('host', { coins: 1_000, exchangesGold: true });
      const c = coinClearing([host, trip], PRICES, 1);
      expect(goldTo(c, 'host')).toBeCloseTo(coinsFrom(c, 'host') * 2.4, 9);
      expect(grams - goldTo(c, 'host')).toBeLessThan(2.4);
    }
  });
});

describe('šperkař kupujícího (bod 6): mince do kapacity po 2,4 g', () => {
  it('kapacita 1,5 g = 0,625 mince platby', () => {
    const cap = 1.5 / 2.4;
    expect(cap).toBeCloseTo(0.625, 12);
    // drobný nákup: celý za `JEWELLER.factor`, kapacita spotřebovaná jen poměrem
    expect(jewelledPayment(0.75, 1.5)).toEqual({ coins: 0.5, used: 1.2 });
    // hodnota přesně do kapacity: 0,625 mince × 1,5
    const full = jewelledPayment(cap * JEWELLER.factor, 1.5);
    expect(full.coins).toBeCloseTo(cap, 12);
    expect(full.used).toBeCloseTo(1.5, 12);
    // větší nákup: sleva jen na 0,625 mince
    const big = jewelledPayment(10, 1.5);
    expect(big.coins).toBeCloseTo(10 - (JEWELLER.factor - 1) * cap, 12);
    expect(big.used).toBe(1.5);
  });
});
