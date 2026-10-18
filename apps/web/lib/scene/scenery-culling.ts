import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { onStaticInstances, type StaticInstances } from './instanced-model';
import {
  boxInFrustum,
  chunkBounds,
  chunkOrder,
  compactChunks,
  emptyBounds,
  mergeBounds,
  type ChunkGrid,
  type ChunkOrder,
  type LocalBounds,
} from './scenery-chunks';

/**
 * Vrstva meshů, které kreslí jen stínová mapa: kamera má výchozí `layerMask` 0x0FFFFFFF a tenhle
 * bit nemá, stínový generátor masku vrstev u svého seznamu vrhačů nekontroluje.
 */
export const SHADOW_ONLY_LAYER = 0x10000000;
/** Předpona meshe, který kreslí kamera (ořezané instance) – mimo předpony vrhačů stínu. */
export const VIEW_PREFIX = 'view-';
/**
 * Meshe s nehybnými instancemi, které se ořezávají: stromy, dekorace a impostory krajiny, les
 * a keře vsi (zarůstání), pařezy a nálet, stromy u cest.
 */
export const CULLED_MESHES = /^(trees|decor|impostors|felled|pathside)-/;

interface Entry {
  /** Původní mesh se všemi instancemi – vrhá stín (stínová mapa přes celou krajinu). */
  source: Mesh;
  /** Klon pro kameru (sdílí geometrii a materiál) – jen instance čtverců v záběru. */
  view: Mesh;
  chunk: ChunkOrder;
  local: LocalBounds;
  /** Instance po skrytí a zvětšení (InstanceHider) v původním pořadí. */
  matrices: Float32Array;
  colors: Float32Array | undefined;
  hidden: Uint8Array | null;
  /** Obaly čtverců (scenery-chunks.ts). */
  bounds: Float32Array;
  outMatrices: Float32Array;
  outColors: Float32Array | undefined;
  /** Čtverce, jejichž instance jsou teď v bufferu kamery. */
  visible: number[];
  dirty: boolean;
}

/**
 * Ořez stromů, dekorací a impostorů podle záběru. Každý mesh s nehybnými instancemi
 * (`setStaticInstances`, jméno podle `CULLED_MESHES`) dostane klon pro kameru (`view-…`), do
 * jehož bufferu se před snímkem nakopírují jen instance čtverců v záběru – draw cally zůstanou,
 * ubude trojúhelníků. Původní mesh se všemi instancemi kreslí dál jen stínová mapa
 * (`SHADOW_ONLY_LAYER`) – ta se kreslí jednou pro celou krajinu a ořez kamery ji neovlivní.
 * Skrývání a zvětšení instancí (InstanceHider) jde do obou (`setInstances`), vypnutí původního
 * meshe vypne i klon, roční období jsou na sdílených materiálech.
 */
