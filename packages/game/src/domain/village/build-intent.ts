import { tileOfWorldPoint, type Landscape, type ObstacleLayer } from '../landscape';
import {
  foundCemetery,
  foundField,
  foundOrchard,
  foundPen,
  startNewDwelling,
  startReplacement,
  startSacredBuilding,
  startThreshingFloor,
  startWorkshop,
} from './actions';
import { buildAffordability } from './costs';
import { startFortification, startFortificationUpgrade } from './fortifications';
import { HORSE_PEN_NO_SURPLUS } from './horse-pen-payment';
import { villageRoadWalk } from './paths/walking';
import {
  checkDwellingPlacement,
  checkPlotPlacement,
  checkWorkshopPlacement,
} from './placement-dwellings';
import {
  cemeteryPartsFromCells,
  fieldPartsFromCells,
  orchardPartsFromCells,
} from './placement-fields';
import { canonicalPlot } from './placement-geometry';
import { penSquaresFromCells } from './placement-pens';
import { checkSacredBuildingPlacement, checkThreshingFloorPlacement } from './placement-sacred';
import { forestEdgeDistanceM, waterDistanceM } from './placement-squares';
import type { DwellingPlacementCheck } from './placement-types';
import { placementVillageOf, villageDwellingPositions } from './placement-village';
import type { Point } from './polygon';
import { relocationBlock, replacementAffordability } from './relocation';
import { NO_ROAD, roadApplesOption, startRoadApples } from './road-apples';
import {
  NO_UPGRADE,
  roadUpgradeOptions,
  startRoadUpgrade,
  type RoadUpgrade,
} from './road-upgrades';
import { CRAFTS, PLOT_TYPES } from './rules';
import { hasShrine } from './sacred';
import { DIRECTIONS, planTrail, startTrail } from './trail';
import type {
  BuildableDwellingType,
  Craft,
  Direction8,
  DwellingPlot,
  FortKind,
  FortTop,
  PenSpecies,
  Position,
  SacredBuildingKind,
  SquareGrid,
  TileCell,
  VillageState,
} from './types';
import { startWagonRoad } from './wagon-road';

// Doménový příkaz stavby (steward.md – Kde správce běží): jedno pravidlo stavby pro hráče
// i správce vsi – cena předem (`buildAffordability`), kontrola místa a akce domény. Use-casy
// hráče jen načtou ves, zavolají `applyBuildIntent` a uloží výsledek; správce ho volá zevnitř
// simulace. Kdo pravidlo změní, změní ho oběma.

/** Ves nemá suroviny, které stavba stojí předem (population.md – Odemčení). */
export const CANNOT_AFFORD = 'Na tuhle stavbu ves nemá suroviny.';
/** Klády na hromadě ani dospělé stromy sídla na stavbu nestačí (forest.md – Stavby a kácení). */
export const NO_WOOD = 'Na stavbu chybí dřevo – klády ani stromy ke kácení nestačí.';
/** Polozemnice se staví na pozemku – políčku krajiny (population.md – Umístění obydlí). */
export const NO_PLOT = 'Polozemnice potřebuje pozemek – celé políčko.';
/** Pozemek s neplatným natočením (jen po 15°) nebo natočený dvorec. */
export const BAD_PLOT = 'Neplatné natočení pozemku.';
/** Neznámé řemeslo (vstup z klienta). */
export const UNKNOWN_CRAFT = 'Takové řemeslo ves nezná.';
/** Na modlu nebo svatyni chybí dospělý dub ke kácení (happiness.md). */
export const NO_OAKS = 'Na stavbu chybí dospělé duby ke kácení.';
/** Svatyně je jedna na ves (happiness.md). */
export const SHRINE_EXISTS = 'Ves už svatyni má – svatyně je jedna na ves.';
/** Neznámý směr stezky. */
export const UNKNOWN_DIRECTION = 'Neznámý směr stezky.';
// Důvody cest žijí vedle akcí, které je vyhazují (jeden text pro hráče i správce).
export { NO_ROAD, NO_UPGRADE };
/** Domácnost si teď nový dům stavět nemůže (`relocationBlock`) – náhradu zakládá jen správce. */
export const REPLACEMENT_BLOCKED = 'Tahle domácnost si teď nový dům stavět nemůže.';

