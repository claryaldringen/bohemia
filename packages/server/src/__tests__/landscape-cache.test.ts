import { describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  type Landscape,
  type LayerVersions,
  type SkeletonSlice,
} from '@bohemia/game';
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
    source.landscapeOf(7, { ...CURRENT_LAYER_VERSIONS, terrain: 1 } as unknown as LayerVersions);
    expect(calls).toEqual(['7/2', '8/2', '7/1']);
  });

  it('prémiový typ je jiná krajina než průměrná ze stejného seedu', () => {
    const calls: string[] = [];
    const source = cachedLandscapes(4, (seed, _versions, premium) => {
      calls.push(`${seed}/${premium ?? '-'}`);
      return fake(seed);
    });
    const premium = { ...CURRENT_LAYER_VERSIONS, premium: 1 } as const;
    source.landscapeOf(7, CURRENT_LAYER_VERSIONS);
    source.landscapeOf(7, premium, 'fertile');
    source.landscapeOf(7, premium, 'iron-ore');
    source.landscapeOf(7, premium, 'fertile');
    expect(calls).toEqual(['7/-', '7/fertile', '7/iron-ore']);
  });

  it('stejný seed a verze, jiný výřez kostry → každé sídlo svou krajinu (Review Focus 1)', () => {
    const calls: string[] = [];
    const source = cachedLandscapes(4, (seed, _versions, _premium, skeleton) => {
      calls.push(`${seed}/${skeleton?.rivers[0]?.at ?? '-'}`);
      return fake(seed);
    });
    const versions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 } as const;
    const river = (at: number): SkeletonSlice => ({
      world: 1,
      rivers: [
        { side: 'N', at, widthM: 25, flow: 'in' },
        { side: 'S', at, widthM: 25, flow: 'out' },
      ],
      trails: [],
    });
    const dry = source.landscapeOf(7, CURRENT_LAYER_VERSIONS);
    const a = source.landscapeOf(7, versions, undefined, river(40));
    const b = source.landscapeOf(7, versions, undefined, river(60));
    expect(a).not.toBe(b);
    expect(a).not.toBe(dry);
    // týž výřez (i jiný objekt) a suchá mapa bez výřezu / s null z mezipaměti
    expect(source.landscapeOf(7, versions, undefined, river(40))).toBe(a);
    expect(source.landscapeOf(7, CURRENT_LAYER_VERSIONS, undefined, null)).toBe(dry);
    expect(calls).toEqual(['7/-', '7/40', '7/60']);
  });
});
