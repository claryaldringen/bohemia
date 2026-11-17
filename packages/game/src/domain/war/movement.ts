import { directionBetween, type GridCell } from '../village/people/world-grid';
import { cellKey, gridOf, sameCell, type TickContext } from './campaign-tick';
import type { CampaignGroup, CampaignLeg, CampaignPlace, CampaignWorld } from './campaign-types';
import {
  crossingAreas,
  marchPath,
  marchPathToEdge,
  marchProgress,
  nearestPassable,
  reachableGoal,
} from './march';
import {
  MARCH_GRID_VERSION,
  marchCellAt,
  marchCellCenter,
  type MarchGrid,
  type Pos,
} from './march-grid';
import { marchArea } from './march-search';
import { edgeCrossing, sideBySide, worldRoute } from './world-route';

// Pohyb po mapách světa o jeden takt (plán 2026-11-09 – Rozhodnutí plánu: vytaženo z `moveGroups`
// a `planLeg` v `campaign.ts`, ať se stejně hýbe skupina vojska, posel i skupina uprchlíků). Vyslání
// skupiny, posun cíle a mapy potřebné předem (`sendGroup`, `settleGoal`, `missingMaps`) sem přešly
// z `campaign.ts` beze změny, ať je sdílí i výjezd vojvody (`journey.ts` – plán 2026-11-13). Přechod
// okraje jen do průchozí buňky sousední mapy, uvíznutí na den a přepočet rozjetých úseků po změně
// mřížky (`replanLegs`) – plán 2026-11-16-dense-forest, Rozhodnutí 8 a 9.

/** Kdo jde po mapách: políčko, poloha, zbývající políčka trasy a úsek po současné mapě. */
export interface Mover {
  cell: GridCell;
  pos: Pos;
  /** Zbývající políčka světa k cíli (bez `cell`). */
  route: GridCell[];
  /** Úsek po současné mapě; null = spočte se. */
  leg: CampaignLeg | null;
  /**
   * Herní den, kdy úsek spočíst nešlo (`stuck`) – ten den se už nehledá znovu (Rozhodnutí 8);
   * chybí = neuvízl. Pojistka: všichni volající pohyb na `stuck` končí (skupina `arrived`, posel
   * se vrací, uprchlíci zůstanou) – nový pokus až po novém rozkazu (`sendGroup` `stuckDay` smaže).
   * Smaže ho i úspěšný úsek.
   */
  stuckDay?: number;
}

/**
 * Výsledek kroku: `moved` – jde po úseku, `crossed` – přešel na sousední mapu (zbytek taktu se
 * nevyužije), `arrived` – stojí v cíli, `stuck` – nemá kudy (stojí).
 */
export type MoverStep = 'moved' | 'crossed' | 'arrived' | 'stuck';

/**
 * Úsek po mapě: k okraji ve směru dalšího políčka trasy, nebo k cíli `goal` (poloha na poslední
 * mapě); null = nemá kudy. Okrajem jen tam, kde je protějšek okrajové buňky na sousední mapě
 * (`edgeCrossing` středu buňky) průchozí (Rozhodnutí 8) – mřížku sousední mapy dá `gridOf` (mapu
 * načte předem `missingMaps`; chybí-li ves sousední mapy, takt počká – `MissingData`). Napřed jen
 * do souvislé oblasti, odkud se tam jde dál (`onwardArea`); jinak kamkoli průchozího (návrh Clauda –
 * Úloha 5: nejbližší průchozí protějšek bývá kapsa u okraje, odkud by skupina nedošla nikam).
 */
export function planMoverLeg(
  m: Mover,
  goal: Pos,
  day: number,
  ctx: TickContext,
): CampaignLeg | null {
  const grid = gridOf(m.cell, day, ctx);
  const nextCell = m.route[0];
  if (nextCell !== undefined) return planLeg(m, goal, day, ctx, grid, nextCell);
  // tažení čekající na ves se každé kolo workeru počítá znovu od téhož bodu (takt, který čeká,
  // se neukládá) – stejný vstup na téže mřížce proto dá stejný úsek (měření 16. 11. 2026:
  // cesta hustým lesem přes mapu ≈ 2,7 ms za výpočet)
  const key = `${m.pos.x},${m.pos.z}|${goal.x},${goal.z}`;
  let known = legMemo.get(grid);
  if (known === undefined) {
    known = new Map();
    legMemo.set(grid, known);
  }
  const hit = known.get(key);
  if (hit !== undefined) {
    return hit === null ? null : { points: hit.points, meadowM: hit.meadowM, walkedM: 0 };
  }
  const leg = planLeg(m, goal, day, ctx, grid, nextCell);
  if (known.size >= 64) known.clear();
  known.set(key, leg);
  return leg === null ? null : { points: leg.points, meadowM: leg.meadowM, walkedM: 0 };
}

