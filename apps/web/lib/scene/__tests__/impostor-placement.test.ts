import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { buildForestField } from '../forest-field';
import { IMPOSTOR_ATLAS } from '../impostor-atlas';
import { impostorPlacements } from '../impostor-placement';
import { CHANNEL_HALF_WIDTH_M } from '../render-surface';
import { streamCenterline } from '../stream-geometry';
import { heightAt, tileAt } from '../tile-at';
import { treePlacements } from '../tree-placement';

const landscape = generateLandscape(5);
const field = buildForestField(landscape);
const stream = streamCenterline(landscape);

describe('impostorPlacements', () => {
  const placements = impostorPlacements(landscape, field, stream);
  const distance = (p: { worldX: number; worldZ: number }): number =>
    field.distanceAt(p.worldX, p.worldZ);

  it('impostory stojí až za řadami 3D stromů okraje – nejblíž 10 m od hranice', () => {
    expect(placements.length).toBeGreaterThan(1000);
    for (const p of placements) expect(distance(p)).toBeGreaterThanOrEqual(10);
  });

  it('začátek impostorů zakrývají 3D stromy – u každého v náběhu stojí 3D stromy', () => {
    const trees = treePlacements(landscape, field, stream);
    const cell = 10;
    const grid = new Map<string, typeof trees>();
    for (const t of trees) {
      const key = `${Math.floor(t.worldX / cell)},${Math.floor(t.worldZ / cell)}`;
      grid.set(key, [...(grid.get(key) ?? []), t]);
    }
    const near = (x: number, z: number, r: number): number => {
      let count = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const t of grid.get(`${Math.floor(x / cell) + dx},${Math.floor(z / cell) + dz}`) ??
            []) {
            if (Math.hypot(t.worldX - x, t.worldZ - z) <= r) count++;
          }
        }
      }
      return count;
    };
    const ramp = placements.filter((p) => distance(p) < 14);
    expect(ramp.length).toBeGreaterThan(50);
    const covered = ramp.filter((p) => near(p.worldX, p.worldZ, 9) >= 2).length;
    expect(covered / ramp.length).toBeGreaterThan(0.9);
  });

  it('za řadami 3D stromů les rychle zhoustne, hluboko v lese strom asi každých 6–7 m', () => {
    const n = field.resolution;
    const step = (landscape.size * landscape.cellSizeM) / n;
    const density = (from: number, to: number): number => {
      let area = 0;
      for (const d of field.distance) if (d >= from && d < to) area += step * step;
      return placements.filter((p) => distance(p) >= from && distance(p) < to).length / area;
    };
    const ramp = density(10, 14);
    const deep = density(20, Infinity);
    expect(ramp).toBeLessThan(deep * 0.8);
    expect(ramp).toBeGreaterThan(deep * 0.1);
    expect(deep).toBeGreaterThan(1 / 60);
    expect(deep).toBeLessThan(1 / 30);
  });

  it('nic neroste ve vodě ani v korytě potoka', () => {
    for (const p of placements) {
      const tile = tileAt(landscape, p.worldX, p.worldZ)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).not.toBe(SURFACE_CODES.water);
      expect(stream.nearest(p.worldX, p.worldZ).distance).toBeGreaterThan(CHANNEL_HALF_WIDTH_M + 2);
    }
  });

  it('u místa pro vesnici nic neroste mimo les', () => {
    const site = landscape.villageSite;
    for (const p of placements) {
      const tile = tileAt(landscape, p.worldX, p.worldZ)!;
      if (landscape.surface[tile.y * landscape.size + tile.x] === SURFACE_CODES.forest) continue;
      expect(Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y))).toBeGreaterThan(2);
    }
  });

  it('vnitřek lesa: buk, dub, bříza a jehličnany ve skupinách, výš víc jehličnanů', () => {
    const deep = placements.filter((p) => distance(p) >= 30);
    const model = (p: (typeof placements)[number]): string => IMPOSTOR_ATLAS.cells[p.cell]!.model;
    const share = (prefix: string): number =>
      deep.filter((p) => model(p).startsWith(prefix)).length / deep.length;
    expect(share('spruce')).toBeGreaterThan(0.06);
    expect(share('spruce')).toBeLessThan(0.3);
    expect(share('beech')).toBeGreaterThan(0.25);
    expect(share('oak')).toBeGreaterThan(0.2);
    expect(share('birch')).toBeGreaterThan(0.04);
    expect(share('birch')).toBeLessThan(0.16);

    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
    const h = (p: (typeof placements)[number]): number => heightAt(landscape, p.worldX, p.worldZ);
    const spruce = deep.filter((p) => model(p).startsWith('spruce'));
    expect(mean(spruce.map(h))).toBeGreaterThan(
      mean(deep.filter((p) => !model(p).startsWith('spruce')).map(h)),
    );

    // Shluky: soused jehličnanu (do 9 m) je jehličnan mnohem častěji, než odpovídá podílu.
    const cell = 10;
    const grid = new Map<string, typeof deep>();
    for (const p of deep) {
      const key = `${Math.floor(p.worldX / cell)},${Math.floor(p.worldZ / cell)}`;
      grid.set(key, [...(grid.get(key) ?? []), p]);
    }
    let neighbours = 0;
    let spruceNeighbours = 0;
    for (const p of spruce) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${Math.floor(p.worldX / cell) + dx},${Math.floor(p.worldZ / cell) + dz}`;
          for (const q of grid.get(key) ?? []) {
            if (q === p || Math.hypot(q.worldX - p.worldX, q.worldZ - p.worldZ) > 9) continue;
            neighbours++;
            if (model(q).startsWith('spruce')) spruceNeighbours++;
          }
        }
      }
    }
    expect(spruceNeighbours / neighbours).toBeGreaterThan(share('spruce') * 1.4);
    expect(new Set(placements.map((p) => p.cell)).size).toBe(IMPOSTOR_ATLAS.cells.length);
  });

  it('rozmístění je deterministické', () => {
    expect(impostorPlacements(landscape, field, stream)).toEqual(placements);
  });
});
