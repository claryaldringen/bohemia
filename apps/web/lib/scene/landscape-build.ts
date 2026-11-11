import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  buildForestField,
  buildRelief,
  obstaclesOf,
  premiumFeaturesOf,
  type Landscape,
  type ObstacleLayer,
} from '@bohemia/game';
import { HEIGHT_SCALE } from './constants';
import { decorPlacements, type DecorPlacement } from './decor-placement';
import { addDecorations } from './decorations';
import { terrainMeshHeight } from './drape';
import { addFauna, type Fauna } from './fauna';
import { birdFlocks, fishSchools, type BirdFlock, type FishSchool } from './fauna-placement';
import { addImpostors, type ImpostorForest } from './impostors';
import { obstacleScenery } from './obstacle-scenery';
import { premiumDecor, premiumRockTint } from './premium-sites-layout';
import { buildRenderSurface, type RenderSurface } from './render-surface';
import { addTrees } from './trees';

/**
 * Stavba scény krajiny (`LandscapeScene.setLandscape`) – čisté kroky bez stavu scény: výšky
 * terénu, plán stromů, dekorací a zvířat krajiny z vrstvy překážek a načtení jejich modelů.
 */

/** Kroky přípravy scény – texty k nim ukazuje rozhraní (a značky User Timing `scene:<krok>`). */
export type SceneStep = 'terrain' | 'forest' | 'surface' | 'models' | 'shaders';

/** Průběh přípravy scény: právě probíhající krok a celkový podíl hotové práce 0–1. */
export interface SceneProgress {
  step: SceneStep;
  done: number;
}

/** Výšky scény: síť terénu (i s úpravami vozových cest) a výšky na ní. */
export interface SceneGround {
  surface: RenderSurface;
  /** Výška terénu (m) z výškové sítě – stavby, stromy, postavy. */
  groundHeight: (x: number, z: number) => number;
  /** Výška sítě terénu (trojúhelníky, jak se kreslí) – obtisky, ohraničení, voda povodně. */
  decalHeight: (x: number, z: number) => number;
}

/** Stromy, keře, kameny, ozdoby a zvířata krajiny – co se načte jako modely. */
export interface SceneryPlan {
  /** Pole lesa (zapamatuje se – vrstva překážek ho převezme). */
  field: ReturnType<typeof buildForestField>;
  /** Vrstva překážek krajiny (herní data – stejná jako na serveru). */
  obstacles: ObstacleLayer;
  trees: ReturnType<typeof obstacleScenery>['trees'];
  /** Vnitřek lesa z impostorů (za okrajem 2–3 řad 3D stromů). */
  impostors: ReturnType<typeof obstacleScenery>['impostors'];
  premium: ReturnType<typeof premiumFeaturesOf>;
  decor: DecorPlacement[];
  relief: ReturnType<typeof buildRelief>;
  /** Ozdobná zvířata podle 0 A.D.: hejna ryb v tůních, kroužící vrány a káně. */
  fauna: { fish: FishSchool[]; birds: BirdFlock[] };
}

/** Výšková síť terénu krajiny a výšky na ní. */
export function sceneGround(landscape: Landscape): SceneGround {
  const surface = buildRenderSurface(landscape);
  return {
    surface,
    groundHeight: (x, z) => surface.heightAt(x, z) * HEIGHT_SCALE,
    decalHeight: (x, z) => terrainMeshHeight(surface, x, z),
  };
}

/**
 * Stromy, keře a kameny jsou herní data – vrstva překážek z herního jádra, stejná jako na
 * serveru: okraj lesa a jeho vnitřek (impostory), stromy v loukách a na břehu, borovice na
 * skalách, mladé stromky, souše, padlé stromy, pařezy, keře, kameny a skalní výchozy. K nim
 * ozdoby vody a prémiové krajiny, reliéf pro pastvu a ozdobná zvířata.
 */
