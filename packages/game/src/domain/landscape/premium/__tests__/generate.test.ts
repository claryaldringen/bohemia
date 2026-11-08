import { afterEach, describe, expect, it, vi } from 'vitest';
import { landscapeHash } from '../../__tests__/landscape-checks';
import { checkBand } from '../../band';
import {
  generateAcceptedLandscape,
  generateLandscape,
  generateLandscapeAttempt,
} from '../../generate';
import { deriveSeed } from '../../random';
import type { Terrain } from '../../terrain';
import {
  CURRENT_LAYER_VERSIONS,
  SURFACE_CODES,
  type Landscape,
  type LayerVersions,
} from '../../types';
import { tileCenterWorld } from '../../world';
import { PREMIUM_TYPES } from '../catalog';
import {
  checkPremium,
  checkPremiumFeatures,
  PREMIUM_LAND_KINDS,
  PREMIUM_VILLAGE_CLEARANCE_M,
  siteIntrudes,
} from '../check';
import { hasPremiumPass, PREMIUM_LAYER_VERSION, premiumFeaturesOf } from '../generate';
import { SOIL_FOREST_PASSES } from '../soil-forest';
import type { PremiumFeatures, PremiumSite, PremiumType } from '../types';
import {
  DEPOSIT_TYPES,
  GROUPED_TYPES,
  RELIEF_TYPES,
  SOIL_FOREST_TYPES,
  WATER_TYPES,
} from './type-band';

const UNKNOWN = 'atlantis' as PremiumType;

describe('prémiový typ jako třetí vstup generátoru', () => {
  const average = generateLandscape(1);

  it('průměrná krajina nemá typ ani prvky a kontrolou typu projde', () => {
    expect('premium' in average).toBe(false);
    expect(premiumFeaturesOf(average)).toBeNull();
    expect(checkPremium(average)).toEqual({ ok: true });
  });

  it('typy půdy a lesa mají průchod', () => {
    for (const type of SOIL_FOREST_TYPES) expect(hasPremiumPass(type), type).toBe(true);
  });

  it('typy vody mají průchod', () => {
    for (const type of WATER_TYPES) expect(hasPremiumPass(type), type).toBe(true);
  });

  it('typy reliéfu a nalezišť mají průchod', () => {
    for (const type of [...RELIEF_TYPES, ...DEPOSIT_TYPES]) {
      expect(hasPremiumPass(type), type).toBe(true);
    }
  });

  it('každý typ má průchod a test pásma ve své skupině', () => {
    for (const type of PREMIUM_TYPES) {
      expect(hasPremiumPass(type), type).toBe(true);
      expect(GROUPED_TYPES.has(type), type).toBe(true);
    }
  });

  it('krajina s typem nese typ – i typ, který ještě nemá průchod', () => {
    for (const type of PREMIUM_TYPES) {
      expect(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS, type).premium, type).toBe(type);
    }
  });

  it('verze prémiového průchodu 1 i 2 – průměrnou krajinu nezmění', () => {
    expect(PREMIUM_LAYER_VERSION).toBe(2);
    for (const premium of [1, PREMIUM_LAYER_VERSION] as const) {
      const versions: LayerVersions = { ...CURRENT_LAYER_VERSIONS, premium };
      const accepted = generateAcceptedLandscape(1, versions);
      expect(accepted.seed).toBe(1);
      expect(landscapeHash(accepted.landscape)).toBe(landscapeHash(average));
      expect('premium' in accepted.landscape).toBe(false);
    }
  });

  it('neznámý typ i neznámá verze průchodu vyhodí RangeError', () => {
    expect(() => generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS, UNKNOWN)).toThrow(RangeError);
    expect(() => generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS, UNKNOWN)).toThrow(RangeError);
    const premium3 = { ...CURRENT_LAYER_VERSIONS, premium: 3 } as unknown as LayerVersions;
    expect(() => generateAcceptedLandscape(1, premium3)).toThrow(RangeError);
    expect(() => generateLandscapeAttempt(1, premium3, 'fertile')).toThrow(RangeError);
    expect(() => premiumFeaturesOf({ ...average, premium: UNKNOWN })).toThrow(RangeError);
  });

  it('pásmo kontroluje i typ – neznámý typ neprojde ani pásmem', () => {
    expect(checkBand(average, CURRENT_LAYER_VERSIONS).ok).toBe(true);
    expect(() => checkBand({ ...average, premium: UNKNOWN }, CURRENT_LAYER_VERSIONS)).toThrow(
      RangeError,
    );
  });

  it('prvky se počítají jednou na objekt krajiny', () => {
    const l = generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS, 'fertile');
    const features = premiumFeaturesOf(l);
    expect(features).not.toBeNull();
    expect(premiumFeaturesOf(l)).toBe(features);
    // Jiný objekt téže krajiny – spočítá se znovu, vyjde stejně.
    const copy = { ...l };
    expect(premiumFeaturesOf(copy)).not.toBe(features);
    expect(premiumFeaturesOf(copy)).toEqual(features);
  });
});

