import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import {
  birdFlockBounds,
  birdPose,
  createPose,
  fishPose,
  fishSchoolBounds,
  type Bounds,
  type FaunaPose,
} from './fauna-motion';
import type { BirdFlock, BirdSpecies, FishSchool } from './fauna-placement';

/** Ozdobná zvířata krajiny; `animate` je posune na daný čas, jen pokud jsou v záběru. */
export interface Fauna {
  /** Vrátí true, když se nějaké zvíře v záběru pohnulo (scéna pak musí překreslit). */
  animate(timeSeconds: number, camera: Camera): boolean;
}

type FaunaModel = BirdSpecies | 'fish';

/** Dál od kamery (m) se zvíře nehýbe – je menší než pixel a pohyb by jen zbytečně kreslil. */
const ANIMATE_RANGE_M: Record<FaunaModel, number> = { crow: 1500, hawk: 1500, fish: 700 };
/**
 * Ryby se kreslí až po vodě (vlastní skupina vykreslování bez mazání hloubky) průhledně přes
 * hladinu – voda zapisuje hloubku, ryba pod ní by jinak nebyla vidět vůbec. Hloubku pod
 * hladinou dělá jejich krytí (fauna-motion.ts).
 */
const FISH_RENDERING_GROUP = 1;
/**
 * Ryby pod vodou trochu zezelenají; stříbřité boky se trochu lesknou i ve stínu, aby se
 * od tmavé vody odlišily. Ptáci se nebarví.
 */
const FISH_TINT = new Color3(0.9, 1, 0.92);
const FISH_GLOW = new Color3(0.05, 0.06, 0.05);

interface FaunaGroup {
  bounds: BoundingInfo;
  first: number;
  count: number;
  scales: number[];
  pose(index: number, timeS: number, out: FaunaPose): FaunaPose;
}

interface Herd {
  model: FaunaModel;
  mesh: Mesh;
  matrices: Float32Array;
  states: Float32Array;
  groups: FaunaGroup[];
}

/** Načtený model: vrcholy v základní póze a dvě klíčové pózy (morph targety z GLB). */
export interface FaunaGeometry {
  vertexData: VertexData;
  /** Koeficienty přechodu mezi pózami: poloha = základ + A·p + B·p² (p = póza −1 … 1). */
  keyA: Float32Array;
  keyB: Float32Array;
  /**
   * Třetí klíčová póza jako posun od základní (dobytek: hlava dolů při pastvě), nebo null,
   * když ji model nemá.
   */
  keyC: Float32Array | null;
  /** Textura v barvách obrazovky (`gammaSpace`) – pro StandardMaterial bez převodu. */
  texture: BaseTexture | null;
}

/**
 * Ryby a ptáci z modelů 0 A.D. (apps/web/public/models/fauna): každý druh je jeden mesh
 * s instancemi. Mávání křídel a mrskání ocasem je přechod mezi klíčovými pózami ve vertex
 * shaderu (GLSL i WGSL), polohu instancí přepisuje `animate`. Když se model nenačte, zvířata
 * daného druhu chybí (zaloguje se varování) – krajina se zobrazí dál.
 */
export async function addFauna(
  scene: Scene,
  placements: { fish: readonly FishSchool[]; birds: readonly BirdFlock[] },
  options: { baseUrl: string },
): Promise<Fauna> {
  const all: { model: FaunaModel; groups: Omit<FaunaGroup, 'first'>[] }[] = [
    {
      model: 'crow',
      groups: placements.birds.filter((f) => f.species === 'crow').map(birdGroup),
    },
    {
      model: 'hawk',
      groups: placements.birds.filter((f) => f.species === 'hawk').map(birdGroup),
    },
    { model: 'fish', groups: placements.fish.map(fishGroup) },
  ];
  const wanted = all.filter((w) => w.groups.length > 0);

  const results = await Promise.allSettled(
    wanted.map(async ({ model, groups }) => {
      const geometry = await loadGeometry(scene, `${options.baseUrl}${model}.glb`);
      return geometry ? createHerd(scene, model, geometry, groups) : null;
    }),
  );
  const herds: Herd[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value) herds.push(result.value);
    } else {
      console.warn('Zvířata krajiny se nepodařilo načíst.', result.reason);
    }
  }

  const pose = createPose();
  return {
    animate(timeSeconds: number, camera: Camera): boolean {
      let moved = false;
      for (const herd of herds) {
        let herdMoved = false;
        for (const group of herd.groups) {
          if (!camera.isInFrustum(group.bounds)) continue;
          const center = group.bounds.boundingSphere.centerWorld;
          if (Vector3.Distance(camera.globalPosition, center) > ANIMATE_RANGE_M[herd.model]) {
            continue;
          }
          for (let i = 0; i < group.count; i++) {
            writeInstance(
              herd,
              group.first + i,
              group.pose(i, timeSeconds, pose),
              group.scales[i]!,
            );
          }
          herdMoved = true;
        }
        if (herdMoved) {
          herd.mesh.thinInstanceBufferUpdated('matrix');
          herd.mesh.thinInstanceBufferUpdated('faunaState');
          moved = true;
        }
      }
      return moved;
    },
  };
}

