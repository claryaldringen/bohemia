import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneVillage } from '../village-view';
import { prepareDecorMaterial } from './decorations';
import { instanceMatrices, loadMergedModel } from './instanced-model';
import { prepareTreeMaterial } from './trees';
import {
  isWildTreeModel,
  wildKey,
  wildModelUrl,
  wildPlants,
  WILD_DECOR_MODELS,
  WILD_TREE_MODELS,
  type WildModel,
  type WildPlant,
} from './wild-growth';

// Zarůstání přílohu a les vsi ve scéně (fields.md – Zarůstání, Les vsi): keře a stromky z modelů
// krajiny v instancích (jeden mesh na model). Meshe se jmenují jako stromy a dekorace krajiny
// (`trees-<model>`, `decor-<model>`) – roční období podle jména modelu (listnáče se barví
// a opadávají, v zimě vypadnou ze stínové mapy) a stín od slunce jako ostatní stromy. Modely se
// načtou až s první rostlinou; přestavuje se jen při změně dat (`wildKey`).

/** Kolikrát zkusit načíst model, než se to vzdá. */
const MAX_LOAD_ATTEMPTS = 3;
/** Pata rostliny kousek pod terénem – na svahu nevisí ve vzduchu. */
const SINK_M = 0.05;

export interface WildGrowthContext {
  groundHeight(x: number, z: number): number;
  /** Nový mesh, který má vrhat stín (listnáče se v zimě vyřadí podle jména). */
  addShadowCaster(mesh: Mesh): void;
  /** Model se dočetl a instance se změnily – překreslit a obnovit stíny. */
  onAsyncChange(): void;
}

/** Keře, stromky a les vsi ve scéně (zarůstání přílohu). */
export class WildGrowthRenderer {
  private readonly meshes = new Map<WildModel, Mesh>();
  private readonly loading = new Set<WildModel>();
  private readonly failures = new Map<WildModel, number>();
  private plants: WildPlant[] = [];
  private key = '';
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: WildGrowthContext,
  ) {}

  /** Rostliny podle vsi; vrátí true, když se změnily už načtené meshe (překreslit). */
  update(village: SceneVillage): boolean {
    if (this.disposed) return false;
    const key = wildKey(village);
    if (key === this.key) return false;
    this.key = key;
    this.plants = wildPlants(village);
    let changed = false;
    for (const model of [...WILD_TREE_MODELS, ...WILD_DECOR_MODELS]) {
      if (this.meshes.has(model)) {
        changed = this.apply(model) || changed;
      } else if (
        this.plants.some((p) => p.model === model) &&
        !this.loading.has(model) &&
        (this.failures.get(model) ?? 0) < MAX_LOAD_ATTEMPTS
      ) {
        void this.load(model);
      }
    }
    return changed;
  }

  dispose(): void {
    this.disposed = true;
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
  }

  private async load(model: WildModel): Promise<void> {
    this.loading.add(model);
    try {
      const mesh = await loadMergedModel(
        this.scene,
        wildModelUrl(model),
        isWildTreeModel(model) ? `trees-${model}` : `decor-${model}`,
        (material) =>
          isWildTreeModel(model)
            ? prepareTreeMaterial(model, material)
            : prepareDecorMaterial(model, material),
      );
      if (!mesh) return;
      if (this.disposed) {
        mesh.dispose();
        return;
      }
      mesh.setEnabled(false);
      this.meshes.set(model, mesh);
      this.context.addShadowCaster(mesh);
      if (this.apply(model)) this.context.onAsyncChange();
    } catch (error) {
      console.warn(`Model zarůstání (${model}) se nepodařilo načíst.`, error);
      this.failures.set(model, (this.failures.get(model) ?? 0) + 1);
      // příští stav vsi to zkusí znovu
      this.key = '';
    } finally {
      this.loading.delete(model);
    }
  }

  /**
   * Nastaví meshi modelu jeho rostliny; bez rostlin ho vypne. Vrátí true, když se kreslení
   * změnilo.
   */
  private apply(model: WildModel): boolean {
    const mesh = this.meshes.get(model);
    if (!mesh) return false;
    const plants = this.plants.filter((p) => p.model === model);
    if (plants.length === 0) {
      if (!mesh.isEnabled()) return false;
      mesh.setEnabled(false);
      return true;
    }
    const matrices = instanceMatrices(
      plants.map((p) => ({
        x: p.x,
        y: this.context.groundHeight(p.x, p.z) - SINK_M,
        z: p.z,
        rotationY: p.rotationY,
        scale: p.scale,
      })),
    );
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.setEnabled(true);
    return true;
  }
}
