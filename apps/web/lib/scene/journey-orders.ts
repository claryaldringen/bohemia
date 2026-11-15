import type { Direction8, GridCell, JourneyOrder, Pos } from '@bohemia/game';
import { GRID_STEPS } from '@bohemia/game';

// Rozkaz vybraným lidem z kliknutí do scény (expeditions.md – Výběr a skupina): pravé tlačítko na
// zem dá `go` (s mapou, kterou scéna ukazuje), u okraje mapy `cross` na souseda v tom směru
// (rohy úhlopříčně).
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
 * Rozkaz z pravého kliknutí: bez vybraných lidí nebo mimo terén null (pravé tlačítko pak ruší
 * výběr jako dosud); v okrajovém pásu `cross` na souseda políčka `cell`, jinak `go` na bod
 * na mapě `cell`.
 */
export function orderFromClick(input: {
  selected: boolean;
  point: Pos | null;
  mapSizeM: number;
  cell: GridCell;
}): JourneyOrder | null {
  if (!input.selected || input.point === null) return null;
  const direction = edgeDirection(input.point, input.mapSizeM);
  if (direction === null) {
    return {
      kind: 'go',
      pos: { x: input.point.x, z: input.point.z },
      cell: { x: input.cell.x, y: input.cell.y },
    };
  }
  const step = GRID_STEPS[direction];
  return { kind: 'cross', cell: { x: input.cell.x + step.x, y: input.cell.y + step.y } };
}

/** Co udělat s pravým kliknutím vybraných lidí. */
export type OrderClick =
  { kind: 'send'; order: JourneyOrder } | { kind: 'refuse'; text: string } | { kind: 'none' };

/**
 * Rozhodne o pravém kliknutí vybraných lidí (expeditions.md – Výběr a skupina: důvod u kurzoru):
 * mimo terén nebo dokud rozkaz čeká na odpověď (`sending` – dvojité pravé kliknutí nevyšle
 * dvakrát) nic; nemůže-li nikdo z vybraných (`refusal`, česky), ukáže se důvod u kurzoru a výběr
 * zůstává; jinak se rozkaz odešle.
 */
export function orderClick(input: {
  order: JourneyOrder | null;
  refusal: string | null;
  sending?: boolean;
}): OrderClick {
  if (input.order === null || input.sending === true) return { kind: 'none' };
  if (input.refusal !== null) return { kind: 'refuse', text: input.refusal };
  return { kind: 'send', order: input.order };
}
