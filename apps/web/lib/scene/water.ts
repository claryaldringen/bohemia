import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { HEIGHT_SCALE } from './constants';
import type { RenderSurface } from './render-surface';
import type { Rgb } from './season-look';
import {
  bindSeasonUniforms,
  SEASON_HELPERS_GLSL,
  SEASON_HELPERS_WGSL,
  SEASON_UBO,
} from './season-materials';
import { WATER_VISIBILITY_M, waterClarity } from './stream-geometry';
import {
  bankSlowdown,
  BANK_ICE_M,
  FREEZE_SPEED,
  frozenFrom,
  ICE_JITTER,
  ICE_SOFTNESS,
} from './water-ice';

/** Vodní plocha sahá kousek za okraj vody, aby okraj mohl plynule vyblednout (m). */
const EDGE_MARGIN_M = 1.5;
/** Normálová mapa vlnek: rozlišení a délka opakování dvou vrstev (m). */
const RIPPLE_SIZE = 256;
const RIPPLE_REPEAT_M: readonly [number, number] = [11, 3.7];
/** Rychlost proudu ve scéně (m/s): stojatá tůň → peřej. */
const FLOW_SPEED_MPS: readonly [number, number] = [0.12, 1.6];
/**
 * Nejmenší krytí hladiny: stojatá → tekoucí voda (od rychlosti FLOWING_SPEED). Rozčeřená hladina
 * odráží a rozptyluje světlo, takže i mělký čirý brod nad oblázky je vidět jako voda – s krytím
 * jen podle hloubky by dno vypadalo suché (Martin).
 */
const MIN_ALPHA: readonly [number, number] = [0.12, 0.6];
const FLOWING_SPEED: readonly [number, number] = [0.2, 0.6];
/** Barvy (podle 0 A.D. temperate, ale méně kalné – Martin chce průzračnou vodu). */
const MURKY_COLOR = new Color3(0.2, 0.21, 0.12);
const CLEAR_COLOR = new Color3(0.13, 0.24, 0.23);
const SKY_REFLECTION = new Color3(0.55, 0.66, 0.78);
/**
 * Led (barvy obrazovky): tenký u otevřené vody tmavý, silný průsvitně šedomodrý se zamrzlými
 * bublinami a jinovatkou; na silném ledu leží sníh jako na zemi (season-materials.ts), vítr
 * z něj ale místy odfoukne skvrny holého ledu.
 */
const ICE_THIN = [0.27, 0.31, 0.33] as const;
const ICE_CLEAR = [0.43, 0.48, 0.5] as const;
const ICE_FROST = [0.6, 0.64, 0.66] as const;
/** Kolik sněhu z pokrývky na zemi zůstane na ledu (zbytek odfouká vítr). */
const ICE_SNOW = 0.75;
/**
 * Zamrzlou vodu není třeba kreslit 30× za sekundu: hladina je rozdělená na čtverce o této
 * straně (m) a překresluje se, jen dokud je v záběru čtverec s nezamrzlou vodou.
 */
const FLOW_CHUNK_M = 120;

/** Hladina potoka s animovanými vlnkami; `animate` posouvá čas (scéna pak musí překreslit). */
export interface WaterSurface {
  mesh: Mesh;
  /** Nastaví čas animace vln (s). */
  animate(timeSeconds: number): void;
  /**
   * Roční období: násobek barev vody, barva odrazu oblohy a led 0–1 (season-look.ts; shader
   * čte led z uniform období – `setSeasonShaderState` se stejným vzhledem).
   */
  setSeason(tint: Rgb, sky: Rgb, ice: number): void;
  /** Je v záběru kamery nezamrzlá voda? Jen ta teče – zamrzlá se nepřekresluje. */
  flowsInView(camera: Camera): boolean;
}

/** Čtverec hladiny: obal jeho trojúhelníků a od jaké zimy je celý zamrzlý (water-ice.ts). */
interface FlowChunk {
  bounds: BoundingInfo;
  frozenFrom: number;
}

/**
 * Hladina potoka jako souvislá plocha nad vyhloubeným korytem (podle water_high z 0 A.D.):
 * barva a průhlednost podle hloubky a průzračnosti (rychlá voda nad štěrkem čirá, pomalá nad
 * bahnem kalná), vlnky plují po proudu rychlostí proudu, šikmo voda odráží oblohu (Fresnel),
 * slunce se leskne na vlnkách. V zimě pomalá voda a okraje u břehů zamrznou (water-ice.ts).
 */
