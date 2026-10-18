// Fáze stavby bez Babylonu: co staveniště ukáže při průběhu 0–1 – díly modelu z construction.glb
// (obydlí: tools/blender/dwellings.py, řemeslné dílny a milíř: tools/blender/crafts.py, modla
// a svatyně: tools/blender/sacred.py), hloubka jámy, obtisky a rekvizity. Každý druh stavby má svou tabulku fází; řemeslné dílny stojí na
// fázích obydlí (hrnčíř a kovář polozemnice, uhlíř zemnice) a přidávají své. Souřadnice modelu
// jako `localToWorld` (x napříč, z k vchodu).
import { PIT_SHAPES } from './dwelling-pit';
import type { DwellingType } from '@bohemia/game';

/**
 * Řemeslné stavby – zatím jen modely (docs/design/crafts.md čeká na schválení): hrnčíř, kovář,
 * uhlíř a milíř, který stojí kus od uhlířovy zemnice a staví se zvlášť.
 */
export type CraftKind = 'hrncir' | 'kovar' | 'uhlir' | 'milir';
export const CRAFT_KINDS: readonly CraftKind[] = ['hrncir', 'kovar', 'uhlir', 'milir'];
/**
 * Posvátná místa, která staví hráč (docs/design/happiness.md): dřevěná modla a svatyně podle
 * Perynu. Díly staveniště v public/models/sacred/idol-construction.glb („modla-…“)
 * a shrine-construction.glb („svatyne-…“).
 */
export type SacredKind = 'modla' | 'svatyne';
export const SACRED_KINDS: readonly SacredKind[] = ['modla', 'svatyne'];
/** Druh stavby, který umí staveniště: obydlí, řemeslná stavba nebo posvátné místo. */
export type ConstructionKind = DwellingType | CraftKind | SacredKind;

/**
 * Obydlí, na jehož fázích (a v jehož jámě) stavba stojí; milíř, modla a svatyně nemají jámu
 * ani obydlí (kruhová staveniště – ROUND_SITE_M).
 */
export const CONSTRUCTION_BASE: Record<ConstructionKind, DwellingType | null> = {
  zemnice: 'zemnice',
  polozemnice: 'polozemnice',
  hrncir: 'polozemnice',
  kovar: 'polozemnice',
  uhlir: 'zemnice',
  milir: null,
  modla: null,
  svatyne: null,
};

/**
 * Kruhová staveniště bez jámy: poloměr světlé čáry vytyčení a ušlapané trávy kolem (m, od
 * počátku modelu). Modla: udusaný kruh Ø 4 m; svatyně: vnitřní okraj příkopu (R_IN
 * v tools/blender/sacred_layout.py), ušlapaná tráva jen uvnitř – obtisk by jinak překryl dno
 * příkopu (leží těsně nad terénem).
 */
export const ROUND_SITE_M: Record<'milir' | SacredKind, { outline: number; trampled: number }> = {
  milir: { outline: 2.65, trampled: 4.6 },
  modla: { outline: 2.0, trampled: 3.4 },
  svatyne: { outline: 11.1, trampled: 9.8 },
};

export type ConstructionPhaseId =
  | 'layout'
  | 'turf'
  | 'dig'
  | 'posts'
  | 'logs'
  | 'frame'
  | 'porch'
  | 'wattle'
  | 'daub'
  | 'thatch'
  | 'moss'
  | 'finish'
  | 'fence'
  | 'beds'
  | 'kiln'
  | 'forge'
  | 'workshop'
  | 'ground'
  | 'ring'
  | 'stack'
  | 'cover'
  | 'top'
  | 'vents'
  | 'log'
  | 'raise'
  | 'hew'
  | 'carve'
  | 'platform'
  | 'tamp'
  | 'fires';

export interface ConstructionPhase {
  id: ConstructionPhaseId;
  /** Popis pro vývojovou lištu (česky). */
  label: string;
  from: number;
  to: number;
}

/** Fáze polozemnice s přístřeškem (hrnčíř, kovář) až po hřeben – pak pec / výheň a dílna. */
function porchHousePhases(
  craft: ConstructionPhase,
  workshop: ConstructionPhase,
): readonly ConstructionPhase[] {
  return [
    { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.04 },
    { id: 'turf', label: 'sejmutí drnu', from: 0.04, to: 0.09 },
    { id: 'dig', label: 'kopání jámy', from: 0.09, to: 0.19 },
    { id: 'logs', label: 'roubení stěn', from: 0.19, to: 0.32 },
    { id: 'frame', label: 'vaznice, sloupy a krokve', from: 0.32, to: 0.39 },
    { id: 'porch', label: 'přístřešek – sloupy, vaznice a krokve', from: 0.39, to: 0.45 },
    { id: 'wattle', label: 'latě a pletené štíty', from: 0.45, to: 0.5 },
    { id: 'daub', label: 'omazávání mazanicí', from: 0.5, to: 0.57 },
    { id: 'thatch', label: 'došky po řadách i přes přístřešek', from: 0.57, to: 0.73 },
    { id: 'finish', label: 'hřeben, kozy a valy', from: 0.73, to: 0.77 },
    craft,
    workshop,
  ];
}

