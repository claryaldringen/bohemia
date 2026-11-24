import { describe, expect, it } from 'vitest';
import { dateOfDayIndex } from '../../../calendar';
import { CURRENT_LAYER_VERSIONS, generateLandscape, obstaclesOf } from '../../../landscape';
import { marketCrew } from '../../trade/market-trip';
import { stewardDay } from '../steward';
import { craftCoverage } from '../../crafts/crafts';
import { MARKET, TRADE } from '../../rules';
import { STEWARD } from '../../rules/rules-steward';
import { at } from '../../__tests__/horse-fixtures';
import { marketStance } from '../../trade/market-stance';
import { applyMarketResult, marketFreeAdults } from '../../trade/market-trip';
import { villagerTripsDay } from '../../trade/villager-trips';
import {
  D,
  NOV15,
  homeVillage,
  villagersHome,
  withNearby,
} from '../../trade/__tests__/market-fixtures';
import type { MarketResult, NearbyVillage, VillageState } from '../../types';
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
        prices: { ironBars: 3 },
      },
    ];
    expect(stewardGrainStep(s, ctxOf(s, D), 100)).toBe(true);
    // 3 mince × 15 kg = 45 kg obilí za kg hřiven – stejně jako výchozí, ale ze zprávy
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
