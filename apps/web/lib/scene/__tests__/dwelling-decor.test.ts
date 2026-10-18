import { describe, it, expect } from 'vitest';
import { HEIGHT_SCALE } from '../constants';
import { terrainMeshHeight } from '../drape';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DWELLING_GARDEN_M } from '@bohemia/game';
import { EARTH_LAYERS, earthPatch, eaveTufts, gardenInstance, inGarden } from '../dwelling-decor';
import { localToWorld } from '../village-layout';

describe('okolí obydlí', () => {
  const position = { x: 40, z: -20, rotation: 0.7 };

  it('trsy trávy leží podél dlouhých stran, ne před vchodem, a jsou pokaždé stejné', () => {
    const tufts = eaveTufts('zemnice', position, 3);
    expect(tufts.length).toBeGreaterThan(60);
    expect(eaveTufts('zemnice', position, 3)).toEqual(tufts);
    expect(eaveTufts('zemnice', position, 4)).not.toEqual(tufts);
    const c = Math.cos(position.rotation);
    const s = Math.sin(position.rotation);
    for (const t of tufts) {
      // zpět do souřadnic modelu (x napříč, z k vchodu)
      const dx = t.x - position.x;
      const dz = t.z - position.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      expect(Math.abs(lx)).toBeGreaterThan(2.2);
      expect(Math.abs(lx)).toBeLessThan(3.3);
      // podél celé střechy, i pod přesahem před štíty (1,05 m)
      expect(Math.abs(lz)).toBeLessThan(3.6);
    }
  });

  it('vyšlapaná hlína je před vchodem a k okraji slábne', () => {
    const patch = earthPatch('polozemnice', { x: 0, z: 0, rotation: 0 }, 1, EARTH_LAYERS.earth);
    // střed skvrny (první bod) před dveřmi, tj. v +z
    expect(patch.positions[1]!).toBeGreaterThan(2.5);
    expect(patch.alphas[0]!).toBeGreaterThan(0.7);
    expect(patch.alphas[patch.alphas.length - 1]!).toBeLessThan(0.05);
    for (const index of patch.indices) expect(index).toBeLessThan(patch.alphas.length);
  });
});

describe('zahrádka polozemnice', () => {
  const position = { x: 40, z: -20, rotation: 0.7 };
  const g = DWELLING_GARDEN_M.polozemnice!;
  const center = localToWorld(position, (g.minX + g.maxX) / 2, (g.minZ + g.maxZ) / 2);

  it('zemnice zahrádku nemá; na rovině stojí zahrádka svisle, kousek zapuštěná', () => {
    expect(gardenInstance('zemnice', position, () => 0)).toBeNull();
    const flat = gardenInstance('polozemnice', position, () => 2)!;
    expect(flat.x).toBeCloseTo(center[0]);
    expect(flat.z).toBeCloseTo(center[1]);
    expect(flat.y).toBeCloseTo(2 - 0.04);
    expect(flat.rotationY).toBe(position.rotation);
    expect(flat.up.y).toBeCloseTo(1);
  });

  it('na svahu se nakloní kolmo ke svahu a nikde nevisí nad terénem', () => {
    const slope = (x: number, z: number): number => 0.15 * x - 0.08 * z;
    const tilted = gardenInstance('polozemnice', position, slope)!;
    const n = Math.hypot(0.15, 1, 0.08);
    expect(tilted.up.x).toBeCloseTo(-0.15 / n);
    expect(tilted.up.y).toBeCloseTo(1 / n);
    expect(tilted.up.z).toBeCloseTo(0.08 / n);
    expect(tilted.y).toBeCloseTo(slope(center[0], center[1]) - 0.04);
    // zvlněný terén: rovina zahrádky leží v rozích i uprostřed pod terénem
    const bumpy = (x: number, z: number): number =>
      0.1 * x + Math.sin(x * 0.7) * 0.3 + Math.cos(z * 0.9) * 0.1;
    const garden = gardenInstance('polozemnice', position, bumpy)!;
    const su = -garden.up.x / garden.up.y;
    const sv = -garden.up.z / garden.up.y;
    for (const [lx, lz] of [
      [g.minX, g.minZ],
      [g.maxX, g.minZ],
      [g.maxX, g.maxZ],
      [g.minX, g.maxZ],
      [(g.minX + g.maxX) / 2, (g.minZ + g.maxZ) / 2],
    ] as const) {
      const [x, z] = localToWorld(position, lx, lz);
      const planeY = garden.y + su * (x - garden.x) + sv * (z - garden.z);
      expect(planeY).toBeLessThanOrEqual(bumpy(x, z) + 1e-9);
    }
  });

  it('bod v zahrádce se pozná i po otočení obydlí', () => {
    expect(inGarden('polozemnice', position, center[0], center[1])).toBe(true);
    expect(inGarden('polozemnice', position, position.x, position.z)).toBe(false);
    expect(inGarden('zemnice', position, center[0], center[1])).toBe(false);
  });

  it('model zahrádky (garden.glb) sedí do DWELLING_GARDEN_M', () => {
    const data = readFileSync(join(__dirname, '../../../public/models/dwellings/garden.glb'));
    const length = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
      accessors: { min?: number[]; max?: number[] }[];
      meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    };
    const accessor = json.accessors[json.meshes[0]!.primitives[0]!.attributes.POSITION]!;
    // glTF x = Blender x = −x modelu, glTF z = −Blender y = z modelu; počátek uprostřed zahrádky
    const halfX = (g.maxX - g.minX) / 2;
    const halfZ = (g.maxZ - g.minZ) / 2;
    expect(Math.max(-accessor.min![0]!, accessor.max![0]!)).toBeLessThanOrEqual(halfX);
    expect(Math.max(-accessor.min![2]!, accessor.max![2]!)).toBeLessThanOrEqual(halfZ);
    expect(Math.max(-accessor.min![0]!, accessor.max![0]!)).toBeGreaterThan(halfX - 0.2);
    expect(Math.max(-accessor.min![2]!, accessor.max![2]!)).toBeGreaterThan(halfZ - 0.2);
  });
});

