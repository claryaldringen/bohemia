import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { Scene } from '@babylonjs/core/scene';
import { seasonFoliageFor, type SeasonFoliageOptions } from './season-foliage';
import { REFERENCE_DAY, seasonLook, type Rgb, type SeasonLook } from './season-look';

// Roční období v materiálech scény (GLSL i WGSL): sníh na zemi, polích, kamenech a střechách,
// barva a množství listí stromů a keřů, vnitřek lesa (impostory a plocha korun). Shadery čtou
// parametry z uniform bufferu při každém kreslení – změna období shader nepřekládá a stojí jen
// jedno překreslení scény. Žádná textura navíc: šum sněhu a opadávání listí je procedurální.

/**
 * Parametry období pro shadery: A = (sníh, suchá tráva, svěží tráva, mladé listí),
 * B = (listí, podzimní barvy, květy).
 */
interface SeasonShaderState {
  a: [number, number, number, number];
  b: [number, number, number, number];
}

const states = new WeakMap<Scene, SeasonShaderState>();
const REFERENCE_STATE = shaderState(seasonLook(REFERENCE_DAY));

function shaderState(look: SeasonLook): SeasonShaderState {
  return {
    a: [look.snow, look.grassDry, look.grassFresh, look.leafFresh],
    b: [look.leaves, look.leafAutumn, look.blossom, 0],
  };
}

/** Nastaví období pro všechny materiály scény – projeví se při dalším snímku. */
export function setSeasonShaderState(scene: Scene, look: SeasonLook): void {
  states.set(scene, shaderState(look));
}

/** Uniformy období pro materiál (bez nastavení vrcholné léto – vzhled, ke kterému je krajina laděná). */
export function bindSeasonUniforms(uniformBuffer: UniformBuffer, scene: Scene): void {
  const state = states.get(scene) ?? REFERENCE_STATE;
  uniformBuffer.updateFloat4('seasonA', ...state.a);
  uniformBuffer.updateFloat4('seasonB', ...state.b);
}

/** Uniformy období v UBO materiálu (seasonA, seasonB). */
export const SEASON_UBO = [
  { name: 'seasonA', size: 4, type: 'vec4' },
  { name: 'seasonB', size: 4, type: 'vec4' },
];

/** Barva sněhu (gama) – mírně namodralá, ať nesvítí jako papír. */
const SNOW_GAMMA: Rgb = [0.9, 0.92, 0.96];

/**
 * Pomocné funkce shaderů: hash a hodnotový šum (bez textury, bez sin – stejný vzor na všech
 * GPU), sněhová pokrývka bodu země a maska listí (zelené pixely textury – větvičky a kůra jsou
 * hnědé a šedé). Sníh: šum ve dvou měřítkách (22 m závěje, 6 m skvrny) – při tání a sněžení
 * se pokrývka trhá na skvrny, pak je souvislá. Tráva (`veg` = podíl trávy): na jaře svěží, na
 * podzim usychá ve skvrnách (50 m) do slámově hnědé – stejně na terénu i obtiscích polí.
 */
export const SEASON_HELPERS_GLSL = `float seasonHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float seasonNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(seasonHash(i), seasonHash(i + vec2(1.0, 0.0)), u.x),
    mix(seasonHash(i + vec2(0.0, 1.0)), seasonHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float seasonSnowCover(vec2 xz, float amount) {
  float n = 0.65 * seasonNoise(xz * 0.045) + 0.35 * seasonNoise(xz * 0.16 + 17.0);
  return smoothstep(n - 0.08, n + 0.08, amount * 1.35 - 0.2);
}
float seasonLeafMask(vec3 c) {
  return smoothstep(0.04, 0.18, (c.g - max(c.r, c.b)) / max(c.g, 0.04));
}
vec3 seasonGrass(vec3 c, float veg, vec2 xz, vec4 sA) {
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float dryPatch = 0.7 + 0.6 * seasonNoise(xz * 0.02 + 5.0);
  c = mix(c, c * vec3(0.95, 1.06, 0.84), veg * sA.z * 0.8);
  return mix(c, luma * vec3(1.2, 1.04, 0.62), veg * clamp(sA.y * dryPatch, 0.0, 1.0) * 0.9);
}
vec3 seasonSnowColor(vec3 c) {
  return vec3(${SNOW_GAMMA.join(', ')}) * (0.95 + 0.55 * (dot(c, vec3(0.299, 0.587, 0.114)) - 0.42));
}`;

