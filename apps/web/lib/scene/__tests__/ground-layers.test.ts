import { describe, it, expect } from 'vitest';
import {
  buildForestField,
  buildRelief,
  generateLandscape,
  obstaclesOf,
  SURFACE_CODES,
} from '@bohemia/game';
import {
  GROUND_LAYERS,
  groundWeights,
  packShade,
  packSplatTextures,
  treeShade,
} from '../ground-layers';
import { streamCenterline } from '../stream-geometry';
import { tileCenter } from '../tile-at';
import { obstacleScenery } from '../obstacle-scenery';

const landscape = generateLandscape(3);
const weights = groundWeights(landscape);
const { resolution } = weights;
const TEXELS_PER_TILE = resolution / landscape.size;

/** Váhy všech vrstev v texelu ležícím ve středu políčka. */
function weightsAtTile(x: number, y: number): Record<string, number> {
  const tx = Math.floor((x + 0.5) * TEXELS_PER_TILE);
  const ty = Math.floor((y + 0.5) * TEXELS_PER_TILE);
  const i = ty * resolution + tx;
  return Object.fromEntries(GROUND_LAYERS.map((layer, k) => [layer, weights.layers[k]![i]!]));
}

function dominant(w: Record<string, number>): string {
  return Object.entries(w).sort((a, b) => b[1] - a[1])[0]![0];
}

const tilesOf = (code: number): [number, number][] => {
  const tiles: [number, number][] = [];
  for (let y = 2; y < landscape.size - 2; y++) {
    for (let x = 2; x < landscape.size - 2; x++) {
      const same = [-2, -1, 0, 1, 2].every((dy) =>
        [-2, -1, 0, 1, 2].every(
          (dx) => landscape.surface[(y + dy) * landscape.size + x + dx] === code,
        ),
      );
      if (same) tiles.push([x, y]);
    }
  }
  return tiles;
};

describe('groundWeights', () => {
  it('má rozlišení 512 × 512 a váhy v každém texelu dávají dohromady 255', () => {
    expect(resolution).toBe(512);
    for (let i = 0; i < resolution * resolution; i += 997) {
      const sum = weights.layers.reduce((total, layer) => total + layer[i]!, 0);
      expect(sum).toBeGreaterThanOrEqual(253);
      expect(sum).toBeLessThanOrEqual(257);
    }
  });

  it('uprostřed velkého lesa převažuje lesní půda', () => {
    for (const [x, y] of tilesOf(SURFACE_CODES.forest).slice(0, 50)) {
      expect(dominant(weightsAtTile(x, y)), `${x},${y}`).toBe('forestFloor');
    }
  });

  it('uprostřed velké louky mimo prudké svahy převažuje tráva (i kvetoucí nebo suchá)', () => {
    const relief = buildRelief(landscape);
    const gentle = tilesOf(SURFACE_CODES.meadow).filter(([x, y]) => {
      const { worldX, worldZ } = tileCenter(landscape, x, y);
      return relief.slopeAt(worldX, worldZ) < 0.1 && relief.convexityAt(worldX, worldZ) < 0.7;
    });
    expect(gentle.length).toBeGreaterThan(50);
    for (const [x, y] of gentle.slice(0, 50)) {
      expect(['grass', 'grassLush', 'grassDirt', 'flowers', 'dryGrass']).toContain(
        dominant(weightsAtTile(x, y)),
      );
    }
  });

  it('ve vodním políčku převažuje bahno a na břehu bahnitá tráva', () => {
    const waterTiles: [number, number][] = [];
    for (let i = 0; i < landscape.surface.length; i++) {
      if (landscape.surface[i] === SURFACE_CODES.water)
        waterTiles.push([i % 128, Math.floor(i / 128)]);
    }
    const [wx, wy] = waterTiles[Math.floor(waterTiles.length / 2)]!;
    expect(dominant(weightsAtTile(wx, wy))).toBe('mud');
    const bank = [
      [wx + 1, wy],
      [wx - 1, wy],
      [wx, wy + 1],
      [wx, wy - 1],
    ].find(([x, y]) => landscape.surface[y! * 128 + x!] !== SURFACE_CODES.water)!;
    expect(['shore', 'mud']).toContain(dominant(weightsAtTile(bank[0]!, bank[1]!)));
  });

  it('je deterministické', () => {
    // Porovnání po bajtech – toEqual po prvcích je u 1,5 milionu hodnot pomalé.
    const again = groundWeights(landscape).layers;
    again.forEach((layer, k) =>
      expect(Buffer.from(layer).equals(Buffer.from(weights.layers[k]!))).toBe(true),
    );
  });
});

