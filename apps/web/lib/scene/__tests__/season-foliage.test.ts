import { describe, expect, it } from 'vitest';
import { TREE_LOOKS } from '@bohemia/game';
import { DECOR_MODELS } from '../decor-placement';
import { IMPOSTOR_ATLAS } from '../impostor-atlas';
import { isDeciduousMesh, seasonFoliageFor } from '../season-foliage';

describe('roční období podle druhu rostliny', () => {
  it('každý strom krajiny je listnáč, nebo jehličnan se sněhem na jehličí', () => {
    for (const model of TREE_LOOKS) {
      const foliage = seasonFoliageFor(model);
      expect(foliage, model).not.toBeNull();
      const evergreen = /^(spruce|fir|pine)/.test(model);
      expect(foliage?.deciduous ?? false, model).toBe(!evergreen);
      if (evergreen) expect(foliage?.needles, model).toBe(true);
    }
  });

  it('každá dekorace se mění: rostliny listím, kameny a dřevo sněhem', () => {
    for (const model of DECOR_MODELS) {
      const foliage = seasonFoliageFor(model);
      expect(foliage, model).not.toBeNull();
      expect(foliage?.deciduous || (foliage?.snowTop ?? 0) > 0, model).toBe(true);
    }
  });

  it('rákos a trsy trávy stojí přes zimu suché, lekníny zmizí', () => {
    expect(seasonFoliageFor('reeds')?.minLeaves).toBe(1);
    expect(seasonFoliageFor('grass-tuft-1')?.minLeaves).toBe(1);
    expect(seasonFoliageFor('lilies')?.minLeaves ?? 0).toBe(0);
  });

  it('jabloně a část keřů na jaře kvetou', () => {
    expect(seasonFoliageFor('apple-1')?.blossom).toBe(1);
    expect(seasonFoliageFor('shrub-3')?.blossom).toBeGreaterThan(0);
    expect(seasonFoliageFor('oak-1')?.blossom ?? 0).toBe(0);
  });

  it('neznámý model se nemění', () => {
    expect(seasonFoliageFor('zemnice')).toBeNull();
  });
});

describe('listnáče ve stínové mapě', () => {
  it('holé v zimě: 3D listnáče, keře a impostory listnáčů – ne smrky, rákos ani kameny', () => {
    expect(isDeciduousMesh('trees-oak-1')).toBe(true);
    expect(isDeciduousMesh('trees-poplar-2')).toBe(true);
    expect(isDeciduousMesh('decor-shrub-4')).toBe(true);
    expect(isDeciduousMesh('trees-spruce-1')).toBe(false);
    expect(isDeciduousMesh('trees-pine-2')).toBe(false);
    expect(isDeciduousMesh('decor-reeds')).toBe(false);
    expect(isDeciduousMesh('decor-boulder')).toBe(false);
    expect(isDeciduousMesh('village-field-3-mud')).toBe(false);
    IMPOSTOR_ATLAS.cells.forEach((cell, index) => {
      const deciduous = !cell.model.startsWith('spruce');
      expect(isDeciduousMesh(`impostors-${index}`), cell.model).toBe(deciduous);
      expect(isDeciduousMesh(`impostors-${index}-m`), cell.model).toBe(deciduous);
    });
  });
});
