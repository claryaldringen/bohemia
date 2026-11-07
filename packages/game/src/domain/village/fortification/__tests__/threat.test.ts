import { describe, expect, it } from 'vitest';
import { halfLifeFactor, pruneThreats, villageThreat } from '../threat';
import type { ThreatSignal } from '../types';

// Hrozba vsi (fortifications.md – Hrozba): váhy, poločas 10 let, válka bez úbytku, paměť 50 let.

const YEAR = 365;

describe('villageThreat', () => {
  it('bez signálů je hrozba 0', () => {
    expect(villageThreat(undefined, 1000)).toBe(0);
    expect(villageThreat([], 1000)).toBe(0);
  });

  it('váhy signálů: nájezd na ves 1, na jinou ves rodu 0,5, vojsko 0,3, válka 0,5', () => {
    const at = (kind: ThreatSignal['kind']): number => villageThreat([{ kind, day: 100 }], 100);
    expect(at('raid-here')).toBe(1);
    expect(at('raid-house')).toBe(0.5);
    expect(at('army-seen')).toBe(0.3);
    expect(at('war')).toBe(0.5);
  });

  it('signál slábne s poločasem 10 let', () => {
    const s: ThreatSignal[] = [{ kind: 'raid-here', day: 0 }];
    expect(villageThreat(s, 10 * YEAR)).toBeCloseTo(0.5, 12);
    expect(villageThreat(s, 20 * YEAR)).toBeCloseTo(0.25, 12);
    expect(villageThreat(s, 5 * YEAR)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(halfLifeFactor(0, 3650)).toBe(1);
  });

  it('součet se ořízne na 1', () => {
    const s: ThreatSignal[] = [
      { kind: 'raid-here', day: 0 },
      { kind: 'raid-house', day: 0 },
    ];
    expect(villageThreat(s, 0)).toBe(1);
  });

  it('paměť 50 let: starší signál se nepočítá a prune ho zahodí', () => {
    const s: ThreatSignal[] = [{ kind: 'raid-here', day: 0 }];
    expect(villageThreat(s, 50 * YEAR)).toBeGreaterThan(0);
    expect(villageThreat(s, 50 * YEAR + 1)).toBe(0);
    expect(pruneThreats(s, 50 * YEAR + 1)).toHaveLength(0);
    expect(pruneThreats(s, 49 * YEAR)).toHaveLength(1);
  });

  it('válka bez úbytku, dokud trvá; po míru slábne od dne míru', () => {
    const war: ThreatSignal[] = [{ kind: 'war', day: 0, endDay: 30 * YEAR }];
    expect(villageThreat(war, 25 * YEAR)).toBe(0.5);
    expect(villageThreat(war, 40 * YEAR)).toBeCloseTo(0.25, 12);
    expect(villageThreat([{ kind: 'war', day: 0 }], 80 * YEAR)).toBe(0.5);
  });

  it('signál z budoucnosti se nepočítá', () => {
    expect(villageThreat([{ kind: 'raid-here', day: 50 }], 10)).toBe(0);
  });
});
