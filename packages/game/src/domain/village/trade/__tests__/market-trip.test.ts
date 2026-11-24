import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../../calendar';
import { cartsAway, villageCarts } from '../../crafts/carts';
import { oxenHome } from '../../livestock/oxen';
import type { MarketOrder, MarketResult, TradeGoods, VillageState } from '../../types';
import {
  MARKET_NO_OXEN,
  MARKET_NO_PEOPLE,
  MARKET_OVER_STOCK,
  MARKET_STAY,
  MARKET_BAD_ORDER,
  MARKET_WORLD_END,
  applyMarketResult,
  checkMarketTrip,
  departMarket,
  departMarketInPlace,
  marketCarryKg,
  marketCrew,
  marketFreeAdults,
  marketTravelDays,
  marketTripsDay,
  oxenForCarts,
  planMarketTrip,
  type MarketTripCheck,
} from '../market-trip';
import { expeditionLaborNeed, finishExpeditions, workExpeditions } from '../trade';
import { marketResult } from '../market';
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
    // kámen jako u zásilky vazala: na náklad čtyřkoláku (800 kg) dva lidé, vůz netřeba
    expect(marketCrew({ stone: 1 }, {}, [])).toEqual({ porters: 8, carts: 0 });
    expect(marketCrew({}, {}, [])).toEqual({ porters: 1, carts: 0 });
  });

  it('co se na vozy naráz nevejde, nesou lidé; kámen po nákladech čtyřkoláku jako zásilka vazala', () => {
    // čtyřkolák 800 kg: 1 000 kg obilí – 200 kg nesou nosiči (8) a 2 lidé u vozu
    expect(marketCrew({ grain: 1_000 }, {}, ['four-wheel'])).toEqual({ porters: 10, carts: 1 });
    // na vůz napřed kg zboží, pak celé klády: 700 kg obilí a 1 kláda, 2 klády nesou 4 lidé
    expect(marketCrew({ grain: 700, logs: 3 }, {}, ['four-wheel'])).toEqual({
      porters: 6,
      carts: 1,
    });
    // 1 m³ kamene = 2 500 kg = 4 náklady čtyřkoláku po 2 lidech, vozy výpravy na to nezáleží
    expect(marketCrew({ stone: 1 }, {}, ['four-wheel'])).toEqual({ porters: 8, carts: 0 });
    const four = ['four-wheel', 'four-wheel', 'four-wheel', 'four-wheel'] as const;
    // víc vozů, než je třeba, nejede – při stejném počtu lidí méně vozů
    expect(marketCrew({ grain: 600 }, {}, four)).toEqual({ porters: 2, carts: 1 });
  });
});

