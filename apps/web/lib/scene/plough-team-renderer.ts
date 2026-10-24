// Spřežení volů s rádlem ve scéně (ve vsi na čele orby – plough-front.ts, na /dev/buildings
// ukázka „Orání“): voli a lidé jako postavy ve vsi – GLB s kostrou
// z tools/blender/people_from_0ad.py (plough-team.json), animace zapečené do textury matic
// kostí (VAT) a thin instances, jeden draw call na model
// (vůl; oráč a honáček sdílí model muže). Rádlo, jho, oj a provaz (tools/blender/plough.py)
// jsou pevné díly v instancích, které se každým snímkem přestaví podle teamPose
// (plough-team.ts). Pod voly, lidmi a rádlem měkký stín (statická stínová mapa pohyblivé
// věci nezachytí – jako u lidí ve vsi). Když spřežení dostane novou dráhu (další den orby),
// dojde na ni pěšky z místa, kde právě je (`transitTrack`).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { loadModelParts } from './instanced-model';
import {
  TEAM_PARTS,
  TEAM_SCALE,
  createTeamPose,
  pathAt,
  ploughRoute,
  type PloughLegs,
  routeFurrows,
  routePose,
  teamPose,
  teamSpot,
  teamTrack,
  trackPose,
  transitTrack,
  writePartMatrix,
  writeSegmentMatrix,
  type FigurePose,
  type GroundFn,
  type PathPoint,
  type FurrowBand,
  type PloughPath,
  type RouteStint,
  type RouteTrack,
  type TeamPose,
  type TeamTrack,
} from './plough-team';
import { pickTeam, type DraftHit, type TeamFigure, type TeamPart } from './draft-pick';
import {
  loopActivity,
  routeActivity,
  sameTeamActivity,
  type PloughedPart,
  type TeamActivity,
} from './draft-state';
import { RING_SIZE_M, SelectionRing } from './selection-ring';
import { villagerSeconds } from './villager-motion';
import type { Project } from './villager-pick';
import { VillagerPlugin, loadBakedModel } from './villagers';

/** Snímků za sekundu zapečené animace (klíče animací 0 A.D.). */
const BAKE_FPS = 24;
/** Dál od kamery (m) se spřežení nehýbe – je pár pixelů. */
const ANIMATE_RANGE_M = 700;
/** Výška obalu spřežení nad zemí (m). */
const HEAD_ROOM_M = 2.4;
/** Čas (s), ve kterém spřežení stojí při omezeném pohybu – jho uprostřed první řady, rádlo v zemi. */
const FROZEN_T = 17;
/**
 * Animace běží, když ji scéna posunula nejdéle před touto dobou (ms) – jen pak spřežení na nové
 * místo dojde (při omezeném pohybu, ve skryté záložce stojí rovnou na novém).
 */
const LIVE_MS = 3000;
/** Nejkratší doba (ms), za kterou spřežení projede trasu dne (plán přišel až těsně před koncem). */
const MIN_ROUTE_MS = 5000;
/** Krok (m), po kterém se dráhy projdou kvůli obalu spřežení. */
const BOUNDS_STEP_M = 1;
/** Kam spřežení od jha sahá (m, ve scéně) – rádlo a oráč za ním jedou po dráze. */
const BODY_M = 2;
/** Pevné díly v ard.glb (tools/blender/plough.py). */
const PARTS = ['ard', 'yoke', 'pole', 'rope'] as const;
type PartName = (typeof PARTS)[number];
/** Vzhled na instanci (villagerLook): barva srsti / oděvu a kód vlasů (0 = přirozené). */
export const OX_LOOKS: readonly (readonly [number, number, number])[] = [
  [1.04, 0.98, 0.9],
  [0.74, 0.69, 0.64],
];
const PLOWMAN_LOOK = [0.86, 0.82, 0.74, 0] as const;
const BOY_LOOK = [1.08, 1.02, 0.9, 0] as const;
/** Měkký stín: délka a šířka (m při TEAM_SCALE 1) a krytí uprostřed. */
const SHADOW = { ox: [2.4, 1.0], man: [1.0, 1.0], ard: [1.5, 0.45] } as const;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.04;
/**
 * Kroužek pod vybraným spřežením (villagers.md – Výběr postavy): před hlavami volů (m od jha
 * při měřítku 1), přídavek k délce a šířka elipsy (m při TEAM_SCALE 1).
 */
