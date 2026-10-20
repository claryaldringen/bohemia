// Postavy ve vsi (docs/design/villagers.md): GLB z 0 A.D. s kostrou a animacemi
// (tools/blender/people_from_0ad.py), animace zapečené do textury matic kostí (Babylon baked
// vertex animation, VAT) a postavy jako thin instances – jeden mesh a jeden draw call na druh
// postavy (žena, muž), každá instance má vlastní klip, fázi a rychlost
// (bakedVertexAnimationSettingsInstanced), barvu oděvu a vlasů (villagerLook). Pod každou
// postavou měkký kruhový stín (thin instances, třetí draw call). Kdo kde je, plánuje
// villager-plan.ts z rozdělení práce dne, pohyb je čistá funkce času (villager-motion.ts).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { obstacleIndex, obstacleStatus, obstaclesNear, type ObstacleLayer } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { caravanPoints } from './caravan';
import type { FuneralPlan } from './funeral-plan';
import type { WeddingPlan } from './wedding-plan';
import {
  createVillagerPose,
  villagerSeconds,
  walkSpeed,
  walkThen,
  type HerdView,
  type VillagerKind,
} from './villager-motion';
import {
  planFunerals,
  planVillagers,
  planWeddings,
  type HairLook,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPaths,
} from './villager-plan';

const KINDS: readonly VillagerKind[] = ['woman', 'man'];
/** Snímků za sekundu zapečené animace (klíče animací 0 A.D.). */
const BAKE_FPS = 24;
/** Dál od kamery (m) se lidé nehýbou – jsou pár pixelů a pohyb by jen zbytečně kreslil. */
const ANIMATE_RANGE_M = 700;
/** Výška obalu postav nad terénem (m). */
const HEAD_ROOM_M = 2.6;
/**
 * Kruhový stín pod postavou: průměr (m při měřítku 1 – roste s měřítkem postavy i se
 * stylizovaným zvětšením FIGURE_SCALE), krytí uprostřed, výška nad terénem.
 */
const SHADOW_SIZE_M = 1.15;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.04;
/**
 * Po přeplánování dojde postava na nové místo pěšky, když je od starého dál než `from` a blíž
 * než `to` (m) – další čtverec pole, další strom; dál (jiná práce jinde ve vsi) se objeví hned.
 */
const WALK_OVER_M = { from: 2.5, to: 90 };
/**
 * Svatební věnec nevěsty (kinship.md – Svatba ve scéně): vlasy po buňkách textury – kolik buněk
 * na šířku textury (kvítek nebo lístek na buňku, GLSL i WGSL číslo s tečkou).
 */
const WREATH_CELLS = '90.0';
/** Kód vlasů pro shader (villagerLook.w). */
const HAIR_CODE: Record<HairLook, number> = { natural: 0, grey: 1, linen: 2, madder: 3, wreath: 4 };

export interface VillagersEnvironment {
  /** Vrstva překážek krajiny – stromy ke kácení. */
  layer: ObstacleLayer;
  /** Schůdná země (přes celou krajinu, počítaná líně – livestock-placement.ts), bez obydlí null. */
  ground(village: SceneVillage): { walkable(x: number, z: number): boolean } | null;
  /** Přesná výška vykresleného terénu. */
  groundHeight(x: number, z: number): number;
  /** Adresa modelů (…/woman.glb). */
  baseUrl: string;
  /** Stáda v okamžiku `nowMs` (pasáčci). */
  herds(nowMs: number): readonly HerdView[];
  /** Dočetly se modely a lidé se objevili – překreslit. */
  onLoaded(): void;
  /** Okno herního dne (skutečný čas) – karavany výprav (caravan.ts); bez hodin null. */
  dayWindow?(day: number): { startMs: number; endMs: number } | null;
  /**
   * Nové plány pohřbů (funeral-plan.ts – průvod, hranice, máry): kreslí je ves (hranice, máry)
   * a mohylu pohřbu do dohoření skryje. Volá se jen při změně.
   */
  onFunerals?(plans: readonly FuneralPlan[]): void;
  /**
   * Nové plány svateb (wedding-plan.ts – průvod, obřad u posvátného místa): oheň obřadu a věnec
   * s pentlemi na posvátném dubu kreslí ves. Volá se jen při změně.
   */
  onWeddings?(plans: readonly WeddingPlan[]): void;
}