/**
 * Fáze stavby (průběh 0–1, navazují na sebe): vytyčení, sejmutí drnu, kopání jámy, pak
 * zemnice sloupy a krov na zemi, polozemnice srub z trámů po řadách, latě a pletené štíty,
 * mazanice, došky po řadách zdola nahoru a nakonec hřeben s kozami a valy hlíny; polozemnice
 * pak ještě polský plot kolem pozemku (kůly, pak proplétání větví) a záhony se zeleninou
 * (homestead-layout.ts). Řemeslné dílny navíc přístřešek, pec / výheň a vybavení dílny (pozemek
 * nemají), uhlíř kryje střechu mechem; milíř se skládá zvlášť – věnec polen, polena po vrstvách,
 * kryt z hlíny a drnů, komín a průduchy.
 */
export const CONSTRUCTION_PHASES: Record<ConstructionKind, readonly ConstructionPhase[]> = {
  zemnice: [
    { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.06 },
    { id: 'turf', label: 'sejmutí drnu', from: 0.06, to: 0.14 },
    { id: 'dig', label: 'kopání jámy', from: 0.14, to: 0.36 },
    { id: 'posts', label: 'zahloubené sloupy', from: 0.36, to: 0.44 },
    { id: 'frame', label: 'vaznice a krokve', from: 0.44, to: 0.54 },
    { id: 'wattle', label: 'latě a pletené štíty', from: 0.54, to: 0.64 },
    { id: 'daub', label: 'omazávání mazanicí', from: 0.64, to: 0.72 },
    { id: 'thatch', label: 'došky po řadách', from: 0.72, to: 0.94 },
    { id: 'finish', label: 'hřeben, kozy a valy', from: 0.94, to: 1 },
  ],
  polozemnice: [
    { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.05 },
    { id: 'turf', label: 'sejmutí drnu', from: 0.05, to: 0.11 },
    { id: 'dig', label: 'kopání jámy', from: 0.11, to: 0.23 },
    { id: 'logs', label: 'roubení stěn', from: 0.23, to: 0.39 },
    { id: 'frame', label: 'vaznice, sloupy a krokve', from: 0.39, to: 0.47 },
    { id: 'wattle', label: 'latě a pletené štíty', from: 0.47, to: 0.55 },
    { id: 'daub', label: 'omazávání mazanicí', from: 0.55, to: 0.63 },
    { id: 'thatch', label: 'došky po řadách', from: 0.63, to: 0.8 },
    { id: 'finish', label: 'hřeben, kozy a valy', from: 0.8, to: 0.85 },
    { id: 'fence', label: 'polský plot – kůly, pak proplétání větví', from: 0.85, to: 0.94 },
    { id: 'beds', label: 'záhony a zelenina', from: 0.94, to: 1 },
  ],
  hrncir: porchHousePhases(
    { id: 'kiln', label: 'hrnčířská pec – podstavec, kopule, topeniště', from: 0.77, to: 0.93 },
    { id: 'workshop', label: 'dílna – police, hrnce, kruh a koš', from: 0.93, to: 1 },
  ),
  kovar: porchHousePhases(
    { id: 'forge', label: 'výheň – ohniště, měchy, kovadlina', from: 0.77, to: 0.93 },
    { id: 'workshop', label: 'dílna – uhlí, koryto, železo a koše', from: 0.93, to: 1 },
  ),
  uhlir: [
    { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.05 },
    { id: 'turf', label: 'sejmutí drnu', from: 0.05, to: 0.11 },
    { id: 'dig', label: 'kopání jámy', from: 0.11, to: 0.29 },
    { id: 'posts', label: 'zahloubené sloupy', from: 0.29, to: 0.36 },
    { id: 'frame', label: 'vaznice a krokve', from: 0.36, to: 0.45 },
    { id: 'wattle', label: 'latě a pletené štíty', from: 0.45, to: 0.54 },
    { id: 'daub', label: 'omazávání mazanicí', from: 0.54, to: 0.61 },
    { id: 'moss', label: 'mech po řadách místo došků', from: 0.61, to: 0.85 },
    { id: 'finish', label: 'hřeben, kozy a valy', from: 0.85, to: 0.91 },
    { id: 'workshop', label: 'hromada polen na milíř a koše uhlí', from: 0.91, to: 1 },
  ],
  milir: [
    { id: 'layout', label: 'vytyčení kruhu a fíra uprostřed', from: 0, to: 0.06 },
    { id: 'ground', label: 'milířiště – srovnaná zem', from: 0.06, to: 0.14 },
    { id: 'ring', label: 'věnec polen u země', from: 0.14, to: 0.24 },
    { id: 'stack', label: 'polena kolem fíry po vrstvách', from: 0.24, to: 0.52 },
    { id: 'cover', label: 'kryt z hlíny a drnů zdola nahoru', from: 0.52, to: 0.78 },
    { id: 'top', label: 'vrchol a komín', from: 0.78, to: 0.86 },
    { id: 'vents', label: 'průduchy a zapálení', from: 0.86, to: 0.93 },
    { id: 'finish', label: 'žebřík, hrabice a drny', from: 0.93, to: 1 },
  ],
  // modla: kruh, kmen, vztyčení, tesání a řezba po stupních (hewn → carved → idol), obětiny
  modla: [
    { id: 'layout', label: 'vytyčení kruhu – kolíky a provázek', from: 0, to: 0.08 },
    { id: 'ground', label: 'udusaný kruh – srovnání a ušlapání země', from: 0.08, to: 0.18 },
    { id: 'log', label: 'dubový kmen – přivlečení na podložky', from: 0.18, to: 0.3 },
    { id: 'raise', label: 'vztyčení kůlu – vzpěry a klínové kameny', from: 0.3, to: 0.44 },
    { id: 'hew', label: 'osekání kůlu do čtyřhranu, čepice nahrubo', from: 0.44, to: 0.62 },
    { id: 'carve', label: 'řezba – čtyři tváře, paže, roh a opasek', from: 0.62, to: 0.88 },
    { id: 'finish', label: 'obětiny – stužka, misky, snop a kameny', from: 0.88, to: 1 },
  ],
  // svatyně (Peryn): vytyčení, příkop po výběžcích, navážka a udusání plochy, ohniště, modla
  svatyne: [
    { id: 'layout', label: 'vytyčení – kolík uprostřed, provaz, kolíky okvětí', from: 0, to: 0.05 },
    { id: 'dig', label: 'kopání příkopu – výběžek po výběžku', from: 0.05, to: 0.4 },
    { id: 'platform', label: 'navážka – vyvýšený kruh z vykopané hlíny', from: 0.4, to: 0.52 },
    { id: 'tamp', label: 'udusání plochy', from: 0.52, to: 0.58 },
    { id: 'fires', label: 'ohniště ve výběžcích – kameny a dřevo', from: 0.58, to: 0.68 },
    { id: 'log', label: 'dubový kmen na modlu', from: 0.68, to: 0.74 },
    { id: 'raise', label: 'vztyčení kůlu modly – vzpěry a kameny', from: 0.74, to: 0.8 },
    { id: 'carve', label: 'řezba modly – osekání, tváře, čepice', from: 0.8, to: 0.93 },
    { id: 'finish', label: 'kamenná dlažba kolem modly a obětiny', from: 0.93, to: 1 },
  ],
};

