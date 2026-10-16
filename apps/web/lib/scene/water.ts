import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import { tileCenter } from './tile-at';

/** Hladina nad dnem koryta (m). */
const WATER_DEPTH_M = 0.6;

/** Hladina potoka – čtverec nad každým vodním políčkem. */
export function createWaterMesh(scene: Scene, l: Landscape): Mesh | null {
  const half = l.cellSizeM / 2 + 0.5;
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  for (let y = 0; y < l.size; y++) {
    for (let x = 0; x < l.size; x++) {
      const i = y * l.size + x;
      if (l.surface[i] !== SURFACE_CODES.water) continue;
      const { worldX, worldZ } = tileCenter(l, x, y);
      const level = (l.heights[i]! + WATER_DEPTH_M) * HEIGHT_SCALE;
      const base = positions.length / 3;
      positions.push(
        worldX - half,
        level,
        worldZ - half,
        worldX + half,
        level,
        worldZ - half,
        worldX - half,
        level,
        worldZ + half,
        worldX + half,
        level,
        worldZ + half,
      );
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  if (positions.length === 0) return null;

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  const mesh = new Mesh('water', scene);
  vertexData.applyToMesh(mesh);
  const material = new StandardMaterial('water-material', scene);
  material.diffuseColor = new Color3(0.2, 0.4, 0.55);
  material.specularColor = new Color3(0.35, 0.35, 0.35);
  material.alpha = 0.85;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}
