import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { toolNeedKg } from '../../crafts/iron';
import { villageHorses } from '../../livestock/horses';
import { breedingCows, oxenCalvesWanted } from '../../livestock/husbandry';
import { MARKET } from '../../rules';
import type {
  MarketArrival,
  MarketHorse,
  MarketOrder,
  MarketResult,
  MarketVisitor,
  VillageState,
} from '../../types';
import { horse, horseVillage } from '../../__tests__/horse-fixtures';
import {
  joinMarket,
  marketArrivalRef,
  marketDay,
  marketResult,
  marketResultRef,
  rememberNews,
} from '../market';
import { coinPriceOf, initialPrice } from '../market-prices';
import { marketStance } from '../market-stance';
import { applyMarketResult, departMarket } from '../market-trip';
import { leavingGroups } from '../market-people';
import {
  D,
  FAMILY_HOUSE,
  SON_HOUSE,
  asEvents,
  familyHome,
  homeVillage,
  marketVillage,
  report,
  sownPart,
  target,
  withWorkshop,
  withoutOutbox,
} from './market-fixtures';

// Trh ve vsi hostitele (markets.md – Pravidla 3, 5 a 8; Rozhodnutí plánu 2, body 4–7): výprava
// přijde událostí schránky, každý tržní den se hostitel a výpravy vyrovnají zápočtem a po pobytu
// výprava odjede – výsledek jde do odchozí schránky vsi k domovské vsi.

/** Výprava z Vlkova: 600 kg obilí za krávu, den na trhu, k sousední vsi. */
function arrival(fields: Partial<MarketArrival> = {}): MarketArrival {
  return {
    key: 'market:h:1',
    fromVillageId: 'h',
    fromName: 'Vlkov',
    stayDays: 1,
    travelDays: 0,
    goods: { grain: 600 },
    horses: [],
    wants: { cows: 1 },
    report,
    ...fields,
  };
}

/** Příjezd jako událost schránky vsi M. */
function arriveEvent(a: MarketArrival, day = D, seq = 1): VillageEvent {
  return { id: `e${seq}`, seq, villageId: 'm', day, body: { kind: 'market-arrive', arrival: a } };
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return mail.body.result;
}

/** Stav vsi bez trhu, odchozí schránky, zpráv a kroniky – to, co trh bez obchodu nezmění. */
function withoutMarket(s: VillageState): Partial<VillageState> {
  const rest: Partial<VillageState> = structuredClone(s);
  delete rest.market;
  delete rest.outbox;
  delete rest.news;
  delete rest.chronicle;
  return rest;
}

describe('trh ve vsi hostitele – tržní den (markets.md – Pravidla 3 a 5)', () => {
  it('výprava prodá obilí, koupí krávu a odjede s výsledkem do odchozí schránky', () => {
    const m = marketVillage();
    expect(breedingCows(m) + oxenCalvesWanted(m, D)).toBe(3);
    expect(marketStance(m, D).offer.cows).toBe(5);
    expect(marketStance(m, D).wants.grain).toBeGreaterThanOrEqual(1_000);
    expect(m.hungry ?? false).toBe(false);

    const event = arriveEvent(arrival());
    const after = advanceVillage(m, D, null, null, [event]);
    expect(after.market!.visitors).toEqual([]);
    expect(after.outbox).toEqual([
      {
        villageId: 'h',
        day: D + 1,
        ref: 'market:h:1:out',
        body: expect.objectContaining({ kind: 'market-result' }),
      },
    ]);
    const result = (after.outbox![0]!.body as { result: MarketResult }).result;
    expect(result.bought).toEqual({ cows: 1 });
    expect(result.sold.grain).toBeCloseTo(600, 6);
    expect(result.unsold).toEqual({});
    expect(after.chronicle.find((e) => e.kind === 'market-held')).toMatchObject({
      sold: { cows: 1 },
    });
    // zboží hostitele bez šumu dne (ves za den žije dál) – krok trhu přímo na kopii
    const direct = structuredClone(m);
    joinMarket(direct, D, arrival());
    marketDay(direct, D);
    expect(direct.storesKg - m.storesKg).toBeCloseTo(600, 6);
    expect(direct.livestock!.herds.cow - m.livestock!.herds.cow).toBe(-1);
    expect(after.market!.prices.cows!).toBe(initialPrice('cows')); // nabídka 5 > poptávka 1, dno je výchozí cena
    expect(after.market!.prices.grain!).toBeGreaterThan(initialPrice('grain'));
    expect(after.news).toEqual([{ villageId: 'h', name: 'Vlkov', report }]);
    expect(after.chronicle.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['market-arrived', 'market-held']),
    );
    // výsledek nese zprávu o hostiteli a ceny trhu po tržním dni
    expect(result.report!.day).toBe(D);
    expect(result.prices).toEqual(after.market!.prices);
    expect(result.horses).toEqual([]);
  });

  it('dvě výpravy: krávy napřed od hostitele, pak od dřívější výpravy (Martin 22. 11. 2026)', () => {
    const m = marketVillage();
    expect(marketStance(m, D).wants.grain).toBeCloseTo(3_000, 6);
    const s = structuredClone(m);
    const sellers = arrival({
      key: 'market:a:1',
      fromVillageId: 'a',
      fromName: 'Lhota',
      goods: { cows: 3 },
      wants: { grain: 1_800 },
    });
    const buyers = arrival({
      key: 'market:c:1',
      fromVillageId: 'c',
      fromName: 'Újezd',
      goods: { grain: 4_200 },
      wants: { cows: 7 },
    });
    joinMarket(s, D, sellers);
    joinMarket(s, D, buyers);
    const chronicle = marketDay(s, D);

    // hostitel dá jen tolik krav, kolik chce prodat (5), zbytek dřívější výprava
    expect(s.livestock!.herds.cow - m.livestock!.herds.cow).toBe(-5);
    expect(s.storesKg - m.storesKg).toBeCloseTo(3_000, 6);
    const c = resultOf(s, 'market:c:1');
    expect(c.bought).toEqual({ cows: 7 });
    expect(c.sold.grain).toBeCloseTo(4_200, 6);
    expect(c.unsold).toEqual({});
    const a = resultOf(s, 'market:a:1');
    expect(a.sold).toEqual({ cows: 2 });
    expect(a.unsold).toEqual({ cows: 1 });
    expect(a.bought.grain).toBeCloseTo(1_200, 6);
    expect(chronicle).toEqual([
      {
        day: D,
        kind: 'market-held',
        sold: { cows: 5 },
        bought: { grain: expect.closeTo(3_000, 6) },
      },
    ]);
  });

  it('pobyt 3 dny: první výprava koupí druhý den od pozdější a odjede třetí den', () => {
    const m = marketVillage();
    const first = arrival({
      key: 'market:a:1',
      fromVillageId: 'a',
      fromName: 'Lhota',
      stayDays: 3,
      goods: { honey: 30 },
      wants: { cheese: 100 },
    });
    const second = arrival({
      key: 'market:b:1',
      fromVillageId: 'b',
      fromName: 'Bor',
      goods: { cheese: 100 },
      wants: { honey: 30 },
    });
    const events = [arriveEvent(first, D, 1), arriveEvent(second, D + 1, 2)];

    const day1 = advanceVillage(m, D, null, null, events);
    expect(day1.market!.visitors.map((v) => [v.key, v.order, v.lastDay])).toEqual([
      ['market:a:1', 1, D + 2],
    ]);
    expect(day1.market!.visitors[0]!.bought).toEqual({});
    expect(day1.outbox ?? []).toEqual([]);

    const day2 = advanceVillage(day1, D + 1, null, null, events);
    const stay = day2.market!.visitors[0]!;
    expect(stay.bought.cheese).toBeGreaterThan(0);
    expect(stay.goods).toEqual({});
    expect(stay.wants.cheese).toBeCloseTo(100 - stay.bought.cheese!, 6);
    expect(day2.outbox!.map((mail) => [mail.ref, mail.villageId, mail.day])).toEqual([
      ['market:b:1:out', 'b', D + 2],
    ]);

    const day3 = advanceVillage(day2, D + 2, null, null, events);
    expect(day3.market!.visitors).toEqual([]);
    const mail = day3.outbox!.find((x) => x.ref === 'market:a:1:out')!;
    expect([mail.villageId, mail.day]).toEqual(['a', D + 3]);
    const result = resultOf(day3, 'market:a:1');
    expect(result.bought.cheese).toBeCloseTo(stay.bought.cheese!, 6);
    expect(result.sold.honey).toBeCloseTo(30, 6);
    expect(result.report!.day).toBe(D + 2);
  });

  it('nikdo nic nechce: zboží se vrátí, hostitel jako bez trhu, nabízené zboží zůstane na výchozí ceně', () => {
    const m = marketVillage();
    const lonely = arrival({ goods: { honey: 50 }, wants: { pottery: 10 } });
    const after = advanceVillage(m, D, null, null, [arriveEvent(lonely)]);
    const control = advanceVillage(m, D, null, null, []);
    const result = resultOf(after, 'market:h:1');
    expect(result.unsold).toEqual({ honey: 50 });
    expect(result.sold).toEqual({});
    expect(result.bought).toEqual({});
    expect(withoutMarket(after)).toEqual(withoutMarket(control));
    expect(after.chronicle.some((e) => e.kind === 'market-held')).toBe(false);
    expect(after.market!.prices.honey!).toBe(initialPrice('honey'));
    expect(after.market!.prices.pottery!).toBeGreaterThan(initialPrice('pottery'));
  });

  it('bez návštěvníků trh nic nedělá – ve stavu není trh, odchozí schránka ani zprávy', () => {
    const m = marketVillage();
    const s = structuredClone(m);
    expect(marketDay(s, D)).toEqual([]);
    expect(s).toEqual(m);
    const json = JSON.stringify(advanceVillage(m, D + 5, null, null, []));
    expect(json).not.toContain('"market"');
    expect(json).not.toContain('"outbox"');
    expect(json).not.toContain('"news"');
  });

  it('kousky dopočtu: do D + 3 vcelku = po dnech se stejnou schránkou', () => {
    const m = marketVillage();
    const events = [
      arriveEvent(
        arrival({
          key: 'market:a:1',
          fromVillageId: 'a',
          stayDays: 3,
          goods: { honey: 30, cows: 1 },
          wants: { cheese: 100, grain: 50 },
        }),
        D,
        1,
      ),
      arriveEvent(
        arrival({
          key: 'market:b:1',
          fromVillageId: 'b',
          goods: { cheese: 100 },
          wants: { honey: 30 },
        }),
        D + 1,
        2,
      ),
      arriveEvent(arrival({ travelDays: 2 }), D + 1, 3),
    ];
    const whole = advanceVillage(m, D + 3, null, null, events);
    let pieces = m;
    for (let day = D; day <= D + 3; day++) pieces = advanceVillage(pieces, day, null, null, events);
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    expect(whole.outbox!.map((mail) => mail.ref).sort()).toEqual([
      'market:a:1:out',
      'market:b:1:out',
      'market:h:1:out',
    ]);
    expect(whole.outbox!.find((mail) => mail.ref === 'market:h:1:out')!.day).toBe(D + 4);
  });
});

