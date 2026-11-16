// Výstupy hotových zemských stezek na kraj mapy (trade.md – Zemská stezka, Pokračování na sousední
// mapě; plán 2026-11-16-dense-forest – Rozhodnutí 13, návrh Clauda): kde stezka opouští mapu a na
// které sousední políčko vede. Souhrn vsi je nese (`VillageDigest.trailExits`), sousední mapa z nich
// odvodí vstupy pokračování (`trailEntriesOf`) a mřížka pochodu vlastní mapy kus průseku od konce
// osy ke kraji (`marchGrid`). Jen det-math – mřížku počítá i prohlížeč.
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape';
import { EDGE_MARGIN_M } from '../paths/terrain';
import { TRAIL } from '../rules';
import type { Direction8, Road, RoadPoint, Trail, VillageState } from '../types';
import { DIRECTION_VECTORS } from './trail-axis';

/** Polovina strany mapy (m) – strany mapy leží na ±960 m. */
const HALF_M = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;

/**
 * Pásmo u kraje mapy, kde zemská stezka končí (m): `EDGE_MARGIN_M` + `TRAIL.edgeBandM` = 30 m
 * (trasa stezky míří do `TRAIL.edgeBandM` od kraje schůdné krajiny – `trail.ts`, `targetCell`).
 * Úhlopříčná stezka s koncem do něj od obou stran vede rohem, konec do něj od bodu okraje dostane
 * v mřížce pochodu průsek až k okraji.
 */
export const TRAIL_END_BAND_M = EDGE_MARGIN_M + TRAIL.edgeBandM;

/**
 * Výstup hotové stezky na kraj mapy: `direction` = krok k sousednímu políčku (`GRID_STEPS` –
 * úhlopříčná stezka bez rohu vede na políčko přes stranu), `end` = konec osy stezky, `edge` = bod
 * okraje této mapy (strana ±960 m – kolmý průmět konce, u rohu roh), `builtDay` = den dostavění.
 */
export interface TrailExit {
  direction: Direction8;
  end: RoadPoint;
  edge: RoadPoint;
  builtDay: number;
}

/** Strana mapy jako krok ve směru (pořadí jako `DIRECTIONS` – N, E, S, W). */
const SIDES: readonly { direction: Direction8; axis: 'x' | 'z'; sign: number }[] = [
  { direction: 'N', axis: 'z', sign: 1 },
  { direction: 'E', axis: 'x', sign: 1 },
  { direction: 'S', axis: 'z', sign: -1 },
  { direction: 'W', axis: 'x', sign: -1 },
];

/** Tolerance pásu konce (m) – jako `EDGE_SLACK_M` v `trailAxisRoads` (`trail-axis.ts`). */
const END_SLACK_M = 1;

/**
 * Konec osy stezky: nejdále položený bod cest všech jejích úseků ve směru stezky (největší
 * `x·v.x + z·v.z`; úseky mohou být mimo pořadí); stezka bez jediné cesty ve vsi null.
 */
function axisEnd(roads: readonly Road[], trail: Trail): RoadPoint | null {
  const v = DIRECTION_VECTORS[trail.direction];
  let end: RoadPoint | null = null;
  let best = -Infinity;
  for (const piece of trail.pieces) {
    const road = roads.find((r) => r.id === piece.roadId);
    for (const p of road?.points ?? []) {
      const along = p.x * v.x + p.z * v.z;
      if (along >= best) {
        best = along;
        end = p;
      }
    }
  }
  return end;
}

/**
 * Výstup stezky ve směru `direction` s koncem osy `end`: strany jen ze složek směru stezky; mezera
 * ke straně = 960 m − souřadnice konce ve směru strany. Úhlopříčná stezka s oběma mezerami do
 * `TRAIL_END_BAND_M` vede rohem (obě souřadnice ±960 m); jinak strana s menší mezerou (remíza –
 * dřív v `DIRECTIONS`) a kolmý průmět konce na ni. Konec dál než `TRAIL_END_BAND_M` (+ 1 m) od
 * strany, kterou stezka opouští, výstup nemá (rozbitá stezka – null).
 */
function exitOf(direction: Direction8, end: RoadPoint, builtDay: number): TrailExit | null {
  const v = DIRECTION_VECTORS[direction];
  const sides = SIDES.filter((s) => (s.axis === 'x' ? v.x : v.z) * s.sign > 0).map((s) => ({
    ...s,
    gap: HALF_M - s.sign * end[s.axis],
  }));
  if (sides.length === 2 && sides.every((s) => s.gap <= TRAIL_END_BAND_M + END_SLACK_M)) {
    const corner = { x: end.x, z: end.z };
    for (const s of sides) corner[s.axis] = s.sign * HALF_M;
    return { direction, end: { x: end.x, z: end.z }, edge: corner, builtDay };
  }
  let side = sides[0]!;
  for (const s of sides) if (s.gap < side.gap) side = s;
  if (side.gap > TRAIL_END_BAND_M + END_SLACK_M) return null;
  const edge = { x: end.x, z: end.z };
  edge[side.axis] = side.sign * HALF_M;
  return { direction: side.direction, end: { x: end.x, z: end.z }, edge, builtDay };
}

/**
 * Výstupy hotových stezek vsi na kraj mapy v pořadí `trails` (stezka ve stavbě výstup nemá). Konec
 * osy je nejdále položený bod cest všech úseků ve směru stezky (zmizelá cesta se přeskočí); výstup
 * je jen tehdy, když konec leží v pásu `TRAIL_END_BAND_M` (+ 1 m) u strany, kterou stezka opouští –
 * rozbitá stezka (mezera) se na okraj nepromítá, stejný predikát jako díl u okraje v mřížce pochodu.
 */
export function trailExitsOf(state: Pick<VillageState, 'trails' | 'roads'>): TrailExit[] {
  const exits: TrailExit[] = [];
  const roads = state.roads?.roads ?? [];
  for (const trail of state.trails ?? []) {
    if (trail.builtDay === null) continue;
    const end = axisEnd(roads, trail);
    if (!end) continue;
    const exit = exitOf(trail.direction, end, trail.builtDay);
    if (exit) exits.push(exit);
  }
  return exits;
}
