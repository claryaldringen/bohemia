// Pohřeb ve scéně (docs/design/cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026: „Když je
// pohřeb, chtěl bych vidět průvod lidí na hřbitov a pak na hřbitově hranici.“): máry se zemřelým
// mezi nosiči, hranice na místě mohyly, oheň (plameny, jiskry a záře – sprity, pyre-fire.ts),
// hustý dým (PYRE_PLUME – smoke-schedule.ts), druhý den ohořelé zbytky se žhavými uhlíky, které
// šednou. Kdy co je, říká plán pohřbu (funeral-plan.ts) – čistá funkce času. Díly z funeral.glb
// (tools/blender/funeral.py) jsou meshe v instancích (jeden na díl pro všechny pohřby), matice se
// přepíší každým krokem animace; skrytý díl má nulovou matici. Lidi průvodu kreslí villagers.ts.
// Kreslí se jen v záběru; při omezeném pohybu stojí (animate se nevolá – zůstane póza z `set`).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import {
  bierPose,
  createBierPose,
  moundHidden,
  pyreState,
  type FuneralPlan,
  type FuneralTimeline,
  type PyreState,
} from './funeral-plan';
import { applyGammaFog } from './gamma-fog';
import { loadModelParts } from './instanced-model';
import { FIRE_REACH_M, fireSprites, type FireSprite } from './pyre-fire';
import type { Rgb } from './season-look';
import { PYRE_PLUME, hash01, plumePuffs, plumeReach, type Puff } from './smoke-schedule';

const MODEL_URL = '/models/cemetery/funeral.glb';
const FIRE_URL = '/textures/particles/fire.png';
const SMOKE_URL = '/textures/particles/smoke.png';
/** Díly funeral.glb. */
const PARTS = ['bier', 'pyre', 'remains', 'embers'] as const;
type Part = (typeof PARTS)[number];
/** Sprity se kreslí po krajině jako dým z obydlí (village-smoke.ts – skupina 1). */
const SPRITE_RENDERING_GROUP = 1;
const FIRE_CELL_PX = 128;
const SMOKE_CELL_PX = 128;
/** Dál od kamery (m) se oheň a máry nehýbou – jako dým a lidé. */
const ANIMATE_RANGE_M = 1500;
/** Máry leží na hranici – tyče kus nad vrchem polen (m). */
const BIER_ON_PYRE_M = 0.05;
/** Okolní světlo dílů – jako modely vsi (village-renderer.ts). */
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Dým z hranice: nejvyšší krytí a tmavší odstín (hoří dřevo i tělo – hustý, šedohnědý). */
const SMOKE_ALPHA = 0.8;
const SMOKE_SHADE = 0.72;
/** Síla záře žhavých uhlíků (násobek textury uhlíků – aditivně). */
const EMBERS_GLOW = 1.6;
/** Ohořelé zbytky: odstín při dohořívání a zšednutí popela (násobek atlasu). */
const REMAINS_SHADE = { charred: 0.55, ash: 1.15 };

interface PartSlots {
  mesh: Mesh;
  matrices: Float32Array;
  colors: Float32Array;
}

interface PlanView {
  plan: FuneralPlan;
  seed: number;
  fire: Sprite[];
  smoke: Sprite[];
  flames: FireSprite[];
  puffs: Puff[];
}

export interface FuneralRendererEnvironment {
  /** Výška terénu (s převýšením). */
  groundHeight(x: number, z: number): number;
  /** Modely se načetly – překreslit. */
  onLoaded(): void;
}

/**
 * Pohřby ve vsi: `set` dostane plány (villagers.ts je spočítá s průvodem), `animate` posune máry,
 * hranici a oheň na okamžik `nowMs` (skutečný čas). `hiddenMounds` – mohyly, které ještě nejsou
 * nasypané (hořící a doutnající hranice).
 */
