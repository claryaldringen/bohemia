import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
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
 * B = (listí, podzimní barvy, květy, led na vodě), C = počasí roku (sucho, mokro, jinovatka, mokrá
 * zem a kaluže – `setPuddles`).
 */
interface SeasonShaderState {
  a: [number, number, number, number];
  b: [number, number, number, number];
  c: [number, number, number, number];
}

const states = new WeakMap<Scene, SeasonShaderState>();
const REFERENCE_STATE = shaderState(seasonLook(REFERENCE_DAY));

function shaderState(look: SeasonLook): SeasonShaderState {
  return {
    a: [look.snow, look.grassDry, look.grassFresh, look.leafFresh],
    b: [look.leaves, look.leafAutumn, look.blossom, look.ice],
    c: [look.drought, look.wet, look.frost, 0],
  };
}

/** Mokrá zem a kaluže 0–1 (`seasonC.w`) – déšť a deštivé léto (rain.ts – `puddleAmount`). */
const puddles = new WeakMap<Scene, number>();

/** Nastaví období pro všechny materiály scény – projeví se při dalším snímku. */
export function setSeasonShaderState(scene: Scene, look: SeasonLook): void {
  const state = shaderState(look);
  state.c[3] = puddles.get(scene) ?? 0;
  states.set(scene, state);
}

/** Nastaví mokrou zem a kaluže 0–1 pro materiály scény – projeví se při dalším snímku. */
export function setPuddles(scene: Scene, amount: number): void {
  puddles.set(scene, amount);
  const state = states.get(scene);
  if (state) state.c[3] = amount;
}

/** Uniformy období pro materiál (bez nastavení vrcholné léto – vzhled, ke kterému je krajina laděná). */
export function bindSeasonUniforms(uniformBuffer: UniformBuffer, scene: Scene): void {
  const state = states.get(scene) ?? REFERENCE_STATE;
  uniformBuffer.updateFloat4('seasonA', ...state.a);
  uniformBuffer.updateFloat4('seasonB', ...state.b);
  uniformBuffer.updateFloat4('seasonC', ...state.c);
}

/** Uniformy období v UBO materiálu (seasonA, seasonB, seasonC). */
export const SEASON_UBO = [
  { name: 'seasonA', size: 4, type: 'vec4' },
  { name: 'seasonB', size: 4, type: 'vec4' },
  { name: 'seasonC', size: 4, type: 'vec4' },
];

/** Barva sněhu (gama) – mírně namodralá, ať nesvítí jako papír. */
const SNOW_GAMMA: Rgb = [0.9, 0.92, 0.96];

/**
 * Pomocné funkce shaderů: hash a hodnotový šum (bez textury, bez sin – stejný vzor na všech
 * GPU), sněhová pokrývka bodu země a maska listí (zelené pixely textury – větvičky a kůra jsou
 * hnědé a šedé). Sníh: šum ve dvou měřítkách (22 m závěje, 6 m skvrny) – při tání a sněžení
 * se pokrývka trhá na skvrny, pak je souvislá; na strmém svahu neleží (`seasonSnowSlope` podle
 * svislé složky normály – terén i tvary na zemi). Tráva (`veg` = podíl trávy): na jaře svěží, na
 * podzim usychá ve skvrnách (50 m) do slámově hnědé – stejně na terénu i obtiscích polí. Počasí
 * roku (`sC`): v mokru tmavší a sytější zeleň, v suchu tráva usychá jako na podzim (× 0,65)
 * a navíc spálená hněď ve skvrnách (≈ 33 m), v holomrazu šedobílá jinovatka na trávě i zemi.
 * Obtisky vsi dostávají poloviční sucho – díly polí žloutnou podle ochrany dílu barvou vrcholů
 * (field-look.ts – `droughtPartTint`).
 */
/**
 * Kaluže (deštivé léto – `seasonC.w` = mokrá zem 0–1, `setPuddles`): na holé zemi (cesty,
 * vyšlapaná tráva, břeh a bahno v nivě) tmavší mokrá hlína a kaluže ve skvrnách ≈ 5 m – šedé,
 * s odrazem oblohy; čím víc mokra, tím víc kaluží (šum nad PUDDLE_EDGE − PUDDLE_SPREAD × mokro).
 */
