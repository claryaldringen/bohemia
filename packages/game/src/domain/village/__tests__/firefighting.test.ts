import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { generateLandscape } from '../../landscape';
import { foundVillage } from '../actions';
import { fireDay } from '../fire';
import { chainEfficiency, fireFighters, nearestWater, planFireFight } from '../firefighting';
import { PATH_WATER_SPOT } from '../paths/terrain';
import { groundSpots, nearestSpot, walkGroundOf } from '../paths/walking';
import { refreshWalkDistances } from '../paths/village';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, VillageState } from '../types';
import { villagersToday } from '../morning-water';
import { withBuiltFirstDwelling } from './village-fixtures';
import { newWorkshop } from '../crafts';

// Hašení řetězem s vědry (disasters.md – Hašení; Martin 27. 10. 2026).

const FOUNDED = dayIndexOf({ year: 500, month: 1, day: 1 });
const DAY = FOUNDED + 10 * 365;
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

  it('plán na skutečné krajině: voda = břeh, kam chodí ženy pro vodu, přímka ke stavbě', () => {
    const landscape = generateLandscape(42);
    const fight = planFireFight(landscape, 1, 0, 0, 10, DAY);
    const spot = nearestSpot(groundSpots(walkGroundOf(landscape), PATH_WATER_SPOT), {
      x: 0,
      z: 0,
    })!;
    expect(fight.water).toEqual({ x: spot.x, z: spot.z });
    expect(fight.distanceM).toBeCloseTo(Math.hypot(spot.x, spot.z), 5);
    expect(fight.spacingM).toBeCloseTo(fight.distanceM / 10, 5);
    expect(fight.efficiency).toBeCloseTo(Math.min(1, 2.5 / fight.spacingM), 5);
  });

  it('vodní bod hašení je bod vody obydlí a chůze pro vodu ho jen prodlužuje', () => {
    const landscape = generateLandscape(42);
    const state = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    refreshWalkDistances(state, FOUNDED + 1, landscape, null);
    for (const d of state.dwellings) {
      const w = nearestWater(landscape, d.position.x, d.position.z)!;
      expect(d.waterWalkM).toBeGreaterThanOrEqual(Math.floor(w.distanceM * 10) / 10 - 0.2);
    }
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
    expect(fireFighters(state, DAY).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(villagersToday(state, DAY, new Set()).villagers).toHaveLength(4);
    fireDay(state, DAY, null, null);
    expect(state.disasters?.fireFight).toMatchObject({ day: DAY, dwellingId: 1, people: 3 });
    expect(villagersToday(state, DAY, new Set()).villagers.map((p) => p.id)).toEqual([99]);
    expect(villagersToday(state, DAY + 1, new Set()).villagers).toHaveLength(4);
  });

  it('mimo ves nehasí pěší lovci ani kdo jde pro kování; cvičící rodina na dvorci ano', () => {
    const state = village(adults(5));
    state.wildlife = {
      hunt: {
        hope: { boar: 0, deer: 0, wolf: 0, bear: 0 },
        today: { day: DAY, target: 'deer', riders: [], foot: [1, 2], extra: false },
        year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
      },
    } as unknown as VillageState['wildlife'];
    state.dwellings[1]!.workshop = {
      ...newWorkshop('smith'),
      ironTrip: { personId: 3 } as never,
    } as Dwelling['workshop'];
    expect(fireFighters(state, DAY).map((p) => p.id)).toEqual([4, 5]);
    fireDay(state, DAY, null, null);
    expect(state.disasters?.fireFight?.people).toBe(2);
  });

  it('starý plán hašení se druhý den smaže, dnešní zůstane', () => {
    const state = village(adults(3));
    fireDay(state, DAY, null, null);
    expect(state.disasters?.fireFight?.day).toBe(DAY);
    fireDay(state, DAY, null, null);
    expect(state.disasters?.fireFight?.day).toBe(DAY);
    fireDay(state, DAY + 1, null, null);
    expect(state.disasters?.fireFight).toBeUndefined();
    fireDay(state, DAY + 1, null, null);
    expect(state.disasters?.fireFight).toBeUndefined();
  });

  it('přebitá účinnost se zapíše do plánu', () => {
    const state = village(adults(3));
    fireDay(state, DAY, null, generateLandscape(42), 0.25);
    expect(state.disasters?.fireFight?.efficiency).toBe(0.25);
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
