// Svatba ve scéně (docs/design/kinship.md – Svatba ve scéně; Martin – GitHub issue #2: „Jako máme
// pohřeb, udělej i svatbu. Svatebčané půjdou na některé z posvátných míst v okolí, kde budou
// oddáni.“): co ke svatbě patří kromě lidí – oheň obřadu (u svatyně v ohništích u vstupu, na návsi
// ohniště z kamenů a polen – plameny, jiskry a záře jako u pohřební hranice, pyre-fire.ts, jen
// menší) a věnec s pentlemi na kmeni posvátného dubu, jen při obřadu. Kdy co je, říká plán svatby
// (wedding-plan.ts) – čistá funkce času. Díly jsou malé sítě z tvarů Babylonu s barvami ve
// vrcholech (jeden mesh na díl, klon na svatbu); lidi svatby kreslí villagers.ts. Kreslí se jen
// v záběru; při omezeném pohybu stojí (animate se nevolá – zůstane stav z `set`).
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Scene } from '@babylonjs/core/scene';
import { obstacleIndex, obstacleLook, type ObstacleLayer } from '@bohemia/game';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { FIRE_REACH_M, fireSprites, type FireSprite } from './pyre-fire';
import { hash01 } from './smoke-schedule';
import { oakGarland, weddingFire, weddingFocus, type WeddingPlan } from './wedding-plan';

const FIRE_URL = '/textures/particles/fire.png';
const FIRE_CELL_PX = 128;
/** Sprity se kreslí po krajině jako dým z obydlí a oheň hranice (skupina 1). */
const SPRITE_RENDERING_GROUP = 1;
/** Dál od kamery (m) se oheň nehýbe – jako dým a lidé. */
const ANIMATE_RANGE_M = 1500;
/**
 * Oheň obřadu je menší než pohřební hranice (násobek plamenů hranice – pyre-fire.ts): v ohništi
 * svatyně a na návsi.
 */
const FIRE_SCALE = { shrine: 0.42, green: 0.5 } as const;
/** Okolní světlo dílů – jako modely vsi (village-renderer.ts). */
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/**
 * Věnec a pentle na kmeni posvátného dubu (m v měřítku modelu dubu): výška věnce, tloušťka věnce,
 * kvítky, pentle (délka a šířka). Poloměr kmene ve výšce věnce podle modelu dubu – OAK_TRUNK_M.
 */
const GARLAND = {
  heightM: 2.1,
  tubeM: 0.15,
  flowers: 26,
  flowerM: 0.17,
  ribbons: 7,
  ribbonM: 1.4,
  ribbonWidthM: 0.15,
} as const;
/**
 * Poloměr kmene dubů ve výšce věnce (≈ 2,1 m, změřeno z GLB modelů stromů – mezi prstenci kmene
 * lineárně); model mimo tabulku DEFAULT_TRUNK_M.
 */
const OAK_TRUNK_M: Readonly<Record<string, number>> = {
  'oak-1': 0.88,
  'oak-2': 0.5,
  'oak-large-1': 0.54,
  'oak-large-2': 0.6,
  'oak-large-3': 0.6,
};
const DEFAULT_TRUNK_M = 0.6;
/** Barvy kvítků a pentlí (bílá, mořena, boryt, rezeda). */
const FLOWER_COLORS: readonly [number, number, number][] = [
  [0.88, 0.86, 0.78],
  [0.68, 0.17, 0.1],
  [0.3, 0.4, 0.68],
  [0.84, 0.68, 0.22],
];
const LEAF_COLOR: [number, number, number] = [0.22, 0.38, 0.14];
const STONE_COLOR: [number, number, number] = [0.5, 0.48, 0.44];
const LOG_COLOR: [number, number, number] = [0.32, 0.22, 0.13];

interface PlanView {
  plan: WeddingPlan;
  seed: number;
  /** Sprity ohně – po ohništích (FLAMES + SPARKS + záře na ohniště). */
  fire: Sprite[];
  flames: FireSprite[];
  /** Ohniště na návsi (kameny a polena) a věnec s pentlemi na dubu. */
  hearth: Mesh | null;
  garland: Mesh | null;
}

export interface WeddingRendererEnvironment {
  /** Výška terénu (s převýšením). */
  groundHeight(x: number, z: number): number;
}

