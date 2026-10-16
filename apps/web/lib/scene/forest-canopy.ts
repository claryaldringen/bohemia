import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import { HEIGHT_SCALE } from './constants';
import { forestDepth } from './forest-depth';
import { RENDER_SUBDIVISION, type RenderSurface } from './render-surface';

/** Výška korun nad zemí (m) a velikost „hrbolů“ jednotlivých korun. */
const CANOPY_HEIGHT_M = 11;
const CROWN_BUMP_M = 2.5;
/** Koruny začínají uprostřed krajní řady lesa a plnou výšku mají od třetí řady. */
const CANOPY_START_DEPTH = 1.2;
const CANOPY_FULL_DEPTH = 3;
/** Koruny shora vyrenderované z modelů stromů – bezešvá dlaždice 48 × 48 m. */
const CANOPY_TEXTURE_URL = '/textures/terrain/canopy.jpg';
const CANOPY_TEXTURE_REPEAT_M = 48;

/**
 * Vnitřek lesa jako souvislá plocha korun (místo tisíců stromů) – zvlněná šumem, na okraji
 * klesá k zemi, kde ji zakryjí jednotlivé stromy krajních řad.
 */
export function createCanopyMesh(scene: Scene, l: Landscape, surface: RenderSurface): Mesh | null {
  const depth = forestDepth(l);
  const n = surface.resolution;
  const bumps = createNoise2D(seededRandom(7));
  const tint = createNoise2D(seededRandom(11));
  const vertexIndex = new Int32Array(n * n).fill(-1);
  const depthAt = new Float32Array(n * n);
  for (let v = 0; v < n * n; v++) depthAt[v] = vertexDepth(l, depth, v % n, Math.floor(v / n));

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertex = (v: number): number => {
    if (vertexIndex[v]! >= 0) return vertexIndex[v]!;
    const { x, z } = surface.position(v);
    const rise = smoothstep(CANOPY_START_DEPTH, CANOPY_FULL_DEPTH, depthAt[v]!);
    const crowns = 0.7 * bumps(x / 24, z / 24) + 0.3 * bumps(x / 9 + 50, z / 9);
    const above = rise * (CANOPY_HEIGHT_M + crowns * CROWN_BUMP_M);
    positions.push(x, surface.heights[v]! * HEIGHT_SCALE + above, z);
    // Světlejší a tmavší skupiny korun – zakryjí i opakování dlaždice.
    const shade = 0.5 + 0.5 * tint(x / 70, z / 70);
    colors.push(0.95 + 0.25 * shade, 1.0 + 0.15 * shade, 0.9 + 0.1 * shade, 1);
    uvs.push(x / CANOPY_TEXTURE_REPEAT_M, z / CANOPY_TEXTURE_REPEAT_M);
    vertexIndex[v] = positions.length / 3 - 1;
    return vertexIndex[v]!;
  };

  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const corners = [a, a + 1, a + n, a + n + 1];
      if (corners.some((v) => depthAt[v]! < CANOPY_START_DEPTH)) continue;
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
  vertexData.uvs = uvs;
  const mesh = new Mesh('forest-canopy', scene);
  vertexData.applyToMesh(mesh);

  const material = new StandardMaterial('forest-canopy-material', scene);
  const leaves = new Texture(CANOPY_TEXTURE_URL, scene);
  leaves.anisotropicFilteringLevel = 4;
  material.diffuseTexture = leaves;
  material.specularColor = Color3.Black();
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

/** Hloubka lesa v bodě sítě – bilineárně mezi středy políček (síť začíná ve středu políčka 0). */
function vertexDepth(l: Landscape, depth: Uint16Array, i: number, j: number): number {
  const u = i / RENDER_SUBDIVISION;
  const v = j / RENDER_SUBDIVISION;
  const x0 = Math.min(l.size - 1, Math.floor(u));
  const y0 = Math.min(l.size - 1, Math.floor(v));
  const x1 = Math.min(l.size - 1, x0 + 1);
  const y1 = Math.min(l.size - 1, y0 + 1);
  const fx = u - x0;
  const fy = v - y0;
  const d = (x: number, y: number): number => depth[y * l.size + x]!;
  const top = d(x0, y0) + (d(x1, y0) - d(x0, y0)) * fx;
  const bottom = d(x0, y1) + (d(x1, y1) - d(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
