import {
  generateLandscapeAttempt,
  type Landscape,
  type LandscapeSource,
  type LayerVersions,
  type PremiumType,
} from '@bohemia/game';

// Mezipaměť krajin sídel pro server: krajina je čistá funkce seedu a verzí vrstev, ale její
// generování trvá desítky až stovky ms – a ptá se na ni každá akce i celý dotaz na ves.

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

function landscapeKey(seed: number, versions: LayerVersions, premium?: PremiumType): string {
  const { terrain, vegetation, fertility, obstacles = 1 } = versions;
  const base = `${seed}|${terrain}.${vegetation}.${fertility}.${obstacles}`;
  // prémiová krajina (typ a verze průchodu) je jiná krajina než průměrná ze stejného seedu
  return premium === undefined ? base : `${base}|${premium}.${versions.premium ?? 1}`;
}

/**
 * Zdroj krajin sídel s LRU mezipamětí. Krajina se po vygenerování nemění (nikdo ji nepřepisuje),
 * proto se vrací stále stejný objekt – a s ním i jeho vrstva překážek (`obstaclesOf` si ji
 * pamatuje podle objektu krajiny a zahodí ji s ním).
 */
export function cachedLandscapes(
  capacity: number,
  generate: LandscapeSource['landscapeOf'] = generateLandscapeAttempt,
): LandscapeSource {
  const cache = new LruCache<string, Landscape>(capacity);
  return {
    landscapeOf(seed, versions, premium) {
      const key = landscapeKey(seed, versions, premium);
      const cached = cache.get(key);
      if (cached) return cached;
      const landscape = generate(seed, versions, premium);
      cache.set(key, landscape);
      return landscape;
    },
  };
}
