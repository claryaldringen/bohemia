// Ohrady s přístřeškem ve scéně (ve vsi i na ukázce /dev/buildings – docs/design/oxen.md):
// pletený plot se zakulacenými rohy (sdílený – woven-fence-renderer.ts), přístřešek, jesle, žlab
// a branka z models/pen/pen.glb, při stavbě díly z pen-construction.glb (tools/blender/pen.py),
// stoh sena z models/fields/haystack.glb, vytyčení kolíky a provázkem a obtisk vyšlapaného bláta.
// Kde co stojí a co z ohrady při průběhu stavby stojí, počítá pen-layout.ts. Všechno v instancích
// pro všechny ohrady najednou – každý díl stojí na svém místě terénu.
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  instanceMatrices,
  loadMergedModel,
  loadModelParts,
  type ModelInstance,
} from './instanced-model';
import {
  PEN_HAYSTACK_SCALE,
  penFenceStage,
  penLayout,
  penMudAt,
  penMudBounds,
  penPartPlace,
  penStage,
  penStakingLine,
  type Direction,
  type PenLayout,
  type PenSquare,
  type PenStage,
} from './pen-layout';
import { applySeasonSnow } from './season-materials';
import {
  PEN_MUD_BY_STAGE,
  fenceDecayAmount,
  penDecayParts,
  penDecayPlace,
  structureDecayStage,
  type StructureStage,
} from './structure-decay';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { decalGrid } from './village-layout';
import { createDecalMesh, type HeightFn } from './village-meshes';
import { decayFence } from './woven-fence';
import type { WovenFenceRenderer } from './woven-fence-renderer';

export const PEN_MODEL_URL = '/models/pen/pen.glb';
export const PEN_CONSTRUCTION_URL = '/models/pen/pen-construction.glb';
/** Díly rozpadu opuštěné ohrady (abandonment.md – tools/blender/pen.py, structure-decay.ts). */
export const PEN_DECAY_URL = '/models/pen/pen-decay.glb';
const HAYSTACK_URL = '/models/fields/haystack.glb';
/** Předpona dílů staveniště v pen-construction.glb. */
const SITE_PREFIX = 'ohrada-';
/** Seno stohu je o něco sušší než na louce (HAY_TINT ve field-renderer.ts). */
const HAY_TINT = new Color3(0.74, 0.72, 0.52);
/** Rozpad plotu opuštěné ohrady se ve scéně mění po dvacetinách. */
const FENCE_DECAY_STEPS = 20;
/** Pata dílů je o kousek zapuštěná (na svahu nevisí) a obtisk bláta nad terénem (m). */
const SINK_M = 0.03;
const MUD_LIFT_M = 0.03;
const MUD_STEP_M = 0.35;
/**
 * Sníh na dílech s materiálem „…-low“ (jesle a seno pod střechou, žlab, branka, rekvizity –
 * tools/blender/pen.py): jen poprašek. Střecha přístřešku má plný sníh jako obydlí.
 */
const LOW_SNOW = 0.25;

/**
 * Ohrada ke kreslení: id, čtverec, směr ke vsi (branka), průběh stavby 0–1 a stav hotové
 * ohrady 0–1 (abandonment.md – opuštěná ohrada se rozpadá; bez údaje celá).
 */
export interface PenView {
  id: number;
  square: PenSquare;
  facing: Direction;
  progress: number;
  condition?: number;
}

interface PenEntry {
  key: string;
  layoutKey: string;
  layout: PenLayout;
  stage: PenStage;
  /** Stupeň rozpadu hotové ohrady (0 = celá). */
  decay: StructureStage;
  mud: Mesh | null;
  string: Mesh | null;
}

