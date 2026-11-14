import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CATTLE_GOODS,
  HORSE_GOODS,
  TRADE_GOODS,
  isCattleGood,
  isHorseGood,
  neighbourKind,
  neighbourOf,
  neighbourStock,
  seasonSupply,
  tradeSeason,
  type NeighbourKind,
} from '../neighbours';
import { HORSE_TRADE, NEIGHBOURS, TRADE_GOOD_VALUES } from '../../rules';
import { DIRECTIONS } from '../trail';
import type { NeighbourGood, TradeGood, TradeGoods, VillageState } from '../../types';

/** Kůže, kožešiny, med a vosk – mimo povahu, mají vlastní losy (`waresKinds`). */
const WARES: readonly TradeGood[] = ['hides', 'furs', 'honey', 'wax'];

/** Zboží souseda jako v povaze – dobytek vcelku (`cattle`), koně (`horseKinds`) a kámen (`stoneKinds`) mimo povahu. */
function tokens(goods: readonly TradeGood[]): NeighbourGood[] {
  return [
    ...new Set(
      goods.flatMap((g): NeighbourGood[] => {
        if (isHorseGood(g) || g === 'stone' || WARES.includes(g)) return [];
        return [isCattleGood(g) ? 'cattle' : g];
      }),
    ),
  ];
}

/** FNV-1a otisk řetězce (hex). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
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
        for (const g of n.offers.filter((x) => !isHorseGood(x) && x !== 'stone')) {
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
    // koně mimo povahu – podle `horseKinds` (horses.md – Nákup a prodej)
    const offered = new Set([
      ...kindsOf.flatMap((k) => expanded(NEIGHBOURS.kinds[k].offers, k)),
      ...kindsOf.flatMap((k) => NEIGHBOURS.horseKinds[k].offers),
      ...kindsOf.filter((k) => NEIGHBOURS.stoneKinds[k] === 'offers').map(() => 'stone' as const),
      ...kindsOf.filter((k) => NEIGHBOURS.waresKinds[k] === 'offers').flatMap(() => WARES),
    ]);
    const wanted = new Set([
      ...kindsOf.flatMap((k) =>
        expanded([NEIGHBOURS.kinds[k].always, ...NEIGHBOURS.kinds[k].needs], k),
      ),
      ...kindsOf.flatMap((k) => NEIGHBOURS.horseKinds[k].demands),
      ...kindsOf.filter((k) => NEIGHBOURS.stoneKinds[k] === 'demands').map(() => 'stone' as const),
      ...kindsOf.filter((k) => NEIGHBOURS.waresKinds[k] === 'demands').flatMap(() => WARES),
    ]);
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

  it('koně podle povahy (horses.md – Nákup a prodej) – ostatní zboží souseda beze změny', () => {
    // otisk zboží bez koní (seedy 1–40, všechny směry) – spočítaný před obchodem s koňmi
    const kept = (g: string): boolean =>
      !isHorseGood(g) && g !== 'stone' && !WARES.includes(g as TradeGood);
    let all = '';
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of DIRECTIONS) {
        const n = neighbourOf(seed, d);
        const strip = (goods: TradeGoods): TradeGoods =>
          Object.fromEntries(Object.entries(goods).filter(([g]) => kept(g)));
        all += JSON.stringify([
          n.name,
          n.kind,
          n.offers.filter((g) => kept(g)),
          n.demands.filter((g) => kept(g)),
          strip(n.supply),
          strip(n.demand),
        ]);
        const horses = NEIGHBOURS.horseKinds[n.kind];
        expect(n.offers.filter(isHorseGood)).toEqual([...horses.offers]);
        expect(n.demands.filter(isHorseGood)).toEqual([...horses.demands]);
        for (const g of horses.offers) {
          expect(n.supply[g]).toBeGreaterThanOrEqual(HORSE_TRADE.perYear.min);
          expect(n.supply[g]).toBeLessThanOrEqual(HORSE_TRADE.perYear.max);
        }
      }
    }
    expect(fnv(all)).toBe('e75e79d8');
    expect(NEIGHBOURS.horseKinds.herders.offers).toEqual([...HORSE_GOODS]);
    expect(NEIGHBOURS.horseKinds.woodsmen).toEqual({ offers: [], demands: [] });
  });

  it('všech 19 druhů zboží má hodnotu – jen to, co má i ves (dobytek a koně ve třech druzích, kámen, kůže, kožešiny, med a vosk)', () => {
    expect(TRADE_GOODS).toHaveLength(19);
    expect(TRADE_GOODS.filter(isHorseGood)).toEqual(['foals', 'mares', 'ridingHorses']);
    expect(TRADE_GOODS.filter(isCattleGood)).toEqual(['cows', 'youngOxen', 'trainedOxen']);
    expect(Object.keys(TRADE_GOOD_VALUES).sort()).toEqual([...TRADE_GOODS].sort());
    for (const g of TRADE_GOODS) expect(TRADE_GOOD_VALUES[g].valueKg).toBeGreaterThan(0);
  });

  it('kámen (trade.md – Kámen): lesní ves a řemeslníci nabízejí, obilnáři a pastevci shánějí, 10–40 m³', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const d of DIRECTIONS) {
        const n = neighbourOf(seed, d);
        const role = NEIGHBOURS.stoneKinds[n.kind];
        const side = role === 'offers' ? n.supply : n.demand;
        const other = role === 'offers' ? n.demand : n.supply;
        expect(side.stone).toBeGreaterThanOrEqual(NEIGHBOURS.stoneM3.from);
        expect(side.stone).toBeLessThanOrEqual(NEIGHBOURS.stoneM3.to);
        expect(other.stone).toBeUndefined();
        expect(role === 'offers' ? n.offers : n.demands).toContain('stone');
      }
    }
  });
});

/** Otisk sousedů semene 1 zapsaný před kůžemi, kožešinami, medem a voskem (hides-honey.md – Obchod). */
const BEFORE_WARES = {
  N: {
    supply: { legumes: 892, cows: 2, youngOxen: 4 },
    demand: {
      cheese: 236,
      logs: 27,
      charcoal: 3378,
      foals: 2,
      mares: 2,
      ridingHorses: 3,
      stone: 38,
    },
  },
  NE: {
    supply: { meat: 239, charcoal: 2250, stone: 27 },
    demand: { grain: 1476, cheese: 230, ironBars: 43 },
  },
  E: {
    supply: { pottery: 370, ironBars: 14, stone: 32 },
    demand: { grain: 1560, meat: 453, foals: 3, mares: 2, ridingHorses: 3 },
  },
  SE: {
    supply: { pottery: 443, ironBars: 18, stone: 19 },
    demand: { grain: 1663, cheese: 207, foals: 1, mares: 2, ridingHorses: 1 },
  },
  S: {
    supply: { grain: 838, legumes: 1321, cows: 2, youngOxen: 4 },
    demand: { cheese: 449, logs: 27, foals: 2, mares: 1, ridingHorses: 1, stone: 40 },
  },
  SW: {
    supply: {
      meat: 295,
      cheese: 294,
      cows: 2,
      youngOxen: 4,
      trainedOxen: 1,
      foals: 3,
      mares: 2,
      ridingHorses: 1,
    },
    demand: { grain: 884, ironBars: 22, stone: 21 },
  },
  W: {
    supply: { meat: 406, charcoal: 1423, stone: 36 },
    demand: { grain: 1780, legumes: 902, ironBars: 42 },
  },
  NW: {
    supply: {
      meat: 490,
      cheese: 254,
      cows: 2,
      youngOxen: 4,
      trainedOxen: 1,
      foals: 3,
      mares: 2,
      ridingHorses: 3,
    },
    demand: { grain: 1727, logs: 35, ironBars: 29, stone: 36 },
  },
} as Record<string, { supply: TradeGoods; demand: TradeGoods }>;