/** Zapečený model: geometrie, textura matic kostí a rozsahy snímků klipů v ní. */
interface BakedModel {
  vertexData: VertexData;
  matricesIndices: Float32Array;
  matricesWeights: Float32Array;
  boneCount: number;
  vat: Float32Array;
  frames: number;
  clips: Map<string, { start: number; end: number }>;
  texture: BaseTexture | null;
  /** Maska látky (R) a vlasů (G) ve stejném atlasu (glTF occlusionTexture). */
  mask: BaseTexture | null;
}

interface Kind {
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  model: BakedModel;
  matrices: Float32Array;
  settings: Float32Array;
  looks: Float32Array;
}

/**
 * Lidé ve vsi: `update` je rozmístí podle vsi (modely se stáhnou s prvním člověkem), `animate`
 * je posune v čase – jen v záběru, jako zvířata.
 */
export class VillageVillagers {
  private village: SceneVillage | null = null;
  private key = '';
  private herdCount = 0;
  /** Obdélník zemských stezek s karavanami (caravan.ts) – patří do obalu postav. */
  private extent: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private people: PlannedVillager[] = [];
  /** Pohřby (cemetery.md – Pohřeb ve scéně) – průvod a kruh kolem hranice. */
  private funerals: FuneralPlan[] = [];
  private funeralsKey = '';
  /** Svatby (kinship.md – Svatba ve scéně) – průvod, pár a podkova svatebčanů. */
  private weddings: WeddingPlan[] = [];
  private weddingsKey = '';
  private readonly kinds = new Map<VillagerKind, Kind>();
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private models: Map<VillagerKind, BakedModel> | null = null;
  private loading: Promise<void> | null = null;
  private readonly pose = createVillagerPose();
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private readonly matrix = new Matrix();
  /** Vyšlapané pěšiny – nosiči a pochůzky pro vodu a dřevo vedou po nich (paths.md). */
  private paths: VillagerPaths | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: VillagersEnvironment,
  ) {}

  /**
   * Lidé podle vsi – plán se přepočítá, jen když se změnilo, co ho určuje (práce dne, obydlí,
   * pole, sady, hřbitovy, překážky). Vrátí true, když je co překreslit.
   */
  update(village: SceneVillage, nowMs: number): boolean {
    if (this.disposed) return false;
    this.village = village;
    const key = villageKey(village);
    if (key === this.key) return false;
    this.key = key;
    if (village.labor && village.labor.shares.length > 0) void this.load();
    return this.rebuild(nowMs);
  }

  /**
   * Jiné hodiny světa (nebo vlastní okno dne ukázky) – karavany a pohřby jdou podle okna herního
   * dne, lidé se rozmístí znovu. Vrátí true, když je co překreslit.
   */
  clockChanged(nowMs: number): boolean {
    if (this.disposed || !this.village) return false;
    this.key = '';
    return this.update(this.village, nowMs);
  }

  /**
   * Nové pěšiny (path-renderer.ts) – lidé se rozmístí znovu, ať chodí po nich. Vrátí true, když je
   * co překreslit.
   */
  setPaths(paths: VillagerPaths | null, nowMs: number): boolean {
    if (this.disposed || paths === this.paths) return false;
    this.paths = paths;
    return this.village ? this.rebuild(nowMs) : false;
  }

  /** Posune lidi na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.kinds.size === 0 || !this.village) return false;
    const herds = this.env.herds(nowMs);
    // stáda se objeví až s modely zvířat – pasáčci se pak rozmístí znovu
    if (herds.length !== this.herdCount) {
      this.rebuild(nowMs);
      return true;
    }
    if (this.people.length === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(villagerSeconds(nowMs), herds);
    return true;
  }

  /** Počet postav (pro měření a testy). */
  get count(): number {
    return this.people.length;
  }

  dispose(): void {
    this.disposed = true;
    for (const kind of this.kinds.values()) {
      kind.mesh.material?.dispose();
      kind.manager.texture?.dispose();
      kind.mesh.dispose();
    }
    this.kinds.clear();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.shadow = null;
  }

  /** Zapíše pózy všech postav v čase `t` (s) do instancí a přepočítá obal. */
  private write(t: number, herds: readonly HerdView[]): void {
    const slots = new Map<VillagerKind, number>();
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    const height = this.env.groundHeight;
    this.people.forEach((person, index) => {
      const kind = this.kinds.get(person.kind);
      if (!kind) return;
      const slot = slots.get(person.kind) ?? 0;
      slots.set(person.kind, slot + 1);
      this.pose.hidden = false;
      const pose = person.pose(t, herds, this.pose);
      const y = height(pose.x, pose.z);
      // karavana výpravy za krajem mapy (caravan.ts) – nulové měřítko, postava ani stín se nekreslí
      const scale = pose.hidden ? 0 : person.scale;
      writeFigure(kind.matrices, slot, pose.x, y, pose.z, pose.headingX, pose.headingZ, scale);
      const clip = kind.model.clips.get(pose.clip) ?? kind.model.clips.get('idle')!;
      const length = clip.end - clip.start + 1;
      const o = slot * 4;
      kind.settings[o] = clip.start;
      kind.settings[o + 1] = clip.end;
      kind.settings[o + 2] = person.phase * length;
      kind.settings[o + 3] = BAKE_FPS * pose.pace;
      if (this.shadow) this.writeShadow(index, pose.x, y, pose.z, scale);
      if (pose.hidden) return;
      minX = Math.min(minX, pose.x);
      maxX = Math.max(maxX, pose.x);
      minZ = Math.min(minZ, pose.z);
      maxZ = Math.max(maxZ, pose.z);
      low = Math.min(low, y);
      high = Math.max(high, y);
    });
    const time = (t % 3600) + 3600;
    for (const kind of this.kinds.values()) {
      if (!kind.mesh.isEnabled()) continue;
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = time;
    }
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
    // karavany výprav jdou po celé zemské stezce (caravan.ts) – obal zahrne celé stezky, ať se
    // postavy hýbou, kdykoli je kterákoli část stezky v záběru
    const extent = this.extent;
    if (extent) {
      minX = Math.min(minX, extent.minX);
      maxX = Math.max(maxX, extent.maxX);
      minZ = Math.min(minZ, extent.minZ);
      maxZ = Math.max(maxZ, extent.maxZ);
      if (low > high) {
        low = height(extent.minX, extent.minZ);
        high = low;
      }
    }
    if (minX <= maxX) {
      this.bounds.reConstruct(
        new Vector3(minX - 2, low - 1, minZ - 2),
        new Vector3(maxX + 2, high + HEAD_ROOM_M, maxZ + 2),
      );
    }
  }

  /** Stín položený na terén (nakloněný podle svahu pod postavou). */
  private writeShadow(index: number, x: number, y: number, z: number, scale: number): void {
    const shadow = this.shadow!;
    const height = this.env.groundHeight;
    const e = 0.4;
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    const size = SHADOW_SIZE_M * scale;
    // osy: x podél svahu ve směru x, z ve směru z, y = normála (kolmo k oběma)
    const ax = TMP_A.set(1, gx, 0).normalize();
    const az = TMP_B.set(0, gz, 1).normalize();
    const ay = Vector3.CrossToRef(az, ax, TMP_C).normalize();
    Matrix.FromValuesToRef(
      ax.x * size,
      ax.y * size,
      ax.z * size,
      0,
      ay.x,
      ay.y,
      ay.z,
      0,
      az.x * size,
      az.y * size,
      az.z * size,
      0,
      x,
      y + SHADOW_LIFT_M,
      z,
      1,
      this.matrix,
    );
    this.matrix.copyToArray(shadow.matrices, index * 16);
  }

  /** Nový plán podle poslední vsi (po změně vsi, po načtení modelů, po objevení stád). */
  private rebuild(nowMs: number): boolean {
    const had = this.people.length > 0;
    const village = this.village;
    const herds = this.env.herds(nowMs);
    this.herdCount = herds.length;
    const ground =
      village &&
      (this.models || (village.funerals?.length ?? 0) > 0 || (village.weddings?.length ?? 0) > 0)
        ? this.groundFor(village)
        : null;
    // pohřby i bez modelů postav – hranici a máry kreslí ves, mohylu do dohoření skryje
    this.setFunerals(
      village && ground
        ? planFunerals(village, ground, {
            seed: villageSeed(village),
            paths: this.paths,
            dayWindow: (day) => this.env.dayWindow?.(day) ?? null,
          })
        : [],
    );
    // svatby i bez modelů postav – oheň obřadu a věnec na dubu kreslí ves
    this.setWeddings(
      village && ground
        ? planWeddings(village, ground, {
            seed: villageSeed(village),
            paths: this.paths,
            dayWindow: (day) => this.env.dayWindow?.(day) ?? null,
          })
        : [],
    );
    if (!village || !this.models || !ground) {
      this.people = [];
      for (const kind of this.kinds.values()) kind.mesh.setEnabled(false);
      this.shadow?.mesh.setEnabled(false);
      return had;
    }
    // kdo už ve vsi je, na nové místo práce dojde (rozpracovaný čtverec je hotový – další)
    const t = villagerSeconds(nowMs);
    const probe = createVillagerPose();
    const before = new Map(
      this.people.map((p) => {
        probe.hidden = false;
        const pose = p.pose(t, herds, probe);
        return [p.key, { x: pose.x, z: pose.z }] as const;
      }),
    );
    this.people = planVillagers(village, ground, {
      seed: villageSeed(village),
      // pasák jen u stád na pastvě – ta jsou v plánu napřed (livestock-placement.ts)
      herds: herds.filter((h) => h.tended !== false).length,
      paths: this.paths,
      dayWindow: (day) => this.env.dayWindow?.(day) ?? null,
      funerals: this.funerals,
      weddings: this.weddings,
    })
      .filter((p) => this.models?.has(p.kind))
      .map((p) => {
        const from = before.get(p.key);
        if (!from) return p;
        probe.hidden = false;
        const to = p.pose(t, herds, probe);
        // karavana (caravan.ts) jde podle výpravy a pohřeb podle obřadu – nepřecházejí pěšky
        if (
          p.key.startsWith('caravan:') ||
          p.key.startsWith('funeral:') ||
          p.key.startsWith('wedding:')
        ) {
          return p;
        }
        const distance = Math.hypot(to.x - from.x, to.z - from.z);
        if (distance < WALK_OVER_M.from || distance > WALK_OVER_M.to) return p;
        return {
          ...p,
          pose: walkThen(from.x, from.z, p.pose, t, walkSpeed(p.kind, 'walk', p.scale)),
        };
      });
    this.extent = unionExtent(
      caravanExtent(village),
      ...this.funerals.map((f) => f.extent),
      ...this.weddings.map((w) => w.extent),
    );
    for (const name of KINDS) {
      const people = this.people.filter((p) => p.kind === name);
      const model = this.models.get(name);
      let kind = this.kinds.get(name);
      if (people.length === 0 || !model) {
        kind?.mesh.setEnabled(false);
        continue;
      }
      kind ??= this.createKind(name, model);
      this.kinds.set(name, kind);
      kind.matrices = new Float32Array(people.length * 16);
      kind.settings = new Float32Array(people.length * 4);
      kind.looks = new Float32Array(people.length * 4);
      people.forEach((p, i) => {
        kind.looks.set([...p.look.cloth, HAIR_CODE[p.look.hair]], i * 4);
      });
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer(
        'bakedVertexAnimationSettingsInstanced',
        kind.settings,
        4,
        false,
      );
      kind.mesh.thinInstanceSetBuffer('villagerLook', kind.looks, 4, true);
      kind.mesh.setEnabled(true);
    }
    const shadow = (this.shadow ??= this.createShadow());
    shadow.matrices = new Float32Array(Math.max(1, this.people.length) * 16);
    shadow.mesh.thinInstanceSetBuffer('matrix', shadow.matrices, 16, false);
    shadow.mesh.thinInstanceCount = this.people.length;
    shadow.mesh.setEnabled(this.people.length > 0);
    this.write(villagerSeconds(nowMs), herds);
    return had || this.people.length > 0;
  }

  /** Nové plány pohřbů – ohlásí je scéně (`onFunerals`), jen když se změnily. */
  private setFunerals(plans: FuneralPlan[]): void {
    this.funerals = plans;
    const key = plans
      .map(
        (p) =>
          `${p.key}:${p.timeline.startMs}:${p.path.length.toFixed(2)}:${p.members.length}:` +
          `${p.pyre.x},${p.pyre.z}`,
      )
      .join('|');
    if (key === this.funeralsKey) return;
    this.funeralsKey = key;
    this.env.onFunerals?.(plans);
  }

  /** Nové plány svateb – ohlásí je scéně (`onWeddings`), jen když se změnily. */
  private setWeddings(plans: WeddingPlan[]): void {
    this.weddings = plans;
    const key = plans
      .map(
        (p) =>
          `${p.key}:${p.timeline.startMs}:${p.site.kind}:${p.site.couple.x},${p.site.couple.z}:` +
          `${p.members.length}`,
      )
      .join('|');
    if (key === this.weddingsKey) return;
    this.weddingsKey = key;
    this.env.onWeddings?.(plans);
  }

  /** Terén pro plán: schůdná země z rastru zvířat, stromy z vrstvy překážek. */
  private groundFor(village: SceneVillage): VillagerGround | null {
    const grid = this.env.ground(village);
    if (!grid) return null;
    const layer = this.env.layer;
    const status = obstacleStatus(village.obstacles);
    return {
      walkable: (x, z) => grid.walkable(x, z),
      tree: (id) => {
        const i = obstacleIndex(layer, id);
        return i >= 0 ? { x: layer.x[i]!, z: layer.z[i]! } : null;
      },
      treesIn: (x, z, half, max) => {
        const found: { x: number; z: number }[] = [];
        for (const i of obstaclesNear(layer, x - half, z - half, x + half, z + half)) {
          if (found.length >= max) break;
          const tx = layer.x[i]!;
          const tz = layer.z[i]!;
          if (Math.abs(tx - x) > half || Math.abs(tz - z) > half) continue;
          if (status.kindOf(layer, i) === 'tree') found.push({ x: tx, z: tz });
        }
        return found;
      },
    };
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const results = await Promise.allSettled(
        KINDS.map((name) => loadBakedModel(this.scene, `${this.env.baseUrl}${name}.glb`)),
      );
      const models = new Map<VillagerKind, BakedModel>();
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) models.set(KINDS[i]!, result.value);
        else if (result.status === 'rejected') {
          console.warn(`Model postavy ${KINDS[i]} se nepodařilo načíst.`, result.reason);
        }
      });
      if (this.disposed) return;
      this.models = models;
      if (this.rebuild(Date.now())) this.env.onLoaded();
    })();
    return this.loading;
  }

  private createKind(name: VillagerKind, model: BakedModel): Kind {
    // Jméno mimo předpony vrhačů stínů – stínová mapa je statická (lidé mají vlastní stín).
    const mesh = new Mesh(`villagers-${name}`, this.scene);
    model.vertexData.applyToMesh(mesh);
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, model.matricesIndices, false, 4);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, model.matricesWeights, false, 4);
    // Kostra jen kvůli definicím shaderu (skinning) – matice kostí čte shader z VAT textury.
    const skeleton = new Skeleton(`villagers-${name}-skeleton`, `villagers-${name}`, this.scene);
    for (let i = 0; i < model.boneCount; i++) new Bone(`b${i}`, skeleton);
    mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = 4;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;

    const vat = RawTexture.CreateRGBATexture(
      model.vat,
      (model.boneCount + 1) * 4,
      model.frames,
      this.scene,
      false,
      false,
      Texture.NEAREST_NEAREST,
      Constants.TEXTURETYPE_FLOAT,
    );
    vat.name = `villagers-${name}-vat`;
    const manager = new BakedVertexAnimationManager(this.scene);
    manager.texture = vat;
    mesh.bakedVertexAnimationManager = manager;

    const material = new StandardMaterial(`villagers-${name}-material`, this.scene);
    // Bez mipmap jako u zvířat: ostrůvky atlasu na tmavém pozadí by z dálky ztmavly.
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
      model,
      matrices: new Float32Array(0),
      settings: new Float32Array(0),
      looks: new Float32Array(0),
    };
  }

  /** Měkký kruhový stín – čtverec s průhledným kruhem, jedna instance na postavu. */
  private createShadow(): { mesh: Mesh; matrices: Float32Array } {
    const mesh = new Mesh('villagers-shadow', this.scene);
    const data = new VertexData();
    data.positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
    data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.indices = [0, 2, 1, 0, 3, 2];
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    // po obtiscích vsi a polí (alphaIndex 1–2), před náhledem umisťování (10+)
    mesh.alphaIndex = 5;
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const r = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
        const a = Math.max(0, 1 - r);
        pixels[(j * size + i) * 4 + 3] = Math.round(255 * SHADOW_OPACITY * a * a * (3 - 2 * a));
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      size,
      size,
      this.scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.name = 'villagers-shadow';
    const material = new StandardMaterial('villagers-shadow-material', this.scene);
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
}

