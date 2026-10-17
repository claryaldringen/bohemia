import { describe, it, expect } from 'vitest';
import { WATER_VISIBILITY_M, waterClarity, waterVisibilityM } from '../stream-geometry';

describe('waterClarity', () => {
  it('peřej nad štěrkem je průzračná, stojatá tůň kalná', () => {
    expect(waterClarity({ speed: 1, pool: 0 })).toBe(1);
    expect(waterClarity({ speed: 0.1, pool: 1 })).toBe(0);
    expect(waterClarity({ speed: 0.5, pool: 1 })).toBeLessThan(
      waterClarity({ speed: 0.5, pool: 0 }),
    );
  });

  it('viditelnost do hloubky roste s průzračností od kalné po čirou vodu', () => {
    expect(waterVisibilityM(0)).toBe(WATER_VISIBILITY_M[0]);
    expect(waterVisibilityM(1)).toBeCloseTo(WATER_VISIBILITY_M[1], 9);
    expect(waterVisibilityM(0.5)).toBeGreaterThan(waterVisibilityM(0.2));
  });
});
