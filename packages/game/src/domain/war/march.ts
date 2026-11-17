import type { Direction8 } from '../village/types';
import { GRID_STEPS } from '../village/people/world-grid';
import {
  MARCH_BUILDING,
  MARCH_WALL,
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

/**
 * Nejdál (m) přesune `outOfBuilding` cíl ze stavby na volné místo (Rozhodnutí 7); o tolik nejvýš
 * smí únik mimo stavbu do užitečné oblasti vést dál než do nejbližší průchodné buňky (`departureOf`).
 */
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
 * Nejbližší buňka k buňce `c` v souvislé oblasti `area` (`marchArea`, od 1): `c`, leží-li v ní;
 * jinak nejbližší podle čtverce vzdálenosti v buňkách (remíza – nižší index), se středem nejvýš
 * `maxM` metrů daleko. −1 = žádná do `maxM`.
 */
export function nearestInArea(grid: MarchGrid, c: number, area: number, maxM: number): number {
  const areas = marchAreas(grid);
  return nearestCell(grid, c, maxM, (n) => marchAreaOf(areas, grid.width, n) === area);
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
 * únik (hustý les ze starého bodu, dorostlý les, stavba, nová palisáda – skupina nezamrzne) do
 * nejbližší průchodné buňky (`nearestPassable`). Mimo stavbu (voda, les ze starých poloh) přednost
 * nejbližší buňce souvislé oblasti, se kterou skupina něco svede – `useful(oblast)`: oblast cíle,
 * nebo oblast s průchodnou buňkou přechodu okraje (Úloha 5 – nejbližší průchodná buňka bývá paseka
 * nebo ostrůvek, odkud by nevedlo nikam) –, nejvýš `BUILDING_REACH_M` dál než nejbližší průchodná
 * buňka. Ze stavby ani ze stěny opevnění nikdy (oprava Úlohy 5): střed dvorce je stavba a únik do
 * „užitečné“ oblasti vedl dvorcem i 400 m hustého lesa do oblasti za ním – budova byla průchod;
 * ze stěny (palisáda postavená pod skupinou) by únik pustil skupinu dovnitř zavřeného opevnění. `useful` null = bez
 * přednosti. −1 = mapa nemá průchodnou buňku.
 */
function departureOf(
  grid: MarchGrid,
  at: number,
  useful: ((area: number) => boolean) | null,
): number {
  if (grid.pace[at]! > 0) return at;
  const plain = nearestPassable(grid, at, Infinity);
  if (plain < 0 || useful === null || (grid.flags[at]! & (MARCH_BUILDING | MARCH_WALL)) !== 0) {
    return plain;
  }
  const areas = marchAreas(grid);
  const w = grid.width;
  if (useful(marchAreaOf(areas, w, plain))) return plain;
  const p = marchCellCenter(grid, plain);
  const q = marchCellCenter(grid, at);
  const dx = p.x - q.x;
  const dz = p.z - q.z;
  const reachM = Math.sqrt(dx * dx + dz * dz) + BUILDING_REACH_M;
  const best = nearestCell(grid, at, reachM, (n) => {
    const area = marchAreaOf(areas, w, n);
    return area > 0 && useful(area);
  });
  return best >= 0 ? best : plain;
}

/**
 * Odkud skupina v bodě `from` vyráží k buňce `target` (únik míří do oblasti cíle – `departureOf`)
 * a souvislá oblast cíle; oblast 0 = cíl neprůchodný (bez úniku – cesta stejně nevede).
 */
function departureTo(grid: MarchGrid, from: Pos, target: number): { start: number; area: number } {
  const area = marchArea(grid, target);
  if (area === 0) return { start: -1, area };
  return { start: departureOf(grid, marchCellAt(grid, from), (a) => a === area), area };
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
 * skupina vyráží (po úniku z neprůchodné buňky – do oblasti cíle, je-li kde). Totéž, co
 * `marchPath` ≠ null – pro kurzor nad místem, kam skupina nedojde.
 */
export function marchReachable(grid: MarchGrid, from: Pos, to: Pos): boolean {
  const end = marchCellAt(grid, to);
  if (end === marchCellAt(grid, from)) return true;
  const { start, area } = departureTo(grid, from, outOfBuilding(grid, end));
  return start >= 0 && area > 0 && marchArea(grid, start) === area;
}

/**
 * Trasa pochodu z bodu `from` do bodu `to` po mřížce mapy (war.md – Pohyb – Terén): nejkratší
 * průchozí cesta (`gridSearch` – rovnoměrná cena, tempo buňky se pro hledání nepočítá), vyhlazená
 * na dohled a rozdělená podle tempa (`march-smooth.ts`) – voda jen přes brod, do opevněné vsi
 * branou, mezerou nebo přes val. Start v neprůchodné buňce nejdřív unikne rovně do nejbližší
 * průchodné buňky oblasti cíle (Rozhodnutí 7, `departureOf`), cíl ve stavbě se přesune vedle ní
 * (`outOfBuilding`). Cíl ve stejné buňce – rovně. Neprůchodný nebo nedosažitelný cíl null – pozná
 * se předem ze souvislých oblastí, bez hledání.
 */
export function marchPath(grid: MarchGrid, from: Pos, to: Pos): MarchPath | null {
  const end = marchCellAt(grid, to);
  if (end === marchCellAt(grid, from)) return pathAlong(grid, [from, to]);
  const target = outOfBuilding(grid, end);
  const { start, area } = departureTo(grid, from, target);
  if (start < 0 || area === 0 || marchArea(grid, start) !== area) return null;
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
 * ve stejné souvislé oblasti (`marchAreas`) jako buňka, odkud skupina vyráží. Z neprůchodné buňky
 * (Rozhodnutí 7) skupina unikne do oblasti nejbližší průchodné buňky k cíli – tam by cíl skončil,
 * kdyby šlo dojít kamkoli (Úloha 5: ne do paseky, odkud by nevedlo nikam). Nejbližší podle čtverce
 * vzdálenosti v buňkách, remíza – nejmenší index (determinismus). Dosažitelný cíl (`marchReachable`
 * – i cíl ve stavbě, `marchPath` ho přesune) vrátí beze změny – týž objekt. Null = mapa nemá
 * průchodnou buňku.
 */
export function reachableGoal(grid: MarchGrid, from: Pos, to: Pos): Pos | null {
  if (marchReachable(grid, from, to)) return to;
  const target = outOfBuilding(grid, marchCellAt(grid, to));
  const at = marchCellAt(grid, from);
  const near = grid.pace[at]! > 0 ? -1 : nearestPassable(grid, target, Infinity);
  const nearArea = near < 0 ? 0 : marchArea(grid, near);
  const start = departureOf(grid, at, nearArea === 0 ? null : (a) => a === nearArea);
  if (start < 0) return null;
  const areas = marchAreas(grid);
  const w = grid.width;
  const area = marchAreaOf(areas, w, start);
  const best = nearestCell(grid, target, Infinity, (n) => marchAreaOf(areas, w, n) === area);
  return best < 0 ? null : marchCellCenter(grid, best);
}

/**
 * Souvislé oblasti mřížky (`marchAreas`) s průchodnou buňkou okraje ve směru `direction` (sloupec,
 * řádek, nebo roh mapy), pro kterou platí `arrival` (chybí = každá) – odkud se tím směrem přejde na
 * sousední mapu.
 */
export function crossingAreas(
  grid: MarchGrid,
  direction: Direction8,
  arrival?: (edgeCell: number) => boolean,
): Set<number> {
  const step = GRID_STEPS[direction];
  const w = grid.width;
  const h = grid.height;
  const gi = step.x > 0 ? w - 1 : 0;
  const gj = step.y > 0 ? h - 1 : 0;
  const areas = marchAreas(grid);
  const corner = step.x !== 0 && step.y !== 0;
  const along = corner ? 1 : step.x !== 0 ? h : w;
  const open = new Set<number>();
  for (let k = 0; k < along; k++) {
    const c = corner ? gj * w + gi : step.x !== 0 ? k * w + gi : gj * w + k;
    const area = marchAreaOf(areas, w, c);
    if (area > 0 && !open.has(area) && (!arrival || arrival(c))) open.add(area);
  }
  return open;
}

/**
 * Trasa k okraji mapy ve směru `direction` (war.md – Přechod okrajem): k nejbližší buňce okraje
 * (sever = +z, východ = +x – `GRID_STEPS`), pro kterou platí `arrival` (plán 2026-11-16-dense-forest
 * – Rozhodnutí 8: protějšek na sousední mapě je průchozí; chybí = každá); úhlopříčný směr vede do
 * rohu mapy. Konec trasy je střed okrajové buňky – odtud `edgeCrossing` převede vojsko na sousední
 * mapu. Stojí-li skupina v takové buňce okraje, jde rovně do jejího středu; jinak jako `marchPath`
 * (únik do oblasti s přechodem, hledání, vyhlazení). Nedosažitelný přechod null – pozná se předem ze
 * souvislých oblastí, bez hledání.
 */
export function marchPathToEdge(
  grid: MarchGrid,
  from: Pos,
  direction: Direction8,
  arrival?: (edgeCell: number) => boolean,
): MarchPath | null {
  const step = GRID_STEPS[direction];
  const w = grid.width;
  const h = grid.height;
  const gi = step.x > 0 ? w - 1 : 0;
  const gj = step.y > 0 ? h - 1 : 0;
  const crossing = (c: number): boolean => {
    const i = c % w;
    const j = (c - i) / w;
    return (step.x === 0 || i === gi) && (step.y === 0 || j === gj) && (!arrival || arrival(c));
  };
  const at = marchCellAt(grid, from);
  if (crossing(at)) return pathAlong(grid, [from, marchCellCenter(grid, at)]);
  // oblasti s průchodnou buňkou přechodu – jinak by hledání vyčerpalo oblast
  const open = crossingAreas(grid, direction, arrival);
  if (open.size === 0) return null;
  const start = departureOf(grid, at, (a) => open.has(a));
  if (start < 0 || !open.has(marchArea(grid, start))) return null;
  const cells = gridSearch(grid, start, crossing, (i, j) =>
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
