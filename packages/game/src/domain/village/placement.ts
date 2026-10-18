import {
  heightAtWorld,
  obstaclesOf,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
} from '../landscape';
import type { CemeterySquareInput, OrchardSquareInput, PartInput } from './actions';
import { cemeteryFoundingCost, distanceToSquare, touchingCemeteries } from './cemetery';
import { craftCoverage, milirClearing, workshopFootprints } from './crafts';
import { fieldSquareSurface, fieldsTouching, partFoundingCost } from './fields';
import { TAKEN_LAND_EPSILON_M2, landLeftM2, type TakenLand } from './land-taken';
import { LIVESTOCK, withLivestock } from './livestock';
import { orchardPlantingCost } from './orchard';
import { roadWalk, walkGroundOf, type Walk, type WalkRoad } from './paths/walking';
import {
  cellObstacles,
  dwellingClearing,
  dwellingObstacles,
  obstacleChangesAt,
  obstacleStatus,
  outcropUnder,
  polygonObstacles,
  polygonsObstacles,
  tallyCost,
  type ObstacleChanges,
  type ObstacleTally,
} from './obstacles';
import { coveredArea, polygonsOverlap, rectangleCorners, type Point } from './polygon';
import {
  CEMETERY,
  CEMETERY_DISTANCE_M,
  CRAFT_BASE,
  DWELLING_FOOTPRINT_M,
  DWELLING_MAX_HEIGHT_DIFF_M,
  FIELD_LIMITS,
  MILIR,
  PLOT_HOUSE_OFFSET_M,
  PLOT_HOUSE_ROTATION,
  PLOT_SNAP_M,
  PLOT_TYPES,
  PLOT_VARIANTS,
  SACRED_BUILDINGS,
  SACRED_OAK,
  SURFACE_INCLUDED_OBSTACLES,
  WORKSHOP_PORCH_M,
} from './rules';
import {
  NO_SPARED,
  SACRED_OAK_RADIUS_M,
  grovesOfTiles,
  mergeSpared,
  sacredBuildingPlots,
  sacredFootprint,
  sacredOaksInTile,
  sacredOaksNear,
  sacredSitesOf,
  sparedSacred,
  sparedWarning,
  type SacredSites,
  type SparedSacred,
} from './sacred';
import type {
  Craft,
  DwellingPlot,
  DwellingType,
  FieldSurface,
  PlotVariant,
  Position,
  SacredBuildingKind,
  TileCell,
  VillageState,
} from './types';
import { reservedTrees } from './wood';

// Umisťování obydlí, polí, sadů a pohřebišť (population.md – Umístění obydlí, fields.md –
// Založení pole, orchard.md – Stavba, cemetery.md – Stavba). Čisté funkce pro server i klienta
// (náhled při umisťování). Obydlí stojí kdekoli (souřadnice světa scény v metrech), pole, sady
// a pohřebiště se skládají z celých čtverců – políček krajiny (15 × 15 m).

/** Výsledek kontroly umístění; důvod je česky pro hráče. */
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
  /**
   * Varování u prošlého umístění – stavbu neblokuje, hráč ho uvidí u kurzoru (hřbitov blízko
   * obydlí nebo vody, obydlí blízko hřbitova). Bez varování chybí.
   */
  warning?: string;
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
  }[];
  readonly constructions: readonly {
    readonly dwellingType: DwellingType | null;
    readonly position: Position | null;
    readonly plot?: DwellingPlot;
    /** Rozestavěná řemeslná dílna (crafts.md). */
    readonly craft?: Craft;
  }[];
  /**
   * Díly polí – každý zabírá své políčko (díl bez políčka se nepočítá); `fieldId` a `areaM2` pro
   * navazující pole (bez plochy se počítá celé políčko).
   */
  readonly parts: readonly {
    readonly cell?: TileCell;
    readonly fieldId?: number;
    readonly areaM2?: number;
  }[];
  /** Pohřebiště – zabírají políčka svých čtverců (bez údaje žádná). */
  readonly cemeteries?: readonly { readonly squares: readonly { readonly cell: TileCell }[] }[];
  /**
   * Jabloňové sady – zabírají políčka svých čtverců (bez údaje žádné); `areaM2` čtverce pro
   * varování, že sad stavbou obydlí zanikne (bez plochy se počítá celé políčko).
   */
  readonly orchards?: readonly {
    readonly squares: readonly { readonly cell: TileCell; readonly areaM2?: number }[];
  }[];
  /** Ohrady (i rozestavěné) – každá zabírá své políčko (bez údaje žádné – oxen.md). */
  readonly pens?: readonly { readonly cell: TileCell }[];
  /**
   * Les vsi – čtverce polí zarostlé lesem (fields.md – Les vsi; bez údaje žádný): pole ho vymýtí
   * jako les (stromy lesa jsou v `obstacleChanges.added`), ostatní stavby jen na louku.
   */
  readonly woods?: readonly { readonly cell: TileCell }[];
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
   * Pokrytí nástroji 0–1 (crafts.md) – cena založení pole a povrch čtverce (křoviny) podle mezí
   * produktivity. Bez údaje 0 (ves bez kováře).
   */
  readonly toolCoverage?: number;
  /**
   * Pevné cesty pro chůzi ke stromům ke kácení (roads.md – osa, stupeň, mokřina a brody) – cena
   * kácení u kurzoru jako na serveru (`placementWalk`). Bez údaje žádné.
   */
  readonly walkRoads?: readonly WalkRoad[];
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
   * o ně zmenší (`giveWayToDwelling`), varování u kurzoru to oznámí.
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
}

/** Náhled pole ze čtverců – díly pro `foundField` / `foundVillage` a souhrn pro hráče. */
export interface FieldPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
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
  check: PlacementCheck;
}

/**
 * Náhled hřbitova ze čtverců – čtverce pro `foundCemetery`, cena, místo a varování
 * (`check.warning`), když je moc blízko obydlí nebo vody (hygienu samotnou hráč nevidí).
 */
export interface CemeteryPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
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
  check: PlacementCheck;
}

/** Nejvíc čtverců jednoho pole (≈ 34 ha) – ochrana serveru před obřím vstupem. */
export const MAX_FIELD_CELLS = 1500;
/** Nejvíc čtverců jednoho sadu (≈ 34 ha jako pole) – ochrana serveru před obřím vstupem. */
export const MAX_ORCHARD_CELLS = MAX_FIELD_CELLS;
/** Nejvíc čtverců jednoho hřbitova (5 600 hrobů) – ochrana serveru před obřím vstupem. */
export const MAX_CEMETERY_CELLS = 100;
/** Krok vzorkování půdorysu obydlí (m) – výšky a povrch políček pod ním. */
const FOOTPRINT_SAMPLE_STEP_M = 0.5;
const M2_PER_HA = 10_000;

const OK: PlacementCheck = { ok: true, reason: null };
/** Skalní výchozy smí zabrat nejvýš tolik z čtverce pole – díl má vždy nějakou plochu. */
const MAX_OUTCROP_SHARE = 0.9;

function fail(reason: string): PlacementCheck {
  return { ok: false, reason };
}

/** Číslo s desetinnou čárkou. */
function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Celé číslo s mezerami po tisících. */
function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Celé metry dolů – „149 m“ je opravdu méně než 150 m. */
function wholeMeters(value: number): string {
  return `${formatInteger(Math.floor(value))} m`;
}

/** Rohy půdorysu obydlí ve světě. */
export function dwellingFootprint(type: DwellingType, position: Position): Point[] {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  return rectangleCorners(position.x, position.z, width, depth, position.rotation);
}

/** Poloha domu na pozemku: střed políčka + posun varianty, vchodem k brance (`PLOT_HOUSE_*`). */
export function plotHousePosition(landscape: Landscape, plot: DwellingPlot): Position {
  const center = tileCenterWorld(landscape, plot.cell.x, plot.cell.y);
  const offset = PLOT_HOUSE_OFFSET_M[plot.variant];
  return { x: center.x + offset.x, z: center.z + offset.z, rotation: PLOT_HOUSE_ROTATION };
}

/**
 * Obydlí, jak ho zná kontrola překryvu – na pozemku (`plot`), nebo volně (jen půdorys); řemeslná
 * dílna s řemeslem (`craft`).
 */
interface PlacedDwelling {
  readonly type: DwellingType;
  readonly position: Position;
  readonly plot?: DwellingPlot;
  readonly craft?: Craft;
}

/**
 * Co obydlí zabírá: celé políčko pozemku i s půdorysem domu (dům převedené starší polozemnice
 * může z políčka vyčnívat – `withPlots`), u volného obydlí (zemnice, starší polozemnice bez
 * pozemku) jen půdorys, u dílny půdorys s přístřeškem a milířem (crafts.md) – nic z toho se
 * nesmí překrývat.
 */
export function dwellingPlot(landscape: Landscape, d: PlacedDwelling): Point[][] {
  if (d.craft) return workshopFootprints(d.craft, d.position);
  const footprint = dwellingFootprint(d.type, d.position);
  return d.plot ? [cellCorners(landscape, d.plot.cell), footprint] : [footprint];
}

/** Obydlí vsi pro kontrolu překryvu (řemeslo dílny jako `craft`). */
function placedDwelling(d: PlacementVillage['dwellings'][number]): PlacedDwelling {
  return {
    type: d.type,
    position: d.position,
    ...(d.plot ? { plot: d.plot } : {}),
    ...(d.workshop ? { craft: d.workshop.craft } : {}),
  };
}

