import type { Direction8 } from '../village/types';
import { GRID_STEPS } from '../village/people/world-grid';
import {
  MARCH_BUILDING,
  marchCellAt,
  marchCellCenter,
  type MarchGrid,
  type Pos,
} from './march-grid';
import { marchAreaOf, gridSearch, marchArea, marchAreas, octileCost } from './march-search';
import { pathAlong, smoothCells } from './march-smooth';
import { WAR } from './rules-war';
import { isMarchWinter } from './season';

// Pochod vojska po mapě (war.md – Pohyb – mapu po mapě, Terén; plán 2026-11-16-dense-forest –
// Rozhodnutí 5–7): nejkratší průchozí trasa po mřížce pochodu (`marchGrid`) s rovnoměrnou cenou
// (`gridSearch`), vyhlazená na dohled a rozdělená podle tempa buněk (`smoothCells`, `pathAlong`);
// čas = metry louky (délka ÷ násobek tempa) ÷ tempo skupiny ve skutečném čase. Jen det-math –
// tažení počítá server i prohlížeč a musí jim vyjít stejně.

/** Trasa pochodu: start, body zlomu a hranice tempa, cíl. */
export interface MarchPath {
  points: Pos[];
  /** Buňka mřížky každého bodu (u bodu na hranici tempa buňka, do které úsek vstupuje). */
  cells: number[];
  /**
   * Metry louky od startu ke každému bodu – délka úseku ÷ násobek tempa (úsek má jedno tempo –
   * `pathAlong` dělí na hranicích), po kvantech (`quantizedStep` – součty přesné); poslední = celá
   * trasa. Čas = metry louky ÷ tempo skupiny.
   */
  meadowM: number[];
  /** Délka trasy (m). */
  lengthM: number;
}

/** Nejdál (m) přesune `outOfBuilding` cíl ze stavby na volné místo (Rozhodnutí 7). */
const BUILDING_REACH_M = 40;

/**
 * Nejbližší buňka k buňce `c`, pro kterou platí `accept` – střed nejvýš `maxM` metrů od středu `c`
 * (Infinity = celá mapa). Nejbližší podle čtverce vzdálenosti v buňkách, remíza – nižší index
 * (determinismus); prohledává se po čtvercových prstencích kolem `c`. −1 = žádná.
 */
function nearestCell(
  grid: MarchGrid,
  c: number,
  maxM: number,
  accept: (n: number) => boolean,
): number {
  if (accept(c)) return c;
  const w = grid.width;
  const h = grid.height;
  const ci = c % w;
  const cj = (c - ci) / w;
  const reach = maxM / grid.cellM;
  const reach2 = reach * reach;
  const rings = Math.min(Math.floor(reach), Math.max(ci, w - 1 - ci, cj, h - 1 - cj));
  let best = -1;
  let bestD = Infinity;
  // prstenec r má čtverec vzdálenosti aspoň r² – dál už nic bližšího není
  for (let r = 1; r <= rings && r * r <= bestD; r++) {
    for (let dj = -r; dj <= r; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= h) continue;
      const step = dj === -r || dj === r ? 1 : 2 * r;
      for (let di = -r; di <= r; di += step) {
        const i = ci + di;
        if (i < 0 || i >= w) continue;
        const d = di * di + dj * dj;
        if (d > reach2 || d > bestD) continue;
        const n = j * w + i;
        if ((d < bestD || n < best) && accept(n)) {
          bestD = d;
          best = n;
        }
      }
    }
  }
  return best;
}

/**
 * Nejbližší průchodná buňka k buňce `c` (Rozhodnutí 7): `c`, je-li průchodná; jinak průchodná
 * buňka nejblíž podle čtverce vzdálenosti v buňkách (remíza – nižší index), se středem nejvýš
 * `maxM` metrů daleko (Infinity = celá mapa). −1 = žádná do `maxM`.
 */
export function nearestPassable(grid: MarchGrid, c: number, maxM: number): number {
  return nearestCell(grid, c, maxM, (n) => grid.pace[n]! > 0);
}

/**
 * Cíl uvnitř stavby vsi (dům, pozemek, ohrada) se přesune na nejbližší průchodnou buňku nejvýš
 * `BUILDING_REACH_M` daleko – vojsko stavbou neprojde, ale k domu jako cíli dojde. Ostatní buňky
 * (a stavba bez volného místa v dosahu) beze změny.
 */
function outOfBuilding(grid: MarchGrid, c: number): number {
  if ((grid.flags[c]! & MARCH_BUILDING) === 0) return c;
  const free = nearestPassable(grid, c, BUILDING_REACH_M);
  return free < 0 ? c : free;
}

/**
 * Buňka, odkud skupina stojící v buňce `at` vyráží (Rozhodnutí 7): `at`, je-li průchodná; jinak
 * únik – nejbližší průchodná buňka na celé mapě (hustý les ze starého bodu, dorostlý les, stavba,
 * nová palisáda – skupina nezamrzne). −1 = mapa nemá průchodnou buňku.
 */
