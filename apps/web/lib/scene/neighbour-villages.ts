import type { DwellingPlot, ForeignStructures, SquareGrid, TileCell } from '@bohemia/game';
import type { SceneNeighbour } from '../departure-view';
import { scenePenSquares, type ScenePlot, type SceneVillage } from '../village-view';
import type { VillageTarget } from './village-picking';

// Stavby jiných vsí na téže mapě ve scéně (migration.md – Vsi na téže mapě): jen pohled – kreslí
// se s ostatními stavbami vsi (obydlí, pole, hřbitovy, sady, ohrady, zbytky jam, modly
// a svatyně) s id posunutými mimo rozsah vlastní vsi, vybrat je nejde a kontrola umístění je zná
// jako cizí půdu. Čisté funkce bez Babylonu.

/** Posun id staveb k-té jiné vsi: (k + 1) × NEIGHBOUR_ID_BASE – vlastní ves tak vysoko nesahá. */
export const NEIGHBOUR_ID_BASE = 10_000_000;

/** Patří id stavby jiné vsi na téže mapě (posunuté `withNeighbourVillages`)? */
export function isNeighbourId(id: number): boolean {
  return id >= NEIGHBOUR_ID_BASE;
}

/** Je vybraný cíl stavba jiné vsi (ta se nevybírá)? */
export function isNeighbourTarget(target: VillageTarget): boolean {
  if (target.kind === 'dwellings') return target.ids.some(isNeighbourId);
  if (target.kind === 'sacred-oak' || target.kind === 'grove') return false;
  return isNeighbourId(target.id);
}

/**
 * Ves pro scénu i se stavbami jiných vsí na téže mapě (`scene.neighbours`) – přidané k vlastním
 * stavbám s posunutými id. Bez jiných vsí vrací tentýž objekt.
 */
export function withNeighbourVillages(scene: SceneVillage): SceneVillage {
  const neighbours = scene.neighbours;
  if (!neighbours || neighbours.length === 0) return scene;
  const dwellings = [...scene.dwellings];
  const fields = [...scene.fields];
  const cemeteries = [...(scene.cemeteries ?? [])];
  const orchards = [...(scene.orchards ?? [])];
  const pens = [...(scene.pens ?? [])];
  const ruins = [...(scene.ruins ?? [])];
  const buildings = [...(scene.sacred?.buildings ?? [])];
  neighbours.forEach((n: SceneNeighbour, k) => {
    const base = (k + 1) * NEIGHBOUR_ID_BASE;
    dwellings.push(...n.dwellings.map((d) => ({ ...d, id: base + d.id })));
    fields.push(
      ...n.fields.map((f) => ({
        ...f,
        id: base + f.id,
        parts: f.parts.map((p) => (p.id === undefined ? p : { ...p, id: base + p.id })),
      })),
    );
    cemeteries.push(...(n.cemeteries ?? []).map((c) => ({ ...c, id: base + c.id })));
    orchards.push(...(n.orchards ?? []).map((o) => ({ ...o, id: base + o.id })));
    pens.push(...(n.pens ?? []).map((p) => ({ ...p, id: base + p.id })));
    ruins.push(...(n.ruins ?? []).map((r) => ({ ...r, id: base + r.id })));
    buildings.push(...(n.sacredBuildings ?? []).map((b) => ({ ...b, id: base + b.id })));
  });
  return {
    ...scene,
    dwellings,
    fields,
    cemeteries,
    orchards,
    pens,
    ruins,
    ...(buildings.length > 0
      ? {
          sacred: {
            oaks: scene.sacred?.oaks ?? [],
            groves: scene.sacred?.groves ?? [],
            ...scene.sacred,
            buildings,
          },
        }
      : {}),
  };
}

/**
 * Pozemek ze scény pro kontrolu umístění (vlastní ves i jiné vsi) – i s dvorem dvorce (trade.md)
 * a natočený (střed a natočení čtverce – fields.md, Natočené stavby).
 */
