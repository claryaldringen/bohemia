import { describe, expect, it } from 'vitest';
import { assignRiders, riderPower, trainHorsesDay } from '../horse-riders';
import { villageHorses } from '../horses';
import { lordFamily, trainLordDay } from '../lord';
import { HORSES } from '../rules';
import type { ChronicleEvent, Horse, VillageState } from '../types';
import { horse, horseVillage, LORD_ID, SON_ID, START, YEAR, YOUTH_ID } from './horse-fixtures';

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
    s.lord = { trains: true, field: { since: START, reason: 'hunger' } };
    trainHorsesDay(s, START, new Map([[LORD_ID, 1]]));
    expect(villageHorses(s)[0]!.training).toBe(0);
    delete s.lord;
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