const legMemo = new WeakMap<MarchGrid, Map<string, CampaignLeg | null>>();

function planLeg(
  m: Mover,
  goal: Pos,
  day: number,
  ctx: TickContext,
  grid: MarchGrid,
  nextCell: GridCell | undefined,
): CampaignLeg | null {
  let path;
  if (nextCell !== undefined) {
    const direction = directionBetween(m.cell, nextCell);
    if (direction === null) {
      path = null;
    } else {
      const next = gridOf(nextCell, day, ctx);
      const there = (c: number): number =>
        marchCellAt(next, edgeCrossing(m.cell, nextCell, marchCellCenter(grid, c)));
      const onward = onwardArea(next, nextCell, m.route[1], goal);
      path =
        marchPathToEdge(grid, m.pos, direction, (c) => onward(marchArea(next, there(c)))) ??
        marchPathToEdge(grid, m.pos, direction, (c) => next.pace[there(c)]! > 0);
    }
  } else {
    path = marchPath(grid, m.pos, goal);
  }
  return path ? { points: path.points, meadowM: path.meadowM, walkedM: 0 } : null;
}

/**
 * Do kterých souvislých oblastí mřížky `next` sousední mapy (`marchAreas`) má skupina přejít: na
 * mapě cíle (`onward` chybí) do oblasti nejbližší průchodné buňky k cíli `goal` – tam by cíl
 * skončil (`reachableGoal`); na mapě po cestě do oblasti s průchodnou buňkou okraje směrem
 * k políčku `onward` (`crossingAreas`). Oblast 0 (neprůchodná) nikdy.
 */
function onwardArea(
  next: MarchGrid,
  nextCell: GridCell,
  onward: GridCell | undefined,
  goal: Pos,
): (area: number) => boolean {
  if (onward === undefined) {
    const near = nearestPassable(next, marchCellAt(next, goal), Infinity);
    const area = near < 0 ? 0 : marchArea(next, near);
    return (a) => a > 0 && a === area;
  }
  const direction = directionBetween(nextCell, onward);
  if (direction === null) return (a) => a > 0;
  const open = crossingAreas(next, direction);
  return (a) => a > 0 && open.has(a);
}

/**
 * Jeden takt pohybu (mutuje `m`): `stepM` metrů louky po úseku mapy. Konec úseku na okraji = přechod
 * na sousední mapu, konec úseku v cíli = stojí v cíli. Když úsek spočíst nejde, stojí (`stuck`) a do
 * konce dne `day` ho nehledá znovu (`stuckDay` – mřížku ani mapu nečte; Review Focus 3). Volající
 * pohyb na `stuck` končí – znovu se plánuje až po novém rozkazu.
 */
export function stepMover(
  m: Mover,
  goal: Pos,
  stepM: number,
  day: number,
  ctx: TickContext,
): MoverStep {
  if (m.leg === null) {
    if (m.stuckDay === day) return 'stuck';
    m.leg = planMoverLeg(m, goal, day, ctx);
    if (m.leg === null) {
      m.stuckDay = day;
      return 'stuck';
    }
    delete m.stuckDay;
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

/**
 * Přepočet rozjetých úseků po změně mřížky pochodu (Rozhodnutí 9): úseky skupin a `extra`
 * (uprchlíci a poslové tažení) zahodí – další takt je spočte z uložené polohy (z neprůchodné buňky
 * únikem – Rozhodnutí 7) –, úhlopříčné kroky tras světa nahradí dvěma kolmými (`sideBySide` – cesta
 * mezi mapami je čtyřsousedná, oprava Úlohy 5) a zapíše verzi mřížky (`MARCH_GRID_VERSION`).
 * Mutuje `state` i `extra` (trasy jsou nová pole).
 */
export function replanLegs(
  state: { groups: Mover[]; marchGridVersion?: number },
  extra: readonly Mover[] = [],
): void {
  for (const m of [...state.groups, ...extra]) {
    m.leg = null;
    m.route = sideBySide(m.cell, m.route);
  }
  state.marchGridVersion = MARCH_GRID_VERSION;
}

/** Skupina vyrazí k místu `to` – trasa po mřížce světa, úsek mapy se spočte při pohybu. */
export function sendGroup(g: CampaignGroup, to: CampaignPlace): void {
  g.goal = { cell: { ...to.cell }, pos: { ...to.pos } };
  g.route = worldRoute(g.cell, to.cell, () => false).slice(1);
  g.leg = null;
  g.arrived = false;
  delete g.stuckDay;
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