/**
 * Varianta pozemku podle toho, kde na políčku `cell` dům stojí: ta, jejíž poloha domu je nejblíž
 * (uprostřed, nebo v rohu, kam se dům zřetelně posunul). `snapped` = poloha domu přesunutá na
 * místo varianty (natočení zůstane), když je blíž než PLOT_SNAP_M, jinak null – dům zůstane.
 */
export function nearestPlotVariant(
  landscape: Landscape,
  cell: TileCell,
  position: Position,
): { variant: PlotVariant; snapped: Position | null } {
  let best: { variant: PlotVariant; distance: number; x: number; z: number } | null = null;
  for (const variant of PLOT_VARIANTS) {
    const at = plotHousePosition(landscape, { cell, variant });
    const distance = Math.hypot(at.x - position.x, at.z - position.z);
    if (!best || distance < best.distance - 1e-9) best = { variant, distance, x: at.x, z: at.z };
  }
  const chosen = best!;
  return {
    variant: chosen.variant,
    snapped:
      chosen.distance <= PLOT_SNAP_M
        ? { x: chosen.x, z: chosen.z, rotation: position.rotation }
        : null,
  };
}

/** Rohy políčka (čtverce pole) ve světě. */
export function cellCorners(landscape: Landscape, cell: TileCell): Point[] {
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  return rectangleCorners(center.x, center.z, landscape.cellSizeM, landscape.cellSizeM, 0);
}

function cellIndex(landscape: Landscape, cell: TileCell): number {
  return cell.y * landscape.size + cell.x;
}

/** Políčka, jejichž vnitřek se překrývá s mnohoúhelníkem (dotyk hranou překryv není). */
function cellsUnderPolygon(landscape: Landscape, polygon: readonly Point[]): number[] {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const toTile = (v: number): number =>
    Math.min(landscape.size - 1, Math.max(0, Math.floor((v + half) / landscape.cellSizeM)));
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const out: number[] = [];
  for (let y = toTile(Math.min(...zs)); y <= toTile(Math.max(...zs)); y++) {
    for (let x = toTile(Math.min(...xs)); x <= toTile(Math.max(...xs)); x++) {
      if (polygonsOverlap(cellCorners(landscape, { x, y }), polygon)) {
        out.push(cellIndex(landscape, { x, y }));
      }
    }
  }
  return out;
}

/** Políčka, která už zabírají pole vsi. */
function occupiedCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  const occupied = new Set<number>();
  for (const part of village?.parts ?? []) {
    if (part.cell) occupied.add(cellIndex(landscape, part.cell));
  }
  return occupied;
}

/** Políčka, která už zabírají pohřebiště vsi. */
function cemeteryCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  const occupied = new Set<number>();
  for (const cemetery of village?.cemeteries ?? []) {
    for (const square of cemetery.squares) occupied.add(cellIndex(landscape, square.cell));
  }
  return occupied;
}

/** Políčka, která už zabírají sady vsi. */
function orchardCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  const occupied = new Set<number>();
  for (const orchard of village?.orchards ?? []) {
    for (const square of orchard.squares) occupied.add(cellIndex(landscape, square.cell));
  }
  return occupied;
}

/** Políčka, která už zabírají ohrady vsi. */
function penCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  return new Set((village?.pens ?? []).map((pen) => cellIndex(landscape, pen.cell)));
}

/** Políčka lesa vsi (fields.md – Les vsi). */
function woodCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  return new Set((village?.woods ?? []).map((wood) => cellIndex(landscape, wood.cell)));
}

/** Body mřížky po FOOTPRINT_SAMPLE_STEP_M přes otočený půdorys obydlí, včetně okrajů. */
function footprintSamples(type: DwellingType, position: Position): Point[] {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  return rectangleSamples(width, depth, position);
}

/** Body mřížky po FOOTPRINT_SAMPLE_STEP_M přes otočený obdélník se středem v `position`. */
function rectangleSamples(width: number, depth: number, position: Position): Point[] {
  const stepsX = Math.ceil(width / FOOTPRINT_SAMPLE_STEP_M);
  const stepsZ = Math.ceil(depth / FOOTPRINT_SAMPLE_STEP_M);
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  const samples: Point[] = [];
  for (let i = 0; i <= stepsX; i++) {
    for (let j = 0; j <= stepsZ; j++) {
      const lx = -width / 2 + (width * i) / stepsX;
      const lz = -depth / 2 + (depth * j) / stepsZ;
      samples.push([position.x + lx * cos + lz * sin, position.z - lx * sin + lz * cos]);
    }
  }
  return samples;
}

/**
 * Půdorys celý v krajině, ne ve vodě, jen na louce a dost rovný. `what` = co se staví (důvod
 * česky – obydlí, nebo milíř uhlíře).
 */
function checkFootprintTerrain(
  landscape: Landscape,
  samples: readonly Point[],
  what: 'Obydlí' | 'Milíř' = 'Obydlí',
): PlacementCheck {
  let lowest = Infinity;
  let highest = -Infinity;
  let offMeadow = false;
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return fail(`${what} musí stát uvnitř krajiny sídla.`);
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return fail(`${what} nemůže stát ve vodě.`);
    if (surface !== 'meadow') offMeadow = true;
    const height = heightAtWorld(landscape, x, z);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  if (offMeadow) return fail(`${what} jde zatím stavět jen na louce.`);
  const difference = highest - lowest;
  if (difference > DWELLING_MAX_HEIGHT_DIFF_M) {
    return fail(
      `${what === 'Milíř' ? 'Pod milířem je země' : 'Země je tu'} příliš nerovná – rozdíl ` +
        `${formatNumber(difference, 1)} m, nejvýš ${formatNumber(DWELLING_MAX_HEIGHT_DIFF_M, 1)} m.`,
    );
  }
  return OK;
}

/**
 * Půdorys nebo pozemek (`plot`) se nepřekrývá s obydlím či rozestavěným obydlím (i jejich
 * pozemky), modlou, svatyní ani se čtvercem pohřebiště – a bez `takeLand` ani se čtvercem pole či
 * sadu (obydlí na pole a do sadu smí – population.md, Obydlí na poli a v sadu).
 */
function checkFootprintFree(
  landscape: Landscape,
  village: PlacementVillage | null,
  plot: readonly Point[][],
  takeLand = false,
): PlacementCheck {
  if (village === null) return OK;
  const overlaps = (other: readonly Point[][]): boolean =>
    plot.some((a) => other.some((b) => polygonsOverlap(a, b)));
  for (const d of village.dwellings) {
    if (overlaps(dwellingPlot(landscape, placedDwelling(d)))) {
      return fail('Překrývá se s jiným obydlím.');
    }
  }
  for (const c of village.constructions) {
    if (c.dwellingType === null || c.position === null) continue;
    const site = {
      type: c.dwellingType,
      position: c.position,
      ...(c.plot ? { plot: c.plot } : {}),
      ...(c.craft ? { craft: c.craft } : {}),
    };
    if (overlaps(dwellingPlot(landscape, site))) {
      return fail('Překrývá se s rozestavěným obydlím.');
    }
  }
  for (const b of village.sacredBuildings ?? []) {
    if (overlaps([sacredFootprint(b.kind, b.position)])) {
      return fail(b.kind === 'idol' ? 'Překrývá se s modlou.' : 'Překrývá se se svatyní.');
    }
  }
  const under = plot.flatMap((polygon) => cellsUnderPolygon(landscape, polygon));
  const occupied = occupiedCells(landscape, village);
  if (!takeLand && under.some((i) => occupied.has(i))) return fail('Překrývá se s polem.');
  const cemeteries = cemeteryCells(landscape, village);
  if (under.some((i) => cemeteries.has(i))) return fail('Překrývá se s hřbitovem.');
  const orchards = orchardCells(landscape, village);
  if (!takeLand && under.some((i) => orchards.has(i))) return fail('Překrývá se se sadem.');
  const pens = penCells(landscape, village);
  if (under.some((i) => pens.has(i))) return fail('Překrývá se s ohradou.');
  const woods = woodCells(landscape, village);
  if (under.some((i) => woods.has(i))) return fail('Roste tu les – stavět jde zatím jen na louce.');
  return OK;
}

/** Políčka polí a sadů vsi – z těch obydlí bere půdu (population.md – Obydlí na poli a v sadu). */
function cropCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  return new Set([...occupiedCells(landscape, village), ...orchardCells(landscape, village)]);
}

/**
 * Vyklízená plocha obydlí bez pozemku (`DWELLING_CLEARING_M` – staveniště s hromadou hlíny
 * a střechou předsazenou před štíty), u řemeslné dílny `craft` i kruh kolem milíře (crafts.md).
 * Tolik obydlí sebere z polí a sadů; podle ní scéna pod domem nekreslí obilí ani jabloně.
 */
export function freeDwellingClearings(
  type: DwellingType,
  position: Position,
  craft?: Craft,
): Point[][] {
  const clearing = dwellingClearing(type, position);
  if (!craft || workshopFootprints(craft, position).length < 2) return [clearing];
  return [clearing, milirClearing(position)];
}

/**
 * Kusy čtverců polí a sadů pod vyklízenými plochami `clearings` (konvexní mnohoúhelníky jedné
 * stavby) – průnik s každým čtvercem, dotyk hranou se nepočítá. Po řádcích políček.
 */
