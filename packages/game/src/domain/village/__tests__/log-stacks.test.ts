import { describe, expect, it } from 'vitest';
import { addLogs, addStackLogs, pileLogs, rotLogs, takeLogs, woodLogs } from '../wood';
import type { VillageState } from '../types';

// Hromady klád u lesa (forest.md – Klučení lesa pro pole): podmnožina zásoby klád vsi.

function emptyState(): VillageState {
  return { nextId: 1 } as unknown as VillageState;
}

function stackSum(state: VillageState): number {
  return (state.logStacks ?? []).reduce((sum, s) => sum + s.logs, 0);
}

describe('hromady klád u lesa', () => {
  it('addStackLogs zakládá hromadu s kotvou a doplňuje existující hromadu pole', () => {
    const state = emptyState();
    addStackLogs(state, 7, { x: 10, z: 20 }, 3);
    addStackLogs(state, 7, { x: 99, z: 99 }, 2);
    expect(state.logStacks).toHaveLength(1);
    expect(state.logStacks![0]).toMatchObject({ fieldId: 7, x: 10, z: 20, logs: 5 });
    expect(woodLogs(state)).toBe(5);
    expect(pileLogs(state)).toBe(0);
    addLogs(state, 4);
    expect(pileLogs(state)).toBe(4);
  });

  it('takeLogs bere od nejbližší hromady u lesa, pak z hromady u vsi', () => {
    const state = emptyState();
    addLogs(state, 3);
    addStackLogs(state, 1, { x: 100, z: 0 }, 2);
    addStackLogs(state, 2, { x: 10, z: 0 }, 2);
    expect(takeLogs(state, 3, { x: 0, z: 0 })).toBe(3);
    const near = state.logStacks!.find((s) => s.fieldId === 2);
    const far = state.logStacks!.find((s) => s.fieldId === 1);
    expect(near).toBeUndefined(); // vyprázdněná hromada zmizela
    expect(far?.logs).toBe(1);
    expect(woodLogs(state)).toBe(4);
    expect(takeLogs(state, 4, { x: 0, z: 0 })).toBe(4);
    expect(state.logStacks).toBeUndefined();
    expect(woodLogs(state)).toBe(0);
  });

  it('bez near bere od nejmenšího id a víc než je, nevezme', () => {
    const state = emptyState();
    addStackLogs(state, 1, { x: 100, z: 0 }, 1);
    addStackLogs(state, 2, { x: 0, z: 0 }, 1);
    expect(takeLogs(state, 1)).toBe(1);
    expect(state.logStacks!.map((s) => s.fieldId)).toEqual([2]);
    expect(takeLogs(state, 5)).toBe(1);
    expect(woodLogs(state)).toBe(0);
  });

  it('invariant Σ hromad ≤ zásoba po přidání, odběru a 365 dnech hnití', () => {
    const state = emptyState();
    addLogs(state, 5);
    addStackLogs(state, 1, { x: 0, z: 0 }, 6);
    addStackLogs(state, 2, { x: 5, z: 5 }, 4);
    takeLogs(state, 3, { x: 4, z: 4 });
    for (let day = 0; day < 365; day++) {
      rotLogs(state);
      expect(stackSum(state)).toBeLessThanOrEqual(woodLogs(state) + 1e-9);
    }
    expect(woodLogs(state)).toBeLessThan(12);
    expect(pileLogs(state)).toBeGreaterThanOrEqual(0);
  });

  it('ves bez hromad se chová jako dřív', () => {
    const state = emptyState();
    addLogs(state, 2.4);
    rotLogs(state);
    expect(state.logStacks).toBeUndefined();
    expect(takeLogs(state, 5)).toBe(2);
    expect(state.logStacks).toBeUndefined();
  });
});
