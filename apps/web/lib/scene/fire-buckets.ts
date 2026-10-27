// Vědra řetězu hašení (disasters.md – Hašení – řetěz s vědry, Ve scéně): jeden mesh vědra
// (procedurální válec s obručemi – vlastní práce, CC0) v tenkých instancích, polohy z rozvrhu
// řetězu (villager-plan-fire.ts – `fireBuckets`) ve stejném čase jako postavy. Samostatný mesh,
// ne rekvizita postavy – postava má právě 8 vertex bufferů (limit WebGPU). Jen v den požáru;
// při omezeném pohybu se `animate` nevolá a vědra stojí.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneFire } from '../village-view';
import { applyGammaFog } from './gamma-fog';
import {
  fireBuckets,
  fireChainKey,
  fireChainLayout,
  maxFireBuckets,
  type BucketPose,
  type FireChainLayout,
} from './villager-plan-fire';
import { villagerSeconds } from './villager-motion';

/** Vědro (m): dřevěné, nahoře širší – velké jako postavy (FIGURE_SCALE ≈ 1,2). */
const BUCKET = { top: 0.42, bottom: 0.34, height: 0.4 } as const;
/** Dál od kamery (m) se vědra nehýbou – jako lidé. */
const ANIMATE_RANGE_M = 1500;

export class FireBuckets {
  private mesh: Mesh | null = null;
  private layout: FireChainLayout | null = null;
  private key = '';
  private matrices = new Float32Array(0);
  private readonly poses: BucketPose[] = [];
  private bounds: BoundingInfo | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly options: { groundHeight: (x: number, z: number) => number },
  ) {}

  /** Řetěz dne požáru (`SceneVillage.fire`); vrátí true, když se změnil. */
  set(fire: SceneFire | undefined): boolean {
    const layout = fireChainLayout(fire);
    const key = fireChainKey(layout);
    if (key === this.key) return false;
    this.key = key;
    this.layout = layout;
    if (!layout) {
      this.mesh?.dispose(false, true);
      this.mesh = null;
      this.bounds = null;
      return true;
    }
    const xs = layout.stations.map((s) => s.x);
    const zs = layout.stations.map((s) => s.z);
    const ys = layout.stations.map((s) => this.options.groundHeight(s.x, s.z));
    this.bounds = new BoundingInfo(
      new Vector3(Math.min(...xs) - 2, Math.min(...ys) - 1, Math.min(...zs) - 2),
      new Vector3(Math.max(...xs) + 2, Math.max(...ys) + 3, Math.max(...zs) + 2),
    );
    this.matrices = new Float32Array(maxFireBuckets(layout) * 16);
    const mesh = this.ensureMesh();
    mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    mesh.thinInstanceCount = 0;
    return true;
  }

  /**
   * Vědra na okamžik `nowMs` (skutečný čas – jako postavy). Bez kamery vždy; s kamerou jen
   * v záběru. Vrátí true, když je co překreslit.
   */
  animate(nowMs: number, camera: Camera | null): boolean {
    const layout = this.layout;
    const mesh = this.mesh;
    if (!layout || !mesh || !this.bounds) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    const n = fireBuckets(layout, villagerSeconds(nowMs), this.poses);
    const m = this.matrices;
    for (let i = 0; i < n; i++) {
      const b = this.poses[i]!;
      const y = this.options.groundHeight(b.x, b.z) + b.up - BUCKET.height / 2;
      // osa x vědra ve směru (hx, hz), osa y nahoru, osa z kolmo – jen otočení kolem svislice
      const o = i * 16;
      m[o] = b.hx;
      m[o + 1] = 0;
      m[o + 2] = b.hz;
      m[o + 3] = 0;
      m[o + 4] = 0;
      m[o + 5] = 1;
      m[o + 6] = 0;
      m[o + 7] = 0;
      m[o + 8] = -b.hz;
      m[o + 9] = 0;
      m[o + 10] = b.hx;
      m[o + 11] = 0;
      m[o + 12] = b.x;
      m[o + 13] = y;
      m[o + 14] = b.z;
      m[o + 15] = 1;
    }
    mesh.thinInstanceBufferUpdated('matrix');
    mesh.thinInstanceCount = n;
    return true;
  }

  dispose(): void {
    this.mesh?.dispose(false, true);
    this.mesh = null;
    this.layout = null;
    this.key = '';
  }

  private ensureMesh(): Mesh {
    if (this.mesh) return this.mesh;
    const mesh = CreateCylinder(
      'fire-buckets',
      {
        diameterTop: BUCKET.top,
        diameterBottom: BUCKET.bottom,
        height: BUCKET.height,
        tessellation: 10,
      },
      this.scene,
    );
    // dřevěné vědro – tmavé dubové dužiny (PBR jako modely vsi, opar podle gama)
    const material = new PBRMaterial('fire-buckets', this.scene);
    material.albedoColor = new Color3(0.36, 0.24, 0.13);
    material.metallic = 0;
    material.roughness = 0.95;
    applyGammaFog(material);
    mesh.material = material;
    mesh.isPickable = false;
    // vědra jsou všude po řadě – ořez podle meshe by je schoval
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;
    return mesh;
  }
}
