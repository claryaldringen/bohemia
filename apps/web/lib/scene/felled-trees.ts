import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  lookSpecies,
  obstacleIndex,
  obstacleKind,
  obstacleLook,
  type ObstacleChanges,
  type ObstacleKind,
  type ObstacleLayer,
  type TreeLook,
  TREE_LOOKS,
} from '@bohemia/game';
import { prepareDecorMaterial } from './decorations';
import {
  instanceMatrices,
  loadMergedModel,
  setStaticInstances,
  type ModelInstance,
} from './instanced-model';
import { fallenTrunk } from './tornado-track';
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

/** Padlé kmeny vývratů smrště – modely padlých stromů z dekorací (osa kmene ≈ +x). */
const FALLEN: readonly [FelledModel, FelledModel] = [
  {
    key: 'fallen-2',
    url: '/models/decor/fallen-2.glb',
    prepare: (material) => prepareDecorMaterial('fallen-2', material),
  },
  {
    key: 'fallen-3',
    url: '/models/decor/fallen-3.glb',
    prepare: (material) => prepareDecorMaterial('fallen-3', material),
  },
];
/** Padlý kmen vůči velikosti stromu (model ≈ 14 m dlouhý) – vývrat souše. */
const FALLEN_SCALE = 0.85;

/**
 * Kořenový talíř vývratu: hrouda (kámen obarvený do hlíny) postavená na hranu u paty ležícího
 * stromu – šířka a tloušťka vůči velikosti stromu. Kámen má jen 14 trojúhelníků (tisíce vývratů).
 */
const ROOT_PLATE: FelledModel = {
  key: 'root-plate',
  url: '/models/decor/stone-2.glb',
  prepare: (material) => {
    prepareDecorMaterial('stone-2', material);
    if (material instanceof PBRMaterial) material.albedoColor = ROOT_PLATE_TINT;
  },
};
const ROOT_PLATE_TINT = new Color3(0.5, 0.36, 0.24);
const ROOT_PLATE_SIZE = { width: 2.7, depth: 0.5 } as const;
/** Sklon ležícího stromu od svislice (rad) – ≈ 80°, ať koruna nepropadá terénem. */
const FALLEN_TILT = (80 * Math.PI) / 180;
/** O kolik je pata vývratu zvednutá na kořenovém talíři (m při velikosti stromu 1). */
const FALLEN_LIFT_M = 0.8;

const TREE_LOOK_SET = new Set<string>(TREE_LOOKS);

/** Vrba u potoka je strom, ale kreslí ji dekorace (models/decor). */
const LYING_WILLOW: FelledModel = {
  key: 'fallen-willow',
  url: '/models/decor/willow.glb',
  prepare: (material) => prepareDecorMaterial('willow', material),
};

/**
 * Ležící vyvrácený strom – plný model stromu na boku (nikdy impostor stojícího stromu); null, když
 * podoba nemá model stromu. Vzácné varianty jilmu, topolu a velkého dubu se kreslí jedním modelem
 * rodu – méně draw callů.
 */
function lyingTreeModel(tree: string): FelledModel | null {
  if (tree === 'willow') return LYING_WILLOW;
  if (!TREE_LOOK_SET.has(tree)) return null;
  const look = (
    tree.startsWith('elm-')
      ? 'elm-1'
      : tree.startsWith('poplar-')
        ? 'poplar-1'
        : tree.startsWith('oak-large-')
          ? 'oak-large-1'
          : tree
  ) as TreeLook;
  return {
    key: `fallen-${look}`,
    url: `/models/trees/${look}.glb`,
    prepare: (material) => prepareTreeMaterial(look, material),
  };
}

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
 * Velikost pařezu podle pokáceného stromu: dospělý strom a souš podle velikosti stromu, mladý
 * stromek (klučení lesa – forest.md, Klučení lesa pro pole – postup) jen nízký pahýl – model
 * mladé jedle je v plné velikosti, listnáče okraje jsou zmenšené, pařez je u obou malý.
 */
