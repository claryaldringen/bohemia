// Převod starších vsí na klučení lesa po fázích (forest.md – Klučení lesa pro pole – postup,
// Starší vsi): rozestavěný díl v lese bez fází je dostane jednou a odvedená práce se zachová.

import type { ObstacleLayer } from '../../landscape';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape';
import { clearingFellCost, fellDueTrees } from './forest-clearing';
import { cellObstacles, obstacleStatus, squareObstacles } from '../core/obstacles';
import { fellingOrder } from '../placement/placement-fields';
import { placementVillageOf } from '../placement/placement-village';
import { FOREST_CLEARING } from '../rules/rules-fields';
import { squareCorners } from '../placement/square-grid';
import { fieldGridOf } from '../placement/squares';
import type { FieldPart, VillageState } from '../types';

const GEOMETRY = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M } as const;

/** Díl, který se má převést: zakládaný les bez fází, s překážkami a čtvercem. */
const needsClearing = (part: FieldPart): boolean =>
  part.state === 'founding' &&
  part.surface === 'forest' &&
  part.clearing === undefined &&
  part.cell !== undefined &&
  part.obstacles !== undefined;

/**
 * Zakládané díly v lese bez fází dostanou `clearing`: `fell` ze stojících stromů čtverce (dospělé,
 * mladé, souše – jen z překážek dílu), prvních `trees` dospělých dá kládu (počet klád se nemění),
 * `burnCost` je podíl pálení z ceny založení. Odvedená práce se zachová – došla-li na kácení,
 * všechny stromy padnou v den převodu (klády na hromadu u lesa) a větve jsou suché hned; jinak
 * padnou jen stromy, na které práce došla. Jednou a idempotentně (díl s fázemi, hotový nebo mimo
 * les se nemění), bez vrstvy nebo bez takového dílu vrací týž stav. Selhání jen poznamená
 * (`forestClearingFailed`) a ves jde dál postaru.
 */
export function withForestClearing(state: VillageState, layer: ObstacleLayer | null): VillageState {
  if (!layer || state.forestClearingFailed !== undefined || !state.parts.some(needsClearing))
    return state;
  try {
    const next = structuredClone(state);
    const day = Math.max(0, next.lastDay);
    const village = placementVillageOf(next, day);
    const status = obstacleStatus(village.obstacleChanges);
    const homes = next.dwellings.map((d) => d.position);
    for (const part of next.parts) {
      if (!needsClearing(part) || !part.cell) continue;
      const own = new Set(part.obstacles);
      const grid = fieldGridOf(next, part.fieldId);
      const tally = grid
        ? squareObstacles(layer, status, squareCorners(GEOMETRY, grid, part.cell))
        : cellObstacles(layer, status, part.cell);
      const standing = tally.standing.filter((t) => own.has(t.id));
      let logsLeft = part.trees ?? 0;
      const fell = fellingOrder(village, standing, homes).map((t) => {
        const log = t.log && logsLeft > 0;
        if (log) logsLeft--;
        return { id: t.id, log };
      });
      part.clearing = {
        fell,
        felled: 0,
        burnCost: part.foundingCost * (1 - FOREST_CLEARING.fellShare),
      };
      delete part.trees;
      fellDueTrees(next, part, day);
      // kácení hotové už před převodem: větve jsou suché hned
      if (part.foundingDone >= clearingFellCost(part) - 1e-9) {
        part.clearing.felledDay = day - FOREST_CLEARING.dryDays;
      }
    }
    return next;
  } catch (error) {
    return {
      ...state,
      forestClearingFailed: error instanceof Error ? error.message : String(error),
    };
  }
}
