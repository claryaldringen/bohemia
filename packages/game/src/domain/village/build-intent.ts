import { tileOfWorldPoint, type Landscape, type ObstacleLayer } from '../landscape';
import { startNewDwelling, startRelocation, startWorkshop } from './actions';
import { buildAffordability } from './costs';
import { villageRoadWalk } from './paths/walking';
import {
  checkDwellingPlacement,
  checkPlotPlacement,
  checkWorkshopPlacement,
} from './placement-dwellings';
import { canonicalPlot } from './placement-geometry';
import { forestEdgeDistanceM, waterDistanceM } from './placement-squares';
import type { DwellingPlacementCheck } from './placement-types';
import { placementVillageOf } from './placement-village';
import { relocationAffordability, relocationBlock, type RelocationBlock } from './relocation';
import { CRAFTS, PLOT_TYPES } from './rules';
import type { BuildableDwellingType, Craft, DwellingPlot, Position, VillageState } from './types';

// Doménový příkaz stavby (steward.md – Kde správce běží): jedno pravidlo stavby pro hráče
// i správce vsi – cena předem (`buildAffordability`), kontrola místa a akce domény. Use-casy
// hráče jen načtou ves, zavolají `applyBuildIntent` a uloží výsledek; správce ho volá zevnitř
// simulace. Kdo pravidlo změní, změní ho oběma.

/** Ves nemá suroviny, které stavba stojí předem (population.md – Odemčení). */
export const CANNOT_AFFORD = 'Na tuhle stavbu ves nemá suroviny.';
/** Nové obydlí nemá kdo osídlit – žádná domácnost nemá mladý pár navíc (population.md – Odemčení). */
export const NO_SETTLERS = 'Nové obydlí nemá kdo osídlit.';
/** Klády na hromadě ani dospělé stromy sídla na stavbu nestačí (forest.md – Stavby a kácení). */
export const NO_WOOD = 'Na stavbu chybí dřevo – klády ani stromy ke kácení nestačí.';
/** Polozemnice se staví na pozemku – políčku krajiny (population.md – Umístění obydlí). */
export const NO_PLOT = 'Polozemnice potřebuje pozemek – celé políčko.';
/** Pozemek s neplatným natočením (jen po 15°) nebo natočený dvorec. */
export const BAD_PLOT = 'Neplatné natočení pozemku.';
/** Neznámé řemeslo (vstup z klienta). */
export const UNKNOWN_CRAFT = 'Takové řemeslo ves nezná.';
/** Proč se domácnost teď přestěhovat nemůže – česky pro hráče. */
export const RELOCATION_BLOCKED: Record<RelocationBlock, string> = {
  'no-household': 'V tomhle obydlí nikdo nebydlí.',
  relocating: 'Domácnost si už staví nový dům.',
  rebuilding: 'Domácnost svůj dům právě přestavuje.',
};

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
 * Přestěhování domácnosti (migration.md – Přestěhování domácnosti): nový dům obydlí `dwellingId`
 * (id obydlí = id domácnosti) jako stavba obydlí, jen bez lidí k osídlení.
 */
export interface RelocationIntent {
  kind: 'relocation';
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

/** Co se má stavět a kde – druh stavby a místo (poloha, pozemek, čtverce, mřížka, cesta). */
export type BuildIntent = DwellingIntent | RelocationIntent | WorkshopIntent;

/** Výsledek příkazu stavby – nový stav vsi, nebo důvod odmítnutí česky pro hráče. */
export type BuildResult = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Zahájí stavbu podle záměru `intent` ve dni `day` (den, do kterého je ves dopočítaná) – jen
 * když ves má suroviny předem a místo projde kontrolou umístění. Vstupní stav nemění.
 */
export function applyBuildIntent(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: BuildIntent,
): BuildResult {
  switch (intent.kind) {
    case 'dwelling':
      return buildDwelling(state, day, landscape, obstacles, intent);
    case 'relocation':
      return buildRelocation(state, day, landscape, obstacles, intent);
    case 'workshop':
      return buildWorkshop(state, day, landscape, obstacles, intent);
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
    const reason = missing.settlers ? NO_SETTLERS : missing.wood ? NO_WOOD : CANNOT_AFFORD;
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
 * Přestěhování domácnosti – stejné kontroly umístění, pozemek polozemnice, dřevo a cena jako nové
 * obydlí, jen bez lidí k osídlení; obyvatelé si dům postaví ze společné práce vsi.
 */
function buildRelocation(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  intent: RelocationIntent,
): BuildResult {
  const block = relocationBlock(state, intent.dwellingId);
  if (block !== null) return { ok: false, reason: RELOCATION_BLOCKED[block] };
  if (!relocationAffordability(state, intent.type, obstacles).affordable) {
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
      state: startRelocation(
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
    const reason = missing.settlers ? NO_SETTLERS : missing.wood ? NO_WOOD : CANNOT_AFFORD;
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