export const SEASON_HELPERS_WGSL = `fn seasonHash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn seasonNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(seasonHash(i), seasonHash(i + vec2f(1.0, 0.0)), u.x),
    mix(seasonHash(i + vec2f(0.0, 1.0)), seasonHash(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn seasonSnowCover(xz: vec2f, amount: f32) -> f32 {
  let n = 0.65 * seasonNoise(xz * 0.045) + 0.35 * seasonNoise(xz * 0.16 + 17.0);
  return smoothstep(n - 0.08, n + 0.08, amount * 1.35 - 0.2);
}
fn seasonLeafMask(c: vec3f) -> f32 {
  return smoothstep(0.04, 0.18, (c.g - max(c.r, c.b)) / max(c.g, 0.04));
}
fn seasonGrass(c: vec3f, veg: f32, xz: vec2f, sA: vec4f) -> vec3f {
  let luma = dot(c, vec3f(0.299, 0.587, 0.114));
  let dryPatch = 0.7 + 0.6 * seasonNoise(xz * 0.02 + 5.0);
  let fresh = mix(c, c * vec3f(0.95, 1.06, 0.84), veg * sA.z * 0.8);
  return mix(fresh, luma * vec3f(1.2, 1.04, 0.62), veg * clamp(sA.y * dryPatch, 0.0, 1.0) * 0.9);
}
fn seasonSnowColor(c: vec3f) -> vec3f {
  return vec3f(${SNOW_GAMMA.join(', ')}) * (0.95 + 0.55 * (dot(c, vec3f(0.299, 0.587, 0.114)) - 0.42));
}`;

/**
 * Náhodné číslo 0–1 instance podle její polohy (z matice instance) – strom od stromu jinak.
 * Kód pluginu nesmí záviset na stavu instance: Babylon si body vložení zjišťuje už v konstruktoru
 * MaterialPluginBase (před polem podtřídy) – druh materiálu proto rozlišují definy.
 */
const SEED_VERTEX_GLSL = {
  CUSTOM_VERTEX_DEFINITIONS: `#ifdef SEASON_SEED
varying float vSeasonSeed;
#endif`,
  CUSTOM_VERTEX_MAIN_END: `#ifdef SEASON_SEED
{
  vec3 seasonP3 = fract(finalWorld[3].xzx * 0.1031);
  seasonP3 += dot(seasonP3, seasonP3.yzx + 33.33);
  vSeasonSeed = fract((seasonP3.x + seasonP3.y) * seasonP3.z);
}
#endif`,
};
const SEED_VERTEX_WGSL = {
  CUSTOM_VERTEX_DEFINITIONS: `#ifdef SEASON_SEED
varying vSeasonSeed: f32;
#endif`,
  CUSTOM_VERTEX_MAIN_END: `#ifdef SEASON_SEED
{
  var seasonP3 = fract(finalWorld[3].xzx * 0.1031);
  seasonP3 = seasonP3 + dot(seasonP3, seasonP3.yzx + 33.33);
  vertexOutputs.vSeasonSeed = fract((seasonP3.x + seasonP3.y) * seasonP3.z);
}
#endif`,
};
const SEED_FRAGMENT_GLSL = `#ifdef SEASON_SEED
varying float vSeasonSeed;
#endif`;
const SEED_FRAGMENT_WGSL = `#ifdef SEASON_SEED
varying vSeasonSeed: f32;
#endif`;

/**
 * Roční období na PBR materiálu stromu, keře, rostliny nebo kamene: listí listnáčů se na
 * podzim barví a opadává (holé větvičky v textuře zůstanou), na jaře raší světlé; na plochy
 * obrácené nahoru napadne sníh. Opakované volání nic nedělá.
 */
export function applySeasonFoliage(material: Material, options: SeasonFoliageOptions): void {
  if (!(material instanceof PBRMaterial)) return;
  if (material.pluginManager?.getPlugin('SeasonPbr')) return;
  new SeasonPbrPlugin(material, options);
}

/** Roční období podle jména modelu (season-foliage.ts) – neznámý model zůstane beze změny. */
export function applySeasonModel(material: Material, model: string): void {
  const options = seasonFoliageFor(model);
  if (options) applySeasonFoliage(material, options);
}

