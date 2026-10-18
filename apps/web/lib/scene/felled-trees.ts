import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  lookSpecies,
  obstacleIndex,
  obstacleLook,
  type ObstacleChanges,
  type ObstacleLayer,
  type TreeLook,
} from '@bohemia/game';
import { prepareDecorMaterial } from './decorations';
import { instanceMatrices, loadMergedModel, type ModelInstance } from './instanced-model';
import { prepareTreeMaterial } from './trees';

/** Model, kterým se kreslí pařez nebo nálet: soubor a příprava materiálu. */
interface FelledModel {
  key: string;
  url: string;
  prepare: (material: Parameters<typeof prepareDecorMaterial>[1]) => void;
}

const STUMP: FelledModel = {
  key: 'stump',
  url: '/models/decor/stump.glb',
  prepare: (material) => prepareDecorMaterial('stump', material),
};

function treeModel(look: TreeLook): FelledModel {
  return {
    key: `sapling-${look}`,
    url: `/models/trees/${look}.glb`,
    prepare: (material) => prepareTreeMaterial(look, material),
  };
}

/** Kolikrát zkusit načíst model pařezu nebo náletu, než se to vzdá. */
const MAX_LOAD_ATTEMPTS = 3;

/** Hash id → [0, 1) – podoba náletu je jen vzhled. */
function idHash(id: number, k: number): number {
  let h = Math.imul(id ^ Math.imul(k, 0x27d4eb2d), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nálet na místě pokáceného stromu: jehličnany jako mladá jedle, listnáče zmenšené. */
function saplingOf(look: string, id: number): { model: TreeLook; scale: number } {
  const species = lookSpecies(look as TreeLook);
  const pick = idHash(id, 1);
  if (species === 'fir' || species === 'pine') {
    return { model: pick < 0.5 ? 'fir-young-1' : 'fir-young-2', scale: 0.7 + pick * 0.4 };
  }
  const broadleaf: TreeLook =
    species === 'oak'
      ? pick < 0.5
        ? 'oak-1'
        : 'oak-2'
      : species === 'beech'
        ? 'beech-1'
        : species === 'elm' || species === 'poplar'
          ? (look as TreeLook)
          : 'birch-1';
  return { model: broadleaf, scale: 0.3 + pick * 0.15 };
}

/**
 * Velikost zasazeného mladého buku podle stáří 0–1 (crafts.md – Uhlíř): sazenice ≈ 0,15 velikosti
 * stromu, dospělý buk velikostí původního stromu (`treeScale` z vrstvy překážek).
 */
export function plantedScale(growth: number, treeScale: number): number {
  const t = Math.min(1, Math.max(0, growth));
  return (0.15 + 0.85 * t) * treeScale;
}

/**
 * Pařezy po pokácených stromech a nálet, který z nich dorůstá (forest.md – Les ustupuje).
 * Původní strom skryje InstanceHider podle id, tady se na jeho místo přidá pařez nebo mladý
 * stromek. Modely se načtou až při prvním použití.
 */
export class FelledTrees {
  private readonly meshes = new Map<string, Mesh>();
  private readonly loading = new Map<string, Promise<void>>();
  /** Nepovedená načtení modelu – po MAX_LOAD_ATTEMPTS se to už nezkouší. */
  private readonly failures = new Map<string, number>();
  /** Požadované instance podle modelu – po dočtení modelu se použijí ty nejnovější. */
  private desired = new Map<string, { model: FelledModel; instances: ModelInstance[] }>();
  private signature = '';

  constructor(
    private readonly scene: Scene,
    private readonly options: {
      groundHeight: (worldX: number, worldZ: number) => number;
      addShadowCaster: (mesh: Mesh) => void;
      /** Model se dočetl a instance se změnily – překreslit (a obnovit stíny). */
      onAsyncChange: () => void;
    },
  ) {}

  /**
   * Pařezy a nálet podle změn vsi; mladé buky, které zasadil uhlíř (`planted` – id a velikost
   * 0–1, crafts.md – Uhlíř), rostou od sazenice k dospělému stromu. Vrátí true, když se změnily
   * už načtené modely.
   */
  update(
    layer: ObstacleLayer,
    changes: ObstacleChanges,
    planted: readonly { id: number; growth: number }[] = [],
  ): boolean {
    const plantedKey = planted.map((p) => `${p.id}:${p.growth}`).join(',');
    const signature = `${changes.stumps.join(',')}|${changes.saplings.join(',')}|${plantedKey}`;
    if (signature === this.signature) return false;
    this.signature = signature;
    const growth = new Map(planted.map((p) => [p.id, p.growth]));

    const desired = new Map<string, { model: FelledModel; instances: ModelInstance[] }>();
    const add = (model: FelledModel, instance: ModelInstance): void => {
      const entry = desired.get(model.key) ?? { model, instances: [] };
      entry.instances.push(instance);
      desired.set(model.key, entry);
    };
    const place = (
      id: number,
    ): { x: number; z: number; rotation: number; scale: number } | null => {
      const index = obstacleIndex(layer, id);
      if (index < 0) return null;
      return {
        x: layer.x[index]!,
        z: layer.z[index]!,
        rotation: layer.rotation[index]!,
        scale: layer.scale[index]!,
      };
    };
    for (const id of changes.stumps) {
      const p = place(id);
      if (!p) continue;
      add(STUMP, {
        x: p.x,
        y: this.options.groundHeight(p.x, p.z),
        z: p.z,
        rotationY: p.rotation,
        scale: 0.8 + 0.3 * Math.max(0, p.scale - 0.8),
      });
    }
    for (const id of changes.saplings) {
      const p = place(id);
      if (!p) continue;
      const sapling = saplingOf(obstacleLook(layer, obstacleIndex(layer, id)), id);
      const grown = growth.get(id);
      add(treeModel(sapling.model), {
        x: p.x,
        y: this.options.groundHeight(p.x, p.z),
        z: p.z,
        rotationY: p.rotation,
        scale: grown === undefined ? sapling.scale : plantedScale(grown, p.scale),
      });
    }
    // modely, které už nic nekreslí, se vypnou
    for (const key of this.desired.keys()) {
      if (!desired.has(key))
        desired.set(key, { model: this.desired.get(key)!.model, instances: [] });
    }
    this.desired = desired;

    let changed = false;
    for (const [key, entry] of desired) {
      if (this.meshes.has(key)) {
        changed = this.apply(key) || changed;
      } else if (
        entry.instances.length > 0 &&
        !this.loading.has(key) &&
        (this.failures.get(key) ?? 0) < MAX_LOAD_ATTEMPTS
      ) {
        this.loading.set(key, this.load(entry.model));
      }
    }
    return changed;
  }

  private async load(model: FelledModel): Promise<void> {
    try {
      const mesh = await loadMergedModel(
        this.scene,
        model.url,
        `felled-${model.key}`,
        model.prepare,
      );
      if (!mesh) return;
      this.meshes.set(model.key, mesh);
      this.options.addShadowCaster(mesh);
      // překreslit, jen když model něco kreslí (mezitím mohly pařezy zmizet)
      if (this.apply(model.key)) this.options.onAsyncChange();
    } catch (error) {
      console.warn('Model pařezu nebo náletu se nepodařilo načíst.', error);
      this.failures.set(model.key, (this.failures.get(model.key) ?? 0) + 1);
      // příští stav vsi (dotaz každých pár sekund) to zkusí znovu
      this.signature = '';
    } finally {
      this.loading.delete(model.key);
    }
  }

  /**
   * Nastaví meshi požadované instance; bez instancí ho vypne. Vrátí true, když se kreslení
   * změnilo (vypnutý mesh bez instancí překreslení nepotřebuje).
   */
  private apply(key: string): boolean {
    const mesh = this.meshes.get(key);
    const entry = this.desired.get(key);
    if (!mesh || !entry) return false;
    if (entry.instances.length === 0) {
      if (!mesh.isEnabled()) return false;
      mesh.setEnabled(false);
      return true;
    }
    mesh.thinInstanceSetBuffer('matrix', instanceMatrices(entry.instances), 16, true);
    mesh.setEnabled(true);
    return true;
  }
}