export class SceneryCulling {
  private readonly entries = new Map<Mesh, Entry>();
  private union: Float32Array;
  private unionDirty = true;
  private unionVisible: number[] = [];
  private readonly transform = new Matrix();
  private readonly lastTransform = new Float32Array(16).fill(Number.NaN);
  private readonly planes = Frustum.GetPlanes(Matrix.Identity());
  private readonly planeData = new Float64Array(24);
  private readonly observer: Observer<Scene>;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly grid: ChunkGrid,
  ) {
    this.union = emptyBounds(grid.count * grid.count);
    // před výběrem meshů v záběru (scene.render) – instance podle kamery, která se kreslí
    this.observer = scene.onBeforeRenderObservable.add(() => this.update(scene.activeCamera));
    // nehybné instance krajiny i vsi (les vsi, pařezy, stromy u cest) – i když se později mění
    this.unsubscribe = onStaticInstances(scene, (mesh, instances) => {
      if (CULLED_MESHES.test(mesh.name)) this.register(mesh, instances);
    });
  }

  /** Klon pro kameru (testy, měření); bez zařazení null. */
  viewOf(source: Mesh): Mesh | null {
    return this.entries.get(source)?.view ?? null;
  }

  /**
   * InstanceHider změnil instance meshe: skryté (`hidden[i]` = 1, null = žádné) a matice
   * (zvětšené posvátné duby) v původním pořadí. Buffer kamery se přestaví před dalším snímkem.
   */
  setInstances(
    source: Mesh,
    matrices: Float32Array,
    hidden: Uint8Array | null,
    colors?: Float32Array,
  ): void {
    const entry = this.entries.get(source);
    if (!entry) return;
    if (matrices !== entry.matrices) {
      // zvětšené instance mají větší obal
      entry.matrices = matrices;
      chunkBounds(matrices, entry.chunk, entry.local, entry.bounds);
      this.unionDirty = true;
    }
    if (colors) entry.colors = colors;
    entry.hidden = hidden;
    entry.dirty = true;
  }

  /**
   * Před snímkem: čtverce v záběru kamery; buffery klonů se přestaví, jen když se jejich čtverce
   * v záběru změnily (nebo instance). Vrátí true, když se nějaký buffer přestavěl.
   */
  update(camera: Camera | null): boolean {
    if (!camera || this.entries.size === 0) return false;
    camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), this.transform);
    const m = this.transform.m;
    let moved = false;
    for (let k = 0; k < 16; k++) {
      if (m[k] !== this.lastTransform[k]) {
        moved = true;
        break;
      }
    }
    let dirty = false;
    for (const entry of this.entries.values()) dirty ||= entry.dirty;
    if (!moved && !this.unionDirty && !dirty) return false;
    if (this.unionDirty) {
      this.union = emptyBounds(this.grid.count * this.grid.count);
      for (const entry of this.entries.values()) mergeBounds(this.union, entry.bounds);
    }
    if (moved || this.unionDirty) {
      this.lastTransform.set(m);
      Frustum.GetPlanesToRef(this.transform, this.planes);
      this.planes.forEach((plane, i) => {
        this.planeData[i * 4] = plane.normal.x;
        this.planeData[i * 4 + 1] = plane.normal.y;
        this.planeData[i * 4 + 2] = plane.normal.z;
        this.planeData[i * 4 + 3] = plane.d;
      });
      this.unionVisible = [];
      for (let c = 0; c < this.grid.count * this.grid.count; c++) {
        if (boxInFrustum(this.union, c, this.planeData)) this.unionVisible.push(c);
      }
      this.unionDirty = false;
    }
    let rebuilt = false;
    for (const entry of this.entries.values()) {
      const visible = this.unionVisible.filter((c) =>
        boxInFrustum(entry.bounds, c, this.planeData),
      );
      if (!entry.dirty && sameChunks(visible, entry.visible)) continue;
      entry.visible = visible;
      entry.dirty = false;
      this.rebuild(entry);
      rebuilt = true;
    }
    return rebuilt;
  }

  /** Instancí celkem a v bufferech kamery (měření). */
  counts(): { total: number; drawn: number } {
    let total = 0;
    let drawn = 0;
    for (const entry of this.entries.values()) {
      total += entry.matrices.length / 16;
      drawn += entry.view.isEnabled() ? entry.view.thinInstanceCount : 0;
    }
    return { total, drawn };
  }

  dispose(): void {
    this.unsubscribe();
    this.scene.onBeforeRenderObservable.remove(this.observer);
    for (const entry of this.entries.values()) entry.view.dispose();
    this.entries.clear();
  }

  /** Zařadí (nebo po nových instancích přestaví) mesh a jeho klon pro kameru. */
  private register(source: Mesh, instances: StaticInstances): void {
    if (source.isDisposed()) return;
    const existing = this.entries.get(source);
    const local = instances.localBounds ?? existing?.local ?? positionBounds(source);
    if (!local) return;
    const view = existing?.view ?? this.createView(source);
    const chunk = chunkOrder(instances.matrices, this.grid);
    let outMatrices = existing?.outMatrices;
    if (outMatrices?.length !== instances.matrices.length) {
      outMatrices = new Float32Array(instances.matrices.length);
      view.thinInstanceSetBuffer('matrix', outMatrices, 16, false);
    }
    let outColors = existing?.outColors;
    if (instances.colors && outColors?.length !== instances.colors.length) {
      outColors = new Float32Array(instances.colors.length);
      view.thinInstanceSetBuffer('color', outColors, 4, false);
    }
    view.thinInstanceCount = 0;
    this.entries.set(source, {
      source,
      view,
      chunk,
      local,
      matrices: instances.matrices,
      colors: instances.colors,
      hidden: null,
      bounds: chunkBounds(instances.matrices, chunk, local),
      outMatrices,
      outColors: instances.colors ? outColors : undefined,
      visible: [],
      dirty: true,
    });
    this.unionDirty = true;
  }

  private createView(source: Mesh): Mesh {
    const view = source.clone(`${VIEW_PREFIX}${source.name}`, null, true);
    view.isPickable = false;
    view.alwaysSelectAsActiveMesh = false;
    view.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_STANDARD;
    // obal počítá ořez (sjednocení čtverců v záběru), ne Babylon přes celý buffer
    view.doNotSyncBoundingInfo = true;
    view.setEnabled(false);
    source.layerMask = SHADOW_ONLY_LAYER;
    // vypnutí původního meshe (bez instancí, vše skryté, vývojové skrytí) vypne i klon
    source.onEnabledStateChangedObservable.add(() => {
      const entry = this.entries.get(source);
      if (entry) entry.dirty = true;
    });
    source.onDisposeObservable.addOnce(() => {
      this.entries.delete(source);
      this.unionDirty = true;
      view.dispose();
    });
    return view;
  }

  private rebuild(entry: Entry): void {
    const { view, chunk, visible, hidden, source } = entry;
    const count = source.isEnabled()
      ? compactChunks(entry.matrices, 16, chunk, visible, hidden, entry.outMatrices)
      : 0;
    if (count === 0) {
      // bez instancí by Babylon vykreslil samotný model v počátku – mesh se jen vypne
      view.setEnabled(false);
      return;
    }
    if (entry.colors && entry.outColors) {
      compactChunks(entry.colors, 4, chunk, visible, hidden, entry.outColors);
      view.thinInstanceBufferUpdated(VertexBuffer.ColorKind);
    }
    view.thinInstanceCount = count;
    view.thinInstanceBufferUpdated('matrix');
    // obal klonu = sjednocení obalů jeho čtverců v záběru (Babylon pak vyřadí i celý mesh)
    const box = emptyBounds(1);
    for (const c of visible) {
      for (let k = 0; k < 3; k++) {
        box[k] = Math.min(box[k]!, entry.bounds[c * 6 + k]!);
        box[3 + k] = Math.max(box[3 + k]!, entry.bounds[c * 6 + 3 + k]!);
      }
    }
    const info = view.getBoundingInfo();
    info.minimum.set(box[0]!, box[1]!, box[2]!);
    info.maximum.set(box[3]!, box[4]!, box[5]!);
    info.reConstruct(info.minimum, info.maximum, view.getWorldMatrix());
    view.setEnabled(true);
  }
}

function sameChunks(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Obal modelu z jeho vrcholů; bez vrcholů null. */
function positionBounds(mesh: Mesh): LocalBounds | null {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return [min[0]!, min[1]!, min[2]!, max[0]!, max[1]!, max[2]!];
}
