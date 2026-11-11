import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../actions';
import { daylightFactor, daylightHours, monthDaylight } from '../daylight';
import { dayChores } from '../day-chores';
import {
  allocateDay,
  HARVEST_CHORES,
  householdMinimum,
  householdWater,
  SUMMER_CHORES,
  woodFetchingLabor,
} from '../labor';
import { dailyMinPerHousehold } from '../productivity';
import { DAY_CHORES, DAYLIGHT_WORK, WATER_FETCHING } from '../../rules';
import { snowCover, snowLies } from '../../disasters/snow';
import { windowDaylightLeft, windowDaysLeft } from '../../fields/sowing';
import type { Person } from '../../types';

const at = (month: number, day: number, year = 601): number => dayIndexOf({ year, month, day });

describe('venkovní práce podle světla (population.md – Skladba dne podle ročního období)', () => {
  it('v polovině měsíce dá den hodiny z tabulky ÷ 10 – zima 0,7, žně 1,4', () => {
    expect(daylightHours(at(1, 16))).toBeCloseTo(DAYLIGHT_WORK.hours[0], 9);
    expect(daylightFactor(at(1, 16))).toBeCloseTo(0.7, 9);
    expect(daylightFactor(at(7, 16))).toBeCloseTo(1.4, 9);
    expect(daylightFactor(at(12, 16))).toBeCloseTo(0.7, 9);
  });

  it('léto je delší než zima a den se mění plynule (bez skoku 1. dne v měsíci)', () => {
    expect(daylightFactor(at(7, 1))).toBeGreaterThan(daylightFactor(at(1, 1)) + 0.5);
    let prev = daylightFactor(at(1, 1));
    for (let d = at(1, 2); d < at(1, 1, 602); d++) {
      const f = daylightFactor(d);
      expect(Math.abs(f - prev)).toBeLessThan(0.007);
      expect(f).toBeGreaterThanOrEqual(0.7 - 1e-9);
      expect(f).toBeLessThanOrEqual(1.4 + 1e-9);
      prev = f;
    }
  });

  it('světlé dny okna = součet délky dne po dnech okna (i od půlky měsíce, i přestupný únor)', () => {
    const sum = (from: number, to: number): number => {
      let s = 0;
      for (let d = from; d <= to; d++) s += daylightFactor(d);
      return s;
    };
    expect(windowDaylightLeft(at(7, 10), [[7, 8]])).toBeCloseTo(sum(at(7, 10), at(8, 31)), 9);
    expect(monthDaylight(604, 2)).toBeCloseTo(sum(at(2, 1, 604), at(2, 29, 604)), 9);
    expect(windowDaysLeft(at(7, 10), [[7, 8]])).toBe(53);
    // srpen dá víc než 31 dnešních dní, prosinec méně
    expect(monthDaylight(601, 8)).toBeGreaterThan(31 * 1.25);
    expect(monthDaylight(601, 12)).toBeLessThan(31 * 0.75);
  });
});

describe('sníh v simulaci jako ve scéně', () => {
  it('normální zima: sníh leží v lednu, ne v dubnu ani v létě', () => {
    expect(snowLies(at(1, 15))).toBe(true);
    expect(snowLies(at(12, 20))).toBe(true);
    expect(snowLies(at(4, 15))).toBe(false);
    expect(snowLies(at(7, 15))).toBe(false);
  });

  it('dlouhá zima vrátí sníh v březnu, holomráz ho v únoru vezme', () => {
    expect(snowLies(at(3, 15), 'normal')).toBe(false);
    expect(snowLies(at(3, 15), 'long')).toBe(true);
    expect(snowLies(at(2, 15), 'blackFrost')).toBe(false);
    expect(snowCover(15, 'blackFrost')).toBe(snowCover(15, 'normal'));
  });
});

