import { describe, expect, it } from 'vitest';
import { MILIR_OFFSET_M, SHOWCASE_BUILDINGS } from '../building-showcase-layout';

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
});
