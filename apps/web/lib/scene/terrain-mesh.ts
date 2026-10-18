import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import type { ForestGround } from './ground-layers';
import type { RenderSurface } from './render-surface';
import { createTerrainMaterial } from './terrain-material';

/** Síť terénu a přepočet ztmavení pod vykácenými stromy (`TerrainMaterial.setHiddenTrees`). */
export interface TerrainMesh {
  mesh: Mesh;
  setHiddenTrees(hidden: ReadonlySet<number>): boolean;
}

/** Terén z hustší výškové sítě (hladké kopce, vyhloubené koryto), povrch míchá terénní materiál. */
export function createTerrainMesh(
  scene: Scene,
  l: Landscape,
  surface: RenderSurface,
  forest?: ForestGround,
): TerrainMesh {
  const n = surface.resolution;
  const positions = new Float32Array(n * n * 3);
  for (let v = 0; v < n * n; v++) {
    const { x, z } = surface.position(v);
    positions[v * 3] = x;
    positions[v * 3 + 1] = surface.heights[v]! * HEIGHT_SCALE;
    positions[v * 3 + 2] = z;
  }

  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }

  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;

  const mesh = new Mesh('terrain', scene);
  vertexData.applyToMesh(mesh);
  const material = createTerrainMaterial(scene, l, surface.stream, forest);
  mesh.material = material.material;
  mesh.freezeWorldMatrix();
  return { mesh, setHiddenTrees: (hidden) => material.setHiddenTrees(hidden) };
}
