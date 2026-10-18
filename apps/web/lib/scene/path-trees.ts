import type { RoadTreeSpecies } from '@bohemia/game';
import type { SceneRoadTree } from '../village-view';
import { hash01 } from './smoke-schedule';

// Stromy u pevných cest ve scéně (docs/design/roads.md – Stromy u pevných cest; Martin: napřed
// keř, kde jednou vyrostou, stojí, dokud samy neodumřou). Kde stojí, jaký je to druh, stadium
// a velikost jsou herní data z jádra (`SceneVillage.roadTrees`); tady jen výběr modelu a měřítka:
// keř z dekorací, strom podle druhu (osamělé stromy krajiny), souš a pařez. Čisté funkce – stejný
// strom má vždy stejný model a natočení (podle id).

/** Modely stromů podle druhu (public/models/trees/) – osamělé stromy v loukách. */
export const ROAD_TREE_MODELS = {
  oak: ['oak-1', 'oak-2'],
  elm: ['elm-1', 'elm-2', 'elm-3'],
  poplar: ['poplar-1', 'poplar-2'],
} as const satisfies Record<RoadTreeSpecies, readonly string[]>;

/** Všechny modely stromů u cest. */
export const PATH_TREE_MODELS = [
  ...ROAD_TREE_MODELS.oak,
  ...ROAD_TREE_MODELS.elm,
  ...ROAD_TREE_MODELS.poplar,
] as const;
export type PathTreeModel = (typeof PATH_TREE_MODELS)[number];

/** Keř (mladý nálet do 8 let), souš a pařez – modely dekorací (public/models/decor/). */
export const ROAD_SHRUB_MODELS = [
  'shrub-1',
  'shrub-2',
  'shrub-3',
  'shrub-4',
  'shrub-5',
  'shrub-6',
  'shrub-7',
] as const;
export const ROAD_SNAG_MODELS = ['snag-1', 'snag-2', 'snag-3'] as const;
export const OAK_SNAG_MODEL = 'snag-oak';
export const STUMP_MODEL = 'stump';
type RoadDecorModel =
  | (typeof ROAD_SHRUB_MODELS)[number]
  | (typeof ROAD_SNAG_MODELS)[number]
  | typeof OAK_SNAG_MODEL
  | typeof STUMP_MODEL;

/** Model u cesty: strom (stromy krajiny), nebo keř, souš a pařez (dekorace). */
export type RoadsideModel = PathTreeModel | RoadDecorModel;

/** Všechny modely u cest – meshe `pathside-<model>`. */
export const ROADSIDE_MODELS: readonly RoadsideModel[] = [
  ...PATH_TREE_MODELS,
  ...ROAD_SHRUB_MODELS,
  ...ROAD_SNAG_MODELS,
  OAK_SNAG_MODEL,
  STUMP_MODEL,
];

/** Je model strom (soubor ve stromech a materiál stromu), ne dekorace? */
export function isPathTreeModel(model: RoadsideModel): model is PathTreeModel {
  return (PATH_TREE_MODELS as readonly string[]).includes(model);
}

/** Soubor modelu u cesty. */
export function roadsideModelUrl(model: RoadsideModel): string {
  return isPathTreeModel(model) ? `/models/trees/${model}.glb` : `/models/decor/${model}.glb`;
}

/** Instance modelu u cesty – poloha, natočení a násobek velikosti modelu. */
export interface RoadsideInstance {
  model: RoadsideModel;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Keř roste od takového do plného měřítka modelu keře (podle stáří keře 0–1). */
const SHRUB_SCALE = { from: 0.45, to: 1.05 } as const;
/** Pařez stromu u cesty – měřítko modelu pařezu. */
const STUMP_SCALE = 0.95;

function pick<T>(list: readonly T[], id: number, salt: number): T {
  return list[Math.min(list.length - 1, Math.floor(hash01(id, salt, 72) * list.length))]!;
}

/**
 * Model a měřítko stromu u cesty podle stadia: keř (zvětšuje se do 8 let), strom podle druhu
 * a velikosti z jádra (30 % → plná ve 40 letech), souš (dub má vlastní) a pařez. Velikost se trochu
 * liší strom od stromu (±12 %).
 */
export function roadsideInstance(tree: SceneRoadTree): RoadsideInstance {
  const rotationY = hash01(tree.id, 5, 72) * Math.PI * 2;
  const jitter = 0.88 + hash01(tree.id, 6, 72) * 0.24;
  const at = { x: tree.x, z: tree.z, rotationY };
  switch (tree.stage) {
    case 'shrub':
      return {
        ...at,
        model: pick(ROAD_SHRUB_MODELS, tree.id, 1),
        scale: (SHRUB_SCALE.from + (SHRUB_SCALE.to - SHRUB_SCALE.from) * tree.growth) * jitter,
      };
    case 'tree':
      return {
        ...at,
        model: pick(ROAD_TREE_MODELS[tree.species], tree.id, 2),
        scale: tree.growth * jitter,
      };
    case 'snag':
      return {
        ...at,
        model: tree.species === 'oak' ? OAK_SNAG_MODEL : pick(ROAD_SNAG_MODELS, tree.id, 3),
        scale: jitter,
      };
    case 'stump':
      return { ...at, model: STUMP_MODEL, scale: STUMP_SCALE * jitter };
  }
}

/** Klíč stromů u cest – modely se přestaví, jen když se změní. */
export function roadTreesKey(trees: readonly SceneRoadTree[] | undefined): string {
  return (trees ?? []).map((t) => `${t.id}:${t.stage}:${t.growth}`).join(',');
}
