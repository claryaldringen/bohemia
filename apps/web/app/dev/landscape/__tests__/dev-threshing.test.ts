import { describe, expect, it } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import type { SceneField } from '@/lib/scene/village-types';
import { planVillagers, type VillagerGround } from '@/lib/scene/villager-plan';
import { createVillagerPose } from '@/lib/scene/villager-motion';
import type { SceneVillage } from '@/lib/village-view';
import {
  demoThreshing,
  nextThreshingDemo,
  withThreshingDemo,
  withThreshingField,
  withoutThreshingDemo,
  type ThreshingDemoStage,
} from '../dev-threshing';
import { withDemoPersons } from '../dev-labor';

// Ukázka humna na /dev/landscape (production-chains.md – Humno, Obilné jámy).

describe('ukázka humna na /dev/landscape', () => {
  const l = generateLandscape(1);
  const base = { dwellings: [], fields: [] };
  const ids = { floor: 1, pit: 2, field: 3, dwelling: 4 };

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

  it('prázdná vývojová ves (bez domů a polí): u humna jsou lidé – nosiči snopů, mlatci, jámy', () => {
    const ground: VillagerGround = { walkable: () => true, tree: () => null, treesIn: () => [] };
    const empty: SceneVillage = { dwellings: [], fields: [] };
    const plan = (stage: ThreshingDemoStage): { clip: string; d: number }[] => {
      const demo = demoThreshing(l, empty, stage, ids)!;
      const village = withDemoPersons(withThreshingDemo(empty, demo));
      const at = demo.threshingFloors[0]!.position;
      return planVillagers(village, ground, { seed: 1, herds: 0 })
        .filter((p) => !p.key.startsWith('idle') && !p.key.startsWith('domestic'))
        .map((p) => {
          const pose = p.pose(20, [], createVillagerPose());
          return { clip: pose.clip, d: Math.hypot(pose.x - at.x, pose.z - at.z) };
        });
    };
    // žně: ves bez pole dostane pole ukázky; žnou a nosí snopy
    const harvest = plan('harvest');
    expect(harvest.filter((p) => p.clip === 'reap').length).toBeGreaterThan(0);
    expect(harvest.length).toBeGreaterThan(harvest.filter((p) => p.clip === 'reap').length);
    // výmlat: mlatci s holí a prohazovači s lopatou na humně
    const thresh = plan('thresh');
    expect(thresh.filter((p) => p.clip === 'thresh' && p.d < 7).length).toBeGreaterThanOrEqual(4);
    expect(thresh.filter((p) => p.clip === 'winnow' && p.d < 7).length).toBeGreaterThanOrEqual(1);
    // jámy: lidé u jámy
    expect(plan('pits').length).toBeGreaterThan(0);
  });

  it('další krok ukázky v prázdné vsi přinese domy a pole znovu (ne ty z minulého kroku)', () => {
    const empty: SceneVillage = { dwellings: [], fields: [] };
    const harvest = demoThreshing(l, empty, 'harvest', ids)!;
    expect(harvest.dwellings.length).toBeGreaterThan(0);
    expect(harvest.fields).toHaveLength(1);
    const shown = withThreshingDemo(empty, harvest);
    const thresh = demoThreshing(l, withoutThreshingDemo(shown, harvest), 'thresh', ids)!;
    expect(thresh.dwellings).toEqual(harvest.dwellings);
    expect(thresh.fields.map((f) => f.id)).toEqual(harvest.fields.map((f) => f.id));
  });
});
