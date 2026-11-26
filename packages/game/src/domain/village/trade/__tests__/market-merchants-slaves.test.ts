import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { abandonForLineEnd } from '../../people/departure';
import { MERCHANTS } from '../../rules';
import type {
  ChronicleEvent,
  MarketArrival,
  MarketPerson,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  Person,
  TradeGoods,
  VillageState,
} from '../../types';
import { joinMarket, marketDay, marketResult, marketResultRef } from '../market';
import { marketStance } from '../market-stance';
import { departMarket } from '../market-trip';
import { nextMerchantVisit } from '../merchant-plan';
import { merchantsArrive } from '../merchants';
import {
  D,
  asEvents,
  marketVillage,
  report,
  slaveHome,
  target,
  withoutOutbox,
} from './market-fixtures';

// Cizí kupci kupují otroky (markets.md – Rozhodnutí plánu 5, bod 7): seznam kupce má i otroky,
// kupují je z měšce i zápočtem (zbroj za otroky), v mincovní fázi od prodávajících v pořadí stran
// a u každého v pořadí `TRADE_GOODS`; koupení otroci odjedou s kupci ze světa. V den, kdy na trhu
// nikdo otroky nenabízí, je trh bit po bitu jako po plánu 4. Trh bez cen, hladina 1.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** První příjezd kupců po D. */
const DAY = nextMerchantVisit([STOP], D)!.day;

/** Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců – nic nenabízí (vzor `host` plánu 4). */
function host(): VillageState {
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.storesKg = 0;
  s.storesKg = marketStance(s, DAY).wants.grain!;
  s.merchantStops = [structuredClone(STOP)];
  return s;
}

/**
 * Vlkov (A, `slaveHome`) den před příjezdem kupců se třemi otroky na prodej: otrokyně 10 (25),
 * otrok 12 (28 – doma, ne na práci) a otrok 14 (3 roky).
 */
function slavesHome(): VillageState {
  const a = slaveHome();
  delete a.people.find((p) => p.id === 12)!.away;
  a.lastDay = DAY - 1;
  return a;
}

/** Otrok-pohan `id` jako skupina zboží `slaves` – každý se prodává sám. */
function slave(id: number): MarketPerson {
  return {
    good: 'slaves',
    people: [{ id, bornDay: D - 9_000 - id, dwellingId: 500, sex: 'male', slave: true }],
  };
}

/** Výprava z vsi `key` s nákladem `goods`, otroky `slaves` (id) a seznamem `wants`. */
function trip(
  key: string,
  goods: TradeGoods,
  wants: TradeGoods,
  slaves: readonly number[] = [],
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
    ...(slaves.length > 0 ? { people: slaves.map(slave) } : {}),
    ...fields,
  };
}

/** Příjezd výpravy jako událost schránky vsi M v den `day`. */
function arriveEvent(arrival: MarketArrival, day: number, seq: number): VillageEvent {
  return { id: arrival.key, seq, villageId: 'm', day, body: { kind: 'market-arrive', arrival } };
}

/** Výprava A se třemi otroky, která v den kupců stojí `stayDays` dní na trhu M. */
function slaveTrip(stayDays: number): { home: VillageState; key: string; arrive: VillageEvent[] } {
  const sent = departMarket(
    slavesHome(),
    DAY - 1,
    { give: { slaves: 3 }, wants: {}, stayDays },
    target,
  );
  if (!sent.ok) throw new Error(sent.reason);
  const arrive = asEvents(sent.state.outbox ?? []);
  expect(arrive.map((e) => e.day)).toEqual([DAY]);
  return { home: withoutOutbox(sent.state), key: sent.trip.key, arrive };
}

