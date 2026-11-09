import { directionBetween, type GridCell } from '../village/world-grid';
import { gridOf, type TickContext } from './campaign-tick';
import type { CampaignLeg } from './campaign-types';
import { marchPath, marchPathToEdge, marchProgress } from './march';
import type { Pos } from './march-grid';
import { edgeCrossing } from './world-route';

// Pohyb po mapách světa o jeden takt (plán 2026-11-09 – Rozhodnutí plánu: vytaženo z `moveGroups`
// a `planLeg` v `campaign.ts`, ať se stejně hýbe skupina vojska, posel i skupina uprchlíků). Chování
// skupin vojska beze změny – bit po bitu (`march.test.ts`, `campaign.test.ts`).

/** Kdo jde po mapách: políčko, poloha, zbývající políčka trasy a úsek po současné mapě. */
export interface Mover {
  cell: GridCell;
  pos: Pos;
  /** Zbývající políčka světa k cíli (bez `cell`). */
  route: GridCell[];
  /** Úsek po současné mapě; null = spočte se. */
  leg: CampaignLeg | null;
}

/**
 * Výsledek kroku: `moved` – jde po úseku, `crossed` – přešel na sousední mapu (zbytek taktu se
 * nevyužije), `arrived` – stojí v cíli, `stuck` – nemá kudy (stojí).
 */
export type MoverStep = 'moved' | 'crossed' | 'arrived' | 'stuck';

/**
 * Úsek po mapě: k okraji ve směru dalšího políčka trasy, nebo k cíli `goal` (poloha na poslední
 * mapě); null = nemá kudy.
 */
export function planMoverLeg(
  m: Mover,
  goal: Pos,
  day: number,
  ctx: TickContext,
): CampaignLeg | null {
  const grid = gridOf(m.cell, day, ctx);
  const nextCell = m.route[0];
  let path;
  if (nextCell !== undefined) {
    const direction = directionBetween(m.cell, nextCell);
    path = direction === null ? null : marchPathToEdge(grid, m.pos, direction);
  } else {
    path = marchPath(grid, m.pos, goal);
  }
  return path ? { points: path.points, meadowM: path.meadowM, walkedM: 0 } : null;
}

/**
 * Jeden takt pohybu (mutuje `m`): `stepM` metrů louky po úseku mapy. Konec úseku na okraji = přechod
 * na sousední mapu, konec úseku v cíli = stojí v cíli.
 */
export function stepMover(
  m: Mover,
  goal: Pos,
  stepM: number,
  day: number,
  ctx: TickContext,
): MoverStep {
  if (m.leg === null) {
    m.leg = planMoverLeg(m, goal, day, ctx);
    if (m.leg === null) return 'stuck';
  }
  const leg = m.leg;
  const end = leg.meadowM[leg.meadowM.length - 1]!;
  const walked = leg.walkedM + stepM;
  if (walked < end) {
    leg.walkedM = walked;
    m.pos = marchProgress(leg, walked);
    return 'moved';
  }
  m.pos = { ...leg.points[leg.points.length - 1]! };
  m.leg = null;
  const nextCell = m.route.shift();
  if (nextCell === undefined) return 'arrived';
  m.pos = edgeCrossing(m.cell, nextCell, m.pos);
  m.cell = nextCell;
  return 'crossed';
}
