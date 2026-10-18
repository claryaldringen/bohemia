// Pletené ploty ve scéně – polský plot pozemků i proutěný plot hřbitovů (woven-fence.ts). Díly
// (kůl, vyšší kůl branky, kus větve 1 m) jsou v models/dwellings/woven-fence.glb
// (tools/blender/dwellings.py) a kreslí se v instancích pro všechny ploty najednou – kůly stojí
// každý na svém místě terénu, větve vedou od kůlu ke kůlu i do svahu.
import type { Material } from '@babylonjs/core/Materials/material';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { appendMatrix, loadModelParts } from './instanced-model';
import { applySeasonSnow } from './season-materials';
import type { HeightFn } from './village-meshes';
import type { FenceStage } from './woven-fence';

export const WOVEN_FENCE_MODEL_URL = '/models/dwellings/woven-fence.glb';

const PARTS = ['fence-post', 'fence-post-gate', 'fence-rail'] as const;
/**
 * Sníh na plotu v zimě – jen poprašek: větve mají trojboký průřez s hřbetem nahoru a plné
 * pokrytí (jako střechy) by z pletiva udělalo bílé provázky.
 */
const FENCE_SNOW = 0.3;
type FencePart = (typeof PARTS)[number];

/**
 * Sdílené instance pletených plotů. Každý vlastník (pozemek, hřbitov) nastaví svůj plot přes
 * `set`, `commit` pak jednou přepíše instance – matice se počítají jen pro změněný plot.
 */
export class WovenFenceRenderer {
  private readonly owners = new Map<string, Record<FencePart, number[]>>();
  private parts: Map<string, Mesh> | null = null;
  private loading: Promise<void> | null = null;
  private dirty = false;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      /** Výška terénu pod kůlem (s převýšením). */
      height: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      onAsyncChange(): void;
      /** Úprava materiálu dílů (opar, roční období) jako u obydlí. */
      prepareMaterial(material: Material): void;
    },
  ) {}

  /** Plot vlastníka podle toho, co z něj stojí (null = žádný); projeví se po `commit`. */
  set(owner: string, stage: FenceStage | null): void {
    if (!stage || (stage.posts.length === 0 && stage.rails.length === 0)) {
      if (this.owners.delete(owner)) this.dirty = true;
      return;
    }
    const buffers: Record<FencePart, number[]> = {
      'fence-post': [],
      'fence-post-gate': [],
      'fence-rail': [],
    };
    const ground = stage.posts.map((post) => this.context.height(post.x, post.z));
    for (const [i, post] of stage.posts.entries()) {
      const y = ground[i]! - (post.sink ?? 0);
      if (post.lean) {
        // kůl rozpadlého plotu nakřivo (woven-fence.ts – decayFence)
        UP.set(post.lean.x, 1, post.lean.z).normalize();
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, UP, ROTATION);
        SCALE.set(1, 1, 1);
        POSITION.set(post.x, y, post.z);
        Matrix.ComposeToRef(SCALE, ROTATION, POSITION, MATRIX);
      } else Matrix.TranslationToRef(post.x, y, post.z, MATRIX);
      appendMatrix(buffers[post.gate ? 'fence-post-gate' : 'fence-post'], MATRIX);
    }
    // větev nad terénem u kůlů, mezi kůly rovně (průvěs má díl sám)
    for (const rail of stage.rails) {
      const ay = (ground[rail.a] ?? 0) + rail.height;
      const by = (ground[rail.b] ?? 0) + rail.height;
      segment(MATRIX, rail.ax, ay, rail.az, rail.bx, by, rail.bz);
      appendMatrix(buffers['fence-rail'], MATRIX);
    }
    this.owners.set(owner, buffers);
    this.dirty = true;
    void this.load();
  }

  /** Přepíše instance, když se od minula některý plot změnil. */
  commit(): void {
    if (!this.dirty || !this.parts) return;
    this.dirty = false;
    for (const name of PARTS) {
      const mesh = this.parts.get(name);
      if (!mesh) continue;
      const data: number[] = [];
      for (const buffers of this.owners.values()) {
        const part = buffers[name];
        for (let i = 0; i < part.length; i++) data.push(part[i]!);
      }
      if (data.length === 0) {
        mesh.setEnabled(false);
        continue;
      }
      mesh.thinInstanceSetBuffer('matrix', Float32Array.from(data), 16, true);
      mesh.setEnabled(true);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.owners.clear();
    for (const mesh of this.parts?.values() ?? []) mesh.dispose();
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const parts = await loadModelParts(
          this.scene,
          WOVEN_FENCE_MODEL_URL,
          'village-fence-',
          (m) => {
            // dřív než úprava vlastníka – ta pak sníh na střechy už nepřidá (jen jeden plugin)
            applySeasonSnow(m, FENCE_SNOW);
            this.context.prepareMaterial(m);
          },
        );
        if (!parts) return;
        if (this.disposed) {
          for (const mesh of parts.values()) mesh.dispose();
          return;
        }
        for (const mesh of parts.values()) {
          mesh.setEnabled(false);
          mesh.receiveShadows = true;
          this.context.addShadowCaster(mesh);
        }
        this.parts = parts;
        this.dirty = true;
        this.commit();
        this.context.onAsyncChange();
      } catch (error) {
        console.warn('Díly pleteného plotu se nepodařilo načíst.', error);
      }
    })();
    return this.loading;
  }
}

const MATRIX = new Matrix();
const SCALE = new Vector3();
const POSITION = new Vector3();
const ROTATION = new Quaternion();
const UP = new Vector3();

/** Matice kusu větve (díl je 1 m dlouhý podél +x od počátku) z bodu a do bodu b. */
function segment(
  out: Matrix,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const horizontal = Math.hypot(dx, dz);
  const length = Math.hypot(horizontal, dy);
  // natočení kolem svislé osy (Babylon: +x → (cos θ, 0, −sin θ)), pak náklon kolem osy z
  Quaternion.RotationYawPitchRollToRef(
    Math.atan2(-dz, dx),
    0,
    Math.atan2(dy, horizontal),
    ROTATION,
  );
  SCALE.set(length, 1, 1);
  POSITION.set(ax, ay, az);
  Matrix.ComposeToRef(SCALE, ROTATION, POSITION, out);
}
