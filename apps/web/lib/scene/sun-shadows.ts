import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

/** Rozlišení stínové mapy – na krajinu 1,9 km vychází ≈ 0,7 m na texel. */
const SHADOW_MAP_SIZE = 4096;
/** Jak tmavé jsou stíny (0 = černé) – okolní světlo z oblohy je prosvětlí. */
export const SHADOW_DARKNESS = 0.35;

/**
 * Stíny od slunce jako v 0 A.D.: stromy, keře a skály vrhají stín na terén. Krajina i slunce
 * jsou nehybné, takže se stínová mapa vykreslí jednou (a znovu jen na požádání) – za snímek
 * stojí jen její čtení v shaderu terénu. Listí s ořezem alfy vrhá stín jen tam, kde je list.
 */
export function addSunShadows(
  sun: DirectionalLight,
  options: { casters: readonly Mesh[]; receivers: readonly Mesh[]; extentM: number },
): SunShadows {
  const half = options.extentM / 2;
  // Pevný výřez přes celou krajinu (při pohledu ze slunce je čtverec mapy natočený, proto √2).
  // Automatické přizpůsobení podle stromů by se měnilo s každým druhem a stíny by poskakovaly.
  const reach = half * Math.SQRT2;
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -reach;
  sun.orthoRight = reach;
  sun.orthoTop = reach;
  sun.orthoBottom = -reach;
  sun.position = sun.direction.scale(-options.extentM);
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = options.extentM * 2.5;

  const generator = new ShadowGenerator(SHADOW_MAP_SIZE, sun);
  generator.usePercentageCloserFiltering = true;
  generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  generator.bias = 0.0008;
  generator.normalBias = 0.02;
  generator.setDarkness(SHADOW_DARKNESS);
  for (const caster of options.casters) generator.addShadowCaster(caster, false);
  for (const receiver of options.receivers) receiver.receiveShadows = true;

  const map = generator.getShadowMap();
  if (map) map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  return {
    refresh: () => map?.resetRefreshCounter(),
    setDarkness: (darkness) => generator.setDarkness(darkness),
    setCastersEnabled: (meshes, enabled) => {
      for (const mesh of meshes) {
        if (enabled) generator.addShadowCaster(mesh, false);
        else generator.removeShadowCaster(mesh, false);
      }
      map?.resetRefreshCounter();
    },
    addCaster: (mesh) => {
      generator.addShadowCaster(mesh, false);
      map?.resetRefreshCounter();
    },
    dispose: () => generator.dispose(),
  };
}

export interface SunShadows {
  /** Vykreslí stínovou mapu znovu (po změně vrhačů – stavby, skryté stromy). */
  refresh(): void;
  /** Jak tmavé jsou stíny (0 = černé) – jen uniforma, mapa se nepřekresluje. */
  setDarkness(darkness: number): void;
  /** Vyřadí vrhače ze stínové mapy, nebo je vrátí (holé listnáče v zimě), a mapu obnoví. */
  setCastersEnabled(meshes: readonly Mesh[], enabled: boolean): void;
  /** Přidá vrhač stínu (vesnice vzniká až po krajině) a mapu obnoví. */
  addCaster(mesh: Mesh): void;
  dispose(): void;
}
