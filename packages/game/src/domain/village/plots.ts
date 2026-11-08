// Pozemky starších polozemnic (population.md – Umístění obydlí, Martin 18. 10. 2026): polozemnice
// postavené před pozemky (bez `plot`) dostanou při načtení vsi políčko, na kterém dům stojí, když
// je volné (`withPlots`); jinak zůstanou bez pozemku do příští přestavby, která je postaví na
// nejbližším volném políčku (`relocationPlot`). Čisté funkce bez I/O.
import { obstaclesOf, tileCenterWorld, tileOfWorldPoint } from '../landscape';
import type { Landscape, ObstacleLayer } from '../landscape';
import { recordClearedObstacles } from './obstacles';
import {
  checkPlotPlacement,
  existingPlotSquare,
  forestEdgeDistanceM,
  nearestPlotVariant,
  placementVillageOf,
  plotHousePosition,
  type PlacementVillage,
  type PlotPlacementCheck,
} from './placement';
import { PLOT_RELOCATION_M, PLOT_TYPES, PLOT_VARIANTS } from './rules';
import type { Dwelling, DwellingPlot, DwellingType, Position, VillageState } from './types';
import { addLogs, logsFromClearedTrees } from './wood';

/** Ves pro kontrolu pozemku bez obydlí `dwellingId` a stavby `constructionId` (ty se přesouvají). */
function villageWithout(
  state: VillageState,
  day: number,
  except: { dwellingId?: number; constructionId?: number },
): PlacementVillage {
  return {
    ...placementVillageOf(state, day),
    dwellings: state.dwellings.filter((d) => d.id !== except.dwellingId),
    constructions: state.constructions.filter((c) => c.id !== except.constructionId),
  };
}

/** Odstraní překážky pozemku natrvalo, dospělé stromy nevyhrazené jinou stavbou dají klády. */
function clearPlot(
  state: VillageState,
  day: number,
  clearing: { obstacleIds?: number[]; clearedTrees?: number },
  at: { x: number; z: number },
): void {
  recordClearedObstacles(state, clearing.obstacleIds ?? [], day);
  const logs = logsFromClearedTrees(clearing.clearedTrees ?? 0);
  if (logs > 0) addLogs(state, logs, at);
}

/**
 * Starší ves (bez `plotsMigrated`): každá polozemnice – hotová i rozestavěná, kromě řemeslných
 * dílen (crafts.md – stojí volně) – bez pozemku
 * dostane políčko, na kterém stojí střed domu, když je volné (pole, hřbitov, sad, jiný pozemek
 * či obydlí, posvátný dub, háj, voda ani výchoz na něm nejsou). Varianta podle toho, kde na
 * políčku dům stojí (`nearestPlotVariant`); blíž místu varianty než PLOT_SNAP_M se dům na něj
 * posune, jinak zůstane, kde je, i s natočením. Překážky na políčku se odstraní jako u nového
 * pozemku (práci navíc převod nestojí). Polozemnice na obsazeném políčku zůstane bez pozemku do
 * příští přestavby (`relocationPlot`). Obydlí v pořadí id; jednou převedená ves (`plotsMigrated`)
 * se vrací beze změny – i když se políčko později uvolní.
 */
export function withPlots(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): VillageState {
  if (state.plotsMigrated) return state;
  const next = structuredClone(state);
  next.plotsMigrated = true;
  const day = Math.max(0, next.lastDay);
  const assign = (
    position: Position,
    except: { dwellingId?: number; constructionId?: number },
  ): { plot: DwellingPlot; position: Position } | null => {
    const cell = tileOfWorldPoint(landscape, position.x, position.z);
    if (!cell) return null;
    const square = existingPlotSquare(
      landscape,
      villageWithout(next, day, except),
      cell,
      obstacles,
    );
    if (!square.ok) return null;
    clearPlot(next, day, square, position);
    const { variant, snapped } = nearestPlotVariant(landscape, cell, position);
    return { plot: { cell, variant }, position: snapped ?? position };
  };
  // řemeslné dílny (crafts.md) stojí volně bez pozemku – i ty na polozemnici
  const needsPlot = (type: DwellingType | null, plot?: DwellingPlot, craft?: unknown): boolean =>
    type !== null && PLOT_TYPES[type] && !plot && craft === undefined;
  for (const d of [...next.dwellings].sort((a, b) => a.id - b.id)) {
    if (!needsPlot(d.type, d.plot, d.workshop)) continue;
    const site = assign(d.position, { dwellingId: d.id });
    if (!site) continue;
    d.plot = site.plot;
    d.position = site.position;
  }
  for (const c of [...next.constructions].sort((a, b) => a.id - b.id)) {
    if (
      c.kind !== 'dwelling' ||
      c.position === null ||
      !needsPlot(c.dwellingType, c.plot, c.craft)
    ) {
      continue;
    }
    const site = assign(c.position, { constructionId: c.id });
    if (!site) continue;
    c.plot = site.plot;
    c.position = site.position;
  }
  return next;
}

