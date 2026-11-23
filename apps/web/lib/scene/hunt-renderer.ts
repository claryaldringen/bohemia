// Lov ve scéně (hunting.md – Pravidla 3 a 7; plán 2026-11-22-hunting – Úloha 10): vyhnané zvíře
// (`wild-*` – klíčové pózy kroku jako zvěř, LivestockPlugin), honci (`man.glb` – zapečené klipy
// jako lidé výprav, VillagerPlugin), psi dvorce za nimi (`dog.glb`), zabité zvíře na boku a pak na
// tyči mezi honci 0 a 1 (válec 3 m) a prach při zásahu. Pózy počítá hunt-scene.ts, tady se jen
// zapíšou do instancí (thin instances – draw call na druh). Modely se stahují až s prvním lovem.
// Útočníky kreslí ArmyRenderer jako lidi výpravy (journey-riders.ts). Pohyb jen v `animate`
// (takt WATER_FPS scény), při omezeném pohybu stojí na posledním pohledu.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { Pos } from '@bohemia/game';
import type { SceneHunt } from '../journey-view';
import { ARMY_LOOKS, STAND_M_S, WALK_M_S } from './army';
import { ensureFigures, writeFigure } from './army-renderer';
import { DUST_S, dustAt, pruneFx, type Clash } from './battle-fx';
import { DOG_SCALE } from './dogs';
import { loadGeometry } from './fauna';
import {
  QuarryGlide,
  beaterFigures,
  huntDogFigures,
  poleBetween,
  quarryModel,
  type BeaterFigure,
  type HuntDogFigure,
  type QuarryPose,
} from './hunt-scene';
import { createAnimalMesh, standOnGround, writeAnimalPose } from './livestock';
import { createLivestockPose } from './livestock-motion';
import { createBakedFigure, createBlobShadow, type BakedKind } from './plough-team-renderer';
import { villagerSeconds } from './villager-motion';
import { distanceToSegment, type Project } from './villager-pick';
import { loadBakedModel } from './villagers';
import { PICK_HEIGHT_M, PICK_PX } from './wildlife';
import type { WildModel } from './wildlife-placement';

/** Délka tyče (m – plán 2026-11-22-hunting, Úloha 10) a její průměr (návrh Clauda). */
const POLE_M = 3;
const POLE_DIAMETER_M = 0.07;
/** Tyč leží nosičům na rameni (m nad terénem – postava × FIGURE_SCALE). */
const POLE_LIFT_M = 1.7;
/** Zvíře visí za nohy kousek pod osou tyče (m). */
const HANG_BELOW_M = 0.05;
/** Zabité zvíře na boku – kolik m zvednout, ať bok nezapadne do terénu (polovina šířky trupu). */
const LYING_LIFT_M: Record<WildModel, number> = {
  'wild-stag': 0.25,
  'wild-hind': 0.22,
  'wild-boar': 0.3,
  'wild-wolf': 0.18,
  'wild-bear': 0.45,
  'wild-fox': 0.1,
  'wild-hare': 0.06,
};
/** Délka skoku zvířete (m na cyklus kroku při měřítku 1) a běhu psa (dogs.ts – běh). */
const QUARRY_STRIDE_M = 1.6;
const DOG_STRIDE_M = 1.7;
/** Okraj obálky lovu kolem postav (m) a její svislé rozpětí od nuly (výška terénu a postav). */
const BOUNDS_PAD_M = 4;
const BOUNDS_Y_M = 120;
/** Dolů hledí stojící pes (čichá). */
const DOG_SNIFF = 1;

/** Zvířata jednoho modelu: mesh s instancemi, matice a stav kroku a hlavy. */
interface Animals {
  mesh: Mesh;
  matrices: Float32Array;
  states: Float32Array;
}

/** Co renderer potřebuje od scény. */
export interface HuntEnvironment {
  /** Přesná výška vykresleného terénu. */
  groundHeight(x: number, z: number): number;
  /** Dočetl se model – překreslit. */
  onLoaded(): void;
}

