import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import type { MapSide, SkeletonRiverPort, SkeletonSlice } from '../../../landscape/skeleton/types';
import { skeletonKey } from '../../../landscape/skeleton/types';
import { createSkeletonCache, riverPortAt, sideTowards, skeletonSlice } from '..';

const SEED = 7;
const OPPOSITE: Record<MapSide, MapSide> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** Výřezy okna `size` × `size` (x, y od 0) – od severu k jihu, se sdílenou mezipamětí. */
function windowSlices(seed: number, size: number): (SkeletonSlice | null)[][] {
  const cache = createSkeletonCache(seed);
  const rows: (SkeletonSlice | null)[][] = [];
  for (let y = size - 1; y >= 0; y--) {
    const row: (SkeletonSlice | null)[] = [];
    for (let x = 0; x < size; x++) row.push(skeletonSlice(seed, { x, y }, cache));
    rows[y] = row;
  }
  return rows;
}

function portOn(slice: SkeletonSlice | null, side: MapSide): SkeletonRiverPort | undefined {
  return slice?.rivers.find((p) => p.side === side);
}

describe('skeletonSlice – řeky', () => {
  const size = 64;
  const slices = windowSlices(SEED, size);
  const sliceAt = (x: number, y: number) => slices[y]?.[x] ?? null;

  it('na společné hraně výtok jedné mapy = vtok druhé (protější strana, stejné at a šířka)', () => {
    let edges = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (x + dx >= size || y + dy >= size) continue;
          const a = { x, y };
          const b = { x: x + dx, y: y + dy };
          const side = sideTowards(a, b);
          const fromA = portOn(sliceAt(a.x, a.y), side);
          const fromB = portOn(sliceAt(b.x, b.y), OPPOSITE[side]);
          expect(fromA === undefined).toBe(fromB === undefined);
          if (fromA === undefined || fromB === undefined) continue;
          edges++;
          expect(fromA.flow).not.toBe(fromB.flow);
          expect(fromA.at).toBe(fromB.at);
          expect(fromA.widthM).toBe(fromB.widthM);
          expect(fromA.at).toBe(riverPortAt(SEED, b, a));
        }
      }
    }
    expect(edges).toBeGreaterThan(100);
  });

  it('bod řeky vždy 24–103, porty seřazené N, E, S, W', () => {
    const order: MapSide[] = ['N', 'E', 'S', 'W'];
    for (const row of slices) {
      for (const slice of row) {
        if (slice === null || slice.rivers.length === 0) continue;
        expect(slice.world).toBe(1);
        expect(slice.rivers.length).toBeGreaterThan(0);
        for (const port of slice.rivers) {
          expect(port.at).toBeGreaterThanOrEqual(24);
          expect(port.at).toBeLessThanOrEqual(103);
        }
        const sides = slice.rivers.map((p) => order.indexOf(p.side));
        expect(sides).toEqual([...sides].sort((p, q) => p - q));
      }
    }
  });

  it('výtok nejvýš jeden, vtoků nejvýš tři, výtok aspoň tak široký jako každý vtok', () => {
    for (const row of slices) {
      for (const slice of row) {
        if (slice === null || slice.rivers.length === 0) continue;
        const outs = slice.rivers.filter((p) => p.flow === 'out');
        const ins = slice.rivers.filter((p) => p.flow === 'in');
        expect(outs.length).toBe(1);
        expect(ins.length).toBeLessThanOrEqual(3);
        for (const inflow of ins) {
          expect(outs[0]?.widthM).toBeGreaterThanOrEqual(inflow.widthM);
        }
      }
    }
  });

  it('výřez sám = výřez po 4000 jiných dotazech v náhodném pořadí se sdílenou mezipamětí', () => {
    const probes = [
      { x: 0, y: 0 },
      { x: 17, y: -40 },
      { x: -300, y: 250 },
    ];
    // políčka s řekou z okna – aby test hlídal i neprázdné výřezy
    for (let y = 0; y < size && probes.length < 13; y += 7) {
      for (let x = 0; x < size && probes.length < 13; x++) {
        if (sliceAt(x, y) !== null) probes.push({ x, y });
      }
    }
    const random = createRandom(11);
    const shared = createSkeletonCache(SEED);
    for (let i = 0; i < 4000; i++) {
      const cell = {
        x: Math.floor(random.next() * 400) - 200,
        y: Math.floor(random.next() * 400) - 200,
      };
      skeletonSlice(SEED, cell, shared);
    }
    for (const probe of probes) {
      const alone = skeletonSlice(SEED, probe, createSkeletonCache(SEED));
      expect(skeletonSlice(SEED, probe, shared)).toEqual(alone);
      expect(skeletonSlice(SEED, probe)).toEqual(alone);
    }
    expect(probes.length).toBe(13);
  });

  it('mezipaměť jiného seedu světa odmítne', () => {
    expect(() => skeletonSlice(8, { x: 0, y: 0 }, createSkeletonCache(7))).toThrow(RangeError);
  });

  it('skeletonKey – suchá mapa prázdná, stejný výřez stejný klíč i v jiném pořadí bodů', () => {
    expect(skeletonKey(null)).toBe('');
    const slice: SkeletonSlice = {
      world: 1,
      rivers: [
        { side: 'N', at: 40, widthM: 25, flow: 'in' },
        { side: 'S', at: 80, widthM: 30, flow: 'out' },
      ],
      trails: [],
    };
    const reversed: SkeletonSlice = { ...slice, rivers: [...slice.rivers].reverse() };
    expect(skeletonKey(reversed)).toBe(skeletonKey(slice));
    expect(skeletonKey(slice)).toBe('w1;rN40:25<,S80:30>;t');
  });
});

describe('hustota řek', () => {
  it('v okně 200 × 200 teče řeka 8–14 % map (seedy 1–3)', () => {
    for (const seed of [1, 2, 3]) {
      const slices = windowSlices(seed, 200);
      const withRiver = slices.flat().filter((s) => s !== null && s.rivers.length > 0).length;
      const share = withRiver / (200 * 200);
      expect(share).toBeGreaterThanOrEqual(0.08);
      expect(share).toBeLessThanOrEqual(0.14);
    }
  });
});