function takenLandUnder(
  landscape: Landscape,
  village: PlacementVillage | null,
  clearings: readonly Point[][],
): TakenLand[] {
  const crops = cropCells(landscape, village);
  if (crops.size === 0) return [];
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  const tiles = [...new Set(clearings.flatMap((c) => cellsUnderPolygon(landscape, c)))]
    .filter((index) => crops.has(index))
    .sort((a, b) => a - b);
  return tiles.flatMap((index) => {
    const cell = { x: index % landscape.size, y: Math.floor(index / landscape.size) };
    const areaM2 = Math.min(cellAreaM2, coveredArea(clearings, cellCorners(landscape, cell)));
    return areaM2 > TAKEN_LAND_EPSILON_M2 ? [{ cell, areaM2, cellAreaM2 }] : [];
  });
}

/** Celé políčko pozemku, když leží na poli nebo v sadu (jinak nic). */
function takenPlotLand(
  landscape: Landscape,
  village: PlacementVillage | null,
  cell: TileCell,
): TakenLand[] {
  if (!cropCells(landscape, village).has(cellIndex(landscape, cell))) return [];
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  return [{ cell: { x: cell.x, y: cell.y }, areaM2: cellAreaM2, cellAreaM2 }];
}

/**
 * Varování u kurzoru, že obydlí sebere půdu poli nebo sadu (neblokuje): „Pole se zmenší“, nebo
 * „Pole zanikne“, když mu nezbude žádný díl (podle `landLeftM2`); u sadu totéž.
 */
function takenLandWarning(
  landscape: Landscape,
  village: PlacementVillage | null,
  taken: readonly TakenLand[],
): string | undefined {
  if (village === null || taken.length === 0) return undefined;
  const byCell = new Map(taken.map((t) => [cellIndex(landscape, t.cell), t]));
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  const leftOf = (cell: TileCell | undefined, areaM2: number | undefined): number | null => {
    const t = cell ? byCell.get(cellIndex(landscape, cell)) : undefined;
    const area = areaM2 ?? cellAreaM2;
    return t ? landLeftM2(area, t.areaM2, t.cellAreaM2) : null;
  };
  // pole podle id (díly bez pole – staré vstupy – každý zvlášť, nezaniká)
  const fields = new Map<number, { hit: boolean; alive: boolean }>();
  let looseHit = false;
  for (const part of village.parts) {
    const left = leftOf(part.cell, part.areaM2);
    if (part.fieldId === undefined) {
      looseHit ||= left !== null;
      continue;
    }
    const field = fields.get(part.fieldId) ?? { hit: false, alive: false };
    if (left !== null) field.hit = true;
    if (left === null || left > 0) field.alive = true;
    fields.set(part.fieldId, field);
  }
  const hitFields = [...fields.values()].filter((f) => f.hit);
  const orchards = (village.orchards ?? []).flatMap((orchard) => {
    const lefts = orchard.squares.map((s) => leftOf(s.cell, s.areaM2));
    if (lefts.every((l) => l === null)) return [];
    return [lefts.some((l) => l === null || l > 0)];
  });
  const lines = [
    hitFields.length > 0 || looseHit
      ? hitFields.some((f) => !f.alive)
        ? 'Pole zanikne'
        : 'Pole se zmenší'
      : null,
    orchards.length > 0
      ? orchards.some((alive) => !alive)
        ? 'Sad zanikne'
        : 'Sad se zmenší'
      : null,
  ].filter((line) => line !== null);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** Varování oddělená řádky (prázdná vynechá); žádné → undefined. */
function joinWarnings(...warnings: (string | undefined)[]): string | undefined {
  const text = warnings.filter(Boolean).join('\n');
  return text || undefined;
}

/** Varování, když obydlí stojí blíž hřbitovu, než je pro hygienu v pořádku (neblokuje). */
function nearCemeteryWarning(
  landscape: Landscape,
  village: PlacementVillage | null,
  position: Position,
): PlacementCheck {
  let nearest = Infinity;
  for (const cemetery of village?.cemeteries ?? []) {
    for (const { cell } of cemetery.squares) {
      const center = tileCenterWorld(landscape, cell.x, cell.y);
      nearest = Math.min(
        nearest,
        distanceToSquare(position.x, position.z, center, landscape.cellSizeM),
      );
    }
  }
  if (nearest >= CEMETERY_DISTANCE_M.dwelling.ok) return OK;
  return { ok: true, reason: null, warning: `Blízko hřbitova (${wholeMeters(nearest)})` };
}

/**
 * Smí obydlí stát na místě volně (bez pozemku – zemnice)? Rozdíl výšek pod půdorysem nejvýš
 * 0,5 m, všechna políčka pod ním louka (ne voda, zatím ani les), žádný překryv s obydlími,
 * rozestavěnými obydlími (i jejich pozemky), hřbitovy ani se skalním výchozem. Ostatní
 * překážky na vyklízené ploše (`DWELLING_CLEARING_M`) osadníci odstraní – cena po kusech podle
 * tabulky ve fields.md. Na pole a do sadu obydlí smí (population.md – Obydlí na poli a v sadu):
 * díly a čtverce pod vyklízenou plochou se o průnik zmenší (`takenLand`, varování „Pole se
 * zmenší“), překážky na nich obydlí neplatí – patří poli a sadu. Blíž hřbitovu než 150 m jen
 * varuje (`warning`). `obstacles` = vrstva překážek krajiny. Polozemnice se staví na pozemku –
 * `checkPlotPlacement`.
 */
export function checkDwellingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): DwellingPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    spared: NO_SPARED,
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha obydlí.'), ...none };
  }
  const terrain = checkFootprintTerrain(landscape, footprintSamples(type, position));
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = dwellingFootprint(type, position);
  const free = checkFootprintFree(landscape, village, [footprint], true);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesOf(obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, [footprint]);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  // překážky v políčkách polí, hřbitovů, sadů a hájů odstraní jejich stavba (háj nikdo), obydlí
  // je neplatí; posvátný dub na vyklízené ploše zůstane stát
  const clearing = dwellingClearing(type, position);
  const clearingTiles = cellsUnderPolygon(landscape, clearing);
  const groves = grovesOfTiles(sites, clearingTiles);
  const tally = dwellingObstacles(
    obstacles,
    status,
    type,
    position,
    new Set([
      ...occupiedCells(landscape, village),
      ...cemeteryCells(landscape, village),
      ...orchardCells(landscape, village),
      ...penCells(landscape, village),
      ...clearingTiles.filter((tile) => sites.groveByTile.has(tile)),
    ]),
    sites.protectedTrees,
  );
  const spared = sparedSacred(sacredOaksNear(sites, obstacles, clearing, 0), groves);
  const takenLand = takenLandUnder(landscape, village, [clearing]);
  const warning = joinWarnings(
    nearCemeteryWarning(landscape, village, position).warning,
    sparedWarning(spared),
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    ok: true,
    reason: null,
    ...(warning ? { warning } : {}),
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    spared,
    takenLand,
  };
}

/** Těžiště vrcholů mnohoúhelníku (střed obdélníku půdorysu). */
function centroid(polygon: readonly Point[]): { x: number; z: number } {
  const x = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const z = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  return { x, z };
}

/**
 * Smí řemeslná dílna `craft` stát na místě (crafts.md – Budovy)? Umisťuje se volně jako zemnice:
 * obydlí řemesla (hrnčíř a kovář polozemnice s přístřeškem vpředu, uhlíř zemnice) jako
 * `checkDwellingPlacement` a u uhlíře navíc milíř kus od zemnice (MILIR) – i pod ním louka, dost
 * rovná zem, žádný překryv, skalní výchoz ani posvátné místo. Překážky na vyklízené ploše dílny
 * a v kruhu kolem milíře osadníci odstraní (cena po kusech). Na pole a do sadu smí jako zemnice –
 * zmenší je o průnik vyklízených ploch (`takenLand`).
 */
export function checkWorkshopPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  craft: Craft,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): DwellingPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    spared: NO_SPARED,
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha dílny.'), ...none };
  }
  const type = CRAFT_BASE[craft];
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  const porch = WORKSHOP_PORCH_M[craft];
  const footprints = workshopFootprints(craft, position);
  const house = { ...centroid(footprints[0]!), rotation: position.rotation };
  const terrain = checkFootprintTerrain(landscape, rectangleSamples(width, depth + porch, house));
  if (!terrain.ok) return { ...terrain, ...none };
  const milir = footprints[1];
  if (milir) {
    const center = { ...centroid(milir), rotation: position.rotation };
    const samples = rectangleSamples(MILIR.footprintM, MILIR.footprintM, center);
    const ground = checkFootprintTerrain(landscape, samples, 'Milíř');
    if (!ground.ok) return { ...ground, ...none };
  }
  const free = checkFootprintFree(landscape, village, footprints, true);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (footprints.some((f) => outcropUnder(obstacles, status, f))) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesOf(obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, footprints);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  const clearings = freeDwellingClearings(type, position, craft);
  const clearingTiles = clearings.flatMap((c) => cellsUnderPolygon(landscape, c));
  const groves = grovesOfTiles(sites, clearingTiles);
  const tally = polygonsObstacles(
    obstacles,
    status,
    clearings,
    new Set([
      ...occupiedCells(landscape, village),
      ...cemeteryCells(landscape, village),
      ...orchardCells(landscape, village),
      ...clearingTiles.filter((tile) => sites.groveByTile.has(tile)),
    ]),
    sites.protectedTrees,
  );
  const oaks = clearings.flatMap((c) => sacredOaksNear(sites, obstacles, c, 0));
  const spared = sparedSacred([...new Map(oaks.map((o) => [o.id, o])).values()], groves);
  const takenLand = takenLandUnder(landscape, village, clearings);
  const warning = joinWarnings(
    nearCemeteryWarning(landscape, village, position).warning,
    sparedWarning(spared),
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    ok: true,
    reason: null,
    ...(warning ? { warning } : {}),
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    spared,
    takenLand,
  };
}

