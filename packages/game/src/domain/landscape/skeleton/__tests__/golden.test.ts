// Zlatý otisk map s řekou kostry (world-skeleton.md – Uložení, verze vrstev): po ostrém spuštění
// se terén `skeleton: 1` nesmí změnit – jen nová verze vrstvy. Suché mapy hlídá `generate.test.ts`.
// Otisky přepočítané 8. 11. 2026 před ostrým spuštěním kostry (meandry, soutok po proudu, šířka
// u pramene – oprava vad z náhledu scény).
import { describe, expect, it } from 'vitest';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { landscapeHash } from '../../__tests__/landscape-checks';
import { CURRENT_LAYER_VERSIONS, type LayerVersions, type StreamPoint } from '../../types';
import { SKELETON_BAND_CASES, type SkeletonBandCase } from './skeleton-band';

const SKELETON: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };

/** Otisk os řek – souřadnice, šířky, hladina a brody každého bodu. */
function riversHash(rivers: readonly (readonly StreamPoint[])[]): string {
  let h = 0x811c9dc5;
  for (const course of rivers) {
    const values = new Float64Array(course.length * 6);
    course.forEach((p, k) => {
      values.set([p.x, p.y, p.halfWidthLeft, p.halfWidthRight, p.level, p.shallow ? 1 : 0], k * 6);
    });
    const bytes = new Uint8Array(values.buffer);
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 0x01000193);
    h = Math.imul(h ^ course.length, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('mapa s řekou kostry – zlatý otisk (skeleton: 1)', () => {
  it.each([
    ['rovně', 1, 1, 'a421ed3d', 'c52a34ce'],
    ['rovně', 42, 42, 'efe70ffc', '2957b71c'],
    ['ohyb', 1, 1, '09e9e93b', 'd90992d7'],
    ['ohyb', 42, 42, '795e513b', 'a107cf3f'],
    ['soutok', 1, 2, '8b2e1cb0', '338b6293'],
    ['soutok', 42, 42, '1a15fbe6', 'a636a63e'],
    ['pramen', 1, 1, '331a9e62', '208a368f'],
    ['pramen', 42, 42, 'f125709d', 'a268371e'],
  ] as const)('%s, seed %i (přijatý pokus %i)', (name, seed, acceptedSeed, land, rivers) => {
    const s = SKELETON_BAND_CASES[name as SkeletonBandCase];
    const accepted = generateAcceptedLandscape(seed, SKELETON, undefined, s);
    expect(accepted.seed).toBe(acceptedSeed);
    expect(landscapeHash(accepted.landscape)).toBe(land);
    expect(riversHash(accepted.landscape.rivers ?? [])).toBe(rivers);
    // Uložené sídlo (jen pokus) dá stejnou krajinu.
    expect(generateLandscapeAttempt(accepted.seed, SKELETON, undefined, s)).toEqual(
      accepted.landscape,
    );
  });
});
