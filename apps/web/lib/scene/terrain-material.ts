import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape } from '@bohemia/game';
import {
  GROUND_LAYERS,
  groundWeights,
  packShade,
  packSplatTextures,
  treeShade,
  type ForestGround,
  type GroundLayer,
} from './ground-layers';
import {
  SEASON_HELPERS_GLSL,
  SEASON_HELPERS_WGSL,
  SEASON_UBO,
  bindSeasonUniforms,
} from './season-materials';
import type { StreamCenterline } from './stream-geometry';
import { TERRAIN_UV_GLSL, TERRAIN_UV_WGSL, terrainLayersCode } from './terrain-shader';

const TEXTURE_BASE_URL = '/textures/terrain/';

/** Textura a délka opakování (m) každé vrstvy – podle sady temperate z 0 A.D. */
const LAYER_TEXTURES: Record<GroundLayer, { file: string; repeatM: number }> = {
  grass: { file: 'grass.jpg', repeatM: 65 },
  grassLush: { file: 'grass-lush.jpg', repeatM: 70 },
  grassDirt: { file: 'grass-dirt.jpg', repeatM: 60 },
  forestFloor: { file: 'forest-floor.jpg', repeatM: 24 },
  shore: { file: 'shore.jpg', repeatM: 50 },
  mud: { file: 'mud.jpg', repeatM: 32 },
  // Dno potoka a náplavy – oblázky musí být vidět i z dálky, proto kratší opakování.
  gravel: { file: 'gravel.jpg', repeatM: 12 },
  sand: { file: 'sand.jpg', repeatM: 16 },
  // Kvetoucí louka má stejný podklad i opakování jako tráva – přechod je jen v květech.
  flowers: { file: 'grass-flowers.jpg', repeatM: 65 },
  dryGrass: { file: 'grass-dry.jpg', repeatM: 60 },
  rocky: { file: 'rocky.jpg', repeatM: 22 },
};

/** Materiál terénu a přepočet ztmavení pod stromy po vykácení. */
export interface TerrainMaterial {
  material: StandardMaterial;
  /**
   * Ztmavení půdy pod stromy bez stromů `hidden` (vykácené, odstraněné – fields.md, forest.md):
   * přepočítá se a modrý kanál druhé splat textury se nahraje znovu – žádný sampler navíc.
   * Vrátí true, když se ztmavení změnilo.
   */
  setHiddenTrees(hidden: ReadonlySet<number>): boolean;
}

/**
 * Materiál terénu: StandardMaterial, jehož barvu míchá TerrainSplatPlugin z 11 textur
 * a ztmavuje pod stromy.
 */
