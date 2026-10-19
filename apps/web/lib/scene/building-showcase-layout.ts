// Rozestavění staveb na vývojové stránce /dev/buildings – bez Babylonu (smí i do stránky).
// Jen pro prohlídku modelů (řemesla a posvátná místa staví hráč ve vsi). Za řadou
// staveb pole, hřbitov, sad a louka na seno po čtvercích – jejich fáze podle průběhu stavby
// (showcaseGrounds); vpravo modla, svatyně, posvátný dub a dubový háj (dekorace bez staveniště);
// vlevo od pole tři čtverce, které po čtvercích orá spřežení volů s rádlem (ukázka „Orání“ –
// orba postupuje po dnech ukázky jako ve hře, plough-front.ts),
// vlevo od zemnice ohrada s přístřeškem (ukázka „Ohrada“, pen-layout.ts); před pozemky rozpad
// obydlí – opuštěná zemnice a polozemnice podle posuvníku stavu a řada všech stupňů rozpadu
// (showcaseDecay, dwelling-decay.ts); vpravo vzadu dílna tesaře a pahorek s vozy (showcaseCarts,
// cart-layout.ts).
import {
  ABANDONMENT,
  CEMETERY,
  MILIR,
  PLOT_VARIANTS,
  RUIN_YEARS,
  placeMound,
  usedPlaces,
  type Cemetery,
  type DwellingType,
  type GraveRank,
  type PlotVariant,
  type TileCell,
} from '@bohemia/game';
import type {
  FieldLook,
  SceneFieldPart,
  SceneGraveMound,
  SceneLabor,
  SceneRoad,
  SceneVillage,
} from '../village-view';
import {
  cartRoute,
  type CartCargo,
  type CartKind,
  type CartRoute,
  type CartTrack,
} from './cart-layout';
import { CEMETERY_PHASES } from './cemetery-layout';
import { DECAY_LABELS, DECAY_STAGES, decayStage, type DecayStage } from './dwelling-decay';
import { hayPhase, meadowLook, type HayMeadow } from './hay-meadows';
import { STRUCTURE_STAGE_LABELS } from './structure-decay';
import { plotHouse } from './homestead-layout';
import { TREE_GROWTH_YEARS, treeGrowth } from './orchard-layout';
import { penFacing, type Direction, type PenSquare } from './pen-layout';
import type { ConstructionKind } from './village-construction';

/**
 * Milíř stojí „kus od“ uhlířovy zemnice: odstup v souřadnicích modelu ve scéně (x napříč,
 * z k vchodu) ≈ 9,5 m, doporučeně 8–12 m – pravidlo herního jádra (`MILIR.offset`, crafts.md).
 * Totéž je v `tools/blender/crafts.py` jako MILIR_OFFSET v souřadnicích Blenderu (tam
 * s opačnými znaménky, vchod míří do −y).
 */
export const MILIR_OFFSET_M = MILIR.offset;

export interface ShowcaseModel {
  /** Druh stavby – fáze staveniště a jáma (village-construction.ts). */
  kind: ConstructionKind;
  /** Cesta k hotovému modelu v `public/`. */
  url: string;
  x: number;
  z: number;
  /** Natočení kolem svislé osy (rad) – jako `Position.rotation`. */
  rotation: number;
  /**
   * Pozemek polozemnice – políčko (střed, strana) a varianta, kde na něm dům stojí; u dvorce
   * vojvody i střed dvora (trade.md).
   */
  plot?: {
    x: number;
    z: number;
    size: number;
    variant: PlotVariant;
    yard?: { x: number; z: number };
  };
}

export interface ShowcaseBuilding {
  id: string;
  label: string;
  models: ShowcaseModel[];
  /** Kam se po výběru podívá kamera (cíl a vzdálenost). */
  focus: { x: number; z: number; radius: number };
}

/** Vchod (+z modelu) ke kameře, která na začátku stojí na −z. */
const FACING = Math.PI;

/** Bod v souřadnicích modelu → svět (jako `localToWorld` ve village-layout.ts). */
function offset(
  x: number,
  z: number,
  rotation: number,
  local: { x: number; z: number },
): { x: number; z: number } {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return { x: x + local.x * c + local.z * s, z: z - local.x * s + local.z * c };
}

/** Hotové modely posvátných míst (tools/blender/sacred.py). */
export const SACRED_MODEL_URLS = {
  modla: '/models/sacred/idol.glb',
  svatyne: '/models/sacred/shrine.glb',
} as const;

/** Cesta k hotovému modelu stavby v `public/`. */
function modelUrl(kind: ConstructionKind): string {
  if (kind === 'modla' || kind === 'svatyne') return SACRED_MODEL_URLS[kind];
  const folder =
    kind === 'zemnice' || kind === 'polozemnice' || kind === 'dvorec' ? 'dwellings' : 'crafts';
  return `/models/${folder}/${kind}.glb`;
}

function building(
  id: string,
  label: string,
  kind: ConstructionKind,
  x: number,
  radius = 18,
): ShowcaseBuilding {
  return {
    id,
    label,
    models: [{ kind, url: modelUrl(kind), x, z: 0, rotation: FACING }],
    focus: { x, z: -1.5, radius },
  };
}

/** Polozemnice na pozemku 15 × 15 m (jako políčko pole) – dům podle varianty. */
function plotModel(x: number, z: number, variant: PlotVariant): ShowcaseModel {
  const plot = { x, z, size: 15, variant };
  const house = plotHouse(plot, variant);
  return {
    kind: 'polozemnice',
    url: '/models/dwellings/polozemnice.glb',
    x: house.x,
    z: house.z,
    rotation: house.rotation,
    plot,
  };
}

/**
 * Dvorec vojvody (trade.md) na pozemku dvou políček – dům vzadu, dvůr s bránou vpředu (ke
 * kameře); vlevo za ohradou.
 */
function manorModel(x: number, z: number): ShowcaseModel {
  const plot = { x, z, size: 15, variant: 'center' as const, yard: { x, z: z - 15 } };
  const house = plotHouse(plot, 'center');
  return {
    kind: 'dvorec',
    url: '/models/dwellings/dvorec.glb',
    x: house.x,
    z: house.z,
    rotation: house.rotation,
    plot,
  };
}
const MANOR_AT = { x: -82, z: -4 };

const UHLIR_X = 26;
/** Dílna tesaře – vlevo od pahorku s vozy (SHOWCASE_CARTS), vchodem ke kameře. */
const TESAR_AT = { x: 86, z: -42 };
const milir = offset(UHLIR_X, 0, FACING, MILIR_OFFSET_M);
/** Řada pěti variant pozemku polozemnice před stavbami (z) a rozestup středů (m). */
const VARIANTS_Z = -26;
const VARIANTS_STEP = 17;

