import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import { surfaceAt, type Landscape } from '@bohemia/game';
import { ArmyRenderer, type SceneWar } from './army-renderer';

/** Vstupy války ve scéně. */
export interface WarViewDeps {
  scene: Scene;
  /** Plátno – počty mužů a uprchlíků v `data-war-men` / `data-war-refugees` (e2e). */
  canvas: HTMLCanvasElement;
  /** Překreslit v příštím snímku (SceneLoop.requestRender). */
  requestRender: () => void;
  reducedMotion: () => boolean;
  camera: () => ArcRotateCamera | null;
}

/**
 * Válka ve scéně (war.md – Ve scéně; army-renderer.ts): vojsko, boj, pochod, průvody uprchlíků,
 * poslové a mlha války. Poslední snímek války si pamatuje – nová krajina ho dostane hned.
 */
export class SceneWarView {
  private army: ArmyRenderer | null = null;
  private war: SceneWar | null = null;

  constructor(private readonly deps: WarViewDeps) {}

  /** Vojsko nové krajiny (staré se zahodí); `decalHeight` – výška sítě terénu. */
  build(landscape: Landscape, decalHeight: (x: number, z: number) => number): void {
    this.army?.dispose();
    this.army = new ArmyRenderer(this.deps.scene, {
      groundHeight: decalHeight,
      forestAt: (x, z) => {
        const half = (landscape.size * landscape.cellSizeM) / 2;
        const tx = Math.floor((x + half) / landscape.cellSizeM);
        const ty = Math.floor((z + half) / landscape.cellSizeM);
        if (tx < 0 || ty < 0 || tx >= landscape.size || ty >= landscape.size) return false;
        return surfaceAt(landscape, tx, ty) === 'forest';
      },
      extentM: landscape.size * landscape.cellSizeM,
      onLoaded: () => {
        this.deps.requestRender();
      },
    });
    if (this.war) this.army.set(this.war, Date.now(), this.deps.reducedMotion(), null);
  }

  /**
   * Válka ve scéně: poslední snímek boje po taktu, pochod, útěk vsi, odehnané stádo a mlha
   * války; null – nic. Mezi takty se muži posouvají plynule v `animate()`.
   */
  set(war: SceneWar | null): void {
    this.war = war;
    const dataset = this.deps.canvas.dataset;
    // kolik mužů scéna dostala (boj – bojovníci, pochod – muži skupin) – pro e2e
    const men = war ? (war.battle?.fighters.length ?? 0) + (war.march?.members.length ?? 0) : 0;
    if (men > 0) dataset.warMen = String(men);
    else delete dataset.warMen;
    // lidé průvodů uprchlíků a poslové (Ú14) – pro e2e
    const alarm = war?.alarm;
    const refugees = alarm
      ? alarm.refugees.reduce((n, r) => n + r.people.length, 0) + alarm.messengers.length
      : 0;
    if (refugees > 0) dataset.warRefugees = String(refugees);
    else delete dataset.warRefugees;
    if (this.army?.set(war, Date.now(), this.deps.reducedMotion(), this.deps.camera())) {
      this.deps.requestRender();
    }
  }

  /** Meshe vojska, které se kreslí, a počty instancí (e2e, měření). */
  stats(): { name: string; count: number }[] {
    return this.army?.stats() ?? [];
  }

  /** Vojsko a boj – mezi takty plynule, šípy a prach; true, když se něco v záběru hnulo. */
  animate(epochMs: number, camera: Camera): boolean {
    return this.army?.animate(epochMs, camera) ?? false;
  }

  dispose(): void {
    this.army?.dispose();
  }
}
