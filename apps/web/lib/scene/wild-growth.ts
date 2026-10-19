import {
  isWoodTreeId,
  rotationCosSin,
  sacredFootprint,
  woodIdCell,
  woodTreeOf,
  woodTreeSpots,
  type AddedObstacle,
} from '@bohemia/game';
import type { SceneFieldPart, SceneVillage, SceneWood } from '../village-view';
import {
  buildingClearings,
  clearingsKey,
  insideClearings,
  type Clearing,
} from './building-clearings';
import { hash01 } from './smoke-schedule';
import { swathBands, swathBandsKey, swathDistance } from './swath-bands';

// Zarůstání přílohu ve scéně (fields.md – Zarůstání, Les vsi): na dílu, který stáda nespásají
// a ves neseče, přibývají keře a mladé stromky, které rostou s léty bez pastvy a seče (herní data
// – `SceneFieldPart.overgrowth`); les vsi (díl, který zarostl a z pole vypadl) má stromy z jádra
// (`SceneVillage.obstacles.added` – místa a druh: dospělý, mladý, pařez) a roste do 70 let.
// Čisté funkce bez Babylonu – stejný díl a stáří dají vždy stejné rostliny (hash podle políčka).
// Modely jsou z krajiny: keře z dekorací, stromy z lesa (bříza, topol místo osiky, dub, buk).

/** Keře zarůstajícího přílohu (trnka, šípek, hloh – modely keřů krajiny). */
export const WILD_SHRUB_MODELS = [
  'shrub-1',
  'shrub-2',
  'shrub-3',
  'shrub-4',
  'shrub-5',
  'shrub-6',
  'shrub-7',
] as const;
/** Průkopnické stromy mladého lesa – bříza a osika (topol). */
export const WILD_PIONEER_MODELS = ['birch-1', 'birch-2', 'poplar-1', 'poplar-2'] as const;
/** Stromy, které v lese vsi přibývají se stářím – dub a buk. */
export const WILD_LATE_MODELS = ['oak-1', 'oak-2', 'beech-1', 'beech-2'] as const;
/** Pařez pokáceného stromu lesa vsi. */
export const WILD_STUMP_MODEL = 'stump';

type ShrubModel = (typeof WILD_SHRUB_MODELS)[number];
export type WildTreeModel =
  (typeof WILD_PIONEER_MODELS)[number] | (typeof WILD_LATE_MODELS)[number];
export type WildDecorModel = ShrubModel | typeof WILD_STUMP_MODEL;
export type WildModel = WildTreeModel | WildDecorModel;

/** Všechny modely zarůstání – stromy (`trees-<model>`) a dekorace (`decor-<model>`). */
export const WILD_TREE_MODELS: readonly WildTreeModel[] = [
  ...WILD_PIONEER_MODELS,
  ...WILD_LATE_MODELS,
];
export const WILD_DECOR_MODELS: readonly WildDecorModel[] = [
  ...WILD_SHRUB_MODELS,
  WILD_STUMP_MODEL,
];

/** Je model strom (soubor ve stromech, materiál stromu), ne dekorace? */
export function isWildTreeModel(model: WildModel): model is WildTreeModel {
  return (WILD_TREE_MODELS as readonly string[]).includes(model);
}

/** Soubor modelu zarůstání. */
export function wildModelUrl(model: WildModel): string {
  return isWildTreeModel(model) ? `/models/trees/${model}.glb` : `/models/decor/${model}.glb`;
}

/** Rostlina zarůstání: model, pata ve světě (m), natočení a násobek velikosti modelu. */
export interface WildPlant {
  model: WildModel;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/**
 * Jak rychle zarůstá (roky bez pastvy a seče – fields.md, Zarůstání; čísla jen vzhled): první
 * keře od 3 let (pionýři ještě v louce), plné křoviny v 15 letech, průkopnické stromky od 8 let,
 * v 30 letech mladý les (stromy ≈ 55 % dospělého stromu); v lese vsi stromy dorostou do 70 let.
 */
const SHRUBS = { fromYears: 3, fullYears: 15, min: 2, max: 12, scaleFrom: 0.35, scaleTo: 1.05 };
const SAPLINGS = { fromYears: 8, fullYears: 30, scaleFrom: 0.14, scaleTo: 0.55 };
/** Keře pod mladým lesem řídnou (stín korun) – v 30 letech zbude polovina. */
const SHADED = { fromYears: 20, fullYears: 30, keep: 0.5 };
/** Les vsi: velikost stromů od 30 do 70 let, podíl dubů a buků roste z 15 % na 55 %. */
const WOOD = {
  fromYears: 30,
  fullYears: 70,
  scaleFrom: 0.55,
  scaleTo: 1,
  lateFrom: 0.15,
  lateTo: 0.55,
};
/** Mladý (nedospělý) strom lesa vsi je menší než dospělý. */
const YOUNG_TREE_SCALE = 0.8;
/** Podrost lesa vsi – keře na čtverec. */
const WOOD_UNDERGROWTH = 3;
/** Okraj čtverce, kam keře nesahají (m) – rostliny zůstanou ve svém čtverci. */
const MARGIN_M = 1;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t));
}

