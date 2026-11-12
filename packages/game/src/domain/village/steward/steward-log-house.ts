import { dwellingYearReason } from '../buildings/log-house';
import { isEmptyLogHouse, logHouseWaiting } from '../people/log-house-settle';
import { startDwelling, type StewardContext } from './steward';
import type { VillageState } from '../types';

// Správce a nadzemní dům (log-house.md – Správce; návrh Clauda): od roku 800, když z pořadí čeká
// rodina (mistr huti, kněz, synové vojvody) a žádný nadzemní dům není prázdný ani rozestavěný,
// začne jeden – na slotu plánu obydlí jako ostatní obydlí (cena předem, dřevo, veto hráče).

/** Rozestavěný nový nadzemní dům (`srub`) – stěhující se domácnost a dvorec se nepočítají. */
function buildingLogHouses(state: VillageState): number {
  return state.constructions.filter(
    (c) => c.kind === 'dwelling' && c.dwellingType === 'srub' && c.dwellingId === null,
  ).length;
}

/** Prázdné nadzemní domy, které čekají na rodinu z pořadí. */
function emptyLogHouses(state: VillageState): number {
  return state.dwellings.filter((d) => isEmptyLogHouse(state, d)).length;
}

/**
 * Kolik rodin z pořadí dostane nadzemní dům, který stojí prázdný nebo se staví (jeden dům = jedna
 * rodina). Tyto rodiny jsou zároveň v `waitingHouseholds` (ženatý syn čekající ve dvorci) – správce
 * je od čekajících odečte, aby pro ně nezačal zároveň polozemnici (dvojí stavba).
 */
export function logHouseCovered(state: VillageState, day: number): number {
  const houses = emptyLogHouses(state) + buildingLogHouses(state);
  return houses === 0 ? 0 : Math.min(houses, logHouseWaiting(state, day));
}

/**
 * Krok před obydlím (mutuje stav): od roku 800 začne jeden nadzemní dům, když z pořadí čeká
 * rodina a žádný nadzemní dům není prázdný ani rozestavěný.
 */
export function logHouseStep(state: VillageState, ctx: StewardContext): void {
  if (dwellingYearReason('srub', ctx.day) !== null) return;
  if (emptyLogHouses(state) > 0 || buildingLogHouses(state) > 0) return;
  if (logHouseWaiting(state, ctx.day) <= 0) return;
  startDwelling(state, ctx, 'srub');
}