const TMP_A = new Vector3();
const TMP_B = new Vector3();
const TMP_C = new Vector3();

/** Instance: postava na (x, y, z) natočená ve směru (hx, hz), zvětšená `scale`. */
function writeFigure(
  m: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  hx: number,
  hz: number,
  scale: number,
): void {
  const o = index * 16;
  // osa X = vpravo (nahoru × dopředu), Y = nahoru, Z = dopředu (model míří na +Z)
  m[o] = hz * scale;
  m[o + 1] = 0;
  m[o + 2] = -hx * scale;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = scale;
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
}

/**
 * Co z vsi rozhoduje o lidech: rozdělení práce dne, obydlí (i průběh staveniště – kopání
 * jámy), stadia polí, výsadba sadů, hřbitovy a odstraněné stromy.
 */
function villageKey(village: SceneVillage): string {
  const dwellings = village.dwellings.map(
    (d) =>
      `${d.id}:${d.type}:${d.built ? 1 : 0}:${d.inhabited === false ? 0 : 1}:${d.progress < 0.25 ? 0 : 1}:` +
      `${d.position.x.toFixed(2)},${d.position.z.toFixed(2)},${d.position.rotation.toFixed(3)}`,
  );
  const fields = village.fields.map(
    (f) =>
      `${f.id}:${f.parts
        .map(
          (p) =>
            `${p.x.toFixed(1)},${p.z.toFixed(1)},${p.stage},${p.look ?? ''},${p.work ?? ''},${p.before ?? ''}`,
        )
        .join(';')}`,
  );
  const orchards = (village.orchards ?? []).map(
    (o) =>
      `${o.id}:${o.squares.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)},${s.planting >= 1 ? 1 : 0}`).join(';')}`,
  );
  const cemeteries = (village.cemeteries ?? []).map(
    (c) =>
      `${c.id}:${c.squares.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)},${s.pending ? 1 : 0}`).join(';')}`,
  );
  const obstacles = village.obstacles
    ? `${village.obstacles.removed.length},${village.obstacles.stumps.length}`
    : '';
  return JSON.stringify([
    village.labor ?? null,
    village.expeditions ?? null,
    village.funerals ?? null,
    village.weddings ?? null,
    (village.trails ?? []).map((t) => [t.id, t.points.length]),
    dwellings,
    fields,
    orchards,
    cemeteries,
    obstacles,
  ]);
}

