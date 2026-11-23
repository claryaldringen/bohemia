import { describe, expect, it } from 'vitest';
import { assignRiders, riderPower, trainHorsesDay } from '../horse-riders';
import { villageHorses } from '../horses';
import { lordFamily, lordRides, trainLordDay } from '../../people/lord';
import { HORSE_SHOEING, HORSES } from '../../rules';
import type {
  ChronicleEvent,
  Horse,
  Person,
  Trail,
  TradeExpedition,
  VillageState,
} from '../../types';
import {
  horse,
  horseVillage,
  LORD_ID,
  SON_ID,
  START,
  YEAR,
  YOUTH_ID,
} from '../../__tests__/horse-fixtures';

// Jezdci a výcvik koně (horses.md – Výcvik koně a jezdec): přidělení koní od vojvody, výcvik
// 3 → 12 let, bez obilí polovinou, bez péče a na poli stojí; jízda jezdce roste jen s koněm.

const riderOf = (s: VillageState, id: number): number | undefined =>
  villageHorses(s).find((h) => h.id === id)?.riderId;

const assign = (s: VillageState): ReadonlySet<number> =>
  assignRiders(s, START, lordFamily(s, START));

describe('přidělení jezdců (horses.md – Výcvik koně a jezdec)', () => {
  it('nejlépe vycvičený kůň vojvodovi, další synům od nejstaršího, klisna nikomu', () => {
    const s = horseVillage([
      horse(1, 8, 'male', 50),
      horse(2, 9, 'male', 80),
      horse(3, 4, 'male', 0),
      horse(4, 6, 'female', 0),
      horse(5, 2, 'male', 0),
    ]);
    expect([...assign(s)].sort()).toEqual([LORD_ID, SON_ID, YOUTH_ID].sort());
    expect(riderOf(s, 2)).toBe(LORD_ID);
    expect(riderOf(s, 1)).toBe(SON_ID);
    expect(riderOf(s, 3)).toBe(YOUTH_ID);
    expect(riderOf(s, 4)).toBeUndefined();
    expect(riderOf(s, 5)).toBeUndefined();
  });

  it('pár drží; po smrti jezdce dostane koně další bez koně', () => {
    const s = horseVillage([horse(1, 8, 'male', 50), horse(2, 9, 'male', 10)]);
    assign(s);
    expect(riderOf(s, 1)).toBe(LORD_ID);
    expect(riderOf(s, 2)).toBe(SON_ID);
    // lepší výcvik koně 2 pár nerozbije
    villageHorses(s).find((h) => h.id === 2)!.training = 90;
    assign(s);
    expect(riderOf(s, 1)).toBe(LORD_ID);
    s.people = s.people.filter((p) => p.id !== SON_ID && p.id !== 13);
    expect(assign(s).has(YOUTH_ID)).toBe(true);
    expect(riderOf(s, 2)).toBe(YOUTH_ID);
  });
});