/** Jediný cizí kupec na trhu – odkaz platí i po odjezdu. */
function merchantOf(s: VillageState): MarketVisitor {
  const merchants = (s.market?.visitors ?? []).filter((v) => v.merchant);
  if (merchants.length !== 1) throw new Error('Na trhu není právě jeden kupec.');
  return merchants[0]!;
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  for (const mail of s.outbox ?? []) {
    if (mail.body.kind === 'market-result' && mail.body.result.key === key) return mail.body.result;
  }
  throw new Error(`Výsledek ${key} chybí.`);
}

/** Člověk `id` ve vsi. */
function person(s: VillageState, id: number): Person | undefined {
  return s.people.find((p) => p.id === id);
}

/** Záznamy rodokmenu (kinship.md – Příbuzenství) – vzpomínka vsi na odešlé a zemřelé, ne lidé. */
const KIN_RECORDS = new Set(['emigrants', 'ancestors']);

/**
 * Kde je člověk `p` ve stavech `states` – kdekoli (lidé vsí, náklad a koupení na trhu, odchozí
 * pošta; bez záznamů rodokmenu) podle `bornDay` a pohlaví: prodaný se u kupující vsi usadí s novým
 * id. Cesty nálezů.
 */
function traces(states: readonly VillageState[], p: Person): string[] {
  const found: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.bornDay === p.bornDay && record.sex === p.sex) found.push(path);
    for (const [key, item] of Object.entries(record)) {
      if (!KIN_RECORDS.has(key)) walk(item, `${path}.${key}`);
    }
  };
  states.forEach((state, i) => walk(state, `ves ${i}`));
  return found;
}

/** Prodaní otroci 10 a 12 nejsou doma (podle id) ani nikde jinde (podle `bornDay`). */
function goneFromWorld(home: VillageState, states: readonly VillageState[]): void {
  for (const sold of [10, 12].map((id) => person(slavesHome(), id)!)) {
    expect(person(home, sold.id), `id ${sold.id}`).toBeUndefined();
    expect(traces([home, ...states], sold), `id ${sold.id}`).toEqual([]);
  }
}

