import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { IMPOSTOR_ATLAS, type ImpostorCell } from './impostor-atlas';
import { setStaticInstances } from './instanced-model';
import type { ImpostorPlacement } from './obstacle-scenery';

/** Jas obrázků stromů (nejvýš 1) – ladí se proti terénu, aby les nebyl tmavá skvrna ani bledý. */
const BRIGHTNESS = new Color3(0.92, 0.95, 0.92);
const ALPHA_CUTOFF = 0.45;
const CORNERS: readonly [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Vnitřek lesa z impostorů: pro každou buňku atlasu (a její zrcadlový obraz) jeden svislý
 * čtverec s instancemi. Čtverce se natáčejí k vodorovnému směru kamery – náklon kamery je pevný
 * a obrázky jsou vyrenderované právě pod ním. Když se atlas nenačte, les zůstane bez impostorů.
 */
export async function addImpostors(
  scene: Scene,
  camera: ArcRotateCamera,
  placements: readonly ImpostorPlacement[],
  groundHeight: (worldX: number, worldZ: number) => number,
): Promise<void> {
  if (placements.length === 0) return;
  const texture = await loadTexture(scene);
  if (scene.isDisposed) return;

  const material = new StandardMaterial('impostor-material', scene);
  material.diffuseTexture = texture;
  texture.hasAlpha = true;
  // Barva instancí přepne alpha test až za všechny výpočty alfy – alfa z textury tam musí
  // vstoupit výslovně, jinak se nic neořízne.
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = ALPHA_CUTOFF;
  // Bez světel je difuzní složka nulová; výsledek = (emissive + ambient) × barva textury.
  material.disableLighting = true;
  material.emissiveColor = BRIGHTNESS;
  material.backFaceCulling = false;

  const quads = IMPOSTOR_ATLAS.cells
    .flatMap((cell, index) =>
      [false, true].map((mirror) => {
        const trees = placements.filter((p) => p.cell === index && p.mirror === mirror);
        return trees.length > 0
          ? createQuad(scene, material, cell, index, mirror, trees, groundHeight)
          : null;
      }),
    )
    .filter((quad): quad is ImpostorQuad => quad !== null);

  // Čtverce se natočí jen před snímkem, kdy se změnil směr kamery (kreslí se jen při změně).
  let lastAlpha = Number.NaN;
  scene.onBeforeRenderObservable.add(() => {
    if (camera.alpha === lastAlpha) return;
    lastAlpha = camera.alpha;
    const right = new Vector3(-Math.sin(camera.alpha), 0, Math.cos(camera.alpha));
    for (const quad of quads) quad.face(right);
  });
}

interface ImpostorQuad {
  face(right: Vector3): void;
}

function createQuad(
  scene: Scene,
  material: StandardMaterial,
  cell: ImpostorCell,
  index: number,
  mirror: boolean,
  trees: readonly ImpostorPlacement[],
  groundHeight: (worldX: number, worldZ: number) => number,
): ImpostorQuad {
  const { columns, rows, elevation } = IMPOSTOR_ATLAS;
  const column = index % columns;
  const row = Math.floor(index / columns);
  // Textura má počátek v levém dolním rohu, řádky atlasu jdou odshora.
  const uvs = CORNERS.flatMap(([u, v]) => [
    (column + (mirror ? 1 - u : u)) / columns,
    1 - (row + 1) / rows + v / rows,
  ]);
  const pivotU = mirror ? 1 - cell.pivotU : cell.pivotU;
  const stretch = 1 / Math.cos(elevation);

  const vertexData = new VertexData();
  vertexData.positions = new Float32Array(12);
  vertexData.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  vertexData.uvs = uvs;
  vertexData.indices = [0, 1, 2, 0, 2, 3];
  const mesh = new Mesh(`impostors-${index}${mirror ? '-m' : ''}`, scene);
  vertexData.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.isPickable = false;
  // Instance jsou po celé krajině – ořezávání po meshi by nic neušetřilo.
  mesh.alwaysSelectAsActiveMesh = true;

  const matrices = new Float32Array(trees.length * 16);
  const colors = new Float32Array(trees.length * 4);
  const matrix = new Matrix();
  trees.forEach((t, i) => {
    Matrix.ComposeToRef(
      new Vector3(t.scale, t.scale, t.scale),
      Quaternion.Identity(),
      new Vector3(t.worldX, groundHeight(t.worldX, t.worldZ), t.worldZ),
      matrix,
    );
    matrix.copyToArray(matrices, i * 16);
    // Světlejší a tmavší stromy – les není jednolitý.
    const shade =
      0.86 + 0.22 * fract(Math.sin(t.worldX * 12.9898 + t.worldZ * 78.233) * 43758.5453);
    colors.set([shade, shade, shade * 0.97, 1], i * 4);
  });
  // Id stromů – instance vykácených stromů se skryjí (InstanceHider).
  setStaticInstances(mesh, matrices, { colors, ids: Uint32Array.from(trees, (t) => t.id) });

  const positions = new Float32Array(12);
  return {
    face(right: Vector3): void {
      CORNERS.forEach(([u, v], k) => {
        const across = (u - pivotU) * cell.sideM;
        const up = (v - cell.pivotV) * cell.sideM * stretch;
        positions[k * 3] = right.x * across;
        positions[k * 3 + 1] = up;
        positions[k * 3 + 2] = right.z * across;
      });
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);
    },
  };
}

function loadTexture(scene: Scene): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const texture: Texture = new Texture(IMPOSTOR_ATLAS.url, scene, {
      samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      onLoad: () => resolve(texture),
      onError: (message, exception) => {
        texture.dispose();
        reject(exception ?? new Error(message ?? 'Atlas impostorů se nepodařilo načíst.'));
      },
    });
  });
}

function fract(x: number): number {
  return x - Math.floor(x);
}
