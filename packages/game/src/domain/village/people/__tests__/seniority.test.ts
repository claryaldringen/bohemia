import { describe, expect, it } from 'vitest';
import { dynastySenior } from '../seniority';
import type { VillageState } from '../../types';
import { DAY, kin, village } from '../../__tests__/kin-fixtures';

// Seniorát (seniorate.md – Seniorát): nejstarší žijící muž rodu napříč živými vsemi rodu.

/** Ves s muži rodu daných věků (id → věk); `extra` např. vymření. */
function lineVillage(men: Record<number, number>, extra: Partial<VillageState> = {}): VillageState {
  const state = village(
    Object.entries(men).map(([id, age]) => kin({ id: Number(id), age, sex: 'male' })),
    undefined,
    extra,
  );
  for (const p of state.people) p.line = true;
  return state;
}

describe('dynastySenior', () => {
  it('nejstarší muž rodu napříč vsemi, i když není vojvodou', () => {
    const senior = dynastySenior(
      [
        { villageId: 'a', state: lineVillage({ 10: 40, 11: 15 }) },
        { villageId: 'b', state: lineVillage({ 20: 52 }) },
      ],
      DAY,
    );
    expect(senior).toEqual({ villageId: 'b', personId: 20 });
  });

  it('shoda dne narození: nižší id osoby, pak nižší id vsi', () => {
    const a = lineVillage({ 12: 30, 11: 30 });
    expect(dynastySenior([{ villageId: 'a', state: a }], DAY)).toEqual({
      villageId: 'a',
      personId: 11,
    });
    const same = [
      { villageId: 'z', state: lineVillage({ 5: 30 }) },
      { villageId: 'b', state: lineVillage({ 5: 30 }) },
    ];
    expect(dynastySenior(same, DAY)).toEqual({ villageId: 'b', personId: 5 });
  });

  it('chlapec je seniorem, jen když starší muž rodu není', () => {
    expect(dynastySenior([{ villageId: 'a', state: lineVillage({ 10: 9 }) }], DAY)).toEqual({
      villageId: 'a',
      personId: 10,
    });
    expect(
      dynastySenior([{ villageId: 'a', state: lineVillage({ 10: 9, 11: 20 }) }], DAY)?.personId,
    ).toBe(11);
  });

  it('ženy, muži mimo rod a vymřelé či opuštěné vsi se nepočítají', () => {
    const outsider = lineVillage({ 10: 60 });
    delete outsider.people[0]!.line;
    const woman = lineVillage({ 11: 70 });
    woman.people[0]!.sex = 'female';
    const extinct = lineVillage({ 12: 80 }, { extinctDay: DAY - 5 });
    const abandoned = lineVillage({ 13: 90 }, { abandonedDay: DAY - 5 });
    const alive = lineVillage({ 14: 20 });
    expect(
      dynastySenior(
        [outsider, woman, extinct, abandoned, alive].map((state, i) => ({
          villageId: `v${i}`,
          state,
        })),
        DAY,
      ),
    ).toEqual({ villageId: 'v4', personId: 14 });
    expect(dynastySenior([], DAY)).toBeNull();
  });
});
