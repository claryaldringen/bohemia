// Vojsko a boj ve scéně (war.md – Ve scéně): postavy (`man.glb`, `woman.glb` – zapečené animace
// jako lidé vsi, VillagerPlugin), koně a odehnaný dobytek (klíčové pózy jako dobytek –
// LivestockPlugin), měkké stíny, šípy, hozené kameny a oštěpy, prach srážek, ikony rozkazů nad
// skupinami a závoj mlhy války; u hradeb žebříky a otepi (díly `siege.glb`), oheň u paty (sprity
// ohně pálení paseky – ClearingFireRenderer) a jáma podkopu. Vše thin instances – draw call na druh. Rozmístění počítají army.ts, battle-fx.ts,
// fog-of-war.ts a villager-plan.ts (útěk), tady se jen zapíše do instancí; pohyb jen v `animate`
// (takt WATER_FPS scény), při omezeném pohybu stojí na posledním snímku boje.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { FORTIFICATIONS, TICK_MS, type BattleSide, type GroupOrder, type Pos } from '@bohemia/game';
import {
  ARMY_LOOKS,
  ORDER_ICON_LIFT_M,
  battleFigures,
  breachFagots,
  breachFires,
  marchFigures,
  minePits,
  orderIcons,
  type ArmyAnimal,
  type ArmyFigure,
  type FigureKind,
  type LadderModel,
  type LadderPose,
  type OrderIcon,
  type SceneBattle,
  type SceneMarch,
} from './army';
import {
  arrowAt,
  dustAt,
  fallenShown,
  pruneFx,
  strikesOf,
  DUST_S,
  type Clash,
  type MissileKind,
  type Shot,
} from './battle-fx';
import { heapFireShape, type HeapFire } from './clearing-fire';
import { ClearingFireRenderer, type FireKind } from './clearing-fire-renderer';
import { applyGammaFog } from './gamma-fog';
import { instanceMatrices, loadModelParts, type ModelInstance } from './instanced-model';
import { loadGeometry } from './fauna';
import { createFog, fogPixels, fogSees, revealFog, type FogGrid } from './fog-of-war';
import { createAnimalMesh, standOnGround, writeAnimalPose } from './livestock';
import { createBakedFigure, createBlobShadow, type BakedKind } from './plough-team-renderer';
import { villagerSeconds } from './villager-motion';
import { FIGURE_SCALE, fleeWalkAt, drivenHerd, type FleeWalk } from './villager-plan';
import { loadBakedModel } from './villagers';

/** Válka ve scéně – co kreslit (vstup odvozený z jádra – army.ts, villager-plan.ts). */
export interface SceneWar {
  /** Poslední snímek boje (po taktu); null – boj není. */
  battle: SceneBattle | null;
  /** Pochod vojska – hloučky skupin; null – vojsko nepochoduje. */
  march: SceneMarch | null;
  /** Útěk vsi k lesu (villager-plan.ts – `planFlight`) a kdy začal (ms). */
  flight: { walks: readonly FleeWalk[]; startMs: number } | null;
  /** Odehnané stádo za skupinou vojska (villager-plan.ts – `drivenHerd`). */
  herd: { lead: Pos; heading: Pos; count: number } | null;
  /** Mlha války z pohledu strany `side` (útočník na cizí mapě); null – bez mlhy. */
  fog: { side: BattleSide } | null;
  /** Konec herního dne (ms) – padlí leží do něj; null – leží, dokud je boj ve scéně. */
  dayEndMs: number | null;
}

/** Co renderer potřebuje od scény. */
export interface ArmyEnvironment {
  groundHeight(x: number, z: number): number;
  /** Les v bodě (mlha – kratší dohled). */
  forestAt(x: number, z: number): boolean;
  /** Hrana mapy (m) se středem v počátku – mřížka mlhy. */
  extentM: number;
  /** Dočetly se modely – překreslit. */
  onLoaded(): void;
}