describe('kůže, kožešiny, med a vosk u sousedů (hides-honey.md – Obchod)', () => {
  it('bez klíčů nového zboží je soused shodný s otiskem zapsaným před změnou', () => {
    const without = (goods: TradeGoods): TradeGoods =>
      Object.fromEntries(Object.entries(goods).filter(([g]) => !WARES.includes(g as TradeGood)));
    for (const d of DIRECTIONS) {
      const n = neighbourOf(1, d);
      expect(without(n.supply)).toEqual(BEFORE_WARES[d]!.supply);
      expect(without(n.demand)).toEqual(BEFORE_WARES[d]!.demand);
    }
  });

  it('každý druh nabízí aspoň jeden soused a aspoň jeden shání, množství v mezích', () => {
    const offered = new Set<string>();
    const wanted = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const d of DIRECTIONS) {
        const n = neighbourOf(seed, d);
        const role = NEIGHBOURS.waresKinds[n.kind];
        const side = role === 'offers' ? n.supply : n.demand;
        const other = role === 'offers' ? n.demand : n.supply;
        for (const g of WARES) {
          const { from, to } = NEIGHBOURS.waresAmounts[g as keyof typeof NEIGHBOURS.waresAmounts];
          expect(side[g]).toBeGreaterThanOrEqual(from);
          expect(side[g]).toBeLessThanOrEqual(to);
          expect(other[g]).toBeUndefined();
          (role === 'offers' ? offered : wanted).add(g);
        }
      }
    }
    for (const g of WARES) {
      expect(offered.has(g)).toBe(true);
      expect(wanted.has(g)).toBe(true);
    }
  });

  it('hodnoty a nosnost zboží', () => {
    expect(TRADE_GOOD_VALUES.honey).toEqual({ valueKg: 6, carryKg: 1 });
    expect(TRADE_GOOD_VALUES.wax).toEqual({ valueKg: 30, carryKg: 1 });
    expect(TRADE_GOOD_VALUES.hides).toEqual({ valueKg: 20, carryKg: 5 });
    expect(TRADE_GOOD_VALUES.furs).toEqual({ valueKg: 8, carryKg: 1 });
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
    // jezdecké koně mají pastevci jen některý rok (horses.md – Nákup a prodej)
    expect(fresh.supply).toEqual(seasonSupply(neighbourOf(3, 'S'), 3, tradeSeason(day)));
    const used = { ...fresh, supply: {} };
    const state = { seed: 3, trade: { neighbours: [used], expeditions: [], nextId: 1 } } as Pick<
      VillageState,
      'seed' | 'trade'
    >;
    expect(neighbourStock(state, 'S', day + 100).supply).toEqual({});
    const nextYear = dayIndexOf({ year: 601, month: 11, day: 1 });
    expect(neighbourStock(state, 'S', nextYear).supply).toEqual(
      seasonSupply(neighbourOf(3, 'S'), 3, tradeSeason(nextYear)),
    );
  });
});
