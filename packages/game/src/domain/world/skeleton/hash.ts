import { deriveSeed } from '../../landscape/random';

// Celočíselný hash políček kostry světa (world-skeleton.md – Proč nezáleží na pořadí a velikosti
// světa). Jen `Math.imul`, posuny, xor a sčítání – stejný výsledek na serveru i v prohlížeči.

/** Soli hashů kostry – každá veličina má vlastní, aby spolu nesouvisely. Nové soli jen přidávat. */
export const SKELETON_SALT = {
  /** Číslo klidu políčka – bokem se odtéká jen k nižšímu. */
  calm: 1,
  /** Los směru odtoku. */
  drain: 2,
  /** Mřížka pomalého sklonu východ/západ. */
  bias: 3,
  /** Bod řeky na hraně mezi políčky ve sloupci (sever–jih). */
  riverPortNS: 4,
  /** Bod řeky na hraně mezi políčky v řádku (východ–západ). */
  riverPortEW: 5,
  /** Poloha uzlu stezky v bloku – sloupec a řádek. */
  trailNodeX: 6,
  trailNodeY: 7,
  /** Existence spojení uzlu na východ a na sever. */
  trailEdgeE: 8,
  trailEdgeN: 9,
  /** Bod stezky na hraně mezi políčky ve sloupci (sever–jih) a v řádku (východ–západ). */
  trailPortNS: 10,
  trailPortEW: 11,
} as const;

/** Základ hashů kostry – z hlavního seedu světa (jiné vrstvy mají vlastní `deriveSeed`). */
export function skeletonBase(worldSeed: number): number {
  return deriveSeed(worldSeed, 'skeleton');
}

/** Promíchání 32bitového čísla (koncovka MurmurHash3). */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return h ^ (h >>> 16);
}

const GOLDEN = 0x9e3779b9;

/** Hash políčka (x, y) se solí – uint32. `seed` je základ kostry (`skeletonBase`). */
export function cellHash(seed: number, salt: number, x: number, y: number): number {
  let h = fmix((seed + GOLDEN) | 0);
  h = fmix(((h ^ salt) + GOLDEN) | 0);
  h = fmix(((h ^ x) + GOLDEN) | 0);
  h = fmix(((h ^ y) + GOLDEN) | 0);
  return h >>> 0;
}

/** Hash políčka převedený do [0, 1). */
export function cellUnit(seed: number, salt: number, x: number, y: number): number {
  return cellHash(seed, salt, x, y) / 4294967296;
}
