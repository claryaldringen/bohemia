import type { Landscape, ObstacleLayer } from '../landscape';
import { taskPosition, taskSpans } from './field-progress';
import { partWalkDistance } from './fields';
import { bandLengthM, bandPartWeight, furrowEfficiency, ploughLayout } from './plough-blocks';
import { roadCapsules, roadFreeRuns, type RoadCapsule } from './paths/road-land';
import { villageCartRoutes } from './paths/roads';
import { TEAM_TRAVEL } from './rules';
import { fieldGridOf } from './squares';
import { rotationCosSin, squareCenter } from './square-grid';
import type { CropWork, FieldPart, PloughBand, VillageState } from './types';

// Výkon spřežení za den (oxen.md – Co nejdelší brázda): kromě sazby orby ho ubírají obraty na
// souvrati (krátká brázda – `furrowEfficiency` pásu, který se právě orá) a cesta z ohrady k bloku
// a zpět (Martin, 19. 10. 2026: „na místo se dostane ideálně po nějaké už hotové cestě a pak už
// jen co nejvíce oře“; „pokud to bude rychlejší než po cestě, ať jede napříč přes pole, pokud už
// nebude oseté“ – vozová síť, dvoukolák bez nákladu: pevná cesta rychleji, louka, úhor a strniště
// jako louka, zoraný díl pomaleji, osetý nikdy).

/** Vůz dojede k dílu, když je od jeho středu nejvýš tak daleko (m) – kraj čtverce. */
const BLOCK_REACH_M = 9;

/** Pás, na kterém orba plodiny právě je (první nedokončený), a díl, kde v něm začíná. */
export function ploughFrontBand(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
): PloughBand | null {
  const bands = work.plough?.bands;
  if (!bands || bands.length === 0) return null;
  const position = taskPosition(work, 'plough');
  const front = taskSpans(work, partsById, 'plough', day).find((s) => s.end > position + 1e-9);
  if (!front) return null;
  return bands.find((band) => band.partIds.includes(front.id)) ?? null;
}

/**
 * Cena cesty spřežení k dílu (m jízdy po louce): vozovou sítí z ohrady se spřežením (s krajinou),
 * jinak chůze z obydlí k dílu.
 */
function tripCost(
  state: VillageState,
  day: number,
  part: FieldPart,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): number {
  if (landscape && part.cell) {
    const center = squareCenter(landscape, fieldGridOf(state, part.fieldId), part.cell);
    const routes = villageCartRoutes(state, day, landscape, obstacles, 'two-wheel', [
      { x: center.x, z: center.z, reachM: BLOCK_REACH_M },
    ]);
    const route = routes?.[0];
    if (route?.reached) return route.cost;
  }
  return partWalkDistance(part);
}

/** Kratší kus brázdy mezi cestami (m) se neorá – spřežení se do něj nevejde (obrat). */
const MIN_FURROW_PIECE_M = 2;

/**
 * Délka brázdy pásu (m): pás přes pevnou cestu se na ní láme (Martin, 19. 10. 2026: „pokud oráč
 * narazí na cestu, tak spřežení otočí“) – kusy mezi cestami se orají zvlášť, každý s vlastními
 * obraty, takže výkon počítá s průměrnou délkou kusu (podíl času, kdy rádlo ryje, je
 * ΣL / (ΣL + n·v·t) – jako u n brázd průměrné délky). Osa pásu jeho středem, cesty jako
 * v `roadLand` (pás a plácky rozcestí – `capsules`, jinak z cest vsi). Bez krajiny nebo cest
 * délka pásu.
 */