export const SHOWCASE_BUILDINGS: readonly ShowcaseBuilding[] = [
  building('zemnice', 'Zemnice', 'zemnice', -27),
  {
    id: 'polozemnice',
    label: 'Polozemnice',
    models: [plotModel(-14, 0, 'center')],
    focus: { x: -14, z: -1.5, radius: 24 },
  },
  building('hrncir', 'Hrnčíř', 'hrncir', -1),
  building('kovar', 'Kovář', 'kovar', 12),
  {
    id: 'uhlir',
    label: 'Uhlíř + milíř',
    models: [
      { kind: 'uhlir', url: '/models/crafts/uhlir.glb', x: UHLIR_X, z: 0, rotation: FACING },
      { kind: 'milir', url: '/models/crafts/milir.glb', x: milir.x, z: milir.z, rotation: 0 },
    ],
    focus: { x: (UHLIR_X + milir.x) / 2, z: -1.5, radius: 26 },
  },
  {
    id: 'pozemky',
    label: 'Pozemky (5 variant)',
    models: PLOT_VARIANTS.map((variant, i) =>
      plotModel((i - (PLOT_VARIANTS.length - 1) / 2) * VARIANTS_STEP, VARIANTS_Z, variant),
    ),
    focus: { x: 0, z: VARIANTS_Z, radius: 62 },
  },
  {
    id: 'dvorec',
    label: 'Dvorec vojvody',
    models: [manorModel(MANOR_AT.x, MANOR_AT.z)],
    focus: { x: MANOR_AT.x, z: MANOR_AT.z - 7.5, radius: 34 },
  },
  // tesař (wagons.md) – vpravo vzadu u vozů, které vyrábí (v řadě dílen už není místo)
  {
    id: 'tesar',
    label: 'Tesař',
    models: [
      { kind: 'tesar', url: modelUrl('tesar'), x: TESAR_AT.x, z: TESAR_AT.z, rotation: FACING },
    ],
    focus: { x: TESAR_AT.x, z: TESAR_AT.z - 1.5, radius: 20 },
  },
  // posvátná místa: modla (4 × 4 m) a svatyně (30 × 30 m) – vpravo za milířem, před sadem
  building('modla', 'Modla', 'modla', 50, 14),
  building('svatyne', 'Svatyně', 'svatyne', 80, 46),
];

// --- Ohrada s přístřeškem (docs/design/oxen.md – zatím jen modely, ve hře není) ---

export interface ShowcasePen {
  id: 'ohrada';
  label: string;
  square: PenSquare;
  /** Směr k nejbližšímu obydlí – branka a otevřená strana přístřešku (pen-layout.ts). */
  facing: Direction;
  /** Nejbližší obydlí (zemnice vpravo od ohrady). */
  toward: { x: number; z: number };
  focus: { x: number; z: number; radius: number };
}

const PEN_SQUARE: PenSquare = { x: -50, z: 8, size: 15 };
const PEN_TOWARD = { x: -27, z: 0 };

/**
 * Ohrada vlevo od zemnice (mimo řadu staveb i pole za ní): branka míří k zemnici – nejbližšímu
 * obydlí, přístřešek stojí v zadním rohu dál od kamery.
 */
export const SHOWCASE_PEN: ShowcasePen = {
  id: 'ohrada',
  label: 'Ohrada',
  square: PEN_SQUARE,
  facing: penFacing(PEN_SQUARE, PEN_TOWARD),
  toward: PEN_TOWARD,
  focus: { x: PEN_SQUARE.x + 1, z: PEN_SQUARE.z - 1.5, radius: 30 },
};

// --- Posvátný dub a dubový háj (dekorace – vznikají samy, staveniště nemají) ---