describe('trh ve vsi hostitele – koně', () => {
  const mareFrom: MarketHorse = {
    good: 'mares',
    horse: { bornDay: D - 5 * 365, sex: 'female', training: 30 },
  };

  it('výprava prodá klisnu hostiteli, který klisny shání – kůň s věkem a výcvikem ze záznamu', () => {
    const h = horseVillage([horse(1, 8, 'female', 0, D), horse(2, 9, 'male', 50, D)]);
    h.lastDay = D - 1;
    expect(marketStance(h, D).wants.mares).toBe(1);
    const s = structuredClone(h);
    joinMarket(s, D, arrival({ goods: { mares: 1 }, horses: [mareFrom], wants: { grain: 2_000 } }));
    marketDay(s, D);
    expect(villageHorses(s)).toContainEqual(expect.objectContaining(mareFrom.horse));
    expect(villageHorses(s)).toHaveLength(3);
    const result = resultOf(s, 'market:h:1');
    expect(result.sold).toEqual({ mares: 1 });
    expect(result.horses).toEqual([]);
    expect(result.bought.grain).toBeCloseTo(1_600, 6);
    expect(s.storesKg - h.storesKg).toBeCloseTo(-1_600, 6);
  });

  it('koně na trhu jen po kusech – klisna v počtech bez kusu se neprodá a nic za ni nepřijde', () => {
    const h = horseVillage([horse(1, 8, 'female', 0, D), horse(2, 9, 'male', 50, D)]);
    h.lastDay = D - 1;
    expect(marketStance(h, D).wants.mares).toBe(1);
    const s = structuredClone(h);
    const events = joinMarket(
      s,
      D,
      arrival({ goods: { mares: 1 }, horses: [], wants: { grain: 2_000 } }),
    );
    expect(events).toEqual([
      { day: D, kind: 'market-arrived', villageName: 'Vlkov', goods: {}, villageId: 'h' },
    ]);
    expect(s.market!.visitors[0]!.goods).toEqual({});
    marketDay(s, D);
    const result = resultOf(s, 'market:h:1');
    expect(result).toMatchObject({ sold: {}, bought: {}, unsold: {}, horses: [] });
    expect(villageHorses(s)).toHaveLength(2);
    expect(s.storesKg).toBe(h.storesKg);
  });

  it('hostitel prodá klisnu v pořadí prodeje (napřed nejstarší), hříbata výpravy jdou do ohrady', () => {
    const mares = [5, 6, 10, 12].map((years, i) => horse(i + 1, years, 'female', 0, D));
    const h = horseVillage([...mares, horse(9, 9, 'male', 50, D)]);
    h.lastDay = D - 1;
    expect(marketStance(h, D).offer.mares).toBe(2);
    expect(marketStance(h, D).wants.foals).toBeGreaterThanOrEqual(2);
    const foals: MarketHorse[] = [1, 2].map((years) => ({
      good: 'foals',
      horse: { bornDay: D - years * 365, sex: 'male', training: 0 },
    }));
    const s = structuredClone(h);
    joinMarket(s, D, arrival({ goods: { foals: 2 }, horses: foals, wants: { mares: 1 } }));
    marketDay(s, D);
    const result = resultOf(s, 'market:h:1');
    expect(result.sold).toEqual({ foals: 2 });
    expect(result.bought).toEqual({ mares: 1 });
    const oldest = mares[3]!;
    expect(result.horses).toEqual([
      {
        good: 'mares',
        horse: { bornDay: oldest.bornDay, sex: 'female', training: 0 },
      },
    ]);
    expect(villageHorses(s).some((x) => x.id === oldest.id)).toBe(false);
    for (const foal of foals) {
      expect(villageHorses(s)).toContainEqual(expect.objectContaining(foal.horse));
    }
  });
});

