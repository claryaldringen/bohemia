import {
  generateLandscapeAttempt,
  skeletonKey,
  type Landscape,
  type LandscapeSource,
  type LayerVersions,
  type PremiumType,
  type SkeletonSlice,
} from '@bohemia/game';

// Mezipaměť krajin sídel pro server: krajina je čistá funkce seedu, verzí vrstev, prémiového typu
// a výřezu kostry, ale její generování trvá desítky až stovky ms – a ptá se na ni každá akce i celý
// dotaz na ves.

/** Mapa s omezenou velikostí – při přeplnění zahodí nejdéle nepoužitou položku. */
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>();
  private limit: number;

  constructor(capacity: number) {
    if (!(capacity >= 1)) throw new RangeError('Mezipaměť musí mít místo aspoň pro 1 položku.');
    this.limit = capacity;
  }

  /** Kolik položek se vejde. */
  get capacity(): number {
    return this.limit;
  }

  /** Změní velikost; při zmenšení zahodí nejdéle nepoužité položky navíc. */
  resize(capacity: number): void {
    if (!(capacity >= 1)) throw new RangeError('Mezipaměť musí mít místo aspoň pro 1 položku.');
    this.limit = capacity;
    this.trim();
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
    this.trim();
  }

  private trim(): void {
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

function landscapeKey(
  seed: number,
  versions: LayerVersions,
  premium?: PremiumType,
  skeleton?: SkeletonSlice | null,
): string {
  const { terrain, vegetation, fertility, obstacles = 1 } = versions;
  const base = `${seed}|${terrain}.${vegetation}.${fertility}.${obstacles}`;
  // prémiová krajina (typ a verze průchodu) je jiná krajina než průměrná ze stejného seedu
  const typed = premium === undefined ? base : `${base}|${premium}.${versions.premium ?? 1}`;
  // mapa z kostry (verze vrstvy a výřez) je jiná krajina než suchá ze stejného seedu – sousedé
  // se stejným seedem a verzemi, ale jiným výřezem, dostanou každý svou (suchá mapa: klíč jako dřív)
  const slice = skeletonKey(skeleton ?? null);
  return slice === '' ? typed : `${typed}|${versions.skeleton ?? 0}:${slice}`;
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
    landscapeOf(seed, versions, premium, skeleton) {
      const key = landscapeKey(seed, versions, premium, skeleton);
      const cached = cache.get(key);
      if (cached) return cached;
      const landscape = generate(seed, versions, premium, skeleton);
      cache.set(key, landscape);
      return landscape;
    },
  };
}