/** Snímků za sekundu zapečené animace (villagers.ts). */
const BAKE_FPS = 24;
/** „Stojí“ – tempo VAT tak malé, že snímek zůstane (nulové by dělilo nulou). */
const STILL_FPS = 1e-4;
/** Měřítko koně jezdce (riders.ts – RIDE_HORSE_SCALE). */
const HORSE_SCALE = 1.06;
/** Délka kroku zvířete (m) – klíčové pózy nohou. */
const STRIDE_M = { horse: 2.6, cow: 1.6 } as const;
/** Stín pod postavou a zvířetem (průměr m). */
const SHADOW_M = { figure: 1.15, horse: 2.4, cow: 2.0 } as const;
/** Výška závoje mlhy nad terénem (m) a buněk sítě na hranu. */
const VEIL_LIFT_M = 2.0;
const VEIL_CELLS = 160;
/** Velikost ikony rozkazu (m) a textury (px). */
const ICON_M = 2.6;
const ICON_PX = 64;
const ORDERS: readonly GroupOrder[] = ['follow-leader', 'attack-all', 'hold-place'];
/** Díly obléhání ze `siege.glb` (tools/blender/siege.py) – žebříky a otep. */
const SIEGE_PARTS = ['ladder-5', 'ladder-7', 'fagot'] as const;
type SiegePart = (typeof SIEGE_PARTS)[number];
/** Ohňů u hradeb nejvýš (sprity předem) a sprity jednoho ohně (clearing-fire.ts). */
const MAX_BATTLE_FIRES = 6;
const BATTLE_FIRE_SPRITES = 16;
/** Semínko spritů ohně u hradby – odliší je od hromad paseky. */
const FIRE_SEED = 9_100_000;
/** Oheň u hradby hoří naplno, dokud je místo ve fázi `burn` (rozvrh je boj, ne herní den). */
const BATTLE_FIRE: FireKind = {
  name: 'battle-fire',
  capacity: MAX_BATTLE_FIRES * BATTLE_FIRE_SPRITES,
  shape: heapFireShape,
  state: () => ({ fire: 1, glow: 1, smoke: 0 }),
};

/** Materiál dílů obléhání – PBR z glb s oparem, matné dřevo. */
function prepareSiege(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
}

interface Animals {
  mesh: Mesh;
  matrices: Float32Array;
  states: Float32Array;
  dirty: boolean;
}

