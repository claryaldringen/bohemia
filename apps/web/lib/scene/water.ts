import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { HEIGHT_SCALE } from './constants';
import { CHANNEL_HALF_WIDTH_M, type RenderSurface } from './render-surface';

/** Hloubka, od které je voda plně neprůhledná (m) – mělčí voda u břehu prosvítá. */
const OPAQUE_DEPTH_M = 0.5;

/**
 * Hladina potoka jako souvislá plocha nad vyhloubeným korytem (podle 0 A.D.): v každém bodě
 * hloubka = hladina − terén, z hloubky průhlednost. Okraj vody plynule kopíruje břeh.
 */
export function createWaterMesh(scene: Scene, surface: RenderSurface): Mesh | null {
  const n = surface.resolution;
  const vertexIndex = new Int32Array(n * n).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = (v: number): number => {
    if (vertexIndex[v]! >= 0) return vertexIndex[v]!;
    const { x, z } = surface.position(v);
    const level = surface.waterLevel[v]!;
    const depth = Math.min(1, Math.max(0, (level - surface.heights[v]!) / OPAQUE_DEPTH_M));
    // Obrys vody podle vzdálenosti od hladké osy – průsečík s terénem na mřížce by byl zubatý.
    const distance = surface.stream.nearest(x, z).distance;
    const edge = 1 - smoothstep(CHANNEL_HALF_WIDTH_M - 2.5, CHANNEL_HALF_WIDTH_M + 0.5, distance);
    positions.push(x, level * HEIGHT_SCALE, z);
    colors.push(1, 1, 1, Math.min(edge, 0.35 + 0.65 * depth));
    vertexIndex[v] = positions.length / 3 - 1;
    return vertexIndex[v]!;
  };

  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const corners = [a, a + 1, a + n, a + n + 1];
      // Jen čtverce, kde je hladina známá a aspoň jeden roh je pod vodou.
      if (corners.some((v) => !Number.isFinite(surface.waterLevel[v]!))) continue;
      if (
        corners.every(
          (v) =>
            surface.stream.nearest(surface.position(v).x, surface.position(v).z).distance >
            CHANNEL_HALF_WIDTH_M + 0.5,
        )
      )
        continue;
      const [va, vb, vc, vd] = corners.map(vertex) as [number, number, number, number];
      indices.push(va, vb, vc, vb, vd, vc);
    }
  }
  if (indices.length === 0) return null;

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.colors = colors;
  const mesh = new Mesh('water', scene);
  vertexData.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;

  const material = new StandardMaterial('water-material', scene);
  // Kalná říční voda – dno (textura bahna) pod ní tmavne s hloubkou.
  material.diffuseColor = new Color3(0.2, 0.32, 0.36);
  material.specularColor = new Color3(0.55, 0.55, 0.5);
  material.specularPower = 96;
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
