import { cloneState } from './clone';
import { craftCoverage } from './crafts';
import { unsownPartIds } from './field-progress';
import { moveParts } from './land-taken';
import type { Crop, VillageState } from './types';
import { dropSeasonCrop, seasonCrop, springCrop } from './year-plan';

/**
 * Plodina na poli zrušená (luštěniny, len – dnes je má domácnost na zahrádce u obydlí): díly,
 * které letošní plán chystá na ni a setí na nich nezačalo, přejdou do jaře i s hotovou přípravou
 * půdy (`moveParts` – jako ozim po konci okna setí); osivo z nich ves ještě nevzala (bere ho až
 * setí). Zasetá a rozsetá část doroste a sklidí se (návrh Clauda – osivo už je v zemi a převod by
 * ho ztratil). Výběr dílů z paměti, ve kterém plodina čeká, propadne i s jeho osivem – ves vybere
 * znovu. Jednou, idempotentně: plán bez nezaseté plodiny se nemění. Vstupní stav nemění.
 */
function withoutFieldCrop(
  state: VillageState,
  crop: Extract<Crop, 'legume' | 'flax'>,
): VillageState {
  const season = state.season;
  if (!season) return state;
  const day = state.lastDay;
  const work = seasonCrop(season, crop);
  const unsown = work ? unsownPartIds(state, work, day) : [];
  const waiting = season.selection?.waiting.some((j) => j.crop === crop) ?? false;
  if (unsown.length === 0 && !waiting) return state;
  const next = cloneState(state);
  const plan = next.season!;
  if (waiting) delete plan.selection;
  const from = seasonCrop(plan, crop);
  if (from && unsown.length > 0) {
    moveParts(next, plan, from, springCrop(plan), unsown, day, craftCoverage(next, day).tools);
    const moved = new Set(unsown);
    for (const part of next.parts) if (moved.has(part.id)) part.crop = 'spring';
    if (from.partIds.length === 0) dropSeasonCrop(plan, crop);
  }
  return next;
}

/**
 * Převod (fields.md – Luštěniny, zrušeno; Martin 9. 11. 2026: „Luštěniny jsou podle mě
 * píčovina.“): ves luštěniny na poli už nepěstuje – nezasetý díl luštěnin přejde do jaře
 * (`withoutFieldCrop`).
 */
export function withoutFieldLegumes(state: VillageState): VillageState {
  return withoutFieldCrop(state, 'legume');
}

/**
 * Převod (fields.md – Len, zrušeno; Martin 9. 11. 2026: „Nebylo by lepší, kdyby si lidé řešili len
 * sami podobně, jako luštěniny?“): ves len na poli už nepěstuje – domácnost ho seje na zahrádce
 * u obydlí (`garden.ts`); nezasetý díl lnu přejde do jaře (`withoutFieldCrop`), zasetý len doroste
 * a vytrhá se.
 */
export function withoutFieldFlax(state: VillageState): VillageState {
  return withoutFieldCrop(state, 'flax');
}
