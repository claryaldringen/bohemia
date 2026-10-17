import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { createNoise2D } from 'simplex-noise';
import { HEIGHT_SCALE } from './constants';
import type { ForestField } from '@bohemia/game';
import type { RenderSurface } from './render-surface';

/**
 * Výška plochy korun nad zemí (m) a velikost „hrbolů“. Les kreslí impostory, plocha jen tmavě
 * vyplní mezery mezi nimi – je nižší než koruny a ztmavená jako stín pod nimi.
 */
const CANOPY_HEIGHT_M = 6;
const CROWN_BUMP_M = 2.5;
/**
 * Vzdálenost od hranice lesa (m), kde plocha vystupuje ze země a kde má plnou výšku. Pás před
 * tím patří jednotlivým stromům okraje a řidnoucímu lesu – mezi nimi je vidět lesní půda.
 */
const CANOPY_START_M = 26;
const CANOPY_FULL_M = 46;
/** Pod hranicí plochy korun se plocha zanoří pod terén – průsečík se zemí je hladký. */
const SINK_M = 2;
/** Ztmavení plochy korun – v mezerách mezi impostory je vidět stín, ne světlé koruny. */
const SHADOW = 0.6;
/** Koruny shora vyrenderované z modelů stromů – bezešvá dlaždice 48 × 48 m. */
const CANOPY_TEXTURE_URL = '/textures/terrain/canopy.jpg';
const CANOPY_TEXTURE_REPEAT_M = 48;

/**
 * Vnitřek lesa jako souvislá plocha korun (místo tisíců stromů) – zvlněná šumem, k vyhlazené
 * hranici lesa klesá pod zem; okraj zakryjí jednotlivé stromy.
 */
export function createCanopyMesh(
  scene: Scene,
  surface: RenderSurface,
  field: ForestField,
): Mesh | null {
  const n = surface.resolution;
  const bumps = createNoise2D(seededRandom(7));
  const tint = createNoise2D(seededRandom(11));
  const vertexIndex = new Int32Array(n * n).fill(-1);
  const inside = new Float32Array(n * n);
  for (let v = 0; v < n * n; v++) {
    const { x, z } = surface.position(v);
    inside[v] = field.distanceAt(x, z);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertex = (v: number): number => {
    if (vertexIndex[v]! >= 0) return vertexIndex[v]!;
    const { x, z } = surface.position(v);
    const rise = smoothstep(CANOPY_START_M, CANOPY_FULL_M, inside[v]!);
    const sink = SINK_M * (1 - smoothstep(CANOPY_START_M - 4, CANOPY_START_M, inside[v]!));
    const crowns = 0.7 * bumps(x / 24, z / 24) + 0.3 * bumps(x / 9 + 50, z / 9);
    const above = rise * (CANOPY_HEIGHT_M + crowns * CROWN_BUMP_M) - sink;
    positions.push(x, surface.heights[v]! * HEIGHT_SCALE + above, z);
    // Světlejší a tmavší skupiny korun – zakryjí i opakování dlaždice.
    const shade = 0.5 + 0.5 * tint(x / 70, z / 70);
    colors.push(
      SHADOW * (0.95 + 0.25 * shade),
      SHADOW * (1.0 + 0.15 * shade),
      SHADOW * (0.9 + 0.1 * shade),
      1,
    );
    uvs.push(x / CANOPY_TEXTURE_REPEAT_M, z / CANOPY_TEXTURE_REPEAT_M);
    vertexIndex[v] = positions.length / 3 - 1;
    return vertexIndex[v]!;
  };

  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const corners = [a, a + 1, a + n, a + n + 1];
      if (corners.every((v) => inside[v]! < CANOPY_START_M - 4)) continue;
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
