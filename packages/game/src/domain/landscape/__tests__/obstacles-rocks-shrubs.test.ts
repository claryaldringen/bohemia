import { describe, it, expect } from 'vitest';
import { generateLandscape } from '../generate';
import { obstacleGroups, scatterContext } from '../obstacles/generate';
import { rockAndShrubPlacements } from '../obstacles/rocks-shrubs';
import type { ObstaclePlacement } from '../obstacles/types';
import { SURFACE_CODES } from '../types';
import { tileOfWorldPoint } from '../world';

const landscape = generateLandscape(5);
const ctx = scatterContext(landscape, landscape.obstacleLayer!.seed);
const { field, stream, relief } = ctx;
const groups = obstacleGroups(ctx);
const meadowTrees = [...groups.meadow, ...groups.pines];
const placements = groups.rocksAndShrubs;
/** Vzdálenost od okraje vody (m): ve vodě záporná. */
const fromBank = (p: { x: number; z: number }): number => stream.nearest(p.x, p.z).bankDistance;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
const of = (...looks: string[]): ObstaclePlacement[] =>
  placements.filter((p) => looks.includes(p.look));
const surfaceOf = (p: { x: number; z: number }): number => {
  const tile = tileOfWorldPoint(landscape, p.x, p.z)!;
  return landscape.surface[tile.y * landscape.size + tile.x]!;
};
const nearVillage = (p: { x: number; z: number }): boolean => {
  const tile = tileOfWorldPoint(landscape, p.x, p.z)!;
  const site = landscape.villageSite;
  return Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= 2;
};

describe('rockAndShrubPlacements', () => {
  it('kameny neleží ve vodě, uvnitř lesa ani u místa pro vesnici', () => {
    const stones = of('boulder', 'stone-1', 'stone-2');
    expect(stones.length).toBeGreaterThan(50);
    for (const p of stones) {
      expect(fromBank(p)).toBeGreaterThan(1);
      expect(field.distanceAt(p.x, p.z)).toBeLessThan(8);
      expect(surfaceOf(p)).not.toBe(SURFACE_CODES.water);
      expect(nearVillage(p)).toBe(false);
      expect(p.kind).toBe(p.look === 'boulder' ? 'boulder' : 'stone');
    }
  });

  it('vrby rostou ve skupinách na břehu u tůní a klidné vody, ne v lese ani u vesnice', () => {
    const willows = of('willow');
    expect(willows.length).toBeGreaterThan(15);
    // Vrb je v krajině pár desítek – přednost klidné vody se měří přes tři krajiny.
    let willowSpeed = 0;
    let willowCount = 0;
    let riverSpeed = 0;
    for (const seed of [5, 8, 13]) {
      const l = generateLandscape(seed);
      const c = seed === 5 ? ctx : scatterContext(l, l.obstacleLayer!.seed);
      const trees =
        seed === 5 ? placements : rockAndShrubPlacements(c, []).filter((p) => p.look === 'willow');
      for (const p of trees.filter((q) => q.look === 'willow')) {
        willowSpeed += c.stream.nearest(p.x, p.z).speed;
        willowCount++;
      }
      riverSpeed += mean(c.stream.points.slice(10, -10).map((p) => p.speed)) / 3;
    }
    expect(willowSpeed / willowCount).toBeLessThan(riverSpeed);
    for (const p of willows) {
      expect(fromBank(p)).toBeGreaterThanOrEqual(3);
      expect(fromBank(p)).toBeLessThanOrEqual(10);
      expect(field.distanceAt(p.x, p.z)).toBeLessThan(-2);
      expect(nearVillage(p)).toBe(false);
      expect(p.kind).toBe('tree');
    }
  });

  it('na okraji lesa je keřový lem – nejhustší u hranice lesa, do louky řídne', () => {
    const shrubs = of('underbrush-1', 'underbrush-2', 'shrub-1', 'shrub-2', 'shrub-3');
    for (const p of shrubs) {
      const d = field.distanceAt(p.x, p.z);
      expect(d).toBeLessThan(8);
      expect(d).toBeGreaterThanOrEqual(-35);
      expect(fromBank(p)).toBeGreaterThan(2);
      expect(surfaceOf(p)).not.toBe(SURFACE_CODES.water);
      if (surfaceOf(p) !== SURFACE_CODES.forest) expect(nearVillage(p)).toBe(false);
      expect(p.kind).toBe('shrub');
    }
    const band = (from: number, to: number): number =>
      shrubs.filter((p) => {
        const d = field.distanceAt(p.x, p.z);
        return d >= from && d < to;
      }).length;
    expect(band(-6, 8)).toBeGreaterThan(1000);
    expect(band(-6, 8)).toBeGreaterThan(2 * band(-12, -6));
    expect(band(-12, -6)).toBeGreaterThan(band(-35, -12));
    expect(band(-35, -12)).toBeGreaterThan(5);
  });

  it('skalní výchozy vystupují jen na prudkých svazích a hřbetech, ne u vody', () => {
    const outcrops = of('rock-boulder', 'rock-ridge', 'rock-tower');
    expect(outcrops.length).toBeGreaterThan(15);
    for (const p of outcrops) {
      expect(relief.rockinessAt(p.x, p.z)).toBeGreaterThanOrEqual(0.45);
      expect(fromBank(p)).toBeGreaterThan(4);
      expect(p.kind).toBe('outcrop');
    }
  });

  it('skály nestojí v kmenech stromů', () => {
    for (const p of of('rock-boulder', 'rock-ridge', 'rock-tower', 'rock-moss-1', 'rock-moss-2')) {
      for (const t of meadowTrees) expect(distance(p, t)).toBeGreaterThanOrEqual(3);
    }
  });

  it('kolem výchozů leží menší mechem porostlé balvany', () => {
    const outcrops = of('rock-boulder', 'rock-ridge', 'rock-tower');
    const moss = of('rock-moss-1', 'rock-moss-2');
    expect(moss.length).toBeGreaterThan(outcrops.length / 2);
    for (const p of moss) {
      const nearest = Math.min(...outcrops.map((o) => distance(o, p)));
      expect(nearest).toBeLessThan(10);
      expect(p.kind).toBe('boulder');
    }
  });

  it('keře rostou i v loukách – kolem části osamělých stromů a v ostrůvcích', () => {
    const shrubs = of('shrub-4', 'shrub-5', 'shrub-6', 'shrub-7');
    const deepMeadow = shrubs.filter((p) => field.distanceAt(p.x, p.z) < -40);
    expect(deepMeadow.length).toBeGreaterThan(30);
    const withShrubs =
      meadowTrees.filter((t) => shrubs.some((s) => distance(s, t) < 12)).length /
      meadowTrees.length;
    expect(withShrubs).toBeGreaterThan(0.2);
    expect(withShrubs).toBeLessThan(0.75);
    // Ostrůvky keřů i daleko od stromů.
    const islands = deepMeadow.filter((s) => meadowTrees.every((t) => distance(s, t) > 15));
    expect(islands.length).toBeGreaterThan(10);
  });

  it('keře v loukách nerostou z kmenů stromů, ve vodě ani u vesnice', () => {
    for (const p of of('shrub-4', 'shrub-5', 'shrub-6', 'shrub-7')) {
      for (const t of meadowTrees) expect(distance(p, t)).toBeGreaterThanOrEqual(2.5);
      expect(fromBank(p)).toBeGreaterThan(2);
      expect(nearVillage(p)).toBe(false);
    }
  });

  it('rozmístění je deterministické', () => {
    expect(rockAndShrubPlacements(ctx, meadowTrees)).toEqual(placements);
  });
});
