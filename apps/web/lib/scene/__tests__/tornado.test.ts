import { describe, expect, it } from 'vitest';
import { dayIndexOf, type TornadoPlan, type VillageState } from '@bohemia/game';
import { sceneTornado, TORNADO_TRUNK_DAYS } from '../../weather-view';
import { FUNNEL_PASS, funnelProgress, tornadoStorm } from '../storm';
import {
  FUNNEL_PATH_HALF_M,
  fallenTrunk,
  funnelGrowth,
  funnelPoint,
  scatterStacks,
  stackScattered,
  tornadoCropWeight,
} from '../tornado-track';
import type { PlantInstance } from '../field-crops';

const DAY = dayIndexOf({ year: 600, month: 7, day: 15 });
const TRACK = { x: 0, z: 0, angle: Math.PI / 4, lengthM: 10_200, widthM: 124 };
const PLAN: TornadoPlan = { day: DAY, strength: 'F2', track: TRACK };

function state(
  felled: { id: number; day: number }[] = [],
): Pick<VillageState, 'disasters' | 'felledTrees'> {
  return { disasters: { tornado: PLAN }, felledTrees: felled };
}

function stack(x: number, z: number, width = 0.9): PlantInstance {
  return { x, z, rotation: 0, width, height: width, shade: 1, rank: 0.5 };
}

describe('smršť ve scéně', () => {
  it('pohled jen v den smrště a po něm do konce roku, vývraty jen pár dní', () => {
    const felled = [
      { id: 7, day: DAY },
      { id: 8, day: DAY - 3 },
    ];
    expect(sceneTornado(state(felled), DAY - 1)).toBeNull();
    expect(sceneTornado(state(felled), DAY)).toEqual({ ...PLAN, trunks: [7] });
    const later = sceneTornado(state(felled), DAY + TORNADO_TRUNK_DAYS);
    expect(later).toEqual(PLAN);
    expect(sceneTornado(state(felled), dayIndexOf({ year: 601, month: 1, day: 1 }))).toBeNull();
    expect(sceneTornado({ disasters: {} }, DAY)).toBeNull();
  });

  it('tma jako bouřka odpoledne, trychtýř přejde za ≈ 10 s', () => {
    expect(tornadoStorm(0.3)).toBe(0);
    expect(tornadoStorm(0.7)).toBe(1);
    expect(tornadoStorm(0.95)).toBe(0);
    expect(tornadoStorm(Number.NaN)).toBe(0);
    expect(funnelProgress(FUNNEL_PASS[0] - 0.01)).toBeNull();
    expect(funnelProgress(0.7)).toBeCloseTo(0.5, 5);
    expect((FUNNEL_PASS[1] - FUNNEL_PASS[0]) * 86.4).toBeGreaterThan(8);
    expect((FUNNEL_PASS[1] - FUNNEL_PASS[0]) * 86.4).toBeLessThan(12);
  });

  it('trychtýř jde po ose stopy kolem vsi a na koncích roste a slábne', () => {
    const home = { x: 100, z: -100 };
    // bod nejblíž vsi na ose je střed stopy (ves leží kolmo k ose)
    const mid = funnelPoint(TRACK, home, 0.5);
    expect(mid.x).toBeCloseTo(0, 6);
    expect(mid.z).toBeCloseTo(0, 6);
    const end = funnelPoint(TRACK, home, 1);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(FUNNEL_PATH_HALF_M, 6);
    expect(end.x).toBeGreaterThan(0);
    expect(funnelGrowth(0)).toBe(0);
    expect(funnelGrowth(0.5)).toBe(1);
    expect(funnelGrowth(1)).toBe(0);
  });

  it('polehlá úroda a rozmetané stohy jen ve stopě', () => {
    const tornado = { strength: 'F2' as const, track: TRACK };
    expect(tornadoCropWeight(tornado, 10, 10)).toBe(0.8);
    expect(tornadoCropWeight(tornado, 200, -200)).toBe(0);
    expect(tornadoCropWeight(null, 10, 10)).toBe(0);
    const plants = [stack(5, 5), stack(200, -200), stack(5, 6, 0.3)];
    const scattered = scatterStacks(plants, tornado, true);
    // stoh ve stopě → 5 nízkých kupek, stoh mimo a kupka zůstanou
    expect(stackScattered(tornado, 5, 5)).toBe(true);
    expect(scattered).toHaveLength(7);
    expect(scattered.filter((p) => p.height < 0.2)).toHaveLength(5);
    // stohy, které v den smrště nestály, zůstanou celé
    expect(scatterStacks(plants, tornado, false)).toEqual(plants);
  });

  it('padlý kmen leží od pařezu po větru', () => {
    const trunk = fallenTrunk(42, { x: 0, z: 0 }, 0);
    expect(trunk.x).toBeGreaterThan(0);
    expect(Math.abs(trunk.rotationY)).toBeLessThan(0.5);
    expect(Math.hypot(trunk.x, trunk.z)).toBeCloseTo(5, 6);
  });
});
