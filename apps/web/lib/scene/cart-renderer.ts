// Vozy se spřežením volů ve scéně (docs/design/wagons.md – fáze 3): ve vsi svoz a výprava podle
// `SceneVillage.carts` (village-carts.ts – jízda tam a zpět po trase dne, vůz bez jízdy stojí
// u ohrady), na /dev/buildings ukázka „Vozy“ (dokola po trase). Voli a honák jako u spřežení
// s rádlem (plough-team-renderer.ts – GLB s kostrou, animace ve VAT, thin instances) – čtyřkolák
// táhne pár, dvoukolák jeden vůl (oxen.md – Potah); jho páru a vodicí provaz z ard.glb
// (tools/blender/plough.py), vůz z wagons.glb (tools/blender/wagons_from_0ad.py) po dílech:
// korba (dvoukolák s oplením), jednoduché jho dvoukoláku, předek a oj čtyřkoláku, kolo a náklad –
// každý díl jeden mesh v instancích (jeden draw call na díl pro všechny vozy). Matice se každým
// snímkem přestaví podle cartPlanPose (cart-layout.ts) – kola se točí podle ujeté dráhy maticí
// instance, ne zapečenou animací; skrytý díl (náklad prázdného vozu, voli stojícího) má nulovou
// matici. Pod voly, honákem a vozem měkký stín (statická stínová mapa pohyblivé věci nezachytí).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import type { Material } from '@babylonjs/core/Materials/material';
import { GroundBox } from './ground-box';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  CART_PARTS,
  CART_PREFIX,
  CART_SCALE,
  buildingCartParts,
  cartLength,
  cartPlanPose,
  cartPlanRoute,
  cartWheelCount,
  createCartPose,
  routeAt,
  type CartLeg,
  type CartPlan,
  type CartPose,
  type RoutePoint,
} from './cart-layout';
import { pickCart, type CartFigure, type CartPart, type DraftHit } from './draft-pick';
import { loadModelParts } from './instanced-model';
import { RING_SIZE_M, SelectionRing } from './selection-ring';
import type { Project } from './villager-pick';
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
/** Krok (m), po kterém se trasy projdou kvůli obalu. */
const BOUNDS_STEP_M = 1;
/** Kam spřežení sahá před jho (hlavy volů, m). */
const AHEAD_M = 1.5;
/**
 * Díly z ard.glb, které vůz potřebuje: šíjové jho páru (čtyřkolák) a vodicí provaz (rádlo a oj
 * ne). Dvoukolák má jednoduché jho jednoho vola z wagons.glb (`wagon2-yoke` – oxen.md, Potah).
 */
const DRAFT_PARTS = ['yoke', 'rope'] as const;
/** Jho podle druhu vozu – dvoukolák táhne jeden vůl, čtyřkolák pár. */
const YOKE_PART: Record<CartPlan['kind'], string> = {
  'two-wheel': 'wagon2-yoke',
  'four-wheel': 'yoke',
};
const DROVER_LOOK = [0.78, 0.7, 0.58, 0] as const;
/** Měkký stín: délka a šířka (m při CART_SCALE 1), krytí uprostřed. */
const SHADOW = { ox: [2.4, 1.0], man: [1.0, 1.0] } as const;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.04;
/** Stínů na vůz: dva voli, honák a vůz. */
const SHADOWS_PER_CART = 4;
/**
 * Kroužek pod vybraným vozem (villagers.md – Výběr postavy): před hlavami volů (m od jha při
 * měřítku 1), přídavek k délce a nejmenší šířka elipsy (m při CART_SCALE 1).
 */
const CART_RING = { ahead: 1.3, pad: 1.4, width: 3 } as const;

/** Vybraný vůz v okamžiku: kde v jízdě je, jestli veze náklad a jestli je vidět. */
export interface CartSelectedState {
  cart: number;
  leg: CartLeg;
  loaded: boolean;
  hidden: boolean;
}

export interface CartRendererEnvironment {
  /** Adresa modelů (`/models/` – plough/ox.glb, plough/plowman.glb, plough/ard.glb, wagons/wagons.glb). */
  baseUrl: string;
  /** Výška terénu pod vozem. */
  groundHeight: GroundFn;
  /** Úprava materiálu pevných dílů (PBR z GLB) – opar a světlo jako ostatní modely. */
  prepareMaterial?: (material: Material) => void;
  /** Modely se načetly a vozy se objevily – překreslit. */
  onLoaded(): void;
  /** Vybraný vůz (`select`) – kde v jízdě je; volá se jen při změně (null = vůz není). */
  onSelected?(state: CartSelectedState | null): void;
}

