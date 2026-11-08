import { distanceToMask } from '../grid';
import { borderDistance, cheapestPath, edgePenalty, reliefOf } from '../premium/river';
import type { Random } from '../random';
import { inwardOf, portTile } from './ports-map';
import { SKELETON_MAP } from './rules-map';
import type { SkeletonRiverPort, SkeletonSlice } from './types';

// Trasy řek mapy z kostry (world-skeleton.md – Mapa z kostry, krok 2): nejlevnější cesta nízkými
// místy od nejširšího vtoku (u pramene od bodu uvnitř mapy) k výtoku, ostatní vtoky jako přítoky
// do hlavního toku – soutok aspoň `junctionEdgeCells` od okraje. Tok vtéká a vytéká kolmo
// k okraji přesně v bodě výřezu. Tvar koryta (meandry, šířka, brody) dá až `carveRiverCourses`.

type Cell = { x: number; y: number };

/** Trasa jednoho toku řeky po políčkách. */
export interface RiverCoursePlan {
  /**
   * Políčka trasy po proudu: od bodu vtoku (u pramene od políčka uvnitř mapy) k bodu výtoku,
   * u přítoku k políčku hlavního toku (soutok).
   */
  readonly cells: readonly Cell[];
  /** Šířka vody na začátku a na konci toku (m) – z bodů výřezu. */
  readonly fromWidthM: number;
  readonly toWidthM: number;
  /** Index hlavního toku (v poli plánů), do kterého přítok ústí; null = hlavní tok. */
  readonly joins: number | null;
}

function clampCell(v: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, v));
}

/** Rovný úsek kolmo od bodu okraje dovnitř mapy – políčko bodu a `portLeadCells` dalších. */
function leadIn(port: SkeletonRiverPort, size: number): Cell[] {
  const tile = portTile(port.side, port.at, size);
  const n = inwardOf(port.side);
  const cells: Cell[] = [];
  for (let k = 0; k <= SKELETON_MAP.portLeadCells; k++) {
    cells.push({ x: tile.x + n.x * k, y: tile.y + n.y * k });
  }
  return cells;
}

/** Pramen: políčko `sourceCells` od výtoku do mapy, podél strany posunuté ze seedu. */
function sourceCell(out: SkeletonRiverPort, size: number, random: Random): Cell {
  const tile = portTile(out.side, out.at, size);
  const n = inwardOf(out.side);
  const shift = Math.round((2 * random.next() - 1) * SKELETON_MAP.sourceShiftCells);
  const low = SKELETON_MAP.portLeadCells;
  const high = size - 1 - SKELETON_MAP.portLeadCells;
  return {
    x: clampCell(tile.x + n.x * SKELETON_MAP.sourceCells + (n.x === 0 ? shift : 0), low, high),
    y: clampCell(tile.y + n.y * SKELETON_MAP.sourceCells + (n.y === 0 ? shift : 0), low, high),
  };
}

const index = (p: Cell, size: number): number => p.y * size + p.x;

/**
 * Cena kroku trasy jako u řeky prémie (`routeSideRiver`): nízká místa levnější, strmé kroky
 * a pás u okraje dražší; `near` (vzdálenost od jiných toků) zdraží pás `courseGapCells` kolem nich.
 */
function courseCost(
  heights: Float32Array,
  size: number,
  blocked: Uint8Array,
  near: Float32Array | null,
): (from: number, to: number, length: number) => number {
  const { min, max } = reliefOf(heights);
  const relief = Math.max(1, max - min);
  const gap = SKELETON_MAP.courseGapCells;
  return (from, to, length) => {
    if (blocked[to]) return Infinity;
    const crowd = near ? (1.5 * Math.max(0, 2 * gap - near[to]!)) / gap : 0;
    return (
      length * (1 + (4 * (heights[to]! - min)) / relief + edgePenalty(to, size) + crowd) +
      4 * Math.abs(heights[to]! - heights[from]!)
    );
  };
}

