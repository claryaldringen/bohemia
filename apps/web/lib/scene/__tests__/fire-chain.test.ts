import { describe, expect, it } from 'vitest';
import type { SceneFire } from '../../village-view';
import { houseFireKey, houseFires } from '../house-fire';
import { houseFireState } from '../smoke-schedule';
import { createVillagerPose } from '../villager-motion';
import {
  fireBuckets,
  fireChainLayout,
  fireChainPose,
  maxFireBuckets,
  type BucketPose,
} from '../villager-plan-fire';

/** Požár s řetězem od vody (0, 0) k domu (0, 60). */
function fire(people: number, distance = 60): SceneFire {
  return {
    day: 10,
    burning: [
      { id: 1, x: 0, z: distance, type: 'polozemnice', rotation: 0, started: true },
      { id: 2, x: 12, z: distance, type: 'zemnice', rotation: 0 },
    ],
    chain: {
      water: { x: 0, z: 0 },
      target: { x: 0, z: distance },
      people,
      spacingM: distance / people,
    },
  };
}

describe('řetěz s vědry (villager-plan-fire.ts)', () => {
  it('do 2,5 m podávají – lidé rovnoměrně od vody k domu, střídavě po stranách', () => {
    const layout = fireChainLayout(fire(30))!;
    expect(layout.mode).toBe('pass');
    expect(layout.stations).toHaveLength(30);
    expect(layout.stations[0]).toEqual({ x: 0, z: 0 });
    // poslední stojí kousek před domem, rozestupy stejné
    const last = layout.stations[29]!;
    expect(last.z).toBeCloseTo(60 - 4.6, 6);
    for (let i = 1; i < 30; i++) {
      expect(layout.stations[i]!.z - layout.stations[i - 1]!.z).toBeCloseTo(layout.stepM, 6);
    }
    const out = createVillagerPose();
    const a = fireChainPose(layout, 4, 'man', 1.2)(0, [], { ...out });
    const b = fireChainPose(layout, 5, 'man', 1.2)(0, [], { ...out });
    expect(a.clip).toBe('idle');
    expect(Math.sign(a.x)).toBe(-Math.sign(b.x));
    // čelem k ose řady
    expect(Math.sign(a.headingX)).toBe(-Math.sign(a.x));
  });

  it('nad 2,5 m chodí každý po svém úseku a sousedé se potkají na jeho konci', () => {
    const layout = fireChainLayout(fire(8))!;
    expect(layout.mode).toBe('walk');
    expect(layout.stations).toHaveLength(9);
    const pose = (i: number, t: number): ReturnType<typeof createVillagerPose> =>
      fireChainPose(layout, i, 'woman', 1.2)(t, [], createVillagerPose());
    // člověk se drží svého úseku
    for (let t = 0; t < 60; t += 0.7) {
      const p = pose(3, t);
      expect(p.z).toBeGreaterThanOrEqual(layout.stations[3]!.z - 1e-6);
      expect(p.z).toBeLessThanOrEqual(layout.stations[4]!.z + 1e-6);
    }
    // když 3 stojí na konci úseku (předává), 4 stojí na začátku svého – kousek od sebe
    let met = 0;
    for (let t = 0; t < 60; t += 0.1) {
      const a = pose(3, t);
      const b = pose(4, t);
      if (a.clip === 'idle' && a.headingZ > 0) {
        expect(b.clip).toBe('idle');
        expect(Math.abs(b.z - a.z)).toBeLessThan(1);
        met++;
      }
    }
    expect(met).toBeGreaterThan(0);
  });

  it('bez vody nebo hasičů řetěz není; víc lidí než postav – řada od ohně s rozestupem jádra', () => {
    expect(fireChainLayout(undefined)).toBeNull();
    const dry = fire(10);
    delete dry.chain;
    expect(fireChainLayout(dry)).toBeNull();
    const crowd = fireChainLayout(fire(200, 300))!;
    expect(crowd.count).toBe(80);
    expect(crowd.stepM).toBeCloseTo(1.5, 6);
  });

  it('vědra: podávají po ose řady, při chůzi každý nese jedno', () => {
    const pass = fireChainLayout(fire(30))!;
    const out: BucketPose[] = [];
    const n = fireBuckets(pass, 12.3, out);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(maxFireBuckets(pass));
    for (const b of out.slice(0, n)) expect(Math.abs(b.x)).toBeLessThan(1e-6);
    const walk = fireChainLayout(fire(8))!;
    expect(fireBuckets(walk, 5, out)).toBe(8);
  });
});

describe('hořící dům (house-fire.ts, houseFireState)', () => {
  it('hoří jen v den požáru, kde chytlo dřív než soused', () => {
    expect(houseFireState(10, 9.9).fire).toBe(0);
    expect(houseFireState(10, 11.2).smoke).toBe(0);
    expect(houseFireState(10, 10.4).fire).toBe(1);
    expect(houseFireState(10, 10.05, 0).fire).toBeGreaterThan(houseFireState(10, 10.05, 1).fire);
    // večer jen uhlíky a dým doutnání
    const evening = houseFireState(10, 10.9);
    expect(evening.fire).toBe(0);
    expect(evening.glow).toBeGreaterThan(0);
    expect(evening.smoke).toBeGreaterThan(0);
  });

  it('ohně podél hřebene každé hořící stavby, klíč podle dne a staveb', () => {
    const heaps = houseFires(fire(10));
    expect(heaps).toHaveLength(4);
    expect(heaps[0]!.order).toBe(0);
    expect(heaps[2]!.order).toBe(1);
    expect(houseFires(undefined)).toEqual([]);
    expect(houseFireKey(fire(10))).not.toBe(houseFireKey({ ...fire(10), day: 11 }));
  });
});
