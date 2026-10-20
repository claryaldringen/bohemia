import { describe, expect, it } from 'vitest';
import { landscapeHash } from '../../__tests__/landscape-checks';
import { checkBand } from '../../band';
import {
  BandFailureError,
  generateAcceptedLandscape,
  generateLandscape,
  generateLandscapeAttempt,
} from '../../generate';
import { CURRENT_LAYER_VERSIONS, type Landscape, type LayerVersions } from '../../types';
import { tileCenterWorld } from '../../world';
import { PREMIUM_TYPES } from '../catalog';
import {
  checkPremium,
  checkPremiumFeatures,
  PREMIUM_VILLAGE_CLEARANCE_M,
  siteIntrudes,
} from '../check';
import { hasPremiumPass, PREMIUM_LAYER_VERSION, premiumFeaturesOf } from '../generate';
import type { PremiumFeatures, PremiumSite, PremiumType } from '../types';

const UNKNOWN = 'atlantis' as PremiumType;

describe('prémiový typ jako třetí vstup generátoru', () => {
  const average = generateLandscape(1);

  it('průměrná krajina nemá typ ani prvky a kontrolou typu projde', () => {
    expect('premium' in average).toBe(false);
    expect(premiumFeaturesOf(average)).toBeNull();
    expect(checkPremium(average)).toEqual({ ok: true });
  });

  it('krajina s typem nese typ – i typ, který ještě nemá průchod', () => {
    for (const type of PREMIUM_TYPES) {
      expect(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS, type).premium, type).toBe(type);
    }
  });

  it('verze prémiového průchodu 1 – průměrnou krajinu nezmění', () => {
    expect(PREMIUM_LAYER_VERSION).toBe(1);
    const versions: LayerVersions = { ...CURRENT_LAYER_VERSIONS, premium: PREMIUM_LAYER_VERSION };
    const accepted = generateAcceptedLandscape(1, versions);
    expect(accepted.seed).toBe(1);
    expect(landscapeHash(accepted.landscape)).toBe(landscapeHash(average));
    expect('premium' in accepted.landscape).toBe(false);
  });

  it('neznámý typ i neznámá verze průchodu vyhodí RangeError', () => {
    expect(() => generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS, UNKNOWN)).toThrow(RangeError);
    expect(() => generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS, UNKNOWN)).toThrow(RangeError);
    const premium2 = { ...CURRENT_LAYER_VERSIONS, premium: 2 } as unknown as LayerVersions;
    expect(() => generateAcceptedLandscape(1, premium2)).toThrow(RangeError);
    expect(() => generateLandscapeAttempt(1, premium2, 'fertile')).toThrow(RangeError);
    expect(() => premiumFeaturesOf({ ...average, premium: UNKNOWN })).toThrow(RangeError);
  });

  it('pásmo kontroluje i typ – neznámý typ neprojde ani pásmem', () => {
    expect(checkBand(average, CURRENT_LAYER_VERSIONS).ok).toBe(true);
    expect(() => checkBand({ ...average, premium: UNKNOWN }, CURRENT_LAYER_VERSIONS)).toThrow(
      RangeError,
    );
  });

  it('prvky se počítají jednou na objekt krajiny', () => {
    const l = generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS, PREMIUM_TYPES[0]);
    expect(premiumFeaturesOf(l)).toBe(premiumFeaturesOf(l));
  });
});