describe('výprava na trh – kontroly (Rozhodnutí plánu 2, bod 2)', () => {
  const order = (give: TradeGoods, stayDays = 1): MarketOrder => ({ give, wants: {}, stayDays });
  const base: MarketTripCheck = {
    stock: { cows: 3, grain: 10_000, stone: 5 },
    homeCarts: [],
    oxenHome: 0,
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
    expect(checkMarketTrip(order({ cows: 0.5 }), base)).toEqual({
      ok: false,
      reason: MARKET_BAD_ORDER,
    });
    // 30 nosičů
    expect(checkMarketTrip(order({ grain: 750 }), base)).toEqual({
      ok: false,
      reason: MARKET_NO_PEOPLE,
    });
    const late = { ...base, day: TOTAL_GAME_DAYS - 2 };
    expect(checkMarketTrip(order({}), late)).toEqual({ ok: false, reason: MARKET_WORLD_END });
  });

  it('kovář jde sám (`alone`, Rozhodnutí plánu 3, bod 9): bez nosičů, vozů a kontroly dospělých', () => {
    const smith = order({ ironBars: 1 });
    const input: MarketTripCheck = {
      ...base,
      stock: { ironBars: 10 },
      homeCarts: ['four-wheel'],
      oxenHome: 2,
      adults: 0,
    };
    expect(checkMarketTrip(smith, input)).toEqual({ ok: false, reason: MARKET_NO_PEOPLE });
    expect(checkMarketTrip(smith, { ...input, alone: true })).toEqual({
      ok: true,
      porters: 0,
      carts: 0,
      oxen: 0,
      travelDays: 0,
      departDay: D + 1,
      arriveDay: D + 1,
      returnDay: D + 2,
    });
    // ostatní kontroly platí i pro kováře
    expect(checkMarketTrip(order({ ironBars: 11 }), { ...input, alone: true })).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
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

  it('výprava kováře (`alone`): bez nosičů a vozů, práce výpravy 0, příjezd nese `service`', () => {
    const smith = structuredClone(h);
    smith.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 5 };
    const sentAlone = departMarketInPlace(
      smith,
      D,
      { give: { ironBars: 1 }, wants: {}, stayDays: 1 },
      target,
      { by: 'smith', alone: true, service: { kind: 'shoeing', horses: 2 } },
    );
    if (!sentAlone.ok) throw new Error(sentAlone.reason);
    const trip = smith.trade!.expeditions.at(-1)!;
    expect(trip).toMatchObject({ by: 'smith', porters: 0, cost: 0, give: { ironBars: 1 } });
    expect(trip.carts).toBeUndefined();
    expect(smith.crafts.ironBarsKg).toBeCloseTo(4, 9);
    expect([D + 1, D + 2].map((d) => expeditionLaborNeed(smith, d))).toEqual([0, 0]);
    expect(smith.outbox!.at(-1)!.body).toMatchObject({
      kind: 'market-arrive',
      arrival: { goods: { ironBars: 1 }, service: { kind: 'shoeing', horses: 2 } },
    });
    // bez `alone` jede s vozem a nosiči a `service` nenese
    const plain = structuredClone(h);
    plain.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 5 };
    departMarketInPlace(plain, D, { give: { ironBars: 1 }, wants: {}, stayDays: 1 }, target);
    expect(plain.trade!.expeditions.at(-1)!.porters).toBe(1);
    expect(plain.outbox!.at(-1)!.body).not.toHaveProperty('arrival.service');
  });
});

