import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../../calendar';
import { cartsAway } from '../../crafts/carts';
import type { MarketOrder, MarketResult, TradeGoods } from '../../types';
import {
  MARKET_NO_PEOPLE,
  MARKET_OVER_STOCK,
  MARKET_STAY,
  MARKET_STONE_CART,
  MARKET_WORLD_END,
  applyMarketResult,
  checkMarketTrip,
  departMarket,
  marketCrew,
  marketTravelDays,
  marketTripsDay,
  type MarketTripCheck,
} from '../market-trip';
import { expeditionLaborNeed, finishExpeditions, workExpeditions } from '../trade';
import { D, homeVillage, report, target } from './market-fixtures';

// Výprava na trh – domovská ves (markets.md – Pravidla 2 a 3; Rozhodnutí plánu 2, body 1, 2 a 6):
// hráč pošle výpravu se zbožím a seznamem, lidé a vozy jsou pryč v pevné dny cesty a pobytu,
// výsledek trhu přijde schránkou a výpravu uzavře.

describe('výprava na trh – dny cesty a lidé (Rozhodnutí plánu 2, bod 2)', () => {
  it('k sousední mapě ráno tam a večer zpět, každá další mapa den tam a den zpět', () => {
    expect([1, 2, 3].map(marketTravelDays)).toEqual([0, 1, 2]);
  });

  it('jedna jízda: vozy vezou náklad s posádkou, zbytek nosiči, honáci, aspoň jeden člověk', () => {
    expect(marketCrew({ grain: 600 }, { cows: 1 }, [])).toEqual({ porters: 24, carts: 0 });
    // tam 2 lidé u vozu (CARTS.tradeCrew), zpět 2 u vozu + 1 honák koupené krávy
    expect(marketCrew({ grain: 600 }, { cows: 1 }, ['four-wheel'])).toEqual({
      porters: 3,
      carts: 1,
    });
    expect(marketCrew({ logs: 3 }, {}, [])).toEqual({ porters: 6, carts: 0 });
    expect(marketCrew({ stone: 1 }, {}, [])).toBeNull();
    expect(marketCrew({}, {}, [])).toEqual({ porters: 1, carts: 0 });
  });

  it('co se na vozy naráz nevejde, nesou lidé – kámen se na vozy vejít musí (návrh Clauda)', () => {
    // čtyřkolák 800 kg: 1 000 kg obilí – 200 kg nesou nosiči (8) a 2 lidé u vozu
    expect(marketCrew({ grain: 1_000 }, {}, ['four-wheel'])).toEqual({ porters: 10, carts: 1 });
    // na vůz napřed kg zboží, pak celé klády: 700 kg obilí a 1 kláda, 2 klády nesou 4 lidé
    expect(marketCrew({ grain: 700, logs: 3 }, {}, ['four-wheel'])).toEqual({
      porters: 6,
      carts: 1,
    });
    // 1 m³ kamene = 2 500 kg – na jeden čtyřkolák se nevejde, na čtyři ano
    expect(marketCrew({ stone: 1 }, {}, ['four-wheel'])).toBeNull();
    const four = ['four-wheel', 'four-wheel', 'four-wheel', 'four-wheel'] as const;
    expect(marketCrew({ stone: 1 }, {}, four)).toEqual({ porters: 8, carts: 4 });
    // víc vozů, než je třeba, nejede – při stejném počtu lidí méně vozů
    expect(marketCrew({ grain: 600 }, {}, four)).toEqual({ porters: 2, carts: 1 });
  });
});

describe('výprava na trh – kontroly (Rozhodnutí plánu 2, bod 2)', () => {
  const order = (give: TradeGoods, stayDays = 1): MarketOrder => ({ give, wants: {}, stayDays });
  const base: MarketTripCheck = {
    stock: { cows: 3, grain: 10_000, stone: 5 },
    carts: [],
    adults: 12,
    cells: 1,
    day: D,
  };

  it('data cesty: vyrazí ráno po dnešku, tržní dny, první den doma', () => {
    expect(checkMarketTrip(order({}), base)).toMatchObject({
      ok: true,
      departDay: D + 1,
      arriveDay: D + 1,
      returnDay: D + 2,
    });
    expect(checkMarketTrip(order({}, 2), { ...base, cells: 3 })).toMatchObject({
      arriveDay: D + 3,
      returnDay: D + 7,
    });
  });

  it('důvody v pořadí kontrol', () => {
    expect(checkMarketTrip(order({}, 0), base)).toEqual({ ok: false, reason: MARKET_STAY });
    expect(checkMarketTrip(order({ cows: 9 }), base)).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
    expect(checkMarketTrip(order({ stone: 1 }), base)).toEqual({
      ok: false,
      reason: MARKET_STONE_CART,
    });
    // 30 nosičů
    expect(checkMarketTrip(order({ grain: 750 }), base)).toEqual({
      ok: false,
      reason: MARKET_NO_PEOPLE,
    });
    const late = { ...base, day: TOTAL_GAME_DAYS - 2 };
    expect(checkMarketTrip(order({}), late)).toEqual({ ok: false, reason: MARKET_WORLD_END });
  });
});

