import { describe, it, expect } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import { decorPlacements } from '../decor-placement';
import { streamCenterline } from '../stream-geometry';

const landscape = generateLandscape(5);
const stream = streamCenterline(landscape);
const placements = decorPlacements(landscape, stream);
/** Vzdálenost od okraje vody (m): ve vodě záporná. */
const fromBank = (p: { worldX: number; worldZ: number }): number =>
  stream.nearest(p.worldX, p.worldZ).bankDistance;
const speedAt = (p: { worldX: number; worldZ: number }): number =>
  stream.nearest(p.worldX, p.worldZ).speed;
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
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

  it('jen ozdoby vody – keře, kameny a stromy jsou ve vrstvě překážek', () => {
    expect(new Set(placements.map((p) => p.model))).toEqual(
      new Set(['reeds', 'cattails', 'lilies', 'log-water']),
    );
  });

  it('rozmístění je deterministické', () => {
    expect(decorPlacements(landscape, stream)).toEqual(placements);
  });
});