/**
 * Obdélník cest, po kterých jdou karavany výprav a nákupů (zemské stezky, čáry krajinou ke kraji
 * mapy – caravan.ts); bez výprav null.
 */
function caravanExtent(
  village: SceneVillage,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const points = (village.expeditions ?? []).flatMap((e) => caravanPoints(e, village.trails));
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}

type Extent = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Obdélník přes všechny dané (karavany, pohřby); bez žádného null. */
function unionExtent(...extents: (Extent | null)[]): Extent | null {
  let out: Extent | null = null;
  for (const e of extents) {
    if (!e) continue;
    out = out
      ? {
          minX: Math.min(out.minX, e.minX),
          maxX: Math.max(out.maxX, e.maxX),
          minZ: Math.min(out.minZ, e.minZ),
          maxZ: Math.max(out.maxZ, e.maxZ),
        }
      : { ...e };
  }
  return out;
}

/** Náhoda postav podle vsi – první obydlí (stejná ves = stejní lidé). */
function villageSeed(village: SceneVillage): number {
  const first = village.dwellings[0]?.position;
  return first ? (Math.round(first.x * 13) * 31 + Math.round(first.z * 7)) | 0 : 1;
}

/**
 * Načte GLB postavy a zapeče všechny její animace do pole matic kostí (VAT): pro každý klip
 * snímky po 1/24 s včetně posledního (= prvního, smyčka navazuje). Matice i vrcholy se převedou
 * do souřadnic scény (převod os glTF – zrcadlení – se zapeče, mesh pak nemá rodiče).
 */
