import { ageGroup, householdBreaksUp, isAdult, occupants } from './people';
import {
  BETTER_DWELLING,
  COMMON_LABOR_YEAR_DAYS,
  DWELLINGS,
  DWELLING_TREES,
  HOUSEHOLD_HEADS,
  NEW_HOUSEHOLD_MIN_ADULTS,
  NEW_HOUSEHOLD_MIN_PEOPLE,
} from './rules';
import type { Dwelling, DwellingType, Person, VillageState } from './types';

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
 * Dospělé děti domácnosti (population.md – Prázdné obydlí, návrh Clauda): lidé 14–44 let kromě
 * HOUSEHOLD_HEADS nejstarších lidí domácnosti od 14 let výš (rodiče, hlava domácnosti – počítají
 * se i starší nad 44). Od nejmladšího; při shodě data narození je mladší vyšší id.
 */
export function adultChildren(members: readonly Person[], day: number): Person[] {
  const heads = new Set(
    members
      .filter((p) => ageGroup(p, day) !== 'child')
      .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)
      .slice(0, HOUSEHOLD_HEADS)
      .map((p) => p.id),
  );
  return members
    .filter((p) => isAdult(p, day) && !heads.has(p.id))
    .sort((a, b) => b.bornDay - a.bornDay || b.id - a.id);
}

/** Přeplněná domácnost a její dospělé děti, které z ní můžou odejít do prázdného obydlí. */
export interface AdultChildrenSource {
  dwelling: Dwelling;
  /** Kdo odejde – od nejmladšího. */
  children: Person[];
}

/**
 * Přeplněné domácnosti (lidí víc než míst), ze kterých můžou dospělé děti odejít osídlit úplně
 * prázdné obydlí (population.md – Prázdné obydlí, návrh Clauda): od nejvíc přeplněné, při shodě
 * podle id obydlí. Odejdou všechny dospělé děti (`adultChildren`), nejvýš `capacity` – při
 * přebytku zůstanou nejstarší z nich; rodiče a děti pod 14 zůstanou. Domácnost bez dospělých
 * dětí a domácnost, jejíž zbytek by se po jejich odchodu rozpadl (`householdBreaksUp` – zůstali
 * by jen starší a děti; rozpad by je večer přestěhoval jinam a stěhovalo by se tam a zpět), tu
 * nejsou.
 */
export function adultChildrenSources(
  state: VillageState,
  day: number,
  capacity = Number.POSITIVE_INFINITY,
): AdultChildrenSource[] {
  const sources: { source: AdultChildrenSource; crowding: number }[] = [];
  for (const dwelling of state.dwellings) {
    const extra = crowding(state, dwelling);
    if (extra <= 0) continue;
    const members = occupants(state, dwelling.id);
    const children = adultChildren(members, day).slice(0, capacity);
    if (children.length === 0) continue;
    if (
      householdBreaksUp(
        members.filter((p) => !children.includes(p)),
        day,
      )
    )
      continue;
    sources.push({ source: { dwelling, children }, crowding: extra });
  }
  return sources
    .sort((a, b) => b.crowding - a.crowding || a.source.dwelling.id - b.source.dwelling.id)
    .map((x) => x.source);
}

/**
 * Kdo osídlí úplně prázdné obydlí s kapacitou `capacity`, když ho nezabral mladý pár z plné
 * domácnosti se 4 dospělými (population.md – Prázdné obydlí, návrh Clauda): dospělé děti první
 * přeplněné domácnosti v pořadí `adultChildrenSources`, která jich má aspoň dvě. Domácnost s jediným
 * dospělým dítětem ho pošle s jedním dospělým dítětem jiné takové domácnosti (první v pořadí) –
 * jediný člověk by se v novém obydlí hned rozpadl. Nikdo (prázdné pole), když takoví lidé nejsou.
 */
export function adultChildrenSettlers(
  state: VillageState,
  day: number,
  capacity: number,
): Person[] {
  const sources = adultChildrenSources(state, day, capacity);
  const single = (s: AdultChildrenSource): boolean => s.children.length < NEW_HOUSEHOLD_MIN_PEOPLE;
  for (const source of sources) {
    if (!single(source)) return source.children;
    const partner = sources.find((other) => other !== source && single(other));
    if (partner) return [...source.children, ...partner.children];
  }
  return [];
}

/**
 * Kolik nových domácností může ves založit (population.md – Lidé k osídlení): domácnosti, ze
 * kterých se může oddělit mladý pár (`qualifyingDwellings`), plus z ostatních přeplněných
 * domácností každá s aspoň dvěma dospělými dětmi jedna domácnost a jednotlivá dospělá děti po
 * dvou (zaokrouhleno dolů – `adultChildrenSources`).
 */
export function possibleNewHouseholds(state: VillageState, day: number): number {
  const qualifying = new Set(qualifyingDwellings(state, day).map((d) => d.id));
  const others = adultChildrenSources(state, day).filter((s) => !qualifying.has(s.dwelling.id));
  const families = others.filter((s) => s.children.length >= NEW_HOUSEHOLD_MIN_PEOPLE).length;
  const singles = others.length - families;
  return qualifying.size + families + Math.floor(singles / NEW_HOUSEHOLD_MIN_PEOPLE);
}

/**
 * Lidé k osídlení nového obydlí (population.md – Odemčení, Lidé k osídlení): možné nové
 * domácnosti (`possibleNewHouseholds` – mladý pár z plné domácnosti se 4 dospělými, dospělé děti
 * z přeplněné domácnosti), minus prázdná obydlí a rozestavěná nová obydlí – každé už jednu
 * domácnost čeká. První zemnice zakladatelů (stavba s `dwellingId`) nikoho nečeká, zakladatelé ji
 * osídlí sami. Může vyjít záporně (obydlí postavená do zásoby).
 */
export function availableSettlers(state: VillageState, day: number): number {
  const building = state.constructions.filter(
    (c) => c.kind === 'dwelling' && c.dwellingId === null,
  ).length;
  const empty = state.dwellings.filter((d) => occupants(state, d.id).length === 0).length;
  return possibleNewHouseholds(state, day) - building - empty;
}

/**
 * Kolik možných nových domácností nemá kam jít – na každou z nich nečeká prázdné ani rozestavěné
 * obydlí (= kladní `availableSettlers`). Upozornění „Domácnost je plná“.
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

/**
 * Den prázdného obydlí (population.md – Prázdné obydlí): neopravuje se – stav ubývá o celou
 * potřebu oprav podle stáří (`repairNeedPerDay`) – a navíc o pevný denní podíl, protože se
 * nevytápí, došky hnijí, dřevo v zemi trouchniví a nikdo nespraví střechu (Martin, 18. 10. 2026):
 * nové prázdné obydlí spadne z plného stavu na nulu zhruba za `emptyLifespanYears`. Stav nikdy
 * neklesne pod 0; po znovuosídlení se opravy vrací od stavu, který zbyl (nezvedá se).
 */
export function decayEmptyDwelling(dwelling: Dwelling, day: number): void {
  applyRepairs(dwelling, 0, repairNeedPerDay(dwelling, day));
  const perDay = 1 / (DWELLINGS[dwelling.type].emptyLifespanYears * DAYS_PER_YEAR);
  dwelling.condition = Math.max(0, dwelling.condition - perDay);
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
