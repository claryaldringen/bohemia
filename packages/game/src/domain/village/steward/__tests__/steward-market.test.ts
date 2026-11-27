import { describe, expect, it } from 'vitest';
import { dateOfDayIndex } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { marketCrew } from '../../trade/market-trip';
import { stewardDay } from '../steward';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { craftCoverage, craftTargets, smithBarsTargetKg } from '../../crafts/crafts';
import { toolNeedKg } from '../../crafts/iron';
import { breedingCows, oxenCalvesWanted } from '../../livestock/husbandry';
import { GOLD, HONEY, MARKET, TRADE } from '../../rules';
import { STEWARD } from '../../rules/rules-steward';
import { at } from '../../__tests__/horse-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { joinMarket, marketDay } from '../../trade/market';
import { marketStance } from '../../trade/market-stance';
import { applyMarketResult, marketFreeAdults } from '../../trade/market-trip';
import { priceKg, villagerTripsDay } from '../../trade/villager-trips';
import {
  D,
  NOV15,
  homeVillage,
  marketVillage,
  report,
  sownPart,
  villagersHome,
  withNearby,
  withWorkshop,
} from '../../trade/__tests__/market-fixtures';
import { yearlyNeed } from '../../wares/hides';
import type {
  MarketArrival,
  MarketResult,
  NearbyVillage,
  Person,
  TradeGood,
  TradeGoods,
  VillageState,
} from '../../types';
import { needSteps, type NeedContext } from '../steward-needs';
import { stewardGrainStep, stewardGrainTarget, stewardMarketStep } from '../steward-market';
import { newSteward } from '../steward-state';

// Správce na trhu (markets.md – Rozhodnutí plánu 3, bod 8; Martin 22. 11. 2026: „Správce je vlastně
// NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“): obilí v nouzi s rotací
// cílů a roční výprava s potřebou vsi, obojí `departMarketInPlace` s `by: 'steward'`.

const A: NearbyVillage = { villageId: 'a', name: 'Alfov', cells: 1, firstStep: 'E' };
const B: NearbyVillage = { villageId: 'b', name: 'Bořov', cells: 2, firstStep: 'W' };

function ctxOf(state: VillageState, day: number): NeedContext {
  return { day, coverage: craftCoverage(state, day) };
}

/** Vlkov se zapnutým správcem, hřivnami a keramikou, okolím `villages` (výchozí Lhota). */
function stewarded(villages?: NearbyVillage[], day = D): VillageState {
  const s = homeVillage();
  s.lastDay = day;
  s.steward = newSteward(day, true);
  s.crafts = { charcoalKg: 0, potteryKg: 100, ironBarsKg: 5 };
  withNearby(s, day);
  if (villages) s.nearby!.villages = villages.map((v) => ({ ...v }));
  return s;
}

function stewardTrips(s: VillageState) {
  return (s.trade?.expeditions ?? []).filter((e) => e.by === 'steward');
}

/** Jediný příjezd výpravy k hostiteli v odchozí schránce vsi. */
function arrivalOf(s: VillageState): MarketArrival {
  const arrivals = (s.outbox ?? []).flatMap((m) =>
    m.body.kind === 'market-arrive' ? [m.body.arrival] : [],
  );
  if (arrivals.length !== 1) throw new Error(`Příjezdů ve schránce je ${arrivals.length}.`);
  return arrivals[0]!;
}

/** Výsledek trhu výpravy správce (bez obilí, nebo s ním). */
function resultOf(s: VillageState, grainKg: number): MarketResult {
  const key = stewardTrips(s)[0]!.market!.key;
  return {
    key,
    sold: {},
    bought: grainKg > 0 ? { grain: grainKg } : {},
    unsold: {},
    horses: [],
  };
}

