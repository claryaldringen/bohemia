// Pozemky polozemnic ve scéně: polský plot se zakulacenými rohy (kůly a proplétané větve),
// záhony se zeleninou a vyšlapaná cestička od branky ke dveřím. Rozmístění počítá
// homestead-layout.ts, díly (kůl, kůl branky, kus větve 1 m, záhon 1 × 0,8 m, rostliny) jsou
// v models/dwellings/homestead.glb (tools/blender/dwellings.py) a kreslí se v instancích – kůly
// a záhony stojí každý na svém místě terénu, větve vedou od kůlu ke kůlu i do svahu.
import type { Material } from '@babylonjs/core/Materials/material';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlotVariant } from '@bohemia/game';
import {
  BED_WIDTH_M,
  PLOT_CROPS,
  homesteadLayout,
  plotStage,
  type HomesteadLayout,
  type PlotSquare,
} from './homestead-layout';
import { loadModelParts } from './instanced-model';
import { decalGrid, polygonBounds, softCoverage } from './village-layout';
import { createDecalMesh, type HeightFn } from './village-meshes';

export const HOMESTEAD_MODEL_URL = '/models/dwellings/homestead.glb';
/** Výška vrchu záhonu nad jeho patou (m) – musí sedět s GARDEN_BED_H v dwellings.py. */
const BED_TOP_M = 0.12;
/** Záhon je o kousek zapuštěný, aby na svahu nevisel (m). */
const BED_SINK_M = 0.03;
const PATH_SOFT_M = 0.6;
const PATH_LIFT_M = 0.035;

/** Pozemek ke kreslení: id obydlí, políčko, varianta a co z něj už stojí. */
export interface PlotView {
  id: number;
  square: PlotSquare;
  variant: PlotVariant;
  progress: { posts: number; rails: number; beds: number };
}

interface PlotEntry {
  key: string;
  layoutKey: string;
  layout: HomesteadLayout;
  view: PlotView;
  path: Mesh | null;
}

const PARTS = [
  'fence-post',
  'fence-post-gate',
  'fence-rail',
  'bed',
  ...PLOT_CROPS.map((crop) => `plant-${crop}`),
] as const;

