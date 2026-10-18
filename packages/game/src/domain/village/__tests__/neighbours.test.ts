import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  FOREIGN_GOODS_LIST,
  TRADE_GOODS,
  neighbourOf,
  neighbourStock,
  tradeSeason,
} from '../neighbours';
import { NEIGHBOURS, TRADE_GOOD_VALUES } from '../rules';
import { DIRECTIONS } from '../trail';
import type { VillageState } from '../types';

// Sousedé bez simulace (trade.md – Sousedé): povaha ze seedu a směru, roční zásoby a poptávka,
// doplnění 1. 11.

describe('povaha souseda', () => {
  it('deterministicky ze seedu a směru – jiný směr nebo seed jiný soused', () => {
    expect(neighbourOf(7, 'n')).toEqual(neighbourOf(7, 'n'));
    const all = DIRECTIONS.map((d) => JSON.stringify(neighbourOf(7, d)));
    expect(new Set(all).size).toBeGreaterThan(4);
    expect(neighbourOf(8, 'n')).not.toEqual(neighbourOf(7, 'n'));
  });

  it('2–3 nabízí (aspoň jedno zboží zvenku), 2–3 shání – jen co ves umí, bez překryvu', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const d of DIRECTIONS) {
        const n = neighbourOf(seed, d);
        expect(n.offers.length).toBeGreaterThanOrEqual(NEIGHBOURS.offers.min);
        expect(n.offers.length).toBeLessThanOrEqual(NEIGHBOURS.offers.max);
        expect(n.demands.length).toBeGreaterThanOrEqual(NEIGHBOURS.demands.min);
        expect(n.demands.length).toBeLessThanOrEqual(NEIGHBOURS.demands.max);
        expect(n.offers.some((g) => FOREIGN_GOODS_LIST.includes(g))).toBe(true);
        expect(n.demands.some((g) => FOREIGN_GOODS_LIST.includes(g))).toBe(false);
        expect(n.demands.some((g) => n.offers.includes(g))).toBe(false);
        expect(n.name.length).toBeGreaterThan(0);
        for (const g of n.offers) {
          const value = n.supply[g]! * TRADE_GOOD_VALUES[g].valueKg;
          expect(n.supply[g]).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(NEIGHBOURS.supplyKg.to + TRADE_GOOD_VALUES[g].valueKg);
        }
        for (const g of n.demands) expect(n.demand[g]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('všech 13 druhů zboží má hodnotu', () => {
    expect(TRADE_GOODS).toHaveLength(13);
    for (const g of TRADE_GOODS) expect(TRADE_GOOD_VALUES[g].valueKg).toBeGreaterThan(0);
  });
});

describe('roční zásoby a doplnění 1. 11.', () => {
  it('rok obchodu začíná 1. 11.', () => {
    expect(tradeSeason(dayIndexOf({ year: 600, month: 10, day: 31 }))).toBe(599);
    expect(tradeSeason(dayIndexOf({ year: 600, month: 11, day: 1 }))).toBe(600);
    expect(tradeSeason(dayIndexOf({ year: 601, month: 3, day: 1 }))).toBe(600);
  });

  it('uložený zbytek platí do konce roku obchodu, pak plné zásoby', () => {
    const day = dayIndexOf({ year: 600, month: 12, day: 1 });
    const fresh = neighbourStock({ seed: 3 }, 's', day);
    expect(fresh.season).toBe(600);
    expect(fresh.supply).toEqual(neighbourOf(3, 's').supply);
    const used = { ...fresh, supply: {} };
    const state = { seed: 3, trade: { neighbours: [used], expeditions: [], nextId: 1 } } as Pick<
      VillageState,
      'seed' | 'trade'
    >;
    expect(neighbourStock(state, 's', day + 100).supply).toEqual({});
    const nextYear = dayIndexOf({ year: 601, month: 11, day: 1 });
    expect(neighbourStock(state, 's', nextYear).supply).toEqual(neighbourOf(3, 's').supply);
  });
});