describe('výcvik koně (horses.md – Výcvik koně a jezdec)', () => {
  /** Výcvik koně 3 → 12 let, jezdec cvičí každý den (`fed` – obilí). */
  function trainNineYears(fed: boolean): { horse: Horse; events: ChronicleEvent[] } {
    const s = horseVillage([{ ...horse(1, 3), riderId: LORD_ID }]);
    s.horsesCaredToday = 1;
    s.horsesFed = fed;
    const events: ChronicleEvent[] = [];
    const days = Math.ceil(9 * YEAR);
    for (let d = 0; d < days; d++) {
      events.push(...trainHorsesDay(s, START + d, new Map([[LORD_ID, 1]])));
    }
    return { horse: villageHorses(s)[0]!, events };
  }

  it('od 3 do 12 let s obilím na plný výcvik, kronika jednou', () => {
    const { horse: h, events } = trainNineYears(true);
    expect(h.training).toBeCloseTo(HORSES.trainingFull, 0);
    expect(events.filter((e) => e.kind === 'horse-trained')).toHaveLength(1);
  });

  it('bez obilí polovičním tempem', () => {
    const { horse: h, events } = trainNineYears(false);
    expect(h.training).toBeGreaterThan(HORSES.trainingFull / 2 - 1);
    expect(h.training).toBeLessThan(HORSES.trainingFull / 2 + 1);
    expect(events).toEqual([]);
  });

  it('bez plné péče, bez jezdce a ve dnech rodiny na poli stojí', () => {
    const s = horseVillage([{ ...horse(1, 5), riderId: LORD_ID }]);
    s.horsesFed = true;
    s.horsesCaredToday = 0.9;
    trainHorsesDay(s, START, new Map([[LORD_ID, 1]]));
    s.horsesCaredToday = 1;
    trainHorsesDay(s, START, new Map([[SON_ID, 1]]));
    // v den na poli nikdo nejezdí (`trainLordDay` – prázdné jízdy), výcvik stojí
    trainHorsesDay(s, START, new Map());
    expect(villageHorses(s)[0]!.training).toBe(0);
    trainHorsesDay(s, START, new Map([[LORD_ID, 1]]));
    expect(villageHorses(s)[0]!.training).toBeGreaterThan(0);
  });

  it('jezdec na koni dokáže jízda × (0,4 + 0,6 × výcvik)', () => {
    const rider = { arms: { bow: 0, combat: 0, riding: 50 } };
    expect(riderPower(rider, { training: 0 })).toBeCloseTo(20);
    expect(riderPower(rider, { training: HORSES.trainingFull })).toBeCloseTo(50);
    expect(riderPower({}, { training: 50 })).toBe(0);
  });
});

describe('jízda jezdce (lord.md – Den rodiny)', () => {
  it('jízda roste jen s koněm, kůň se cvičí pod jezdcem', () => {
    const s = horseVillage([horse(1, 5)]);
    s.lord = { trains: true };
    s.horsesCaredToday = 1;
    s.horsesFed = true;
    const events = trainLordDay(s, START, 0);
    expect(events).toEqual([]);
    const lord = s.people.find((p) => p.id === LORD_ID)!;
    const son = s.people.find((p) => p.id === SON_ID)!;
    expect(lord.arms?.riding).toBeGreaterThan(0);
    expect(son.arms?.riding ?? 0).toBe(0);
    expect(son.arms?.bow).toBeGreaterThan(0);
    expect(villageHorses(s)[0]!.riderId).toBe(LORD_ID);
    expect(villageHorses(s)[0]!.training).toBeGreaterThan(0);
  });

  it('ves bez koní – nikdo nejezdí', () => {
    const s = horseVillage();
    s.lord = { trains: true };
    expect(trainLordDay(s, START, 0)).toEqual([]);
    expect(s.people.every((p) => (p.arms?.riding ?? 0) === 0)).toBe(true);
  });
});

