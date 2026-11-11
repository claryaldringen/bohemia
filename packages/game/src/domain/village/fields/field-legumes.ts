import { cloneState } from '../core/clone';
import { craftCoverage } from '../crafts/crafts';
import { unsownPartIds } from './field-progress';
import { moveParts } from '../buildings/land-taken';
import type { VillageState } from '../types';
import { dropSeasonCrop, seasonCrop, springCrop } from '../core/year-plan';

/**
 * Převod (fields.md – Luštěniny, zrušeno; Martin 9. 11. 2026: „Luštěniny jsou podle mě
 * píčovina.“): ves luštěniny na poli už nepěstuje. Díly, které letošní plán chystá na luštěniny
 * a setí na nich nezačalo, přejdou do jaře i s hotovou přípravou půdy (`moveParts` – jako ozim po
 * konci okna setí); osivo z nich ves ještě nevzala (bere ho až setí). Zasetá a rozsetá část
 * luštěnin doroste a sklidí se (návrh Clauda – osivo už je v zemi a převod by ho ztratil). Výběr
 * dílů z paměti, ve kterém čekají luštěniny, propadne i s jeho osivem – ves vybere znovu. Jednou,
 * idempotentně: plán bez nezasetých luštěnin se nemění. Vstupní stav nemění.
 */
export function withoutFieldLegumes(state: VillageState): VillageState {
  const season = state.season;
  if (!season) return state;
  const day = state.lastDay;
  const legume = seasonCrop(season, 'legume');
  const unsown = legume ? unsownPartIds(state, legume, day) : [];
  const waiting = season.selection?.waiting.some((j) => j.crop === 'legume') ?? false;
  if (unsown.length === 0 && !waiting) return state;
  const next = cloneState(state);
  const plan = next.season!;
  if (waiting) delete plan.selection;
  const from = seasonCrop(plan, 'legume');
  if (from && unsown.length > 0) {
    moveParts(next, plan, from, springCrop(plan), unsown, day, craftCoverage(next, day).tools);
    const moved = new Set(unsown);
    for (const part of next.parts) if (moved.has(part.id)) part.crop = 'spring';
    if (from.partIds.length === 0) dropSeasonCrop(plan, 'legume');
  }
  return next;
}