function birdGroup(flock: BirdFlock): Omit<FaunaGroup, 'first'> {
  return {
    bounds: boundingInfo(birdFlockBounds(flock)),
    count: flock.birds.length,
    scales: flock.birds.map((b) => b.scale),
    pose: (index, timeS, out) => birdPose(flock, index, timeS, out),
  };
}

function fishGroup(school: FishSchool): Omit<FaunaGroup, 'first'> {
  return {
    bounds: boundingInfo(fishSchoolBounds(school)),
    count: school.fish.length,
    scales: school.fish.map((f) => f.scale),
    pose: (index, timeS, out) => fishPose(school, index, timeS, out),
  };
}

function boundingInfo(b: Bounds): BoundingInfo {
  return new BoundingInfo(new Vector3(b.minX, b.minY, b.minZ), new Vector3(b.maxX, b.maxY, b.maxZ));
}

/**
 * Textura zvířat se čte tak, jak je uložená (barvy obrazovky, `gammaSpace`) – kreslí ji
 * StandardMaterial, který s barvami textury počítá bez převodu (jako 0 A.D.). Výchozí čtení
 * glTF jako sRGB by GPU převedlo do lineárních barev a zvířata by ztmavla (WebGPU i WebGL 2).
 */
const GLTF_GAMMA_TEXTURES = { pluginOptions: { gltf: { useSRGBBuffers: false } } };

/**
 * Načte GLB a vrátí jeho geometrii ve světových osách Babylonu (zapeče převod os z glTF)
 * a klíčové pózy: první morph target je póza +1, druhý −1. Když se scéna mezitím zruší, vrátí
 * null; chybu načtení propustí volajícímu.
 */
export async function loadGeometry(scene: Scene, url: string): Promise<FaunaGeometry | null> {
  const container = await LoadAssetContainerAsync(url, scene, GLTF_GAMMA_TEXTURES);
  if (scene.isDisposed) return null;
  // Do scény jen kvůli texturám – s ní se pak uvolní. Meshe a materiál GLB se hned zahodí.
  container.addAllToScene();
  const source = container.meshes.find(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
  );
  const manager = source?.morphTargetManager;
  const positions = source?.getVerticesData(VertexBuffer.PositionKind);
  const plus = manager && manager.numTargets >= 2 ? manager.getTarget(0).getPositions() : null;
  const minus = manager && manager.numTargets >= 2 ? manager.getTarget(1).getPositions() : null;
  const third = manager && manager.numTargets >= 3 ? manager.getTarget(2).getPositions() : null;
  const material = source?.material;
  const texture = material instanceof PBRMaterial ? material.albedoTexture : null;
  if (!source || !positions || !plus || !minus) {
    for (const mesh of container.meshes) mesh.dispose(false, false);
    throw new Error(`${url}: model bez klíčových póz (morph targets)`);
  }

  const world = source.computeWorldMatrix(true);
  const normals = source.getVerticesData(VertexBuffer.NormalKind);
  const uvs = source.getVerticesData(VertexBuffer.UVKind);
  const indices = Array.from(source.getIndices() ?? []);
  const count = positions.length / 3;
  const base = new Float32Array(positions.length);
  const keyA = new Float32Array(positions.length);
  const keyB = new Float32Array(positions.length);
  const keyC = third ? new Float32Array(positions.length) : null;
  const outNormals = new Float32Array(positions.length);
  const p = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < count; i++) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i * 3]!,
      positions[i * 3 + 1]!,
      positions[i * 3 + 2]!,
      world,
      p,
    );
    Vector3.TransformCoordinatesFromFloatsToRef(
      plus[i * 3]!,
      plus[i * 3 + 1]!,
      plus[i * 3 + 2]!,
      world,
      a,
    );
    Vector3.TransformCoordinatesFromFloatsToRef(
      minus[i * 3]!,
      minus[i * 3 + 1]!,
      minus[i * 3 + 2]!,
      world,
      b,
    );
    base.set([p.x, p.y, p.z], i * 3);
    // Parabola přes tři pózy: p = −1 → minus, 0 → základ, +1 → plus.
    keyA.set([(a.x - b.x) / 2, (a.y - b.y) / 2, (a.z - b.z) / 2], i * 3);
    keyB.set([(a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y, (a.z + b.z) / 2 - p.z], i * 3);
    if (third && keyC) {
      Vector3.TransformCoordinatesFromFloatsToRef(
        third[i * 3]!,
        third[i * 3 + 1]!,
        third[i * 3 + 2]!,
        world,
        c,
      );
      keyC.set([c.x - p.x, c.y - p.y, c.z - p.z], i * 3);
    }
    if (normals) {
      Vector3.TransformNormalFromFloatsToRef(
        normals[i * 3]!,
        normals[i * 3 + 1]!,
        normals[i * 3 + 2]!,
        world,
        n,
      );
      n.normalize();
      outNormals.set([n.x, n.y, n.z], i * 3);
    }
  }
  // Převod os z glTF zrcadlí; pořadí vrcholů trojúhelníků se nechává – zapečené zrcadlení ho
  // obrátí přesně tak, jak Babylon čeká přední stěny (oboustranné světlo pak sedí s normálami).
  const vertexData = new VertexData();
  vertexData.positions = base;
  vertexData.indices = indices;
  if (normals) vertexData.normals = outNormals;
  if (uvs) vertexData.uvs = uvs;

  for (const mesh of container.meshes) mesh.dispose(false, false);
  for (const used of container.materials) used.dispose(false, false);
  return { vertexData, keyA, keyB, keyC, texture };
}