describe('správce – obilí v nouzi (Rozhodnutí plánu 3, bod 8)', () => {
  it('chybí 400 kg: výprava do vsi okolí, hřivny a keramika do hodnoty obilí, jindy než dnes nevyrazí', () => {
    const s = stewarded();
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    const trips = stewardTrips(s);
    expect(trips).toHaveLength(1);
    const trip = trips[0]!;
    expect(trip.market).toMatchObject({
      villageId: 'm',
      wants: { grain: 400 },
      stayDays: MARKET.minStayDays,
    });
    // hřivny 5 kg × 45 = 225 kg obilí, zbylých 175 kg keramikou po 3 kg obilí na kg
    expect(Object.keys(trip.give).sort()).toEqual(['ironBars', 'pottery']);
    expect(trip.give.ironBars).toBe(5);
    expect(trip.give.pottery).toBeCloseTo(175 / 3, 6);
    expect(s.crafts!.ironBarsKg).toBe(0);
    expect(s.crafts!.potteryKg).toBeCloseTo(100 - 175 / 3, 6);
    // výprava na cestě – druhý den nic
    s.lastDay = D + 1;
    expect(stewardGrainStep(s, ctxOf(s, D + 1), 400)).toBe(false);
    expect(stewardTrips(s)).toHaveLength(1);
  });

  it('uhlí a klády dává jen z toho, co zbyde: klády jen nad rezervu staveb', () => {
    const s = stewarded();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 0 };
    s.woodLogs = 1_000;
    expect(stewardGrainStep(s, ctxOf(s, D), 100)).toBe(true);
    const trip = stewardTrips(s)[0]!;
    // klády jsou kusy a celé: 100 kg obilí = 3 klády po 40 kg obilí (TRADE_GOOD_VALUES)
    expect(trip.give).toEqual({ logs: 3 });
    expect(s.woodLogs).toBe(997);
  });

  it('cena z poslední zprávy cíle: dražší hřivny, méně kg', () => {
    const s = stewarded();
    s.news = [
      {
        villageId: 'm',
        name: 'Lhota',
        report: { day: D - 2, people: 25, houses: 5, crafts: [], traders: [] },
        prices: { ironBars: 0.5 },
      },
    ];
    expect(stewardGrainStep(s, ctxOf(s, D), 100)).toBe(true);
    // 0,5 mince × 90 kg = 45 kg obilí za kg hřiven – stejně jako výchozí, ale ze zprávy
    expect(stewardTrips(s)[0]!.give.ironBars).toBeCloseTo(100 / 45, 6);
  });

  it('nosiči nejvýš polovina dospělých: bez vozu správce nákup úměrně zmenší', () => {
    const s = stewarded();
    s.carts = [];
    const adults = marketFreeAdults(s, D);
    const maxPorters = Math.max(1, Math.floor(adults * STEWARD.grainPorterShare));
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    const trip = stewardTrips(s)[0]!;
    expect(trip.porters).toBeLessThanOrEqual(maxPorters);
    expect(trip.carts).toBeUndefined();
    // 4 nosiči po 25 kg, 400 kg ÷ (16 nosičů ÷ 4) = 100 kg
    expect(maxPorters).toBe(4);
    expect(trip.market!.wants.grain).toBe(100);
    expect(trip.porters).toBe(4);
  });

  it('méně než nosič unese, bez okolí a s vypnutým správcem nic', () => {
    const s = stewarded();
    expect(stewardGrainStep(s, ctxOf(s, D), TRADE.porterKg - 1)).toBe(false);
    const none = stewarded();
    delete none.nearby;
    expect(stewardGrainStep(none, ctxOf(none, D), 400)).toBe(false);
    const off = stewarded();
    off.steward!.on = false;
    expect(stewardGrainStep(off, ctxOf(off, D), 400)).toBe(false);
    for (const v of [s, none, off]) expect(stewardTrips(v)).toEqual([]);
  });

  it('bez čím platit nikam nejede', () => {
    const s = stewarded();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 0 };
    s.woodLogs = 0;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(false);
    expect(stewardTrips(s)).toEqual([]);
  });

  it('s výpravou vesničanů téhož dne si dělí lidi a vozy: dohromady nejvýš volní dospělí', () => {
    const s = villagersHome();
    s.steward = newSteward(NOV15, true);
    s.crafts = { charcoalKg: 0, potteryKg: 100, ironBarsKg: 5 };
    s.lastDay = NOV15;
    const free = marketFreeAdults(s, NOV15);
    villagerTripsDay(s, NOV15, craftCoverage(s, NOV15));
    const villagersTrip = (s.trade?.expeditions ?? []).find((e) => e.by === 'villagers')!;
    expect(villagersTrip).toBeDefined();
    const left = marketFreeAdults(s, NOV15);
    expect(left).toBe(free - villagersTrip.porters);
    expect(stewardGrainStep(s, ctxOf(s, NOV15), 400)).toBe(true);
    const trip = stewardTrips(s)[0]!;
    expect(trip.porters).toBeLessThanOrEqual(left);
    expect(villagersTrip.porters + trip.porters).toBeLessThanOrEqual(free);
    // vůz odvezli vesničané – správce jde bez něj, ne s týmž vozem
    expect(villagersTrip.carts).toBeDefined();
    expect(trip.carts).toBeUndefined();
  });
});

describe('správce – rotace cílů (Rozhodnutí plánu 3, bod 8)', () => {
  it('prázdný návrat zapíše vsi do grainMisses, příště jede jinam, vyzkoušené všechny = nic', () => {
    const s = stewarded([A, B]);
    expect(stewardGrainTarget(s)).toMatchObject({ villageId: 'a' });
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    expect(stewardTrips(s)[0]!.market!.villageId).toBe('a');

    applyMarketResult(s, D + 2, resultOf(s, 0));
    expect(s.trade!.grainMisses).toEqual({ nearbyDay: s.nearby!.day, villageIds: ['a'] });
    expect(stewardGrainTarget(s)).toMatchObject({ villageId: 'b' });
    s.crafts = { charcoalKg: 0, potteryKg: 100, ironBarsKg: 5 };
    expect(stewardGrainStep(s, ctxOf(s, D + 3), 400)).toBe(true);
    expect(stewardTrips(s)[0]!.market!.villageId).toBe('b');

    applyMarketResult(s, D + 5, resultOf(s, 0));
    expect(s.trade!.grainMisses!.villageIds).toEqual(['a', 'b']);
    expect(stewardGrainTarget(s)).toBeNull();
    s.crafts = { charcoalKg: 0, potteryKg: 100, ironBarsKg: 5 };
    expect(stewardGrainStep(s, ctxOf(s, D + 6), 400)).toBe(false);
    expect(stewardTrips(s)).toEqual([]);

    // nové okolí (jiný den) – seznam neplatí, zase první ves
    s.nearby!.day += 30;
    expect(stewardGrainTarget(s)).toMatchObject({ villageId: 'a' });
    expect(stewardGrainStep(s, ctxOf(s, D + 7), 400)).toBe(true);
    expect(stewardTrips(s)[0]!.market!.villageId).toBe('a');
  });

  it('úspěšný návrat vsi do seznamu nepřidá: ves zůstává cílem', () => {
    const s = stewarded([A, B]);
    s.trade = {
      expeditions: [],
      nextId: 1,
      grainMisses: { nearbyDay: s.nearby!.day, villageIds: ['a'] },
    };
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    expect(stewardTrips(s)[0]!.market!.villageId).toBe('b');
    applyMarketResult(s, D + 3, resultOf(s, 120));
    expect(s.trade!.grainMisses).toEqual({ nearbyDay: s.nearby!.day, villageIds: ['a'] });
    expect(stewardGrainTarget(s)).toMatchObject({ villageId: 'b' });
  });

  it('prázdný návrat vesničanů (neshánějí obilí) ani hráče paměť nemění', () => {
    const s = stewarded();
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    const result = resultOf(s, 0);
    stewardTrips(s)[0]!.by = 'villagers';
    applyMarketResult(s, D + 2, result);
    expect(s.trade!.grainMisses).toBeUndefined();
  });
});

