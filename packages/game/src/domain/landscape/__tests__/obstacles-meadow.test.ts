import { describe, it, expect } from 'vitest';
import { generateLandscape } from '../generate';
import { obstacleGroups, scatterContext } from '../obstacles/generate';
import { SURFACE_CODES } from '../types';
import { tileOfWorldPoint } from '../world';
import { meadowTreePlacements } from '../obstacles/meadow-trees';

const landscape = generateLandscape(5);
const ctx = scatterContext(landscape, landscape.obstacleLayer!.seed);
const { field, stream } = ctx;
const placements = obstacleGroups(ctx).meadow;

const fromBank = (p: { x: number; z: number }): number => stream.nearest(p.x, p.z).bankDistance;
const nearestNeighbour = (p: { x: number; z: number }): number =>
  Math.min(...placements.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
/** Stromy dál od potoka – osamělé stromy a skupinky v loukách. */
const meadow = placements.filter((p) => fromBank(p) > 25);
/** Břehový porost. */
const bank = placements.filter((p) => fromBank(p) <= 16);

describe('meadowTreePlacements', () => {
  it('stromy rostou jen v loukách – ne ve vodě, v korytě, v lese, u lesa ani u vesnice', () => {
    const site = landscape.villageSite;
    for (const p of placements) {
      const tile = tileOfWorldPoint(landscape, p.x, p.z)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).toBe(SURFACE_CODES.meadow);
      expect(field.distanceAt(p.x, p.z)).toBeLessThan(-4);
      expect(fromBank(p)).toBeGreaterThanOrEqual(3.5);
      expect(Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y))).toBeGreaterThan(2);
    }
  });

  it('louky mají osamělé stromy a skupinky, ale i rozlehlé volné plochy', () => {
    expect(meadow.length).toBeGreaterThan(60);
    const grouped = meadow.filter((p) => nearestNeighbour(p) < 16).length / meadow.length;
    expect(grouped).toBeGreaterThan(0.25);
    expect(grouped).toBeLessThan(0.85);

    // Čtverce 150 m uprostřed luk (daleko od lesa i potoka): část bez jediného stromu. Takových
    // čtverců má krajina jen kolem tuctu – počítá se přes tři krajiny.
    const cellM = 150;
    let open = 0;
    let all = 0;
    for (const seed of [5, 8, 13]) {
      const l = generateLandscape(seed);
      const c = seed === 5 ? ctx : scatterContext(l, l.obstacleLayer!.seed);
      const trees = seed === 5 ? placements : meadowTreePlacements(c);
      const half = (l.size * l.cellSizeM) / 2;
      for (let x = -half + cellM / 2; x < half; x += cellM) {
        for (let z = -half + cellM / 2; z < half; z += cellM) {
          if (c.field.distanceAt(x, z) > -60 || c.stream.nearest(x, z).bankDistance < 60) continue;
          all++;
          const inside = trees.some(
            (p) => Math.abs(p.x - x) < cellM / 2 && Math.abs(p.z - z) < cellM / 2,
          );
          if (!inside) open++;
        }
      }
    }
    expect(all).toBeGreaterThan(30);
    expect(open / all).toBeGreaterThan(0.3);
    expect(open / all).toBeLessThan(0.9);
  });

  it('koruny stromů se nepřekrývají do jedné hmoty', () => {
    for (const p of placements) expect(nearestNeighbour(p)).toBeGreaterThanOrEqual(7);
  });

  it('v loukách převažují mohutné duby, topoly rostou jen u potoka', () => {
    const oaks = meadow.filter((p) => p.look.startsWith('oak-large')).length;
    expect(oaks / meadow.length).toBeGreaterThan(0.5);
    for (const p of placements.filter((q) => q.look.startsWith('poplar'))) {
      expect(fromBank(p)).toBeLessThanOrEqual(25);
    }
  });

  it('potok lemuje břehový porost s mezerami', () => {
    expect(bank.length).toBeGreaterThan(40);
    // Místa na ose potoka po 20 m v loukách: u části z nich stojí strom, u části ne.
    let covered = 0;
    let all = 0;
    let travelled = 0;
    let next = 0;
    const points = stream.points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      travelled += Math.hypot(b.x - a.x, b.z - a.z);
      if (travelled < next) continue;
      next = travelled + 20;
      if (!tileOfWorldPoint(landscape, b.x, b.z) || field.distanceAt(b.x, b.z) > -20) continue;
      all++;
      if (bank.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < 22)) covered++;
    }
    expect(all).toBeGreaterThan(30);
    expect(covered / all).toBeGreaterThan(0.3);
    expect(covered / all).toBeLessThan(0.85);
  });

  it('stejná krajina = stejné stromy, dospělé a kreslené 3D', () => {
    expect(meadowTreePlacements(ctx)).toEqual(placements);
    for (const p of placements) expect(p.kind).toBe('tree');
  });
});