function departureOf(grid: MarchGrid, at: number): number {
  return nearestPassable(grid, at, Infinity);
}

/** Leží průchodné buňky `a` a `b` ve stejné souvislé oblasti (`marchAreas`)? */
function sameArea(grid: MarchGrid, a: number, b: number): boolean {
  const area = marchArea(grid, a);
  return area > 0 && area === marchArea(grid, b);
}

/**
 * Body trasy z řetězu buněk `cells` (z `gridSearch`): únik ze startu – rovně z `from` do středu
 * první buňky, když v ní `from` neleží (první úsek se nevyhlazuje) –, vyhlazení na dohled
 * (`smoothCells`) a vstup do stavby cíle – ze středu poslední buňky rovně do `to`, když v ní `to`
 * neleží. Úseky rozdělí `pathAlong` podle tempa.
 */
function routeOf(grid: MarchGrid, cells: readonly number[], from: Pos, to: Pos): MarchPath {
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const escape = marchCellAt(grid, from) !== first;
  const enter = marchCellAt(grid, to) !== last;
  const points = smoothCells(
    grid,
    cells,
    escape ? marchCellCenter(grid, first) : from,
    enter ? marchCellCenter(grid, last) : to,
  );
  if (escape) points.unshift({ x: from.x, z: from.z });
  if (enter) points.push({ x: to.x, z: to.z });
  return pathAlong(grid, points);
}

/**
 * Dojde skupina z bodu `from` do bodu `to` (war.md – Pohyb – Cíl v neprůchodné buňce)? Bez
 * hledání – ze souvislých oblastí (`marchAreas`): cíl ve stejné buňce ano; jinak cílová buňka
 * (ze stavby přesunutá `outOfBuilding`) musí být průchodná a ve stejné oblasti jako buňka, odkud
 * skupina vyráží (po úniku z neprůchodné buňky). Totéž, co `marchPath` ≠ null – pro kurzor nad
 * místem, kam skupina nedojde.
 */
export function marchReachable(grid: MarchGrid, from: Pos, to: Pos): boolean {
  const at = marchCellAt(grid, from);
  const end = marchCellAt(grid, to);
  if (end === at) return true;
  const start = departureOf(grid, at);
  return start >= 0 && sameArea(grid, start, outOfBuilding(grid, end));
}

/**
 * Trasa pochodu z bodu `from` do bodu `to` po mřížce mapy (war.md – Pohyb – Terén): nejkratší
 * průchozí cesta (`gridSearch` – rovnoměrná cena, tempo buňky se pro hledání nepočítá), vyhlazená
 * na dohled a rozdělená podle tempa (`march-smooth.ts`) – voda jen přes brod, do opevněné vsi
 * branou, mezerou nebo přes val. Start v neprůchodné buňce nejdřív unikne rovně do nejbližší
 * průchodné (Rozhodnutí 7), cíl ve stavbě se přesune vedle ní (`outOfBuilding`). Cíl ve stejné
 * buňce – rovně. Neprůchodný nebo nedosažitelný cíl null – pozná se předem ze souvislých oblastí,
 * bez hledání.
 */
export function marchPath(grid: MarchGrid, from: Pos, to: Pos): MarchPath | null {
  const at = marchCellAt(grid, from);
  const end = marchCellAt(grid, to);
  if (end === at) return pathAlong(grid, [from, to]);
  const start = departureOf(grid, at);
  const target = outOfBuilding(grid, end);
  if (start < 0 || !sameArea(grid, start, target)) return null;
  const w = grid.width;
  const ti = target % w;
  const tj = (target - ti) / w;
  const cells = gridSearch(
    grid,
    start,
    (c) => c === target,
    (i, j) => octileCost(i - ti, j - tj),
  );
  return cells ? routeOf(grid, cells, from, to) : null;
}

/**
 * Cíl pochodu jako v 0 A.D. (war.md – Pohyb – Cíl v neprůchodné buňce; návrh Clauda): cíl
 * v neprůchodné buňce (voda bez brodu, sráz, hotová hradba) nebo v průchodné, kam z `from` cesta
 * nevede (za řekou bez brodu), se posune na střed nejbližší průchodné buňky dosažitelné z `from` –
 * ve stejné souvislé oblasti (`marchAreas`) jako buňka, odkud skupina vyráží (po úniku
 * z neprůchodné buňky – Rozhodnutí 7). Nejbližší podle čtverce vzdálenosti v buňkách, remíza –
 * nejmenší index (determinismus). Dosažitelný cíl (`marchReachable` – i cíl ve stavbě, `marchPath`
 * ho přesune) vrátí beze změny – týž objekt. Null = mapa nemá průchodnou buňku.
 */
