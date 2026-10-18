import { describe, it, expect } from 'vitest';
import { generateLandscape } from '../generate';
import { obstacleGroups, scatterContext } from '../obstacles/generate';
import { INITIAL_LAYER_VERSIONS, SURFACE_CODES } from '../types';
import { tileCenterWorld, tileOfWorldPoint } from '../world';
import { deadwoodPlacements, youngTreePlacements } from '../obstacles/woodland';

const landscape = generateLandscape(3);
const ctx = scatterContext(landscape, landscape.obstacleLayer!.seed);
const { field, stream, relief } = ctx;
const groups = obstacleGroups(ctx);
const meadowTrees = groups.meadow;

type Point = { x: number; z: number };
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
const fromBank = (p: Point): number => stream.nearest(p.x, p.z).bankDistance;
const fromForest = (p: Point): number => field.distanceAt(p.x, p.z);
const surfaceAt = (p: Point): number | undefined => {
  const tile = tileOfWorldPoint(landscape, p.x, p.z);
  return tile ? landscape.surface[tile.y * landscape.size + tile.x] : undefined;
};
const nearVillage = (p: Point): boolean => {
  const tile = tileOfWorldPoint(landscape, p.x, p.z)!;
  const site = landscape.villageSite;
  return Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= 2;
};

describe('pinePlacements', () => {
  const pines = groups.pines;

  it('borovice rostou na skalách a suchých hřbetech, ne v lese, ve vodě ani u vesnice', () => {
    expect(pines.length).toBeGreaterThan(10);
    for (const p of pines) {
      expect(p.look).toMatch(/^pine-[123]$/);
      const rocky = relief.rockinessAt(p.x, p.z) >= 0.35;
      const dryCrest = relief.convexityAt(p.x, p.z) > 0.5 && relief.sunwardAt(p.x, p.z) > 0.02;
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
  const young = groups.young;

  it('mladé stromky rostou ve skupinkách před okrajem lesa – louka zarůstá', () => {
    expect(young.length).toBeGreaterThan(50);
    for (const p of young) {
      expect(fromForest(p)).toBeGreaterThanOrEqual(-16);
      expect(fromForest(p)).toBeLessThan(-2);
      expect(fromBank(p)).toBeGreaterThan(3);
      expect(nearVillage(p)).toBe(false);
      // Mladé jedle, nebo listnáče okraje lesa zmenšené na pár metrů.
      if (!p.look.startsWith('fir-young')) expect(p.scale).toBeLessThanOrEqual(0.5);
      expect(p.kind).toBe('youngTree');
    }
    const grouped = young.filter((p) => young.some((q) => q !== p && distance(p, q) < 8));
    expect(grouped.length / young.length).toBeGreaterThan(0.5);
  });
});

describe('deadwoodPlacements', () => {
  const deadwood = groups.deadwood;
  const of = (prefix: string): typeof deadwood => deadwood.filter((p) => p.look.startsWith(prefix));

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
    // Na krajině z původních vrstev – u krajin s víc loukami (vegetace 2) je les od vsi dál,
    // a tak pařezů méně (průměrně 6 místo 16); pravidlo rozmístění je stejné.
    const initial = generateLandscape(3, INITIAL_LAYER_VERSIONS);
    const initialCtx = scatterContext(initial, initial.obstacleLayer!.seed);
    const stumps = deadwoodPlacements(initialCtx).filter((p) => p.look.startsWith('stump'));
    expect(stumps.length).toBeGreaterThan(10);
    expect(of('stump').length).toBeGreaterThan(0);
    const site = tileCenterWorld(initial, initial.villageSite.x, initial.villageSite.y);
    for (const p of [...stumps, ...of('stump')]) {
      const tile = tileOfWorldPoint(initial, p.x, p.z)!;
      expect(Math.hypot(p.x - site.x, p.z - site.z)).toBeLessThan(320);
      expect(
        Math.max(
          Math.abs(tile.x - initial.villageSite.x),
          Math.abs(tile.y - initial.villageSite.y),
        ),
      ).toBeGreaterThan(2);
    }
    for (const p of stumps) {
      expect(initialCtx.field.distanceAt(p.x, p.z)).toBeLessThan(0);
      expect(initialCtx.field.distanceAt(p.x, p.z)).toBeGreaterThan(-40);
      expect(initialCtx.stream.nearest(p.x, p.z).bankDistance).toBeGreaterThan(2);
    }
    for (const p of of('stump')) {
      expect(fromForest(p)).toBeLessThan(0);
      expect(fromForest(p)).toBeGreaterThan(-40);
      expect(nearVillage(p)).toBe(false);
      expect(fromBank(p)).toBeGreaterThan(2);
    }
  });

  it('souše, padlé stromy a pařezy mají vlastní druh překážky', () => {
    const kinds = { snag: 'snag', fallen: 'fallenTree', stump: 'stump' } as const;
    for (const p of deadwood) {
      const prefix = (Object.keys(kinds) as (keyof typeof kinds)[]).find((k) =>
        p.look.startsWith(k),
      )!;
      expect(p.kind).toBe(kinds[prefix]);
    }
  });

  it('rozmístění je deterministické', () => {
    expect(deadwoodPlacements(ctx)).toEqual(deadwood);
    expect(youngTreePlacements(ctx)).toEqual(groups.young);
  });
});
