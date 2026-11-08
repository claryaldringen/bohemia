import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { WILDLIFE_LAND } from '../rules-wildlife';
import type { VillageState } from '../types';
import { surfaceAt, tileCenterWorld } from '../../landscape';
import { fishingPools, wildlifeLandAt } from '../wildlife-land';
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

  it('počítání jen v obdélníku kolem vsi dá totéž co průchod celou mapou', () => {
    const surface = (x: number, y: number): 'forest' | 'water' | 'meadow' =>
      x % 9 < 3 ? 'forest' : y % 11 === 0 ? 'water' : 'meadow';
    const landscape = makeLandscape({ size: 128, surface });
    const land = wildlifeLandAt(landscape, village());
    // referenčně přes celou mapu (bez čtverců polí; jen obydlí na počátku)
    let forest = 0;
    let water = 0;
    let open = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const c = tileCenterWorld(landscape, x, y);
        if (c.x * c.x + c.z * c.z > WILDLIFE_LAND.reachM * WILDLIFE_LAND.reachM) continue;
        const kind = surfaceAt(landscape, x, y);
        if (kind === 'water') water++;
        else if (kind === 'forest') forest++;
        else open++;
      }
    }
    // políčko pod obydlím není les ani louka; pruhy lesa jsou široké 3 políčka, tedy vždy větší kus
    expect(land.waterHa).toBeCloseTo(water * CELL_HA, 9);
    expect(land.forestHa).toBeLessThanOrEqual(forest * CELL_HA + 1e-9);
    expect(land.forestHa).toBeGreaterThan((forest - 2) * CELL_HA);
    expect(land.openHa).toBeLessThanOrEqual(open * CELL_HA + 1e-9);
    expect(land.openHa).toBeGreaterThan((open - 2) * CELL_HA);
  });

  it('potok bez tůně: jádro rybaří na vodě vsi, lovištěm je bod potoka nejblíž vsi', () => {
    const base = makeLandscape({ size: 128, surface: (_x, y) => (y === 70 ? 'water' : 'meadow') });
    const stream = Array.from({ length: 128 }, (_, x) => ({
      x,
      y: 70,
      halfWidthLeft: 0.5,
      halfWidthRight: 0.5,
      level: 0,
      shallow: false,
    }));
    const landscape = { ...base, stream };
    const land = wildlifeLandAt(landscape, village());
    expect(land.pools).toBe(0);
    expect(land.waterHa).toBeGreaterThan(0);
    const spots = fishingPools(landscape, village());
    expect(spots).toHaveLength(1);
    // osa potoku v řádku 70 (z = −960 + 70,5 × 15), nejblíž obydlí v počátku
    expect(spots[0]!.z).toBeCloseTo(97.5, 1);
    expect(Math.abs(spots[0]!.x)).toBeLessThan(15);
    expect(Math.abs(spots[0]!.flowX)).toBeCloseTo(1, 3);
    expect(fishingPools(base, village())).toEqual([]);
  });

  it('víc řek kostry: lovištěm je bod nejbližší řeky a proud teče podél ní', () => {
    const base = makeLandscape({ size: 128, surface: () => 'meadow' });
    const line = (from: { x: number; y: number }, to: { x: number; y: number }, n: number) =>
      Array.from({ length: n + 1 }, (_, k) => ({
        x: from.x + ((to.x - from.x) * k) / n,
        y: from.y + ((to.y - from.y) * k) / n,
        halfWidthLeft: 1,
        halfWidthRight: 1,
        level: 10 - k / n,
        shallow: false,
      }));
    // hlavní tok od severu k jihu ve sloupci 80, přítok od západu v řádku 66 do jeho osy
    const main = line({ x: 80, y: 127 }, { x: 80, y: 0 }, 127);
    const tributary = line({ x: 0, y: 66 }, { x: 80, y: 66 }, 80);
    const landscape = { ...base, rivers: [main, tributary] };
    const spots = fishingPools(landscape, village());
    expect(spots).toHaveLength(1);
    // přítok v řádku 66 (z = −960 + 66,5 × 15 = 37,5) je ke vsi v počátku blíž než hlavní tok
    expect(spots[0]!.z).toBeCloseTo(37.5, 1);
    expect(Math.abs(spots[0]!.x)).toBeLessThan(15);
    expect(spots[0]!.flowX).toBeCloseTo(1, 3);
  });
});
