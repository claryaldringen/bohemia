import { describe, expect, it } from 'vitest';
import type {
  CraftOrder,
  MarketArrival,
  MarketResult,
  MarketVisitor,
  VillageState,
} from '../../types';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { coinClearing, type CoinParty } from '../market-coins';
import { marketStance } from '../market-stance';
import { departMarketInPlace } from '../market-trip';
import { addGood } from '../trade';
import { D, homeVillage, marketVillage, report, sownPart, target } from './market-fixtures';

// Mincovní fáze tržního dne v hostiteli (markets.md – Rozhodnutí plánu 4, body 2–4, opravné kolo):
// vesničané mince neutrácejí a invarianty fáze, které chytají mutace – pořadí plateb, hostitel
// nekupuje, strop lidí podle nabídky, cizí kupec prodává, účet pod minci, zakázky.

/** Výprava s `coins` mincemi, která shání `wants`. */
function trip(
  key: string,
  goods: MarketArrival['goods'],
  wants: MarketArrival['wants'],
  fields: Partial<MarketArrival> = {},
): MarketArrival {
  return {
    key,
    fromVillageId: key.split(':')[1]!,
    fromName: 'Vlkov',
    stayDays: 1,
    travelDays: 0,
    goods,
    horses: [],
    wants,
    report,
    ...fields,
  };
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return mail.body.result;
}

/** Výprava `key` na trhu. */
function visitorOf(s: VillageState, key: string): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
}

/** Ves bez poptávky po obilí, která nabízí 430 kg keramiky (a krávy). */
function potteryVillage(): VillageState {
  const s = marketVillage(0);
  s.crafts = { charcoalKg: 0, potteryKg: 500 };
  return s;
}

/** Ves s volnými rukama – hostitel nabízí muže a ženy (bod 10 plánu 3). */
function spareLaborVillage(): VillageState {
  const s = homeVillage();
  s.fields = [{ id: 1 }];
  s.parts = [sownPart(100)];
  s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
  return s;
}

describe('mincovní fáze – vesničané mince neutrácejí (Martin 25. 11. 2026)', () => {
  /** Hráčova výprava s 40 mincemi, která chce obilí, přijede první a vesničané druzí. */
  function withVillagers(by?: MarketArrival['by']): VillageState {
    const s = potteryVillage();
    joinMarket(s, D, trip('market:p:1', { coins: 40 }, { grain: 600 }));
    joinMarket(s, D, trip('market:v:1', { grain: 600 }, { pottery: 30 }, by ? { by } : {}));
    return s;
  }

  it('výprava vesničanů prodá obilí za mince, keramiku nekoupí a mince jdou domů', () => {
    const s = withVillagers('villagers');
    marketDay(s, D);
    const v = resultOf(s, 'market:v:1');
    expect(v.sold).toEqual({ grain: 600 });
    expect(v.bought).toEqual({});
    expect(v.unsold).toEqual({ coins: 40 });
    expect(resultOf(s, 'market:p:1').bought).toEqual({ grain: 600 });
    expect(s).not.toHaveProperty('coins');
  });

  it.each([undefined, 'steward', 'smith'] as const)(
    'táž výprava od hráče nebo správce (%s) keramiku za získané mince koupí',
    (by) => {
      const s = withVillagers(by);
      marketDay(s, D);
      const v = resultOf(s, 'market:v:1');
      expect(v.sold).toEqual({ grain: 600 });
      expect(v.bought).toEqual({ pottery: 30 });
      expect(v.unsold).toEqual({ coins: 34 });
      expect(s.coins).toBe(6);
    },
  );

  it('příznak `by` odchozí výprava ponese v příjezdu a na trhu; hráč ho nemá', () => {
    const s = homeVillage();
    s.coins = 10;
    const order = { give: { coins: 5 }, wants: {}, stayDays: 1 };
    const sent = departMarketInPlace(s, D, order, target, { by: 'villagers' });
    if (!sent.ok) throw new Error(sent.reason);
    const body = s.outbox!.at(-1)!.body;
    if (body.kind !== 'market-arrive') throw new Error('Příjezd chybí.');
    expect(body.arrival.by).toBe('villagers');
    const host = marketVillage();
    joinMarket(host, D, body.arrival);
    expect(visitorOf(host, body.arrival.key).by).toBe('villagers');

    const plain = homeVillage();
    plain.coins = 10;
    const own = departMarketInPlace(plain, D, order, target);
    if (!own.ok) throw new Error(own.reason);
    const plainBody = plain.outbox!.at(-1)!.body;
    if (plainBody.kind !== 'market-arrive') throw new Error('Příjezd chybí.');
    expect(plainBody.arrival).not.toHaveProperty('by');
  });
});

