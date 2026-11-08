import { describe, expect, it } from 'vitest';
import {
  FORT_MIN_POINTS,
  insertPoint,
  movePoint,
  nearestOnLoop,
  nearestPoint,
  removePoint,
  type FortEditPoint,
} from '../fort-points';

// Úprava obvodu opevnění z bodů (fortifications.md – Obvod): přidání bodu klikem na obvod,
// ubrání Ctrl + klikem (nejméně 4), posun tažením.

const square: FortEditPoint[] = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
];

describe('body obvodu opevnění', () => {
  it('klik na obvod vloží bod mezi body, mezi kterými obvod vede', () => {
    expect(insertPoint(square, [10, 0.5])).toEqual([
      [0, 0],
      [10, 0.5],
      [20, 0],
      [20, 20],
      [0, 20],
    ]);
    expect(insertPoint(square, [19.5, 12])).toEqual([
      [0, 0],
      [20, 0],
      [19.5, 12],
      [20, 20],
      [0, 20],
    ]);
    expect(insertPoint(square, [0.2, 5])).toEqual([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0.2, 5],
    ]);
  });

  it('ubrat jde jen nad 4 body', () => {
    expect(FORT_MIN_POINTS).toBe(4);
    expect(removePoint(square, 1)).toBeNull();
    const five = insertPoint(square, [10, 0])!;
    expect(removePoint(five, 1)).toEqual(square);
    expect(removePoint(five, 9)).toBeNull();
  });

  it('posun mění jen tažený bod; nejbližší bod a místo na obvodu', () => {
    expect(movePoint(square, 2, [25, 25])).toEqual([
      [0, 0],
      [20, 0],
      [25, 25],
      [0, 20],
    ]);
    expect(nearestPoint(square, 19, 1, 2)).toBe(1);
    expect(nearestPoint(square, 10, 10, 2)).toBeNull();
    const near = nearestOnLoop([...square, square[0]!], 10, 3);
    expect(near?.point).toEqual([10, 0]);
    expect(near?.distance).toBeCloseTo(3, 9);
  });

  it('trasa úseku jinudy (konce v branách): bod nepřibude mezi konce, ubrat jde až po konce', () => {
    const route: FortEditPoint[] = [
      [0, 0],
      [10, 5],
      [20, 0],
    ];
    // nejblíž spojnici konců (jako u obvodu) – na otevřené trase mezi sousední body
    expect(insertPoint(route, [10, -1], true)).toEqual([
      [0, 0],
      [10, -1],
      [10, 5],
      [20, 0],
    ]);
    expect(nearestOnLoop(route, 10, -1, true)?.distance).toBeGreaterThan(5);
    expect(removePoint(route, 1, 2)).toEqual([
      [0, 0],
      [20, 0],
    ]);
    expect(removePoint([route[0]!, route[2]!], 0, 2)).toBeNull();
  });
});