/** Kontrola pozemku obydlí – navíc poloha domu na něm (null, když pozemek neprošel). */
export interface PlotPlacementCheck extends DwellingPlacementCheck {
  position: Position | null;
}

/**
 * Smí obydlí stát na pozemku `plot` (population.md – Umístění obydlí, Martin 18. 10. 2026)?
 * Pozemek je celé políčko krajiny jako čtverec pole: louka (ne voda, zatím ani les), bez
 * skalního výchozu, nezabrané hřbitovem, jiným pozemkem ani obydlím; dům stojí uprostřed nebo
 * v rohu podle varianty a pod jeho půdorysem musí být dost rovná zem (≤ 0,5 m). Na pozemku
 * nesmí být posvátný dub ani čtverec háje a dům nestojí pod korunou dubu ze sousedního políčka
 * (happiness.md – jako u obydlí), takže vesničané nemusí nic nechat stát. Překážky platí jako
 * u čtverce pole – všechny kusy na políčku (cena po kusech, dospělé stromy nevyhrazené jinou
 * stavbou dají klády). Blíž hřbitovu než 150 m jen varuje.
 *
 * Pozemek smí na čtverec pole i sadu (population.md – Obydlí na poli a v sadu): čtverec z pole či
 * sadu zmizí (`takenLand` – celé políčko, varování „Pole se zmenší“ / „Pole zanikne“) a jeho
 * překážky pozemek neplatí – patří poli a sadu. `takeLand: false` (přestavba obyvatel na novém
 * pozemku – ti pole ani sad nezaberou) čtverce polí a sadů nepovolí.
 */
export function checkPlotPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  plot: DwellingPlot,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  options: { takeLand?: boolean } = {},
): PlotPlacementCheck {
  const takeLand = options.takeLand ?? true;
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    spared: NO_SPARED,
    takenLand: [],
    position: null,
  };
  if (!PLOT_TYPES[type]) return { ...fail('Tohle obydlí se staví bez pozemku.'), ...none };
  const { cell } = plot;
  if (!PLOT_VARIANTS.includes(plot.variant)) {
    return { ...fail('Neplatné místo domu na pozemku.'), ...none };
  }
  const where = plotCellProblem(landscape, cell);
  if (where) return { ...fail(where), ...none };
  const position = plotHousePosition(landscape, plot);
  const terrain = checkFootprintTerrain(landscape, footprintSamples(type, position));
  if (!terrain.ok) return { ...terrain, ...none };
  const sites = sacredSitesOf(obstacles);
  const taken = plotSquareProblem(landscape, village, cell, obstacles, sites, takeLand);
  if (taken) return { ...fail(taken), ...none };
  const house = sacredUnder(landscape, obstacles, sites, [dwellingFootprint(type, position)]);
  if (house) return { ...fail(house), ...none };
  const takenLand = takeLand ? takenPlotLand(landscape, village, cell) : [];
  const tally = plotClearing(landscape, village, cell, obstacles, sites, takenLand.length > 0);
  const warning = joinWarnings(
    nearCemeteryWarning(landscape, village, position).warning,
    takenLandWarning(landscape, village, takenLand),
  );
  return {
    ok: true,
    reason: null,
    ...(warning ? { warning } : {}),
    ...tally,
    takenLand,
    position,
  };
}

/** Políčko pozemku v krajině a na louce (ne voda, zatím ani les)? Důvod česky, nebo null. */
function plotCellProblem(landscape: Landscape, cell: TileCell): string | null {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return 'Neplatné políčko pozemku.';
  if (cell.x < 0 || cell.y < 0 || cell.x >= landscape.size || cell.y >= landscape.size) {
    return 'Pozemek musí ležet uvnitř krajiny sídla.';
  }
  const surface = surfaceAt(landscape, cell.x, cell.y);
  if (surface === 'water') return 'Pozemek nemůže ležet ve vodě.';
  if (surface !== 'meadow') return 'Pozemek jde zatím jen na louku.';
  return null;
}

/**
 * Zabírá políčko pozemku něco jiného – hřbitov, obydlí či pozemek, modla, svatyně, bez
 * `takeLand` i pole a sad – nebo je na něm skalní výchoz, posvátný dub či čtverec háje? Důvod
 * česky, nebo null.
 */
function plotSquareProblem(
  landscape: Landscape,
  village: PlacementVillage | null,
  cell: TileCell,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  takeLand: boolean,
): string | null {
  const square = cellCorners(landscape, cell);
  const free = checkFootprintFree(landscape, village, [square], takeLand);
  if (!free.ok) return free.reason;
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, square)) {
    return 'Na pozemku je skalní výchoz – ten osadníci neodstraní.';
  }
  const index = cellIndex(landscape, cell);
  if (sites.groveByTile.has(index)) {
    return 'Na pozemku roste posvátný dubový háj – ten vesničané nevykácejí.';
  }
  if (sacredOaksInTile(sites, index).length > 0) {
    return 'Na pozemku stojí posvátný dub – ten vesničané nepokácí.';
  }
  return null;
}

/**
 * Překážky na políčku pozemku jako u čtverce pole – všechny kusy kromě posvátných stromů (cena
 * po kusech, dospělé stromy nevyhrazené jinou stavbou dají klády). Na pozemku posvátné místo
 * být nesmí, takže není co nechat stát (`spared` prázdné). Políčko pole nebo sadu (`cropLand`)
 * pozemek nevyklízí – překážky patří poli a sadu (založený díl a vysazený čtverec je už nemají).
 */
function plotClearing(
  landscape: Landscape,
  village: PlacementVillage | null,
  cell: TileCell,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  cropLand = false,
): Omit<DwellingPlacementCheck, keyof PlacementCheck | 'takenLand'> {
  if (cropLand) {
    return {
      obstacleCost: 0,
      obstacleIds: [],
      clearedTrees: 0,
      obstacleCounts: {},
      spared: NO_SPARED,
    };
  }
  const status = obstacleStatus(village?.obstacleChanges);
  const tally = cellObstacles(obstacles, status, cell, sites.protectedTrees);
  return {
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    spared: NO_SPARED,
  };
}

/** Kontrola ohrady (oxen.md) – cena překážek a střed čtverce (prošlá kontrola). */
export interface PenPlacementCheck extends PlacementCheck {
  obstacleCost: number;
  obstacleIds: number[];
  clearedTrees: number;
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
}

/**
 * Smí na políčku `cell` stát ohrada s přístřeškem (oxen.md – stavba po čtvercích jako pozemek
 * polozemnice)? Celé políčko louky (ne voda, zatím ani les), bez skalního výchozu, posvátného dubu
 * a háje, nezabrané polem, hřbitovem, sadem, obydlím, pozemkem, jinou ohradou ani modlou. Překážky
 * platí jako u čtverce pole – všechny kusy na políčku (dospělé stromy nevyhrazené jinou stavbou
 * dají klády).
 */
export function checkPenPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  cell: TileCell,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): PenPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    x: 0,
    z: 0,
  };
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    return { ...fail('Neplatné políčko ohrady.'), ...none };
  }
  if (cell.x < 0 || cell.y < 0 || cell.x >= landscape.size || cell.y >= landscape.size) {
    return { ...fail('Ohrada musí ležet uvnitř krajiny sídla.'), ...none };
  }
  const surface = surfaceAt(landscape, cell.x, cell.y);
  if (surface === 'water') return { ...fail('Ohrada nemůže stát ve vodě.'), ...none };
  if (surface !== 'meadow') return { ...fail('Ohrada jde zatím jen na louku.'), ...none };
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  const square = cellCorners(landscape, cell);
  const free = checkFootprintFree(landscape, village, [square]);
  if (!free.ok) return { ...free, ...none, x: center.x, z: center.z };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, square)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesOf(obstacles);
  const index = cellIndex(landscape, cell);
  if (sites.groveByTile.has(index)) {
    return { ...fail('Roste tu posvátný dubový háj – ten vesničané nevykácejí.'), ...none };
  }
  if (sacredOaksInTile(sites, index).length > 0) {
    return { ...fail('Stojí tu posvátný dub – ten vesničané nepokácí.'), ...none };
  }
  const tally = cellObstacles(obstacles, status, cell, sites.protectedTrees);
  return {
    ...OK,
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    x: center.x,
    z: center.z,
  };
}

/**
 * Smí políčko `cell` dostat starší polozemnice, která na něm už stojí (převod starých vsí,
 * `withPlots`)? Jako u nového pozemku: louka, nic jiného ho nezabírá (obydlí samo se do `village`
 * nedává), bez výchozu a posvátných míst – rovnost pod domem se nehlídá, dům už stojí. Vrátí
 * překážky na políčku, nebo důvod, proč ne.
 */
