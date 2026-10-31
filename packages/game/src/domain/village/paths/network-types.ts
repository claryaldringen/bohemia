// Typy sítě pěšin (PathVillage, PathNetwork…) a společné konstanty – ceny, cesty za den, stáří.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { WATER_FETCHING } from '../rules';
import { type ObstacleChanges } from '../obstacles';
import { type PartStage } from '../summary';
import {
  type Craft,
  type DwellingType,
  type FieldSurface,
  type HerdSpecies,
  type RoadGrade,
  type LaborActivity,
  type RoadLining,
  type LaborTarget,
  type RoutePurpose,
  type Position,
  type SacredBuildingKind,
  type TileCell,
} from '../types';
import { type EarthworkSpan } from './earthworks';
import { type PathTerrain } from './terrain';
import { type WalkPart } from './walk-speed';

/** Bod ve světě (m). */
export interface PathPoint {
  x: number;
  z: number;
}

/** Pěšina: osa (vyhlazená lomená čára) a síla v bodech 0–1 (šířka, vyšlapanost). */
export interface PathLine {
  points: PathPoint[];
  strength: number[];
  /**
   * Jak dlouho se tudy chodí (herní roky – průměr tras, vážený provozem); bez údaje o stáří
   * obydlí PATH_YEARS_UNKNOWN. Podle něj rostou stromy podél pěšin (path-trees.ts).
   */
  years: number[];
  /** Začíná / končí volným koncem (brána, pole, břeh) – tam se vytrácí; jinak v rozcestí. */
  openStart: boolean;
  openEnd: boolean;
}

/** Provoz po buňkách okna – cest za den (vyhlazené); vývojová teplotní mapa. */
export interface PathTraffic {
  originX: number;
  originZ: number;
  cellM: number;
  width: number;
  height: number;
  values: Float32Array;
  /** Provoz po buňkách bez vyhlazení (cest za den) – podle něj pevné cesty zarůstají (roads.md). */
  raw: Float32Array;
}

/** Kam chodí domácnost pro vodu a dřevo – konec její trasy (null = nikam blízko). */
export interface PathErrands {
  water: PathPoint | null;
  wood: PathPoint | null;
}

export interface PathNetwork {
  lines: PathLine[];
  traffic: PathTraffic;
  /** Podle id obydlí domácnosti. */
  errands: ReadonlyMap<number, PathErrands>;
  /** Tras (domácnost × cíl) v posledním kole. */
  trips: number;
  /**
   * Kolik cest za den vede k jednotlivým stavbám (abandonment.md – opuštěná stavba): klíč
   * `<druh>:<id>` (`idol`, `shrine`, `cemetery`, `pen`), cesty za den z posledního kola – jen
   * domácnosti, ke kterým se trasa našla. Stavba, která v mapě chybí, nemá žádný provoz.
   */
  visits: ReadonlyMap<string, number>;
  /** Trasy posledního kola v pořadí hledání – jen s `PathNetworkInput.keepRoutes`. */
  routes?: NetworkRoute[];
}

/**
 * Trasa posledního kola (paths.md – Kdy se trasy počítají a co se ukládá): domácnost × skupina
 * cest, buňky mřížky okna od brány domácnosti k cíli (u pochůzky až k místu, kam došla).
 */
export interface NetworkRoute {
  /** `d:<id obydlí>` domácnosti. */
  from: string;
  /** Klíč cíle skupiny (`TripGroup.to`). */
  to: string;
  purpose: RoutePurpose;
  /** Cest za den (váha trasy v provozu). */
  trips: number;
  cells: number[];
  /** Stálá část `trips` (chůze na zavedené místo, ne práce dne). */
  base?: number;
  /** Podíl cest pochůzky s `nearCost` (`TripGroup.scale`) – chybí = 1. */
  scale?: number;
  visit?: string;
}

/**
 * Čtverec stavby po políčkách (díl pole, čtverec sadu, hřbitova, háje) – střed a strana (m);
 * čtverec natočené stavby (fields.md – Natočené stavby) i natočení `rotation` (rad, po 15°) a
 * `cell` je pak čtverec v mřížce stavby. Čtverce jedné stavby leží ve stejné mřížce.
 */
