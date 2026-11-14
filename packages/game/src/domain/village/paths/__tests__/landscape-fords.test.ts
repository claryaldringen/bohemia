import { describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  SKELETON_LAYER_VERSION,
  type Landscape,
  type PremiumType,
  type SkeletonSlice,
} from '../../../landscape';
import { landscapeFordSpots } from '../terrain';

// Brod na každé mapě s potokem (landscape.md, 14. 11. 2026): brod sítě pěšin (PATH_FORD) je
// mělčina potoka nebo řeky – na každé mapě s vodou aspoň jeden.

const skeleton: SkeletonSlice = {
  world: 1,
  rivers: [
    { side: 'N', at: 50, widthM: 40, flow: 'in' },
    { side: 'E', at: 64, widthM: 25, flow: 'in' },
    { side: 'S', at: 80, widthM: 45, flow: 'out' },
  ],
  trails: [],
};

describe('landscapeFordSpots – brody celé mapy', () => {
  it.each([[1], [2], [3], [42]])('průměrná krajina %i má brod', (seed) => {
    expect(landscapeFordSpots(generateLandscape(seed)).length).toBeGreaterThan(0);
  });

  it.each([
    [7919, 'natural-fortress'],
    [47514, 'confluence'],
    [7919, 'navigable-river'],
  ] as const)('prémiová krajina %i (%s) má brod', (seed, premium: PremiumType) => {
    expect(landscapeFordSpots(generateLandscape(seed, undefined, premium)).length).toBeGreaterThan(
      0,
    );
  });

  it('výřez kostry s řekou a přítokem má brod na každém toku', () => {
    const l: Landscape = generateLandscape(
      7919,
      { ...CURRENT_LAYER_VERSIONS, skeleton: SKELETON_LAYER_VERSION },
      undefined,
      skeleton,
    );
    const fords = landscapeFordSpots(l);
    expect(fords.length).toBeGreaterThan(0);
    // každý tok (potok i obě řeky) má mělčinu – brod sítě pěšin leží na mělčině
    for (const course of [l.stream, ...(l.rivers ?? [])]) {
      expect(course.some((p) => p.shallow)).toBe(true);
    }
  });

  it('v mezipaměti podle krajiny – tentýž seznam', () => {
    const l = generateLandscape(1);
    expect(landscapeFordSpots(l)).toBe(landscapeFordSpots(l));
  });
});
