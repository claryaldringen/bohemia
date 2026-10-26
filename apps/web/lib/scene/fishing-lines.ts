// Vlasec rybářů (wildlife.md – Ve scéně): prut je rekvizita klipu `fish` v `man.glb` / `woman.glb`,
// vlasec je jedna čára od špičky prutu do vody – všechny vlasce vsi jeden LinesMesh. Rybář stojí
// (`stand`), takže se čáry přepočítají jen se změnou postav, ne v každém snímku.
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Špička prutu vůči nohám postavy velikosti 1 (m): prut ≈ 3 m od ruky šikmo vpřed a vzhůru
 * (`procedural_rod` – odhad z pózy `idle_relax`, ověřit okem) a kam vlasec dopadne (m před
 * postavou, hladina o kus níž než břeh).
 */
export const ROD_TIP = { forward: 2.2, up: 2.9 } as const;
export const LINE_REACH_M = 3.6;
const WATER_BELOW_M = 0.35;

/** Body vlasce rybáře: špička prutu a místo na hladině (x, y, z). */
export function fishingLine(
  pose: { x: number; z: number; headingX: number; headingZ: number },
  scale: number,
  groundY: number,
): [number, number, number, number, number, number] {
  return [
    pose.x + pose.headingX * ROD_TIP.forward * scale,
    groundY + ROD_TIP.up * scale,
    pose.z + pose.headingZ * ROD_TIP.forward * scale,
    pose.x + pose.headingX * LINE_REACH_M * scale,
    groundY - WATER_BELOW_M,
    pose.z + pose.headingZ * LINE_REACH_M * scale,
  ];
}

/** Vlasce všech rybářů vsi – jeden LinesMesh, přestaví se jen při změně čar. */
export class FishingLines {
  private mesh: LinesMesh | null = null;
  private key = '';

  constructor(private readonly scene: Scene) {}

  /** Nové čáry (po šesticích x, y, z – `fishingLine`); vrátí true, když se změnily. */
  set(lines: readonly (readonly number[])[]): boolean {
    const key = lines.map((l) => l.map((v) => v.toFixed(2)).join(',')).join('|');
    if (key === this.key) return false;
    this.key = key;
    this.mesh?.dispose();
    this.mesh = null;
    if (lines.length === 0) return true;
    const mesh = CreateLineSystem(
      'fishing-lines',
      {
        lines: lines.map((l) => [new Vector3(l[0], l[1], l[2]), new Vector3(l[3], l[4], l[5])]),
      },
      this.scene,
    );
    mesh.color = new Color3(0.82, 0.8, 0.72);
    mesh.alpha = 0.55;
    mesh.isPickable = false;
    this.mesh = mesh;
    return true;
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
  }
}
