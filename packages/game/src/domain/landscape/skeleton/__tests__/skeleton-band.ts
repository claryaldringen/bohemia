// Společný test pásma map s řekou kostry (world-skeleton.md – Mapa z kostry, pásmo) – jako
// `premium/__tests__/type-band.ts`: každá skupina výřezů ho pouští ve vlastním souboru, ať soubory
// běží souběžně. Cíl: ≥ 95 % z 300 seedů projde celým pásmem do `MAX_ATTEMPTS` pokusů.
import { describe, expect, it } from 'vitest';
import { checkBand } from '../../band';
import { BandFailureError, generateAcceptedLandscape } from '../../generate';
import { CURRENT_LAYER_VERSIONS, type LayerVersions } from '../../types';
import type { SkeletonRiverPort, SkeletonSlice } from '../types';

const port = (
  side: SkeletonRiverPort['side'],
  at: number,
  widthM: number,
  flow: 'in' | 'out',
): SkeletonRiverPort => ({ side, at, widthM, flow });

const slice = (...rivers: SkeletonRiverPort[]): SkeletonSlice => ({ world: 1, rivers, trails: [] });

/** Výřezy s řekou jako v testu koryt (`river-course.test.ts`). */
export const SKELETON_BAND_CASES = {
  rovně: slice(port('N', 60, 35, 'in'), port('S', 70, 35, 'out')),
  ohyb: slice(port('S', 90, 30, 'out'), port('W', 40, 30, 'in')),
  soutok: slice(port('N', 50, 40, 'in'), port('E', 64, 25, 'in'), port('S', 80, 45, 'out')),
  pramen: slice(port('S', 64, 25, 'out')),
} as const satisfies Record<string, SkeletonSlice>;

export type SkeletonBandCase = keyof typeof SKELETON_BAND_CASES;

const SKELETON: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const PASS_SHARE = 0.95;
const CASE_TIMEOUT_MS = 600_000;

/** Výsledek seedu – přijatý pokus (pořadí od 1) a kontrola pásma; null = neprošla. */
interface Outcome {
  readonly attempt: number;
  readonly band: ReturnType<typeof checkBand>;
  readonly rivers: number;
}

function outcomes(s: SkeletonSlice): (Outcome | null)[] {
  return SEEDS.map((seed): Outcome | null => {
    try {
      const accepted = generateAcceptedLandscape(seed, SKELETON, undefined, s);
      return {
        attempt: accepted.seed - seed + 1,
        band: checkBand(accepted.landscape, SKELETON),
        rivers: accepted.landscape.rivers?.length ?? 0,
      };
    } catch (error) {
      // Jen „pásmem neprošla“ – jiná chyba test shodí.
      if (!(error instanceof BandFailureError)) throw error;
      return null;
    }
  });
}

/** Test pásma pro dané výřezy: ≥ 95 % z 300 seedů projde celým pásmem do `MAX_ATTEMPTS`. */
export function describeSkeletonBands(cases: readonly SkeletonBandCase[]): void {
  describe('mapa s řekou kostry projde celým pásmem na 300 seedech', () => {
    for (const name of cases) {
      it(
        `${name} – ≥ 95 % seedů do MAX_ATTEMPTS`,
        () => {
          const s = SKELETON_BAND_CASES[name];
          const inflows = s.rivers.filter((p) => p.flow === 'in').length;
          const accepted = outcomes(s).filter((o): o is Outcome => o !== null);
          expect(accepted.length / SEEDS.length).toBeGreaterThanOrEqual(PASS_SHARE);
          for (const o of accepted) {
            expect(o.band).toEqual({ ok: true, failures: [] });
            expect(o.rivers).toBe(Math.max(1, inflows));
          }
        },
        CASE_TIMEOUT_MS,
      );
    }
  });
}
