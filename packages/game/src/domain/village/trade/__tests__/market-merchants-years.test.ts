import { describe, expect, it } from 'vitest';
import { InMemoryVillages } from '../../../../application/__tests__/in-memory-villages';
import { coinsOfWorld } from '../../../../application/__tests__/market-world';
import { dateOfDayIndex } from '../../../calendar';
import { trailStops } from '../../../world';
import { goldenWorld, YEAR } from '../../core/__tests__/village-golden-fixture';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { MERCHANTS } from '../../rules';
import type {
  ChronicleEvent,
  MarketOrder,
  MarketTarget,
  TradeGood,
  TradeGoods,
  VillageMail,
  VillageState,
} from '../../types';
import { ARMS_GOODS, COIN_GOOD, TRADE_GOODS, isPeopleGood } from '../goods';
import { coinPriceOf, initialPrice } from '../market-prices';
import { departMarket } from '../market-trip';
import { merchantVisits } from '../merchant-plan';
import { addGood, villageGoodStock } from '../trade';
import { villageReport } from '../village-report';

// Tři roky trhu s cizími kupci a mincemi (markets.md – Co se ověří, plán 4): ves T na kupecké
// stezce (zastávka kupců z kostry světa jako při načtení vsi – `trailStops`; obilí, med, vosk
// a kožešiny nad potřebou, objednaný meč) a ves S bez stezky s okolím, kde je T sousedem. Obě po
// dnech, pošta mezi nimi po každém dni jako události schránky (vzor market-neighbours-years). S třikrát
// do roka pošle výpravu hráče (`departMarket` s kontrolami `checkMarketTrip`) na den kupců v T
// s medem, voskem, kožešinami a mincemi pro meč. Pomalý test (`packages/game/slow-tests.ts`).
// Kupci mince nedrží (měšec bez dna – markets.md, Měšec kupců bez dna): mince světa se mění jen o to,
// co kupcům vsi a výpravy daly a co od nich dostaly (`market-held` hostitele, `coinsPaid`
// a `coinsGot` výprav na trhu a ve výsledku).

const DAYS = 3 * YEAR;
const REFRESH = 30;
const CHUNK = 90;
/** Políčko světa 1, kterým vede jedno spojení stezky (jako steward-son.test.ts) – jedna zastávka. */
const WORLD_SEED = 1;
const TRAIL_CELL = { x: 7, y: -1 };
/** Šum plovoucí čárky u zboží v kg. */
const EPS = 1e-6;
const TARGET: MarketTarget = {
  villageId: 't',
  name: 'Trhovka',
  cells: 1,
  firstStep: 'E',
  homeVillageId: 's',
  homeName: 'Studánka',
};

type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;

interface Side {
  id: 't' | 's';
  name: string;
  state: VillageState;
  pending: VillageEvent[];
  /** Události schránky vsi ve dni, kdy je ves použila – přehrají se v dopočtu po kouscích. */
  events: VillageEvent[];
}

/** Obchody výpravy na trhu T od příjezdu (na trhu i ve výsledku): zboží a mince. */
interface Trades {
  sold: TradeGoods;
  bought: TradeGoods;
  paid: number;
  got: number;
}

const NO_TRADES: Trades = { sold: {}, bought: {}, paid: 0, got: 0 };

function tradesOf(v: {
  sold: TradeGoods;
  bought: TradeGoods;
  coinsPaid?: number;
  coinsGot?: number;
}): Trades {
  return { sold: v.sold, bought: v.bought, paid: v.coinsPaid ?? 0, got: v.coinsGot ?? 0 };
}

/** Přičte zboží `goods` se znaménkem `sign` k toku `flow` (mutuje), `gross` – součet absolutních hodnot. */
function addFlow(flow: TradeGoods, gross: TradeGoods, goods: TradeGoods, sign: number): void {
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (amount === 0) continue;
    flow[good] = (flow[good] ?? 0) + sign * amount;
    gross[good] = (gross[good] ?? 0) + Math.abs(amount);
  }
}

/** Mince v měšcích kupců na trhu vsi. */
function merchantPurses(s: VillageState): { merchants: number; coins: number } {
  const merchants = (s.market?.visitors ?? []).filter((v) => v.merchant);
  return {
    merchants: merchants.length,
    coins: merchants.reduce((n, v) => n + (v.goods[COIN_GOOD] ?? 0), 0),
  };
}

