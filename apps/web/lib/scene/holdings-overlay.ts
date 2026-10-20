import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { cellsBoundary, type CellSquare } from './field-cells';
import { stripSegments, type Point } from './village-layout';
import { createDecalMaterial, createStripMesh, type HeightFn } from './village-meshes';

/**
 * Úsek hospodářství pro vývojový překryv – čtverce a barva obrysu (0–1). Místo čtverců může nést
 * přímo čáry obrysu ve světě (`lines`, uzavřené – obrys ostrožny; `open` – šíje).
 */
export interface HoldingsOverlaySector {
  cells: readonly CellSquare[];
  color: readonly [number, number, number];
  lines?: readonly (readonly Point[])[];
  open?: boolean;
}

/** Šířka obrysu úseku (m). */
const OUTLINE_WIDTH_M = 0.6;

/**
 * Vývojový překryv hospodaření podle polohy domů (fields.md): obrys každého úseku hospodářství
 * v barvě jeho domu – jen pro /dev/landscape, ve hře se nekreslí.
 */
export class HoldingsOverlay {
  private readonly materials = new Map<string, StandardMaterial>();
  private meshes: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly height: HeightFn,
  ) {}

  /** Překreslí obrysy úseků (null nebo prázdné = nic). */
  show(sectors: readonly HoldingsOverlaySector[] | null): void {
    this.clear();
    for (const [i, sector] of (sectors ?? []).entries()) {
      const lines = sector.lines ?? cellsBoundary(sector.cells);
      if (lines.length === 0) continue;
      const closed = sector.lines !== undefined && !sector.open;
      const mesh = createStripMesh(
        this.scene,
        `holdings-${i}`,
        lines.flatMap((line) =>
          stripSegments(line, closed, OUTLINE_WIDTH_M * (sector.lines ? 2 : 1), 1.5),
        ),
        this.height,
        0.2,
      );
      mesh.material = this.material(sector.color);
      mesh.receiveShadows = false;
      this.meshes.push(mesh);
    }
  }

  dispose(): void {
    this.clear();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  private material(color: readonly [number, number, number]): StandardMaterial {
    const name = color.map((c) => c.toFixed(3)).join(',');
    let material = this.materials.get(name);
    if (!material) {
      material = createDecalMaterial(this.scene, `holdings-${name}`, {
        emissive: new Color3(color[0], color[1], color[2]),
        zOffset: -5,
      });
      this.materials.set(name, material);
    }
    return material;
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
  }
}