export function bandFurrowM(
  state: Pick<VillageState, 'fields' | 'roads'>,
  band: PloughBand,
  partsById: ReadonlyMap<number, FieldPart>,
  landscape: Landscape | null,
  capsules: readonly RoadCapsule[] | null = null,
): number {
  const length = bandLengthM(band, partsById);
  const roads = state.roads?.roads ?? [];
  const first = partsById.get(band.partIds[0]!);
  const last = partsById.get(band.partIds[band.partIds.length - 1]!);
  if (!landscape || roads.length === 0 || !first?.cell || !last?.cell) return length;
  const grid = fieldGridOf(state, first.fieldId);
  const a = squareCenter(landscape, grid, first.cell);
  const b = squareCenter(landscape, grid, last.cell);
  // podél brázdy – osa mřížky pole (jako `squareCenter`: x → (c, −s), y → (s, c))
  const [c, s] = grid ? rotationCosSin(grid.rotation) : [1, 0];
  const [dx, dz] = band.axis === 'x' ? [c, -s] : [s, c];
  const span = (b.x - a.x) * dx + (b.z - a.z) * dz;
  const half = landscape.cellSizeM / 2;
  const runs = roadFreeRuns(
    capsules ?? roadCapsules(roads),
    a.x,
    a.z,
    dx,
    dz,
    Math.min(0, span) - half,
    Math.max(0, span) + half,
    MIN_FURROW_PIECE_M,
  );
  if (runs.length === 0) return MIN_FURROW_PIECE_M;
  const free = runs.reduce((sum, r) => sum + (r.to - r.from), 0);
  // cesta pás nekříží – délka pásu jako bez cest
  if (runs.length === 1 && free >= Math.abs(span) + 2 * half - 1e-6) return length;
  return free / runs.length;
}

/** Podíl dne, který spřežení orá, když cesta tam a zpět stojí `costM` (m jízdy po louce). */
export function travelShare(costM: number): number {
  const seconds = (2 * costM) / TEAM_TRAVEL.speedMps;
  return 1 - Math.min(TEAM_TRAVEL.maxShare, seconds / TEAM_TRAVEL.dayS);
}

/**
 * Násobek denní kapacity orby plodiny (mutuje `work.plough.trip`): výkon podle délky brázdy pásu,
 * který se orá, krát podíl dne bez cesty k bloku. Cestu spočítá, když spřežení začíná nový blok
 * (`trip` jiného bloku). Plodina bez pásů (plán starší vsi) 1.
 */
export function ploughDayFactor(
  state: VillageState,
  day: number,
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): number {
  const plough = work.plough;
  const band = plough ? ploughFrontBand(work, partsById, day) : null;
  if (!plough || !band) return 1;
  if (plough.trip?.block !== band.block) {
    const first = partsById.get(band.partIds[0]!);
    plough.trip = {
      block: band.block,
      costM: first ? tripCost(state, day, first, landscape, obstacles) : 0,
    };
  }
  return (
    furrowEfficiency(bandFurrowM(state, band, partsById, landscape)) *
    travelShare(plough.trip.costM)
  );
}

/**
 * Očekávaný výkon orby pro plán osevu (podíl výkonu u referenční brázdy): průměr výkonu podle
 * délky brázdy přes pásy, na které by se díly polí `parts` rozpadly (váhou dílů); s krajinou se
 * brázda láme na pevných cestách vsi (`bandFurrowM`). Bez dílů 1.
 */
export function plannedFurrowEfficiency(
  parts: readonly FieldPart[],
  state: Pick<VillageState, 'fields' | 'roads'> | null = null,
  landscape: Landscape | null = null,
): number {
  const { bands } = ploughLayout(parts);
  const byId = new Map(parts.map((p) => [p.id, p]));
  // pásy cest jednou pro všechny pásy orby
  const capsules = state && landscape ? roadCapsules(state.roads?.roads ?? []) : null;
  let weight = 0;
  let sum = 0;
  for (const band of bands) {
    const w = band.partIds.reduce((s, id) => s + bandPartWeight(byId.get(id)!), 0);
    weight += w;
    const length =
      state && landscape
        ? bandFurrowM(state, band, byId, landscape, capsules)
        : bandLengthM(band, byId);
    sum += w * furrowEfficiency(length);
  }
  return weight > 0 ? sum / weight : 1;
}
