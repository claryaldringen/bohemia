import { describe, expect, it } from 'vitest';
import { threshingFloorFootprint } from '@bohemia/game';
import {
  FLOOR_PHASES,
  GRAIN_HEAP,
  STRAW_STACK,
  floorPhase,
  floorPoint,
  floorSiteLook,
  thresherSpot,
  threshingFloorGeometry,
  threshingFloorsKey,
  winnowerSpot,
} from '../threshing-floor-layout';
import { pointInPolygon, type Point } from '../village-layout';

// Humno ve scéně (production-chains.md – Humno): fáze stavby, místa a hromady.

const POSITION = { x: 40, z: -20, rotation: 0.7 };
const flat = (): number => 0;
const floor = (progress: number, extra = {}) => ({
  id: 1,
  position: POSITION,
  built: progress >= 1,
  progress,
  ...extra,
});

describe('humno ve scéně', () => {
  it('fáze stavby jdou po sobě a hotové humno je „built“', () => {
    expect(FLOOR_PHASES.map((p) => floorPhase(floor(p.from)))).toEqual(
      FLOOR_PHASES.map((p) => p.phase),
    );
    expect(floorPhase(floor(1))).toBe('built');
  });

  it('staveniště: kolíky na začátku, mlat přibývá, hromady drnů a hlíny se objeví a zmizí', () => {
    expect(floorSiteLook(floor(0))).toEqual({ staking: true, decal: 0, turf: 0, clay: 0 });
    const turf = floorSiteLook(floor(0.3));
    expect(turf.turf).toBeGreaterThan(0.8);
    expect(turf.clay).toBe(0);
    expect(floorSiteLook(floor(0.55)).clay).toBeGreaterThan(0.8);
    expect(floorSiteLook(floor(0.7)).decal).toBeGreaterThan(floorSiteLook(floor(0.3)).decal);
    expect(floorSiteLook(floor(1))).toEqual({ staking: false, decal: 1, turf: 0, clay: 0 });
  });

  it('mlatci, prohazovači, stoh a hromádka zrna leží na mlatu', () => {
    const area = threshingFloorFootprint(POSITION).map(([x, z]): Point => [x, z]);
    const inside = (lx: number, lz: number): boolean => {
      const p = floorPoint(POSITION, lx, lz);
      return pointInPolygon(area, p.x, p.z);
    };
    for (let k = 0; k < 8; k++) expect(inside(thresherSpot(k).lx, thresherSpot(k).lz)).toBe(true);
    for (let k = 0; k < 3; k++) expect(inside(winnowerSpot(k).lx, winnowerSpot(k).lz)).toBe(true);
    expect(inside(STRAW_STACK.lx, STRAW_STACK.lz)).toBe(true);
    expect(inside(GRAIN_HEAP.lx, GRAIN_HEAP.lz)).toBe(true);
  });

  it('klasy a zrno jen na hotovém humnu, klíč se mění jen s tím, co je vidět', () => {
    expect(threshingFloorGeometry([floor(1)], flat).indices).toHaveLength(0);
    const busy = threshingFloorGeometry([floor(1, { threshing: true, grainKg: 200 })], flat);
    expect(busy.indices.length).toBeGreaterThan(0);
    expect(busy.colors.length).toBe(busy.positions.length);
    expect(threshingFloorGeometry([floor(0.2)], flat).indices.length).toBeGreaterThan(0);
    // klasy nad obtiskem mlatu (LIFT.turf a THRESHING_FLOOR_Z_OFFSET) – celá vrstva, ne hrbolky
    const bed = threshingFloorGeometry([floor(1, { threshing: true })], flat);
    const ys = bed.positions.filter((_, i) => i % 3 === 1);
    expect(ys.filter((y) => y >= 0 && y < 0.15)).toEqual([]);
    expect(ys.filter((y) => y >= 0.15).length).toBeGreaterThan(ys.length / 2);
    expect(threshingFloorsKey([floor(0.2)])).toBe(threshingFloorsKey([floor(0.21)]));
    expect(threshingFloorsKey([floor(1, { straw: 0.5 })])).not.toBe(
      threshingFloorsKey([floor(1, { straw: 0.55 })]),
    );
  });
});