describe('trh ve vsi hostitele – příjezd, výsledek a zprávy', () => {
  it('příjezd: návštěvník v pořadí, poznámka o obchodníkovi, zpráva a kronika; týž klíč nic', () => {
    const s = marketVillage();
    const mare: MarketHorse = {
      good: 'mares',
      horse: { bornDay: D - 5 * 365, sex: 'female', training: 0 },
    };
    const a = arrival({ goods: { grain: 600, mares: 1 }, horses: [mare], firstStep: 'E' });
    const chronicle = joinMarket(s, D, a);
    // kronika nese ves výpravy (Rozhodnutí plánu 3, bod 15), výprava směr od své vsi
    expect(chronicle).toEqual([
      {
        day: D,
        kind: 'market-arrived',
        villageName: 'Vlkov',
        goods: { grain: 600, mares: 1 },
        villageId: 'h',
      },
    ]);
    expect(s.market!.prices).toEqual({});
    expect(s.market!.nextOrder).toBe(2);
    expect(s.market!.visitors).toEqual([
      {
        key: 'market:h:1',
        fromVillageId: 'h',
        fromName: 'Vlkov',
        firstStep: 'E',
        order: 1,
        arrivedDay: D,
        lastDay: D,
        travelDays: 0,
        goods: { grain: 600, mares: 1 },
        horses: [mare],
        wants: { cows: 1 },
        sold: {},
        bought: {},
        boughtHorses: [],
      },
    ]);
    expect(s.market!.arrivals).toMatchObject([
      { name: 'Vlkov', day: D, goods: ['grain', 'mares'] },
    ]);
    expect(s.market!.arrivals[0]!.villageId).toBe('h');
    expect(s.news).toEqual([{ villageId: 'h', name: 'Vlkov', report }]);

    // týž klíč podruhé nic neudělá
    const once = structuredClone(s);
    expect(joinMarket(s, D + 1, a)).toEqual([]);
    expect(s).toEqual(once);
    // vstup se neukládá odkazem
    a.goods.grain = 1;
    expect(s.market!.visitors[0]!.goods.grain).toBe(600);

    // poslední pobyt podle délky pobytu
    joinMarket(s, D, arrival({ key: 'market:x:1', stayDays: 4 }));
    expect(s.market!.visitors[1]).toMatchObject({ order: 2, lastDay: D + 3 });
  });

  it('paměť příjezdů je jen posledních MARKET.report.traders (technický strop)', () => {
    const s = marketVillage();
    const n = MARKET.report.traders + 2;
    for (let i = 1; i <= n; i++) {
      joinMarket(s, D, arrival({ key: `market:v:${i}`, fromName: `Ves ${i}` }));
    }
    expect(s.market!.arrivals.map((x) => x.name)).toEqual(
      Array.from({ length: MARKET.report.traders }, (_, i) => `Ves ${i + 3}`),
    );
    expect(s.market!.visitors).toHaveLength(n);
  });

  it('zprávy: jedna na ves, novější vyhrává', () => {
    const s = marketVillage();
    rememberNews(s, { villageId: 'h', name: 'Vlkov', report: { ...report, day: 10 } });
    rememberNews(s, { villageId: 'x', name: 'Bor', report: { ...report, day: 5 } });
    rememberNews(s, { villageId: 'h', name: 'Vlkov', report: { ...report, day: 8 } });
    expect(s.news!.map((n) => [n.villageId, n.report.day])).toEqual([
      ['h', 10],
      ['x', 5],
    ]);
    rememberNews(s, {
      villageId: 'h',
      name: 'Vlkov',
      report: { ...report, day: 12 },
      prices: { grain: 0.1 },
    });
    expect(s.news![0]).toEqual({
      villageId: 'h',
      name: 'Vlkov',
      report: { ...report, day: 12 },
      prices: { grain: 0.1 },
    });
  });

  it('zpráva bez cen nepřepíše známé ceny a hladinu (preflight plánu 4, M15)', () => {
    const s = marketVillage();
    const known = { prices: { grain: 0.1 }, level: 3 };
    rememberNews(s, { villageId: 'h', name: 'Vlkov', report: { ...report, day: 10 }, ...known });
    // hosté z Vlkova přijeli na trh vsi – zpráva o Vlkově bez cen
    joinMarket(s, D, arrival({ report: { ...report, day: 12 } }));
    expect(s.news![0]).toEqual({
      villageId: 'h',
      name: 'Vlkov',
      report: { ...report, day: 12 },
      ...known,
    });
    // novější zpráva s cenami a bez `level` (hladina 1) přepíše obojí
    rememberNews(s, {
      villageId: 'h',
      name: 'Vlkov',
      report: { ...report, day: 14 },
      prices: { grain: 0.2 },
    });
    expect(s.news![0]).toEqual({
      villageId: 'h',
      name: 'Vlkov',
      report: { ...report, day: 14 },
      prices: { grain: 0.2 },
    });
    // starší zpráva s cenami: novější zpráva zůstane, ceny a hladinu vezme, jen když žádné nezná
    rememberNews(s, { villageId: 'x', name: 'Bor', report: { ...report, day: 9 } });
    rememberNews(s, { villageId: 'x', name: 'Bor', report: { ...report, day: 8 }, ...known });
    rememberNews(s, {
      villageId: 'x',
      name: 'Bor',
      report: { ...report, day: 7 },
      prices: { grain: 0.5 },
    });
    expect(s.news![1]).toEqual({
      villageId: 'x',
      name: 'Bor',
      report: { ...report, day: 9 },
      ...known,
    });
  });

  it('výsledek: nepoužitý příjezd vrátí vše, návštěvník neprodané i koupené koně', () => {
    expect(marketResult(arrival(), { returned: true })).toEqual({
      key: 'market:h:1',
      sold: {},
      bought: {},
      unsold: { grain: 600 },
      horses: [],
      returned: true,
    });
    const own: MarketHorse = {
      good: 'mares',
      horse: { bornDay: D - 2_000, sex: 'female', training: 0 },
    };
    const bought: MarketHorse = {
      good: 'foals',
      horse: { bornDay: D - 400, sex: 'male', training: 0 },
    };
    const visitor: MarketVisitor = {
      key: 'market:h:1',
      fromVillageId: 'h',
      fromName: 'Vlkov',
      order: 1,
      arrivedDay: D,
      lastDay: D,
      travelDays: 0,
      goods: { mares: 1, honey: 5 },
      horses: [own],
      wants: { foals: 1 },
      sold: { grain: 100 },
      bought: { foals: 1 },
      boughtHorses: [bought],
    };
    expect(marketResult(visitor)).toEqual({
      key: 'market:h:1',
      sold: { grain: 100 },
      bought: { foals: 1 },
      unsold: { mares: 1, honey: 5 },
      horses: [own, bought],
    });
    expect(marketArrivalRef('market:h:1')).toBe('market:h:1:in');
    expect(marketResultRef('market:h:1')).toBe('market:h:1:out');
  });
});