describe('mincovní fáze – invarianty na trhu hostitele', () => {
  it('platby jdou v pořadí nákupů: kupec 28 mincí → výprava (0) → hostitel; nic nevznikne', () => {
    const s = potteryVillage();
    // výprava nemá mince jinde než od kupce, který od ní koupí kožešiny a ona za ně keramiku
    joinMarket(s, D, trip('market:a:1', { furs: 30 }, { pottery: 50 }, { stayDays: 2 }));
    joinMarket(s, D, trip('market:k:1', { coins: 28 }, { furs: 30 }, { stayDays: 2 }));
    visitorOf(s, 'market:k:1').merchant = true;
    marketDay(s, D);
    expect(visitorOf(s, 'market:k:1').goods).toEqual({ coins: 12 });
    expect(visitorOf(s, 'market:a:1').goods).toEqual({ coins: 6 });
    expect(visitorOf(s, 'market:a:1').bought).toEqual({ pottery: 50 });
    expect(s.coins).toBe(10);
    expect(s.coins! + 12 + 6).toBe(28);
  });

  it('hostitel za mince nekupuje ani za mince, které ten den utržil: 54 mincí a kráva odjede', () => {
    const s = homeVillage();
    addGood(s, 'logs', 20, D);
    expect(marketStance(s, D).wants.cows).toBeGreaterThan(0);
    // 20 klád za 53,3 → 54 mincí od kupce; kráva se z nich nekoupí
    joinMarket(s, D, trip('market:a:1', { cows: 1 }, {}, { stayDays: 1 }));
    joinMarket(s, D, trip('market:k:1', { coins: 60 }, { logs: 20 }));
    visitorOf(s, 'market:k:1').merchant = true;
    marketDay(s, D);
    expect(s.coins).toBe(54);
    expect(resultOf(s, 'market:a:1')).toMatchObject({ sold: {}, unsold: { cows: 1 } });
  });
});

describe('mincovní fáze – coinClearing', () => {
  const party = (key: string, fields: Partial<CoinParty> = {}): CoinParty => ({
    key,
    coins: 0,
    stock: {},
    wants: {},
    ...fields,
  });

  it('cizí kupec zbroj prodává: výprava s mincemi od něj koupí meč', () => {
    const c = coinClearing(
      [
        party('host'),
        party('k', { merchant: true, coins: 5, stock: { swords: 2 } }),
        party('a', { coins: 130, wants: { swords: 1 } }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'k', buyer: 'a', good: 'swords', amount: 1 }]);
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'k', coins: 120 }]);
  });

  it('účet těsně pod minci šumem plovoucí čárky se neruší: obilí při hladině 1,042857', () => {
    // hladina, při které `kg × cena` vyjde v plovoucí čárce těsně pod 1 (nalezeno hledáním)
    const level = 1.0001;
    const price = (1 / 15) * level;
    const kg = 1 / price;
    expect(kg * price).toBeLessThan(1);
    const c = coinClearing(
      [party('host', { stock: { grain: 1000 } }), party('a', { coins: 1, wants: { grain: kg } })],
      {},
      level,
    );
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 1 }]);
    expect(c.trades).toHaveLength(1);
  });

  it('kupující s měšcem pod minci nic nekoupí a výsledek se nemění', () => {
    const c = coinClearing(
      [party('host', { stock: { grain: 1000 } }), party('a', { coins: 0, wants: { grain: 50 } })],
      {},
      1,
    );
    expect(c.trades).toEqual([]);
    expect(c.payments).toEqual([]);
  });
});

describe('mincovní fáze – lidé a zakázky', () => {
  it('výprava s mincemi koupí nejvýš tolik mužů a žen, kolik hostitel nabízí', () => {
    const h = spareLaborVillage();
    const offer = marketStance(h, D).offer;
    expect(offer.men).toBeGreaterThan(0);
    expect(offer.women).toBeGreaterThan(0);
    const s = structuredClone(h);
    joinMarket(s, D, trip('market:a:1', { coins: 1_000 }, { men: 9, women: 9 }));
    marketDay(s, D);
    const result = resultOf(s, 'market:a:1');
    expect(result.bought.men).toBe(offer.men);
    expect(result.bought.women).toBe(offer.women);
    expect(s.people.length).toBe(h.people.length - offer.men! - offer.women!);
  });

  it('nákup za mince zmenší zakázku vsi výpravy', () => {
    const s = potteryVillage();
    const order: CraftOrder = {
      villageId: 'a',
      name: 'Vlkov',
      good: 'pottery',
      amount: 50,
      day: D - 1,
    };
    s.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], orders: [order] };
    joinMarket(s, D, trip('market:a:1', { coins: 10 }, { pottery: 30 }, { stayDays: 2 }));
    marketDay(s, D);
    expect(visitorOf(s, 'market:a:1').bought).toEqual({ pottery: 30 });
    expect(s.market!.orders).toEqual([{ ...order, amount: 20 }]);
  });
});