/** Díl vozu v instancích a kam která instance patří (vůz, a u kol i které kolo). */
interface PartSlots {
  mesh: Mesh;
  matrices: Float32Array;
  /** Pro každou instanci: vůz a pořadí kola (kola), jinak 0. */
  slots: { cart: number; index: number }[];
}

/**
 * Vozy (`setCarts` – plán každého vozu: dokola po trase, tam a zpět, nebo stojící). `animate` je
 * posune na okamžik `nowMs` (skutečný čas, jako zvířata) – jen v záběru; `frozen` = omezený pohyb.
 */
export class CartRenderer {
  private plans: CartPlan[] = [];
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
  /** Vybraný vůz nebo vozka (id vozu – villagers.md, Výběr postavy) a kroužek pod ním. */
  private selected: { cart: number; figure: CartFigure } | null = null;
  private ring: SelectionRing | null = null;
  private selectedState: CartSelectedState | null = null;
  private readonly probe = createCartPose();

  constructor(
    private readonly scene: Scene,
    private readonly env: CartRendererEnvironment,
  ) {}

  /** Vozy a co dělají; modely se stáhnou s prvním vozem. `nowMs` – okamžik první pózy. */
  setCarts(plans: readonly CartPlan[], nowMs = Date.now()): void {
    this.plans = [...plans];
    while (this.poses.length < plans.length) this.poses.push(createCartPose());
    this.poses.length = plans.length;
    if (plans.length > 0) void this.load();
    this.allocate();
    this.updateBounds();
    if (this.count > 0) this.write(nowMs, false);
    this.updateSelected(nowMs, false);
  }

  /**
   * Vůz pod kurzorem (x, y – CSS px plátna): korba, voli a vozka v posledních zapsaných pózách;
   * jen vozy vsi (s id). Jen při kliknutí. Nic – null.
   */
  pick(x: number, y: number, project: Project): (DraftHit<CartPart> & { cart: number }) | null {
    if (this.count === 0) return null;
    const carts = this.plans.flatMap((plan, i) =>
      plan.id === undefined ? [] : [{ kind: plan.kind, pose: this.poses[i]!, id: plan.id }],
    );
    const hit = pickCart(carts, x, y, project);
    return hit ? { ...hit, cart: carts[hit.index]!.id } : null;
  }

  /**
   * Vybere vůz (id) – celý (kroužek kolem volů a vozu), nebo vozku (kroužek pod ním); null výběr
   * zruší. Kroužek pak sleduje pohyb, stav hlásí `onSelected`.
   */
  select(selection: { cart: number; figure: CartFigure } | null, nowMs = Date.now()): void {
    const before = this.selected;
    if (before?.cart === selection?.cart && before?.figure === selection?.figure) return;
    this.selected = selection;
    if (this.count > 0) this.writeRing();
    else this.ring?.hide();
    this.updateSelected(nowMs, false);
  }

  /** Počet vozů s načtenými modely (pro testy a měření). */
  get count(): number {
    return this.ox && this.man && this.models.size > 0 ? this.plans.length : 0;
  }

  /** Střed vozu `index` v posledním zapsaném okamžiku – kam namířit kameru. */
  center(index = 0): { x: number; z: number } | null {
    const pose = this.poses[index];
    if (!pose || this.count === 0) return null;
    if (!pose.hitched) return { x: pose.body.x, z: pose.body.z };
    return { x: (pose.yoke.x + pose.body.x) / 2, z: (pose.yoke.z + pose.body.z) / 2 };
  }

  /**
   * Posune vozy na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. Bez kamery zapíše
   * vždy. `frozen` = omezený pohyb: stálá póza, nohy a kola stojí.
   */
  animate(nowMs: number, camera: Camera | null, frozen = false): boolean {
    // kde je vybraný vůz – i mimo záběr (panel výběru)
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
    for (const mesh of this.models.values()) mesh.dispose(false, true);
    this.models.clear();
    this.parts.clear();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.shadow = null;
    this.ring?.dispose();
    this.ring = null;
  }

