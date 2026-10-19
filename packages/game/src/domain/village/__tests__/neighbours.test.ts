import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  TRADE_GOODS,
  neighbourKind,
  neighbourOf,
  neighbourStock,
  tradeSeason,
} from '../neighbours';
import { NEIGHBOURS, TRADE_GOOD_VALUES } from '../rules';
import { DIRECTIONS } from '../trail';
import type { TradeGood, VillageState } from '../types';

// Sousedé bez simulace (trade.md – Sousedé): povaha ze seedu a směru – jen společné suroviny (Martin
// 19. 10. 2026), druh souseda, roční zásoby a poptávka, doplnění 1. 11.

describe('povaha souseda', () => {
  it('deterministicky ze seedu a směru – jiný směr nebo seed jiný soused', () => {
    expect(neighbourOf(7, 'N')).toEqual(neighbourOf(7, 'N'));
    const all = DIRECTIONS.map((d) => JSON.stringify(neighbourOf(7, d)));
    expect(new Set(all).size).toBeGreaterThan(4);
    expect(neighbourOf(8, 'N')).not.toEqual(neighbourOf(7, 'N'));
  });

  it('2–3 nabízí ze své nabídky, 2–3 shání (`always` vždy) ze svých potřeb, bez překryvu', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const d of DIRECTIONS) {
        const n = neighbourOf(seed, d);
        const profile = NEIGHBOURS.kinds[n.kind];
        expect(n.kind).toBe(neighbourKind(seed, d));
        expect(n.offers.length).toBeGreaterThanOrEqual(NEIGHBOURS.offers.min);
        expect(n.offers.length).toBeLessThanOrEqual(NEIGHBOURS.offers.max);
        expect(n.demands.length).toBeGreaterThanOrEqual(NEIGHBOURS.demands.min);
        expect(n.demands.length).toBeLessThanOrEqual(NEIGHBOURS.demands.max);
        for (const g of n.offers) expect(profile.offers).toContain(g);
        expect(n.demands).toContain(profile.always);
        for (const g of n.demands) expect([profile.always, ...profile.needs]).toContain(g);
        expect(n.demands.some((g) => n.offers.includes(g))).toBe(false);
        for (const g of [...n.offers, ...n.demands]) expect(TRADE_GOODS).toContain(g);
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

  it('kolem vsi je každý druh souseda dvakrát – každé zboží někdo nabízí i shání', () => {
    for (const kind of Object.values(NEIGHBOURS.kinds)) {
      const wants: readonly TradeGood[] = [kind.always, ...kind.needs];
      expect(kind.offers.some((g) => wants.includes(g))).toBe(false);
    }
    const offered = new Set(Object.values(NEIGHBOURS.kinds).flatMap((k) => k.offers));
    const wanted = new Set(Object.values(NEIGHBOURS.kinds).flatMap((k) => [k.always, ...k.needs]));
    for (const g of TRADE_GOODS) {
      expect(offered.has(g)).toBe(true);
      expect(wanted.has(g)).toBe(true);
    }
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const ring = DIRECTIONS.map((d) => neighbourKind(seed, d));
      for (const kind of Object.keys(NEIGHBOURS.kinds)) {
        expect(ring.filter((k) => k === kind)).toHaveLength(2);
      }
      kinds.add(ring.join());
    }
    // druhy se kolem vsi rozdají pokaždé jinak
    expect(kinds.size).toBeGreaterThan(30);
  });

  it('všech 9 druhů zboží má hodnotu – jen to, co má i ves', () => {
    expect(TRADE_GOODS).toHaveLength(9);
    expect(Object.keys(TRADE_GOOD_VALUES).sort()).toEqual([...TRADE_GOODS].sort());
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
    const fresh = neighbourStock({ seed: 3 }, 'S', day);
    expect(fresh.season).toBe(600);
    expect(fresh.supply).toEqual(neighbourOf(3, 'S').supply);
    const used = { ...fresh, supply: {} };
    const state = { seed: 3, trade: { neighbours: [used], expeditions: [], nextId: 1 } } as Pick<
      VillageState,
      'seed' | 'trade'
    >;
    expect(neighbourStock(state, 'S', day + 100).supply).toEqual({});
    const nextYear = dayIndexOf({ year: 601, month: 11, day: 1 });
    expect(neighbourStock(state, 'S', nextYear).supply).toEqual(neighbourOf(3, 'S').supply);
  });
});