export function createTerrainMaterial(
  scene: Scene,
  l: Landscape,
  stream?: StreamCenterline,
  forest?: ForestGround,
): TerrainMaterial {
  const material = new StandardMaterial('terrain-material', scene);
  material.specularColor = Color3.Black();
  const weights = groundWeights(l, stream, forest);
  const [first, second, third] = packSplatTextures(weights);
  const resolution = weights.resolution;
  const splat = (data: Uint8Array, name: string): RawTexture => {
    const texture = RawTexture.CreateRGBATexture(
      data,
      resolution,
      resolution,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.name = name;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  };
  const layers = GROUND_LAYERS.map((layer) => {
    const texture = new Texture(`${TEXTURE_BASE_URL}${LAYER_TEXTURES[layer].file}`, scene);
    texture.anisotropicFilteringLevel = 8;
    return texture;
  });
  const shaded = splat(second, 'terrain-splat-1');
  new TerrainSplatPlugin(material, {
    splats: [splat(first, 'terrain-splat-0'), shaded, splat(third, 'terrain-splat-2')],
    layers,
    extentM: l.size * l.cellSizeM,
    repeatsM: GROUND_LAYERS.map((layer) => LAYER_TEXTURES[layer].repeatM),
  });
  // podpis právě skrytých stromů s ztmavením – při beze změny se textura nepřepočítává
  let hiddenKey = '';
  return {
    material,
    setHiddenTrees(hidden) {
      if (!forest) return false;
      const key = forest.trees
        .flatMap((tree) => (tree.id !== undefined && hidden.has(tree.id) ? [tree.id] : []))
        .join(',');
      if (key === hiddenKey) return false;
      hiddenKey = key;
      packShade(second, treeShade(l, forest.trees, resolution, hidden));
      shaded.update(second);
      return true;
    },
  };
}

/**
 * Roční období na terénu (gama prostor, `groundColor` = smíchaná barva vrstev, váhy wA–wC):
 * tráva (tráva, bujná, kvetoucí, suchá a napůl vyšlapaná) na jaře zesvětlí a zezelená, na
 * podzim usychá ve skvrnách do slámově hnědé; sníh podle šumu, ne na strmých svazích a na dně
 * potoka (štěrk, písek a bahno jsou většinou pod vodou – prosvítaly by bíle); pod stromy místy
 * prosvítá zem. Stín pod holými korunami je v zimě slabší.
 */
const SEASON_GROUND_GLSL = `if (seasonA.y > 0.0 || seasonA.z > 0.0) {
  float seasonVeg = clamp((wA.r + wA.g + 0.6 * wA.b + wB.a + wC.b) / terrainTotal, 0.0, 1.0);
  groundColor = seasonGrass(groundColor, seasonVeg, terrainXz, seasonA);
}
if (seasonA.x > 0.0) {
  float seasonBed = clamp((wC.r + wC.g + wB.g) / terrainTotal, 0.0, 1.0);
  // pod stromy u kmenů místy prosvítá zem (listí, kořeny)
  float seasonTrunks = 1.0 - 0.45 * wB.b * smoothstep(0.5, 0.78, seasonNoise(terrainXz * 0.35 + 9.0));
  float seasonCover = seasonSnowCover(terrainXz, seasonA.x) * smoothstep(0.55, 0.8, normalW.y) * (1.0 - seasonBed) * seasonTrunks;
  groundColor = mix(groundColor, seasonSnowColor(groundColor), seasonCover);
}`;

const SEASON_GROUND_WGSL = `if (uniforms.seasonA.y > 0.0 || uniforms.seasonA.z > 0.0) {
  let seasonVeg = clamp((wA.r + wA.g + 0.6 * wA.b + wB.a + wC.b) / terrainTotal, 0.0, 1.0);
  groundColor = seasonGrass(groundColor, seasonVeg, terrainXz, uniforms.seasonA);
}
if (uniforms.seasonA.x > 0.0) {
  let seasonBed = clamp((wC.r + wC.g + wB.g) / terrainTotal, 0.0, 1.0);
  let seasonTrunks = 1.0 - 0.45 * wB.b * smoothstep(0.5, 0.78, seasonNoise(terrainXz * 0.35 + 9.0));
  let seasonCover = seasonSnowCover(terrainXz, uniforms.seasonA.x) * smoothstep(0.55, 0.8, normalW.y) * (1.0 - seasonBed) * seasonTrunks;
  groundColor = mix(groundColor, seasonSnowColor(groundColor), seasonCover);
}`;

interface SplatInputs {
  splats: [RawTexture, RawTexture, RawTexture];
  layers: Texture[];
  extentM: number;
  repeatsM: number[];
}

const SAMPLERS = [
  'splat0',
  'splat1',
  'splat2',
  'layer0',
  'layer1',
  'layer2',
  'layer3',
  'layer4',
  'layer5',
  'layer6',
  'layer7',
  'layer8',
  'layer9',
  'layer10',
];

/**
 * Míchá barvu terénu z 11 dlaždicových textur podle tří splat textur (váhy vrstev); modrý
 * kanál druhé splat textury ztmavuje půdu pod stromy (nejvýš o polovinu), alfa nese kvetoucí
 * louku, třetí štěrk a písek dna potoka, suchou trávu a kamenitou půdu. S plošným stínem
 * terénu je to 15 samplerů – WebGL 2 zaručuje 16, další vrstva by potřebovala pole textur.
 * Textury se mapují rovinně podle světových souřadnic, pootočené o 45° (opakování je tak méně
 * nápadné), každá s vlastní délkou opakování. Funguje pro WebGL (GLSL) i WebGPU (WGSL).
 *
 * Roční období (season-materials.ts) bez textury navíc: tráva (vrstvy trávy podle vah) na jaře
 * svěží, na podzim a v zimě suchá a hnědá ve skvrnách; sníh podle šumu a sklonu (strmé svahy
 * a dno potoka zůstanou holé); stín pod stromy je v zimě slabší (holé koruny).
 */
class TerrainSplatPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly inputs: SplatInputs,
  ) {
    super(material, 'TerrainSplat', 200, { TERRAIN_SPLAT: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['TERRAIN_SPLAT'] = true;
  }

  override getClassName(): string {
    return 'TerrainSplatPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push(...SAMPLERS);
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[];
    fragment: string;
  } {
    return {
      ubo: [
        { name: 'terrainExtent', size: 1, type: 'float' },
        { name: 'layerRepeatA', size: 4, type: 'vec4' },
        { name: 'layerRepeatB', size: 4, type: 'vec4' },
        { name: 'layerRepeatC', size: 4, type: 'vec4' },
        ...SEASON_UBO,
      ],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef TERRAIN_SPLAT
uniform terrainExtent: f32;
uniform layerRepeatA: vec4f;
uniform layerRepeatB: vec4f;
uniform layerRepeatC: vec4f;
uniform seasonA: vec4f;
uniform seasonB: vec4f;
#endif`
          : `#ifdef TERRAIN_SPLAT
uniform float terrainExtent;
uniform vec4 layerRepeatA;
uniform vec4 layerRepeatB;
uniform vec4 layerRepeatC;
uniform vec4 seasonA;
uniform vec4 seasonB;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { splats, layers, extentM, repeatsM } = this.inputs;
    const r = repeatsM;
    uniformBuffer.updateFloat('terrainExtent', extentM);
    uniformBuffer.updateFloat4('layerRepeatA', r[0]!, r[1]!, r[2]!, r[3]!);
    uniformBuffer.updateFloat4('layerRepeatB', r[4]!, r[5]!, r[8]!, 0);
    uniformBuffer.updateFloat4('layerRepeatC', r[6]!, r[7]!, r[9]!, r[10]!);
    bindSeasonUniforms(uniformBuffer, this._material.getScene());
    uniformBuffer.setTexture('splat0', splats[0]);
    uniformBuffer.setTexture('splat1', splats[1]);
    uniformBuffer.setTexture('splat2', splats[2]);
    layers.forEach((texture, i) => uniformBuffer.setTexture(`layer${i}`, texture));
  }

  override getActiveTextures(activeTextures: Texture[]): void {
    activeTextures.push(...this.inputs.splats, ...this.inputs.layers);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef TERRAIN_SPLAT
${SAMPLERS.map((name) => `var ${name}Sampler: sampler;\nvar ${name}: texture_2d<f32>;`).join('\n')}
${TERRAIN_UV_WGSL}
${SEASON_HELPERS_WGSL}
#endif`,
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef TERRAIN_SPLAT
let terrainXz = fragmentInputs.vPositionW.xz;
let splatUv = (terrainXz + uniforms.terrainExtent * 0.5) / uniforms.terrainExtent;
let wA = textureSample(splat0, splat0Sampler, splatUv);
let wB = textureSample(splat1, splat1Sampler, splatUv);
let wC = textureSample(splat2, splat2Sampler, splatUv);
${terrainLayersCode('wgsl')}
let terrainTotal = max(wA.r + wA.g + wA.b + wA.a + wB.r + wB.g + wB.a + wC.r + wC.g + wC.b + wC.a, 0.001);
var groundColor = terrainColor / terrainTotal;
${SEASON_GROUND_WGSL}
baseColor = vec4f(groundColor * (1.0 - 0.5 * wB.b * mix(0.35, 1.0, uniforms.seasonB.x)), 1.0);
#endif`,
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef TERRAIN_SPLAT
${SAMPLERS.map((name) => `uniform sampler2D ${name};`).join('\n')}
${TERRAIN_UV_GLSL}
${SEASON_HELPERS_GLSL}
#endif`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef TERRAIN_SPLAT
vec2 terrainXz = vPositionW.xz;
vec2 splatUv = (terrainXz + terrainExtent * 0.5) / terrainExtent;
vec4 wA = texture2D(splat0, splatUv);
vec4 wB = texture2D(splat1, splatUv);
vec4 wC = texture2D(splat2, splatUv);
${terrainLayersCode('glsl')}
float terrainTotal = max(wA.r + wA.g + wA.b + wA.a + wB.r + wB.g + wB.a + wC.r + wC.g + wC.b + wC.a, 0.001);
vec3 groundColor = terrainColor / terrainTotal;
${SEASON_GROUND_GLSL}
// pod holými korunami je v zimě stín slabší
baseColor = vec4(groundColor * (1.0 - 0.5 * wB.b * mix(0.35, 1.0, seasonB.x)), 1.0);
#endif`,
    };
  }
}
