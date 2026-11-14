import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { villageDigest } from '../../core/digest';
import { advanceVillage } from '../../core/simulate';
import { HIDES } from '../../rules/rules-wares';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Zpracování v domácnosti ve dni vsi (hides-honey.md): potřeba 1. 11., práce ze zbytku po
// stavbách, várky hotové po 10 dnech – dopočet po kouscích dá totéž co vcelku.

const at = (month: number, day: number, year = 600): number => dayIndexOf({ year, month, day });
const NOV_1 = at(11, 1);
const NOV_15 = at(11, 15);

/** Zakladatelé od 20. 10. se zásobou kůží a kožešin. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day: at(10, 20), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.wares = { hides: 2, smallHides: 3, sheepFurs: 4, wildFurs: 3, honeyKg: 0, waxKg: 0 };
  return s;
}

function advanceBy(s: VillageState, to: number, step: number): VillageState {
  let next = structuredClone(s);
  while (next.lastDay < to) next = advanceVillage(next, Math.min(next.lastDay + step, to), null);
  return next;
}

describe('kůže a kožešiny ve dni vsi', () => {
  it('dopočet 25. 10.–15. 11. vcelku a po 3 dnech dá stejné zboží i souhrn', () => {
    const start = advanceVillage(village(), at(10, 24), null);
    const nov1 = advanceVillage(structuredClone(start), NOV_1, null);
    const need = nov1.wares?.need;
    expect(need?.hides).toBeGreaterThan(0);
    expect(need?.furs).toBeGreaterThan(0);
    // 1. 11. se už pracuje, potřeba ale ubude až hotovou várkou
    expect(nov1.wares?.today?.day).toBe(NOV_1);
    expect(nov1.wares?.curing?.[0]?.doneDay).toBe(NOV_1 + HIDES.cureDays);
    const whole = advanceVillage(structuredClone(start), NOV_15, null);
    expect(whole.wares!.need!.hides + whole.wares!.need!.furs).toBeLessThan(
      need!.hides + need!.furs,
    );
    const chunked = advanceBy(start, NOV_15, 3);
    expect(chunked.wares).toEqual(whole.wares);
    expect(villageDigest(chunked)).toEqual(villageDigest(whole));
  });

  it('zimní den se zásobou a potřebou: dnešní práce a po 10 dnech méně potřeby', () => {
    const s = advanceVillage(village(), at(12, 9), null);
    s.wares = { ...s.wares!, hides: 10, need: { hides: 5, furs: 0 } };
    delete s.wares.curing;
    const day = at(12, 10);
    const next = advanceVillage(s, day, null);
    expect(next.wares?.today?.day).toBe(day);
    expect(next.wares?.hides).toBeLessThan(10);
    expect(next.wares?.need?.hides).toBe(5);
    const later = advanceVillage(next, day + HIDES.cureDays, null);
    expect(later.wares?.need?.hides).toBeLessThan(5);
  });
});
