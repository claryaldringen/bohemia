import {
  generateLandscapeAttempt,
  type Landscape,
  type LandscapeSource,
  type LayerVersions,
} from '@bohemia/game';

// Mezipaměť krajin sídel pro server: krajina je čistá funkce seedu a verzí vrstev, ale její
// generování trvá desítky až stovky ms – a ptá se na ni každá akce i dotaz vsi (každých 5 s).

/** Mapa s omezenou velikostí – při přeplnění zahodí nejdéle nepoužitou položku. */
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(readonly capacity: number) {
    if (!(capacity >= 1)) throw new RangeError('Mezipaměť musí mít místo aspoň pro 1 položku.');
  }

  get size(): number {
    return this.entries.size;
  }

  /** Hodnota klíče (a posun mezi naposledy použité), nebo undefined. */
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

function landscapeKey(seed: number, versions: LayerVersions): string {
  return `${seed}|${versions.terrain}.${versions.vegetation}.${versions.fertility}`;
}

/**
 * Zdroj krajin sídel s LRU mezipamětí. Krajina se po vygenerování nemění (nikdo ji nepřepisuje),
 * proto se vrací stále stejný objekt.
 */
export function cachedLandscapes(
  capacity: number,
  generate: LandscapeSource['landscapeOf'] = generateLandscapeAttempt,
): LandscapeSource {
  const cache = new LruCache<string, Landscape>(capacity);
  return {
    landscapeOf(seed, versions) {
      const key = landscapeKey(seed, versions);
      const cached = cache.get(key);
      if (cached) return cached;
      const landscape = generate(seed, versions);
      cache.set(key, landscape);
      return landscape;
    },
  };
}
