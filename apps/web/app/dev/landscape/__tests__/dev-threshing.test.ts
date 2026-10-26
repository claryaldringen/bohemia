import { describe, expect, it } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import type { SceneField } from '@/lib/scene/village-types';
import {
  demoThreshing,
  nextThreshingDemo,
  withThreshingField,
  type ThreshingDemoStage,
} from '../dev-threshing';

// Ukázka humna na /dev/landscape (production-chains.md – Humno, Obilné jámy).

describe('ukázka humna na /dev/landscape', () => {
  const l = generateLandscape(1);
  const base = { dwellings: [], fields: [] };
  const ids = { floor: 1, pit: 2 };

  it('kroky jdou žně → výmlat → jámy → vypnuto', () => {
    const order: (ThreshingDemoStage | null)[] = [null];
    for (let k = 0; k < 4; k++) order.push(nextThreshingDemo(order.at(-1)!));
    expect(order).toEqual([null, 'harvest', 'thresh', 'pits', null]);
  });

  it('humno stojí na louce u vsi; výmlat mlátí na humně, jámy mají nosiče zrna', () => {
    const thresh = demoThreshing(l, base, 'thresh', ids)!;
    expect(thresh).not.toBeNull();
    expect(thresh.threshingFloors[0]).toMatchObject({ built: true, threshing: true });
    expect(thresh.labor.shares[0]).toMatchObject({
      activity: 'thresh',
      target: { kind: 'threshing-floor', id: 1 },
    });
    const pits = demoThreshing(l, base, 'pits', ids)!;
    expect(pits.grainPits).toHaveLength(1);
    expect(pits.threshingFloors[0]!.grainKg).toBeGreaterThan(0);
    expect(pits.labor.shares[0]!.activity).toBe('grain-pit');
    // stejný vstup – stejná ukázka
    expect(demoThreshing(l, base, 'pits', ids)).toEqual(pits);
  });

  it('žně: pole ukázky ve žni, nosiči snopů míří na humno', () => {
    const field: SceneField = {
      id: 5,
      parts: [{ cell: { x: 0, y: 0 }, x: 0, z: 0, size: 15, stage: 'sown', look: 'ripe' }],
    };
    const harvest = demoThreshing(l, { dwellings: [], fields: [field] }, 'harvest', ids);
    expect(harvest?.fieldId).toBe(5);
    expect(harvest?.labor.shares.map((s) => s.activity)).toEqual(['harvest', 'carry', 'domestic']);
    const [part] = withThreshingField([field], harvest!)[0]!.parts;
    expect(part).toMatchObject({ look: 'harvesting', before: 'ripe' });
  });
});