/** Nové obydlí – volná poloha (zemnice), nebo pozemek (polozemnice, `PLOT_TYPES`). */
export interface DwellingIntent {
  kind: 'dwelling';
  type: BuildableDwellingType;
  /** Volná poloha (zemnice); u obydlí na pozemku ji určí pozemek. */
  position: Position;
  /** Pozemek – povinný u polozemnice (`PLOT_TYPES`), u zemnice se nebere. */
  plot?: DwellingPlot;
}

/**
 * Náhrada domu správcem (demolition.md – Správce): nový dům obydlí `dwellingId` (id obydlí = id
 * domácnosti) jako stavba obydlí, jen bez lidí k osídlení; po dostavění se domácnost přestěhuje
 * a starý dům se zbourá.
 */
export interface ReplacementIntent {
  kind: 'replacement';
  /** Obydlí, jehož domácnost se stěhuje. */
  dwellingId: number;
  /** Typ nového domu – zemnice, nebo polozemnice. */
  type: BuildableDwellingType;
  /** Volná poloha (zemnice); u obydlí na pozemku ji určí pozemek. */
  position: Position;
  /** Pozemek – povinný u polozemnice (`PLOT_TYPES`), u zemnice se nebere. */
  plot?: DwellingPlot;
}

/** Řemeslná dílna (crafts.md – Budovy) – volná poloha jako u zemnice, i milíř uhlíře. */
export interface WorkshopIntent {
  kind: 'workshop';
  craft: Craft;
  position: Position;
}

/** Dřevěná modla nebo svatyně (happiness.md). */
export interface SacredIntent {
  kind: 'sacred';
  building: SacredBuildingKind;
  position: Position;
}

/** Nové opevnění přes body obvodu (fortifications.md – Obvod); správce bere návrh hry. */
export interface FortificationIntent {
  kind: 'fortification';
  points: Point[];
  fortKind: FortKind;
}

/** Vylepšení opevnění – plot na palisádu, nebo nástavba na val (fortifications.md – Druhy). */
export interface FortificationUpgradeIntent {
  kind: 'fortification-upgrade';
  fortificationId: number;
  work: 'upgrade' | 'top';
  top?: FortTop;
}

/** Humno (production-chains.md – Humno) – volně u kurzoru jako dílna. */
export interface ThreshingFloorIntent {
  kind: 'threshing-floor';
  /** Střed a natočení humna. */
  position: Position;
}