export function existingPlotSquare(
  landscape: Landscape,
  village: PlacementVillage,
  cell: TileCell,
  obstacles: ObstacleLayer,
): PlacementCheck & Partial<Omit<DwellingPlacementCheck, keyof PlacementCheck>> {
  const sites = sacredSitesOf(obstacles);
  const problem =
    plotCellProblem(landscape, cell) ??
    plotSquareProblem(landscape, village, cell, obstacles, sites, false);
  if (problem) return fail(problem);
  return { ...OK, ...plotClearing(landscape, village, cell, obstacles, sites) };
}

/**
 * Brání stavbě s půdorysem `plot` posvátné místo? Háj se nekácí (žádný čtverec háje pod
 * půdorysem) a pod korunou posvátného dubu se nestaví (kmen blíž než SACRED_OAK_RADIUS_M).
 * Vrací důvod česky, nebo null.
 */
function sacredUnder(
  landscape: Landscape,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  plot: readonly (readonly Point[])[],
): string | null {
  const tiles = plot.flatMap((polygon) => cellsUnderPolygon(landscape, polygon));
  if (tiles.some((tile) => sites.groveByTile.has(tile))) {
    return 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.';
  }
  if (
    plot.some((polygon) => sacredOaksNear(sites, obstacles, polygon, SACRED_OAK_RADIUS_M).length)
  ) {
    return 'Stojí tu posvátný dub – ten vesničané nepokácí.';
  }
  return null;
}

/** Kolik z dospělých stromů `treeIds` nevyhradila žádná stavba (ty dají klády z mýcení). */
function unreservedTrees(village: PlacementVillage | null, treeIds: readonly number[]): number {
  const reserved = new Set(village?.reservedTrees ?? []);
  return treeIds.filter((id) => !reserved.has(id)).length;
}

/**
 * Ves pro kontrolu umístění na serveru – stav vsi se změnami překážek v den `day` a stromy
 * vyhrazenými stavbami.
 */
export function placementVillageOf(state: VillageState, day: number): PlacementVillage {
  return {
    ...state,
    obstacleChanges: obstacleChangesAt(state, day),
    reservedTrees: [...reservedTrees(state)],
    sacredBuildings: sacredBuildingPlots(state),
    toolCoverage: craftCoverage(state, day).tools,
    walkRoads: state.roads?.roads ?? [],
  };
}

/**
 * Chůze ke stromům ke kácení po pevných cestách vsi s půdou krajiny (roads.md) – stejná na
 * serveru (`villageRoadWalk`) i u kurzoru v prohlížeči.
 */
export function placementWalk(landscape: Landscape, village: PlacementVillage | null): Walk {
  return roadWalk(village?.walkRoads ?? [], walkGroundOf(landscape));
}

/** Polohy obydlí vsi včetně rozestavěných – od nich se měří vzdálenost dílů pole. */
export function villageDwellingPositions(village: PlacementVillage | null): Position[] {
  if (village === null) return [];
  const built = village.dwellings.map((d) => d.position);
  const planned = village.constructions.flatMap((c) =>
    c.dwellingType !== null && c.position !== null ? [c.position] : [],
  );
  return [...built, ...planned];
}

type CellsShape = { ok: true; cells: TileCell[] } | { ok: false; reason: string };

/** Co se staví po čtvercích – název v 1. a 2. pádě a nejvíc čtverců. */
interface SquaresKind {
  nominative: string;
  genitive: string;
  maxCells: number;
}
const FIELD_KIND: SquaresKind = { nominative: 'Pole', genitive: 'pole', maxCells: MAX_FIELD_CELLS };
const ORCHARD_KIND: SquaresKind = {
  nominative: 'Sad',
  genitive: 'sadu',
  maxCells: MAX_ORCHARD_CELLS,
};
const CEMETERY_KIND: SquaresKind = {
  nominative: 'Hřbitov',
  genitive: 'hřbitova',
  maxCells: MAX_CEMETERY_CELLS,
};

/** Čtverce jako celá čísla uvnitř krajiny, bez opakování, seřazené po řádcích (y, pak x). */
function normalizeCells(
  landscape: Landscape,
  cells: readonly TileCell[],
  kind: SquaresKind,
): CellsShape {
  if (!cells.every((c) => Number.isInteger(c.x) && Number.isInteger(c.y))) {
    return { ok: false, reason: `Neplatné čtverce ${kind.genitive}.` };
  }
  if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= landscape.size || c.y >= landscape.size)) {
    return { ok: false, reason: `${kind.nominative} musí ležet uvnitř krajiny sídla.` };
  }
  const byIndex = new Map<number, TileCell>();
  for (const c of cells) byIndex.set(cellIndex(landscape, c), { x: c.x, y: c.y });
  if (byIndex.size === 0)
    return { ok: false, reason: `Vyber aspoň jeden čtverec ${kind.genitive}.` };
  if (byIndex.size > kind.maxCells) {
    return {
      ok: false,
      reason: `${kind.nominative} může mít nejvýš ${formatInteger(kind.maxCells)} čtverců.`,
    };
  }
  const sorted = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, cell]) => cell);
  return { ok: true, cells: sorted };
}

/** Čtverce tvoří jednu skupinu, ve které sousedí stranou (4-souvislost). */
function isConnected(landscape: Landscape, cells: readonly TileCell[]): boolean {
  const first = cells[0];
  if (!first) return true;
  const remaining = new Set(cells.map((c) => cellIndex(landscape, c)));
  const stack = [first];
  remaining.delete(cellIndex(landscape, first));
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: x + dx, y: y + dy };
      const index = cellIndex(landscape, next);
      if (next.x < 0 || next.x >= landscape.size || !remaining.has(index)) continue;
      remaining.delete(index);
      stack.push(next);
    }
  }
  return remaining.size === 0;
}

/** Vzdálenost středu políčka k nejbližšímu obydlí (bez obydlí nekonečno). */
function distanceToNearest(landscape: Landscape, cell: TileCell, positions: Position[]): number {
  const c = tileCenterWorld(landscape, cell.x, cell.y);
  return positions.reduce((best, p) => Math.min(best, Math.hypot(p.x - c.x, p.z - c.z)), Infinity);
}

/**
 * Políčka pod obydlími vsi i plánovanými a jejich pozemky (plánované obydlí bez typu – první –
 * je zemnice).
 */
function dwellingCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): Set<number> {
  const footprints = [
    ...(village?.dwellings.flatMap((d) => dwellingPlot(landscape, placedDwelling(d))) ?? []),
    ...(village?.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null
        ? dwellingPlot(landscape, {
            type: c.dwellingType,
            position: c.position,
            ...(c.plot ? { plot: c.plot } : {}),
            ...(c.craft ? { craft: c.craft } : {}),
          })
        : [],
    ) ?? []),
    ...dwellingPositions.map((p) => dwellingFootprint('zemnice', p)),
  ];
  return new Set(footprints.flatMap((f) => cellsUnderPolygon(landscape, f)));
}

/** Co brání čtverci stavby: voda, les, obydlí, pole, pohřebiště, sad, ohrada, modla, svatyně. */
interface SquareFlags {
  water: boolean;
  forest: boolean;
  dwelling: boolean;
  field: boolean;
  cemetery: boolean;
  orchard: boolean;
  pen: boolean;
  sacred: boolean;
}

/** Políčka pod modlami a svatyněmi vsi (i rozestavěnými). */
function sacredBuildingCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  return new Set(
    (village?.sacredBuildings ?? []).flatMap((b) =>
      cellsUnderPolygon(landscape, sacredFootprint(b.kind, b.position)),
    ),
  );
}

/** Kontrola jednotlivých čtverců proti krajině a vsi (zabraná políčka se spočítají jednou). */
function squareFlags(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): (cell: TileCell) => SquareFlags {
  const fields = occupiedCells(landscape, village);
  const cemeteries = cemeteryCells(landscape, village);
  const orchards = orchardCells(landscape, village);
  const pens = penCells(landscape, village);
  const woods = woodCells(landscape, village);
  const underDwellings = dwellingCells(landscape, village, dwellingPositions);
  const underSacred = sacredBuildingCells(landscape, village);
  return (cell) => {
    const index = cellIndex(landscape, cell);
    const surface = surfaceAt(landscape, cell.x, cell.y);
    return {
      water: surface === 'water',
      // les krajiny i les vsi (fields.md – Les vsi)
      forest: surface === 'forest' || woods.has(index),
      dwelling: underDwellings.has(index),
      field: fields.has(index),
      cemetery: cemeteries.has(index),
      orchard: orchards.has(index),
      pen: pens.has(index),
      sacred: underSacred.has(index),
    };
  };
}

/** Políčka vody krajiny (indexy) – spočítají se jednou pro každou krajinu. */
const waterTilesCache = new WeakMap<Landscape, Int32Array>();

function waterTiles(landscape: Landscape): Int32Array {
  let tiles = waterTilesCache.get(landscape);
  if (!tiles) {
    const list: number[] = [];
    for (let y = 0; y < landscape.size; y++) {
      for (let x = 0; x < landscape.size; x++) {
        if (surfaceAt(landscape, x, y) === 'water') list.push(y * landscape.size + x);
      }
    }
    tiles = Int32Array.from(list);
    waterTilesCache.set(landscape, tiles);
  }
  return tiles;
}

/**
 * Vzdálenost čtverce (políčka) od nejbližší vody v m – mezi okraji políček, sousední políčko
 * vody 0. Krajina bez vody: dvojnásobek strany krajiny (konečné číslo – ukládá se do JSON).
 */