describe('správce – roční výprava s potřebou vsi (návrh Clauda)', () => {
  const NOV15_603 = at(603, 11, 15);

  /** Ves, která shání nástroje (bez kováře) – s okolím [A, B] a správcem. */
  function seeking(day: number): VillageState {
    const s = stewarded([A, B], day);
    s.crafts = { charcoalKg: 0, potteryKg: 10, ironBarsKg: 0 };
    return s;
  }

  it('15. 11. roku 603: cíl nearby.villages[603 % 2] = B, give i wants jako marketStance dne', () => {
    const s = seeking(NOV15_603);
    const stance = marketStance(s, NOV15_603);
    expect(Object.keys(stance.wants).length).toBeGreaterThan(0);
    expect(stewardMarketStep(s, ctxOf(s, NOV15_603))).toBe(true);
    const trip = stewardTrips(s)[0]!;
    expect(trip.market!.villageId).toBe('b');
    expect(trip.market!.wants).toEqual(stance.wants);
    expect(trip.give).toEqual(stance.offer);
  });

  it('jiný den nic; roku 602 cíl A; ves, která nic neshání, nejede', () => {
    const s = seeking(NOV15_603);
    expect(stewardMarketStep(s, ctxOf(s, NOV15_603 - 1))).toBe(false);
    const y602 = seeking(at(602, 11, 15));
    expect(stewardMarketStep(y602, ctxOf(y602, at(602, 11, 15)))).toBe(true);
    expect(stewardTrips(y602)[0]!.market!.villageId).toBe('a');

    // ves s dílnami, krávami a zásobami, která nic neshání
    const calm = seeking(NOV15_603);
    calm.storesKg = 100_000;
    calm.livestock!.herds.cow = 30;
    calm.toolEquipmentKg = 100_000;
    calm.crafts = { charcoalKg: 0, potteryKg: 10_000, ironBarsKg: 0, woodToolsKg: 10_000 };
    expect(Object.keys(marketStance(calm, NOV15_603).wants)).toEqual([]);
    expect(stewardMarketStep(calm, ctxOf(calm, NOV15_603))).toBe(false);
  });

  it('bez okolí a s vypnutým správcem nic; přes needSteps jede též', () => {
    const none = seeking(NOV15_603);
    delete none.nearby;
    expect(stewardMarketStep(none, ctxOf(none, NOV15_603))).toBe(false);
    const off = seeking(NOV15_603);
    off.steward!.on = false;
    expect(stewardMarketStep(off, ctxOf(off, NOV15_603))).toBe(false);
    const s = seeking(NOV15_603);
    needSteps(s, ctxOf(s, NOV15_603));
    expect(stewardTrips(s)).toHaveLength(1);
  });

  it('každý rok: i když 15. 11. není den správce (den % 10), stewardDay výpravu pošle', () => {
    const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
    const obstacles = obstaclesOf(landscape);
    const years = [601, 602, 603, 604, 605, 606].filter(
      (y) => at(y, 11, 15) % STEWARD.everyDays !== 0,
    );
    expect(years.length).toBeGreaterThanOrEqual(3);
    for (const year of years.slice(0, 3)) {
      const day = at(year, 11, 15);
      const s = seeking(day);
      stewardDay(s, day, landscape, obstacles);
      expect(stewardTrips(s), `rok ${year}`).toHaveLength(1);
      expect(stewardTrips(s)[0]!.market!.villageId).toBe(year % 2 === 0 ? 'a' : 'b');
    }
    // jiný den roku, který není den správce, nic
    const other = at(603, 11, 16);
    const s = seeking(other);
    stewardDay(s, other, landscape, obstacles);
    expect(stewardTrips(s)).toEqual([]);
    expect(dateOfDayIndex(at(603, 11, 15)).month).toBe(11);
  });

  it('velká hromada klád a kamene: náklad ročni výpravy v mezi nosnosti volných lidí a vozů', () => {
    const s = seeking(NOV15_603);
    s.woodLogs = 5_000;
    const free = marketFreeAdults(s, NOV15_603);
    expect(stewardMarketStep(s, ctxOf(s, NOV15_603))).toBe(true);
    const trip = stewardTrips(s)[0]!;
    expect(trip.give.logs).toBeGreaterThan(0);
    expect(trip.give.logs).toBeLessThan(5_000);
    expect(trip.porters).toBeLessThanOrEqual(free);
    const carts = trip.carts ? ['four-wheel' as const] : [];
    expect(marketCrew(trip.give, trip.market!.wants, carts).porters).toBeLessThanOrEqual(free);
    // co ves neposlala, zůstává doma
    expect(s.woodLogs).toBe(5_000 - trip.give.logs!);
  });
});

// Mince a drahé zboží napřed (markets.md – Rozhodnutí plánu 4, bod 4; Martin 25. 11. 2026: „Mince
// utrácí jen vojvoda/správce“; pořadí nákladu návrh Clauda).

/** Mince ve vsi a v nákladu výprav správce dohromady. */
function coinsOf(s: VillageState): number {
  return (s.coins ?? 0) + stewardTrips(s).reduce((sum, e) => sum + (e.give.coins ?? 0), 0);
}

