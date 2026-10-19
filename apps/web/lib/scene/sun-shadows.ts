import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { raysAngleDeg, type Rays } from './day-light';

/** Rozlišení stínové mapy – na krajinu 1,9 km vychází ≈ 0,7 m na texel. */
const SHADOW_MAP_SIZE = 4096;
/** Jak tmavé jsou stíny (0 = černé) – okolní světlo z oblohy je prosvětlí. */
export const SHADOW_DARKNESS = 0.35;
/**
 * Den a noc: stínová mapa se s pohybem slunce obnoví, až se směr světla od posledního vykreslení
 * mapy pootočí o tolik stupňů (stíny poskočí o ≈ 1 m u 25m stromu); osvětlení se mění plynule.
 */
export const SHADOW_STEP_DEG = 1.5;

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
  // Den a noc: směr světla se mění plynule (osvětlení), stínová mapa jen po krocích. Mezi
  // vykresleními mapy čtou stíny matici, se kterou se mapa kreslila – jinak by stíny ujížděly
  // od svých stromů. Při obnově mapy platí zase živá matice (podle současného směru).
  const liveMatrix = generator.getTransformMatrix.bind(generator);
  const heldMatrix = Matrix.Identity();
  let holding = false;
  generator.getTransformMatrix = (): Matrix => (holding ? heldMatrix : liveMatrix());
  /** Směr světla, se kterým se mapa naposledy kreslila (nebo kreslit bude). */
  let mapDirection: Rays = { x: sun.direction.x, y: sun.direction.y, z: sun.direction.z };
  let stale = false;
  map?.onAfterRenderObservable.add(() => {
    heldMatrix.copyFrom(liveMatrix());
    holding = true;
  });
  const refresh = (): void => {
    holding = false;
    stale = false;
    mapDirection = { x: sun.direction.x, y: sun.direction.y, z: sun.direction.z };
    map?.resetRefreshCounter();
  };
  return {
    refresh,
    aim: (direction, visible) => {
      sun.direction.set(direction.x, direction.y, direction.z);
      sun.direction.scaleToRef(-options.extentM, sun.position);
      const due = shadowRefreshDue(mapDirection, direction, visible, stale);
      if (due === 'refresh') refresh();
      else if (due === 'stale') stale = true;
    },
    setDarkness: (darkness) => generator.setDarkness(darkness),
    setCastersEnabled: (meshes, enabled) => {
      for (const mesh of meshes) {
        if (enabled) generator.addShadowCaster(mesh, false);
        else generator.removeShadowCaster(mesh, false);
      }
      refresh();
    },
    addCaster: (mesh) => {
      generator.addShadowCaster(mesh, false);
      refresh();
    },
    dispose: () => generator.dispose(),
  };
}

/** Co se při překreslení vsi změnilo (`LandscapeScene.applyVillage`). */
export interface VillageSceneChanges {
  /** Stavby, pole (panáky, stohy), hřbitovy, sady… – `VillageRenderer.update`. */
  village: boolean;
  /** Skryté nebo zvětšené stromy, keře a kameny krajiny (InstanceHider). */
  hidden: boolean;
  /** Pařezy a nálet po pokácených stromech. */
  felled: boolean;
  /** Hromada klád. */
  logs: boolean;
  /** Ztmavení trávy pod stromy (terén stín jen přijímá). */
  shade: boolean;
  /** Plocha korun nad pasekou (nevrhá stín do mapy). */
  canopy: boolean;
  /** Domácí zvířata a lidé – stín do stínové mapy nevrhají (mapa je statická). */
  animals: boolean;
  people: boolean;
}

/**
 * Obnovit stínovou mapu (4096², přes celou krajinu)? Jen když se změnily vrhače stínu – stavby
 * a pole vsi, skryté stromy, pařezy, hromada klád; ne kvůli zvířatům, lidem, ztmavení trávy
 * nebo ploše korun (dřív se mapa překreslila po každé změně práce dne).
 */
export function castersChanged(changes: VillageSceneChanges): boolean {
  return changes.village || changes.hidden || changes.felled || changes.logs;
}

/**
 * Obnovit stínovou mapu po pootočení světla (den a noc)? `refresh` – směr se od mapy pootočil
 * aspoň o SHADOW_STEP_DEG a stíny jsou vidět (nebo mapa zastarala, dokud vidět nebyly); `stale` –
 * pootočil se, ale stíny teď vidět nejsou (soumrak, nízké slunce) – obnoví se, až budou;
 * `keep` – mapa platí.
 */
export function shadowRefreshDue(
  mapDirection: Rays,
  direction: Rays,
  visible: boolean,
  stale: boolean,
): 'refresh' | 'stale' | 'keep' {
  const turned = stale || raysAngleDeg(mapDirection, direction) >= SHADOW_STEP_DEG;
  if (!turned) return 'keep';
  return visible ? 'refresh' : 'stale';
}

export interface SunShadows {
  /** Vykreslí stínovou mapu znovu (po změně vrhačů – stavby, skryté stromy). */
  refresh(): void;
  /**
   * Natočí světlo (den a noc). Stínová mapa se obnoví, až se směr pootočí o SHADOW_STEP_DEG
   * a stíny jsou vidět (`visible`).
   */
  aim(direction: Rays, visible: boolean): void;
  /** Jak tmavé jsou stíny (0 = černé) – jen uniforma, mapa se nepřekresluje. */
  setDarkness(darkness: number): void;
  /** Vyřadí vrhače ze stínové mapy, nebo je vrátí (holé listnáče v zimě), a mapu obnoví. */
  setCastersEnabled(meshes: readonly Mesh[], enabled: boolean): void;
  /** Přidá vrhač stínu (vesnice vzniká až po krajině) a mapu obnoví. */
  addCaster(mesh: Mesh): void;
  dispose(): void;
}
