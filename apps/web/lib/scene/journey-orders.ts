import type { Direction8, GridCell, JourneyOrder, Pos } from '@bohemia/game';
import { GRID_STEPS } from '@bohemia/game';

// Rozkaz vojvodovi z kliknutí do scény (lord-control.md – Rozkazy; plán 2026-11-13 – Úloha 8a):
// pravé tlačítko na zem dá `go`, u okraje mapy `cross` na souseda v tom směru (rohy úhlopříčně).
// Čistá logika bez Babylonu – scéna jen předá bod terénu.

/** Šířka okrajového pásu (m) – klik v něm míří přes okraj na sousední mapu. */
export const EDGE_BAND_M = 20;

/** Směr okraje, ve kterém bod leží (null = mimo okrajový pás); mapa je vystředěná v počátku. */
export function edgeDirection(point: Pos, mapSizeM: number): Direction8 | null {
  const half = mapSizeM / 2;
  const x = point.x >= half - EDGE_BAND_M ? 1 : point.x <= -half + EDGE_BAND_M ? -1 : 0;
  const y = point.z >= half - EDGE_BAND_M ? 1 : point.z <= -half + EDGE_BAND_M ? -1 : 0;
  for (const [direction, step] of Object.entries(GRID_STEPS) as [Direction8, GridCell][]) {
    if (step.x === x && step.y === y && (x !== 0 || y !== 0)) return direction;
  }
  return null;
}

/**
 * Rozkaz z pravého kliknutí: bez vybraného vojvody nebo mimo terén null (pravé tlačítko pak ruší
 * výběr jako dosud); v okrajovém pásu `cross` na souseda políčka `cell`, jinak `go` na bod.
 */
export function orderFromClick(input: {
  lordSelected: boolean;
  point: Pos | null;
  mapSizeM: number;
  cell: GridCell;
}): JourneyOrder | null {
  if (!input.lordSelected || input.point === null) return null;
  const direction = edgeDirection(input.point, input.mapSizeM);
  if (direction === null) return { kind: 'go', pos: { x: input.point.x, z: input.point.z } };
  const step = GRID_STEPS[direction];
  return { kind: 'cross', cell: { x: input.cell.x + step.x, y: input.cell.y + step.y } };
}