describe('správce – obilí v nouzi za mince (Rozhodnutí plánu 4, bod 4)', () => {
  it('30 mincí, chybí 400 kg: 5 mincí (⌈400 ÷ 90⌉) na 450 kg a nic jiného, vsi ubydou hned při odjezdu', () => {
    const s = stewarded();
    s.coins = 30;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    const trip = stewardTrips(s)[0]!;
    expect(trip.give).toEqual({ coins: 5 });
    // seznam placený jen mincemi je na celé mince nahoru (gold.md – Mince 2,4 g, bod 9)
    expect(trip.market!.wants).toEqual({ grain: 450 });
    expect(s.coins).toBe(25);
    expect(s.crafts).toEqual({ charcoalKg: 0, potteryKg: 100, ironBarsKg: 5 });
    expect(s.outbox!.at(-1)!.body).toMatchObject({
      kind: 'market-arrive',
      arrival: { goods: { coins: 5 }, wants: { grain: 450 }, by: 'steward' },
    });
  });

  it('1 mince nestačí: zbytek v pořadí hřivny, keramika, uhlí, klády', () => {
    const s = stewarded();
    s.coins = 1;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    // 1 × 90 + 5 × 45 = 315 kg obilí, zbylých 85 kg keramikou po 3 kg obilí za kg
    expect(stewardTrips(s)[0]!.give).toEqual({
      coins: 1,
      ironBars: 5,
      pottery: expect.closeTo(85 / 3, 6),
    });
    expect(s.coins).toBeUndefined();

    const all = stewarded();
    all.coins = 1;
    all.crafts = { charcoalKg: 200, potteryKg: 10, ironBarsKg: 1 };
    all.woodLogs = 1_000;
    expect(stewardGrainStep(all, ctxOf(all, D), 400)).toBe(true);
    // 90 + 45 + 30 + 100 = 265 kg obilí, zbylých 135 kg jsou 4 klády po 40 kg obilí
    expect(stewardTrips(all)[0]!.give).toEqual({
      coins: 1,
      ironBars: 1,
      pottery: 10,
      charcoal: 200,
      logs: 4,
    });
  });

  it('hladina 2 ve zprávě cíle: mince platí polovinu – na totéž 9 mincí (8,89)', () => {
    const s = stewarded();
    s.coins = 60;
    s.news = [{ villageId: 'm', name: 'Lhota', report, level: 2 }];
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    expect(stewardTrips(s)[0]!.give).toEqual({ coins: 9 });
    expect(s.coins).toBe(51);
  });

  it('nákup za mince drží nosnost cesty domů: bez vozu 4 nosiči, 90 kg obilí za 1 minci', () => {
    const s = stewarded();
    s.carts = [];
    s.coins = 30;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    const trip = stewardTrips(s)[0]!;
    // 4 nosiči unesou 100 kg – dolů na celé mince, které se vejdou (gold.md – Mince 2,4 g, bod 9)
    expect(trip.market!.wants).toEqual({ grain: 90 });
    expect(trip.porters).toBe(4);
    expect(trip.give).toEqual({ coins: 1 });
    expect(s.coins).toBe(29);
  });

  it('chybí 400 kg, cena 1/90 mince za kg: seznam na celé mince nahoru – 450 kg za 5 mincí', () => {
    const s = stewarded();
    s.coins = 30;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    const trip = stewardTrips(s)[0]!;
    // za kg se platí celé mince dolů – 400 kg (4,44) by bylo 360 kg, 450 kg je aspoň potřeba
    expect(trip.market!.wants).toEqual({ grain: 450 });
    expect(trip.give).toEqual({ coins: 5 });
  });

  for (const [host, spareKg, boughtKg, spent] of [
    // chybí 400 kg (4,44 mince) – správce zadá 450 kg na celých 5 mincí (gold.md – Mince 2,4 g, bod 9)
    ['s obilím nad pojistkou prodá 450 kg za 5 mincí', 1_000, 450, 5],
    ['bez obilí neprodá nic a mince přijdou domů', -3_000, 0, 0],
  ] as const) {
    it(`na trhu: hostitel ${host}; mince ani obilí nevzniknou ani nezmizí`, () => {
      const h = stewarded();
      h.coins = 30;
      const m = marketVillage(-spareKg);
      const grain = h.storesKg + m.storesKg;
      expect(stewardGrainStep(h, ctxOf(h, D), 400)).toBe(true);
      const sent = h.outbox!.at(-1)!;
      if (sent.body.kind !== 'market-arrive') throw new Error('Příjezd k hostiteli chybí.');
      joinMarket(m, sent.day, sent.body.arrival);
      marketDay(m, sent.day);
      const back = m.outbox!.at(-1)!;
      if (back.body.kind !== 'market-result') throw new Error('Výsledek trhu chybí.');
      applyMarketResult(h, back.day, back.body.result);
      expect(back.body.result.bought.grain ?? 0).toBeCloseTo(boughtKg, 6);
      expect(h.coins).toBe(30 - spent);
      expect(m.coins ?? 0).toBe(spent);
      expect(h.storesKg + m.storesKg).toBeCloseTo(grain, 6);
      expect(stewardTrips(h)).toEqual([]);
    });
  }
});