/** Sníh na plochách PBR materiálu obrácených nahoru (střechy). */
export function applySeasonSnow(material: Material, coverage = 1): void {
  applySeasonFoliage(material, { snowTop: coverage });
}

/**
 * Obtisk na zemi (pole, řádky, cesty – StandardMaterial): zelená tráva v něm usychá jako na
 * terénu a v zimě ho zasype sníh stejným vzorem (okraj obtisku nevystoupí); `snowCoverage` < 1
 * nechá obtisk zimou trochu prosvítat.
 */
export function applySeasonGround(material: Material, snowCoverage = 1): void {
  if (!(material instanceof StandardMaterial)) return;
  if (material.pluginManager?.getPlugin('SeasonStandard')) return;
  new SeasonStandardPlugin(material, 'ground', snowCoverage);
}

/** Impostory vnitřku lesa: podzimní barvy, v zimě šedohnědé prořídlé koruny (smrky zůstanou). */
export function applySeasonImpostors(material: StandardMaterial): void {
  if (material.pluginManager?.getPlugin('SeasonStandard')) return;
  new SeasonStandardPlugin(material, 'impostor', 1);
}

/** Plocha korun hluboko v lese: podzimní skvrny, v zimě holé větve se sněhem pod nimi. */
export function applySeasonCanopy(material: StandardMaterial): void {
  if (material.pluginManager?.getPlugin('SeasonStandard')) return;
  new SeasonStandardPlugin(material, 'canopy', 1);
}

function toLinear(color: Rgb): Rgb {
  return [color[0] ** 2.2, color[1] ** 2.2, color[2] ** 2.2];
}

/**
 * PBR (stromy, keře, rostliny, kameny): albedo se upraví hned po výpočtu (CUSTOM_FRAGMENT_
 * UPDATE_ALPHA – v main, kde je známá normála). Albedo PBR je lineární, maska listí se počítá
 * z textury (gama).
 */
class SeasonPbrPlugin extends MaterialPluginBase {
  private readonly autumn: Rgb;
  private readonly options: Required<SeasonFoliageOptions>;

  constructor(material: PBRMaterial, options: SeasonFoliageOptions) {
    super(material, 'SeasonPbr', 250, {
      SEASON_PBR: false,
      SEASON_LEAVES: false,
      SEASON_NEEDLES: false,
      SEASON_SEED: false,
    });
    this.options = {
      deciduous: options.deciduous ?? false,
      autumn: options.autumn ?? [0.7, 0.5, 0.2],
      variation: options.variation ?? 0,
      minLeaves: options.minLeaves ?? 0,
      snowTop: options.snowTop ?? 0,
      barkU: options.barkU ?? [-1, -1],
      blossom: options.blossom ?? 0,
      needles: options.needles ?? false,
    };
    this.autumn = toLinear(this.options.autumn);
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['SEASON_PBR'] = true;
    defines['SEASON_LEAVES'] = this.options.deciduous;
    defines['SEASON_NEEDLES'] = this.options.needles;
    defines['SEASON_SEED'] = this.options.deciduous;
  }

  override getClassName(): string {
    return 'SeasonPbrPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[];
    fragment: string;
  } {
    return {
      ubo: [
        ...SEASON_UBO,
        { name: 'seasonAutumn', size: 4, type: 'vec4' },
        { name: 'seasonOptions', size: 4, type: 'vec4' },
        { name: 'seasonBlossom', size: 1, type: 'float' },
      ],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef SEASON_PBR
uniform seasonA: vec4f;
uniform seasonB: vec4f;
uniform seasonAutumn: vec4f;
uniform seasonOptions: vec4f;
uniform seasonBlossom: f32;
#endif`
          : `#ifdef SEASON_PBR
uniform vec4 seasonA;
uniform vec4 seasonB;
uniform vec4 seasonAutumn;
uniform vec4 seasonOptions;
uniform float seasonBlossom;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    bindSeasonUniforms(uniformBuffer, this._material.getScene());
    const { variation, barkU, minLeaves, snowTop } = this.options;
    uniformBuffer.updateFloat4('seasonAutumn', ...this.autumn, variation);
    uniformBuffer.updateFloat4('seasonOptions', barkU[0], barkU[1], minLeaves, snowTop);
    uniformBuffer.updateFloat('seasonBlossom', this.options.blossom);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') return wgsl ? SEED_VERTEX_WGSL : SEED_VERTEX_GLSL;
    if (shaderType !== 'fragment') return null;
    const code = wgsl ? PBR_WGSL : PBR_GLSL;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SEASON_PBR
${wgsl ? SEED_FRAGMENT_WGSL : SEED_FRAGMENT_GLSL}
${wgsl ? SEASON_HELPERS_WGSL : SEASON_HELPERS_GLSL}
#endif`,
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `#ifdef SEASON_PBR
${code}
#endif`,
    };
  }
}

