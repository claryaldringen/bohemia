import { directionBetween, type GridCell } from '../village/people/world-grid';
import { cellKey, gatherMissing, gridOf, sameCell, type TickContext } from './campaign-tick';
import type {
  CampaignGroup,
  CampaignLeg,
  CampaignPlace,
  CampaignWorld,
  MoverCrossing,
} from './campaign-types';
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
// mřížky (`replanLegs`) – plán 2026-11-16-dense-forest, Rozhodnutí 8 a 9. Paměť cesty a návrat po
// ní (`crossings`, `retraceCrossings`) a cesta celou trasou předem (`routeLeg`) – Martin 17. 11. 2026
// („Vrátit se, kudy přišla“, „Utéct do lesa“), Úloha 8c plánu.

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
  /**
   * Paměť cesty (Martin 17. 11. 2026 – „Vrátit se, kudy přišla“): přechody okrajem od místa, odkud
   * vyšel (domov, shromaždiště), v pořadí – poslední vede na mapu `cell`. Přechod zpět týmž místem
   * okraje se zruší s posledním (jinak by návrat chodil sem a tam). Chybí = nepamatuje si (posel,
   * uprchlíci, starší bod) – uvízlý návrat pak stojí.
   */
  crossings?: MoverCrossing[];
  /**
   * Vrací se po paměti cesty (`retraceCrossings`): úsek míří k místu posledního přechodu a přejde
   * zpět, kudy přišel (přechod z paměti zmizí). Chybí = jde nejkratší cestou. Smaže nový rozkaz.
   */
  retrace?: true;
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
 * Při návratu po paměti cesty (`retrace`) vede úsek k místu posledního přechodu (`retraced`), odkud
 * se přejde zpět – Martin 17. 11. 2026.
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
  const back = nextCell === undefined ? null : retraced(m, nextCell);
  if (back !== null && nextCell !== undefined) {
    // zpět, kudy přišel: k místu přechodu a přes okraj – jen je-li místo, odkud přišel, průchozí
    const there = gridOf(nextCell, day, ctx);
    const at = edgeCrossing(back.from, back.to, back.pos);
    path = there.pace[marchCellAt(there, back.pos)]! > 0 ? marchPath(grid, m.pos, at) : null;
  } else if (nextCell !== undefined) {
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
 * Přechod z paměti cesty, po kterém se `m` vrací (`retrace`): poslední, vede-li z `nextCell` (další
 * políčko trasy) na mapu `m.cell`; jinak null (paměť je pryč, nebo trasa jde dál k cíli).
 */
function retraced(m: Mover, nextCell: GridCell): MoverCrossing | null {
  if (m.retrace !== true || !m.crossings) return null;
  const last = m.crossings[m.crossings.length - 1];
  return last && sameCell(last.from, nextCell) && sameCell(last.to, m.cell) ? last : null;
}

/**
 * Zápis přechodu na `to` do paměti cesty (mutuje `m`; před přechodem – `m.pos` je místo na okraji
 * mapy `m.cell`): zpět po paměti (`retraced`), nebo zpět týmž místem okraje, kudy přišel – poslední
 * přechod se zruší (skupina stojí, kde stála před ním); jinak přibude. Bez paměti nic.
 */
function remember(m: Mover, to: GridCell): void {
  const list = m.crossings;
  if (!list) return;
  const last = list[list.length - 1];
  if (last && sameCell(last.from, to) && sameCell(last.to, m.cell)) {
    const at = edgeCrossing(last.from, last.to, last.pos);
    if (m.retrace === true || (at.x === m.pos.x && at.z === m.pos.z)) {
      list.pop();
      return;
    }
  }
  list.push({ from: { ...m.cell }, to: { ...to }, pos: { x: m.pos.x, z: m.pos.z } });
}

/**
 * Uvízlý návrat (Martin 17. 11. 2026 – „Vrátit se, kudy přišla“): `m` s pamětí cesty se vrátí po
 * zapamatovaných přechodech v obráceném pořadí – trasa vede mapami, odkud přišel, na mapu, odkud
 * vyšel, a dál k cíli `goal` (`worldRoute`); na každé mapě úsek k místu přechodu (`planMoverLeg`).
 * Mutuje `m` (trasa, úsek, `retrace`; `stuckDay` smaže – zkusí se hned). False = vrátit se tak nejde:
 * paměť chybí nebo je prázdná (stojí na mapě, odkud vyšel), nevede na jeho mapu, nebo se po ní už
 * vrací.
 */
export function retraceCrossings(m: Mover, goal: CampaignPlace): boolean {
  const list = m.crossings;
  const last = list?.[list.length - 1];
  if (m.retrace === true || !list || !last || !sameCell(last.to, m.cell)) return false;
  const back = list.map((c) => ({ ...c.from })).reverse();
  const start = back[back.length - 1]!;
  m.route = [...back, ...worldRoute(start, goal.cell, () => false).slice(1)];
  m.leg = null;
  m.retrace = true;
  delete m.stuckDay;
  return true;
}

/**
 * První úsek cesty, která vede po trase `m.route` až do cíle `goal` (Martin 17. 11. 2026 – „Utéct do
 * lesa“: průvod do hradiště, kam cesta nevede, nevyrazí): úseky všech map trasy spočte předem jako
 * `stepMover` (`planMoverLeg` od místa vstupu, mřížky dne `day`); mapy trasy načte najednou
 * (`gatherMissing`). Null = na některé mapě úsek nevede. `m` nemění.
 */
export function routeLeg(
  m: Pick<Mover, 'cell' | 'pos' | 'route'>,
  goal: Pos,
  day: number,
  ctx: TickContext,
): CampaignLeg | null {
  gatherMissing([m.cell, ...m.route], (cell) => gridOf(cell, day, ctx));
  const probe: Mover = {
    cell: { ...m.cell },
    pos: { ...m.pos },
    route: m.route.map((c) => ({ ...c })),
    leg: null,
  };
  let first: CampaignLeg | null = null;
  for (;;) {
    const leg = planMoverLeg(probe, goal, day, ctx);
    if (leg === null) return null;
    first ??= leg;
    const next = probe.route.shift();
    if (next === undefined) return first;
    probe.pos = edgeCrossing(probe.cell, next, leg.points[leg.points.length - 1]!);
    probe.cell = next;
  }
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
 * na sousední mapu (zapíše se do paměti cesty – `remember`), konec úseku v cíli = stojí v cíli. Když úsek spočíst nejde, stojí (`stuck`) a do
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
  remember(m, nextCell);
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

/**
 * Skupina vyrazí k místu `to` – trasa po mřížce světa, úsek mapy se spočte při pohybu. Paměť cesty
 * zůstane (vede od domova sem), návrat po ní (`retrace`) skončí – jde se napřed nejkratší cestou.
 */
export function sendGroup(g: CampaignGroup, to: CampaignPlace): void {
  g.goal = { cell: { ...to.cell }, pos: { ...to.pos } };
  g.route = worldRoute(g.cell, to.cell, () => false).slice(1);
  g.leg = null;
  g.arrived = false;
  delete g.stuckDay;
  delete g.orderedPos;
  delete g.retrace;
}

/**
 * Cíl skupiny jako v 0 A.D. (war.md – Pohyb – Cíl v neprůchodné buňce; návrh Clauda): stojí-li
 * skupina na mapě cíle a úsek k němu ještě nemá (hned po záměru, nebo po vstupu na mapu cíle), cíl
 * v neprůchodné buňce (voda, sráz, hradba, vnitřek hustého lesa) se posune na nejbližší místo
 * dosažitelné ze skupiny (`reachableGoal`) – mapa tažení pak ukáže posunutý cíl. Místo rozkazu
 * zůstane v `orderedPos` (první posun – další posun téhož rozkazu ho nepřepíše): NPC velitel podle
 * něj skupinu neposílá znovu (dřív ji posílal každý takt a úsek se počítal pokaždé – Úloha 8
 * plánu 2026-11-16-dense-forest). Průchodný cíl beze změny; když dosažitelné místo není žádné, cíl
 * zůstane a skupina stojí (záměr hráče k takovému místu odmítne už use-case).
 */
export function settleGoal(g: CampaignGroup, day: number, ctx: TickContext): void {
  const goal = g.goal;
  if (goal === null || g.leg !== null || g.route.length > 0 || !sameCell(g.cell, goal.cell)) return;
  const pos = reachableGoal(gridOf(g.cell, day, ctx), g.pos, goal.pos);
  if (pos === null || pos === goal.pos) return;
  g.orderedPos ??= { x: goal.pos.x, z: goal.pos.z };
  g.goal = { cell: { ...goal.cell }, pos };
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
