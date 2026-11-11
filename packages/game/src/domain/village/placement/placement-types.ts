// Typy vstupu a výsledků kontrol umístění, meze a pomocné formátovací funkce.

import type { BandFortification } from '../fortification/band';
import { type CemeterySquareInput, type OrchardSquareInput, type PartInput } from '../core/actions';
import {
  type Craft,
  type DwellingPlot,
  type DwellingType,
  type FieldSurface,
  type PenSpecies,
  type Position,
  type SacredBuildingKind,
  type SquareGrid,
  type TileCell,
  type WallKind,
} from '../types';
import type { FortBuildWork } from '../fortification/types';
import { type ObstacleChanges } from '../core/obstacles';
import { type ObstacleKind } from '../../landscape';
import { type SparedSacred } from '../people/sacred';
import { type TakenLand } from '../buildings/land-taken';
import { type WalkRoad } from '../paths/walking';

/** Výsledek kontroly umístění; důvod je česky pro hráče. */
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
  /**
   * Varování u prošlého umístění – stavbu neblokuje, hráč ho uvidí u kurzoru (hřbitov blízko
   * obydlí nebo vody, obydlí blízko hřbitova). Bez varování chybí.
   */
  warning?: string;
  /** Místo problému u neprošlého umístění – rozhraní ho ukáže červeně (jen některé kontroly). */
  where?: PlacementWhere;
}

/**
 * Kde přesně je problém neprošlého umístění (návrh Clauda: místo problému se při kreslení ukáže
 * červeně): `points` – body (brány zatarasených obydlí), `footprints` – obrysy (stavba v cestě,
 * úsek jiného opevnění, políčka vody), `cells` – čtverce plochy.
 */
export interface PlacementWhere {
  points?: { x: number; z: number }[];
  footprints?: (readonly (readonly [number, number])[])[];
  cells?: TileCell[];
}

