import type { Landscape, ObstacleLayer } from '../landscape';
import { taskPosition, taskSpans } from './field-progress';
import { partWalkDistance } from './fields';
import { bandLengthM, bandPartWeight, furrowEfficiency, ploughLayout } from './plough-blocks';
import { villageCartRoutes } from './paths/roads';
import { TEAM_TRAVEL } from './rules';
import { fieldGridOf } from './squares';
import { squareCenter } from './square-grid';
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
  return furrowEfficiency(bandLengthM(band, partsById)) * travelShare(plough.trip.costM);
}

/**
 * Očekávaný výkon orby pro plán osevu (podíl výkonu u referenční brázdy): průměr výkonu podle
 * délky brázdy přes pásy, na které by se díly polí `parts` rozpadly (váhou dílů). Bez dílů 1.
 */
export function plannedFurrowEfficiency(parts: readonly FieldPart[]): number {
  const { bands } = ploughLayout(parts);
  const byId = new Map(parts.map((p) => [p.id, p]));
  let weight = 0;
  let sum = 0;
  for (const band of bands) {
    const w = band.partIds.reduce((s, id) => s + bandPartWeight(byId.get(id)!), 0);
    weight += w;
    sum += w * furrowEfficiency(bandLengthM(band, byId));
  }
  return weight > 0 ? sum / weight : 1;
}
