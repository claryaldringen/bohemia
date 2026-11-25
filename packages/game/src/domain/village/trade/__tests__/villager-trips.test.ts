import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { cartFleetToday } from '../../crafts/carts';
import { cartIronBarsKg, craftCoverage, craftTargets } from '../../crafts/crafts';
import { CARPENTRY, CRAFT_BUYING, MARKET, SEED_RESERVE } from '../../rules';
import { toolEquipmentKg, toolNeedKg } from '../../crafts/iron';
import { reservedSeedKg } from '../../fields/seed';
import { seedShortKg } from '../../fields/seed-reserve';
import { surplusCows } from '../../livestock/husbandry';
import { oxenHome } from '../../livestock/oxen';
import type { ChronicleEvent, MarketResult, PlacedOrder, VillageState } from '../../types';
import { at } from '../../__tests__/horse-fixtures';
import { dwelling, trackedVillage, type KinSpec } from '../../__tests__/kin-fixtures';
import { applyMarketResult, marketCarryKg, marketFreeAdults } from '../market-trip';
import { planVillagerPurchases, priceKg, villagerTripsDay } from '../villager-trips';
import {
  NOV14,
  NOV15,
  SEP1,
  report,
  seedHome,
  villagersHome,
  withNearby,
  withNews,
  withWorkshop,
} from './market-fixtures';

// Vesničané na trhu (markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7): jen ves s okolím, cíle
// z okolí, výprava `by: 'villagers'` přes `departMarketInPlace`.