export class PenRenderer {
  private readonly entries = new Map<number, PenEntry>();
  private models: Map<string, Mesh> | null = null;
  private site: Map<string, Mesh> | null = null;
  private decayParts: Map<string, Mesh> | null = null;
  private haystack: Mesh | null = null;
  private loading: Promise<void> | null = null;
  private readonly pegs: StakingPegs;
  private stringMaterial: Material | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      groundHeight: HeightFn;
      decalHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      onAsyncChange(): void;
      /** Úprava materiálu dílů (opar, sníh na střeše) jako u obydlí. */
      prepareMaterial(material: Material): void;
      /** Materiál obtisku bláta (obtisk z textury terénu). */
      mudMaterial(): Material;
      /** Sdílené pletené ploty. */
      fences: WovenFenceRenderer;
    },
  ) {
    this.pegs = new StakingPegs(scene, (mesh) => context.addShadowCaster(mesh));
  }

  /** Překreslí ohrady, které se změnily; vrátí true, když se něco změnilo. */
  update(pens: readonly PenView[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const view of pens) {
      seen.add(view.id);
      const { square, facing } = view;
      const layoutKey = [square.x, square.z, square.size, facing.x, facing.z].join(',');
      const stage = penStage(view.progress);
      const decay = stage.built ? structureDecayStage(view.condition) : 0;
      // rozpad plotu po dvacetinách – ohrada se nepřestavuje při každé drobné změně stavu
      const fenceDecay = stage.built
        ? Math.round(fenceDecayAmount(view.condition) * FENCE_DECAY_STEPS) / FENCE_DECAY_STEPS
        : 0;
      const key = `${layoutKey}|${Math.round(view.progress * 400)}|${decay}|${fenceDecay}`;
      const current = this.entries.get(view.id);
      if (current?.key === key) continue;
      changed = true;
      const same = current?.layoutKey === layoutKey;
      const layout = same ? current.layout : penLayout(square, facing);
      let mud = same ? current.mud : null;
      let string = same ? current.string : null;
      if (current && !same) {
        current.mud?.dispose();
        current.string?.dispose();
      }
      const mudCover = stage.mud * PEN_MUD_BY_STAGE[decay];
      if (mudCover > 0 && !mud) mud = this.mudMesh(view.id, layout);
      if (mud) mud.visibility = mudCover;
      if (stage.staking && !string) {
        this.stringMaterial ??= createStringMaterial(this.scene);
        string = createStringMesh(
          this.scene,
          `pen-staking-string-${view.id}`,
          [penStakingLine(layout)],
          this.context.groundHeight,
          this.stringMaterial,
        );
      }
      if (!stage.staking && string) {
        string.dispose();
        string = null;
      }
      this.entries.set(view.id, { key, layoutKey, layout, stage, decay, mud, string });
      const fence = penFenceStage(layout, stage);
      this.context.fences.set(
        fenceOwner(view.id),
        fenceDecay > 0 ? decayFence(fence, fenceDecay, view.id) : fence,
      );
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.mud?.dispose();
      entry.string?.dispose();
      this.entries.delete(id);
      this.context.fences.set(fenceOwner(id), null);
      changed = true;
    }
    this.context.fences.commit();
    if (this.entries.size > 0) void this.load();
    if (changed) this.updateInstances();
    return changed;
  }

  /** Rozmístění hotových ohrad (zvířata – pen-animals.ts). */
  builtLayouts(): PenLayout[] {
    return this.builtPens().map((p) => p.layout);
  }

  /** Hotové ohrady s id a rozmístěním (zvířata podle ohrady – village-pens.ts). */
  builtPens(): { id: number; layout: PenLayout }[] {
    return [...this.entries.entries()]
      .filter(([, e]) => e.stage.built)
      .map(([id, e]) => ({ id, layout: e.layout }));
  }

  dispose(): void {
    this.disposed = true;
    for (const [id, entry] of this.entries) {
      entry.mud?.dispose();
      entry.string?.dispose();
      this.context.fences.set(fenceOwner(id), null);
    }
    this.entries.clear();
    this.pegs.dispose();
    this.stringMaterial?.dispose();
    for (const mesh of [
      ...(this.models?.values() ?? []),
      ...(this.site?.values() ?? []),
      ...(this.decayParts?.values() ?? []),
    ]) {
      mesh.dispose();
    }
    this.haystack?.dispose();
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      const prepare = (m: Material): void => {
        // dřív než úprava vlastníka – ta pak sníh už nepřidá (jen jeden plugin období)
        if (m.name.endsWith('-low')) applySeasonSnow(m, LOW_SNOW);
        this.context.prepareMaterial(m);
      };
      const [models, site, haystack, decay] = await Promise.allSettled([
        loadModelParts(this.scene, PEN_MODEL_URL, 'pen-', prepare),
        loadModelParts(this.scene, PEN_CONSTRUCTION_URL, 'pen-site-', prepare),
        loadMergedModel(this.scene, HAYSTACK_URL, 'pen-haystack', (m) => {
          prepare(m);
          if (m instanceof PBRMaterial) m.albedoColor = HAY_TINT;
        }),
        loadModelParts(this.scene, PEN_DECAY_URL, 'pen-decay-', prepare),
      ]);
      const all: Mesh[] = [];
      if (models.status === 'fulfilled' && models.value) {
        this.models = models.value;
        all.push(...models.value.values());
      } else console.warn('Model ohrady se nepodařilo načíst.', reason(models));
      if (site.status === 'fulfilled' && site.value) {
        this.site = site.value;
        all.push(...site.value.values());
      } else console.warn('Díly staveniště ohrady se nepodařilo načíst.', reason(site));
      if (haystack.status === 'fulfilled' && haystack.value) {
        this.haystack = haystack.value;
        all.push(haystack.value);
      } else console.warn('Stoh sena se nepodařilo načíst.', reason(haystack));
      // díly rozpadu – bez nich se opuštěná ohrada kreslí celá
      if (decay.status === 'fulfilled' && decay.value) {
        this.decayParts = decay.value;
        all.push(...decay.value.values());
      } else console.warn('Díly rozpadu ohrady se nepodařilo načíst.', reason(decay));
      if (this.disposed) {
        for (const mesh of all) mesh.dispose();
        return;
      }
      for (const mesh of all) {
        mesh.setEnabled(false);
        mesh.receiveShadows = true;
        this.context.addShadowCaster(mesh);
      }
      this.updateInstances();
      this.context.onAsyncChange();
    })();
    return this.loading;
  }

  /** Instance všech dílů ze všech ohrad. */
  private updateInstances(): void {
    const height = this.context.groundHeight;
    const buffers = new Map<Mesh, ModelInstance[]>();
    const push = (mesh: Mesh | undefined | null, instance: ModelInstance): void => {
      if (!mesh) return;
      const list = buffers.get(mesh) ?? [];
      list.push(instance);
      buffers.set(mesh, list);
    };
    const place = (layout: PenLayout, part: string, scale = 1): ModelInstance => {
      const at = penPartPlace(layout, part);
      return { x: at.x, y: height(at.x, at.z) - SINK_M, z: at.z, rotationY: at.rotation, scale };
    };
    const pegs: ModelInstance[] = [];
    for (const { layout, stage, decay } of this.entries.values()) {
      if (stage.built) {
        // opuštěná ohrada podle stupně rozpadu (abandonment.md); bez dílů rozpadu celá
        const parts = this.decayParts ? penDecayParts(decay) : penDecayParts(0);
        for (const { from, part } of parts) {
          const mesh = from === 'pen' ? this.models?.get(part) : this.decayParts?.get(part);
          push(mesh, place(layout, penDecayPlace(part)));
        }
      } else {
        for (const part of stage.parts)
          push(this.site?.get(SITE_PREFIX + part), place(layout, part));
        for (const { prop, scale } of stage.props) {
          push(this.site?.get(SITE_PREFIX + prop), place(layout, prop, scale));
        }
      }
      if (stage.haystack > 0 && decay === 0) {
        const at = layout.haystack;
        push(this.haystack, {
          x: at.x,
          y: height(at.x, at.z) - SINK_M,
          z: at.z,
          rotationY: at.rotation,
          scale: PEN_HAYSTACK_SCALE * stage.haystack,
        });
      }
      if (stage.staking) pegs.push(...pegInstances([penStakingLine(layout)], height));
    }
    const meshes = [
      ...(this.models?.values() ?? []),
      ...(this.site?.values() ?? []),
      ...(this.decayParts?.values() ?? []),
      ...(this.haystack ? [this.haystack] : []),
    ];
    for (const mesh of meshes) {
      const instances = buffers.get(mesh);
      if (!instances || instances.length === 0) {
        mesh.setEnabled(false);
        continue;
      }
      mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
      mesh.setEnabled(true);
    }
    this.pegs.set(pegs);
  }

  /** Obtisk vyšlapané země a bláta uvnitř plotu (krytí podle průběhu – `visibility`). */
  private mudMesh(id: number, layout: PenLayout): Mesh {
    const mesh = createDecalMesh(
      this.scene,
      `pen-mud-${id}`,
      decalGrid(penMudBounds(layout), MUD_STEP_M, (x, z) => penMudAt(layout, x, z)),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: MUD_LIFT_M,
        color: [0.92, 0.84, 0.74],
        alpha: 0.9,
        uv: 9,
      },
    );
    mesh.material = this.context.mudMaterial();
    mesh.alphaIndex = 1;
    return mesh;
  }
}

function fenceOwner(id: number): string {
  return `pen-${id}`;
}

function reason(result: PromiseSettledResult<unknown>): unknown {
  return result.status === 'rejected' ? result.reason : '';
}
