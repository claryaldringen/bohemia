import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { cartIronBarsKg, craftCoverage, craftTargets } from '../../crafts/crafts';
import { CARPENTRY, CRAFT_BUYING, MARKET, SEED_RESERVE } from '../../rules';
import { toolEquipmentKg, toolNeedKg } from '../../crafts/iron';
import { windowSeedNeedKg } from '../../fields/seed';
import { seedShortKg } from '../../fields/seed-reserve';
import { breedingCows, oxenCalvesWanted, surplusCows } from '../../livestock/husbandry';
import type { ChronicleEvent, PlacedOrder, VillageState } from '../../types';
import { at } from '../../__tests__/horse-fixtures';
import { dwelling, trackedVillage, type KinSpec } from '../../__tests__/kin-fixtures';
import { planVillagerPurchases, villagerTripsDay } from '../villager-trips';
import {
  NOV14,
  NOV15,
  homeVillage,
  sownPart,
  villagersHome,
  withNearby,
  withNews,
  withWorkshop,
} from './market-fixtures';

// Vesničané na trhu (markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7): jen ves s okolím, cíle
// z okolí, výprava `by: 'villagers'` přes `departMarketInPlace`.

const NOV20 = at(601, 11, 20);
const SEP1 = at(601, 9, 1);
const villagers = villagersHome;

type Departed = Extract<ChronicleEvent, { kind: 'market-departed' }>;

/** Krok dne na kopii – kopie po kroku. */
function stepped(s: VillageState, day: number): VillageState {
  const copy = structuredClone(s);
  villagerTripsDay(copy, day, craftCoverage(copy, day));
  return copy;
}

function marketTrips(s: VillageState) {
  return (s.trade?.expeditions ?? []).filter((e) => e.kind === 'market');
}

describe('vesničané na trhu – výrobky 15. 11. (Rozhodnutí plánu 3, bod 7)', () => {
  it('bez okolí nikam: stav beze změny, odchozí schránka žádná', () => {
    const s = villagers();
    delete s.nearby;
    expect(planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15))).toEqual([]);
    const after = stepped(s, NOV15);
    expect(after.outbox).toBeUndefined();
    expect(after).toEqual(s);
  });

  it('s okolím a zprávou o kováři: 15. 11. výprava pro nástroje za obilí, 14. 11. nic', () => {
    const s = villagers();
    const plans = planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15));
    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan).toMatchObject({ good: 'tools', villageId: 'm', worthIt: true });
    expect(plan.amount).toBeGreaterThan(CRAFT_BUYING.minKg);
    expect(plan.amount).toBeLessThanOrEqual(craftTargets(s, NOV15).toolsKg - toolEquipmentKg(s));
    // nástroje 60 kg obilí za kg (bez cen ze zprávy výchozí), platí se obilím
    expect(plan.pay.grain).toBeCloseTo(plan.amount * 60, 6);
    expect(plan.savedManDays).toBeGreaterThan(plan.costManDays);

    expect(stepped(s, NOV14)).toEqual(s);
    const after = stepped(s, NOV15);
    const trips = marketTrips(after);
    expect(trips).toHaveLength(1);
    const trip = trips[0]!;
    expect(trip).toMatchObject({
      by: 'villagers',
      startedDay: NOV15 + 1,
      market: { villageId: 'm', stayDays: MARKET.minStayDays },
    });
    expect(trip.market!.wants).toEqual({ tools: plan.amount });
    expect(trip.give.grain).toBeCloseTo(plan.amount * 60, 6);
    expect(s.storesKg - after.storesKg).toBeCloseTo(plan.amount * 60, 6);
    const departed = after.chronicle.filter((e): e is Departed => e.kind === 'market-departed');
    expect(departed).toEqual([
      expect.objectContaining({
        day: NOV15,
        villageName: 'Lhota',
        villageId: 'm',
        by: 'villagers',
      }),
    ]);
    expect(after.outbox).toEqual([
      expect.objectContaining({ villageId: 'm', day: NOV15 + 1, ref: `${trip.market!.key}:in` }),
    ]);
    const arrival = after.outbox![0]!.body;
    expect(arrival).toMatchObject({ kind: 'market-arrive', arrival: { firstStep: 'E' } });
  });

  it('zpráva bez kováře – pro nástroje nikam; vlastní pracující kovář – nikam', () => {
    const potter = villagers(['potter']);
    expect(
      planVillagerPurchases(potter, NOV15, craftCoverage(potter, NOV15)).map((p) => p.good),
    ).not.toContain('tools');
    expect(
      marketTrips(stepped(potter, NOV15)).flatMap((e) => Object.keys(e.market!.wants)),
    ).not.toContain('tools');
    const smith = villagers();
    withWorkshop(smith, 'smith', 700, { oreKg: 500 });
    smith.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    expect(planVillagerPurchases(smith, NOV15, craftCoverage(smith, NOV15))).toEqual([]);
    expect(marketTrips(stepped(smith, NOV15))).toEqual([]);
  });
});

