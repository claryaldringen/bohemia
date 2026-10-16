import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { streamCenterline } from '../stream-geometry';
import { tileCenter } from '../tile-at';

const landscape = generateLandscape(3);
const stream = streamCenterline(landscape);

describe('streamCenterline', () => {
  it('vede od okraje k okraji krajiny', () => {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const nearEdge = (p: { x: number; z: number }): boolean =>
      Math.max(Math.abs(p.x), Math.abs(p.z)) > half - landscape.cellSizeM;
    expect(nearEdge(stream.points[0]!)).toBe(true);
    expect(nearEdge(stream.points.at(-1)!)).toBe(true);
  });

  it('hladina podél osy nikde nestoupá (teče od prvního bodu dolů)', () => {
    for (let i = 1; i < stream.points.length; i++) {
      expect(stream.points[i]!.level).toBeLessThanOrEqual(stream.points[i - 1]!.level + 1e-6);
    }
  });

  it('osa prochází blízko každého vodního políčka (do šířky břehu + 1 políčka)', () => {
    for (let i = 0; i < landscape.surface.length; i++) {
      if (landscape.surface[i] !== SURFACE_CODES.water) continue;
      const tx = i % 128;
      const ty = Math.floor(i / 128);
      const nearestPoint = landscape.stream.reduce((best, p) =>
        Math.hypot(p.x - tx, p.y - ty) < Math.hypot(best.x - tx, best.y - ty) ? p : best,
      );
      const reach = Math.max(nearestPoint.halfWidthLeft, nearestPoint.halfWidthRight) + 1;
      const { worldX, worldZ } = tileCenter(landscape, tx, ty);
      expect(stream.nearest(worldX, worldZ).distance).toBeLessThanOrEqual(
        reach * landscape.cellSizeM,
      );
    }
  });

  it('daleko od potoka nic nenajde', () => {
    const far = stream.points[0]!;
    expect(stream.nearest(far.x + 900, far.z + 900, 40).distance).toBe(Infinity);
  });

  const cell = landscape.cellSizeM;
  const half = (landscape.size * cell) / 2;
  const world = (p: { x: number; y: number }): { x: number; z: number } => ({
    x: -half + (p.x + 0.5) * cell,
    z: -half + (p.y + 0.5) * cell,
  });
  /** Bod osy z dat krajiny, jednotkový směr toku a levá normála ve světě. */
  const frame = (
    k: number,
  ): { x: number; z: number; tx: number; tz: number; nx: number; nz: number } => {
    const a = world(landscape.stream[Math.max(0, k - 1)]!);
    const b = world(landscape.stream[Math.min(landscape.stream.length - 1, k + 1)]!);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / length;
    const tz = (b.z - a.z) / length;
    return { ...world(landscape.stream[k]!), tx, tz, nx: -tz, nz: tx };
  };
  const inner = landscape.stream.slice(20, -20).map((_, i) => i + 20);

  it('šířka vody na straně dotazu odpovídá levému a pravému břehu z dat krajiny', () => {
    for (const k of inner.filter((_, i) => i % 25 === 0)) {
      const p = landscape.stream[k]!;
      const f = frame(k);
      const left = stream.nearest(f.x + f.nx * 1.5, f.z + f.nz * 1.5);
      const right = stream.nearest(f.x - f.nx * 1.5, f.z - f.nz * 1.5);
      expect(left.halfWidth).toBeCloseTo(p.halfWidthLeft * cell, 0);
      expect(right.halfWidth).toBeCloseTo(p.halfWidthRight * cell, 0);
    }
  });

  it('vzdálenost od okraje vody: ve vodě záporná, na břehu kladná', () => {
    for (const k of inner.filter((_, i) => i % 25 === 0)) {
      const p = landscape.stream[k]!;
      const f = frame(k);
      expect(stream.nearest(f.x, f.z).bankDistance).toBeLessThan(0);
      const out = p.halfWidthLeft * cell + 5;
      const bank = stream.nearest(f.x + f.nx * out, f.z + f.nz * out).bankDistance;
      // V oblouku bývá sousední úsek osy o kus blíž – dolní mez o půl metru volnější.
      expect(bank).toBeGreaterThan(2.5);
      expect(bank).toBeLessThan(7);
    }
  });

  it('proud: v tůních pomalý, v mělčinách rychlý, směr toku míří po proudu', () => {
    const halfWidth = (k: number): number =>
      (landscape.stream[k]!.halfWidthLeft + landscape.stream[k]!.halfWidthRight) / 2;
    const pools = inner.filter((k) => halfWidth(k) >= 1.6);
    const shallows = inner.filter((k) => landscape.stream[k]!.shallow);
    expect(pools.length).toBeGreaterThan(0);
    expect(shallows.length).toBeGreaterThan(0);
    const speed = (k: number): number => stream.nearest(frame(k).x, frame(k).z).speed;
    const mean = (ks: number[]): number => ks.reduce((sum, k) => sum + speed(k), 0) / ks.length;
    expect(mean(pools)).toBeLessThan(0.3);
    expect(mean(shallows)).toBeGreaterThan(0.6);
    for (const k of inner.filter((_, i) => i % 10 === 0)) {
      const f = frame(k);
      const q = stream.nearest(f.x, f.z);
      expect(q.flowX * f.tx + q.flowZ * f.tz).toBeGreaterThan(0.9);
    }
  });

  it('vnitřní strana oblouku je kladná, vnější záporná', () => {
    // Nejostřejší oblouk: směr toku se nejvíc stočí na krátké vzdálenosti.
    let best = { k: -1, turn: 0 };
    for (const k of inner) {
      const a = frame(k - 6);
      const b = frame(k + 6);
      const turn = a.tx * b.tz - a.tz * b.tx; // kladné = stáčí se doleva
      if (Math.abs(turn) > Math.abs(best.turn)) best = { k, turn };
    }
    const f = frame(best.k);
    const side = Math.sign(best.turn); // levá strana je vnitřní, když se stáčí doleva
    const insideQuery = stream.nearest(f.x + f.nx * side * 2, f.z + f.nz * side * 2);
    const outsideQuery = stream.nearest(f.x - f.nx * side * 2, f.z - f.nz * side * 2);
    expect(insideQuery.innerBend).toBeGreaterThan(0.2);
    expect(outsideQuery.innerBend).toBeLessThan(-0.2);
  });
});