/** Výběžky příkopu svatyně a ohniště v nich (tools/blender/sacred_layout.py – N_PETALS). */
export const SHRINE_PETALS = 8;

/** Řad došků (u uhlíře mechu) na model (podle atlasu – tools/blender/atlas.py); milíř nemá střechu. */
export const THATCH_COURSES: Record<ConstructionKind, number> = {
  zemnice: 8,
  polozemnice: 9,
  hrncir: 9,
  kovar: 9,
  uhlir: 8,
  milir: 0,
  modla: 0,
  svatyne: 0,
};
const RAFTER_PAIRS = 5;
const LOG_COURSES = 6;
/** Vrstvy polen a prstence krytu milíře (tools/blender/crafts.py). */
const MILIR_STACK_TIERS = 4;
const MILIR_COVER_RINGS = 3;

export type SiteProp =
  'spoil' | 'turf' | 'timber' | 'rods' | 'straw' | 'spade' | 'basket' | 'stones' | 'clay';
/**
 * Rekvizity staveniště: obydlí z construction.glb obydlí („site-…“), kameny a hlína pro pec
 * a výheň z construction.glb řemesel. Hromadu hlíny z jámy kreslí scéna.
 */
export const SITE_PROPS: readonly SiteProp[] = [
  'spoil',
  'turf',
  'timber',
  'rods',
  'straw',
  'spade',
  'basket',
  'stones',
  'clay',
];

type PropPlaces = Record<SiteProp, { x: number; z: number; rotation: number }>;

const POLOZEMNICE_PLACES: PropPlaces = {
  spoil: { x: -3.85, z: -0.4, rotation: Math.PI / 2 },
  turf: { x: 3.75, z: -2.8, rotation: 0.3 },
  timber: { x: 3.75, z: 0.5, rotation: 0.05 },
  rods: { x: -1.3, z: -3.75, rotation: 0.1 },
  straw: { x: 1.4, z: -3.85, rotation: Math.PI / 2 },
  spade: { x: -2.95, z: 1.0, rotation: 0.6 },
  basket: { x: -1.45, z: 3.4, rotation: 0 },
  stones: { x: 3.6, z: 3.3, rotation: 0.4 },
  clay: { x: -3.5, z: 4.4, rotation: 0.2 },
};