/** Lov, jak je nakreslený (e2e): zvíře, honci, psi a zda je zvíře na tyči. */
export interface HuntStats {
  quarry: (QuarryPose & { hanging: boolean }) | null;
  beaters: { x: number; z: number; carrying: boolean }[];
  dogs: number;
  pole: { x: number; z: number } | null;
}

export class HuntRenderer {
  private glide = new QuarryGlide();
  private active = false;
  private frozen = false;
  /** Modely zvířat (`wild-*` a `dog`) – null: nepodařilo se načíst. */
  private readonly animals = new Map<WildModel | 'dog', Animals | null>();
  private readonly loading = new Set<string>();
  private man: BakedKind | null = null;
  private manLoading = false;
  private pole: Mesh | null = null;
  private dust: { mesh: Mesh; matrices: Float32Array } | null = null;
  private clashes: Clash[] = [];
  /** Rány zvířete, jak je scéna naposledy ukázala (nový zásah = prach), a lov, ke kterému patří. */
  private hits = 0;
  private hitsOf = '';
  /** Krok zvířete – kolik m nakreslené zvíře ušlo a kde bylo naposledy. */
  private travelled = 0;
  private lastPos: Pos | null = null;
  private dogTravelled = 0;
  private lastMs = 0;
  private shown: HuntStats = { quarry: null, beaters: [], dogs: 0, pole: null };
  /** Klíč posledního zápisu – kreslí se jen při změně. */
  private written: HuntStats | null = null;
  /** Obálka všeho, co lov kreslí – lov mimo záběr kamery se nekreslí. */
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private readonly boundsMin = new Vector3();
  private readonly boundsMax = new Vector3();
  private readonly pose = createLivestockPose();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: HuntEnvironment,
  ) {}

  /**
   * Lov ve scéně v čase `nowMs` (null – žádný); `frozen` – omezený pohyb (stojí na posledním
   * pohledu). True – něco se změnilo (překreslit).
   */
  set(hunt: SceneHunt | null, nowMs: number, frozen: boolean): boolean {
    if (this.disposed) return false;
    this.frozen = frozen;
    if (!hunt) {
      if (!this.active) return false;
      this.active = false;
      this.glide = new QuarryGlide();
      this.clashes = [];
      return this.write(nowMs);
    }
    this.active = true;
    this.glide.push(hunt, nowMs);
    this.load(hunt);
    return this.write(nowMs);
  }

  /**
   * Pohyb mezi pohledy, chůze honců a psů, prach – true, když se něco hnulo v záběru `camera`
   * (bez kamery se bere, že vše je vidět). Stojící honci a lov mimo záběr nekreslí.
   */
  animate(nowMs: number, camera: Camera | null = null): boolean {
    if (!this.active || this.frozen) return false;
    // zapisuje se (meshe i `written`) i mimo záběr – překreslení se jen nevyžádá; změnu, která
    // nastala mimo záběr, ukáže překreslení po pohybu kamery (kreslí scénu samo)
    const moved = this.write(nowMs);
    if (!moved) return false;
    return camera === null || camera.isInFrustum(this.bounds);
  }

  /** Vyhnané zvíře pod kurzorem (CSS px) – jen živé, které je vidět; jinak null. */
  quarryHit(x: number, y: number, project: Project): { distance: number } | null {
    const q = this.shown.quarry;
    if (!q || q.lying) return null;
    const ground = this.env.groundHeight(q.pos.x, q.pos.z);
    const foot = project(q.pos.x, ground, q.pos.z);
    const top = project(q.pos.x, ground + PICK_HEIGHT_M[q.model] * q.scale, q.pos.z);
    if (!foot || !top) return null;
    const distance = distanceToSegment(x, y, foot, top);
    return distance <= PICK_PX ? { distance } : null;
  }

  /** Lov, jak je nakreslený (e2e). */
  stats(): HuntStats {
    return this.shown;
  }

  dispose(): void {
    this.disposed = true;
    for (const a of this.animals.values()) {
      a?.mesh.material?.dispose(true, true);
      a?.mesh.dispose();
    }
    this.animals.clear();
    if (this.man) {
      this.man.mesh.material?.dispose(true, true);
      this.man.manager.texture?.dispose();
      this.man.mesh.dispose();
      this.man = null;
    }
    for (const m of [this.pole, this.dust?.mesh]) {
      m?.material?.dispose(true, true);
      m?.dispose();
    }
    this.pole = null;
    this.dust = null;
  }

  /** Zapíše lov v okamžiku `nowMs`. True – změna, nebo se něco hýbe (honci hrají klipy). */
  private write(nowMs: number): boolean {
    const hunt = this.active ? this.glide.hunt : null;
    const tick = this.frozen ? (this.glide.lastTick() ?? 0) : this.glide.tickAt(nowMs);
    const over = hunt !== null && hunt.beaters.homeTick !== null && tick >= hunt.beaters.homeTick;
    const beaters = hunt && !over ? beaterFigures(hunt, tick) : [];
    const dogs = hunt && !over ? huntDogFigures(hunt, tick) : [];
    let quarry = hunt && !over ? this.glide.atTick(tick) : null;
    // zabité zvíře nesou honci 0 a 1 – visí uprostřed tyče mezi nimi
    const carriers = beaters.filter((b) => b.carrying);
    const pole =
      quarry?.lying && carriers.length === 2
        ? poleBetween(carriers[0]!.pos, carriers[1]!.pos)
        : null;
    if (quarry && pole) quarry = { ...quarry, pos: pole.mid };
    this.dustOnHit(hunt, hunt && !over ? this.glide.hitsAtTick(tick) : 0, quarry, nowMs);
    const nowS = nowMs / 1000;
    const dt = Math.max(0, Math.min(1, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    this.writeQuarry(quarry, pole);
    this.writeBeaters(beaters, nowMs);
    this.writeDogs(dogs, dt);
    this.writePole(pole);
    const dusting = this.writeDust(nowS);
    this.shown = {
      quarry: quarry ? { ...quarry, hanging: pole !== null } : null,
      beaters: beaters.map((b) => ({ x: b.pos.x, z: b.pos.z, carrying: b.carrying })),
      dogs: dogs.length,
      pole: pole ? { ...pole.mid } : null,
    };
    const changed = !sameStats(this.shown, this.written);
    this.written = this.shown;
    this.updateBounds(this.shown);
    // honci a psi hrají klipy chůze (VAT) – dokud se někdo hýbe, kreslí se v taktu animací;
    // stojící (klip idle) se nekreslí
    const walking =
      beaters.some((b) => b.speed > STAND_M_S) || dogs.some((d) => d.speed > STAND_M_S);
    return changed || dusting || (!this.frozen && walking);
  }

  /** Obálka zvířete, honců a tyče (pro test záběru kamery). */
  private updateBounds(shown: HuntStats): void {
    const points: { x: number; z: number }[] = [...shown.beaters];
    if (shown.quarry) points.push(shown.quarry.pos);
    if (shown.pole) points.push(shown.pole);
    if (points.length === 0) return;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    // psi a výška postav: okraj navíc; terén pod lovem neznáme celý, tak široké svislé rozpětí
    this.boundsMin.set(minX - BOUNDS_PAD_M, -BOUNDS_Y_M, minZ - BOUNDS_PAD_M);
    this.boundsMax.set(maxX + BOUNDS_PAD_M, BOUNDS_Y_M, maxZ + BOUNDS_PAD_M);
    this.bounds.reConstruct(this.boundsMin, this.boundsMax);
  }

  /** Nový zásah (rány přibyly) – prach u zvířete; nový lov (i po načtení) prach nezvedne. */
  private dustOnHit(
    hunt: SceneHunt | null,
    hits: number,
    quarry: QuarryPose | null,
    nowMs: number,
  ): void {
    const of = hunt ? `${hunt.journeyId}@${hunt.beaters.startTick}` : '';
    if (of === this.hitsOf && hits > this.hits && quarry && !this.frozen) {
      this.clashes.push({ key: `hunt-${hits}`, at: { ...quarry.pos }, startS: nowMs / 1000 });
    }
    this.hits = hits;
    this.hitsOf = of;
  }

  private writeQuarry(quarry: QuarryPose | null, pole: { yaw: number } | null): void {
    for (const [model, a] of this.animals) {
      if (!a || model === 'dog') continue;
      const shown = quarry?.model === model ? quarry : null;
      a.mesh.thinInstanceCount = shown ? 1 : 0;
      a.mesh.setEnabled(shown !== null);
      if (!shown) continue;
      const { x, z } = shown.pos;
      const ground = this.env.groundHeight(x, z);
      const fx = Math.sin(shown.yaw);
      const fz = Math.cos(shown.yaw);
      if (pole) {
        // visí za nohy hřbetem dolů, trupem napříč tyčí (po směru chůze nosičů – mezi nimi)
        const wx = Math.cos(pole.yaw);
        const wz = -Math.sin(pole.yaw);
        const y = ground + POLE_LIFT_M - HANG_BELOW_M;
        writeBasis(a.matrices, [wx, 0, wz], [0, -1, 0], { x, y, z }, shown.scale);
      } else if (shown.lying) {
        // na boku: „nahoru“ modelu leží vodorovně napříč směrem
        const y = ground + LYING_LIFT_M[model] * shown.scale;
        writeBasis(a.matrices, [fx, 0, fz], [fz, 0, -fx], { x, y, z }, shown.scale);
      } else {
        const moved = this.lastPos ? Math.hypot(x - this.lastPos.x, z - this.lastPos.z) : 0;
        this.travelled += moved;
        const pose = this.pose;
        pose.x = x;
        pose.z = z;
        pose.forwardX = fx;
        pose.forwardZ = fz;
        pose.stride =
          moved > 1e-3
            ? Math.sin((2 * Math.PI * this.travelled) / (QUARRY_STRIDE_M * shown.scale))
            : 0;
        pose.head = 0;
        writeAnimalPose(
          { matrices: a.matrices, states: a.states, dirty: false },
          0,
          pose,
          shown.scale,
          this.env.groundHeight,
        );
      }
      if (pole || shown.lying) a.states.fill(0, 0, 2);
      a.mesh.thinInstanceBufferUpdated('matrix');
      a.mesh.thinInstanceBufferUpdated('livestockState');
    }
    this.lastPos = quarry && !quarry.lying ? { ...quarry.pos } : null;
  }

  private writeBeaters(list: readonly BeaterFigure[], nowMs: number): void {
    const k = this.man;
    if (!k) return;
    ensureFigures(k, list.length);
    list.forEach((b, i) => {
      const moving = b.speed > STAND_M_S;
      writeFigure(
        k,
        i,
        {
          key: `hunt-beater-${i}`,
          kind: 'man',
          x: b.pos.x,
          z: b.pos.z,
          hx: Math.sin(b.yaw),
          hz: Math.cos(b.yaw),
          // nosič drží konec tyče na rameni (klip bez rekvizity – workshops.md, nosiči na tyči)
          clip: b.carrying ? 'carry-pole-back' : moving ? 'walk' : 'idle',
          pace: moving ? Math.min(2, Math.max(0.5, b.speed / WALK_M_S)) : 1,
          lift: 0,
          lying: false,
          side: 'folk',
          look: ARMY_LOOKS.folk,
        },
        this.env.groundHeight(b.pos.x, b.pos.z),
        this.frozen,
      );
    });
    k.mesh.thinInstanceCount = list.length;
    k.mesh.setEnabled(list.length > 0);
    if (list.length === 0) return;
    k.mesh.thinInstanceBufferUpdated('matrix');
    k.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
    k.mesh.thinInstanceBufferUpdated('villagerLook');
    k.manager.time = this.frozen ? 0 : (villagerSeconds(nowMs) % 3600) + 3600;
  }

  private writeDogs(list: readonly HuntDogFigure[], dt: number): void {
    const a = this.animals.get('dog');
    if (!a) return;
    if (a.matrices.length < list.length * 16) {
      a.matrices = new Float32Array(list.length * 16);
      a.states = new Float32Array(list.length * 2);
      a.mesh.thinInstanceSetBuffer('matrix', a.matrices, 16, false);
      a.mesh.thinInstanceSetBuffer('livestockState', a.states, 2, false);
    }
    const speed = list[0]?.speed ?? 0;
    this.dogTravelled += this.frozen ? 0 : speed * dt;
    list.forEach((d, i) => {
      const pose = this.pose;
      pose.x = d.pos.x;
      pose.z = d.pos.z;
      pose.forwardX = Math.sin(d.yaw);
      pose.forwardZ = Math.cos(d.yaw);
      const still = this.frozen || d.speed <= STAND_M_S;
      pose.stride = still
        ? 0
        : Math.sin((2 * Math.PI * (this.dogTravelled + i * 0.37)) / (DOG_STRIDE_M * DOG_SCALE));
      pose.head = still ? DOG_SNIFF : 0;
      writeAnimalPose(
        { matrices: a.matrices, states: a.states, dirty: false },
        i,
        pose,
        DOG_SCALE,
        this.env.groundHeight,
      );
    });
    a.mesh.thinInstanceCount = list.length;
    a.mesh.setEnabled(list.length > 0);
    if (list.length === 0) return;
    a.mesh.thinInstanceBufferUpdated('matrix');
    a.mesh.thinInstanceBufferUpdated('livestockState');
  }

  /** Tyč mezi nosiči – válec 3 m vodorovně v ose nosičů, na jejich ramenou. */
  private writePole(pole: { mid: Pos; yaw: number } | null): void {
    if (!pole) {
      this.pole?.setEnabled(false);
      return;
    }
    this.pole ??= this.createPole();
    this.pole.position.set(
      pole.mid.x,
      this.env.groundHeight(pole.mid.x, pole.mid.z) + POLE_LIFT_M,
      pole.mid.z,
    );
    // válec stojí v ose y – položit (x o 90°) a otočit do osy nosičů
    this.pole.rotation.set(Math.PI / 2, pole.yaw, 0);
    this.pole.setEnabled(true);
  }

  /** Prach zásahů – vodorovná skvrna, která se zvedne a dosedne. True – ještě se práší. */
  private writeDust(nowS: number): boolean {
    this.clashes = pruneFx(this.clashes, nowS, () => DUST_S);
    if (this.clashes.length === 0 && !this.dust?.mesh.isEnabled()) return false;
    this.dust ??= this.createDust();
    const dust = this.dust;
    if (dust.matrices.length < this.clashes.length * 16) {
      dust.matrices = new Float32Array(this.clashes.length * 16);
      dust.mesh.thinInstanceSetBuffer('matrix', dust.matrices, 16, false);
    }
    let n = 0;
    for (const c of this.clashes) {
      const r = dustAt(c, nowS);
      if (r === null) continue;
      const y = this.env.groundHeight(c.at.x, c.at.z) + 0.08;
      const d = r * 2;
      dust.matrices.set([d, 0, 0, 0, 0, 1, 0, 0, 0, 0, d, 0, c.at.x, y, c.at.z, 1], n++ * 16);
    }
    dust.mesh.thinInstanceCount = n;
    dust.mesh.setEnabled(n > 0);
    if (n > 0) dust.mesh.thinInstanceBufferUpdated('matrix');
    return true;
  }

  private createPole(): Mesh {
    const pole = CreateCylinder(
      'hunt-pole',
      { height: POLE_M, diameter: POLE_DIAMETER_M, tessellation: 8 },
      this.scene,
    );
    const material = new StandardMaterial('hunt-pole-material', this.scene);
    material.diffuseColor = new Color3(0.42, 0.31, 0.19);
    material.specularColor = Color3.Black();
    pole.material = material;
    pole.isPickable = false;
    return pole;
  }

  private createDust(): { mesh: Mesh; matrices: Float32Array } {
    const dust = createBlobShadow(this.scene, 'hunt-dust', 0.55);
    if (dust.mesh.material instanceof StandardMaterial) {
      dust.mesh.material.emissiveColor = new Color3(0.52, 0.44, 0.32);
    }
    dust.mesh.thinInstanceSetBuffer('matrix', dust.matrices, 16, false);
    dust.mesh.thinInstanceCount = 0;
    return dust;
  }

  /** Modely lovu – zvíře, pes a honec; každý jen jednou, až je lov potřebuje. */
  private load(hunt: SceneHunt): void {
    // druh zvířete je vidět, až vyběhne z lesa (v lese ho pohled nemá)
    if (hunt.quarry) this.loadAnimal(quarryModel(hunt.quarry.kind).model);
    if (hunt.dogs > 0) this.loadAnimal('dog');
    if (!this.manLoading) {
      this.manLoading = true;
      void loadBakedModel(this.scene, '/models/people/man.glb').then(
        (model) => {
          if (!model) return;
          if (this.disposed) {
            // renderer zanikl během načítání – textury modelu nikdo jiný neuvolní
            model.texture?.dispose();
            model.mask?.dispose();
            return;
          }
          this.man = createBakedFigure(this.scene, 'hunt-man', model);
          ensureFigures(this.man, 6, true);
          this.loaded();
        },
        (error: unknown) => {
          console.warn('Model honce se nepodařilo načíst.', error);
        },
      );
    }
  }

  private loadAnimal(model: WildModel | 'dog'): void {
    if (this.animals.has(model) || this.loading.has(model)) return;
    this.loading.add(model);
    void loadGeometry(this.scene, `/models/fauna/${model}.glb`).then(
      (geometry) => {
        this.loading.delete(model);
        if (this.disposed) return;
        if (!geometry) {
          this.animals.set(model, null);
          return;
        }
        const mesh = createAnimalMesh(this.scene, `hunt-${model}`, standOnGround(geometry));
        mesh.alwaysSelectAsActiveMesh = true;
        const a: Animals = { mesh, matrices: new Float32Array(16), states: new Float32Array(2) };
        mesh.thinInstanceSetBuffer('matrix', a.matrices, 16, false);
        mesh.thinInstanceSetBuffer('livestockState', a.states, 2, false);
        mesh.thinInstanceCount = 0;
        mesh.setEnabled(false);
        this.animals.set(model, a);
        this.loaded();
      },
      (error: unknown) => {
        this.loading.delete(model);
        this.animals.set(model, null);
        console.warn(`Model lovu ${model} se nepodařilo načíst.`, error);
      },
    );
  }

  /** Dočtený model – zapsat lov znovu a překreslit. */
  private loaded(): void {
    this.written = null;
    this.write(Date.now());
    this.env.onLoaded();
  }
}

/**
 * Matice instance z os modelu: dopředu `f` a nahoru `u` (jednotkové, kolmé), vpravo = nahoru ×
 * dopředu jako `writeInstanceMatrix` (fauna.ts) – bez zrcadlení.
 */
function writeBasis(
  m: Float32Array,
  f: readonly [number, number, number],
  u: readonly [number, number, number],
  at: { x: number; y: number; z: number },
  scale: number,
): void {
  const [fx, fy, fz] = f;
  const [ux, uy, uz] = u;
  const rx = uy * fz - uz * fy;
  const ry = uz * fx - ux * fz;
  const rz = ux * fy - uy * fx;
  m.set(
    [
      rx * scale,
      ry * scale,
      rz * scale,
      0,
      ux * scale,
      uy * scale,
      uz * scale,
      0,
      fx * scale,
      fy * scale,
      fz * scale,
      0,
      at.x,
      at.y,
      at.z,
      1,
    ],
    0,
  );
}

/** Jsou dva zápisy lovu stejné (zvíře, honci, psi a tyč se stejnými čísly)? Bez alokace. */
function sameStats(a: HuntStats, b: HuntStats | null): boolean {
  if (b === null) return false;
  if (a.dogs !== b.dogs || a.beaters.length !== b.beaters.length) return false;
  if ((a.pole === null) !== (b.pole === null)) return false;
  if (a.pole && b.pole && (a.pole.x !== b.pole.x || a.pole.z !== b.pole.z)) return false;
  const p = a.quarry;
  const q = b.quarry;
  if ((p === null) !== (q === null)) return false;
  if (p && q) {
    for (const key of Object.keys(p) as (keyof typeof p)[]) {
      if (key === 'pos') {
        if (p.pos.x !== q.pos.x || p.pos.z !== q.pos.z) return false;
      } else if (p[key] !== q[key]) return false;
    }
  }
  return a.beaters.every((m, i) => {
    const n = b.beaters[i];
    return n !== undefined && m.x === n.x && m.z === n.z && m.carrying === n.carrying;
  });
}