describe('vesničané na trhu – zakázky (Rozhodnutí plánu 3, bod 6)', () => {
  const open: PlacedOrder = {
    villageId: 'm',
    name: 'Lhota',
    good: 'tools',
    amount: 10,
    day: NOV14 - 30,
    status: 'open',
  };

  it('otevřená zakázka na nástroje – 15. 11. pro nástroje nejede', () => {
    const s = villagers();
    s.orders = [{ ...open }];
    expect(planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15))).toEqual([]);
    expect(marketTrips(stepped(s, NOV15))).toEqual([]);
  });

  it('zakázka odmítnutá v cíli – rok tam nástroje nehledá', () => {
    const s = villagers();
    s.orders = [{ ...open, status: 'refused' }];
    expect(planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15))).toEqual([]);
  });

  it('order-ready 20. 11. – týž den výprava pro zakázku (vyrazí 21. 11.), zakázka zase open', () => {
    const s = villagers();
    s.lastDay = NOV20 - 1;
    s.orders = [{ ...open }];
    const ready: VillageEvent = {
      id: 'order:m:h:tools:1',
      seq: 1,
      villageId: 'h',
      day: NOV20,
      body: {
        kind: 'order-ready',
        ready: { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10 },
      },
    };
    const after = advanceVillage(s, NOV20, null, null, [ready]);
    const trips = marketTrips(after);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      by: 'villagers',
      startedDay: NOV20 + 1,
      market: { villageId: 'm', wants: { tools: 10 } },
    });
    // 10 kg nástrojů za 600 kg obilí – výprava je unese (čtyřkolák)
    expect(trips[0]!.give.grain).toBeCloseTo(600, 6);
    expect(after.orders).toEqual([{ ...open, status: 'open' }]);
    expect(after.outbox).toEqual([expect.objectContaining({ villageId: 'm', day: NOV20 + 1 })]);
  });
});

describe('vesničané na trhu – osivo 1. 9. a 1. 3.', () => {
  /** H 31. 8. s díly na řadě, osivem kratším o `shortKg` (rezerva osiva), 2 kg hřiven a 3 krávami nad potřebou. */
  function seedVillage(shortKg: number): VillageState {
    const s = homeVillage();
    s.lastDay = SEP1 - 1;
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 12 }, (_, i) => ({
      ...sownPart(100 + i),
      state: 'ready' as const,
      sownYears: 0,
      crop: undefined,
    }));
    s.season = null;
    const need = windowSeedNeedKg(s, 'winter');
    expect(need).toBeGreaterThan(shortKg);
    s.storesKg = need - shortKg;
    s.reservedSeedKg = need - shortKg;
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 2 };
    s.livestock!.herds.cow = Math.ceil(breedingCows(s) + oxenCalvesWanted(s, SEP1)) + 3;
    return withNearby(s, SEP1);
  }

  it('chybí 200 kg – seznam 200 kg obilí, platba 2 kg hřiven a kráva (90 < 200)', () => {
    const s = seedVillage(200);
    expect(seedShortKg(s, SEP1)).toBeCloseTo(200, 6);
    expect(surplusCows(s, SEP1)).toBe(3);
    const after = stepped(s, SEP1);
    const trips = marketTrips(after);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.market!.villageId).toBe('m');
    expect(trips[0]!.market!.wants.grain).toBeCloseTo(200, 6);
    expect(trips[0]!.give).toEqual({ cows: SEED_RESERVE.maxCows, ironBars: 2 });
    expect(after.crafts!.ironBarsKg).toBe(0);
  });

  it('chybí 3 kg osiva – nic', () => {
    const s = seedVillage(3);
    expect(seedShortKg(s, SEP1)).toBeCloseTo(3, 6);
    expect(marketTrips(stepped(s, SEP1))).toEqual([]);
  });
});

describe('vesničané na trhu – hřivny na kování vozu (kdykoli)', () => {
  it('vůz čeká na kování, bez kováře – výprava pro hřivny hned, druhý den znovu ne', () => {
    const s = villagers(['smith']);
    s.toolEquipmentKg = toolNeedKg(s, NOV15) * 2;
    withWorkshop(s, 'carpenter', 710, {
      cart: { kind: 'two-wheel', done: CARPENTRY.cartManDays['two-wheel'] },
    });
    const day = NOV14 - 20;
    const first = stepped(s, day);
    const trips = marketTrips(first);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.market!.wants).toEqual({ ironBars: cartIronBarsKg('two-wheel') });
    expect(trips[0]!.give.grain).toBeCloseTo(cartIronBarsKg('two-wheel') * 45, 6);
    expect(marketTrips(stepped(first, day + 1))).toHaveLength(1);
  });
});

describe('vesničané na trhu po kouscích dopočtu (determinismus)', () => {
  /** Vojvoda se ženou a synem ve dvorci a sedlák se ženou – ves bez řemeslníků. */
  const FAMILY: KinSpec[] = [
    { id: 10, age: 40, sex: 'male', spouse: 11 },
    { id: 11, age: 36, sex: 'female', spouse: 10 },
    { id: 12, age: 12, sex: 'male', father: 10, mother: 11 },
    { id: 20, age: 30, sex: 'male', spouse: 21, home: 2 },
    { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
  ];

  it('1. 11. → 30. 11. vcelku = po kouscích (1.–14. 11., 15.–30. 11.), i odchozí schránka', () => {
    // DAY (kin-fixtures) je 1. 1. 600 – lidé jsou o necelý rok starší
    const start = at(600, 10, 31);
    const s: VillageState = {
      ...trackedVillage(FAMILY, [dwelling(1), dwelling(2)], { storesKg: 4_000 }),
      lastDay: start,
    };
    withNews(withNearby(s, start), ['smith', 'potter', 'carpenter']);
    const nov15 = start + 15;
    expect(
      planVillagerPurchases(s, nov15, craftCoverage(s, nov15)).filter((p) => p.worthIt).length,
    ).toBeGreaterThan(0);
    const end = start + 30;
    const whole = advanceVillage(s, end, null, null);
    const parts = advanceVillage(advanceVillage(s, start + 14, null, null), end, null, null);
    expect(parts).toEqual(whole);
    expect(marketTrips(whole).filter((e) => e.by === 'villagers')).toHaveLength(1);
    expect(whole.outbox).toEqual([expect.objectContaining({ villageId: 'm', day: start + 16 })]);
  });
});