describe('jízdy dne (horses.md – Kdy a kam se jezdí, dokud není lov)', () => {
  const riding = (horses: Horse[]): VillageState => {
    const s = horseVillage(horses);
    s.lord = { trains: true };
    s.horsesCaredToday = 1;
    s.horsesFed = true;
    trainLordDay(s, START, 0);
    return s;
  };

  it('jede jen jezdec s koněm – vojvoda první, kůň a výcvik z jádra', () => {
    const s = riding([horse(1, 5, 'male', 30)]);
    const rides = lordRides(s, START + 1)!;
    expect(rides.riders.map((r) => [r.riderId, r.horseId])).toEqual([[LORD_ID, 1]]);
    expect(rides.riders[0]!.training).toBeGreaterThan(30);
    expect(rides.riders[0]!.hours).toBeGreaterThan(0);
    expect(rides.escort).toBeNull();
  });

  it('v dnech na poli nejezdí, kdo je na poli – chlapec a muži mimo pole jezdí dál', () => {
    // ženy a muži rodiny na poli, vojvoda ne (lord.md – Kdy jde rodina na pole; návrh Clauda:
    // nejezdí jen ten, kdo je ten den na poli)
    const s = riding([horse(1, 5), horse(2, 6), horse(3, 7)]);
    expect(villageHorses(s).some((h) => h.riderId === YOUTH_ID)).toBe(true);
    s.lord = { trains: true };
    const arms = (id: number): NonNullable<Person['arms']> => ({
      ...s.people.find((p) => p.id === id)!.arms!,
    });
    const before = { lord: arms(LORD_ID), son: arms(SON_ID), youth: arms(YOUTH_ID) };
    trainLordDay(s, START + 1, { women: 1, men: 1, lord: 0 });
    // syn celý den na poli: necvičí, nejezdí
    expect(arms(SON_ID).riding).toBeLessThanOrEqual(before.son.riding);
    // chlapec cvičí vždy a na poli není – jezdí; vojvoda mimo pole jezdí
    expect(arms(YOUTH_ID).riding).toBeGreaterThan(before.youth.riding);
    expect(arms(LORD_ID).riding).toBeGreaterThan(before.lord.riding);
  });

  it('nepodkutý kůň: jezdec nedostává hodiny jízdy, cvičí luk a boj (horses.md – Kování)', () => {
    const s = riding([horse(1, 5, 'male', 30)]);
    const lord = s.people.find((p) => p.id === LORD_ID)!;
    const due = START + HORSE_SHOEING.everyDays;
    s.shoeing = { lastDay: START };
    const before = { ...lord.arms! };
    trainLordDay(s, due, 0);
    expect(lord.arms!.riding).toBeLessThanOrEqual(before.riding);
    expect(lord.arms!.bow + lord.arms!.combat).toBeGreaterThan(before.bow + before.combat);
    // po podkutí jízda zase roste
    s.shoeing = { lastDay: due };
    const mid = lord.arms!.riding;
    trainLordDay(s, due + 1, 0);
    expect(lord.arms!.riding).toBeGreaterThan(mid);
  });

  it('jednou za 7 dní po hotové zemské stezce k hranici, jinak objížďka polí', () => {
    const s = riding([horse(1, 5)]);
    s.trails = [{ id: 4, builtDay: 0 } as unknown as Trail];
    const days = Array.from({ length: 14 }, (_, i) => START + i);
    const border = days.filter((d) => lordRides(s, d)?.trailId === 4);
    expect(border).toHaveLength(2);
    expect(border[1]! - border[0]!).toBe(HORSES.borderRideEveryDays);
    s.trails = [{ id: 4, builtDay: null } as unknown as Trail];
    expect(days.every((d) => lordRides(s, d)!.trailId === null)).toBe(true);
  });

  it('výpravu vyrážející dnes doprovodí nejstarší jezdec mimo vojvodu', () => {
    const s = riding([horse(1, 5), horse(2, 6)]);
    const day = START + 1;
    s.trade = {
      nextId: 2,
      expeditions: [{ id: 1, trailId: 4, startedDay: day } as unknown as TradeExpedition],
    };
    const rides = lordRides(s, day)!;
    expect(rides.escort).toMatchObject({
      riderId: SON_ID,
      horseId: 1,
      expeditionId: 1,
      trailId: 4,
    });
    expect(rides.riders.map((r) => r.riderId)).toEqual([LORD_ID]);
    expect(lordRides(s, day + 1)!.escort).toBeNull();
  });

  it('výpravu na trh nikdo nedoprovází – nemá stezku, jezdci jedou jako jindy', () => {
    const s = riding([horse(1, 5), horse(2, 6)]);
    const day = START + 1;
    const market = {
      id: 1,
      kind: 'market',
      trailId: -1,
      startedDay: day,
    } as unknown as TradeExpedition;
    s.trade = { nextId: 2, expeditions: [market] };
    const rides = lordRides(s, day)!;
    expect(rides.escort).toBeNull();
    expect(rides.riders.map((r) => r.riderId)).toEqual([LORD_ID, SON_ID]);
  });
});
