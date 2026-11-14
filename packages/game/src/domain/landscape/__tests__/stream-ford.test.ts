import { describe, expect, it } from 'vitest';
import { generateLandscape } from '../generate';
import { FORD_PROMONTORY_GAP, withStreamFord } from '../stream-ford';
import type { Promontory, StreamPoint } from '../types';

// Brod na každé mapě s potokem (landscape.md – Brod na každé mapě s potokem, 14. 11. 2026).

/** Rovný potok napříč mapou v řádku y = 64, body po půl políčku, bez mělčiny. */
function straightStream(halfWidth: (x: number) => number = () => 0.5): StreamPoint[] {
  const points: StreamPoint[] = [];
  for (let x = 0; x <= 127; x += 0.5) {
    const w = halfWidth(x);
    points.push({ x, y: 64, halfWidthLeft: w, halfWidthRight: w, level: 1, shallow: false });
  }
  return points;
}

const shallowXs = (stream: readonly StreamPoint[]): number[] =>
  stream.filter((p) => p.shallow).map((p) => p.x);

const square = (x0: number, y0: number, x1: number, y1: number): Promontory => ({
  kind: 'meander',
  outline: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  neck: [
    { x: x0, y: y1 },
    { x: x1, y: y1 },
  ],
  center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
  heightM: 8,
  areaHa: 1,
});

describe('withStreamFord – potok bez mělčiny dostane brod', () => {
  it('mělčina kolem bodu osy nejblíž středu mapy, ± 3 políčka podél toku, šířky beze změny', () => {
    const stream = straightStream();
    const out = withStreamFord(stream, 128);
    const xs = shallowXs(out);
    expect(xs[0]).toBe(60.5);
    expect(xs.at(-1)).toBe(66.5);
    expect(xs).toHaveLength(13);
    out.forEach((p, k) => {
      expect(p.halfWidthLeft).toBe(stream[k]!.halfWidthLeft);
      expect(p.x).toBe(stream[k]!.x);
    });
    // vstup se nemění
    expect(shallowXs(stream)).toEqual([]);
  });

  it('tůň (průměrná poloviční šířka od 1,35 políčka) brodem není', () => {
    const out = withStreamFord(
      straightStream((x) => (x >= 62 && x <= 65 ? 1.5 : 0.5)),
      128,
    );
    expect(shallowXs(out)).toEqual([58.5, 59, 59.5, 60, 60.5, 61, 61.5]);
  });

  it('u ostrožny (smyčka a šíje) brod není – bod osy aspoň FORD_PROMONTORY_GAP od obrysu', () => {
    const out = withStreamFord(straightStream(), 128, [square(62, 58, 66, 62)]);
    const xs = shallowXs(out);
    expect(xs.at(-1)).toBe(58.5);
    expect(xs[0]).toBe(55.5);
    for (const x of xs)
      expect(Math.hypot(62 - x, 62 - 64)).toBeGreaterThanOrEqual(FORD_PROMONTORY_GAP);
  });

  it('potok s mělčinou a mapa bez potoka zůstanou beze změny (tentýž objekt)', () => {
    const stream = straightStream();
    stream[100] = { ...stream[100]!, shallow: true };
    expect(withStreamFord(stream, 128)).toBe(stream);
    const empty: StreamPoint[] = [];
    expect(withStreamFord(empty, 128)).toBe(empty);
  });
});

describe('brod na každé mapě s potokem – vygenerované krajiny', () => {
  it.each([
    // přirozená pevnost a soutok, které mělčinu potoka dnes nemají (smyčka, konec u řeky)
    [7919, 'natural-fortress'],
    [142542, 'natural-fortress'],
    [47514, 'confluence'],
    [79190, 'confluence'],
  ] as const)('seed %i (%s): potok má mělčinu mimo ostrožnu', (seed, premium) => {
    const l = generateLandscape(seed, undefined, premium);
    const shallow = l.stream.filter((p) => p.shallow);
    expect(shallow.length).toBeGreaterThan(0);
    for (const p of shallow) {
      for (const promontory of l.promontories ?? []) {
        for (const q of promontory.outline) {
          expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(FORD_PROMONTORY_GAP);
        }
      }
    }
  });
});