export interface ShowcaseDecorModel {
  /** GLB v `public/`. */
  url: string;
  /** Uzel GLB (kameny háje jsou v jednom souboru – stone-a, stone-b, altar), jinak celý model. */
  part?: string;
  /** Strom z lesa (obarví se jako v krajině – trees.ts), jinak model s atlasem. */
  tree?: boolean;
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

export interface ShowcaseDecorGroup {
  id: string;
  label: string;
  models: ShowcaseDecorModel[];
  focus: { x: number; z: number; radius: number };
}

const OAK_X = 110;
const GROVE = { x: 140, z: 8 };
/** Duby háje (souřadnice od středu háje) – aspoň 6 dospělých dubů v okruhu 25 m. */
const GROVE_OAKS: readonly [number, number, number][] = [
  [-9, -2, 1],
  [-3, 6, 2],
  [5, 9, 3],
  [10, 0, 1],
  [3, -4, 2],
  [-6, 12, 3],
  [13, 10, 2],
];

function oak(
  variant: number,
  x: number,
  z: number,
  rotation: number,
  scale = 1,
): ShowcaseDecorModel {
  return { url: `/models/trees/oak-large-${variant}.glb`, tree: true, x, z, rotation, scale };
}

function groveStone(
  part: string,
  x: number,
  z: number,
  rotation: number,
  scale = 1,
): ShowcaseDecorModel {
  return {
    url: '/models/sacred/grove-stones.glb',
    part,
    x: GROVE.x + x,
    z: GROVE.z + z,
    rotation,
    scale,
  };
}

export const SHOWCASE_DECOR: readonly ShowcaseDecorGroup[] = [
  {
    id: 'dub',
    label: 'Posvátný dub',
    models: [
      oak(1, OAK_X, 0, 0.4),
      // obětiny míří pahýlem se stužkami ke kameře (+z modelu jako vchod staveb)
      { url: '/models/sacred/oak-offerings.glb', x: OAK_X, z: 0, rotation: FACING, scale: 1 },
    ],
    focus: { x: OAK_X, z: -1, radius: 24 },
  },
  {
    id: 'haj',
    label: 'Dubový háj',
    models: [
      ...GROVE_OAKS.map(([x, z, v], i) =>
        oak(v, GROVE.x + x, GROVE.z + z, i * 1.3, 0.9 + 0.05 * (i % 3)),
      ),
      // kamenný oltář a hraniční kameny na okraji háje (strana ke kameře)
      groveStone('altar', 0, -9.5, FACING + 0.2),
      groveStone('stone-a', -6, -8.5, 0.3),
      groveStone('stone-a', 7.5, -6.5, 1.9, 0.9),
      groveStone('stone-b', -3, -11, 2.4),
      groveStone('stone-b', 4, -11.5, 0.8, 0.8),
      groveStone('stone-a', 15, 2, 1.1, 0.85),
      groveStone('stone-b', -13, 4, 0.2),
    ],
    focus: { x: GROVE.x + 2, z: GROVE.z - 6, radius: 48 },
  },
];

// --- Pole, hřbitov a sad (stavby po čtvercích) ---

/** Strana čtverce (m) – jako políčko krajiny. */
const SQUARE_M = 15;
/** Roh čtverce (0, 0) – za řadou staveb, aby pole, hřbitov a sad nic nezakrývaly. */
const GROUND_ORIGIN = { x: -55, z: 18 };

export type ShowcaseGroundId = 'field' | 'cemetery' | 'orchard' | 'meadow' | 'plowing' | 'legumes';

export interface ShowcaseGround {
  id: ShowcaseGroundId;
  label: string;
  /** Čtverce jako políčka (x, y) se středem ve světě a stranou – jako SceneVillage. */
  squares: { cell: TileCell; x: number; z: number; size: number }[];
  focus: { x: number; z: number; radius: number };
}

function ground(
  id: ShowcaseGroundId,
  label: string,
  x0: number,
  y0: number,
  width: number,
  height: number,
): ShowcaseGround {
  const squares = Array.from({ length: width * height }, (_, i) => {
    const cell = { x: x0 + (i % width), y: y0 + Math.floor(i / width) };
    return {
      cell,
      x: GROUND_ORIGIN.x + (cell.x + 0.5) * SQUARE_M,
      z: GROUND_ORIGIN.z + (cell.y + 0.5) * SQUARE_M,
      size: SQUARE_M,
    };
  });
  return {
    id,
    label,
    squares,
    focus: {
      x: GROUND_ORIGIN.x + (x0 + width / 2) * SQUARE_M,
      z: GROUND_ORIGIN.z + (y0 + height / 2) * SQUARE_M - 4,
      radius: Math.max(width, height) * SQUARE_M + 18,
    },
  };
}

export const SHOWCASE_GROUNDS: readonly ShowcaseGround[] = [
  ground('field', 'Pole', 0, 0, 3, 2),
  ground('cemetery', 'Hřbitov', 4, 0, 2, 1),
  ground('orchard', 'Sad', 7, 0, 2, 2),
  ground('meadow', 'Louka na seno', 10, 0, 3, 2),
  // vlevo od pole ob čtverec tři čtverce vedle sebe – spřežení se na souvratích otáčí za
  // okrajem pole a orba jde po čtvercích (řady podél x – z výchozí kamery z boku)
  ground('plowing', 'Orání', -4, 0, 3, 1),
  // za polem ob řadu – pole s luštěninami (hrách – fields.md, Luštěniny)
  ground('legumes', 'Luštěniny', 0, 3, 3, 2),
];

/** Den ukázky orby (s skutečného času) – ve hře je herní den ≈ 86 s, tady kratší. */
export const SHOWCASE_PLOUGH_DAY_S = 40;
/** O kolik dílu orba za den ukázky postoupí (po pruzích obtisku – WORK_STEPS). */
export const SHOWCASE_PLOUGH_STEP = 3 / 8;
/** Id pole a dílů ukázky orby (díly jako od herního jádra – fronta práce jde po id). */
const PLOUGH_FIELD_ID = 2;
const PLOUGH_PART_ID = 200;

/** Den ukázky orby v okamžiku `nowMs` (epoch ms – skutečný čas jako spřežení). */
export function showcasePloughDay(nowMs: number): number {
  return Math.floor(nowMs / 1000 / SHOWCASE_PLOUGH_DAY_S);
}

/** Kdy den ukázky orby začíná a končí (epoch ms) – za den spřežení projede jeho orbu. */
export function showcasePloughWindow(day: number): { startMs: number; endMs: number } {
  return {
    startMs: day * SHOWCASE_PLOUGH_DAY_S * 1000,
    endMs: (day + 1) * SHOWCASE_PLOUGH_DAY_S * 1000,
  };
}

/**
 * Ukázka „Orání“ v den ukázky `day`: tři čtverce vedle sebe, orba za den postoupí o
 * SHOWCASE_PLOUGH_STEP čtverce (od strany ke kameře dál, čtverec po čtverci zleva), po zorání
 * všech začne znovu. Díly mají vzhled jako od herního jádra (zoraný, rozpracovaný s čárou práce,
 * strniště) a rozdělení práce dne podíl orby s frontou dílů, přes které dnes orba postoupila –
 * kde spřežení orá, určí stejně jako ve hře `ploughFront` (plough-front.ts).
 */
export function showcasePlough(day: number): Pick<SceneVillage, 'fields' | 'dwellings' | 'pens'> & {
  labor: SceneLabor;
} {
  const squares = SHOWCASE_GROUNDS.find((g) => g.id === 'plowing')!.squares;
  const cycle = Math.round(squares.length / SHOWCASE_PLOUGH_STEP);
  const d = ((day % cycle) + cycle) % cycle;
  const from = d * SHOWCASE_PLOUGH_STEP;
  const to = (d + 1) * SHOWCASE_PLOUGH_STEP;
  const parts = squares.map((square, i): SceneFieldPart => {
    const base = { ...square, id: PLOUGH_PART_ID + i, stage: 'sown' as const };
    // orá spřežení rádlem – zoraná plocha má kulaté vnější rohy (oxen.md – Kulaté rohy)
    const ard = { ploughed: true as const };
    if (to >= i + 1 - 1e-9) return { ...base, ...ard, look: 'plowed' };
    if (to > i) return { ...base, ...ard, look: 'plowed', work: to - i, before: 'stubble' };
    return { ...base, look: 'stubble' };
  });
  const today = parts.flatMap((p, i) =>
    i < to - 1e-9 && i + 1 > from + 1e-9
      ? [{ id: p.id!, progress: [Math.max(0, from - i), Math.min(1, to - i)] as const }]
      : [],
  );
  return {
    dwellings: [],
    pens: [],
    fields: [{ id: PLOUGH_FIELD_ID, parts }],
    labor: {
      // den ukázky (okno dne – showcasePloughWindow)
      day,
      month: 9,
      people: { children: 0, adults: 2, elders: 0 },
      shares: [
        {
          activity: 'plough',
          target: { kind: 'field', id: PLOUGH_FIELD_ID },
          manDays: 1,
          // díly, přes které dnes orba prošla, a kolik z nich bylo zoráno ráno a večer
          parts: today.map((t) => t.id),
          progress: today.map((t) => t.progress),
        },
      ],
    },
  };
}

/** Popisek ukázky orby v liště (průběh stavby ji neovlivní – orá se pořád dokola). */
export const PLOWING_LABEL =
  'spřežení orá pruh u čáry orby, za den ukázky (40 s) zorá 3/8 čtverce a dojde dál';

/** Fáze stavby po čtvercích pro lištu (průběh 0–1, navazují na sebe). */
export interface ShowcasePhase {
  label: string;
  from: number;
  to: number;
}

/**
 * Pole přes všechny vzhledy (fields.md – Co hráč vidí): vytyčení kolíky a provázkem, zakládání,
 * orba a setí po čtvercích (práce jde po dílech, rozpracovaný je vždy jen jeden), vzcházející,
 * zelené a zralé obilí, žeň s panáky, strniště, mladý úhor a spasená pastvina.
 */
export const FIELD_SHOWCASE_PHASES: readonly (ShowcasePhase & {
  look: FieldLook | null;
  before?: FieldLook;
  /** Práce jde po čtvercích (rozpracovaný jeden), jinak celé pole naráz. */
  frontier?: boolean;
})[] = [
  { label: 'vytyčení – kolíky a provázek', from: 0, to: 0.05, look: null },
  {
    label: 'zakládání – drn se rozrývá po čtvercích',
    from: 0.05,
    to: 0.16,
    look: 'bare',
    frontier: true,
  },
  {
    label: 'kopání – brázdy po čtvercích',
    from: 0.16,
    to: 0.26,
    look: 'plowed',
    before: 'bare',
    frontier: true,
  },
  {
    label: 'setí po čtvercích',
    from: 0.26,
    to: 0.34,
    look: 'sown',
    before: 'plowed',
    frontier: true,
  },
  { label: 'vzchází obilí', from: 0.34, to: 0.41, look: 'sprouted' },
  { label: 'zelené obilí', from: 0.41, to: 0.48, look: 'green' },
  { label: 'zralé obilí', from: 0.48, to: 0.54, look: 'ripe' },
  {
    label: 'žeň po čtvercích – panáky',
    from: 0.54,
    to: 0.65,
    look: 'harvesting',
    before: 'ripe',
    frontier: true,
  },
  { label: 'strniště', from: 0.65, to: 0.71, look: 'stubble' },
  { label: 'mladý úhor – strniště a plevel, pase se', from: 0.71, to: 0.77, look: 'young-fallow' },
  { label: 'úhor se pase – pastvina', from: 0.77, to: 0.82, look: 'pasture' },
  { label: 'úhor – louka, roste tráva', from: 0.82, to: 0.86, look: 'meadow' },
  {
    label: 'seč po čtvercích – řádky sena',
    from: 0.86,
    to: 0.92,
    look: 'mown',
    before: 'meadow',
    frontier: true,
  },
  { label: 'seno v kupkách', from: 0.92, to: 0.95, look: 'mown' },
  { label: 'stohy – přes zimu se zkrmí', from: 0.95, to: 1, look: 'haystacks' },
];

/**
 * Pole s luštěninami (fields.md – Luštěniny): kopání a setí po čtvercích, vzcházející, zelený
 * kvetoucí a zralý hrách, sklizeň po čtvercích (hrách se vytrhá a suší v hromádkách) a skoro
 * holá zem po sklizni.
 */
export const LEGUME_SHOWCASE_PHASES: readonly (ShowcasePhase & {
  look: FieldLook | null;
  before?: FieldLook;
  frontier?: boolean;
})[] = [
  {
    label: 'kopání – brázdy po čtvercích',
    from: 0,
    to: 0.12,
    look: 'plowed',
    before: 'stubble',
    frontier: true,
  },
  {
    label: 'setí hrachu po čtvercích',
    from: 0.12,
    to: 0.26,
    look: 'sown',
    before: 'plowed',
    frontier: true,
  },
  { label: 'vzchází hrách', from: 0.26, to: 0.36, look: 'sprouted' },
  { label: 'zelený hrách kvete', from: 0.36, to: 0.52, look: 'green' },
  { label: 'zralý hrách', from: 0.52, to: 0.64, look: 'ripe' },
  {
    label: 'sklizeň po čtvercích – hrách se trhá a suší v hromádkách',
    from: 0.64,
    to: 0.82,
    look: 'harvesting',
    before: 'ripe',
    frontier: true,
  },
  { label: 'po sklizni – skoro holá zem', from: 0.82, to: 1, look: 'stubble' },
];

/** Hřbitov: do poloviny založení (fáze `CEMETERY_PHASES`), pak přibývají mohyly. */
const CEMETERY_FOUNDED_AT = 0.5;
/**
 * Kdo umírá v ukázce hřbitova (cemetery.md – Mohyly podle významu): dokola dospělí, děti, hlavy
 * rodin a občas někdo z vojvodovy rodiny.
 */
const SHOWCASE_DEATHS: readonly GraveRank[] = [
  'head',
  'child',
  'adult',
  'child',
  'manor',
  'adult',
  'child',
  'adult',
  'head',
  'child',
  'adult',
  'adult',
];
/** Kolik posledních mohyl ukázky je čerstvých (z holé hlíny). */
const SHOWCASE_FRESH_MOUNDS = 3;

/**
 * Mohyly ukázky: pohřby v pořadí SHOWCASE_DEATHS, dokud obsazená místa nedosáhnou `places`
 * (nebo není kam) – místo a velikost vybírá herní jádro (`placeMound`) s brankou k bodu `toward`
 * (jako k nejbližšímu obydlí ve vsi). Vrátí mohyly pro scénu a počet pohřbených.
 */
export function showcaseMounds(
  squares: readonly { cell: TileCell; x: number; z: number; size: number }[],
  places: number,
  toward: { x: number; z: number },
): { mounds: SceneGraveMound[]; burials: number } {
  const cemetery: Cemetery = {
    id: 1,
    squares: squares.map((q) => ({ cell: q.cell, x: q.x, z: q.z, waterDistanceM: 100 })),
    squareSizeM: squares[0]?.size ?? SQUARE_M,
    graves: 0,
    builtDay: 0,
    mounds: [],
  };
  const dwellings = [{ x: toward.x, z: toward.z, rotation: 0 }];
  for (let i = 0; usedPlaces(cemetery) < places; i++) {
    const rank = SHOWCASE_DEATHS[i % SHOWCASE_DEATHS.length]!;
    const mound = placeMound(cemetery, rank, i, dwellings);
    if (!mound) break;
    cemetery.mounds!.push(mound);
    cemetery.graves += 1;
  }
  const all = cemetery.mounds!;
  return {
    mounds: all.map((m, i) => ({
      cell: m.cell,
      column: m.column,
      row: m.row,
      size: m.size,
      ...(i >= all.length - SHOWCASE_FRESH_MOUNDS ? { fresh: true as const } : {}),
    })),
    burials: cemetery.graves,
  };
}
/** Sad: vytyčení, kůly, sazenice (výsadba jako ve hře), mladé stromky rostou, plodící sad. */
export const ORCHARD_SHOWCASE_PHASES: readonly ShowcasePhase[] = [
  { label: 'vytyčení – čára kolem sadu', from: 0, to: 0.06 },
  { label: 'zatloukání kůlů', from: 0.06, to: 0.26 },
  { label: 'sázení stromků ke kůlům', from: 0.26, to: 0.45 },
  { label: 'mladé stromky rostou', from: 0.45, to: 0.9 },
  { label: 'dospělý sad s jablky', from: 0.9, to: 1 },
];

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

function phaseAt<T extends ShowcasePhase>(phases: readonly T[], p: number): T {
  return phases.find((phase) => p < phase.to) ?? phases[phases.length - 1]!;
}

/**
 * Díl pole při průběhu: v rámci fáze jdou čtverce po řadě – hotové mají vzhled fáze,
 * rozpracovaný (jen jeden) i předchozí vzhled se svou rozpracovaností, ostatní čekají.
 */
function fieldPart(
  index: number,
  count: number,
  p: number,
  phases: typeof FIELD_SHOWCASE_PHASES = FIELD_SHOWCASE_PHASES,
): Omit<SceneFieldPart, 'cell' | 'x' | 'z' | 'size'> {
  const phase = phaseAt(phases, p);
  const founding = phase.look === null || phase.look === 'bare';
  const stage = founding
    ? 'founding'
    : phase.look === 'young-fallow'
      ? 'young-fallow'
      : phase.look === 'pasture' ||
          phase.look === 'meadow' ||
          phase.look === 'mown' ||
          phase.look === 'haystacks'
        ? 'meadow'
        : 'sown';
  if (phase.look === null) return { id: index + 1, stage, look: 'bare', work: 0 };
  if (!phase.frontier) return { id: index + 1, stage, look: phase.look };
  const done = ramp(p, phase.from, phase.to) * count;
  const work = Math.min(1, Math.max(0, done - index));
  if (founding)
    return { id: index + 1, stage: work >= 1 ? 'ready' : 'founding', look: 'bare', work };
  return {
    id: index + 1,
    stage,
    look: phase.look,
    work,
    ...(phase.before ? { before: phase.before } : {}),
  };
}

/**
 * Den v roce pro seno na vývojové stránce (`VillageRenderer.setSeason`) – souběžně s fázemi
 * louky na poli: do jara tráva, pak seč (řádky sena), kupky a stohy přes podzim a zimu až do
 * března (zkrmují se). Louka na seno vedle pole jde stejně.
 */
export function showcaseMeadowDay(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const stops: [number, number][] = [
    [0.82, 120],
    [0.86, 150],
    [0.865, 156],
    [0.92, 178],
    [0.925, 181],
    [0.95, 192],
    [0.955, 194],
    [1, 430],
  ];
  if (p <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, d1] = stops[i]!;
    const [p0, d0] = stops[i - 1]!;
    if (p <= p1) {
      const day = Math.round(d0 + ((p - p0) / (p1 - p0)) * (d1 - d0));
      return day > 365 ? day - 365 : day;
    }
  }
  return 430 - 365;
}

