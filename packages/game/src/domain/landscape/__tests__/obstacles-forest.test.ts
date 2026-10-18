import { describe, it, expect } from 'vitest';
import { generateLandscape } from '../generate';
import { edgeDensityField } from '../obstacles/forest-trees';
import { obstacleGroups, scatterContext } from '../obstacles/generate';
import type { ObstaclePlacement } from '../obstacles/types';
import { SURFACE_CODES } from '../types';
import { heightAtWorld, tileOfWorldPoint } from '../world';

const landscape = generateLandscape(5);
const ctx = scatterContext(landscape, landscape.obstacleLayer!.seed);
const { field, stream } = ctx;
const groups = obstacleGroups(ctx);
const fromForest = (t: { x: number; z: number }): number => field.distanceAt(t.x, t.z);
const surfaceOf = (p: { x: number; z: number }): number => {
  const tile = tileOfWorldPoint(landscape, p.x, p.z)!;
  return landscape.surface[tile.y * landscape.size + tile.x]!;
};
const nearVillage = (p: { x: number; z: number }): boolean => {
  const tile = tileOfWorldPoint(landscape, p.x, p.z)!;
  const site = landscape.villageSite;
  return Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= 2;
};

describe('edgeTreePlacements – 3D stromy okraje lesa', () => {
  const placements = groups.edge;

  it('stromy stojí jen u hranice lesa – do 18 m do lesa (dál impostory) a kousek do louky', () => {
    for (const tree of placements) {
      expect(fromForest(tree)).toBeLessThan(18);
      expect(fromForest(tree)).toBeGreaterThanOrEqual(-30);
    }
  });

  it('nic neroste ve vodě ani v korytě potoka', () => {
    for (const tree of placements) {
      expect(surfaceOf(tree)).not.toBe(SURFACE_CODES.water);
      expect(stream.nearest(tree.x, tree.z).bankDistance).toBeGreaterThan(2);
    }
  });

  it('u místa pro vesnici nerostou stromy mimo les', () => {
    for (const tree of placements) {
      if (surfaceOf(tree) === SURFACE_CODES.forest) continue;
      expect(nearVillage(tree)).toBe(false);
    }
  });

  it('okraj lesa je hustý, před ním řidší lem a v louce jen ojedinělé stromy', () => {
    const edge = placements.filter((t) => fromForest(t) >= 0).length;
    const fringe = placements.filter((t) => fromForest(t) < 0 && fromForest(t) >= -6).length;
    const stragglers = placements.filter((t) => fromForest(t) < -6).length;
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
      return placements.filter((t) => fromForest(t) >= from && fromForest(t) < to).length / area;
    };
    // Strom zhruba na každých 30–45 m² – koruny 9–17 m široké se překrývají.
    expect(density(0, 6)).toBeGreaterThan(1 / 32);
    expect(density(6, 12)).toBeGreaterThan(1 / 36);
    expect(density(12, 18)).toBeGreaterThan(1 / 50);
    expect(density(20, 40)).toBe(0);
  });

  it('okraj lesa je listnatý – dub, bříza, buk, jehličnanů nanejvýš pár procent', () => {
    const share = (prefix: string): number =>
      placements.filter((t) => t.look.startsWith(prefix)).length / placements.length;
    expect(share('spruce')).toBeLessThan(0.08);
    expect(share('oak')).toBeGreaterThan(0.35);
    expect(share('oak')).toBeLessThan(0.55);
    expect(share('birch')).toBeGreaterThan(0.17);
    expect(share('beech')).toBeGreaterThan(0.17);
  });

  it('jen dospělé stromy kreslené 3D – keřový lem patří keřům', () => {
    for (const tree of placements) {
      expect(tree.kind).toBe('tree');
      expect(tree.impostor).toBeUndefined();
    }
  });

  it('les je smíšený – smrky, duby, buky i břízy ve dvou podobách', () => {
    expect(new Set(placements.map((t) => t.look))).toEqual(
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

describe('impostorTreePlacements – vnitřek lesa', () => {
  const placements = groups.interior;

  it('impostory stojí až za řadami 3D stromů okraje – nejblíž 10 m od hranice', () => {
    expect(placements.length).toBeGreaterThan(1000);
    for (const p of placements) {
      expect(fromForest(p)).toBeGreaterThanOrEqual(10);
      expect(p.impostor).toBe(true);
      expect(p.kind).toBe('tree');
    }
  });

  it('začátek impostorů zakrývají 3D stromy – u každého v náběhu stojí 3D stromy', () => {
    const cell = 10;
    const grid = new Map<string, ObstaclePlacement[]>();
    for (const t of groups.edge) {
      const key = `${Math.floor(t.x / cell)},${Math.floor(t.z / cell)}`;
      grid.set(key, [...(grid.get(key) ?? []), t]);
    }
    const near = (x: number, z: number, r: number): number => {
      let count = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const t of grid.get(`${Math.floor(x / cell) + dx},${Math.floor(z / cell) + dz}`) ??
            []) {
            if (Math.hypot(t.x - x, t.z - z) <= r) count++;
          }
        }
      }
      return count;
    };
    const ramp = placements.filter((p) => fromForest(p) < 14);
    expect(ramp.length).toBeGreaterThan(50);
    const covered = ramp.filter((p) => near(p.x, p.z, 9) >= 2).length;
    expect(covered / ramp.length).toBeGreaterThan(0.9);
  });

  it('za řadami 3D stromů les rychle zhoustne, hluboko v lese strom asi každých 6–7 m', () => {
    const n = field.resolution;
    const step = (landscape.size * landscape.cellSizeM) / n;
    const density = (from: number, to: number): number => {
      let area = 0;
      for (const d of field.distance) if (d >= from && d < to) area += step * step;
      return placements.filter((p) => fromForest(p) >= from && fromForest(p) < to).length / area;
    };
    const ramp = density(10, 14);
    const deep = density(20, Infinity);
    expect(ramp).toBeLessThan(deep * 0.8);
    expect(ramp).toBeGreaterThan(deep * 0.1);
    expect(deep).toBeGreaterThan(1 / 60);
    expect(deep).toBeLessThan(1 / 30);
  });

  it('nic neroste ve vodě ani v korytě potoka, mimo les ani u místa pro vesnici', () => {
    for (const p of placements) {
      expect(surfaceOf(p)).not.toBe(SURFACE_CODES.water);
      expect(stream.nearest(p.x, p.z).bankDistance).toBeGreaterThan(2);
      if (surfaceOf(p) !== SURFACE_CODES.forest) expect(nearVillage(p)).toBe(false);
    }
  });

  it('vnitřek lesa: buk, dub, bříza a jehličnany ve skupinách, výš víc jehličnanů', () => {
    const deep = placements.filter((p) => fromForest(p) >= 30);
    const share = (prefix: string): number =>
      deep.filter((p) => p.look.startsWith(prefix)).length / deep.length;
    expect(share('spruce')).toBeGreaterThan(0.06);
    expect(share('spruce')).toBeLessThan(0.3);
    expect(share('beech')).toBeGreaterThan(0.25);
    expect(share('oak')).toBeGreaterThan(0.2);
    expect(share('birch')).toBeGreaterThan(0.04);
    expect(share('birch')).toBeLessThan(0.16);

    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
    const h = (p: ObstaclePlacement): number => heightAtWorld(landscape, p.x, p.z);
    const spruce = deep.filter((p) => p.look.startsWith('spruce'));
    expect(mean(spruce.map(h))).toBeGreaterThan(
      mean(deep.filter((p) => !p.look.startsWith('spruce')).map(h)),
    );

    // Shluky: soused jehličnanu (do 9 m) je jehličnan mnohem častěji, než odpovídá podílu.
    const cell = 10;
    const grid = new Map<string, ObstaclePlacement[]>();
    for (const p of deep) {
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
      grid.set(key, [...(grid.get(key) ?? []), p]);
    }
    let neighbours = 0;
    let spruceNeighbours = 0;
    for (const p of spruce) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${Math.floor(p.x / cell) + dx},${Math.floor(p.z / cell) + dz}`;
          for (const q of grid.get(key) ?? []) {
            if (q === p || Math.hypot(q.x - p.x, q.z - p.z) > 9) continue;
            neighbours++;
            if (q.look.startsWith('spruce')) spruceNeighbours++;
          }
        }
      }
    }
    expect(spruceNeighbours / neighbours).toBeGreaterThan(share('spruce') * 1.4);
  });
});

describe('edgeDensityField', () => {
  // Hustota stromů okraje podél přímky přes celou krajinu, vzorek po 2 m.
  const edgeDensity = edgeDensityField(1234);
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

  it('jiný seed vrstvy = jiné shluky', () => {
    const other = edgeDensityField(4321);
    const differs = samples.filter((v, i) => Math.abs(v - other(-960 + i * 2, 137)) > 0.05);
    expect(differs.length).toBeGreaterThan(samples.length / 2);
  });
});