export function reachableGoal(grid: MarchGrid, from: Pos, to: Pos): Pos | null {
  if (marchReachable(grid, from, to)) return to;
  const start = departureOf(grid, marchCellAt(grid, from));
  if (start < 0) return null;
  const areas = marchAreas(grid);
  const w = grid.width;
  const area = marchAreaOf(areas, w, start);
  const best = nearestCell(
    grid,
    outOfBuilding(grid, marchCellAt(grid, to)),
    Infinity,
    (n) => marchAreaOf(areas, w, n) === area,
  );
  return best < 0 ? null : marchCellCenter(grid, best);
}

/**
 * Trasa k okraji mapy ve směru `direction` (war.md – Přechod okrajem): k nejbližší buňce okraje
 * (sever = +z, východ = +x – `GRID_STEPS`); úhlopříčný směr vede do rohu mapy. Konec trasy je
 * střed okrajové buňky – odtud `edgeCrossing` převede vojsko na sousední mapu. Stojí-li skupina
 * v buňce okraje, jde rovně do jejího středu; jinak jako `marchPath` (únik, hledání, vyhlazení).
 * Nedosažitelný okraj null – pozná se předem ze souvislých oblastí, bez hledání.
 */
export function marchPathToEdge(
  grid: MarchGrid,
  from: Pos,
  direction: Direction8,
): MarchPath | null {
  const step = GRID_STEPS[direction];
  const w = grid.width;
  const h = grid.height;
  const gi = step.x > 0 ? w - 1 : 0;
  const gj = step.y > 0 ? h - 1 : 0;
  const onEdge = (c: number): boolean => {
    const i = c % w;
    const j = (c - i) / w;
    return (step.x === 0 || i === gi) && (step.y === 0 || j === gj);
  };
  const at = marchCellAt(grid, from);
  if (onEdge(at)) return pathAlong(grid, [from, marchCellCenter(grid, at)]);
  const start = departureOf(grid, at);
  if (start < 0) return null;
  const areas = marchAreas(grid);
  const area = marchAreaOf(areas, w, start);
  // dosažitelná buňka okraje (sloupec gi, řádek gj, nebo roh) – jinak by hledání vyčerpalo oblast
  const corner = step.x !== 0 && step.y !== 0;
  const along = corner ? 1 : step.x !== 0 ? h : w;
  let reachable = false;
  for (let k = 0; k < along && !reachable; k++) {
    const c = corner ? gj * w + gi : step.x !== 0 ? k * w + gi : gj * w + k;
    reachable = marchAreaOf(areas, w, c) === area;
  }
  if (!reachable) return null;
  const cells = gridSearch(grid, start, onEdge, (i, j) =>
    octileCost(step.x === 0 ? 0 : i - gi, step.y === 0 ? 0 : j - gj),
  );
  if (!cells) return null;
  return routeOf(grid, cells, from, marchCellCenter(grid, cells[cells.length - 1]!));
}

/** Skutečné sekundy pochodu celé trasy tempem `speed` (m/s – `marchSpeed`). */
export function marchSeconds(path: MarchPath, speed: number): number {
  return path.meadowM[path.meadowM.length - 1]! / speed;
}

/** Poloha na trase po ušlých `meadow` metrech louky (tempo × čas); za koncem cíl. */
export function marchProgress(path: Pick<MarchPath, 'points' | 'meadowM'>, meadow: number): Pos {
  const m = path.meadowM;
  const last = path.points.length - 1;
  if (meadow <= 0) return { ...path.points[0]! };
  if (meadow >= m[last]!) return { ...path.points[last]! };
  let k = 1;
  while (m[k]! < meadow) k++;
  const a = path.points[k - 1]!;
  const b = path.points[k]!;
  const t = (meadow - m[k - 1]!) / (m[k]! - m[k - 1]!);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Složení skupiny pro tempo (war.md – Pohyb – skupina jde tempem nejpomalejšího). */
export interface GroupPace {
  /** Zdraví pěší muži. */
  onFoot: number;
  /** Jezdci. */
  riders: number;
  /** Pěší ranění (war.md – Ztráty). */
  woundedOnFoot: number;
  /** Kusů dobytka ve stádě. */
  herd: number;
}

/**
 * Tempo skupiny (m/s skutečného času, war.md – Pohyb – Tempo): ≈ 3,5 m/s pěšky, skupina jen
 * z jezdců × 1,5, s pěšími raněnými × 0,75, se stádem × 0,5 – platí nejpomalejší; v zimě
 * (`isMarchWinter`) sníh × 0,75. Terén přidá mřížka (`marchGrid` – násobek tempa buňky).
 */
export function marchSpeed(group: GroupPace, day: number): number {
  let factor = Infinity;
  if (group.riders > 0) factor = Math.min(factor, WAR.pace.riders);
  if (group.onFoot > 0) factor = Math.min(factor, 1);
  if (group.woundedOnFoot > 0) factor = Math.min(factor, WAR.pace.wounded);
  if (group.herd > 0) factor = Math.min(factor, WAR.pace.herd);
  if (factor === Infinity) factor = 1;
  const snow = isMarchWinter(day) ? WAR.snowPace : 1;
  return WAR.pace.metersPerSecond * factor * snow;
}
