import { describe, expect, it } from 'vitest';
import { instancesBounds, sameItems, sortByRank } from '../plant-order';

/** Pseudonáhoda se semínkem (testy bez Math.random). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('sortByRank', () => {
  it('= stabilní řazení podle rank (i stejné rank v pořadí vstupu)', () => {
    const next = random(7);
    for (const n of [0, 5, 63, 64, 1000, 20_000]) {
      // část hodnot se opakuje – stabilita
      const items = Array.from({ length: n }, (_, id) => ({
        id,
        rank: id % 7 === 0 ? Math.floor(next() * 50) / 50 : next(),
      }));
      const expected = [...items].sort((a, b) => a.rank - b.rank);
      expect(sortByRank(items)).toEqual(expected);
    }
  });

  it('rank mimo [0, 1) řadí obyčejně', () => {
    const items = [1.5, -1, 0.3, 0.3, 1].flatMap((rank, id) =>
      Array.from({ length: 20 }, (_, k) => ({ id: id * 100 + k, rank })),
    );
    expect(sortByRank(items)).toEqual([...items].sort((a, b) => a.rank - b.rank));
  });

  it('rank těsně pod 1 i přesně 0', () => {
    const items = Array.from({ length: 200 }, (_, id) => ({
      id,
      rank: id % 3 === 0 ? 1 - 2 ** -53 : id % 3 === 1 ? 0 : id / 400,
    }));
    expect(sortByRank(items)).toEqual([...items].sort((a, b) => a.rank - b.rank));
  });
});

describe('instancesBounds', () => {
  /** Jako Babylon: osm rohů obalu modelu každou maticí (TransformCoordinates), min a max. */
  function cornersBounds(
    m: Float32Array,
    count: number,
    min: [number, number, number],
    max: [number, number, number],
  ): number[] {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const o = i * 16;
      for (const x of [min[0], max[0]]) {
        for (const y of [min[1], max[1]]) {
          for (const z of [min[2], max[2]]) {
            for (let a = 0; a < 3; a++) {
              const w = 1 / (x * m[o + 3]! + y * m[o + 7]! + z * m[o + 11]! + m[o + 15]!);
              const v =
                (x * m[o + a]! + y * m[o + 4 + a]! + z * m[o + 8 + a]! + m[o + 12 + a]!) * w;
              lo[a] = Math.min(lo[a]!, v);
              hi[a] = Math.max(hi[a]!, v);
            }
          }
        }
      }
    }
    return [...lo, ...hi];
  }

  it('bit po bitu jako rohy obalu (natočení, měřítko, posun jako trsy polí)', () => {
    const next = random(11);
    const count = 5000;
    const m = new Float32Array(count * 16);
    for (let i = 0; i < count; i++) {
      const o = i * 16;
      const rotation = next() * Math.PI * 2;
      const width = 0.5 + next();
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      m[o] = c * width;
      m[o + 2] = -s * width;
      m[o + 5] = 0.3 + next();
      m[o + 8] = s * width;
      m[o + 10] = c * width;
      m[o + 12] = (next() - 0.5) * 2000;
      m[o + 13] = next() * 40 - 0.05;
      m[o + 14] = (next() - 0.5) * 2000;
      m[o + 15] = 1;
    }
    const min: [number, number, number] = [-0.31, -0.02, -0.27];
    const max: [number, number, number] = [0.33, 1.1, 0.29];
    expect(instancesBounds(m, count, min, max)).toEqual(cornersBounds(m, count, min, max));
    expect(instancesBounds(m, 10, min, max)).toEqual(cornersBounds(m, 10, min, max));
  });
});

describe('sameItems', () => {
  it('podle identity a pořadí', () => {
    const a = { rank: 0.1 };
    const b = { rank: 0.2 };
    expect(sameItems([a, b], [a, b])).toBe(true);
    expect(sameItems([a, b], [b, a])).toBe(false);
    expect(sameItems([a], [a, b])).toBe(false);
    expect(sameItems([a], [{ rank: 0.1 }])).toBe(false);
  });
});