/** Louka na seno vývojové stránky (čtverce ze SHOWCASE_GROUNDS). */
export function showcaseHayMeadows(): HayMeadow[] {
  const meadow = SHOWCASE_GROUNDS.find((g) => g.id === 'meadow')!;
  return [{ id: 1, squares: meadow.squares, rows: [1, 0] }];
}

/**
 * Pole, hřbitov, sad a louka na seno na vývojové stránce při průběhu `progress` (0–1): ves pro
 * scénu (`VillageRenderer` – kreslí je stejně jako ve hře) a popisek fáze každého z nich.
 */
export function showcaseGrounds(progress: number): {
  village: SceneVillage;
  labels: Record<ShowcaseGroundId, string>;
} {
  const p = Math.min(1, Math.max(0, progress));
  const of = (id: ShowcaseGroundId): ShowcaseGround => SHOWCASE_GROUNDS.find((g) => g.id === id)!;

  const field = of('field').squares;
  const parts = field.map((square, i) => ({ ...square, ...fieldPart(i, field.length, p) }));
  const hay = hayPhase(showcaseMeadowDay(p));
  const hayLabel = !hay
    ? 'louka (seče se v červnu)'
    : meadowLook(hay) === 'haystacks'
      ? 'stohy na otavě – přes zimu se zkrmí'
      : hay.hay === 'heaps'
        ? 'seno v kupkách'
        : `seč – řádky sena (${Math.round(hay.mown * 100)} %)`;

  const cemetery = of('cemetery').squares;
  const capacity = cemetery.length * CEMETERY.gravesPerSquare;
  const founding = ramp(p, 0, CEMETERY_FOUNDED_AT);
  const built = p >= CEMETERY_FOUNDED_AT;
  // mohyly podle významu – branka k vsi před hřbitovem (−z), jako by tam stálo obydlí
  const toward = {
    x: cemetery.reduce((sum, q) => sum + q.x, 0) / cemetery.length,
    z: cemetery[0]!.z - 60,
  };
  const { mounds, burials } = built
    ? showcaseMounds(cemetery, Math.round(capacity * ramp(p, CEMETERY_FOUNDED_AT, 1)), toward)
    : { mounds: [], burials: 0 };
  const cemeteryLabel = built
    ? p >= 1
      ? `plný hřbitov – ${burials} pohřbených na ${capacity} místech (u branky vojvodova rodina a hlavy rodin, vzadu děti)`
      : `pohřby – mohyly podle významu přibývají (${burials} pohřbených)`
    : (CEMETERY_PHASES.find((phase) => founding < phase.to)?.label ?? '');

  const [, staking, planting, growing, bearing] = ORCHARD_SHOWCASE_PHASES as [
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
    ShowcasePhase,
  ];
  const plantingShare =
    0.5 * ramp(p, staking.from, staking.to) + 0.5 * ramp(p, planting.from, planting.to);
  const age = TREE_GROWTH_YEARS * ramp(p, growing.from, growing.to);
  const planted = p >= growing.from;
  const growth = planted ? Math.round(treeGrowth(age) * 100) / 100 : 0;
  const fruit = p >= bearing.from;
  const orchardPhase = phaseAt(ORCHARD_SHOWCASE_PHASES, p);
  const orchardLabel =
    orchardPhase === growing
      ? `${growing.label} – ${Math.min(TREE_GROWTH_YEARS, Math.floor(age) + 1)}. rok`
      : orchardPhase.label;

  // pole s luštěninami – osetý hrách prochází rokem jako pole obilí
  const legumeSquares = of('legumes').squares;
  const legumes = legumeSquares.map((square, i): SceneFieldPart => ({
    ...square,
    ...fieldPart(i, legumeSquares.length, p, LEGUME_SHOWCASE_PHASES),
    id: 100 + i,
    crop: 'legume',
  }));

  return {
    village: {
      dwellings: [],
      fields: [
        { id: 1, parts },
        { id: 3, parts: legumes },
      ],
      cemeteries: [
        {
          id: 1,
          squares: cemetery,
          built,
          progress: built ? 1 : founding,
          graves: 0,
          ...(mounds.length > 0 ? { mounds } : {}),
        },
      ],
      orchards: [
        {
          id: 1,
          squares: of('orchard').squares.map((square) => ({
            ...square,
            planting: planted ? 1 : plantingShare,
            growth,
            fruit,
          })),
        },
      ],
    },
    labels: {
      field: phaseAt(FIELD_SHOWCASE_PHASES, p).label,
      cemetery: cemeteryLabel,
      orchard: orchardLabel,
      meadow: hayLabel,
      plowing: PLOWING_LABEL,
      legumes: phaseAt(LEGUME_SHOWCASE_PHASES, p).label,
    },
  };
}

