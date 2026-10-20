import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  CATTLE_GOODS,
  TRADE_GOODS,
  isCattleGood,
  neighbourKind,
  neighbourOf,
  neighbourStock,
  tradeSeason,
  type NeighbourKind,
} from '../neighbours';
import { NEIGHBOURS, TRADE_GOOD_VALUES } from '../rules';
import { DIRECTIONS } from '../trail';
import type { NeighbourGood, TradeGood, VillageState } from '../types';

/** Zboží souseda jako v povaze – dobytek vcelku (`cattle`). */
function tokens(goods: readonly TradeGood[]): NeighbourGood[] {
  return [...new Set(goods.map((g): NeighbourGood => (isCattleGood(g) ? 'cattle' : g)))];
}

/** Zboží povahy rozložené na zboží obchodu – dobytek na druhy dobytka souseda. */
function expanded(goods: readonly NeighbourGood[], kind: NeighbourKind): TradeGood[] {
  return goods.flatMap((g) => (g === 'cattle' ? [...NEIGHBOURS.cattleKinds[kind]] : [g]));
}

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
        // dobytek vcelku je jedno zboží povahy – pastevci ho nabízejí vždy (i navíc k losu)
        const offers = tokens(n.offers);
        const always = (NEIGHBOURS.cattleAlways as readonly string[]).includes(n.kind);
        const drawn = always ? offers.filter((g) => g !== 'cattle') : offers;
        expect(drawn.length).toBeGreaterThanOrEqual(NEIGHBOURS.offers.min - (always ? 1 : 0));
        expect(drawn.length).toBeLessThanOrEqual(NEIGHBOURS.offers.max);
        if (always) expect(offers).toContain('cattle');
        const demands = tokens(n.demands);
        expect(demands.length).toBeGreaterThanOrEqual(NEIGHBOURS.demands.min);
        expect(demands.length).toBeLessThanOrEqual(NEIGHBOURS.demands.max);
        for (const g of offers) expect(profile.offers).toContain(g);
        expect(n.demands).toContain(profile.always);
        for (const g of demands) expect([profile.always, ...profile.needs]).toContain(g);
        // dobytek ve třech druzích podle povahy (trade.md – Dobytek ve třech druzích)
        for (const goods of [n.offers, n.demands]) {
          const cattle = goods.filter(isCattleGood);
          if (cattle.length > 0) expect(cattle).toEqual(NEIGHBOURS.cattleKinds[n.kind]);
        }
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
    const kindsOf = Object.keys(NEIGHBOURS.kinds) as NeighbourKind[];
    for (const kind of Object.values(NEIGHBOURS.kinds)) {
      const wants: readonly NeighbourGood[] = [kind.always, ...kind.needs];
      expect(kind.offers.some((g) => wants.includes(g))).toBe(false);
    }
    const offered = new Set(kindsOf.flatMap((k) => expanded(NEIGHBOURS.kinds[k].offers, k)));
    const wanted = new Set(
      kindsOf.flatMap((k) =>
        expanded([NEIGHBOURS.kinds[k].always, ...NEIGHBOURS.kinds[k].needs], k),
      ),
    );
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

  it('pastevci nabízejí krávy, mladé i vycvičené voly vždy – obilnáři krávy a mladé voly', () => {
    let herders = 0;
    let farmersWithCattle = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of DIRECTIONS) {
        const n = neighbourOf(seed, d);
        if (n.kind === 'herders') {
          herders++;
          expect(n.offers.filter(isCattleGood)).toEqual([...CATTLE_GOODS]);
          for (const g of CATTLE_GOODS) expect(n.supply[g]).toBeGreaterThanOrEqual(1);
        }
        if (n.kind === 'farmers' && n.offers.some(isCattleGood)) {
          farmersWithCattle++;
          expect(n.offers.filter(isCattleGood)).toEqual(['cows', 'youngOxen']);
        }
        if (n.kind === 'woodsmen')
          expect([...n.offers, ...n.demands].some(isCattleGood)).toBe(false);
      }
    }
    expect(herders).toBe(80);
    expect(farmersWithCattle).toBeGreaterThan(0);
  });

  it('všech 11 druhů zboží má hodnotu – jen to, co má i ves (dobytek ve třech druzích)', () => {
    expect(TRADE_GOODS).toHaveLength(11);
    expect(TRADE_GOODS.filter(isCattleGood)).toEqual(['cows', 'youngOxen', 'trainedOxen']);
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
