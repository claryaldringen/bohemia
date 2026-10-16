import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { buildForestField } from '../forest-field';
import { GROUND_LAYERS, groundWeights } from '../ground-layers';
import { streamCenterline } from '../stream-geometry';
import { treePlacements } from '../tree-placement';

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

  it('uprostřed velké louky převažuje tráva', () => {
    for (const [x, y] of tilesOf(SURFACE_CODES.meadow).slice(0, 50)) {
      expect(['grass', 'grassLush', 'grassDirt']).toContain(dominant(weightsAtTile(x, y)));
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
    expect(groundWeights(landscape).layers).toEqual(weights.layers);
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

  it('bahno sleduje vyhlazenou osu i tam, kde osa zaoblila roh přes nevodní políčko', () => {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const cornerPoints = stream.points.filter((p) => {
      const x = Math.floor((p.x + half) / landscape.cellSizeM);
      const y = Math.floor((p.z + half) / landscape.cellSizeM);
      return (
        x >= 0 &&
        y >= 0 &&
        x < 128 &&
        y < 128 &&
        landscape.surface[y * 128 + x] !== SURFACE_CODES.water
      );
    });
    expect(cornerPoints.length).toBeGreaterThan(0);
    for (const p of cornerPoints) {
      const i = texelAt(p.x, p.z);
      const strongest = Math.max(...smooth.layers.map((layer) => layer[i]!));
      expect(smooth.layers[mud]![i], `${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBe(strongest);
    }
  });

  it('25 m od osy už bahno není', () => {
    for (const p of stream.points.slice(10, -10).filter((_, i) => i % 15 === 0)) {
      const a = stream.points[stream.points.indexOf(p) + 1]!;
      // kolmo k ose
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const length = Math.hypot(dx, dz) || 1;
      const x = p.x - (dz / length) * 25;
      const z = p.z + (dx / length) * 25;
      if (stream.nearest(x, z).distance < 24) continue;
      expect(smooth.layers[mud]![texelAt(x, z)]).toBeLessThan(40);
    }
  });
});

describe('groundWeights s vyhlazenou hranicí lesa a stromy', () => {
  const field = buildForestField(landscape);
  const stream = streamCenterline(landscape);
  const trees = treePlacements(landscape, field, stream);
  const withForest = groundWeights(landscape, stream, { field, trees });
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const step = (landscape.size * landscape.cellSizeM) / withForest.resolution;
  const centerOf = (i: number): [number, number] => [
    -half + ((i % withForest.resolution) + 0.5) * step,
    -half + (Math.floor(i / withForest.resolution) + 0.5) * step,
  ];
  const forestFloor = withForest.layers[GROUND_LAYERS.indexOf('forestFloor')]!;

  it('lesní půda sleduje vyhlazenou hranici lesa, ne políčka', () => {
    let deep = 0;
    let open = 0;
    for (let i = 0; i < forestFloor.length; i += 101) {
      const [x, z] = centerOf(i);
      if (stream.nearest(x, z).distance < 30) continue;
      const d = field.distanceAt(x, z);
      if (d > 10) {
        expect(forestFloor[i]).toBeGreaterThan(128);
        deep++;
      } else if (d < -10) {
        expect(forestFloor[i]).toBe(0);
        open++;
      }
    }
    expect(deep).toBeGreaterThan(100);
    expect(open).toBeGreaterThan(100);
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
    for (const tree of trees.filter((t) => !t.model.startsWith('bush')).slice(0, 200)) {
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
