import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  PLOT_TYPES,
  cancelRelocation,
  checkDwellingPlacement,
  checkPlotPlacement,
  forestEdgeDistanceM,
  placementVillageOf,
  relocationAffordability,
  relocationBlock,
  startRelocation,
  type DwellingPlot,
  type DwellingType,
  type Position,
  type RelocationBlock,
} from '../domain/village';
import { NO_PLOT, NO_WOOD } from './place-dwelling';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Přestěhování domácnosti (migration.md – Přestěhování domácnosti): hráč u vybraného obydlí
// umístí nový dům, obyvatelé si ho postaví ze společné práce vsi a po dostavění se přestěhují.

export interface RelocateHouseholdInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Obydlí, jehož domácnost se stěhuje (id obydlí = id domácnosti). */
  dwellingId: number;
  /** Typ nového domu – hráč volí zemnici, nebo polozemnici. */
  type: DwellingType;
  /** Volná poloha (zemnice); u obydlí na pozemku ji určí pozemek. */
  position: Position;
  /** Pozemek – povinný u polozemnice (`PLOT_TYPES`), u zemnice se nebere. */
  plot?: DwellingPlot;
}

/** Proč se domácnost teď přestěhovat nemůže – česky pro hráče. */
export const RELOCATION_BLOCKED: Record<RelocationBlock, string> = {
  'no-household': 'V tomhle obydlí nikdo nebydlí.',
  relocating: 'Domácnost si už staví nový dům.',
  rebuilding: 'Domácnost svůj dům právě přestavuje.',
};

/**
 * Hráč zahájí přestěhování domácnosti – nový dům jako stavbu obydlí (stejné kontroly umístění,
 * pozemek polozemnice, dřevo a cena jako `placeDwelling`), jen bez lidí k osídlení. Ves se
 * nejdřív dopočítá do dneška; server umístění ověří znovu.
 */
export function relocateHousehold(
  deps: { villages: VillageRepository },
  input: RelocateHouseholdInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const block = relocationBlock(state, input.dwellingId);
      if (block !== null) return { ok: false, reason: RELOCATION_BLOCKED[block] };
      const obstacles = obstaclesOf(input.landscape);
      if (!relocationAffordability(state, input.type, obstacles).affordable) {
        return { ok: false, reason: NO_WOOD };
      }
      const village = placementVillageOf(state, day);
      const plot = PLOT_TYPES[input.type] ? input.plot : undefined;
      if (PLOT_TYPES[input.type] && !plot) return { ok: false, reason: NO_PLOT };
      const plotCheck = plot
        ? checkPlotPlacement(input.landscape, village, input.type, plot, obstacles)
        : null;
      const check =
        plotCheck ??
        checkDwellingPlacement(input.landscape, village, input.type, input.position, obstacles);
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem obydlí nepatří.' };
      const position = plotCheck?.position ?? { ...input.position };
      try {
        return {
          ok: true,
          state: startRelocation(
            state,
            day,
            input.dwellingId,
            input.type,
            position,
            check.obstacleCost,
            check.obstacleIds,
            {
              obstacles,
              clearedTrees: check.obstacleCounts.tree ?? 0,
              forestDistanceM: forestEdgeDistanceM(input.landscape, position.x, position.z),
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
    },
  );
}

export interface CancelRelocationInput {
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Stavba nového domu stěhující se domácnosti. */
  constructionId: number;
}

/** Přestěhování už není co rušit – dům je dostavěný, nebo stavba není přestěhování. */
export const NO_RELOCATION = 'Tohle stěhování už nejde zrušit.';

/**
 * Hráč zruší rozestavěné přestěhování: stavba zmizí, klády z hromady i už skácené stromy se vrátí
 * na hromadu (ves se nejdřív dopočítá do dneška – mezitím se mohla dostavět).
 */
export function cancelHouseholdRelocation(
  deps: { villages: VillageRepository },
  input: CancelRelocationInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const c = state.constructions.find((x) => x.id === input.constructionId);
      if (!c || c.relocates === undefined) return { ok: false, reason: NO_RELOCATION };
      return { ok: true, state: cancelRelocation(state, state.lastDay, input.constructionId) };
    },
  );
}
