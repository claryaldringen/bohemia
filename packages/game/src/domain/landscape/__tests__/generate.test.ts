import { beforeAll, describe, it, expect } from 'vitest';
import { BAND_V2, bandFor, checkBand } from '../band';
import {
  generateAcceptedLandscape,
  generateLandscape,
  generateLandscapeAttempt,
} from '../generate';
import {
  CURRENT_LAYER_VERSIONS,
  INITIAL_LAYER_VERSIONS,
  PREVIOUS_LAYER_VERSIONS,
  SURFACE_CODES,
  type Landscape,
  type LayerVersions,
} from '../types';
import {
  fertileCellCount,
  landscapeHash,
  largestVillageSite,
  meadowNearSite,
  reliefM,
  share,
  waterTouchesOppositeEdges,
} from './landscape-checks';

const SEEDS = Array.from({ length: 300 }, (_, i) => i);
let landscapes: Landscape[] = [];

beforeAll(() => {
  landscapes = SEEDS.map((seed) => generateLandscape(seed));
}, 120_000);

const eachLandscape = (check: (l: Landscape, seed: number) => void): void => {
  landscapes.forEach((l, seed) => check(l, seed));
};

describe('generateLandscape – pásmo srovnatelnosti na 300 krajinách (nové vrstvy – i se skalami u potoka)', () => {
  it('každá krajina má potok od okraje k okraji', () => {
    eachLandscape((l, seed) => {
      const water = l.surface.map((v) => (v === SURFACE_CODES.water ? 1 : 0));
      expect(waterTouchesOppositeEdges(water, l.size), `seed ${seed}`).toBe(true);
    });
  });

  it('les tvoří 55–70 % plochy', () => {
    eachLandscape((l, seed) => {
      const forestShare = share(l.surface, SURFACE_CODES.forest);
      expect(forestShare, `seed ${seed}`).toBeGreaterThanOrEqual(0.55);
      expect(forestShare, `seed ${seed}`).toBeLessThanOrEqual(0.7);
    });
  });

  it('místo pro vesnici má 600–1 400 políček', () => {
    eachLandscape((l, seed) => {
      const site = largestVillageSite(l);
      expect(site, `seed ${seed}`).toBeGreaterThanOrEqual(600);
      expect(site, `seed ${seed}`).toBeLessThanOrEqual(1400);
    });
  });

  it('do 600 m od vsi leží 56–64 ha louky, z toho 29–40 ha s úrodností ≥ 60', () => {
    eachLandscape((l, seed) => {
      const meadow = meadowNearSite(l, 40) * 0.0225;
      const good = meadowNearSite(l, 40, 60) * 0.0225;
      expect(meadow, `seed ${seed}`).toBeGreaterThanOrEqual(56);
      expect(meadow, `seed ${seed}`).toBeLessThanOrEqual(64);
      expect(good, `seed ${seed}`).toBeGreaterThanOrEqual(29);
      expect(good, `seed ${seed}`).toBeLessThanOrEqual(40.5);
    });
  });

  it('převýšení je 10–40 m', () => {
    eachLandscape((l, seed) => {
      expect(reliefM(l.heights), `seed ${seed}`).toBeGreaterThanOrEqual(10);
      expect(reliefM(l.heights), `seed ${seed}`).toBeLessThanOrEqual(40);
    });
  });

  it('celková úrodná plocha leží v pásmu', () => {
    eachLandscape((l, seed) => {
      const fertile = fertileCellCount(l.fertility);
      expect(fertile, `seed ${seed}`).toBeGreaterThanOrEqual(BAND_V2.fertileCells[0]);
      expect(fertile, `seed ${seed}`).toBeLessThanOrEqual(BAND_V2.fertileCells[1]);
    });
  });

  it('úrodnost je 0–100 a voda má úrodnost 0', () => {
    eachLandscape((l, seed) => {
      const invalid = l.fertility.filter(
        (f, i) => f > 100 || (l.surface[i] === SURFACE_CODES.water && f !== 0),
      );
      expect(invalid, `seed ${seed}`).toHaveLength(0);
    });
  });

  it('místo pro vesnici leží na louce', () => {
    eachLandscape((l, seed) => {
      const { x, y } = l.villageSite;
      expect(l.surface[y * l.size + x], `seed ${seed}`).toBe(SURFACE_CODES.meadow);
    });
  });
});