export function createWaterMesh(scene: Scene, surface: RenderSurface): WaterSurface | null {
  const n = surface.resolution;
  const vertexIndex = new Int32Array(n * n).fill(-1);
  const positions: number[] = [];
  const flow: number[] = [];
  const info: number[] = [];
  const indices: number[] = [];
  const samples = new Map<number, ReturnType<RenderSurface['stream']['nearest']>>();
  const sample = (v: number): ReturnType<RenderSurface['stream']['nearest']> => {
    let s = samples.get(v);
    if (!s) {
      const { x, z } = surface.position(v);
      s = surface.stream.nearest(x, z);
      samples.set(v, s);
    }
    return s;
  };

  const vertex = (v: number): number => {
    if (vertexIndex[v]! >= 0) return vertexIndex[v]!;
    const { x, z } = surface.position(v);
    const near = sample(v);
    const level = surface.waterLevel[v]!;
    const depth = Math.max(0, level - surface.heights[v]!);
    // Obrys vody podle vzdálenosti od okraje břehu – průsečík s terénem na mřížce by byl zubatý.
    const edge = 1 - smoothstep(-2.5, 0.5, near.bankDistance);
    // Rychlá voda nad štěrkem je průzračná, pomalá nad bahnem a v tůni kalná.
    const clarity = waterClarity(near);
    const minAlpha =
      MIN_ALPHA[0] +
      (MIN_ALPHA[1] - MIN_ALPHA[0]) * smoothstep(FLOWING_SPEED[0], FLOWING_SPEED[1], near.speed);
    positions.push(x, level * HEIGHT_SCALE, z);
    flow.push(near.flowX, near.flowZ, near.speed, clarity);
    info.push(depth, edge, minAlpha, near.bankDistance);
    vertexIndex[v] = positions.length / 3 - 1;
    return vertexIndex[v]!;
  };

  // Čtverce hladiny pro zamrzání: obal a největší rychlost a podíl proudu u břehu jejich rohů
  // (shader je mezi rohy prolíná, součin největších je horní mez).
  const origin = surface.position(0);
  const chunks = new Map<number, { min: Vector3; max: Vector3; speed: number; slowdown: number }>();

  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const corners = [a, a + 1, a + n, a + n + 1];
      // Jen čtverce, kde je hladina známá a aspoň jeden roh leží ve vodě (nebo těsně u ní).
      if (corners.some((v) => !Number.isFinite(surface.waterLevel[v]!))) continue;
      if (corners.every((v) => sample(v).bankDistance > EDGE_MARGIN_M)) continue;
      const [va, vb, vc, vd] = corners.map(vertex) as [number, number, number, number];
      indices.push(va, vb, vc, vb, vd, vc);
      const corner = surface.position(a);
      const key =
        Math.floor((corner.x - origin.x) / FLOW_CHUNK_M) * 1024 +
        Math.floor((corner.z - origin.z) / FLOW_CHUNK_M);
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = {
          min: new Vector3(Infinity, Infinity, Infinity),
          max: new Vector3(-Infinity, -Infinity, -Infinity),
          speed: 0,
          slowdown: 0,
        };
        chunks.set(key, chunk);
      }
      for (const v of [va, vb, vc, vd]) {
        const p = new Vector3(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
        chunk.min.minimizeInPlace(p);
        chunk.max.maximizeInPlace(p);
        chunk.speed = Math.max(chunk.speed, flow[v * 4 + 2]!);
        chunk.slowdown = Math.max(chunk.slowdown, bankSlowdown(info[v * 4 + 3]!));
      }
    }
  }
  if (indices.length === 0) return null;
  const flowChunks: FlowChunk[] = [...chunks.values()].map((c) => ({
    bounds: new BoundingInfo(c.min, c.max),
    frozenFrom: frozenFrom(c.speed * c.slowdown),
  }));
  let openChunks = flowChunks;

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  const mesh = new Mesh('water', scene);
  vertexData.applyToMesh(mesh);
  mesh.setVerticesData('waterFlow', flow, false, 4);
  mesh.setVerticesData('waterInfo', info, false, 4);

  const material = new StandardMaterial('water-material', scene);
  material.specularColor = new Color3(0.9, 0.88, 0.8);
  material.specularPower = 220;
  material.backFaceCulling = false;
  material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  const plugin = new WaterPlugin(material, createRippleNormalMap(scene));
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return {
    mesh,
    animate(timeSeconds) {
      plugin.time = timeSeconds;
    },
    setSeason(tint, sky, ice) {
      plugin.murky = MURKY_COLOR.multiplyByFloats(...tint);
      plugin.clear = CLEAR_COLOR.multiplyByFloats(...tint);
      plugin.sky = new Color3(...sky);
      openChunks = flowChunks.filter((chunk) => ice < chunk.frozenFrom);
    },
    flowsInView(camera) {
      if (openChunks.length === 0 || !camera.isInFrustum(mesh)) return false;
      return openChunks.some((chunk) => camera.isInFrustum(chunk.bounds));
    },
  };
}