describe('kovář souseda na trhu hostitele (plán 3, Úloha 11)', () => {
  it('příjezd se službou nese `smith` v kronice i v paměti příjezdů – zobrazí se jako kovář', () => {
    const m = marketVillage();
    const events = joinMarket(
      m,
      D,
      arrival({ goods: { ironBars: 1 }, service: { kind: 'shoeing', horses: 0 } }),
    );
    expect(events.find((e) => e.kind === 'market-arrived')).toMatchObject({ smith: true });
    expect(m.market!.arrivals).toMatchObject([
      { name: 'Vlkov', day: D, goods: ['ironBars'], smith: true },
    ]);
    // obchodník bez služby `smith` nenese
    const other = marketVillage();
    joinMarket(other, D, arrival());
    expect(other.market!.arrivals[0]).not.toHaveProperty('smith');
  });
});

/** Lhota (M) s `spareKg` kg obilí nad pojistku. */
function grainVillage(spareKg: number): VillageState {
  const m = marketVillage(0);
  m.storesKg += spareKg;
  return m;
}

/** Výprava s `coins` mincemi, která shání `wants`. */
function coinTrip(
  coins: number,
  wants: MarketArrival['wants'],
  fields: Partial<MarketArrival> = {},
): MarketArrival {
  return arrival({ goods: { coins }, wants, ...fields });
}

/** Výprava `key` na trhu vsi. */
function visitorOf(s: VillageState, key: string): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
}

/** Mince všude: ve vsi, u výprav na trhu a v odchozích výsledcích. */
function allCoins(s: VillageState): number {
  const visitors = s.market?.visitors ?? [];
  const results = (s.outbox ?? []).flatMap((mail) =>
    mail.body.kind === 'market-result' ? [mail.body.result] : [],
  );
  return (
    (s.coins ?? 0) +
    visitors.reduce((sum, v) => sum + (v.goods.coins ?? 0), 0) +
    results.reduce((sum, r) => sum + (r.unsold.coins ?? 0) + (r.bought.coins ?? 0), 0)
  );
}

/** Ves s jedním osetým dílem a bez spřežení – práce je víc než půdy, lidi nabízí (bod 10 plánu 3). */
function withSpareLabor(s: VillageState): VillageState {
  s.fields = [{ id: 1 }];
  s.parts = [sownPart(100)];
  s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
  return s;
}

