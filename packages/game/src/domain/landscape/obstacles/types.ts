// Vrstva překážek krajiny (fields.md – Překážky jsou herní data): stromy, keře, kameny,
// balvany a skalní výchozy. Server podle ní počítá cenu staveb a polí a ví, kde které stromy
// stojí (les a dřevo – forest.md); scéna je kreslí z ní.

/**
 * Druh překážky – zároveň řádek tabulky cen (fields.md – Překážka na louce, Co je překážka):
 * `tree` dospělý strom, `youngTree` mladý stromek, `snag` souš, `fallenTree` padlý strom,
 * `stump` pařez, `shrub` keř, `stone` kámen, `boulder` balvan, `outcrop` skalní výchoz.
 */
export type ObstacleKind =
  | 'tree'
  | 'youngTree'
  | 'snag'
  | 'fallenTree'
  | 'stump'
  | 'shrub'
  | 'stone'
  | 'boulder'
  | 'outcrop';

export const OBSTACLE_KINDS: readonly ObstacleKind[] = [
  'tree',
  'youngTree',
  'snag',
  'fallenTree',
  'stump',
  'shrub',
  'stone',
  'boulder',
  'outcrop',
];

/** Stromové druhy – stromy, mladé stromky, souše a padlé stromy (pařez je „stump“). */
export const TREE_KINDS: readonly ObstacleKind[] = ['tree', 'youngTree', 'snag', 'fallenTree'];

/** Dřevina (u keřů a kamenů null). */
export type TreeSpecies = 'oak' | 'beech' | 'birch' | 'fir' | 'pine' | 'elm' | 'poplar' | 'willow';

/** 3D modely stromů ve scéně (`spruce-*` jsou jedle z 0 A.D.). */
export const TREE_LOOKS = [
  'spruce-1',
  'spruce-2',
  'oak-1',
  'oak-2',
  'beech-1',
  'beech-2',
  'birch-1',
  'birch-2',
  'oak-large-1',
  'oak-large-2',
  'oak-large-3',
  'elm-1',
  'elm-2',
  'elm-3',
  'elm-4',
  'poplar-1',
  'poplar-2',
  'poplar-3',
  'pine-1',
  'pine-2',
  'pine-3',
  'fir-young-1',
  'fir-young-2',
] as const;

/** Modely drobných překážek (kreslí je dekorace scény). */
export const DECOR_OBSTACLE_LOOKS = [
  'willow',
  'underbrush-1',
  'underbrush-2',
  'shrub-1',
  'shrub-2',
  'shrub-3',
  'shrub-4',
  'shrub-5',
  'shrub-6',
  'shrub-7',
  'boulder',
  'stone-1',
  'stone-2',
  'rock-boulder',
  'rock-ridge',
  'rock-tower',
  'rock-moss-1',
  'rock-moss-2',
  'snag-1',
  'snag-2',
  'snag-3',
  'snag-oak',
  'stump',
  'fallen-1',
  'fallen-2',
  'fallen-3',
] as const;

export type TreeLook = (typeof TREE_LOOKS)[number];
export type DecorObstacleLook = (typeof DECOR_OBSTACLE_LOOKS)[number];
/** Podoba překážky = model, kterým ji kreslí scéna. */
export type ObstacleLook = TreeLook | DecorObstacleLook;

export const OBSTACLE_LOOKS: readonly ObstacleLook[] = [...TREE_LOOKS, ...DECOR_OBSTACLE_LOOKS];

/** Dřevina podle podoby (null u keřů, kamenů a pařezů). */
export function lookSpecies(look: ObstacleLook): TreeSpecies | null {
  if (look.startsWith('spruce') || look.startsWith('fir-young')) return 'fir';
  if (look.startsWith('oak') || look === 'snag-oak') return 'oak';
  if (look.startsWith('beech')) return 'beech';
  if (look.startsWith('birch')) return 'birch';
  if (look.startsWith('pine')) return 'pine';
  if (look.startsWith('elm')) return 'elm';
  if (look.startsWith('poplar')) return 'poplar';
  if (look === 'willow') return 'willow';
  return null;
}

/** Jedna překážka při generování (před uložením do vrstvy). */
export interface ObstaclePlacement {
  /** Stabilní id – viz `obstacleId`. */
  id: number;
  kind: ObstacleKind;
  look: ObstacleLook;
  /** Pata ve světě scény (m). */
  x: number;
  z: number;
  /** Natočení kolem svislé osy (rad). */
  rotation: number;
  /** Násobek velikosti modelu. */
  scale: number;
  /** Strom vnitřku lesa kreslený obrázkem (impostor), ne 3D modelem. */
  impostor?: boolean;
}

/**
 * Vrstva překážek po sloupcích (typovaná pole – desítky tisíc překážek na krajinu). Index
 * překážky je pořadí ve vrstvě; id roste s indexem (hledá se půlením – `obstacleIndex`).
 */
export interface ObstacleLayer {
  readonly version: 1;
  readonly count: number;
  readonly id: Uint32Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Index do OBSTACLE_KINDS. */
  readonly kind: Uint8Array;
  /** Index do OBSTACLE_LOOKS. */
  readonly look: Uint8Array;
  readonly rotation: Float32Array;
  readonly scale: Float32Array;
  /** 1 = strom vnitřku lesa kreslený obrázkem (impostor). */
  readonly impostor: Uint8Array;
  /** Překážky po políčkách: indexy překážek políčka i jsou `tileItems[tileStart[i] … tileStart[i + 1])`. */
  readonly tileStart: Uint32Array;
  readonly tileItems: Uint32Array;
  /** Strana mřížky políček a jejich velikost (m) – pro hledání po políčkách. */
  readonly size: number;
  readonly cellSizeM: number;
}

/**
 * Zdroj překážky – kterým rozmisťovačem vznikla. Id = zdroj × 2^22 + místo, kde místo je
 * buňka mřížky rozmisťovače × 8 + pořadí ve skupině. Id tak nezávisí na pořadí generování ani
 * na tom, zda jinde nějaká překážka přibyla – změna jednoho místa nepřečísluje ostatní.
 */
export const OBSTACLE_SOURCES = {
  edgeTree: 1,
  impostor: 2,
  bankTree: 3,
  meadowTree: 4,
  pine: 5,
  youngTree: 6,
  snag: 7,
  fallenTree: 8,
  stump: 9,
  shrubBelt: 10,
  treeShrub: 11,
  shrubIsland: 12,
  outcrop: 13,
  bankBoulder: 14,
  stone: 15,
  willow: 16,
} as const;

export type ObstacleSource = keyof typeof OBSTACLE_SOURCES;

/** 2^22 – místo na zdroj (napsané číslem: ** je ve vrstvě zakázané, viz eslint.config.mjs). */
const SOURCE_SHIFT = 4_194_304;
const MEMBERS = 8;

/** Stabilní id překážky ze zdroje, buňky mřížky rozmisťovače a pořadí ve skupině (0–7). */
export function obstacleId(source: ObstacleSource, cell: number, member = 0): number {
  if (!Number.isInteger(member) || member < 0 || member >= MEMBERS) {
    throw new RangeError(`Pořadí ve skupině ${member} je mimo 0–${MEMBERS - 1}.`);
  }
  const place = cell * MEMBERS + member;
  if (!Number.isInteger(cell) || cell < 0 || place >= SOURCE_SHIFT) {
    throw new RangeError(`Buňka ${cell} se do id překážky nevejde.`);
  }
  return OBSTACLE_SOURCES[source] * SOURCE_SHIFT + place;
}
