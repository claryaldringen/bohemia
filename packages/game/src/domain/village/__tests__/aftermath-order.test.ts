import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { mowingCut } from '../hay';
import { advanceVillage } from '../simulate';
import { type DayTask } from '../simulate-plan';
import { dayTaskOrder, dayWorkGroup } from '../simulate-work';
import type { FieldPart, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Otava před orbou a setím ozimu (fields.md – Pořadí důležitosti polních prací a výmlat do zimy,
// bod 3; Martin 10. 11. 2026 – žeň → len → otava → orba a setí; dřív ~~otava až po orbě a setí
// ozimu~~, 9. 11. 2026): nutná 1. seč i nutná otava (2. seč – oxen.md, Seno, dvě seče) mají
// přednost před jablky, výmlatem na osivo, orbou a setím; otava hned za 1. sečí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

describe('pořadí práce dne – otava před orbou a setím ozimu', () => {
  const task = (name: DayTask['name'], end: number, extra: Partial<DayTask> = {}): DayTask => ({
    name,
    remaining: 10,
    end,
    tie: 1,
    rank: 0,
    ...extra,
  });
  const firstCut = task('mow', Infinity, { tie: 3, rank: 1 });
  const aftermath = task('mow', Infinity, { tie: 3, rank: 1, aftermath: true });
  const plough = task('plough', 10, { rank: -0.5 });
  const sow = task('sow', 10, { rank: 2 });
  const dig = task('dig', 10, { rank: 3 });
  const reclaim = task('reclaim', 9);
  const orchardCare = task('orchard-care', 12, { tie: 2 });
  const watch = task('watch', Infinity, { tie: 4, rank: 2 });
  const thresh = task('thresh', 12, {
    rank: 30,
    thresh: { crop: 'winter', remaining: 1, floor: 1, end: 12, overdue: false },
  });

  it('1. seč je sklizeň sena, otava má vlastní skupinu', () => {
    expect(dayWorkGroup(firstCut)).toBe('hay');
    expect(dayWorkGroup(aftermath)).toBe('aftermath');
  });

  it('1. seč a otava před orbou a setím, otava za žní obilí a lnem', () => {
    const ordered = [aftermath, plough, reclaim, sow, dig, orchardCare, watch, thresh];
    expect([...ordered].reverse().sort(dayTaskOrder)).toEqual(ordered);
    expect([sow, plough, firstCut].sort(dayTaskOrder)).toEqual([firstCut, plough, sow]);
    const apples = task('orchard-harvest', 10, { tie: 0 });
    expect([apples, aftermath].sort(dayTaskOrder)).toEqual([aftermath, apples]);
    expect([aftermath, firstCut].sort(dayTaskOrder)).toEqual([firstCut, aftermath]);
    const reap = task('harvest', 9, { rank: 4 });
    expect([aftermath, reap].sort(dayTaskOrder)).toEqual([reap, aftermath]);
  });
});

describe('otava v simulaci', () => {
  function meadow(id: number, distanceM: number): FieldPart {
    return {
      id,
      fieldId: 1,
      areaM2: 10_000,
      distanceM,
      naturalFertility: 70,
      fertilityShare: 0.8,
      bonusUntilDay: null,
      state: 'fallow',
      sownYears: 0,
      fallowSinceDay: at(595, 9, 1),
      foundingCost: 0,
      foundingDone: 0,
      surface: 'meadow',
    };
  }
  /** Ves se třemi loukami a šesti kravami před 1. sečí – samotná 1. seč jim na zimu nestačí. */
  function village(): VillageState {
    const day = at(600, 5, 1);
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.lastDay = day;
    s.storesKg = 50_000;
    s.fields = [{ id: 1 }];
    delete s.hay;
    s.parts = [meadow(1, 100), meadow(2, 150), meadow(3, 200)];
    s.livestock!.herds.cow = 6;
    return s;
  }

  it('otava se v srpnu a září poseče a po kouscích stejně jako jedním voláním (determinismus)', () => {
    const start = village();
    const end = at(600, 10, 5);
    const september = advanceVillage(start, at(600, 9, 15), null);
    expect(september.hay!.mowing).toBeTruthy();
    expect(mowingCut(september.hay!.mowing!)).toBe(2);
    expect(september.hay!.mowing!.done).toBeGreaterThan(0);
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 3, 17, 1, 9, 30];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
  });
});
