import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { villageHorses } from '../../livestock/horses';
import { breedingCows, oxenCalvesWanted } from '../../livestock/husbandry';
import { MARKET } from '../../rules';
import type {
  MarketArrival,
  MarketHorse,
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
import { initialPrice } from '../market-prices';
import { marketStance } from '../market-stance';
import { D, marketVillage, report } from './market-fixtures';

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
    expect(after.market!.prices.cows!).toBe(40); // nabídka 5 > poptávka 1, ale dno je výchozí cena
    expect(after.market!.prices.grain!).toBeGreaterThan(1 / 15);
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
