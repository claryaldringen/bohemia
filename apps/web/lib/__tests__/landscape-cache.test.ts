import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, type Landscape, type LayerVersions } from '@bohemia/game';
import { LruCache, cachedLandscapes } from '../landscape-cache';

describe('LruCache', () => {
  it('při přeplnění zahodí nejdéle nepoužitou položku', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a je teď naposledy použitá
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('přepsání klíče nezvětší mezipaměť', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe(2);
  });

  it('nulová velikost nedává smysl', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
  });
});

describe('cachedLandscapes', () => {
  const fake = (seed: number): Landscape => ({ size: seed }) as unknown as Landscape;

  it('stejný seed a verze vygeneruje jen jednou', () => {
    const calls: number[] = [];
    const source = cachedLandscapes(4, (seed) => {
      calls.push(seed);
      return fake(seed);
    });
    const first = source.landscapeOf(7, CURRENT_LAYER_VERSIONS);
    const second = source.landscapeOf(7, { ...CURRENT_LAYER_VERSIONS });
    expect(second).toBe(first);
    expect(calls).toEqual([7]);
  });

  it('jiný seed nebo jiné verze vrstev jsou jiná krajina', () => {
    const calls: string[] = [];
    const source = cachedLandscapes(4, (seed, versions) => {
      calls.push(`${seed}/${versions.terrain}`);
      return fake(seed);
    });
    source.landscapeOf(7, CURRENT_LAYER_VERSIONS);
    source.landscapeOf(8, CURRENT_LAYER_VERSIONS);
    source.landscapeOf(7, { ...CURRENT_LAYER_VERSIONS, terrain: 2 } as unknown as LayerVersions);
    expect(calls).toEqual(['7/1', '8/1', '7/2']);
  });
});