function createHerd(
  scene: Scene,
  model: FaunaModel,
  geometry: FaunaGeometry,
  groups: Omit<FaunaGroup, 'first'>[],
): Herd {
  // Jméno mimo předpony vrhačů stínů (trees-, impostors-, decor-) – stínová mapa je statická.
  const mesh = new Mesh(`fauna-${model}`, scene);
  geometry.vertexData.applyToMesh(mesh);
  mesh.setVerticesData('faunaKeyA', geometry.keyA, false, 3);
  mesh.setVerticesData('faunaKeyB', geometry.keyB, false, 3);
  mesh.isPickable = false;
  mesh.doNotSyncBoundingInfo = true;

  const material = new StandardMaterial(`fauna-${model}-material`, scene);
  // Bez mipmap: zvíře je z dálky pár pixelů a nejmenší mipmapa by smíchala celou texturu
  // (stříbrná ryba by zhnědla, průhledné konce per jestřába by ho rozpustily).
  geometry.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
  material.diffuseTexture = geometry.texture;
  material.specularColor = Color3.Black();
  // Křídla a ploutve jsou jednoduché plochy – kreslí se z obou stran.
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  if (model === 'fish') {
    material.diffuseColor = FISH_TINT;
    material.emissiveColor = FISH_GLOW;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true;
    mesh.renderingGroupId = FISH_RENDERING_GROUP;
    scene.setRenderingAutoClearDepthStencil(FISH_RENDERING_GROUP, false, false, false);
  } else if (geometry.texture?.hasAlpha) {
    // Konce per jestřába jsou v textuře průhledné.
    material.transparencyMode = Material.MATERIAL_ALPHATEST;
    material.alphaCutOff = 0.5;
  }
  new FaunaPlugin(material);
  mesh.material = material;

  let first = 0;
  const placed: FaunaGroup[] = groups.map((group) => {
    const withFirst = { ...group, first };
    first += group.count;
    return withFirst;
  });
  const herd: Herd = {
    model,
    mesh,
    matrices: new Float32Array(first * 16),
    states: new Float32Array(first * 2),
    groups: placed,
  };
  // Výchozí póza (čas 0) – při omezeném pohybu zvířata takhle zůstanou.
  const pose = createPose();
  for (const group of placed) {
    for (let i = 0; i < group.count; i++) {
      writeInstance(herd, group.first + i, group.pose(i, 0, pose), group.scales[i]!);
    }
  }
  mesh.thinInstanceSetBuffer('matrix', herd.matrices, 16, false);
  mesh.thinInstanceSetBuffer('faunaState', herd.states, 2, false);
  // Pevný obal přes dráhy všech zvířat – podle něj Babylon mesh ořezává mimo záběr.
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const group of placed) {
    min.minimizeInPlace(group.bounds.minimum);
    max.maximizeInPlace(group.bounds.maximum);
  }
  mesh.setBoundingInfo(new BoundingInfo(min, max));
  mesh.freezeWorldMatrix();
  return herd;
}

