import { describe, expect, it } from 'vitest';
import type { Random } from '../../landscape/random';
import {
  bowShot,
  shotChance,
  shotHit,
  spreadRadiusM,
  visibleAreaM2,
  type ShotCandidate,
  type TargetPose,
} from '../aim';
import { attacker, battle, defender } from './battle-fixtures';

// Střelba podle dovednosti (fortifications.md – Střelba a viditelná plocha; Martin 8. 11. 2026).

const standing = (id: string, side: 'attack' | 'defend' = 'defend'): ShotCandidate => ({
  id,
  side,
  areaM2: 0.85,
});

/** Náhoda se zadanými losy (dokola). */
const rolls = (...values: number[]): Random & { used: number } => {
  const r = {
    used: 0,
    next: (): number => values[r.used++ % values.length]!,
  };
  return r as Random & { used: number };
};

describe('kruh rozptylu a viditelná plocha', () => {
  it('mistr 0,5 m na 30 m, nováček 2 m, vesničan na 15 m 0,85 m', () => {
    expect(spreadRadiusM(100, 30)).toBeCloseTo(0.5, 9);
    expect(spreadRadiusM(0, 30)).toBeCloseTo(2, 9);
    expect(spreadRadiusM(20, 15)).toBeCloseTo(0.85, 9);
  });

  it('stojící 0,85, za předprsní 0,25, lezec 0,85, v podkopu 0', () => {
    const poses: TargetPose[] = ['standing', 'parapet', 'climbing', 'underground'];
    expect(poses.map(visibleAreaM2)).toEqual([0.85, 0.25, 0.85, 0]);
  });
});

describe('šance na zásah', () => {
  it('jeden stojící na 60 m u nováčka: 0,85 ÷ 16 π', () => {
    const r = spreadRadiusM(0, 60);
    expect(r).toBeCloseTo(4, 9);
    expect(shotChance([standing('d:1')], r)).toBeCloseTo(0.85 / (16 * Math.PI), 9);
  });

  it('hlouček 5 stojících v kruhu 2 m: 4,25 ÷ 4 π', () => {
    const five = [1, 2, 3, 4, 5].map((i) => standing(`d:${i}`));
    expect(shotChance(five, 2)).toBeCloseTo(4.25 / (4 * Math.PI), 9);
  });

  it('šance nejvýš 1', () => {
    const five = [1, 2, 3, 4, 5].map((i) => standing(`d:${i}`));
    expect(shotChance(five, 0.5)).toBe(1);
    expect(shotChance([], 1)).toBe(0);
  });

  it('pick vybere zasaženého podle podílu ploch; los nad šancí mine', () => {
    const c: ShotCandidate[] = [
      { id: 'a', side: 'defend', areaM2: 0.25 },
      { id: 'b', side: 'defend', areaM2: 0.75 },
    ];
    // kruh 0,5 m – šance 1
    expect(shotHit(c, 0.5, 0.99, 0)).toBe('a');
    expect(shotHit(c, 0.5, 0.99, 0.24)).toBe('a');
    expect(shotHit(c, 0.5, 0.99, 0.26)).toBe('b');
    expect(shotHit(c, 0.5, 0.99, 0.999)).toBe('b');
    // kruh 2 m – šance 1 ÷ 4 π ≈ 0,08
    expect(shotHit(c, 2, 0.5, 0.1)).toBeNull();
    expect(shotHit(c, 2, 0.05, 0.1)).toBe('a');
  });
});

describe('výstřel v boji', () => {
  const b = battle({
    attackers: [
      attacker(0, { x: 0, z: -30 }, { line: true, strength: 2, bowSkill: 100 }),
      attacker(1, { x: 0.3, z: 0 }, { group: 1 }),
    ],
    defenders: [defender(1, { x: 0, z: 0 }), defender(2, { x: 0, z: 5 })],
  });
  const shooter = b.fighters.find((f) => f.id === 'a:0')!;
  const target = b.fighters.find((f) => f.id === 'd:1')!;
  const stand = (): TargetPose => 'standing';

  it('v kruhu jen vlastní (cíl v podkopu) – nestřílí a nelosuje', () => {
    const rng = rolls(0);
    const pose = (f: { id: string }): TargetPose => (f.id === 'd:1' ? 'underground' : 'standing');
    expect(bowShot(shooter, target, b.fighters, pose, rng)).toEqual({ fired: false });
    expect(rng.used).toBe(0);
  });

  it('hlouček: cíl i vlastní muž v kruhu – šíp smí trefit vlastního', () => {
    // kruh 0,5 m: obránce a vlastní muž 0,3 m od něj, druhý obránce 5 m daleko mimo kruh
    expect(bowShot(shooter, target, b.fighters, stand, rolls(0, 0))).toEqual({
      fired: true,
      hit: 'a:1',
    });
    expect(bowShot(shooter, target, b.fighters, stand, rolls(0, 0.9))).toEqual({
      fired: true,
      hit: 'd:1',
    });
  });

  it('padlí a ranění v kruhu se nepočítají', () => {
    const own = b.fighters.find((f) => f.id === 'a:1')!;
    own.state = 'down';
    expect(bowShot(shooter, target, b.fighters, stand, rolls(0, 0))).toEqual({
      fired: true,
      hit: 'd:1',
    });
    own.state = 'fight';
  });
});
