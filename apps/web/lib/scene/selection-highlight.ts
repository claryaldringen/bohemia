import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { DWELLING_FOOTPRINT_M } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { cellsBoundary } from './field-cells';
import { footprintCorners, stripSegments, type Point } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';
import type { VillageTarget } from './village-picking';

/** Barva výběru – světlá zlatavá, jako prstenec vybrané jednotky v 0 A.D. */
const SELECTION_COLOR = new Color3(1, 0.86, 0.45);
/** O kolik je rámeček kolem obydlí větší než půdorys (m). */
const DWELLING_RING_MARGIN_M = 1.2;

/** Zvýraznění vybraného obydlí nebo pole – rámeček na zemi (obtisk). */
export class SelectionHighlight {
  private readonly material: StandardMaterial;
  private meshes: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly height: HeightFn,
  ) {
    this.material = createDecalMaterial(scene, 'selection-ring', {
      emissive: SELECTION_COLOR,
      zOffset: -6,
    });
  }

  /** Překreslí rámeček podle vybraného cíle ve vsi (null nebo zaniklý cíl = nic). */
  show(village: SceneVillage | null, target: VillageTarget | null): void {
    this.clear();
    if (!village || !target) return;
    const lines = targetOutline(village, target);
    if (lines.length === 0) return;
    const mesh = createStripMesh(
      this.scene,
      'selection-ring',
      lines.flatMap((line) => stripSegments(line, false, 0.35, 1.5)),
      this.height,
      0.15,
    );
    mesh.material = this.material;
    mesh.receiveShadows = false;
    this.meshes.push(mesh);
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
  }
}

/** Obrys cíle jako lomené čáry: rámeček kolem půdorysu obydlí, nebo mez kolem čtverců pole. */
function targetOutline(village: SceneVillage, target: VillageTarget): Point[][] {
  if (target.kind === 'dwelling') {
    const dwelling = village.dwellings.find((d) => d.id === target.id);
    if (!dwelling) return [];
    const { width, depth } = DWELLING_FOOTPRINT_M[dwelling.type];
    const corners = footprintCorners(
      dwelling.position,
      width + DWELLING_RING_MARGIN_M * 2,
      depth + DWELLING_RING_MARGIN_M * 2,
    );
    return [[...corners, corners[0]!]];
  }
  const field = village.fields.find((f) => f.id === target.id);
  if (!field || field.parts.length === 0) return [];
  return cellsBoundary(field.parts.map((p) => ({ cell: p.cell, x: p.x, z: p.z, size: p.size })));
}