/** Co z vsi potřebuje kontrola překryvu – VillageState ji splňuje, klient ji složí ze scény. */
export interface PlacementVillage {
  /**
   * Obydlí – na pozemku (`plot`, zabírá celé políčko), nebo volně (jen půdorys; dílna i
   * s přístřeškem a milířem – `workshop`).
   */
  readonly dwellings: readonly {
    readonly type: DwellingType;
    readonly position: Position;
    readonly plot?: DwellingPlot;
    readonly workshop?: { readonly craft: Craft };
    /** Dnešní tvar bez varianty rozměrů (`Dwelling.plainShape`). */
    readonly plainShape?: boolean;
  }[];
  readonly constructions: readonly {
    readonly dwellingType: DwellingType | null;
    readonly position: Position | null;
    readonly plot?: DwellingPlot;
    /** Rozestavěná řemeslná dílna (crafts.md). */
    readonly craft?: Craft;
    readonly plainShape?: boolean;
    /** Stavba opevnění (fortifications.md) – opevnění, které se staví. */
    readonly fortificationId?: number;
    /** Práce, cíl a díly stavby opevnění (`fortRuns`); chybí – stavba na celém obvodu. */
    readonly fortWork?: FortBuildWork;
    readonly fortTarget?: WallKind;
    readonly fortSegments?: readonly { readonly index: number }[];
    /** Stavba lomu (fortifications.md – Kámen) – výchoz, na kterém lom vzniká. */
    readonly quarryOutcrop?: number;
  }[];
  /** Lomy vsi na skalních výchozech (fortifications.md – Kámen); chybí = žádný. */
  readonly quarries?: readonly { readonly outcropId: number }[];
  /**
   * Opevnění vsi (fortifications.md – Obvod) – pás zabírá místo jiným stavbám (hotové úseky
   * a celý obvod, dokud se staví – `fortificationBand`). Chybí = žádné.
   */
  readonly fortifications?: readonly (BandFortification & { readonly id: number })[];
  /**
   * Pole – id a vlastní natočená mřížka (fields.md – Natočené stavby); pole bez mřížky (i chybějící
   * údaj) leží v mřížce krajiny.
   */
  readonly fields?: readonly { readonly id: number; readonly grid?: SquareGrid }[];
  /**
   * Díly polí – každý zabírá svůj čtverec (políčko, u natočeného pole čtverec v jeho mřížce; díl
   * bez políčka se nepočítá); `fieldId` a `areaM2` pro navazující pole (bez plochy se počítá
   * celé políčko).
   */
  readonly parts: readonly {
    readonly id?: number;
    readonly cell?: TileCell;
    readonly fieldId?: number;
    readonly areaM2?: number;
  }[];
  /** Pohřebiště – zabírají své čtverce (bez údaje žádná; natočený hřbitov ve své mřížce `grid`). */
  readonly cemeteries?: readonly {
    readonly grid?: SquareGrid;
    readonly squares: readonly { readonly cell: TileCell }[];
  }[];
  /**
   * Jabloňové sady – zabírají své čtverce (bez údaje žádné; natočený sad ve své mřížce `grid`);
   * `areaM2` čtverce pro varování, že sad stavbou obydlí zanikne (bez plochy celé políčko).
   */
  readonly orchards?: readonly {
    readonly id?: number;
    readonly grid?: SquareGrid;
    readonly squares: readonly { readonly cell: TileCell; readonly areaM2?: number }[];
  }[];
  /**
   * Ohrady (i rozestavěné) – každá zabírá svůj čtverec (bez údaje žádné – oxen.md; natočená ve své
   * mřížce `grid`).
   */
  readonly pens?: readonly {
    readonly id?: number;
    readonly cell: TileCell;
    readonly grid?: SquareGrid;
    /** Další čtverce ohrady (oxen.md – Ohrady podle druhu); bez údaje jen první. */
    readonly extraSquares?: readonly { readonly cell: TileCell }[];
    /** Druh ohrady – rozšíření jen ohrady téhož druhu (`penSquaresFromCells`). */
    readonly species?: PenSpecies;
    readonly team?: { readonly readyDay: number } | null;
    readonly training?: { readonly startDay: number } | null;
  }[];
  /**
   * Les vsi – čtverce polí zarostlé lesem (fields.md – Les vsi; bez údaje žádný): pole ho vymýtí
   * jako les (stromy lesa jsou v `obstacleChanges.added`), ostatní stavby ho vyklučí jako les
   * krajiny (`ForestUse`). Les z natočeného pole leží v jeho mřížce (`grid`).
   */
  readonly woods?: readonly { readonly cell: TileCell; readonly grid?: SquareGrid }[];
  /** Překážky, které ves už odstranila nebo pokácela (`obstacleChangesAt`); bez nich žádné. */
  readonly obstacleChanges?: ObstacleChanges;
  /**
   * Stromy vyhrazené rozestavěnými stavbami (`reservedTrees`) – patří své stavbě, mýcení za ně
   * kládu nedá (forest.md). Bez údaje žádné.
   */
  readonly reservedTrees?: readonly number[];
  /** Modly a svatyně i rozestavěné (`sacredBuildingPlots`) – zabírají svůj půdorys. Bez údaje žádné. */
  readonly sacredBuildings?: readonly {
    readonly kind: SacredBuildingKind;
    readonly position: Position;
  }[];
  /**
   * Humna i rozestavěná (production-chains.md – Humno) – zabírají svůj půdorys
   * (`threshingFloorFootprint`). Bez údaje žádná.
   */
  readonly threshingFloors?: readonly { readonly position: Position }[];
  /**
   * Pokrytí nástroji 0–1 (crafts.md) – cena založení pole a povrch čtverce (křoviny) podle mezí
   * produktivity. Bez údaje 0 (ves bez kováře).
   */
  readonly toolCoverage?: number;
  /**
   * Ves má vycvičené spřežení s rádlem (oxen.md – Jen rádlo) – louku zakládá bez motyky, cena
   * založení jen za překážky (drn rozorá první orba). Bez údaje ne.
   */
  readonly ploughTeam?: boolean;
  /**
   * Pevné cesty pro chůzi ke stromům ke kácení (roads.md – osa, stupeň, mokřina a brody) – cena
   * kácení u kurzoru jako na serveru (`placementWalk`). Bez údaje žádné.
   */
  readonly walkRoads?: readonly WalkRoad[];
  /**
   * Milíře uhlířů (crafts.md – Milíř u skácených buků) – samostatné stavby, střed (m); stavět přes
   * ně nejde. Bez údaje žádné.
   */
  readonly kilns?: readonly { readonly x: number; readonly z: number }[];
  /**
   * Posvátná místa stavbám a polím nebrání (christianity.md – Co křest rodu umožní): ves
   * pokřtěného rodu při umístění hráčem (`playerPlacementVillage`). Správce, vesničané a převody
   * starých vsí ho nemají – posvátná místa obcházejí. Bez údaje ne.
   */
  readonly sacredFree?: boolean;
}