describe('groundWeights s vyhlazeným korytem', () => {
  const stream = streamCenterline(landscape);
  const smooth = groundWeights(landscape, stream);
  const texelAt = (x: number, z: number): number => {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const tx = Math.floor(
      ((x + half) / (landscape.size * landscape.cellSizeM)) * smooth.resolution,
    );
    const tz = Math.floor(
      ((z + half) / (landscape.size * landscape.cellSizeM)) * smooth.resolution,
    );
    return tz * smooth.resolution + tx;
  };
  const mud = GROUND_LAYERS.indexOf('mud');
  const sand = GROUND_LAYERS.indexOf('sand');
  const gravel = GROUND_LAYERS.indexOf('gravel');
  const bed = (i: number): number =>
    smooth.layers[mud]![i]! + smooth.layers[sand]![i]! + smooth.layers[gravel]![i]!;
  const dominant = (i: number): number => {
    let best = 0;
    smooth.layers.forEach((layer, k) => {
      if (layer[i]! > smooth.layers[best]![i]!) best = k;
    });
    return best;
  };

  it('dno potoka sleduje osu – na ose převažuje bahno, písek nebo štěrk', () => {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const onMap = stream.points.filter(
      (p) => Math.max(Math.abs(p.x), Math.abs(p.z)) < half - landscape.cellSizeM,
    );
    expect(onMap.length).toBeGreaterThan(100);
    for (const p of onMap) {
      const i = texelAt(p.x, p.z);
      expect(bed(i), `${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeGreaterThan(200);
    }
  });

  it('podloží podle proudu: v peřejích štěrk, v tůních bahno', () => {
    const axis = stream.points.slice(10, -10);
    const fast = axis.filter((p) => p.speed > 0.75 && p.pool < 0.1);
    const pools = axis.filter((p) => p.pool > 0.9);
    expect(fast.length).toBeGreaterThan(5);
    expect(pools.length).toBeGreaterThan(5);
    const share = (ps: typeof axis, layer: number): number =>
      ps.filter((p) => dominant(texelAt(p.x, p.z)) === layer).length / ps.length;
    expect(share(fast, gravel)).toBeGreaterThan(0.6);
    expect(share(pools, mud)).toBeGreaterThan(0.6);
  });

  it('na vnitřní straně oblouku v proudu je náplav (štěrk nebo písek) i kousek nad vodou', () => {
    let bars = 0;
    let bends = 0;
    const axis = stream.points.slice(10, -10);
    for (let k = 0; k < axis.length - 1; k += 4) {
      const a = axis[k]!;
      if (Math.abs(a.turn) < 0.7 || a.speed < 0.35 || a.pool > 0.1) continue;
      const b = axis[k + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const side = Math.sign(a.turn); // kladné stočení = doleva = levá strana je vnitřní
      const half = side > 0 ? a.halfLeft : a.halfRight;
      const x = a.x - ((b.z - a.z) / length) * side * (half + 3);
      const z = a.z + ((b.x - a.x) / length) * side * (half + 3);
      if (stream.nearest(x, z).bankDistance > 4) continue;
      bends++;
      const i = texelAt(x, z);
      if (smooth.layers[sand]![i]! + smooth.layers[gravel]![i]! > 128) bars++;
    }
    expect(bends).toBeGreaterThan(3);
    expect(bars / bends).toBeGreaterThan(0.6);
  });

  it('18 m od okraje vody už bahno není', () => {
    for (const p of stream.points.slice(10, -10).filter((_, i) => i % 15 === 0)) {
      const a = stream.points[stream.points.indexOf(p) + 1]!;
      // kolmo k ose, na levou stranu (−dz, dx) za okraj vody
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const length = Math.hypot(dx, dz) || 1;
      const out = p.halfLeft + 18;
      const x = p.x - (dz / length) * out;
      const z = p.z + (dx / length) * out;
      if (stream.nearest(x, z).bankDistance < 17) continue;
      expect(smooth.layers[mud]![texelAt(x, z)]).toBeLessThan(40);
    }
  });
});

describe('groundWeights s vyhlazenou hranicí lesa a stromy', () => {
  const field = buildForestField(landscape);
  const stream = streamCenterline(landscape);
  const trees = obstacleScenery(obstaclesOf(landscape)).trees;
  const withForest = groundWeights(landscape, stream, { field, trees });
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const step = (landscape.size * landscape.cellSizeM) / withForest.resolution;
  const centerOf = (i: number): [number, number] => [
    -half + ((i % withForest.resolution) + 0.5) * step,
    -half + (Math.floor(i / withForest.resolution) + 0.5) * step,
  ];
  const forestFloor = withForest.layers[GROUND_LAYERS.indexOf('forestFloor')]!;

  it('s vyhlazenou hranicí lesa se lesní půda nekreslí – v lese je tráva', () => {
    expect(forestFloor.every((w) => w === 0)).toBe(true);
    const grassLayers = ['grass', 'grassLush', 'grassDirt'].map(
      (layer) => withForest.layers[GROUND_LAYERS.indexOf(layer as never)]!,
    );
    let checked = 0;
    for (let i = 0; i < forestFloor.length; i += 101) {
      const [x, z] = centerOf(i);
      if (stream.nearest(x, z).distance < 30 || field.distanceAt(x, z) < 10) continue;
      const grass = grassLayers.reduce((sum, layer) => sum + layer[i]!, 0);
      expect(grass).toBeGreaterThan(200);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('pod stromy je půda ztmavená, louka daleko od stromů ne', () => {
    // Shader vzorkuje bilineárně – stejně se díváme i tady.
    const shadeAt = (x: number, z: number): number => {
      const n = withForest.resolution;
      const fi = Math.min(n - 1.001, Math.max(0, (x + half) / step - 0.5));
      const fj = Math.min(n - 1.001, Math.max(0, (z + half) / step - 0.5));
      const i0 = Math.floor(fi);
      const j0 = Math.floor(fj);
      const s = (i: number, j: number): number => withForest.shade[j * n + i]!;
      const top = s(i0, j0) + (s(i0 + 1, j0) - s(i0, j0)) * (fi - i0);
      const bottom = s(i0, j0 + 1) + (s(i0 + 1, j0 + 1) - s(i0, j0 + 1)) * (fi - i0);
      return top + (bottom - top) * (fj - j0);
    };
    for (const tree of trees.slice(0, 200)) {
      expect(shadeAt(tree.worldX, tree.worldZ)).toBeGreaterThan(40);
    }
    let checked = 0;
    for (let i = 0; i < withForest.shade.length; i += 97) {
      const [x, z] = centerOf(i);
      const far = trees.every((t) => Math.hypot(t.worldX - x, t.worldZ - z) > 12);
      if (!far || field.distanceAt(x, z) > 0) continue;
      expect(withForest.shade[i]).toBe(0);
      if (++checked > 300) break;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('ztmavení pod stromy po vykácení', () => {
  const trees = obstacleScenery(obstaclesOf(landscape)).trees;
  const resolution = landscape.size * 4;
  const all = treeShade(landscape, trees, resolution);

  it('pod vykáceným stromem se tráva neztmaví, ostatní stromy stín nechají', () => {
    const felled = trees.slice(0, 50);
    const hidden = new Set(felled.map((t) => t.id!));
    const shade = treeShade(landscape, trees, resolution, hidden);
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const step = (landscape.size * landscape.cellSizeM) / resolution;
    const texel = (x: number, z: number): number =>
      Math.floor((z + half) / step) * resolution + Math.floor((x + half) / step);
    let lighter = 0;
    for (const t of felled)
      if (shade[texel(t.worldX, t.worldZ)]! < all[texel(t.worldX, t.worldZ)]!) lighter++;
    expect(lighter).toBeGreaterThan(felled.length / 2);
    // nikde tmavší než se všemi stromy, u stojících stromů beze změny
    for (let i = 0; i < shade.length; i++) expect(shade[i]).toBeLessThanOrEqual(all[i]!);
    for (const t of trees.slice(500, 600)) {
      if (felled.some((f) => Math.hypot(f.worldX - t.worldX, f.worldZ - t.worldZ) < 15)) continue;
      expect(shade[texel(t.worldX, t.worldZ)]).toBe(all[texel(t.worldX, t.worldZ)]);
    }
  });

  it('packShade přepíše jen modrý kanál druhé splat textury', () => {
    const [, second] = packSplatTextures(groundWeights(landscape));
    const before = second.slice();
    const shade = new Uint8Array(second.length / 4).fill(77);
    packShade(second, shade);
    for (let i = 0; i < shade.length; i++) {
      expect(second[i * 4 + 2]).toBe(77);
      expect(second[i * 4]).toBe(before[i * 4]);
      expect(second[i * 4 + 3]).toBe(before[i * 4 + 3]);
    }
  });
});

describe('povrchy luk podle tvaru terénu', () => {
  const field = buildForestField(landscape);
  const stream = streamCenterline(landscape);
  const relief = buildRelief(landscape);
  const ground = groundWeights(landscape, stream, { field, trees: [] });
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const step = (landscape.size * landscape.cellSizeM) / ground.resolution;
  const layer = (name: (typeof GROUND_LAYERS)[number]): Uint8Array =>
    ground.layers[GROUND_LAYERS.indexOf(name)]!;
  const rocky = layer('rocky');
  const dry = layer('dryGrass');
  const flowers = layer('flowers');
  const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
  const texels: { i: number; x: number; z: number }[] = [];
  for (let i = 0; i < rocky.length; i += 7) {
    const x = -half + ((i % ground.resolution) + 0.5) * step;
    const z = -half + (Math.floor(i / ground.resolution) + 0.5) * step;
    texels.push({ i, x, z });
  }
  /** Texely luk daleko od lesa i potoka. */
  const meadow = texels.filter(
    (t) => field.distanceAt(t.x, t.z) < -15 && stream.nearest(t.x, t.z).bankDistance > 40,
  );

  it('na nejprudších svazích luk vystupuje kamenitá půda, na rovině ne', () => {
    const steep = meadow.filter((t) => relief.slopeAt(t.x, t.z) > 0.15);
    const flat = meadow.filter(
      (t) => relief.slopeAt(t.x, t.z) < 0.05 && relief.convexityAt(t.x, t.z) < 0.3,
    );
    expect(steep.length).toBeGreaterThan(20);
    expect(mean(steep.map((t) => rocky[t.i]!))).toBeGreaterThan(90);
    expect(flat.filter((t) => rocky[t.i]! > 0).length / flat.length).toBeLessThan(0.02);
  });

  it('svahy ke slunci jsou sušší než svahy odvrácené', () => {
    const sunny = meadow.filter((t) => relief.sunwardAt(t.x, t.z) > 0.06);
    const shaded = meadow.filter((t) => relief.sunwardAt(t.x, t.z) < -0.03);
    expect(sunny.length).toBeGreaterThan(20);
    expect(shaded.length).toBeGreaterThan(20);
    const sunnyDry = mean(sunny.map((t) => dry[t.i]!));
    expect(sunnyDry).toBeGreaterThan(40);
    expect(sunnyDry).toBeGreaterThan(3 * mean(shaded.map((t) => dry[t.i]!)));
  });

  it('kvetoucí louka tvoří ostrůvky – část luk, ne všechny', () => {
    const share = meadow.filter((t) => flowers[t.i]! > 128).length / meadow.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.45);
  });

  it('hluboko v lese ani na břehu potoka nové povrchy nejsou (kromě skalních stěn u vody)', () => {
    const outside = texels.filter((t) => {
      const near = stream.nearest(t.x, t.z);
      if (near.bank > 0) return false;
      return field.distanceAt(t.x, t.z) > 5 || near.bankDistance < 3;
    });
    expect(outside.length).toBeGreaterThan(1000);
    for (const t of outside) expect(flowers[t.i]! + dry[t.i]! + rocky[t.i]!).toBe(0);
  });

  it('nové vrstvy jdou do volných kanálů splat textur', () => {
    const [, second, third] = packSplatTextures(ground);
    for (const t of meadow.slice(0, 500)) {
      expect(second[t.i * 4 + 3]).toBe(flowers[t.i]);
      expect(third[t.i * 4 + 2]).toBe(dry[t.i]);
      expect(third[t.i * 4 + 3]).toBe(rocky[t.i]);
    }
  });
});
