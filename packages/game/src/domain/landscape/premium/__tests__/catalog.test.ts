import { describe, expect, it } from 'vitest';
import { PREMIUM_CATALOG, PREMIUM_TYPES } from '../catalog';

describe('katalog prémiových krajin', () => {
  it('má 19 typů, typy kostry a kotvy', () => {
    expect(PREMIUM_TYPES.length).toBe(19);
    expect(new Set(PREMIUM_TYPES).size).toBe(19);
    expect(Object.keys(PREMIUM_CATALOG).sort()).toEqual([...PREMIUM_TYPES].sort());
    const skeleton = PREMIUM_TYPES.filter((t) => PREMIUM_CATALOG[t].skeleton).sort();
    expect(skeleton).toEqual(['confluence', 'ford-hill', 'mountain-pass', 'navigable-river']);
    for (const type of PREMIUM_TYPES) {
      expect(PREMIUM_CATALOG[type].name.length).toBeGreaterThan(0);
      expect(PREMIUM_CATALOG[type].anchor.length).toBeGreaterThan(0);
    }
    expect(PREMIUM_CATALOG['deep-gold'].immediate).toBe(false);
    expect(PREMIUM_CATALOG['fertile'].immediate).toBe(true);
  });

  it('účinek hned mají právě určené typy', () => {
    const immediate = PREMIUM_TYPES.filter((t) => PREMIUM_CATALOG[t].immediate).sort();
    expect(immediate).toEqual(
      [
        'fertile',
        'oak-beech',
        'floodplain',
        'south-slopes',
        'iron-ore',
        'fine-clay',
        'sacred-mountain',
        'sacred-spring',
        'ford-hill',
        'mountain-pass',
      ].sort(),
    );
  });
});
