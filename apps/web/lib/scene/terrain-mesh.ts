import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import type { ForestGround } from './ground-layers';
import type { RenderSurface } from './render-surface';
import { createTerrainMaterial } from './terrain-material';
import { createTerrainPicker, type TerrainPicker } from './terrain-pick';

/** Síť terénu, pick po výškové síti a přepočet ztmavení pod vykácenými stromy. */
export interface TerrainMesh {
  mesh: Mesh;
  /** Bod terénu na paprsku – stejné trojúhelníky jako `scene.pick` na síti (terrain-pick.ts). */
  pick: TerrainPicker;
  setHiddenTrees(hidden: ReadonlySet<number>): boolean;
}

/**
 * Vrcholy a trojúhelníky terénu z výškové sítě: mřížka `resolution` × `resolution`, čtverec
 * (i, j) dělí úhlopříčka z (i + 1, j) do (i, j + 1) – trojúhelníky (a, b, c) a (b, d, c).
 */
export function terrainGeometry(
  surface: Pick<RenderSurface, 'resolution' | 'heights' | 'position'>,
): {
  positions: Float32Array;
  indices: Uint32Array;
} {
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
  return { positions, indices };
}

/** Terén z hustší výškové sítě (hladké kopce, vyhloubené koryto), povrch míchá terénní materiál. */
export function createTerrainMesh(
  scene: Scene,
  l: Landscape,
  surface: RenderSurface,
  forest?: ForestGround,
): TerrainMesh {
  const { positions, indices } = terrainGeometry(surface);
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
  return {
    mesh,
    pick: createTerrainPicker(positions, surface.resolution),
    setHiddenTrees: (hidden) => material.setHiddenTrees(hidden),
  };
}