/** Kontrola umístění obydlí s cenou překážek na vyklízené ploše. */
export interface DwellingPlacementCheck extends PlacementCheck {
  /** Práce navíc za překážky (člověkodny, tabulka ve fields.md). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: number[];
  /** Dospělé stromy mezi nimi, které nevyhradila jiná stavba – dají klády na hromadu. */
  clearedTrees: number;
  /** Kolik překážek kterého druhu na místě je. */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Posvátné duby a háje na vyklízené ploše – vesničané je nechají stát (happiness.md). */
  spared: SparedSacred;
  /**
   * Kusy čtverců polí a sadů, které obydlí sebere (population.md – Obydlí na poli a v sadu) –
   * pozemek celé políčko, obydlí bez pozemku průnik vyklízené plochy se čtvercem. Pole a sad se
   * o ně zmenší (`giveWayToBuilding`), varování u kurzoru to oznámí.
   */
  takenLand: TakenLand[];
}

/** Kontrola umístění modly nebo svatyně s cenou překážek na půdorysu. */
export interface SacredPlacementCheck extends PlacementCheck {
  /** Práce navíc za překážky (člověkodny, tabulka ve fields.md). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: number[];
  /** Dospělé stromy mezi nimi, které nevyhradila jiná stavba – dají klády na hromadu. */
  clearedTrees: number;
  /** Kolik překážek kterého druhu na místě je. */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /**
   * Kusy dílů polí pod půdorysem (fields.md – Pole jako krajina) – díly se zmenší, pod prahem
   * zmizí (`giveWayToBuilding`).
   */
  takenLand: TakenLand[];
}

/** Náhled pole ze čtverců – díly pro `foundField` / `foundVillage` a souhrn pro hráče. */
export interface FieldPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Natočená mřížka pole (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
  /** Díly – jeden na každý čtverec mimo vodu (louka, křoviny i les). */
  parts: PartInput[];
  areaM2: number;
  averageFertility: number;
  foundingCost: number;
  /**
   * Z ceny založení práce navíc za překážky, které nejsou v sazbě povrchu (na louce všechny,
   * v křovinách bez keřů, v lese jen kameny a balvany).
   */
  obstacleCost: number;
  /** Překážky na čtvercích pole podle druhu (i skalní výchozy, které pole obejde). */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Díly podle povrchu – louka, křoviny, les (jen nenulové). */
  surfaceCounts: Partial<Record<FieldSurface, number>>;
  /** Dospělé stromy na dílech, které nevyhradila stavba – po založení klády na hromadu. */
  clearedTrees: number;
  /** Čtverce, kam pole nesmí (voda, obydlí, jiné pole, moc daleko) – scéna je zčervená. */
  blockedCells: TileCell[];
  /**
   * Pole, na která čtverce navazují stranou, od nejstaršího (fields.md – Navazující pole): prázdné
   * = nové pole, jedno = rozšíří ho, víc = sloučí je do prvního.
   */
  joinedFields: number[];
  /**
   * Čtverce s posvátným dubem (zůstane stát) a čtverce háje (z pole se vyjmou) – scéna je zbarví
   * oranžově jako varování.
   */
  sacredCells: TileCell[];
  /** Posvátné duby a háje, které vesničané při mýcení nechají stát (happiness.md). */
  spared: SparedSacred;
  check: PlacementCheck;
}

