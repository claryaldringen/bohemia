import { describe, expect, it } from 'vitest';
import { InMemoryVillages } from '../../../../application/__tests__/in-memory-villages';
import { coinsOfWorld } from '../../../../application/__tests__/market-world';
import { dateOfDayIndex } from '../../../calendar';
import { applyCampaignReturn } from '../../../war/raid-apply';
import { trailStops } from '../../../world';
import { goldenWorld, YEAR } from '../../core/__tests__/village-golden-fixture';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { keptByLine } from '../../people/dynasty';
import { ageYears, isAdult } from '../../people/people';
import { canBeSold } from '../../people/slaves';
import { MERCHANTS } from '../../rules';
import type {
  ChronicleEvent,
  MarketOrder,
  MarketPerson,
  MarketTarget,
  Person,
  TradeGood,
  TradeGoods,
  VillageMail,
  VillageState,
} from '../../types';
import { ARMS_GOODS, COIN_GOOD, TRADE_GOODS, isPeopleGood } from '../goods';
import { coinPriceOf, initialPrice } from '../market-prices';
import { departMarket } from '../market-trip';
import { merchantVisits } from '../merchant-plan';
import { sellableSlaves } from '../slaves';
import { villageGoodStock } from '../trade';
import { villageReport } from '../village-report';
import { oneSidedSpouses } from './market-fixtures';

// Tři roky trhu s otroky a cizími kupci (markets.md – Co se ověří, plán 5; vzor
// market-merchants-years): ves T na kupecké stezce (zastávka z kostry světa – `trailStops`, obilí
// navíc) s dvěma odvedenými pohany-otroky (`applyCampaignReturn`), pokřtěným otrokem a nabídkou
// `slavesForSale: 2`, a ves S bez stezky s T v okolí s odvedenou pohanskou rodinou, pohankou
// a křesťankou. Obě po dnech, pošta mezi nimi po každém dni jako události schránky. S na první den
// kupců každého herního roku pošle do T výpravu hráče s prodejnými otroky (nejvýš 2). Test hlídá
// po každém dni, že lidé nevznikají ani nemizí jinak než porodem, smrtí a odjezdem otroků
// s kupci, mince jako v plánu 4, manželství a nabídku T; na konci dopočet po kouscích.
// Pomalý test (`packages/game/slow-tests.ts`).

const DAYS = 3 * YEAR;
const REFRESH = 30;
const CHUNK = 90;
/** Políčko světa 1, kterým vede jedno spojení stezky (jako market-merchants-years) – jedna zastávka. */
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
type Death = Extract<ChronicleEvent, { kind: 'death' }>;
type SideId = 't' | 's';

