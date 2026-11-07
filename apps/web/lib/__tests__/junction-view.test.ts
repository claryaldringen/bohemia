import type { VillageState } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { junctionViews, junctionsField } from '../junction-view';

const state = (junctions: unknown[] | undefined): VillageState =>
  ({ roads: junctions ? { junctions } : undefined }) as unknown as VillageState;

describe('křižovatky pro panel výběru (junction-view)', () => {
  const j = {
    id: 5,
    x: 0,
    z: 0,
    shape: 'y',
    rotation: 0,
    arms: [1, 2, null],
    landmark: { kind: 'post', x: 1, z: 1, turn: 0, look: 1 },
    bornDay: 100,
  };

  it('tvar, počet cest bez prázdných ramen, znamení a stáří v celých letech', () => {
    expect(junctionViews(state([j]), 100 + 365 * 3 + 40)).toEqual([
      { id: 5, shape: 'y', roads: 2, landmark: 'post', ageYears: 3 },
    ]);
    expect(junctionViews(state([j]), 50)[0]!.ageYears).toBe(0);
  });

  it('bez křižovatek pole chybí', () => {
    expect(junctionsField(state(undefined), 10)).toEqual({});
    expect(junctionsField(state([j]), 10).junctions).toHaveLength(1);
  });
});
