import '@babylonjs/core/Culling/ray';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray.core';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import {
  WAGON_ROAD,
  editedHeight,
  groundHeightAt,
  profileEdits,
  type Landscape,
  type RoadProfilePoint,
} from '@bohemia/game';
import { afterAll, describe, expect, it } from 'vitest';
import { terrainMeshHeight } from '../drape';
import { editSurfaceHeights, recomputeNormals, surfaceRegion } from '../terrain-edits';
import { terrainGeometry } from '../terrain-mesh';
import { createTerrainPicker, type TerrainRay } from '../terrain-pick';

// Úpravy terénu vozové cesty ve scéně (roads.md – Vozová cesta): síť scény se v úvozu sníží
// stejnou funkcí jako terén jádra – pláň v navržené výšce, pick terénu po úpravě sedí s Babylonem.

/** Svah 12 % po ose z na síti scény (krok 3,75 m), krajina 16 × 16 políček po 15 m. */
const N = 61;
const STEP = 3.75;
const ORIGIN = -112.5;
const SLOPE = 0.12;
const natural = (z: number): number => 20 + (z - ORIGIN) * SLOPE;

function surface(): {
  resolution: number;
  heights: Float32Array;
  waterLevel: Float32Array;
  position: (v: number) => { x: number; z: number };
} {
  const heights = new Float32Array(N * N);
  for (let v = 0; v < N * N; v++) heights[v] = natural(ORIGIN + Math.floor(v / N) * STEP);
  return {
    resolution: N,
    heights,
    waterLevel: new Float32Array(N * N).fill(-Infinity),
    position: (v) => ({ x: ORIGIN + (v % N) * STEP, z: ORIGIN + Math.floor(v / N) * STEP }),
  };
}

/** Krajina jádra se stejným svahem (výšky středů políček). */
const LANDSCAPE: Landscape = {
  size: 16,
  cellSizeM: 15,
  heights: Float32Array.from({ length: 256 }, (_, i) =>
    natural(-120 + 7.5 + Math.floor(i / 16) * 15),
  ),
  surface: new Uint8Array(256),
  fertility: new Uint8Array(256),
  villageSite: { x: 8, y: 8 },
  stream: [],
  obstacleLayer: null,
};

/** Úvoz: pláň po ose z se sklonem 6 % (svah 12 % – uprostřed až ≈ 2,7 m pod terénem). */
const PROFILE: RoadProfilePoint[] = [];
for (let z = -90; z <= 90; z += 2) {
  PROFILE.push({ x: 0, z, y: Math.round((natural(0) + z * WAGON_ROAD.maxGrade) * 100) / 100 });
}
const EDITS = profileEdits(PROFILE, []);

const engine = new NullEngine({
  renderWidth: 800,
  renderHeight: 600,
  textureSize: 256,
  deterministicLockstep: false,
  lockstepMaxSteps: 1,
});
const scene = new Scene(engine);
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

describe('úpravy terénu ve scéně', () => {
  it('pláň vyjde ve scéně i v jádru v navržené výšce (stejná funkce, jiný původní terén)', () => {
    const s = surface();
    const base = new Float32Array(s.heights);
    const region = surfaceRegion(s, EDITS.bounds)!;
    expect(editSurfaceHeights(s, base, EDITS, region)).not.toBeNull();
    for (const z of [-60, -22.5, 0, 33.75, 60]) {
      // vrchol sítě na ose (x = 0 je bod sítě) – pláň
      const v = Math.round((z - ORIGIN) / STEP) * N + Math.round((0 - ORIGIN) / STEP);
      const design = natural(0) + s.position(v).z * WAGON_ROAD.maxGrade;
      expect(s.heights[v]).toBeCloseTo(design, 2);
      expect(groundHeightAt(EDITS, LANDSCAPE, 0, s.position(v).z)).toBeCloseTo(design, 2);
      // úvoz – pod terénem
      if (z > 10) expect(s.heights[v]).toBeLessThan(base[v]! - 0.5);
    }
    // daleko od cesty beze změny
    const far = 2 * N + 2;
    expect(s.heights[far]).toBe(base[far]);
    // svah 1 : 1 za plání
    const v = Math.round((60 - ORIGIN) / STEP) * N + Math.round((7.5 - ORIGIN) / STEP);
    const { x, z } = s.position(v);
    expect(s.heights[v]).toBeCloseTo(editedHeight(EDITS, x, z, base[v]!), 5);
  });

  it('pick terénu po úpravě sedí se `scene.pick` na upravené síti a s výškou obtisků', () => {
    const s = surface();
    const base = new Float32Array(s.heights);
    editSurfaceHeights(s, base, EDITS, surfaceRegion(s, EDITS.bounds)!);
    const { positions, indices } = terrainGeometry(s);
    const normals = new Float32Array(positions.length);
    recomputeNormals(positions, normals, N, { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
    const reference = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, reference);
    for (let k = 0; k < normals.length; k++) expect(normals[k]).toBeCloseTo(reference[k]!, 5);
    const mesh = new Mesh('terrain', scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.applyToMesh(mesh);
    const pick = createTerrainPicker(positions, N);
    for (const [x, z] of [
      [0.4, 40],
      [3.1, 61.2],
      [-6.2, 70.4],
      [1.7, -20],
    ] as const) {
      const ray = new Ray(new Vector3(x + 20, 120, z - 30), new Vector3(-20, -100, 30).normalize());
      const hit = scene.pickWithRay(ray, (m) => m === mesh);
      const ours = pick(ray as TerrainRay);
      expect(ours).not.toBeNull();
      expect(ours!.x).toBeCloseTo(hit!.pickedPoint!.x, 3);
      expect(ours!.y).toBeCloseTo(hit!.pickedPoint!.y, 3);
      expect(ours!.z).toBeCloseTo(hit!.pickedPoint!.z, 3);
      expect(terrainMeshHeight(s, ours!.x, ours!.z)).toBeCloseTo(ours!.y, 3);
    }
    mesh.dispose();
  });
});