describe('trh ve vsi hostitele – mincovní fáze (markets.md – Rozhodnutí plánu 4, body 2–4)', () => {
  it('výprava za mince koupí přebytek hostitele: 1 800 kg obilí za 20 mincí, zbude jí 30', () => {
    const m = grainVillage(6_000);
    expect(marketStance(m, D).offer.grain).toBe(6_000);
    const s = structuredClone(m);
    joinMarket(s, D, coinTrip(50, { grain: 1_800 }, { stayDays: 2 }));
    const chronicle = marketDay(s, D);
    expect(s.coins).toBe(20);
    expect(m.storesKg - s.storesKg).toBeCloseTo(1_800, 6);
    const trip = visitorOf(s, 'market:h:1');
    expect(trip.goods).toEqual({ coins: 30 });
    expect(trip.bought).toEqual({ grain: 1_800 });
    expect(trip.sold).toEqual({});
    expect(trip.wants).toEqual({});
    expect(chronicle).toEqual([
      { day: D, kind: 'market-held', sold: { grain: 1_800 }, bought: { coins: 20 } },
    ]);
    // mince i zboží v rovnováze (C = W = 20 mincí) – hladina stojí na 1 a nezapisuje se
    expect(s.market).not.toHaveProperty('level');
    // mince nemají na trhu cenu
    expect(s.market!.prices).not.toHaveProperty('coins');
    expect(allCoins(s)).toBe(50);

    // druhý den už nic neshání – odjede s nepoužitými mincemi
    expect(marketDay(s, D + 1)).toEqual([]);
    const result = resultOf(s, 'market:h:1');
    expect(result.bought).toEqual({ grain: 1_800 });
    expect(result.unsold).toEqual({ coins: 30 });
    expect(result).not.toHaveProperty('level');
    expect(s.coins).toBe(20);
  });

  it('výsledek s měšcem bez lidí nese výpravu (`origin`) – mince zaniklé vsi se zapíší i se jménem', () => {
    const s = grainVillage(6_000);
    joinMarket(s, D, coinTrip(50, { grain: 1_800 }, { stayDays: 1, firstStep: 'W' }));
    marketDay(s, D);
    expect(resultOf(s, 'market:h:1')).toMatchObject({
      unsold: { coins: 30 },
      origin: { villageId: 'h', villageName: 'Vlkov', direction: 'E' },
    });
  });

  it('druhý den pobytu utratí výprava zbytek – za cenu i hladinu po prvním dni', () => {
    const s = grainVillage(1_800);
    joinMarket(s, D, coinTrip(50, { grain: 5_400 }, { stayDays: 2 }));
    marketDay(s, D);
    expect(s.coins).toBe(20);
    expect(visitorOf(s, 'market:h:1').goods).toEqual({ coins: 30 });
    expect(visitorOf(s, 'market:h:1').wants.grain).toBeCloseTo(3_600, 6);
    // cena: shání se 5 400 a nabízí 1 800 → × 1,05; hladina: C = 50, W = 20 → × (1 + 0,1 × 30 ÷ 70)
    const price = coinPriceOf(s.market!.prices, s.market!.level!, 'grain');
    expect(s.market!.prices.grain).toBeCloseTo(1.05 / 90, 12);
    expect(s.market!.level).toBeCloseTo(1 + 3 / 70, 12);

    s.storesKg += 10_000;
    const stores = s.storesKg;
    const level = s.market!.level!;
    const chronicle = marketDay(s, D + 1);
    const kg = 30 / price;
    // 30 ÷ (1,05 ÷ 90 × 1,042857) = 2 465,75 kg
    expect(kg).toBeCloseTo(2_465.753425, 4);
    expect(stores - s.storesKg).toBeCloseTo(kg, 6);
    expect(s.coins).toBe(50);
    expect(chronicle).toEqual([
      {
        day: D + 1,
        kind: 'market-held',
        sold: { grain: expect.closeTo(kg, 6) },
        bought: { coins: 30 },
      },
    ]);
    const result = resultOf(s, 'market:h:1');
    expect(result.unsold).toEqual({});
    expect(result.bought.grain).toBeCloseTo(1_800 + kg, 6);
    // C = 30, W = 3 600 kg × cena → hladina klesla a výsledek ji nese vedle cen
    const sought = 3_600 * price;
    expect(s.market!.level).toBeCloseTo(level * (1 + (0.1 * (30 - sought)) / (30 + sought)), 12);
    expect(result.level).toBe(s.market!.level);
    expect(result.prices).toEqual(s.market!.prices);
    expect(allCoins(s)).toBe(50);
  });

  it('cena je cena × hladina: s hladinou 2 platí výprava za 1 800 kg 40 mincí', () => {
    const s = grainVillage(6_000);
    s.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], level: 2 };
    joinMarket(s, D, coinTrip(50, { grain: 1_800 }, { stayDays: 2 }));
    marketDay(s, D);
    expect(s.coins).toBe(40);
    expect(visitorOf(s, 'market:h:1').goods).toEqual({ coins: 10 });
    // C = W = 40 – hladina zůstala
    expect(s.market.level).toBe(2);
  });

  it('hladina, která klesla na 1, ze stavu zmizí', () => {
    const s = grainVillage(6_000);
    s.market = { prices: {}, visitors: [], nextOrder: 1, arrivals: [], level: 1.01 };
    // C = 5 mincí, W = 5 400 kg × 1,01 ÷ 90 = 60,6 → hladina by klesla pod 1
    joinMarket(s, D, coinTrip(5, { grain: 5_400 }));
    marketDay(s, D);
    expect(s.coins).toBe(5);
    expect(s.market).not.toHaveProperty('level');
    expect(resultOf(s, 'market:h:1')).not.toHaveProperty('level');
  });

  it('zápočet jde první a mincemi se platí jen to, co nechal – zápočet mince nevidí', () => {
    const m = marketVillage();
    const s = structuredClone(m);
    // 600 kg obilí za krávu zápočtem, druhou krávu za 7 mincí (6,67 nahoru)
    joinMarket(s, D, arrival({ goods: { grain: 600, coins: 50 }, wants: { cows: 2 } }));
    const chronicle = marketDay(s, D);
    expect(s.storesKg - m.storesKg).toBeCloseTo(600, 6);
    expect(s.livestock!.herds.cow - m.livestock!.herds.cow).toBe(-2);
    expect(s.coins).toBe(7);
    const result = resultOf(s, 'market:h:1');
    expect(result.bought).toEqual({ cows: 2 });
    expect(result.sold.grain).toBeCloseTo(600, 6);
    // zaplacené mince nejsou v prodeji výpravy – ubyly z nákladu
    expect(result.sold).not.toHaveProperty('coins');
    expect(result.unsold).toEqual({ coins: 43 });
    expect(chronicle).toEqual([
      {
        day: D,
        kind: 'market-held',
        sold: { cows: 2 },
        bought: { grain: expect.closeTo(600, 6), coins: 7 },
      },
    ]);
    // cena krav a obilí z nabídek a seznamů dne jako bez mincí
    const barter = structuredClone(m);
    joinMarket(barter, D, arrival({ goods: { grain: 600 }, wants: { cows: 2 } }));
    marketDay(barter, D);
    expect(s.market!.prices).toEqual(barter.market!.prices);
  });

  it('za mince prodá hostitel jen to, co mu po obou zápočtech z nabídky zbylo', () => {
    // krávy: nabízí 5, jednu prodá zápočtem, čtyři za 26,67 → 27 mincí
    const cows = marketVillage();
    expect(marketStance(cows, D).offer.cows).toBe(5);
    joinMarket(cows, D, arrival({ key: 'market:a:1' }));
    joinMarket(cows, D, coinTrip(500, { cows: 9 }, { key: 'market:b:1' }));
    marketDay(cows, D);
    expect(resultOf(cows, 'market:a:1').bought).toEqual({ cows: 1 });
    expect(resultOf(cows, 'market:b:1')).toMatchObject({
      bought: { cows: 4 },
      unsold: { coins: 473 },
    });
    expect(cows.livestock!.herds.cow).toBe(3);
    expect(cows.coins).toBe(27);

    // nástroje: 30 kg nad potřebu, 10 kg koupí obilím zápočet řemeslníků, 20 kg je za 13,33 – za celé
    // mince dolů 13 mincí = 19,5 kg (gold.md – Mince 2,4 g, bod 9)
    const tools = marketVillage();
    withWorkshop(tools, 'smith', 700, { oreKg: 500 });
    tools.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    tools.toolEquipmentKg = toolNeedKg(tools, D) + 30;
    expect(marketStance(tools, D).offer.tools).toBeCloseTo(30, 6);
    joinMarket(tools, D, arrival({ key: 'market:a:1', wants: { tools: 10 } }));
    joinMarket(tools, D, coinTrip(500, { tools: 100 }, { key: 'market:b:1' }));
    marketDay(tools, D);
    expect(resultOf(tools, 'market:a:1').sold.grain).toBeCloseTo(600, 6);
    expect(resultOf(tools, 'market:b:1').bought.tools).toBeCloseTo(19.5, 6);
    expect(resultOf(tools, 'market:b:1').unsold).toEqual({ coins: 487 });
    expect(tools.coins).toBe(13);
  });

  it('zápočet mince nevidí, ani když je výprava má na seznamu', () => {
    const s = homeVillage();
    // 180 kožešin po 4/45 mince = 16 mincí
    const buyer = coinTrip(50, { furs: 180 }, { key: 'market:a:1', stayDays: 2 });
    const seller = arrival({
      key: 'market:b:1',
      goods: { furs: 180 },
      wants: { coins: 10 },
      stayDays: 2,
    });
    joinMarket(s, D, buyer);
    joinMarket(s, D, seller);
    marketDay(s, D);
    expect(visitorOf(s, 'market:a:1')).toMatchObject({ sold: {}, bought: { furs: 180 } });
    expect(visitorOf(s, 'market:a:1').goods).toEqual({ coins: 34 });
    expect(visitorOf(s, 'market:b:1')).toMatchObject({ sold: { furs: 180 }, bought: {} });
    expect(visitorOf(s, 'market:b:1').goods).toEqual({ coins: 16 });
    expect(s.market!.prices).not.toHaveProperty('coins');
  });

  it('hostitel za mince nekupuje: shání krávu, má 500 mincí, a výprava odjede s krávou', () => {
    const m = homeVillage();
    m.coins = 500;
    expect(marketStance(m, D).wants.cows).toBe(4);
    const cow = arrival({ key: 'market:a:1', goods: { cows: 1 }, wants: {} });

    // výprava bez mincí – fáze se nespustí, i když mince má ves
    const alone = structuredClone(m);
    joinMarket(alone, D, cow);
    expect(marketDay(alone, D)).toEqual([]);
    expect(alone.coins).toBe(500);
    expect(alone.market).not.toHaveProperty('level');
    expect(resultOf(alone, 'market:a:1')).toMatchObject({ sold: {}, unsold: { cows: 1 } });
    expect(alone.livestock?.herds.cow ?? 0).toBe(m.livestock?.herds.cow ?? 0);

    // i když se fáze spustí (jiná výprava má mince a něco shání), hostitel krávu nekoupí
    const s = structuredClone(m);
    joinMarket(s, D, cow);
    joinMarket(s, D, coinTrip(60, { honey: 10 }, { key: 'market:b:1', fromVillageId: 'b' }));
    expect(marketDay(s, D)).toEqual([]);
    expect(s.coins).toBe(500);
    expect(resultOf(s, 'market:a:1')).toMatchObject({ sold: {}, unsold: { cows: 1 } });
    expect(resultOf(s, 'market:b:1')).toMatchObject({ bought: {}, unsold: { coins: 60 } });
    expect(s.market).not.toHaveProperty('level');
  });

  it('výprava koupí za mince i od jiné výpravy, hostitel z toho nic nemá', () => {
    const s = homeVillage();
    joinMarket(
      s,
      D,
      arrival({
        key: 'market:a:1',
        fromVillageId: 'a',
        goods: { furs: 180 },
        wants: {},
        stayDays: 2,
      }),
    );
    joinMarket(s, D, coinTrip(20, { furs: 360 }, { key: 'market:b:1', stayDays: 2 }));
    expect(marketDay(s, D)).toEqual([]);
    expect(visitorOf(s, 'market:a:1')).toMatchObject({ goods: { coins: 16 }, sold: { furs: 180 } });
    expect(visitorOf(s, 'market:a:1').goods).not.toHaveProperty('furs');
    // utržené mince jdou domů v nákladu, ne podruhé jako koupené
    expect(visitorOf(s, 'market:a:1').bought).toEqual({});
    expect(visitorOf(s, 'market:b:1')).toMatchObject({
      goods: { coins: 4 },
      bought: { furs: 180 },
    });
    expect(s).not.toHaveProperty('coins');
    expect(allCoins(s)).toBe(20);
    marketDay(s, D + 1);
    expect(resultOf(s, 'market:a:1').unsold).toEqual({ coins: 16 });
    expect(allCoins(s)).toBe(20);
  });

  it('cizí kupec (`merchant`) kupuje první, i když přijel později', () => {
    const s = grainVillage(1_800);
    joinMarket(s, D, coinTrip(50, { grain: 1_800 }, { key: 'market:a:1', stayDays: 2 }));
    joinMarket(s, D, coinTrip(15, { grain: 1_350 }, { key: 'market:k:1', stayDays: 2 }));
    // kupec platí z měšce bez dna (markets.md – Měšec kupců bez dna) – mince nedrží, shání 1 350 kg
    const merchant = visitorOf(s, 'market:k:1');
    merchant.merchant = true;
    delete merchant.goods.coins;
    marketDay(s, D);
    expect(visitorOf(s, 'market:k:1').bought.grain).toBeCloseTo(1_350, 6);
    expect(visitorOf(s, 'market:k:1').goods).toEqual({});
    expect(visitorOf(s, 'market:a:1').bought.grain).toBeCloseTo(450, 6);
    expect(visitorOf(s, 'market:a:1').goods).toEqual({ coins: 45 });
    expect(s.coins).toBe(20);
    // 15 mincí za obilí kupce vzniklo
    expect(allCoins(s)).toBe(65);
  });

  it('kovář souseda ani doprovod partnera do mincovní fáze nevstupují', () => {
    const s = grainVillage(1_000);
    joinMarket(s, D, coinTrip(50, { grain: 300 }, { service: { kind: 'shoeing', horses: 0 } }));
    joinMarket(s, D, coinTrip(40, { grain: 300 }, { key: 'market:kin:1' }));
    visitorOf(s, 'market:kin:1').kin = { seekerId: 10 };
    // výprava bez mincí – tržní den je, ale mince má jen kovář a doprovod
    joinMarket(s, D, arrival({ key: 'market:a:1', goods: { honey: 5 }, wants: { grain: 30 } }));
    expect(marketDay(s, D)).toEqual([]);
    expect(s).not.toHaveProperty('coins');
    expect(s.market).not.toHaveProperty('level');
    expect(resultOf(s, 'market:h:1')).toMatchObject({ bought: {}, unsold: { coins: 50 } });
    expect(resultOf(s, 'market:kin:1')).toMatchObject({ bought: {}, unsold: { coins: 40 } });
  });

  it('výprava bez mincí: hladina ani mince vsi nevzniknou, obchody a kronika jako dřív', () => {
    const m = marketVillage();
    const after = advanceVillage(m, D, null, null, [arriveEvent(arrival())]);
    expect(JSON.stringify(after)).not.toContain('"level"');
    expect(JSON.stringify(after)).not.toContain('"coins"');
    expect(after.chronicle.find((e) => e.kind === 'market-held')).toEqual({
      day: D,
      kind: 'market-held',
      sold: { cows: 1 },
      bought: { grain: expect.closeTo(600, 6) },
    });
  });

  it('kupec s 60 mincemi 100 tržních dní na trhu, kde nikdo nic z jeho seznamu nenabízí: hladina chybí', () => {
    const s = marketVillage();
    joinMarket(s, D, coinTrip(60, { furs: 60, wax: 24 }, { stayDays: 200 }));
    visitorOf(s, 'market:h:1').merchant = true;
    for (let i = 0; i < 100; i++) {
      expect(marketDay(s, D + i)).toEqual([]);
      expect(s.market).not.toHaveProperty('level');
    }
    expect(visitorOf(s, 'market:h:1').goods).toEqual({ coins: 60 });
    expect(s).not.toHaveProperty('coins');
  });

  it('kousky dopočtu: výprava s mincemi do D + 3 vcelku = po dnech', () => {
    const m = grainVillage(1_800);
    const events = [
      arriveEvent(coinTrip(50, { grain: 5_400 }, { key: 'market:a:1', stayDays: 3 }), D, 1),
      arriveEvent(
        arrival({ key: 'market:b:1', goods: { furs: 180 }, wants: { grain: 300 }, stayDays: 2 }),
        D + 1,
        2,
      ),
      arriveEvent(coinTrip(20, { furs: 360 }, { key: 'market:c:1' }), D + 1, 3),
    ];
    const whole = advanceVillage(m, D + 3, null, null, events);
    let pieces = m;
    for (let day = D; day <= D + 3; day++) pieces = advanceVillage(pieces, day, null, null, events);
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
    expect(whole.coins).toBeGreaterThanOrEqual(20);
    expect(allCoins(whole)).toBe(70);
  });
});

