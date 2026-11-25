import { describe, expect, it } from 'vitest';
import type { SkeletonSlice } from '../../../landscape/skeleton/types';
import { isDry, isTrailOnly, riverCrossings, seatSlot } from '..';

type R = SkeletonSlice['rivers'][number];
type T = SkeletonSlice['trails'][number];

const river = (side: R['side'], at: number, flow: R['flow']): R => ({
  side,
  at,
  widthM: 25,
  flow,
});
const trail = (side: T['side'], at: number): T => ({ side, at });
const slice = (rivers: R[], trails: T[]): SkeletonSlice => ({ world: 1, rivers, trails });

const northSouth = [river('N', 60, 'in'), river('S', 60, 'out')];

describe('místa kostry', () => {
  it('riverCrossings: řeka N→S a stezka W→E = 1', () => {
    expect(riverCrossings(slice(northSouth, [trail('W', 60), trail('E', 60)]))).toBe(1);
  });

  it('riverCrossings: stezka W→N západně od řeky = 0', () => {
    expect(riverCrossings(slice(northSouth, [trail('W', 60), trail('N', 20)]))).toBe(0);
  });

  it('riverCrossings: křižovatka se třemi body přes řeku = 1', () => {
    const t = [trail('W', 60), trail('E', 60), trail('N', 100)];
    expect(riverCrossings(slice(northSouth, t))).toBe(1);
  });

  it('riverCrossings: bez řeky 0', () => {
    expect(riverCrossings(slice([], [trail('W', 60), trail('E', 60)]))).toBe(0);
  });

  it('seatSlot: všechny větve', () => {
    expect(seatSlot(null)).toBe('dry');
    expect(isDry(null)).toBe(true);
    expect(isDry(slice(northSouth, []))).toBe(false);
    expect(seatSlot(slice(northSouth, []))).toBe('river');
    expect(seatSlot(slice([], [trail('W', 60), trail('E', 60)]))).toBe('trail');
    expect(seatSlot(slice(northSouth, [trail('W', 60), trail('E', 60)]))).toBe('ford');
    // řeka i stezka bez přechodu
    expect(seatSlot(slice(northSouth, [trail('W', 60), trail('N', 20)]))).toBeNull();
    // pramen
    expect(seatSlot(slice([river('S', 60, 'out')], []))).toBeNull();
    // soutok dvou řek
    const confluence = [river('N', 40, 'in'), river('E', 60, 'in'), river('S', 60, 'out')];
    expect(seatSlot(slice(confluence, []))).toBeNull();
    // konec stezky, křižovatka
    expect(seatSlot(slice([], [trail('W', 60)]))).toBeNull();
    expect(seatSlot(slice([], [trail('W', 60), trail('E', 60), trail('N', 60)]))).toBeNull();
  });

  it('isTrailOnly: stezka bez řeky, i křižovatka a konec stezky', () => {
    expect(isTrailOnly(slice([], [trail('W', 60), trail('E', 60)]))).toBe(true);
    expect(isTrailOnly(slice([], [trail('N', 60), trail('E', 60)]))).toBe(true);
    // konec stezky, křižovatka tří a čtyř směrů
    expect(isTrailOnly(slice([], [trail('W', 60)]))).toBe(true);
    const three = [trail('W', 60), trail('E', 60), trail('N', 60)];
    expect(isTrailOnly(slice([], three))).toBe(true);
    expect(isTrailOnly(slice([], [...three, trail('S', 60)]))).toBe(true);
  });

  it('isTrailOnly: suchá mapa, řeka, brod, pramen a soutok ne – ani když jimi vede stezka', () => {
    const across = [trail('W', 60), trail('E', 60)];
    expect(isTrailOnly(null)).toBe(false);
    expect(isTrailOnly(slice([], []))).toBe(false);
    expect(isTrailOnly(slice(northSouth, []))).toBe(false);
    // brod, řeka i stezka bez přechodu
    expect(isTrailOnly(slice(northSouth, across))).toBe(false);
    expect(isTrailOnly(slice(northSouth, [trail('W', 60), trail('N', 20)]))).toBe(false);
    const spring = [river('S', 60, 'out')];
    const confluence = [river('N', 40, 'in'), river('E', 60, 'in'), river('S', 60, 'out')];
    for (const rivers of [spring, confluence]) {
      expect(isTrailOnly(slice(rivers, []))).toBe(false);
      expect(isTrailOnly(slice(rivers, across))).toBe(false);
    }
  });
});
