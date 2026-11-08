// Zlatý otisk map s řekou kostry (world-skeleton.md – Uložení, verze vrstev): po ostrém spuštění
// se terén `skeleton: 1` nesmí změnit – jen nová verze vrstvy. Suché mapy hlídá `generate.test.ts`.
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
    ['rovně', 1, 1, 'fe1e4158', '4354b911'],
    ['rovně', 42, 42, '54ffb145', '5255a230'],
    ['ohyb', 1, 1, '4c48c4d8', '4622820a'],
    ['ohyb', 42, 42, '7b24ca6c', 'af815b27'],
    ['soutok', 1, 2, 'eac78442', 'dfb48f24'],
    ['soutok', 42, 42, 'a3ac4cb4', 'f24d91fd'],
    ['pramen', 1, 1, '6f2cc938', 'cf50e6e9'],
    ['pramen', 42, 42, 'b7234e71', '2a737a7d'],
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