/** Kde na staveništi leží rekvizity (souřadnice modelu, natočení vůči stavbě). */
export const SITE_PROP_PLACES: Record<ConstructionKind, PropPlaces> = {
  zemnice: {
    spoil: { x: -3.55, z: -0.4, rotation: Math.PI / 2 },
    turf: { x: 3.45, z: -2.7, rotation: 0.3 },
    timber: { x: 3.45, z: 0.5, rotation: 0.05 },
    rods: { x: -1.3, z: -3.45, rotation: 0.1 },
    straw: { x: 1.4, z: -3.55, rotation: Math.PI / 2 },
    spade: { x: -2.65, z: 1.0, rotation: 0.6 },
    basket: { x: -1.35, z: 3.6, rotation: 0 },
    stones: { x: 3.4, z: 3.2, rotation: 0.4 },
    clay: { x: -3.3, z: 4.4, rotation: 0.2 },
  },
  polozemnice: POLOZEMNICE_PLACES,
  // pod přístřeškem stojí pec / výheň a police – koš stranou před dílnou, kameny a hlína
  // vedle přístřešku (mimo polena u pece a uhlí u výhně)
  hrncir: { ...POLOZEMNICE_PLACES, basket: { x: -3.3, z: 2.9, rotation: 0 } },
  kovar: { ...POLOZEMNICE_PLACES, basket: { x: -3.3, z: 2.9, rotation: 0 } },
  uhlir: {
    spoil: { x: -3.55, z: -0.4, rotation: Math.PI / 2 },
    turf: { x: 3.45, z: -2.7, rotation: 0.3 },
    timber: { x: 2.2, z: -3.6, rotation: Math.PI / 2 },
    rods: { x: -1.3, z: -3.45, rotation: 0.1 },
    straw: { x: 1.4, z: -3.55, rotation: Math.PI / 2 },
    spade: { x: -2.65, z: 1.6, rotation: 0.6 },
    basket: { x: -2.6, z: 3.6, rotation: 0 },
    stones: { x: 3.4, z: 3.2, rotation: 0.4 },
    clay: { x: -3.3, z: 4.4, rotation: 0.2 },
  },
  // milíř: hráň polen na skládání a stoh drnů na kryt (drny a lopata zůstanou u hotového)
  milir: {
    spoil: { x: 0, z: 0, rotation: 0 },
    turf: { x: 3.4, z: 2.6, rotation: 0.4 },
    timber: { x: -4.0, z: 0.8, rotation: 1.2 },
    rods: { x: 0, z: 0, rotation: 0 },
    straw: { x: 0, z: 0, rotation: 0 },
    spade: { x: 2.4, z: 1.2, rotation: 0.6 },
    basket: { x: 2.6, z: 2.55, rotation: 0 },
    stones: { x: 0, z: 0, rotation: 0 },
    clay: { x: 0, z: 0, rotation: 0 },
  },
  // modla: rýč a koš vedle kruhu, kameny na klínování kůlu (nepoužité rekvizity v bodě 0)
  modla: {
    spoil: { x: 0, z: 0, rotation: 0 },
    turf: { x: 0, z: 0, rotation: 0 },
    timber: { x: 0, z: 0, rotation: 0 },
    rods: { x: 0, z: 0, rotation: 0 },
    straw: { x: 0, z: 0, rotation: 0 },
    spade: { x: 2.7, z: 0.9, rotation: 0.6 },
    basket: { x: -2.6, z: 1.4, rotation: 0 },
    stones: { x: 2.4, z: -1.9, rotation: 0.4 },
    clay: { x: 0, z: 0, rotation: 0 },
  },
  // svatyně: v rozích půdorysu za valem (hroty okvětí na úhlopříčkách – tam je místo)
  svatyne: {
    spoil: { x: 0, z: 0, rotation: 0 },
    turf: { x: 11.4, z: 11.2, rotation: 0.3 },
    timber: { x: 0, z: 0, rotation: 0 },
    rods: { x: 0, z: 0, rotation: 0 },
    straw: { x: 0, z: 0, rotation: 0 },
    spade: { x: -11.4, z: 11.0, rotation: 0.6 },
    basket: { x: -12.1, z: 10.2, rotation: 0 },
    stones: { x: 11.2, z: -11.5, rotation: 0.4 },
    clay: { x: 0, z: 0, rotation: 0 },
  },
};