describe('cizí kupci kupují otroky (markets.md – Rozhodnutí plánu 5, bod 7)', () => {
  it('seznam kupce a zápis příjezdu mají otroky (MERCHANTS.wants)', () => {
    expect(MERCHANTS.wants).toEqual({ honey: 100, wax: 24, furs: 60, slaves: 10 });
    const s = host();
    const [arrived] = merchantsArrive(s, DAY);
    expect(arrived).toMatchObject({
      kind: 'merchants-arrived',
      buys: { honey: 100, wax: 24, furs: 60, slaves: 10 },
    });
    expect(merchantOf(s).wants).toEqual({ honey: 100, wax: 24, furs: 60, slaves: 10 });
  });

  it('výprava se 3 otroky: kupci koupí 2 za 48 mincí, třetí se vrátí domů s původním id', () => {
    const { home, key, arrive } = slaveTrip(1);
    const m = advanceVillage(host(), DAY, null, null, arrive);
    const result = resultOf(m, key);
    expect([result.sold, result.bought, result.unsold, result.coinsGot]).toEqual([
      { slaves: 2 },
      {},
      { slaves: 1, coins: 48 },
      48,
    ]);
    expect(result.people!.map((g) => [g.good, g.people.map((p) => p.id)])).toEqual([
      ['slaves', [14]],
    ]);
    // kupci odjeli – prodaní nejsou v žádné vsi, nákladu ani poště
    expect(m.market!.visitors).toEqual([]);
    goneFromWorld(home, [m]);
    // domů: třetí s původním id a 48 mincí
    const back = advanceVillage(home, DAY + 1, null, null, asEvents(m.outbox!));
    const third = person(slavesHome(), 14)!;
    expect(person(back, 14)).toMatchObject({ slave: true, bornDay: third.bornDay, sex: 'male' });
    expect(traces([back, withoutOutbox(m)], third)).toEqual([
      expect.stringMatching(/^ves 0\.people\[\d+\]$/),
    ]);
    expect(back.coins).toBe(48);
    goneFromWorld(back, [withoutOutbox(m)]);
  });

  it('zápočet: výprava s 5 otroky dostane meč (120 = 5 × 24), mince se nehnou', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', {}, { swords: 1 }, [21, 22, 23, 24, 25]));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    expect([result.sold, result.bought, result.unsold]).toEqual([{ slaves: 5 }, { swords: 1 }, {}]);
    expect(result).not.toHaveProperty('coinsGot');
    expect(result).not.toHaveProperty('coinsPaid');
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2, coins: 60 });
    expect(merchant.sold).toEqual({ swords: 1 });
    expect(merchant.bought).toEqual({ slaves: 5 });
    expect(merchant.boughtPeople!.flatMap((g) => g.people.map((p) => p.id))).toEqual([
      21, 22, 23, 24, 25,
    ]);
    expect(merchant.wants).toEqual({ honey: 100, wax: 24, furs: 60, slaves: 5 });
  });

  it('pořadí prodávajících: kupci kupují od výprav v pořadí příjezdu, u každé v pořadí zboží', () => {
    // E1 se 100 kg medu přijela první – med za 40 mincí, na otroky E2 zbude 20 < 24
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { honey: 100 }, {}));
    joinMarket(s, DAY, trip('market:b:1', {}, {}, [31, 32]));
    merchantsArrive(s, DAY);
    const first = merchantOf(s);
    marketDay(s, DAY);
    expect([resultOf(s, 'market:a:1').sold, resultOf(s, 'market:a:1').unsold]).toEqual([
      { honey: 100 },
      { coins: 40 },
    ]);
    expect([resultOf(s, 'market:b:1').sold, resultOf(s, 'market:b:1').unsold]).toEqual([
      {},
      { slaves: 2 },
    ]);
    expect([first.goods.coins, first.bought]).toEqual([20, { honey: 100 }]);
    // obráceně: E1 se 2 otroky – otroci za 48 mincí, za zbylých 12 30 kg medu E2
    const t = host();
    joinMarket(t, DAY, trip('market:a:1', {}, {}, [31, 32]));
    joinMarket(t, DAY, trip('market:b:1', { honey: 100 }, {}));
    merchantsArrive(t, DAY);
    const second = merchantOf(t);
    marketDay(t, DAY);
    expect([resultOf(t, 'market:a:1').sold, resultOf(t, 'market:a:1').unsold]).toEqual([
      { slaves: 2 },
      { coins: 48 },
    ]);
    expect(resultOf(t, 'market:b:1').sold).toEqual({ honey: expect.closeTo(30, 6) });
    expect(resultOf(t, 'market:b:1').unsold).toEqual({ honey: expect.closeTo(70, 6), coins: 12 });
    expect(second.goods).toEqual(MERCHANTS.goods); // měšec prázdný – mince z nákladu zmizely
    expect(second.boughtPeople!.flatMap((g) => g.people.map((p) => p.id))).toEqual([31, 32]);
  });

  it('ves T zanikne, když kupci drží dva koupené otroky: odjedou s nimi; třetí se vrátí poštou', () => {
    const { home, key, arrive } = slaveTrip(3);
    // rušný trh – tři výpravy na pivo: kupec zůstane do zítřka
    const beer = [1, 2, 3].map((i) =>
      arriveEvent(trip(`market:p${i}:1`, {}, {}), DAY, arrive.length + i),
    );
    const before = advanceVillage(host(), DAY, null, null, [...arrive, ...beer]);
    const merchant = merchantOf(before);
    expect(merchant.lastDay).toBe(DAY + 1);
    expect(merchant.boughtPeople!.map((g) => g.people.map((p) => p.id))).toEqual([[10], [12]]);
    expect(merchant.goods.coins).toBe(12);
    const gone = abandonForLineEnd(before, DAY);
    expect(gone.abandonedDay).toBe(DAY);
    // kupci odjeli i s otroky – nejsou v žádném stavu ani poště; výprava A stojí na trhu dál
    expect(gone.market!.visitors.map((v) => v.key)).toEqual([key]);
    goneFromWorld(home, [gone]);
    // zaniklý hostitel výpravu vrátí s tím, co drží (pošta – `overdueResult`, plán 3)
    const visitor = gone.market!.visitors[0]!;
    const returned: VillageEvent = {
      id: marketResultRef(key),
      seq: 1,
      villageId: 'h',
      day: DAY + 4,
      body: { kind: 'market-result', result: marketResult(visitor, { returned: true }) },
    };
    const back = advanceVillage(home, DAY + 4, null, null, [returned]);
    const third = person(slavesHome(), 14)!;
    expect(person(back, 14)).toMatchObject({ slave: true, bornDay: third.bornDay });
    expect(back.coins).toBe(48);
    goneFromWorld(back, [gone]);
    type Returned = Extract<ChronicleEvent, { kind: 'market-returned' }>;
    const chronicle = back.chronicle.find((e): e is Returned => e.kind === 'market-returned');
    expect(chronicle).toMatchObject({ sold: { slaves: 2 }, unsold: { slaves: 1 } });
  });
});