const linear = (color: Rgb): string =>
  toLinear(color)
    .map((c) => c.toFixed(4))
    .join(', ');
/** Barvy PBR (lineární): sníh, větvičky holé koruny, květy (trnky, hlohu, jabloní). */
const SNOW_LINEAR = linear(SNOW_GAMMA);
const TWIG_LINEAR = linear([0.45, 0.4, 0.36]);
const BLOSSOM_LINEAR = linear([0.97, 0.94, 0.95]);

/**
 * PBR – listnáče (SEASON_LEAVES): každý strom se barví a opadává v trochu jiný čas (náhoda
 * instance). Opadlé listí zmizí, z části zbudou větvičky – řídký šedohnědý závoj v obrysu
 * koruny, jako holý strom z dálky. Kůra a větvičky v textuře s opadem ztratí zelený tón
 * materiálu (jilmy a topoly ho mají kvůli bledému listí) – barva z textury bez tónu. Na
 * jaře světlé mladé listí a u části keřů (a jabloní) květy. Jehličí (SEASON_NEEDLES) pokryje
 * sníh v chomáčích, ostatní plochy podle toho, jak míří nahoru.
 */
const PBR_GLSL = `{
  vec3 seasonLumaW = vec3(0.2126, 0.7152, 0.0722);
  float seasonLuma = dot(surfaceAlbedo, seasonLumaW);
#if defined(SEASON_LEAVES) && defined(ALBEDO)
  float seasonLeaf = seasonLeafMask(albedoTexture.rgb);
  if (vAlbedoUV.x >= seasonOptions.x && vAlbedoUV.x <= seasonOptions.y) seasonLeaf = 0.0;
  float seasonSeedA = vSeasonSeed;
  float seasonSeedB = fract(seasonSeedA * 7.13 + 0.37);
  float seasonAutumnAmount = clamp(seasonB.y * 1.5 - seasonSeedA * 0.5, 0.0, 1.0);
  float seasonKeep = max(clamp(seasonB.x * 1.4 - seasonSeedB * 0.4, 0.0, 1.0), seasonOptions.z);
  float seasonTwig = 0.0;
  if (seasonLeaf > 0.5 && seasonNoise(vAlbedoUV * 23.0 + seasonSeedA * 31.0) * 0.98 + 0.01 > seasonKeep) {
    if (seasonNoise(vAlbedoUV * 61.0 + seasonSeedB * 17.0) > 0.4) discard;
    seasonTwig = 1.0;
  }
  vec3 seasonTint = mix(seasonAutumn.rgb, seasonAutumn.rgb * vec3(1.0, 0.55, 0.4), seasonSeedA * seasonAutumn.a);
  vec3 seasonAutumnColor = seasonTint * (seasonLuma / max(dot(seasonTint, seasonLumaW), 0.01)) * 1.3;
  // suché listí, které zůstalo přes zimu (mladé buky a duby, rákos), vybledne do hnědé
  seasonAutumnColor = mix(seasonAutumnColor, vec3(seasonLuma) * vec3(1.35, 1.05, 0.75), (1.0 - seasonB.x) * 0.6);
  surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * vec3(1.04, 1.12, 0.7), seasonLeaf * seasonA.w);
  surfaceAlbedo = mix(surfaceAlbedo, seasonAutumnColor, seasonLeaf * seasonAutumnAmount);
  vec3 seasonBark = vec3(dot(pow(albedoTexture.rgb, vec3(2.2)), seasonLumaW)) * vec3(1.4, 1.27, 1.14);
  surfaceAlbedo = mix(surfaceAlbedo, seasonBark, (1.0 - step(0.5, seasonLeaf)) * (1.0 - seasonKeep));
  surfaceAlbedo = mix(surfaceAlbedo, vec3(${TWIG_LINEAR}) * (0.6 + 2.5 * seasonLuma), seasonTwig);
  float seasonBloom = seasonB.z * step(seasonSeedB, seasonBlossom) * seasonLeaf * (1.0 - seasonTwig) * smoothstep(0.45, 0.62, seasonNoise(vAlbedoUV * 160.0 + seasonSeedA * 5.0));
  surfaceAlbedo = mix(surfaceAlbedo, vec3(${BLOSSOM_LINEAR}) * (0.6 + 1.5 * seasonLuma), seasonBloom * 0.85);
#endif
  if (seasonA.x > 0.0 && seasonOptions.w > 0.0) {
#if defined(SEASON_NEEDLES) && defined(ALBEDO)
    float seasonFacing = smoothstep(-0.3, 0.6, normalW.y) * smoothstep(0.38, 0.62, seasonNoise(vAlbedoUV * 9.0 + vPositionW.xz * 0.05));
#else
    float seasonFacing = smoothstep(0.2, 0.75, normalW.y);
#endif
    float seasonCover = seasonSnowCover(vPositionW.xz, seasonA.x) * seasonFacing * seasonOptions.w;
    surfaceAlbedo = mix(surfaceAlbedo, vec3(${SNOW_LINEAR}) * (0.85 + 0.5 * seasonLuma), seasonCover);
  }
}`;