describe('kontrola typu – prvek existuje a nezasahuje do místa vsi', () => {
  const l: Landscape = { ...generateLandscape(1), premium: 'mountain-pass' };
  const village = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const R = PREMIUM_VILLAGE_CLEARANCE_M;
  /** Bod ve vzdálenosti `d` od místa vsi ve směru (dx, dz) – jednotkový vektor. */
  const at = (d: number, dx = 1, dz = 0): [number, number] => [
    village.x + d * dx,
    village.z + d * dz,
  ];
  const square = (cx: number, cz: number, half: number): [number, number][] => [
    [cx - half, cz - half],
    [cx + half, cz - half],
    [cx + half, cz + half],
    [cx - half, cz + half],
  ];
  const features = (...sites: PremiumSite[]): PremiumFeatures => ({ type: 'mountain-pass', sites });

  it('okruh vsi má 120 m', () => {
    expect(R).toBe(120);
  });

  it('typ bez prvků neprojde', () => {
    expect(checkPremiumFeatures(l, null)).toEqual({ ok: false, reason: 'no-features' });
    expect(checkPremiumFeatures(l, features())).toEqual({ ok: false, reason: 'no-sites' });
  });

  it('obrys přes místo vsi nebo kolem něj zasahuje, obrys dál ne', () => {
    const [x, z] = at(0);
    expect(siteIntrudes({ kind: 'quarry', x, z, outline: square(x, z, 30) }, village, R)).toBe(
      true,
    );
    // Velký obrys kolem vsi – hrany daleko, ale ves uvnitř.
    expect(siteIntrudes({ kind: 'woodland', x, z, outline: square(x, z, 600) }, village, R)).toBe(
      true,
    );
    const [fx, fz] = at(300);
    expect(
      siteIntrudes({ kind: 'quarry', x: fx, z: fz, outline: square(fx, fz, 50) }, village, R),
    ).toBe(false);
    // Hrana obrysu 110 m od vsi.
    const [nx, nz] = at(160);
    expect(
      siteIntrudes({ kind: 'quarry', x: nx, z: nz, outline: square(nx, nz, 50) }, village, R),
    ).toBe(true);
  });

  it('osa přes okruh zasahuje, kolem něj ne; bod bez obrysu a osy se nekontroluje', () => {
    const through = [at(400, 0, -1), at(400, 0, 1)];
    expect(siteIntrudes({ kind: 'river', x: 0, z: 0, line: through }, village, R)).toBe(true);
    const near = [at(100, 1, 0), [village.x + 100, village.z + 400] as [number, number]];
    expect(siteIntrudes({ kind: 'river', x: 0, z: 0, line: near }, village, R)).toBe(true);
    const clear = [at(130, 1, 0), [village.x + 130, village.z + 400] as [number, number]];
    expect(siteIntrudes({ kind: 'river', x: 0, z: 0, line: clear }, village, R)).toBe(false);
    const [x, z] = at(0);
    expect(siteIntrudes({ kind: 'spring', x, z }, village, R)).toBe(false);
  });

  it('stezka smí vést k okraji okruhu, ne přes něj', () => {
    const toEdge = [at(800, 0, 1), at(R, 0, 1)];
    expect(siteIntrudes({ kind: 'route', x: 0, z: 0, line: toEdge }, village, R)).toBe(false);
    const inside = [at(800, 0, 1), at(R - 10, 0, 1)];
    expect(siteIntrudes({ kind: 'route', x: 0, z: 0, line: inside }, village, R)).toBe(true);
    const across = [at(800, 0, 1), at(800, 0, -1)];
    expect(siteIntrudes({ kind: 'route', x: 0, z: 0, line: across }, village, R)).toBe(true);
  });

  it('jediný zasahující prvek stačí, aby krajina neprošla', () => {
    const [fx, fz] = at(300);
    const ok: PremiumSite = { kind: 'pass', x: fx, z: fz, outline: square(fx, fz, 40) };
    const bad: PremiumSite = { kind: 'route', x: 0, z: 0, line: [at(500, -1), at(500, 1)] };
    expect(checkPremiumFeatures(l, features(ok))).toEqual({ ok: true });
    expect(checkPremiumFeatures(l, features(ok, bad))).toEqual({
      ok: false,
      reason: 'village-site',
    });
  });
});

// Každý typ na 300 seedech – typy, které ještě nemají průchod, jsou `todo` a zapnou se samy, až
// průchod dostanou. Krajiny se nedrží (vrstva překážek v mezipaměti by zabrala stovky MB) – jen
// výsledek kontroly a prvky.
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

describe('každý typ projde pásmem na 300 seedech', () => {
  for (const type of PREMIUM_TYPES) {
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

describe('místo vsi zůstane volné', () => {
  for (const type of PREMIUM_TYPES) {
    const name = `${type} – prvky s obrysem nebo osou nezasahují do 120 m od místa vsi (stezka smí k okraji)`;
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
              const d = segmentDistance(outline[i]!, outline[(i + 1) % outline.length]!, o.village);
              expect(d, label).toBeGreaterThanOrEqual(PREMIUM_VILLAGE_CLEARANCE_M - 0.01);
            }
          }
        }
      },
      TYPE_TIMEOUT_MS,
    );
  }
});