export async function loadBakedModel(scene: Scene, url: string): Promise<BakedModel | null> {
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) return null;
  container.addAllToScene();
  for (const group of container.animationGroups) group.stop();
  const source = container.meshes.find(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0 && !!mesh.skeleton,
  );
  const skeleton = source?.skeleton;
  if (!source || !skeleton) {
    container.dispose();
    throw new Error(`${url}: model bez kostry`);
  }
  const world = source.computeWorldMatrix(true).clone();
  const inverse = world.clone().invert();

  // Klidová póza uzlů – před každým klipem se vrátí (klip nemusí mít kanál pro každý uzel).
  const nodes = new Set<TransformNode>();
  for (const group of container.animationGroups) {
    for (const t of group.targetedAnimations) nodes.add(t.target as TransformNode);
  }
  const rest = [...nodes].map((node) => ({
    node,
    position: node.position.clone(),
    rotation: node.rotationQuaternion?.clone() ?? null,
    scaling: node.scaling.clone(),
  }));

  const boneCount = skeleton.bones.length;
  const floatsPerFrame = (boneCount + 1) * 16;
  const chunks: Float32Array[] = [];
  const clips = new Map<string, { start: number; end: number }>();
  let frame = 0;
  const m = new Matrix();
  const tmp = new Matrix();
  for (const group of container.animationGroups) {
    for (const r of rest) {
      r.node.position.copyFrom(r.position);
      if (r.rotation) (r.node.rotationQuaternion ??= new Quaternion()).copyFrom(r.rotation);
      r.node.scaling.copyFrom(r.scaling);
    }
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const durationS = (group.to - group.from) / fps;
    const count = Math.max(1, Math.round(durationS * BAKE_FPS)) + 1;
    const data = new Float32Array(floatsPerFrame * count);
    for (let k = 0; k < count; k++) {
      const at = group.from + Math.min(durationS, k / BAKE_FPS) * fps;
      for (const { animation, target } of group.targetedAnimations) {
        const value: unknown = animation.evaluate(at);
        const property = animation.targetProperty as 'position' | 'rotationQuaternion' | 'scaling';
        const node = target as TransformNode;
        if (property === 'rotationQuaternion') {
          (node.rotationQuaternion ??= new Quaternion()).copyFrom(value as Quaternion);
        } else {
          node[property].copyFrom(value as Vector3);
        }
      }
      skeleton.prepare(true);
      const matrices = skeleton.getTransformMatrices(source);
      for (let b = 0; b <= boneCount; b++) {
        Matrix.FromArrayToRef(matrices, b * 16, m);
        // matice v souřadnicích meshe -> ve scéně: W⁻¹ · M · W (řádkové vektory Babylonu)
        inverse.multiplyToRef(m, tmp);
        tmp.multiplyToRef(world, m);
        m.copyToArray(data, k * floatsPerFrame + b * 16);
      }
    }
    clips.set(group.name, { start: frame, end: frame + count - 1 });
    chunks.push(data);
    frame += count;
  }
  const vat = new Float32Array(floatsPerFrame * frame);
  let offset = 0;
  for (const chunk of chunks) {
    vat.set(chunk, offset);
    offset += chunk.length;
  }

  const positions = source.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = source.getVerticesData(VertexBuffer.NormalKind);
  const uvs = source.getVerticesData(VertexBuffer.UVKind);
  const outPositions = new Float32Array(positions.length);
  const outNormals = normals ? new Float32Array(normals.length) : null;
  const p = new Vector3();
  for (let i = 0; i < positions.length / 3; i++) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i * 3]!,
      positions[i * 3 + 1]!,
      positions[i * 3 + 2]!,
      world,
      p,
    );
    outPositions.set([p.x, p.y, p.z], i * 3);
    if (normals && outNormals) {
      Vector3.TransformNormalFromFloatsToRef(
        normals[i * 3]!,
        normals[i * 3 + 1]!,
        normals[i * 3 + 2]!,
        world,
        p,
      );
      p.normalize();
      outNormals.set([p.x, p.y, p.z], i * 3);
    }
  }
  const vertexData = new VertexData();
  vertexData.positions = outPositions;
  vertexData.indices = Array.from(source.getIndices() ?? []);
  if (outNormals) vertexData.normals = outNormals;
  if (uvs) vertexData.uvs = uvs;
  const matricesIndices = Float32Array.from(
    source.getVerticesData(VertexBuffer.MatricesIndicesKind)!,
  );
  const matricesWeights = Float32Array.from(
    source.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
  );
  const material = source.material;
  const texture = material instanceof PBRMaterial ? material.albedoTexture : null;
  const mask = material instanceof PBRMaterial ? material.ambientTexture : null;

  for (const group of container.animationGroups) group.dispose();
  for (const mesh of container.meshes) mesh.dispose(false, false);
  for (const node of container.transformNodes) node.dispose(false, false);
  for (const s of container.skeletons) s.dispose();
  for (const used of container.materials) used.dispose(false, false);
  return {
    vertexData,
    matricesIndices,
    matricesWeights,
    boneCount,
    vat,
    frames: frame,
    clips,
    texture,
    mask,
  };
}