function toCells(path: readonly number[], size: number): Cell[] {
  return path.map((i) => ({ x: i % size, y: Math.floor(i / size) }));
}

/**
 * Trasy řek mapy z bodů výřezu: hlavní tok (index 0) od nejširšího vtoku – u pramene od bodu
 * `sourceCells` od výtoku do mapy – k výtoku, ostatní vtoky k nejlevněji dosažitelnému políčku
 * hlavního toku aspoň `junctionEdgeCells` od okraje. [] = výřez bez řeky, null = trasa nevede
 * (pokus krajiny pak neprojde). Výřez s vtokem bez výtoku je chybný (`RangeError`).
 */
export function planRiverCourses(
  heights: Float32Array,
  size: number,
  slice: SkeletonSlice,
  random: Random,
): RiverCoursePlan[] | null {
  const inflows = slice.rivers.filter((p) => p.flow === 'in');
  const outflows = slice.rivers.filter((p) => p.flow === 'out');
  if (outflows.length === 0 && inflows.length === 0) return [];
  if (outflows.length !== 1) {
    throw new RangeError(`Výřez kostry má ${outflows.length} výtoků řeky – smí mít právě jeden.`);
  }
  const out = outflows[0]!;
  const main = inflows.reduce<SkeletonRiverPort | null>(
    (best, p) => (best === null || p.widthM > best.widthM ? p : best),
    null,
  );
  const tributaries = inflows.filter((p) => p !== main);

  // Rovné úseky u bodů okraje – trasy jiných toků jimi nevedou.
  const leads = new Map(slice.rivers.map((p) => [p, leadIn(p, size)]));
  const leadMask = (except: SkeletonRiverPort): Uint8Array => {
    const mask = new Uint8Array(size * size);
    for (const [port, cells] of leads) {
      if (port === except) continue;
      for (const c of cells) mask[index(c, size)] = 1;
    }
    return mask;
  };

  const outLead = leads.get(out)!;
  const outTip = index(outLead.at(-1)!, size);
  const head = main ? leads.get(main)! : [sourceCell(out, size, random)];
  const mainBlocked = leadMask(main ?? out);
  if (main) for (const c of outLead) mainBlocked[index(c, size)] = 0;
  const mainPath = cheapestPath(
    size,
    [index(head.at(-1)!, size)],
    courseCost(heights, size, mainBlocked, null),
    (i) => i === outTip,
  );
  if (!mainPath) return null;
  const mainCells = [
    ...head,
    ...toCells(mainPath, size).slice(1),
    ...[...outLead].reverse().slice(1),
  ];
  const plans: RiverCoursePlan[] = [
    {
      cells: mainCells,
      fromWidthM: main ? main.widthM : out.widthM,
      toWidthM: out.widthM,
      joins: null,
    },
  ];

  const mainMask = new Uint8Array(size * size);
  for (const c of mainCells) mainMask[index(c, size)] = 1;
  const taken = Uint8Array.from(mainMask);
  for (const port of tributaries) {
    const lead = leads.get(port)!;
    const blocked = leadMask(port);
    for (let i = 0; i < blocked.length; i++) if (taken[i]) blocked[i] = 1;
    const goal = (i: number): boolean =>
      mainMask[i] === 1 && borderDistance(i, size) >= SKELETON_MAP.junctionEdgeCells;
    for (let i = 0; i < blocked.length; i++) if (goal(i)) blocked[i] = 0;
    const path = cheapestPath(
      size,
      [index(lead.at(-1)!, size)],
      courseCost(heights, size, blocked, distanceToMask(taken, size)),
      goal,
    );
    if (!path) return null;
    const cells = [...lead, ...toCells(path, size).slice(1)];
    plans.push({ cells, fromWidthM: port.widthM, toWidthM: port.widthM, joins: 0 });
    for (const c of cells) taken[index(c, size)] = 1;
  }
  return plans;
}
