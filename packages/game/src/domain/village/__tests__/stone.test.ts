import { describe, expect, it } from 'vitest';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { quarryNear, stoneOnHand, takeStone } from '../stone';
import type { StoneStack, VillageState } from '../types';

// Zásoba kamene (fortifications.md – Hradby a obrana, Kámen): hromady u cest a lom ve výchozu.

function village(stacks: StoneStack[], loose = 0): VillageState {
  const total = stacks.reduce((sum, s) => sum + s.m3, 0) + loose;
  return { stoneM3: total, stoneStacks: stacks.map((s) => ({ ...s })) } as unknown as VillageState;
}

const stack = (id: number, x: number, m3: number): StoneStack => ({ id, x, z: 0, m3 });

describe('zásoba kamene', () => {
  it('ves bez kamene má 0', () => {
    expect(stoneOnHand({})).toBe(0);
    expect(stoneOnHand({ stoneM3: 2.5 })).toBe(2.5);
  });

  it('bere z nejbližší hromady, prázdnou odebere', () => {
    const s = village([stack(1, 0, 3), stack(2, 100, 5)]);
    takeStone(s, 4, { x: 90, z: 0 });
    expect(s.stoneStacks).toEqual([stack(1, 0, 3), stack(2, 100, 1)]);
    expect(stoneOnHand(s)).toBe(4);
    takeStone(s, 2, { x: 90, z: 0 });
    expect(s.stoneStacks).toEqual([stack(1, 0, 2)]);
    expect(stoneOnHand(s)).toBe(2);
  });

  it('při shodě vzdálenosti menší id; víc, než ves má, nevezme', () => {
    const s = village([stack(2, 10, 1), stack(1, -10, 1)]);
    takeStone(s, 1, { x: 0, z: 0 });
    expect(s.stoneStacks).toEqual([stack(2, 10, 1)]);
    takeStone(s, 5, { x: 0, z: 0 });
    expect(s.stoneStacks).toBeUndefined();
    expect(s.stoneM3).toBeUndefined();
    expect(stoneOnHand(s)).toBe(0);
  });

  it('co hromady nepokryjí, ubere ze zásoby bez hromady', () => {
    const s = village([stack(1, 0, 1)], 2);
    takeStone(s, 2, { x: 0, z: 0 });
    expect(s.stoneStacks).toBeUndefined();
    expect(stoneOnHand(s)).toBeCloseTo(1, 9);
  });
});

describe('lom ve skalním výchozu', () => {
  const placed = (
    id: number,
    kind: 'outcrop' | 'boulder',
    x: number,
    z: number,
  ): ObstaclePlacement => ({
    id,
    kind,
    look: 'rock-ridge',
    x,
    z,
    rotation: 0,
    scale: 1,
  });

  it('bez výchozu null', () => {
    const layer = packObstacles([placed(1, 'boulder', 10, 10)], 64, 15);
    expect(quarryNear(layer, { x: 0, z: 0 })).toBeNull();
  });

  it('nejbližší výchoz a vzdálenost k němu', () => {
    const layer = packObstacles(
      [placed(1, 'outcrop', 300, 0), placed(2, 'boulder', 10, 0), placed(3, 'outcrop', 0, -40)],
      64,
      15,
    );
    const quarry = quarryNear(layer, { x: 0, z: 30 });
    expect(quarry?.x).toBe(0);
    expect(quarry?.z).toBe(-40);
    expect(quarry?.distanceM).toBeCloseTo(70, 6);
  });
});