const PUDDLE_EDGE = '0.78';
const PUDDLE_SPREAD = '0.12';
const PUDDLE_DAMP = '0.22';
const PUDDLE_SKY = '0.5, 0.55, 0.6';

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
float seasonSnowSlope(float normalY) {
  return smoothstep(0.55, 0.8, normalY);
}
float seasonLeafMask(vec3 c) {
  return smoothstep(0.04, 0.18, (c.g - max(c.r, c.b)) / max(c.g, 0.04));
}
vec3 seasonGrass(vec3 c, float veg, vec2 xz, vec4 sA, vec4 sC) {
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float dryPatch = 0.7 + 0.6 * seasonNoise(xz * 0.02 + 5.0);
  c = mix(c, c * vec3(0.95, 1.06, 0.84), veg * sA.z * 0.8);
  c = mix(c, c * vec3(0.8, 0.93, 0.72), veg * sC.y * 0.7);
  c = mix(c, luma * vec3(1.2, 1.04, 0.62), veg * clamp((sA.y + sC.x * 0.65) * dryPatch, 0.0, 1.0) * 0.9);
  float burnt = smoothstep(0.4, 0.75, seasonNoise(xz * 0.03 + 11.0));
  c = mix(c, luma * vec3(1.3, 0.98, 0.6), veg * sC.x * burnt * 0.7);
  float rime = sC.z * (0.5 + 0.2 * seasonNoise(xz * 0.25 + 3.0));
  return mix(c, vec3(0.8, 0.83, 0.87) * (0.8 + 0.4 * luma), rime);
}
vec3 seasonSnowColor(vec3 c) {
  return vec3(${SNOW_GAMMA.join(', ')}) * (0.95 + 0.55 * (dot(c, vec3(0.299, 0.587, 0.114)) - 0.42));
}
vec3 seasonPuddle(vec3 c, vec2 xz, float ground, float wetness) {
  float n = 0.65 * seasonNoise(xz * 0.21) + 0.35 * seasonNoise(xz * 0.83 + 7.0);
  float edge = ${PUDDLE_EDGE} - ${PUDDLE_SPREAD} * wetness;
  float puddle = smoothstep(edge, edge + 0.04, n) * smoothstep(0.25, 0.6, ground);
  vec3 wet = c * (1.0 - ${PUDDLE_DAMP} * wetness * ground);
  return mix(wet, mix(c * 0.4, vec3(${PUDDLE_SKY}), 0.55), puddle * 0.85);
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
fn seasonSnowSlope(normalY: f32) -> f32 {
  return smoothstep(0.55, 0.8, normalY);
}
fn seasonLeafMask(c: vec3f) -> f32 {
  return smoothstep(0.04, 0.18, (c.g - max(c.r, c.b)) / max(c.g, 0.04));
}
fn seasonGrass(c: vec3f, veg: f32, xz: vec2f, sA: vec4f, sC: vec4f) -> vec3f {
  let luma = dot(c, vec3f(0.299, 0.587, 0.114));
  let dryPatch = 0.7 + 0.6 * seasonNoise(xz * 0.02 + 5.0);
  let fresh = mix(c, c * vec3f(0.95, 1.06, 0.84), veg * sA.z * 0.8);
  let lush = mix(fresh, fresh * vec3f(0.8, 0.93, 0.72), veg * sC.y * 0.7);
  let dry = mix(lush, luma * vec3f(1.2, 1.04, 0.62), veg * clamp((sA.y + sC.x * 0.65) * dryPatch, 0.0, 1.0) * 0.9);
  let burnt = smoothstep(0.4, 0.75, seasonNoise(xz * 0.03 + 11.0));
  let scorched = mix(dry, luma * vec3f(1.3, 0.98, 0.6), veg * sC.x * burnt * 0.7);
  let rime = sC.z * (0.5 + 0.2 * seasonNoise(xz * 0.25 + 3.0));
  return mix(scorched, vec3f(0.8, 0.83, 0.87) * (0.8 + 0.4 * luma), rime);
}
fn seasonSnowColor(c: vec3f) -> vec3f {
  return vec3f(${SNOW_GAMMA.join(', ')}) * (0.95 + 0.55 * (dot(c, vec3f(0.299, 0.587, 0.114)) - 0.42));
}
fn seasonPuddle(c: vec3f, xz: vec2f, ground: f32, wetness: f32) -> vec3f {
  let n = 0.65 * seasonNoise(xz * 0.21) + 0.35 * seasonNoise(xz * 0.83 + 7.0);
  let edge = ${PUDDLE_EDGE} - ${PUDDLE_SPREAD} * wetness;
  let puddle = smoothstep(edge, edge + 0.04, n) * smoothstep(0.25, 0.6, ground);
  let wet = c * (1.0 - ${PUDDLE_DAMP} * wetness * ground);
  return mix(wet, mix(c * 0.4, vec3f(${PUDDLE_SKY}), 0.55), puddle * 0.85);
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
 * nechá obtisk zimou trochu prosvítat. `puddles` – za deště kaluže na holé zemi obtisku (cesty;
 * pole ne – zralé obilí by ve skvrnách zešedlo).
 */
export function applySeasonGround(material: Material, snowCoverage = 1, puddles = false): void {
  if (!(material instanceof StandardMaterial)) return;
  if (material.pluginManager?.getPlugin('SeasonStandard')) return;
  new SeasonStandardPlugin(material, 'ground', snowCoverage, puddles);
}

/**
 * Tvar na zemi se StandardMaterial (mohyly hřbitova, kůl na mohyle): sníh jako na terénu –
 * stejný šum a časování, na strmých plochách méně (sklon jako terén) a nasvícený jako terén:
 * bez vlastní barvy (`diffuseColor`) a okolního světla (`ambientColor`) materiálu, ať tvar pod
 * sněhem nevystoupí ze zasněžené plochy kolem. `snowCoverage` < 1 nechá tvar zimou prosvítat.
 */
export function applySeasonRelief(material: Material, snowCoverage = 1): void {
  if (!(material instanceof StandardMaterial)) return;
  if (material.pluginManager?.getPlugin('SeasonStandard')) return;
  new SeasonStandardPlugin(material, 'relief', snowCoverage);
}

/** Letní a zimní atlas impostorů (stejné buňky) – zimní se načítá na pozadí. */
export interface ImpostorAtlases {
  summer: Texture;
  /** Zimní atlas (holé listnáče, smrky se sněhem), null dokud se nenačte – pak jen letní. */
  winter: Texture | null;
}

/**
 * Impostory vnitřku lesa: listnáče s opadem listí přejdou po pixelech na zimní atlas (holé
 * kmeny a větve, pod nimi je vidět zasněžená zem), smrky se sněhem; na podzim se letní obrázek
 * listnáčů barví. Barvu i alfu bere z vlastních samplerů – `diffuseTexture` materiálu tak může
 * nést atlas pro stínovou mapu (v zimě zimní, ať stín vrhají holé koruny).
 */
export function applySeasonImpostors(material: StandardMaterial, atlases: ImpostorAtlases): void {
  if (material.pluginManager?.getPlugin('SeasonImpostor')) return;
  new SeasonImpostorPlugin(material, atlases);
}

/**
 * Plocha korun hluboko v lese: podzimní skvrny, s opadem listí po skvrnách mizí – v zimě je
 * pod holými impostory vidět zasněžená zem.
 */
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
uniform seasonC: vec4f;
uniform seasonAutumn: vec4f;
uniform seasonOptions: vec4f;
uniform seasonBlossom: f32;
#endif`
          : `#ifdef SEASON_PBR
uniform vec4 seasonA;
uniform vec4 seasonB;
uniform vec4 seasonC;
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
/**
 * Násobek počasí (`seasonC` = sucho, mokro, jinovatka) pro obtisky vsi na zemi: poloviční sucho
 * – díly polí barví `droughtPartTint` podle ochrany, tráva obtisku by jinak zežloutla dvakrát.
 */
const DECAL_WEATHER = [0.5, 1, 1, 1] as const;
const DECAL_WEATHER_GLSL = `vec4(${DECAL_WEATHER.map((v) => v.toFixed(1)).join(', ')})`;
const DECAL_WEATHER_WGSL = `vec4f(${DECAL_WEATHER.map((v) => v.toFixed(1)).join(', ')})`;
/** Barvy PBR (lineární): sníh, větvičky holé koruny, květy (trnky, hlohu, jabloní). */
const SNOW_LINEAR = linear(SNOW_GAMMA);
const TWIG_LINEAR = linear([0.37, 0.34, 0.31]);
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
    if (seasonNoise(vAlbedoUV * 61.0 + seasonSeedB * 17.0) > 0.3) discard;
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
    if (seasonNoise(seasonUv * 61.0 + seasonSeedB * 17.0) > 0.3) { discard; }
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

type StandardMode = 'ground' | 'canopy' | 'relief';

/**
 * StandardMaterial (obtisky polí a cest, plocha korun, mohyly): barva se upraví po textuře
 * a barvě vrcholů / instance (CUSTOM_FRAGMENT_UPDATE_DIFFUSE, gama prostor); tvar na zemi
 * (relief) až po osvětlení (CUSTOM_FRAGMENT_BEFORE_FOG).
 */
class SeasonStandardPlugin extends MaterialPluginBase {
  constructor(
    material: StandardMaterial,
    private readonly mode: StandardMode,
    private readonly coverage: number,
    private readonly puddles = false,
  ) {
    super(material, 'SeasonStandard', 250, {
      SEASON_STD: false,
      SEASON_STD_GROUND: false,
      SEASON_STD_PUDDLES: false,
      SEASON_STD_CANOPY: false,
      SEASON_STD_RELIEF: false,
    });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['SEASON_STD'] = true;
    defines['SEASON_STD_GROUND'] = this.mode === 'ground';
    defines['SEASON_STD_PUDDLES'] = this.puddles;
    defines['SEASON_STD_CANOPY'] = this.mode === 'canopy';
    defines['SEASON_STD_RELIEF'] = this.mode === 'relief';
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
uniform seasonC: vec4f;
uniform seasonCoverage: f32;
#endif`
          : `#ifdef SEASON_STD
uniform vec4 seasonA;
uniform vec4 seasonB;
uniform vec4 seasonC;
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
    if (shaderType !== 'fragment') return null;
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    const code = wgsl ? STANDARD_WGSL : STANDARD_GLSL;
    const modes = `#ifdef SEASON_STD_GROUND
${code.ground}
#endif
#ifdef SEASON_STD_CANOPY
${code.canopy}
#endif`;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SEASON_STD
${wgsl ? SEASON_HELPERS_WGSL : SEASON_HELPERS_GLSL}
#endif`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef SEASON_STD
${modes}
#endif`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `#ifdef SEASON_STD_RELIEF
${code.relief}
#endif`,
    };
  }
}

