import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { buildForestField } from '../forest-field';
import { streamCenterline } from '../stream-geometry';
import { tileAt } from '../tile-at';
import { edgeDensity, treePlacements } from '../tree-placement';

const landscape = generateLandscape(5);
const field = buildForestField(landscape);
const stream = streamCenterline(landscape);

describe('treePlacements', () => {
  const placements = treePlacements(landscape, field, stream);
  const distance = (t: { worldX: number; worldZ: number }): number =>
    field.distanceAt(t.worldX, t.worldZ);

  it('stromy stojí jen u hranice lesa – do 18 m do lesa (dál impostory) a kousek do louky', () => {
    for (const tree of placements) {
      expect(distance(tree)).toBeLessThan(18);
      expect(distance(tree)).toBeGreaterThanOrEqual(-30);
    }
  });

  it('nic neroste ve vodě ani v korytě potoka', () => {
    for (const tree of placements) {
      const tile = tileAt(landscape, tree.worldX, tree.worldZ)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).not.toBe(SURFACE_CODES.water);
      expect(stream.nearest(tree.worldX, tree.worldZ).bankDistance).toBeGreaterThan(2);
    }
  });

  it('u místa pro vesnici nerostou stromy ani keře mimo les', () => {
    const site = landscape.villageSite;
    for (const tree of placements) {
      const tile = tileAt(landscape, tree.worldX, tree.worldZ)!;
      if (landscape.surface[tile.y * landscape.size + tile.x] === SURFACE_CODES.forest) continue;
      expect(Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y))).toBeGreaterThan(2);
    }
  });

  it('okraj lesa je hustý, před ním řidší lem a v louce jen ojedinělé stromy', () => {
    const edge = placements.filter((t) => distance(t) >= 0).length;
    const fringe = placements.filter((t) => distance(t) < 0 && distance(t) >= -6).length;
    const stragglers = placements.filter((t) => distance(t) < -6).length;
    expect(edge).toBeGreaterThan(3 * fringe);
    expect(fringe).toBeGreaterThan(stragglers);
    expect(stragglers).toBeGreaterThan(10);
  });

  it('okraj lesa tvoří 2–3 husté řady 3D stromů (do 18 m od hranice)', () => {
    const n = field.resolution;
    const step = (landscape.size * landscape.cellSizeM) / n;
    const density = (from: number, to: number): number => {
      let area = 0;
      for (const d of field.distance) if (d >= from && d < to) area += step * step;
      return placements.filter((t) => distance(t) >= from && distance(t) < to).length / area;
    };
    // Strom zhruba na každých 30–45 m² – koruny 9–17 m široké se překrývají.
    expect(density(0, 6)).toBeGreaterThan(1 / 32);
    expect(density(6, 12)).toBeGreaterThan(1 / 36);
    expect(density(12, 18)).toBeGreaterThan(1 / 50);
    expect(density(20, 40)).toBe(0);
  });

  it('okraj lesa je listnatý – dub, bříza, buk, jehličnanů nanejvýš pár procent', () => {
    const share = (prefix: string): number =>
      placements.filter((t) => t.model.startsWith(prefix)).length / placements.length;
    expect(share('spruce')).toBeLessThan(0.08);
    expect(share('oak')).toBeGreaterThan(0.35);
    expect(share('oak')).toBeLessThan(0.55);
    expect(share('birch')).toBeGreaterThan(0.17);
    expect(share('beech')).toBeGreaterThan(0.17);
  });

  it('jen stromy, žádné keře – keřový lem lesa kreslí dekorace', () => {
    for (const tree of placements) expect(tree.model.startsWith('bush')).toBe(false);
  });

  it('rozmístění je deterministické', () => {
    expect(treePlacements(landscape, field, stream)).toEqual(placements);
  });

  it('les je smíšený – smrky, duby, buky i břízy ve dvou podobách', () => {
    const models = new Set(placements.map((t) => t.model));
    expect(models).toEqual(
      new Set([
        'spruce-1',
        'spruce-2',
        'oak-1',
        'oak-2',
        'beech-1',
        'beech-2',
        'birch-1',
        'birch-2',
      ]),
    );
  });
});

describe('edgeDensity', () => {
  // Hustota stromů okraje podél přímky přes celou krajinu, vzorek po 2 m.
  const samples = Array.from({ length: 960 }, (_, i) => edgeDensity(-960 + i * 2, 137));

  it('tvoří shluky a mezery v celém rozsahu hustoty', () => {
    expect(Math.min(...samples)).toBeLessThan(0.4);
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  it('mění se plynule', () => {
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(samples[i]! - samples[i - 1]!)).toBeLessThan(0.3);
    }
  });

  it('neopakuje se – vzdálené úseky spolu nesouvisí', () => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    let worst = 0;
    // Posuny od 150 m (dál než shluk) do poloviny délky přímky.
    for (let lag = 75; lag < samples.length / 2; lag++) {
      let c = 0;
      for (let i = 0; i + lag < samples.length; i++) {
        c += (samples[i]! - mean) * (samples[i + lag]! - mean);
      }
      worst = Math.max(worst, c / (samples.length - lag) / variance);
    }
    expect(worst).toBeLessThan(0.3);
  });
});
