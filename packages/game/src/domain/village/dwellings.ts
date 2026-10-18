import { isAdult, occupants } from './people';
import {
  BETTER_DWELLING,
  COMMON_LABOR_YEAR_DAYS,
  DWELLINGS,
  DWELLING_TREES,
  NEW_HOUSEHOLD_MIN_ADULTS,
} from './rules';
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
 * population.md – Nové obydlí); od nejvíc přeplněné, při shodě podle id. Z takové domácnosti
 * se dva nejmladší dospělí přestěhují do nového (prázdného) obydlí a dva zůstanou – zbytek
 * domácnosti se po jejich odchodu nerozpadne.
 */
export function qualifyingDwellings(state: VillageState, day: number): Dwelling[] {
  return state.dwellings
    .filter(
      (d) =>
        crowding(state, d) >= 0 &&
        occupants(state, d.id).filter((p) => isAdult(p, day)).length >= NEW_HOUSEHOLD_MIN_ADULTS,
    )
    .sort((a, b) => crowding(state, b) - crowding(state, a) || a.id - b.id);
}

/**
 * Lidé k osídlení nového obydlí (population.md – Odemčení): domácnosti, ze kterých se může
 * oddělit mladý pár (`qualifyingDwellings`), minus prázdná obydlí a rozestavěná nová obydlí –
 * každé už jeden pár čeká. První zemnice zakladatelů (stavba s `dwellingId`) nikoho nečeká,
 * zakladatelé ji osídlí sami. Může vyjít záporně (obydlí postavená do zásoby).
 */
export function availableSettlers(state: VillageState, day: number): number {
  const building = state.constructions.filter(
    (c) => c.kind === 'dwelling' && c.dwellingId === null,
  ).length;
  const empty = state.dwellings.filter((d) => occupants(state, d.id).length === 0).length;
  return qualifyingDwellings(state, day).length - building - empty;
}

/**
 * Kolik plných domácností nemá kam se rozdělit – na každou z nich nečeká prázdné ani
 * rozestavěné obydlí (= kladní `availableSettlers`). Upozornění „Domácnost je plná“.
 */
export function waitingHouseholds(state: VillageState, day: number): number {
  return Math.max(0, availableSettlers(state, day));
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

/**
 * Lepší obydlí, když na něj ves má suroviny (population.md – Chátrání a přestavba): roční průměr
 * denní společné práce (`yearlyCommonLabor`) za rok pokryje jeho cenu a klády na hromadě se
 * stromy, které jde skácet (`wood`), stačí na jeho dřevo. Jinak stejný typ.
 */
export function rebuildType(
  current: DwellingType,
  yearlyCommonLaborPerDay: number,
  wood: number,
): DwellingType {
  const better = BETTER_DWELLING[current];
  const labor = yearlyCommonLaborPerDay * DAYS_PER_COST_YEAR >= DWELLINGS[better].cost;
  return labor && wood >= DWELLING_TREES[better] ? better : current;
}

/**
 * Roční průměr denní společné práce vsi; starší ves bez něj – průměr posledních 30 dní
 * (`commonLaborHistory`).
 */
export function yearlyCommonLabor(
  state: Pick<VillageState, 'commonLaborYearly' | 'commonLaborHistory'>,
): number {
  if (state.commonLaborYearly !== undefined) return state.commonLaborYearly;
  const history = state.commonLaborHistory;
  return history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
}

/** Roční průměr po dni se společnou prací `common` (exponenciální, konstanta jeden rok). */
export function nextYearlyCommonLabor(previous: number, common: number): number {
  return previous + (common - previous) / COMMON_LABOR_YEAR_DAYS;
}
