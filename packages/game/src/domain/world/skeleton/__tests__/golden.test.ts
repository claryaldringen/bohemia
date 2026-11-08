import { describe, expect, it } from 'vitest';
import { deriveSeed } from '../../../landscape/random';
import { skeletonKey, type SkeletonSlice } from '../../../landscape/skeleton/types';
import { createSkeletonCache, seatSlot, skeletonSlice } from '..';

// Zlatý otisk kostry světa – po ostrém spuštění se nesmí změnit (world-skeleton.md – Uložení).
// Změna odvodnění, bodů na okraji nebo čísel SKELETON = nová verze grafu kostry (`world`).

const WORLD_SEED = 20270101;
const HALF = 16;

/** Otisk okna 32 × 32 map se středem (0, 0): `deriveSeed` přes klíče výřezů po řádcích od severu. */
function fingerprint(keyOf: (slice: SkeletonSlice | null) => string): number {
  const cache = createSkeletonCache(WORLD_SEED);
  let hash = 0;
  for (let y = HALF - 1; y >= -HALF; y--) {
    const row: string[] = [];
    for (let x = -HALF; x < HALF; x++) row.push(keyOf(skeletonSlice(WORLD_SEED, { x, y }, cache)));
    hash = deriveSeed(hash, `${y}:${row.join('|')}`);
  }
  return hash;
}

/** Klíč jen řek výřezu – otisk řek se nezmění, až výřez dostane i stezky. */
function riverKey(slice: SkeletonSlice | null): string {
  if (slice === null || slice.rivers.length === 0) return '';
  return skeletonKey({ ...slice, trails: [] });
}

describe('zlatý otisk kostry', () => {
  it('řeky (okno 32 × 32, seed 20270101)', () => {
    // v okně je 100 map s řekou; 8. 11. 2026 (před spuštěním) nový otisk – strop povodí 12 000
    // a nové prahy šířek (rovnoměrnější šířky 25–45 m, Martin: „doladit do spuštění“)
    expect(fingerprint(riverKey)).toBe(2978999827);
  });

  it('celá kostra – řeky, stezky a místa (okno 32 × 32, seed 20270101)', () => {
    // klíč výřezu (řeky i stezky) a místo sídla; po ostrém spuštění se nesmí změnit
    const keyOf = (slice: SkeletonSlice | null): string =>
      `${skeletonKey(slice)}#${seatSlot(slice)}`;
    expect(fingerprint(keyOf)).toBe(2488818595);
  });
});
