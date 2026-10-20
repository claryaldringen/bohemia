// Společný test pásma po typech (≈ 13 s na typ a 300 seedů) – každá skupina typů ho pouští ve
// vlastním souboru, ať soubory běží souběžně. Typy bez průchodu jsou `todo` a zapnou se samy, až
// průchod dostanou.
import { describe, expect, it } from 'vitest';
import { BandFailureError, generateAcceptedLandscape } from '../../generate';
import { CURRENT_LAYER_VERSIONS, type Landscape } from '../../types';
import { tileCenterWorld } from '../../world';
import { checkPremium, PREMIUM_LAND_KINDS, PREMIUM_VILLAGE_CLEARANCE_M } from '../check';
import { hasPremiumPass, premiumFeaturesOf } from '../generate';
import type { PremiumFeatures, PremiumType } from '../types';

/** Typy půdy a lesa (úloha 3) – test pásma v `soil-forest-band.test.ts`. */
export const SOIL_FOREST_TYPES: readonly PremiumType[] = [
  'fertile',
  'oak-beech',
  'floodplain',
  'south-slopes',
  'game-furs',
  'wild-bees',
];

/** Typy vody s řekou (úloha 4) – test pásma ve `water-river-band.test.ts`. */
export const WATER_RIVER_TYPES: readonly PremiumType[] = [
  'navigable-river',
  'confluence',
  'ford-hill',
];

/** Ostatní typy vody (úloha 4) – test pásma ve `water-other-band.test.ts`. */
export const WATER_OTHER_TYPES: readonly PremiumType[] = [
  'gold-stream',
  'salt-spring',
  'sacred-spring',
];

/** Typy vody (úloha 4) – dva soubory testu pásma, ať běží souběžně. */
export const WATER_TYPES: readonly PremiumType[] = [...WATER_RIVER_TYPES, ...WATER_OTHER_TYPES];

/** Typy, jejichž test pásma běží ve vlastním souboru skupiny – `generate.test.ts` je vynechá. */
export const GROUPED_TYPES: ReadonlySet<PremiumType> = new Set([
  ...SOIL_FOREST_TYPES,
  ...WATER_TYPES,
]);

// Krajiny se nedrží (vrstva překážek v mezipaměti by zabrala stovky MB) – jen výsledek kontroly
// a prvky.
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
const PASS_SHARE = 0.95;
const TYPE_TIMEOUT_MS = 600_000;

interface Outcome {
  readonly check: ReturnType<typeof checkPremium>;
  readonly features: PremiumFeatures | null;
  readonly village: { readonly x: number; readonly z: number };
}

const outcomeCache = new Map<PremiumType, readonly (Outcome | null)[]>();

/** Přijaté krajiny typu po seedech (null = pásmem neprošla ani na MAX_ATTEMPTS pokusů). */
function outcomes(type: PremiumType): readonly (Outcome | null)[] {
  const cached = outcomeCache.get(type);
  if (cached) return cached;
  const result = SEEDS.map((seed): Outcome | null => {
    let landscape: Landscape;
    try {
      landscape = generateAcceptedLandscape(seed, CURRENT_LAYER_VERSIONS, type).landscape;
    } catch (error) {
      // Jen „pásmem neprošla“ – jiná chyba (i pád průchodu na části seedů) test shodí.
      if (!(error instanceof BandFailureError)) throw error;
      return null;
    }
    return {
      check: checkPremium(landscape),
      features: premiumFeaturesOf(landscape),
      village: tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y),
    };
  });
  outcomeCache.set(type, result);
  return result;
}

/** Nejmenší vzdálenost bodu od úsečky (m). */
function segmentDistance(
  a: readonly number[],
  b: readonly number[],
  c: Outcome['village'],
): number {
  const [ax, az] = a as [number, number];
  const [bx, bz] = b as [number, number];
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0 ? 0 : Math.min(1, Math.max(0, ((c.x - ax) * dx + (c.z - az) * dz) / length2));
  return Math.hypot(ax + t * dx - c.x, az + t * dz - c.z);
}

/** Ovíjecí číslo mnohoúhelníku kolem bodu – nenulové = bod uvnitř. */
function windingNumber(points: readonly (readonly number[])[], c: Outcome['village']): number {
  let winding = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i] as [number, number];
    const [bx, bz] = points[(i + 1) % points.length] as [number, number];
    const side = (bx - ax) * (c.z - az) - (c.x - ax) * (bz - az);
    if (az <= c.z && bz > c.z && side > 0) winding++;
    if (az > c.z && bz <= c.z && side < 0) winding--;
  }
  return winding;
}

/**
 * Test pásma a místa vsi pro dané typy: každý projde pásmem i kontrolou typu na ≥ 95 % z 300
 * seedů a jeho prvky s obrysem nebo osou nezasahují do 120 m od místa vsi – kromě druhů půdy
 * (`PREMIUM_LAND_KINDS`), které popisují kvalitu půdy a lesa kolem vsi.
 */
export function describeTypeBands(types: readonly PremiumType[]): void {
  describe('každý typ projde pásmem na 300 seedech', () => {
    for (const type of types) {
      const name = `${type} – pásmo i kontrola typu na ≥ 95 % seedů`;
      if (!hasPremiumPass(type)) {
        it.todo(name);
        continue;
      }
      it(
        name,
        () => {
          const accepted = outcomes(type).filter((o): o is Outcome => o !== null);
          expect(accepted.length / SEEDS.length).toBeGreaterThanOrEqual(PASS_SHARE);
          for (const o of accepted) {
            expect(o.check).toEqual({ ok: true });
            expect(o.features?.type).toBe(type);
          }
        },
        TYPE_TIMEOUT_MS,
      );
    }
  });

  describe('místo vsi zůstane volné', () => {
    for (const type of types) {
      const name = `${type} – prvky s obrysem nebo osou nezasahují do 120 m od místa vsi (stezka smí k okraji, druhy půdy výjimkou)`;
      if (!hasPremiumPass(type)) {
        it.todo(name);
        continue;
      }
      it(
        name,
        () => {
          const accepted = outcomes(type).filter((o): o is Outcome => o !== null);
          for (const [k, o] of accepted.entries()) {
            for (const site of o.features?.sites ?? []) {
              if (PREMIUM_LAND_KINDS.has(site.kind)) continue;
              const label = `${type} #${k} ${site.kind}`;
              const line = site.line ?? [];
              for (let i = 0; i + 1 < line.length; i++) {
                const d = segmentDistance(line[i]!, line[i + 1]!, o.village);
                expect(d, label).toBeGreaterThanOrEqual(PREMIUM_VILLAGE_CLEARANCE_M - 0.01);
              }
              const outline = site.outline ?? [];
              if (outline.length === 0) continue;
              expect(windingNumber(outline, o.village), label).toBe(0);
              for (let i = 0; i < outline.length; i++) {
                const d = segmentDistance(
                  outline[i]!,
                  outline[(i + 1) % outline.length]!,
                  o.village,
                );
                expect(d, label).toBeGreaterThanOrEqual(PREMIUM_VILLAGE_CLEARANCE_M - 0.01);
              }
            }
          }
        },
        TYPE_TIMEOUT_MS,
      );
    }
  });
}