export class HomesteadRenderer {
  private readonly entries = new Map<number, PlotEntry>();
  private parts: Map<string, Mesh> | null = null;
  private loading: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      groundHeight: HeightFn;
      decalHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      onAsyncChange(): void;
      /** Materiál vyšlapané cestičky (obtisk z textury terénu). */
      pathMaterial(): Material;
      /** Úprava materiálu dílů (opar, roční období) jako u obydlí. */
      prepareMaterial(material: Material): void;
    },
  ) {}

  /** Překreslí pozemky, které se změnily; vrátí true, když se něco změnilo. */
  update(plots: readonly PlotView[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const view of plots) {
      seen.add(view.id);
      const layoutKey = `${view.square.x},${view.square.z},${view.square.size},${view.variant}`;
      const p = view.progress;
      const key = `${layoutKey}|${round(p.posts)}|${round(p.rails)}|${round(p.beds)}`;
      const current = this.entries.get(view.id);
      if (current?.key === key) continue;
      changed = true;
      const layout =
        current?.layoutKey === layoutKey
          ? current.layout
          : homesteadLayout(view.square, view.variant, view.id);
      // cestička až s hotovým plotem (branka)
      const wantsPath = p.rails >= 1;
      let path = current?.layoutKey === layoutKey ? current.path : null;
      if (current && current.path && (current.layoutKey !== layoutKey || !wantsPath)) {
        current.path.dispose();
        path = null;
      }
      if (wantsPath && !path) path = this.pathMesh(view.id, layout);
      this.entries.set(view.id, { key, layoutKey, layout, view, path });
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.path?.dispose();
      this.entries.delete(id);
      changed = true;
    }
    if (this.entries.size > 0) void this.load();
    if (changed) this.updateInstances();
    return changed;
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.path?.dispose();
    this.entries.clear();
    for (const mesh of this.parts?.values() ?? []) mesh.dispose();
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const parts = await loadModelParts(this.scene, HOMESTEAD_MODEL_URL, 'village-plot-', (m) =>
          this.context.prepareMaterial(m),
        );
        if (!parts) return;
        if (this.disposed) {
          for (const mesh of parts.values()) mesh.dispose();
          return;
        }
        for (const [name, mesh] of parts) {
          mesh.setEnabled(false);
          mesh.receiveShadows = true;
          if (name !== 'bed') this.context.addShadowCaster(mesh);
        }
        this.parts = parts;
        this.updateInstances();
        this.context.onAsyncChange();
      } catch (error) {
        console.warn('Díly pozemku se nepodařilo načíst.', error);
      }
    })();
    return this.loading;
  }

  /** Instance všech dílů ze všech pozemků. */
  private updateInstances(): void {
    const parts = this.parts;
    if (!parts) return;
    const buffers = new Map<string, number[]>(PARTS.map((name) => [name, []]));
    const height = this.context.groundHeight;
    const matrix = new Matrix();
    const push = (name: string): number[] => buffers.get(name)!;
    for (const { layout, view } of this.entries.values()) {
      const stage = plotStage(layout, view.progress);
      for (const post of stage.posts) {
        compose(matrix, post.x, height(post.x, post.z), post.z, 0, 1, null);
        appendMatrix(push(post.gate ? 'fence-post-gate' : 'fence-post'), matrix);
      }
      for (const rail of stage.rails) {
        const ay = height(rail.ax, rail.az) + rail.height;
        const by = height(rail.bx, rail.bz) + rail.height;
        segment(matrix, rail.ax, ay, rail.az, rail.bx, by, rail.bz);
        appendMatrix(push('fence-rail'), matrix);
      }
      const beds = stage.beds.map((bed) => {
        const half = bed.length / 2;
        const hw = BED_WIDTH_M / 2;
        const sx = (height(bed.x + half, bed.z) - height(bed.x - half, bed.z)) / bed.length;
        const sz = (height(bed.x, bed.z + hw) - height(bed.x, bed.z - hw)) / BED_WIDTH_M;
        const y = height(bed.x, bed.z) - BED_SINK_M;
        const up = new Vector3(-sx, 1, -sz).normalize();
        compose(matrix, bed.x, y, bed.z, 0, 1, up, bed.length);
        appendMatrix(push('bed'), matrix);
        return { bed, sx, sz, y };
      });
      for (const plant of stage.plants) {
        const base = beds[plant.bed];
        if (!base) continue;
        const y =
          base.y + BED_TOP_M + base.sx * (plant.x - base.bed.x) + base.sz * (plant.z - base.bed.z);
        compose(matrix, plant.x, y, plant.z, plant.rotationY, plant.scale, null);
        appendMatrix(push(`plant-${plant.crop}`), matrix);
      }
    }
    for (const [name, mesh] of parts) {
      const data = buffers.get(name);
      if (!data || data.length === 0) {
        mesh.setEnabled(false);
        continue;
      }
      mesh.thinInstanceSetBuffer('matrix', Float32Array.from(data), 16, true);
      mesh.setEnabled(true);
    }
  }

  /** Vyšlapaná tráva od branky ke dvorku před dveřmi. */
  private pathMesh(id: number, layout: HomesteadLayout): Mesh {
    const b = polygonBounds(layout.path);
    const pad = PATH_SOFT_M;
    const mesh = createDecalMesh(
      this.scene,
      `village-plot-path-${id}`,
      decalGrid(
        { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
        0.3,
        softCoverage(layout.path, PATH_SOFT_M),
      ),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: PATH_LIFT_M,
        color: [1, 0.95, 0.86],
        alpha: 0.85,
        uv: 20,
      },
    );
    mesh.material = this.context.pathMaterial();
    mesh.alphaIndex = 1;
    return mesh;
  }
}

function round(v: number): number {
  return Math.round(v * 100);
}

const SCALE = new Vector3();
const POSITION = new Vector3();
const ROTATION = new Quaternion();
const TILT = new Quaternion();
const UP = Vector3.Up();

/**
 * Matice instance: posun, natočení kolem svislé osy, náklon (svislá osa míří k `up`), měřítko
 * (`scaleX` natáhne díl podél jeho osy x – záhon na délku).
 */
function compose(
  out: Matrix,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  scale: number,
  up: Vector3 | null,
  scaleX = scale,
): void {
  Quaternion.RotationAxisToRef(UP, rotationY, ROTATION);
  if (up) {
    Quaternion.FromUnitVectorsToRef(UP, up, TILT);
    TILT.multiplyToRef(ROTATION, ROTATION);
  }
  SCALE.set(scaleX, scale, scale);
  POSITION.set(x, y, z);
  Matrix.ComposeToRef(SCALE, ROTATION, POSITION, out);
}

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

function appendMatrix(target: number[], matrix: Matrix): void {
  const m = matrix.m;
  for (let i = 0; i < 16; i++) target.push(m[i]!);
}
