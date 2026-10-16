import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';

/**
 * Opar (EXP2 podle scene.fogDensity a scene.fogColor) pro PBR materiály stejně jako u
 * StandardMaterial – v gama prostoru až po zpracování obrazu. Vestavěný opar PBR míchá
 * v lineárním prostoru: tmavou zeleň stromů a keřů i slabý opar zesvětlí do modrošeda, takže by
 * 3D stromy z dálky nesplývaly s terénem a impostory.
 */
export function applyGammaFog(material: PBRMaterial): void {
  if (material.pluginManager?.getPlugin('GammaFog')) return;
  material.fogEnabled = false;
  new GammaFogPlugin(material);
}

class GammaFogPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, 'GammaFog', 300, { GAMMA_FOG: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['GAMMA_FOG'] = true;
  }

  override getClassName(): string {
    return 'GammaFogPlugin';
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
        { name: 'gammaFogColor', size: 3, type: 'vec3' },
        { name: 'gammaFogDensity', size: 1, type: 'float' },
      ],
      fragment:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef GAMMA_FOG
uniform gammaFogColor: vec3f;
uniform gammaFogDensity: f32;
#endif`
          : `#ifdef GAMMA_FOG
uniform vec3 gammaFogColor;
uniform float gammaFogDensity;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const scene = this._material.getScene();
    const density = scene.fogEnabled && scene.fogMode === 2 ? scene.fogDensity : 0;
    uniformBuffer.updateColor3('gammaFogColor', scene.fogColor);
    uniformBuffer.updateFloat('gammaFogDensity', density);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return {
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef GAMMA_FOG
let gammaFogDistance = length(fragmentInputs.vPositionW - scene.vEyePosition.xyz) * uniforms.gammaFogDensity;
let gammaFog = clamp(exp(-gammaFogDistance * gammaFogDistance), 0.0, 1.0);
finalColor = vec4f(mix(uniforms.gammaFogColor, finalColor.rgb, gammaFog), finalColor.a);
#endif`,
      };
    }
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef GAMMA_FOG
float gammaFogDistance = length(vPositionW - vEyePosition.xyz) * gammaFogDensity;
float gammaFog = clamp(exp(-gammaFogDistance * gammaFogDistance), 0.0, 1.0);
finalColor.rgb = mix(gammaFogColor, finalColor.rgb, gammaFog);
#endif`,
    };
  }
}