export interface ConstructionState {
  phase: ConstructionPhase;
  /** Díly z construction.glb, které stojí (bez předpony druhu, např. 'rafters-2'). */
  parts: string[];
  /** Hloubka jámy (m); 0 = ještě se nekope a terén zůstává celý (milíř jámu nemá). */
  pitDepth: number;
  /** Jak moc jámu kryje střecha 0–1. */
  roofCover: number;
  /** Světlá čára vytyčení po obvodu 0–1. */
  outline: number;
  /** Sejmutý drn: podíl půdorysu od zadní stěny k šíji 0–1. */
  turf: number;
  /** Ušlapaná tráva kolem staveniště 0–1. */
  trampled: number;
  /** Rekvizity a jejich velikost (hromada roste s kopáním, hráň ubývá se stavbou…). */
  props: { prop: SiteProp; scale: number }[];
  /**
   * Pozemek (jen obydlí na pozemku, homestead-layout.ts): podíl zatlučených kůlů plotu 0–1,
   * upletených větví (zdola nahoru) 0–1 a hotových záhonů se zeleninou 0–1.
   */
  plot: PlotProgress;
}

export interface PlotProgress {
  posts: number;
  rails: number;
  beds: number;
}

/** Hotový pozemek – celý plot i záhony. */
export const PLOT_BUILT: PlotProgress = { posts: 1, rails: 1, beds: 1 };
const PLOT_NONE: PlotProgress = { posts: 0, rails: 0, beds: 0 };

/** 0 před `from`, 1 po `to`, mezi tím lineárně. */
export function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

/** Fáze stavby podle průběhu (poslední fáze zahrnuje i 1). */
export function constructionPhase(kind: ConstructionKind, progress: number): ConstructionPhase {
  const phases = CONSTRUCTION_PHASES[kind];
  const p = Math.min(1, Math.max(0, progress));
  return phases.find((phase) => p < phase.to) ?? phases[phases.length - 1]!;
}

interface PartRule {
  part: string;
  from: number;
  /** Od kdy díl zmizí (výplet pod mazanicí, kolíky po zasazení sloupů). */
  to?: number;
}

/** Fáze druhu podle id; chybějící fáze → první (průběh v ní nic nemění). */
function phaseOf(kind: ConstructionKind, id: ConstructionPhaseId): ConstructionPhase {
  return CONSTRUCTION_PHASES[kind].find((p) => p.id === id) ?? CONSTRUCTION_PHASES[kind][0]!;
}

function hasPhase(kind: ConstructionKind, id: ConstructionPhaseId): boolean {
  return CONSTRUCTION_PHASES[kind].some((p) => p.id === id);
}

/** Díly řemesla po sobě uvnitř jedné fáze: [díl, kdy v rámci fáze 0–1]. */
const CRAFT_STEPS: Partial<Record<ConstructionKind, [ConstructionPhaseId, [string, number][]][]>> =
  {
    hrncir: [
      [
        'kiln',
        [
          ['kiln-base', 0.05],
          ['kiln-dome-1', 0.3],
          ['kiln-dome-2', 0.5],
          ['kiln-dome-3', 0.7],
          ['kiln-mouth', 0.88],
        ],
      ],
      [
        'workshop',
        [
          ['shelf', 0.05],
          ['pots', 0.3],
          ['wheel', 0.5],
          ['clay', 0.7],
          ['yard', 0.85],
        ],
      ],
    ],
    kovar: [
      [
        'forge',
        [
          ['forge-hearth', 0.05],
          ['forge-fire', 0.3],
          ['forge-wall', 0.45],
          ['forge-bellows', 0.65],
          ['anvil', 0.85],
        ],
      ],
      [
        'workshop',
        [
          ['charcoal', 0.1],
          ['trough', 0.35],
          ['iron', 0.6],
          ['yard', 0.8],
        ],
      ],
    ],
    uhlir: [
      [
        'workshop',
        [
          ['wood', 0.1],
          ['coal', 0.5],
          ['tools', 0.8],
        ],
      ],
    ],
  };

