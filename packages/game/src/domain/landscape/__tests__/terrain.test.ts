import { describe, it, expect } from 'vitest';
import { deriveSeed } from '../random';
import { generateTerrain } from '../terrain';
import { LANDSCAPE_SIZE, type StreamPoint } from '../types';
import {
  maxNeighbourStepM,
  reliefM,
  streamClimbM,
  waterTouchesOppositeEdges,
} from './landscape-checks';

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 1);

describe('generateTerrain', () => {
  it('stejný seed → shodné výšky, voda i místo pro vesnici', () => {
    expect(generateTerrain(1234, 1)).toEqual(generateTerrain(1234, 1));
  });

  it('jiný seed → jiné výšky', () => {
    expect(generateTerrain(1, 1).heights).not.toEqual(generateTerrain(2, 1).heights);
  });

  it('má rozměr 128 × 128', () => {
    const terrain = generateTerrain(5, 1);
    expect(terrain.size).toBe(LANDSCAPE_SIZE);
    expect(terrain.heights).toHaveLength(128 * 128);
    expect(terrain.water).toHaveLength(128 * 128);
  });

  it('nejnižší políčko má výšku 0', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect(Math.min(...generateTerrain(seed, 1).heights)).toBe(0);
    }
  });

  it('převýšení je mezi 10 a 40 m', () => {
    for (const seed of SEEDS) {
      const relief = reliefM(generateTerrain(seed, 1).heights);
      expect(relief, `seed ${seed}`).toBeGreaterThanOrEqual(10);
      expect(relief, `seed ${seed}`).toBeLessThanOrEqual(40);
    }
  }, 30_000);

  it('potok spojuje protilehlé okraje', () => {
    for (const seed of SEEDS) {
      const { water, size } = generateTerrain(seed, 1);
      expect(waterTouchesOppositeEdges(water, size), `seed ${seed}`).toBe(true);
    }
  });

  it('potok teče z kopce – dno od vyššího konce nikde nestoupá', () => {
    for (const seed of SEEDS) {
      const { heights, water, size } = generateTerrain(seed, 1);
      expect(streamClimbM(heights, water, size), `seed ${seed}`).toBeLessThanOrEqual(0.01);
    }
  });

  it('žádné útesy: sousední políčka se liší nejvýš o 3 m', () => {
    for (const seed of SEEDS) {
      const { heights, size } = generateTerrain(seed, 1);
      let worst = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++)
          worst = Math.max(worst, maxNeighbourStepM(heights, size, x, y));
      }
      expect(worst, `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });

  it('terén je zvlněný – průměrná odchylka od okolí 7 × 7 políček ≥ 0,38 m', () => {
    const values = SEEDS.map((seed) => {
      const { heights, size } = generateTerrain(seed, 1);
      return undulationM(heights, size);
    });
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThanOrEqual(0.38);
  });
});

describe('generateTerrain – potok', () => {
  const terrains = SEEDS.map((seed) => ({ seed, terrain: generateTerrain(seed, 1) }));
  const halfWidth = (p: StreamPoint): number => (p.halfWidthLeft + p.halfWidthRight) / 2;

  it('osa potoka vede od okraje k protilehlému okraji', () => {
    for (const { seed, terrain } of terrains) {
      const { stream, size } = terrain;
      const first = stream[0]!;
      const last = stream.at(-1)!;
      const onEdge = (p: StreamPoint): boolean =>
        p.x <= 0.5 || p.y <= 0.5 || p.x >= size - 1.5 || p.y >= size - 1.5;
      expect(onEdge(first) && onEdge(last), `seed ${seed}`).toBe(true);
      expect(Math.hypot(first.x - last.x, first.y - last.y), `seed ${seed}`).toBeGreaterThan(
        size * 0.8,
      );
    }
  });

  it('potok meandruje – délka osy je aspoň 1,3× přímá vzdálenost v 90 % krajin', () => {
    const sinuous = terrains.filter(({ terrain }) => {
      const { stream } = terrain;
      let length = 0;
      for (let k = 1; k < stream.length; k++) {
        length += Math.hypot(stream[k]!.x - stream[k - 1]!.x, stream[k]!.y - stream[k - 1]!.y);
      }
      const straight = Math.hypot(stream[0]!.x - stream.at(-1)!.x, stream[0]!.y - stream.at(-1)!.y);
      return length / straight >= 1.3;
    });
    expect(sinuous.length / terrains.length).toBeGreaterThanOrEqual(0.9);
  });

  it('šířka se mění – úzké úseky i široké, každý břeh jinak', () => {
    for (const { seed, terrain } of terrains) {
      const widths = terrain.stream.map(halfWidth);
      expect(Math.min(...widths), `seed ${seed}`).toBeLessThanOrEqual(0.5);
      expect(Math.max(...widths), `seed ${seed}`).toBeGreaterThanOrEqual(0.9);
      const asymmetric = terrain.stream.filter(
        (p) => Math.abs(p.halfWidthLeft - p.halfWidthRight) > 0.2,
      );
      expect(asymmetric.length / terrain.stream.length, `seed ${seed}`).toBeGreaterThan(0.2);
    }
  });

  it('potok tvoří 2–4 tůně (úseky s poloviční šířkou ≥ 1,4 políčka)', () => {
    for (const { seed, terrain } of terrains) {
      let pools = 0;
      let inPool = false;
      for (const p of terrain.stream) {
        const wide = halfWidth(p) >= 1.4;
        if (wide && !inPool) pools++;
        inPool = wide;
      }
      expect(pools, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(pools, `seed ${seed}`).toBeLessThanOrEqual(4);
    }
  });

  it('mělčiny jsou vyznačené a nejsou v tůních', () => {
    for (const { seed, terrain } of terrains) {
      const shallow = terrain.stream.filter((p) => p.shallow);
      expect(shallow.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const p of shallow) expect(halfWidth(p), `seed ${seed}`).toBeLessThan(1.4);
    }
  });

  it('hladina po proudu nikde nestoupá a leží nad dnem vodních políček', () => {
    for (const { seed, terrain } of terrains) {
      const { stream, heights, size } = terrain;
      for (let k = 1; k < stream.length; k++) {
        expect(stream[k]!.level, `seed ${seed}`).toBeLessThanOrEqual(stream[k - 1]!.level + 1e-6);
      }
      for (const p of stream) {
        const i = Math.round(p.y) * size + Math.round(p.x);
        expect(p.level, `seed ${seed}`).toBeGreaterThan(heights[i]!);
      }
    }
  });

  it('body osy leží ve vodních políčkách', () => {
    for (const { seed, terrain } of terrains) {
      const { stream, water, size } = terrain;
      for (const p of stream) {
        expect(water[Math.round(p.y) * size + Math.round(p.x)], `seed ${seed}`).toBe(1);
      }
    }
  });

  it('koryto se nekříží ani se nedotýká samo sebe', () => {
    for (const { seed, terrain } of terrains) {
      const { stream } = terrain;
      const along: number[] = [0];
      for (let k = 1; k < stream.length; k++) {
        along.push(
          along[k - 1]! +
            Math.hypot(stream[k]!.x - stream[k - 1]!.x, stream[k]!.y - stream[k - 1]!.y),
        );
      }
      // Nejtěsnější přiblížení dvou úseků daleko od sebe podél toku (záporné = dotek).
      let worst = Infinity;
      for (let a = 0; a < stream.length; a += 2) {
        for (let b = a + 1; b < stream.length; b += 2) {
          const pa = stream[a]!;
          const pb = stream[b]!;
          const gap = halfWidth(pa) + halfWidth(pb) + 1.5;
          if (along[b]! - along[a]! < gap * 3) continue;
          worst = Math.min(worst, Math.hypot(pa.x - pb.x, pa.y - pb.y) - gap);
        }
      }
      expect(worst, `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('strmá vlásenka nevznikne – úseky s rozdílem hladin přes 1 m se k sobě nepřiblíží', () => {
    // I terény skutečných krajin 0–39 (seed terénu je odvozený).
    const landscapes = Array.from({ length: 40 }, (_, s) => {
      const seed = deriveSeed(s, 'terrain');
      return { seed, terrain: generateTerrain(seed, 1) };
    });
    for (const { seed, terrain } of [...terrains, ...landscapes]) {
      const { stream } = terrain;
      const along: number[] = [0];
      for (let k = 1; k < stream.length; k++) {
        along.push(
          along[k - 1]! +
            Math.hypot(stream[k]!.x - stream[k - 1]!.x, stream[k]!.y - stream[k - 1]!.y),
        );
      }
      let worst = Infinity;
      for (let a = 0; a < stream.length; a += 2) {
        for (let b = a + 1; b < stream.length; b += 2) {
          const pa = stream[a]!;
          const pb = stream[b]!;
          if (Math.abs(pa.level - pb.level) <= 1) continue;
          // Vlásenka: přímo blízko, podél toku daleko. Na rovném úseku platí jen přímá vzdálenost.
          const gap = Math.min(halfWidth(pa) + halfWidth(pb) + 3, 0.6 * (along[b]! - along[a]!));
          worst = Math.min(worst, Math.hypot(pa.x - pb.x, pa.y - pb.y) - gap);
        }
      }
      expect(worst, `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });
});

/** Průměrná |výška − průměr okolí 7 × 7| (m) – míra zvlnění terénu ve středních měřítkách. */
function undulationM(heights: Float32Array, size: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 4; y < size - 4; y++) {
    for (let x = 4; x < size - 4; x++) {
      let around = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) around += heights[(y + dy) * size + x + dx]!;
      }
      sum += Math.abs(heights[y * size + x]! - around / 49);
      count++;
    }
  }
  return sum / count;
}