export function waterDistanceM(landscape: Landscape, cell: TileCell): number {
  let best = Infinity;
  for (const index of waterTiles(landscape)) {
    const dx = Math.max(0, Math.abs((index % landscape.size) - cell.x) - 1);
    const dy = Math.max(0, Math.abs(Math.floor(index / landscape.size) - cell.y) - 1);
    best = Math.min(best, Math.hypot(dx, dy) * landscape.cellSizeM);
  }
  return Number.isFinite(best) ? best : 2 * landscape.size * landscape.cellSizeM;
}

/** Čtverec stavby po čtvercích (pole, sad) – povrch, plocha bez skalních výchozů a překážky. */
interface BuildSquare {
  cell: TileCell;
  /** Index políčka v krajině (y × size + x). */
  index: number;
  /** Povrch při založení – sad jen louka, pole i křoviny a les (`fieldSquareSurface`). */
  surface: FieldSurface;
  areaM2: number;
  /** Od středu políčka k nejbližšímu obydlí. */
  distanceM: number;
  tally: ObstacleTally;
  /** Práce navíc za překážky, které nejsou v sazbě povrchu (`tallyCost`). */
  obstacleCost: number;
}

/** Posvátná místa ve výběru čtverců: čtverce hájů se vyjmou, posvátné duby zůstanou stát. */
interface SacredSelection {
  /** Výběr bez čtverců hájů. */
  cells: TileCell[];
  /** Čtverce hájů a čtverce s posvátným dubem (oranžově v náhledu). */
  sacredCells: TileCell[];
  /** Háje, kterých se výběr dotkl, a posvátné duby na zbylých čtvercích. */
  spared: SparedSacred;
}

/** Rozdělí výběr čtverců podle posvátných míst vrstvy (happiness.md). */
function sacredSelection(
  landscape: Landscape,
  sites: SacredSites,
  cells: readonly TileCell[],
): SacredSelection {
  const kept: TileCell[] = [];
  const sacredCells: TileCell[] = [];
  const groveTiles: number[] = [];
  const oaks = [];
  for (const cell of cells) {
    const index = cellIndex(landscape, cell);
    if (sites.groveByTile.has(index)) {
      groveTiles.push(index);
      sacredCells.push(cell);
      continue;
    }
    kept.push(cell);
    const here = sacredOaksInTile(sites, index);
    if (here.length > 0) sacredCells.push(cell);
    oaks.push(...here);
  }
  return {
    cells: kept,
    sacredCells,
    spared: sparedSacred(
      [...oaks].sort((a, b) => a.id - b.id),
      grovesOfTiles(sites, groveTiles),
    ),
  };
}

/**
 * Společná kontrola čtverců pole a sadu (staví se stejně – orchard.md): u každého čtverce, co mu
 * brání (voda, obydlí, pole, hřbitov, sad, modla, svatyně, dál než 800 m; sadu i les – zakázané
 * čtverce do náhledu), a čtverce, kde stavba smí stát – sad jen louka, pole i křoviny a les
 * (`fieldSurfaces`) – s povrchem, plochou bez skalních výchozů (nejvýš MAX_OUTCROP_SHARE
 * čtverce) a bez plochy pod korunou posvátných dubů, vzdáleností k nejbližšímu
 * z `dwellingPositions` a překážkami z vrstvy bez toho, co ves už odstranila. Posvátný dub
 * zůstane stát (nepočítá se mezi překážky), čtverce hájů se z výběru vyjmou (happiness.md).
 */
function buildSquares(
  landscape: Landscape,
  village: PlacementVillage | null,
  selected: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer,
  fieldSurfaces: boolean,
): {
  squares: BuildSquare[];
  problems: SquareFlags & { far: boolean };
  blockedCells: TileCell[];
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  sacred: SacredSelection;
} {
  const status = obstacleStatus(village?.obstacleChanges);
  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const woods = woodCells(landscape, village);
  const sites = sacredSitesOf(obstacles);
  const sacred = sacredSelection(landscape, sites, selected);
  const cells = sacred.cells;
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const problems: SquareFlags & { far: boolean } = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    orchard: false,
    pen: false,
    sacred: false,
    far: false,
  };
  const squares: BuildSquare[] = [];
  const blockedCells: TileCell[] = [];
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};
  for (const cell of cells) {
    const distanceM = distanceToNearest(landscape, cell, dwellingPositions);
    const flags = { ...flagsOf(cell), far: distanceM > FIELD_LIMITS.maxDistanceM };
    // pole smí i do lesa (fields.md – Založení pole), sad jen na louku
    if (fieldSurfaces) flags.forest = false;
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    const index = cellIndex(landscape, cell);
    // les vsi se mýtí jako les krajiny – stromy lesa jsou mezi překážkami (fields.md – Les vsi)
    const land = woods.has(index) ? 'forest' : surfaceAt(landscape, cell.x, cell.y);
    if (land === 'water' || (!fieldSurfaces && land !== 'meadow')) continue;
    // posvátný dub zůstane stát – není mezi překážkami a plocha pod korunou se nepočítá
    const tally = cellObstacles(obstacles, status, cell, sites.protectedTrees);
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
    const surface: FieldSurface = fieldSurfaces
      ? (fieldSquareSurface(land, tally.counts.shrub ?? 0, cellArea, village?.toolCoverage ?? 0) ??
        'meadow')
      : 'meadow';
    const unusable =
      tally.outcropAreaM2 + sacredOaksInTile(sites, index).length * SACRED_OAK.crownM2;
    squares.push({
      cell,
      index,
      surface,
      areaM2: cellArea - Math.min(unusable, cellArea * MAX_OUTCROP_SHARE),
      distanceM,
      tally,
      obstacleCost: tallyCost(tally, SURFACE_INCLUDED_OBSTACLES[surface]),
    });
  }
  return { squares, problems, blockedCells, obstacleCounts, sacred };
}

/** Políčka lesa krajiny (indexy) – spočítají se jednou pro každou krajinu. */
const forestTilesCache = new WeakMap<Landscape, Int32Array>();

function forestTiles(landscape: Landscape): Int32Array {
  let tiles = forestTilesCache.get(landscape);
  if (!tiles) {
    const list: number[] = [];
    for (let y = 0; y < landscape.size; y++) {
      for (let x = 0; x < landscape.size; x++) {
        if (surfaceAt(landscape, x, y) === 'forest') list.push(y * landscape.size + x);
      }
    }
    tiles = Int32Array.from(list);
    forestTilesCache.set(landscape, tiles);
  }
  return tiles;
}

/**
 * Vzdálenost bodu světa k nejbližšímu okraji lesa v m – k nejbližšímu políčku lesa, v lese 0
 * (forest.md – Palivo). Krajina bez lesa: dvojnásobek strany krajiny (konečné číslo – ukládá se
 * do JSON).
 */
export function forestEdgeDistanceM(landscape: Landscape, x: number, z: number): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const size = landscape.cellSizeM;
  let best = Infinity;
  for (const index of forestTiles(landscape)) {
    const minX = (index % landscape.size) * size - half;
    const minZ = Math.floor(index / landscape.size) * size - half;
    const dx = Math.max(0, minX - x, x - (minX + size));
    const dz = Math.max(0, minZ - z, z - (minZ + size));
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return Number.isFinite(best) ? best : 2 * landscape.size * landscape.cellSizeM;
}

/**
 * Ves z doby před palivem (obydlí a stavby obydlí bez `forestDistanceM`): doplní vzdálenost
 * k okraji lesa z krajiny. Ves, které nic nechybí, vrací beze změny.
 */
export function withForestDistances(state: VillageState, landscape: Landscape): VillageState {
  const missing =
    state.dwellings.some((d) => d.forestDistanceM === undefined) ||
    state.constructions.some(
      (c) => c.kind === 'dwelling' && c.position !== null && c.forestDistanceM === undefined,
    );
  if (!missing) return state;
  const next = structuredClone(state);
  for (const d of next.dwellings) {
    d.forestDistanceM ??= forestEdgeDistanceM(landscape, d.position.x, d.position.z);
  }
  for (const c of next.constructions) {
    if (c.kind !== 'dwelling' || c.position === null) continue;
    c.forestDistanceM ??= forestEdgeDistanceM(landscape, c.position.x, c.position.z);
  }
  return next;
}

/**
 * Louka a les (ha) do LIVESTOCK.reachM od bodu (x, z) – pastva a žaludy dobytka (diet.md).
 * Políčka se počítají celá podle středu.
 */
export function livestockLandAt(
  landscape: Landscape,
  x: number,
  z: number,
): { meadowHa: number; forestHa: number } {
  const cellHa = (landscape.cellSizeM * landscape.cellSizeM) / M2_PER_HA;
  const reach2 = LIVESTOCK.reachM * LIVESTOCK.reachM;
  let meadow = 0;
  let forest = 0;
  for (let y = 0; y < landscape.size; y++) {
    for (let cx = 0; cx < landscape.size; cx++) {
      const center = tileCenterWorld(landscape, cx, y);
      const dx = center.x - x;
      const dz = center.z - z;
      if (dx * dx + dz * dz > reach2) continue;
      const surface = surfaceAt(landscape, cx, y);
      if (surface === 'meadow') meadow++;
      else if (surface === 'forest') forest++;
    }
  }
  return { meadowHa: meadow * cellHa, forestHa: forest * cellHa };
}

/**
 * Doplní vsi uložené před dobytkem výchozí stádo a krajinu pro pastvu (louka a les do 600 m od
 * první zemnice nebo jejího staveniště – `livestockLandAt`). Nic nechybí – vrátí týž stav.
 */
