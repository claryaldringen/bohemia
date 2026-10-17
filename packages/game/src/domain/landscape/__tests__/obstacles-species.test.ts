import { describe, it, expect } from 'vitest';
import { forestSpecies, pickForestLook, type SpeciesWeights } from '../obstacles/species';

const speciesWeights = forestSpecies(0x0f17);

const sum = (w: SpeciesWeights): number => w.conifer + w.oak + w.beech + w.birch;

describe('speciesWeights', () => {
  it('na okraji lesa převažují světlomilné listnáče, jehličnan nejvýš 5 %', () => {
    for (const d of [-20, -3, 0, 5, 9]) {
      const w = speciesWeights(d, 1, 0, 0);
      expect(sum(w)).toBeCloseTo(1, 6);
      expect(w.conifer).toBeLessThanOrEqual(0.05 * 3 + 1e-9); // i uprostřed shluku jehličnanů
      expect(w.oak).toBeGreaterThan(0.4);
      expect(w.birch).toBeGreaterThan(0.2);
      expect(w.beech).toBeGreaterThan(0.2);
    }
  });

  it('uvnitř lesa buk, dub, bříza a jehličnan podle výšky (10–25 %)', () => {
    const low = speciesWeights(40, 0, 0, 0);
    const high = speciesWeights(40, 1, 0, 0);
    expect(sum(low)).toBeCloseTo(1, 6);
    expect(high.conifer).toBeGreaterThan(low.conifer);
    expect(low.beech).toBeGreaterThan(low.oak);
    expect(low.oak).toBeGreaterThan(low.birch);
  });

  it('mezi okrajem a vnitřkem se skladba mění plynule (10–30 m)', () => {
    let previous = speciesWeights(0, 0.5, 0, 0);
    for (let d = 0.5; d <= 40; d += 0.5) {
      const w = speciesWeights(d, 0.5, 0, 0);
      for (const k of ['conifer', 'oak', 'beech', 'birch'] as const) {
        expect(Math.abs(w[k] - previous[k])).toBeLessThan(0.03);
      }
      previous = w;
    }
    expect(speciesWeights(10, 0.5, 0, 0)).toEqual(speciesWeights(0, 0.5, 0, 0));
    expect(speciesWeights(30, 0.5, 0, 0)).toEqual(speciesWeights(60, 0.5, 0, 0));
  });

  it('jehličnany rostou ve skupinách – podíl se mění po stovkách metrů, ne po metrech', () => {
    const along = Array.from({ length: 200 }, (_, i) => speciesWeights(40, 0.5, i * 10, 0).conifer);
    expect(Math.max(...along)).toBeGreaterThan(Math.min(...along) * 2 + 0.05);
    for (let i = 1; i < along.length; i++) {
      expect(Math.abs(along[i]! - along[i - 1]!)).toBeLessThan(0.15);
    }
  });
});

describe('pickForestLook', () => {
  it('vybírá podle vah a obě podoby modelu', () => {
    const w = { conifer: 0.1, oak: 0.3, beech: 0.4, birch: 0.2 };
    expect(pickForestLook(0.05, w, 0.2)).toBe('spruce-1');
    expect(pickForestLook(0.2, w, 0.7)).toBe('oak-2');
    expect(pickForestLook(0.6, w, 0.2)).toBe('beech-1');
    expect(pickForestLook(0.95, w, 0.2)).toBe('birch-1');
  });
});