describe('terrainMeshHeight – výška na trojúhelnících terénu', () => {
  // Malá síť 40 × 40 bodů po 3,75 m s nepravidelnými výškami (jako RenderSurface).
  const n = 40;
  const step = 3.75;
  const heights = Float32Array.from({ length: n * n }, (_, v) => {
    const i = v % n;
    const j = Math.floor(v / n);
    return 200 + 3 * Math.sin(i * 0.7) + 2 * Math.cos(j * 1.3) + ((i * 7 + j * 13) % 5) * 0.2;
  });
  const surface = {
    resolution: n,
    heights,
    position: (v: number) => ({ x: -70 + (v % n) * step, z: -70 + Math.floor(v / n) * step }),
  };

  it('v bodech sítě sedí přesně na výšky terénu', () => {
    for (const v of [0, 17, 401, n * 30 + 21, n * n - 1]) {
      const { x, z } = surface.position(v);
      expect(terrainMeshHeight(surface, x, z)).toBeCloseTo(heights[v]! * HEIGHT_SCALE, 4);
    }
  });

  it('uvnitř čtverce interpoluje rovinně po trojúhelnících, na úhlopříčce spojitě', () => {
    const v = 20 * n + 15;
    const a = surface.position(v);
    const h = (i: number, j: number): number => heights[v + j * n + i]! * HEIGHT_SCALE;
    // střed úhlopříčky z (i+1, j) do (i, j+1)
    expect(terrainMeshHeight(surface, a.x + step / 2, a.z + step / 2)).toBeCloseTo(
      (h(1, 0) + h(0, 1)) / 2,
      4,
    );
    // čtvrtina v prvním trojúhelníku (a, b, c)
    expect(terrainMeshHeight(surface, a.x + step / 4, a.z + step / 4)).toBeCloseTo(
      h(0, 0) + (h(1, 0) - h(0, 0)) / 4 + (h(0, 1) - h(0, 0)) / 4,
      4,
    );
    // tři čtvrtiny ve druhém trojúhelníku (b, d, c)
    expect(terrainMeshHeight(surface, a.x + (3 * step) / 4, a.z + (3 * step) / 4)).toBeCloseTo(
      h(1, 1) + (h(0, 1) - h(1, 1)) / 4 + (h(1, 0) - h(1, 1)) / 4,
      4,
    );
  });
});
