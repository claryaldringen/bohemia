import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { buildForestField } from '../forest-field';
import { meadowTreePlacements } from '../meadow-trees';
import { streamCenterline } from '../stream-geometry';
import { buildRelief } from '../terrain-relief';
import { tileAt, tileCenter } from '../tile-at';
import { deadwoodPlacements, pinePlacements, youngTreePlacements } from '../woodland-placement';

const landscape = generateLandscape(3);
const field = buildForestField(landscape);
const stream = streamCenterline(landscape);
const relief = buildRelief(landscape);
const meadowTrees = meadowTreePlacements(landscape, field, stream);

type Point = { worldX: number; worldZ: number };
const distance = (a: Point, b: Point): number =>
  Math.hypot(a.worldX - b.worldX, a.worldZ - b.worldZ);
const fromBank = (p: Point): number => stream.nearest(p.worldX, p.worldZ).bankDistance;
const fromForest = (p: Point): number => field.distanceAt(p.worldX, p.worldZ);
const surfaceAt = (p: Point): number | undefined => {
  const tile = tileAt(landscape, p.worldX, p.worldZ);
  return tile ? landscape.surface[tile.y * landscape.size + tile.x] : undefined;
};
const nearVillage = (p: Point): boolean => {
  const tile = tileAt(landscape, p.worldX, p.worldZ)!;
  const site = landscape.villageSite;
  return Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= 2;
};

describe('pinePlacements', () => {
  const pines = pinePlacements(landscape, field, stream, relief, meadowTrees);

  it('borovice rostou na skalách a suchých hřbetech, ne v lese, ve vodě ani u vesnice', () => {
    expect(pines.length).toBeGreaterThan(10);
    for (const p of pines) {
      expect(p.model).toMatch(/^pine-[123]$/);
      const rocky = relief.rockinessAt(p.worldX, p.worldZ) >= 0.35;
      const dryCrest =
        relief.convexityAt(p.worldX, p.worldZ) > 0.5 && relief.sunwardAt(p.worldX, p.worldZ) > 0.02;
      expect(rocky || dryCrest).toBe(true);
      expect(fromForest(p)).toBeLessThan(10);
      expect(fromBank(p)).toBeGreaterThan(4);
      expect(surfaceAt(p)).not.toBe(SURFACE_CODES.water);
      expect(nearVillage(p)).toBe(false);
    }
  });

  it('borovice nestojí v kmenech jiných stromů ani v sobě navzájem', () => {
    for (const p of pines) {
      for (const t of meadowTrees) expect(distance(p, t)).toBeGreaterThanOrEqual(6);
      for (const q of pines) if (q !== p) expect(distance(p, q)).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('youngTreePlacements', () => {
  const young = youngTreePlacements(landscape, field, stream);

  it('mladé stromky rostou ve skupinkách před okrajem lesa – louka zarůstá', () => {
    expect(young.length).toBeGreaterThan(50);
    for (const p of young) {
      expect(fromForest(p)).toBeGreaterThanOrEqual(-16);
      expect(fromForest(p)).toBeLessThan(-2);
      expect(fromBank(p)).toBeGreaterThan(3);
      expect(nearVillage(p)).toBe(false);
      // Mladé jedle, nebo listnáče okraje lesa zmenšené na pár metrů.
      if (!p.model.startsWith('fir-young')) expect(p.scale).toBeLessThanOrEqual(0.5);
    }
    const grouped = young.filter((p) => young.some((q) => q !== p && distance(p, q) < 8));
    expect(grouped.length / young.length).toBeGreaterThan(0.5);
  });
});

describe('deadwoodPlacements', () => {
  const deadwood = deadwoodPlacements(landscape, field, stream);
  const of = (prefix: string): typeof deadwood =>
    deadwood.filter((p) => p.model.startsWith(prefix));

  it('souše stojí hlavně na okraji lesa, ojediněle v louce', () => {
    const snags = of('snag');
    expect(snags.length).toBeGreaterThan(5);
    for (const p of snags) {
      expect(fromForest(p)).toBeGreaterThanOrEqual(-60);
      expect(fromForest(p)).toBeLessThan(14);
      expect(fromBank(p)).toBeGreaterThan(3);
    }
    const edge = snags.filter((p) => fromForest(p) >= -4).length;
    expect(edge / snags.length).toBeGreaterThan(0.7);
  });

  it('padlé stromy leží na okraji lesa, ne ve vodě', () => {
    const fallen = of('fallen');
    expect(fallen.length).toBeGreaterThan(5);
    for (const p of fallen) {
      expect(fromForest(p)).toBeGreaterThanOrEqual(-8);
      expect(fromForest(p)).toBeLessThan(12);
      expect(fromBank(p)).toBeGreaterThan(4);
    }
  });

  it('pařezy po kácení jsou u lesa nedaleko vesnice', () => {
    const stumps = of('stump');
    expect(stumps.length).toBeGreaterThan(10);
    const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
    for (const p of stumps) {
      expect(Math.hypot(p.worldX - site.worldX, p.worldZ - site.worldZ)).toBeLessThan(320);
      expect(fromForest(p)).toBeLessThan(0);
      expect(fromForest(p)).toBeGreaterThan(-40);
      expect(nearVillage(p)).toBe(false);
      expect(fromBank(p)).toBeGreaterThan(2);
    }
  });

  it('kmeny leží v klidné vodě u břehu a plavou na hladině', () => {
    const logs = of('log-water');
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const p of logs) {
      const near = stream.nearest(p.worldX, p.worldZ);
      expect(near.bankDistance).toBeLessThan(-0.5);
      expect(near.speed).toBeLessThan(0.5);
      expect(p.waterLevel).toBeCloseTo(near.level, 5);
    }
  });

  it('rozmístění je deterministické', () => {
    expect(deadwoodPlacements(landscape, field, stream)).toEqual(deadwood);
    expect(youngTreePlacements(landscape, field, stream)).toEqual(
      youngTreePlacements(landscape, field, stream),
    );
  });
});
