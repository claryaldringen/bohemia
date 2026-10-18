import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone';

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