const TEAM_RING = { ahead: 1.3, pad: 1.6, width: 3.2 } as const;

export interface PloughTeamsEnvironment {
  /** Adresa modelů (…/ox.glb, …/plowman.glb, …/ard.glb). */
  baseUrl: string;
  /** Výška terénu pod spřežením. */
  groundHeight: GroundFn;
  /** Úprava materiálu pevných dílů (PBR z GLB) – opar a světlo jako ostatní modely. */
  prepareMaterial?: (material: Material) => void;
  /** Modely se načetly a spřežení se objevilo – překreslit. */
  onLoaded(): void;
  /**
   * Vybrané spřežení (`select`) – co právě dělá; volá se jen při změně (null = spřežení není nebo
   * nic vybraného).
   */
  onSelected?(state: { team: number; activity: TeamActivity } | null): void;
}

/** Postava z GLB s kostrou v instancích (VAT) – mesh, animace a buffery instancí. */
export interface BakedKind {
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  clips: Map<string, { start: number; end: number }>;
  matrices: Float32Array;
  settings: Float32Array;
  looks: Float32Array;
}

/**
 * Spřežení na dráhách (`setPaths` – jedno na dráhu). `animate` je posune na okamžik `nowMs`
 * (skutečný čas, jako zvířata) – jen v záběru; `frozen` = omezený pohyb, stojí.
 */
