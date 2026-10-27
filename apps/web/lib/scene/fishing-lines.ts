// Vlasec rybářů (wildlife.md – Ve scéně): prut je rekvizita klipu `fish` v `man.glb` / `woman.glb`,
// vlasec je jedna čára od špičky prutu do vody – všechny vlasce vsi jeden LinesMesh. Rybář stojí
// (`stand`), takže se čáry přepočítají jen se změnou postav, ne v každém snímku.
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { VillagerKind } from './villager-motion';

/**
 * Špička prutu vůči nohám postavy velikosti 1 (m – vpřed, vzhůru, vpravo) v klipu `fish`:
 * spočtená z kostry `man.glb` / `woman.glb` (prut `procedural_rod` u bodu `prop-weapon_R`, první
 * snímek klipu). Muž drží prut od pravého boku šikmo vpřed doleva, žena skoro svisle.
 */
export const ROD_TIP: Readonly<
  Record<VillagerKind, { forward: number; up: number; right: number }>
> = {
  man: { forward: 2.15, up: 1.62, right: -0.81 },
  woman: { forward: 0.93, up: 3.19, right: 0.23 },
};
/**
 * Vlasec dopadne tak daleko před špičkou prutu (m, postava velikosti 1) – za strmým břehem tůně
 * je voda až pár metrů před rybářem.
 */
export const LINE_BEYOND_M = 2;
/** Konec vlasce pod terénem v místě dopadu (m) – pod hladinou ho schová voda. */
const LINE_SINK_M = 0.3;

/**
 * Body vlasce rybáře: špička prutu a místo dopadu (x, y, z). Konec leží na dně pod hladinou
 * (`height` – výška terénu), takže viditelná čára končí na hladině; na suchu na zemi.
 */
export function fishingLine(
  pose: { x: number; z: number; headingX: number; headingZ: number },
  kind: VillagerKind,
  scale: number,
  height: (x: number, z: number) => number,
): [number, number, number, number, number, number] {
  const tip = ROD_TIP[kind];
  // vpravo od směru (hx, hz) je v levotočivé scéně (hz, −hx)
  const tx = pose.x + (pose.headingX * tip.forward + pose.headingZ * tip.right) * scale;
  const tz = pose.z + (pose.headingZ * tip.forward - pose.headingX * tip.right) * scale;
  const wx = tx + pose.headingX * LINE_BEYOND_M * scale;
  const wz = tz + pose.headingZ * LINE_BEYOND_M * scale;
  return [tx, height(pose.x, pose.z) + tip.up * scale, tz, wx, height(wx, wz) - LINE_SINK_M, wz];
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
