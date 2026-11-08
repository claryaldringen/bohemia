import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneVillage } from '../village-view';
import { applyGammaFog } from './gamma-fog';
import { instanceMatrices, loadModelParts, setStaticInstances } from './instanced-model';
import { applySeasonSnow } from './season-materials';
import { QUARRY_FACE_M, stoneLayout, type PileSpot, type StoneLayout } from './stone-pile-layout';

// Hromady kamení u cest a lomy na výchozech (fortifications.md – Hradby a obrana, Kámen): díly
// `stone-pile-a/b` ze `siege.glb` v instancích a vylomená stěna lomu (světlý kvádr čerstvé skály).
// Kreslí se jen při změně – `update` vrátí true, když se instance změnily.

/** Barva čerstvě vylomené skály – světlejší než zvětralý výchoz. */
const FRESH_ROCK = [0.62, 0.6, 0.55] as const;

function prepareStone(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  applySeasonSnow(material);
}

export class StonePiles {
  private parts: { a: Mesh; b: Mesh } | null = null;
  private face: Mesh | null = null;
  private loading = false;
  private disposed = false;
  private signature = '';
  private layout: StoneLayout = { a: [], b: [], faces: [] };

  constructor(
    private readonly scene: Scene,
    private readonly options: {
      groundHeight: (worldX: number, worldZ: number) => number;
      addShadowCaster: (mesh: Mesh) => void;
      /** Model se načetl – scéna se má překreslit. */
      onAsyncChange: () => void;
    },
  ) {}

  /** Hromady a lomy podle vsi; vrátí true, když se kreslení změnilo. */
  update(village: Pick<SceneVillage, 'stoneStacks' | 'quarries'>): boolean {
    const signature = JSON.stringify([village.stoneStacks ?? [], village.quarries ?? []]);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.layout = stoneLayout(village);
    const empty =
      this.layout.a.length === 0 && this.layout.b.length === 0 && this.layout.faces.length === 0;
    if (!this.parts && !empty) void this.load();
    return this.apply();
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    const parts = await loadModelParts(
      this.scene,
      '/models/siege/siege.glb',
      'stone-',
      prepareStone,
    );
    if (!parts || this.disposed) {
      for (const mesh of parts?.values() ?? []) mesh.dispose();
      return;
    }
    const a = parts.get('stone-pile-a');
    const b = parts.get('stone-pile-b');
    // ostatní díly (žebříky, otep) tu nejsou potřeba
    for (const [name, mesh] of parts)
      if (name !== 'stone-pile-a' && name !== 'stone-pile-b') mesh.dispose();
    if (!a || !b) return;
    this.parts = { a, b };
    this.options.addShadowCaster(a);
    this.options.addShadowCaster(b);
    if (this.apply()) this.options.onAsyncChange();
  }

  private ensureFace(): Mesh {
    if (this.face) return this.face;
    const { width, height, depth } = QUARRY_FACE_M;
    const face = CreateBox('quarry-face', { width, height, depth }, this.scene);
    // pata kvádru na zemi – měřítko výšky (rozestavěný lom) ho jen sníží
    face.position.y = height / 2;
    face.bakeCurrentTransformIntoVertices();
    const material = new PBRMaterial('quarry-face', this.scene);
    material.albedoColor = new Color3(...FRESH_ROCK);
    prepareStone(material);
    face.material = material;
    face.isPickable = false;
    this.options.addShadowCaster(face);
    this.face = face;
    return face;
  }

  /** Nastaví instance podle rozložení; vrátí true, když je co kreslit nebo se něco skrylo. */
  private apply(): boolean {
    const place = (mesh: Mesh, spots: readonly PileSpot[]): void => {
      setStaticInstances(
        mesh,
        instanceMatrices(
          spots.map((s) => ({
            x: s.x,
            y: this.options.groundHeight(s.x, s.z),
            z: s.z,
            rotationY: s.rotation,
            scale: s.scale,
            ...(s.scaleY !== undefined ? { scaleY: s.scaleY } : {}),
          })),
        ),
      );
      mesh.setEnabled(spots.length > 0);
    };
    if (this.layout.faces.length > 0 || this.face) place(this.ensureFace(), this.layout.faces);
    if (this.parts) {
      place(this.parts.a, this.layout.a);
      place(this.parts.b, this.layout.b);
    }
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.parts?.a.dispose();
    this.parts?.b.dispose();
    this.face?.material?.dispose();
    this.face?.dispose();
    this.parts = null;
    this.face = null;
  }
}
