import { describe, expect, it } from 'vitest';
import { GOLD, TRADE_GOOD_VALUES } from '../../rules';
import type { MarketVisitor, VillageState } from '../../types';
import { coinPhaseStock } from '../craft-orders';
import { GOLD_GOOD, PIECE_GOODS, TRADE_GOODS, isPieceGood, withoutMoney } from '../goods';
import { coinPriceOf, goldCoinPrice, initialPrice, nextPrices } from '../market-prices';
import { addGood, villageGoodStock } from '../trade';
import { D, homeVillage } from './market-fixtures';

// Zlato jako zboží – stav a čísla (gold.md – Pravidla 1 a 2; Rozhodnutí plánu 6, bod 2).

function withGold(gold: number): VillageState {
  const s = homeVillage();
  s.gold = gold;
  return s;
}

describe('zásoba zlata ve vsi', () => {
  it('trh vidí celé gramy, zlomek zůstává ve stavu', () => {
    expect(villageGoodStock(withGold(12.7), 'gold', D)).toBe(12);
    expect(villageGoodStock(homeVillage(), 'gold', D)).toBe(0);
  });

  it('odečet nechá zlomek; zbytek pod EPSILON pole smaže', () => {
    const s = withGold(12.7);
    addGood(s, 'gold', -12, D);
    expect(s.gold).toBeCloseTo(0.7, 9);
    addGood(s, 'gold', -0.7, D);
    expect(s).not.toHaveProperty('gold');
  });

  it('šum pod celým gramem neudělá zápornou zásobu', () => {
    const s = withGold(0.9999999999);
    addGood(s, 'gold', -1, D);
    expect(s).not.toHaveProperty('gold');
    addGood(s, 'gold', -5, D);
    expect(s).not.toHaveProperty('gold');
  });

  it('zbytek šumu nad nulou (pod EPSILON) pole také smaže', () => {
    const s = withGold(1.0000000001);
    addGood(s, 'gold', -1, D);
    expect(s).not.toHaveProperty('gold');
  });

  it('přičtení nese i zlomek', () => {
    const s = homeVillage();
    addGood(s, 'gold', 2.5, D);
    expect(s.gold).toBe(2.5);
    addGood(s, 'gold', 0.25, D);
    expect(s.gold).toBe(2.75);
  });
});

describe('cena a druh zlata', () => {
  it('gram zlata stojí minci při jakékoli hladině a ceně na trhu', () => {
    expect(goldCoinPrice()).toBe(1 / GOLD.coinGrams);
    expect(coinPriceOf({ gold: 7 }, 2.5, 'gold')).toBe(1);
    expect(coinPriceOf(undefined, 9, 'gold')).toBe(1);
    expect(initialPrice('gold')).toBe(1);
  });

  it('nextPrices zlato přeskočí jako mince', () => {
    const next = nextPrices({}, { gold: 500 }, { gold: 2000 });
    expect(next).not.toHaveProperty('gold');
  });

  it('zlato je kusové zboží za kamenem a nic nenese', () => {
    expect(isPieceGood(GOLD_GOOD)).toBe(true);
    expect(PIECE_GOODS).toContain('gold');
    expect(TRADE_GOODS.indexOf('gold')).toBe(TRADE_GOODS.indexOf('stone') + 1);
    expect(TRADE_GOOD_VALUES.gold.carryKg).toBe(0);
  });
});

describe('zlato mimo cenu dne, v mincovní fázi ano', () => {
  it('withoutMoney vyřadí mince, zlato a nuly', () => {
    expect(withoutMoney({ gold: 5, coins: 3, grain: 10 })).toEqual({ grain: 10 });
    expect(withoutMoney({ gold: 0, wax: 1 })).toEqual({ wax: 1 });
  });

  it('výprava hráče v mincovní fázi prodává i zlato, mince ne', () => {
    const visitor = {
      by: 'player',
      goods: { gold: 50, coins: 3, grain: 10 },
      wants: {},
    } as unknown as MarketVisitor;
    expect(coinPhaseStock(homeVillage(), visitor)).toEqual({ grain: 10, gold: 50 });
  });
});
