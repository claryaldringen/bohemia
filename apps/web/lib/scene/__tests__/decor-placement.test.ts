import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { decorPlacements } from '../decor-placement';
import { buildForestField } from '../forest-field';
import { streamCenterline } from '../stream-geometry';
import { tileAt } from '../tile-at';

const landscape = generateLandscape(5);
const stream = streamCenterline(landscape);
const field = buildForestField(landscape);
const placements = decorPlacements(landscape, stream, field);
/** Vzdálenost od okraje vody (m): ve vodě záporná. */
const fromBank = (p: { worldX: number; worldZ: number }): number =>
  stream.nearest(p.worldX, p.worldZ).bankDistance;
const speedAt = (p: { worldX: number; worldZ: number }): number =>
  stream.nearest(p.worldX, p.worldZ).speed;
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
/** Průměrná rychlost proudu podél celé osy (na mapě). */
const streamSpeed = mean(stream.points.slice(10, -10).map((p) => p.speed));
const of = (...models: string[]): typeof placements =>
  placements.filter((p) => models.includes(p.model));

describe('decorPlacements', () => {
  it('rákos a orobinec rostou na kraji vody, hustě v klidné vodě, řídce v proudu', () => {
    const reeds = of('reeds', 'cattails');
    expect(reeds.length).toBeGreaterThan(300);
    for (const p of reeds) {
      expect(fromBank(p)).toBeGreaterThanOrEqual(-2.5);
      expect(fromBank(p)).toBeLessThanOrEqual(3);
    }
    // Hustota na metr toku v pomalých úsecích vs. v rychlých.
    const length = (slow: boolean): number =>
      stream.points
        .slice(10, -10)
        .filter((p) => p.speed < 0.35 === slow)
        .reduce(
          (sum, p, k, list) =>
            sum + (k > 0 ? Math.hypot(p.x - list[k - 1]!.x, p.z - list[k - 1]!.z) : 0),
          0,
        );
    const slowReeds = reeds.filter((p) => speedAt(p) < 0.35).length;
    const fastReeds = reeds.filter((p) => speedAt(p) >= 0.35).length;
    expect(slowReeds / length(true)).toBeGreaterThan((2 * fastReeds) / length(false));
    // Orobinec má rád stojatou vodu – víc než rákos.
    expect(mean(of('cattails').map(speedAt))).toBeLessThan(mean(of('reeds').map(speedAt)));
  });

  it('lekníny plavou jen v tůních a klidné vodě, uvnitř koryta', () => {
    const lilies = of('lilies');
    expect(lilies.length).toBeGreaterThan(10);
    for (const p of lilies) {
      expect(fromBank(p)).toBeLessThan(-1.5);
      expect(speedAt(p)).toBeLessThan(0.35);
      expect(p.waterLevel).toBeCloseTo(stream.nearest(p.worldX, p.worldZ).level, 5);
    }
  });

  it('kameny neleží ve vodě, uvnitř lesa ani u místa pro vesnici', () => {
    const stones = of('boulder', 'stone-1', 'stone-2');
    expect(stones.length).toBeGreaterThan(50);
    const site = landscape.villageSite;
    for (const p of stones) {
      expect(fromBank(p)).toBeGreaterThan(1);
      expect(field.distanceAt(p.worldX, p.worldZ)).toBeLessThan(8);
      expect(p.waterLevel).toBeUndefined();
      const tile = tileAt(landscape, p.worldX, p.worldZ)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).not.toBe(SURFACE_CODES.water);
      expect(Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y))).toBeGreaterThan(2);
    }
  });

  it('vrby rostou ve skupinách na břehu u tůní a klidné vody, ne v lese ani u vesnice', () => {
    const willows = of('willow');
    expect(willows.length).toBeGreaterThan(15);
    expect(mean(willows.map(speedAt))).toBeLessThan(streamSpeed);
    const site = landscape.villageSite;
    for (const p of willows) {
      expect(fromBank(p)).toBeGreaterThanOrEqual(3);
      expect(fromBank(p)).toBeLessThanOrEqual(10);
      expect(field.distanceAt(p.worldX, p.worldZ)).toBeLessThan(-2);
      const tile = tileAt(landscape, p.worldX, p.worldZ)!;
      expect(Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y))).toBeGreaterThan(2);
    }
  });

  it('na okraji lesa je keřový lem – nejhustší u hranice lesa, do louky řídne', () => {
    const shrubs = of('underbrush-1', 'underbrush-2', 'shrub-1', 'shrub-2', 'shrub-3');
    const site = landscape.villageSite;
    for (const p of shrubs) {
      const d = field.distanceAt(p.worldX, p.worldZ);
      expect(d).toBeLessThan(8);
      expect(d).toBeGreaterThanOrEqual(-35);
      expect(fromBank(p)).toBeGreaterThan(2);
      const tile = tileAt(landscape, p.worldX, p.worldZ)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).not.toBe(SURFACE_CODES.water);
      if (landscape.surface[tile.y * landscape.size + tile.x] !== SURFACE_CODES.forest) {
        expect(Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y))).toBeGreaterThan(2);
      }
    }
    const band = (from: number, to: number): number =>
      shrubs.filter((p) => {
        const d = field.distanceAt(p.worldX, p.worldZ);
        return d >= from && d < to;
      }).length;
    expect(band(-6, 8)).toBeGreaterThan(1000);
    expect(band(-6, 8)).toBeGreaterThan(2 * band(-12, -6));
    expect(band(-12, -6)).toBeGreaterThan(band(-35, -12));
    expect(band(-35, -12)).toBeGreaterThan(5);
  });

  it('rozmístění je deterministické', () => {
    expect(decorPlacements(landscape, stream, field)).toEqual(placements);
  });
});