const PBR_WGSL = `{
  let seasonLumaW = vec3f(0.2126, 0.7152, 0.0722);
  let seasonLuma = dot(surfaceAlbedo, seasonLumaW);
#if defined(SEASON_LEAVES) && defined(ALBEDO)
  var seasonLeaf = seasonLeafMask(albedoTexture.rgb);
  let seasonUv = fragmentInputs.vAlbedoUV;
  if (seasonUv.x >= uniforms.seasonOptions.x && seasonUv.x <= uniforms.seasonOptions.y) { seasonLeaf = 0.0; }
  let seasonSeedA = fragmentInputs.vSeasonSeed;
  let seasonSeedB = fract(seasonSeedA * 7.13 + 0.37);
  let seasonAutumnAmount = clamp(uniforms.seasonB.y * 1.5 - seasonSeedA * 0.5, 0.0, 1.0);
  let seasonKeep = max(clamp(uniforms.seasonB.x * 1.4 - seasonSeedB * 0.4, 0.0, 1.0), uniforms.seasonOptions.z);
  var seasonTwig = 0.0;
  if (seasonLeaf > 0.5 && seasonNoise(seasonUv * 23.0 + seasonSeedA * 31.0) * 0.98 + 0.01 > seasonKeep) {
    if (seasonNoise(seasonUv * 61.0 + seasonSeedB * 17.0) > 0.4) { discard; }
    seasonTwig = 1.0;
  }
  let seasonTint = mix(uniforms.seasonAutumn.rgb, uniforms.seasonAutumn.rgb * vec3f(1.0, 0.55, 0.4), seasonSeedA * uniforms.seasonAutumn.a);
  let seasonAutumnColor = mix(seasonTint * (seasonLuma / max(dot(seasonTint, seasonLumaW), 0.01)) * 1.3, vec3f(seasonLuma) * vec3f(1.35, 1.05, 0.75), (1.0 - uniforms.seasonB.x) * 0.6);
  surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * vec3f(1.04, 1.12, 0.7), seasonLeaf * uniforms.seasonA.w);
  surfaceAlbedo = mix(surfaceAlbedo, seasonAutumnColor, seasonLeaf * seasonAutumnAmount);
  let seasonBark = vec3f(dot(pow(albedoTexture.rgb, vec3f(2.2)), seasonLumaW)) * vec3f(1.4, 1.27, 1.14);
  surfaceAlbedo = mix(surfaceAlbedo, seasonBark, (1.0 - step(0.5, seasonLeaf)) * (1.0 - seasonKeep));
  surfaceAlbedo = mix(surfaceAlbedo, vec3f(${TWIG_LINEAR}) * (0.6 + 2.5 * seasonLuma), seasonTwig);
  let seasonBloom = uniforms.seasonB.z * step(seasonSeedB, uniforms.seasonBlossom) * seasonLeaf * (1.0 - seasonTwig) * smoothstep(0.45, 0.62, seasonNoise(seasonUv * 160.0 + seasonSeedA * 5.0));
  surfaceAlbedo = mix(surfaceAlbedo, vec3f(${BLOSSOM_LINEAR}) * (0.6 + 1.5 * seasonLuma), seasonBloom * 0.85);
#endif
  if (uniforms.seasonA.x > 0.0 && uniforms.seasonOptions.w > 0.0) {
#if defined(SEASON_NEEDLES) && defined(ALBEDO)
    let seasonFacing = smoothstep(-0.3, 0.6, normalW.y) * smoothstep(0.38, 0.62, seasonNoise(fragmentInputs.vAlbedoUV * 9.0 + fragmentInputs.vPositionW.xz * 0.05));
#else
    let seasonFacing = smoothstep(0.2, 0.75, normalW.y);
#endif
    let seasonCover = seasonSnowCover(fragmentInputs.vPositionW.xz, uniforms.seasonA.x) * seasonFacing * uniforms.seasonOptions.w;
    surfaceAlbedo = mix(surfaceAlbedo, vec3f(${SNOW_LINEAR}) * (0.85 + 0.5 * seasonLuma), seasonCover);
  }
}`;

