/**
 * Míchání 11 vrstev terénu ve fragment shaderu (terrain-material.ts) – kód GLSL i WGSL z jedné
 * tabulky, bez Babylonu (test v `terrain-shader.test.ts`). Každá vrstva se čte dvakrát (dvě
 * pootočená mapování proti opakování), ale **jen když má v pixelu nenulovou váhu** – typicky
 * 2–4 vrstvy z 11. Čtení v podmínce potřebuje gradient UV předem: textura se čte přes
 * `textureGrad` / `textureSampleGrad` s derivacemi světových souřadnic spočtenými jednou na
 * začátku (UV je lineární v x, z, derivace UV jsou tedy tytéž, jaké by GPU odhadl samo). Výsledek
 * je stejný jako dřív: vrstva s nulovou vahou přispívala nulou.
 */

/** Váha a délka opakování vrstvy `layer<i>` – kanál splat textury a složka uniformy. */
export const TERRAIN_LAYER_SLOTS: readonly { weight: string; repeat: string }[] = [
  { weight: 'wA.r', repeat: 'layerRepeatA.x' },
  { weight: 'wA.g', repeat: 'layerRepeatA.y' },
  { weight: 'wA.b', repeat: 'layerRepeatA.z' },
  { weight: 'wA.a', repeat: 'layerRepeatA.w' },
  { weight: 'wB.r', repeat: 'layerRepeatB.x' },
  { weight: 'wB.g', repeat: 'layerRepeatB.y' },
  { weight: 'wC.r', repeat: 'layerRepeatC.x' },
  { weight: 'wC.g', repeat: 'layerRepeatC.y' },
  { weight: 'wB.a', repeat: 'layerRepeatB.z' },
  { weight: 'wC.b', repeat: 'layerRepeatC.z' },
  { weight: 'wC.a', repeat: 'layerRepeatC.w' },
];

/**
 * Mapování textur vrstev: rovinně podle světových x, z, pootočené o 45° (a druhé o ≈ 20°
 * s posunem a 2,3× větší), dělené délkou opakování. `Dir` = jen lineární část (pro derivace).
 */
export const TERRAIN_UV_GLSL = `vec2 terrainLayerDir(vec2 d, float repeatM) {
  return vec2(d.x + d.y, d.y - d.x) * 0.70710678 / repeatM;
}
vec2 terrainLayerDir2(vec2 d, float repeatM) {
  return vec2(d.x * 0.94 - d.y * 0.34, d.x * 0.34 + d.y * 0.94) / (repeatM * 2.3);
}
vec2 terrainLayerUv(vec2 xz, float repeatM) {
  return terrainLayerDir(xz, repeatM);
}
vec2 terrainLayerUv2(vec2 xz, float repeatM) {
  return terrainLayerDir2(xz, repeatM) + vec2(0.37, 0.71);
}
vec3 terrainLayer(sampler2D layer, vec2 xz, vec2 dx, vec2 dy, float repeatM) {
  return 0.55 * textureGrad(layer, terrainLayerUv(xz, repeatM), terrainLayerDir(dx, repeatM), terrainLayerDir(dy, repeatM)).rgb
    + 0.45 * textureGrad(layer, terrainLayerUv2(xz, repeatM), terrainLayerDir2(dx, repeatM), terrainLayerDir2(dy, repeatM)).rgb;
}`;

export const TERRAIN_UV_WGSL = `fn terrainLayerDir(d: vec2f, repeatM: f32) -> vec2f {
  return vec2f(d.x + d.y, d.y - d.x) * 0.70710678 / repeatM;
}
fn terrainLayerDir2(d: vec2f, repeatM: f32) -> vec2f {
  return vec2f(d.x * 0.94 - d.y * 0.34, d.x * 0.34 + d.y * 0.94) / (repeatM * 2.3);
}
fn terrainLayerUv(xz: vec2f, repeatM: f32) -> vec2f {
  return terrainLayerDir(xz, repeatM);
}
fn terrainLayerUv2(xz: vec2f, repeatM: f32) -> vec2f {
  return terrainLayerDir2(xz, repeatM) + vec2f(0.37, 0.71);
}
fn terrainLayer(layer: texture_2d<f32>, layerSampler: sampler, xz: vec2f, dx: vec2f, dy: vec2f, repeatM: f32) -> vec3f {
  return 0.55 * textureSampleGrad(layer, layerSampler, terrainLayerUv(xz, repeatM), terrainLayerDir(dx, repeatM), terrainLayerDir(dy, repeatM)).rgb
    + 0.45 * textureSampleGrad(layer, layerSampler, terrainLayerUv2(xz, repeatM), terrainLayerDir2(dx, repeatM), terrainLayerDir2(dy, repeatM)).rgb;
}`;

/**
 * Součet vrstev vážený splat texturami (`terrainColor`) – jen vrstvy s vahou > 0. Předpokládá
 * proměnné `terrainXz`, `wA`, `wB`, `wC` a uniformy `layerRepeatA–C`; derivace `terrainXz` se
 * spočtou tady, mimo podmínky (v nerovnoměrném toku je GPU spočítat neumí).
 */
export function terrainLayersCode(language: 'glsl' | 'wgsl'): string {
  if (language === 'glsl') {
    return [
      'vec2 terrainDx = dFdx(terrainXz);',
      'vec2 terrainDy = dFdy(terrainXz);',
      'vec3 terrainColor = vec3(0.0);',
      ...TERRAIN_LAYER_SLOTS.map(
        ({ weight, repeat }, i) =>
          `if (${weight} > 0.0) { terrainColor += terrainLayer(layer${i}, terrainXz, terrainDx, terrainDy, ${repeat}) * ${weight}; }`,
      ),
    ].join('\n');
  }
  return [
    'let terrainDx = dpdx(terrainXz);',
    'let terrainDy = dpdy(terrainXz);',
    'var terrainColor = vec3f(0.0);',
    ...TERRAIN_LAYER_SLOTS.map(
      ({ weight, repeat }, i) =>
        `if (${weight} > 0.0) { terrainColor += terrainLayer(layer${i}, layer${i}Sampler, terrainXz, terrainDx, terrainDy, uniforms.${repeat}) * ${weight}; }`,
    ),
  ].join('\n');
}
