import { describe, expect, it } from 'vitest';
import {
  MILIR_OFFSET_M,
  SHOWCASE_BUILDINGS,
  SHOWCASE_GROUNDS,
  SHOWCASE_PEN,
  showcasePloughField,
} from '../building-showcase-layout';

describe('SHOWCASE_BUILDINGS', () => {
  it('milíř stojí „kus od“ uhlířovy zemnice – 8 až 12 m', () => {
    const uhlir = SHOWCASE_BUILDINGS.find((b) => b.id === 'uhlir')!;
    const [hut, milir] = uhlir.models;
    expect(Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z)).toBeGreaterThanOrEqual(8);
    expect(Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z)).toBeLessThanOrEqual(12);
    expect(Math.hypot(milir!.x - hut!.x, milir!.z - hut!.z)).toBeCloseTo(
      Math.hypot(MILIR_OFFSET_M.x, MILIR_OFFSET_M.z),
    );
  });

  it('stavby se nepřekrývají (dílny ≈ 7 × 9 m, milíř s okolím ≈ 6 m)', () => {
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const a = models[i]!;
        const b = models[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(9);
      }
    }
  });

  it('pozemky polozemnic (15 × 15 m) se nepřekrývají a nezasahují do ostatních staveb', () => {
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    const plots = models.flatMap((m) => (m.plot ? [m.plot] : []));
    expect(plots.length).toBe(6);
    expect(new Set(plots.map((p) => p.variant)).size).toBe(5);
    for (const p of plots) {
      for (const q of plots) {
        if (p === q) continue;
        const apart = Math.abs(p.x - q.x) >= 15 || Math.abs(p.z - q.z) >= 15;
        expect(apart).toBe(true);
      }
      for (const m of models) {
        if (m.plot) continue;
        // ostatní stavby i se staveništěm (≈ 5 m od středu) leží mimo políčko pozemku
        const outside = Math.abs(m.x - p.x) > 7.5 + 4.5 || Math.abs(m.z - p.z) > 7.5 + 4.5;
        expect(outside, m.kind).toBe(true);
      }
    }
  });

  it('ohrada (15 × 15 m) nezasahuje do staveb, pozemků ani čtverců za nimi; branka míří k nejbližšímu obydlí', () => {
    const pen = SHOWCASE_PEN.square;
    const models = SHOWCASE_BUILDINGS.flatMap((b) => b.models);
    for (const m of models) {
      const room = m.plot ? 15 : 7.5 + 5;
      const [x, z] = m.plot ? [m.plot.x, m.plot.z] : [m.x, m.z];
      const apart = Math.abs(x - pen.x) >= room || Math.abs(z - pen.z) >= room;
      expect(apart, m.kind).toBe(true);
    }
    for (const ground of SHOWCASE_GROUNDS) {
      for (const square of ground.squares) {
        // čtverce i s okrajem 2 m (spřežení se na souvratích otáčí za okrajem pole)
        const apart = Math.abs(square.x - pen.x) >= 15 + 2 || Math.abs(square.z - pen.z) >= 15 + 2;
        expect(apart, ground.id).toBe(true);
      }
    }
    const field = showcasePloughField();
    expect(Math.abs(field.x - pen.x) >= 15 + 10 || Math.abs(field.z - pen.z) >= 15 + 10).toBe(true);
    const dwellings = models.filter((m) => m.kind === 'zemnice' || m.kind === 'polozemnice');
    const nearest = dwellings.reduce((best, m) =>
      Math.hypot(m.x - pen.x, m.z - pen.z) < Math.hypot(best.x - pen.x, best.z - pen.z) ? m : best,
    );
    expect(nearest.x).toBe(SHOWCASE_PEN.toward.x);
    expect(nearest.z).toBe(SHOWCASE_PEN.toward.z);
  });
});