describe('napojení průchodu typu na generátor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const seed = 7;
  const average = generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS);
  // Verze vrstev bez `premium` = průchod 1, suchá mapa bez výřezu.
  const ctx = {
    version: 1,
    seed: deriveSeed(seed, 'premium'),
    versions: CURRENT_LAYER_VERSIONS,
    skeleton: null,
  };

  it('vegetace dostane terén a povrch průměrné krajiny a její výsledek je povrch krajiny', () => {
    const vegetation = vi.spyOn(SOIL_FOREST_PASSES.floodplain, 'vegetation');
    const l = generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS, 'floodplain');
    expect(vegetation).toHaveBeenCalledTimes(1);
    const [surface, terrain, passCtx] = vegetation.mock.calls[0]!;
    expect(surface).toEqual(average.surface);
    expect(terrain.heights).toEqual(average.heights);
    expect(terrain.villageSite).toEqual(average.villageSite);
    expect(passCtx).toEqual({ ...ctx, type: 'floodplain' });
    expect(l.surface).toBe(vegetation.mock.results[0]!.value);
    expect(l.heights).toEqual(average.heights);
  });

  it('úrodnost běží po vegetaci – dostane hotový povrch a její výsledek je úrodnost krajiny', () => {
    const fertility = vi.spyOn(SOIL_FOREST_PASSES.fertile, 'fertility');
    const l = generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS, 'fertile');
    expect(fertility).toHaveBeenCalledTimes(1);
    // Průchod typu kontext nepotřebuje – generátor ho předá i tak (čtvrtý argument).
    const [base, terrain, surface, passCtx] = fertility.mock.calls[0]! as unknown as [
      Uint8Array,
      Terrain,
      Uint8Array,
      unknown,
    ];
    expect(base).toEqual(average.fertility);
    expect(terrain.heights).toEqual(average.heights);
    expect(surface).toBe(l.surface);
    expect(passCtx).toEqual({ ...ctx, type: 'fertile' });
    expect(l.fertility).toBe(fertility.mock.results[0]!.value);
  });
});