/** Strany, kam od políčka domu dvorce zkusit dvůr (sloupec, řádek – řádek roste k +z). */
const YARD_SIDES: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
];

/** Kopie pozemku (i se dvorem dvorce). */
export function copyPlot(plot: DwellingPlot): DwellingPlot {
  return {
    cell: { x: plot.cell.x, y: plot.cell.y },
    variant: plot.variant,
    ...(plot.yard ? { yard: { x: plot.yard.x, y: plot.yard.y } } : {}),
    ...(plot.square
      ? { square: { x: plot.square.x, z: plot.square.z, rotation: plot.square.rotation } }
      : {}),
  };
}

/** Pozemek pro přestavbu: políčko, varianta, poloha domu, překážky a vzdálenost k lesu. */
export interface RelocationPlot {
  plot: DwellingPlot;
  position: Position;
  check: PlotPlacementCheck;
  forestDistanceM: number;
}

/**
 * Přestavba polozemnice bez pozemku (i přestavba zemnice na polozemnici), u dvorce (trade.md) i na
 * pozemku dvou políček – dům a dvůr vedle něj (`YARD_SIDES`): nejbližší políčko do
 * PLOT_RELOCATION_M od domu (ke středu políčka; při shodě nižší řádek a sloupec), na které smí
 * nový pozemek (`checkPlotPlacement` – jako při stavbě, jen bez obydlí samotného, to se
 * přestavbou přesune, a bez čtverců polí a sadů). Varianty od té, kde by dům stál nejblíž starému místu. Žádné → null,
 * obydlí se přestaví na místě bez pozemku.
 */
export function relocationPlot(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  dwelling: Pick<Dwelling, 'id' | 'position'>,
  type: DwellingType,
  day: number,
): RelocationPlot | null {
  if (!PLOT_TYPES[type]) return null;
  const village = villageWithout(state, day, { dwellingId: dwelling.id });
  const { x, z } = dwelling.position;
  const reach = Math.ceil(PLOT_RELOCATION_M / landscape.cellSizeM) + 1;
  const home = tileOfWorldPoint(landscape, x, z);
  if (!home) return null;
  const candidates: { cell: { x: number; y: number }; distance: number }[] = [];
  for (let cy = home.y - reach; cy <= home.y + reach; cy++) {
    for (let cx = home.x - reach; cx <= home.x + reach; cx++) {
      if (cx < 0 || cy < 0 || cx >= landscape.size || cy >= landscape.size) continue;
      const center = tileCenterWorld(landscape, cx, cy);
      const distance = Math.hypot(center.x - x, center.z - z);
      if (distance <= PLOT_RELOCATION_M) candidates.push({ cell: { x: cx, y: cy }, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  // dvorec vojvody (trade.md): políčko domu a dvůr vedle něj – dvůr napřed vpředu (−z, vchod
  // k brance jako u ostatních pozemků), pak vpravo, vlevo a vzadu
  if (type === 'dvorec') {
    for (const { cell } of candidates) {
      for (const [dx, dy] of YARD_SIDES) {
        const plot: DwellingPlot = {
          cell,
          variant: 'center',
          yard: { x: cell.x + dx, y: cell.y + dy },
        };
        const check = checkPlotPlacement(landscape, village, type, plot, obstacles, {
          takeLand: false,
        });
        if (!check.ok || !check.position) continue;
        return {
          plot,
          position: check.position,
          check,
          forestDistanceM: forestEdgeDistanceM(landscape, check.position.x, check.position.z),
        };
      }
    }
    return null;
  }
  for (const { cell } of candidates) {
    const variants = [...PLOT_VARIANTS].sort((a, b) => {
      const pa = plotHousePosition(landscape, { cell, variant: a });
      const pb = plotHousePosition(landscape, { cell, variant: b });
      return Math.hypot(pa.x - x, pa.z - z) - Math.hypot(pb.x - x, pb.z - z);
    });
    for (const variant of variants) {
      const plot = { cell, variant };
      // obyvatelé si nový pozemek na poli ani v sadu nevezmou – to rozhoduje jen hráč
      const check = checkPlotPlacement(landscape, village, type, plot, obstacles, {
        takeLand: false,
      });
      if (!check.ok || !check.position) continue;
      return {
        plot,
        position: check.position,
        check,
        forestDistanceM: forestEdgeDistanceM(landscape, check.position.x, check.position.z),
      };
    }
  }
  return null;
}