describe('výprava na trh – opravné kolo (tažní voli, volní lidé, tvar objednávky, kámen)', () => {
  const order = (give: TradeGoods, wants: TradeGoods = {}): MarketOrder => ({
    give,
    wants,
    stayDays: 1,
  });
  const base: MarketTripCheck = {
    stock: { cows: 3, trainedOxen: 4, grain: 10_000, stone: 5 },
    homeCarts: ['four-wheel'],
    oxenHome: 2,
    adults: 40,
    cells: 1,
    day: D,
  };

  it('prodaní tažní voli netáhnou vůz – výprava jede bez něj a nosičů je tolik, kolik náklad bez vozu chce', () => {
    // vůz s voly by 800 kg obilí vezl se 2 lidmi, bez vozu je to 32
    expect(checkMarketTrip(order({}, { grain: 800 }), base)).toMatchObject({
      porters: 2,
      carts: 1,
    });
    expect(checkMarketTrip(order({ trainedOxen: 2 }, { grain: 800 }), base)).toMatchObject({
      ok: true,
      porters: 32,
      carts: 0,
    });
    expect(
      checkMarketTrip(order({ trainedOxen: 2 }, { grain: 800 }), { ...base, adults: 12 }),
    ).toEqual({ ok: false, reason: MARKET_NO_PEOPLE });
    // ves se čtyřmi voly, která prodá dva, vůz pojede
    expect(
      checkMarketTrip(order({ trainedOxen: 2 }, { grain: 800 }), { ...base, oxenHome: 4 }),
    ).toMatchObject({ porters: 3, carts: 1 });
    // ve stavu: výprava neodveze vůz, jehož voly prodala
    const sent = planMarketTrip(
      homeVillage(),
      D,
      order({ trainedOxen: 2 }, { grain: 800 }),
      target,
    );
    expect(sent).toEqual({ ok: false, reason: MARKET_NO_PEOPLE });
    const small = planMarketTrip(
      homeVillage(),
      D,
      order({ trainedOxen: 2 }, { grain: 100 }),
      target,
    );
    expect(small).toMatchObject({ ok: true, carts: 0, cartIds: [] });
  });

  it('nosiči jsou volní lidé: druhá výprava téhož dne, na kterou nikdo nezbyl, se odmítne', () => {
    const h = homeVillage();
    expect(marketFreeAdults(h, D)).toBe(8);
    // 1 m³ kamene zpět = 4 náklady po 2 lidech = 8 nosičů, tedy všichni dospělí
    const wantsStone = order({}, { stone: 1 });
    const first = departMarket(h, D, wantsStone, target);
    if (!first.ok) throw new Error(first.reason);
    expect(first.trip.wants).toEqual({ stone: 1 });
    expect(marketFreeAdults(first.state, D)).toBe(0);
    expect(departMarket(first.state, D, wantsStone, target)).toEqual({
      ok: false,
      reason: MARKET_NO_PEOPLE,
    });
    // druhá s krávou se odmítne – volní lidé došli; další blok ukazuje, že s lidmi projde
    expect(departMarket(first.state, D, order({}, { cows: 1 }), target)).toMatchObject({
      ok: false,
    });
    const few = homeVillage();
    const cheap = departMarket(few, D, order({}, { cows: 1 }), target);
    if (!cheap.ok) throw new Error(cheap.reason);
    expect(marketFreeAdults(cheap.state, D)).toBe(7);
    expect(departMarket(cheap.state, D, order({}, { cows: 1 }), target).ok).toBe(true);
  });

  it('tvar objednávky hlídá jádro: necelé kusy, záporná a nekonečná čísla, NaN', () => {
    const bad = { ok: false, reason: MARKET_BAD_ORDER };
    expect(checkMarketTrip(order({ trainedOxen: 0.5 }), base)).toEqual(bad);
    expect(checkMarketTrip(order({}, { cows: 1.5 }), base)).toEqual(bad);
    expect(checkMarketTrip(order({}, { stone: 0.5 }), base)).toEqual(bad);
    expect(checkMarketTrip(order({ grain: Number.NaN }), base)).toEqual(bad);
    expect(checkMarketTrip(order({}, { grain: Number.POSITIVE_INFINITY }), base)).toEqual(bad);
    expect(checkMarketTrip(order({ grain: -5 }), base)).toEqual(bad);
    // kg se dělí libovolně
    expect(checkMarketTrip(order({ grain: 12.5 }), base)).toMatchObject({ ok: true });
  });

  it('kámen jako u zásilky vazala: po nákladech čtyřkoláku, výprava nepotřebuje vůz', () => {
    const none = { ...base, homeCarts: [], oxenHome: 0 };
    expect(checkMarketTrip(order({ stone: 1 }), none)).toMatchObject({
      ok: true,
      porters: 8,
      carts: 0,
    });
    expect(checkMarketTrip(order({ stone: 2 }), none)).toMatchObject({ ok: true, porters: 14 });
    // omezují ho jen lidé, a to s pravdivým důvodem
    expect(checkMarketTrip(order({ stone: 1 }), { ...none, adults: 6 })).toEqual({
      ok: false,
      reason: MARKET_NO_PEOPLE,
    });
  });
});