export function withLivestockLand(state: VillageState, landscape: Landscape): VillageState {
  if (state.livestock?.land) return state;
  const origin =
    state.dwellings[0]?.position ??
    state.constructions.find((c) => c.kind === 'dwelling' && c.position !== null)?.position;
  if (!origin) return state;
  return withLivestock(state, livestockLandAt(landscape, origin.x, origin.z));
}

/** Stromy dílu nebo čtverce pro klády z mýcení – bez stromů se údaj vynechá. */
function withTrees(trees: number): { trees?: number } {
  return trees > 0 ? { trees } : {};
}

/**
 * Pole ze čtverců – políček krajiny (15 × 15 m, díl = celé políčko). Díly na louce, v křovinách
 * i v lese (fields.md – Založení pole, Martin); povrch dílu určí `fieldSquareSurface` a cenu
 * založení sazba povrchu za hektar. Překážky na čtverci (pata v políčku, z vrstvy `obstacles`
 * bez toho, co ves už odstranila) osadníci odstraní, až díl založí; po kusech zvednou cenu jen
 * ty, které nejsou v sazbě povrchu (v lese jsou stromy a podrost v ceně, v křovinách keře).
 * Dospělé stromy, které nevyhradila stavba, dají po založení klády (forest.md). Skalní výchoz
 * zůstane a plocha pod ním se do dílu nepočítá. Vzdálenost dílu = od středu políčka
 * k nejbližšímu z `dwellingPositions`. Kontrola v tomto pořadí: platné čtverce v krajině, ne
 * voda, nepřekrývá obydlí, jiná pole, pohřebiště ani sady, žádný díl dál než 800 m, čtverce
 * sousedí stranou v jednom celku, aspoň 0,1 ha. Náhled (díly, výměra, zakázané čtverce…) se
 * počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function fieldPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): FieldPreview {
  const shape = normalizeCells(landscape, cells, FIELD_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      parts: [],
      areaM2: 0,
      averageFertility: 0,
      foundingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      surfaceCounts: {},
      clearedTrees: 0,
      blockedCells: [],
      joinedFields: [],
      sacredCells: [],
      spared: NO_SPARED,
      check: fail(shape.reason),
    };
  }
  const { squares, problems, blockedCells, obstacleCounts, sacred } = buildSquares(
    landscape,
    village,
    shape.cells,
    dwellingPositions,
    obstacles,
    true,
  );
  const surfaceCounts: Partial<Record<FieldSurface, number>> = {};
  const parts: PartInput[] = squares.map((square) => {
    surfaceCounts[square.surface] = (surfaceCounts[square.surface] ?? 0) + 1;
    return {
      areaM2: square.areaM2,
      distanceM: square.distanceM,
      naturalFertility: landscape.fertility[square.index]!,
      surface: square.surface,
      obstacleCost: square.obstacleCost,
      ...(square.tally.ids.length > 0 ? { obstacleIds: square.tally.ids } : {}),
      ...withTrees(unreservedTrees(village, square.tally.treeIds)),
      cell: square.cell,
    };
  });

  const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const averageFertility =
    areaM2 > 0 ? parts.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2 : 0;
  const foundingCost = parts.reduce(
    (sum, p) =>
      sum + partFoundingCost(p.surface, p.areaM2, p.obstacleCost, village?.toolCoverage ?? 0),
    0,
  );
  const obstacleCost = parts.reduce((sum, p) => sum + p.obstacleCost, 0);
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const minCells = Math.ceil(FIELD_LIMITS.minAreaM2 / cellArea);
  // čtverce navazující na pole ho rozšíří (víc polí sloučí) – nejmenší výměru má mít pole celé
  const joinedFields = fieldsTouching(village?.parts ?? [], shape.cells);
  const joined = new Set(joinedFields);
  const joinedAreaM2 = (village?.parts ?? [])
    .filter((p) => p.fieldId !== undefined && joined.has(p.fieldId))
    .reduce((sum, p) => sum + (p.areaM2 ?? cellArea), 0);
  const checks: [boolean, () => string][] = [
    [problems.water, () => 'Pole nesmí zasahovat do vody.'],
    [problems.dwelling, () => 'Pole se překrývá s obydlím.'],
    [problems.field, () => 'Pole se překrývá s jiným polem.'],
    [problems.cemetery, () => 'Pole se překrývá s hřbitovem.'],
    [problems.orchard, () => 'Pole se překrývá se sadem.'],
    [problems.pen, () => 'Pole se překrývá s ohradou.'],
    [problems.sacred, () => 'Pole se překrývá s posvátným místem.'],
    [problems.far, () => `Pole je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`],
    [sacred.cells.length === 0, () => 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.'],
    [
      !isConnected(landscape, shape.cells),
      () => 'Čtverce pole musí tvořit jeden celek – sousedit stranou.',
    ],
    [
      areaM2 + joinedAreaM2 < FIELD_LIMITS.minAreaM2,
      () =>
        `Pole musí mít aspoň ${formatNumber(FIELD_LIMITS.minAreaM2 / M2_PER_HA, 1)} ha, ` +
        `tedy ${minCells} čtverců (teď ${shape.cells.length}).`,
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    parts,
    areaM2,
    averageFertility,
    foundingCost,
    obstacleCost,
    obstacleCounts,
    surfaceCounts,
    clearedTrees: parts.reduce((sum, p) => sum + (p.trees ?? 0), 0),
    blockedCells,
    joinedFields,
    sacredCells: sacred.sacredCells,
    spared: sacred.spared,
    check: failed ? fail(failed[1]()) : withWarning(sparedWarning(sacred.spared)),
  };
}

/** Prošlá kontrola s varováním (bez varování OK). */
function withWarning(warning: string | undefined): PlacementCheck {
  return warning ? { ok: true, reason: null, warning } : OK;
}

