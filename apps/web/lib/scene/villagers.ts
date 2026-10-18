// SPIKE – animovaní lidé ve vsi: GLB z 0 A.D. s kostrou a animacemi (people_from_0ad.py),
// animace zapečené do textury matic kostí (Babylon baked vertex animation, VAT) a postavy
// jako thin instances – jeden mesh a jeden draw call na druh postavy (žena, muž), každá
// instance má vlastní klip, fázi a rychlost (bakedVertexAnimationSettingsInstanced).
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
import type { SceneVillage } from '../village-view';
import {
  WALK_SPEED,
  createVillagerPose,
  planVillagers,
  type HerdView,
  type PlannedVillager,
  type VillagerClip,
  type VillagerKind,
} from './villager-plan';

const KINDS: readonly VillagerKind[] = ['woman', 'man'];
/** Snímků za sekundu zapečené animace (klíče animací 0 A.D.). */
const BAKE_FPS = 24;
/** Dál od kamery (m) se lidé nehýbou. */
const ANIMATE_RANGE_M = 700;

export interface VillagersEnvironment {
  groundHeight(x: number, z: number): number;
  baseUrl: string;
  /** Stádo ovcí (pro pasáčka) v okamžiku `nowMs`, nebo null. */
  herd(nowMs: number): HerdView | null;
  onLoaded(): void;
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
}

interface Kind {
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  model: BakedModel;
  matrices: Float32Array;
  settings: Float32Array;
  colors: Float32Array;
  slots: number;
}

/**
 * Lidé ve vsi (spike): `setEnabled(true)` stáhne modely a zapeče animace, `update` rozmístí lidi
 * podle vsi, `animate` je posune v čase (jen v záběru, jako zvířata).
 */
export class VillageVillagers {
  private enabled = false;
  private village: SceneVillage | null = null;
  private key = '';
  private people: PlannedVillager[] = [];
  private readonly kinds = new Map<VillagerKind, Kind>();
  private models: Map<VillagerKind, BakedModel> | null = null;
  private loading: Promise<void> | null = null;
  private readonly pose = createVillagerPose();
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private disposed = false;
  /** Čas animace (s) – při omezeném pohybu stojí. */
  private readonly startMs = Date.now();

  constructor(
    private readonly scene: Scene,
    private readonly env: VillagersEnvironment,
  ) {}

  setEnabled(enabled: boolean, nowMs: number): boolean {
    if (this.disposed || enabled === this.enabled) return false;
    this.enabled = enabled;
    if (enabled) void this.load();
    return this.rebuild(nowMs);
  }

  update(village: SceneVillage, nowMs: number): boolean {
    if (this.disposed) return false;
    this.village = village;
    const key = villageKey(village);
    if (key === this.key) return false;
    this.key = key;
    return this.rebuild(nowMs);
  }

  /** Posune lidi na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.people.length === 0 || this.kinds.size === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    const tS = (nowMs - this.startMs) / 1000;
    const herd = this.env.herd(nowMs);
    const counts = new Map<VillagerKind, number>();
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    for (const person of this.people) {
      const kind = this.kinds.get(person.kind);
      if (!kind) continue;
      const slot = counts.get(person.kind) ?? 0;
      counts.set(person.kind, slot + 1);
      const pose = person.pose(tS, herd, this.pose);
      const y = this.env.groundHeight(pose.x, pose.z);
      writeMatrix(
        kind.matrices,
        slot,
        pose.x,
        y,
        pose.z,
        pose.headingX,
        pose.headingZ,
        person.scale,
      );
      const clip = kind.model.clips.get(pose.clip) ?? kind.model.clips.get('idle')!;
      const length = clip.end - clip.start + 1;
      const o = slot * 4;
      kind.settings[o] = clip.start;
      kind.settings[o + 1] = clip.end;
      kind.settings[o + 2] = person.phase * length;
      kind.settings[o + 3] = BAKE_FPS * clipSpeed(person, pose.clip);
      minX = Math.min(minX, pose.x);
      maxX = Math.max(maxX, pose.x);
      minZ = Math.min(minZ, pose.z);
      maxZ = Math.max(maxZ, pose.z);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    for (const kind of this.kinds.values()) {
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = (((nowMs - this.startMs) / 1000) % 3600) + 3600;
    }
    if (minX <= maxX) {
      this.bounds.reConstruct(
        new Vector3(minX - 2, low - 1, minZ - 2),
        new Vector3(maxX + 2, high + 2.5, maxZ + 2),
      );
    }
    return true;
  }

  /** Počet postav (pro měření). */
  get count(): number {
    return this.enabled ? this.people.length : 0;
  }

