import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  villageRoadWalk,
  PLOT_TYPES,
  buildAffordability,
  checkDwellingPlacement,
  checkPlotPlacement,
  forestEdgeDistanceM,
  placementVillageOf,
  startNewDwelling,
  type DwellingPlot,
  type DwellingType,
  type Position,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceDwellingInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  type: DwellingType;
  /** Volná poloha (zemnice); u obydlí na pozemku ji určí pozemek. */
  position: Position;
  /** Pozemek – povinný u polozemnice (`PLOT_TYPES`), u zemnice se nebere. */
  plot?: DwellingPlot;
}

/** Ves nemá suroviny, které stavba stojí předem (population.md – Odemčení). */
export const CANNOT_AFFORD = 'Na tuhle stavbu ves nemá suroviny.';
/** Nové obydlí nemá kdo osídlit – žádná domácnost nemá mladý pár navíc (population.md – Odemčení). */
export const NO_SETTLERS = 'Nové obydlí nemá kdo osídlit.';
/** Klády na hromadě ani dospělé stromy sídla na stavbu nestačí (forest.md – Stavby a kácení). */
export const NO_WOOD = 'Na stavbu chybí dřevo – klády ani stromy ke kácení nestačí.';
/** Polozemnice se staví na pozemku – políčku krajiny (population.md – Umístění obydlí). */
export const NO_PLOT = 'Polozemnice potřebuje pozemek – celé políčko.';

/**
 * Hráč zahájí stavbu nového obydlí – kdykoli, když je kým ho osadit a ves má suroviny a dřevo
 * předem (ves se nejdřív dopočítá do dneška). Stromy z vyklízené plochy jdou na hromadu klád,
 * stavba vezme klády z hromady a zbytek dřeva vyhradí mezi nejbližšími dospělými stromy.
 */
export function placeDwelling(
  deps: { villages: VillageRepository },
  input: PlaceDwellingInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const { affordable, missing } = buildAffordability(state, input.type, obstacles);
      if (!affordable) {
        const reason = missing.settlers ? NO_SETTLERS : missing.wood ? NO_WOOD : CANNOT_AFFORD;
        return { ok: false, reason };
      }
      const village = placementVillageOf(state, day);
      // obydlí na pozemku: poloha domu podle pozemku (klientská poloha se nebere)
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
      // překážky na vyklízené ploše: práce navíc, osadníci je odstraní při zahájení stavby
      return {
        ok: true,
        state: startNewDwelling(
          state,
          day,
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
            // pole a sady pod obydlím se o zabranou plochu zmenší
            takenLand: check.takenLand,
            // kácení dřeva chůzí po pevných cestách (roads.md)
            walk: villageRoadWalk(state, input.landscape),
          },
        ),
      };
    },
  );
}