const NOV20 = at(601, 11, 20);
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

  it('nevyplatí se (3 ha) – nástroje jen v plánu s worthIt false, výprava žádná', () => {
    const s = villagers();
    s.parts = s.parts!.slice(0, 12);
    const plans = planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15));
    expect(plans).toEqual([expect.objectContaining({ good: 'tools', worthIt: false })]);
    expect(plans[0]!.savedManDays).toBeLessThan(plans[0]!.costManDays);
    expect(marketTrips(stepped(s, NOV15))).toEqual([]);
  });

  it('bez vozu koupí jen tolik, kolik volní dospělí unesou (nosnost)', () => {
    const s = villagers();
    s.carts = [];
    const adults = marketFreeAdults(s, NOV15);
    const plan = planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15))[0]!;
    expect(plan).toMatchObject({ good: 'tools', worthIt: true });
    // nástrojů chybí 10 kg (600 kg obilí) – unesou jen nosiči po 25 kg
    expect(plan.pay.grain).toBeCloseTo(marketCarryKg(adults, []), 6);
    expect(plan.amount).toBeCloseTo(marketCarryKg(adults, []) / 60, 6);
    const trip = marketTrips(stepped(s, NOV15))[0]!;
    expect(trip.porters).toBe(adults);
    expect(trip.carts).toBeUndefined();
  });

  it('vůz od tesaře: koupený dvoukolák a dřevěné nářadí jedou jednou výpravou s volem navíc', () => {
    const s = villagers(['carpenter']);
    s.toolEquipmentKg = toolNeedKg(s, NOV15) * 2;
    // druhé spřežení: čtyřkolák veze platbu, vůl navíc dovede koupený dvoukolák domů
    s.pens!.push({ ...s.pens!.at(-1)!, id: 901, cell: { x: 5, y: 4 }, x: 70 });
    s.draft = {
      lastYear: { from: NOV15 - 365, 'two-wheel': [300], 'four-wheel': [], plough: [], oxCost: 12 },
    };
    const plans = planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15));
    expect(plans.map((p) => [p.good, p.worthIt])).toEqual([
      ['twoWheelCarts', true],
      ['woodTools', true],
    ]);
    expect(plans[0]).toMatchObject({ villageId: 'm', amount: 1, pay: { grain: 320 } });
    const trips = marketTrips(stepped(s, NOV15));
    expect(trips).toHaveLength(1);
    expect(trips[0]!.market).toMatchObject({
      villageId: 'm',
      wants: { twoWheelCarts: 1, woodTools: plans[1]!.amount },
      oxen: 1,
    });
    expect(trips[0]!.give.grain).toBeCloseTo(320 + plans[1]!.pay.grain!, 6);
    expect(trips[0]!.carts).toEqual([1]);
  });

  it('nejbližší ves zakázku odmítla – výprava jede k další vsi s kovářem', () => {
    const s = villagers();
    s.nearby!.villages.push({ villageId: 'k', name: 'Kounice', cells: 1, firstStep: 'N' });
    s.news!.push({ villageId: 'k', name: 'Kounice', report: { ...report, crafts: ['smith'] } });
    s.orders = [
      {
        villageId: 'm',
        name: 'Lhota',
        good: 'tools',
        amount: 10,
        day: NOV14 - 30,
        status: 'refused',
      },
    ];
    const plans = planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15));
    expect(plans).toEqual([
      expect.objectContaining({ good: 'tools', villageId: 'k', worthIt: true }),
    ]);
    expect(marketTrips(stepped(s, NOV15)).map((e) => e.market!.villageId)).toEqual(['k']);
  });

  it('vůz a voli výpravy pracují doma ještě v den odeslání, pryč jsou ode dne odjezdu', () => {
    const s = villagers();
    const after = stepped(s, NOV15);
    expect(marketTrips(after)[0]!.carts).toEqual([1]);
    expect(cartFleetToday(after, NOV15, false)).toEqual(cartFleetToday(s, NOV15, false));
    expect(cartFleetToday(after, NOV15, false)).toMatchObject({ 'four-wheel': 1, oxen: 2 });
    expect(cartFleetToday(after, NOV15 + 1, false)).toMatchObject({ 'four-wheel': 0, oxen: 0 });
    // výpravy počítají s odjezdem: vůz ani voli na další výpravu už nejsou
    expect(oxenHome(after, NOV15)).toBe(0);
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

describe('vesničané na trhu – víc cílů v jeden den (lidé a vozy se dělí)', () => {
  /** H s kovářem v Lhotě (M, první v okolí) a hrnčířem v Hrnčířích (P); bez keramiky. */
  function twoCrafts(carts: boolean): VillageState {
    const s = villagers();
    if (!carts) s.carts = [];
    s.crafts = { ...s.crafts, charcoalKg: 0, potteryKg: 0 };
    s.nearby!.villages.push({ villageId: 'p', name: 'Hrnčíře', cells: 1, firstStep: 'W' });
    s.news!.push({ villageId: 'p', name: 'Hrnčíře', report: { ...report, crafts: ['potter'] } });
    return s;
  }

  // napřed nejlepší nákup (keramika); s vozem jedou nástroje týž den se zbytkem lidí, bez vozu
  // odnese keramiku všech 8 volných dospělých – nástroje vesničané zkusí druhý den a vyrazí ráno,
  // kdy jsou nosiči keramiky zpět
  for (const [carts, toolsDay] of [
    [true, NOV15 + 1],
    [false, NOV15 + 2],
  ] as const) {
    it(`keramika a nástroje k různým vsím – obě odjedou (${carts ? 's vozem' : 'bez vozu'})`, () => {
      const s = twoCrafts(carts);
      const plans = planVillagerPurchases(s, NOV15, craftCoverage(s, NOV15));
      expect(plans[0]).toMatchObject({ good: 'pottery', villageId: 'p', worthIt: true });
      const after = advanceVillage(s, NOV15 + 4, null, null);
      const trips = marketTrips(after)
        .filter((e) => e.by === 'villagers')
        .map((e) => ({
          to: e.market!.villageId,
          wants: Object.keys(e.market!.wants),
          started: e.startedDay,
        }));
      expect(trips).toEqual([
        { to: 'p', wants: ['pottery'], started: NOV15 + 1 },
        { to: 'm', wants: ['tools'], started: toolsDay },
      ]);
      // nástroje výprava unesla jen zčásti – zbytek čeká na její výsledek (v testu bez hostitele
      // nepřijde), pak pojede další cestou
      expect(after.trade!.villagersRetry?.goods).toEqual(['tools']);
    });
  }
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
  const seedVillage = seedHome;

  it('chybí 200 kg – platba 2 kg hřiven a kráva (90 < 200), seznam obilí v hodnotě platby', () => {
    const s = seedVillage(200);
    expect(seedShortKg(s, SEP1)).toBeCloseTo(200, 6);
    expect(surplusCows(s, SEP1)).toBe(3);
    const after = stepped(s, SEP1);
    const trips = marketTrips(after);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.market!.villageId).toBe('m');
    // kus se na trhu prodá jen celý – seznam je obilí za celou platbu (2 × 45 + 600 kg, výchozí
    // ceny), osivem je z něj jen chybějících 200 kg (dřívější `buySeed`)
    expect(trips[0]!.market!.wants.grain).toBeCloseTo(2 * 45 + 600, 6);
    expect(trips[0]!.market!.seedKg).toBeCloseTo(200, 6);
    expect(trips[0]!.give).toEqual({ cows: SEED_RESERVE.maxCows, ironBars: 2 });
    expect(after.crafts!.ironBarsKg).toBe(0);
  });

  it('koupené osivo je rezerva osiva: po výsledku s 200 kg obilí osivo nechybí', () => {
    const s = seedVillage(200);
    const after = stepped(s, SEP1);
    const trip = marketTrips(after)[0]!;
    const back = trip.market!.returnDay;
    const reserved = reservedSeedKg(after);
    const result = (grain: number): MarketResult => ({
      key: trip.market!.key,
      sold: { ...trip.give },
      bought: { grain },
      unsold: {},
      horses: [],
    });
    const got200 = structuredClone(after);
    applyMarketResult(got200, back, result(200));
    expect(seedShortKg(got200, back)).toBeCloseTo(0, 6);
    expect(reservedSeedKg(got200)).toBeCloseTo(reserved + 200, 6);
    // víc obilí (přeplatek za krávu) – rezerva jen o chybějící osivo, zbytek je jídlo
    const got690 = structuredClone(after);
    applyMarketResult(got690, back, result(690));
    expect(reservedSeedKg(got690)).toBeCloseTo(reserved + 200, 6);
    expect(got690.storesKg - after.storesKg).toBeCloseTo(690, 6);
  });

  it('hřivny, které čekají na kování vozu, osivem neplatí', () => {
    const s = seedVillage(200);
    withWorkshop(s, 'carpenter', 710, {
      cart: { kind: 'two-wheel', done: CARPENTRY.cartManDays['two-wheel'] },
    });
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: cartIronBarsKg('two-wheel') + 1 };
    const trips = marketTrips(stepped(s, SEP1));
    expect(trips).toHaveLength(1);
    expect(trips[0]!.give).toEqual({ cows: 1, ironBars: 1 });
  });

  it('chybí 3 kg osiva – nic', () => {
    const s = seedVillage(3);
    expect(seedShortKg(s, SEP1)).toBeCloseTo(3, 6);
    expect(marketTrips(stepped(s, SEP1))).toEqual([]);
  });
});

