import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cloneState } from '../clone';
import { advanceVillage } from '../simulate';
import { withBuiltFirstDwelling } from './village-fixtures';

describe('cloneState', () => {
  it('zkopíruje vnořené objekty a pole jako structuredClone', () => {
    const state = {
      day: 3,
      hungry: false,
      plan: null,
      missing: undefined,
      parts: [{ id: 1, cell: { x: 2, y: 3 }, obstacles: [4, 5], crop: 'winter' }],
      ratio: -0,
      nan: Number.NaN,
    };
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    expect(Object.keys(copy)).toEqual(Object.keys(state));
    expect(Object.is(copy.ratio, -0)).toBe(true);
    copy.parts[0]!.cell.x = 99;
    copy.parts[0]!.obstacles.push(6);
    expect(state.parts[0]!.cell.x).toBe(2);
    expect(state.parts[0]!.obstacles).toEqual([4, 5]);
  });

  it('ostatní typy (Map, Date) kopíruje přes structuredClone', () => {
    const state = { byId: new Map([[1, { a: 1 }]]), when: new Date(0) };
    const copy = cloneState(state);
    expect(copy.byId).not.toBe(state.byId);
    expect(copy.byId.get(1)).toEqual({ a: 1 });
    expect(copy.when).toBeInstanceOf(Date);
    expect(copy.when.getTime()).toBe(0);
  });
});

describe('cloneState – stav vsi se zbytkem jámy', () => {
  it('zbytky jam po zaniklých obydlích (pozemek, řemeslo) zkopíruje jako structuredClone', () => {
    const day = dayIndexOf({ year: 600, month: 10, day: 1 });
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day, dwellingPosition: { x: -100, z: -20, rotation: 0 } }),
    );
    s.storesKg = 5000;
    s.dwellings.push({
      id: 50,
      type: 'polozemnice',
      builtDay: day - 30 * 365,
      condition: 0.0001,
      position: { x: 40, z: 40, rotation: 0.3 },
      plot: { cell: { x: 10, y: 10 }, variant: 'center' },
    });
    const state = advanceVillage(s, day + 3, null);
    expect(state.ruins).toHaveLength(1);
    expect(state.ruins![0]!.plot).toBeDefined();
    state.ruins!.push({ ...state.ruins![0]!, id: 51, craft: 'potter' });
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    copy.ruins![0]!.position.x = 99;
    copy.ruins![0]!.plot!.cell.x = 99;
    expect(state.ruins![0]!.position.x).toBe(40);
    expect(state.ruins![0]!.plot!.cell.x).toBe(10);
  });
});