/**
 * Tvar na zemi (relief) – po osvětlení, před oparem: zasněžený pixel má barvu sněhu nasvícenou
 * jako terén (`diffuseBase` se stíny, bez vlastní barvy a okolního světla materiálu – terén je
 * nemá), jas sněhu podle barvy povrchu jako všude (`seasonSnowColor`). Šum a sklon jako terén.
 */
const RELIEF_GLSL = `if (seasonA.x > 0.0) {
  float seasonCover = seasonSnowCover(vPositionW.xz, seasonA.x) * seasonSnowSlope(normalW.y) * seasonCoverage;
  color.rgb = mix(color.rgb, clamp(diffuseBase, 0.0, 1.0) * seasonSnowColor(baseColor.rgb * diffuseColor), seasonCover);
}`;
const RELIEF_WGSL = `if (uniforms.seasonA.x > 0.0) {
  let seasonCover = seasonSnowCover(fragmentInputs.vPositionW.xz, uniforms.seasonA.x) * seasonSnowSlope(normalW.y) * uniforms.seasonCoverage;
  color = vec4f(mix(color.rgb, clamp(diffuseBase, vec3f(0.0), vec3f(1.0)) * seasonSnowColor(baseColor.rgb * diffuseColor), seasonCover), color.a);
}`;

