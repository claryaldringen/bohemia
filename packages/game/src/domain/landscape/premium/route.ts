import { length2 } from '../det-math';
import { buildRelief } from '../relief';
import { SURFACE_CODES, type Landscape } from '../types';
import type { SkeletonRoute } from '../skeleton/route';
import { tileCenterWorld } from '../world';
import type { WorldPoint } from './geometry';
import { cheapestPath } from './river';
import type { PremiumSite } from './types';

// Stezky prémiových krajin od okraje k okraji mapy – přes brod pod vyvýšeninou (`water.ts`)
// a přes horský průsmyk (`relief.ts`). Hledají se v hotové krajině na serveru i v prohlížeči,
// proto jen det-math. Úseky jsou nejlevnější cesty po políčkách souše (sklon a les zdražují),
// stezka obchází ves bodem obejití a nakonec se vyhladí.

/**
 * Stezka kolem vsi: nejblíž `villageMinM` od místa pro vesnici – hledá se po políčkách
 * s rezervou na vyhlazení (`villageMinCells`); ves obchází bodem obejití `passCells` od ní
 * (≈ 200 m), ať ves leží u stezky.
 */
export const VILLAGE_ROUTE = {
  villageMinM: 150,
  villageMinCells: 11,
  passCells: 13,
} as const;

type Cell = { x: number; y: number };

/** Políčko indexu. */
export function cellXY(i: number, size: number): Cell {
  return { x: i % size, y: Math.floor(i / size) };
}

/** Leží políčko na okraji mapy? */
export function onBorder(i: number, size: number): boolean {
  const c = cellXY(i, size);
  return c.x === 0 || c.y === 0 || c.x === size - 1 || c.y === size - 1;
}

/** Cena kroku stezky na políčko: 1 + (sklon / 10 %)² a les o 35 % dražší. */
export function trailCellCost(l: Landscape): (i: number) => number {
  const { size, surface, cellSizeM } = l;
  const relief = buildRelief(l);
  const extent = (size * cellSizeM) / 2;
  return (i) => {
    const wx = -extent + ((i % size) + 0.5) * cellSizeM;
    const wz = -extent + (Math.floor(i / size) + 0.5) * cellSizeM;
    const s = relief.slopeAt(wx, wz) / 0.1;
    return 1 + s * s + (surface[i] === SURFACE_CODES.forest ? 0.35 : 0);
  };
}

/**
 * Úsek stezky: nejlevnější cesta po povolených políčkách z `from` k prvnímu povolenému cíli
 * (políčka od startu k cíli), nebo null.
 */
export function routeLeg(
  size: number,
  from: number,
  allowed: (i: number) => boolean,
  cellCost: (i: number) => number,
  goal: (i: number) => boolean,
): number[] | null {
  return cheapestPath(
    size,
    [from],
    (_, to, length) => (allowed(to) ? length * cellCost(to) : Infinity),
    (i) => allowed(i) && goal(i),
  );
}

/**
 * Bod obejití vsi: na kružnici `VILLAGE_ROUTE.passCells` (až o 4 políčka dál) kolem vsi bokem
 * ke směru od `from` ke vsi – napřed vlevo, pak vpravo; první povolené políčko, jinak −1.
 */
export function villageBypass(
  size: number,
  village: Cell,
  from: Cell,
  allowed: (i: number) => boolean,
): number {
  const ux = village.x - from.x;
  const uy = village.y - from.y;
  const ul = length2(ux, uy) || 1;
  let pass = -1;
  for (const turn of [1, -1] as const) {
    for (let r = VILLAGE_ROUTE.passCells; r <= VILLAGE_ROUTE.passCells + 4 && pass < 0; r++) {
      const x = Math.round(village.x + ((-uy * turn) / ul) * r);
      const y = Math.round(village.y + ((ux * turn) / ul) * r);
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (allowed(y * size + x)) pass = y * size + x;
    }
    if (pass >= 0) break;
  }
  return pass;
}

/** Střed políčka ve světě jako bod čáry. */
export function cellWorld(l: Landscape, i: number): WorldPoint {
  const c = tileCenterWorld(l, i % l.size, Math.floor(i / l.size));
  return [c.x, c.z];
}

/** Konec čáry posunutý na nejbližší okraj mapy (čára pak vede přesně od okraje k okraji). */
export function toEdge(l: Landscape, [x, z]: WorldPoint): WorldPoint {
  const h = (l.size * l.cellSizeM) / 2;
  const options: [number, WorldPoint][] = [
    [x + h, [-h, z]],
    [h - x, [h, z]],
    [z + h, [x, -h]],
    [h - z, [x, h]],
  ];
  options.sort((a, b) => a[0] - b[0]);
  return options[0]![1];
}

/** Oba konce čáry na nejbližším okraji mapy. */
export function lineToEdges(l: Landscape, line: WorldPoint[]): WorldPoint[] {
  if (line.length < 2) return line;
  return [toEdge(l, line[0]!), ...line.slice(1, -1), toEdge(l, line.at(-1)!)];
}

/** Chaikinovo vyhlazení lomené čáry (konce zůstanou). */
export function smoothLine(points: WorldPoint[], passes: number): WorldPoint[] {
  let line = points;
  for (let pass = 0; pass < passes; pass++) {
    if (line.length < 3) return line;
    const next: WorldPoint[] = [line[0]!];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      if (i > 0) next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < line.length - 2) next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(line.at(-1)!);
    line = next;
  }
  return line;
}

/** Vzdálenost bodu od úsečky (m). */
export function segmentDistance(a: WorldPoint, b: WorldPoint, x: number, z: number): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return length2(a[0] + t * dx - x, a[1] + t * dz - z);
}

/** Vede čára všude aspoň `minM` od bodu? */
export function lineKeepsAway(
  line: readonly WorldPoint[],
  point: { readonly x: number; readonly z: number },
  minM: number,
): boolean {
  for (let i = 0; i + 1 < line.length; i++) {
    if (segmentDistance(line[i]!, line[i + 1]!, point.x, point.z) < minM) return false;
  }
  return true;
}

/**
 * Stezka kostry jako prvek `route` prémie na kostře (vyvýšenina nad brodem, průsmyk): oba úseky
 * trasy (`skeletonRoute` – od okraje k bodu obejití vsi) jako jedna čára od okraje k okraji;
 * null pro trasu s jiným počtem úseků než dva.
 */
export function skeletonRouteSite(route: SkeletonRoute): PremiumSite | null {
  if (route.legs.length !== 2) return null;
  const [from, to] = route.legs as readonly [readonly WorldPoint[], readonly WorldPoint[]];
  // Oba úseky končí v bodě obejití – ten jen jednou.
  const line = [...from, ...[...to].reverse().slice(1)];
  const middle = line[Math.floor(line.length / 2)]!;
  return { kind: 'route', x: middle[0], z: middle[1], line };
}