export interface PathSquare {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  rotation?: number;
}

/**
 * Ves pro pěšiny – jen to, na čem pěšiny závisí. Tvar odpovídá vsi pro scénu (`SceneVillage`
 * ve webu ji splňuje), server ji skládá ze stavu vsi (`pathVillageOf`).
 */
export interface PathVillage {
  /**
   * Hotová obydlí (id obydlí) i staveniště (id stavby). `inhabited` – bydlí v něm někdo (bez
   * údaje ano), `since` – herní den, od kdy stojí (dostavění / zahájení stavby; bez údaje
   * odjakživa), `plot` – pozemek polozemnice (střed políčka a strana), `craft` – řemeslná dílna
   * (crafts.md).
   */
  dwellings: readonly {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    inhabited?: boolean;
    since?: number;
    craft?: Craft;
    /** Dnešní tvar bez varianty rozměrů (population.md – Varianty rozměrů). */
    plainShape?: boolean;
    /** `yard` – dvůr dvorce vojvody (trade.md): střed druhého políčka pozemku. */
    plot?: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      /** Natočený pozemek (rad, po 15°) – střed (x, z) pak není střed políčka. */
      rotation?: number;
      yard?: { x: number; z: number };
    };
  }[];
  /**
   * Pole – díly se stadiem a vzhledem (`look` – chůze podle něj: v osevu, strniště – walk-speed.ts);
   * `grazed` u přílohu ve fázi louky = pasou se na něm stáda (fields.md – Zarůstání,
   * `pastureGrazedParts`): kam stáda nedojdou, tam pasáček nechodí. Bez údaje se pase na každém
   * přílohu.
   */
  fields: readonly {
    id: number;
    parts: readonly (PathSquare & WalkPart & { grazed?: boolean })[];
  }[];
  orchards?: readonly { id: number; squares: readonly PathSquare[] }[];
  /**
   * Hřbitovy – čtverce (`pending` – rozšíření ve stavbě) a jestli je hřbitov hotový (bez údaje
   * hotový): k hotovému se chodí brankou (entrances.ts – `cemeteryEntrance`).
   */
  cemeteries?: readonly {
    id: number;
    squares: readonly (PathSquare & { pending?: boolean })[];
    built?: boolean;
  }[];
  sacred?: {
    oaks: readonly { id: number; x: number; z: number }[];
    groves: readonly { id: number; x: number; z: number; squares: readonly PathSquare[] }[];
    buildings: readonly {
      id: number;
      kind: SacredBuildingKind;
      position: Position;
      built: boolean;
    }[];
  };
  /** Rozdělení práce posledního dne (člověkodny po místech), lidé podle věku a herní den. */
  labor?: {
    day: number;
    month: number;
    people: { children: number; adults: number; elders: number };
    /**
     * Práce dne po místech; činnost a vozy jen u kováře – kopání rudy a nošení (crafts.md – Uhlí
     * a ruda kováře) jde z kovárny.
     */
    shares: readonly {
      target: LaborTarget;
      manDays: number;
      activity?: LaborActivity;
      carts?: number;
    }[];
  };
  /** Odstraněné a pokácené překážky (počty – klíč sítě). */
  obstacles?: Pick<ObstacleChanges, 'removed' | 'stumps'>;
  /**
   * Pevné cesty (roads.md) – po nich se jde jako po plné pěšině; `cart` – vozová cesta (wagons.md
   * – Vyjeté cesty, pro pěší stejná); `lined` – stromy u cesty (roads.md – Stromy u cesty zrychlí
   * chůzi), jen když nějaké jsou. Bez údaje žádné.
   */
  roads?: readonly {
    id?: number;
    points: readonly PathPoint[];
    grade?: RoadGrade;
    /** Upravená cesta bez hatě a lávky (`Road.unbridged`). */
    unbridged?: boolean;
    cart?: boolean;
    lined?: RoadLining;
  }[];
  /**
   * Ohrady (oxen.md) – čtverec jako díl pole a jestli je hotová: plot obchází, k ohradě se chodí
   * krmit dobytek. `stocked: false` – hotová ohrada bez zvířat (abandonment.md): krmit se tam
   * nechodí, jen za prací dne. Bez údaje žádné (u ohrady bez `stocked` se zvířaty).
   */
  pens?: readonly (PathSquare & {
    id: number;
    built: boolean;
    stocked?: boolean;
    /** Další čtverce ohrady (oxen.md – Ohrady podle druhu); bez údaje jen jeden. */
    extra?: readonly PathSquare[];
  })[];
  /**
   * Stáda na pastvě (diet.md – kusy po druzích, krávy v zimě v ohradě nepočítané): pasáček je
   * denně vyžene na úhor. Bez údaje žádná.
   */
  livestock?: Readonly<Partial<Record<HerdSpecies, number>>>;
  /**
   * Les vsi (fields.md – Les vsi) – čtverce polí zarostlé lesem: na bývalé louce se jde jako
   * lesem (les na vymýceném lese už terén krajiny zná). Bez údaje žádný.
   */
  woods?: readonly (PathSquare & { surface?: FieldSurface })[];
  /**
   * Přirozené louky letošní seče (oxen.md – Seno) – políčka; pěšina vede k těm, kde se dnes seče
   * (práce `meadow` v rozdělení práce). Bez údaje žádné.
   */
  hayMeadows?: readonly PathSquare[];
  /**
   * Zemní práce vozových cest (roads.md – Vozová cesta) – profily a hotová délka: terén pěšin
   * i vozů se podle nich upraví (`withTerrainEdits` – sklon v úvozu a na náspu). Bez údaje žádné.
   */
  earthworks?: readonly EarthworkSpan[];
  /**
   * Milíře uhlířů (crafts.md – Milíř u skácených buků) – samostatné stavby, střed (m): pěšina kupu
   * obejde, k milíři se chodí za prací dne (uhlíř ze zemnice, pro uhlí z kovárny). Bez údaje žádné.
   */
  kilns?: readonly { x: number; z: number }[];
  /**
   * Humna (production-chains.md – Humno) – hotová i rozestavěná: pěšina mlat obejde, k hotovému
   * se chodí vstupem na předku za výmlatem (nosí se snopy, odnáší zrno), ke staveništi ze všech
   * stran. Bez údaje žádná.
   */
  threshingFloors?: readonly { id: number; position: Position; built: boolean }[];
  /**
   * Obilné jámy (production-chains.md – Obilné jámy) – id a střed (m): z otevřené si domácnosti
   * berou zrno (pěšina k jámě); `open: false` – zapečetěná nebo prázdná jáma, k té se chodí jen za
   * prací dne (ukládání zrna). Stálé trasy se hledají ke všem jamám (`establishedVillage`). Bez
   * údaje žádné.
   */
  grainPits?: readonly { id: number; x: number; z: number; open?: boolean }[];
}

