import { describe, expect, it } from 'vitest';
import { castersChanged, type VillageSceneChanges } from '../sun-shadows';

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