describe('správce – roční výprava s mincemi, drahé zboží napřed (Rozhodnutí plánu 4, bod 4)', () => {
  const DAY = at(603, 11, 15);

  /**
   * Ves bez vozu s `adults` volnými dospělými (nosič unese 25 kg), které nic nechybí ani nepřebývá –
   * co nabídne a co shání, doplní test.
   */
  function settled(adults: number): VillageState {
    const s = stewarded([A, B], DAY);
    s.carts = [];
    // ve dvorci jsou 4 dospělí a chlapec (poslední), ostatní jinde
    const manor = s.people.filter((p) => p.dwellingId === s.manorId);
    const dwellingId = s.people.find((p) => p.dwellingId !== s.manorId)!.dwellingId;
    s.people = [
      ...manor.slice(0, adults),
      ...Array.from({ length: Math.max(0, adults - 4) }, (_, i): Person => ({
        id: 20 + i,
        bornDay: DAY - Math.ceil((26 + i) * 365.25),
        dwellingId,
        sex: i % 2 === 0 ? 'male' : 'female',
      })),
    ];
    s.livestock!.herds.cow = Math.ceil(breedingCows(s) + oxenCalvesWanted(s, DAY));
    const { potteryKg, woodToolsKg } = craftTargets(s, DAY);
    s.crafts = { charcoalKg: 0, potteryKg, ironBarsKg: 0, woodToolsKg };
    s.toolEquipmentKg = toolNeedKg(s, DAY);
    s.storesKg = 0;
    s.storesKg = marketStance(s, DAY).wants.grain!;
    expect(marketFreeAdults(s, DAY)).toBe(adults);
    expect(marketStance(s, DAY)).toEqual({ offer: {}, wants: {} });
    return s;
  }

  /** Ves nad svou potřebu nabídne `waxKg` vosku, `furs` kožešin a (s obilím) `honeyKg` medu. */
  function withWares(s: VillageState, waxKg: number, furs: number, honeyKg: number): VillageState {
    s.wares = {
      hides: 0,
      sheepFurs: 0,
      wildFurs: furs + yearlyNeed(s, DAY).furs,
      honeyKg: honeyKg + HONEY.kgPerPersonYear * s.people.length,
      waxKg,
    };
    return s;
  }

  /** Zásoby vsi, které testy vozí (bez zaokrouhlení). */
  const stocks = (s: VillageState): TradeGoods => ({
    grain: s.storesKg,
    honey: s.wares?.honeyKg ?? 0,
    wax: s.wares?.waxKg ?? 0,
    furs: (s.wares?.sheepFurs ?? 0) + (s.wares?.wildFurs ?? 0),
    tools: s.toolEquipmentKg ?? 0,
    coins: s.coins ?? 0,
  });

  /** Roční výprava vyrazí – výprava a kontrola, že z vsi ubyl jen její náklad. */
  function yearlyTrip(s: VillageState) {
    const before = stocks(s);
    expect(stewardMarketStep(s, ctxOf(s, DAY))).toBe(true);
    const trips = stewardTrips(s);
    expect(trips).toHaveLength(1);
    const trip = trips[0]!;
    const after = stocks(s);
    for (const good of Object.keys(before) as TradeGood[]) {
      expect(after[good], good).toBeCloseTo(before[good]! - (trip.give[good] ?? 0), 6);
    }
    return { ...trip, wants: trip.market!.wants };
  }

  /** Náklad nebo seznam: právě tyto druhy, množství na 6 míst. */
  function expectGoods(goods: TradeGoods, load: TradeGoods): void {
    expect(Object.keys(goods).sort()).toEqual(Object.keys(load).sort());
    for (const good of Object.keys(load) as TradeGood[]) {
      expect(goods[good], good).toBeCloseTo(load[good]!, 6);
    }
  }

  it('mince nejvýš v hodnotě seznamu navíc ke zboží: 300 kg obilí = 4 ze 40 mincí (3,33 nahoru)', () => {
    const s = withWares(settled(12), 16, 123, 0);
    s.storesKg -= 300;
    s.coins = 40;
    expect(marketStance(s, DAY)).toEqual({ offer: { wax: 16, furs: 123 }, wants: { grain: 300 } });
    const trip = yearlyTrip(s);
    expect(trip.wants).toEqual({ grain: 300 });
    expect(trip.give).toEqual({ wax: 16, furs: 123, coins: 4 });
    expect(trip.porters).toBe(12);
    expect(s.coins).toBe(36);
  });

  it('mincí je míň než hodnota seznamu – všechny; hladina cíle 2 – dvakrát tolik; bez mincí nic', () => {
    const short = (coins: number): VillageState => {
      const s = settled(12);
      s.storesKg -= 300;
      if (coins > 0) s.coins = coins;
      return s;
    };
    const few = short(2);
    expect(yearlyTrip(few).give).toEqual({ coins: 2 });
    expect(few.coins).toBeUndefined();
    const inflated = short(50);
    // cíl roku 603 je B
    inflated.news = [
      { villageId: 'a', name: 'Alfov', report, level: 5 },
      { villageId: 'b', name: 'Bořov', report, level: 2 },
    ];
    // 300 kg po 2/90 = 6,67 mince – 315 kg (7 mincí) se nevejde, dolů na 270 kg za 6
    expect(yearlyTrip(inflated).give).toEqual({ coins: 6 });
    // cena obilí ze zprávy cíle: 0,1 mince za kg místo 1/90 – 30 mincí
    const dear = short(50);
    dear.news = [{ villageId: 'b', name: 'Bořov', report, prices: { grain: 0.1 } }];
    expect(yearlyTrip(dear).give).toEqual({ coins: 30 });
    expect(yearlyTrip(short(0)).give).toEqual({});
  });

  it('posádka plná obilím s mincemi vyjede – mince nosiče nepřidají', () => {
    const s = settled(8);
    s.storesKg += 14_500;
    s.toolEquipmentKg! -= 10;
    s.coins = 5;
    const free = marketFreeAdults(s, DAY);
    const trip = yearlyTrip(s);
    // 10 kg nástrojů × 60 kg obilí = 600 kg = 6,67 mince, ves jich má 5
    expect(trip.wants).toEqual({ tools: 10 });
    expectGoods(trip.give, { grain: 200, coins: 5 });
    expect(trip.porters).toBe(free);
  });

  for (const [adults, load] of [
    [8, { wax: 16, furs: 123, honey: 61 }],
    [12, { wax: 16, furs: 123, honey: 142, grain: 19 }],
    [5, { wax: 16, furs: 109 }],
  ] as [number, TradeGoods][]) {
    it(`med a kožešiny před obilím: ${adults} dospělých naloží ${JSON.stringify(load)}, šum ne`, () => {
      const s = withWares(settled(adults), 16, 123, 142);
      s.storesKg += 14_500;
      s.toolEquipmentKg! -= 2;
      expect(marketStance(s, DAY)).toEqual({
        offer: { grain: 14_500, wax: 16, furs: 123, honey: 142 },
        wants: { tools: 2 },
      });
      const trip = yearlyTrip(s);
      expect(trip.wants).toEqual({ tools: 2 });
      expectGoods(trip.give, load);
      expect(trip.porters).toBe(adults);
    });
  }

  // nástroje 60, hřivny 45, vosk 30, kožešiny 8, med 6, keramika 3, dřevěné nářadí 2, obilí 1
  // a klády 0,4 kg obilí na kg; 18 dospělých nese po obilí ještě kládu (dva lidé)
  for (const [adults, load] of [
    [5, { tools: 40, ironBars: 40, wax: 45 }],
    [8, { tools: 40, ironBars: 40, wax: 50, furs: 60, honey: 10 }],
    [12, { tools: 40, ironBars: 40, wax: 50, furs: 60, honey: 60, pottery: 50 }],
    [14, { tools: 40, ironBars: 40, wax: 50, furs: 60, honey: 60, pottery: 60, woodTools: 40 }],
    [
      18,
      {
        tools: 40,
        ironBars: 40,
        wax: 50,
        furs: 60,
        honey: 60,
        pottery: 60,
        woodTools: 60,
        grain: 30,
        logs: 1,
      },
    ],
  ] as [number, TradeGoods][]) {
    it(`drahé napřed – pořadí hodnoty na kg: ${adults} dospělých`, () => {
      const s = withWares(settled(adults), 50, 60, 60);
      s.storesKg += 30;
      s.toolEquipmentKg! += 40;
      s.crafts!.ironBarsKg = smithBarsTargetKg(s, DAY) + 40;
      s.crafts!.potteryKg += 60;
      s.crafts!.woodToolsKg! += 60;
      s.woodLogs = 5;
      s.livestock!.herds.cow -= 1;
      expect(marketStance(s, DAY).wants).toEqual({ cows: 1 });
      const trip = yearlyTrip(s);
      expect(trip.wants).toEqual({ cows: 1 });
      expectGoods(trip.give, load);
      expect(trip.porters).toBe(adults);
    });
  }

  it('cesta domů: z tisíců kg obilí 8 lidí unese 200 kg – dolů na celé mince 180 kg a 2 mince', () => {
    const s = settled(8);
    s.storesKg = 0;
    s.coins = 400;
    expect(marketStance(s, DAY).wants.grain).toBeGreaterThan(3_000);
    const trip = yearlyTrip(s);
    expectGoods(trip.wants, { grain: 180 }); // 200 ÷ 90 = 2,22 – 270 kg se nevejde, dolů 2 mince
    expect(trip.porters).toBe(8);
    expect(trip.give).toEqual({ coins: 2 });
    expect(s.coins).toBe(398);
  });

  it('seznam na cestu domů v témže pořadí: krávy s honákem, nástroje, obilí do zbytku nosičů', () => {
    const s = settled(8);
    s.storesKg = 0;
    s.toolEquipmentKg! -= 10;
    s.livestock!.herds.cow -= 2;
    s.coins = 400;
    const trip = yearlyTrip(s);
    // honák a 7 nosičů se 175 kg; 2 × 600 + 10 × 60 + 165 = 1 965 kg obilí = 21,83 mince – víc se
    // nevejde, dolů na 21 mincí: zboží v kg se ubere od konce jako na trhu (nástroje 8,75 kg)
    expectGoods(trip.wants, { cows: 2, tools: 8.75, grain: 165 });
    expect(trip.porters).toBe(8);
    expect(trip.give).toEqual({ coins: 21 });
  });

  it('s vozem unese seznam víc: celý seznam, na celé mince nahoru', () => {
    const s = settled(8);
    s.carts = [{ id: 1, kind: 'four-wheel', builtDay: DAY - 10 }];
    s.storesKg -= 400;
    s.coins = 400;
    const { wants } = marketStance(s, DAY);
    expect(wants.grain).toBeCloseTo(400, 6);
    const trip = yearlyTrip(s);
    // 400 kg (4,44 mince) nahoru na 5 mincí = 450 kg
    expect(Object.keys(trip.wants)).toEqual(['grain']);
    expect(trip.wants.grain).toBeCloseTo(450, 6);
    expect(trip.carts).toEqual([1]);
    expect(trip.give).toEqual({ coins: 5 });
  });

  it('tam i domů jede táž posádka: s krávou a nástroji domů dva lidé vůz nevezou, tam nesou 50 kg', () => {
    const s = settled(2);
    s.carts = [{ id: 1, kind: 'four-wheel', builtDay: DAY - 10 }];
    s.storesKg += 14_500;
    s.toolEquipmentKg! -= 10;
    s.livestock!.herds.cow -= 1;
    const trip = yearlyTrip(s);
    // domů honák a nosič; s vozem (dva lidé) by kráva potřebovala třetího
    expect(trip.wants).toEqual({ cows: 1, tools: 10 });
    expectGoods(trip.give, { grain: 50 });
    expect(trip.porters).toBe(2);
    expect(trip.carts).toBeUndefined();
  });

  it('lidé z nabídky jdou jako zboží a nosiči nejsou: seznam unese jen těch pět, kteří zůstanou', () => {
    const s = settled(8);
    s.fields = [{ id: 1 }];
    s.parts = [sownPart(100)];
    s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
    s.storesKg = 0;
    s.coins = 400;
    expect(marketStance(s, DAY).offer).toMatchObject({ men: 2, women: 1 });
    const people = s.people.length;
    const trip = yearlyTrip(s);
    expect(trip.give).toMatchObject({ men: 2, women: 1, coins: 2 });
    expect(s.people).toHaveLength(people - 3);
    expectGoods(trip.wants, { grain: 125 });
    expect(trip.porters).toBe(5);
  });

  it('otroky z nabídky hráče roční výprava nebere – ani jako muže a ženy, zůstanou doma (podle id)', () => {
    // Rozhodnutí plánu 5, bod 8 (návrh Clauda): správce otroky zatím neprodává ani nekupuje
    const s = settled(8);
    s.fields = [{ id: 1 }];
    s.parts = [sownPart(100)];
    s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
    s.storesKg = 0;
    s.coins = 400;
    // bez nabídky otroků jdou jako muži 22 a 20 a jako žena 23
    const before = structuredClone(s);
    expect(stewardMarketStep(before, ctxOf(before, DAY))).toBe(true);
    const freeArrival = arrivalOf(before);
    expect(freeArrival.people!.map((g) => [g.good, g.people.map((p) => p.id)])).toEqual([
      ['men', [22]],
      ['men', [20]],
      ['women', [23]],
    ]);
    for (const id of [22, 23]) s.people.find((p) => p.id === id)!.slave = true;
    s.slavesForSale = 2;
    expect(marketStance(s, DAY).offer).toMatchObject({ slaves: 2, men: 1 });
    const trip = yearlyTrip(s);
    expect(trip.give).not.toHaveProperty('slaves');
    expect(trip.give).toMatchObject({ men: 1 });
    const arrival = arrivalOf(s);
    expect(arrival.goods).not.toHaveProperty('slaves');
    expect(arrival.people!.map((g) => [g.good, g.people.map((p) => p.id)])).toEqual([
      ['men', [20]],
    ]);
    expect(s.people.filter((p) => p.id === 22 || p.id === 23).map((p) => p.id)).toEqual([22, 23]);
    expect(s.slavesForSale).toBe(2);
  });

  it('seznam jen do miligramu je šum: ves nic neshání a výprava nejede', () => {
    const s = settled(8);
    s.toolEquipmentKg! -= 5e-7;
    expect(marketStance(s, DAY).wants.tools).toBeGreaterThan(0);
    expect(stewardMarketStep(s, ctxOf(s, DAY))).toBe(false);
    expect(stewardTrips(s)).toEqual([]);
  });

  it('obilí v nouzi a roční výprava téhož dne: každá mince jen jednou', () => {
    const s = settled(8);
    s.storesKg = 0;
    s.toolEquipmentKg! -= 10;
    s.coins = 9;
    needSteps(s, ctxOf(s, DAY));
    const trips = stewardTrips(s);
    expect(trips.map((e) => Object.keys(e.market!.wants))).toEqual([['grain'], ['grain', 'tools']]);
    // nouze: 4 nosiči, 100 kg obilí za 2 mince; zbylí 4 lidé 10 kg nástrojů a 90 kg obilí – chtějí
    // 690 kg = 7,67 → 8 mincí, ve vsi jich po prvním odjezdu zbylo 7
    expect(trips.map((e) => e.give.coins)).toEqual([2, 7]);
    expect(s.coins).toBeUndefined();
    expect(coinsOf(s)).toBe(9);
    // neutracené mince přijdou domů
    for (const trip of trips) {
      const key = trip.market!.key;
      const unsold = { coins: trip.give.coins! };
      applyMarketResult(s, DAY + 2, { key, sold: {}, bought: {}, unsold, horses: [] });
    }
    expect(s.coins).toBe(9);
    expect(coinsOf(s)).toBe(9);
  });

  it('u kováře: co má, koupí výprava za mince, na zbytek nechá zakázku; mince i nástroje sedí', () => {
    const s = settled(8);
    s.toolEquipmentKg! -= 10;
    s.coins = 100;
    // hostitel nad pojistkou s pracujícím kovářem a 4 kg nástrojů nad potřebu
    const m = marketVillage(-1_000);
    withWorkshop(m, 'smith', 700, { oreKg: 500 });
    m.crafts = { charcoalKg: 5_000, potteryKg: 0, ironBarsKg: smithBarsTargetKg(m, DAY + 1) };
    m.toolEquipmentKg = toolNeedKg(m, DAY + 1) + 4;
    const tools = s.toolEquipmentKg! + m.toolEquipmentKg;
    expect(yearlyTrip(s).give).toEqual({ coins: 7 }); // 10 kg nástrojů = 600 kg = 6,67 mince
    const sent = s.outbox!.at(-1)!;
    if (sent.body.kind !== 'market-arrive') throw new Error('Příjezd k hostiteli chybí.');
    joinMarket(m, sent.day, sent.body.arrival);
    marketDay(m, sent.day);
    const back = m.outbox!.at(-1)!;
    if (back.body.kind !== 'market-result') throw new Error('Výsledek trhu chybí.');
    const { result } = back.body;
    // hostitel má 4 kg nástrojů nad potřebu za 240 kg = 2,67 mince – za celé mince dolů 2 mince = 3 kg
    // (gold.md – Mince 2,4 g, bod 9), zbylých 1 kg (0,67) je pod minci; 5 mincí se vrátí
    // seznam 10 kg (6,67 mince) nahoru na 7 mincí = 10,5 kg – zakázka na zbylých 7,5 kg
    expect(result).toMatchObject({ unsold: { coins: 5 }, ordered: { tools: 7.5 } });
    expect(result.bought).toEqual({ tools: expect.closeTo(3, 9) });
    applyMarketResult(s, back.day, result);
    expect([s.coins, m.coins]).toEqual([98, 2]);
    expect(s.toolEquipmentKg! + m.toolEquipmentKg!).toBeCloseTo(tools, 9);
    expect(m.market!.orders).toMatchObject([{ villageId: 'h', good: 'tools', amount: 7.5 }]);
    expect(s.orders).toMatchObject([
      { villageId: 'b', good: 'tools', amount: 7.5, status: 'open' },
    ]);
  });

  it('po kouscích stejně jako vcelku přes 15. 11. – mince i schránka', { timeout: 120_000 }, () => {
    const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
    const obstacles = obstaclesOf(landscape);
    const start = at(603, 11, 5);
    const site = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
    const s = withBuiltFirstDwelling({
      ...foundVillage({
        seed: 11,
        day: start,
        dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
      }),
      steward: newSteward(start, true),
    });
    const dwellingId = s.people[0]!.dwellingId;
    for (let id = 900; marketFreeAdults(s, start) < 8; id++) {
      s.people.push({ id, bornDay: start - 25 * 365, dwellingId, sex: id % 2 ? 'male' : 'female' });
    }
    s.nextId = 1_000;
    withNearby(s, start);
    s.nearby!.villages = [{ ...A }, { ...B }];
    s.storesKg = 300;
    s.coins = 30;
    withWares(s, 16, 123, 0);
    const end = start + 20;
    const whole = advanceVillage(s, end, obstacles, landscape);
    let parts = s;
    for (const day of [start + 4, DAY - 1, DAY, DAY + 1, end]) {
      parts = advanceVillage(parts, day, obstacles, landscape);
    }
    expect(JSON.stringify(parts)).toBe(JSON.stringify(whole));
    const yearly = stewardTrips(whole).find((e) => e.startedDay === DAY + 1)!;
    expect(yearly.give.wax).toBe(16);
    expect(yearly.give.coins).toBeGreaterThan(0);
    expect(coinsOf(whole)).toBe(30);
  });
});