/** Zapíše matici instance (poloha, směr, náklon, měřítko) a stav pózy a krytí. */
function writeInstance(herd: Herd, index: number, pose: FaunaPose, scale: number): void {
  writeInstanceMatrix(herd.matrices, index, pose, scale);
  herd.states[index * 2] = pose.flap;
  herd.states[index * 2 + 1] = pose.opacity;
}

/** Poloha, směr a náklon instance – co potřebuje matice (FaunaPose i dobytek). */
export type InstancePlacement = Pick<
  FaunaPose,
  'x' | 'y' | 'z' | 'forwardX' | 'forwardY' | 'forwardZ' | 'tiltX' | 'tiltZ'
>;

/**
 * Matice instance `index` do `matrices`: model míří ve směru `forward`, jeho „nahoru“ se
 * naklání podle `tilt` (vodorovné složky směru nahoru), měřítko `scale`.
 */
export function writeInstanceMatrix(
  matrices: Float32Array,
  index: number,
  pose: InstancePlacement,
  scale: number,
): void {
  const { forwardX: fx, forwardY: fy, forwardZ: fz, tiltX: hx, tiltZ: hz } = pose;
  const hy = Math.sqrt(Math.max(0, 1 - hx * hx - hz * hz));
  // Osa křídel = „nahoru“ × dopředu, skutečné „nahoru“ = dopředu × osa křídel.
  let rx = hy * fz - hz * fy;
  let ry = hz * fx - hx * fz;
  let rz = hx * fy - hy * fx;
  const length = Math.hypot(rx, ry, rz) || 1;
  rx /= length;
  ry /= length;
  rz /= length;
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;
  const m = matrices;
  const o = index * 16;
  m[o] = rx * scale;
  m[o + 1] = ry * scale;
  m[o + 2] = rz * scale;
  m[o + 3] = 0;
  m[o + 4] = ux * scale;
  m[o + 5] = uy * scale;
  m[o + 6] = uz * scale;
  m[o + 7] = 0;
  m[o + 8] = fx * scale;
  m[o + 9] = fy * scale;
  m[o + 10] = fz * scale;
  m[o + 11] = 0;
  m[o + 12] = pose.x;
  m[o + 13] = pose.y;
  m[o + 14] = pose.z;
  m[o + 15] = 1;
}

/**
 * Pózy zvířat ve vertex shaderu (GLSL i WGSL) nad StandardMaterialem: vrcholy mají
 * koeficienty faunaKeyA/B (z klíčových póz 0 A.D.), instance stav faunaState (póza −1 … 1,
 * krytí). Póza je parabola přes tři pózy – křídla dole, plachtění, křídla nahoře.
 */
class FaunaPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'Fauna', 200, { FAUNA: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['FAUNA'] = true;
  }

  override getClassName(): string {
    return 'FaunaPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push('faunaKeyA', 'faunaKeyB', 'faunaState');
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: `attribute faunaKeyA: vec3f;
attribute faunaKeyB: vec3f;
attribute faunaState: vec2f;
varying vFaunaOpacity: f32;`,
            CUSTOM_VERTEX_UPDATE_POSITION: `{
  let faunaPose = vertexInputs.faunaState.x;
  positionUpdated = positionUpdated + vertexInputs.faunaKeyA * faunaPose + vertexInputs.faunaKeyB * (faunaPose * faunaPose);
  vertexOutputs.vFaunaOpacity = vertexInputs.faunaState.y;
}`,
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: `attribute vec3 faunaKeyA;
attribute vec3 faunaKeyB;
attribute vec2 faunaState;
varying float vFaunaOpacity;`,
            CUSTOM_VERTEX_UPDATE_POSITION: `{
  float faunaPose = faunaState.x;
  positionUpdated += faunaKeyA * faunaPose + faunaKeyB * (faunaPose * faunaPose);
  vFaunaOpacity = faunaState.y;
}`,
          };
    }
    if (shaderType !== 'fragment') return null;
    return wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying vFaunaOpacity: f32;`,
          CUSTOM_FRAGMENT_BEFORE_FOG: `color = vec4f(color.rgb, color.a * fragmentInputs.vFaunaOpacity);`,
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: `varying float vFaunaOpacity;`,
          CUSTOM_FRAGMENT_BEFORE_FOG: `color.a *= vFaunaOpacity;`,
        };
  }
}