export function planScenery(landscape: Landscape, ground: SceneGround): SceneryPlan {
  const { surface, groundHeight } = ground;
  // pole lesa napřed (zapamatuje se) – vrstva překážek ho převezme, nepočítá se dvakrát
  const field = buildForestField(landscape);
  const obstacles = obstaclesOf(landscape);
  const scenery = obstacleScenery(obstacles);
  // prémiová krajina (premium-landscapes.md – Vzhled): skály nalezišť v odstínu, ozdoby prvků
  const premium = premiumFeaturesOf(landscape);
  // ozdoby vody (rákos, lekníny, kmeny v potoce) nejsou překážky – jen vzhled scény
  const decor = [
    ...(premium ? scenery.decor.map(withRockTint) : scenery.decor),
    ...decorPlacements(landscape, surface.stream, surface.rivers),
    ...premiumDecor(landscape, premium, surface.stream),
  ];
  return {
    field,
    obstacles,
    trees: scenery.trees,
    impostors: scenery.impostors,
    premium,
    decor,
    relief: buildRelief(landscape),
    fauna: {
      fish: fishSchools(surface),
      birds: birdFlocks(landscape, field, surface.stream, groundHeight),
    },
  };
}

/** Co scéna dostane během načítání modelů krajiny. */
export interface SceneryLoadHooks {
  /** Jeden ze čtyř balíků modelů je hotový (i neúspěšně) – průběh načítání. */
  loaded: () => void;
  /** Atlas impostorů se překreslil (`shadowAtlasChanged` – i zimní atlas stínů). */
  impostorsChanged: (shadowAtlasChanged: boolean) => void;
  /** Vnitřek lesa je načtený (null – atlas chybí). */
  impostorsLoaded: (forest: ImpostorForest | null) => void;
  faunaLoaded: (fauna: Fauna) => void;
}

/**
 * Načte modely krajiny – stromy, dekorace, impostory vnitřku lesa a ozdobná zvířata – a vrátí
 * meshe stromů, dekorací a impostorů (jen ty skrývá InstanceHider – les vsi ne).
 */
export async function loadSceneryModels(
  scene: Scene,
  camera: ArcRotateCamera,
  plan: SceneryPlan,
  groundHeight: (x: number, z: number) => number,
  hooks: SceneryLoadHooks,
): Promise<Mesh[]> {
  const counted = <T>(promise: Promise<T>): Promise<T> => promise.finally(hooks.loaded);
  const sceneryMeshes: Mesh[] = [];
  const collect = (meshes: Mesh[]): void => {
    sceneryMeshes.push(...meshes);
  };
  await Promise.all([
    counted(addTrees(scene, plan.trees, { baseUrl: '/models/trees/', groundHeight }).then(collect)),
    counted(
      addDecorations(scene, plan.decor, { baseUrl: '/models/decor/', groundHeight }).then(collect),
    ),
    counted(
      addImpostors(scene, camera, plan.impostors, groundHeight, hooks.impostorsChanged).then(
        (forest) => {
          hooks.impostorsLoaded(forest);
          if (forest) collect(forest.meshes);
        },
        (error) =>
          console.warn(
            'Atlas stromů se nepodařilo načíst – vnitřek lesa zůstane bez stromů.',
            error,
          ),
      ),
    ),
    counted(
      addFauna(scene, plan.fauna, { baseUrl: '/models/fauna/' }).then(hooks.faunaLoaded, (error) =>
        console.warn('Zvířata krajiny se nepodařilo načíst.', error),
      ),
    ),
  ]);
  return sceneryMeshes;
}

/**
 * Počká, až prohlížeč vykreslí snímek (ukazatel průběhu se překreslí i mezi synchronními
 * kroky). Ve skrytém panelu requestAnimationFrame neběží – pak stačí krátká pauza.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });
}

/** Skála prémiového naleziště v odstínu (rudný výchoz, vápenec lomu); ostatní beze změny. */
function withRockTint(p: DecorPlacement): DecorPlacement {
  const group = premiumRockTint(p.id);
  return group ? { ...p, group } : p;
}