/**
 * Sad ze čtverců – políček krajiny (orchard.md – Stavba): staví se stejně jako pole (Martin) –
 * čtverce jen na louce, do 800 m od nejbližšího obydlí, souvislé, ne na obydlí, poli, hřbitově
 * ani jiném sadu. Překážky na čtverci zvednou cenu výsadby podle tabulky ve fields.md
 * a osadníci je odstraní, až čtverec vysadí; skalní výchoz zůstane a stromy ho obejdou (plocha
 * pod ním se nepočítá). Na rozdíl od pole nemá nejmenší výměru – sadem může být i jeden čtverec.
 * Náhled se počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function orchardPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): OrchardPreview {
  const shape = normalizeCells(landscape, cells, ORCHARD_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      areaM2: 0,
      plantingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      blockedCells: [],
      sacredCells: [],
      spared: NO_SPARED,
      check: fail(shape.reason),
    };
  }
  const meadow = buildSquares(landscape, village, shape.cells, dwellingPositions, obstacles, false);
  const { problems, blockedCells, obstacleCounts, sacred } = meadow;
  const squares: OrchardSquareInput[] = meadow.squares.map((square) => ({
    cell: square.cell,
    areaM2: square.areaM2,
    distanceM: square.distanceM,
    obstacleCost: square.obstacleCost,
    ...(square.tally.ids.length > 0 ? { obstacleIds: square.tally.ids } : {}),
    ...withTrees(unreservedTrees(village, square.tally.treeIds)),
  }));
  const checks: [boolean, string][] = [
    [problems.water, 'Sad nesmí zasahovat do vody.'],
    [problems.forest, 'Sad jde zakládat jen na louce.'],
    [problems.dwelling, 'Sad se překrývá s obydlím.'],
    [problems.field, 'Sad se překrývá s polem.'],
    [problems.cemetery, 'Sad se překrývá s hřbitovem.'],
    [problems.orchard, 'Sad se překrývá s jiným sadem.'],
    [problems.pen, 'Sad se překrývá s ohradou.'],
    [problems.sacred, 'Sad se překrývá s posvátným místem.'],
    [problems.far, `Sad je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`],
    [sacred.cells.length === 0, 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.'],
    [
      !isConnected(landscape, shape.cells),
      'Čtverce sadu musí tvořit jeden celek – sousedit stranou.',
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    squares,
    areaM2: squares.reduce((sum, s) => sum + s.areaM2, 0),
    plantingCost: squares.reduce(
      (sum, s) => sum + orchardPlantingCost(s.areaM2, s.obstacleCost),
      0,
    ),
    obstacleCost: squares.reduce((sum, s) => sum + s.obstacleCost, 0),
    obstacleCounts,
    blockedCells,
    sacredCells: sacred.sacredCells,
    spared: sacred.spared,
    check: failed ? fail(failed[1]) : withWarning(sparedWarning(sacred.spared)),
  };
}

/** Varování u kurzoru, když je hřbitov blíž obydlí nebo vodě, než je v pořádku (řádek na každé). */
function cemeteryWarning(dwellingM: number, waterM: number): string | undefined {
  const lines = [
    dwellingM < CEMETERY_DISTANCE_M.dwelling.ok
      ? `Blízko obydlí (${wholeMeters(dwellingM)})`
      : null,
    waterM < CEMETERY_DISTANCE_M.water.ok ? `Blízko vody (${wholeMeters(waterM)})` : null,
  ].filter((line) => line !== null);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Hřbitov ze čtverců – políček krajiny (cemetery.md – Stavba). Čtverce jen na louce (les
 * zatím ne – pole už ano). Čtverce, které stranou navazují na hřbitov, ho rozšíří
 * (`extendsCemetery`). Překážky na čtverci (pata v políčku, z vrstvy `obstacles` bez toho, co
 * ves už odstranila) zvednou cenu čtverce podle tabulky ve fields.md a osadníci je odstraní, až
 * hřbitov (rozšíření) dostaví – jako u dílu pole. Skalní výchoz se neodstraní a hroby jdou na
 * čtverec v pevné mřížce (`CEMETERY.gravesPerSquare`), proto čtverec, do kterého výchoz
 * zasahuje, hřbitov mít nesmí. Kontrola v tomto pořadí: platné čtverce v krajině, ne voda, ne
 * les, nepřekrývá obydlí (i plánovaná z `dwellingPositions`), pole, hřbitov ani sad, žádný skalní
 * výchoz, navazuje nejvýš na jeden hřbitov, čtverce (i s rozšiřovaným hřbitovem) sousedí
 * stranou v jednom celku, celý hřbitov nejvýš MAX_CEMETERY_CELLS čtverců. Blízkost obydlí (pod
 * 150 m) a vody (pod 100 m) stavbu neblokuje – jen `check.warning` a `warningCells`. Náhled se
 * počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function cemeteryPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): CemeteryPreview {
  const shape = normalizeCells(landscape, cells, CEMETERY_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      capacity: 0,
      foundingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      extendsCemetery: false,
      blockedCells: [],
      warningCells: [],
      sacredCells: [],
      spared: NO_SPARED,
      check: fail(shape.reason),
    };
  }

  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const status = obstacleStatus(village?.obstacleChanges);
  const sites = sacredSitesOf(obstacles);
  // čtverce háje se z hřbitova vyjmou; hroby jdou v pevné mřížce, proto čtverec s posvátným
  // dubem hřbitov mít nesmí (jako výchoz) – dub zůstane stát
  const sacred = sacredSelection(landscape, sites, shape.cells);
  const size = landscape.cellSizeM;
  const problems: SquareFlags & { outcrop: boolean; oak: boolean } = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    orchard: false,
    pen: false,
    sacred: false,
    outcrop: false,
    oak: false,
  };
  const squares: CemeterySquareInput[] = [];
  const blockedCells: TileCell[] = [];
  const warningCells: TileCell[] = [];
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};
  let nearestDwellingM = Infinity;
  let nearestWaterM = Infinity;
  for (const cell of sacred.cells) {
    const flags = {
      ...flagsOf(cell),
      outcrop: outcropUnder(obstacles, status, cellCorners(landscape, cell)),
      oak: sacredOaksInTile(sites, cellIndex(landscape, cell)).length > 0,
    };
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    if (flags.water || flags.forest) continue;
    const tally = cellObstacles(obstacles, status, cell, sites.protectedTrees);
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
    const center = tileCenterWorld(landscape, cell.x, cell.y);
    const square = { cell, x: center.x, z: center.z };
    const water = waterDistanceM(landscape, cell);
    // stejná vzdálenost jako v simulaci (cemetery.ts) – od obydlí k okraji čtverce
    const dwelling = dwellingPositions.reduce(
      (min, p) => Math.min(min, distanceToSquare(p.x, p.z, square, size)),
      Infinity,
    );
    nearestDwellingM = Math.min(nearestDwellingM, dwelling);
    nearestWaterM = Math.min(nearestWaterM, water);
    if (dwelling < CEMETERY_DISTANCE_M.dwelling.ok || water < CEMETERY_DISTANCE_M.water.ok) {
      warningCells.push(cell);
    }
    squares.push({
      ...square,
      waterDistanceM: water,
      obstacleCost: tally.cost,
      ...(tally.ids.length > 0 ? { obstacleIds: tally.ids } : {}),
      ...withTrees(unreservedTrees(village, tally.treeIds)),
    });
  }

  const touching = touchingCemeteries(village?.cemeteries ?? [], shape.cells);
  const extended = touching.length === 1 ? touching[0]!.squares.map((s) => s.cell) : [];
  const checks: [boolean, string][] = [
    [problems.water, 'Hřbitov nesmí zasahovat do vody.'],
    [problems.forest, 'Hřbitov jde zatím zakládat jen na louce – mýcení lesa přijde později.'],
    [problems.dwelling, 'Hřbitov se překrývá s obydlím.'],
    [problems.field, 'Hřbitov se překrývá s polem.'],
    [problems.cemetery, 'Hřbitov se překrývá s jiným hřbitovem.'],
    [problems.orchard, 'Hřbitov se překrývá se sadem.'],
    [problems.pen, 'Hřbitov se překrývá s ohradou.'],
    [problems.sacred, 'Hřbitov se překrývá s posvátným místem.'],
    [problems.outcrop, 'Stojí tu skalní výchoz – ten osadníci neodstraní.'],
    [problems.oak, 'Stojí tu posvátný dub – mezi hroby ho vesničané nenechají.'],
    [sacred.cells.length === 0, 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.'],
    [touching.length > 1, 'Hřbitov smí navazovat jen na jeden hřbitov.'],
    [
      !isConnected(landscape, [...shape.cells, ...extended]),
      'Čtverce hřbitova musí tvořit jeden celek – sousedit stranou.',
    ],
    [
      shape.cells.length + extended.length > MAX_CEMETERY_CELLS,
      `Hřbitov může mít nejvýš ${formatInteger(MAX_CEMETERY_CELLS)} čtverců.`,
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  const groves: SparedSacred = { oaks: [], groves: sacred.spared.groves };
  const warning = [
    squares.length > 0 ? cemeteryWarning(nearestDwellingM, nearestWaterM) : undefined,
    sparedWarning(groves),
  ]
    .filter(Boolean)
    .join('\n');
  return {
    cells: shape.cells,
    squares,
    capacity: squares.length * CEMETERY.gravesPerSquare,
    foundingCost: cemeteryFoundingCost(squares),
    obstacleCost: squares.reduce((sum, s) => sum + s.obstacleCost, 0),
    obstacleCounts,
    extendsCemetery: touching.length === 1,
    blockedCells,
    warningCells,
    sacredCells: sacred.sacredCells.filter((c) => sites.groveByTile.has(cellIndex(landscape, c))),
    spared: groves,
    check: failed ? fail(failed[1]) : withWarning(warning || undefined),
  };
}

/** Názvy posvátných staveb (důvody kontroly umístění). */
const SACRED_NAMES: Record<SacredBuildingKind, string> = { idol: 'Modla', shrine: 'Svatyně' };

/** Půdorys modly nebo svatyně v krajině, na louce, a u svatyně dost rovný. */
function checkSacredTerrain(
  landscape: Landscape,
  kind: SacredBuildingKind,
  samples: readonly Point[],
): PlacementCheck {
  const name = SACRED_NAMES[kind];
  const limit = SACRED_BUILDINGS[kind].maxHeightDiffM;
  let lowest = Infinity;
  let highest = -Infinity;
  let offMeadow = false;
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return fail(`${name} musí stát uvnitř krajiny sídla.`);
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return fail(`${name} nemůže stát ve vodě.`);
    if (surface !== 'meadow') offMeadow = true;
    if (limit === null) continue;
    const height = heightAtWorld(landscape, x, z);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  if (offMeadow) return fail(`${name} jde stavět jen na louce.`);
  if (limit !== null && highest - lowest > limit) {
    return fail(
      `Země je tu příliš nerovná – rozdíl ${formatNumber(highest - lowest, 1)} m, ` +
        `nejvýš ${formatNumber(limit, 1)} m.`,
    );
  }
  return OK;
}

/**
 * Smí modla nebo svatyně stát na místě (happiness.md)? Půdorys (modla 4 × 4 m, svatyně 30 × 30 m)
 * celý na louce, u svatyně převýšení nejvýš 1 m; nepřekrývá obydlí, pole, hřbitovy, sady, jiné
 * modly ani svatyni; žádný skalní výchoz, čtverec háje ani posvátný dub (pod korunou); svatyně
 * jedna na ves. Ostatní překážky na půdorysu osadníci odstraní – cena po kusech podle tabulky ve
 * fields.md, dospělé stromy dají klády. `obstacles` = vrstva překážek krajiny.
 */
export function checkSacredBuildingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  kind: SacredBuildingKind,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): SacredPlacementCheck {
  const none = { obstacleCost: 0, obstacleIds: [], clearedTrees: 0, obstacleCounts: {} };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail(`Neplatná poloha – ${SACRED_NAMES[kind].toLowerCase()}.`), ...none };
  }
  if (kind === 'shrine' && (village?.sacredBuildings ?? []).some((b) => b.kind === 'shrine')) {
    return { ...fail('Ves už svatyni má – svatyně je jedna na ves.'), ...none };
  }
  const size = SACRED_BUILDINGS[kind].footprintM;
  const terrain = checkSacredTerrain(landscape, kind, rectangleSamples(size, size, position));
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = sacredFootprint(kind, position);
  const free = checkFootprintFree(landscape, village, [footprint]);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesOf(obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, [footprint]);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  const tally = polygonObstacles(obstacles, status, footprint, new Set(), sites.protectedTrees);
  return {
    ...OK,
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
  };
}

/** Ušetřená místa obou kontrol (obydlí a první pole při založení vsi). */
export function sparedOf(...checks: readonly { spared: SparedSacred }[]): SparedSacred {
  return mergeSpared(...checks.map((c) => c.spared));
}
