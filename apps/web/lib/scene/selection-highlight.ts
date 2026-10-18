import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { DWELLING_FOOTPRINT_M, SACRED_BUILDINGS } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { cellsBoundary } from './field-cells';
import { footprintCorners, stripSegments, type Point } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';
import type { VillageTarget } from './village-picking';

/** Barva výběru – světlá zlatavá, jako prstenec vybrané jednotky v 0 A.D. */
const SELECTION_COLOR = new Color3(1, 0.86, 0.45);
/** O kolik je rámeček kolem obydlí větší než půdorys (m). */
const DWELLING_RING_MARGIN_M = 1.2;
/** Kroužek kolem posvátného dubu – kolem kruhu kamenů obětin (m). */
const OAK_RING_RADIUS_M = 2.6;

/** Zvýraznění vybraného obydlí, pole nebo hřbitova – rámeček na zemi (obtisk). */
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

/**
 * Obrys cíle jako lomené čáry: rámeček kolem půdorysu obydlí, modly nebo svatyně, kroužek kolem
 * posvátného dubu, nebo mez kolem čtverců pole, hřbitova, sadu či háje.
 */
export function targetOutline(village: SceneVillage, target: VillageTarget): Point[][] {
  if (target.kind === 'sacred') {
    const building = village.sacred?.buildings.find((b) => b.id === target.id);
    if (!building) return [];
    const size = SACRED_BUILDINGS[building.kind].footprintM + DWELLING_RING_MARGIN_M * 2;
    const corners = footprintCorners(building.position, size, size);
    return [[...corners, corners[0]!]];
  }
  if (target.kind === 'sacred-oak') {
    const oak = village.sacred?.oaks.find((o) => o.id === target.id);
    if (!oak) return [];
    const ring = Array.from({ length: 25 }, (_, k): Point => {
      const a = (k / 24) * Math.PI * 2;
      return [oak.x + Math.cos(a) * OAK_RING_RADIUS_M, oak.z + Math.sin(a) * OAK_RING_RADIUS_M];
    });
    return [ring];
  }
  if (target.kind === 'grove') {
    const grove = village.sacred?.groves.find((g) => g.id === target.id);
    return grove ? cellsBoundary(grove.squares) : [];
  }
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
  if (target.kind === 'cemetery') {
    const cemetery = village.cemeteries?.find((c) => c.id === target.id);
    return cemetery ? cellsBoundary(cemetery.squares) : [];
  }
  if (target.kind === 'orchard') {
    const orchard = village.orchards?.find((o) => o.id === target.id);
    return orchard ? cellsBoundary(orchard.squares) : [];
  }
  const field = village.fields.find((f) => f.id === target.id);
  if (!field || field.parts.length === 0) return [];
  return cellsBoundary(field.parts.map((p) => ({ cell: p.cell, x: p.x, z: p.z, size: p.size })));
}