// --- Rozpad obydlí (population.md – Co hráč vidí, Chátrání a přestavba) ---

export interface ShowcaseDecayTarget {
  id: 'rozpad' | 'stupne' | 'rozpad-staveb';
  label: string;
  focus: { x: number; z: number; radius: number };
}

/** Řada s posuvníkem (zemnice a polozemnice na pozemku) a řada všech stupňů za ní (z). */
const DECAY_ROW_Z = -52;
/**
 * Opuštěné stavby (abandonment.md) za ukázkou cest: modla, svatyně, hřbitov a ohrada – stejný
 * posuvník rozpadu jako obydlí (stav 100 → 0 %, pak zbytek modly a příkop svatyně zarůstají).
 */
const STRUCTURES_Z = -152;
const STRUCTURES_X = { idol: -40, shrine: -8, cemetery: 26, pen: 46 } as const;
const STAGES_ROW_Z = { zemnice: -70, polozemnice: -84 } as const;
const DECAY_PAIR_X = { zemnice: -14, polozemnice: 2 } as const;
const STAGES_X0 = -24;
const STAGES_STEP = 12;

export const SHOWCASE_DECAY: readonly ShowcaseDecayTarget[] = [
  { id: 'rozpad', label: 'Rozpad', focus: { x: -5, z: DECAY_ROW_Z - 2, radius: 30 } },
  {
    id: 'stupne',
    label: 'Stupně rozpadu',
    focus: { x: STAGES_X0 + 2 * STAGES_STEP, z: -79, radius: 48 },
  },
  {
    id: 'rozpad-staveb',
    label: 'Rozpad staveb',
    focus: { x: 4, z: STRUCTURES_Z, radius: 78 },
  },
];