describe('vesničané na trhu – mince neutrácejí (Rozhodnutí plánu 4, bod 4; Martin 25. 11. 2026)', () => {
  /** Stav po kroku dne s 30 mincemi – bez nich týž jako `plain` po témže kroku. */
  function expectSameWithCoins(plain: VillageState, day: number): VillageState {
    const rich = structuredClone(plain);
    rich.coins = 30;
    expect(planVillagerPurchases(rich, day, craftCoverage(rich, day))).toEqual(
      planVillagerPurchases(plain, day, craftCoverage(plain, day)),
    );
    const after = stepped(plain, day);
    const richAfter = stepped(rich, day);
    for (const trip of marketTrips(richAfter)) expect(trip.give).not.toHaveProperty('coins');
    expect(richAfter.coins).toBe(30);
    delete richAfter.coins;
    expect(JSON.stringify(richAfter)).toBe(JSON.stringify(after));
    return after;
  }

  it('nástroje za obilí: s 30 mincemi nákupy, výprava i nosiči bit po bitu jako bez mincí', () => {
    const after = expectSameWithCoins(villagers(), NOV15);
    expect(marketTrips(after)).toHaveLength(1);
    // bez vozu koupí, co lidé unesou – ani pak mince nic nepřidají
    const walking = villagers();
    walking.carts = [];
    expectSameWithCoins(walking, NOV15);
    // hladina trhu cíle platí jen pro mince
    const inflated = villagers();
    inflated.news![0]!.level = 3;
    expect(stepped(inflated, NOV15).trade).toEqual(stepped(villagers(), NOV15).trade);
  });

  it('bez přebytku obilí vesničané nic nekoupí, i když má ves mince', () => {
    const poor = villagers();
    poor.storesKg = 100;
    expect(marketTrips(expectSameWithCoins(poor, NOV15))).toEqual([]);
  });

  it('hotová zakázka, vůz a hřivny na kování: s 30 mincemi totéž', () => {
    const ordered = villagers();
    ordered.orders = [
      { villageId: 'm', name: 'Lhota', good: 'tools', amount: 10, day: NOV14, status: 'ready' },
    ];
    expect(marketTrips(expectSameWithCoins(ordered, NOV14))).toHaveLength(1);
    const cart = villagers(['carpenter']);
    cart.toolEquipmentKg = toolNeedKg(cart, NOV15) * 2;
    cart.pens!.push({ ...cart.pens!.at(-1)!, id: 901, cell: { x: 5, y: 4 }, x: 70 });
    cart.draft = {
      lastYear: { from: NOV15 - 365, 'two-wheel': [300], 'four-wheel': [], plough: [], oxCost: 12 },
    };
    expect(marketTrips(expectSameWithCoins(cart, NOV15))[0]!.market!.wants.twoWheelCarts).toBe(1);
    const iron = villagers(['smith']);
    iron.toolEquipmentKg = toolNeedKg(iron, NOV15) * 2;
    withWorkshop(iron, 'carpenter', 710, {
      cart: { kind: 'two-wheel', done: CARPENTRY.cartManDays['two-wheel'] },
    });
    expect(marketTrips(expectSameWithCoins(iron, NOV14 - 20))).toHaveLength(1);
  });

  it('osivo platí hřivnami a krávami jako dosud, i když má ves 10 mincí', () => {
    const s = seedHome(200);
    s.coins = 10;
    const after = stepped(s, SEP1);
    expect(marketTrips(after)[0]!.give).toEqual({ cows: SEED_RESERVE.maxCows, ironBars: 2 });
    expect(after.coins).toBe(10);
    expectSameWithCoins(seedHome(200), SEP1);
  });

  it('cena mince u cíle je kurz ÷ hladina jeho trhu ze zprávy; bez zprávy a bez hladiny 15 kg', () => {
    const s = villagers();
    expect(priceKg(s, 'm', 'coins')).toBe(MARKET.grainKgPerCoin);
    expect(priceKg(s, 'neznámá', 'coins')).toBe(MARKET.grainKgPerCoin);
    s.news![0] = { ...s.news![0]!, level: 2.5, prices: { grain: 0.2, tools: 5 } };
    expect(priceKg(s, 'm', 'coins')).toBe(6);
    expect(priceKg(s, 'neznámá', 'coins')).toBe(MARKET.grainKgPerCoin);
    // ceny zboží na hladině nezávisí
    expect(priceKg(s, 'm', 'grain')).toBe(0.2 * MARKET.grainKgPerCoin);
    expect(priceKg(s, 'm', 'tools')).toBe(5 * MARKET.grainKgPerCoin);
    expect(priceKg(s, 'm', 'pottery')).toBe(3);
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

  it('nákup, na který nezbyli lidé, zkusí druhý den – vcelku = po kouscích přes 15. 11.', () => {
    const start = at(600, 10, 31);
    const s: VillageState = {
      ...trackedVillage(FAMILY, [dwelling(1), dwelling(2)], { storesKg: 4_000 }),
      lastDay: start,
    };
    withNews(withNearby(s, start), ['smith', 'carpenter']);
    s.nearby!.villages.push({ villageId: 'p', name: 'Hrnčíře', cells: 1, firstStep: 'W' });
    s.news!.push({ villageId: 'p', name: 'Hrnčíře', report: { ...report, crafts: ['potter'] } });
    const nov15 = start + 15;
    // 15. 11. odnesou 4 volní dospělí dřevěné nářadí (Lhota) a keramiku (Hrnčíře) – na nástroje
    // nezbude nikdo a keramiky unesou jen část, zkusí se 16. 11. (paměť je ve stavu mezi kousky
    // dopočtu)
    const first = advanceVillage(s, nov15, null, null);
    expect(first.trade!.villagersRetry).toEqual({ day: nov15 + 1, goods: ['pottery', 'tools'] });
    expect(
      marketTrips(first)
        .filter((e) => e.by === 'villagers')
        .map((e) => [e.market!.villageId, Object.keys(e.market!.wants)]),
    ).toEqual([
      ['m', ['woodTools']],
      ['p', ['pottery']],
    ]);
    const end = start + 30;
    const whole = advanceVillage(s, end, null, null);
    expect(advanceVillage(first, end, null, null)).toEqual(whole);
    // keramika čeká na výsledek výpravy (v testu bez hostitele nepřijde)
    expect(whole.trade!.villagersRetry?.goods).toEqual(['pottery']);
  });
});

describe('vesničané na trhu – místo na výpravě (plán 3, závěrečná kontrola I1)', () => {
  /** H bez vozu a bez keramiky, Lhota s kovářem i hrnčířem – keramika zabere místo výpravy. */
  function oneTarget(): VillageState {
    const s = villagers(['smith', 'potter']);
    s.carts = [];
    s.crafts = { ...s.crafts, charcoalKg: 0, potteryKg: 0 };
    return s;
  }

  it('15. 11. zabere keramika místo do téže vsi – nástroje jedou další cestou, až se lidé vrátí', () => {
    const first = stepped(oneTarget(), NOV15);
    const trips = marketTrips(first);
    expect(trips.map((e) => [e.market!.villageId, Object.keys(e.market!.wants)])).toEqual([
      ['m', ['pottery']],
    ]);
    const back = trips[0]!.market!.returnDay;
    expect(back).toBeGreaterThan(NOV15 + 1);
    // den před návratem nosičů (výprava vyrazí v den jejich návratu), ne druhý den se zbylými
    expect(first.trade!.villagersRetry).toEqual({ day: back - 1, goods: ['tools'] });
    expect(marketTrips(stepped(first, back - 2))).toHaveLength(1);
    const second = stepped(first, back - 1);
    const tools = marketTrips(second).filter((e) => (e.market!.wants.tools ?? 0) > 0);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.startedDay).toBe(back);
  });

  it('nástroje, které výprava neunesla, jedou po výsledku trhu další cestou; zakázka u vsi mimo okolí nákup neblokuje', () => {
    const s = villagers();
    s.carts = [];
    s.orders = [
      { villageId: 'far', name: 'Daleká', good: 'tools', amount: 5, day: NOV14, status: 'open' },
    ];
    const first = stepped(s, NOV15);
    const trip = marketTrips(first)[0]!;
    const wanted = trip.market!.wants.tools!;
    expect(wanted).toBeGreaterThan(0);
    const back = trip.market!.returnDay;
    expect(first.trade!.villagersRetry).toEqual({
      day: Math.max(NOV15 + 1, back - 1),
      goods: ['tools'],
    });
    // nástroje veze výprava na cestě – před výsledkem trhu se znovu nekupují
    const waiting = stepped(first, back - 1);
    expect(marketTrips(waiting)).toHaveLength(1);
    expect(waiting.trade!.villagersRetry).toEqual({ day: back, goods: ['tools'] });
    const result: MarketResult = {
      key: trip.market!.key,
      sold: trip.give,
      bought: { tools: wanted },
      unsold: {},
      horses: [],
    };
    applyMarketResult(waiting, back, result);
    const again = stepped(waiting, back);
    const next = marketTrips(again).filter((e) => (e.market!.wants.tools ?? 0) > 0);
    expect(next.map((e) => e.startedDay)).toEqual([back + 1]);
  });
});