  dispose(): void {
    this.disposed = true;
    for (const kind of this.kinds.values()) {
      kind.mesh.material?.dispose();
      kind.manager.texture?.dispose();
      kind.mesh.dispose();
    }
    this.kinds.clear();
  }

  private rebuild(nowMs: number): boolean {
    const had = this.people.length > 0;
    if (!this.enabled || !this.village || !this.models) {
      this.people = [];
      for (const kind of this.kinds.values()) kind.mesh.setEnabled(false);
      return had;
    }
    this.people = planVillagers(this.village, villageSeed(this.village));
    for (const name of KINDS) {
      const count = this.people.filter((p) => p.kind === name).length;
      const model = this.models.get(name);
      let kind = this.kinds.get(name);
      if (count === 0 || !model) {
        kind?.mesh.setEnabled(false);
        continue;
      }
      kind ??= this.createKind(name, model);
      this.kinds.set(name, kind);
      kind.matrices = new Float32Array(count * 16);
      kind.settings = new Float32Array(count * 4);
      kind.colors = new Float32Array(count * 4);
      // Mírně jiná barva oděvu každé postavy (nebarvená vlna a len nejsou všude stejné).
      const people = this.people.filter((p) => p.kind === name);
      people.forEach((p, i) => {
        const shade = 0.88 + p.phase * 0.24;
        kind.colors.set([shade, shade * (0.97 + p.phase * 0.05), shade * 0.95, 1], i * 4);
      });
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer(
        'bakedVertexAnimationSettingsInstanced',
        kind.settings,
        4,
        false,
      );
      kind.mesh.thinInstanceSetBuffer('color', kind.colors, 4, true);
      kind.mesh.setEnabled(true);
    }
    this.animate(nowMs, null);
    return true;
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
    // Jméno mimo předpony vrhačů stínů – stínová mapa je statická.
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
    model.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    material.diffuseTexture = model.texture;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    new GammaPlugin(material, model.texture?.gammaSpace === false);
    mesh.material = material;
    return {
      mesh,
      manager,
      model,
      matrices: new Float32Array(0),
      settings: new Float32Array(0),
      colors: new Float32Array(0),
      slots: 0,
    };
  }
}

/** Rychlost přehrávání klipu – chůze podle rychlosti postavy, ostatní 1. */
function clipSpeed(person: PlannedVillager, clip: VillagerClip): number {
  const nominal = WALK_SPEED[person.kind][clip];
  // Zmenšená postava (pasáček) dělá kratší kroky – stejnou rychlostí chůze rychleji.
  return nominal ? 1 / person.scale : 1;
}

/** Instance: postava na (x, y, z) natočená ve směru (hx, hz), zvětšená `scale`. */
function writeMatrix(
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
  m.set(
    [hz * scale, 0, -hx * scale, 0, 0, scale, 0, 0, hx * scale, 0, hz * scale, 0, x, y, z, 1],
    o,
  );
}

function villageKey(village: SceneVillage): string {
  const d = village.dwellings
    .filter((x) => x.built)
    .map((x) => `${x.id}:${x.position.x.toFixed(1)},${x.position.z.toFixed(1)}`);
  const f = village.fields
    .flatMap((x) => x.parts)
    .map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  return `${d.join(';')}|${f.join(';')}`;
}

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
  };
}

/** Lineárně čtená textura z GLB zpět do barev obrazovky (jako u dobytka v livestock.ts). */
class GammaPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly linearTexture: boolean,
  ) {
    super(material, 'VillagersGamma', 200, { VILLAGERS_GAMMA: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['VILLAGERS_GAMMA'] = this.linearTexture;
  }

  override getClassName(): string {
    return 'VillagersGammaPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef VILLAGERS_GAMMA
baseColor = vec4f(pow(baseColor.rgb, vec3f(1.0 / 2.2)), baseColor.a);
#endif`
          : `#ifdef VILLAGERS_GAMMA
baseColor.rgb = pow(baseColor.rgb, vec3(1.0 / 2.2));
#endif`,
    };
  }
}
