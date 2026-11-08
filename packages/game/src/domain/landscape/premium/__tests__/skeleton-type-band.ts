// Společný test pásma prémie na kostře (premium: 2, world-skeleton.md – Mapa z kostry) – jako
// `type-band.ts` pro typy na suché mapě: každá skupina typů kostry ho pouští ve vlastním souboru,
// ať soubory běží souběžně. Cíl: ≥ 95 % z 300 seedů projde do `MAX_ATTEMPTS` pokusů – průměrná
// mapa z kostry celým pásmem, prémiová dolními mezemi, kontrolou typu i kontrolou kostry.
import { describe, expect, it } from 'vitest';
import { checkBand } from '../../band';
import { BandFailureError, generateAcceptedLandscape } from '../../generate';
import { SKELETON_BAND_CASES, type SkeletonBandCase } from '../../skeleton/__tests__/skeleton-band';
import { CURRENT_LAYER_VERSIONS, type LayerVersions } from '../../types';
import { checkPremium } from '../check';
import { hasPremiumPass, PREMIUM_LAYER_VERSION, premiumFeaturesOf } from '../generate';
import type { PremiumType } from '../types';

/** Verze vrstev prémie na kostře. */
export const SKELETON_PREMIUM_VERSIONS: LayerVersions = {
  ...CURRENT_LAYER_VERSIONS,
  skeleton: 1,
  premium: PREMIUM_LAYER_VERSION,
};

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const PASS_SHARE = 0.95;
const CASE_TIMEOUT_MS = 600_000;

/** Výsledek seedu (krajina se nedrží – jen kontroly); null = pásmem neprošla. */
interface Outcome {
  readonly band: ReturnType<typeof checkBand>;
  readonly check: ReturnType<typeof checkPremium>;
  readonly type: PremiumType | undefined;
}

function outcomes(type: PremiumType, name: SkeletonBandCase): (Outcome | null)[] {
  const slice = SKELETON_BAND_CASES[name];
  return SEEDS.map((seed): Outcome | null => {
    try {
      const { landscape } = generateAcceptedLandscape(seed, SKELETON_PREMIUM_VERSIONS, type, slice);
      return {
        band: checkBand(landscape, SKELETON_PREMIUM_VERSIONS),
        check: checkPremium(landscape),
        type: premiumFeaturesOf(landscape)?.type,
      };
    } catch (error) {
      // Jen „pásmem neprošla“ – jiná chyba (i pád průchodu na části seedů) test shodí.
      if (!(error instanceof BandFailureError)) throw error;
      return null;
    }
  });
}

/** Test pásma pro dvojice typ kostry × výřez: ≥ 95 % z 300 seedů do `MAX_ATTEMPTS`. */
export function describeSkeletonTypeBands(
  cases: readonly (readonly [PremiumType, SkeletonBandCase])[],
): void {
  describe('prémie na kostře projde pásmem na 300 seedech', () => {
    for (const [type, name] of cases) {
      const title = `${type} na výřezu ${name} – pásmo, kontrola typu i kostry na ≥ 95 % seedů`;
      if (!hasPremiumPass(type, PREMIUM_LAYER_VERSION)) {
        it.todo(title);
        continue;
      }
      it(
        title,
        () => {
          const accepted = outcomes(type, name).filter((o): o is Outcome => o !== null);
          expect(accepted.length / SEEDS.length).toBeGreaterThanOrEqual(PASS_SHARE);
          for (const o of accepted) {
            expect(o.band).toEqual({ ok: true, failures: [] });
            expect(o.check).toEqual({ ok: true });
            expect(o.type).toBe(type);
          }
        },
        CASE_TIMEOUT_MS,
      );
    }
  });
}