/** Náhled sadu ze čtverců – čtverce pro `foundOrchard`, výměra a cena výsadby. */
export interface OrchardPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Natočená mřížka sadu (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
  /** Čtverce sadu – jeden na každý čtverec louky. */
  squares: OrchardSquareInput[];
  areaM2: number;
  /** Výsadba (80 člověkodní/ha) i s překážkami. */
  plantingCost: number;
  /** Z ceny výsadby práce navíc za překážky (kameny, stromy, keře…). */
  obstacleCost: number;
  /** Překážky na čtvercích sadu podle druhu (i skalní výchozy, které sad obejde). */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Čtverce, kam sad nesmí (voda, les, obydlí, pole, hřbitov, jiný sad, moc daleko). */
  blockedCells: TileCell[];
  /** Čtverce s posvátným dubem a čtverce háje (ze sadu se vyjmou) – oranžově. */
  sacredCells: TileCell[];
  /** Posvátné duby a háje, které vesničané při mýcení nechají stát (happiness.md). */
  spared: SparedSacred;
  /** Čtverce polí pod sadem – z pole zmizí (fields.md – Pole jako krajina). */
  takenLand: TakenLand[];
  check: PlacementCheck;
}

/**
 * Náhled hřbitova ze čtverců – čtverce pro `foundCemetery`, cena, místo a varování
 * (`check.warning`), když je moc blízko obydlí nebo vody (hygienu samotnou hráč nevidí).
 */
export interface CemeteryPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x) – v mřížce `grid`. */
  cells: TileCell[];
  /** Natočená mřížka hřbitova (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
  /** Čtverce hřbitova – jeden na každý čtverec louky. */
  squares: CemeterySquareInput[];
  /** Kolik hrobů se do nových čtverců vejde. */
  capacity: number;
  foundingCost: number;
  /** Z ceny založení práce navíc za překážky (kameny, stromy, keře…). */
  obstacleCost: number;
  /** Překážky na čtvercích hřbitova podle druhu. */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Čtverce navazují na hřbitov a rozšíří ho (jinak vznikne nový). */
  extendsCemetery: boolean;
  /**
   * Čtverce, kam hřbitov nesmí (voda, les, obydlí, pole, jiný hřbitov, skalní výchoz) – scéna
   * je zčervená.
   */
  blockedCells: TileCell[];
  /** Čtverce blíž obydlí než 150 m nebo vodě než 100 m – scéna je zbarví oranžově. */
  warningCells: TileCell[];
  /** Čtverce háje (z hřbitova se vyjmou) – oranžově. */
  sacredCells: TileCell[];
  /** Háje, které vesničané nechají stát (happiness.md); čtverec s posvátným dubem hřbitov mít nesmí. */
  spared: SparedSacred;
  /** Čtverce polí pod hřbitovem – z pole zmizí (fields.md – Pole jako krajina). */
  takenLand: TakenLand[];
  check: PlacementCheck;
}

/** Nejvíc čtverců jednoho pole (≈ 34 ha) – ochrana serveru před obřím vstupem. */
export const MAX_FIELD_CELLS = 1500;
/**
 * Nejvíc čtverců jednoho sadu (≈ 34 ha jako pole) – ochrana serveru před obřím vstupem.
 * @alias
 */
export const MAX_ORCHARD_CELLS = MAX_FIELD_CELLS;
/** Nejvíc čtverců jednoho hřbitova (5 600 hrobů) – ochrana serveru před obřím vstupem. */
export const MAX_CEMETERY_CELLS = 100;
/** Krok vzorkování půdorysu obydlí (m) – výšky a povrch políček pod ním. */
export const FOOTPRINT_SAMPLE_STEP_M = 0.5;
export const M2_PER_HA = 10_000;

export const OK: PlacementCheck = { ok: true, reason: null };
/** Skalní výchozy smí zabrat nejvýš tolik z čtverce pole – díl má vždy nějakou plochu. */
export const MAX_OUTCROP_SHARE = 0.9;

export function fail(reason: string, where?: PlacementWhere): PlacementCheck {
  return where ? { ok: false, reason, where } : { ok: false, reason };
}

/** Číslo s desetinnou čárkou. */
export function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Celé číslo s mezerami po tisících. */
export function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Celé metry dolů – „149 m“ je opravdu méně než 150 m. */
export function wholeMeters(value: number): string {
  return `${formatInteger(Math.floor(value))} m`;
}