/**
 * Materiál postav (GLSL i WGSL): lineárně čtenou texturu z GLB převede zpět do barev obrazovky
 * (jako u dobytka), oděv obarví barvou instance podle masky látky (villagerMask.r) a vlasy podle
 * kódu (villagerLook.w: 1 šediny, 2 lněný šátek, 3 šátek barvený mořenou, 4 svatební věnec
 * z kvítků) podle masky vlasů (villagerMask.g) – stínování textury zůstane. Maska je textura, ne
 * atribut vrcholů: WebGPU dovoluje nejvýš 8 vertex bufferů a postava (kostra, VAT, barva
 * instance) jich má právě 8.
 */
export class VillagerPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly linearTexture: boolean,
    private readonly mask: BaseTexture | null,
  ) {
    super(material, 'Villagers', 200, {
      VILLAGERS: false,
      VILLAGERS_GAMMA: false,
      VILLAGERS_MASK: false,
    });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['VILLAGERS'] = true;
    defines['VILLAGERS_GAMMA'] = this.linearTexture;
    defines['VILLAGERS_MASK'] = this.mask !== null;
  }

  override getClassName(): string {
    return 'VillagerPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push('villagerLook');
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('villagerMask');
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    if (this.mask) uniformBuffer.setTexture('villagerMask', this.mask);
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    if (this.mask) activeTextures.push(this.mask);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: `attribute villagerLook: vec4f;
varying vVillagerLook: vec4f;`,
            CUSTOM_VERTEX_MAIN_END: `vertexOutputs.vVillagerLook = vertexInputs.villagerLook;`,
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: `attribute vec4 villagerLook;
varying vec4 vVillagerLook;`,
            CUSTOM_VERTEX_MAIN_END: `vVillagerLook = villagerLook;`,
          };
    }
    if (shaderType !== 'fragment') return null;
    return wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vVillagerLook: vec4f;
