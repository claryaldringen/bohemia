import { describe, expect, it } from 'vitest';
import {
  SHADOW_STEP_DEG,
  castersChanged,
  shadowRefreshDue,
  type VillageSceneChanges,
} from '../sun-shadows';

const NOTHING: VillageSceneChanges = {
  village: false,
  hidden: false,
  felled: false,
  logs: false,
  shade: false,
  canopy: false,
  animals: false,
  people: false,
};

describe('castersChanged – stínová mapa jen při změně vrhačů', () => {
  it('stavby a pole, skryté stromy, pařezy a klády mapu obnoví', () => {
    for (const key of ['village', 'hidden', 'felled', 'logs'] as const) {
      expect(castersChanged({ ...NOTHING, [key]: true }), key).toBe(true);
    }
  });

  it('zvířata, lidé, ztmavení trávy ani plocha korun ne', () => {
    expect(
      castersChanged({ ...NOTHING, animals: true, people: true, shade: true, canopy: true }),
    ).toBe(false);
  });
});

describe('shadowRefreshDue – stínová mapa po krocích pohybu slunce', () => {
  const at = (degrees: number): { x: number; y: number; z: number } => {
    const r = (degrees * Math.PI) / 180;
    return { x: Math.cos(r), y: -0.6, z: Math.sin(r) };
  };

  it('malé pootočení mapu nechá, krok SHADOW_STEP_DEG ji obnoví', () => {
    expect(shadowRefreshDue(at(0), at(0.5), true, false)).toBe('keep');
    expect(shadowRefreshDue(at(0), at(SHADOW_STEP_DEG * 2), true, false)).toBe('refresh');
  });

  it('když stíny nejsou vidět (soumrak), mapa zastará a obnoví se, až budou', () => {
    expect(shadowRefreshDue(at(0), at(30), false, false)).toBe('stale');
    expect(shadowRefreshDue(at(0), at(0), false, true)).toBe('stale');
    expect(shadowRefreshDue(at(0), at(0), true, true)).toBe('refresh');
  });
});