type StandardMode = 'ground' | 'impostor' | 'canopy';

/**
 * StandardMaterial (obtisky polí a cest, impostory, plocha korun): barva se upraví po textuře
 * a barvě vrcholů / instance (CUSTOM_FRAGMENT_UPDATE_DIFFUSE, gama prostor).
 */
class SeasonStandardPlugin extends MaterialPluginBase {
  constructor(
    material: StandardMaterial,
    private readonly mode: StandardMode,
    private readonly coverage: number,
  ) {
    super(material, 'SeasonStandard', 250, {
      SEASON_STD: false,
      SEASON_STD_GROUND: false,
      SEASON_STD_IMPOSTOR: false,
      SEASON_STD_CANOPY: false,
      SEASON_SEED: false,
    });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['SEASON_STD'] = true;
    defines['SEASON_STD_GROUND'] = this.mode === 'ground';
    defines['SEASON_STD_IMPOSTOR'] = this.mode === 'impostor';
    defines['SEASON_STD_CANOPY'] = this.mode === 'canopy';
    defines['SEASON_SEED'] = this.mode === 'impostor';
  }

  override getClassName(): string {
    return 'SeasonStandardPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[];
    fragment: string;
  } {
    return {
      ubo: [...SEASON_UBO, { name: 'seasonCoverage', size: 1, type: 'float' }],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef SEASON_STD
uniform seasonA: vec4f;
uniform seasonB: vec4f;
uniform seasonCoverage: f32;
#endif`
          : `#ifdef SEASON_STD
uniform vec4 seasonA;
uniform vec4 seasonB;
uniform float seasonCoverage;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    bindSeasonUniforms(uniformBuffer, this._material.getScene());
    uniformBuffer.updateFloat('seasonCoverage', this.coverage);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') return wgsl ? SEED_VERTEX_WGSL : SEED_VERTEX_GLSL;
    if (shaderType !== 'fragment') return null;
    const code = wgsl ? STANDARD_WGSL : STANDARD_GLSL;
    const modes = `#ifdef SEASON_STD_GROUND
${code.ground}
#endif
#ifdef SEASON_STD_IMPOSTOR
${code.impostor}
#endif
#ifdef SEASON_STD_CANOPY
${code.canopy}
#endif`;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SEASON_STD
${wgsl ? SEED_FRAGMENT_WGSL : SEED_FRAGMENT_GLSL}
${wgsl ? SEASON_HELPERS_WGSL : SEASON_HELPERS_GLSL}
#endif`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef SEASON_STD
${modes}
#endif`,
    };
  }
}

/**
 * Kód podle druhu materiálu (gama prostor, `baseColor` už s barvou vrcholů / instance):
 * - ground: obtisk na zemi – tráva (zelené pixely) usychá a sníh jako na terénu,
 * - impostor: horní řada atlasu jsou smrky (beze změny), listnáče se na podzim barví podle
 *   stromu a v zimě z koruny zbudou šedohnědé prořídlé větve,
 * - canopy: plocha korun – podzimní skvrny, v zimě holé větve a mezi nimi sníh.
 */