// Vozy na trhu (markets.md – Rozhodnutí plánu 3, bod 4): koupený vůz táhnou domů voli, kteří jdou
// s výpravou (dvoukolák jeden, čtyřkolák dva – oxen.md, Potah); prodaný vůz nejede jako dopravní.
describe('vozy na trhu – voli pro koupený vůz, prodaný vůz (Rozhodnutí plánu 3, bod 4)', () => {
  const base: MarketTripCheck = {
    stock: { grain: 10_000, trainedOxen: 2 },
    homeCarts: [],
    oxenHome: 0,
    adults: 40,
    cells: 1,
    day: D,
  };
  const order = (give: TradeGoods, wants: TradeGoods = {}): MarketOrder => ({
    give,
    wants,
    stayDays: 1,
  });

  /** Ves H se dvěma volnými dvoukoláky (id 1 a 2) a `oxen` vycvičenými voly v ohradě. */
  function twoCarts(oxen: number): VillageState {
    const s = homeVillage();
    s.carts = [
      { id: 1, kind: 'two-wheel', builtDay: D - 30 },
      { id: 2, kind: 'two-wheel', builtDay: D - 20 },
    ];
    s.pens!.find((p) => p.id === 900)!.oxen = Array.from({ length: oxen }, () => ({
      trainedDay: D - 10,
    }));
    return s;
  }

  it('voli na koupené vozy: dvoukolák 1, čtyřkolák 2 – bez nich výprava vůz nekoupí', () => {
    expect(oxenForCarts({ twoWheelCarts: 1 })).toBe(1);
    expect(oxenForCarts({ twoWheelCarts: 2, fourWheelCarts: 1, grain: 100 })).toBe(4);
    expect(checkMarketTrip(order({}, { twoWheelCarts: 1 }), base)).toEqual({
      ok: false,
      reason: MARKET_NO_OXEN,
    });
    expect(
      checkMarketTrip(order({}, { twoWheelCarts: 1 }), { ...base, oxenHome: 2 }),
    ).toMatchObject({ ok: true, carts: 0, oxen: 1 });
    expect(checkMarketTrip(order({}, { fourWheelCarts: 1 }), { ...base, oxenHome: 1 })).toEqual({
      ok: false,
      reason: MARKET_NO_OXEN,
    });
    expect(
      checkMarketTrip(order({}, { fourWheelCarts: 1 }), { ...base, oxenHome: 2 }),
    ).toMatchObject({ ok: true, oxen: 2 });
    // bez vozů v seznamu voli nejdou
    expect(checkMarketTrip(order({}, { cows: 1 }), base)).toMatchObject({ ok: true, oxen: 0 });
  });

  it('koupený vůz táhnou voli napřed – dopravní vůz jede jen s ostatními, jinak nosiči', () => {
    // čtyřkolák a 2 voli, koupený dvoukolák: vůl pro něj je rezervovaný, čtyřkolák bez páru stojí
    const withCart: MarketTripCheck = { ...base, homeCarts: ['four-wheel'], oxenHome: 2 };
    const buy = order({ grain: 400 }, { twoWheelCarts: 1 });
    expect(checkMarketTrip(buy, withCart)).toMatchObject({
      ok: true,
      carts: 0,
      oxen: 1,
      porters: 16,
    });
    // s 3 voly jede čtyřkolák s párem a vůl táhne koupený vůz
    expect(checkMarketTrip(buy, { ...withCart, oxenHome: 3 })).toMatchObject({
      ok: true,
      carts: 1,
      porters: 2,
      oxen: 1,
    });
    // MARKET_NO_OXEN jen když voli nestačí ani na koupené vozy (i bez dopravních vozů)
    expect(checkMarketTrip(buy, { ...withCart, oxenHome: 0 })).toEqual({
      ok: false,
      reason: MARKET_NO_OXEN,
    });
    expect(checkMarketTrip(order({}, { fourWheelCarts: 1 }), { ...withCart, oxenHome: 1 })).toEqual(
      { ok: false, reason: MARKET_NO_OXEN },
    );
    // nedostatek volů se hlásí před nedostatkem lidí
    expect(
      checkMarketTrip(order({ grain: 400 }, { fourWheelCarts: 1 }), {
        ...withCart,
        oxenHome: 1,
        adults: 0,
      }),
    ).toEqual({ ok: false, reason: MARKET_NO_OXEN });
    // vůl, který se prodá, koupený vůz netáhne
    const sell = order({ trainedOxen: 1 }, { twoWheelCarts: 1 });
    expect(checkMarketTrip(sell, { ...base, oxenHome: 1 })).toEqual({
      ok: false,
      reason: MARKET_NO_OXEN,
    });
    expect(checkMarketTrip(sell, { ...base, oxenHome: 2 })).toMatchObject({ ok: true, oxen: 1 });
  });

  it('ves s jedním čtyřkolákem a 2 voly koupí čtyřkolák za obilí: obilí nesou nosiči, voli táhnou vůz', () => {
    const h = homeVillage();
    h.carts = [{ id: 1, kind: 'four-wheel', builtDay: D - 30 }];
    h.pens!.find((p) => p.id === 900)!.oxen = [{ trainedDay: D - 10 }, { trainedDay: D - 10 }];
    const buy = order({ grain: 100 }, { fourWheelCarts: 1 });
    const plan = planMarketTrip(h, D, buy, target);
    expect(plan).toEqual(expect.objectContaining({ ok: true }));
    expect(plan).toMatchObject({ carts: 0, cartIds: [], oxen: 2 });
    const sent = departMarket(h, D, buy, target);
    if (!sent.ok) throw new Error(sent.reason);
    expect(cartsAway(sent.state).has(1)).toBe(false);
    expect(sent.trip.oxen).toBe(2);
  });

  it('neprodaný vůz se vrátí se stejným stářím, id prodaného vozu se nepoužije znovu', () => {
    const s = twoCarts(1);
    const sell = order({ twoWheelCarts: 1 });
    const sent = departMarket(s, D, sell, target);
    if (!sent.ok) throw new Error(sent.reason);
    // prodává se nejmladší volný vůz (id 2, D − 20) a nese své stáří
    const mail = sent.state.outbox!.find((m) => m.body.kind === 'market-arrive')!;
    const arrival = (mail.body as { arrival: Parameters<typeof marketResult>[0] }).arrival;
    expect((arrival as { carts?: unknown }).carts).toEqual([
      { good: 'twoWheelCarts', builtDay: D - 20 },
    ]);
    // hostitel vůz nechce – domů se vrátí neprodaný se stejným builtDay
    const result = marketResult(arrival);
    const home = structuredClone(sent.state);
    applyMarketResult(home, D + 2, result);
    expect(villageCarts(home).find((c) => c.builtDay === D - 20)).toBeDefined();
    expect(villageCarts(home).map((c) => c.builtDay)).toEqual([D - 30, D - 20]);
    // nové id nekoliduje s žádným vozem (id 2 prodáno, nový vůz dostane 3)
    expect(villageCarts(home).map((c) => c.id)).toEqual([1, 3]);
  });

  it('voli pro koupený vůz jsou pryč do returnDay − 1, v returnDay doma (market.oxen smazané)', () => {
    // H: čtyřkolák a 2 vycvičení voli; výprava bez nákladu vůz doma nechá a voly vezme
    const h = homeVillage();
    const buy = order({}, { fourWheelCarts: 1 });
    const far = { ...target, cells: 2 };
    expect(planMarketTrip(h, D, buy, far)).toMatchObject({
      ok: true,
      carts: 0,
      cartIds: [],
      oxen: 2,
      returnDay: D + 4,
    });
    const sent = departMarket(h, D, buy, far);
    if (!sent.ok) throw new Error(sent.reason);
    expect(sent.trip.oxen).toBe(2);
    expect(oxenHome(h, D + 1)).toBe(2);
    const state = structuredClone(sent.state);
    for (const day of [D + 1, D + 2, D + 3]) {
      marketTripsDay(state, day);
      expect(oxenHome(state, day)).toBe(0);
    }
    marketTripsDay(state, D + 4);
    expect(oxenHome(state, D + 4)).toBe(2);
    const e = state.trade!.expeditions.at(-1)!;
    expect(e.market!.oxen).toBeUndefined();
    // výprava čeká na výsledek trhu
    expect(e.market!.key).toBe(sent.trip.key);
  });

  it('prodej vozu: prodá se nejmladší volný vůz druhu, dopravní je ten zbylý', () => {
    // 2 volné dvoukoláky (id 1 a 2) a 1 vycvičený vůl; 400 kg obilí jede na voze
    const s = twoCarts(1);
    const sell = order({ twoWheelCarts: 1, grain: 400 });
    const plan = planMarketTrip(s, D, sell, target);
    expect(plan).toMatchObject({ ok: true, carts: 1, porters: 2, cartIds: [1], oxen: 0 });
    const sent = departMarket(s, D, sell, target);
    if (!sent.ok) throw new Error(sent.reason);
    expect(villageCarts(sent.state)).toEqual([{ id: 1, kind: 'two-wheel', builtDay: D - 30 }]);
    expect(cartsAway(sent.state).has(1)).toBe(true);
    expect(sent.state.trade!.expeditions.at(-1)).toMatchObject({
      carts: [1],
      give: { grain: 400, twoWheelCarts: 1 },
    });
  });

  it('prodaný vůz nejede jako dopravní – voli zbydou na ostatní vozy, náhled počítá stejně', () => {
    const input: MarketTripCheck = {
      ...base,
      stock: { grain: 10_000, twoWheelCarts: 2 },
      homeCarts: ['two-wheel', 'two-wheel'],
      oxenHome: 2,
    };
    // bez prodeje vezou 800 kg oba vozy, s prodejem jeden (400 kg na voze, zbytek 16 nosičů)
    expect(checkMarketTrip(order({ grain: 800 }), input)).toMatchObject({ carts: 2, porters: 4 });
    expect(checkMarketTrip(order({ twoWheelCarts: 1, grain: 800 }), input)).toMatchObject({
      ok: true,
      carts: 1,
      porters: 18,
    });
    expect(checkMarketTrip(order({ twoWheelCarts: 2 }), input)).toMatchObject({
      ok: true,
      carts: 0,
    });
    expect(checkMarketTrip(order({ twoWheelCarts: 3 }), input)).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
    // ve stavu: tytéž vozy – dopravní je vůz 1
    const plan = planMarketTrip(twoCarts(2), D, order({ twoWheelCarts: 1, grain: 400 }), target);
    expect(plan).toMatchObject({ ok: true, carts: 1, cartIds: [1] });
  });
});