/**
 * Kód podle druhu materiálu (gama prostor, `baseColor` už s barvou vrcholů / instance):
 * - ground: obtisk na zemi – tráva (zelené pixely) usychá a sníh jako na terénu,
 * - relief: tvar na zemi – jen sníh jako na terénu (RELIEF_GLSL, až po osvětlení),
 * - canopy: plocha korun – podzimní skvrny, s opadem listí mizí po skvrnách (12 m) a drobných
 *   dírách (2,5 m), v zimě úplně – pod holými stromy je vidět zem.
 */
const STANDARD_GLSL: Record<StandardMode, string> = {
  ground: `if (seasonA.y > 0.0 || seasonA.z > 0.0 || seasonC.x > 0.0 || seasonC.y > 0.0 || seasonC.z > 0.0) {
  float seasonVeg = smoothstep(0.0, 0.12, (baseColor.g - max(baseColor.r, baseColor.b)) / max(baseColor.g, 0.04));
  baseColor.rgb = seasonGrass(baseColor.rgb, seasonVeg, vPositionW.xz, seasonA, seasonC * ${DECAL_WEATHER_GLSL});
}
#ifdef SEASON_STD_PUDDLES
if (seasonC.w > 0.0) {
  float seasonBare = 1.0 - smoothstep(0.0, 0.12, (baseColor.g - max(baseColor.r, baseColor.b)) / max(baseColor.g, 0.04));
  baseColor.rgb = seasonPuddle(baseColor.rgb, vPositionW.xz, seasonBare, seasonC.w);
}
#endif
if (seasonA.x > 0.0) {
  float seasonCover = seasonSnowCover(vPositionW.xz, seasonA.x) * seasonCoverage;
  baseColor.rgb = mix(baseColor.rgb, seasonSnowColor(baseColor.rgb), seasonCover);
}`,
  relief: RELIEF_GLSL,
  canopy: `{
  float seasonLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
  float seasonPatch = seasonNoise(vPositionW.xz * 0.08);
  float seasonAutumnAmount = clamp(seasonB.y * 1.5 - seasonPatch * 0.5, 0.0, 1.0);
  float seasonKeep = clamp(seasonB.x * 1.4 - (1.0 - seasonPatch) * 0.4, 0.0, 1.0);
  vec3 seasonTint = mix(vec3(0.86, 0.7, 0.28), vec3(0.72, 0.4, 0.18), seasonNoise(vPositionW.xz * 0.05 + 3.0));
  vec3 seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3(0.299, 0.587, 0.114))) * 1.1;
  if (seasonNoise(vPositionW.xz * 0.4) * 0.98 + 0.01 > seasonKeep) discard;
  baseColor.rgb = mix(baseColor.rgb, baseColor.rgb * vec3(1.03, 1.1, 0.75), seasonA.w);
  baseColor.rgb = mix(baseColor.rgb, seasonAutumnColor, seasonAutumnAmount);
}`,
};