/** Nové pole ze čtverců (fields.md). */
export interface FieldIntent {
  kind: 'field';
  /** Čtverce pole – políčka krajiny, u natočeného pole čtverce v jeho mřížce `grid`. */
  cells: TileCell[];
  /** Natočená mřížka pole (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/** Jabloňový sad ze čtverců (orchard.md – staví se jako pole). */
export interface OrchardIntent {
  kind: 'orchard';
  /** Čtverce sadu – políčka krajiny, u natočeného sadu čtverce v jeho mřížce `grid`. */
  cells: TileCell[];
  /** Natočená mřížka sadu (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/** Pohřebiště ze čtverců – hráči se vždy říká Hřbitov. */
export interface CemeteryIntent {
  kind: 'cemetery';
  /** Čtverce pohřebiště – políčka krajiny, nebo čtverce natočené mřížky `grid`. */
  cells: TileCell[];
  /** Natočená mřížka hřbitova (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/** Ohrada s přístřeškem, nebo její rozšíření (oxen.md – Ohrady podle druhu). */
export interface PenIntent {
  kind: 'pen';
  /** Druh zvířat ohrady. */
  species: PenSpecies;
  /** Čtverce ohrady – políčka krajiny, nebo čtverce natočené mřížky `grid` (nejvýš 4). */
  cells: TileCell[];
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/** Zemská stezka ke kraji mapy (trade.md – Zemská stezka). */
export interface TrailIntent {
  kind: 'trail';
  direction: Direction8;
}

/** Vozová cesta (roads.md – Vozová cesta) – kterýkoli úsek cesty, jádro si dopočítá řetěz. */
export interface WagonRoadIntent {
  kind: 'wagon-road';
  roadId: number;
}

/** Vylepšení pevné cesty (roads.md – Vylepšení cesty): upravená cesta, nebo hať a lávka. */
export interface RoadUpgradeIntent {
  kind: 'road-upgrade';
  roadId: number;
  upgrade: RoadUpgrade;
}

/** Jabloně podél úseku cesty (roads.md – Vysazení jabloní). */
export interface RoadApplesIntent {
  kind: 'road-apples';
  roadId: number;
}

/** Co se má stavět a kde – druh stavby a místo (poloha, pozemek, čtverce, mřížka, cesta). */
export type BuildIntent =
  | FortificationIntent
  | FortificationUpgradeIntent
  | DwellingIntent
  | ReplacementIntent
  | WorkshopIntent
  | SacredIntent
  | ThreshingFloorIntent
  | FieldIntent
  | OrchardIntent
  | CemeteryIntent
  | PenIntent
  | TrailIntent
  | WagonRoadIntent
  | RoadUpgradeIntent
  | RoadApplesIntent;

/** Výsledek příkazu stavby – nový stav vsi, nebo důvod odmítnutí česky pro hráče. */
export type BuildResult = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Zahájí stavbu podle záměru `intent` ve dni `day` (den, do kterého je ves dopočítaná,
 * tedy `state.lastDay` – doména to nevynucuje, volající včetně správce to musí dodržet, jinak se
 * kontroly umístění a akce rozejdou) – jen když ves má suroviny předem a místo projde kontrolou
 * umístění. Vstupní stav nemění.
 */
export function applyBuildIntent(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: BuildIntent,
): BuildResult {
  switch (intent.kind) {
    case 'fortification': {
      const r = startFortification(
        state,
        day,
        landscape,
        obstacles,
        { points: intent.points, kind: intent.fortKind },
        villageRoadWalk(state, landscape),
      );
      return r.ok ? r : { ok: false, reason: r.reason };
    }
    case 'fortification-upgrade':
      return startFortificationUpgrade(
        state,
        day,
        landscape,
        obstacles,
        { fortificationId: intent.fortificationId, work: intent.work, top: intent.top },
        villageRoadWalk(state, landscape),
      );
    case 'dwelling':
      return buildDwelling(state, day, landscape, obstacles, intent);
    case 'replacement':
      return buildReplacement(state, day, landscape, obstacles, intent);
    case 'workshop':
      return buildWorkshop(state, day, landscape, obstacles, intent);
    case 'sacred':
      return buildSacred(state, day, landscape, obstacles, intent);
    case 'threshing-floor':
      return buildThreshingFloor(state, day, landscape, obstacles, intent);
    case 'field':
      return buildField(state, day, landscape, obstacles, intent);
    case 'orchard':
      return buildOrchard(state, day, landscape, obstacles, intent);
    case 'cemetery':
      return buildCemetery(state, day, landscape, obstacles, intent);
    case 'pen':
      return buildPen(state, day, landscape, obstacles, intent);
    case 'trail':
      return buildTrail(state, day, landscape, obstacles, intent);
    case 'wagon-road':
      return buildWagonRoad(state, day, landscape, obstacles, intent);
    case 'road-upgrade':
      return buildRoadUpgrade(state, day, landscape, obstacles, intent);
    case 'road-apples':
      return buildRoadApples(state, day, landscape, obstacles, intent);
  }
}

/** Místo obydlí, které prošlo kontrolou – poloha domu, pozemek a výsledek kontroly. */
interface DwellingSite {
  ok: true;
  check: DwellingPlacementCheck;
  position: Position;
  plot: DwellingPlot | undefined;
}

/**
 * Kontrola místa obydlí (nového i přestěhování): obydlí na pozemku má polohu domu podle
 * pozemku (klientská poloha se nebere), pozemek v ukládané podobě (střed na cm, natočení po 15°).
 */
function dwellingSite(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  type: BuildableDwellingType,
  at: Position,
  requested: DwellingPlot | undefined,
): DwellingSite | { ok: false; reason: string } {
  const village = placementVillageOf(state, day);
  const plot = PLOT_TYPES[type] && requested ? canonicalPlot(landscape, requested) : undefined;
  if (PLOT_TYPES[type] && !requested) return { ok: false, reason: NO_PLOT };
  if (plot === null) return { ok: false, reason: BAD_PLOT };
  const plotCheck = plot ? checkPlotPlacement(landscape, village, type, plot, obstacles) : null;
  const check = plotCheck ?? checkDwellingPlacement(landscape, village, type, at, obstacles);
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem obydlí nepatří.' };
  const position = plotCheck?.position ?? { ...at };
  return { ok: true, check, position, plot };
}

/**
 * Nové obydlí – kdykoli, když je kým ho osadit a ves má suroviny a dřevo předem. Stromy
 * z vyklízené plochy jdou na hromadu klád, stavba vezme klády z hromady a zbytek dřeva vyhradí
 * mezi nejbližšími dospělými stromy.
 */
function buildDwelling(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: DwellingIntent,
): BuildResult {
  const { affordable, missing } = buildAffordability(state, intent.type, obstacles);
  if (!affordable) {
    const reason = missing.wood ? NO_WOOD : CANNOT_AFFORD;
    return { ok: false, reason };
  }
  const site = dwellingSite(
    state,
    day,
    landscape,
    obstacles,
    intent.type,
    intent.position,
    intent.plot,
  );
  if (!site.ok) return site;
  const { check, position, plot } = site;
  // překážky na vyklízené ploše: práce navíc, osadníci je odstraní při zahájení stavby
  return {
    ok: true,
    state: startNewDwelling(
      state,
      day,
      intent.type,
      position,
      check.obstacleCost,
      check.obstacleIds,
      {
        obstacles,
        clearedTrees: check.obstacleCounts.tree ?? 0,
        forestDistanceM: forestEdgeDistanceM(landscape, position.x, position.z),
        ...(plot ? { plot } : {}),
        sacred: check.spared,
        // pole a sady pod obydlím se o zabranou plochu zmenší
        takenLand: check.takenLand,
        // kácení dřeva chůzí po pevných cestách (roads.md)
        walk: villageRoadWalk(state, landscape),
      },
    ),
  };
}

/**
 * Náhrada domu správcem – stejné kontroly umístění, pozemek polozemnice, dřevo a cena jako nové
 * obydlí, jen bez lidí k osídlení; obyvatelé si dům postaví ze společné práce vsi.
 */
function buildReplacement(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: ReplacementIntent,
): BuildResult {
  const block = relocationBlock(state, intent.dwellingId);
  if (block !== null) return { ok: false, reason: REPLACEMENT_BLOCKED };
  if (!replacementAffordability(state, intent.type, obstacles).affordable) {
    return { ok: false, reason: NO_WOOD };
  }
  const site = dwellingSite(
    state,
    day,
    landscape,
    obstacles,
    intent.type,
    intent.position,
    intent.plot,
  );
  if (!site.ok) return site;
  const { check, position, plot } = site;
  try {
    return {
      ok: true,
      state: startReplacement(
        state,
        day,
        intent.dwellingId,
        intent.type,
        position,
        check.obstacleCost,
        check.obstacleIds,
        {
          obstacles,
          clearedTrees: check.obstacleCounts.tree ?? 0,
          forestDistanceM: forestEdgeDistanceM(landscape, position.x, position.z),
          ...(plot ? { plot } : {}),
          sacred: check.spared,
          takenLand: check.takenLand,
        },
      ),
    };
  } catch (error) {
    // dřevo mezitím vyhradila jiná stavba
    if (error instanceof RangeError) return { ok: false, reason: NO_WOOD };
    throw error;
  }
}

/**
 * Řemeslná dílna – jako nové obydlí: ves musí mít dřevo a mladý pár, který se do dílny
 * nastěhuje; místo ověří `checkWorkshopPlacement` (i milíř uhlíře). Vzdálenost k lesu (palivo)
 * a k potoku (ruda, hlína) se změří z krajiny.
 */
function buildWorkshop(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: WorkshopIntent,
): BuildResult {
  if (!CRAFTS.includes(intent.craft)) return { ok: false, reason: UNKNOWN_CRAFT };
  const { affordable, missing } = buildAffordability(state, intent.craft, obstacles);
  if (!affordable) {
    const reason = missing.wood ? NO_WOOD : CANNOT_AFFORD;
    return { ok: false, reason };
  }
  const village = placementVillageOf(state, day);
  const position = { ...intent.position };
  const check = checkWorkshopPlacement(landscape, village, intent.craft, position, obstacles);
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem dílna nepatří.' };
  const tile = tileOfWorldPoint(landscape, position.x, position.z);
  return {
    ok: true,
    state: startWorkshop(
      state,
      day,
      intent.craft,
      position,
      check.obstacleCost,
      check.obstacleIds,
      {
        obstacles,
        clearedTrees: check.obstacleCounts.tree ?? 0,
        forestDistanceM: forestEdgeDistanceM(landscape, position.x, position.z),
        ...(tile ? { waterDistanceM: waterDistanceM(landscape, tile) } : {}),
        sacred: check.spared,
        // pole a sady pod obydlím se o zabranou plochu zmenší
        takenLand: check.takenLand,
        walk: villageRoadWalk(state, landscape),
      },
    ),
  };
}

/**
 * Dřevěná modla nebo svatyně (svatyně je jedna na ves). Stavba vyhradí nejbližší dospělé duby
 * a skácí je jako první část práce, překážky na půdorysu osadníci odstraní hned.
 */
function buildSacred(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: SacredIntent,
): BuildResult {
  if (intent.building === 'shrine' && hasShrine(state)) return { ok: false, reason: SHRINE_EXISTS };
  const { affordable, missing } = buildAffordability(state, intent.building, obstacles);
  if (!affordable) return { ok: false, reason: missing.oaks ? NO_OAKS : CANNOT_AFFORD };
  const check = checkSacredBuildingPlacement(
    landscape,
    placementVillageOf(state, day),
    intent.building,
    intent.position,
    obstacles,
  );
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem stavba nepatří.' };
  try {
    return {
      ok: true,
      state: startSacredBuilding(
        state,
        day,
        intent.building,
        { ...intent.position },
        check.obstacleCost,
        check.obstacleIds,
        {
          obstacles,
          clearedTrees: check.clearedTrees,
          walk: villageRoadWalk(state, landscape),
          // díly polí pod půdorysem se zmenší (fields.md – Pole jako krajina)
          takenLand: check.takenLand,
        },
      ),
    };
  } catch (error) {
    // duby nestačí ke kácení (vyhradila je mezitím jiná stavba)
    if (error instanceof RangeError) return { ok: false, reason: NO_OAKS };
    throw error;
  }
}

/**
 * Humno – ves musí mít dřevo předem; stavba vyhradí nejbližší dospělé stromy a překážky na
 * půdorysu osadníci odstraní hned. Díly polí pod humnem se zmenší (fields.md – Pole jako krajina).
 */
function buildThreshingFloor(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: ThreshingFloorIntent,
): BuildResult {
  const { affordable, missing } = buildAffordability(state, 'threshing-floor', obstacles);
  if (!affordable) return { ok: false, reason: missing.wood ? NO_WOOD : CANNOT_AFFORD };
  const position = { ...intent.position };
  const check = checkThreshingFloorPlacement(
    landscape,
    placementVillageOf(state, day),
    position,
    obstacles,
  );
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem humno nepatří.' };
  try {
    return {
      ok: true,
      state: startThreshingFloor(state, day, position, obstacles, {
        obstacleCost: check.obstacleCost,
        obstacleIds: check.obstacleIds,
        clearedTrees: check.clearedTrees,
        takenLand: check.takenLand,
        walk: villageRoadWalk(state, landscape),
      }),
    };
  } catch (error) {
    // stromy nestačí ke kácení (vyhradila je mezitím jiná stavba)
    if (error instanceof RangeError) return { ok: false, reason: NO_WOOD };
    throw error;
  }
}

/** Nové pole ze čtverců – díly se měří od obydlí; posvátné duby a háje vesničané nechají stát. */
function buildField(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: FieldIntent,
): BuildResult {
  if (!buildAffordability(state, 'field').affordable) return { ok: false, reason: CANNOT_AFFORD };
  const field = fieldPartsFromCells(
    landscape,
    placementVillageOf(state, day),
    intent.cells,
    villageDwellingPositions(state),
    obstacles,
    intent.grid,
  );
  if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
  // posvátné duby a háje vesničané při mýcení nechají stát (happiness.md)
  const fieldInput = {
    parts: field.parts,
    sacred: field.spared,
    ...(field.grid ? { grid: field.grid } : {}),
  };
  return { ok: true, state: foundField(state, day, fieldInput) };
}

/**
 * Jabloňový sad ze čtverců – osadníci ho vysadí v nejbližším okně výsadby (jaro, podzim)
 * a překážky na čtvercích odstraní.
 */
function buildOrchard(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: OrchardIntent,
): BuildResult {
  if (!buildAffordability(state, 'orchard').affordable) {
    return { ok: false, reason: CANNOT_AFFORD };
  }
  const orchard = orchardPartsFromCells(
    landscape,
    placementVillageOf(state, day),
    intent.cells,
    villageDwellingPositions(state),
    obstacles,
    intent.grid,
  );
  if (!orchard.check.ok) return { ok: false, reason: orchard.check.reason ?? 'Sem sad nepatří.' };
  // čtverce polí pod sadem z pole zmizí (fields.md – Pole jako krajina)
  const squares = {
    squares: orchard.squares,
    sacred: orchard.spared,
    takenLand: orchard.takenLand,
    ...(orchard.grid ? { grid: orchard.grid } : {}),
  };
  return { ok: true, state: foundOrchard(state, day, squares) };
}

/**
 * Pohřebiště ze čtverců. Blízkost obydlí a vody stavbu neblokuje – varuje jen náhled při
 * umisťování. Překážky na čtvercích zaplatí prací navíc a osadníci je odstraní, až hřbitov
 * dostaví.
 */
function buildCemetery(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: CemeteryIntent,
): BuildResult {
  const preview = cemeteryPartsFromCells(
    landscape,
    placementVillageOf(state, day),
    intent.cells,
    villageDwellingPositions(state),
    obstacles,
    intent.grid,
  );
  if (!preview.check.ok) {
    return { ok: false, reason: preview.check.reason ?? 'Sem hřbitov nepatří.' };
  }
  // čtverce polí pod hřbitovem z pole zmizí (fields.md – Pole jako krajina)
  const cemetery = {
    squares: preview.squares,
    ...(preview.grid ? { grid: preview.grid } : {}),
    squareSizeM: landscape.cellSizeM,
    sacred: preview.spared,
    takenLand: preview.takenLand,
  };
  return { ok: true, state: foundCemetery(state, day, cemetery) };
}

/**
 * Ohrada s přístřeškem, nebo její rozšíření – dřevo (6 stromů na čtverec) vezme stavba
 * z hromady, zbytek vyhradí ke kácení, překážky na čtvercích osadníci odstraní hned.
 */
function buildPen(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: PenIntent,
): BuildResult {
  if (!buildAffordability(state, 'pen', obstacles).affordable) {
    return { ok: false, reason: NO_WOOD };
  }
  const check = penSquaresFromCells(
    landscape,
    placementVillageOf(state, day),
    intent.cells,
    intent.species,
    obstacles,
    intent.grid,
  );
  if (!check.check.ok) {
    return { ok: false, reason: check.check.reason ?? 'Sem ohrada nepatří.' };
  }
  try {
    return {
      ok: true,
      state: foundPen(
        state,
        day,
        {
          species: intent.species,
          squares: check.squares,
          ...(check.grid ? { grid: check.grid } : {}),
          takenLand: check.takenLand,
        },
        obstacles,
        villageRoadWalk(state, landscape),
      ),
    };
  } catch (error) {
    // chybí obilí na koně, nebo dřevo mezitím vyhradila jiná stavba
    if (error instanceof RangeError) {
      return {
        ok: false,
        reason: error.message === HORSE_PEN_NO_SURPLUS ? HORSE_PEN_NO_SURPLUS : NO_WOOD,
      };
    }
    throw error;
  }
}

/**
 * Zemská stezka ke kraji mapy – stezka se naplánuje (`planTrail` – trasa, úseky, dřevo hatě
 * a lávek) a vrátí důvod česky, když nejde; dřevo kácí chůzí po pevných cestách.
 */
function buildTrail(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: TrailIntent,
): BuildResult {
  // záměrná dvojí kontrola: use-case hráče odmítá neznámý směr dřív, než načte ves; doména musí
  // být bezpečná i pro správce, který use-case nevolá
  if (!DIRECTIONS.includes(intent.direction)) return { ok: false, reason: UNKNOWN_DIRECTION };
  const walk = villageRoadWalk(state, landscape);
  const plan = planTrail(state, intent.direction, day, landscape, obstacles, walk);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  return {
    ok: true,
    state: startTrail(state, day, intent.direction, landscape, obstacles, walk),
  };
}

/**
 * Vozová cesta – trasa se najde znovu ze stavu (`planWagonRoad` – stejně jako náhled
 * v prohlížeči), ověří a stavba se zahájí po úsecích od vsi ven; když nejde, vrátí důvod česky.
 */
function buildWagonRoad(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: WagonRoadIntent,
): BuildResult {
  try {
    return { ok: true, state: startWagonRoad(state, day, intent.roadId, landscape, obstacles) };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, reason: error.message };
    throw error;
  }
}

/**
 * Vylepšení pevné cesty – ověří ho nabídka úseku (`roadUpgradeOptions`) a vrátí důvod česky,
 * když nejde; dřevo vezme z hromady, zbytek vyhradí ke kácení chůzí po pevných cestách.
 */
function buildRoadUpgrade(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: RoadUpgradeIntent,
): BuildResult {
  const walk = villageRoadWalk(state, landscape);
  const option = roadUpgradeOptions(state, intent.roadId, day, obstacles, walk, landscape).find(
    (o) => o.upgrade === intent.upgrade,
  );
  if (!option) return { ok: false, reason: NO_UPGRADE };
  if (option.blocked) return { ok: false, reason: option.blocked };
  return {
    ok: true,
    state: startRoadUpgrade(state, day, intent.roadId, intent.upgrade, obstacles, walk, landscape),
  };
}

/**
 * Jabloně na volných místech podél úseku – vysadí je vesničané v oknech jara a podzimu.
 * Výsadbu ověří nabídka úseku (`roadApplesOption`) a vrátí důvod česky, když nejde.
 */
function buildRoadApples(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: RoadApplesIntent,
): BuildResult {
  const option = roadApplesOption(state, intent.roadId, day, landscape, obstacles);
  if (!option) return { ok: false, reason: NO_ROAD };
  if (option.blocked) return { ok: false, reason: option.blocked };
  return { ok: true, state: startRoadApples(state, day, intent.roadId, landscape, obstacles) };
}
