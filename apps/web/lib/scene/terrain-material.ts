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
  packSplatTextures,
  type ForestGround,
  type GroundLayer,
} from './ground-layers';
import type { StreamCenterline } from './stream-geometry';

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

/**
 * Materiál terénu: StandardMaterial, jehož barvu míchá TerrainSplatPlugin z 11 textur
 * a ztmavuje pod stromy.
 */
export function createTerrainMaterial(
  scene: Scene,
  l: Landscape,
  stream?: StreamCenterline,
  forest?: ForestGround,
): StandardMaterial {
  const material = new StandardMaterial('terrain-material', scene);
  material.specularColor = Color3.Black();
  const [first, second, third] = packSplatTextures(groundWeights(l, stream, forest));
  const resolution = l.size * 4;
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
  new TerrainSplatPlugin(material, {
    splats: [
      splat(first, 'terrain-splat-0'),
      splat(second, 'terrain-splat-1'),
      splat(third, 'terrain-splat-2'),
    ],
    layers,
    extentM: l.size * l.cellSizeM,
    repeatsM: GROUND_LAYERS.map((layer) => LAYER_TEXTURES[layer].repeatM),
  });
  return material;
}

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
      ],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef TERRAIN_SPLAT
uniform terrainExtent: f32;
uniform layerRepeatA: vec4f;
uniform layerRepeatB: vec4f;
uniform layerRepeatC: vec4f;
#endif`
          : `#ifdef TERRAIN_SPLAT
uniform float terrainExtent;
uniform vec4 layerRepeatA;
uniform vec4 layerRepeatB;
uniform vec4 layerRepeatC;
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
fn terrainLayerUv(xz: vec2f, repeatM: f32) -> vec2f {
  return vec2f(xz.x + xz.y, xz.y - xz.x) * 0.70710678 / repeatM;
}
fn terrainLayerUv2(xz: vec2f, repeatM: f32) -> vec2f {
  return vec2f(xz.x * 0.94 - xz.y * 0.34, xz.x * 0.34 + xz.y * 0.94) / (repeatM * 2.3) + vec2f(0.37, 0.71);
}
#endif`,
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef TERRAIN_SPLAT
let terrainXz = fragmentInputs.vPositionW.xz;
let splatUv = (terrainXz + uniforms.terrainExtent * 0.5) / uniforms.terrainExtent;
let wA = textureSample(splat0, splat0Sampler, splatUv);
let wB = textureSample(splat1, splat1Sampler, splatUv);
let wC = textureSample(splat2, splat2Sampler, splatUv);
var terrainColor = (0.55 * textureSample(layer0, layer0Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatA.x)).rgb + 0.45 * textureSample(layer0, layer0Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatA.x)).rgb) * wA.r;
terrainColor += (0.55 * textureSample(layer1, layer1Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatA.y)).rgb + 0.45 * textureSample(layer1, layer1Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatA.y)).rgb) * wA.g;
terrainColor += (0.55 * textureSample(layer2, layer2Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatA.z)).rgb + 0.45 * textureSample(layer2, layer2Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatA.z)).rgb) * wA.b;
terrainColor += (0.55 * textureSample(layer3, layer3Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatA.w)).rgb + 0.45 * textureSample(layer3, layer3Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatA.w)).rgb) * wA.a;
terrainColor += (0.55 * textureSample(layer4, layer4Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatB.x)).rgb + 0.45 * textureSample(layer4, layer4Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatB.x)).rgb) * wB.r;
terrainColor += (0.55 * textureSample(layer5, layer5Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatB.y)).rgb + 0.45 * textureSample(layer5, layer5Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatB.y)).rgb) * wB.g;
terrainColor += (0.55 * textureSample(layer6, layer6Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatC.x)).rgb + 0.45 * textureSample(layer6, layer6Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatC.x)).rgb) * wC.r;
terrainColor += (0.55 * textureSample(layer7, layer7Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatC.y)).rgb + 0.45 * textureSample(layer7, layer7Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatC.y)).rgb) * wC.g;
terrainColor += (0.55 * textureSample(layer8, layer8Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatB.z)).rgb + 0.45 * textureSample(layer8, layer8Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatB.z)).rgb) * wB.a;
terrainColor += (0.55 * textureSample(layer9, layer9Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatC.z)).rgb + 0.45 * textureSample(layer9, layer9Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatC.z)).rgb) * wC.b;
terrainColor += (0.55 * textureSample(layer10, layer10Sampler, terrainLayerUv(terrainXz, uniforms.layerRepeatC.w)).rgb + 0.45 * textureSample(layer10, layer10Sampler, terrainLayerUv2(terrainXz, uniforms.layerRepeatC.w)).rgb) * wC.a;
let terrainTotal = wA.r + wA.g + wA.b + wA.a + wB.r + wB.g + wB.a + wC.r + wC.g + wC.b + wC.a;
baseColor = vec4f(terrainColor / max(terrainTotal, 0.001) * (1.0 - 0.5 * wB.b), 1.0);
#endif`,
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef TERRAIN_SPLAT
${SAMPLERS.map((name) => `uniform sampler2D ${name};`).join('\n')}
vec2 terrainLayerUv(vec2 xz, float repeatM) {
  return vec2(xz.x + xz.y, xz.y - xz.x) * 0.70710678 / repeatM;
}
vec2 terrainLayerUv2(vec2 xz, float repeatM) {
  return vec2(xz.x * 0.94 - xz.y * 0.34, xz.x * 0.34 + xz.y * 0.94) / (repeatM * 2.3) + vec2(0.37, 0.71);
}
#endif`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef TERRAIN_SPLAT
vec2 terrainXz = vPositionW.xz;
vec2 splatUv = (terrainXz + terrainExtent * 0.5) / terrainExtent;
vec4 wA = texture2D(splat0, splatUv);
vec4 wB = texture2D(splat1, splatUv);
vec4 wC = texture2D(splat2, splatUv);
vec3 terrainColor = (0.55 * texture2D(layer0, terrainLayerUv(terrainXz, layerRepeatA.x)).rgb + 0.45 * texture2D(layer0, terrainLayerUv2(terrainXz, layerRepeatA.x)).rgb) * wA.r;
terrainColor += (0.55 * texture2D(layer1, terrainLayerUv(terrainXz, layerRepeatA.y)).rgb + 0.45 * texture2D(layer1, terrainLayerUv2(terrainXz, layerRepeatA.y)).rgb) * wA.g;
terrainColor += (0.55 * texture2D(layer2, terrainLayerUv(terrainXz, layerRepeatA.z)).rgb + 0.45 * texture2D(layer2, terrainLayerUv2(terrainXz, layerRepeatA.z)).rgb) * wA.b;
terrainColor += (0.55 * texture2D(layer3, terrainLayerUv(terrainXz, layerRepeatA.w)).rgb + 0.45 * texture2D(layer3, terrainLayerUv2(terrainXz, layerRepeatA.w)).rgb) * wA.a;
terrainColor += (0.55 * texture2D(layer4, terrainLayerUv(terrainXz, layerRepeatB.x)).rgb + 0.45 * texture2D(layer4, terrainLayerUv2(terrainXz, layerRepeatB.x)).rgb) * wB.r;
terrainColor += (0.55 * texture2D(layer5, terrainLayerUv(terrainXz, layerRepeatB.y)).rgb + 0.45 * texture2D(layer5, terrainLayerUv2(terrainXz, layerRepeatB.y)).rgb) * wB.g;
terrainColor += (0.55 * texture2D(layer6, terrainLayerUv(terrainXz, layerRepeatC.x)).rgb + 0.45 * texture2D(layer6, terrainLayerUv2(terrainXz, layerRepeatC.x)).rgb) * wC.r;
terrainColor += (0.55 * texture2D(layer7, terrainLayerUv(terrainXz, layerRepeatC.y)).rgb + 0.45 * texture2D(layer7, terrainLayerUv2(terrainXz, layerRepeatC.y)).rgb) * wC.g;
terrainColor += (0.55 * texture2D(layer8, terrainLayerUv(terrainXz, layerRepeatB.z)).rgb + 0.45 * texture2D(layer8, terrainLayerUv2(terrainXz, layerRepeatB.z)).rgb) * wB.a;
terrainColor += (0.55 * texture2D(layer9, terrainLayerUv(terrainXz, layerRepeatC.z)).rgb + 0.45 * texture2D(layer9, terrainLayerUv2(terrainXz, layerRepeatC.z)).rgb) * wC.b;
terrainColor += (0.55 * texture2D(layer10, terrainLayerUv(terrainXz, layerRepeatC.w)).rgb + 0.45 * texture2D(layer10, terrainLayerUv2(terrainXz, layerRepeatC.w)).rgb) * wC.a;
float terrainTotal = wA.r + wA.g + wA.b + wA.a + wB.r + wB.g + wB.a + wC.r + wC.g + wC.b + wC.a;
baseColor = vec4(terrainColor / max(terrainTotal, 0.001) * (1.0 - 0.5 * wB.b), 1.0);
#endif`,
    };
  }
}
