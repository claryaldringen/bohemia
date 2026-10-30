import { describe, expect, it } from 'vitest';
import {
  FIELD_LIMITS,
  foundVillage,
  squareValue,
  type VillageState,
} from '../../src/domain/village';
import {
  MEADOW_BURN,
  applyVariantToNewParts,
  naturalFertilityOf,
  realLand,
  restoreBurnedAfterHarvest,
  syntheticLand,
  type CalibrationLand,
} from '../lib/calibration-land';

function village(land: CalibrationLand, parts: number): VillageState {
  const first = land.take(null, 1000, 0, parts);
  if (!first) throw new Error('bez půdy');
  return foundVillage({
    seed: 1,
    day: 1000,
    dwellingPosition: land.position,
    firstField: { parts: first.parts },
    obstacles: land.obstacles,
    forestDistanceM: land.site.forestDistanceM,
  });
}

describe('půda kalibrace', () => {
  it('syntetická krajina v1: louka 70 od 50 m, pak les', () => {
    const land = syntheticLand();
    const batch = land.take(null, 0, 0, 3);
    expect(batch?.parts.map((p) => p.surface)).toEqual(['meadow', 'meadow', 'meadow']);
    expect(batch?.parts[0]?.distanceM).toBe(50);
    expect(batch?.next).toBe(3);
    expect(land.isForest(0)).toBe(false);
    expect(land.isForest(1556)).toBe(true);
  });

  it('pálení drnu zlevní založení louky a do první sklizně sníží úrodnost', () => {
    const land = syntheticLand();
    const base = village(land, 5);
    const burned = structuredClone(base);
    applyVariantToNewParts(burned, 0, 'meadow-burn');
    const ha = 225 / 10_000;
    for (const [i, part] of burned.parts.entries()) {
      const original = base.parts[i]!;
      expect(part.foundingCost).toBeCloseTo(original.foundingCost - (100 - 50) * ha);
      expect(part.naturalFertility).toBe(
        original.naturalFertility + MEADOW_BURN.firstSeasonFertility,
      );
      expect(naturalFertilityOf(part)).toBe(original.naturalFertility);
    }
    const field = (s: VillageState): number =>
      s.constructions.find((c) => c.kind === 'field')?.cost ?? NaN;
    expect(field(burned)).toBeCloseTo(field(base) - 5 * (100 - 50) * ha);

    // první sklizeň: osetý díl dostane úrodnost zpět, neosetý ji čeká dál
    burned.parts[0]!.state = 'sown';
    restoreBurnedAfterHarvest(burned);
    expect(burned.parts[0]!.naturalFertility).toBe(base.parts[0]!.naturalFertility);
    expect(burned.parts[1]!.naturalFertility).toBe(base.parts[1]!.naturalFertility - 20);

    const unchanged = structuredClone(base);
    applyVariantToNewParts(unchanged, 0, 'base');
    expect(unchanged).toEqual(base);
  });

  it('hráč cení blízkou a úrodnou půdu víc, les s popelem nad chudou loukou', () => {
    const meadow = {
      areaM2: 225,
      distanceM: 200,
      naturalFertility: 70,
      surface: 'meadow' as const,
      obstacleCost: 0,
    };
    expect(squareValue({ ...meadow, distanceM: 600 })).toBeLessThan(squareValue(meadow));
    expect(squareValue({ ...meadow, naturalFertility: 45 })).toBeLessThan(squareValue(meadow));
    const forest = { ...meadow, surface: 'forest' as const, naturalFertility: 55 };
    expect(squareValue(forest)).toBeGreaterThan(squareValue({ ...meadow, naturalFertility: 45 }));
  });

  it('skutečná krajina: první pole z úrodných čtverců do 800 m', () => {
    const land = realLand(0);
    const first = land.take(null, 0, 0, 75);
    expect(first?.parts).toHaveLength(75);
    for (const part of first?.parts ?? []) {
      expect(part.distanceM).toBeLessThanOrEqual(FIELD_LIMITS.maxDistanceM);
      expect(part.cell).toBeDefined();
    }
    const fertile = (first?.parts ?? []).filter((p) => p.naturalFertility >= 60).length;
    expect(fertile).toBeGreaterThan(60);
    // další dávka navazuje v pořadí hráče
    const next = land.take(null, 0, first?.next ?? 0, 10);
    expect(next?.parts[0]?.cell).not.toEqual(first?.parts[0]?.cell);
  });
});