function pick<T>(list: readonly T[], a: number, b: number, salt: number): T {
  return list[Math.min(list.length - 1, Math.floor(hash01(a, b, salt) * list.length))]!;
}

/** Čtverec dílu nebo lesa vsi – i natočený (fields.md – Natočené stavby). */
type WildSquare = Pick<SceneFieldPart, 'cell' | 'x' | 'z' | 'size'> & { rotation?: number };

/**
 * Seed čtverce: políčko; natočený čtverec (souřadnice v mřížce stavby se mohou opakovat) podle
 * středu na decimetry.
 */
function squareSeed(part: WildSquare): number {
  if (!part.rotation) return part.cell.y * 4096 + part.cell.x;
  return (Math.round(part.x * 10) * 73_856_093) ^ (Math.round(part.z * 10) * 19_349_663);
}

/** Bod v čtverci dílu podle hashe (políčko, pořadí rostliny, sůl) – v osách čtverce. */
function spotIn(part: WildSquare, k: number, salt: number): { x: number; z: number } {
  const span = part.size - 2 * MARGIN_M;
  const seed = squareSeed(part);
  const u = -span / 2 + hash01(seed, k, salt) * span;
  const v = -span / 2 + hash01(seed, k, salt + 1) * span;
  if (!part.rotation) return { x: part.x + u, z: part.z + v };
  const [c, s] = rotationCosSin(part.rotation);
  return { x: part.x + u * c + v * s, z: part.z - u * s + v * c };
}

/**
 * Keře a stromky na zarůstajícím dílu po `years` letech bez pastvy a seče. Stromky stojí na
 * místech, kde jednou poroste les vsi (`woodTreeSpots`), ať les při vypadnutí z pole nepřeskočí.
 */
export function partWildPlants(part: WildSquare, years: number): WildPlant[] {
  if (years < SHRUBS.fromYears) return [];
  const plants: WildPlant[] = [];
  const seed = squareSeed(part);
  const grown = (years - SHRUBS.fromYears) / (SHRUBS.fullYears - SHRUBS.fromYears);
  const shade = lerp(
    1,
    SHADED.keep,
    (years - SHADED.fromYears) / (SHADED.fullYears - SHADED.fromYears),
  );
  const shrubs = Math.round(lerp(SHRUBS.min, SHRUBS.max, grown) * shade);
  const shrubScale = lerp(SHRUBS.scaleFrom, SHRUBS.scaleTo, grown);
  for (let k = 0; k < shrubs; k++) {
    const at = spotIn(part, k, 11);
    plants.push({
      model: pick(WILD_SHRUB_MODELS, seed, k, 21),
      ...at,
      rotationY: hash01(seed, k, 31) * Math.PI * 2,
      scale: shrubScale * (0.8 + hash01(seed, k, 41) * 0.4),
    });
  }
  if (years >= SAPLINGS.fromYears) {
    const t = (years - SAPLINGS.fromYears) / (SAPLINGS.fullYears - SAPLINGS.fromYears);
    const spots = woodTreeSpots({
      cell: part.cell,
      x: part.x,
      z: part.z,
      areaM2: part.size * part.size,
      ...(part.rotation !== undefined ? { rotation: part.rotation } : {}),
    });
    const count = Math.max(1, Math.round(lerp(1, spots.length, t)));
    for (const spot of spots.slice(0, count)) {
      plants.push({
        model: pick(WILD_PIONEER_MODELS, spot.id, 0, 51),
        x: spot.x,
        z: spot.z,
        rotationY: hash01(spot.id, 0, 61) * Math.PI * 2,
        scale:
          lerp(SAPLINGS.scaleFrom, SAPLINGS.scaleTo, t) * (0.85 + hash01(spot.id, 0, 71) * 0.3),
      });
    }
  }
  return plants;
}

/**
 * Stromy a podrost lesa vsi: stromy na místech z jádra (dospělý, mladý, pařez – `added`), druh
 * podle místa (s věkem lesa přibývá dubů a buků), velikost podle stáří lesa; k tomu pár keřů.
 */
