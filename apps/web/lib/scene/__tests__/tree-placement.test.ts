import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { buildForestField } from '../forest-field';
import { CHANNEL_HALF_WIDTH_M } from '../render-surface';
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

  it('stromy stojí jen u hranice lesa – kousek do lesa (dál jsou koruny) a kousek do louky', () => {
    for (const tree of placements) {
      expect(distance(tree)).toBeLessThan(16);
      expect(distance(tree)).toBeGreaterThanOrEqual(-30);
    }
  });

  it('nic neroste ve vodě ani v korytě potoka', () => {
    for (const tree of placements) {
      const tile = tileAt(landscape, tree.worldX, tree.worldZ)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).not.toBe(SURFACE_CODES.water);
      expect(stream.nearest(tree.worldX, tree.worldZ).distance).toBeGreaterThan(
        CHANNEL_HALF_WIDTH_M + 2,
      );
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

  it('okraj lesa je hustý, před ním řidší lem a v louce jen ojedinělé stromy a keře', () => {
    const edge = placements.filter((t) => distance(t) >= 0).length;
    const fringe = placements.filter((t) => distance(t) < 0 && distance(t) >= -6).length;
    const stragglers = placements.filter((t) => distance(t) < -6).length;
    expect(edge).toBeGreaterThan(3 * fringe);
    expect(fringe).toBeGreaterThan(stragglers);
    expect(stragglers).toBeGreaterThan(10);
  });

  it('keře rostou jen před lesem, ne v něm', () => {
    for (const tree of placements) {
      if (tree.model.startsWith('bush')) expect(distance(tree)).toBeLessThan(2);
    }
  });

  it('rozmístění je deterministické', () => {
    expect(treePlacements(landscape, field, stream)).toEqual(placements);
  });

  it('les je smíšený – smrky, duby, buky i břízy ve dvou podobách, k tomu keře', () => {
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
        'bush-1',
        'bush-2',
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