describe('výprava na trh – odchod a návrat (Rozhodnutí plánu 2, body 2 a 6)', () => {
  const h = homeVillage();
  const sent = departMarket(
    h,
    D,
    { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
    target,
  );
  if (!sent.ok) throw new Error(sent.reason);
  const after = sent.state;
  const e = after.trade!.expeditions.at(-1)!;
  const key = `market:h:${e.id}`;

  it('odchod: zboží pryč, výprava na cestě, příjezd do odchozí schránky, kronika', () => {
    expect(h.storesKg - after.storesKg).toBeCloseTo(600, 6);
    expect(e).toMatchObject({
      kind: 'market',
      trailId: -1,
      startedDay: D + 1,
      porters: 3,
      market: { key, returnDay: D + 2 },
    });
    expect(after.outbox).toEqual([
      expect.objectContaining({ villageId: 'm', day: D + 1, ref: `${key}:in` }),
    ]);
    expect(after.chronicle.at(-1)).toMatchObject({
      kind: 'market-departed',
      villageName: 'Lhota',
      returnDay: D + 2,
    });
  });

  it('práce nosičů jen v okně dní, i když vsi chyběli lidé (Rozhodnutí 2)', () => {
    expect([D, D + 1, D + 2].map((d) => expeditionLaborNeed(after, d))).toEqual([0, 3, 0]);
    const short = structuredClone(after);
    short.trade!.expeditions.at(-1)!.done = 0;
    expect(expeditionLaborNeed(short, D + 2)).toBe(0);
    expect(workExpeditions(structuredClone(short), 100, D + 2).used).toBe(0);
    expect(workExpeditions(structuredClone(short), 100, D + 1)).toEqual({ used: 3, shares: [] });
  });

  it('finishExpeditions výpravu na trh nesmaže a nic nepřidá', () => {
    const done = structuredClone(after);
    done.trade!.expeditions.at(-1)!.done = e.cost;
    expect(finishExpeditions(done, D + 2)).toEqual([]);
    expect(done.trade!.expeditions.at(-1)!.market!.key).toBe(key);
    expect(done.storesKg).toBe(after.storesKg);
  });

  it('vůz je pryč do returnDay, pak doma i bez výsledku', () => {
    expect(cartsAway(after).has(e.carts![0]!)).toBe(true);
    const home = structuredClone(after);
    marketTripsDay(home, D + 2);
    expect(cartsAway(home).has(e.carts![0]!)).toBe(false);
    // čeká na zboží
    expect(home.trade!.expeditions.some((x) => x.market?.key === key)).toBe(true);
  });

  it('výsledek trhu: zboží domů, výprava uzavřená, zpráva na pivo; bez záznamu zboží i tak', () => {
    const res: MarketResult = {
      key,
      sold: { grain: 600 },
      bought: { cows: 1 },
      unsold: {},
      horses: [],
      report,
      prices: { cows: 38 },
    };
    const back = structuredClone(after);
    expect(applyMarketResult(back, D + 2, res)).toEqual([
      expect.objectContaining({ kind: 'market-returned' }),
    ]);
    expect(back.livestock!.herds.cow - after.livestock!.herds.cow).toBe(1);
    expect(back.trade!.expeditions.some((x) => x.market?.key === key)).toBe(false);
    expect(back.news).toEqual([{ villageId: 'm', name: 'Lhota', report, prices: { cows: 38 } }]);
    // záznam výpravy chybí – zboží přibude i tak
    const orphan = structuredClone(h);
    applyMarketResult(orphan, D + 2, res);
    expect(orphan.livestock!.herds.cow - h.livestock!.herds.cow).toBe(1);
  });
});