const STANDARD_GLSL: Record<StandardMode, string> = {
  ground: `if (seasonA.y > 0.0 || seasonA.z > 0.0) {
  float seasonVeg = smoothstep(0.0, 0.12, (baseColor.g - max(baseColor.r, baseColor.b)) / max(baseColor.g, 0.04));
  baseColor.rgb = seasonGrass(baseColor.rgb, seasonVeg, vPositionW.xz, seasonA);
}
if (seasonA.x > 0.0) {
  float seasonCover = seasonSnowCover(vPositionW.xz, seasonA.x) * seasonCoverage;
  baseColor.rgb = mix(baseColor.rgb, seasonSnowColor(baseColor.rgb), seasonCover);
}`,
  impostor: `{
  float seasonEvergreen = step(0.75, vDiffuseUV.y);
  float seasonLeaf = seasonLeafMask(baseColor.rgb) * (1.0 - seasonEvergreen);
  float seasonSeedA = vSeasonSeed;
  float seasonSeedB = fract(seasonSeedA * 7.13 + 0.37);
  float seasonAutumnAmount = clamp(seasonB.y * 1.5 - seasonSeedA * 0.5, 0.0, 1.0);
  float seasonKeep = clamp(seasonB.x * 1.4 - seasonSeedB * 0.4, 0.0, 1.0);
  float seasonLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 seasonTint = mix(vec3(0.86, 0.7, 0.28), vec3(0.72, 0.4, 0.18), seasonSeedA);
  vec3 seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3(0.299, 0.587, 0.114))) * 1.15;
  baseColor.rgb = mix(baseColor.rgb, baseColor.rgb * vec3(1.03, 1.1, 0.75), seasonLeaf * seasonA.w);
  baseColor.rgb = mix(baseColor.rgb, seasonAutumnColor, seasonLeaf * seasonAutumnAmount);
  float seasonBare = seasonLeaf * (1.0 - seasonKeep);
  if (seasonBare > 0.3 && seasonNoise(vDiffuseUV * 220.0 + seasonSeedA * 17.0) < seasonBare * 0.6) discard;
  baseColor.rgb = mix(baseColor.rgb, vec3(0.36, 0.32, 0.3) * (0.7 + 1.2 * seasonLuma), seasonBare);
  // sníh na smrcích – chomáče na větvích
  float seasonFlakes = seasonEvergreen * smoothstep(0.5, 0.72, seasonNoise(vDiffuseUV * 300.0 + seasonSeedA * 11.0));
  baseColor.rgb = mix(baseColor.rgb, seasonSnowColor(baseColor.rgb), seasonSnowCover(vPositionW.xz, seasonA.x) * seasonFlakes * 0.8);
}`,
  canopy: `{
  float seasonLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
  float seasonPatch = seasonNoise(vPositionW.xz * 0.08);
  float seasonAutumnAmount = clamp(seasonB.y * 1.5 - seasonPatch * 0.5, 0.0, 1.0);
  float seasonKeep = clamp(seasonB.x * 1.4 - (1.0 - seasonPatch) * 0.4, 0.0, 1.0);
  vec3 seasonTint = mix(vec3(0.86, 0.7, 0.28), vec3(0.72, 0.4, 0.18), seasonNoise(vPositionW.xz * 0.05 + 3.0));
  vec3 seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3(0.299, 0.587, 0.114))) * 1.1;
  baseColor.rgb = mix(baseColor.rgb, baseColor.rgb * vec3(1.03, 1.1, 0.75), seasonA.w);
  baseColor.rgb = mix(baseColor.rgb, seasonAutumnColor, seasonAutumnAmount);
  vec3 seasonBranches = vec3(0.3, 0.27, 0.25) * (0.6 + 1.4 * seasonLuma);
  float seasonGround = seasonSnowCover(vPositionW.xz, seasonA.x) * smoothstep(0.25, 0.75, seasonNoise(vPositionW.xz * 0.9));
  baseColor.rgb = mix(baseColor.rgb, mix(seasonBranches, seasonSnowColor(baseColor.rgb) * 0.75, seasonGround), 1.0 - seasonKeep);
}`,
};

