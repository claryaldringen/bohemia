import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { WILDLIFE_LAND } from '../rules-wildlife';
import type { VillageState } from '../types';
import { wildlifeLandAt } from '../wildlife-land';
import { withBuiltFirstDwelling } from './village-fixtures';
import { makeLandscape } from './placement-fixtures';

const CELL_HA = (15 * 15) / 10_000;

function village(): VillageState {
  const day = dayIndexOf({ year: 600, month: 9, day: 2 });
  return withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
}

describe('krajina zvěře', () => {
  it('celý les do 1 km: kruh o poloměru 1 km bez políčka pod obydlím', () => {
    const land = wildlifeLandAt(makeLandscape({ size: 128, surface: () => 'forest' }), village());
    expect(land.forestHa).toBeGreaterThan(300);
    expect(land.forestHa).toBeLessThan(330);
    expect(land.openHa).toBe(0);
    expect(land.waterHa).toBe(0);
    expect(land.pools).toBe(0);
  });

  it('háj pod 1 ha se nepočítá, větší ano', () => {
    const grove = (size: number) =>
      wildlifeLandAt(
        makeLandscape({
          size: 128,
          surface: (x, y) =>
            x >= 80 && x < 80 + size && y >= 60 && y < 60 + size ? 'forest' : 'meadow',
        }),
        village(),
      );
    expect(grove(6).forestHa).toBe(0); // 36 políček = 0,81 ha
    expect(grove(8).forestHa).toBeCloseTo(64 * CELL_HA, 6); // 1,44 ha
  });

  it('políčko pod obydlím není les a louky a voda se počítají zvlášť', () => {
    const all = wildlifeLandAt(makeLandscape({ size: 128, surface: () => 'forest' }), village());
    const meadow = wildlifeLandAt(makeLandscape({ size: 128, surface: () => 'meadow' }), village());
    expect(meadow.forestHa).toBe(0);
    // obydlí zabírá jedno políčko lesa i louky
    expect(all.forestHa).toBeCloseTo(meadow.openHa, 6);
    const water = wildlifeLandAt(
      makeLandscape({ size: 128, surface: (x) => (x < 64 ? 'water' : 'forest') }),
      village(),
    );
    expect(water.waterHa).toBeGreaterThan(100);
  });

  it('okraj 1 km: voda za dosahem se nepočítá', () => {
    const far = wildlifeLandAt(
      makeLandscape({ size: 128, surface: (x, y) => (x < 4 && y < 4 ? 'water' : 'meadow') }),
      village(),
    );
    expect(far.waterHa).toBe(0);
  });

  it('ves bez obydlí dostane výchozí krajinu', () => {
    const empty = { ...village(), dwellings: [], constructions: [] };
    expect(wildlifeLandAt(makeLandscape({ size: 128 }), empty)).toEqual(WILDLIFE_LAND.defaultLand);
  });
});