export interface PathNetworkInput {
  village: PathVillage;
  /** Terén okna – i s překážkami krajiny (`withObstacles` v terrain.ts). */
  terrain: PathTerrain;
  /** Poloha stromu z vrstvy překážek – kácení dřeva pro stavbu. */
  tree?(id: number): PathPoint | null;
  /**
   * Provoz za celý rok místo dne (pevné cesty – roads.md): `village.labor.shares` nesou průměrné
   * člověkodny na den za rok, pro dřevo se chodí podle průměru roku (ne podle měsíce).
   */
  annual?: boolean;
  /** Zapsat trasy posledního kola (`PathNetwork.routes`) – čáry ani provoz se tím nemění. */
  keepRoutes?: boolean;
  /**
   * Jen stálé trasy (paths.md – Stálé trasy, pravidlo 5): bez pastviny – ta se mění se stadii
   * dílů; stáda chodí po stálých trasách k polím.
   */
  stable?: boolean;
  /**
   * Vyšlapanost (`decodeWear` – wear.ts): síla pěšiny buňky nikdy neklesne pod vyšlapanost / práh
   * cesty (od viditelné), takže se trasy slévají po vyšlapaných pěšinách (paths.md – Slévání).
   * Chybí = žádná.
   */
  wear?: ReadonlyMap<number, number>;
}