export function plotOfScene(plot: ScenePlot): DwellingPlot {
  return {
    cell: plot.cell,
    variant: plot.variant,
    ...(plot.yard ? { yard: plot.yard.cell } : {}),
    ...(plot.rotation !== undefined && !plot.yard
      ? { square: { x: plot.x, z: plot.z, rotation: plot.rotation } }
      : {}),
  };
}

/**
 * Stavby a půda jiných vsí na téže mapě pro kontrolu umístění v prohlížeči (`PlacementVillage
 * .foreign`) – obydlí s pozemky (i natočenými), modly a svatyně, políčka polí, sadů, hřbitovů,
 * ohrad a pozemků a natočené čtverce polí, sadů, hřbitovů a ohrad v jejich mřížce (`squares` –
 * fields.md, Natočené stavby). Bez jiných vsí undefined.
 */
export function foreignFromScene(scene: SceneVillage): ForeignStructures | undefined {
  const neighbours = scene.neighbours;
  if (!neighbours || neighbours.length === 0) return undefined;
  const cells: TileCell[] = [];
  const squares: { cell: TileCell; grid: SquareGrid }[] = [];
  const dwellings: ForeignStructures['dwellings'][number][] = [];
  const sacredBuildings: ForeignStructures['sacredBuildings'][number][] = [];
  // čtverec v mřížce stavby – natočený zvlášť, jinak políčko krajiny
  const add = (cell: TileCell, grid: SquareGrid | undefined): void => {
    if (grid) squares.push({ cell, grid });
    else cells.push(cell);
  };
  for (const n of neighbours) {
    for (const d of n.dwellings) {
      const plot = d.plot ? plotOfScene(d.plot) : undefined;
      dwellings.push({
        type: d.type,
        position: d.position,
        ...(plot ? { plot } : {}),
        ...(d.craft ? { craft: d.craft } : {}),
      });
      // natočený pozemek zabírá obydlí podle tvaru, ne políčko pod středem
      if (plot && !plot.square) {
        cells.push(plot.cell);
        if (plot.yard) cells.push(plot.yard);
      }
    }
    for (const f of n.fields) for (const p of f.parts) add(p.cell, f.grid);
    for (const c of n.cemeteries ?? []) for (const s of c.squares) add(s.cell, c.grid);
    for (const o of n.orchards ?? []) for (const s of o.squares) add(s.cell, o.grid);
    for (const p of n.pens ?? []) for (const q of scenePenSquares(p)) add(q.cell, p.grid);
    for (const b of n.sacredBuildings ?? []) {
      sacredBuildings.push({ kind: b.kind, position: b.position });
    }
  }
  return { dwellings, sacredBuildings, cells, ...(squares.length > 0 ? { squares } : {}) };
}

/** Bod stavby ve světě (m). */
interface Point {
  x: number;
  z: number;
}

/** Body staveb vsi a jiných vsí na téže mapě – obydlí, díly polí, hřbitovy, sady, ohrady, modly. */
export function scenePoints(scene: SceneVillage): Point[] {
  const points: Point[] = [];
  const add = (s: Pick<SceneNeighbour, 'dwellings' | 'fields'> & Partial<SceneNeighbour>): void => {
    for (const d of s.dwellings) points.push({ x: d.position.x, z: d.position.z });
    for (const f of s.fields) for (const p of f.parts) points.push({ x: p.x, z: p.z });
    for (const c of s.cemeteries ?? []) for (const q of c.squares) points.push({ x: q.x, z: q.z });
    for (const o of s.orchards ?? []) for (const q of o.squares) points.push({ x: q.x, z: q.z });
    for (const p of s.pens ?? [])
      for (const q of scenePenSquares(p)) points.push({ x: q.x, z: q.z });
    for (const b of s.sacredBuildings ?? []) points.push({ x: b.position.x, z: b.position.z });
  };
  add({ ...scene, sacredBuildings: scene.sacred?.buildings ?? [] });
  for (const n of scene.neighbours ?? []) add(n);
  return points;
}

/** Vzdálenost bodu k nejbližší stavbě (m); bez staveb nekonečno. */
export function distanceToPoints(point: Point, points: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) best = Math.min(best, Math.hypot(point.x - p.x, point.z - p.z));
  return best;
}