/**
 * Posuvník rozpadu 0–1: do DECAY_HOUSE_SHARE klesá stav opuštěného obydlí ze 100 na 0 %, pak
 * obydlí zanikne a zbytek jámy RUIN_YEARS let zarůstá.
 */
export const DECAY_HOUSE_SHARE = 0.6;

/** Stav obydlí (0–1), nebo jak zarostl zbytek jámy (0–1) při posuvníku `t`. */
export function decayAt(t: number): { condition: number } | { overgrowth: number } {
  const p = Math.min(1, Math.max(0, t));
  if (p < DECAY_HOUSE_SHARE) return { condition: 1 - p / DECAY_HOUSE_SHARE };
  return { overgrowth: (p - DECAY_HOUSE_SHARE) / (1 - DECAY_HOUSE_SHARE) };
}

/** Popisek posuvníku: stav a stupeň rozpadu, nebo kolik let zbytek jámy zarůstá. */
export function decayLabel(t: number): string {
  const at = decayAt(t);
  if ('condition' in at) {
    return `stav ${Math.round(at.condition * 100)} % – ${DECAY_LABELS[decayStage(at.condition)]}`;
  }
  const years = Math.round(at.overgrowth * RUIN_YEARS);
  return at.overgrowth >= 1
    ? 'zbytek jámy zarostl a zmizel'
    : `zbytek jámy – ${years} ${years === 1 ? 'rok' : years >= 2 && years <= 4 ? 'roky' : 'let'} po zániku, zarůstá`;
}

/**
 * Popisek posuvníku pro opuštěné stavby (abandonment.md): stav a stupeň modly, svatyně, plotu
 * hřbitova a ohrady, po pádu jak zarůstá padlá modla a příkop svatyně.
 */
export function structureDecayLabel(t: number): string {
  const at = decayAt(t);
  if ('condition' in at) {
    return `stav ${Math.round(at.condition * 100)} % – ${STRUCTURE_STAGE_LABELS[decayStage(at.condition)]}`;
  }
  if (at.overgrowth >= 1) return 'zbytky zarostly a zmizely';
  const idol = Math.round(at.overgrowth * ABANDONMENT.remnantYears.idol);
  const shrine = Math.round(at.overgrowth * ABANDONMENT.remnantYears.shrine);
  return `padlá modla ${idol} / příkop svatyně ${shrine} let po pádu, plot hřbitova zmizel – zůstaly mohyly, ohrada zmizela`;
}

/** Stav ukázky každého stupně (uprostřed jeho rozpětí) a zbytek jámy ve třetině zarůstání. */
const STAGE_CONDITION: Record<DecayStage, number> = { 0: 1, 1: 0.58, 2: 0.33, 3: 0.1 };
const STAGES_RUIN_OVERGROWTH = 0.3;
/** Pozemek polozemnice v ukázce (políčko jen pro scénu). */
const DECAY_PLOT_SIZE = 15;

type ShowcaseDwelling = SceneVillage['dwellings'][number];
type ShowcaseRuin = NonNullable<SceneVillage['ruins']>[number];

/**
 * Rozpad obydlí na vývojové stránce: opuštěná zemnice a polozemnice na pozemku podle posuvníku
 * (`decayAt`) a za nimi řada stupňů 0–3 a zbytku jámy pro obě obydlí – ves pro scénu
 * (`VillageRenderer` je kreslí jako ve hře). S `repair` ukáže řada opuštěných staveb místo
 * rozpadu jejich opravu (`showcaseRepair` – posuvník je průběh opravy).
 */