/** Kola hledání: první trasy (každá další se přidá k už vyšlapaným) a jedno kolo se slevou z prvního. */
export const PASSES = 2;

/** Obilná jáma: pěšina vede k buňkám do tolika metrů od středu jámy. */
export const GRAIN_PIT_REACH_M = 3;

/** Kupa milíře uhlíře (crafts.py MILIR_R) – pěšina ji obejde. */
export const MILIR_RADIUS_M = 2.3;

/** Pevná cesta (roads.md): síla pěšiny pod ní – od začátku jako plná pěšina (provoz, kreslení). */
export const ROAD_STRENGTH = 1;

/**
 * Provoz v cestách za den: pod `min` se pěšina nevyšlape (jednotlivé cesty nekreslí), od `full`
 * je plná; mezi tím síla roste s odmocninou provozu (pomalu – přesná aritmetika místo logaritmu).
 */
export const PATH_TRAFFIC = { min: 0.6, full: 10 } as const;

/** Za kolik let od vzniku je spojení vyšlapané naplno (domácnost i cíl) – pěšina se objevuje. */
export const PATH_AGE_FULL_YEARS = 2;

export const DAYS_PER_YEAR = 365.25;

/** Stáří spojení, když obydlí stáří nenese (ves uložená dřív, vývojová ves) – odjakživa. */
export const PATH_YEARS_UNKNOWN = 100;

/** Stáří pro stromy podél pěšin se v klíči sítě zaokrouhluje na tolik let a nejvýš do tolika. */
export const YEARS_STEP = 2;

export const YEARS_KEY_MAX = 40;

/**
 * Cest za den: pro vodu na člověka domácnosti (WATER_FETCHING – i přirážka denního minima,
 * population.md – Práce), pro dřevo na domácnost (léto / zima).
 */
export const WATER_TRIPS_PER_PERSON = WATER_FETCHING.tripsPerPerson;

export const WOOD_TRIPS = { summer: 0.5, winter: 1.2 } as const;

export const WINTER_MONTHS: readonly number[] = [11, 12, 1, 2, 3];

/**
 * Cest pro dřevo za den na domácnost v měsíci `month` (léto / zima, jako v síti pěšin) – podle nich
 * chodí ve scéně postavy k lesu (villagers.md – Provoz na cestách).
 */
export function woodErrandTrips(month: number): number {
  return WINTER_MONTHS.includes(month) ? WOOD_TRIPS.winter : WOOD_TRIPS.summer;
}

/** Návštěvy mezi sousedy – každá domácnost se dvěma nejbližšími. */
export const NEIGHBOUR_TRIPS = 0.5;

export const NEIGHBOURS = 2;

/** Cest za den na člověkoden práce dne na místě (tam a zpět = jedna cesta). */
export const TRIPS_PER_MAN_DAY = 1;

/** Rudiště a milíř kováře – pěšina končí do tolika metrů od místa (crafts.md – Uhlí a ruda). */
export const SMITH_SITE_REACH_M = 3;

/** Zavedená místa – cest za den celé vsi navíc k práci dne (pěšina nezaroste mezi pracemi). */
export const BASE_TRIPS = {
  field: 1.6,
  orchard: 0.8,
  site: 0.6,
  sacred: 0.6,
  pen: 0.8,
  // pro zrno z otevřené obilné jámy (production-chains.md – Obilné jámy; návrh Clauda)
  grainPit: 0.6,
} as const;

/**
 * Stáda na pastvě (diet.md, jako scéna – livestock-placement.ts): ovce s kozami po 20 kusech,
 * krávy po 6; pasáček vyžene každé stádo jednou denně na úhor a zpět (jedna cesta). Mladý úhor se
 * pase vždy, louka na seno až po seči (srpen–listopad); prasata jdou do lesa (cesty pro dřevo).
 */
export const PASTURE = { flockHeads: 20, cattleHeads: 6, tripsPerHerd: 1 } as const;

export const AFTERMATH_MONTHS: readonly number[] = [8, 9, 10, 11];

/**
 * Návštěvy hrobů předků (Martin schválil, návrh Clauda – raní Slované je navštěvovali pravidelně:
 * obětiny, hostiny za mrtvé): cest za den na člověka domácnosti, každá domácnost k nejbližšímu
 * hřbitovu (ves se 7 lidmi ≈ 1 cesta denně, se 40 lidmi ≈ 6).
 */
