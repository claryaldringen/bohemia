import type { VillageState } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { junctionViews, junctionsField } from '../junction-view';

const state = (junctions: unknown[] | undefined): VillageState =>
  ({
    seed: 1,
    dwellings: [],
    roads: junctions ? { junctions } : undefined,
  }) as unknown as VillageState;

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

  it('bez významného místa a krajiny nemá místo (nadpis zůstává „Rozcestí“)', () => {
    expect(junctionViews(state([j]), 100)[0]!.place).toBeUndefined();
  });

  it('kovárna do 60 m: místo „u kovárny“ (stejná funkce jako konce cesty, D66)', () => {
    const withSmithy = {
      seed: 1,
      dwellings: [{ id: 1, type: 'hut', position: { x: 10, z: 0 }, workshop: { craft: 'smith' } }],
      roads: { junctions: [j] },
    } as unknown as VillageState;
    expect(junctionViews(withSmithy, 100)[0]!.place).toBe('u kovárny');
  });

  it('bez křižovatek pole chybí', () => {
    expect(junctionsField(state(undefined), 10)).toEqual({});
    expect(junctionsField(state([j]), 10).junctions).toHaveLength(1);
  });
});