describe('generateLandscape', () => {
  it('stejný seed → shodná krajina, jiný seed → jiná', () => {
    expect(generateLandscape(77)).toEqual(generateLandscape(77));
    expect(generateLandscape(77).heights).not.toEqual(generateLandscape(79).heights);
  });

  it('neznámá verze vrstvy vyhodí RangeError', () => {
    const versions = { terrain: 3, vegetation: 1, fertility: 1 } as unknown as LayerVersions;
    expect(() => generateLandscape(1, versions)).toThrow(RangeError);
    const vegetation3 = { terrain: 1, vegetation: 3, fertility: 2 } as unknown as LayerVersions;
    expect(() => generateLandscape(1, vegetation3)).toThrow(RangeError);
  });

  it('pásmo je jen pro vegetaci a úrodnost stejné verze', () => {
    expect(bandFor(INITIAL_LAYER_VERSIONS)).not.toBe(bandFor(CURRENT_LAYER_VERSIONS));
    const mixed: LayerVersions = { terrain: 1, vegetation: 2, fertility: 1 };
    expect(() => bandFor(mixed)).toThrow(RangeError);
    expect(() => generateLandscape(1, mixed)).toThrow(RangeError);
  });

  it('má rozměr 128 × 128 a políčko 15 m', () => {
    const l = generateLandscape(3);
    expect(l.size).toBe(128);
    expect(l.cellSizeM).toBe(15);
    expect(l.fertility).toHaveLength(128 * 128);
  });
});

/**
 * Zlatý otisk krajin: verze vrstev uložených sídel se po ostrém spuštění nesmí změnit ani
 * o bit (přepsala by krajiny hráčů). Verze 1 má otisky z doby před verzí 2 – kdyby spadly,
 * změnila se původní krajina (i u Martinova sídla). Před spuštěním se dá otisk nejnovější
 * verze vědomě přepsat; po spuštění je potřeba nová verze vrstvy.
 */
describe('verze vrstev – zlatý otisk krajiny', () => {
  /**
   * Přijatá krajina – a táž bez prémie (třetí parametr `undefined`): bez prémie bit po bitu jako
   * dřív, bez typu v krajině.
   */
  const acceptedWithoutPremium = (
    seed: number,
    versions: LayerVersions,
  ): { seed: number; landscape: Landscape } => {
    const accepted = generateAcceptedLandscape(seed, versions);
    const plain = generateAcceptedLandscape(seed, versions, undefined);
    expect(plain.seed).toBe(accepted.seed);
    expect(plain.landscape).toEqual(accepted.landscape);
    expect('premium' in plain.landscape).toBe(false);
    return plain;
  };

  it.each([
    [1, 1, '0b76b6b6'],
    [42, 42, '04ebf1c1'],
    [123, 123, 'e8827a26'],
    [50, 51, '91561e91'],
  ])('verze 1, seed %i (přijatý pokus %i)', (seed, acceptedSeed, expected) => {
    const accepted = acceptedWithoutPremium(seed, INITIAL_LAYER_VERSIONS);
    expect(accepted.seed).toBe(acceptedSeed);
    expect(landscapeHash(accepted.landscape)).toBe(expected);
  });

  const V2: LayerVersions = PREVIOUS_LAYER_VERSIONS;
  it.each([
    [1, 1, '49256383'],
    [42, 42, 'd62c3d7a'],
    [123, 123, '22066e5f'],
    [14, 15, '26bd1903'],
  ])('verze 2, seed %i (přijatý pokus %i)', (seed, acceptedSeed, expected) => {
    const accepted = acceptedWithoutPremium(seed, V2);
    expect(accepted.seed).toBe(acceptedSeed);
    expect(landscapeHash(accepted.landscape)).toBe(expected);
  });

  // Terén 2 – skály u potoka a ostrožny (20. 10. 2026). Bez ostrožny jsou osa potoka a místo pro
  // vesnici stejné jako v terénu 1 (stream-rocks.test.ts), výšky se u skal zvednou.
  it.each([
    [1, 1, '238b9327'],
    [42, 42, 'eb4bef95'],
    [123, 123, 'f4068e03'],
    [16, 16, '300a3e4c'],
  ])('verze 3 (terén 2), seed %i (přijatý pokus %i)', (seed, acceptedSeed, expected) => {
    const accepted = acceptedWithoutPremium(seed, CURRENT_LAYER_VERSIONS);
    expect(accepted.seed).toBe(acceptedSeed);
    expect(landscapeHash(accepted.landscape)).toBe(expected);
  });

  it('bez prémie bit po bitu jako dřív – pokus i přijatá krajina, i s ostrožnou', () => {
    for (const [seed, expected] of [
      [1, '238b9327'],
      [16, '300a3e4c'],
    ] as const) {
      const attempt = generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS, undefined);
      expect(landscapeHash(attempt)).toBe(expected);
      expect(attempt).toEqual(generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS));
      expect('premium' in attempt).toBe(false);
      expect(landscapeHash(generateLandscape(seed, CURRENT_LAYER_VERSIONS, undefined))).toBe(
        expected,
      );
    }
  });

  it('verze 1 padne do svého pásma a terén mají verze 1 a 2 stejný', () => {
    for (const seed of [1, 42, 123]) {
      const v1 = generateLandscape(seed, INITIAL_LAYER_VERSIONS);
      const v2 = generateLandscape(seed, PREVIOUS_LAYER_VERSIONS);
      expect(checkBand(v1, INITIAL_LAYER_VERSIONS).ok).toBe(true);
      expect(v2.heights).toEqual(v1.heights);
      expect(v2.stream).toEqual(v1.stream);
      expect(meadowNearSite(v2, 40)).toBeGreaterThan(meadowNearSite(v1, 40) * 1.4);
    }
  });
});