export class FuneralRenderer {
  private views: PlanView[] = [];
  private readonly parts = new Map<Part, PartSlots>();
  private fireManager: SpriteManager | null = null;
  private smokeManager: SpriteManager | null = null;
  private capacity = 0;
  private loading: Promise<void> | null = null;
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private readonly bier = createBierPose();
  private tone: Rgb = [1, 1, 1];
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: FuneralRendererEnvironment,
  ) {}

  /** Nové plány pohřbů; vrátí true, když je co překreslit. */
  set(plans: readonly FuneralPlan[], nowMs: number): boolean {
    if (this.disposed) return false;
    const had = this.views.length > 0;
    for (const view of this.views) for (const s of [...view.fire, ...view.smoke]) s.dispose();
    this.views = [];
    if (plans.length > 0) void this.load();
    this.ensureManagers(plans.length);
    this.views = plans.map((plan) => ({
      plan,
      seed: hashKey(plan.key),
      fire: this.sprites(this.fireManager, 'funeral-fire', fireSprites(0, 0, IDLE, NORTH).length),
      smoke: this.sprites(this.smokeManager, 'funeral-smoke', PYRE_PLUME.puffs),
      flames: [],
      puffs: [],
    }));
    this.allocate();
    this.updateBounds();
    this.write(nowMs);
    return had || this.views.length > 0;
  }

  /**
   * Mohyly pohřbů, které ještě nejsou nasypané (klíč `funeralKey` – hřbitov, čtverec, místo):
   * hranice hoří nebo doutná (cemetery.md – Pohřeb ve scéně: mohyla až po dohoření).
   */
  hiddenMounds(nowMs: number): Set<string> {
    const keys = new Set<string>();
    for (const view of this.views) if (moundHidden(view.plan, nowMs)) keys.add(view.plan.key);
    return keys;
  }

  /** Posune máry, hranici a oheň na okamžik `nowMs`; vrátí true, když se v záběru něco hnulo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.views.length === 0) return false;
    if (
      !this.views.some(
        (v) => nowMs >= v.plan.timeline.startMs - 1000 && nowMs < v.plan.timeline.coldMs + 1000,
      )
    ) {
      return false;
    }
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(nowMs);
    return true;
  }

  /** Den a noc: dým je bez světla – v soumraku a v noci se přibarví (oheň svítí sám). */
  setTone(tone: Rgb): void {
    this.tone = tone;
  }

  /**
   * Kam namířit kameru (vývojová ukázka): na máry v průvodu, jinak na hranici prvního pohřbu;
   * bez pohřbu null.
   */
  focus(nowMs: number): { x: number; z: number; timeline: FuneralTimeline } | null {
    const plan = this.views[0]?.plan;
    if (!plan) return null;
    const bier = bierPose(plan, nowMs, createBierPose());
    const at = bier.visible && !bier.onPyre ? bier : plan.pyre;
    return { x: at.x, z: at.z, timeline: plan.timeline };
  }

  dispose(): void {
    this.disposed = true;
    for (const view of this.views) for (const s of [...view.fire, ...view.smoke]) s.dispose();
    this.views = [];
    for (const slots of this.parts.values()) slots.mesh.dispose(false, true);
    this.parts.clear();
    this.fireManager?.dispose();
    this.smokeManager?.dispose();
    this.fireManager = null;
    this.smokeManager = null;
  }

  private sprites(manager: SpriteManager | null, name: string, count: number): Sprite[] {
    if (!manager) return [];
    return Array.from({ length: count }, () => {
      const sprite = new Sprite(name, manager);
      sprite.isVisible = false;
      return sprite;
    });
  }

  /** Správci spritů ohně a dýmu s místem pro `count` hranic (znovu, jen když nestačí). */
  private ensureManagers(count: number): void {
    if (count === 0 || (this.fireManager && count <= this.capacity)) return;
    this.fireManager?.dispose();
    this.smokeManager?.dispose();
    this.capacity = Math.max(4, count);
    const fireCount = fireSprites(0, 0, IDLE, NORTH).length;
    const fire = new SpriteManager(
      'funeral-fire',
      FIRE_URL,
      this.capacity * fireCount,
      FIRE_CELL_PX,
      this.scene,
    );
    // oheň svítí – sčítá se s tím, co je za ním (barva × krytí)
    fire.blendMode = Constants.ALPHA_ADD;
    fire.disableDepthWrite = true;
    fire.isPickable = false;
    fire.renderingGroupId = SPRITE_RENDERING_GROUP;
    fire.fogEnabled = false;
    const smoke = new SpriteManager(
      'funeral-smoke',
      SMOKE_URL,
      this.capacity * PYRE_PLUME.puffs,
      SMOKE_CELL_PX,
      this.scene,
    );
    smoke.disableDepthWrite = true;
    smoke.isPickable = false;
    smoke.renderingGroupId = SPRITE_RENDERING_GROUP;
    this.scene.setRenderingAutoClearDepthStencil(SPRITE_RENDERING_GROUP, false, false, false);
    this.fireManager = fire;
    this.smokeManager = smoke;
  }

  /** Buffery instancí dílů pro současné pohřby (instance = pohřeb). */
  private allocate(): void {
    const n = Math.max(1, this.views.length);
    for (const slots of this.parts.values()) {
      slots.matrices = new Float32Array(n * 16);
      slots.colors = new Float32Array(n * 4).fill(1);
      slots.mesh.thinInstanceSetBuffer('matrix', slots.matrices, 16, false);
      slots.mesh.thinInstanceSetBuffer('color', slots.colors, 4, false);
      slots.mesh.thinInstanceCount = this.views.length;
      slots.mesh.setEnabled(this.views.length > 0);
    }
  }

  /** Obal pohřbů: trasy průvodu (máry), hranice s ohněm a dýmem nad ní. */
  private updateBounds(): void {
    if (this.views.length === 0) return;
    const reach = plumeReach(PYRE_PLUME);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    for (const { plan } of this.views) {
      const e = plan.extent;
      minX = Math.min(minX, e.minX, plan.pyre.x - reach.side);
      maxX = Math.max(maxX, e.maxX, plan.pyre.x + reach.side);
      minZ = Math.min(minZ, e.minZ, plan.pyre.z - reach.side);
      maxZ = Math.max(maxZ, e.maxZ, plan.pyre.z + reach.side);
      const y = this.env.groundHeight(plan.pyre.x, plan.pyre.z);
      low = Math.min(low, y - 1);
      high = Math.max(high, y + Math.max(reach.up, FIRE_REACH_M.up));
    }
    this.bounds.reConstruct(new Vector3(minX, low, minZ), new Vector3(maxX, high, maxZ));
  }

  /** Zapíše máry, hranice, zbytky, oheň a dým všech pohřbů na okamžik `nowMs`. */
  private write(nowMs: number): void {
    const height = this.env.groundHeight;
    const visible = new Map<Part, boolean>(PARTS.map((p) => [p, false]));
    this.views.forEach((view, i) => {
      const { plan } = view;
      const started = nowMs >= plan.timeline.startMs;
      const state = started ? pyreState(plan.timeline, nowMs) : IDLE;
      const { x, z, headingX, headingZ } = plan.pyre;
      const ground = height(x, z);
      // hranice: stojí od začátku dne pohřbu, hoří a sesedá
      this.writePart(
        'pyre',
        i,
        state.stack > 0 && started,
        x,
        ground,
        z,
        headingX,
        headingZ,
        1,
        state.stack,
      );
      // máry: na ramenou nosičů, pak na hranici
      const bier = bierPose(plan, nowMs, this.bier);
      if (bier.visible) {
        const y = bier.onPyre
          ? ground + bier.lift + BIER_ON_PYRE_M
          : height(bier.x, bier.z) + bier.lift;
        this.writePart('bier', i, true, bier.x, y, bier.z, bier.headingX, bier.headingZ, 1, 1);
      } else this.writePart('bier', i, false, 0, 0, 0, 0, 1, 1, 1);
      // ohořelé zbytky: objeví se, jak hranice dohořívá, druhý den šednou
      const shade = REMAINS_SHADE.charred + (REMAINS_SHADE.ash - REMAINS_SHADE.charred) * state.ash;
      const grow = 0.7 + 0.3 * state.remains;
      this.writePart(
        'remains',
        i,
        state.remains > 0.01,
        x,
        ground,
        z,
        headingX,
        headingZ,
        grow,
        state.remains,
        [shade, shade, shade],
      );
      // žhavé uhlíky – záře (aditivně), slábne, jak chladnou
      // aditivní záře – praskliny uhlíků svítí silněji než textura
      const glow = state.glow * EMBERS_GLOW;
      this.writePart(
        'embers',
        i,
        glow > 0.01,
        x,
        ground,
        z,
        headingX,
        headingZ,
        grow,
        state.remains,
        [glow, glow * 0.92, glow * 0.85],
      );
      this.writeFire(view, nowMs, state, ground);
      this.writeSmoke(view, nowMs, ground);
      for (const part of PARTS) {
        const slots = this.parts.get(part);
        if (slots && slots.matrices[i * 16 + 15] !== 0) visible.set(part, true);
      }
    });
    for (const [part, slots] of this.parts) {
      slots.mesh.thinInstanceBufferUpdated('matrix');
      slots.mesh.thinInstanceBufferUpdated('color');
      slots.mesh.setEnabled(visible.get(part) === true);
    }
  }

  private writePart(
    part: Part,
    index: number,
    show: boolean,
    x: number,
    y: number,
    z: number,
    hx: number,
    hz: number,
    scale: number,
    scaleY: number,
    color?: readonly [number, number, number],
  ): void {
    const slots = this.parts.get(part);
    if (!slots) return;
    const m = slots.matrices;
    const o = index * 16;
    if (!show) {
      m.fill(0, o, o + 16);
      return;
    }
    // natočení kolem svislé osy: místní +Z = směr (hx, hz), místní +X = (hz, −hx)
    m[o] = hz * scale;
    m[o + 1] = 0;
    m[o + 2] = -hx * scale;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = scaleY;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = hx * scale;
    m[o + 9] = 0;
    m[o + 10] = hz * scale;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    if (color) {
      slots.colors[index * 4] = color[0];
      slots.colors[index * 4 + 1] = color[1];
      slots.colors[index * 4 + 2] = color[2];
      slots.colors[index * 4 + 3] = 1;
    }
  }

  private writeFire(view: PlanView, nowMs: number, state: PyreState, ground: number): void {
    const { plan } = view;
    const heading = { x: plan.pyre.headingX, z: plan.pyre.headingZ };
    fireSprites(view.seed, nowMs / 1000, state, heading, view.flames);
    view.fire.forEach((sprite, k) => {
      const f = view.flames[k]!;
      sprite.isVisible = f.intensity > 0.004;
      if (!sprite.isVisible) return;
      sprite.position.set(plan.pyre.x + f.dx, ground + f.dy, plan.pyre.z + f.dz);
      sprite.width = f.width;
      sprite.height = f.height;
      sprite.angle = f.angle;
      sprite.cellIndex = f.cell;
      sprite.color.set(1, 1, 1, Math.min(1, f.intensity));
    });
  }

  private writeSmoke(view: PlanView, nowMs: number, ground: number): void {
    const { plan } = view;
    const t = plan.timeline;
    const strengthAt = (ageS: number): number => {
      const at = nowMs - ageS * 1000;
      return at < t.litMs ? 0 : pyreState(t, at).smoke;
    };
    plumePuffs(view.seed, nowMs / 1000, strengthAt, view.puffs, PYRE_PLUME);
    const [r, g, b] = this.tone;
    view.smoke.forEach((sprite, k) => {
      const puff = view.puffs[k]!;
      const alpha = puff.alpha * SMOKE_ALPHA;
      sprite.isVisible = alpha > 0.004;
      if (!sprite.isVisible) return;
      // dým stoupá z ohně (nad hranicí)
      sprite.position.set(plan.pyre.x + puff.dx, ground + 1.2 + puff.dy, plan.pyre.z + puff.dz);
      sprite.width = puff.size;
      sprite.height = puff.size;
      sprite.angle = puff.angle;
      const shade = puff.shade * SMOKE_SHADE + 0.1 * Math.min(1, puff.dy / 12);
      sprite.color.set(shade * 0.98 * r, shade * 0.95 * g, shade * 0.92 * b, alpha);
    });
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const parts = await loadModelParts(this.scene, MODEL_URL, 'funeral-', prepareMaterial).catch(
        (error: unknown) => {
          console.warn('Model pohřbu se nepodařilo načíst.', error);
          return null;
        },
      );
      if (!parts || this.disposed || this.scene.isDisposed) {
        for (const mesh of parts?.values() ?? []) mesh.dispose();
        return;
      }
      for (const [name, mesh] of parts) {
        if (!(PARTS as readonly string[]).includes(name)) {
          mesh.dispose();
          continue;
        }
        // pohyblivé a dočasné díly – ne vrhače stínové mapy; obal přes instance by se
        // přepočítával
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.isPickable = false;
        if (name === 'embers') mesh.material = embersMaterial(this.scene, mesh.material);
        this.parts.set(name as Part, {
          mesh,
          matrices: new Float32Array(16),
          colors: new Float32Array(4),
        });
      }
      this.allocate();
      this.write(Date.now());
      this.env.onLoaded();
    })();
    return this.loading;
  }
}