  /** Kde je vybraný vůz v okamžiku `nowMs` – ohlásí jen změnu (`onSelected`). */
  private updateSelected(nowMs: number, frozen: boolean): void {
    const id = this.selected?.cart;
    const plan = id === undefined ? undefined : this.plans.find((p) => p.id === id);
    let state: CartSelectedState | null = null;
    if (id !== undefined && plan) {
      const pose = cartPlanPose(plan, nowMs, this.probe, this.env.groundHeight, frozen);
      state = {
        cart: id,
        leg: pose.leg ?? 'loop',
        loaded: pose.loaded,
        hidden: pose.hidden === true,
      };
    }
    const before = this.selectedState;
    const same =
      before === null || state === null
        ? before === state
        : before.cart === state.cart &&
          before.leg === state.leg &&
          before.loaded === state.loaded &&
          before.hidden === state.hidden;
    if (same) return;
    this.selectedState = state;
    this.env.onSelected?.(state);
  }

  /**
   * Kroužek pod vybraným vozem podle posledních póz: zapřažený vůz elipsou od hlav volů po zadek
   * korby, stojící vůz kolem korby, vozka kroužkem pod nohama; vůz za krajem mapy bez kroužku.
   */
  private writeRing(): void {
    const selected = this.selected;
    const index = selected ? this.plans.findIndex((p) => p.id === selected.cart) : -1;
    const pose = index >= 0 ? this.poses[index] : undefined;
    const plan = index >= 0 ? this.plans[index] : undefined;
    if (
      !selected ||
      !pose ||
      !plan ||
      pose.hidden ||
      (selected.figure === 'drover' && !pose.hitched)
    ) {
      this.ring?.hide();
      return;
    }
    const ring = (this.ring ??= new SelectionRing(this.scene, 'cart-ring'));
    const ground = this.env.groundHeight;
    if (selected.figure === 'drover') {
      const f = pose.boy;
      ring.show(ground, f.x, f.y, f.z, RING_SIZE_M * CART_SCALE * CART_PARTS.drover.scale);
      return;
    }
    const kind = CART_PARTS[plan.kind];
    const body = pose.body;
    const len = Math.hypot(body.fx, body.fz) || 1;
    const fx = body.fx / len;
    const fz = body.fz / len;
    const bx = body.x - fx * kind.back * CART_SCALE;
    const bz = body.z - fz * kind.back * CART_SCALE;
    let ax = body.x + fx * kind.front * CART_SCALE;
    let az = body.z + fz * kind.front * CART_SCALE;
    if (pose.hitched) {
      const yoke = pose.yoke;
      const yl = Math.hypot(yoke.fx, yoke.fz) || 1;
      ax = yoke.x + (yoke.fx / yl) * CART_RING.ahead * CART_SCALE;
      az = yoke.z + (yoke.fz / yl) * CART_RING.ahead * CART_SCALE;
    }
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const length = Math.hypot(ax - bx, az - bz) + CART_RING.pad * CART_SCALE;
    const width = Math.max(CART_RING.width, kind.halfWidth * 2 + 1.5) * CART_SCALE;
    ring.show(ground, x, ground(x, z), z, length, width, ax - bx, az - bz);
  }

  /** Obal všech vozů na celých trasách i stojících (stálý, dokud se plány nezmění). */
  private updateBounds(): void {
    const box = new GroundBox((x, z) => this.env.groundHeight(x, z));
    const extend = (x: number, z: number): void => box.extend(x, z);
    const at: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
    let reach = 0;
    for (const plan of this.plans) {
      reach = Math.max(reach, cartLength(plan.kind));
      if ('parked' in plan) {
        extend(plan.parked.x, plan.parked.z);
        continue;
      }
      const route = cartPlanRoute(plan)!;
      const steps = Math.max(1, Math.ceil(route.length / BOUNDS_STEP_M));
      for (let i = 0; i <= steps; i++) {
        routeAt(route, (i / steps) * route.length, at);
        extend(at.x, at.z);
      }
    }
    const pad = Math.max(reach, AHEAD_M * CART_SCALE) + 1;
    box.applyTo(this.bounds, pad, HEAD_ROOM_M * CART_SCALE);
  }

  /**
   * Které díly má který vůz: korba (a předek s ojí), kola, náklad; jho (dvoukolák jednoduché,
   * čtyřkolák páru) a provaz jen vůz, který jezdí (stojící vůz voly nemá).
   */
  private partSlots(): Map<string, { cart: number; index: number }[]> {
    const out = new Map<string, { cart: number; index: number }[]>();
    const add = (name: string, cart: number, index = 0): void => {
      const list = out.get(name) ?? [];
      list.push({ cart, index });
      out.set(name, list);
    };
    this.plans.forEach((plan, cart) => {
      const prefix = CART_PREFIX[plan.kind];
      add(`${prefix}-body`, cart);
      // rozdělaný vůz u tesaře – díly podle fáze stavby (korba, kola a předek, oj)
      const parts = buildingCartParts(plan.kind, 'parked' in plan ? plan.build : undefined);
      if (parts.front) add('wagon4-front', cart);
      if (parts.pole) add('wagon4-pole', cart);
      if (parts.wheels) {
        for (let w = 0; w < cartWheelCount(plan.kind); w++) add('wagon-wheel', cart, w);
      }
      if ('parked' in plan) return;
      if (plan.cargo !== 'empty') add(`${prefix}-${plan.cargo}`, cart);
      add(YOKE_PART[plan.kind], cart);
      add('rope', cart);
    });
    return out;
  }

