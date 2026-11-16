import { length2 } from '../landscape';
import { quantizedStep } from '../village/paths/network-search';
import type { MarchPath } from './march';
import { marchCellAt, marchCellCenter, type MarchGrid, type Pos } from './march-grid';

// Tvar trasy pochodu (war.md – Pohyb – Terén; plán 2026-11-16-dense-forest – Rozhodnutí 6): řetěz
// buněk z hledání (`gridSearch`) se vyhladí přímkami na dohled jako v 0 A.D. a úseky se rozdělí na
// hranicích změny tempa – `marchProgress` je pak přesný. Jen det-math – trasu počítá server
// i prohlížeč.

/**
 * Průchod úsečky a → b buňkami mřížky (Amanatides–Woo, souřadnice v buňkách – buňka i pokrývá
 * [i − ½; i + ½) kolem středu). `cell(c, t0, t1)` dostane každou buňku, kterou úsečka projde,
 * s podílem délky od `a` při vstupu a výstupu (buňka jen dotčená v krajním bodě má t0 = t1).
 * Prochází-li úsečka přesně rohem, dostane `corner(c1, c2)` obě buňky u rohu, pak se jde úhlopříčně.
 * False z kterékoli zastaví průchod a vrátí false. Buňka mimo mapu je nejbližší okrajová (jako
 * `marchCellAt`).
 */
function traverse(
  grid: MarchGrid,
  a: Pos,
  b: Pos,
  cell: (c: number, t0: number, t1: number) => boolean,
  corner: (c1: number, c2: number) => boolean,
): boolean {
  const w = grid.width;
  const h = grid.height;
  const fx0 = (a.x - grid.originX) / grid.cellM + 0.5;
  const fz0 = (a.z - grid.originZ) / grid.cellM + 0.5;
  const fx1 = (b.x - grid.originX) / grid.cellM + 0.5;
  const fz1 = (b.z - grid.originZ) / grid.cellM + 0.5;
  let i = Math.floor(fx0);
  let j = Math.floor(fz0);
  const i1 = Math.floor(fx1);
  const j1 = Math.floor(fz1);
  const dx = fx1 - fx0;
  const dz = fz1 - fz0;
  const si = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sj = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = si !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdz = sj !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = si > 0 ? (i + 1 - fx0) * tdx : si < 0 ? (fx0 - i) * tdx : Infinity;
  let tz = sj > 0 ? (j + 1 - fz0) * tdz : sj < 0 ? (fz0 - j) * tdz : Infinity;
  const at = (ii: number, jj: number): number =>
    Math.min(h - 1, Math.max(0, jj)) * w + Math.min(w - 1, Math.max(0, ii));
  let t = 0;
  // každý krok přiblíží buňku k cílové; pojistka proti NaN (NaN !== NaN) a nekonečným souřadnicím –
  // úsečka uvnitř mapy má nejvýš w + h kroků
  let guard = Math.min(Math.abs(i1 - i) + Math.abs(j1 - j), 2 * (w + h) + 4);
  while ((i !== i1 || j !== j1) && guard-- > 0) {
    // na poslední řádek či sloupec už jen po druhé ose – zaokrouhlení nevybočí za cílovou buňku
    const both = i !== i1 && j !== j1 && Math.abs(tx - tz) < 1e-12;
    const alongX = j === j1 || (i !== i1 && tx < tz);
    const next = Math.min(1, Math.max(t, both || alongX ? tx : tz));
    if (!cell(at(i, j), t, next)) return false;
    t = next;
    if (both) {
      if (!corner(at(i + si, j), at(i, j + sj))) return false;
      i += si;
      j += sj;
      tx += tdx;
      tz += tdz;
    } else if (alongX) {
      i += si;
      tx += tdx;
    } else {
      j += sj;
      tz += tdz;
    }
  }
  return cell(at(i, j), t, 1);
}

const passable = (grid: MarchGrid, c: number): boolean => grid.pace[c]! > 0;

/**
 * Dohled po mřížce (Rozhodnutí 6): úsečka a → b vede jen průchodnými buňkami (supercover – i buňka
 * dotčená v krajním bodě). Prochází-li přesně rohem, musí být průchodné obě buňky u rohu – jako
 * úhlopříčný krok hledání.
 */
export function lineOfSight(grid: MarchGrid, a: Pos, b: Pos): boolean {
  return traverse(
    grid,
    a,
    b,
    (c) => passable(grid, c),
    (c1, c2) => passable(grid, c1) && passable(grid, c2),
  );
}

const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.z === b.z;

