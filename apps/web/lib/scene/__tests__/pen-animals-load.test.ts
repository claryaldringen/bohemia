import { describe, expect, it } from 'vitest';
import { morphKindsToLoad } from '../pen-animals';

// Modely ohrad se stahují po druzích (pen-animals.ts): kůň a hříbě, kteří přijdou později, se
// musí dotáhnout, i když první `set` obsahoval jen krávy.

describe('morphKindsToLoad', () => {
  it('stáhne jen druhy, které ohrady drží', () => {
    expect(morphKindsToLoad([{ kind: 'cow' }, { kind: 'ox' }], new Set())).toEqual(['cow']);
    expect(morphKindsToLoad([], new Set())).toEqual([]);
  });

  it('kůň a hříbě po krávách se dotáhnou, už stažené druhy ne', () => {
    const requested = new Set<'cow' | 'horse' | 'foal'>(['cow']);
    const later = [{ kind: 'cow' as const }, { kind: 'horse' as const }, { kind: 'foal' as const }];
    expect(morphKindsToLoad(later, requested)).toEqual(['horse', 'foal']);
    requested.add('horse');
    expect(morphKindsToLoad(later, requested)).toEqual(['foal']);
  });
});
