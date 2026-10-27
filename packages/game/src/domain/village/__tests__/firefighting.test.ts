import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { generateLandscape } from '../../landscape';
import { streamCenterline } from '../../landscape/stream-geometry';
import { foundVillage } from '../actions';
import { fireDay } from '../fire';
import {
  chainEfficiency,
  fireFighters,
  nearestWaterCell,
  nearestWaterPoint,
  planFireFight,
  type WaterAxisPoint,
} from '../firefighting';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, VillageState } from '../types';
import { villagersToday } from '../morning-water';
import { withBuiltFirstDwelling } from './village-fixtures';

// Hašení řetězem s vědry (disasters.md – Hašení; Martin 27. 10. 2026).

const FOUNDED = dayIndexOf({ year: 500, month: 1, day: 1 });
const DAY = FOUNDED + 10 * 365;
const AXIS: WaterAxisPoint[] = [
  { x: 0, z: -100, halfLeft: 2, halfRight: 2 },
  { x: 0, z: 100, halfLeft: 2, halfRight: 2 },
];

function house(id: number, x: number, z = 0): Dwelling {
  return {
    id,
    type: 'polozemnice',
    builtDay: FOUNDED,
    condition: 1,
    position: { x, z, rotation: 0 },
    plainShape: true,
  };
}

function adults(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    bornDay: DAY - 30 * 365,
    dwellingId: 1,
    sex: 'male' as const,
  }));
}

describe('nejbližší voda', () => {
  it('břeh = osa posunutá o polovinu šířky vody k domu', () => {
    const w = nearestWaterPoint(AXIS, 52, 10)!;
    expect(w.distanceM).toBeCloseTo(50, 5);
    expect(w.x).toBeCloseTo(2, 5);
    expect(w.z).toBeCloseTo(10, 5);
  });

  it('vzdálenost jde přes celou mapu, bez potoka nic', () => {
    expect(nearestWaterPoint(AXIS, 900, 0)!.distanceM).toBeCloseTo(898, 5);
    expect(nearestWaterPoint([], 0, 0)).toBeNull();
  });

  it('dům u vody (do břehu) má vzdálenost 0', () => {
    expect(nearestWaterPoint(AXIS, 1, 0)!.distanceM).toBe(0);
  });
});

describe('účinnost řetězu', () => {
  it('rozestup do 2,5 m = plná, dál min(1; 2,5 ÷ rozestup)', () => {
    expect(chainEfficiency(50, 20)).toBe(1);
    expect(chainEfficiency(30, 20)).toBe(1);
    expect(chainEfficiency(100, 20)).toBeCloseTo(0.5, 5);
    expect(chainEfficiency(100, 10)).toBeCloseTo(0.25, 5);
    expect(chainEfficiency(0, 3)).toBe(1);
    expect(chainEfficiency(100, 0)).toBe(0);
  });

  it('plán: rozestup = vzdálenost ÷ počet lidí, bez krajiny řetěz není', () => {
    const none = planFireFight(null, 1, 0, 0, 8, DAY);
    expect(none).toMatchObject({ water: null, efficiency: 0, people: 8 });
  });

  it('plán na skutečné krajině: voda nejblíž, rozestup a účinnost sedí', () => {
    const landscape = generateLandscape(42);
    const fight = planFireFight(landscape, 1, 0, 0, 10, DAY);
    const stream = nearestWaterPoint(streamCenterline(landscape).points, 0, 0)!;
    const cell = nearestWaterCell(landscape, 0, 0)!;
    const w = cell.distanceM < stream.distanceM ? cell : stream;
    expect(fight.water).toEqual({ x: w.x, z: w.z });
    expect(fight.distanceM).toBeCloseTo(w.distanceM, 5);
    expect(fight.spacingM).toBeCloseTo(w.distanceM / 10, 5);
    expect(fight.efficiency).toBeCloseTo(Math.min(1, 2.5 / fight.spacingM), 5);
  });
});

describe('den požáru', () => {
  function village(people: Person[]): VillageState {
    const state = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: FOUNDED, dwellingPosition: { x: -500, z: 0, rotation: 0 } }),
    );
    state.weatherSeed = 1;
    state.dwellings = [house(1, 0), house(2, 40)];
    state.people = people;
    state.disasters = { override: { fire: { [DAY]: 1 } } };
    return state;
  }

  it('hasí jen dospělí, a to jen v den požáru', () => {
    const kid: Person = { id: 99, bornDay: DAY - 5 * 365, dwellingId: 1 };
    const state = village([...adults(3), kid]);
    expect(fireFighters(state.people, DAY).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(villagersToday(state, DAY, new Set()).villagers).toHaveLength(4);
    fireDay(state, DAY, null, null);
    expect(state.disasters?.fireFight).toMatchObject({ day: DAY, dwellingId: 1, people: 3 });
    expect(villagersToday(state, DAY, new Set()).villagers.map((p) => p.id)).toEqual([99]);
    expect(villagersToday(state, DAY + 1, new Set()).villagers).toHaveLength(4);
  });

  it('s krajinou řetěz sníží škody: plná účinnost zachrání dům, bez hašení shoří', () => {
    const landscape = generateLandscape(42);
    const withChain = village(adults(40));
    fireDay(withChain, DAY, null, landscape);
    const fight = withChain.disasters!.fireFight!;
    expect(fight.efficiency).toBeGreaterThan(0);
    const without = village(adults(40));
    fireDay(without, DAY, null, landscape, 0);
    const left = (s: VillageState): number => s.dwellings.length;
    expect(left(withChain)).toBeGreaterThanOrEqual(left(without));
  });

  it('po kouscích dopadne stejně (včetně plánu hašení)', { timeout: 60_000 }, () => {
    const landscape = generateLandscape(42);
    const make = (): VillageState => {
      const s = village(adults(6));
      s.disasters = { override: { fire: { [DAY - 20]: 1 } } };
      return s;
    };
    const end = DAY;
    const whole = advanceVillage(make(), end, null, landscape);
    let chunked = make();
    for (let day = chunked.lastDay; day < end;) {
      day = Math.min(end, day + 7);
      chunked = advanceVillage(chunked, day, null, landscape);
    }
    expect(chunked.disasters?.fireFight).toEqual(whole.disasters?.fireFight);
    expect(chunked.dwellings.map((d) => d.id)).toEqual(whole.dwellings.map((d) => d.id));
    expect(chunked.chronicle.filter((e) => e.kind === 'fire')).toEqual(
      whole.chronicle.filter((e) => e.kind === 'fire'),
    );
  });
});
