import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { DecalGrid, Point } from './village-layout';

const TERRAIN_TEXTURES = '/textures/terrain/';
/** Krok (m) pro odhad sklonu terénu pod obtiskem (normály jako u terénu). */
const NORMAL_STEP_M = 1.2;

export type HeightFn = (x: number, z: number) => number;

export interface DecalOptions {
  /** Výška terénu ve scéně (s převýšením) – obtisk leží těsně nad ní. */
  height: HeightFn;
  /** Hladký terén pro normály (bilineární) – osvětlení jako terén pod obtiskem. */
  smoothHeight?: HeightFn;
  lift: number;
  /** Barva vrcholu (násobí texturu) – pevná, nebo podle bodu. */
  color: [number, number, number] | ((x: number, z: number, v: number) => [number, number, number]);
  /** Násobek krytí všech vrcholů. */
  alpha?: number;
  /** Mapování textury: světové souřadnice / délka opakování, nebo vlastní UV. */
  uv?: number | ((x: number, z: number) => [number, number]);
}

/** Obtisk na terénu ze sítě bodů (`decalGrid`, `earthPatch`) – výšky, normály, UV, barvy. */
export function createDecalMesh(
  scene: Scene,
  name: string,
  grid: DecalGrid,
  o: DecalOptions,
): Mesh {
  const count = grid.alphas.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 4);
  const smooth = o.smoothHeight ?? o.height;
  const e = NORMAL_STEP_M;
  for (let v = 0; v < count; v++) {
    const x = grid.positions[v * 2]!;
    const z = grid.positions[v * 2 + 1]!;
    positions[v * 3] = x;
    positions[v * 3 + 1] = o.height(x, z) + o.lift;
    positions[v * 3 + 2] = z;
    const nx = smooth(x - e, z) - smooth(x + e, z);
    const nz = smooth(x, z - e) - smooth(x, z + e);
    const length = Math.hypot(nx, 2 * e, nz);
    normals[v * 3] = nx / length;
    normals[v * 3 + 1] = (2 * e) / length;
    normals[v * 3 + 2] = nz / length;
    if (typeof o.uv === 'function') {
      const [u, w] = o.uv(x, z);
      uvs[v * 2] = u;
      uvs[v * 2 + 1] = w;
    } else {
      const repeat = o.uv ?? 20;
      uvs[v * 2] = x / repeat;
      uvs[v * 2 + 1] = z / repeat;
    }
    const color = typeof o.color === 'function' ? o.color(x, z, v) : o.color;
    colors[v * 4] = color[0];
    colors[v * 4 + 1] = color[1];
    colors[v * 4 + 2] = color[2];
    colors[v * 4 + 3] = grid.alphas[v]! * (o.alpha ?? 1);
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.colors = colors;
  data.indices = grid.indices;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/** Tenký pás položený na terén (obrys pole, okraj půdorysu) ze `stripSegments`. */
export function createStripMesh(
  scene: Scene,
  name: string,
  segments: readonly Point[][],
  height: HeightFn,
  lift: number,
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const strip of segments) {
    const base = positions.length / 3;
    for (const [x, z] of strip) {
      positions.push(x, height(x, z) + lift, z);
      normals.push(0, 1, 0);
    }
    for (let k = 0; k + 3 < strip.length; k += 2) {
      const a = base + k;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

/**
 * Materiál obtisku: textura terénu (nebo bez textury) násobená barvou a krytím vrcholů.
 * Obtisk leží těsně nad terénem a posunem hloubky (zOffset) vyhraje nad ním i v dálce;
 * rub nevadí (leží na zemi).
 */
export function createDecalMaterial(
  scene: Scene,
  name: string,
  options: { texture?: string; texturePath?: string; zOffset?: number; emissive?: Color3 } = {},
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.zOffset = options.zOffset ?? -2;
  const file =
    options.texturePath ?? (options.texture ? `${TERRAIN_TEXTURES}${options.texture}.jpg` : null);
  if (file) {
    const texture = new Texture(file, scene);
    texture.anisotropicFilteringLevel = 8;
    material.diffuseTexture = texture;
  }
  if (options.emissive) {
    // Duch při umisťování: plná barva bez stínování, ať je zelená / červená jasně čitelná.
    material.disableLighting = true;
    material.emissiveColor = options.emissive;
    material.diffuseColor = Color3.Black();
  }
  return material;
}
