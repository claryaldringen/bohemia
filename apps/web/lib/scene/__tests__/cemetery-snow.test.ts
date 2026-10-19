import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import type { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { CemeteryRenderer } from '../cemetery-renderer';
import { applySeasonRelief } from '../season-materials';
import type { WovenFenceRenderer } from '../woven-fence-renderer';

type SceneCemetery = NonNullable<SceneVillage['cemeteries']>[number];

/** Defin a kód pluginu období pro daný jazyk shaderu (jen fragment shader). */
function pluginCode(
  plugin: MaterialPluginBase,
  language: ShaderLanguage,
): { defines: Record<string, unknown>; code: Record<string, string> } {
  const defines: Record<string, unknown> = {};
  plugin.prepareDefines(defines as never, null as never, null as never);
  return { defines, code: plugin.getCustomCode('fragment', language) ?? {} };
}

describe('sníh na mohylách hřbitova (Martin, 19. 10. 2026)', () => {
  it('tvar na zemi dostane sníh jako terén – po osvětlení, v GLSL i WGSL', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial('mound', scene);
    applySeasonRelief(material, 0.5);
    applySeasonRelief(material); // opakované volání nic nepřidá
    const plugin = material.pluginManager?.getPlugin('SeasonStandard');
    expect(plugin).toBeTruthy();
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const { defines, code } = pluginCode(plugin!, language);
      expect(defines['SEASON_STD_RELIEF']).toBe(true);
      expect(defines['SEASON_STD_GROUND']).toBe(false);
      const snow = code['CUSTOM_FRAGMENT_BEFORE_FOG'] ?? '';
      // stejný šum a sklon jako terén, nasvícené jako terén (diffuseBase)
      expect(snow).toContain('seasonSnowCover');
      expect(snow).toContain('seasonSnowSlope(normalW.y)');
      expect(snow).toContain('diffuseBase');
      // v létě (sníh 0) se barva nemění
      expect(snow).toMatch(/seasonA\.x > 0\.0/);
      expect(code['CUSTOM_FRAGMENT_DEFINITIONS']).toContain('seasonSnowSlope');
    }
    // PBR (modely) jde přes applySeasonSnow – tady se nic nepřidá
    const pbr = new PBRMaterial('pbr', scene);
    applySeasonRelief(pbr);
    expect(pbr.pluginManager?.getPlugin('SeasonStandard') ?? null).toBeNull();
    engine.dispose();
  });

  it('mohyly všech velikostí, čerstvé i zarostlé, a kůl vojvody mají sníh', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fences = { set: () => undefined, commit: () => undefined };
    const renderer = new CemeteryRenderer(scene, {
      decalHeight: () => 0,
      groundHeight: () => 0,
      addShadowCaster: () => undefined,
      requestRender: () => undefined,
      fences: fences as unknown as WovenFenceRenderer,
    });
    const cell = { x: 0, y: 0 };
    const cemetery: SceneCemetery = {
      id: 1,
      squares: [{ cell, x: 7.5, z: 7.5, size: 15 }],
      built: true,
      progress: 1,
      graves: 6,
      mounds: [
        { cell, column: 3, row: 0, size: 'great' },
        { cell, column: 0, row: 2, size: 'large' },
        { cell, column: 2, row: 4, size: 'normal' },
        { cell, column: 4, row: 4, size: 'normal', fresh: true },
        { cell, column: 6, row: 7, size: 'small', fresh: true },
      ],
    };
    expect(renderer.update([cemetery], [])).toBe(true);
    const meshes = scene.meshes.filter(
      (m) =>
        m.name.startsWith('village-cemetery-mounds-') || m.name === 'village-cemetery-mound-posts',
    );
    const names = meshes.map((m) => m.name).sort();
    expect(names).toContain('village-cemetery-mound-posts');
    expect(names).toContain('village-cemetery-mounds-earth');
    expect(names).toContain('village-cemetery-mounds-grass-great');
    for (const mesh of meshes) {
      const plugin = mesh.material?.pluginManager?.getPlugin('SeasonStandard');
      expect(plugin, mesh.name).toBeTruthy();
      expect(pluginCode(plugin!, ShaderLanguage.GLSL).defines['SEASON_STD_RELIEF']).toBe(true);
    }
    renderer.dispose();
    engine.dispose();
  });
});
