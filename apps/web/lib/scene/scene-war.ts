import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import { surfaceAt, type Landscape } from '@bohemia/game';
import { ArmyRenderer, type SceneWar } from './army-renderer';
import type { JourneyScenePhase, JourneyYard } from './journey-departure';
import { JourneyMarker, journeyMarks } from './journey-marker';
import type { RiderPose, SceneJourney } from './journey-riders';
import type { Project } from './villager-pick';

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
  /** Výjezdy vojvody na mapě (vlastní i návštěvníci – journey-riders.ts). */
  private journeys: readonly SceneJourney[] = [];
  /** Praporek cíle a přesýpací hodiny vlastního výjezdu (journey-marker.ts). */
  private marker: JourneyMarker | null = null;
  /** Místa dvorce pro odjezd a příjezd výjezdu (journey-departure.ts). */
  private yard: JourneyYard | null = null;
  /** Stopa rodu pro mlhu cizí mapy výjezdu; null – bez mlhy výjezdu (army-renderer.ts). */
  private trail: readonly (readonly [number, number])[] | null = null;

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
    this.marker?.dispose();
    this.marker = new JourneyMarker(this.deps.scene, decalHeight);
    this.army.setJourneyYard(this.yard);
    if (this.war) this.army.set(this.war, Date.now(), this.deps.reducedMotion(), null);
    if (this.journeys.length > 0) {
      this.army.setJourneys(this.journeys, Date.now(), this.deps.reducedMotion(), null);
      this.marker.set(journeyMarks(this.journeys));
    }
    if (this.trail) this.army.setJourneyFog(this.trail);
  }

  /**
   * Mlha cizí mapy výjezdu (journey.md – Scéna cizí mapy): odkryté ze stopy rodu šeré, okolí
   * vlastních jezdců jasné; null – bez mlhy výjezdu. Drží se i přes novou krajinu.
   */
  setJourneyFog(trail: readonly (readonly [number, number])[] | null): void {
    this.trail = trail;
    if (this.army?.setJourneyFog(trail)) this.deps.requestRender();
  }

  /** Mlha v bodě (e2e): neobjevené, objevené, v dohledu; bez závoje null. */
  fogAt(x: number, z: number): 'hidden' | 'explored' | 'seen' | null {
    return this.army?.fogAt(x, z) ?? null;
  }

  /**
   * Výjezdy vojvody na mapě (journey.md – Scéna vsi): jezdci jako muži rodu ve vojsku, praporek
   * v cíli a přesýpací hodiny nad čekající skupinou. Prázdný seznam – nic.
   */
  setJourneys(list: readonly SceneJourney[]): void {
    this.journeys = list;
    const army = this.army?.setJourneys(
      list,
      Date.now(),
      this.deps.reducedMotion(),
      this.deps.camera(),
    );
    const marks = this.marker?.set(journeyMarks(list));
    if (army || marks) this.deps.requestRender();
  }

  /** Muž výjezdu pod kurzorem (CSS px) – výběr klikem; nic – null. */
  riderHit(x: number, y: number, project: Project): { pose: RiderPose; distance: number } | null {
    return this.army?.riderHit(x, y, project) ?? null;
  }

  /**
   * Místa dvorce pro odjezd a příjezd výjezdu (villager-plan-lord.ts – `journeyYard`); domov, od
   * kterého se odjezd a příjezd měří, nese výjezd ze serveru (journey-departure.ts).
   */
  setJourneyYard(yard: JourneyYard | null): void {
    this.yard = yard;
    this.army?.setJourneyYard(yard);
  }

  /** Koně a muži vsi, kteří odjíždějí nebo přijíždějí – ohrada a den rodiny je nekreslí. */
  journeyAway(): { horses: number[]; men: number[] } {
    return this.army?.journeyAway() ?? { horses: [], men: [] };
  }

  /**
   * Výjezdy ve scéně pro e2e: muži, jak jsou nakreslení, praporek, dny na hodinách, fáze vlastního
   * výjezdu (odjíždí, jede, přijíždí), koně bez jezdce mezi ohradou a kůlem a brána dvorce.
   */
  journeyStats(): {
    riders: readonly RiderPose[];
    banner: { x: number; z: number } | null;
    hourglass: number | null;
    phase: JourneyScenePhase | null;
    led: { x: number; z: number }[];
    gate: { x: number; z: number } | null;
  } {
    const marks = this.marker?.stats() ?? { banner: null, hourglass: null };
    return {
      riders: this.army?.journeyRiders() ?? [],
      ...marks,
      phase: this.army?.journeyPhase() ?? null,
      led: (this.army?.journeyLed() ?? []).map((h) => ({ x: h.x, z: h.z })),
      gate: this.yard ? { ...this.yard.gate } : null,
    };
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
    this.marker?.dispose();
  }
}