const STANDARD_WGSL: Record<StandardMode, string> = {
  ground: `if (uniforms.seasonA.y > 0.0 || uniforms.seasonA.z > 0.0 || uniforms.seasonC.x > 0.0 || uniforms.seasonC.y > 0.0 || uniforms.seasonC.z > 0.0) {
  let seasonVeg = smoothstep(0.0, 0.12, (baseColor.g - max(baseColor.r, baseColor.b)) / max(baseColor.g, 0.04));
  baseColor = vec4f(seasonGrass(baseColor.rgb, seasonVeg, fragmentInputs.vPositionW.xz, uniforms.seasonA, uniforms.seasonC * ${DECAL_WEATHER_WGSL}), baseColor.a);
}
#ifdef SEASON_STD_PUDDLES
if (uniforms.seasonC.w > 0.0) {
  let seasonBare = 1.0 - smoothstep(0.0, 0.12, (baseColor.g - max(baseColor.r, baseColor.b)) / max(baseColor.g, 0.04));
  baseColor = vec4f(seasonPuddle(baseColor.rgb, fragmentInputs.vPositionW.xz, seasonBare, uniforms.seasonC.w), baseColor.a);
}
#endif
if (uniforms.seasonA.x > 0.0) {
  let seasonCover = seasonSnowCover(fragmentInputs.vPositionW.xz, uniforms.seasonA.x) * uniforms.seasonCoverage;
  baseColor = vec4f(mix(baseColor.rgb, seasonSnowColor(baseColor.rgb), seasonCover), baseColor.a);
}`,
  relief: RELIEF_WGSL,
  canopy: `{
  let seasonLuma = dot(baseColor.rgb, vec3f(0.299, 0.587, 0.114));
  let seasonXz = fragmentInputs.vPositionW.xz;
  let seasonPatch = seasonNoise(seasonXz * 0.08);
  let seasonAutumnAmount = clamp(uniforms.seasonB.y * 1.5 - seasonPatch * 0.5, 0.0, 1.0);
  let seasonKeep = clamp(uniforms.seasonB.x * 1.4 - (1.0 - seasonPatch) * 0.4, 0.0, 1.0);
  let seasonTint = mix(vec3f(0.86, 0.7, 0.28), vec3f(0.72, 0.4, 0.18), seasonNoise(seasonXz * 0.05 + 3.0));
  let seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3f(0.299, 0.587, 0.114))) * 1.1;
  if (seasonNoise(seasonXz * 0.4) * 0.98 + 0.01 > seasonKeep) {
    discard;
  }
  var seasonColor = mix(baseColor.rgb, baseColor.rgb * vec3f(1.03, 1.1, 0.75), uniforms.seasonA.w);
  seasonColor = mix(seasonColor, seasonAutumnColor, seasonAutumnAmount);
  baseColor = vec4f(seasonColor, baseColor.a);
}`,
};