function nonFinite(value: unknown, path = 'stav'): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const found = nonFinite(v, `${path}.${k}`);
      if (found) return found;
    }
  }
  return null;
}

/** Záporná zásoba vsi (zboží bez lidí) nebo náklad návštěvníka trhu; nic = null. */
function negativeStock(s: VillageState): string | null {
  for (const good of TRADE_GOODS) {
    if (isPeopleGood(good)) continue;
    const stock = villageGoodStock(s, good, s.lastDay);
    if (!(stock >= -EPS)) return `${good}: ${stock}`;
  }
  for (const v of s.market?.visitors ?? []) {
    for (const [good, n] of Object.entries(v.goods)) {
      if (!((n ?? 0) >= -EPS)) return `${v.key}.${good}: ${n}`;
    }
  }
  return null;
}

/** První rozdíl dvou stavů (po JSON) jako cesta a hodnoty; shoda = null. */
function firstDifference(a: unknown, b: unknown, path = 'stav'): string | null {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const found = firstDifference(left[key], right[key], `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

const json = (s: VillageState): unknown => JSON.parse(JSON.stringify(s));

/**
 * Výprava S na den kupců: med, vosk, kožešiny a mince – nejvýš 150, aby na meč (120 mincí × hladina)
 * stačily i bez utržených –, na seznamu meč.
 */
function tripOrder(s: VillageState, day: number): MarketOrder {
  const coins = Math.min(villageGoodStock(s, COIN_GOOD, day), 150);
  return {
    give: { honey: 40, wax: 10, furs: 20, ...(coins > 0 ? { coins } : {}) },
    wants: { swords: 1 },
    stayDays: 1,
  };
}

describe('trh s cizími kupci a mincemi po tři roky (markets.md – Co se ověří, plán 4)', () => {
  it('mince vznikají a zanikají jen u kupců, zboží za ně sedí, meč koupený včas, po kouscích týž stav', async () => {
    const world = goldenWorld();
    const start = world.start.lastDay;
    const end = start + DAYS;
    const stops = trailStops(WORLD_SEED, TRAIL_CELL);
    expect(stops).toHaveLength(1);

    // T: obilí nad pojistku dvou let (med se prodává jen z obilí nad ní), med, vosk a kožešiny nad
    // potřebou, zastávka kupců a objednaný meč
    const t0 = structuredClone(world.start);
    t0.storesKg += 20_000;
    addGood(t0, 'honey', 150, start);
    addGood(t0, 'wax', 30, start);
    addGood(t0, 'furs', 80, start);
    t0.merchantStops = structuredClone(stops);
    t0.armsOrder = { swords: 1 };
    // S: tatáž zlatá ves s jiným seedem, zásoba na deset výprav a 240 mincí
    const s0 = structuredClone(world.start);
    s0.seed += 1;
    s0.storesKg += 20_000;
    addGood(s0, 'honey', 500, start);
    addGood(s0, 'wax', 120, start);
    addGood(s0, 'furs', 250, start);
    addGood(s0, COIN_GOOD, 240, start);
    const nearbyOfS = (day: number): NonNullable<VillageState['nearby']> => ({
      day,
      self: { villageId: 's', name: 'Studánka' },
      villages: [{ villageId: 't', name: 'Trhovka', cells: 1, firstStep: 'E' }],
    });
    s0.nearby = nearbyOfS(start);
    s0.news = [{ villageId: 't', name: 'Trhovka', report: villageReport(t0, start) }];

    // výpravy S: na první tři dny kupců v každém herním roce, odeslané den předem
    const visits = merchantVisits(stops, start + 2, end - 3);
    const byYear = new Map<number, number[]>();
    for (const { day } of visits) {
      const { year } = dateOfDayIndex(day);
      byYear.set(year, [...(byYear.get(year) ?? []), day]);
    }
    const departures = new Set(
      [...byYear.values()].flatMap((d) => d.slice(0, 3).map((x) => x - 1)),
    );
    expect(departures.size).toBe(10);

    const t: Side = { id: 't', name: 'Trhovka', state: t0, pending: [], events: [] };
    const s: Side = { id: 's', name: 'Studánka', state: s0, pending: [], events: [] };
    const sides = [t, s];
    const villages = new InMemoryVillages();
    const store = (side: Side): void => {
      villages.records.set(side.id, {
        id: side.id,
        settlementId: `sídlo-${side.id}`,
        name: side.name,
        state: side.state,
        version: 0,
      });
    };
    sides.forEach(store);
    let seq = 0;
    const deliver = (mails: readonly VillageMail[]): void => {
      for (const mail of mails) {
        const target = sides.find((x) => x.id === mail.villageId);
        if (!target)
          throw new Error(`Zpráva do neznámé vsi ${mail.villageId} (${mail.body.kind}).`);
        // ves, která už den zprávy prožila, ji použije v příští den (jako market-neighbours-years)
        const event: VillageEvent = {
          id: mail.ref,
          seq: ++seq,
          villageId: mail.villageId,
          day: Math.max(mail.day, target.state.lastDay + 1),
          body: mail.body,
        };
        target.pending.push(event);
        target.events.push(event);
        villages.inbox.events.push(event);
      }
    };
    const step = (side: Side, day: number): { prev: VillageState; mails: VillageMail[] } => {
      const due = side.pending.filter((e) => e.day <= day);
      side.pending = side.pending.filter((e) => e.day > day);
      const prev = side.state;
      const next = advanceVillage(prev, day, world.obstacles, world.landscape, due);
      const mails = next.outbox ?? [];
      delete next.outbox;
      side.state = next;
      return { prev, mails };
    };

    let coins = await coinsOfWorld({ villages });
    expect(coins).toBe(240);
    const seen = new Map<string, Trades>();
    const trips = new Map<number, { order: MarketOrder; key: string }>();
    const tripResults: Trades[] = [];
    const tripLog: unknown[] = [];
    let arrivals = 0;
    let maxLevel = 1;
    let hungerDeaths = 0;
    let hostCoinsPaid = 0;
    let armsFromMerchants = 0;
    let sword: { day: number; paid: number; price: number } | null = null;
    const coinsByYear: { t: number; s: number; world: number }[] = [];

    for (let day = start + 1; day <= end; day++) {
      if ((day - start) % REFRESH === 0) {
        const event: VillageEvent = {
          id: `nearby:s:${day}`,
          seq: ++seq,
          villageId: 's',
          day,
          body: { kind: 'nearby', nearby: nearbyOfS(day) },
        };
        s.pending.push(event);
        s.events.push(event);
      }

      // T – hostitel s kupci
      const { prev: tPrev, mails: tMails } = step(t, day);
      const tNext = t.state;
      const prices = tPrev.market?.prices;
      const level = tPrev.market?.level ?? 1;
      const held = tNext.chronicle.filter(
        (e): e is Held => e.kind === 'market-held' && e.day === day,
      );
      // co dnes odešlo ze vsí a výprav (kladně) a co k nim přišlo (záporně), zboží i mince
      const flow: TradeGoods = {};
      const gross: TradeGoods = {};
      for (const h of held) {
        addFlow(flow, gross, h.sold, 1);
        addFlow(flow, gross, h.bought, -1);
      }
      const current = new Map<string, Trades>();
      for (const v of tNext.market?.visitors ?? [])
        if (!v.merchant) current.set(v.key, tradesOf(v));
      for (const mail of tMails) {
        if (mail.body.kind === 'market-result') {
          current.set(mail.body.result.key, tradesOf(mail.body.result));
        }
      }
      let trading = 0;
      for (const [key, now] of current) {
        const before = seen.get(key) ?? NO_TRADES;
        const coinFlow = now.paid - before.paid - (now.got - before.got);
        addFlow(flow, gross, now.sold, 1);
        addFlow(flow, gross, before.sold, -1);
        addFlow(flow, gross, now.bought, -1);
        addFlow(flow, gross, before.bought, 1);
        flow[COIN_GOOD] = (flow[COIN_GOOD] ?? 0) + coinFlow;
        if (JSON.stringify(now) !== JSON.stringify(before)) trading++;
        seen.set(key, now);
      }
      const arrived = merchantVisits(stops, day, day).length;
      arrivals += arrived;
      const before = merchantPurses(tPrev);
      const after = merchantPurses(tNext);
      const merchantsToday = before.merchants + arrived;
      // mince, které dnes kupci dostali od vsí a výprav (záporně: dali jim) – kupec obchoduje jen
      // na trhu T, takže je to celý tok mincí mezi kupci a světem
      const toMerchants = flow[COIN_GOOD] ?? 0;
      // měšec bez dna (markets.md – Měšec kupců bez dna, bod 1): kupci mince nedrží – co jim svět dal,
      // zaniklo, co od nich dostal, vzniklo
      expect([before.coins, after.coins], `den ${day - start}`).toEqual([0, 0]);
      if (merchantsToday === 0) expect(toMerchants, `den ${day - start}`).toBe(0);

      // zboží: mezi vsemi a výpravami se jen přesouvá; kupcům odchází med, vosk a kožešiny, od
      // nich přichází zbroj
      for (const good of TRADE_GOODS) {
        if (good === COIN_GOOD) continue;
        const out = flow[good] ?? 0;
        const noise = EPS * Math.max(1, gross[good] ?? 0);
        const merchantsBuy = good in MERCHANTS.wants;
        const merchantsSell = (ARMS_GOODS as readonly TradeGood[]).includes(good);
        if (merchantsToday === 0 || (!merchantsBuy && !merchantsSell)) {
          expect(Math.abs(out), `${good} den ${day - start}`).toBeLessThan(noise);
        } else if (merchantsBuy) {
          expect(out, `${good} den ${day - start}`).toBeGreaterThan(-noise);
        } else {
          expect(out, `${good} den ${day - start}`).toBeLessThanOrEqual(0);
          armsFromMerchants -= out;
        }
      }
      // mince od kupců = hodnota toho, co od vsí a výprav dostali, minus zbroj, kterou jim dali,
      // v cenách dne a hladině; platba dvojice za den je zaokrouhlená nahoru (rozdíl < 1 mince)
      if (merchantsToday > 0) {
        let value = 0;
        for (const good of TRADE_GOODS) {
          if (good !== COIN_GOOD) value += (flow[good] ?? 0) * coinPriceOf(prices, level, good);
        }
        const pairs = 2 * merchantsToday * (1 + trading);
        expect(Math.abs(-toMerchants - value), `den ${day - start}`).toBeLessThan(pairs);
      }

      // objednaný meč: v první den kupců, kdy na něj ves má, za cenu dne s hladinou
      const hostPaid = held.reduce((n, h) => n + (h.sold[COIN_GOOD] ?? 0), 0);
      hostCoinsPaid += hostPaid;
      const swordPrice = coinPriceOf(prices, level, 'swords');
      const swordsBought = held.reduce((n, h) => n + (h.bought.swords ?? 0), 0);
      if (swordsBought > 0) {
        expect(sword, 'druhý meč').toBeNull();
        expect(swordsBought).toBe(1);
        expect(hostPaid).toBe(Math.ceil(swordPrice - EPS));
        expect(tNext).not.toHaveProperty('armsOrder');
        sword = { day, paid: hostPaid, price: swordPrice };
      } else if (sword === null) {
        expect(tNext.armsOrder).toEqual({ swords: 1 });
        if (merchantsToday > 0) {
          expect(tNext.coins ?? 0, `den ${day - start}`).toBeLessThan(Math.ceil(swordPrice - EPS));
        }
      } else {
        expect(tNext).not.toHaveProperty('armsOrder');
      }
      deliver(tMails);

      // S – výpravy hráče
      const { mails: sMails } = step(s, day);
      deliver(sMails);
      if (departures.has(day)) {
        const order = tripOrder(s.state, day);
        const sent = departMarket(s.state, day, order, TARGET);
        if (!sent.ok) throw new Error(`Výprava S ${day - start}: ${sent.reason}`);
        s.state = sent.state;
        const mails = s.state.outbox ?? [];
        delete s.state.outbox;
        deliver(mails);
        trips.set(day, { order, key: sent.trip.key });
      }
      for (const mail of tMails) {
        if (mail.body.kind !== 'market-result') continue;
        const { result } = mail.body;
        const trip = [...trips.values()].find((x) => x.key === result.key);
        if (!trip) continue;
        // co výprava vezla, prodala nebo přiváží zpět; mince i s utrženými a zaplacenými
        for (const good of TRADE_GOODS) {
          const given = trip.order.give[good] ?? 0;
          const back = result.unsold[good] ?? 0;
          if (good === COIN_GOOD) {
            expect(back).toBe(given - (result.coinsPaid ?? 0) + (result.coinsGot ?? 0));
          } else {
            expect((result.sold[good] ?? 0) + back).toBeCloseTo(given, 6);
          }
        }
        tripResults.push(tradesOf(result));
        tripLog.push({ date: dateOfDayIndex(day), ...tradesOf(result) });
      }

      // součet mincí světa: mění se jen platbami kupců (+) a platbami kupcům (−)
      sides.forEach(store);
      const next = await coinsOfWorld({ villages });
      expect(next - coins, `den ${day - start}`).toBe(0 - toMerchants);
      coins = next;

      for (const side of sides) {
        hungerDeaths += side.state.chronicle.filter(
          (e) => e.day === day && e.kind === 'death' && e.cause === 'hunger',
        ).length;
        expect(side.state.coins ?? 0).toBeGreaterThanOrEqual(0);
      }
      const market = t.state.market;
      if (market) {
        expect(market.level ?? 1).toBeGreaterThanOrEqual(1);
        maxLevel = Math.max(maxLevel, market.level ?? 1);
        for (const good of TRADE_GOODS) {
          const price = market.prices[good];
          if (price !== undefined) expect(price, good).toBeGreaterThanOrEqual(initialPrice(good));
        }
      }
      if ((day - start) % REFRESH === 0 || day === end) {
        for (const side of sides) {
          expect(nonFinite(side.state), side.name).toBeNull();
          expect(negativeStock(side.state), side.name).toBeNull();
        }
      }
      if ((day - start) % YEAR === 0) {
        coinsByYear.push({ t: t.state.coins ?? 0, s: s.state.coins ?? 0, world: coins });
      }
    }

    // T vydělala mince (má je, nebo za ně koupila meč) a za mince nekoupila nic jiného než meč
    expect((t.state.coins ?? 0) > 0 || sword !== null).toBe(true);
    expect(hostCoinsPaid).toBe(sword?.paid ?? 0);
    expect(t.state.arms ?? {}).toEqual(sword ? { swords: 1 } : {});
    // zbroj ve vsích je jen ta od kupců (všechny výpravy jsou doma)
    expect(trips.size).toBe(10);
    expect(tripResults).toHaveLength(10);
    const armsOf = (x: VillageState): number =>
      ARMS_GOODS.reduce((n, good) => n + (x.arms?.[good] ?? 0), 0);
    expect(armsOf(t.state) + armsOf(s.state)).toBe(armsFromMerchants);
    expect(hungerDeaths).toBe(0);
    expect(arrivals).toBe(merchantVisits(stops, start + 1, end).length);

    // dopočet po kouscích: události schránek z denní pošty se přehrají, každá ves po 90 dnech
    // (S i ve dny svých výprav – akce hráče ves dopočítá k dnešku) s uložením a načtením
    const actions = new Map([...trips].map(([day, trip]) => [day, trip.order]));
    const inParts = (side: Side, initial: VillageState): VillageState => {
      const stopsAt = new Set<number>([end]);
      for (let d = start + CHUNK; d < end; d += CHUNK) stopsAt.add(d);
      if (side === s) for (const d of actions.keys()) stopsAt.add(d);
      let state = initial;
      for (const to of [...stopsAt].sort((a, b) => a - b)) {
        state = advanceVillage(state, to, world.obstacles, world.landscape, side.events);
        delete state.outbox;
        const order = side === s ? actions.get(to) : undefined;
        if (order) {
          const sent = departMarket(state, to, order, TARGET);
          if (!sent.ok) throw new Error(`Výprava S po kouscích ${to - start}: ${sent.reason}`);
          state = sent.state;
          delete state.outbox;
        }
        state = JSON.parse(JSON.stringify(state)) as VillageState;
      }
      return state;
    };
    expect(firstDifference(json(inParts(t, t0)), json(t.state))).toBeNull();
    expect(firstDifference(json(inParts(s, s0)), json(s.state))).toBeNull();

    const bought = tripResults.reduce((n, r) => n + (r.bought.swords ?? 0), 0);
    console.log(
      'market-merchants-years',
      JSON.stringify({
        coinsByYear,
        coinsEnd: { t: t.state.coins ?? 0, s: s.state.coins ?? 0, world: coins },
        merchantVisits: arrivals,
        maxLevel,
        tripSwordsBought: bought,
        tripCoinsPaid: tripResults.reduce((n, r) => n + r.paid, 0),
        tripCoinsGot: tripResults.reduce((n, r) => n + r.got, 0),
        trips: tripLog,
        sword: sword && { date: dateOfDayIndex(sword.day), ...sword },
        armsT: t.state.arms,
        armsS: s.state.arms,
        peopleT: t.state.people.length,
        peopleS: s.state.people.length,
      }),
    );
  }, 1_200_000);
});