export function stumpScale(kind: ObstacleKind, treeScale: number): number {
  if (kind === 'youngTree') return 0.4 + 0.1 * Math.min(1, Math.max(0, treeScale - 0.3));
  return 0.8 + 0.3 * Math.max(0, treeScale - 0.8);
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
    trunks: { ids: readonly number[]; angle: number } | null = null,
  ): boolean {
    const plantedKey = planted.map((p) => `${p.id}:${p.growth}`).join(',');
    const trunksKey = trunks ? `${trunks.angle}:${trunks.ids.join(',')}` : '';
    const signature = `${changes.stumps.join(',')}|${changes.saplings.join(',')}|${plantedKey}|${trunksKey}`;
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
    ): { x: number; z: number; rotation: number; scale: number; kind: ObstacleKind } | null => {
      const index = obstacleIndex(layer, id);
      if (index < 0) return null;
      return {
        x: layer.x[index]!,
        z: layer.z[index]!,
        rotation: layer.rotation[index]!,
        scale: layer.scale[index]!,
        kind: obstacleKind(layer, index),
      };
    };
    // vývrat leží na boku s kořenovým talířem místo pařezu – pařez se ukáže, až ves kmen rozřeže
    const uprooted = new Set(
      (trunks?.ids ?? []).filter(
        (id) =>
          place(id)?.kind === 'tree' &&
          lyingTreeModel(obstacleLook(layer, obstacleIndex(layer, id))) !== null,
      ),
    );
    for (const id of changes.stumps) {
      const p = place(id);
      if (!p || uprooted.has(id)) continue;
      add(STUMP, {
        x: p.x,
        y: this.options.groundHeight(p.x, p.z),
        z: p.z,
        rotationY: p.rotation,
        scale: stumpScale(p.kind, p.scale),
      });
    }
    // vývraty smrště (disasters.md – Smršť, Ve scéně): strom leží na boku od paty po větru se
    // zelenou korunou a kořenovým talířem; souš jako holý padlý kmen
    for (const id of trunks?.ids ?? []) {
      const p = place(id);
      if (!p || p.kind === 'youngTree') continue;
      const trunk = fallenTrunk(id, p, trunks!.angle);
      const lying =
        p.kind === 'tree' ? lyingTreeModel(obstacleLook(layer, obstacleIndex(layer, id))) : null;
      if (!lying) {
        add(FALLEN[trunk.variant], {
          x: trunk.x,
          y: this.options.groundHeight(trunk.x, trunk.z),
          z: trunk.z,
          rotationY: trunk.rotationY,
          scale: FALLEN_SCALE * p.scale,
        });
        continue;
      }
      const fall = { x: Math.cos(-trunk.rotationY), z: Math.sin(-trunk.rotationY) };
      const lift = FALLEN_LIFT_M * p.scale;
      const y = this.options.groundHeight(p.x, p.z);
      const along = Math.sin(FALLEN_TILT);
      const up = { x: fall.x * along, y: Math.cos(FALLEN_TILT), z: fall.z * along };
      add(lying, {
        x: p.x,
        y: y + lift,
        z: p.z,
        rotationY: p.rotation,
        scale: p.scale,
        up,
      });
      // talíř kolmo na kmen – svislá osa pařezu míří proti větru, kořeny k patě stromu
      add(ROOT_PLATE, {
        x: p.x,
        y: y + lift,
        z: p.z,
        rotationY: p.rotation,
        scale: ROOT_PLATE_SIZE.width * p.scale,
        scaleY: ROOT_PLATE_SIZE.depth * p.scale,
        up: { x: -up.x, y: up.y, z: -up.z },
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
    // nehybné instance – ořez podle záběru (scenery-culling.ts) je kreslí jen v záběru
    setStaticInstances(mesh, instanceMatrices(entry.instances));
    mesh.setEnabled(true);
    return true;
  }
}
