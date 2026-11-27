import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryVillages } from '../../../../application/__tests__/in-memory-villages';
import { coinsOfWorld, goldOfWorld } from '../../../../application/__tests__/market-world';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
} from '../../../landscape';
import { trailStops } from '../../../world';
import { foundVillage } from '../../core/actions';
import type { VillageEvent } from '../../core/inbox';
import { goldPlacers } from '../../core/premium-effects';
import { advanceVillage } from '../../core/simulate';
import { newWorkshop } from '../../crafts/crafts';
import { villageRoadWalk } from '../../paths/walking';
import { checkWorkshopPlacement } from '../../placement/placement-dwellings';
import { CRAFT_BASE, GOLD, MERCHANTS, MINT, PANNING } from '../../rules';
import { newSteward } from '../../steward/steward-state';
import type {
  ChronicleEvent,
  Craft,
  Dwelling,
  MarketArrival,
  MarketOrder,
  MarketTarget,
  Person,
  TradeGood,
  TradeGoods,
  VillageMail,
  VillageState,
} from '../../types';
import { ARMS_GOODS, COIN_GOOD, GOLD_GOOD, TRADE_GOODS, isPeopleGood } from '../goods';
import { jewelleryMaterialG, jewelleryOf } from '../jewellery';
import { coinPriceOf } from '../market-prices';
import { departMarket } from '../market-trip';
import { merchantVisits } from '../merchant-plan';
import { villageGoodStock } from '../trade';
import { villageReport } from '../village-report';

// Tři roky zlata (gold.md – Co se ověří, plán 6; vzor market-merchants-years a market-slaves-years):
// ves G na krajině typu zlatonosný potok (`generateAcceptedLandscape(1, …, 'gold-stream')` – vrstvy
// jsou bit po bitu jako u krajiny 1 bez typu, typ jen označí 6 náplavů; test to ověří) s vloženou
// obydlenou dílnou rýžovníka (muž 30 let se synem 14) a šperkaře (muž 35), 1. 1. 950 i mincovny
// (muž 30) – řemeslníci vyučení (praxe 5 let, syn se učí od 10 let), jako po převodu `withCraftSkill`
// –, a ves T na kupecké stezce (jedna zastávka z `trailStops`). Obě vyrostly ze stejné vsi
// řízené správcem od 1. 3. 929 do 28. 2. 949 (zlatý přípravek je z roku 523 – mincovna je až od 950).
// Obě po dnech od 1. 3. 949 do 31. 12. 951, pošta mezi nimi po každém dni jako události schránky
// (vzor market-neighbours-years). G má T v okolí a na první den kupců každého herního roku pošle do T
// výpravu hráče se vším zlatem a mincemi a seznamem meč, na třetí den kupců s mincemi a seznamem
// 20 nástrojů. Test hlídá po každém dni oběh zlata a mincí světa, rýžování a kapacitu šperkaře; na
// konci dopočet po kouscích. Kontrolní běh bez mincovny je jinak stejný. Pomalý test
// (`packages/game/slow-tests.ts`).

const FOUNDED = dayIndexOf({ year: 929, month: 3, day: 1 });
/** Poslední den přípravku – běh začíná 1. 3. 949. */
const START = dayIndexOf({ year: 949, month: 2, day: 28 });
const END = dayIndexOf({ year: 951, month: 12, day: 31 });
/** Den, kdy se do G vloží obydlená mincovna (gold.md – Pravidla 3: od roku 950); razí od 2. 1. */
const MINT_DAY = dayIndexOf({ year: MINT.fromYear, month: 1, day: 1 });
const REFRESH = 30;
const CHUNK = 90;
/** Krajina vsí – seed 1 jako zlatá ves (village-golden-fixture). */
const LANDSCAPE_SEED = 1;
/** Políčko světa 1, kterým vede jedno spojení stezky (jako market-merchants-years) – jedna zastávka. */
const WORLD_SEED = 1;
const TRAIL_CELL = { x: 7, y: -1 };
/** Šum plovoucí čárky (kg, g). */
const EPS = 1e-6;
const YEAR_DAYS = 365.25;
const TARGET: MarketTarget = {
  villageId: 't',
  name: 'Trhovka',
  cells: 1,
  firstStep: 'E',
  homeVillageId: 'g',
  homeName: 'Zlatníky',
};

type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;

interface World {
  plain: Landscape;
  gold: Landscape;
  obstacles: ObstacleLayer;
  /** Ves po 20 letech od založení (28. 2. 949). */
  start: VillageState;
}

interface Side {
  id: 't' | 'g';
  name: string;
  landscape: Landscape;
  state: VillageState;
  pending: VillageEvent[];
  /** Události schránky vsi ve dni, kdy je ves použila – přehrají se v dopočtu po kouscích. */
  events: VillageEvent[];
}