#ifdef VILLAGERS_MASK
var villagerMaskSampler: sampler;
var villagerMask: texture_2d<f32>;
#endif`,
          CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef VILLAGERS_GAMMA
baseColor = vec4f(pow(baseColor.rgb, vec3f(1.0 / 2.2)), baseColor.a);
#endif
#if defined(VILLAGERS_MASK) && defined(DIFFUSE)
{
  let villagerPart = textureSample(villagerMask, villagerMaskSampler, fragmentInputs.vDiffuseUV).rg;
  let villagerLook = fragmentInputs.vVillagerLook;
  var villagerRgb = baseColor.rgb * mix(vec3f(1.0), villagerLook.rgb, villagerPart.x);
  var villagerHair = vec3f(0.6, 0.3, 0.22);
  if (villagerLook.w < 1.5) {
    villagerHair = vec3f(0.6, 0.58, 0.55);
  } else if (villagerLook.w < 2.5) {
    villagerHair = vec3f(0.86, 0.82, 0.72);
  } else if (villagerLook.w > 3.5) {
    // svatební věnec – kvítky a listí po buňkách textury
    let villagerCell = floor(fragmentInputs.vDiffuseUV * ${WREATH_CELLS});
    let villagerPick = fract(sin(dot(villagerCell, vec2f(12.9898, 78.233))) * 43758.5453);
    villagerHair = vec3f(0.36, 0.56, 0.22);
    if (villagerPick > 0.84) {
      villagerHair = vec3f(0.98, 0.82, 0.25);
    } else if (villagerPick > 0.68) {
      villagerHair = vec3f(0.36, 0.5, 0.95);
    } else if (villagerPick > 0.5) {
      villagerHair = vec3f(0.92, 0.2, 0.12);
    } else if (villagerPick > 0.3) {
      villagerHair = vec3f(0.98, 0.96, 0.86);
    }
  }
  let villagerLuma = dot(villagerRgb, vec3f(0.299, 0.587, 0.114));
  let villagerHairMix = villagerPart.y * step(0.5, villagerLook.w);
  villagerRgb = mix(villagerRgb, villagerHair * clamp(villagerLuma / 0.27, 0.55, 1.35), villagerHairMix);
  baseColor = vec4f(villagerRgb, baseColor.a);
}
#endif`,
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vec4 vVillagerLook;
#ifdef VILLAGERS_MASK
uniform sampler2D villagerMask;
#endif`,
          CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef VILLAGERS_GAMMA
