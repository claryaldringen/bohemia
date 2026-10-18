import { occupants } from './people';
import { BETTER_DWELLING, COMMON_LABOR_YEAR_DAYS, DWELLINGS, DWELLING_TREES } from './rules';
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

function fractionalAge(dwelling: Dwelling, day: number): number {
  return (day - dwelling.builtDay) / DAYS_PER_YEAR;
}

/** Potřebné opravy za den (člověkodny): roční potřeba na konci životnosti × (věk / životnost)² / 365. */
export function repairNeedPerDay(dwelling: Dwelling, day: number): number {
  const spec = DWELLINGS[dwelling.type];
  const ratio = fractionalAge(dwelling, day) / spec.lifespanYears;
  return (spec.repairAtEndOfLifePerYear * ratio ** 2) / DAYS_PER_COST_YEAR;
}

/**
 * Nedodělek oprav (potřeba − odvedená práce) ubírá stav o nedodělek / cena, nejméně na 0. Jen pro
 * prázdné obydlí (`decayEmptyDwelling` – neopravuje ho nikdo): obydlený dům stav drží, jeho
 * obyvatelé ho opravují (Martin, 18. 10. 2026 – population.md, Chátrání a přestavba).
 */
export function applyRepairs(dwelling: Dwelling, workDone: number, need: number): void {
  const shortfall = need - workDone;
  if (shortfall <= 0) return;
  dwelling.condition = Math.max(0, dwelling.condition - shortfall / DWELLINGS[dwelling.type].cost);
}

/**
 * Den prázdného obydlí (population.md – Prázdné obydlí): neopravuje se – stav ubývá o celou
 * potřebu oprav podle stáří (`repairNeedPerDay`) – a navíc o pevný denní podíl, protože se
 * nevytápí, došky hnijí, dřevo v zemi trouchniví a nikdo nespraví střechu (Martin, 18. 10. 2026):
 * nové prázdné obydlí spadne z plného stavu na nulu zhruba za `emptyLifespanYears`. Stav nikdy
 * neklesne pod 0; po znovuosídlení stav dál neklesá (obyvatelé dům opravují), ale ani se nezvedá.
 */
export function decayEmptyDwelling(dwelling: Dwelling, day: number): void {
  applyRepairs(dwelling, 0, repairNeedPerDay(dwelling, day));
  const perDay = 1 / (DWELLINGS[dwelling.type].emptyLifespanYears * DAYS_PER_YEAR);
  dwelling.condition = Math.max(0, dwelling.condition - perDay);
}

/**
 * Obyvatelé chtějí přestavět: obydlí dožilo (životnost). Rozhoduje jen stáří – obydlený dům
 * nechátrá, na nulu spadne jen prázdný (ten zanikne).
 */
export function wantsRebuild(dwelling: Dwelling, day: number): boolean {
  return fractionalAge(dwelling, day) >= DWELLINGS[dwelling.type].lifespanYears;
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
