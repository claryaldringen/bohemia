import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneVillage } from '../village-view';
import { existingOutlines, type OutlineKind } from './placement-outlines';
import { stripSegments } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';

/** Barva čáry podle druhu – teplé a zelené tóny, čitelné na trávě, sněhu i hlíně. */
const COLORS: Record<OutlineKind, Color3> = {
  field: new Color3(1, 0.85, 0.2),
  orchard: new Color3(0.45, 1, 0.4),
  cemetery: new Color3(0.92, 0.94, 1),
  dwelling: new Color3(1, 0.7, 0.4),
  sacred: new Color3(1, 0.95, 0.5),
};
/** Šířka světlé čáry a tmavého lemu pod ní (m) – lem drží kontrast na sněhu a světlé trávě. */
const LINE_WIDTH_M = 0.28;
const EDGE_WIDTH_M = 0.7;
const STEP_M = 0.5;
/** Výška nad terénem (m): lem pod čárou, aby se nepřekrývaly. */
const LIFT = { edge: 0.1, line: 0.12 };

/** Zvýrazněné hranice stávajících objektů při malování pole, sadu a hřbitova. */
export class PlacementOutlines {
  private readonly materials = new Map<OutlineKind, StandardMaterial>();
  private readonly edgeMaterial: StandardMaterial;
  private meshes: Mesh[] = [];
  private active = false;

  constructor(
    private readonly scene: Scene,
    private readonly height: HeightFn,
    private readonly requestRender: () => void,
  ) {
    this.edgeMaterial = createDecalMaterial(scene, 'placement-outline-edge', {
      emissive: new Color3(0.12, 0.09, 0.05),
      zOffset: -7,
    });
    this.edgeMaterial.alpha = 0.55;
  }

  /** Ukáže obrysy ves (opakované volání po změně vsi je přestaví). */
  show(village: SceneVillage | null): void {
    this.active = true;
    this.rebuild(village);
  }

  /** Změna vsi během malování – jen když jsou obrysy zapnuté. */
  update(village: SceneVillage | null): void {
    if (this.active) this.rebuild(village);
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.clear();
    this.requestRender();
  }

  dispose(): void {
    this.clear();
    this.edgeMaterial.dispose();
    for (const material of this.materials.values()) material.dispose();
  }

  private rebuild(village: SceneVillage | null): void {
    this.clear();
    if (village) {
      for (const { kind, lines } of existingOutlines(village)) {
        const closed = (line: readonly [number, number][]): boolean =>
          line.length > 2 &&
          Math.hypot(
            line[0]![0] - line[line.length - 1]![0],
            line[0]![1] - line[line.length - 1]![1],
          ) < 1e-6;
        const strips = (width: number): [number, number][][] =>
          lines.flatMap((line) => {
            const loop = closed(line);
            return stripSegments(loop ? line.slice(0, -1) : line, loop, width, STEP_M);
          });
        const edge = createStripMesh(
          this.scene,
          `outline-edge-${kind}`,
          strips(EDGE_WIDTH_M),
          this.height,
          LIFT.edge,
        );
        edge.material = this.edgeMaterial;
        edge.receiveShadows = false;
        const mesh = createStripMesh(
          this.scene,
          `outline-${kind}`,
          strips(LINE_WIDTH_M),
          this.height,
          LIFT.line,
        );
        mesh.material = this.material(kind);
        mesh.receiveShadows = false;
        this.meshes.push(edge, mesh);
      }
    }
    this.requestRender();
  }

  private material(kind: OutlineKind): StandardMaterial {
    let material = this.materials.get(kind);
    if (!material) {
      material = createDecalMaterial(this.scene, `placement-outline-${kind}`, {
        emissive: COLORS[kind],
        zOffset: -8,
      });
      this.materials.set(kind, material);
    }
    return material;
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
  }
}