/**
 * Vyhlazení řetězu buněk z hledání (Rozhodnutí 6): body trasy z `from` (v první buňce) do `to`
 * (v poslední buňce), první a poslední přesně. Kandidáti jsou zlomy řetězu (mění se směr kroku)
 * a cíl; dopředný hladový tah – od kotvy ke kandidátům po řadě, dokud jsou na dohled
 * (`lineOfSight`), a bod je poslední viděný. Když z přesného bodu kotvy na další kandidát dohled
 * není, jde trasa přes střed buňky kotvy – odtud vede k dalšímu zlomu rovný úsek řetězu, tedy
 * dohled vždy; nevidí-li ani střed na přesný cíl, jde přes střed cílové buňky.
 */
export function smoothCells(grid: MarchGrid, cells: readonly number[], from: Pos, to: Pos): Pos[] {
  const n = cells.length;
  const points: Pos[] = [{ x: from.x, z: from.z }];
  if (n <= 1) {
    points.push({ x: to.x, z: to.z });
    return points;
  }
  const w = grid.width;
  const stepOf = (k: number): number => {
    const a = cells[k - 1]!;
    const b = cells[k]!;
    const di = (b % w) - (a % w);
    return (b - a - di) / w + 3 * di;
  };
  const turns: number[] = [];
  for (let k = 1; k + 1 < n; k++) if (stepOf(k) !== stepOf(k + 1)) turns.push(k);
  turns.push(n - 1);
  const pointOf = (q: number): Pos => {
    const k = turns[q]!;
    return k === n - 1 ? { x: to.x, z: to.z } : marchCellCenter(grid, cells[k]!);
  };
  let anchor = points[0]!;
  let anchorCell = 0;
  let next = 0;
  while (next < turns.length) {
    let best = -1;
    let seen: Pos | null = null;
    for (let q = next; q < turns.length; q++) {
      const p = pointOf(q);
      if (!lineOfSight(grid, anchor, p)) break;
      best = q;
      seen = p;
    }
    if (seen !== null) {
      points.push(seen);
      anchor = seen;
      anchorCell = turns[best]!;
      next = best + 1;
      continue;
    }
    const centre = marchCellCenter(grid, cells[anchorCell]!);
    if (!samePos(centre, anchor)) {
      points.push(centre);
      anchor = centre;
      continue;
    }
    const k = turns[next]!;
    if (k === n - 1) {
      // střed cílové buňky, pak přesný cíl (leží v ní)
      const last = marchCellCenter(grid, cells[n - 1]!);
      if (!samePos(last, anchor)) points.push(last);
      points.push({ x: to.x, z: to.z });
      break;
    }
    // ze středu na další zlom je rovný úsek řetězu – sem se nedojde; pro jistotu po řetězu
    anchor = marchCellCenter(grid, cells[k]!);
    points.push(anchor);
    anchorCell = k;
    next++;
  }
  return points;
}

/**
 * Trasa podél bodů (Rozhodnutí 6): úseky se rozdělí na hranicích, kde se mění tempo buňky – na
 * hranici přibude bod (s buňkou, do které úsek vstupuje); `meadowM` je součet
 * `quantizedStep(délka ÷ tempo)` po kouscích stejného tempa, takže `marchProgress` je přesný.
 * Neprůchodná buňka (únik ze startu, vstup do stavby cíle) má tempo louky 1. Body přesně
 * opakované se vynechají; trasa má aspoň dva body (start a cíl).
 */
export function pathAlong(grid: MarchGrid, points: readonly Pos[]): MarchPath {
  const first = points[0]!;
  const out: Pos[] = [{ x: first.x, z: first.z }];
  const cells = [marchCellAt(grid, first)];
  const meadowM = [0];
  let lengthM = 0;
  const paceOf = (c: number): number => {
    const pace = grid.pace[c]!;
    return pace > 0 ? pace : 1;
  };
  const add = (p: Pos, c: number, pace: number): void => {
    const last = out[out.length - 1]!;
    const len = length2(p.x - last.x, p.z - last.z);
    lengthM += len;
    meadowM.push(meadowM[meadowM.length - 1]! + (len > 0 ? quantizedStep(len / pace) : 0));
    out.push(p);
    cells.push(c);
  };
  for (let k = 1; k < points.length; k++) {
    const a = out[out.length - 1]!;
    const b = points[k]!;
    if (samePos(a, b)) continue;
    let pace = -1;
    traverse(
      grid,
      a,
      b,
      (c, t0, t1) => {
        if (t1 <= t0) return true;
        const cellPace = paceOf(c);
        if (pace < 0) pace = cellPace;
        else if (cellPace !== pace && t0 > 0) {
          add({ x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 }, c, pace);
          pace = cellPace;
        }
        return true;
      },
      () => true,
    );
    add({ x: b.x, z: b.z }, marchCellAt(grid, b), pace < 0 ? 1 : pace);
  }
  if (out.length === 1) add({ x: first.x, z: first.z }, cells[0]!, 1);
  return { points: out, cells, meadowM, lengthM };
}