/**
 * Dlaždicová normálová mapa vlnek ze součtu vln s celočíselnými frekvencemi (navazuje na
 * okrajích) – deterministicky, bez souboru.
 */
function createRippleNormalMap(scene: Scene): RawTexture {
  const n = RIPPLE_SIZE;
  const waves: { kx: number; ky: number; amplitude: number; phase: number }[] = [];
  let state = 0x7a7e5;
  const random = (): number => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
  for (let w = 0; w < 24; w++) {
    const frequency = 3 + Math.floor(random() * 14);
    const angle = random() * Math.PI * 2;
    waves.push({
      kx: Math.round(Math.cos(angle) * frequency),
      ky: Math.round(Math.sin(angle) * frequency),
      amplitude: 1 / frequency,
      phase: random() * Math.PI * 2,
    });
  }
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let dx = 0;
      let dy = 0;
      for (const wave of waves) {
        const arg = (2 * Math.PI * (wave.kx * x + wave.ky * y)) / n + wave.phase;
        const slope = wave.amplitude * Math.cos(arg) * 2 * Math.PI;
        dx += slope * wave.kx;
        dy += slope * wave.ky;
      }
      const length = Math.hypot(dx * 0.02, dy * 0.02, 1);
      const i = (y * n + x) * 4;
      data[i] = Math.round(((-dx * 0.02) / length) * 127.5 + 127.5);
      data[i + 1] = Math.round(((-dy * 0.02) / length) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
      data[i + 3] = 255;
    }
  }
  const texture = RawTexture.CreateRGBATexture(
    data,
    n,
    n,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = 'water-ripples';
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

/** Číslo jako desetinný literál shaderu (GLSL ES nepřevádí celá čísla na float samo). */
function float(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

const rgb = (color: readonly [number, number, number]): string => color.map(float).join(', ');

/** Led podle water-ice.ts: `iceCover` s rychlostí proudu u břehu zpomalenou (`iceFlowSpeed`). */
const ICE_COVER_GLSL = `vec2 waterIceTurn(vec2 p) {
  return vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y);
}
float waterIceSnow(vec2 xz, float amount) {
  float n = 0.65 * seasonNoise(xz * 0.035 + 21.0) + 0.35 * seasonNoise(waterIceTurn(xz) * 0.11 + 4.0);
  return smoothstep(n - 0.06, n + 0.06, amount * 1.2 - 0.25);
}
float waterIceCover(float speed, float bankDistance, float ice, float jitter) {
  float limit = ${float(FREEZE_SPEED)} * min(ice, 1.0);
  float flow = max(0.0, max(speed, 0.0) * smoothstep(0.0, ${float(BANK_ICE_M)}, -bankDistance) + jitter * ${float(ICE_JITTER)});
  return 1.0 - smoothstep(limit - ${float(ICE_SOFTNESS)}, limit, flow);
}`;
const ICE_COVER_WGSL = `fn waterIceTurn(p: vec2f) -> vec2f {
  return vec2f(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y);
}
fn waterIceSnow(xz: vec2f, amount: f32) -> f32 {
  let n = 0.65 * seasonNoise(xz * 0.035 + 21.0) + 0.35 * seasonNoise(waterIceTurn(xz) * 0.11 + 4.0);
  return smoothstep(n - 0.06, n + 0.06, amount * 1.2 - 0.25);
}
fn waterIceCover(speed: f32, bankDistance: f32, ice: f32, jitter: f32) -> f32 {
  let limit = ${float(FREEZE_SPEED)} * min(ice, 1.0);
  let flow = max(0.0, max(speed, 0.0) * smoothstep(0.0, ${float(BANK_ICE_M)}, -bankDistance) + jitter * ${float(ICE_JITTER)});
  return 1.0 - smoothstep(limit - ${float(ICE_SOFTNESS)}, limit, flow);
}`;

/**
 * Shader vody (GLSL i WGSL) nad StandardMaterialem: vlastní atributy vrcholů waterFlow
 * (směr toku x/z, rychlost, průzračnost) a waterInfo (hloubka, okraj, nejmenší krytí,
 * vzdálenost od okraje vody). Led čte z uniform ročního období (seasonB.w, sníh seasonA.x) –
 * bez textury navíc, šum je procedurální (season-materials.ts).
 */
class WaterPlugin extends MaterialPluginBase {
  time = 0;
  murky = MURKY_COLOR;
  clear = CLEAR_COLOR;
  sky = SKY_REFLECTION;

  constructor(
    material: Material,
    private readonly ripples: RawTexture,
  ) {
    super(material, 'Water', 200, { WATER: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['WATER'] = true;
  }

  override getClassName(): string {
    return 'WaterPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push('waterFlow', 'waterInfo');
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('waterRipples');
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[];
    fragment: string;
  } {
    return {
      ubo: [
        { name: 'waterTime', size: 1, type: 'float' },
        { name: 'waterRepeat', size: 2, type: 'vec2' },
        { name: 'waterSpeed', size: 2, type: 'vec2' },
        { name: 'waterVisibility', size: 2, type: 'vec2' },
        { name: 'waterMurky', size: 3, type: 'vec3' },
        { name: 'waterClear', size: 3, type: 'vec3' },
        { name: 'waterSky', size: 3, type: 'vec3' },
        ...SEASON_UBO,
      ],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef WATER
uniform waterTime: f32;
uniform waterRepeat: vec2f;
uniform waterSpeed: vec2f;
uniform waterVisibility: vec2f;
uniform waterMurky: vec3f;
uniform waterClear: vec3f;
uniform waterSky: vec3f;
uniform seasonA: vec4f;
uniform seasonB: vec4f;
uniform seasonC: vec4f;
#endif`
          : `#ifdef WATER
uniform float waterTime;
uniform vec2 waterRepeat;
uniform vec2 waterSpeed;
uniform vec2 waterVisibility;
uniform vec3 waterMurky;
uniform vec3 waterClear;
uniform vec3 waterSky;
uniform vec4 seasonA;
uniform vec4 seasonB;
uniform vec4 seasonC;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('waterTime', this.time);
    uniformBuffer.updateFloat2('waterRepeat', RIPPLE_REPEAT_M[0], RIPPLE_REPEAT_M[1]);
    uniformBuffer.updateFloat2('waterSpeed', FLOW_SPEED_MPS[0], FLOW_SPEED_MPS[1]);
    uniformBuffer.updateFloat2('waterVisibility', WATER_VISIBILITY_M[0], WATER_VISIBILITY_M[1]);
    uniformBuffer.updateColor3('waterMurky', this.murky);
    uniformBuffer.updateColor3('waterClear', this.clear);
    uniformBuffer.updateColor3('waterSky', this.sky);
    bindSeasonUniforms(uniformBuffer, this._material.getScene());
    uniformBuffer.setTexture('waterRipples', this.ripples);
  }

  override getActiveTextures(activeTextures: Texture[]): void {
    activeTextures.push(this.ripples);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: `attribute waterFlow: vec4f;
attribute waterInfo: vec4f;
varying vWaterFlow: vec4f;
varying vWaterInfo: vec4f;`,
            CUSTOM_VERTEX_MAIN_END: `vertexOutputs.vWaterFlow = vertexInputs.waterFlow;
vertexOutputs.vWaterInfo = vertexInputs.waterInfo;`,
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: `attribute vec4 waterFlow;
attribute vec4 waterInfo;
varying vec4 vWaterFlow;
varying vec4 vWaterInfo;`,
            CUSTOM_VERTEX_MAIN_END: `vWaterFlow = waterFlow;
vWaterInfo = waterInfo;`,
          };
    }
    if (shaderType !== 'fragment') return null;
    // Odraz oblohy: Schlickova aproximace (shora voda skoro neodráží, u obzoru zrcadlí) –
    // vzorec z 0 A.D. by při naší strmé kameře zbělil celý potok.
    // Flowmap se dvěma fázemi: textura pluje po proudu a každá fáze se po půl cyklu vrátí –
    // druhá ji mezitím překryje, takže se vlnky nikdy nenatáhnou.
    // Led: pokrytí podle rychlosti proudu u břehu a zimy, okraj trhá šum; tenký led u otevřené
    // vody tmavší, silný průsvitně šedomodrý s jinovatkou a sněhem. Na ledu vlnky stojí, slunce
    // se leskne méně a obloha se odráží slaběji. Kousek nad okrajem vody led končí (pod terénem).
    if (wgsl) {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `varying vWaterFlow: vec4f;
varying vWaterInfo: vec4f;
var waterRipplesSampler: sampler;
var waterRipples: texture_2d<f32>;
${SEASON_HELPERS_WGSL}
${ICE_COVER_WGSL}
fn waterLayer(xz: vec2f, dir: vec2f, metersPerSecond: f32, repeatM: f32, time: f32, period: f32) -> vec2f {
  let phase0 = fract(time / period);
  let phase1 = fract(time / period + 0.5);
  let shift = dir * metersPerSecond * period / repeatM;
  let uv = xz / repeatM;
  let n0 = textureSample(waterRipples, waterRipplesSampler, uv - shift * phase0).rg * 2.0 - 1.0;
  let n1 = textureSample(waterRipples, waterRipplesSampler, uv - shift * phase1 + vec2f(0.37, 0.61)).rg * 2.0 - 1.0;
  return mix(n0, n1, abs(0.5 - phase0) * 2.0);
}`,
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `let waterClarity = fragmentInputs.vWaterFlow.w;
let waterVisibilityM = mix(uniforms.waterVisibility.x, uniforms.waterVisibility.y, waterClarity);
let waterIceXz = fragmentInputs.vPositionW.xz;
let waterIceGrain = 0.55 * seasonNoise(waterIceXz * 0.18) + 0.3 * seasonNoise(waterIceTurn(waterIceXz) * 0.5 + 11.0) + 0.15 * seasonNoise(waterIceTurn(waterIceTurn(waterIceXz)) * 1.3 + 5.0);
let waterIce = waterIceCover(fragmentInputs.vWaterFlow.z, fragmentInputs.vWaterInfo.w, uniforms.seasonB.w, waterIceGrain * 2.0 - 1.0);
let waterIceThick = smoothstep(0.3, 1.0, waterIce);
let waterIceFrost = 0.7 * smoothstep(0.2, 0.9, 0.6 * seasonNoise(waterIceTurn(waterIceXz) * 0.6 + 3.0) + 0.4 * waterIceGrain);
var waterIceColor = mix(vec3f(${rgb(ICE_THIN)}), mix(vec3f(${rgb(ICE_CLEAR)}), vec3f(${rgb(ICE_FROST)}), waterIceFrost), waterIceThick);
waterIceColor = mix(waterIceColor, mix(seasonSnowColor(waterIceColor), waterIceColor, 0.15), waterIceSnow(waterIceXz, uniforms.seasonA.x * ${float(ICE_SNOW)}) * waterIceThick);
let waterIceAlpha = mix(0.8, 0.97, waterIceThick) * (1.0 - smoothstep(0.0, 0.8, fragmentInputs.vWaterInfo.w));
baseColor = vec4f(mix(mix(uniforms.waterMurky, uniforms.waterClear, waterClarity), waterIceColor, waterIce), baseColor.a);
alpha = mix(fragmentInputs.vWaterInfo.y * clamp(1.0 - exp(-fragmentInputs.vWaterInfo.x / waterVisibilityM), fragmentInputs.vWaterInfo.z, 1.0), waterIceAlpha, waterIce);`,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `{
  let waterDir = fragmentInputs.vWaterFlow.xy;
  let waterRate = mix(uniforms.waterSpeed.x, uniforms.waterSpeed.y, fragmentInputs.vWaterFlow.z);
  let waterXz = fragmentInputs.vPositionW.xz;
  let ripple = waterLayer(waterXz, waterDir, waterRate, uniforms.waterRepeat.x, uniforms.waterTime, 2.0)
    + 0.6 * waterLayer(waterXz, waterDir, waterRate * 1.4, uniforms.waterRepeat.y, uniforms.waterTime, 1.3);
  let roughness = mix(0.12, 0.55, fragmentInputs.vWaterFlow.z) * (1.0 - waterIce);
  normalW = normalize(vec3f(ripple.x * roughness, 1.0, ripple.y * roughness));
}`,
        CUSTOM_FRAGMENT_BEFORE_FOG: `{
  color = vec4f(max(color.rgb - finalSpecular * (0.7 * waterIce), vec3f(0.0)), color.a);
  let fresnel = min(0.04 + 0.96 * pow(1.0 - max(dot(normalW, viewDirectionW), 0.0), 3.0), 0.8) * (1.0 - 0.8 * waterIce);
  color = vec4f(mix(color.rgb, uniforms.waterSky, fresnel), max(color.a, fresnel * fragmentInputs.vWaterInfo.y));
}`,
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `varying vec4 vWaterFlow;
varying vec4 vWaterInfo;
uniform sampler2D waterRipples;
${SEASON_HELPERS_GLSL}
${ICE_COVER_GLSL}
vec2 waterLayer(vec2 xz, vec2 dir, float metersPerSecond, float repeatM, float time, float period) {
  float phase0 = fract(time / period);
  float phase1 = fract(time / period + 0.5);
  vec2 shift = dir * metersPerSecond * period / repeatM;
  vec2 uv = xz / repeatM;
  vec2 n0 = texture2D(waterRipples, uv - shift * phase0).rg * 2.0 - 1.0;
  vec2 n1 = texture2D(waterRipples, uv - shift * phase1 + vec2(0.37, 0.61)).rg * 2.0 - 1.0;
  return mix(n0, n1, abs(0.5 - phase0) * 2.0);
}`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `float waterClarity = vWaterFlow.w;
float waterVisibilityM = mix(waterVisibility.x, waterVisibility.y, waterClarity);
vec2 waterIceXz = vPositionW.xz;
float waterIceGrain = 0.55 * seasonNoise(waterIceXz * 0.18) + 0.3 * seasonNoise(waterIceTurn(waterIceXz) * 0.5 + 11.0) + 0.15 * seasonNoise(waterIceTurn(waterIceTurn(waterIceXz)) * 1.3 + 5.0);
float waterIce = waterIceCover(vWaterFlow.z, vWaterInfo.w, seasonB.w, waterIceGrain * 2.0 - 1.0);
float waterIceThick = smoothstep(0.3, 1.0, waterIce);
float waterIceFrost = 0.7 * smoothstep(0.2, 0.9, 0.6 * seasonNoise(waterIceTurn(waterIceXz) * 0.6 + 3.0) + 0.4 * waterIceGrain);
vec3 waterIceColor = mix(vec3(${rgb(ICE_THIN)}), mix(vec3(${rgb(ICE_CLEAR)}), vec3(${rgb(ICE_FROST)}), waterIceFrost), waterIceThick);
waterIceColor = mix(waterIceColor, mix(seasonSnowColor(waterIceColor), waterIceColor, 0.15), waterIceSnow(waterIceXz, seasonA.x * ${float(ICE_SNOW)}) * waterIceThick);
float waterIceAlpha = mix(0.8, 0.97, waterIceThick) * (1.0 - smoothstep(0.0, 0.8, vWaterInfo.w));
baseColor.rgb = mix(mix(waterMurky, waterClear, waterClarity), waterIceColor, waterIce);
alpha = mix(vWaterInfo.y * clamp(1.0 - exp(-vWaterInfo.x / waterVisibilityM), vWaterInfo.z, 1.0), waterIceAlpha, waterIce);`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `{
  vec2 waterDir = vWaterFlow.xy;
  float waterRate = mix(waterSpeed.x, waterSpeed.y, vWaterFlow.z);
  vec2 ripple = waterLayer(vPositionW.xz, waterDir, waterRate, waterRepeat.x, waterTime, 2.0)
    + 0.6 * waterLayer(vPositionW.xz, waterDir, waterRate * 1.4, waterRepeat.y, waterTime, 1.3);
  float roughness = mix(0.12, 0.55, vWaterFlow.z) * (1.0 - waterIce);
  normalW = normalize(vec3(ripple.x * roughness, 1.0, ripple.y * roughness));
}`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `{
  color.rgb = max(color.rgb - finalSpecular * (0.7 * waterIce), 0.0);
  float fresnel = min(0.04 + 0.96 * pow(1.0 - max(dot(normalW, viewDirectionW), 0.0), 3.0), 0.8) * (1.0 - 0.8 * waterIce);
  color.rgb = mix(color.rgb, waterSky, fresnel);
  color.a = max(color.a, fresnel * vWaterInfo.y);
}`,
    };
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
