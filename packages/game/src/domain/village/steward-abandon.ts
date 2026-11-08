import { dateOfDayIndex } from '../calendar';
import { setPartsAbandoned } from './abandon-parts';
import { ROTATION_FACTOR } from './field-capacity';
import { isOvergrown, partWalkDistance } from './fields';
import { STEWARD } from './rules-steward';
import type { StewardContext } from './steward';
import { fieldCellValue, fieldCells } from './steward-land';
import { isStewardBuilt } from './steward-state';
import type { VillageState } from './types';

// Opuštění dílů pole správcem (steward.md – Přestavba vlastních staveb, Pole; Martin 8. 11. 2026:
// „A“ – stejná akce pro hráče i správce, `setPartsAbandoned`). Návrh Clauda: jednou za rok, první
// den správce v září (po žních a novém osevním postupu 1. 9., výhled práce je na nový hospodářský
// rok), když pole trvale přesahuje, co ves obdělá (výhled – `lasting` `labor`), opustí díly, které
// sám založil a které v mapě hodnot vycházejí nejhůř – jen celé díly, které se vejdou do přebytku
// nad osev podle práce × `STEWARD.fieldReserve` (stejná rezerva, nad kterou pole nestaví).

const M2_PER_HA = 10_000;

/**
 * Díly, které správce opustí (stav nemění): přebytek polí v oběhu nad osev podle práce
 * × `fieldReserve` (plocha osevu × `ROTATION_FACTOR`), z něj díly správce (`steward.built`)
 * v oběhu – ne zakládané, opuštěné ani zarostlé – od nejhorší hodnoty v mapě hodnot
 * (`fieldCellValue` políčka dílu se vzdáleností chůze; při shodě nižší id), dokud se vejdou.
 */
export function partsToAbandon(state: VillageState, ctx: StewardContext): number[] {
  const { outlook } = ctx;
  if (outlook.lasting !== 'labor') return [];
  const keepHa = outlook.laborHa * STEWARD.fieldReserve;
  const excessM2 = (outlook.landHa - keepHa) * ROTATION_FACTOR * M2_PER_HA;
  if (!(excessM2 > 0)) return [];
  const cells = fieldCells(ctx.landscape, ctx.obstacles);
  const size = ctx.landscape.size;
  const ranked = state.parts
    .filter(
      (p) =>
        p.cell !== undefined &&
        p.state !== 'founding' &&
        !p.abandoned &&
        !isOvergrown(p) &&
        isStewardBuilt(state, p.id),
    )
    .map((p) => ({
      p,
      value: fieldCellValue(cells, p.cell!.y * size + p.cell!.x, partWalkDistance(p)),
    }))
    .sort((a, b) => a.value - b.value || a.p.id - b.p.id);
  const chosen: number[] = [];
  let area = 0;
  for (const { p } of ranked) {
    if (area + p.areaM2 > excessM2) break;
    area += p.areaM2;
    chosen.push(p.id);
  }
  return chosen;
}

/**
 * Krok dne správce (mutuje stav): první den správce v září opustí díly z `partsToAbandon`
 * stejnou akcí jako hráč (`setPartsAbandoned` – jeden řádek kroniky).
 */
export function abandonStep(state: VillageState, ctx: StewardContext): void {
  if (ctx.date.month !== 9 || dateOfDayIndex(ctx.day - STEWARD.everyDays).month === 9) return;
  const parts = partsToAbandon(state, ctx);
  if (parts.length > 0) setPartsAbandoned(state, ctx.day, parts, true);
}
