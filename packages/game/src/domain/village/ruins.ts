import type { Landscape } from '../landscape';
import { workshopFootprints } from './crafts';
import { dwellingFootprint, dwellingPlot } from './placement';
import { copyPlot } from './plots';
import { polygonsOverlap, type Point } from './polygon';
import { RUIN_YEARS } from './rules';
import { sacredBuildingPlots, sacredFootprint } from './sacred';
import { PolygonIndex, villageLandSquares, type LandSquare } from './squares';
import type { Dwelling, DwellingRuin, VillageState } from './types';

// Zbytky jam po zaniklých obydlích (population.md – Chátrání a přestavba, Po zániku – Martin
// 18. 10. 2026): obydlí, které zchátrá na nulu (prázdné), nebo se jeho domácnost přestěhuje na
// nový pozemek, nechá na svém místě zarostlou prohlubeň s kopřivami a pár trámy. Ta RUIN_YEARS
// let postupně zarůstá a pak zmizí. Na místo zříceniny jde stavět – stavba ji odstraní. Jen
// vzhled: simulace zříceniny nečte, kontrola umístění je nezná.

const DAYS_PER_YEAR = 365.25;
/** Jak dlouho zbytek jámy zarůstá (dny). */
const RUIN_DAYS = RUIN_YEARS * DAYS_PER_YEAR;

/**
 * Obydlí `dwellings` zanikla v den `day` – na jejich místě zůstanou zbytky jam (s typem, pozemkem
 * a řemeslem kvůli vzhledu). Volá se před tím, než obydlí ze stavu zmizí nebo se přestěhuje.
 * Mutuje stav.
 */
export function recordRuins(
  state: VillageState,
  dwellings: readonly Dwelling[],
  day: number,
): void {
  if (dwellings.length === 0) return;
  const ruins = (state.ruins ??= []);
  for (const d of dwellings) {
    ruins.push({
      id: d.id,
      type: d.type,
      position: { ...d.position },
      ...(d.plot ? { plot: copyPlot(d.plot) } : {}),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      day,
    });
  }
}

/** Jak daleko zbytek jámy zarostl 0–1 (0 = den zániku obydlí, 1 = zmizel). */
export function ruinOvergrowth(ruin: Pick<DwellingRuin, 'day'>, day: number): number {
  return Math.min(1, Math.max(0, (day - ruin.day) / RUIN_DAYS));
}

/**
 * Krok dne simulace: zbytky jam zarostlé po RUIN_YEARS zmizí, stejně jako zbytky pod stavbou
 * (i rozestavěnou – přestavba na novém pozemku). `landscape` = krajina sídla pro stavby po
 * čtvercích a pozemky; bez ní (testy, měření) se porovnávají jen půdorysy obydlí a staveb.
 * Mutuje stav; ves bez zříceniny nemění.
 */
export function updateRuins(state: VillageState, day: number, landscape: Landscape | null): void {
  const ruins = state.ruins;
  if (!ruins) return;
  const covered = builtOverRuins(state, landscape);
  const kept = ruins.filter((r) => ruinOvergrowth(r, day) < 1 && !covered.has(r));
  if (kept.length === ruins.length) return;
  if (kept.length > 0) state.ruins = kept;
  else delete state.ruins;
}

/**
 * Po akci hráče: zbytky jam pod novou stavbou (obydlí, dílna, pole, hřbitov, sad, ohrada, modla,
 * svatyně) zmizí hned – na místo zříceniny jde stavět. Vrátí nový stav, beze změny týž objekt.
 */
export function withoutBuiltOverRuins(state: VillageState, landscape: Landscape): VillageState {
  const ruins = state.ruins;
  if (!ruins || ruins.length === 0) return state;
  const covered = builtOverRuins(state, landscape);
  if (covered.size === 0) return state;
  const next: VillageState = { ...state, ruins: ruins.filter((r) => !covered.has(r)) };
  if (next.ruins!.length === 0) delete next.ruins;
  return next;
}

/** Zbytky jam, přes které stojí (nebo se staví) jiná stavba. */
function builtOverRuins(state: VillageState, landscape: Landscape | null): Set<DwellingRuin> {
  const covered = new Set<DwellingRuin>();
  const ruins = state.ruins ?? [];
  if (ruins.length === 0) return covered;
  const shapes = structureShapes(state, landscape);
  // čtverce polí, sadů, hřbitovů a ohrad (i natočené – fields.md, Natočené stavby) až na dotaz
  let squares: PolygonIndex<LandSquare> | null = null;
  for (const ruin of ruins) {
    const footprint = dwellingFootprint(ruin.type, ruin.position);
    if (shapes.some((shape) => polygonsOverlap(shape, footprint))) {
      covered.add(ruin);
      continue;
    }
    if (!landscape) continue;
    squares ??= new PolygonIndex(
      landscape,
      villageLandSquares(landscape, state, ['field', 'orchard', 'cemetery', 'pen']),
    );
    if (squares.overlapping(footprint).length > 0) covered.add(ruin);
  }
  return covered;
}

/**
 * Půdorysy obydlí a staveb s polohou (i rozestavěných – obydlí, dílny, přestavby na novém
 * pozemku, modly a svatyně); s krajinou i celá políčka pozemků.
 */
function structureShapes(state: VillageState, landscape: Landscape | null): Point[][] {
  const shapes: Point[][] = [];
  const dwelling = (d: {
    type: Dwelling['type'];
    position: Dwelling['position'];
    plot?: Dwelling['plot'];
    craft?: NonNullable<Dwelling['workshop']>['craft'];
  }): void => {
    if (landscape) shapes.push(...dwellingPlot(landscape, d));
    else if (d.craft) shapes.push(...workshopFootprints(d.craft, d.position));
    else shapes.push(dwellingFootprint(d.type, d.position));
  };
  for (const d of state.dwellings) {
    dwelling({
      type: d.type,
      position: d.position,
      ...(d.plot ? { plot: d.plot } : {}),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
    });
  }
  for (const c of state.constructions) {
    if (c.position === null || c.dwellingType === null) continue;
    if (c.kind !== 'dwelling' && c.kind !== 'rebuild') continue;
    dwelling({
      type: c.dwellingType,
      position: c.position,
      ...(c.plot ? { plot: c.plot } : {}),
      ...(c.craft ? { craft: c.craft } : {}),
    });
  }
  for (const b of sacredBuildingPlots(state)) shapes.push(sacredFootprint(b.kind, b.position));
  return shapes;
}