/** Klidová hranice (před zapálením). */
const IDLE: PyreState = { stack: 1, bier: 0, fire: 0, remains: 0, glow: 0, ash: 0, smoke: 0 };
const NORTH = { x: 0, z: 1 };

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return Math.floor(hash01(h, 7, 3) * 1_000_000);
}

/** Materiál dílů z GLB (PBR): opar jako modely vsi, bez sněhu (hranice hoří krátce). */
function prepareMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
}

/**
 * Žhavé uhlíky: textura uhlíků z atlasu bez světla a aditivně – praskliny svítí, černé nic
 * nepřidá; síla záře je barva instance (0 = vychladlé).
 */
function embersMaterial(scene: Scene, source: Material | null): Material {
  const material = new StandardMaterial('funeral-embers-glow', scene);
  const texture = source instanceof PBRMaterial ? source.albedoTexture : null;
  if (texture) material.diffuseTexture = texture;
  material.diffuseColor = new Color3(0, 0, 0);
  material.emissiveColor = new Color3(1, 1, 1);
  material.specularColor = new Color3(0, 0, 0);
  material.disableLighting = true;
  material.alphaMode = Constants.ALPHA_ADD;
  material.alpha = 0.999;
  material.disableDepthWrite = true;
  material.fogEnabled = false;
  material.zOffset = -2;
  return material;
}
