// Žlutý kroužek pod vybranou postavou, spřežením nebo vozem (villagers.md – Výběr postavy):
// čtverec s průhledným mezikružím, jedna thin instance položená na svah, kreslí se po obtiscích
// a stínech postav. Elipsa (délka × šířka) se natočí ve směru spřežení či vozu.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/** Barva kroužku výběru. */
export const RING_COLOR: readonly [number, number, number] = [1, 0.85, 0.25];
/** Kroužek nad terénem (m) – nad obtisky a stíny. */
export const RING_LIFT_M = 0.05;
/** Kroužek pod postavou (m při měřítku 1). */
export const RING_SIZE_M = 1.6;

const TMP_F = new Vector3();
const TMP_R = new Vector3();
const TMP_U = new Vector3();

/**
 * Matice elipsy na terénu: střed (x, y, z), osa délky ve směru (hx, hz) nakloněná podle svahu,
 * šířka napříč (m). Řádkově jako Babylon (x = napříč, y = normála, z = délka).
 */
export function ringMatrix(
  height: (x: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  length: number,
  width: number,
  hx: number,
  hz: number,
  out: Matrix,
): Matrix {
  const e = 0.4;
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  const l = Math.hypot(hx, hz) || 1;
  const fx = hx / l;
  const fz = hz / l;
  // napříč = (fz, −fx) v půdorysu – stoupání podle svahu v obou osách
  const f = TMP_F.set(fx, gx * fx + gz * fz, fz).normalize();
  const r = TMP_R.set(fz, gx * fz - gz * fx, -fx).normalize();
  const u = Vector3.CrossToRef(f, r, TMP_U).normalize();
  if (u.y < 0) u.scaleInPlace(-1);
  Matrix.FromValuesToRef(
    r.x * width,
    r.y * width,
    r.z * width,
    0,
    u.x,
    u.y,
    u.z,
    0,
    f.x * length,
    f.y * length,
    f.z * length,
    0,
    x,
    y,
    z,
    1,
    out,
  );
  return out;
}

/** Kroužek výběru – jedna instance; `show` ho položí, `hide` schová. */
export class SelectionRing {
  readonly mesh: Mesh;
  private readonly matrices = new Float32Array(16);
  private readonly matrix = new Matrix();

  constructor(scene: Scene, name: string) {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
    data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.indices = [0, 2, 1, 0, 3, 2];
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.alphaIndex = 6;
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const r = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
        // mezikruží 0,72–0,95 s měkkými okraji
        const a = Math.max(0, Math.min(1, (r - 0.68) / 0.06, (0.97 - r) / 0.04));
        const o = (j * size + i) * 4;
        pixels[o] = Math.round(255 * RING_COLOR[0]);
        pixels[o + 1] = Math.round(255 * RING_COLOR[1]);
        pixels[o + 2] = Math.round(255 * RING_COLOR[2]);
        pixels[o + 3] = Math.round(255 * 0.95 * a);
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      size,
      size,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.name = name;
    const material = new StandardMaterial(`${name}-material`, scene);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = new Color3(...RING_COLOR);
    material.disableLighting = true;
    material.opacityTexture = texture;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    material.zOffset = -3;
    mesh.material = material;
    mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    mesh.setEnabled(false);
    this.mesh = mesh;
  }

  /**
   * Položí kroužek na terén: střed (x, z) ve výšce `y` (země pod ním), elipsa `length` × `width`
   * (m) ve směru (hx, hz); kruh – stejná délka i šířka.
   */
  show(
    height: (x: number, z: number) => number,
    x: number,
    y: number,
    z: number,
    length: number,
    width = length,
    hx = 0,
    hz = 1,
  ): void {
    ringMatrix(height, x, y + RING_LIFT_M, z, length, width, hx, hz, this.matrix);
    this.matrix.copyToArray(this.matrices, 0);
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.setEnabled(true);
  }

  hide(): void {
    this.mesh.setEnabled(false);
  }

  dispose(): void {
    this.mesh.material?.dispose(true, true);
    this.mesh.dispose();
  }
}
