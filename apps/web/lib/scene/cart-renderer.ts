// Vozy se spřežením volů ve scéně (docs/design/wagons.md; zatím ukázka „Vozy“ na /dev/buildings –
// ve hře je přidá herní scéna, až jádro pošle vozy a jejich trasy). Voli a honák jako u spřežení
// s rádlem (plough-team-renderer.ts – GLB s kostrou, animace ve VAT, thin instances), jho
// a vodicí provaz z ard.glb (tools/blender/plough.py), vůz z wagons.glb
// (tools/blender/wagons_from_0ad.py) po dílech: korba, předek a oj čtyřkoláku, kolo a náklad –
// každý díl jeden mesh v instancích (jeden draw call na díl pro všechny vozy). Matice se každým
// snímkem přestaví podle cartPose (cart-layout.ts) – kola se točí podle ujeté dráhy maticí
// instance, ne zapečenou animací. Pod voly, honákem a vozem měkký stín (statická stínová mapa
// pohyblivé věci nezachytí).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import type { Material } from '@babylonjs/core/Materials/material';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  CART_PARTS,
  CART_PREFIX,
  CART_SCALE,
  cartLength,
  cartPose,
  cartWheelCount,
  createCartPose,
  routeAt,
  type CartPose,
  type CartTrack,
  type RoutePoint,
} from './cart-layout';
import { loadModelParts } from './instanced-model';
import { writePartMatrix, writeSegmentMatrix, type FigurePose, type GroundFn } from './plough-team';
import {
  OX_LOOKS,
  createBakedFigure,
  createBlobShadow,
  writeFigure,
  type BakedKind,
} from './plough-team-renderer';
import { villagerSeconds } from './villager-motion';
import { loadBakedModel } from './villagers';

/** Dál od kamery (m) se vozy nehýbou – jsou pár pixelů. */
const ANIMATE_RANGE_M = 700;
/** Výška obalu vozu se spřežením nad zemí (m) – kupa sena čtyřkoláku. */
const HEAD_ROOM_M = 2.6;
/** Čas (s), ve kterém vozy stojí při omezeném pohybu. */
const FROZEN_T = 23;
/** Krok (m), po kterém se trasy projdou kvůli obalu. */
const BOUNDS_STEP_M = 1;
/** Kam spřežení sahá před jho (hlavy volů, m). */
const AHEAD_M = 1.5;
/** Díly z ard.glb, které vůz potřebuje: šíjové jho a vodicí provaz (rádlo a oj ne). */
const DRAFT_PARTS = ['yoke', 'rope'] as const;
const DROVER_LOOK = [0.78, 0.7, 0.58, 0] as const;
/** Měkký stín: délka a šířka (m při CART_SCALE 1), krytí uprostřed. */
const SHADOW = { ox: [2.4, 1.0], man: [1.0, 1.0] } as const;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.04;
/** Stínů na vůz: dva voli, honák a vůz. */
const SHADOWS_PER_CART = 4;

export interface CartRendererEnvironment {
  /** Adresa modelů (`/models/` – plough/ox.glb, plough/plowman.glb, plough/ard.glb, wagons/wagons.glb). */
  baseUrl: string;
  /** Výška terénu pod vozem. */
  groundHeight: GroundFn;
  /** Úprava materiálu pevných dílů (PBR z GLB) – opar a světlo jako ostatní modely. */
  prepareMaterial?: (material: Material) => void;
  /** Modely se načetly a vozy se objevily – překreslit. */
  onLoaded(): void;
}

/** Díl vozu v instancích a kam která instance patří (vůz, a u kol i které kolo). */
interface PartSlots {
  mesh: Mesh;
  matrices: Float32Array;
  /** Pro každou instanci: vůz a pořadí kola (kola), jinak 0. */
  slots: { cart: number; index: number }[];
}

/**
 * Vozy se spřežením na trasách (`setCarts` – vůz, náklad, trasa, posun po trase). `animate` je
 * posune na okamžik `nowMs` (skutečný čas, jako zvířata) – jen v záběru; `frozen` = omezený pohyb.
 */
