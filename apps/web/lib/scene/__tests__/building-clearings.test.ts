import { describe, expect, it } from 'vitest';
import { freeDwellingClearings } from '@bohemia/game';
import {
  buildingClearings,
  clearingMask,
  clearingsKey,
  clearingsNear,
} from '../building-clearings';

// Obydlí na poli a v sadu (population.md): pod vyklízenou plochou obydlí bez pozemku scéna
// nekreslí obilí, obtisk pole ani jabloně – stejná plocha, jakou herní jádro z dílu odečte.

const dwelling = (x: number, z: number, extra: object = {}) => ({
  id: 1,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
  ...extra,
});

describe('vyklízené plochy obydlí ve scéně', () => {
  it('obydlí bez pozemku má plochu jako v jádru, obydlí na pozemku žádnou', () => {
    const clearings = buildingClearings([
      dwelling(0, 0),
      dwelling(50, 0, {
        type: 'polozemnice',
        plot: { cell: { x: 11, y: 8 }, x: 52.5, z: 7.5, size: 15, variant: 'center' },
      }),
    ]);
    expect(clearings.map((c) => c.polygon)).toEqual(
      freeDwellingClearings('zemnice', { x: 0, z: 0, rotation: 0 }),
    );
    // zemnice: x −4,8 … 4,8, z −4,4 … 7,5
    expect(clearings[0]).toMatchObject({ minX: -4.8, maxX: 4.8, minZ: -4.4, maxZ: 7.5 });
  });

  it('uhlíř má plochu i kolem milíře', () => {
    expect(buildingClearings([dwelling(0, 0, { craft: 'burner' })])).toHaveLength(2);
  });

  it('maska: ve ploše 0, za okrajem plynule k 1; vzdálené plochy se vyřadí', () => {
    const clearings = buildingClearings([dwelling(0, 0)]);
    const mask = clearingMask(clearings, 2);
    expect(mask(0, 0)).toBe(0);
    expect(mask(5.8, 0)).toBeCloseTo(0.5, 9);
    expect(mask(10, 0)).toBe(1);
    expect(clearingMask([], 2)(0, 0)).toBe(1);
    expect(clearingsNear(clearings, { minX: 20, maxX: 30, minZ: 0, maxZ: 10 }, 1)).toEqual([]);
    expect(clearingsNear(clearings, { minX: 5, maxX: 30, minZ: 0, maxZ: 10 }, 1)).toHaveLength(1);
    expect(clearingsKey(clearings)).toBe(clearingsKey(buildingClearings([dwelling(0, 0)])));
  });
});