baseColor.rgb = pow(baseColor.rgb, vec3(1.0 / 2.2));
#endif
#if defined(VILLAGERS_MASK) && defined(DIFFUSE)
{
  vec2 villagerPart = texture2D(villagerMask, vDiffuseUV).rg;
  baseColor.rgb *= mix(vec3(1.0), vVillagerLook.rgb, villagerPart.x);
  vec3 villagerHair = vVillagerLook.w < 1.5 ? vec3(0.6, 0.58, 0.55) : vVillagerLook.w < 2.5 ? vec3(0.86, 0.82, 0.72) : vec3(0.6, 0.3, 0.22);
  if (vVillagerLook.w > 3.5) {
    // svatební věnec – kvítky a listí po buňkách textury
    float villagerPick = fract(sin(dot(floor(vDiffuseUV * ${WREATH_CELLS}), vec2(12.9898, 78.233))) * 43758.5453);
    villagerHair = villagerPick > 0.84 ? vec3(0.98, 0.82, 0.25) : villagerPick > 0.68 ? vec3(0.36, 0.5, 0.95) : villagerPick > 0.5 ? vec3(0.92, 0.2, 0.12) : villagerPick > 0.3 ? vec3(0.98, 0.96, 0.86) : vec3(0.36, 0.56, 0.22);
  }
  float villagerLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
  float villagerHairMix = villagerPart.y * step(0.5, vVillagerLook.w);
  baseColor.rgb = mix(baseColor.rgb, villagerHair * clamp(villagerLuma / 0.27, 0.55, 1.35), villagerHairMix);
}
#endif`,
        };
  }
}