  /** Buffery instancí podle vozů (voli 2, honák 1 – i u stojícího vozu skrytí –, díly, stíny 4). */
  private allocate(): void {
    const n = this.plans.length;
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

  /** Zapíše pózy všech vozů v okamžiku `nowMs` do instancí. */
  private write(nowMs: number, frozen: boolean): void {
    const ox = this.ox;
    const man = this.man;
    if (!ox || !man) return;
    const ground = this.env.groundHeight;
    this.plans.forEach((plan, i) => {
      const pose = cartPlanPose(plan, nowMs, this.poses[i]!, ground, frozen);
      const still = frozen || !pose.moving;
      if (pose.hidden) {
        // karavana výpravy za krajem mapy (caravan.ts) – vůz, voli, honák ani stíny se nekreslí
        hideFigure(ox, i * 2);
        hideFigure(ox, i * 2 + 1);
        hideFigure(man, i);
        for (let j = 0; j < SHADOWS_PER_CART; j++) this.hideShadow(i * SHADOWS_PER_CART + j);
        return;
      }
      if (pose.hitched) {
        pose.oxen.forEach((o, j) => {
          if (j >= pose.team) {
            // dvoukolák táhne jeden vůl (oxen.md – Potah) – druhý se nekreslí
            hideFigure(ox, i * 2 + j);
            this.hideShadow(i * SHADOWS_PER_CART + j);
            return;
          }
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
      } else {
        // stojící vůz: voli jsou v ohradě, honák doma
        hideFigure(ox, i * 2);
        hideFigure(ox, i * 2 + 1);
        hideFigure(man, i);
        for (let j = 0; j < 3; j++) this.hideShadow(i * SHADOWS_PER_CART + j);
      }
      // stín vozu: elipsa pod korbou ve směru korby
      const body = pose.body;
      const len = Math.hypot(body.fx, body.fz) || 1;
      const kind = CART_PARTS[plan.kind];
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
        if (pose.hidden) part.matrices.fill(0, o, o + 16);
        else if (name === 'yoke' || name === 'wagon2-yoke') {
          writePartMatrix(part.matrices, o, pose.yoke, CART_SCALE);
        } else if (name === 'rope') writeSegmentMatrix(part.matrices, o, pose.rope, 1, CART_SCALE);
        else if (name === 'wagon4-pole') {
          writeSegmentMatrix(
            part.matrices,
            o,
            pose.pole,
            CART_PARTS['four-wheel'].poleM,
            CART_SCALE,
          );
        } else if (name === 'wagon-wheel') {
          writePartMatrix(part.matrices, o, pose.wheels[index]!, CART_SCALE);
        } else if (name === 'wagon4-front') {
          writePartMatrix(part.matrices, o, pose.front, CART_SCALE);
        } else if (name.endsWith('-body') || pose.loaded) {
          writePartMatrix(part.matrices, o, pose.body, CART_SCALE);
        } else {
          // náklad prázdného vozu (jede tam) – nulová matice, nekreslí se
          part.matrices.fill(0, o, o + 16);
        }
      });
      part.mesh.thinInstanceBufferUpdated('matrix');
    }
    // skutečný čas od stejného počátku jako lidé a zvířata (malá čísla – přesné siny)
    const t = villagerSeconds(nowMs);
    const time = frozen ? 0 : (((t % 3600) + 3600) % 3600) + 3600;
    for (const kind of [ox, man]) {
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = time;
    }
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
    if (this.selected) this.writeRing();
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

  private hideShadow(index: number): void {
    this.shadow?.matrices.fill(0, index * 16, index * 16 + 16);
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
        this.write(Date.now(), false);
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

/** Skrytá postava (vůz bez volů): nulová matice, animace stojí. */
function hideFigure(kind: BakedKind, slot: number): void {
  kind.matrices.fill(0, slot * 16, slot * 16 + 16);
  kind.settings.fill(0, slot * 4, slot * 4 + 4);
}