interface Side {
  id: SideId;
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
 * Člověk světa T a S na jednom místě: `key` – ves, jejíž id nese (`t:12`), `at` – kde je (lidé vsi,
 * trh, pošta), `inVillage` – je mezi lidmi vsi.
 */
interface Located {
  key: string;
  at: string;
  inVillage: boolean;
  p: Person;
}

const otherOf = (id: SideId): SideId => (id === 't' ? 's' : 't');
/** Totožnost napříč vsemi – prodaný nebo přivdaný se u nové vsi usadí s novým id. */
const identOf = (p: Person): string => `${p.bornDay}:${p.sex ?? '-'}`;
const headcount = (groups: readonly MarketPerson[] | undefined): number =>
  (groups ?? []).reduce((n, g) => n + g.people.length, 0);

/**
 * Všichni lidé světa (vzor `peopleOfWorld`): lidé vsí, náklad a koupení na trzích (i u kupců
 * v `boughtPeople` do jejich odjezdu) a nepoužité události schránek (příjezdy, výsledky). Id nese
 * ves, odkud člověk je: lidé výpravy domovskou ves, koupení od hostitele (`fromHost`) hostitele.
 */
function census(sides: readonly Side[]): Located[] {
  const out: Located[] = [];
  const put = (origin: string, at: string, groups: readonly MarketPerson[] | undefined): void => {
    for (const g of groups ?? []) {
      for (const p of g.people) out.push({ key: `${origin}:${p.id}`, at, inVillage: false, p });
    }
  };
  for (const side of sides) {
    for (const p of side.state.people) {
      out.push({ key: `${side.id}:${p.id}`, at: side.id, inVillage: true, p });
    }
    for (const v of side.state.market?.visitors ?? []) {
      const origin = v.merchant ? otherOf(side.id) : v.fromVillageId;
      put(origin, `trh ${side.id} ${v.key}`, v.people);
      const bought = v.merchant ? `u kupců ${side.id}` : `koupení ${side.id} ${v.key}`;
      for (const g of v.boughtPeople ?? []) {
        put(g.fromHost ? side.id : otherOf(side.id), bought, [g]);
      }
    }
    for (const e of side.pending) {
      const b = e.body;
      if (b.kind === 'market-arrive')
        put(b.arrival.fromVillageId, `příjezd ${side.id}`, b.arrival.people);
      else if (b.kind === 'market-result') {
        put(side.id, `výsledek ${side.id}`, b.result.people);
        for (const g of b.result.newcomers ?? []) {
          put(g.fromHost ? otherOf(side.id) : side.id, `výsledek ${side.id}`, [g]);
        }
      } else if (b.kind === 'stranded-people') {
        throw new Error(`Lidé zpět k hostiteli ${side.id} – v tomto světě nezaniká žádná ves.`);
      }
    }
  }
  return out;
}

/** Odvedený člověk do `applyCampaignReturn` (snímek z napadené vsi; id přidělí `rehomePeople`). */
function led(
  id: number,
  day: number,
  age: number,
  sex: 'male' | 'female',
  extra: Partial<Person> = {},
): Person {
  return { id, bornDay: day - age * YEAR - 100, dwellingId: 1, sex, ...extra };
}

describe('trh s otroky a cizími kupci po tři roky (markets.md – Co se ověří, plán 5)', () => {
  it('otroci odjíždějí jen s kupci, nikdo jiný nezmizí, mince a nabídka sedí, po kouscích týž stav', async () => {
    const world = goldenWorld();
    const start = world.start.lastDay;
    const end = start + DAYS;
    const stops = trailStops(WORLD_SEED, TRAIL_CELL);
    expect(stops).toHaveLength(1);

    // T: obilí navíc, zastávka kupců, pokřtěný otrok (vesničan), dva odvedení pohané a nabídka 2
    const t0 = structuredClone(world.start);
    t0.storesKg += 20_000;
    t0.merchantStops = structuredClone(stops);
    const kept = keptByLine(t0);
    const baptized = t0.people
      .filter((p) => p.line === undefined && p.noble === undefined && !kept(p) && isAdult(p, start))
      .sort((a, b) => b.bornDay - a.bornDay || a.id - b.id)[0]!;
    baptized.faith = 'christian';
    baptized.slave = true;
    const tBefore = t0.people.length;
    applyCampaignReturn(t0, start, {
      campaignId: 'tazeni-t',
      back: [],
      wounded: [],
      fallen: [],
      people: [led(1, start, 25, 'male'), led(2, start, 20, 'female')],
    });
    expect(t0.people.length).toBe(tBefore + 2);
    t0.slavesForSale = 2;
    expect(sellableSlaves(t0, start)).toHaveLength(2);

    // S: tatáž zlatá ves s jiným seedem; pohanská rodina, pohanka a křesťanka
    const s0 = structuredClone(world.start);
    s0.seed += 1;
    s0.storesKg += 20_000;
    const sBefore = s0.people.length;
    applyCampaignReturn(s0, start, {
      campaignId: 'tazeni-s',
      back: [],
      wounded: [],
      fallen: [],
      people: [
        led(1, start, 30, 'male', { spouseId: 2 }),
        led(2, start, 28, 'female', { spouseId: 1 }),
        led(3, start, 4, 'male', { fatherId: 1, motherId: 2 }),
        led(4, start, 18, 'female'),
        led(5, start, 22, 'female', { faith: 'christian' }),
      ],
    });
    expect(s0.people.length).toBe(sBefore + 5);
    expect(sellableSlaves(s0, start)).toHaveLength(4);
    const christianS = s0.people.find((p) => p.faith === 'christian')!;
    expect(christianS.slave).toBeUndefined();
    const nearbyOfS = (day: number): NonNullable<VillageState['nearby']> => ({
      day,
      self: { villageId: 's', name: 'Studánka' },
      villages: [{ villageId: 't', name: 'Trhovka', cells: 1, firstStep: 'E' }],
    });
    s0.nearby = nearbyOfS(start);
    s0.news = [{ villageId: 't', name: 'Trhovka', report: villageReport(t0, start) }];
    for (const s of [t0, s0]) expect(oneSidedSpouses(s)).toEqual([]);

    // výpravy S: na první den kupců v každém herním roce, odeslané den předem
    const firstOfYear = new Map<number, number>();
    for (const { day } of merchantVisits(stops, start + 2, end - 3)) {
      const { year } = dateOfDayIndex(day);
      if (!firstOfYear.has(year)) firstOfYear.set(year, day);
    }
    const departures = new Set([...firstOfYear.values()].map((d) => d - 1));
    expect(departures.size).toBeGreaterThanOrEqual(3);

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
    // poslední záznam každého člověka mezi lidmi vsi (zmizí-li, jaký byl v poslední den ve vsi)
    const lastInVillage = new Map<string, Person>();
    const remember = (side: Side): void => {
      for (const p of side.state.people) lastInVillage.set(`${side.id}:${p.id}`, p);
    };
    sides.forEach(remember);
    const step = (side: Side, day: number): { prev: VillageState; mails: VillageMail[] } => {
      const due = side.pending.filter((e) => e.day <= day);
      side.pending = side.pending.filter((e) => e.day > day);
      const prev = side.state;
      const next = advanceVillage(prev, day, world.obstacles, world.landscape, due);
      const mails = next.outbox ?? [];
      delete next.outbox;
      side.state = next;
      remember(side);
      return { prev, mails };
    };

    let coins = await coinsOfWorld({ villages });
    expect(coins).toBe(0);
    let world0 = census(sides);
    const startPeople = world0.length;
    // pokřtěný otrok T a křesťanka S – kupci je nekoupí, ze světa nezmizí (smějí se přestěhovat)
    const guarded = [
      { who: 'pokřtěný otrok T', ident: identOf(baptized), dead: false },
      { who: 'křesťanka S', ident: identOf(christianS), dead: false },
    ];
    const seen = new Map<string, Trades>();
    const trips = new Map<number, MarketOrder>();
    const tripLog: unknown[] = [];
    const hostSales: unknown[] = [];
    const merchantDaysT: unknown[] = [];
    const coinsByYear: unknown[] = [];
    let births = 0;
    let deaths = 0;
    let departed = 0;
    let leftWorld = 0;
    let soldSlaves = 0;
    let hungerDeaths = 0;
    let arrivals = 0;

    for (let day = start + 1; day <= end; day++) {
      const at = `den ${day - start}`;
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
      let tripSlaves = 0;
      for (const [key, now] of current) {
        const before = seen.get(key) ?? NO_TRADES;
        const coinFlow = now.paid - before.paid - (now.got - before.got);
        addFlow(flow, gross, now.sold, 1);
        addFlow(flow, gross, before.sold, -1);
        addFlow(flow, gross, now.bought, -1);
        addFlow(flow, gross, before.bought, 1);
        flow[COIN_GOOD] = (flow[COIN_GOOD] ?? 0) + coinFlow;
        tripSlaves += (now.sold.slaves ?? 0) - (before.sold.slaves ?? 0);
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
      expect([before.coins, after.coins], at).toEqual([0, 0]);
      if (merchantsToday === 0) expect(toMerchants, at).toBe(0);

      // zboží: mezi vsemi a výpravami se jen přesouvá; kupcům odchází, co shánějí (i otroci), od
      // nich přichází jen zbroj
      for (const good of TRADE_GOODS) {
        if (good === COIN_GOOD) continue;
        const out = flow[good] ?? 0;
        const noise = EPS * Math.max(1, gross[good] ?? 0);
        const merchantsBuy = good in MERCHANTS.wants;
        const merchantsSell = (ARMS_GOODS as readonly TradeGood[]).includes(good);
        if (merchantsToday === 0 || (!merchantsBuy && !merchantsSell)) {
          expect(Math.abs(out), `${good} ${at}`).toBeLessThan(noise);
        } else if (merchantsBuy) {
          expect(out, `${good} ${at}`).toBeGreaterThan(-noise);
        } else {
          expect(out, `${good} ${at}`).toBeLessThanOrEqual(0);
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
        expect(Math.abs(-toMerchants - value), at).toBeLessThan(pairs);
      }

      // nabídka T klesá o otroky, které T prodala, a při nule ze stavu zmizí
      const hostSlaves = held.reduce((n, h) => n + (h.sold.slaves ?? 0), 0);
      const offered = tPrev.slavesForSale ?? 0;
      expect(hostSlaves, at).toBeLessThanOrEqual(offered);
      if (offered - hostSlaves > 0) expect(tNext.slavesForSale, at).toBe(offered - hostSlaves);
      else expect(tNext, at).not.toHaveProperty('slavesForSale');
      if (hostSlaves > 0) {
        const price = coinPriceOf(prices, level, 'slaves');
        hostSales.push({ date: dateOfDayIndex(day), slaves: hostSlaves, price, held });
      }
      // obchody T ve dny kupců (komu kupci dali měšec – hostitel prodává první)
      if (merchantsToday > 0) {
        const date = dateOfDayIndex(day);
        for (const h of held) merchantDaysT.push({ date, sold: h.sold, bought: h.bought });
      }
      soldSlaves += hostSlaves + tripSlaves;
      deliver(tMails);

      // S – výpravy hráče s otroky
      const { mails: sMails } = step(s, day);
      deliver(sMails);
      if (departures.has(day)) {
        const slaves = Math.min(2, sellableSlaves(s.state, day).length);
        if (slaves > 0) {
          let order: MarketOrder = { give: { slaves }, wants: {}, stayDays: 1 };
          let sent = departMarket(s.state, day, order, TARGET);
          if (!sent.ok) {
            order = { give: { slaves }, wants: { grain: 1 }, stayDays: 1 };
            sent = departMarket(s.state, day, order, TARGET);
          }
          if (!sent.ok) throw new Error(`Výprava S ${at}: ${sent.reason}`);
          s.state = sent.state;
          const mails = s.state.outbox ?? [];
          delete s.state.outbox;
          deliver(mails);
          trips.set(day, order);
        }
      }
      for (const mail of tMails) {
        if (mail.body.kind !== 'market-result') continue;
        const { result } = mail.body;
        tripLog.push({
          date: dateOfDayIndex(day),
          key: result.key,
          sold: result.sold,
          coinsGot: result.coinsGot ?? 0,
          unsold: result.unsold,
        });
      }

      // součet mincí světa: mění se jen platbami kupců (+) a platbami kupcům (−)
      sides.forEach(store);
      const next = await coinsOfWorld({ villages });
      expect(next - coins, at).toBe(-toMerchants);
      coins = next;

      // lidé: kdo zmizel ze světa, zemřel (kronika), odešel ze světa podle dřívějších plánů (ves
      // syna, odchod domácností), nebo je otrok, se kterým odjeli kupci – v poslední den ve vsi
      // `canBeSold`; nikdo nepřibyl jinak než porodem
      const world1 = census(sides);
      const byKey = new Map(world1.map((e) => [e.key, e]));
      expect(byKey.size, `${at}: člověk na dvou místech`).toBe(world1.length);
      const before0 = new Set(world0.map((e) => e.key));
      const pool = new Map<string, Located[]>();
      for (const e of world1) {
        if (before0.has(e.key)) continue;
        pool.set(identOf(e.p), [...(pool.get(identOf(e.p)) ?? []), e]);
      }
      const lost: Located[] = [];
      for (const e of world0) {
        if (byKey.has(e.key)) continue;
        const moved = pool.get(identOf(e.p));
        if (moved && moved.length > 0) moved.pop();
        else lost.push(e);
      }
      const fresh = [...pool.values()].flat();
      const todays = sides.flatMap((x) => x.state.chronicle.filter((e) => e.day === day));
      const born = todays.filter((e) => e.kind === 'birth').length;
      const died = todays.filter((e): e is Death => e.kind === 'death');
      const left = todays.reduce(
        (n, e) =>
          n + (e.kind === 'son-left-village' || e.kind === 'households-left' ? e.people : 0),
        0,
      );
      // zemřelí podle věku a pohlaví – napřed ti, které prodat nejde
      let bornDied = 0;
      for (const d of died) {
        const female = d.estate?.female === true;
        const match = (e: Located): boolean =>
          ageYears(e.p.bornDay, day) === d.age && (e.p.sex === 'female') === female;
        const i = [lost.findIndex((e) => match(e) && !canBeSold(e.p)), lost.findIndex(match)].find(
          (x) => x >= 0,
        );
        if (i === undefined) {
          // narozený a zemřelý týž den – ve světě nikdy nebyl
          expect(d.age, `${at}: zemřelý mimo svět`).toBe(0);
          bornDied++;
          continue;
        }
        const [gone] = lost.splice(i, 1);
        for (const g of guarded) if (identOf(gone!.p) === g.ident) g.dead = true;
      }
      expect(fresh.length, `${at}: přibyl jinak než porodem`).toBe(born - bornDied);
      for (const e of fresh) expect(e.p.bornDay, at).toBeGreaterThan(start);
      expect(lost.length, `${at}: zmizel`).toBeGreaterThanOrEqual(left);
      const notForSale = lost.filter((e) => !canBeSold(lastInVillage.get(e.key) ?? e.p));
      expect(notForSale.length, `${at}: zmizel někdo, koho prodat nejde`).toBeLessThanOrEqual(left);
      births += born;
      deaths += died.length;
      leftWorld += left;
      departed += lost.length - left;
      // lidé T + S + na cestě + otroci u kupců = začátek + porody − úmrtí − otroci, se kterými
      // kupci odjeli (− odchod ze světa podle dřívějších plánů)
      expect(world1.length, at).toBe(startPeople + births - deaths - departed - leftWorld);
      // prodané otroky (zápisy trhu T a výsledky výprav S) kupci drží, nebo s nimi odjeli
      const held1 = (t.state.market?.visitors ?? [])
        .filter((v) => v.merchant)
        .reduce((n, v) => n + headcount(v.boughtPeople), 0);
      expect(soldSlaves, at).toBe(departed + held1);
      for (const g of guarded) {
        if (g.dead) continue;
        const found = world1.filter((e) => identOf(e.p) === g.ident && e.p.faith === 'christian');
        expect(found, `${at}: ${g.who}`).toHaveLength(1);
        expect(found[0]!.at, `${at}: ${g.who}`).not.toMatch(/^u kupců/);
      }
      for (const e of world1) {
        if (e.p.bornDay > start) expect(e.p.slave, `${at}: dítě ${e.key}`).toBeUndefined();
      }
      world0 = world1;

      for (const side of sides) {
        expect(oneSidedSpouses(side.state), `${at} ${side.name}`).toEqual([]);
        hungerDeaths += side.state.chronicle.filter(
          (e) => e.day === day && e.kind === 'death' && e.cause === 'hunger',
        ).length;
        expect(side.state.coins ?? 0).toBeGreaterThanOrEqual(0);
        expect(nonFinite(side.state), `${at} ${side.name}`).toBeNull();
        expect(negativeStock(side.state), `${at} ${side.name}`).toBeNull();
      }
      const market = t.state.market;
      if (market) {
        expect(market.level ?? 1).toBeGreaterThanOrEqual(1);
        for (const good of TRADE_GOODS) {
          const price = market.prices[good];
          if (price !== undefined) expect(price, good).toBeGreaterThanOrEqual(initialPrice(good));
        }
      }
      const date = dateOfDayIndex(day);
      if ((date.month === 12 && date.day === 31) || day === end) {
        coinsByYear.push({ date, t: t.state.coins ?? 0, s: s.state.coins ?? 0, world: coins });
      }
    }

    expect(hungerDeaths).toBe(0);
    expect(arrivals).toBe(merchantVisits(stops, start + 1, end).length);
    expect(trips.size).toBeGreaterThan(0);
    expect(soldSlaves).toBe(departed);

    // dopočet po kouscích: události schránek z denní pošty se přehrají, každá ves po 90 dnech
    // (S i ve dny svých výprav – akce hráče ves dopočítá k dnešku) s uložením a načtením
    const inParts = (side: Side, initial: VillageState): VillageState => {
      const stopsAt = new Set<number>([end]);
      for (let d = start + CHUNK; d < end; d += CHUNK) stopsAt.add(d);
      if (side === s) for (const d of trips.keys()) stopsAt.add(d);
      let state = initial;
      for (const to of [...stopsAt].sort((a, b) => a - b)) {
        state = advanceVillage(state, to, world.obstacles, world.landscape, side.events);
        delete state.outbox;
        const order = side === s ? trips.get(to) : undefined;
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

    const slavesOf = (x: VillageState): unknown => ({
      slaves: x.people.filter((p) => p.slave).length,
      sellable: sellableSlaves(x, x.lastDay).length,
      christianSlaves: x.people.filter((p) => p.slave && p.faith === 'christian').length,
    });
    console.log(
      'market-slaves-years',
      JSON.stringify({
        hostSales,
        merchantDaysT,
        orders: [...trips].map(([day, o]) => ({ day: day - start, give: o.give, wants: o.wants })),
        trips: tripLog,
        coinsByYear,
        soldSlaves,
        departed,
        births,
        deaths,
        leftWorld,
        merchantVisits: arrivals,
        slavesLeft: { t: slavesOf(t.state), s: slavesOf(s.state) },
        slavesForSaleT: t.state.slavesForSale ?? 0,
        peopleT: t.state.people.length,
        peopleS: s.state.people.length,
        guarded,
      }),
    );
  }, 1_200_000);
});
