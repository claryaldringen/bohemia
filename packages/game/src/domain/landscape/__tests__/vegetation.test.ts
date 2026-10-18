import { describe, it, expect } from 'vitest';
import { generateTerrain } from '../terrain';
import { SURFACE_CODES } from '../types';
import { generateVegetation } from '../vegetation';
import { componentSizes, share } from './landscape-checks';

const SEEDS = Array.from({ length: 100 }, (_, i) => i * 104729 + 3);
const { water, forest, meadow } = SURFACE_CODES;

describe('generateVegetation', () => {
  // Smyčky přes desítky seedů trvají pod paralelní zátěží déle než výchozích 5 s – limit 30 s.
  it('podíl lesa je 55–70 %', () => {
    for (const seed of SEEDS) {
      const terrain = generateTerrain(seed, 1);
      const forestShare = share(generateVegetation(seed + 1, terrain, 1), forest);
      expect(forestShare, `seed ${seed}`).toBeGreaterThanOrEqual(0.55);
      expect(forestShare, `seed ${seed}`).toBeLessThanOrEqual(0.7);
    }
  }, 30_000);

  it('voda z terénu zůstane vodou a jinde voda není', () => {
    const terrain = generateTerrain(11, 1);
    const surface = generateVegetation(12, terrain, 1);
    for (let i = 0; i < surface.length; i++) {
      expect(surface[i] === water).toBe(terrain.water[i] === 1);
    }
  });

  it('místo pro vesnici je louka', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const terrain = generateTerrain(seed, 1);
      const { x, y } = terrain.villageSite;
      expect(generateVegetation(seed, terrain, 1)[y * terrain.size + x], `seed ${seed}`).toBe(
        meadow,
      );
    }
  }, 30_000);

  it('les netvoří osamělá políčka (žádný lesní ostrůvek pod 4 políčka)', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const terrain = generateTerrain(seed, 1);
      const surface = generateVegetation(seed, terrain, 1);
      const forestMask = surface.map((v) => (v === forest ? 1 : 0));
      expect(
        Math.min(...componentSizes(forestMask, terrain.size)),
        `seed ${seed}`,
      ).toBeGreaterThanOrEqual(4);
    }
  }, 30_000);

  it('změna seedu vegetace nezmění terén', () => {
    const terrain = generateTerrain(21, 1);
    const before = structuredClone(terrain);
    const a = generateVegetation(1, terrain, 1);
    const b = generateVegetation(2, terrain, 1);
    expect(terrain).toEqual(before);
    expect(a).not.toEqual(b);
  });
});

describe('generateVegetation – verze 2 (víc kvalitní louky)', () => {
  const cases = SEEDS.slice(0, 30).map((seed) => {
    const terrain = generateTerrain(seed, 1);
    return { seed, terrain, surface: generateVegetation(seed + 1, terrain, 2) };
  });

  /** Políčka s daným povrchem do radius políček od místa pro vesnici. */
  const nearSite = (
    terrain: ReturnType<typeof generateTerrain>,
    surface: Uint8Array,
    code: number,
    radius: number,
  ): number => {
    let count = 0;
    for (let y = 0; y < terrain.size; y++) {
      for (let x = 0; x < terrain.size; x++) {
        const dx = x - terrain.villageSite.x;
        const dy = y - terrain.villageSite.y;
        if (dx * dx + dy * dy <= radius * radius && surface[y * terrain.size + x] === code) count++;
      }
    }
    return count;
  };

  it('podíl lesa zůstane 55–70 %', () => {
    for (const { seed, surface } of cases) {
      const forestShare = share(surface, forest);
      expect(forestShare, `seed ${seed}`).toBeGreaterThanOrEqual(0.55);
      expect(forestShare, `seed ${seed}`).toBeLessThanOrEqual(0.7);
    }
  }, 30_000);

  it('do 600 m od místa pro vesnici je 2 500–2 850 políček louky (≈ 56–64 ha)', () => {
    for (const { seed, terrain, surface } of cases) {
      const near = nearSite(terrain, surface, meadow, 40);
      expect(near, `seed ${seed}`).toBeGreaterThanOrEqual(2500);
      expect(near, `seed ${seed}`).toBeLessThanOrEqual(2850);
    }
  }, 30_000);

  it('louky vsi leží hlavně u vody – v pásu do 10 políček od potoka víc louky než lesa', () => {
    for (const { seed, terrain, surface } of cases) {
      let meadowNearWater = 0;
      let forestNearWater = 0;
      const waterCells: [number, number][] = [];
      for (let i = 0; i < surface.length; i++) {
        if (terrain.water[i]) waterCells.push([i % terrain.size, Math.floor(i / terrain.size)]);
      }
      for (let y = 0; y < terrain.size; y++) {
        for (let x = 0; x < terrain.size; x++) {
          const i = y * terrain.size + x;
          const dx = x - terrain.villageSite.x;
          const dy = y - terrain.villageSite.y;
          if (dx * dx + dy * dy > 40 * 40 || terrain.water[i]) continue;
          if (!waterCells.some(([wx, wy]) => (wx - x) ** 2 + (wy - y) ** 2 <= 100)) continue;
          if (surface[i] === meadow) meadowNearWater++;
          else forestNearWater++;
        }
      }
      expect(meadowNearWater, `seed ${seed}`).toBeGreaterThan(forestNearWater);
    }
  }, 30_000);

  it('místo pro vesnici je louka, les i louka bez ostrůvků pod 4 políčka', () => {
    for (const { seed, terrain, surface } of cases.slice(0, 10)) {
      const { x, y } = terrain.villageSite;
      expect(surface[y * terrain.size + x], `seed ${seed}`).toBe(meadow);
      for (const code of [forest, meadow]) {
        const mask = surface.map((v) => (v === code ? 1 : 0));
        expect(
          Math.min(...componentSizes(mask, terrain.size)),
          `seed ${seed}, povrch ${code}`,
        ).toBeGreaterThanOrEqual(4);
      }
    }
  }, 30_000);

  it('voda zůstane vodou, terén se nezmění a jiný seed dá jiné louky', () => {
    const terrain = generateTerrain(21, 1);
    const before = structuredClone(terrain);
    const a = generateVegetation(1, terrain, 2);
    const b = generateVegetation(2, terrain, 2);
    expect(terrain).toEqual(before);
    expect(a).not.toEqual(b);
    for (let i = 0; i < a.length; i++) expect(a[i] === water).toBe(terrain.water[i] === 1);
  });

  it('neznámá verze vyhodí RangeError', () => {
    expect(() => generateVegetation(1, generateTerrain(1, 1), 3 as 2)).toThrow(RangeError);
  });
});
