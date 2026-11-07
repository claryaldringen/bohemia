import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import {
  MAX_PIT_CUTS,
  PIT_CUT_FLOATS,
  packPitCuts,
  type PackedPitCuts,
  type PitCut,
} from './dwelling-pit';
import {
  DITCH_CUT_HALF_M,
  MAX_DITCH_CUTS,
  packDitchCuts,
  type DitchCut,
  type PackedDitchCuts,
} from './fortification-layout';

/**
 * Jámy obydlí, které se prořezávají do terénu a obtisků na něm – jeden sdílený stav pro všechny
 * materiály s `applyPitCut`. Změna se projeví při dalším snímku (data jdou do uniform bufferu
 * při každém kreslení, shader se nepřekládá).
 */
export class PitCuts {
  private packed: PackedPitCuts = packPitCuts([]);
  private ditchPacked: PackedDitchCuts = packDitchCuts([]);

  set(cuts: readonly PitCut[]): void {
    this.packed = packPitCuts(cuts);
  }

  get current(): PackedPitCuts {
    return this.packed;
  }

  /**
   * Příkopy valů (fortification-layout.ts – `ditchCuts`): pás 4 m kolem osy příkopu. Víc úseček
   * než se vejde – ty nejblíž `focus`.
   */
  setDitches(cuts: readonly DitchCut[], focus: { x: number; z: number } | null = null): void {
    this.ditchPacked = packDitchCuts(cuts, focus);
  }

  get ditches(): PackedDitchCuts {
    return this.ditchPacked;
  }
}

/**
 * Prořízne materiál v jamách (discard ve fragment shaderu): terén se tam „vyhloubí“ a jámu
 * dokreslí vlastní síť (stěny, dno, schody). Bez textur – jámy jsou pole uniform (dvě vec4 na
 * jámu), takže terén nepotřebuje 16. sampler. Mimo obdélník všech jam stojí jedno porovnání.
 * Stejně se prořezávají příkopy valů: vzdálenost od úseček osy příkopu (vec4 na úsečku) – maska
 * by byla 16. sampler terénu (má jich 15) a musela by se překreslit při každé změně valu.
 */
export function applyPitCut(material: Material, cuts: PitCuts): void {
  if (material.pluginManager?.getPlugin('PitCut')) return;
  new PitCutPlugin(material, cuts);
}

const VEC4S = MAX_PIT_CUTS * (PIT_CUT_FLOATS / 4);

class PitCutPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly cuts: PitCuts,
  ) {
    super(material, 'PitCut', 150, { PIT_CUT: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['PIT_CUT'] = true;
  }

  override getClassName(): string {
    return 'PitCutPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string; arraySize?: number }[];
    fragment: string;
  } {
    return {
      ubo: [
        { name: 'pitCuts', size: 4, type: 'vec4', arraySize: VEC4S },
        { name: 'pitBounds', size: 4, type: 'vec4' },
        { name: 'pitCount', size: 1, type: 'float' },
        { name: 'ditchCuts', size: 4, type: 'vec4', arraySize: MAX_DITCH_CUTS },
        { name: 'ditchBounds', size: 4, type: 'vec4' },
        { name: 'ditchCount', size: 1, type: 'float' },
      ],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef PIT_CUT
uniform pitCuts: array<vec4f, ${VEC4S}>;
uniform pitBounds: vec4f;
uniform pitCount: f32;
uniform ditchCuts: array<vec4f, ${MAX_DITCH_CUTS}>;
uniform ditchBounds: vec4f;
uniform ditchCount: f32;
#endif`
          : `#ifdef PIT_CUT
uniform vec4 pitCuts[${VEC4S}];
uniform vec4 pitBounds;
uniform float pitCount;
uniform vec4 ditchCuts[${MAX_DITCH_CUTS}];
uniform vec4 ditchBounds;
uniform float ditchCount;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { data, count, bounds } = this.cuts.current;
    uniformBuffer.updateFloatArray('pitCuts', data);
    uniformBuffer.updateFloat4('pitBounds', bounds[0], bounds[1], bounds[2], bounds[3]);
    uniformBuffer.updateFloat('pitCount', count);
    const ditch = this.cuts.ditches;
    uniformBuffer.updateFloatArray('ditchCuts', ditch.data);
    const [x0, z0, x1, z1] = ditch.bounds;
    uniformBuffer.updateFloat4('ditchBounds', x0, z0, x1, z1);
    uniformBuffer.updateFloat('ditchCount', ditch.count);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    // Stejný test jako insidePackedCut (dwelling-pit.ts): bod v obdélníku jámy nebo v šíji.
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return {
        CUSTOM_FRAGMENT_MAIN_BEGIN: `#ifdef PIT_CUT
{
  let pitP = fragmentInputs.vPositionW.xz;
  let pitB = uniforms.pitBounds;
  if (uniforms.pitCount > 0.5 && pitP.x >= pitB.x && pitP.y >= pitB.y && pitP.x <= pitB.z && pitP.y <= pitB.w) {
    for (var pitI: i32 = 0; pitI < ${MAX_PIT_CUTS}; pitI++) {
      if (f32(pitI) >= uniforms.pitCount) { break; }
      let pa = uniforms.pitCuts[pitI * 2];
      let pb = uniforms.pitCuts[pitI * 2 + 1];
      let pd = pitP - pa.xy;
      let plx = abs(pd.x * pa.z - pd.y * pa.w);
      let plz = pd.x * pa.w + pd.y * pa.z;
      if ((plx < pb.x && abs(plz) < pb.y) || (plx < pb.z && plz > 0.0 && plz < pb.w)) { discard; }
    }
  }
  let ditchB = uniforms.ditchBounds;
  if (uniforms.ditchCount > 0.5 && pitP.x >= ditchB.x && pitP.y >= ditchB.y && pitP.x <= ditchB.z && pitP.y <= ditchB.w) {
    for (var ditchI: i32 = 0; ditchI < ${MAX_DITCH_CUTS}; ditchI++) {
      if (f32(ditchI) >= uniforms.ditchCount) { break; }
      let dc = uniforms.ditchCuts[ditchI];
      let dab = dc.zw - dc.xy;
      let dt = clamp(dot(pitP - dc.xy, dab) / max(dot(dab, dab), 1e-6), 0.0, 1.0);
      if (length(pitP - dc.xy - dab * dt) < ${DITCH_CUT_HALF_M.toFixed(2)}) { discard; }
    }
  }
}
#endif`,
      };
    }
    return {
      CUSTOM_FRAGMENT_MAIN_BEGIN: `#ifdef PIT_CUT
{
  vec2 pitP = vPositionW.xz;
  if (pitCount > 0.5 && pitP.x >= pitBounds.x && pitP.y >= pitBounds.y && pitP.x <= pitBounds.z && pitP.y <= pitBounds.w) {
    for (int pitI = 0; pitI < ${MAX_PIT_CUTS}; pitI++) {
      if (float(pitI) >= pitCount) break;
      vec4 pa = pitCuts[pitI * 2];
      vec4 pb = pitCuts[pitI * 2 + 1];
      vec2 pd = pitP - pa.xy;
      float plx = abs(pd.x * pa.z - pd.y * pa.w);
      float plz = pd.x * pa.w + pd.y * pa.z;
      if ((plx < pb.x && abs(plz) < pb.y) || (plx < pb.z && plz > 0.0 && plz < pb.w)) discard;
    }
  }
  if (ditchCount > 0.5 && pitP.x >= ditchBounds.x && pitP.y >= ditchBounds.y && pitP.x <= ditchBounds.z && pitP.y <= ditchBounds.w) {
    for (int ditchI = 0; ditchI < ${MAX_DITCH_CUTS}; ditchI++) {
      if (float(ditchI) >= ditchCount) break;
      vec4 dc = ditchCuts[ditchI];
      vec2 dab = dc.zw - dc.xy;
      float dt = clamp(dot(pitP - dc.xy, dab) / max(dot(dab, dab), 1e-6), 0.0, 1.0);
      if (length(pitP - dc.xy - dab * dt) < ${DITCH_CUT_HALF_M.toFixed(2)}) discard;
    }
  }
}
#endif`,
    };
  }
}
