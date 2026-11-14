import { describe, expect, it } from 'vitest';
import type { SceneBurnerCamp } from '../../village-view';
import {
  CAMP_ENTRANCE_M,
  POLE_SPACING_M,
  campEntrance,
  campLook,
  campUp,
  campsKey,
} from '../burner-camp-layout';

const camp = (over: Partial<SceneBurnerCamp> = {}): SceneBurnerCamp => ({
  id: 1,
  burnerId: 21,
  x: 10,
  z: -4,
  rotation: 0,
  built: 1,
  occupied: false,
  overgrowth: null,
  ...over,
});

describe('campLook – vzhled zemnice u milíře (workshops.md – Uhlíř)', () => {
  it('rozestavěná zemnice jsou jen klády, hotová model', () => {
    expect(campLook(camp({ built: 0.5 })).part).toBe('milir-zemnice-logs');
    expect(campLook(camp({ built: 1 })).part).toBe('milir-zemnice');
  });

  it('opuštěná sesedá o 0,6 m a střecha se nakloní o 12° podle zchátrání', () => {
    const half = campLook(camp({ overgrowth: 0.5 }));
    expect(half.sinkM).toBeCloseTo(0.3, 10);
    expect(half.tiltDeg).toBeCloseTo(6, 10);
    expect(campLook(camp({ overgrowth: 1 }))).toMatchObject({ sinkM: 0.6, tiltDeg: 12 });
    expect(campLook(camp())).toMatchObject({ sinkM: 0, tiltDeg: 0 });
  });
});

describe('campsKey a vchod', () => {
  it('klíč se mění jen se vzhledem zemnice; `occupied` ho nemění', () => {
    const a = campsKey([camp()]);
    expect(campsKey([camp({ occupied: true })])).toBe(a);
    expect(campsKey([camp({ built: 0.85 })])).not.toBe(a);
    expect(campsKey([camp({ overgrowth: 0.1 })])).not.toBe(a);
    expect(campsKey([])).toBe('');
  });

  it('vchod je před zemnicí ve směru osy +z modelu, náklon je napříč vchodem', () => {
    const e = campEntrance(camp({ rotation: Math.PI / 2 }));
    expect(e.x).toBeCloseTo(10 + CAMP_ENTRANCE_M, 10);
    expect(e.z).toBeCloseTo(-4, 10);
    const up = campUp({ rotation: 0 }, 12);
    expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 10);
    expect(up.z).toBeCloseTo(0, 10);
    expect(up.x).toBeGreaterThan(0);
  });

  it('rozestup nosičů na tyči je 2,4 m', () => {
    expect(POLE_SPACING_M).toBe(2.4);
  });
});