/** Vojsko, boj a mlha války ve scéně. */
export class ArmyRenderer {
  private war: SceneWar | null = null;
  private prev: SceneBattle | null = null;
  /** Kdy přišel poslední snímek boje (ms – výkonový čas, plynulost mezi takty). */
  private receivedAt = 0;
  private shots: Shot[] = [];
  private clashes: Clash[] = [];
  private readonly figures = new Map<FigureKind, BakedKind>();
  private readonly animals = new Map<'horse' | 'cow', Animals>();
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private arrows: { mesh: Mesh; matrices: Float32Array } | null = null;
  private stones: { mesh: Mesh; matrices: Float32Array } | null = null;
  private javelins: { mesh: Mesh; matrices: Float32Array } | null = null;
  private pits: { mesh: Mesh; matrices: Float32Array } | null = null;
  private readonly siege = new Map<SiegePart, Mesh>();
  private readonly fire: ClearingFireRenderer;
  private dust: { mesh: Mesh; matrices: Float32Array } | null = null;
  private readonly icons = new Map<GroupOrder, { mesh: Mesh; matrices: Float32Array }>();
  private fog: FogGrid | null = null;
  private seen: Uint8Array | null = null;
  private veil: { mesh: Mesh; texture: RawTexture; pixels: Uint8Array } | null = null;
  private loading: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: ArmyEnvironment,
  ) {
    this.fire = new ClearingFireRenderer(scene, {
      groundHeight: (x, z) => env.groundHeight(x, z),
      kind: BATTLE_FIRE,
    });
  }

  /** Nový stav války (snímek boje po taktu). Vrátí true, když je co překreslit. */
  set(war: SceneWar | null, nowMs: number, frozen: boolean, camera: Camera | null): boolean {
    const had = this.war !== null;
    const cur = war?.battle ?? null;
    const last = this.war?.battle ?? null;
    if (cur && (!last || cur.ticks !== last.ticks)) {
      this.prev = last && cur.ticks > last.ticks ? last : null;
      this.receivedAt = performance.now();
      if (!frozen) {
        const nowS = villagerSeconds(nowMs);
        const fresh = strikesOf(this.prev, cur, nowS);
        this.shots.push(...fresh.shots);
        this.clashes.push(...fresh.clashes);
      }
    }
    if (!cur) this.prev = null;
    this.war = war;
    if (!war) {
      this.shots = [];
      this.clashes = [];
      this.fog = null;
      this.fire.set([], 'none');
      this.fire.animate(nowMs, camera);
      this.hideAll();
      return had;
    }
    void this.load();
    this.updateFog();
    this.write(nowMs, frozen, camera);
    // oheň u hradby i při omezeném pohybu – jeden snímek plamenů
    this.fire.animate(nowMs, camera);
    return true;
  }

  /** Posun v čase – true, když se něco hnulo (boj běží, letí šíp, lidé utíkají). */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (!this.war) return false;
    const fire = this.fire.animate(nowMs, camera);
    return this.write(nowMs, false, camera) || fire;
  }

  /** Meshe vojska, které se kreslí (jméno a počet instancí) – e2e a měření. */
  stats(): { name: string; count: number }[] {
    return this.scene.meshes
      .filter((m) => (m.name.startsWith('army-') || m.name === 'fog-veil') && m.isEnabled())
      .map((m) => ({ name: m.name, count: m instanceof Mesh ? m.thinInstanceCount : 0 }));
  }

  dispose(): void {
    this.disposed = true;
    for (const k of this.figures.values()) {
      k.mesh.material?.dispose(true, true);
      k.manager.texture?.dispose();
      k.mesh.dispose();
    }
    for (const a of this.animals.values()) {
      a.mesh.material?.dispose(true, true);
      a.mesh.dispose();
    }
    for (const m of [
      this.shadow,
      this.arrows,
      this.stones,
      this.javelins,
      this.pits,
      this.dust,
      ...this.icons.values(),
    ]) {
      m?.mesh.material?.dispose(true, true);
      m?.mesh.dispose();
    }
    for (const mesh of this.siege.values()) {
      mesh.material?.dispose(true, true);
      mesh.dispose();
    }
    this.fire.dispose();
    this.veil?.texture.dispose();
    this.veil?.mesh.material?.dispose();
    this.veil?.mesh.dispose();
  }

  /** Dohled strany s mlhou z mužů v boji a hloučků pochodu; závoj se přepíše jen při změně. */
  private updateFog(): void {
    const war = this.war;
    if (!war?.fog) {
      this.fog = null;
      this.seen = null;
      this.veil?.mesh.setEnabled(false);
      return;
    }
    this.fog ??= createFog(this.env.extentM);
    const side = war.fog.side;
    const viewers = [
      ...(war.battle?.fighters ?? [])
        .filter((f) => f.side === side && f.state !== 'down' && f.state !== 'fled')
        .map((f) => f.pos),
      ...(side === 'attack' ? (war.march?.groups ?? []).map((g) => g.pos) : []),
    ].map((p) => ({ x: p.x, z: p.z, forest: this.env.forestAt(p.x, p.z) }));
    this.seen = revealFog(this.fog, viewers, (x, z) => this.env.forestAt(x, z));
    const veil = this.ensureVeil(this.fog);
    fogPixels(this.fog, this.seen, veil.pixels);
    veil.texture.update(veil.pixels);
    veil.mesh.setEnabled(true);
  }

  /** Zapíše postavy, zvířata, šípy, prach a ikony v okamžiku `nowMs`. True – něco se hýbe. */
  private write(nowMs: number, frozen: boolean, camera: Camera | null): boolean {
    const war = this.war;
    if (!war) return false;
    const t = villagerSeconds(nowMs);
    const figures: ArmyFigure[] = [];
    const animals: ArmyAnimal[] = [];
    let ladders: LadderPose[] = [];
    let moving = false;
    const battle = war.battle;
    if (battle) {
      const f = frozen ? 1 : (performance.now() - this.receivedAt) / TICK_MS;
      const fog = this.fog;
      const seen = this.seen;
      const side = war.fog?.side;
      const out = battleFigures(this.prev, battle, f, {
        showFallen: fallenShown(nowMs, war.dayEndMs),
        ...(fog && seen && side
          ? {
              visible: (s: BattleSide, x: number, z: number) =>
                s === side || fogSees(fog, seen, x, z),
            }
          : {}),
      });
      figures.push(...out.figures);
      animals.push(...out.animals);
      ladders = out.ladders;
      moving ||= battle.outcome === 'ongoing' && f < 1.5;
    }
    this.writeSiege(battle, ladders);
    if (war.march) {
      const out = marchFigures(war.march);
      figures.push(...out.figures);
      animals.push(...out.animals);
      moving ||= war.march.groups.some((g) => !g.arrived);
    }
    if (war.flight) {
      const ft = (nowMs - war.flight.startMs) / 1000;
      for (const walk of war.flight.walks) {
        const at = fleeWalkAt(walk, ft);
        moving ||= at.moving;
        figures.push({
          key: `f${walk.id}`,
          kind: walk.kind,
          x: at.x,
          z: at.z,
          hx: at.hx,
          hz: at.hz,
          clip: at.moving ? walk.clip : 'idle',
          pace: at.moving ? walk.speed / 1.3 : 1,
          lift: 0,
          lying: false,
          side: 'folk',
          look: ARMY_LOOKS.folk,
        });
      }
    }
    if (war.herd) {
      const h = war.herd;
      drivenHerd(h.lead, h.heading, h.count).forEach((p, i) => {
        animals.push({
          key: `c${i}`,
          species: 'cow',
          x: p.x,
          z: p.z,
          hx: h.heading.x,
          hz: h.heading.z,
          speed: 1.4,
        });
      });
    }
    const icons = orderIcons(battle, war.march);
    this.writeFigures(figures, t, frozen);
    this.writeAnimals(animals, t, frozen);
    this.writeShadows(figures, animals);
    const fxMoving = frozen ? false : this.writeFx(t);
    this.writeIcons(icons, camera);
    // postavy hrají klipy (VAT) – dokud nějaké stojí ve scéně, kreslí se v taktu animací
    return moving || fxMoving || figures.length + animals.length > 0;
  }

  private writeFigures(list: readonly ArmyFigure[], t: number, frozen: boolean): void {
    for (const [kind, k] of this.figures) {
      const mine = list.filter((x) => x.kind === kind);
      ensure(k, mine.length);
      mine.forEach((fig, i) => writeFigure(k, i, fig, this.env.groundHeight(fig.x, fig.z), frozen));
      k.mesh.thinInstanceCount = mine.length;
      k.mesh.setEnabled(mine.length > 0);
      if (mine.length === 0) continue;
      k.mesh.thinInstanceBufferUpdated('matrix');
      k.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      k.mesh.thinInstanceBufferUpdated('villagerLook');
      k.manager.time = frozen ? 0 : (t % 3600) + 3600;
    }
  }

  private writeAnimals(list: readonly ArmyAnimal[], t: number, frozen: boolean): void {
    for (const [species, a] of this.animals) {
      const mine = list.filter((x) => x.species === species);
      if (a.matrices.length < Math.max(1, mine.length) * 16) {
        a.matrices = new Float32Array(Math.max(1, mine.length) * 2 * 16);
        a.states = new Float32Array(Math.max(1, mine.length) * 2 * 2);
        a.mesh.thinInstanceSetBuffer('matrix', a.matrices, 16, false);
        a.mesh.thinInstanceSetBuffer('livestockState', a.states, 2, false);
      }
      mine.forEach((x, i) => {
        const stride =
          frozen || x.speed < 0.15
            ? 0
            : Math.sin((2 * Math.PI * t * x.speed) / STRIDE_M[species] + i);
        writeAnimalPose(
          a,
          i,
          { x: x.x, z: x.z, forwardX: x.hx, forwardZ: x.hz, stride, head: 0 },
          species === 'horse' ? HORSE_SCALE : 1,
          (px, pz) => this.env.groundHeight(px, pz),
        );
      });
      a.mesh.thinInstanceCount = mine.length;
      a.mesh.setEnabled(mine.length > 0);
      if (mine.length === 0) continue;
      a.mesh.thinInstanceBufferUpdated('matrix');
      a.mesh.thinInstanceBufferUpdated('livestockState');
    }
  }

  private writeShadows(figures: readonly ArmyFigure[], animals: readonly ArmyAnimal[]): void {
    const s = this.shadow;
    if (!s) return;
    const n = figures.length + animals.length;
    if (s.matrices.length < Math.max(1, n) * 16) {
      s.matrices = new Float32Array(Math.max(1, n) * 2 * 16);
      s.mesh.thinInstanceSetBuffer('matrix', s.matrices, 16, false);
    }
    let i = 0;
    for (const f of figures) {
      if (f.lift > 0) continue; // jezdec – stín má kůň
      const len = f.lying ? 2.0 : SHADOW_M.figure;
      flat(
        s.matrices,
        i++,
        f.x,
        this.env.groundHeight(f.x, f.z) + 0.04,
        f.z,
        f.hx,
        f.hz,
        len * FIGURE_SCALE,
        SHADOW_M.figure * FIGURE_SCALE,
      );
    }
    for (const a of animals) {
      const len = SHADOW_M[a.species];
      flat(
        s.matrices,
        i++,
        a.x,
        this.env.groundHeight(a.x, a.z) + 0.04,
        a.z,
        a.hx,
        a.hz,
        len,
        len * 0.45,
      );
    }
    s.mesh.thinInstanceCount = i;
    s.mesh.setEnabled(i > 0);
    if (i > 0) s.mesh.thinInstanceBufferUpdated('matrix');
  }

  /** Šípy v letu a prach srážek; true – ještě něco letí. */
  private writeFx(t: number): boolean {
    this.shots = pruneFx(this.shots, t, (x) => x.flightS);
    this.clashes = pruneFx(this.clashes, t, () => DUST_S);
    for (const [kind, holder] of [
      ['arrow', this.arrows],
      ['stone', this.stones],
      ['javelin', this.javelins],
    ] as const) {
      if (holder) this.writeMissiles(holder, kind, t);
    }
    const dust = this.dust;
    if (dust) {
      if (dust.matrices.length < Math.max(1, this.clashes.length) * 16) {
        dust.matrices = new Float32Array(Math.max(1, this.clashes.length) * 2 * 16);
        dust.mesh.thinInstanceSetBuffer('matrix', dust.matrices, 16, false);
      }
      let n = 0;
      for (const c of this.clashes) {
        const r = dustAt(c, t);
        if (r === null) continue;
        flat(
          dust.matrices,
          n++,
          c.at.x,
          this.env.groundHeight(c.at.x, c.at.z) + 0.08,
          c.at.z,
          1,
          0,
          r * 2,
          r * 2,
        );
      }
      dust.mesh.thinInstanceCount = n;
      dust.mesh.setEnabled(n > 0);
      if (n > 0) dust.mesh.thinInstanceBufferUpdated('matrix');
    }
    return this.shots.length > 0 || this.clashes.length > 0;
  }

  /** Šípy, kameny či oštěpy v letu (`kind`) do jejich meshe. */
  private writeMissiles(
    holder: { mesh: Mesh; matrices: Float32Array },
    kind: MissileKind,
    t: number,
  ): void {
    const mine = this.shots.filter((x) => (x.kind ?? 'arrow') === kind);
    if (holder.matrices.length < Math.max(1, mine.length) * 16) {
      holder.matrices = new Float32Array(Math.max(1, mine.length) * 2 * 16);
      holder.mesh.thinInstanceSetBuffer('matrix', holder.matrices, 16, false);
    }
    let n = 0;
    for (const shot of mine) {
      const p = arrowAt(shot, t);
      if (!p) continue;
      // terén pod střelou mezi střelcem a cílem (oblouk je nad spojnicí ramen)
      const ground =
        this.env.groundHeight(shot.from.x, shot.from.z) * (1 - p.u) +
        this.env.groundHeight(shot.to.x, shot.to.z) * p.u;
      along(holder.matrices, n++, p.x, ground + p.y, p.z, p.dx, p.dy, p.dz);
    }
    holder.mesh.thinInstanceCount = n;
    holder.mesh.setEnabled(n > 0);
    if (n > 0) holder.mesh.thinInstanceBufferUpdated('matrix');
  }

  /**
   * Obléhání u hradeb: žebříky (opřené, ležící, nesené – díl podle délky), otepi u paty, oheň
   * ve fázi `burn` (sprity – ClearingFireRenderer, klíč podle hořících míst) a jámy podkopu.
   */
  private writeSiege(battle: SceneBattle | null, ladders: readonly LadderPose[]): void {
    const ground = (x: number, z: number): number => this.env.groundHeight(x, z);
    const byModel = new Map<LadderModel, ModelInstance[]>();
    for (const l of ladders) {
      const list = byModel.get(l.model) ?? [];
      // příčky napříč směrem žebříku (díl stojí podél Y, příčky podél X)
      list.push({
        x: l.x,
        y: ground(l.x, l.z) + l.lift,
        z: l.z,
        rotationY: Math.atan2(-l.up.x, -l.up.z),
        scale: 1,
        up: l.up,
      });
      byModel.set(l.model, list);
    }
    const fagots = battle ? breachFagots(battle) : [];
    const parts: Record<SiegePart, ModelInstance[]> = {
      'ladder-5': byModel.get('ladder-5') ?? [],
      'ladder-7': byModel.get('ladder-7') ?? [],
      fagot: fagots.map((f) => ({
        x: f.x,
        y: ground(f.x, f.z) + f.lift,
        z: f.z,
        rotationY: f.yaw,
        scale: 1,
      })),
    };
    for (const name of SIEGE_PARTS) {
      const mesh = this.siege.get(name);
      if (!mesh) continue;
      const list = parts[name];
      if (list.length > 0) mesh.thinInstanceSetBuffer('matrix', instanceMatrices(list), 16, false);
      mesh.thinInstanceCount = list.length;
      mesh.setEnabled(list.length > 0);
    }
    const fires = battle ? breachFires(battle).slice(0, MAX_BATTLE_FIRES) : [];
    this.fire.set(
      fires.map((f, i): HeapFire => ({
        x: f.x,
        z: f.z,
        yaw: f.yaw,
        scale: f.scale,
        square: f.key,
        seed: FIRE_SEED + i * 7,
        order: 0,
        burn: {},
      })),
      fires.map((f) => f.key).join('|'),
    );
    const pits = this.pits;
    if (pits) {
      const list = battle ? minePits(battle, FORTIFICATIONS.assault.undergroundShare) : [];
      if (pits.matrices.length < Math.max(1, list.length) * 16) {
        pits.matrices = new Float32Array(Math.max(1, list.length) * 2 * 16);
        pits.mesh.thinInstanceSetBuffer('matrix', pits.matrices, 16, false);
      }
      list.forEach((p, i) =>
        flat(pits.matrices, i, p.x, ground(p.x, p.z) + 0.06, p.z, 1, 0, p.radius * 2, p.radius * 2),
      );
      pits.mesh.thinInstanceCount = list.length;
      pits.mesh.setEnabled(list.length > 0);
      if (list.length > 0) pits.mesh.thinInstanceBufferUpdated('matrix');
    }
  }

  /** Ikony rozkazů – čtverce natočené ke kameře (bez kamery k jihu). */
  private writeIcons(icons: readonly OrderIcon[], camera: Camera | null): void {
    const view = camera?.getViewMatrix().m;
    const rx = view ? view[0]! : 1;
    const ry = view ? view[4]! : 0;
    const rz = view ? view[8]! : 0;
    const ux = view ? view[1]! : 0;
    const uy = view ? view[5]! : 1;
    const uz = view ? view[9]! : 0;
    for (const order of ORDERS) {
      const icon = this.icons.get(order);
      if (!icon) continue;
      const mine = icons.filter((x) => x.order === order);
      if (icon.matrices.length < Math.max(1, mine.length) * 16) {
        icon.matrices = new Float32Array(Math.max(1, mine.length) * 2 * 16);
        icon.mesh.thinInstanceSetBuffer('matrix', icon.matrices, 16, false);
      }
      mine.forEach((x, i) => {
        const m = icon.matrices;
        const o = i * 16;
        const y = this.env.groundHeight(x.x, x.z) + ORDER_ICON_LIFT_M;
        m.set(
          [rx * ICON_M, ry * ICON_M, rz * ICON_M, 0, ux * ICON_M, uy * ICON_M, uz * ICON_M, 0],
          o,
        );
        // normála ke kameře (vpravo × nahoru)
        m.set([ry * uz - rz * uy, rz * ux - rx * uz, rx * uy - ry * ux, 0, x.x, y, x.z, 1], o + 8);
      });
      icon.mesh.thinInstanceCount = mine.length;
      icon.mesh.setEnabled(mine.length > 0);
      if (mine.length > 0) icon.mesh.thinInstanceBufferUpdated('matrix');
    }
  }

  private hideAll(): void {
    for (const k of this.figures.values()) k.mesh.setEnabled(false);
    for (const a of this.animals.values()) a.mesh.setEnabled(false);
    for (const m of [
      this.shadow,
      this.arrows,
      this.stones,
      this.javelins,
      this.pits,
      this.dust,
      ...this.icons.values(),
    ])
      m?.mesh.setEnabled(false);
    for (const mesh of this.siege.values()) mesh.setEnabled(false);
    this.veil?.mesh.setEnabled(false);
  }

  private ensureVeil(fog: FogGrid): { mesh: Mesh; texture: RawTexture; pixels: Uint8Array } {
    if (this.veil) return this.veil;
    const mesh = new Mesh('fog-veil', this.scene);
    const n = VEIL_CELLS;
    const ext = fog.size * fog.cellM;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = fog.minX + (i / n) * ext;
        const z = fog.minZ + (j / n) * ext;
        positions.push(x, this.env.groundHeight(x, z) + VEIL_LIFT_M, z);
        uvs.push(i / n, j / n);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
    const data = new VertexData();
    data.positions = positions;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alphaIndex = 8;
    const pixels = new Uint8Array(fog.size * fog.size * 4);
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      fog.size,
      fog.size,
      this.scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.name = 'fog-veil';
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const material = new StandardMaterial('fog-veil-material', this.scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.emissiveColor = new Color3(0.18, 0.19, 0.21);
    material.specularColor = Color3.Black();
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    mesh.material = material;
    this.veil = { mesh, texture, pixels };
    return this.veil;
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const [man, woman, horse, cow, siege] = await Promise.allSettled([
        loadBakedModel(this.scene, '/models/people/man.glb'),
        loadBakedModel(this.scene, '/models/people/woman.glb'),
        loadGeometry(this.scene, '/models/fauna/horse.glb'),
        loadGeometry(this.scene, '/models/fauna/cow.glb'),
        loadModelParts(this.scene, '/models/siege/siege.glb', 'army-', prepareSiege),
      ]);
      if (this.disposed || this.scene.isDisposed) {
        if (siege.status === 'fulfilled') for (const m of siege.value?.values() ?? []) m.dispose();
        return;
      }
      if (siege.status === 'fulfilled' && siege.value) {
        for (const [name, mesh] of siege.value) {
          if (!(SIEGE_PARTS as readonly string[]).includes(name)) {
            mesh.dispose();
            continue;
          }
          mesh.alwaysSelectAsActiveMesh = true;
          mesh.thinInstanceSetBuffer('matrix', new Float32Array(16), 16, false);
          mesh.thinInstanceCount = 0;
          mesh.setEnabled(false);
          this.siege.set(name as SiegePart, mesh);
        }
      } else console.warn('Model obléhání (žebříky, otepi) se nepodařilo načíst.');
      if (man.status === 'fulfilled' && man.value) {
        const k = createBakedFigure(this.scene, 'army-man', man.value);
        ensure(k, 8, true);
        this.figures.set('man', k);
      } else console.warn('Model muže vojska se nepodařilo načíst.');
      if (woman.status === 'fulfilled' && woman.value) {
        const k = createBakedFigure(this.scene, 'army-woman', woman.value);
        ensure(k, 4, true);
        this.figures.set('woman', k);
      }
      for (const [species, r] of [
        ['horse', horse],
        ['cow', cow],
      ] as const) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const mesh = createAnimalMesh(this.scene, `army-${species}`, standOnGround(r.value));
        mesh.alwaysSelectAsActiveMesh = true;
        const a: Animals = {
          mesh,
          matrices: new Float32Array(16),
          states: new Float32Array(2),
          dirty: false,
        };
        mesh.thinInstanceSetBuffer('matrix', a.matrices, 16, false);
        mesh.thinInstanceSetBuffer('livestockState', a.states, 2, false);
        this.animals.set(species, a);
      }
      this.shadow = createBlobShadow(this.scene, 'army-shadow', 0.5);
      const dust = createBlobShadow(this.scene, 'army-dust', 0.55);
      if (dust.mesh.material instanceof StandardMaterial) {
        dust.mesh.material.emissiveColor = new Color3(0.52, 0.44, 0.32);
      }
      this.dust = dust;
      const arrow = CreateBox(
        'army-arrow',
        { width: 0.035, height: 0.035, depth: 0.9 },
        this.scene,
      );
      arrow.isPickable = false;
      arrow.alwaysSelectAsActiveMesh = true;
      const wood = new StandardMaterial('army-arrow-material', this.scene);
      wood.diffuseColor = new Color3(0.42, 0.3, 0.18);
      wood.specularColor = Color3.Black();
      arrow.material = wood;
      this.arrows = { mesh: arrow, matrices: new Float32Array(16) };
      const javelin = CreateBox(
        'army-javelin',
        { width: 0.045, height: 0.045, depth: 1.8 },
        this.scene,
      );
      javelin.material = wood;
      const stone = CreateBox('army-stone', { size: 0.24 }, this.scene);
      const grey = new StandardMaterial('army-stone-material', this.scene);
      grey.diffuseColor = new Color3(0.5, 0.48, 0.44);
      grey.specularColor = Color3.Black();
      stone.material = grey;
      for (const mesh of [javelin, stone]) {
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
      }
      this.javelins = { mesh: javelin, matrices: new Float32Array(16) };
      this.stones = { mesh: stone, matrices: new Float32Array(16) };
      const pit = createBlobShadow(this.scene, 'army-pit', 0.92);
      if (pit.mesh.material instanceof StandardMaterial) {
        pit.mesh.material.emissiveColor = new Color3(0.1, 0.07, 0.04);
      }
      this.pits = pit;
      for (const order of ORDERS) this.icons.set(order, this.createIcon(order));
      for (const m of [
        this.shadow,
        this.dust,
        this.arrows,
        this.javelins,
        this.stones,
        this.pits,
        ...this.icons.values(),
      ]) {
        m.mesh.thinInstanceSetBuffer('matrix', m.matrices, 16, false);
        m.mesh.thinInstanceCount = 0;
        m.mesh.setEnabled(false);
      }
      for (const k of this.figures.values()) k.mesh.setEnabled(false);
      for (const a of this.animals.values()) a.mesh.setEnabled(false);
      if (this.war) this.write(Date.now(), false, null);
      this.env.onLoaded();
    })();
    return this.loading;
  }

  /** Ikona rozkazu – čtverec s texturou (kreslí se přes vše, bez světla). */
  private createIcon(order: GroupOrder): { mesh: Mesh; matrices: Float32Array } {
    const mesh = new Mesh(`army-order-${order}`, this.scene);
    const data = new VertexData();
    data.positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.indices = [0, 1, 2, 0, 2, 3];
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.alphaIndex = 9;
    const texture = RawTexture.CreateRGBATexture(
      orderIconPixels(order, ICON_PX),
      ICON_PX,
      ICON_PX,
      this.scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.name = `army-order-${order}`;
    const material = new StandardMaterial(`army-order-${order}-material`, this.scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.backFaceCulling = false;
    material.depthFunction = Constants.ALWAYS;
    mesh.material = material;
    return { mesh, matrices: new Float32Array(16) };
  }
}

/** Buffery instancí postav aspoň pro `n` (rostou po dvojnásobku). */
function ensure(k: BakedKind, n: number, force = false): void {
  if (!force && k.matrices.length >= Math.max(1, n) * 16) return;
  const cap = Math.max(1, n) * 2;
  k.matrices = new Float32Array(cap * 16);
  k.settings = new Float32Array(cap * 4);
  k.looks = new Float32Array(cap * 4);
  k.mesh.thinInstanceSetBuffer('matrix', k.matrices, 16, false);
  k.mesh.thinInstanceSetBuffer('bakedVertexAnimationSettingsInstanced', k.settings, 4, false);
  k.mesh.thinInstanceSetBuffer('villagerLook', k.looks, 4, false);
}

/** Matice a klip postavy: stojí ve směru pohledu, padlý leží na zemi tváří dolů. */
function writeFigure(
  k: BakedKind,
  slot: number,
  fig: ArmyFigure,
  ground: number,
  frozen: boolean,
): void {
  const m = k.matrices;
  const o = slot * 16;
  const s = FIGURE_SCALE;
  if (fig.lying) {
    // osa postavy (nahoru) leží ve směru pohledu, dopředu míří do země
    m.set(
      [
        fig.hz * s,
        0,
        -fig.hx * s,
        0,
        fig.hx * s,
        0,
        fig.hz * s,
        0,
        0,
        -s,
        0,
        0,
        fig.x,
        ground + 0.14,
        fig.z,
        1,
      ],
      o,
    );
  } else {
    m.set(
      [
        fig.hz * s,
        0,
        -fig.hx * s,
        0,
        0,
        s,
        0,
        0,
        fig.hx * s,
        0,
        fig.hz * s,
        0,
        fig.x,
        ground + fig.lift,
        fig.z,
        1,
      ],
      o,
    );
  }
  const clip = k.clips.get(fig.clip) ?? k.clips.get('idle') ?? { start: 0, end: 0 };
  const length = clip.end - clip.start + 1;
  const still = frozen || fig.pace <= 0;
  k.settings.set(
    [
      clip.start,
      clip.end,
      still ? 0 : ((hash(fig.key) % 997) / 997) * length,
      still ? STILL_FPS : BAKE_FPS * fig.pace,
    ],
    slot * 4,
  );
  k.looks.set(fig.look, slot * 4);
}

/** Vodorovná elipsa (stín, prach) – délka ve směru `hx/hz`, šířka napříč. */
function flat(
  m: Float32Array,
  slot: number,
  x: number,
  y: number,
  z: number,
  hx: number,
  hz: number,
  length: number,
  width: number,
): void {
  m.set(
    [hz * width, 0, -hx * width, 0, 0, 1, 0, 0, hx * length, 0, hz * length, 0, x, y, z, 1],
    slot * 16,
  );
}

/** Matice podél směru (šíp – osa Z modelu). */
function along(
  m: Float32Array,
  slot: number,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
): void {
  // vpravo = nahoru × směr, nahoru = směr × vpravo
  let rx = dz;
  let rz = -dx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = dy * rz;
  const uy = dz * rx - dx * rz;
  const uz = -dy * rx;
  m.set([rx, 0, rz, 0, ux, uy, uz, 0, dx, dy, dz, 0, x, y, z, 1], slot * 16);
}

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Ikona rozkazu (RGBA `px × px`): tmavý kruh se světlým znakem – následovat velitele šipka
 * vzhůru, útočit na vše dvě zkřížené čepele, držet místo praporec na žerdi.
 */
export function orderIconPixels(order: GroupOrder, px: number): Uint8Array {
  const out = new Uint8Array(px * px * 4);
  const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number): number => {
    const vx = bx - ax;
    const vy = by - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - ax - vx * u, y - ay - vy * u);
  };
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = (i + 0.5) / px - 0.5;
      const y = (j + 0.5) / px - 0.5;
      const r = Math.hypot(x, y);
      let d: number;
      if (order === 'follow-leader') {
        d = Math.min(
          seg(x, y, 0, -0.28, 0, 0.26),
          seg(x, y, -0.2, 0.06, 0, 0.27),
          seg(x, y, 0.2, 0.06, 0, 0.27),
        );
      } else if (order === 'attack-all') {
        d = Math.min(seg(x, y, -0.24, -0.24, 0.24, 0.24), seg(x, y, -0.24, 0.24, 0.24, -0.24));
      } else {
        const inFlag = x > -0.14 && x < 0.22 && y > 0.02 && y < 0.26 ? 0 : 1;
        d = Math.min(seg(x, y, -0.16, -0.28, -0.16, 0.28), inFlag ? 1 : 0);
      }
      const o = (j * px + i) * 4;
      const sign = d < 0.045;
      const badge = r < 0.48;
      const c = sign ? (order === 'attack-all' ? [236, 92, 70] : [240, 230, 205]) : [40, 34, 30];
      out[o] = c[0]!;
      out[o + 1] = c[1]!;
      out[o + 2] = c[2]!;
      out[o + 3] = badge ? (sign ? 255 : 200) : 0;
    }
  }
  return out;
}
