// Kdo bydlí v nadzemním domě (log-house.md – Kdo v domě bydlí; Martin 12. 11. 2026: „Pokud bude
// takový dům prázdný tak se do něj nastěhuje někdo z elity“, „Nadzemní dům ať primárně obsadí cizí
// řemeslníci, pak kněz, pak synové hlavní manželky a pak synové vedlejších manželek“). Prázdný
// nadzemní dům – vypletený (`vypleteny`) i roubený (`srub`) – obsadí jen lidé z pořadí – obyčejná
// rodina ani vystěhovaná domácnost ne. Elita bydlí v nejlepším volném domě: do uvolněného lepšího
// domu se přestěhuje nejvýš postavená rodina z horšího (log-house.md – Dům s vypletenými stěnami;
// Martin 14. 11. 2026: „napřed si domy vybírá elita a pak se postupně obsazují podle společenského
// postavení“). Čisté funkce nad stavem vsi, `settleLogHouse` stav mění.
import { isDisused } from '../buildings/disused';
import { isHouseType, type HouseType } from '../buildings/log-house';
import { DWELLING_QUALITY } from '../rules';
import { pruneDisplaced } from './displaced';
import { currentLord, holdsManor, isLineMan } from './dynasty';
import { byAge, unmarriedHere } from './families';
import { moveIn } from './move-in';
import { householdBreaksUp, occupants } from './people';
import type { Dwelling, Person, VillageState } from '../types';

/**
 * Je obydlí nadzemní dům – vypletený (`vypleteny`) nebo srub (`srub`)? Dvorec od roku 800
 * (`dvorec-srub`) ne – to je dvorec. Nadzemní dílna (workshops.md) taky ne – bydlí v ní rodina
 * řemeslníka jako v dnešní dílně.
 */
export function isLogHouse(dwelling: Dwelling): boolean {
  return isHouseType(dwelling.type) && dwelling.workshop === undefined;
}

/** Je `dwelling` prázdný nadzemní dům, který jde osídlit (v provozu, bez dílny)? */
export function isEmptyLogHouse(state: VillageState, dwelling: Dwelling): boolean {
  return (
    isLogHouse(dwelling) &&
    !isDisused(dwelling) &&
    !state.people.some((p) => p.dwellingId === dwelling.id)
  );
}

/**
 * Skupina pořadí muže `p` (log-house.md – Kdo v domě bydlí): 0 mistr huti (`mason`), 1 kněz,
 * 2 syn hlavní manželky – muž rodu s příznakem `elite`, 3 syn vedlejší manželky – muž rodu bez
 * `mainWifeSon`; dnešní vojvoda ani nikdo jiný v pořadí není (undefined).
 */
function logHouseRank(state: VillageState, p: Person): number | undefined {
  if (p.sex !== 'male') return undefined;
  if (p.mason !== undefined) return 0;
  if (p.priest === true) return 1;
  if (!isLineMan(p) || currentLord(state)?.id === p.id) return undefined;
  if (p.elite === true) return 2;
  return p.mainWifeSon === true ? undefined : 3;
}

/**
 * Rodina muže `man` z jeho obydlí (log-house.md – Kdo v domě bydlí, návrh Clauda): on, jeho ženy
 * z domu (u muže rodu i vedlejší – jako `familiesOf`) a jejich svobodné děti z domu; svobodný
 * bezdětný muž sám.
 */
function familyOf(state: VillageState, man: Person): Person[] {
  const members = occupants(state, man.dwellingId);
  const wives = members.filter((w) => w.sex === 'female' && w.spouseId === man.id);
  const wifeIds = new Set(wives.map((w) => w.id));
  const children = members.filter(
    (c) =>
      c.id !== man.id &&
      !wifeIds.has(c.id) &&
      (c.fatherId === man.id || (c.motherId !== undefined && wifeIds.has(c.motherId))) &&
      unmarriedHere(c, members),
  );
  return [man, ...wives, ...children];
}