export function woodWildPlants(wood: SceneWood, trees: readonly AddedObstacle[]): WildPlant[] {
  const t = (wood.age - WOOD.fromYears) / (WOOD.fullYears - WOOD.fromYears);
  const size = lerp(WOOD.scaleFrom, WOOD.scaleTo, t);
  const late = lerp(WOOD.lateFrom, WOOD.lateTo, t);
  const plants: WildPlant[] = [];
  for (const tree of trees) {
    const rotationY = hash01(tree.id, 0, 61) * Math.PI * 2;
    const jitter = 0.85 + hash01(tree.id, 0, 71) * 0.3;
    if (tree.kind === 'stump') {
      plants.push({
        model: WILD_STUMP_MODEL,
        x: tree.x,
        z: tree.z,
        rotationY,
        scale: 0.9 * jitter,
      });
      continue;
    }
    const list = hash01(tree.id, 0, 81) < late ? WILD_LATE_MODELS : WILD_PIONEER_MODELS;
    plants.push({
      model: pick(list, tree.id, 0, 51),
      x: tree.x,
      z: tree.z,
      rotationY,
      scale: size * (tree.kind === 'tree' ? 1 : YOUNG_TREE_SCALE) * jitter,
    });
  }
  const seed = squareSeed(wood);
  for (let k = 0; k < WOOD_UNDERGROWTH; k++) {
    plants.push({
      model: pick(WILD_SHRUB_MODELS, seed, k, 91),
      ...spotIn(wood, k, 101),
      rotationY: hash01(seed, k, 111) * Math.PI * 2,
      scale: 0.7 + hash01(seed, k, 121) * 0.35,
    });
  }
  return plants;
}

/** Stromy lesa vsi z překážek přidaných vsí – po políčkách. */
function woodTreesByCell(village: Pick<SceneVillage, 'obstacles'>): Map<string, AddedObstacle[]> {
  const byCell = new Map<string, AddedObstacle[]>();
  for (const o of village.obstacles?.added ?? []) {
    if (!isWoodTreeId(o.id)) continue;
    const { cell } = woodTreeOf(o.id);
    const key = `${cell.x},${cell.y}`;
    byCell.set(key, [...(byCell.get(key) ?? []), o]);
  }
  return byCell;
}

/** Ves pro zarůstání – díly polí, les vsi a jeho stromy, cesty (průsek); stavby, pod kterými nic neroste. */
type WildVillage = Pick<SceneVillage, 'fields' | 'woods' | 'obstacles' | 'roads'> &
  Partial<Pick<SceneVillage, 'dwellings' | 'sacred'>>;

/**
 * Plochy staveb, pod kterými keře a podrost nerostou (Martin, 19. 10. 2026 – stavba v lese les
 * vyklučí): vyklízené plochy obydlí a dílen, natočené pozemky a půdorysy model a svatyní.
 */
function wildClearings(village: WildVillage): Clearing[] {
  const sacred = (village.sacred?.buildings ?? []).map((b) => {
    const polygon = sacredFootprint(b.kind, b.position);
    const xs = polygon.map((p) => p[0]);
    const zs = polygon.map((p) => p[1]);
    return {
      polygon,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  });
  return [...buildingClearings(village.dwellings ?? []), ...sacred];
}

/**
 * Všechny rostliny zarůstání ve vsi – zarůstající díly polí a les vsi; do průseku lesem
 * (roads.md – Průsek lesem) nevstoupí a pod stavbami (vyklízená plocha, půdorys) nic neroste.
 */
export function wildPlants(village: WildVillage): WildPlant[] {
  const plants = allWildPlants(village);
  const clearings = wildClearings(village);
  if (clearings.length === 0) return plants;
  const cleared = insideClearings(clearings, 0);
  return plants.filter((plant) => !cleared(plant.x, plant.z));
}

function allWildPlants(village: WildVillage): WildPlant[] {
  const plants: WildPlant[] = [];
  for (const field of village.fields) {
    for (const part of field.parts) {
      if (part.overgrowth) plants.push(...partWildPlants(part, part.overgrowth));
    }
  }
  const trees = woodTreesByCell(village);
  for (const wood of village.woods ?? []) {
    // les z natočeného pole má id stromů podle buňky pod středem (woodIdCell v jádru)
    const id = woodIdCell(wood);
    plants.push(...woodWildPlants(wood, trees.get(`${id.x},${id.y}`) ?? []));
  }
  const bands = swathBands(village.roads);
  if (bands.length === 0) return plants;
  return plants.filter((p) => !(swathDistance(bands, p.x, p.z, 0) <= 0));
}

/**
 * Klíč zarůstání – rostliny se přestaví, jen když se změní (roky dílů, les, jeho stromy, plochy
 * staveb).
 */
export function wildKey(village: WildVillage): string {
  const parts = village.fields.flatMap((f) =>
    f.parts.flatMap((p) =>
      p.overgrowth && p.overgrowth >= SHRUBS.fromYears
        ? [`${p.cell.x},${p.cell.y}:${p.overgrowth}`]
        : [],
    ),
  );
  const woods = (village.woods ?? []).map((w) => `${w.cell.x},${w.cell.y}:${w.age}`);
  const trees = (village.obstacles?.added ?? [])
    .filter((o) => isWoodTreeId(o.id))
    .map((o) => `${o.id}:${o.kind}`);
  const clearings =
    parts.length > 0 || woods.length > 0 ? clearingsKey(wildClearings(village)) : '';
  return JSON.stringify([parts, woods, trees, swathBandsKey(swathBands(village.roads)), clearings]);
}