export function showcaseDecay(t: number, repair = false): SceneVillage {
  const at = decayAt(t);
  const dwellings: ShowcaseDwelling[] = [];
  const ruins: ShowcaseRuin[] = [];
  const types: readonly Exclude<DwellingType, 'dvorec'>[] = ['zemnice', 'polozemnice'];
  for (const [i, type] of types.entries()) {
    const id = 9001 + i;
    const x = DECAY_PAIR_X[type];
    const plot =
      type === 'polozemnice'
        ? {
            cell: { x: 0, y: 0 },
            x,
            z: DECAY_ROW_Z,
            size: DECAY_PLOT_SIZE,
            variant: 'center' as const,
          }
        : undefined;
    const position = plot ? plotHouse(plot, 'center') : { x, z: DECAY_ROW_Z, rotation: FACING };
    if ('condition' in at) {
      dwellings.push({
        id,
        type,
        position,
        built: true,
        progress: 1,
        inhabited: false,
        condition: at.condition,
        ...(plot ? { plot } : {}),
      });
    } else if (at.overgrowth < 1) {
      ruins.push({ id, type, position, since: 0, overgrowth: at.overgrowth });
    }
    // řada stupňů: celý dům, sešlý, propadá se, zřícený a zbytek jámy
    DECAY_STAGES.forEach((stage, k) => {
      const spot = { x: STAGES_X0 + k * STAGES_STEP, z: STAGES_ROW_Z[type], rotation: FACING };
      dwellings.push({
        id: 9100 + i * 10 + k,
        type,
        position: spot,
        built: true,
        progress: 1,
        inhabited: false,
        condition: STAGE_CONDITION[stage],
      });
    });
    ruins.push({
      id: 9150 + i,
      type,
      position: {
        x: STAGES_X0 + DECAY_STAGES.length * STAGES_STEP,
        z: STAGES_ROW_Z[type],
        rotation: FACING,
      },
      since: 0,
      overgrowth: STAGES_RUIN_OVERGROWTH,
    });
  }
  return {
    dwellings,
    fields: [],
    ruins,
    ...(repair ? showcaseRepair(t) : showcaseAbandoned(at)),
  };
}

/**
 * Stav modly, svatyně a ohrady na začátku ukázky opravy – rozpadlá (spadlé už se neopravují),
 * plot hřbitova spadlý (staví se znovu).
 */
export const REPAIR_SHOWCASE_FROM = 0.1;

/** Stav opravované stavby při průběhu opravy `t` 0–1 (abandonment.md – Oprava). */
export function repairAt(t: number, from: number): number {
  const p = Math.min(1, Math.max(0, t));
  return from + (1 - from) * p;
}

/** Popisek posuvníku pro ukázku opravy staveb (abandonment.md – Oprava). */
export function structureRepairLabel(t: number): string {
  const p = Math.min(1, Math.max(0, t));
  if (p >= 1) return 'opraveno – modla, svatyně (ohniště zase hoří), plot hřbitova i ohrada celé';
  const sacred = repairAt(p, REPAIR_SHOWCASE_FROM);
  const percent = (value: number): string => `${Math.round(value * 100)} %`;
  const stage = STRUCTURE_STAGE_LABELS[decayStage(sacred)];
  return [
    `oprava ${percent(p)} – modla, svatyně a ohrada ${percent(sacred)} (${stage})`,
    `plot hřbitova ${percent(repairAt(p, 0))}`,
  ].join(', ');
}

/**
 * Oprava modly, svatyně, plotu hřbitova a ohrady (abandonment.md – Oprava): k opuštěným stavbám
 * se zase chodí a vesničané je opravují – stav roste s průběhem `t`, díly rozpadu se vracejí
 * opačně než při chátrání, plot se splétá zpět (i spadlý), ohniště svatyně se rozhoří až po
 * opravě.
 */
export function showcaseRepair(t: number): Pick<SceneVillage, 'sacred' | 'cemeteries' | 'pens'> {
  const z = STRUCTURES_Z;
  const done = t >= 1;
  const sacredCondition = repairAt(t, REPAIR_SHOWCASE_FROM);
  const fence = repairAt(t, 0);
  const wear = <K extends string>(condition: number, key: K): { [key in K]?: number } =>
    condition < 1 ? ({ [key]: Math.floor(condition * 100) / 100 } as { [key in K]?: number }) : {};
  const square = (
    x: number,
  ): { cell: { x: number; y: number }; x: number; z: number; size: number } => ({
    cell: { x: Math.round(x / 15), y: 40 },
    x,
    z,
    size: 15,
  });
  return {
    sacred: {
      oaks: [],
      groves: [],
      buildings: (['idol', 'shrine'] as const).map((kind, k) => ({
        id: 9201 + k,
        kind,
        position: { x: STRUCTURES_X[kind], z, rotation: FACING },
        built: true,
        progress: 1,
        ...wear(sacredCondition, 'condition'),
        ...(done ? {} : { repairing: true as const }),
      })),
    },
    cemeteries: [
      {
        id: 9301,
        squares: [square(STRUCTURES_X.cemetery)],
        built: true,
        progress: 1,
        ...oldCemeteryGraves(square(STRUCTURES_X.cemetery)),
        ...wear(fence, 'fence'),
      },
    ],
    pens: [
      {
        id: 9401,
        ...square(STRUCTURES_X.pen),
        built: true,
        progress: 1,
        oxen: 0,
        trainees: 0,
        cows: 0,
        ...wear(sacredCondition, 'condition'),
      },
    ],
  };
}

/**
 * Starý hřbitov na ukázce rozpadu a opravy: 34 míst mohyl podle významu (vojvodova rodina, hlavy
 * rodin, dospělí, děti) – plot se rozpadne a spadlý zmizí úplně, mohyly zůstanou (Martin,
 * 19. 10. 2026).
 */
function oldCemeteryGraves(square: {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
}): Pick<NonNullable<SceneVillage['cemeteries']>[number], 'graves' | 'mounds'> {
  // branka k obydlím ukázky rozpadu (řady domů za hřbitovem, +z) – jako ve scéně
  const { mounds } = showcaseMounds([square], 34, { x: square.x, z: square.z + 60 });
  // starý hřbitov – žádná mohyla není čerstvá
  return {
    graves: 0,
    mounds: mounds.map((m) => ({ cell: m.cell, column: m.column, row: m.row, size: m.size })),
  };
}

/**
 * Opuštěná modla, svatyně, hřbitov a ohrada na ukázce rozpadu (abandonment.md – Co hráč vidí):
 * stav podle posuvníku, po pádu zbytek padlé modly a zarůstající příkop svatyně; spadlý plot
 * hřbitova zmizí úplně a zůstanou mohyly, ohrada zmizí.
 */