describe('mincovní fáze – kusy se záznamem (koně, vozy a lidé)', () => {
  it('klisna za 18 mincí (17,78 nahoru) – tatáž, kterou by hostitel prodal první', () => {
    const mares = [5, 6, 10, 12].map((years, i) => horse(i + 1, years, 'female', 0, D));
    const h = horseVillage([...mares, horse(9, 9, 'male', 50, D)]);
    h.lastDay = D - 1;
    expect(marketStance(h, D).offer.mares).toBe(2);
    const s = structuredClone(h);
    joinMarket(s, D, coinTrip(110, { mares: 1 }));
    const chronicle = marketDay(s, D);
    const oldest = mares[3]!;
    const result = resultOf(s, 'market:h:1');
    expect(result.bought).toEqual({ mares: 1 });
    expect(result.unsold).toEqual({ coins: 92 });
    expect(result.horses).toEqual([
      { good: 'mares', horse: { bornDay: oldest.bornDay, sex: 'female', training: 0 } },
    ]);
    expect(villageHorses(s).map((x) => x.id)).toEqual([1, 2, 3, 9]);
    expect(s.coins).toBe(18);
    expect(chronicle).toEqual([
      { day: D, kind: 'market-held', sold: { mares: 1 }, bought: { coins: 18 } },
    ]);
  });

  it('dvoukolák za 4 mince (3,56 nahoru) – se stářím hostitele', () => {
    const s = withSpareLabor(homeVillage());
    s.carts = [{ id: 1, kind: 'two-wheel', builtDay: D - 500 }];
    expect(marketStance(s, D).offer.twoWheelCarts).toBe(1);
    joinMarket(s, D, coinTrip(4, { twoWheelCarts: 1 }));
    marketDay(s, D);
    const result = resultOf(s, 'market:h:1');
    expect(result.bought).toEqual({ twoWheelCarts: 1 });
    expect(result.unsold).toEqual({});
    expect(result.carts).toEqual([{ good: 'twoWheelCarts', builtDay: D - 500 }]);
    expect(s.carts ?? []).toEqual([]);
    expect(s.coins).toBe(4);
  });

  it('muž za 4 mince – týž člověk, kterého hostitel vybere (`fromHost`)', () => {
    const h = withSpareLabor(homeVillage());
    expect(marketStance(h, D).offer.men).toBe(2);
    const man = structuredClone(leavingGroups(h, D, { men: 1 }).men[0]!.people);
    const s = structuredClone(h);
    joinMarket(s, D, coinTrip(10, { men: 1 }, { stayDays: 2, firstStep: 'E' }));
    marketDay(s, D);
    const trip = visitorOf(s, 'market:h:1');
    expect(trip.bought).toEqual({ men: 1 });
    expect(trip.goods).toEqual({ coins: 6 });
    expect(trip.boughtPeople).toEqual([{ good: 'men', people: man, fromHost: true }]);
    expect(s.people.map((p) => p.id)).toEqual(
      h.people.map((p) => p.id).filter((id) => id !== man[0]!.id),
    );
    expect(s.coins).toBe(4);
  });

  it('lidé ve dvou fázích dne: muž zápočtem a muž za mince jsou dva různí lidé', () => {
    const h = withSpareLabor(homeVillage());
    h.storesKg = 1_000;
    expect(marketStance(h, D).offer.men).toBe(2);
    const s = structuredClone(h);
    const barter = arrival({ key: 'market:a:1', goods: { grain: 400 }, wants: { men: 1 } });
    joinMarket(s, D, { ...barter, stayDays: 2 });
    joinMarket(s, D, coinTrip(4, { men: 1 }, { key: 'market:b:1', stayDays: 2 }));
    const chronicle = marketDay(s, D);
    const a = visitorOf(s, 'market:a:1');
    const b = visitorOf(s, 'market:b:1');
    expect(a.sold.grain).toBeCloseTo(360, 6);
    expect(a.goods).not.toHaveProperty('coins');
    expect(b.goods).toEqual({});
    const left = [a, b].map((v) => v.boughtPeople!.map((g) => g.people.map((p) => p.id)));
    expect(left).toEqual([[[22]], [[20]]]);
    expect(s.people.some((p) => p.id === 20 || p.id === 22)).toBe(false);
    expect(s.people).toHaveLength(h.people.length - 2);
    expect(s.coins).toBe(4);
    expect(chronicle).toEqual([
      {
        day: D,
        kind: 'market-held',
        sold: { men: 2 },
        bought: { grain: expect.closeTo(360, 6), coins: 4 },
      },
    ]);
  });

  it('po zápočtu už rodina odejít nemůže: druhá výprava nic nekoupí a nezaplatí', () => {
    // dům 500 drží starší pár (50 a 48 let) jen s mužem 69 – rodina 62–65 z něj smí odejít, dokud
    // v něm 69 je; hostitel nabízí rodinu a muže 68 z domu syna, zápočtem ale odejde muž 69
    const h = withSpareLabor(familyHome());
    const years = (age: number): number => D - Math.ceil((age + 0.5) * 365.25);
    h.people.find((p) => p.id === 60)!.bornDay = years(50);
    h.people.find((p) => p.id === 61)!.bornDay = years(48);
    h.people.push(
      { id: 68, bornDay: years(22), dwellingId: SON_HOUSE, sex: 'male' },
      { id: 69, bornDay: years(20), dwellingId: FAMILY_HOUSE, sex: 'male' },
    );
    expect(marketStance(h, D).offer).toMatchObject({ families: 1, men: 1 });

    // bez první výpravy rodinu za 8 mincí koupí
    const alone = structuredClone(h);
    joinMarket(alone, D, coinTrip(60, { families: 1 }));
    marketDay(alone, D);
    expect(alone.coins).toBe(8);
    expect(resultOf(alone, 'market:h:1').newcomers!.map((g) => g.people.map((p) => p.id))).toEqual([
      [62, 63, 64, 65],
    ]);

    const s = structuredClone(h);
    joinMarket(s, D, arrival({ key: 'market:a:1', goods: { grain: 400 }, wants: { men: 1 } }));
    joinMarket(s, D, coinTrip(60, { families: 1 }, { key: 'market:b:1' }));
    marketDay(s, D);
    expect(resultOf(s, 'market:a:1').newcomers!.map((g) => g.people.map((p) => p.id))).toEqual([
      [69],
    ]);
    const b = resultOf(s, 'market:b:1');
    expect(b.bought).toEqual({});
    expect(b.unsold).toEqual({ coins: 60 });
    expect(b.newcomers).toBeUndefined();
    expect(s).not.toHaveProperty('coins');
    expect(s.people.some((p) => p.id === 62)).toBe(true);
  });

  it('klisna od jiné výpravy za mince: týž kus se záznamem', () => {
    const mare: MarketHorse = {
      good: 'mares',
      horse: { bornDay: D - 5 * 365, sex: 'female', training: 30 },
    };
    const s = homeVillage();
    joinMarket(
      s,
      D,
      arrival({ key: 'market:a:1', goods: { mares: 1 }, horses: [mare], wants: {} }),
    );
    joinMarket(s, D, coinTrip(20, { mares: 1 }, { key: 'market:b:1' }));
    marketDay(s, D);
    // klisna za 17,78 → 18 mincí jde od výpravy A k výpravě B
    expect(resultOf(s, 'market:b:1')).toMatchObject({ bought: { mares: 1 }, horses: [mare] });
    expect(resultOf(s, 'market:a:1')).toMatchObject({ unsold: { coins: 18 }, horses: [] });
    expect(villageHorses(s)).toEqual([]);
  });
});