describe('den bez otroků: trh bit po bitu jako po plánu 4 (Rozhodnutí plánu 5, bod 7)', () => {
  /** Trhy dne kupců bez otroků – zápočet se zbrojí, nákupy kupce za mince, zbroj za mince. */
  const MARKETS: [string, MarketArrival[]][] = [
    [
      'zápočet za meč a helma za mince',
      [
        trip('market:a:1', { honey: 100, wax: 24, furs: 60 }, { swords: 1 }),
        trip('market:b:1', { coins: 300 }, { helmets: 1 }),
      ],
    ],
    [
      'kupec kupuje med a kožešiny za mince, výprava helmu',
      [
        trip('market:a:1', { honey: 50, furs: 20 }, {}),
        trip('market:b:1', { coins: 300 }, { helmets: 1 }),
      ],
    ],
    ['jen kupci', []],
  ];

  it.each(MARKETS)('%s: seznam s otroky nezmění ceny, hladinu ani obchody', (_, arrivals) => {
    const s = host();
    for (const arrival of arrivals) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    // kupec s velkým měšcem (po prodeji zbroje) – min(měšec, seznam) by otroci zvedli
    merchantOf(s).goods.coins = 200;
    const plan4 = structuredClone(s);
    delete merchantOf(plan4).wants.slaves;
    expect(merchantOf(s).wants.slaves).toBe(10);
    const [merchant, merchant4] = [merchantOf(s), merchantOf(plan4)];
    const [held, held4] = [marketDay(s, DAY), marketDay(plan4, DAY)];
    expect(held).toEqual(held4);
    expect(s.market!.prices).toEqual(plan4.market!.prices);
    expect(s.market!.level).toBe(plan4.market!.level);
    expect(s.outbox).toEqual(plan4.outbox);
    expect([merchant.sold, merchant.bought, merchant.goods]).toEqual([
      merchant4.sold,
      merchant4.bought,
      merchant4.goods,
    ]);
    expect(merchant.wants).toEqual({ ...merchant4.wants, slaves: 10 });
    expect([s.coins, s.storesKg]).toEqual([plan4.coins, plan4.storesKg]);
  });

  it('trhy srovnání obchodují a hýbou hladinou', () => {
    const levels = MARKETS.slice(0, 2).map(([, arrivals]) => {
      const s = host();
      for (const arrival of arrivals) joinMarket(s, DAY, arrival);
      merchantsArrive(s, DAY);
      merchantOf(s).goods.coins = 200;
      marketDay(s, DAY);
      expect(resultOf(s, 'market:b:1').bought).toEqual({ helmets: 1 });
      return s.market!.level;
    });
    // zápočet: C = W = 240 (helma) – hladina stojí; nákup kupce: C = 120 + 240 > W
    expect(levels[0]).toBeUndefined();
    expect(levels[1]).toBeGreaterThan(1);
  });
});
