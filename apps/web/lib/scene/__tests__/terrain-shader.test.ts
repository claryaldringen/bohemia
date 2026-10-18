import { describe, expect, it } from 'vitest';
import {
  TERRAIN_LAYER_SLOTS,
  TERRAIN_UV_GLSL,
  TERRAIN_UV_WGSL,
  terrainLayersCode,
} from '../terrain-shader';

describe('míchání vrstev terénu – jen vrstvy s nenulovou vahou', () => {
  it('vrstvy mají stejné váhy a opakování jako dřív (pořadí sčítání se nemění)', () => {
    expect(TERRAIN_LAYER_SLOTS.map((s) => `${s.weight}|${s.repeat}`)).toEqual([
      'wA.r|layerRepeatA.x',
      'wA.g|layerRepeatA.y',
      'wA.b|layerRepeatA.z',
      'wA.a|layerRepeatA.w',
      'wB.r|layerRepeatB.x',
      'wB.g|layerRepeatB.y',
      'wC.r|layerRepeatC.x',
      'wC.g|layerRepeatC.y',
      'wB.a|layerRepeatB.z',
      'wC.b|layerRepeatC.z',
      'wC.a|layerRepeatC.w',
    ]);
  });

  for (const language of ['glsl', 'wgsl'] as const) {
    it(`${language}: každá vrstva se čte jednou, jen při váze > 0, s gradientem spočteným předem`, () => {
      const code = terrainLayersCode(language);
      const lines = code.split('\n');
      // derivace mimo podmínky – na začátku
      expect(lines[0]).toMatch(language === 'glsl' ? /dFdx\(terrainXz\)/ : /dpdx\(terrainXz\)/);
      expect(lines[1]).toMatch(language === 'glsl' ? /dFdy\(terrainXz\)/ : /dpdy\(terrainXz\)/);
      TERRAIN_LAYER_SLOTS.forEach(({ weight, repeat }, i) => {
        const line = lines.find((l) => l.includes(`terrainLayer(layer${i},`))!;
        expect(line.startsWith(`if (${weight} > 0.0) { terrainColor += terrainLayer(`)).toBe(true);
        expect(line).toContain(repeat);
        expect(line.endsWith(`* ${weight}; }`)).toBe(true);
      });
      // žádné čtení vrstvy bez gradientu (v podmínce by derivace nebyly definované)
      expect(code).not.toMatch(/texture2D\(layer|textureSample\(layer|texture\(layer/);
    });
  }

  it('UV vrstvy je lineární část + posun: gradient UV = tatáž lineární část derivací (GLSL i WGSL)', () => {
    for (const helpers of [TERRAIN_UV_GLSL, TERRAIN_UV_WGSL]) {
      expect(helpers).toMatch(/return terrainLayerDir\(xz, repeatM\);/);
      expect(helpers).toMatch(/return terrainLayerDir2\(xz, repeatM\) \+ vec2f?\(0\.37, 0\.71\);/);
      // lineární části bez konstanty – jen násobky složek d
      expect(helpers).toMatch(/\(d\.x \+ d\.y, d\.y - d\.x\) \* 0\.70710678 \/ repeatM;/);
      expect(helpers).toMatch(
        /\(d\.x \* 0\.94 - d\.y \* 0\.34, d\.x \* 0\.34 \+ d\.y \* 0\.94\) \/ \(repeatM \* 2\.3\);/,
      );
      // obě čtení vrstvy s gradientem z lineární části derivací
      expect(helpers).toMatch(/terrainLayerDir\(dx, repeatM\), terrainLayerDir\(dy, repeatM\)/);
      expect(helpers).toMatch(/terrainLayerDir2\(dx, repeatM\), terrainLayerDir2\(dy, repeatM\)/);
      expect(helpers).toMatch(/0\.55 \* texture(SampleGrad|Grad)\(/);
      expect(helpers).toMatch(/\+ 0\.45 \* texture(SampleGrad|Grad)\(/);
    }
  });

  it('lineární část je opravdu lineární: UV(xz + d) − UV(xz) = Dir(d)', () => {
    const dir = (x: number, z: number, r: number): [number, number] => [
      ((x + z) * 0.70710678) / r,
      ((z - x) * 0.70710678) / r,
    ];
    const dir2 = (x: number, z: number, r: number): [number, number] => [
      (x * 0.94 - z * 0.34) / (r * 2.3),
      (x * 0.34 + z * 0.94) / (r * 2.3),
    ];
    const uv2 = (x: number, z: number, r: number): [number, number] => {
      const [u, v] = dir2(x, z, r);
      return [u + 0.37, v + 0.71];
    };
    for (const [x, z, dx, dz, r] of [
      [120.5, -340.25, 0.031, 0.004, 65],
      [-800, 700, 0.5, -0.2, 12],
    ] as const) {
      const a = uv2(x, z, r);
      const b = uv2(x + dx, z + dz, r);
      const d = dir2(dx, dz, r);
      expect(b[0] - a[0]).toBeCloseTo(d[0], 9);
      expect(b[1] - a[1]).toBeCloseTo(d[1], 9);
      const p = dir(x, z, r);
      const q = dir(x + dx, z + dz, r);
      const e = dir(dx, dz, r);
      expect(q[0] - p[0]).toBeCloseTo(e[0], 9);
      expect(q[1] - p[1]).toBeCloseTo(e[1], 9);
    }
  });
});