describe('odchod bez klonu a kdo výpravu poslal (Rozhodnutí plánu 3, bod 7)', () => {
  const order = { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 };

  it('departMarketInPlace = departMarket bez kopie; kronika s hostitelem a `by`', () => {
    const h = homeVillage();
    const copied = departMarket(h, D, order, target);
    if (!copied.ok) throw new Error(copied.reason);
    const inPlace = structuredClone(h);
    const sent = departMarketInPlace(inPlace, D, order, target);
    if (!sent.ok) throw new Error(sent.reason);
    expect(inPlace).toEqual(copied.state);
    expect(sent.trip).toEqual(copied.trip);
    expect(inPlace.lastDay).toBe(h.lastDay);
    expect(inPlace.chronicle.at(-1)).toMatchObject({ kind: 'market-departed', villageId: 'm' });
    expect(inPlace.chronicle.at(-1)).not.toHaveProperty('by');
    expect(inPlace.outbox![0]!.body).toMatchObject({ arrival: { firstStep: 'E' } });

    const villagers = structuredClone(h);
    departMarketInPlace(villagers, D, order, target, { by: 'villagers' });
    const e = villagers.trade!.expeditions.at(-1)!;
    expect(e.by).toBe('villagers');
    expect(villagers.chronicle.at(-1)).toMatchObject({ by: 'villagers', villageId: 'm' });
    // návrat nese hostitele i to, kdo výpravu poslal
    const back = applyMarketResult(villagers, D + 2, {
      key: e.market!.key,
      sold: { grain: 600 },
      bought: { cows: 1 },
      unsold: {},
      horses: [],
    });
    expect(back).toEqual([
      expect.objectContaining({ kind: 'market-returned', villageId: 'm', by: 'villagers' }),
    ]);
  });

  it('odmítnutá výprava stav nezmění', () => {
    const h = homeVillage();
    const before = structuredClone(h);
    expect(departMarketInPlace(h, D, { ...order, give: { grain: 1e9 } }, target)).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
    expect(h).toEqual(before);
  });

  it('marketCarryKg – kolik unese jedna cesta: nosiči po 25 kg, vozy s dvěma lidmi', () => {
    expect(marketCarryKg(0, ['four-wheel'])).toBe(0);
    expect(marketCarryKg(4, [])).toBe(100);
    // čtyřkolák 800 kg + 2 nosiči
    expect(marketCarryKg(4, ['four-wheel'])).toBe(850);
    // jen jeden vůz s posádkou se vejde
    expect(marketCarryKg(3, ['two-wheel', 'two-wheel'])).toBe(425);
    // obráceně k marketCrew: přesně tolik ještě projde, o kilogram víc už ne
    for (const [adults, carts] of [
      [4, ['four-wheel']],
      [7, ['two-wheel', 'two-wheel']],
    ] as const) {
      const kg = marketCarryKg(adults, carts);
      expect(marketCrew({ grain: kg }, {}, carts).porters).toBe(adults);
      expect(marketCrew({ grain: kg + 1 }, {}, carts).porters).toBe(adults + 1);
    }
  });
});
