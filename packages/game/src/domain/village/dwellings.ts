import { isFertileAdult, occupants } from './people';
import { BETTER_DWELLING, DWELLINGS, UNLOCK_MIN_ADULTS } from './rules';
import type { Dwelling, DwellingType, VillageState } from './types';

const DAYS_PER_YEAR = 365.25; // věk obydlí v (neceločíselných) letech
const DAYS_PER_COST_YEAR = 365; // roční společná práce se dělí 365 dny

function findDwelling(state: VillageState, dwellingId: number): Dwelling | undefined {
  return state.dwellings.find((d) => d.id === dwellingId);
}

/** Počet lidí v obydlí minus jeho kapacita (kladné = přeplněno). */
function crowding(state: VillageState, dwelling: Dwelling): number {
  return occupants(state, dwelling.id).length - DWELLINGS[dwelling.type].capacity;
}

/** Plná domácnost: lidí aspoň tolik, kolik je kapacita obydlí. */
export function isFull(state: VillageState, dwellingId: number, day: number): boolean {
  void day; // obyvatelé se počítají podle stavu, den je v podpisu kvůli jednotnému API
  const dwelling = findDwelling(state, dwellingId);
  return dwelling !== undefined && crowding(state, dwelling) >= 0;
}

/** Přeplněná domácnost: lidí víc, než je kapacita obydlí. */
export function isOvercrowded(state: VillageState, dwellingId: number, day: number): boolean {
  void day; // obyvatelé se počítají podle stavu, den je v podpisu kvůli jednotnému API
  const dwelling = findDwelling(state, dwellingId);
  return dwelling !== undefined && crowding(state, dwelling) > 0;
}

/**
 * Obydlí, jejichž domácnost je plná a má aspoň 4 dospělé (14–44 let – starší se nepočítají,
 * population.md – Pojmy a Odemčení); od nejvíc přeplněné, při shodě podle id. Dva nejmladší
 * dospělí tak můžou odejít a dva zůstanou – zbytek domácnosti se po jejich odchodu nerozpadne.
 */
export function qualifyingDwellings(state: VillageState, day: number): Dwelling[] {
  return state.dwellings
    .filter(
      (d) =>
        crowding(state, d) >= 0 &&
        occupants(state, d.id).filter((p) => isFertileAdult(p, day)).length >= UNLOCK_MIN_ADULTS,
    )
    .sort((a, b) => crowding(state, b) - crowding(state, a) || a.id - b.id);
}

/** Lze zahájit další obydlí: kvalifikujících domácností je víc než rozestavěných obydlí. */
export function canStartNewDwelling(state: VillageState, day: number): boolean {
  const building = state.constructions.filter((c) => c.kind === 'dwelling').length;
  return qualifyingDwellings(state, day).length > building;
}

function fractionalAge(dwelling: Dwelling, day: number): number {
  return (day - dwelling.builtDay) / DAYS_PER_YEAR;
}

/** Potřebné opravy za den (člověkodny): roční potřeba na konci životnosti × (věk / životnost)² / 365. */
export function repairNeedPerDay(dwelling: Dwelling, day: number): number {
  const spec = DWELLINGS[dwelling.type];
  const ratio = fractionalAge(dwelling, day) / spec.lifespanYears;
  return (spec.repairAtEndOfLifePerYear * ratio ** 2) / DAYS_PER_COST_YEAR;
}

/** Nedodělek oprav (potřeba − odvedená práce) ubírá stav o nedodělek / cena, nejméně na 0. */
export function applyRepairs(dwelling: Dwelling, workDone: number, need: number): void {
  const shortfall = need - workDone;
  if (shortfall <= 0) return;
  dwelling.condition = Math.max(0, dwelling.condition - shortfall / DWELLINGS[dwelling.type].cost);
}

/** Obyvatelé chtějí přestavět: obydlí dožilo, nebo je na nule. */
export function wantsRebuild(dwelling: Dwelling, day: number): boolean {
  return (
    fractionalAge(dwelling, day) >= DWELLINGS[dwelling.type].lifespanYears ||
    dwelling.condition <= 0
  );
}

/** Lepší obydlí, když průměrná společná práce za rok pokryje jeho cenu, jinak stejný typ. */
export function rebuildType(current: DwellingType, averageCommonLaborPerDay: number): DwellingType {
  const better = BETTER_DWELLING[current];
  return averageCommonLaborPerDay * DAYS_PER_COST_YEAR >= DWELLINGS[better].cost ? better : current;
}