// Zlato až po mincích a zboží (gold.md – Rozhodnutí plánu 6, bod 8 – návrh Clauda; Martin
// 22. 11. 2026: „Zlato lze měnt za mince s kýmkoliv, kdo ty mince má“).

describe('správce – zlato po mincích a zboží (plán 6)', () => {
  const DAY = at(603, 11, 15);

  it('cena zlata u cíle = cena mince ÷ 2,4: hladina 2 dá 18,75 kg obilí za gram, bez zprávy 37,5', () => {
    const s = stewarded();
    s.news = [{ villageId: 'm', name: 'Lhota', report, level: 2 }];
    expect(priceKg(s, 'm', 'gold')).toBeCloseTo(18.75, 9);
    expect(priceKg(s, 'm', 'gold')).toBeCloseTo(priceKg(s, 'm', 'coins') / GOLD.coinGrams, 9);
    expect(priceKg(s, 'neznámá', 'gold')).toBeCloseTo(MARKET.grainKgPerCoin / GOLD.coinGrams, 9);
  });

  it('obilí v nouzi: 0 mincí, 100 g zlata a hřivny – napřed hřivny, zlato jen zbytek ceny', () => {
    const s = stewarded();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 5 };
    s.gold = 100;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    // 5 hřiven = 225 kg obilí, zbylých 175 kg = ⌈175 ÷ 90⌉ = 2 mince = 4,8 g → 5 g zlata
    expect(stewardTrips(s)[0]!.give).toEqual({ ironBars: 5, gold: 5 });
    expect(s.gold).toBe(95);
  });

  it('ves bez zlata platí jako dosud', () => {
    const s = stewarded();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 5 };
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    expect(stewardTrips(s)[0]!.give).toEqual({ ironBars: 5 });
    expect(stewardTrips(s)[0]!.market!.wants).toEqual({ grain: 225 });
    expect(s.gold).toBeUndefined();
  });

  it('mince se zlatu nepletou: 2 mince napřed, zlato až na zbytek', () => {
    const s = stewarded();
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 0 };
    s.coins = 2;
    s.gold = 100;
    expect(stewardGrainStep(s, ctxOf(s, D), 400)).toBe(true);
    // 2 mince = 180 kg obilí, zbylých 220 kg = ⌈220 ÷ 90⌉ = 3 mince = 7,2 g → 8 g zlata
    expect(stewardTrips(s)[0]!.give).toEqual({ coins: 2, gold: 8 });
    expect(s.gold).toBe(92);
  });

  it('hladová ves bez mincí v okolí: zboží koupí obilí, zlato se vrátí a hostiteli nezůstane', () => {
    const h = stewarded();
    h.crafts = { charcoalKg: 0, potteryKg: 100, ironBarsKg: 0 };
    h.gold = 100;
    const m = marketVillage(-1_000);
    expect(stewardGrainStep(h, ctxOf(h, D), 400)).toBe(true);
    const sent = h.outbox!.at(-1)!;
    if (sent.body.kind !== 'market-arrive') throw new Error('Příjezd k hostiteli chybí.');
    joinMarket(m, sent.day, sent.body.arrival);
    marketDay(m, sent.day);
    const back = m.outbox!.at(-1)!;
    if (back.body.kind !== 'market-result') throw new Error('Výsledek trhu chybí.');
    applyMarketResult(h, back.day, back.body.result);
    // hostitel nemá mince – zlato neměnil, obilí šlo za keramiku (100 kg × 3 = 300 kg obilí)
    expect(back.body.result.bought.grain ?? 0).toBeGreaterThan(200);
    expect(h.gold ?? 0).toBe(100);
    expect(m.gold ?? 0).toBe(0);
    expect(stewardTrips(h)).toEqual([]);
  });

  it('roční výprava: 2 mince a 100 g zlata na seznam za 300 kg – 270 kg za 2 mince a 3 g zlata', () => {
    const s = settled12();
    s.storesKg -= 300;
    s.coins = 2;
    s.gold = 100;
    expect(stewardMarketStep(s, ctxOf(s, DAY))).toBe(true);
    const trip = stewardTrips(s)[0]!;
    // 300 kg (3,33 mince) – 360 kg 12 lidí neunese, dolů na 270 kg za 3 mince: 2 mince a 1 mince
    // zlatem = 2,4 g → 3 g
    expect(trip.give).toEqual({ coins: 2, gold: 3 });
    expect(trip.porters).toBe(11); // 270 kg po 25 kg
    expect(s.gold).toBe(97);
    // bez zlata totéž s týmiž nosiči
    const plain = settled12();
    plain.storesKg -= 300;
    plain.coins = 2;
    expect(stewardMarketStep(plain, ctxOf(plain, DAY))).toBe(true);
    expect(stewardTrips(plain)[0]!.give).toEqual({ coins: 2 });
    expect(stewardTrips(plain)[0]!.porters).toBe(trip.porters);
  });

  it('roční výprava: hladina 2 – seznam za 7 mincí, zlato dorovná po mincích', () => {
    const s = settled12();
    s.storesKg -= 300;
    s.coins = 3;
    s.gold = 100;
    s.news = [{ villageId: 'b', name: 'Bořov', report, level: 2 }];
    expect(stewardMarketStep(s, ctxOf(s, DAY))).toBe(true);
    // mince platí 45 kg: 300 kg = 6,67 mince – 315 kg se nevejde, dolů na 270 kg za 6 mincí:
    // 3 mince a 3 mince zlatem = 7,2 g → 8 g
    expect(stewardTrips(s)[0]!.give).toEqual({ coins: 3, gold: 8 });
  });

  /** Ves bez vozu s 12 volnými dospělými, které nic nechybí (jako `settled` výš). */
  function settled12(): VillageState {
    const s = stewarded([A, B], DAY);
    s.carts = [];
    const manor = s.people.filter((p) => p.dwellingId === s.manorId);
    const dwellingId = s.people.find((p) => p.dwellingId !== s.manorId)!.dwellingId;
    s.people = [
      ...manor.slice(0, 12),
      ...Array.from({ length: 8 }, (_, i): Person => ({
        id: 20 + i,
        bornDay: DAY - Math.ceil((26 + i) * 365.25),
        dwellingId,
        sex: i % 2 === 0 ? 'male' : 'female',
      })),
    ];
    s.livestock!.herds.cow = Math.ceil(breedingCows(s) + oxenCalvesWanted(s, DAY));
    const { potteryKg, woodToolsKg } = craftTargets(s, DAY);
    s.crafts = { charcoalKg: 0, potteryKg, ironBarsKg: 0, woodToolsKg };
    s.toolEquipmentKg = toolNeedKg(s, DAY);
    s.storesKg = 0;
    s.storesKg = marketStance(s, DAY).wants.grain!;
    return s;
  }
});