/**
 * Rodiny, které smí do prázdného nadzemního domu typu `type`, v pořadí (log-house.md – Kdo v domě
 * bydlí): mistři huti → kněz → synové hlavní manželky (`elite`) → synové vedlejších manželek, ve
 * skupině od nejstaršího (pak nižší id). Muž, který už v nadzemním domě stejně dobrém nebo lepším
 * (`DWELLING_QUALITY`) bydlí, ani dnešní vojvoda se nestěhuje (Martin); z horšího nadzemního domu
 * se stěhuje do lepšího (log-house.md – Dům s vypletenými stěnami). Bez `type` jen rodiny, které
 * v žádném nadzemním domě nebydlí. Ženatý přijde s manželkou a svobodnými dětmi, svobodný sám;
 * rodina s vojvodou nebo * s tím, kdo drží dvorec (`holdsManor`), neodchází. Jako u jiných obydlí
 * (návrh Clauda) jen rodina, * která dům udrží (někdo 16–44), a jen když se zbytek domácnosti
 * nerozpadne – jinak by se rozpadlá * domácnost vrátila a druhý den odešla znovu. Kdo jde s otcem,
 * další rodinu nezakládá.
 */
export function logHouseFamilies(
  state: VillageState,
  day: number,
  type: HouseType = 'vypleteny',
): Person[][] {
  const byId = new Map(state.dwellings.map((d) => [d.id, d]));
  const lord = currentLord(state);
  const ranked = state.people
    .map((p) => ({ p, rank: logHouseRank(state, p) }))
    .filter((r): r is { p: Person; rank: number } => r.rank !== undefined)
    .filter(({ p }) => {
      const at = byId.get(p.dwellingId);
      return (
        at === undefined || !isLogHouse(at) || DWELLING_QUALITY[at.type] < DWELLING_QUALITY[type]
      );
    })
    .sort((a, b) => a.rank - b.rank || byAge(a.p, b.p));
  const taken = new Set<number>();
  const out: Person[][] = [];
  for (const { p } of ranked) {
    if (taken.has(p.id)) continue;
    const family = familyOf(state, p);
    if (family.some((m) => taken.has(m.id) || m === lord || holdsManor(state, m, day))) continue;
    if (householdBreaksUp(family, day)) continue;
    const rest = occupants(state, p.dwellingId).filter((m) => !family.includes(m));
    if (householdBreaksUp(rest, day)) continue;
    for (const m of family) taken.add(m.id);
    out.push(family);
  }
  return out;
}

/**
 * Prázdný nadzemní dům `dwellingId` obsadí první rodina z pořadí, která v tak dobrém domě ještě
 * nebydlí (`logHouseFamilies`; dům, který tím uvolní, osídlí `occupyEmptyDwellings`; kronika
 * `household-founded`, z dvorce i `son-left-manor`); host z `displaced` (mistr ve dvorci) z
 * seznamu hostů zmizí. Bez nikoho z pořadí zůstane dům prázdný. Vrací, jestli se někdo nastěhoval
 * (mutuje stav).
 */
export function settleLogHouse(state: VillageState, day: number, dwellingId: number): boolean {
  const dwelling = state.dwellings.find((d) => d.id === dwellingId);
  if (!dwelling || !isEmptyLogHouse(state, dwelling) || !isHouseType(dwelling.type)) return false;
  const family = logHouseFamilies(state, day, dwelling.type)[0];
  if (!family) return false;
  moveIn(state, day, family, dwellingId);
  pruneDisplaced(state);
  return true;
}

/**
 * Kolik rodin z pořadí nebydlí v žádném nadzemním domě a do prázdného by se nastěhovalo
 * (`logHouseFamilies` – vojvoda ve dvorci ne, syn, který by šel s otcem, zvlášť ne) – pro správce
 * (log-house.md – Správce).
 */
export function logHouseWaiting(state: VillageState, day: number): number {
  return logHouseFamilies(state, day).length;
}
