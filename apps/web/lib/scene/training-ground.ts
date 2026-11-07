// Cvičiště vojvodovy rodiny ve scéně (docs/design/lord.md – Terče a cvičiště na dvorku): díly
// z training.glb (tools/blender/training_ground.py – vlastní, CC0) v nehybných instancích podle
// rozmístění z training-ground-layout.ts. Instance se mění jen při změně dvorce (jiné cvičiště).
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { instanceMatrices, loadModelParts, setStaticInstances } from './instanced-model';
import type { TrainingGround, TrainingPart } from './training-ground-layout';
import { FIGURE_SCALE } from './villager-plan-types';
import type { HeightFn } from './village-meshes';

const TRAINING_MODEL_URL = '/models/training/training.glb';
const PARTS: readonly TrainingPart[] = ['target', 'post', 'rack', 'hitch'];

/** Otisk cvičiště – instance se přepočítají, jen když se změní. */
function groundKey(ground: TrainingGround | null): string {
  if (!ground) return '';
  return ground.pieces.map((p) => `${p.part}:${p.x.toFixed(2)}:${p.z.toFixed(2)}`).join('|');
}

export class TrainingGroundRenderer {
  private parts: Map<string, Mesh> | null = null;
  private loading: Promise<void> | null = null;
  private ground: TrainingGround | null = null;
  private key = '';
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      groundHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      onAsyncChange(): void;
      /** Úprava materiálu (opar, sníh) jako u obydlí. */
      prepareMaterial(material: Material): void;
    },
  ) {}

  /** Cvičiště vsi (nebo žádné); vrátí true, když se ve scéně něco změnilo. */
  update(ground: TrainingGround | null): boolean {
    const key = groundKey(ground);
    if (key === this.key) return false;
    this.key = key;
    this.ground = ground;
    if (ground && !this.parts) {
      void this.load();
      return false;
    }
    this.apply();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const mesh of this.parts?.values() ?? []) mesh.dispose();
    this.parts = null;
  }

  private apply(): void {
    if (!this.parts) return;
    const height = this.context.groundHeight;
    for (const part of PARTS) {
      const mesh = this.parts.get(part);
      if (!mesh) continue;
      const pieces = (this.ground?.pieces ?? []).filter((p) => p.part === part);
      mesh.setEnabled(pieces.length > 0);
      if (pieces.length === 0) continue;
      const matrices = instanceMatrices(
        pieces.map((p) => ({
          x: p.x,
          y: height(p.x, p.z),
          z: p.z,
          rotationY: p.rotation,
          // jako postavy – stylizovaně o 20 % větší (villager-plan-types.ts)
          scale: FIGURE_SCALE,
        })),
      );
      setStaticInstances(mesh, matrices);
    }
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const parts = await loadModelParts(this.scene, TRAINING_MODEL_URL, 'training-', (m) =>
          this.context.prepareMaterial(m),
        );
        if (!parts) return;
        if (this.disposed) {
          for (const mesh of parts.values()) mesh.dispose();
          return;
        }
        this.parts = parts;
        for (const mesh of parts.values()) {
          mesh.setEnabled(false);
          this.context.addShadowCaster(mesh);
        }
        this.apply();
        this.context.onAsyncChange();
      } catch (error) {
        console.warn('Model cvičiště se nepodařilo načíst.', error);
      }
    })();
    return this.loading;
  }
}