/**
 * Svatby ve vsi: `set` dostane plány (villagers.ts je spočítá s průvodem), `animate` posune oheň
 * a věnec na okamžik `nowMs` (skutečný čas).
 */
export class WeddingRenderer {
  private views: PlanView[] = [];
  private fireManager: SpriteManager | null = null;
  private capacity = 0;
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private material: StandardMaterial | null = null;
  private hearthSource: Mesh | null = null;
  /** Věnec s pentlemi podle poloměru kmene (cm) – jeden zdroj na model dubu. */
  private readonly garlandSources = new Map<number, Mesh>();
  /** Vrstva překážek krajiny – model a měřítko posvátného dubu (věnec na kmen). */
  private layer: ObstacleLayer | null = null;
  /** Při posledním zápisu běžel obřad (oheň) – po konci se zapíše ještě jednou. */
  private live = true;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: WeddingRendererEnvironment,
  ) {}

  /** Nové plány svateb; vrátí true, když je co překreslit. */
  set(plans: readonly WeddingPlan[], nowMs: number): boolean {
    if (this.disposed) return false;
    const had = this.views.length > 0;
    this.clearViews();
    const fires = plans.reduce((sum, p) => sum + p.site.fires.length, 0);
    this.ensureManager(fires);
    const perFire = fireSprites(0, 0, IDLE, NORTH).length;
    this.views = plans.map((plan) => {
      const seed = Math.floor(hash01(hashKey(plan.key), 3, 7) * 1_000_000);
      const hearth = plan.site.kind === 'green' ? this.hearthAt(plan) : null;
      const garland = plan.site.oak ? this.garlandAt(plan) : null;
      return {
        plan,
        seed,
        fire: this.sprites(perFire * plan.site.fires.length),
        flames: [],
        hearth,
        garland,
      };
    });
    this.updateBounds();
    this.write(nowMs);
    this.live = true;
    return had || this.views.length > 0;
  }

  /** Vrstva překážek krajiny – podle ní sedí věnec na kmeni posvátného dubu. */
  setObstacles(layer: ObstacleLayer): void {
    this.layer = layer;
  }

  /** Posune oheň a věnec na okamžik `nowMs`; vrátí true, když se v záběru něco změnilo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.views.length === 0) return false;
    const live = this.views.some(
      (v) => nowMs >= v.plan.timeline.startMs - 1000 && nowMs < v.plan.figuresUntilMs + 1000,
    );
    if (!live && !this.live) return false;
    this.live = live;
    if (live && camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(nowMs);
    return true;
  }

  /** Kam namířit kameru (vývojová ukázka): na průvod, pak na pár; bez svatby null. */
  focus(nowMs: number): { x: number; z: number; plan: WeddingPlan } | null {
    const plan = this.views[0]?.plan;
    if (!plan) return null;
    return { ...weddingFocus(plan, nowMs), plan };
  }

  dispose(): void {
    this.disposed = true;
    this.clearViews();
    this.fireManager?.dispose();
    this.fireManager = null;
    this.hearthSource?.dispose();
    for (const mesh of this.garlandSources.values()) mesh.dispose();
    this.garlandSources.clear();
    this.material?.dispose();
  }

  private clearViews(): void {
    for (const view of this.views) {
      for (const s of view.fire) s.dispose();
      view.hearth?.dispose();
      view.garland?.dispose();
    }
    this.views = [];
  }

  private sprites(count: number): Sprite[] {
    const manager = this.fireManager;
    if (!manager || count === 0) return [];
    return Array.from({ length: count }, () => {
      const sprite = new Sprite('wedding-fire', manager);
      sprite.isVisible = false;
      return sprite;
    });
  }

  /** Správce spritů ohně s místem pro `count` ohnišť (znovu, jen když nestačí). */
  private ensureManager(count: number): void {
    if (count === 0 || (this.fireManager && count <= this.capacity)) return;
    this.fireManager?.dispose();
    this.capacity = Math.max(4, count);
    const perFire = fireSprites(0, 0, IDLE, NORTH).length;
    const fire = new SpriteManager(
      'wedding-fire',
      FIRE_URL,
      this.capacity * perFire,
      FIRE_CELL_PX,
      this.scene,
    );
    // oheň svítí – sčítá se s tím, co je za ním (barva × krytí)
    fire.blendMode = Constants.ALPHA_ADD;
    fire.disableDepthWrite = true;
    fire.isPickable = false;
    fire.renderingGroupId = SPRITE_RENDERING_GROUP;
    fire.fogEnabled = false;
    this.scene.setRenderingAutoClearDepthStencil(SPRITE_RENDERING_GROUP, false, false, false);
    this.fireManager = fire;
  }

  /** Obal svateb: trasy průvodu, podkova a oheň nad ohništi. */
  private updateBounds(): void {
    if (this.views.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    for (const { plan } of this.views) {
      const e = plan.extent;
      minX = Math.min(minX, e.minX);
      maxX = Math.max(maxX, e.maxX);
      minZ = Math.min(minZ, e.minZ);
      maxZ = Math.max(maxZ, e.maxZ);
      const y = this.env.groundHeight(plan.site.couple.x, plan.site.couple.z);
      low = Math.min(low, y - 2);
      high = Math.max(high, y + FIRE_REACH_M.up, y + GARLAND.heightM * 2);
    }
    this.bounds.reConstruct(new Vector3(minX, low, minZ), new Vector3(maxX, high, maxZ));
  }

  /** Zapíše oheň, ohniště a věnec všech svateb na okamžik `nowMs`. */
  private write(nowMs: number): void {
    for (const view of this.views) {
      const { plan } = view;
      const t = plan.timeline;
      // ohniště na návsi – připravené od scházení průvodu do rozchodu
      view.hearth?.setEnabled(nowMs >= t.gatherMs && nowMs < plan.figuresUntilMs);
      view.garland?.setEnabled(oakGarland(plan, nowMs));
      const strength = weddingFire(plan, nowMs);
      const scale = plan.site.kind === 'shrine' ? FIRE_SCALE.shrine : FIRE_SCALE.green;
      const perFire = view.fire.length / Math.max(1, plan.site.fires.length);
      plan.site.fires.forEach((spot, k) => {
        const ground = this.env.groundHeight(spot.x, spot.z);
        const state = { fire: strength, stack: 0.3, glow: strength * 0.6 };
        fireSprites(view.seed + k * 7919, nowMs / 1000, state, NORTH, view.flames);
        for (let i = 0; i < perFire; i++) {
          const sprite = view.fire[k * perFire + i];
          const f = view.flames[i];
          if (!sprite || !f) continue;
          sprite.isVisible = f.intensity > 0.004;
          if (!sprite.isVisible) continue;
          sprite.position.set(spot.x + f.dx * scale, ground + f.dy * scale, spot.z + f.dz * scale);
          sprite.width = f.width * scale;
          sprite.height = f.height * scale;
          sprite.angle = f.angle;
          sprite.cellIndex = f.cell;
          sprite.color.set(1, 1, 1, Math.min(1, f.intensity));
        }
      });
    }
  }

  private materialOf(): StandardMaterial {
    if (this.material) return this.material;
    const material = new StandardMaterial('wedding-parts', this.scene);
    material.diffuseColor = new Color3(1, 1, 1);
    material.specularColor = new Color3(0, 0, 0);
    material.ambientColor = AMBIENT;
    this.material = material;
    return material;
  }

  /** Ohniště na návsi (kruh kamenů a polena do kříže) – klon zdroje na místě ohně. */
  private hearthAt(plan: WeddingPlan): Mesh | null {
    const fire = plan.site.fires[0];
    if (!fire) return null;
    this.hearthSource ??= this.buildHearth();
    const mesh = this.hearthSource.clone(`wedding-hearth-${plan.key}`);
    mesh.position.set(fire.x, this.env.groundHeight(fire.x, fire.z), fire.z);
    mesh.setEnabled(false);
    return mesh;
  }

  /**
   * Věnec a pentle na kmeni posvátného dubu – klon zdroje podle modelu dubu, zvětšený s měřítkem
   * stromu ve vrstvě a s růstem dubu, pentle k páru.
   */
  private garlandAt(plan: WeddingPlan): Mesh | null {
    const oak = plan.site.oak;
    if (!oak) return null;
    const index =
      this.layer && plan.site.id !== null ? obstacleIndex(this.layer, plan.site.id) : -1;
    const look = index >= 0 && this.layer ? obstacleLook(this.layer, index) : null;
    const trunk = (look ? OAK_TRUNK_M[look] : undefined) ?? DEFAULT_TRUNK_M;
    const size = index >= 0 && this.layer ? (this.layer.scale[index] ?? 1) : 1;
    const key = Math.round(trunk * 100);
    let source = this.garlandSources.get(key);
    if (!source) {
      source = this.buildGarland(trunk);
      this.garlandSources.set(key, source);
    }
    const mesh = source.clone(`wedding-garland-${plan.key}`);
    mesh.position.set(oak.x, this.env.groundHeight(oak.x, oak.z), oak.z);
    mesh.scaling.setAll(oak.growth * size);
    mesh.rotation.y = Math.atan2(plan.site.couple.x - oak.x, plan.site.couple.z - oak.z);
    mesh.setEnabled(false);
    return mesh;
  }

  private buildHearth(): Mesh {
    const parts: Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const stone = CreateSphere('wedding-stone', { diameter: 0.34, segments: 4 }, this.scene);
      stone.scaling.set(1.1, 0.55, 0.9);
      stone.position.set(Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62);
      stone.rotation.y = a;
      parts.push(painted(stone, STONE_COLOR));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const log = CreateCylinder(
        'wedding-log',
        { height: 0.95, diameter: 0.11, tessellation: 6 },
        this.scene,
      );
      // polena opřená o sebe do jehlanu nad středem ohniště (vrch nakloněný ke středu)
      log.rotation.set(0.62, a, 0);
      log.position.set(-Math.sin(a) * 0.17, 0.36, -Math.cos(a) * 0.17);
      parts.push(painted(log, LOG_COLOR));
    }
    return this.merge('wedding-hearth', parts);
  }

  private buildGarland(trunkM: number): Mesh {
    const g = GARLAND;
    const parts: Mesh[] = [];
    const ring = CreateTorus(
      'wedding-ring',
      { diameter: 2 * (trunkM + g.tubeM * 0.4), thickness: g.tubeM, tessellation: 28 },
      this.scene,
    );
    ring.position.y = g.heightM;
    parts.push(painted(ring, LEAF_COLOR));
    const radius = trunkM + g.tubeM * 0.8;
    for (let i = 0; i < g.flowers; i++) {
      const a = (i / g.flowers) * Math.PI * 2;
      const flower = CreateSphere(
        'wedding-flower',
        { diameter: g.flowerM, segments: 3 },
        this.scene,
      );
      flower.position.set(
        Math.sin(a) * radius,
        g.heightM + 0.05 * Math.sin(i * 2.3),
        Math.cos(a) * radius,
      );
      parts.push(painted(flower, FLOWER_COLORS[i % FLOWER_COLORS.length]!));
    }
    // pentle visí z věnce na straně k páru (+z), rozevřené do vějíře
    for (let i = 0; i < g.ribbons; i++) {
      const a = ((i - (g.ribbons - 1) / 2) / g.ribbons) * Math.PI * 0.9;
      const ribbon = CreateBox(
        'wedding-ribbon',
        { width: g.ribbonWidthM, height: g.ribbonM, depth: 0.02 },
        this.scene,
      );
      ribbon.position.set(
        Math.sin(a) * (radius + 0.05),
        g.heightM - g.ribbonM / 2 - 0.05,
        Math.cos(a) * (radius + 0.05),
      );
      ribbon.rotation.y = a;
      ribbon.rotation.z = 0.08 * Math.sin(i * 1.7);
      parts.push(painted(ribbon, FLOWER_COLORS[(i + 1) % FLOWER_COLORS.length]!));
    }
    return this.merge('wedding-garland', parts);
  }

  private merge(name: string, parts: Mesh[]): Mesh {
    const merged = Mesh.MergeMeshes(parts, true, true) ?? parts[0]!;
    merged.name = name;
    merged.material = this.materialOf();
    merged.isPickable = false;
    merged.setEnabled(false);
    return merged;
  }
}

/** Síť obarvená jednou barvou ve vrcholech (spojí se s ostatními díly do jedné sítě). */
function painted(mesh: Mesh, color: readonly [number, number, number]): Mesh {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) colors.set([color[0], color[1], color[2], 1], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

/** Klidový oheň (nehoří). */
const IDLE = { fire: 0, stack: 0, glow: 0 };
const NORTH = { x: 0, z: 1 };

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h | 0;
}