export class CartRenderer {
  private tracks: CartTrack[] = [];
  private ox: BakedKind | null = null;
  private man: BakedKind | null = null;
  /** Díly wagons.glb a ard.glb podle jména uzlu (načtené, i když je zrovna žádný vůz nemá). */
  private readonly models = new Map<string, Mesh>();
  private readonly parts = new Map<string, PartSlots>();
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private loading: Promise<void> | null = null;
  private readonly poses: CartPose[] = [];
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: CartRendererEnvironment,
  ) {}

  /** Vozy na trasách; modely se stáhnou s prvním vozem. */
  setCarts(tracks: readonly CartTrack[]): void {
    this.tracks = [...tracks];
    while (this.poses.length < tracks.length) this.poses.push(createCartPose());
    this.poses.length = tracks.length;
    if (tracks.length > 0) void this.load();
    this.allocate();
    this.updateBounds();
    if (this.count > 0) this.write(FROZEN_T, true);
  }

  /** Počet vozů s načtenými modely (pro testy a měření). */
  get count(): number {
    return this.ox && this.man && this.models.size > 0 ? this.tracks.length : 0;
  }

  /** Střed vozu `index` (mezi jhem a korbou) v posledním zapsaném okamžiku – kam namířit kameru. */
  center(index = 0): { x: number; z: number } | null {
    const pose = this.poses[index];
    if (!pose || this.count === 0) return null;
    return { x: (pose.yoke.x + pose.body.x) / 2, z: (pose.yoke.z + pose.body.z) / 2 };
  }

  /**
   * Posune vozy na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. Bez kamery zapíše
   * vždy. `frozen` = omezený pohyb: stálá póza, nohy a kola stojí.
   */
  animate(nowMs: number, camera: Camera | null, frozen = false): boolean {
    if (this.count === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(frozen ? FROZEN_T : villagerSeconds(nowMs), frozen);
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
    for (const mesh of this.models.values()) mesh.dispose(false, true);
    this.models.clear();
    this.parts.clear();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.shadow = null;
  }

  /** Obal všech vozů na celých trasách (stálý, dokud se trasy nezmění). */
  private updateBounds(): void {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    const at: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
    let reach = 0;
    for (const track of this.tracks) {
      const route = track.route;
      reach = Math.max(reach, cartLength(track.kind));
      const steps = Math.max(1, Math.ceil(route.length / BOUNDS_STEP_M));
      for (let i = 0; i <= steps; i++) {
        routeAt(route, (i / steps) * route.length, at);
        minX = Math.min(minX, at.x);
        maxX = Math.max(maxX, at.x);
        minZ = Math.min(minZ, at.z);
        maxZ = Math.max(maxZ, at.z);
        const y = this.env.groundHeight(at.x, at.z);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
    }
    if (minX > maxX) return;
    const pad = Math.max(reach, AHEAD_M * CART_SCALE) + 1;
    this.bounds.reConstruct(
      new Vector3(minX - pad, low - 1, minZ - pad),
      new Vector3(maxX + pad, high + HEAD_ROOM_M * CART_SCALE, maxZ + pad),
    );
  }

  /** Které díly má který vůz: korba (a předek s ojí), kola, náklad; jho a provaz každý. */
  private partSlots(): Map<string, { cart: number; index: number }[]> {
    const out = new Map<string, { cart: number; index: number }[]>();
    const add = (name: string, cart: number, index = 0): void => {
      const list = out.get(name) ?? [];
      list.push({ cart, index });
      out.set(name, list);
    };
    this.tracks.forEach((track, cart) => {
      const prefix = CART_PREFIX[track.kind];
      add(`${prefix}-body`, cart);
      if (track.kind === 'four') {
        add('wagon4-front', cart);
        add('wagon4-pole', cart);
      }
      for (let w = 0; w < cartWheelCount(track.kind); w++) add('wagon-wheel', cart, w);
      if (track.cargo !== 'empty') add(`${prefix}-${track.cargo}`, cart);
      for (const name of DRAFT_PARTS) add(name, cart);
    });
    return out;
  }

  /** Buffery instancí podle vozů (voli 2, honák 1, díly podle vozu, stíny 4 na vůz). */
  private allocate(): void {
    const n = this.tracks.length;
    for (const [kind, per] of [
      [this.ox, 2],
      [this.man, 1],
    ] as const) {
      if (!kind) continue;
      const count = Math.max(1, n * per);
      kind.matrices = new Float32Array(count * 16);
      kind.settings = new Float32Array(count * 4);
      kind.looks = new Float32Array(count * 4);
      for (let i = 0; i < n; i++) {
        if (kind === this.ox) {
          kind.looks.set([...OX_LOOKS[i % 2]!, 0], i * 8);
          kind.looks.set([...OX_LOOKS[(i + 1) % 2]!, 0], i * 8 + 4);
        } else {
          kind.looks.set(DROVER_LOOK, i * 4);
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
    this.parts.clear();
    const wanted = this.partSlots();
    for (const [name, mesh] of this.models) {
      const slots = wanted.get(name) ?? [];
      const matrices = new Float32Array(Math.max(1, slots.length) * 16);
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
      mesh.thinInstanceCount = slots.length;
      mesh.setEnabled(slots.length > 0);
      if (slots.length > 0) this.parts.set(name, { mesh, matrices, slots });
    }
    if (this.shadow) {
      this.shadow.matrices = new Float32Array(Math.max(1, n * SHADOWS_PER_CART) * 16);
      this.shadow.mesh.thinInstanceSetBuffer('matrix', this.shadow.matrices, 16, false);
      this.shadow.mesh.thinInstanceCount = n * SHADOWS_PER_CART;
      this.shadow.mesh.setEnabled(n > 0);
    }
  }

  /** Zapíše pózy všech vozů v čase `t` (s) do instancí. */
  private write(t: number, frozen: boolean): void {
    const ox = this.ox;
    const man = this.man;
    if (!ox || !man) return;
    const ground = this.env.groundHeight;
    this.tracks.forEach((track, i) => {
      const pose = cartPose(track, t, this.poses[i]!, ground, frozen);
      const still = frozen || !pose.moving;
      pose.oxen.forEach((o, j) => {
        writeFigure(
          ox,
          i * 2 + j,
          o,
          CART_SCALE,
          still ? 'idle' : 'walk',
          j * 0.37 + i * 0.13,
          still,
        );
        this.writeShadow(i * SHADOWS_PER_CART + j, o, SHADOW.ox[0], SHADOW.ox[1]);
      });
      writeFigure(
        man,
        i,
        pose.boy,
        CART_SCALE * CART_PARTS.drover.scale,
        still ? 'idle' : 'lead',
        0.55 + i * 0.21,
        still,
      );
      this.writeShadow(i * SHADOWS_PER_CART + 2, pose.boy, SHADOW.man[0], SHADOW.man[1]);
      // stín vozu: elipsa pod korbou ve směru korby
      const body = pose.body;
      const len = Math.hypot(body.fx, body.fz) || 1;
      const kind = track.kind === 'two' ? CART_PARTS.two : CART_PARTS.four;
      const middle = (kind.front - kind.back) / 2;
      this.writeShadow(
        i * SHADOWS_PER_CART + 3,
        {
          x: body.x + (body.fx / len) * middle * CART_SCALE,
          y: ground(body.x, body.z),
          z: body.z + (body.fz / len) * middle * CART_SCALE,
          hx: body.fx / len,
          hz: body.fz / len,
          pace: 0,
        },
        (kind.front + kind.back) * 1.15,
        kind.halfWidth * 2 + 0.5,
      );
    });
    for (const [name, part] of this.parts) {
      part.slots.forEach(({ cart, index }, slot) => {
        const pose = this.poses[cart]!;
        const o = slot * 16;
        if (name === 'yoke') writePartMatrix(part.matrices, o, pose.yoke, CART_SCALE);
        else if (name === 'rope') writeSegmentMatrix(part.matrices, o, pose.rope, 1, CART_SCALE);
        else if (name === 'wagon4-pole') {
          writeSegmentMatrix(part.matrices, o, pose.pole, CART_PARTS.four.poleM, CART_SCALE);
        } else if (name === 'wagon-wheel') {
          writePartMatrix(part.matrices, o, pose.wheels[index]!, CART_SCALE);
        } else if (name === 'wagon4-front') {
          writePartMatrix(part.matrices, o, pose.front, CART_SCALE);
        } else writePartMatrix(part.matrices, o, pose.body, CART_SCALE);
      });
      part.mesh.thinInstanceBufferUpdated('matrix');
    }
    const time = frozen ? 0 : (t % 3600) + 3600;
    for (const kind of [ox, man]) {
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = time;
    }
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
  }

  /** Stín: elipsa natočená ve směru pohledu (délka a šířka v m při CART_SCALE 1). */
  private writeShadow(index: number, at: FigurePose, length: number, width: number): void {
    if (!this.shadow) return;
    const m = this.shadow.matrices;
    const o = index * 16;
    const l = length * CART_SCALE;
    const w = width * CART_SCALE;
    m[o] = at.hz * w;
    m[o + 1] = 0;
    m[o + 2] = -at.hx * w;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = 1;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = at.hx * l;
    m[o + 9] = 0;
    m[o + 10] = at.hz * l;
    m[o + 11] = 0;
    m[o + 12] = at.x;
    m[o + 13] = at.y + SHADOW_LIFT_M;
    m[o + 14] = at.z;
    m[o + 15] = 1;
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const base = this.env.baseUrl;
      const prepare = this.env.prepareMaterial;
      const [ox, man, draft, wagons] = await Promise.allSettled([
        loadBakedModel(this.scene, `${base}plough/ox.glb`),
        loadBakedModel(this.scene, `${base}plough/plowman.glb`),
        loadModelParts(this.scene, `${base}plough/ard.glb`, 'cart-', prepare),
        loadModelParts(this.scene, `${base}wagons/wagons.glb`, 'cart-', prepare),
      ]);
      if (this.disposed || this.scene.isDisposed) return;
      if (ox.status === 'fulfilled' && ox.value) {
        this.ox = createBakedFigure(this.scene, 'cart-ox', ox.value);
      } else {
        console.warn('Model vola se nepodařilo načíst.', ox.status === 'rejected' ? ox.reason : '');
      }
      if (man.status === 'fulfilled' && man.value) {
        this.man = createBakedFigure(this.scene, 'cart-drover', man.value);
      } else {
        console.warn(
          'Model honáka se nepodařilo načíst.',
          man.status === 'rejected' ? man.reason : '',
        );
      }
      if (draft.status === 'fulfilled' && draft.value) {
        for (const [name, mesh] of draft.value) {
          if ((DRAFT_PARTS as readonly string[]).includes(name)) this.addModel(name, mesh);
          else mesh.dispose();
        }
      } else {
        console.warn('Jho se nepodařilo načíst.', draft.status === 'rejected' ? draft.reason : '');
      }
      if (wagons.status === 'fulfilled' && wagons.value) {
        for (const [name, mesh] of wagons.value) this.addModel(name, mesh);
      } else {
        console.warn(
          'Modely vozů se nepodařilo načíst.',
          wagons.status === 'rejected' ? wagons.reason : '',
        );
      }
      this.shadow = createBlobShadow(this.scene, 'cart-shadow', SHADOW_OPACITY);
      this.allocate();
      if (this.count > 0) {
        this.write(FROZEN_T, true);
        this.env.onLoaded();
      }
    })();
    return this.loading;
  }

  private addModel(name: string, mesh: Mesh): void {
    // pohyblivé díly – ne vrhače statické stínové mapy, obal přes instance by se přepočítával
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
    this.models.set(name, mesh);
  }
}
