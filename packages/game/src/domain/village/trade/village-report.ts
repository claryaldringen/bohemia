// Zpráva na pivo (markets.md – Pravidla 8, Rozhodnutí plánu 2, bod 7): co se o vsi povídá – lidé
// a domy zaokrouhleně, řemesla, která ve vsi pracují, a poslední obchodníci, kteří k ní přijeli.
// Čistá funkce, stav nemění.
import { ownCraftsmanWorks } from '../crafts/craft-buying';
import { MARKET } from '../rules';
import { nextMerchantVisit } from './merchant-plan';
import type { Craft, VillageReport, VillageState } from '../types';

/** Řemesla ve zprávě v pevném pořadí. */
const REPORT_CRAFTS: readonly Craft[] = ['potter', 'smith', 'burner', 'carpenter'];

/** Na násobek `MARKET.report.round`, nejméně `round`, je-li n ≥ 1; 0 → 0. */
export function roughCount(n: number): number {
  if (n < 1) return 0;
  const step = MARKET.report.round;
  return Math.max(step, Math.round(n / step) * step);
}

/**
 * Zpráva o vsi v den `day`: lidé a hotová obydlí zaokrouhleně, řemesla s pracujícím řemeslníkem
 * (`ownCraftsmanWorks`) a obchodníci z `market.arrivals` od nejnovějšího, nejvýš
 * `MARKET.report.traders` (technický strop paměti vsi, ne pravidlo hry).
 */
export function villageReport(state: VillageState, day: number): VillageReport {
  const arrivals = [...(state.market?.arrivals ?? [])].reverse();
  const traders = arrivals.sort((a, b) => b.day - a.day).slice(0, MARKET.report.traders);
  // den příštích kupců – ves bez zastávek stezky nebo bez příjezdu do konce světa ho nezná
  const merchants = state.merchantStops ? nextMerchantVisit(state.merchantStops, day) : null;
  return {
    day,
    people: roughCount(state.people.length),
    houses: roughCount(state.dwellings.filter((d) => d.builtDay <= day).length),
    crafts: REPORT_CRAFTS.filter((craft) => ownCraftsmanWorks(state, craft)),
    traders,
    ...(merchants ? { merchants: merchants.day } : {}),
  };
}
