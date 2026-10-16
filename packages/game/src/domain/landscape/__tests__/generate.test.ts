import { beforeAll, describe, it, expect } from 'vitest';
import { FERTILE_CELLS } from '../band';
import { generateLandscape } from '../generate';
import { SURFACE_CODES, type Landscape, type LayerVersions } from '../types';
import {
  fertileCellCount,
  largestVillageSite,
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

describe('generateLandscape – pásmo srovnatelnosti na 300 krajinách', () => {
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

  it('místo pro vesnici má 400–1 200 políček', () => {
    eachLandscape((l, seed) => {
      const site = largestVillageSite(l);
      expect(site, `seed ${seed}`).toBeGreaterThanOrEqual(400);
      expect(site, `seed ${seed}`).toBeLessThanOrEqual(1200);
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
      expect(fertile, `seed ${seed}`).toBeGreaterThanOrEqual(FERTILE_CELLS[0]);
      expect(fertile, `seed ${seed}`).toBeLessThanOrEqual(FERTILE_CELLS[1]);
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
    expect(generateLandscape(77).heights).not.toEqual(generateLandscape(78).heights);
  });

  it('neznámá verze vrstvy vyhodí RangeError', () => {
    const versions = { terrain: 2, vegetation: 1, fertility: 1 } as unknown as LayerVersions;
    expect(() => generateLandscape(1, versions)).toThrow(RangeError);
  });

  it('má rozměr 128 × 128 a políčko 15 m', () => {
    const l = generateLandscape(3);
    expect(l.size).toBe(128);
    expect(l.cellSizeM).toBe(15);
    expect(l.fertility).toHaveLength(128 * 128);
  });
});