describe('denní minimum podle období', () => {
  it('ve žňový den poloviční minimum a bez vody, v zimě dříví, se sněhem bez vody', () => {
    const state = foundVillage({
      seed: 42,
      day: at(3, 1),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    expect(dayChores(state, at(7, 20), true)).toEqual(HARVEST_CHORES);
    expect(dayChores(state, at(6, 10), false)).toEqual(SUMMER_CHORES);
    expect(dayChores(state, at(1, 15), false)).toEqual({
      minimumShare: 1,
      water: false,
      wood: true,
    });
    // listopad bez sněhu – voda i dříví
    expect(dayChores(state, at(11, 5), false)).toEqual({
      minimumShare: 1,
      water: true,
      wood: true,
    });
  });

  it('minimum domácnosti: žně polovina bez vody, zima s chůzí pro dříví nad 100 m', () => {
    const minimum = dailyMinPerHousehold(0);
    const home = { waterWalkM: 300, forestWalkM: 400 };
    const water = (WATER_FETCHING.tripsPerPerson * 5 * 2 * 200) / WATER_FETCHING.speedMps / 36_000;
    expect(householdMinimum(minimum, 5, home)).toBeCloseTo(minimum + water, 12);
    expect(householdMinimum(minimum, 5, home, HARVEST_CHORES)).toBeCloseTo(
      minimum * DAY_CHORES.harvestMinimumShare,
      12,
    );
    const wood = (DAY_CHORES.woodTrips * 2 * 300) / WATER_FETCHING.speedMps / 36_000;
    expect(woodFetchingLabor(400)).toBeCloseTo(wood, 12);
    const winter = { minimumShare: 1, water: false, wood: true };
    expect(householdMinimum(minimum, 5, home, winter)).toBeCloseTo(minimum + wood, 12);
    const person = { id: 1, dwellingId: 7 } as Person;
    const [h] = householdWater([person], [{ id: 7, ...home }], new Set(), winter);
    expect(h).toMatchObject({ labor: 0 });
    expect(h?.wood).toBeCloseTo(wood, 12);
  });
});

describe('allocateDay – délka dne', () => {
  const base = {
    capacity: 10,
    householdElders: [0, 0],
    potteryCoverage: 0,
    horseCare: 0.2,
    away: 1,
    tasks: [{ name: 'harvest' as const, remaining: 100 }],
  };

  it('práce „za den“ se nenásobí, venku zbytek × délka dne', () => {
    const min = 2 * dailyMinPerHousehold(0);
    const summer = allocateDay({ ...base, daylight: 1.4 });
    const winter = allocateDay({ ...base, daylight: 0.7 });
    for (const a of [summer, winter]) {
      expect(a.dailyMin).toBeCloseTo(min, 12);
      expect(a.horseCare).toBeCloseTo(0.2, 12);
      expect(a.away).toBeCloseTo(1, 12);
    }
    expect(summer.tasks.harvest).toBeCloseTo((10 - min - 1.2) * 1.4, 9);
    expect(winter.tasks.harvest).toBeCloseTo((10 - min - 1.2) * 0.7, 9);
  });

  it('ve žňový den poloviční minimum nechá víc práce na žeň', () => {
    const full = allocateDay({ ...base, daylight: 1.4 });
    const half = allocateDay({ ...base, daylight: 1.4, minimumShare: 0.5 });
    expect(half.dailyMin).toBeCloseTo(full.dailyMin / 2, 12);
    expect(half.tasks.harvest - full.tasks.harvest).toBeCloseTo((full.dailyMin / 2) * 1.4, 9);
  });

  it('žňové ruce a pomoc rodiny venku taky podle světla', () => {
    const a = allocateDay({
      ...base,
      capacity: 0,
      householdElders: [],
      horseCare: 0,
      away: 0,
      harvestHands: 2,
      lordHelp: 1,
      daylight: 1.4,
    });
    expect(a.harvestHands).toBeCloseTo(2.8, 12);
    expect(a.lordField).toBeCloseTo(1.4, 12);
  });
});