describe('pásmo prémiové krajiny – celé na průměrné krajině pokusu, na prémiové dolní meze', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** První pokus od `seed`, jehož průměrná krajina projde celým pásmem. */
  const firstAverageInBand = (seed: number): number => {
    for (let s = seed; ; s++) {
      if (
        checkBand(generateLandscapeAttempt(s, CURRENT_LAYER_VERSIONS), CURRENT_LAYER_VERSIONS).ok
      ) {
        return s;
      }
    }
  };

  it('základ pod dolní mezí neprojde ani s bonusem typu', () => {
    // Pokus 59: průměrná krajina má málo úrodných políček, +15 úrodnosti by ji do pásma vytáhlo.
    const average = generateLandscapeAttempt(59, CURRENT_LAYER_VERSIONS);
    expect(checkBand(average, CURRENT_LAYER_VERSIONS).failures).toEqual(['fertile-cells']);
    const fertile = generateLandscapeAttempt(59, CURRENT_LAYER_VERSIONS, 'fertile');
    expect(checkBand(fertile, CURRENT_LAYER_VERSIONS).ok).toBe(true);
    const accepted = generateAcceptedLandscape(59, CURRENT_LAYER_VERSIONS, 'fertile');
    expect(accepted.seed).not.toBe(59);
    expect(accepted.seed).toBe(generateAcceptedLandscape(59).seed);
  });

  it('prémiová krajina, která po průchodu poruší dolní mez, neprojde', () => {
    expect(firstAverageInBand(1)).toBe(1);
    const original = SOIL_FOREST_PASSES.floodplain.vegetation;
    const broken = deriveSeed(1, 'premium');
    // Pokus 1: průchod (naschvál) vykácí všechen les – podíl lesa pod dolní mezí.
    vi.spyOn(SOIL_FOREST_PASSES.floodplain, 'vegetation').mockImplementation(
      (surface, terrain, ctx) =>
        ctx.seed === broken
          ? surface.map((v) => (v === SURFACE_CODES.forest ? SURFACE_CODES.meadow : v))
          : original(surface, terrain, ctx),
    );
    const attempt = generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS, 'floodplain');
    expect(checkBand(attempt, CURRENT_LAYER_VERSIONS).failures).toContain('forest-share');
    const accepted = generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS, 'floodplain');
    expect(accepted.seed).toBeGreaterThan(1);
    expect(checkBand(accepted.landscape, CURRENT_LAYER_VERSIONS).ok).toBe(true);
  });

  it('na prémiové krajině neplatí horní meze, dolní ano', () => {
    const average = generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS);
    const lush = { ...average, fertility: average.fertility.map((v) => (v > 0 ? 100 : 0)) };
    expect(checkBand(lush, CURRENT_LAYER_VERSIONS).failures).toContain('fertile-cells');
    expect(checkBand({ ...lush, premium: 'fertile' }, CURRENT_LAYER_VERSIONS).ok).toBe(true);
    const bare = {
      ...average,
      surface: average.surface.map((v) => (v === SURFACE_CODES.forest ? SURFACE_CODES.meadow : v)),
      premium: 'fertile' as const,
    };
    expect(checkBand(bare, CURRENT_LAYER_VERSIONS).failures).toContain('forest-share');
  });

  it('průměrná krajina beze změny – první pokus v celém pásmu', () => {
    for (let seed = 55; seed <= 62; seed++) {
      const accepted = generateAcceptedLandscape(seed);
      expect(accepted.seed).toBe(firstAverageInBand(seed));
      expect('premium' in accepted.landscape).toBe(false);
    }
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

  it('druhy půdy (louka, les, svah, honitba, brtě) okruh vsi nemají – obrys kolem vsi smí', () => {
    expect([...PREMIUM_LAND_KINDS].sort()).toEqual(
      ['bee-trees', 'hunting-ground', 'meadow', 'slope', 'woodland'].sort(),
    );
    const [x, z] = at(0);
    const around: PremiumSite = { kind: 'meadow', x, z, outline: square(x, z, 600) };
    expect(checkPremiumFeatures(l, features(around))).toEqual({ ok: true });
    const across: PremiumSite = { kind: 'woodland', x, z, outline: square(x, z, 30) };
    expect(checkPremiumFeatures(l, features(across))).toEqual({ ok: true });
    const quarry: PremiumSite = { kind: 'quarry', x, z, outline: square(x, z, 30) };
    expect(checkPremiumFeatures(l, features(across, quarry))).toEqual({
      ok: false,
      reason: 'village-site',
    });
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

// Pásmo a místo vsi po typech (300 seedů) má každá skupina typů vlastní soubor (`type-band.ts`).
