import { describe, expect, it } from 'vitest';
import type {
  CraftOrder,
  MarketArrival,
  MarketResult,
  MarketVisitor,
  VillageState,
} from '../../types';
import { joinMarket, marketDay, marketResult, marketResultRef } from '../market';
import { coinClearing, type CoinParty } from '../market-coins';
import { marketStance } from '../market-stance';
import { applyMarketResult, departMarketInPlace } from '../market-trip';
import { toolNeedKg } from '../../crafts/iron';
import { addGood } from '../trade';
import {
  D,
  homeVillage,
  marketVillage,
  report,
  sownPart,
  target,
  withWorkshop,
} from './market-fixtures';

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

describe('mincovní fáze – zakázka vesničanů má přednost před prodejem za mince (návrh Clauda)', () => {
  /** Hostitel s přebytkem 1 000 kg obilí a kovářem (`smith`), který nástroje nemá na prodej. */
  function smithHost(smith = true): VillageState {
    const s = marketVillage(-1_000);
    if (smith) withWorkshop(s, 'smith', 700, { oreKg: 500 });
    s.crafts = { charcoalKg: 5_000, potteryKg: 0, ironBarsKg: 200 };
    s.toolEquipmentKg = toolNeedKg(s, D);
    s.nearby = undefined;
    return s;
  }

  /**
   * Trh: výprava `market:v:1` (vesničané, s `by` undefined hráč) přiveze 300 kg obilí a shání
   * `wants`; s `buyer` za ní stojí hráčova výprava se 400 mincemi, která shání obilí.
   */
  function heldDay(
    by: MarketArrival['by'],
    wants: MarketArrival['wants'],
    { buyer = true, smith = true } = {},
  ): VillageState {
    const s = smithHost(smith);
    joinMarket(s, D, trip('market:v:1', { grain: 300 }, wants, by ? { by } : {}));
    if (buyer) joinMarket(s, D, trip('market:p:1', { coins: 400 }, { grain: 20_000 }));
    marketDay(s, D);
    return s;
  }

  it('vesničané na nástroje obilí za mince neprodají a kovář zakázku zapíše', () => {
    const s = heldDay('villagers', { tools: 10 });
    const v = resultOf(s, 'market:v:1');
    expect(v.sold).toEqual({});
    expect(v.unsold).toEqual({ grain: 300 });
    expect(v.ordered).toEqual({ tools: 10 });
    expect(v).not.toHaveProperty('coinsGot');
    expect(s.market?.orders).toEqual([
      { villageId: 'v', name: 'Vlkov', good: 'tools', amount: 10, day: D },
    ]);
    // hráč koupí jen obilí hostitele (1 000 kg za 67 mincí)
    expect(resultOf(s, 'market:p:1').bought).toEqual({ grain: 1_000 });
    expect(s.coins).toBe(67);
  });

  it('bez kupujícího s mincemi vyjde zakázka stejně', () => {
    const v = resultOf(heldDay('villagers', { tools: 10 }, { buyer: false }), 'market:v:1');
    expect(v.sold).toEqual({});
    expect(v.unsold).toEqual({ grain: 300 });
    expect(v.ordered).toEqual({ tools: 10 });
  });

  it.each([
    ['bez výrobku na seznamu', { cows: 2 }, true],
    ['u hostitele bez kováře (zakázku nevezme)', { tools: 10 }, false],
  ] as const)('vesničané %s obilí za mince prodají jako dosud', (_, wants, smith) => {
    const s = heldDay('villagers', wants, { smith });
    const v = resultOf(s, 'market:v:1');
    expect(v.sold).toEqual({ grain: 300 });
    expect(v.unsold).toEqual({ coins: 20 });
    expect(v).not.toHaveProperty('ordered');
    expect(s.market).not.toHaveProperty('orders');
    expect(resultOf(s, 'market:p:1').bought).toEqual({ grain: 1_300 });
  });

  it('výprava hráče obilí za mince prodá a zakázku zapíše jako dosud', () => {
    const s = heldDay(undefined, { tools: 10 });
    const v = resultOf(s, 'market:v:1');
    expect(v.sold).toEqual({ grain: 300 });
    expect(v.unsold).toEqual({ coins: 20 });
    expect(v.ordered).toEqual({ tools: 10 });
    expect(resultOf(s, 'market:p:1').bought).toEqual({ grain: 1_300 });
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

describe('součty mincí výpravy – coinsPaid a coinsGot (Rozhodnutí plánu 4, bod 9)', () => {
  it('za všechny tržní dny, u výpravy i ve výsledku; měšec je jen v nákladu', () => {
    const s = potteryVillage();
    joinMarket(s, D, trip('market:a:1', { furs: 30 }, { pottery: 50 }, { stayDays: 3 }));
    joinMarket(s, D, trip('market:b:1', { coins: 28 }, { furs: 30, pottery: 10 }, { stayDays: 2 }));
    const a = visitorOf(s, 'market:a:1');
    const b = visitorOf(s, 'market:b:1');
    marketDay(s, D);
    // b koupí 10 kg keramiky od hostitele za 2 a 30 kožešin od a za 16; a přišla na řadu bez mincí
    expect([a.coinsPaid, a.coinsGot, a.goods]).toEqual([undefined, 16, { coins: 16 }]);
    expect([b.coinsPaid, b.coinsGot, b.goods]).toEqual([18, undefined, { coins: 10 }]);
    expect(a).not.toHaveProperty('coinsPaid');
    expect(b).not.toHaveProperty('coinsGot');
    // druhý den koupí a keramiku za 10 ze 16 mincí, třetí den už nic neshání
    marketDay(s, D + 1);
    expect([a.coinsPaid, a.coinsGot, a.goods]).toEqual([10, 16, { coins: 6 }]);
    const bResult = resultOf(s, 'market:b:1');
    expect(bResult).toMatchObject({ coinsPaid: 18, unsold: { coins: 10 } });
    expect(bResult).not.toHaveProperty('coinsGot');
    marketDay(s, D + 2);
    const aResult = resultOf(s, 'market:a:1');
    expect(aResult).toMatchObject({ coinsPaid: 10, coinsGot: 16, unsold: { coins: 6 } });
    // do prodaného a koupeného mince nepatří – připsaly by se podruhé
    expect([aResult.sold, aResult.bought]).toEqual([{ furs: 30 }, { pottery: 50 }]);
    expect([bResult.sold, bResult.bought]).toEqual([{}, { furs: 30, pottery: 10 }]);
    expect(s.coins).toBe(12);
  });

  it('další platby téhož dne se sčítají – dva prodávající, dva kupující', () => {
    const s = potteryVillage();
    joinMarket(s, D, trip('market:a:1', { furs: 30 }, {}));
    joinMarket(s, D, trip('market:b:1', { coins: 10 }, { furs: 15 }));
    joinMarket(s, D, trip('market:c:1', { coins: 10 }, { furs: 15, pottery: 5 }));
    marketDay(s, D);
    // 15 kožešin po 8/15 mince = 8 mincí od každé; c ještě 5 kg keramiky za minci
    expect(resultOf(s, 'market:a:1')).toMatchObject({ coinsGot: 16, unsold: { coins: 16 } });
    expect(resultOf(s, 'market:b:1')).toMatchObject({ coinsPaid: 8, unsold: { coins: 2 } });
    expect(resultOf(s, 'market:c:1')).toMatchObject({ coinsPaid: 9, unsold: { coins: 1 } });
    expect(s.coins).toBe(1);
  });

  it('výprava bez mincovního obchodu a nepoužitý příjezd součty nemají', () => {
    const s = potteryVillage();
    const arrival = trip('market:a:1', { coins: 5 }, {});
    joinMarket(s, D, arrival);
    marketDay(s, D);
    for (const result of [resultOf(s, 'market:a:1'), marketResult(arrival, { returned: true })]) {
      expect(result).not.toHaveProperty('coinsPaid');
      expect(result).not.toHaveProperty('coinsGot');
      expect(result.unsold).toEqual({ coins: 5 });
    }
  });

  it('kronika návratu: mince zaplacené v „prodala“, přijaté v „koupila“, zpět bez mincí', () => {
    const home = homeVillage();
    home.coins = 3;
    const key = 'market:h:1';
    const result = {
      key,
      sold: { furs: 30 },
      bought: { pottery: 50 },
      unsold: { furs: 2, coins: 6 },
      horses: [],
      coinsPaid: 10,
      coinsGot: 16,
    };
    const given = structuredClone(result);
    const furs = home.wares?.sheepFurs ?? 0;
    const [back] = applyMarketResult(home, D + 2, result);
    expect(back).toMatchObject({ kind: 'market-returned' });
    expect(back).toHaveProperty('sold', { furs: 30, coins: 10 });
    expect(back).toHaveProperty('bought', { pottery: 50, coins: 16 });
    expect(back).toHaveProperty('unsold', { furs: 2 });
    // zásoba dostane jen měšec – zaplacené ani přijaté mince se nepřipíšou podruhé
    expect(home.coins).toBe(9);
    expect(home.wares!.sheepFurs + home.wares!.wildFurs).toBe(furs + 2);
    expect(result).toEqual(given);

    // výsledek z doby před součty: mince přijdou, v kronice nejsou
    const older = homeVillage();
    const [event] = applyMarketResult(older, D + 2, {
      key,
      sold: {},
      bought: {},
      unsold: { coins: 6 },
      horses: [],
    });
    expect(older.coins).toBe(6);
    expect(event).toMatchObject({ kind: 'market-returned' });
    for (const part of ['sold', 'bought', 'unsold']) expect(event).toHaveProperty(part, {});
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
