import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Landscape, TerrainEdits } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import type { ForestGround } from './ground-layers';
import type { RenderSurface } from './render-surface';
import { terrainMeshHeight } from './drape';
import { createTerrainMaterial } from './terrain-material';
import {
  editSurfaceHeights,
  recomputeNormals,
  surfaceRegion,
  unionRegion,
  type SurfaceRegion,
} from './terrain-edits';
import { createTerrainPicker, type TerrainPicker } from './terrain-pick';

/** Síť terénu, pick po výškové síti a přepočet ztmavení pod vykácenými stromy. */
export interface TerrainMesh {
  mesh: Mesh;
  /** Bod terénu na paprsku – stejné trojúhelníky jako `scene.pick` na síti (terrain-pick.ts). */
  pick: TerrainPicker;
  setHiddenTrees(hidden: ReadonlySet<number>): boolean;
  /**
   * Úpravy terénu vozových cest (roads.md – Vozová cesta): síť se v úvozu sníží a v náspu zvedne
   * (výšková síť `surface` se mění na místě – výška terénu ve scéně, pick i obtisky podle ní).
   * Přepočet jen kolem cest a jen při změně (`edits.key`). Vrátí obdélník vrcholů, kde se terén
   * změnil, nebo null.
   */
  setTerrainEdits(edits: TerrainEdits): SurfaceRegion | null;
  /** Výška vykresleného terénu bez úprav (m s převýšením – na trojúhelnících sítě). */
  baseHeightAt(x: number, z: number): number;
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
  let picker = createTerrainPicker(positions, surface.resolution);
  // původní výšky (bez úprav terénu) – úpravy se počítají vždy z nich
  const base = new Float32Array(surface.heights);
  let editsKey = '';
  let edited: SurfaceRegion | null = null;
  const n = surface.resolution;
  return {
    mesh,
    pick: (ray) => picker(ray),
    baseHeightAt: (x, z) =>
      terrainMeshHeight({ resolution: n, heights: base, position: surface.position }, x, z),
    setHiddenTrees: (hidden) => material.setHiddenTrees(hidden),
    setTerrainEdits: (edits) => {
      if (edits.key === editsKey) return null;
      editsKey = edits.key;
      const next = edits.count > 0 ? surfaceRegion(surface, edits.bounds) : null;
      // i kde úpravy byly a už nejsou – terén se tam vrátí
      const scan = unionRegion(edited, next);
      edited = next;
      const region = scan ? editSurfaceHeights(surface, base, edits, scan) : null;
      if (!region) return null;
      for (let j = region.j0; j <= region.j1; j++) {
        for (let i = region.i0; i <= region.i1; i++) {
          const v = j * n + i;
          positions[v * 3 + 1] = surface.heights[v]! * HEIGHT_SCALE;
        }
      }
      const around = {
        i0: Math.max(0, region.i0 - 1),
        j0: Math.max(0, region.j0 - 1),
        i1: Math.min(n - 1, region.i1 + 1),
        j1: Math.min(n - 1, region.j1 + 1),
      };
      recomputeNormals(positions, normals, n, around);
      // buffery sítě nejsou dynamické – nové (jednou za změnu profilu, nejvýš jednou za den)
      mesh.setVerticesData(VertexBuffer.PositionKind, positions, false);
      mesh.setVerticesData(VertexBuffer.NormalKind, normals, false);
      mesh.refreshBoundingInfo();
      picker = createTerrainPicker(positions, n);
      return region;
    },
  };
}
