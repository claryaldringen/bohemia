import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import { tileCenter } from './tile-at';

const FOREST_FLOOR = [0.2, 0.29, 0.14] as const;
const RIVERBED = [0.33, 0.3, 0.22] as const;
const MEADOW_DRY = [0.6, 0.63, 0.34] as const;
const MEADOW_LUSH = [0.34, 0.56, 0.2] as const;

/** Terén jako jedna síť 128 × 128 vrcholů (středy políček), barvy podle povrchu a úrodnosti. */
export function createTerrainMesh(scene: Scene, l: Landscape): Mesh {
  const n = l.size;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const { worldX, worldZ } = tileCenter(l, x, y);
      positions.set([worldX, l.heights[i]! * HEIGHT_SCALE, worldZ], i * 3);
      // Jemná odchylka barvy podle polohy, aby plochy nepůsobily jednolitě.
      const jitter = 0.94 + ((Math.imul(x * 73856093, 19349663) ^ (y * 83492791)) & 0xff) / 2125;
      const [r, g, b] = colorOf(l.surface[i]!, l.fertility[i]!);
      colors.set([r * jitter, g * jitter, b * jitter, 1], i * 4);
    }
  }

  const indices: number[] = [];
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const a = y * n + x;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.colors = colors;

  const mesh = new Mesh('terrain', scene);
  vertexData.applyToMesh(mesh);
  const material = new StandardMaterial('terrain-material', scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  mesh.material = material;
  mesh.freezeWorldMatrix();
  return mesh;
}

function colorOf(surface: number, fertility: number): readonly [number, number, number] {
  if (surface === SURFACE_CODES.water) return RIVERBED;
  if (surface === SURFACE_CODES.forest) return FOREST_FLOOR;
  const t = fertility / 100;
  return [
    MEADOW_DRY[0] + (MEADOW_LUSH[0] - MEADOW_DRY[0]) * t,
    MEADOW_DRY[1] + (MEADOW_LUSH[1] - MEADOW_DRY[1]) * t,
    MEADOW_DRY[2] + (MEADOW_LUSH[2] - MEADOW_DRY[2]) * t,
  ];
}