/** Kdy se který díl objeví – postupně uvnitř své fáze. */
export function partSchedule(kind: ConstructionKind): PartRule[] {
  const within = (id: ConstructionPhaseId, t: number): number => {
    const p = phaseOf(kind, id);
    return p.from + (p.to - p.from) * t;
  };
  const series = (
    name: string,
    count: number,
    id: ConstructionPhaseId,
    from: number,
    to: number,
    until?: number,
  ): PartRule[] =>
    Array.from({ length: count }, (_, k) => ({
      part: `${name}-${k + 1}`,
      from: within(id, from + ((to - from) * k) / Math.max(1, count - 1)),
      ...(until === undefined ? {} : { to: until }),
    }));
  const rules: PartRule[] = [];
  const base = CONSTRUCTION_BASE[kind];
  if (kind === 'modla' || kind === 'svatyne') {
    sacredSchedule(kind, rules, within, series);
    return rules;
  }
  if (base === null) {
    // milíř: kolíky po obvodu a fíra uprostřed, milířiště, věnec, polena, kryt, komín, průduchy
    rules.push({ part: 'stakes', from: 0, to: within('ring', 0.1) });
    rules.push({ part: 'pole', from: within('layout', 0.5), to: within('top', 0.2) });
    rules.push({ part: 'ground', from: within('ground', 0.3) });
    rules.push({ part: 'ring', from: within('ring', 0.2) });
    rules.push(...series('stack', MILIR_STACK_TIERS, 'stack', 0.05, 0.85));
    rules.push(...series('cover', MILIR_COVER_RINGS, 'cover', 0.05, 0.8));
    rules.push({ part: 'top', from: within('top', 0.3) });
    rules.push({ part: 'vents', from: within('vents', 0.3) });
    rules.push({ part: 'tools', from: within('finish', 0.3) });
    return rules;
  }
  const daubFrom = within('daub', 0.25);
  if (base === 'zemnice') {
    rules.push({ part: 'stakes', from: 0, to: within('posts', 0.2) });
    rules.push({ part: 'posts', from: within('posts', 0.2) });
    rules.push({ part: 'ridge-beam', from: within('posts', 0.75) });
    rules.push(...series('rafters', RAFTER_PAIRS, 'frame', 0.1, 0.85));
  } else {
    rules.push({ part: 'stakes', from: 0, to: within('logs', 0.05) });
    rules.push(...series('logs', LOG_COURSES, 'logs', 0.05, 0.9, daubFrom));
    rules.push({ part: 'plates', from: within('frame', 0.05) });
    rules.push({ part: 'posts', from: within('frame', 0.25) });
    rules.push({ part: 'ridge-beam', from: within('frame', 0.4) });
    rules.push(...series('rafters', RAFTER_PAIRS, 'frame', 0.5, 0.95));
  }
  if (hasPhase(kind, 'porch')) {
    rules.push({ part: 'porch-posts', from: within('porch', 0.1) });
    rules.push(...series('porch-rafters', RAFTER_PAIRS, 'porch', 0.35, 0.9));
  }
  rules.push({ part: 'laths', from: within('wattle', 0.15) });
  if (hasPhase(kind, 'porch')) rules.push({ part: 'porch-laths', from: within('wattle', 0.3) });
  rules.push({ part: 'wattle', from: within('wattle', 0.55), to: daubFrom });
  rules.push({ part: 'daub', from: daubFrom });
  // uhlíř kryje střechu mechem – stejné řady jako došky, jen v jeho fázi
  const roof: ConstructionPhaseId = hasPhase(kind, 'moss') ? 'moss' : 'thatch';
  rules.push(...series('thatch', THATCH_COURSES[kind], roof, 0.04, 0.92));
  rules.push({ part: 'ridge', from: within('finish', 0.1) });
  rules.push({ part: 'berms', from: within('finish', 0.45) });
  for (const [id, steps] of CRAFT_STEPS[kind] ?? []) {
    for (const [part, t] of steps) rules.push({ part, from: within(id, t) });
  }
  return rules;
}

/**
 * Díly modly a svatyně (tools/blender/sacred.py). Řezba jde po stupních: kmen v kůře (post)
 * → osekaný čtyřhran (hewn) → tváře nahrubo (carved) → hotová modla (idol); kolíky, kmen na
 * podložkách, vzpěry, třísky a hrubá navážka svatyně (platform-1) zase zmizí.
 */
function sacredSchedule(
  kind: SacredKind,
  rules: PartRule[],
  within: (id: ConstructionPhaseId, t: number) => number,
  series: (
    name: string,
    count: number,
    id: ConstructionPhaseId,
    from: number,
    to: number,
  ) => PartRule[],
): void {
  if (kind === 'modla') {
    rules.push({ part: 'stakes', from: 0, to: within('log', 0.05) });
    rules.push({ part: 'ground', from: within('ground', 0.35) });
    rules.push({ part: 'log', from: within('log', 0.2), to: within('raise', 0.45) });
    rules.push({ part: 'struts', from: within('raise', 0.3), to: within('hew', 0.2) });
    rules.push({ part: 'post', from: within('raise', 0.45), to: within('hew', 0.35) });
    rules.push({ part: 'stones', from: within('raise', 0.75) });
    rules.push({ part: 'chips', from: within('hew', 0.1), to: within('finish', 0.25) });
    rules.push({ part: 'hewn', from: within('hew', 0.35), to: within('carve', 0.1) });
    rules.push({ part: 'carved', from: within('carve', 0.1), to: within('carve', 0.6) });
    rules.push({ part: 'idol', from: within('carve', 0.6) });
    rules.push({ part: 'ribbon', from: within('finish', 0.25) });
    rules.push({ part: 'offerings', from: within('finish', 0.55) });
    return;
  }
  rules.push({ part: 'stakes', from: 0, to: within('platform', 0.1) });
  rules.push(...series('ditch', SHRINE_PETALS, 'dig', 0.04, 0.94));
  rules.push({ part: 'platform-1', from: within('platform', 0.15), to: within('tamp', 0.4) });
  rules.push({ part: 'platform-2', from: within('tamp', 0.4) });
  rules.push(...series('fire', SHRINE_PETALS, 'fires', 0.05, 0.92));
  rules.push({ part: 'log', from: within('log', 0.2), to: within('raise', 0.45) });
  rules.push({ part: 'struts', from: within('raise', 0.3), to: within('carve', 0.15) });
  rules.push({ part: 'post', from: within('raise', 0.45), to: within('carve', 0.2) });
  rules.push({ part: 'stones', from: within('raise', 0.75) });
  rules.push({ part: 'chips', from: within('carve', 0.1), to: within('finish', 0.3) });
  rules.push({ part: 'hewn', from: within('carve', 0.2), to: within('carve', 0.5) });
  rules.push({ part: 'carved', from: within('carve', 0.5), to: within('carve', 0.85) });
  rules.push({ part: 'idol', from: within('carve', 0.85) });
  rules.push({ part: 'paving', from: within('finish', 0.15) });
  rules.push({ part: 'ribbon', from: within('finish', 0.4) });
  rules.push({ part: 'offerings', from: within('finish', 0.6) });
}