/** Obchody výpravy na trhu T od příjezdu (na trhu i ve výsledku) a kapacita šperkaře, kterou drží. */
interface Trades {
  sold: TradeGoods;
  bought: TradeGoods;
  paid: number;
  got: number;
  jewelleryG: number;
}

function tradesOf(v: {
  sold: TradeGoods;
  bought: TradeGoods;
  coinsPaid?: number;
  coinsGot?: number;
  jewelleryG?: number;
}): Trades {
  return {
    sold: v.sold,
    bought: v.bought,
    paid: v.coinsPaid ?? 0,
    got: v.coinsGot ?? 0,
    jewelleryG: v.jewelleryG ?? 0,
  };
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

/** Kupci na trhu vsi: kolik jich je, mince v měšcích a zlato, které koupili (i za zbroj). */
function merchantsOn(s: VillageState): { merchants: number; coins: number; gold: number } {
  const merchants = (s.market?.visitors ?? []).filter((v) => v.merchant);
  return {
    merchants: merchants.length,
    coins: merchants.reduce((n, v) => n + (v.goods[COIN_GOOD] ?? 0), 0),
    gold: merchants.reduce((n, v) => n + (v.goods[GOLD_GOOD] ?? 0) + (v.bought[GOLD_GOOD] ?? 0), 0),
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

/** Záporná zásoba vsi (zboží bez lidí, i zlato a kapacita šperkaře) nebo náklad návštěvníka; nic = null. */
function negativeStock(s: VillageState): string | null {
  for (const good of TRADE_GOODS) {
    if (isPeopleGood(good)) continue;
    const stock = villageGoodStock(s, good, s.lastDay);
    if (!(stock >= -EPS)) return `${good}: ${stock}`;
  }
  if (!((s.gold ?? 0) >= -EPS)) return `gold: ${s.gold}`;
  if (!((s.jewelleryG ?? 0) >= -EPS)) return `jewelleryG: ${s.jewelleryG}`;
  for (const v of s.market?.visitors ?? []) {
    for (const [good, n] of Object.entries(v.goods)) {
      if (!((n ?? 0) >= -EPS)) return `${v.key}.${good}: ${n}`;
    }
    if (!((v.jewelleryG ?? 0) >= -EPS)) return `${v.key}.jewelleryG: ${v.jewelleryG}`;
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
const pannedOf = (s: VillageState): number => (s.goldPanned ?? []).reduce((n, g) => n + g, 0);
const round = (n: number): number => Math.round(n * 100) / 100;
const dateOf = (day: number): string => {
  const d = dateOfDayIndex(day);
  return `${d.day}. ${d.month}. ${d.year}`;
};
/** Kov v nákladu příjezdu (g): mince × `GOLD.coinGrams` + gramy zlata. */
const metalOf = (arrival: MarketArrival): number =>
  (arrival.goods[COIN_GOOD] ?? 0) * GOLD.coinGrams + (arrival.goods[GOLD_GOOD] ?? 0);

/** Ves řízená správcem od 1. 3. 929 do 28. 2. 949 na krajině 1 (jako `goldenWorld`, jen o 426 let později). */
function buildWorld(): World {
  const plain = generateLandscape(LANDSCAPE_SEED, CURRENT_LAYER_VERSIONS);
  const gold = generateAcceptedLandscape(LANDSCAPE_SEED, undefined, 'gold-stream').landscape;
  const obstacles = obstaclesOf(plain);
  const site = tileCenterWorld(plain, plain.villageSite.x, plain.villageSite.y);
  const founded = foundVillage({
    seed: 4242,
    day: FOUNDED,
    dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
  });
  const start = advanceVillage(
    { ...founded, steward: newSteward(FOUNDED, true) },
    START,
    obstacles,
    plain,
  );
  return { plain, gold, obstacles, start };
}

/** Řemeslník vložené dílny: věk, praxe v řemesle dílny (roky) a jestli je to syn prvního z nich. */
interface Crafter {
  years: number;
  practice: number;
  son?: true;
}

/**
 * Místo pro dílnu `craft` co nejblíž dvorci (mřížka po 5 m, podle vzdálenosti): projde kontrolou
 * dílny bez překážek a bez půdy vsi pod sebou; od rýžovníka se aspoň k jednomu náplavu dojde.
 */
function workshopSpot(state: VillageState, craft: Craft, world: World): Dwelling['position'] {
  const center = state.dwellings[0]!.position;
  const placers = goldPlacers(world.gold);
  const offsets: { dx: number; dz: number }[] = [];
  for (let dx = -150; dx <= 150; dx += 5) {
    for (let dz = -150; dz <= 150; dz += 5) offsets.push({ dx, dz });
  }
  offsets.sort((a, b) => a.dx * a.dx + a.dz * a.dz - (b.dx * b.dx + b.dz * b.dz) || a.dx - b.dx);
  for (const { dx, dz } of offsets) {
    const position = { x: Math.round(center.x + dx), z: Math.round(center.z + dz), rotation: 0 };
    const check = checkWorkshopPlacement(world.gold, state, craft, position, world.obstacles);
    if (!check.ok || check.obstacleIds.length > 0 || check.takenLand.length > 0) continue;
    if (craft === 'panner') {
      const walks = villageRoadWalk(state, world.gold)(position, placers);
      if (!walks.some(Number.isFinite)) continue;
    }
    return position;
  }
  throw new Error(`Pro dílnu ${craft} se nenašlo místo.`);
}

/** Vloží obydlenou dílnu `craft` s řemeslníky `crafters` (mutuje stav); vrací ji. */
function addWorkshop(
  state: VillageState,
  day: number,
  craft: Craft,
  crafters: readonly Crafter[],
  world: World,
): Dwelling {
  const dwelling: Dwelling = {
    id: state.nextId++,
    type: CRAFT_BASE[craft],
    builtDay: day,
    condition: 1,
    position: workshopSpot(state, craft, world),
    workshop: { ...newWorkshop(craft), skillTracked: true },
  };
  state.dwellings.push(dwelling);
  let fatherId: number | undefined;
  for (const crafter of crafters) {
    const practice: Partial<Record<Craft, number>> = {};
    practice[craft] = crafter.practice;
    const person: Person = {
      id: state.nextId++,
      bornDay: day - Math.ceil(crafter.years * YEAR_DAYS),
      dwellingId: dwelling.id,
      sex: 'male',
      practice,
      ...(crafter.son && fatherId !== undefined ? { fatherId } : {}),
    };
    state.people.push(person);
    if (!crafter.son) fatherId = person.id;
  }
  return dwelling;
}

/** Rok zlata: rýžování, ražba a kam zlato šlo (g), mince výprav G a stav na konci roku. */
interface YearGold {
  year: number;
  panned: number;
  minted: number;
  /** Zlato, se kterým kupci odjeli. */
  toMerchants: number;
  /** Zlato, které T vyměnila výpravám za své mince (`market-held` – `bought.gold`). */
  exchangedAtT: number;
  /** Zlato, které T prodala kupcům (`market-held` – `sold.gold`). */
  soldByT: number;
  /** Zlato, které prodaly výpravy G (všechny – hráče, správce i vesničanů). */
  soldByTrips: number;
  coinsPaidByTrips: number;
  coinsGotByTrips: number;
  /** Dny podle činnosti dílny rýžovníka (`Workshop.activity`; dílna zmizela – `gone`). */
  pannerDays: Record<string, number>;
  end?: {
    goldG: number;
    coinsG: number;
    jewelleryG: number;
    usableG: number;
    coinsT: number;
    goldT: number;
    levelT: number;
    swordPriceT: number;
    goldWorld: number;
    coinsWorld: number;
  };
}

interface RunSummary {
  years: YearGold[];
  trips: unknown[];
  placer: unknown;
  mintedTotal: number;
  pannedTotal: number;
  /** Výpravy G podle toho, kdo je poslal – počet, zlato a mince v nákladu, utracené mince. */
  tripsBy: Record<string, { trips: number; gold: number; coins: number; paid: number }>;
  hungerDeaths: number;
  people: { t: number; g: number };
}

async function runWorld(world: World, mint: boolean): Promise<RunSummary> {
  const stops = trailStops(WORLD_SEED, TRAIL_CELL);
  expect(stops).toHaveLength(1);

  // T: obilí navíc a zastávka kupců
  const t0 = structuredClone(world.start);
  t0.storesKg += 20_000;
  t0.merchantStops = structuredClone(stops);
  // G: tatáž ves s jiným seedem, obilí navíc, rýžovník se synem a šperkař; T v okolí
  const g0 = structuredClone(world.start);
  g0.seed += 1;
  g0.storesKg += 20_000;
  const panner = addWorkshop(
    g0,
    START,
    'panner',
    [
      { years: 30, practice: 5 },
      { years: 14, practice: 4, son: true },
    ],
    world,
  );
  const jeweller = addWorkshop(g0, START, 'jeweller', [{ years: 35, practice: 5 }], world);
  const nearbyOfG = (day: number): NonNullable<VillageState['nearby']> => ({
    day,
    self: { villageId: 'g', name: 'Zlatníky' },
    villages: [{ villageId: 't', name: 'Trhovka', cells: 1, firstStep: 'E' }],
  });
  g0.nearby = nearbyOfG(START);
  g0.news = [{ villageId: 't', name: 'Trhovka', report: villageReport(t0, START) }];
  const placers = goldPlacers(world.gold);
  const walks = villageRoadWalk(g0, world.gold)(panner.position, placers).map(round);

  // výpravy G: první a třetí den kupců každého herního roku, odeslané den předem (na trhu T jsou
  // v den kupců – jako market-merchants-years)
  const visits = merchantVisits(stops, START + 2, END - 3);
  const byYear = new Map<number, number[]>();
  for (const { day } of visits) {
    const { year } = dateOfDayIndex(day);
    byYear.set(year, [...(byYear.get(year) ?? []), day]);
  }
  const plan = new Map<number, 'swords' | 'tools'>();
  for (const days of byYear.values()) {
    if (days[0] !== undefined) plan.set(days[0] - 1, 'swords');
    if (days[2] !== undefined) plan.set(days[2] - 1, 'tools');
  }
  expect(plan.size).toBe(6);

  const t: Side = {
    id: 't',
    name: 'Trhovka',
    landscape: world.plain,
    state: t0,
    pending: [],
    events: [],
  };
  const g: Side = {
    id: 'g',
    name: 'Zlatníky',
    landscape: world.gold,
    state: g0,
    pending: [],
    events: [],
  };
  const sides = [t, g];
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
  // příjezdy výprav do T: kapacita šperkaře a kdo výpravu poslal (hráč – bez `by`)
  const arrivals = new Map<string, MarketArrival>();
  const deliver = (mails: readonly VillageMail[]): void => {
    for (const mail of mails) {
      const target = sides.find((x) => x.id === mail.villageId);
      if (!target) throw new Error(`Zpráva do neznámé vsi ${mail.villageId} (${mail.body.kind}).`);
      if (mail.body.kind === 'market-arrive')
        arrivals.set(mail.body.arrival.key, mail.body.arrival);
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
  const step = (
    side: Side,
    day: number,
  ): { prev: VillageState; mails: VillageMail[]; due: VillageEvent[] } => {
    const due = side.pending.filter((e) => e.day <= day);
    side.pending = side.pending.filter((e) => e.day > day);
    const prev = side.state;
    const next = advanceVillage(prev, day, world.obstacles, side.landscape, due);
    const mails = next.outbox ?? [];
    delete next.outbox;
    side.state = next;
    return { prev, mails, due };
  };
  /** Kapacita výpravy G při odjezdu nepřeroste kov v nákladu; výprava vesničanů žádnou nemá. */
  const checkDeparture = (arrival: MarketArrival, day: number): void => {
    const capacity = arrival.jewelleryG ?? 0;
    expect(capacity, `kapacita výpravy ${arrival.key} den ${day - START}`).toBeLessThanOrEqual(
      metalOf(arrival) + EPS,
    );
    if (arrival.by === 'villagers') expect(capacity).toBe(0);
  };

  let gold = await goldOfWorld({ villages });
  let coins = await coinsOfWorld({ villages });
  expect(gold).toBe(0);
  expect(coins).toBe(0);
  const seen = new Map<string, Trades>();
  const trips = new Map<number, { order: MarketOrder; key: string; want: 'swords' | 'tools' }>();
  const tripEntry = (by: string): RunSummary['tripsBy'][string] =>
    (tripsBy[by] ??= { trips: 0, gold: 0, coins: 0, paid: 0 });
  const tripLog: unknown[] = [];
  const tripsBy: RunSummary['tripsBy'] = {};
  let hungerDeaths = 0;
  let merchantDays = 0;
  let mintedTotal = 0;
  const years = new Map<number, YearGold>();
  const yearOf = (day: number): YearGold => {
    const { year } = dateOfDayIndex(day);
    let y = years.get(year);
    if (!y) {
      y = {
        year,
        panned: 0,
        minted: 0,
        toMerchants: 0,
        exchangedAtT: 0,
        soldByT: 0,
        soldByTrips: 0,
        coinsPaidByTrips: 0,
        coinsGotByTrips: 0,
        pannerDays: {},
      };
      years.set(year, y);
    }
    return y;
  };
  let mintId: number | null = null;

  for (let day = START + 1; day <= END; day++) {
    const label = `den ${day - START} (${dateOf(day)})`;
    const stats = yearOf(day);
    if ((day - START) % REFRESH === 0) {
      const event: VillageEvent = {
        id: `nearby:g:${day}`,
        seq: ++seq,
        villageId: 'g',
        day,
        body: { kind: 'nearby', nearby: nearbyOfG(day) },
      };
      g.pending.push(event);
      g.events.push(event);
    }

    // T – hostitel s kupci
    const { prev: tPrev, mails: tMails } = step(t, day);
    const tNext = t.state;
    const held = tNext.chronicle.filter(
      (e): e is Held => e.kind === 'market-held' && e.day === day,
    );
    // co dnes odešlo ze vsí a výprav (kladně) a co k nim přišlo (záporně), zboží i mince
    const flow: TradeGoods = {};
    const gross: TradeGoods = {};
    for (const h of held) {
      addFlow(flow, gross, h.sold, 1);
      addFlow(flow, gross, h.bought, -1);
      stats.exchangedAtT += h.bought[GOLD_GOOD] ?? 0;
      stats.soldByT += h.sold[GOLD_GOOD] ?? 0;
    }
    const current = new Map<string, Trades>();
    for (const v of tNext.market?.visitors ?? []) if (!v.merchant) current.set(v.key, tradesOf(v));
    for (const mail of tMails) {
      if (mail.body.kind === 'market-result') {
        current.set(mail.body.result.key, tradesOf(mail.body.result));
      }
    }
    for (const [key, now] of current) {
      const arrival = arrivals.get(key);
      const prior = seen.get(key) ?? {
        sold: {},
        bought: {},
        paid: 0,
        got: 0,
        jewelleryG: arrival?.jewelleryG ?? 0,
      };
      const paid = now.paid - prior.paid;
      const got = now.got - prior.got;
      addFlow(flow, gross, now.sold, 1);
      addFlow(flow, gross, prior.sold, -1);
      addFlow(flow, gross, now.bought, -1);
      addFlow(flow, gross, prior.bought, 1);
      flow[COIN_GOOD] = (flow[COIN_GOOD] ?? 0) + paid - got;
      // kapacita šperkaře výpravy na trhu jen ubývá, a nejvýš o kov, který opravdu odešel – mince,
      // které zaplatila, a zlato, které prodala (uložená smí kov výpravy přerůst – úloha 7a)
      const goldSold = (now.sold[GOLD_GOOD] ?? 0) - (prior.sold[GOLD_GOOD] ?? 0);
      const used = prior.jewelleryG - now.jewelleryG;
      expect(used, `kapacita ${key} ${label}`).toBeGreaterThanOrEqual(-EPS);
      expect(used, `kapacita ${key} ${label}`).toBeLessThanOrEqual(
        paid * GOLD.coinGrams + goldSold + EPS,
      );
      stats.soldByTrips += goldSold;
      stats.coinsPaidByTrips += paid;
      stats.coinsGotByTrips += got;
      seen.set(key, now);
    }
    const arrived = merchantVisits(stops, day, day).length;
    const before = merchantsOn(tPrev);
    const after = merchantsOn(tNext);
    const merchantsToday = before.merchants + arrived;
    if (merchantsToday > 0) merchantDays++;
    // mince a zlato, které dnes kupci dostali od vsí a výprav (záporně: dali jim) – kupec obchoduje
    // jen na trhu T, takže je to celý tok mezi kupci a světem
    const coinsToMerchants = flow[COIN_GOOD] ?? 0;
    const goldToMerchants = flow[GOLD_GOOD] ?? 0;
    // měšec bez dna (markets.md – Měšec kupců bez dna, bod 1): kupci mince nedrží
    expect([before.coins, after.coins], label).toEqual([0, 0]);
    const departedGold = before.gold + goldToMerchants - after.gold;
    if (merchantsToday === 0) {
      expect(coinsToMerchants, label).toBe(0);
      expect(goldToMerchants, label).toBe(0);
    }
    expect(departedGold, label).toBeGreaterThanOrEqual(-EPS);
    if (after.merchants === merchantsToday) {
      expect(Math.abs(departedGold), label).toBeLessThan(EPS);
    }
    stats.toMerchants += departedGold;
    // zboží: mezi vsemi a výpravami se jen přesouvá; kupcům odchází jen to, co kupují (i zlato),
    // od nich přichází jen zbroj
    for (const good of TRADE_GOODS) {
      if (good === COIN_GOOD) continue;
      const out = flow[good] ?? 0;
      const noise = EPS * Math.max(1, gross[good] ?? 0);
      const merchantsBuy = good in MERCHANTS.wants;
      const merchantsSell = (ARMS_GOODS as readonly TradeGood[]).includes(good);
      if (merchantsToday === 0 || (!merchantsBuy && !merchantsSell)) {
        expect(Math.abs(out), `${good} ${label}`).toBeLessThan(noise);
      } else if (merchantsBuy) {
        expect(out, `${good} ${label}`).toBeGreaterThan(-noise);
      } else {
        expect(out, `${good} ${label}`).toBeLessThanOrEqual(0);
      }
    }
    deliver(tMails);

    // G – rýžovník, šperkař, od 1. 1. 950 mincovna; výpravy hráče
    const { prev: gPrev, mails: gMails, due: gDue } = step(g, day);
    const gNext = g.state;
    const panned = pannedOf(gNext) - pannedOf(gPrev);
    const { month } = dateOfDayIndex(day);
    if (month < PANNING.months.from || month > PANNING.months.to) {
      // od listopadu do března se nerýžuje
      expect(gNext.goldPanned ?? [], label).toEqual(gPrev.goldPanned ?? []);
    }
    for (const placerG of gNext.goldPanned ?? []) {
      expect(placerG, label).toBeLessThanOrEqual(PANNING.placerG + EPS);
    }
    expect(panned, label).toBeGreaterThanOrEqual(-EPS);
    // vyražené mince: přírůstek mincí G bez mincí z vrácených výsledků a s mincemi odjíždějících
    // výprav (správce, vesničané); totéž zlato ubylo – gram za minci (gold.md – Pravidla 3)
    let returned = { gold: 0, coins: 0 };
    for (const e of gDue) {
      if (e.body.kind === 'market-result') {
        const { unsold, bought } = e.body.result;
        returned = {
          gold: returned.gold + (unsold[GOLD_GOOD] ?? 0) + (bought[GOLD_GOOD] ?? 0),
          coins: returned.coins + (unsold[COIN_GOOD] ?? 0),
        };
      } else if (e.body.kind === 'stranded-people') {
        returned = {
          gold: returned.gold + (e.body.gold ?? 0),
          coins: returned.coins + (e.body.coins ?? 0),
        };
      }
    }
    let left = { gold: 0, coins: 0 };
    for (const mail of gMails) {
      if (mail.body.kind !== 'market-arrive') continue;
      const { arrival } = mail.body;
      checkDeparture(arrival, day);
      left = {
        gold: left.gold + (arrival.goods[GOLD_GOOD] ?? 0),
        coins: left.coins + (arrival.goods[COIN_GOOD] ?? 0),
      };
      const entry = tripEntry(arrival.by ?? 'player');
      entry.trips++;
      entry.gold += arrival.goods[GOLD_GOOD] ?? 0;
      entry.coins += arrival.goods[COIN_GOOD] ?? 0;
    }
    const minted = (gNext.coins ?? 0) - (gPrev.coins ?? 0) - returned.coins + left.coins;
    expect(Number.isInteger(minted), label).toBe(true);
    expect(minted, label).toBeGreaterThanOrEqual(0);
    if (!mint || day <= MINT_DAY) expect(minted, label).toBe(0);
    expect(
      (gPrev.gold ?? 0) + panned + returned.gold - left.gold - minted * GOLD.coinGrams,
      label,
    ).toBeCloseTo(gNext.gold ?? 0, 6);
    const pannerActivity =
      gNext.dwellings.find((d) => d.id === panner.id)?.workshop?.activity ?? 'gone';
    stats.pannerDays[pannerActivity] = (stats.pannerDays[pannerActivity] ?? 0) + 1;
    stats.panned += panned;
    stats.minted += minted;
    mintedTotal += minted;
    // použitelná kapacita šperkaře nepřeroste kov vsi
    expect(jewelleryOf(gNext), label).toBeLessThanOrEqual(jewelleryMaterialG(gNext));
    deliver(gMails);

    if (mint && day === MINT_DAY) {
      mintId = addWorkshop(g.state, day, 'minter', [{ years: 30, practice: 5 }], world).id;
    }
    const want = plan.get(day);
    if (want) {
      const s = g.state;
      // hráč dává zlato na výpravu v celých gramech (zásoba má setiny – gold.md, Mince 2,4 g, bod 4)
      const goldG = Math.floor(villageGoodStock(s, GOLD_GOOD, day));
      const coinsG = villageGoodStock(s, COIN_GOOD, day);
      const give: TradeGoods = {
        ...(want === 'swords' && goldG > 0 ? { [GOLD_GOOD]: goldG } : {}),
        ...(coinsG > 0 ? { [COIN_GOOD]: coinsG } : {}),
      };
      const order: MarketOrder = {
        give,
        wants: want === 'swords' ? { swords: 1 } : { tools: 20 },
        stayDays: 1,
      };
      const usable = jewelleryOf(s);
      const sent = departMarket(s, day, order, TARGET);
      if (!sent.ok) throw new Error(`Výprava G ${label}: ${sent.reason}`);
      g.state = sent.state;
      const mails = g.state.outbox ?? [];
      delete g.state.outbox;
      // náklad odešel ze vsi celý: zlato a mince, kapacita nejvýš použitelná a nejvýš kov
      expect(g.state.gold ?? 0).toBeCloseTo((s.gold ?? 0) - (give[GOLD_GOOD] ?? 0), 9);
      expect(g.state.coins ?? 0).toBe((s.coins ?? 0) - (give[COIN_GOOD] ?? 0));
      const arrival = mails.flatMap((m) =>
        m.body.kind === 'market-arrive' ? [m.body.arrival] : [],
      );
      expect(arrival).toHaveLength(1);
      checkDeparture(arrival[0]!, day);
      expect(arrival[0]!.jewelleryG ?? 0).toBeLessThanOrEqual(usable + EPS);
      const entry = tripEntry('player');
      entry.trips++;
      entry.gold += give[GOLD_GOOD] ?? 0;
      entry.coins += give[COIN_GOOD] ?? 0;
      deliver(mails);
      trips.set(day, { order, key: sent.trip.key, want });
    }
    for (const mail of tMails) {
      if (mail.body.kind !== 'market-result') continue;
      const { result } = mail.body;
      const sentDay = [...trips].find(([, x]) => x.key === result.key)?.[0];
      tripEntry(arrivals.get(result.key)?.by ?? 'player').paid += result.coinsPaid ?? 0;
      const trip = sentDay === undefined ? undefined : trips.get(sentDay);
      if (sentDay === undefined || !trip) continue;
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
      const arrival = arrivals.get(result.key);
      expect(result.jewelleryG ?? 0).toBeLessThanOrEqual((arrival?.jewelleryG ?? 0) + EPS);
      tripLog.push({
        sent: dateOf(sentDay),
        back: dateOf(day),
        want: trip.want,
        give: trip.order.give,
        jewelleryOut: round(arrival?.jewelleryG ?? 0),
        sold: result.sold,
        bought: result.bought,
        coinsPaid: result.coinsPaid ?? 0,
        coinsGot: result.coinsGot ?? 0,
        unsold: result.unsold,
        jewelleryBack: round(result.jewelleryG ?? 0),
        level: result.level ?? 1,
      });
    }

    // zlato světa: přibývá jen rýžováním, ubývá ražbou a odjezdem kupců; mince světa přibývají
    // příjezdem kupce (+ měšec) a ražbou, ubývají jeho odjezdem (− měšec)
    sides.forEach(store);
    const goldNext = await goldOfWorld({ villages });
    const coinsNext = await coinsOfWorld({ villages });
    expect(goldNext - gold, label).toBeCloseTo(panned - minted * GOLD.coinGrams - departedGold, 6);
    expect(coinsNext - coins, label).toBe(-coinsToMerchants + minted);
    gold = goldNext;
    coins = coinsNext;

    for (const side of sides) {
      hungerDeaths += side.state.chronicle.filter(
        (e) => e.day === day && e.kind === 'death' && e.cause === 'hunger',
      ).length;
    }
    if ((day - START) % REFRESH === 0 || day === END) {
      for (const side of sides) {
        expect(nonFinite(side.state), `${side.name} ${label}`).toBeNull();
        expect(negativeStock(side.state), `${side.name} ${label}`).toBeNull();
      }
    }
    const date = dateOfDayIndex(day);
    if ((date.month === 12 && date.day === 31) || day === END) {
      const market = t.state.market;
      stats.end = {
        goldG: round(g.state.gold ?? 0),
        coinsG: g.state.coins ?? 0,
        jewelleryG: round(g.state.jewelleryG ?? 0),
        usableG: round(jewelleryOf(g.state)),
        coinsT: t.state.coins ?? 0,
        goldT: round(t.state.gold ?? 0),
        levelT: round(market?.level ?? 1),
        swordPriceT: round(coinPriceOf(market?.prices, market?.level ?? 1, 'swords')),
        goldWorld: round(gold),
        coinsWorld: coins,
      };
    }
  }

  expect(hungerDeaths).toBe(0);
  expect(trips.size).toBe(6);
  expect(tripLog).toHaveLength(6);
  expect(merchantDays).toBeGreaterThan(0);
  const pannedTotal = [...years.values()].reduce((n, y) => n + y.panned, 0);
  expect(pannedOf(g.state)).toBeCloseTo(pannedTotal, 6);
  expect(pannedTotal).toBeGreaterThan(0);
  if (mint) expect(mintedTotal).toBeGreaterThan(0);
  // šperkař zpracovával: kapacita vznikla a výpravy ji vezly
  expect(tripLog.some((x) => (x as { jewelleryOut: number }).jewelleryOut > 0)).toBe(true);

  // dopočet po kouscích: události schránek z denní pošty se přehrají, každá ves po 90 dnech
  // (G i ve dny výprav a vložení mincovny – akce ves dopočítá k dnešku) s uložením a načtením
  const actions = new Map([...trips].map(([day, trip]) => [day, trip.order]));
  const inParts = (side: Side, initial: VillageState): VillageState => {
    const stopsAt = new Set<number>([END]);
    for (let d = START + CHUNK; d < END; d += CHUNK) stopsAt.add(d);
    if (side === g) {
      for (const d of actions.keys()) stopsAt.add(d);
      if (mint) stopsAt.add(MINT_DAY);
    }
    let state = initial;
    for (const to of [...stopsAt].sort((a, b) => a - b)) {
      state = advanceVillage(state, to, world.obstacles, side.landscape, side.events);
      delete state.outbox;
      if (side === g && mint && to === MINT_DAY) {
        expect(addWorkshop(state, to, 'minter', [{ years: 30, practice: 5 }], world).id).toBe(
          mintId,
        );
      }
      const order = side === g ? actions.get(to) : undefined;
      if (order) {
        const sent = departMarket(state, to, order, TARGET);
        if (!sent.ok) throw new Error(`Výprava G po kouscích ${to - START}: ${sent.reason}`);
        state = sent.state;
        delete state.outbox;
      }
      state = JSON.parse(JSON.stringify(state)) as VillageState;
    }
    return state;
  };
  expect(firstDifference(json(inParts(t, t0)), json(t.state))).toBeNull();
  expect(firstDifference(json(inParts(g, g0)), json(g.state))).toBeNull();

  const mintDwelling = g.state.dwellings.find((d) => d.id === mintId);
  return {
    years: [...years.values()].map((y) => ({
      ...y,
      panned: round(y.panned),
      toMerchants: round(y.toMerchants),
      soldByTrips: round(y.soldByTrips),
    })),
    trips: tripLog,
    placer: {
      placers: placers.length,
      walks,
      panner: panner.position,
      jeweller: jeweller.position,
      ...(mintDwelling ? { mint: mintDwelling.position } : {}),
      goldPanned: (g.state.goldPanned ?? []).map(round),
      // kdo z rodiny rýžovníka se ze dílny přiženil jinam (kinship.md – Sňatky, `weddingHome`)
      pannerLeft: g.state.chronicle.flatMap((e) =>
        e.kind === 'marriage' && e.groomMoved && e.fromDwellingId === panner.id
          ? [
              {
                date: dateOf(e.day),
                groomId: e.groomId,
                to: g.state.dwellings.find((d) => d.id === e.toDwellingId)?.type ?? null,
              },
            ]
          : [],
      ),
      // dílna rýžovníka na konci běhu: činnost, náplav a kdo v ní bydlí (věk v letech)
      pannerEnd: {
        workshop: g.state.dwellings.find((d) => d.id === panner.id)?.workshop ?? null,
        household: g.state.people
          .filter((p) => p.dwellingId === panner.id)
          .map((p) => ({ id: p.id, sex: p.sex, years: round((END - p.bornDay) / YEAR_DAYS) })),
      },
    },
    mintedTotal,
    pannedTotal: round(pannedTotal),
    tripsBy,
    hungerDeaths,
    people: { t: t.state.people.length, g: g.state.people.length },
  };
}

describe('zlato po tři roky – rýžovník, šperkař, mincovna a kupci (gold.md – Co se ověří, plán 6)', () => {
  let world: World;
  const runs = new Map<string, RunSummary>();
  beforeAll(() => {
    world = buildWorld();
    // zlatonosný potok krajiny 1 jen označí náplavy – vrstvy jsou bit po bitu jako bez typu, ves
    // vyrostlá na krajině bez typu tak stojí i na krajině s potokem (a vrstva překážek je táž)
    const { premium, ...rest } = world.gold;
    expect(premium).toBe('gold-stream');
    expect(JSON.stringify(rest)).toBe(JSON.stringify(world.plain));
    expect(goldPlacers(world.gold).length).toBeGreaterThanOrEqual(3);
  }, 600_000);

  it('zlato vzniká jen rýžováním a zaniká ražbou a s kupci, mince jen u kupců a ražbou, kapacita šperkaře do kovu, po kouscích týž stav', async () => {
    const run = await runWorld(world, true);
    runs.set('mint', run);
    console.log('market-gold-years – s mincovnou', JSON.stringify(run));
  }, 1_200_000);

  it('kontrolní běh bez mincovny: jinak stejný – hladina trhu T s mincovnou a bez ní', async () => {
    const run = await runWorld(world, false);
    runs.set('control', run);
    console.log('market-gold-years – bez mincovny', JSON.stringify(run));
    const withMint = runs.get('mint');
    console.log(
      'market-gold-years – hladina T na konci roku',
      JSON.stringify(
        run.years.map((y) => ({
          year: y.year,
          withMint: withMint?.years.find((x) => x.year === y.year)?.end?.levelT,
          withoutMint: y.end?.levelT,
        })),
      ),
    );
  }, 1_200_000);
});