describe('hladina trhu ve výsledku a ve zprávě (markets.md – Rozhodnutí plánu 4, bod 3)', () => {
  it('výsledek nese hladinu jen ≠ 1 a domovská ves si ji zapamatuje s cenami', () => {
    const h = homeVillage();
    h.coins = 10;
    const order = { give: { coins: 10 }, wants: { grain: 900 }, stayDays: 1 };
    const sent = departMarket(h, D, order, target);
    if (!sent.ok) throw new Error(sent.reason);
    expect(sent.state).not.toHaveProperty('coins');
    const body = sent.state.outbox![0]!.body;
    if (body.kind !== 'market-arrive') throw new Error('Příjezd chybí.');

    const m = grainVillage(300);
    joinMarket(m, D + 1, body.arrival);
    marketDay(m, D + 1);
    const result = resultOf(m, sent.trip.key);
    // 300 kg za 3,33 – za celé mince dolů 3 mince = 270 kg; C = 10, W = 300 ÷ 90 = 3,33 (ze začátku
    // fáze) → hladina × (1 + 0,1 × 6,67 ÷ 13,33)
    expect(m.coins).toBe(3);
    expect(result.unsold).toEqual({ coins: 7 });
    expect(result.level).toBeCloseTo(1.05, 6);
    expect(result.level).toBe(m.market!.level);

    const home = structuredClone(sent.state);
    applyMarketResult(home, D + 2, result);
    expect(home.coins).toBe(7);
    expect(home.news).toEqual([
      {
        villageId: 'm',
        name: 'Lhota',
        report: result.report,
        prices: m.market!.prices,
        coinKg: MARKET.grainKgPerCoin,
        level: result.level,
      },
    ]);

    // hladina 1 se nezapisuje – starší zprávy bez ní jsou 1
    const plain: MarketResult = structuredClone(result);
    delete plain.level;
    const other = structuredClone(sent.state);
    applyMarketResult(other, D + 2, plain);
    expect(other.news![0]).not.toHaveProperty('level');
    expect(other.news![0]!.prices).toEqual(m.market!.prices);
  });
});