const STANDARD_WGSL: Record<StandardMode, string> = {
  ground: `if (uniforms.seasonA.y > 0.0 || uniforms.seasonA.z > 0.0) {
  let seasonVeg = smoothstep(0.0, 0.12, (baseColor.g - max(baseColor.r, baseColor.b)) / max(baseColor.g, 0.04));
  baseColor = vec4f(seasonGrass(baseColor.rgb, seasonVeg, fragmentInputs.vPositionW.xz, uniforms.seasonA), baseColor.a);
}
if (uniforms.seasonA.x > 0.0) {
  let seasonCover = seasonSnowCover(fragmentInputs.vPositionW.xz, uniforms.seasonA.x) * uniforms.seasonCoverage;
  baseColor = vec4f(mix(baseColor.rgb, seasonSnowColor(baseColor.rgb), seasonCover), baseColor.a);
}`,
  impostor: `{
  let seasonEvergreen = step(0.75, fragmentInputs.vDiffuseUV.y);
  let seasonLeaf = seasonLeafMask(baseColor.rgb) * (1.0 - seasonEvergreen);
  let seasonSeedA = fragmentInputs.vSeasonSeed;
  let seasonSeedB = fract(seasonSeedA * 7.13 + 0.37);
  let seasonAutumnAmount = clamp(uniforms.seasonB.y * 1.5 - seasonSeedA * 0.5, 0.0, 1.0);
  let seasonKeep = clamp(uniforms.seasonB.x * 1.4 - seasonSeedB * 0.4, 0.0, 1.0);
  let seasonLuma = dot(baseColor.rgb, vec3f(0.299, 0.587, 0.114));
  let seasonTint = mix(vec3f(0.86, 0.7, 0.28), vec3f(0.72, 0.4, 0.18), seasonSeedA);
  let seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3f(0.299, 0.587, 0.114))) * 1.15;
  var seasonColor = mix(baseColor.rgb, baseColor.rgb * vec3f(1.03, 1.1, 0.75), seasonLeaf * uniforms.seasonA.w);
  seasonColor = mix(seasonColor, seasonAutumnColor, seasonLeaf * seasonAutumnAmount);
  let seasonBare = seasonLeaf * (1.0 - seasonKeep);
  if (seasonBare > 0.3 && seasonNoise(fragmentInputs.vDiffuseUV * 220.0 + seasonSeedA * 17.0) < seasonBare * 0.6) {
    discard;
  }
  seasonColor = mix(seasonColor, vec3f(0.36, 0.32, 0.3) * (0.7 + 1.2 * seasonLuma), seasonBare);
  let seasonFlakes = seasonEvergreen * smoothstep(0.5, 0.72, seasonNoise(fragmentInputs.vDiffuseUV * 300.0 + seasonSeedA * 11.0));
  seasonColor = mix(seasonColor, seasonSnowColor(seasonColor), seasonSnowCover(fragmentInputs.vPositionW.xz, uniforms.seasonA.x) * seasonFlakes * 0.8);
  baseColor = vec4f(seasonColor, baseColor.a);
}`,
  canopy: `{
  let seasonLuma = dot(baseColor.rgb, vec3f(0.299, 0.587, 0.114));
  let seasonXz = fragmentInputs.vPositionW.xz;
  let seasonPatch = seasonNoise(seasonXz * 0.08);
  let seasonAutumnAmount = clamp(uniforms.seasonB.y * 1.5 - seasonPatch * 0.5, 0.0, 1.0);
  let seasonKeep = clamp(uniforms.seasonB.x * 1.4 - (1.0 - seasonPatch) * 0.4, 0.0, 1.0);
  let seasonTint = mix(vec3f(0.86, 0.7, 0.28), vec3f(0.72, 0.4, 0.18), seasonNoise(seasonXz * 0.05 + 3.0));
  let seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3f(0.299, 0.587, 0.114))) * 1.1;
  var seasonColor = mix(baseColor.rgb, baseColor.rgb * vec3f(1.03, 1.1, 0.75), uniforms.seasonA.w);
  seasonColor = mix(seasonColor, seasonAutumnColor, seasonAutumnAmount);
  let seasonBranches = vec3f(0.3, 0.27, 0.25) * (0.6 + 1.4 * seasonLuma);
  let seasonGround = seasonSnowCover(seasonXz, uniforms.seasonA.x) * smoothstep(0.25, 0.75, seasonNoise(seasonXz * 0.9));
  seasonColor = mix(seasonColor, mix(seasonBranches, seasonSnowColor(baseColor.rgb) * 0.75, seasonGround), 1.0 - seasonKeep);
  baseColor = vec4f(seasonColor, baseColor.a);
}`,
};