/**
 * Impostory (StandardMaterial s instancemi, alpha test až po všech výpočtech alfy): barva a alfa
 * z letního, nebo zimního atlasu. Listnáč přechází s opadem listí (každý strom trochu jindy),
 * smrk se sněhovou pokrývkou; po pixelech podle šumu (≈ 0,4 m na stromě) – koruna řídne
 * postupně a pod ní se objeví holé větve. Podzimní barva a jarní svěžest jen na letním obrázku.
 */
class SeasonImpostorPlugin extends MaterialPluginBase {
  private readonly placeholder: RawTexture;

  constructor(
    material: StandardMaterial,
    private readonly atlases: ImpostorAtlases,
  ) {
    super(material, 'SeasonImpostor', 250, { SEASON_IMPOSTOR: false, SEASON_SEED: false });
    // zástupná průhledná textura, dokud se zimní atlas nenačte (shader ji nepoužije)
    this.placeholder = RawTexture.CreateRGBATexture(
      new Uint8Array(4),
      1,
      1,
      material.getScene(),
      false,
    );
    this.placeholder.name = 'impostor-winter-placeholder';
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['SEASON_IMPOSTOR'] = true;
    defines['SEASON_SEED'] = true;
  }

  override getClassName(): string {
    return 'SeasonImpostorPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('seasonSummerAtlas', 'seasonWinterAtlas');
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[];
    fragment: string;
  } {
    return {
      ubo: [...SEASON_UBO, { name: 'seasonWinterReady', size: 1, type: 'float' }],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef SEASON_IMPOSTOR
uniform seasonA: vec4f;
uniform seasonB: vec4f;
uniform seasonC: vec4f;
uniform seasonWinterReady: f32;
#endif`
          : `#ifdef SEASON_IMPOSTOR
uniform vec4 seasonA;
uniform vec4 seasonB;
uniform vec4 seasonC;
uniform float seasonWinterReady;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    bindSeasonUniforms(uniformBuffer, this._material.getScene());
    const winter = this.atlases.winter;
    uniformBuffer.updateFloat('seasonWinterReady', winter ? 1 : 0);
    uniformBuffer.setTexture('seasonSummerAtlas', this.atlases.summer);
    uniformBuffer.setTexture('seasonWinterAtlas', winter ?? this.placeholder);
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.atlases.summer);
    if (this.atlases.winter) activeTextures.push(this.atlases.winter);
  }

  override dispose(): void {
    this.placeholder.dispose();
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    if (shaderType === 'vertex') return wgsl ? SEED_VERTEX_WGSL : SEED_VERTEX_GLSL;
    if (shaderType !== 'fragment') return null;
    return wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SEASON_IMPOSTOR
${SEED_FRAGMENT_WGSL}
var seasonSummerAtlasSampler: sampler;
var seasonSummerAtlas: texture_2d<f32>;
var seasonWinterAtlasSampler: sampler;
var seasonWinterAtlas: texture_2d<f32>;
${SEASON_HELPERS_WGSL}
#endif`,
          CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef SEASON_IMPOSTOR
${IMPOSTOR_WGSL}
#endif`,
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SEASON_IMPOSTOR
${SEED_FRAGMENT_GLSL}
uniform sampler2D seasonSummerAtlas;
uniform sampler2D seasonWinterAtlas;
${SEASON_HELPERS_GLSL}
#endif`,
          CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef SEASON_IMPOSTOR
${IMPOSTOR_GLSL}
#endif`,
        };
  }
}