export class PloughTeams {
  /**
   * Spřežení: smyčka na pruhu (`loop` – díl, který orá, `part`), nebo trasa celé dnešní orby
   * (`route` – ladicí; `home` = večer návrat do ohrady).
   */
  private tracks: (
    { loop: TeamTrack; part: PloughedPart | null } | { route: RouteTrack; home: boolean }
  )[] = [];
  /** Vybrané spřežení, oráč nebo honák (villagers.md – Výběr postavy) a kroužek pod ním. */
  private selected: { team: number; figure: TeamFigure } | null = null;
  private ring: SelectionRing | null = null;
  private selectedState: { team: number; activity: TeamActivity } | null = null;
  /** Kdy se trasy dne naposledy nastavily – při omezeném pohybu stojí spřežení, kde v tu chvíli bylo. */
  private frozenMs = 0;
  /** Kdy scéna naposledy posunula animaci (ms, epoch) – jestli animace běží. */
  private liveAt = -Infinity;
  private ox: BakedKind | null = null;
  private man: BakedKind | null = null;
  private readonly parts = new Map<PartName, { mesh: Mesh; matrices: Float32Array }>();
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private loading: Promise<void> | null = null;
  private readonly poses: TeamPose[] = [];
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: PloughTeamsEnvironment,
  ) {}

  /**
   * Dráhy spřežení (jedno spřežení na dráhu – `i`-té spřežení je i dál `i`-té); modely se
   * stáhnou s prvním spřežením. Spřežení, které už ve scéně je, dojde na novou dráhu z místa,
   * kde je v okamžiku `nowMs` (jen když animace běží – jinak stojí rovnou na novém místě).
   */
  setPaths(
    paths: readonly PloughPath[],
    nowMs = Date.now(),
    parts: readonly (PloughedPart | null)[] = [],
  ): void {
    const t = villagerSeconds(nowMs);
    const live = nowMs - this.liveAt < LIVE_MS && this.count > 0;
    const probe = createTeamPose();
    const before = this.tracks;
    this.tracks = paths.map((path, i) => {
      const old = before[i];
      const part = parts[i] ?? null;
      if (!live || !old || !('loop' in old)) return { loop: teamTrack(path), part };
      const spot = teamSpot(trackPose(old.loop, t, probe, this.env.groundHeight));
      return { loop: transitTrack(path, spot, t), part };
    });
    this.applyTracks(nowMs, live);
  }

  /**
   * Trasy celé dnešní orby (ladicí – oxen.md, Orba za herní den): `i`-té spřežení projede pruhy
   * `teams[i]` v pořadí práce od okamžiku `nowMs` (nejdřív na začátku dne `window.startMs`) do
   * konce herního dne `window.endMs` – zrychleně. Spřežení, které už ve scéně je a hýbe se,
   * dojde z místa, kde právě je; s cestami dne `legs` (oxen.md – Spřežení zůstane na poli) napřed
   * vyjede z ohrady nebo se přesune od předchozího bloku (`out`) a večer se vrátí do ohrady
   * (`home`); bez nich zůstává na poli. Vrátí trasy (pro brázdu – `furrows`).
   */
  setRoutes(
    teams: readonly (readonly RouteStint[])[],
    window: { startMs: number; endMs: number },
    nowMs = Date.now(),
    legs: PloughLegs | null = null,
  ): RouteTrack[] {
    const live = nowMs - this.liveAt < LIVE_MS && this.count > 0;
    const probe = createTeamPose();
    const before = this.tracks;
    const startMs = Math.max(window.startMs, nowMs);
    const endMs = Math.max(window.endMs, startMs + MIN_ROUTE_MS);
    this.tracks = teams.map((stints, i) => {
      const old = before[i];
      let from: { x: number; z: number } | null = null;
      if (live && old) {
        const pose =
          'loop' in old
            ? trackPose(old.loop, villagerSeconds(nowMs), probe, this.env.groundHeight)
            : routePose(old.route, nowMs, probe, this.env.groundHeight);
        from = { x: pose.yoke.x, z: pose.yoke.z };
      }
      // výjezd / přesun a návrat jen ve dny, kdy k nim došlo (oxen.md – Spřežení zůstane na poli)
      return {
        route: { route: ploughRoute(stints, from, undefined, legs), startMs, endMs },
        home: (legs?.home?.length ?? 0) >= 2,
      };
    });
    this.frozenMs = nowMs;
    this.applyTracks(nowMs, live);
    return this.tracks.flatMap((track) => ('route' in track ? [track.route] : []));
  }

  /** Brázdy všech spřežení na trasách dne v okamžiku `nowMs` (co je už zoráno). */
  furrows(nowMs: number): FurrowBand[] {
    return this.tracks.flatMap((track) =>
      'route' in track ? routeFurrows(track.route, nowMs) : [],
    );
  }

  /** Nové dráhy: buffery, obal a póza hned (při omezeném pohybu stálá). */
  private applyTracks(nowMs: number, live: boolean): void {
    const n = this.tracks.length;
    while (this.poses.length < n) this.poses.push(createTeamPose());
    this.poses.length = n;
    if (n > 0) void this.load();
    this.allocate();
    this.updateBounds();
    // póza hned – při omezeném pohybu stálá na novém místě, jinak tam, kde spřežení právě je
    if (this.count > 0) this.write(nowMs, !live);
    this.updateSelected(nowMs, !live);
  }

  /** Počet spřežení s načtenými modely (pro testy a měření). */
  get count(): number {
    return this.ox && this.man ? this.tracks.length : 0;
  }

  /**
   * Spřežení pod kurzorem (x, y – CSS px plátna): vůl, rádlo s ojí, oráč nebo honák v posledních
   * zapsaných pózách; `project` převede bod světa na plátno. Jen při kliknutí. Nic – null.
   */
  pick(x: number, y: number, project: Project): DraftHit<TeamPart> | null {
    if (this.count === 0) return null;
    return pickTeam(this.poses, x, y, project);
  }

  /**
   * Vybere spřežení `team` – celé (kroužek kolem volů, rádla a lidí), nebo oráče či honáka
   * (kroužek pod ním); null výběr zruší. Kroužek pak sleduje pohyb, stav hlásí `onSelected`.
   */
  select(selection: { team: number; figure: TeamFigure } | null, nowMs = Date.now()): void {
    const before = this.selected;
    if (before?.team === selection?.team && before?.figure === selection?.figure) return;
    this.selected = selection;
    if (this.count > 0) this.writeRing();
    else this.ring?.hide();
    this.updateSelected(nowMs, nowMs - this.liveAt >= LIVE_MS);
  }

  /** Počet spřežení na dráhách (i před načtením modelů). */
  get teams(): number {
    return this.tracks.length;
  }

  /** Střed spřežení `index` (jho) v posledním zapsaném okamžiku – kam namířit kameru. */
  center(index = 0): { x: number; z: number } | null {
    const pose = this.poses[index];
    if (!pose || this.count === 0) return null;
    return { x: (pose.yoke.x + pose.ard.x) / 2, z: (pose.yoke.z + pose.ard.z) / 2 };
  }

  /**
   * Posune spřežení na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. Bez kamery
   * zapíše vždy (první snímek po načtení). `frozen` = omezený pohyb: stálá póza, nohy stojí.
   */
  animate(nowMs: number, camera: Camera | null, frozen = false): boolean {
    this.liveAt = frozen ? -Infinity : nowMs;
    // co vybrané spřežení dělá – i mimo záběr (panel výběru)
    if (this.selected) this.updateSelected(nowMs, frozen);
    if (this.count === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(nowMs, frozen);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const kind of [this.ox, this.man]) {
      if (!kind) continue;
      kind.mesh.material?.dispose();
      kind.manager.texture?.dispose();
      kind.mesh.dispose();
    }
    this.ox = null;
    this.man = null;
    for (const { mesh } of this.parts.values()) mesh.dispose(false, true);
    this.parts.clear();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.shadow = null;
    this.ring?.dispose();
    this.ring = null;
  }

  /**
   * Co vybrané spřežení dělá v okamžiku `nowMs` (`frozen` – omezený pohyb: stálá póza) – ohlásí
   * jen změnu (`onSelected`).
   */
  private updateSelected(nowMs: number, frozen: boolean): void {
    const team = this.selected?.team;
    const track = team === undefined ? undefined : this.tracks[team];
    let state: { team: number; activity: TeamActivity } | null = null;
    if (team !== undefined && track) {
      const activity =
        'route' in track
          ? routeActivity(track.route, frozen ? this.frozenMs : nowMs, track.home)
          : loopActivity(track.loop, frozen ? FROZEN_T : villagerSeconds(nowMs), track.part);
      state = { team, activity };
    }
    const before = this.selectedState;
    const same =
      before === null || state === null
        ? before === state
        : before.team === state.team && sameTeamActivity(before.activity, state.activity);
    if (same) return;
    this.selectedState = state;
    this.env.onSelected?.(state);
  }

  /**
   * Kroužek pod vybraným spřežením podle posledních póz: celé spřežení elipsou od hlav volů po
   * oráče, oráč či honák kroužkem pod nohama.
   */
  private writeRing(): void {
    const selected = this.selected;
    const pose = selected ? this.poses[selected.team] : undefined;
    if (!selected || !pose || selected.team >= this.tracks.length) {
      this.ring?.hide();
      return;
    }
    const ring = (this.ring ??= new SelectionRing(this.scene, 'plough-ring'));
    const ground = this.env.groundHeight;
    if (selected.figure !== 'team') {
      const leader = selected.figure === 'leader';
      const f = leader ? pose.boy : pose.plowman;
      const scale = TEAM_SCALE * (leader ? TEAM_PARTS.boy.scale : 1);
      ring.show(ground, f.x, f.y, f.z, RING_SIZE_M * scale);
      return;
    }
    const yoke = pose.yoke;
    const len = Math.hypot(yoke.fx, yoke.fz) || 1;
    const ax = yoke.x + (yoke.fx / len) * TEAM_RING.ahead * TEAM_SCALE;
    const az = yoke.z + (yoke.fz / len) * TEAM_RING.ahead * TEAM_SCALE;
    const bx = pose.plowman.x;
    const bz = pose.plowman.z;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const length = Math.hypot(ax - bx, az - bz) + TEAM_RING.pad * TEAM_SCALE;
    ring.show(ground, x, ground(x, z), z, length, TEAM_RING.width * TEAM_SCALE, ax - bx, az - bz);
  }

  /**
   * Obal všech spřežení na celých drahách i s přechody (stálý, dokud se dráhy nezmění) – podle
   * něj se spřežení mimo záběr nehýbe, ať je zrovna kdekoli na dráze.
   */
  private updateBounds(): void {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    const extend = (x: number, z: number): void => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      const y = this.env.groundHeight(x, z);
      low = Math.min(low, y);
      high = Math.max(high, y);
    };
    const at: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };
    for (const track of this.tracks) {
      const path = ('loop' in track ? track.loop.path : track.route.route) as PloughPath;
      const steps = Math.max(1, Math.ceil(path.length / BOUNDS_STEP_M));
      for (let i = 0; i <= steps; i++) {
        pathAt(path, Math.min(path.length - 1e-6, (i / steps) * path.length), at);
        extend(at.x, at.z);
      }
      const transit = 'loop' in track ? track.loop.transit : null;
      if (transit) {
        extend(transit.from.x, transit.from.z);
        extend(transit.to.x, transit.to.z);
      }
    }
    if (minX > maxX) return;
    const pad = BODY_M * TEAM_SCALE + 1;
    this.bounds.reConstruct(
      new Vector3(minX - pad, low - 1, minZ - pad),
      new Vector3(maxX + pad, high + HEAD_ROOM_M * TEAM_SCALE, maxZ + pad),
    );
  }

  /** Buffery instancí podle počtu spřežení (voli 2, lidé 2, díly 1, stíny 5 na spřežení). */
  private allocate(): void {
    const n = this.tracks.length;
    for (const [kind, per] of [
      [this.ox, 2],
      [this.man, 2],
    ] as const) {
      if (!kind) continue;
      kind.matrices = new Float32Array(Math.max(1, n * per) * 16);
      kind.settings = new Float32Array(Math.max(1, n * per) * 4);
      kind.looks = new Float32Array(Math.max(1, n * per) * 4);
      for (let i = 0; i < n; i++) {
        if (kind === this.ox) {
          kind.looks.set([...OX_LOOKS[0]!, 0], i * 8);
          kind.looks.set([...OX_LOOKS[1]!, 0], i * 8 + 4);
        } else {
          kind.looks.set(PLOWMAN_LOOK, i * 8);
          kind.looks.set(BOY_LOOK, i * 8 + 4);
        }
      }
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer(
        'bakedVertexAnimationSettingsInstanced',
        kind.settings,
        4,
        false,
      );
      kind.mesh.thinInstanceSetBuffer('villagerLook', kind.looks, 4, true);
      kind.mesh.thinInstanceCount = n * per;
      kind.mesh.setEnabled(n > 0);
    }
    for (const part of this.parts.values()) {
      part.matrices = new Float32Array(Math.max(1, n) * 16);
      part.mesh.thinInstanceSetBuffer('matrix', part.matrices, 16, false);
      part.mesh.thinInstanceCount = n;
      part.mesh.setEnabled(n > 0);
    }
    if (this.shadow) {
      this.shadow.matrices = new Float32Array(Math.max(1, n * 5) * 16);
      this.shadow.mesh.thinInstanceSetBuffer('matrix', this.shadow.matrices, 16, false);
      this.shadow.mesh.thinInstanceCount = n * 5;
      this.shadow.mesh.setEnabled(n > 0);
    }
  }

  /**
   * Zapíše pózy všech spřežení v okamžiku `nowMs` do instancí. `frozen` = omezený pohyb: stálá
   * póza na dráze (bez přechodu, na trase dne tam, kde spřežení bylo při nastavení), nohy stojí.
   */
  private write(nowMs: number, frozen: boolean): void {
    const ox = this.ox!;
    const man = this.man!;
    // skutečný čas od stejného počátku jako lidé a zvířata (malá čísla – přesné siny)
    const t = frozen ? FROZEN_T : villagerSeconds(nowMs);
    this.tracks.forEach((track, i) => {
      const out = this.poses[i]!;
      const ground = this.env.groundHeight;
      const pose =
        'route' in track
          ? routePose(track.route, frozen ? this.frozenMs : nowMs, out, ground)
          : frozen
            ? teamPose(track.loop.path, t, out, ground, track.loop.offsetM)
            : trackPose(track.loop, t, out, ground);
      pose.oxen.forEach((o, j) => {
        writeFigure(ox, i * 2 + j, o, TEAM_SCALE, 'walk', j * 0.37, frozen);
        this.writeShadow(i * 5 + j, o, SHADOW.ox);
      });
      writeFigure(man, i * 2, pose.plowman, TEAM_SCALE, 'plough', 0.2, frozen);
      writeFigure(
        man,
        i * 2 + 1,
        pose.boy,
        TEAM_SCALE * TEAM_PARTS.boy.scale,
        'lead',
        0.55,
        frozen,
      );
      this.writeShadow(i * 5 + 2, pose.plowman, SHADOW.man);
      this.writeShadow(i * 5 + 3, pose.boy, SHADOW.man, TEAM_PARTS.boy.scale);
      const ard = pose.ard;
      const ardGround = this.env.groundHeight(ard.x, ard.z);
      const len = Math.hypot(ard.fx, ard.fz) || 1;
      this.writeShadow(
        i * 5 + 4,
        { x: ard.x, y: ardGround, z: ard.z, hx: ard.fx / len, hz: ard.fz / len, pace: 0 },
        SHADOW.ard,
      );
      const part = (name: PartName): Float32Array | null => this.parts.get(name)?.matrices ?? null;
      const ardM = part('ard');
      if (ardM) writePartMatrix(ardM, i * 16, ard, TEAM_SCALE);
      const yokeM = part('yoke');
      if (yokeM) writePartMatrix(yokeM, i * 16, pose.yoke, TEAM_SCALE);
      const poleM = part('pole');
      if (poleM) writeSegmentMatrix(poleM, i * 16, pose.pole, TEAM_PARTS.poleM, TEAM_SCALE);
      const ropeM = part('rope');
      if (ropeM) writeSegmentMatrix(ropeM, i * 16, pose.rope, 1, TEAM_SCALE);
    });
    const time = frozen ? 0 : (t % 3600) + 3600;
    for (const kind of [ox, man]) {
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = time;
    }
    for (const { mesh } of this.parts.values()) mesh.thinInstanceBufferUpdated('matrix');
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
    if (this.selected) this.writeRing();
  }

  /** Stín pod volem / postavou / rádlem: elipsa natočená ve směru pohledu. */
  private writeShadow(
    index: number,
    at: FigurePose,
    size: readonly [number, number],
    scale = 1,
  ): void {
    if (!this.shadow) return;
    const m = this.shadow.matrices;
    const o = index * 16;
    const length = size[0] * TEAM_SCALE * scale;
    const width = size[1] * TEAM_SCALE * scale;
    // osa X napříč (vpravo), Z podél pohledu
    m[o] = at.hz * width;
    m[o + 1] = 0;
    m[o + 2] = -at.hx * width;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = 1;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = at.hx * length;
    m[o + 9] = 0;
    m[o + 10] = at.hz * length;
    m[o + 11] = 0;
    m[o + 12] = at.x;
    m[o + 13] = at.y + SHADOW_LIFT_M;
    m[o + 14] = at.z;
    m[o + 15] = 1;
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const base = this.env.baseUrl;
      const [ox, man, parts] = await Promise.allSettled([
        loadBakedModel(this.scene, `${base}ox.glb`),
        loadBakedModel(this.scene, `${base}plowman.glb`),
        loadModelParts(this.scene, `${base}ard.glb`, 'plough-', this.env.prepareMaterial),
      ]);
      if (this.disposed || this.scene.isDisposed) return;
      if (ox.status === 'fulfilled' && ox.value) {
        this.ox = createBakedFigure(this.scene, 'plough-ox', ox.value);
      } else {
        console.warn('Model vola se nepodařilo načíst.', ox.status === 'rejected' ? ox.reason : '');
      }
      if (man.status === 'fulfilled' && man.value) {
        this.man = createBakedFigure(this.scene, 'plough-plowman', man.value);
      } else {
        console.warn(
          'Model oráče se nepodařilo načíst.',
          man.status === 'rejected' ? man.reason : '',
        );
      }
      if (parts.status === 'fulfilled' && parts.value) {
        for (const [name, mesh] of parts.value) {
          if (!(PARTS as readonly string[]).includes(name)) {
            mesh.dispose();
            continue;
          }
          mesh.alwaysSelectAsActiveMesh = true;
          this.parts.set(name as PartName, { mesh, matrices: new Float32Array(16) });
        }
      } else {
        console.warn(
          'Rádlo a jho se nepodařilo načíst.',
          parts.status === 'rejected' ? parts.reason : '',
        );
      }
      this.shadow = createBlobShadow(this.scene, 'plough-shadow', SHADOW_OPACITY);
      this.allocate();
      if (this.count > 0) {
        const nowMs = Date.now();
        const live = nowMs - this.liveAt < LIVE_MS;
        this.write(nowMs, !live);
        this.env.onLoaded();
      }
    })();
    return this.loading;
  }
}

