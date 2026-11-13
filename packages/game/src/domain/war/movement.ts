import { directionBetween, type GridCell } from '../village/people/world-grid';
import { cellKey, gridOf, sameCell, type TickContext } from './campaign-tick';
import type { CampaignGroup, CampaignLeg, CampaignPlace, CampaignWorld } from './campaign-types';
import { marchPath, marchPathToEdge, marchProgress, reachableGoal } from './march';
import type { Pos } from './march-grid';
import { edgeCrossing, worldRoute } from './world-route';

// Pohyb po mapách světa o jeden takt (plán 2026-11-09 – Rozhodnutí plánu: vytaženo z `moveGroups`
// a `planLeg` v `campaign.ts`, ať se stejně hýbe skupina vojska, posel i skupina uprchlíků). Chování
// skupin vojska beze změny – bit po bitu (`march.test.ts`, `campaign.test.ts`). Vyslání skupiny,
// posun cíle a mapy potřebné předem (`sendGroup`, `settleGoal`, `missingMaps`) sem přešly z
// `campaign.ts` beze změny, ať je sdílí i výjezd vojvody (`journey.ts` – plán 2026-11-13).

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

/** Skupina vyrazí k místu `to` – trasa po mřížce světa, úsek mapy se spočte při pohybu. */
export function sendGroup(g: CampaignGroup, to: CampaignPlace): void {
  g.goal = { cell: { ...to.cell }, pos: { ...to.pos } };
  g.route = worldRoute(g.cell, to.cell, () => false).slice(1);
  g.leg = null;
  g.arrived = false;
}

/**
 * Cíl skupiny jako v 0 A.D. (war.md – Pohyb – Cíl v neprůchodné buňce; návrh Clauda): stojí-li
 * skupina na mapě cíle a úsek k němu ještě nemá (hned po záměru, nebo po vstupu na mapu cíle), cíl
 * v neprůchodné buňce (voda, sráz, hradba) se posune na nejbližší místo dosažitelné ze skupiny
 * (`reachableGoal`) – mapa tažení pak ukáže posunutý cíl. Průchodný cíl beze změny; když dosažitelné
 * místo není žádné, cíl zůstane a skupina stojí (záměr hráče k takovému místu odmítne už use-case).
 */
export function settleGoal(g: CampaignGroup, day: number, ctx: TickContext): void {
  const goal = g.goal;
  if (goal === null || g.leg !== null || g.route.length > 0 || !sameCell(g.cell, goal.cell)) return;
  const pos = reachableGoal(gridOf(g.cell, day, ctx), g.pos, goal.pos);
  if (pos !== null && pos !== goal.pos) g.goal = { cell: { ...goal.cell }, pos };
}

/** Mapy, které tažení nebo výjezd potřebuje hned: políčka skupin a další políčka jejich tras. */
export function missingMaps(
  state: { groups: readonly Pick<Mover, 'cell' | 'route'>[] },
  world: CampaignWorld,
): GridCell[] {
  const missing = new Map<string, GridCell>();
  for (const g of state.groups) {
    for (const cell of [g.cell, ...g.route.slice(0, 1)]) {
      if (!missing.has(cellKey(cell)) && world.landscapeOf(cell) === null) {
        missing.set(cellKey(cell), { ...cell });
      }
    }
  }
  return [...missing.values()];
}
