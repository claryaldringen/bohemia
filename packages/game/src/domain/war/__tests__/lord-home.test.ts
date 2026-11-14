import { describe, expect, it } from 'vitest';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { AwayKind, Person } from '../../village/types';
import { lordAtHome, lordHomeAt } from '../lord-home';
import { MissingData, tickContext } from '../campaign-tick';
import { campaign, SUMMER, worldOf } from './campaign-fixtures';

// Vojvoda doma (war.md – Hráč ve vsi a mimo ni): hráčův muž žije ve vsi, dnes není pryč a tažení
// ho dnes neodvedlo.

const DAY = SUMMER;
const lord = (away?: Person['away']): Person => ({
  ...kin({ id: 7, age: 30, sex: 'male' }, DAY),
  ...(away === undefined ? {} : { away }),
});
const state = (p: Person): Pick<ReturnType<typeof village>, 'people'> => village([p]);

describe('lordAtHome', () => {
  it('doma – true', () => {
    expect(lordAtHome(state(lord()), 7, DAY)).toBe(true);
  });

  it.each<AwayKind>(['journey', 'campaign', 'captive', 'messenger', 'refuge'])(
    'pryč (%s) – false',
    (kind) => {
      expect(lordAtHome(state(lord({ kind, untilDay: DAY + 5 })), 7, DAY)).toBe(false);
    },
  );

  it('návrat už nastal – doma', () => {
    expect(lordAtHome(state(lord({ kind: 'journey', untilDay: DAY })), 7, DAY)).toBe(true);
  });

  it('bez lordId, chybějící osoba, odvedený tažením – false', () => {
    expect(lordAtHome(state(lord()), undefined, DAY)).toBe(false);
    expect(lordAtHome(state(lord()), 8, DAY)).toBe(false);
    expect(lordAtHome(state(lord()), 7, DAY, new Set([7]))).toBe(false);
    expect(lordAtHome(state(lord()), 7, DAY, new Set([3]))).toBe(true);
  });
});

describe('lordHomeAt', () => {
  const owner = { playerId: 'p', npc: false, houseId: 'h', lordId: 7 };
  it('ves chybí – MissingData; jinak podle stavu vsi', () => {
    const s = campaign();
    const w = { ...worldOf(), villageAt: (id: string) => (id === 'A' ? village([lord()]) : null) };
    expect(lordHomeAt(s, 'A', owner, tickContext(w))).toBe(true);
    expect(lordHomeAt(s, 'A', { ...owner, lordId: undefined }, tickContext(w))).toBe(false);
    expect(() => lordHomeAt(s, 'B', owner, tickContext(w))).toThrow(MissingData);
  });
});