// Výprava hráče s mincemi tam a zpět (markets.md – Rozhodnutí plánu 4, bod 4; Martin 25. 11. 2026:
// „Mince utrácí jen vojvoda/správce“): mince ubydou vsi při odjezdu, za nákup se platí jen z nákladu
// výpravy a co neutratí, vrátí se domů.
describe('výprava hráče s mincemi – cesta tam a zpět (Rozhodnutí plánu 4, bod 4)', () => {
  /** Vlkov s `coins` mincemi pošle výpravu do Lhoty na sousední mapě – odešle ji D, trh je D + 1. */
  function sendTrip(
    coins: number,
    order: MarketOrder,
  ): { sent: VillageState; arriving: MarketArrival } {
    const h = homeVillage();
    h.coins = coins;
    const trip = departMarket(h, D, order, target);
    if (!trip.ok) throw new Error(trip.reason);
    const body = trip.state.outbox![0]!.body;
    if (body.kind !== 'market-arrive') throw new Error('Příjezd chybí.');
    return { sent: trip.state, arriving: body.arrival };
  }

  /** Tržní den Lhoty `m` s výpravou (mutuje ji) a návrat: výsledek trhu a Vlkov D + 2. */
  function tradeAndReturn(
    sent: VillageState,
    arriving: MarketArrival,
    m: VillageState,
  ): { result: MarketResult; home: VillageState } {
    joinMarket(m, D + 1, arriving);
    marketDay(m, D + 1);
    const result = resultOf(m, arriving.key);
    const home = structuredClone(sent);
    const events = applyMarketResult(home, D + 2, result);
    expect(events.map((e) => e.kind)).toEqual(['market-returned']);
    expect(home.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    return { result, home };
  }

  it('400 mincí, seznam 810 kg obilí: koupí právě 810 kg za 9 mincí, 391 přijde domů', () => {
    const order: MarketOrder = { give: { coins: 400 }, wants: { grain: 810 }, stayDays: 1 };
    const { sent, arriving } = sendTrip(400, order);
    // při odjezdu mince ubyly vsi a jsou jen v nákladu
    expect(sent).not.toHaveProperty('coins');
    expect(arriving.goods).toEqual({ coins: 400 });
    expect(arriving.wants).toEqual({ grain: 810 });

    const m = grainVillage(6_000);
    expect(marketStance(m, D + 1).offer.grain).toBe(6_000);
    const hostStores = m.storesKg;
    const { result, home } = tradeAndReturn(sent, arriving, m);
    // přebytku je 6 000 kg a mincí na 36 000 kg – koupí se jen seznam; 810 ÷ 90 = 9 mincí (seznam
    // 800 kg = 8,89 by za celé mince dolů vzal 720 kg za 8 – gold.md, Mince 2,4 g, bod 9)
    expect(hostStores - m.storesKg).toBeCloseTo(810, 9);
    expect(m.coins).toBe(9);
    expect(result).toMatchObject({ sold: {}, bought: { grain: 810 }, unsold: { coins: 391 } });
    expect(home.coins).toBe(391);
    expect(home.storesKg - sent.storesKg).toBeCloseTo(810, 9);
  });

  it('za výpravu se neplatí podruhé ze zásoby vsi: 5 mincí koupí 450 kg, doma zůstane 495', () => {
    const order: MarketOrder = { give: { coins: 5 }, wants: { grain: 800 }, stayDays: 1 };
    const { sent, arriving } = sendTrip(500, order);
    expect(sent.coins).toBe(495);
    const m = grainVillage(6_000);
    const { result, home } = tradeAndReturn(sent, arriving, m);
    expect(m.coins).toBe(5);
    expect(result.bought.grain).toBeCloseTo(450, 9);
    expect(result.unsold).toEqual({});
    expect(home.coins).toBe(495);
    expect(home.storesKg - sent.storesKg).toBeCloseTo(450, 9);
  });

  it('zboží i mince v nákladu: zápočet napřed, co nekoupil, koupí mince a zbytek jde domů', () => {
    // 300 kg obilí je za půl krávy – kráva je celá, takže ji koupí až mince (7 za 6,67) a obilí se vrátí
    const order: MarketOrder = { give: { grain: 300, coins: 60 }, wants: { cows: 1 }, stayDays: 1 };
    const { sent, arriving } = sendTrip(60, order);
    expect(sent).not.toHaveProperty('coins');
    const m = marketVillage();
    const herd = m.livestock!.herds.cow;
    const { result, home } = tradeAndReturn(sent, arriving, m);
    expect(m.livestock!.herds.cow - herd).toBe(-1);
    expect(m.coins).toBe(7);
    expect(result).toMatchObject({ sold: {}, bought: { cows: 1 } });
    expect(result.unsold).toEqual({ grain: 300, coins: 53 });
    expect(home.coins).toBe(53);
    expect(home.storesKg - sent.storesKg).toBeCloseTo(300, 9);
    expect((home.livestock?.herds.cow ?? 0) - (sent.livestock?.herds.cow ?? 0)).toBe(1);
  });

  it('hostitel nemá nic ze seznamu: domů se vrátí všechny mince', () => {
    const order: MarketOrder = {
      give: { coins: 400 },
      wants: { swords: 1, honey: 50 },
      stayDays: 1,
    };
    const { sent, arriving } = sendTrip(400, order);
    const m = grainVillage(1_000);
    const { result, home } = tradeAndReturn(sent, arriving, m);
    expect(m).not.toHaveProperty('coins');
    expect(result).toMatchObject({ sold: {}, bought: {}, unsold: { coins: 400 } });
    expect(home.coins).toBe(400);
    expect(home.storesKg).toBe(sent.storesKg);
  });

  it('kousky dopočtu: obě vsi po dnech = vcelku a mincí je v součtu pořád 400', () => {
    const order: MarketOrder = { give: { coins: 400 }, wants: { grain: 810 }, stayDays: 2 };
    const { sent } = sendTrip(400, order);
    // uložení do DB a načtení mezi kousky
    const stored = (s: VillageState): VillageState => JSON.parse(JSON.stringify(s)) as VillageState;
    const byDays = (start: VillageState, to: number, events: VillageEvent[]): VillageState => {
      let s = start;
      for (let day = start.lastDay + 1; day <= to; day++) {
        s = stored(advanceVillage(s, day, null, null, events));
      }
      return s;
    };
    const there = asEvents(sent.outbox!);
    const m = grainVillage(6_000);
    const host = advanceVillage(m, D + 4, null, null, there);
    expect(byDays(m, D + 4, there)).toEqual(stored(host));
    expect(host.coins).toBe(9);

    const back = asEvents(host.outbox!);
    expect(back.map((e) => e.day)).toEqual([D + 3]);
    const start = withoutOutbox(sent);
    const home = advanceVillage(start, D + 4, null, null, back);
    expect(byDays(start, D + 4, back)).toEqual(stored(home));
    expect(home.coins).toBe(391);
    expect(home.chronicle.find((e) => e.kind === 'market-returned')).toMatchObject({
      bought: { grain: 810 },
    });
  });
});