const IMPOSTOR_GLSL = `{
  float seasonEvergreen = step(0.75, vDiffuseUV.y);
  float seasonSeedA = vSeasonSeed;
  float seasonSeedB = fract(seasonSeedA * 7.13 + 0.37);
#if defined(INSTANCESCOLOR) && defined(INSTANCES)
  vec3 seasonShade = vColor.rgb * vDiffuseInfos.y;
#else
  vec3 seasonShade = vec3(vDiffuseInfos.y);
#endif
  vec4 seasonSummer = texture2D(seasonSummerAtlas, vDiffuseUV);
  vec4 seasonWinter = texture2D(seasonWinterAtlas, vDiffuseUV);
  float seasonKeep = clamp(seasonB.x * 1.4 - seasonSeedB * 0.4, 0.0, 1.0);
  float seasonWinterAmount = mix(1.0 - seasonKeep, seasonSnowCover(vPositionW.xz, seasonA.x), seasonEvergreen) * seasonWinterReady;
  float seasonUseWinter = step(seasonNoise(vDiffuseUV * 160.0 + seasonSeedA * 23.0) * 0.98 + 0.01, seasonWinterAmount);
  vec4 seasonTexel = mix(seasonSummer, seasonWinter, seasonUseWinter);
  vec3 seasonColor = seasonTexel.rgb * seasonShade;
  float seasonLeaf = seasonLeafMask(seasonSummer.rgb) * (1.0 - seasonEvergreen) * (1.0 - seasonUseWinter);
  float seasonAutumnAmount = clamp(seasonB.y * 1.5 - seasonSeedA * 0.5, 0.0, 1.0);
  float seasonLuma = dot(seasonColor, vec3(0.299, 0.587, 0.114));
  vec3 seasonTint = mix(vec3(0.86, 0.7, 0.28), vec3(0.72, 0.4, 0.18), seasonSeedA);
  vec3 seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3(0.299, 0.587, 0.114))) * 1.15;
  seasonColor = mix(seasonColor, seasonColor * vec3(1.03, 1.1, 0.75), seasonLeaf * seasonA.w);
  seasonColor = mix(seasonColor, seasonAutumnColor, seasonLeaf * seasonAutumnAmount);
  baseColor = vec4(seasonColor, seasonTexel.a);
  alpha = seasonTexel.a * vDiffuseColor.a;
}`;

const IMPOSTOR_WGSL = `{
  let seasonEvergreen = step(0.75, fragmentInputs.vDiffuseUV.y);
  let seasonSeedA = fragmentInputs.vSeasonSeed;
  let seasonSeedB = fract(seasonSeedA * 7.13 + 0.37);
#if defined(INSTANCESCOLOR) && defined(INSTANCES)
  let seasonShade = fragmentInputs.vColor.rgb * uniforms.vDiffuseInfos.y;
#else
  let seasonShade = vec3f(uniforms.vDiffuseInfos.y);
#endif
  let seasonSummer = textureSample(seasonSummerAtlas, seasonSummerAtlasSampler, fragmentInputs.vDiffuseUV);
  let seasonWinter = textureSample(seasonWinterAtlas, seasonWinterAtlasSampler, fragmentInputs.vDiffuseUV);
  let seasonKeep = clamp(uniforms.seasonB.x * 1.4 - seasonSeedB * 0.4, 0.0, 1.0);
  let seasonWinterAmount = mix(1.0 - seasonKeep, seasonSnowCover(fragmentInputs.vPositionW.xz, uniforms.seasonA.x), seasonEvergreen) * uniforms.seasonWinterReady;
  let seasonUseWinter = step(seasonNoise(fragmentInputs.vDiffuseUV * 160.0 + seasonSeedA * 23.0) * 0.98 + 0.01, seasonWinterAmount);
  let seasonTexel = mix(seasonSummer, seasonWinter, seasonUseWinter);
  var seasonColor = seasonTexel.rgb * seasonShade;
  let seasonLeaf = seasonLeafMask(seasonSummer.rgb) * (1.0 - seasonEvergreen) * (1.0 - seasonUseWinter);
  let seasonAutumnAmount = clamp(uniforms.seasonB.y * 1.5 - seasonSeedA * 0.5, 0.0, 1.0);
  let seasonLuma = dot(seasonColor, vec3f(0.299, 0.587, 0.114));
  let seasonTint = mix(vec3f(0.86, 0.7, 0.28), vec3f(0.72, 0.4, 0.18), seasonSeedA);
  let seasonAutumnColor = seasonTint * (seasonLuma / dot(seasonTint, vec3f(0.299, 0.587, 0.114))) * 1.15;
  seasonColor = mix(seasonColor, seasonColor * vec3f(1.03, 1.1, 0.75), seasonLeaf * uniforms.seasonA.w);
  seasonColor = mix(seasonColor, seasonAutumnColor, seasonLeaf * seasonAutumnAmount);
  baseColor = vec4f(seasonColor, seasonTexel.a);
  alpha = seasonTexel.a * uniforms.vDiffuseColor.a;
}`;