/** Instance postavy: poloha, natočení, měřítko a klip (fáze `phase` 0–1 kvůli rozladění). */
export function writeFigure(
  kind: BakedKind,
  slot: number,
  pose: FigurePose,
  scale: number,
  clipName: string,
  phase: number,
  frozen: boolean,
): void {
  const m = kind.matrices;
  const o = slot * 16;
  // osa X = vpravo (nahoru × dopředu), Y = nahoru, Z = dopředu (model míří na +Z)
  m[o] = pose.hz * scale;
  m[o + 1] = 0;
  m[o + 2] = -pose.hx * scale;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = scale;
  m[o + 6] = 0;
  m[o + 7] = 0;
  m[o + 8] = pose.hx * scale;
  m[o + 9] = 0;
  m[o + 10] = pose.hz * scale;
  m[o + 11] = 0;
  m[o + 12] = pose.x;
  m[o + 13] = pose.y;
  m[o + 14] = pose.z;
  m[o + 15] = 1;
  const clip = kind.clips.get(clipName) ?? kind.clips.get('walk') ?? { start: 0, end: 0 };
  const length = clip.end - clip.start + 1;
  const s = slot * 4;
  kind.settings[s] = clip.start;
  kind.settings[s + 1] = clip.end;
  kind.settings[s + 2] = phase * length;
  kind.settings[s + 3] = frozen ? 0 : BAKE_FPS * pose.pace;
}