/** Všechny díly staveniště daného druhu (jména v construction.glb bez předpony). */
export function constructionParts(kind: ConstructionKind): string[] {
  return partSchedule(kind).map((rule) => rule.part);
}

/** Co staveniště ukáže při průběhu `progress` (0–1). */
export function constructionState(kind: ConstructionKind, progress: number): ConstructionState {
  const p = Math.min(1, Math.max(0, progress));
  const phase = (id: ConstructionPhaseId): ConstructionPhase => phaseOf(kind, id);
  const parts = partSchedule(kind)
    .filter((rule) => p >= rule.from && (rule.to === undefined || p < rule.to))
    .map((rule) => rule.part);
  const props: { prop: SiteProp; scale: number }[] = [];
  const add = (prop: SiteProp, visible: boolean, scale: number): void => {
    if (visible && scale > 0) props.push({ prop, scale });
  };
  const base = CONSTRUCTION_BASE[kind];
  if (kind === 'modla' || kind === 'svatyne') return sacredState(kind, p, parts);
  if (base === null) {
    // milíř: bez jámy a drnu, vytyčený kruh zmizí s milířištěm; dřevo ubývá se skládáním,
    // drny přibývají a s krytem ubývají
    const ground = phase('ground');
    const ring = phase('ring');
    const stack = phase('stack');
    const cover = phase('cover');
    add('timber', p < stack.to, 1 - 0.65 * ramp(p, ring.from, stack.to));
    add(
      'turf',
      p >= ground.from && p < cover.to,
      (0.4 + 0.6 * ramp(p, ring.from, stack.to)) * (1 - 0.7 * ramp(p, cover.from, cover.to)),
    );
    add('spade', p >= ground.from, 1);
    return {
      phase: constructionPhase(kind, p),
      parts,
      pitDepth: 0,
      roofCover: 0,
      outline: 1 - ramp(p, ground.from, ground.to),
      turf: 0,
      trampled: 0.85 * ramp(p, 0.01, ring.from),
      props,
      plot: PLOT_NONE,
    };
  }
  const turf = phase('turf');
  const dig = phase('dig');
  const frame = phase('frame');
  const wattle = phase('wattle');
  const daub = phase('daub');
  const roof = phase(hasPhase(kind, 'moss') ? 'moss' : 'thatch');
  const finish = phase('finish');
  // dřevo se začne brát se sloupy (zemnice), nebo s roubením (polozemnice)
  const timberUse = base === 'zemnice' ? phase('posts') : phase('logs');
  const used = 1 - 0.6 * ramp(p, finish.from, finish.to);
  // polozemnice: zbytek hlíny se rozhrne na valy celý – na pozemku pak vyrostou záhony
  const fenced = hasPhase(kind, 'fence');
  const spoilLeft = fenced ? 1 - ramp(p, finish.from, finish.to) : used;
  add('spoil', p >= dig.from, (0.3 + 0.7 * ramp(p, dig.from, dig.to)) * spoilLeft);
  add('turf', p >= turf.from, (0.4 + 0.6 * ramp(p, turf.from, turf.to)) * used);
  add('timber', p < frame.to, 1 - 0.65 * ramp(p, timberUse.from, frame.to));
  add('rods', p >= frame.from && p < wattle.to, 1 - 0.6 * ramp(p, wattle.from, wattle.to));
  add('straw', p >= daub.from && p < roof.to, 1 - 0.7 * ramp(p, roof.from, roof.to));
  add('spade', p >= turf.from, 1);
  add('basket', p >= dig.from, 1);
  // pec a výheň: kameny se snášejí během stavby a ubývají s podstavcem, hlína na mazanici a pec
  const craft = hasPhase(kind, 'kiln')
    ? phase('kiln')
    : hasPhase(kind, 'forge')
      ? phase('forge')
      : null;
  if (craft) {
    add(
      'stones',
      p >= frame.from && p < craft.to,
      (0.5 + 0.5 * ramp(p, frame.from, finish.to)) * (1 - 0.7 * ramp(p, craft.from, craft.to)),
    );
    add('clay', p >= wattle.from && p < craft.to, 1 - 0.6 * ramp(p, craft.from, craft.to));
  }
  return {
    phase: constructionPhase(kind, p),
    parts,
    pitDepth: PIT_SHAPES[base].depth * ramp(p, dig.from, dig.to),
    roofCover: ramp(p, roof.from, roof.to),
    outline: 1 - ramp(p, dig.from, dig.from + 0.04),
    turf: ramp(p, turf.from, turf.to),
    trampled: 0.85 * ramp(p, 0.01, dig.from + 0.04),
    props,
    plot: fenced ? plotProgress(kind, p) : PLOT_NONE,
  };
}

