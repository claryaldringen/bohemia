import { describe, it, expect } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import { decodeLandscape, encodeLandscape } from '../landscape-transfer';

describe('přenos krajiny ze serveru do prohlížeče', () => {
  const landscape = generateLandscape(1);

  it('encode → decode zachová povrch a úrodnost přesně a výšky s chybou ≤ 0,005 m', () => {
    const decoded = decodeLandscape(encodeLandscape(landscape));
    expect(decoded.size).toBe(landscape.size);
    expect(decoded.cellSizeM).toBe(landscape.cellSizeM);
    expect(decoded.villageSite).toEqual(landscape.villageSite);
    expect(decoded.surface).toEqual(landscape.surface);
    expect(decoded.fertility).toEqual(landscape.fertility);
    let worst = 0;
    for (let i = 0; i < landscape.heights.length; i++) {
      worst = Math.max(worst, Math.abs(decoded.heights[i]! - landscape.heights[i]!));
    }
    // Půl centimetru ze zaokrouhlení plus nepřesnost Float32 (výšky do ~40 m → ~4e-6 m).
    expect(worst).toBeLessThanOrEqual(0.005 + 1e-5);
  });

  it('přenese osu potoka – polohu, šířky břehů, hladinu a mělčiny', () => {
    const decoded = decodeLandscape(encodeLandscape(landscape));
    expect(decoded.stream).toHaveLength(landscape.stream.length);
    landscape.stream.forEach((p, k) => {
      const q = decoded.stream[k]!;
      expect(q.x).toBeCloseTo(p.x, 4);
      expect(q.y).toBeCloseTo(p.y, 4);
      expect(q.halfWidthLeft).toBeCloseTo(p.halfWidthLeft, 4);
      expect(q.halfWidthRight).toBeCloseTo(p.halfWidthRight, 4);
      expect(q.level).toBeCloseTo(p.level, 4);
      expect(q.shallow).toBe(p.shallow);
    });
  });

  it('zakódovaná krajina má po JSON.stringify méně než 150 kB', () => {
    expect(JSON.stringify(encodeLandscape(landscape)).length).toBeLessThan(150_000);
  });
});