export const CEMETERY_VISITS_PER_PERSON = 0.15;

/** Lidí na domácnost bez rozdělení práce (ves uložená dřív). */
export const DEFAULT_HOUSEHOLD = 5;

/** Menší cesta za den se nehledá. */
export const MIN_TRIP = 0.02;

/**
 * Pro dřevo se chodí nejvýš tak daleko (cena v m chůze po louce). Pro vodu bez meze – vždy
 * k nejbližší vodě v okně (paths.md – Pochůzky pro vodu; Martin, 19. 10. 2026).
 */
export const ERRAND_MAX_COST = 450;

/** Další kola hledají pochůzku domácnosti nejvýš tak daleko proti prvnímu kolu (násobek a cena navíc). */
export const ERRAND_REACH = { factor: 1.25, extra: 30 } as const;

/** Do takové ceny cesty se pro dřevo chodí naplno, dál úměrně méně často (pro vodu vždy naplno). */
export const ERRAND_NEAR_COST = 130;

/**
 * Zarůstající příloh je vegetace, ne pole (fields.md – Zarůstání) – trnité křoviny a houština
 * mladého lesa zdržují (násobek terénu, jako les). Chůze přes díl pole jinak stálou rychlostí
 * (`partWalkSpeed` – FIELD_WALK.field v každém stadiu, paths.md – Stálé trasy) – pole není zákaz,
 * jen cena: nejkratší cesta je ta nejrychlejší, přes pole se jde, když je obcházení delší.
 */
export const OVERGROWN_COST: Partial<Record<PartStage, number>> = {
  shrubs: 2.2,
  'young-forest': 1.8,
};

/** Les vsi na bývalé louce – jako les krajiny (terrain.ts – FOREST_COST). */
export const WOOD_COST = 1.35;

/** Sad (pod jabloněmi, okopané kmeny), hřbitov (plot, hroby) a ohrada (plot ze žerdí). */
export const ORCHARD_COST = 1.6;

export const CEMETERY_COST = 15;

export const PEN_COST = 15;

/** Staveniště svatyně – průchodné, jen pomalejší (hotová svatyně je neprůchodná celou plochou). */
export const SHRINE_SITE_COST = 2.5;

/**
 * Pěšina ke vchodu stavby (paths.md – Vchody) končí kus před ním (m) – v buňkách do
 * ENTRANCE_REACH_M od toho bodu (jako u brány domu).
 */
export const ENTRANCE_STEP_M = 1;

export const ENTRANCE_REACH_M = 2.5;

/** Okraj domu, kam pěšina nesmí (m). */
export const HOUSE_MARGIN_M = 0.4;

/** Brána před vchodem domu – kus před koncem šíje (m). */
export const GATE_M = 1;

/** Kolem kmene posvátného dubu se staví obětiny – pěšina končí kus od něj (m). */
export const OAK_REACH_M = 4;

/** Zjednodušení osy (m) a kola vyhlazení (Chaikin). */
export const SIMPLIFY_M = 1.1;

export const SMOOTH_PASSES = 3;

export const SQRT2 = Math.SQRT2;

/**
 * Váha odhadu A* pochůzek (násobek vzdušné čáry k místu z prvního kola) – pod nejlevnější cenou
 * chůze po vyšlapané pěšině, hledání se tak drží směru a neprochází celé okolí.
 */
export const A_STAR_WEIGHT = 0.5;

/**
 * Pochůzka přijme místo nebo pěšinu souseda, i když je až o tolik dražší než nejlepší (vážené
 * hledání – jen pro vzhled); hledání tak skončí brzy.
 */
export const GOAL_SLACK = 1.3;

/** Okolí vsi pro pěšiny: kam se chodí pro vodu a dřevo (m od staveb vsi). */
export const PATH_REACH_M = 240;

/** Čtverec stavby po políčkách (pole, sad, hřbitov, ohrada). */
export interface Square {
  cell: { x: number; y: number };
  x: number;
  z: number;
  size: number;
  rotation?: number;
}