/** Pozemek během stavby: kůly v první polovině fáze plotu, pak větve zdola, nakonec záhony. */
function plotProgress(kind: ConstructionKind, p: number): PlotProgress {
  const fence = phaseOf(kind, 'fence');
  const beds = phaseOf(kind, 'beds');
  const middle = (fence.from + fence.to) / 2;
  return {
    posts: ramp(p, fence.from, middle),
    rails: ramp(p, middle, fence.to),
    beds: ramp(p, beds.from, beds.to),
  };
}

/**
 * Kde leží rekvizita staveniště obydlí na pozemku: rohový dům má plot hned za sebou – rekvizity,
 * které by ležely za plotem (ven z pozemku), se zrcadlí dovnitř pozemku. `inward` = směr do
 * středu pozemku v osách modelu (znaménka x a z; 0 = na té ose nic nezrcadlit).
 */
export function sitePropPlace(
  kind: ConstructionKind,
  prop: SiteProp,
  inward: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number; rotation: number } {
  const place = SITE_PROP_PLACES[kind][prop];
  const flipX = inward.x !== 0 && Math.sign(place.x) !== Math.sign(inward.x);
  const flipZ = inward.z !== 0 && Math.sign(place.z) !== Math.sign(inward.z);
  return {
    x: flipX ? -place.x : place.x,
    z: flipZ ? -place.z : place.z,
    rotation: flipX !== flipZ ? -place.rotation : place.rotation,
  };
}

/**
 * Modla a svatyně: bez jámy; vytyčený kruh zmizí s udusáním (modla), nebo s prvním výkopem
 * (svatyně). Rekvizity: rýč a koš, u modly kameny na klínování kůlu, u svatyně stoh drnů
 * z příkopu a kameny na ohniště a dlažbu.
 */
function sacredState(kind: SacredKind, p: number, parts: string[]): ConstructionState {
  const phase = (id: ConstructionPhaseId): ConstructionPhase => phaseOf(kind, id);
  const props: { prop: SiteProp; scale: number }[] = [];
  const add = (prop: SiteProp, visible: boolean, scale: number): void => {
    if (visible && scale > 0) props.push({ prop, scale });
  };
  const finish = phase('finish');
  if (kind === 'modla') {
    const ground = phase('ground');
    const log = phase('log');
    const raise = phase('raise');
    add('spade', p >= ground.from, 1);
    add('basket', p >= log.from && p < finish.from, 1);
    add('stones', p >= log.from && p < raise.to, 1 - 0.7 * ramp(p, raise.from, raise.to));
    return {
      phase: constructionPhase(kind, p),
      parts,
      pitDepth: 0,
      roofCover: 0,
      outline: 1 - ramp(p, ground.from, ground.to),
      turf: 0,
      trampled: 0.85 * ramp(p, 0.01, ground.to),
      props,
      plot: PLOT_NONE,
    };
  }
  const dig = phase('dig');
  const platform = phase('platform');
  const tamp = phase('tamp');
  const fires = phase('fires');
  add('spade', p >= dig.from && p < tamp.to, 1);
  add('basket', p >= dig.from && p < platform.to, 1);
  add('turf', p >= dig.from && p < platform.to, 0.4 + 0.6 * ramp(p, dig.from, dig.to));
  add(
    'stones',
    p >= tamp.from && p < finish.to,
    (0.6 + 0.4 * ramp(p, tamp.from, fires.from)) * (1 - 0.6 * ramp(p, fires.from, finish.to)),
  );
  return {
    phase: constructionPhase(kind, p),
    parts,
    pitDepth: 0,
    roofCover: 0,
    outline: 1 - ramp(p, dig.from, dig.from + 0.08),
    turf: 0,
    trampled: 0.85 * ramp(p, 0.01, dig.from + 0.05),
    props,
    plot: PLOT_NONE,
  };
}