function showcaseAbandoned(
  at: { condition: number } | { overgrowth: number },
): Pick<SceneVillage, 'sacred' | 'cemeteries' | 'pens'> {
  const z = STRUCTURES_Z;
  const position = (x: number): { x: number; z: number; rotation: number } => ({
    x,
    z,
    rotation: FACING,
  });
  const square = (
    x: number,
  ): { cell: { x: number; y: number }; x: number; z: number; size: number } => ({
    cell: { x: Math.round(x / 15), y: 40 },
    x,
    z,
    size: 15,
  });
  const standing = 'condition' in at;
  const condition = standing ? at.condition : 0;
  const sacred: NonNullable<SceneVillage['sacred']> = {
    oaks: [],
    groves: [],
    buildings: standing
      ? (['idol', 'shrine'] as const).map((kind, k) => ({
          id: 9201 + k,
          kind,
          position: position(STRUCTURES_X[kind]),
          built: true,
          progress: 1,
          ...(condition < 1 ? { condition: Math.floor(condition * 100) / 100 } : {}),
          abandoned: true as const,
        }))
      : [],
    ...(standing || at.overgrowth >= 1
      ? {}
      : {
          ruins: (['idol', 'shrine'] as const).map((kind, k) => ({
            id: 9201 + k,
            kind,
            position: position(STRUCTURES_X[kind]),
            overgrowth: Math.floor(at.overgrowth * 20) / 20,
          })),
        }),
  };
  return {
    sacred,
    cemeteries: [
      {
        id: 9301,
        squares: [square(STRUCTURES_X.cemetery)],
        built: true,
        progress: 1,
        ...oldCemeteryGraves(square(STRUCTURES_X.cemetery)),
        ...(condition < 1 ? { fence: Math.floor(condition * 100) / 100 } : {}),
      },
    ],
    pens: standing
      ? [
          {
            id: 9401,
            ...square(STRUCTURES_X.pen),
            built: true,
            progress: 1,
            oxen: 0,
            trainees: 0,
            cows: 0,
            ...(condition < 1 ? { condition: Math.floor(condition * 100) / 100 } : {}),
            stocked: false as const,
          },
        ]
      : [],
  };
}

// --- pevné cesty (roads.md – Vylepšení cesty) ------------------------------------------------

/** Řada ukázky cest za řadou stupňů rozpadu (z) – tři úseky pod sebou. */
const ROADS_Z = -104;
const ROADS_STEP_Z = 9;

/** Ukázka pevných cest na /dev/buildings. */
export const SHOWCASE_ROADS = {
  id: 'cesty',
  label: 'Cesty',
  focus: { x: 0, z: ROADS_Z - ROADS_STEP_Z, radius: 34 },
} as const;

/**
 * Úseky ukázky cest: vyšlapaná, úprava (vyšlapaná → upravená podle průběhu stavby – jen širší
 * pás, roste od začátku úseku) a hať s lávkou (upravená → hať přes mokřinu na šířku upravené
 * cesty a lávka přes brod). Při 100 % hotové; vytyčení provázkem od 0 %.
 */
export function showcaseRoads(progress: number): SceneRoad[] {
  const p = Math.min(1, Math.max(0, progress));
  const axis = (z: number): { x: number; z: number }[] => [
    { x: -20, z },
    { x: 0, z: z + 1.5 },
    { x: 20, z },
  ];
  const building = (grade: 'improved' | 'causeway'): Partial<SceneRoad> =>
    p < 1 ? { upgrade: { grade, progress: p } } : {};
  return [
    { id: 1, points: axis(ROADS_Z), grade: 'trodden', ground: { wet: [], fords: [] } },
    {
      id: 2,
      points: axis(ROADS_Z - ROADS_STEP_Z),
      grade: p < 1 ? 'trodden' : 'improved',
      ground: { wet: [[14, 24]], fords: [] },
      ...building('improved'),
    },
    {
      id: 3,
      points: axis(ROADS_Z - 2 * ROADS_STEP_Z),
      grade: p < 1 ? 'improved' : 'causeway',
      ground: { wet: [[6, 20]], fords: [30] },
      ...building('causeway'),
    },
  ];
}

// --- vozy se spřežením (wagons.md – zatím jen modely, ve hře nejsou) -------------------------

/**
 * Pahorek ukázky vozů (vpravo vzadu, kde nic nestojí): zvon `height` m vysoký o poloměru
 * `radius` – vozy na něm ukážou sklon a náklon korby podle terénu.
 */
const CART_HILL = { x: 122, z: -70, radius: 28, height: 2.6 } as const;
/** O kolik je pahorek nad loukou ukázky (m) – obě sítě mají stejnou trávu, ať se nebijí. */
const CART_HILL_LIFT_M = 0.02;

/** Ukázka vozů na /dev/buildings: dvoukoláky dokola přes vrchol pahorku, čtyřkoláky tam a zpět. */
export const SHOWCASE_CARTS = {
  id: 'vozy',
  label: 'Vozy',
  hill: CART_HILL,
  focus: { x: 120, z: -74, radius: 48 },
} as const;

/** Výška pahorku ukázky vozů (m nad loukou; mimo pahorek 0). */
export function showcaseCartGround(x: number, z: number): number {
  const r = Math.hypot(x - CART_HILL.x, z - CART_HILL.z);
  if (r >= CART_HILL.radius) return 0;
  const bell = (CART_HILL.height / 2) * (1 + Math.cos((Math.PI * r) / CART_HILL.radius));
  const edge = Math.min(1, (CART_HILL.radius - r) / 1.5);
  return bell + CART_HILL_LIFT_M * edge;
}

/**
 * Vozy ukázky: tři dvoukoláky po kruhu přes úbočí pahorku (prázdný, se senem a se snopy) a tři
 * čtyřkoláky tam a zpět přes jeho úpatí (klády, zboží obchodní výpravy a seno) – na každé trase
 * rovnoměrně za sebou.
 */
export function showcaseCarts(): CartTrack[] {
  const circle = cartRoute(
    Array.from({ length: 36 }, (_, i) => {
      const a = (2 * Math.PI * i) / 36;
      return { x: 112 + 12 * Math.cos(a), z: -58 + 12 * Math.sin(a) };
    }),
    { closed: true, turnRadius: 3 },
  );
  const shuttle = cartRoute(
    [
      { x: 92, z: -82 },
      { x: 150, z: -82 },
      { x: 150, z: -92 },
      { x: 92, z: -92 },
    ],
    { closed: true, turnRadius: 5 },
  );
  const along = (route: CartRoute, kind: CartKind, cargoes: readonly CartCargo[]): CartTrack[] =>
    cargoes.map((cargo, i) => ({
      kind,
      cargo,
      route,
      offsetM: (route.length * i) / cargoes.length,
    }));
  return [
    ...along(circle, 'two', ['empty', 'hay', 'sheaves']),
    ...along(shuttle, 'four', ['logs', 'goods', 'hay']),
  ];
}