/** Model postavy z `loadBakedModel` (GLB s kostrou, animace zapečené do VAT). */
export type BakedFigureModel = NonNullable<Awaited<ReturnType<typeof loadBakedModel>>>;

/**
 * Mesh postavy pro instance: geometrie s váhami kostí, VAT textura animací a materiál postav
 * (VillagerPlugin – barva srsti / oděvu na instanci). `name` je předpona meshe, kostry,
 * textury a materiálu – mimo předpony vrhačů stínů (stínová mapa je statická, postavy mají
 * vlastní měkký stín).
 */
export function createBakedFigure(scene: Scene, name: string, model: BakedFigureModel): BakedKind {
  const mesh = new Mesh(name, scene);
  model.vertexData.applyToMesh(mesh);
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, model.matricesIndices, false, 4);
  mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, model.matricesWeights, false, 4);
  // Kostra jen kvůli definicím shaderu (skinning) – matice kostí čte shader z VAT textury.
  const skeleton = new Skeleton(`${name}-skeleton`, name, scene);
  for (let i = 0; i < model.boneCount; i++) new Bone(`b${i}`, skeleton);
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 4;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  const vat = RawTexture.CreateRGBATexture(
    model.vat,
    (model.boneCount + 1) * 4,
    model.frames,
    scene,
    false,
    false,
    Texture.NEAREST_NEAREST,
    Constants.TEXTURETYPE_FLOAT,
  );
  vat.name = `${name}-vat`;
  const manager = new BakedVertexAnimationManager(scene);
  manager.texture = vat;
  mesh.bakedVertexAnimationManager = manager;
  const material = new StandardMaterial(`${name}-material`, scene);
  // bez mipmap jako u lidí a zvířat – ostrůvky atlasu na tmavém pozadí by z dálky ztmavly
  model.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
  material.diffuseTexture = model.texture;
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  model.mask?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
  new VillagerPlugin(material, model.texture?.gammaSpace === false, model.mask);
  mesh.material = material;
  return {
    mesh,
    manager,
    clips: model.clips,
    matrices: new Float32Array(16),
    settings: new Float32Array(4),
    looks: new Float32Array(4),
  };
}

/**
 * Měkký stín pod postavou nebo zvířetem – čtverec s průhlednou elipsou (kruh roztažený maticí
 * instance), krytí uprostřed `opacity`. Kreslí se po obtiscích vsi a polí.
 */
export function createBlobShadow(
  scene: Scene,
  name: string,
  opacity: number,
): { mesh: Mesh; matrices: Float32Array } {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
  data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  data.indices = [0, 2, 1, 0, 3, 2];
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  // po obtiscích vsi a polí (alphaIndex 1–2), jako stíny lidí
  mesh.alphaIndex = 5;
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const r = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, 1 - r);
      pixels[(j * size + i) * 4 + 3] = Math.round(255 * opacity * a * a * (3 - 2 * a));
    }
  }
  const texture = RawTexture.CreateRGBATexture(
    pixels,
    size,
    size,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  texture.name = name;
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.Black();
  material.disableLighting = true;
  material.opacityTexture = texture;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.zOffset = -2;
  mesh.material = material;
  return { mesh, matrices: new Float32Array(16) };
}
