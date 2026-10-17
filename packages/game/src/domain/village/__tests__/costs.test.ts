import { describe, expect, it } from 'vitest';
import { foundField, foundVillage, startNewDwelling } from '../actions';
import {
  BUILD_COSTS,
  affordability,
  buildAffordability,
  payUpfront,
  type BuildCost,
  type BuildKind,
} from '../costs';
import { DWELLINGS, FOUNDING_COST_PER_HA } from '../rules';
import type { VillageState } from '../types';

const DAY = 1000;
const POSITION = { x: 10, z: 20, rotation: 0 };
const start = (): VillageState => foundVillage({ seed: 7, day: DAY, dwellingPosition: POSITION });

/** Hypotetická cena předem – kontrola mechanismu, než vznikne první surovina (dřevo, kámen). */
const withUpfront = (kind: BuildKind, grain: number): Record<BuildKind, BuildCost> => ({
  ...BUILD_COSTS,
  [kind]: { ...BUILD_COSTS[kind], upfront: { grain } },
});

describe('ceny staveb', () => {
  it('práce podle pravidel, nic předem', () => {
    expect(BUILD_COSTS.zemnice).toEqual({
      laborManDays: DWELLINGS.zemnice.cost,
      perHa: false,
      upfront: {},
    });
    expect(BUILD_COSTS.polozemnice.laborManDays).toBe(DWELLINGS.polozemnice.cost);
    expect(BUILD_COSTS.field).toMatchObject({
      laborManDays: FOUNDING_COST_PER_HA.meadow,
      perHa: true,
    });
  });

  it('dnes ves má na každou stavbu – i bez zásob', () => {
    const s = start();
    s.storesKg = 0;
    for (const kind of ['zemnice', 'polozemnice', 'field'] as const) {
      expect(buildAffordability(s, kind)).toEqual({ affordable: true, missing: {} });
    }
  });
});

describe('affordability', () => {
  it('chybějící část po surovinách', () => {
    expect(affordability({ grain: 30 }, { grain: 50 })).toEqual({
      affordable: false,
      missing: { grain: 20 },
    });
    expect(affordability({ grain: 50 }, { grain: 50 })).toEqual({ affordable: true, missing: {} });
    expect(affordability({ grain: 0 }, {})).toEqual({ affordable: true, missing: {} });
  });

  it('hypotetická cena předem: bez zásob stavba nejde, se zásobami se zaplatí', () => {
    const s = start();
    const costs = withUpfront('zemnice', s.storesKg + 40);
    expect(buildAffordability(s, 'zemnice', costs)).toEqual({
      affordable: false,
      missing: { grain: expect.closeTo(40, 6) },
    });
    expect(buildAffordability(s, 'polozemnice', costs).affordable).toBe(true);
    const cheap = withUpfront('zemnice', 100);
    const paid = structuredClone(s);
    payUpfront(paid, 'zemnice', cheap);
    expect(paid.storesKg).toBeCloseTo(s.storesKg - 100);
  });
});

describe('akce s cenou předem', () => {
  it('startNewDwelling a foundField dnes nic předem neberou', () => {
    const s = start();
    const built = startNewDwelling(s, DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(built.storesKg).toBe(s.storesKg);
    const field = foundField(s, DAY, {
      parts: [
        {
          areaM2: 1500,
          distanceM: 100,
          naturalFertility: 60,
          surface: 'meadow',
          obstacleCost: 0,
        },
      ],
    });
    expect(field.storesKg).toBe(s.storesKg);
  });
});
