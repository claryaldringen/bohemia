import { displacedCount, pruneDisplaced, rehouseDisplaced, withoutDisplaced } from './displaced';
import { isDisused } from '../buildings/disused';
// Domácnosti po rodinách (kinship.md – Domácnosti; population.md – Nové obydlí, Martin 17.–18. 10.
// 2026: „plná domácnost → nová domácnost v novém obydlí“, „Pokud už jsou rodiče neplodní, tak ano,
// má [nejstarší zůstat]“, „pokud se lidé v domě tísní a je tam nejstarší dítě, nejstarší dítě může
// odejít do nového domu“, „ať prázdný dům obsadí i plná domácnost“; převod na rodiny návrh
// Clauda; 19. 10. 2026 Martin schválil: ženatý pár, který dům nedrží, smí odejít kdykoli, ne jen
// z plného domu). Novou domácnost zakládá ženatý syn se ženou a dětmi, nejstarší ženatý syn
// zůstává s rodiči (dědic), z plného domu smí odejít i svobodný nejstarší syn; dcery odcházejí
// sňatkem. Čisté funkce nad stavem vsi, kroky `settleNewDwelling` a `occupyEmptyDwellings` stav
// mění.
import { isFull } from '../buildings/dwellings';
import { isLineMan } from './dynasty';
import { secondaryWifeFamilies, settlingFamilies } from './dynasty-housing';
import {
  byAge,
  byCrowding,
  departingFamilies,
  isTrackedManor,
  parentHere,
  unmarriedHere,
} from './families';
import { withKinship } from './kinship';
import { HOUSE_TYPES_BEST_FIRST, isHouseType } from '../buildings/log-house';
import { isEmptyLogHouse, isLogHouse, settleLogHouse } from './log-house-settle';
import { moveIn } from './move-in';
import {
  ageGroup,
  ageYears,
  canBear,
  holdsHousehold,
  householdBreaksUp,
  occupants,
} from './people';
import { AGE } from '../rules';
import type { Dwelling, Person, VillageState } from '../types';

export {
  byCrowding,
  departingFamilies,
  familiesOf,
  leavingFamilies,
  type Family,
} from './families';

/**
 * Hlava domácnosti (obydlí `dwellingId`): nejstarší muž od dětského věku výš; v domácnosti bez muže
 * nejstarší žena (při shodě data narození nižší id). Prázdná domácnost – undefined.
 */
export function householdHead(
  people: readonly Person[],
  dwellingId: number,
  day: number,
): Person | undefined {
  const grown = people.filter((p) => p.dwellingId === dwellingId && ageGroup(p, day) !== 'child');
  const oldest = (list: readonly Person[]): Person | undefined =>
    [...list].sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)[0];
  return oldest(grown.filter((p) => p.sex === 'male')) ?? oldest(grown);
}

/**
 * Svobodný syn, který smí z plného (i přeplněného) domu `dwelling` odejít sám (Martin – „nejstarší
 * dítě může odejít“, „ať prázdný dům obsadí i plná domácnost“; kinship.md – Domácnosti): nejstarší
 * svobodný syn od 16 let (matka nebo otec bydlí v domě); bez něj jiný svobodný muž od 16 let bez
 * rodičů v domě (`lodgerOf`). Na rozdíl od ženatého páru jen z plného domu (návrh Clauda,
 * 19. 10. 2026): svobodný muž odchodem nic nezíská – ženit se smí i doma (žena se stěhuje
 * k němu) – a sám by zabral dům, na který čeká rodina. Zpátky ho vrátí nanejvýš svatba s vdovou
 * či dědičkou, která drží dům (`weddingHome`) – jednou, pak je ženatý; sestra ani matka si ho
 * nevezme (blízcí příbuzní). Dědic zůstává: když v domě ještě není ženatý syn a rodiče už jsou
 * neplodní (žádná matka synů v domě nemůže rodit), zůstává nejstarší syn a odejít smí druhý
 * nejstarší (Martin). Jen když se zbytek domácnosti nerozpadne; jinak undefined.
 */
export function loneSonOf(
  state: VillageState,
  dwelling: Dwelling,
  day: number,
): Person | undefined {
  if (!isFull(state, dwelling.id, day)) return undefined;
  const members = occupants(state, dwelling.id);
  const unmarried = unmarriedSons(members, day);
  // bez svobodného syna smí odejít i jiný svobodný muž od 16 let bez rodičů v domě (Martin,
  // 19. 10. 2026 – přeplněný dům ve Vlkově, ve vsi prázdná polozemnice); ne otec dětí z domu
  const candidate =
    (unmarriedHeir(members, day) ? unmarried[1] : unmarried[0]) ?? lodgerOf(members, day);
  // sám dům udrží jen člověk 16–44 – starší by se v novém domě rozpadl a vrátil (tam a zpět)
  if (!candidate || !holdsHousehold(candidate, day)) return undefined;
  // svobodný muž rodu z dvorce sám neodchází – cvičí, dokud se neožení (lord.md – Synové po sňatku)
  if (isLineMan(candidate) && isTrackedManor(state, dwelling)) return undefined;
  const staying = members.filter((m) => m.id !== candidate.id);
  return householdBreaksUp(staying, day) ? undefined : candidate;
}

/**
 * Nejstarší svobodný muž od 16 let domácnosti `members`, který v ní nemá rodiče (starší vsi mají
 * rodiče neznámé, bratranci, synovci) a není otcem nikoho z ní; jinak undefined.
 */
function lodgerOf(members: readonly Person[], day: number): Person | undefined {
  return members
    .filter(
      (m) =>
        m.sex === 'male' &&
        !parentHere(m, members) &&
        unmarriedHere(m, members) &&
        ageYears(m.bornDay, day) >= AGE.fertile &&
        !members.some((c) => c.fatherId === m.id),
    )
    .sort(byAge)[0];
}

/** Svobodní synové od 16 let, jejichž matka nebo otec bydlí v domácnosti `members` – od nejstaršího. */
function unmarriedSons(members: readonly Person[], day: number): Person[] {
  return members
    .filter(
      (m) =>
        m.sex === 'male' &&
        parentHere(m, members) &&
        unmarriedHere(m, members) &&
        ageYears(m.bornDay, day) >= AGE.fertile,
    )
    .sort(byAge);
}

/**
 * Svobodný dědic domácnosti `members` (kinship.md – Domácnosti, Martin): když v domě ještě není
 * ženatý syn a rodiče už jsou neplodní (žádná matka synů v domě nemůže rodit), zůstává nejstarší
 * svobodný syn od 16 let; jinak undefined (dědicem je nejstarší ženatý syn – `familiesOf`).
 */
export function unmarriedHeir(members: readonly Person[], day: number): Person | undefined {
  const sons = members.filter((m) => m.sex === 'male' && parentHere(m, members));
  if (sons.some((s) => !unmarriedHere(s, members))) return undefined;
  const mothers = members.filter((m) => sons.some((s) => s.motherId === m.id));
  if (mothers.some((m) => canBear(m, day))) return undefined;
  return unmarriedSons(members, day)[0];
}

/** Svobodní synové, kteří smí odejít sami (`loneSonOf`) – od nejvíc přeplněného (plného) domu. */
export function loneSons(state: VillageState, day: number): Person[] {
  return byCrowding(state).flatMap((d) => {
    const son = loneSonOf(state, d, day);
    return son ? [son] : [];
  });
}

/**
 * Nové nebo prázdné obydlí osídlí první rodina v pořadí přednosti (`settlingFamilies` – ve vsi bez
 * rodu `leavingFamilies`); nadzemní dům jen lidé z pořadí (`settleLogHouse` – log-house.md – Kdo
 * v domě bydlí). Vrací, jestli se někdo nastěhoval (mutuje stav).
 */
export function settleNewDwelling(state: VillageState, day: number, dwellingId: number): boolean {
  const dwelling = state.dwellings.find((d) => d.id === dwellingId);
  if (dwelling && isLogHouse(dwelling)) return settleLogHouse(state, day, dwellingId);
  // vystěhovaná domácnost má přednost (demolition.md – Obydlí s obyvateli)
  if (rehouseDisplaced(state, day, dwellingId)) return true;
  const family = settlingFamilies(state, day)[0];
  if (!family) return false;
  moveIn(state, day, family.people, dwellingId);
  return true;
}

/**
 * Krok 6 (kinship.md – Domácnosti): napřed prázdné nadzemní domy od nejlepšího (srub, pak vypletený
 * dům, každý druh podle id) – jen lidé z pořadí (`settleLogHouse`, log-house.md – Kdo v domě bydlí;
 * návrh Clauda: dřív než ostatní obydlí, aby syn vojvody nezabral polozemnici, na kterou čeká
 * obyčejná rodina, a obydlí, které tím uvolní, osídlil ještě týž den). Vypletený dům, ze kterého se
 * elita přestěhuje do srubu, osídlí ještě týž den další z pořadí (log-house.md – Dům s vypletenými
 * stěnami). Ostatní úplně prázdná obydlí (podle id) osídlí rodiny ženatých synů
 * (`settleNewDwelling`), co zůstane prázdné, svobodní synové z plných domů (`loneSons`) – až po
 * prvním kole, aby rodina měla přednost.
 */
export function occupyEmptyDwellings(state: VillageState, day: number): void {
  pruneDisplaced(state);
  for (const type of HOUSE_TYPES_BEST_FIRST) {
    const houses = state.dwellings.filter((d) => d.type === type).sort((a, b) => a.id - b.id);
    for (const d of houses) {
      if (isEmptyLogHouse(state, d)) settleLogHouse(state, day, d.id);
    }
  }
  const empty = (): Dwelling[] => {
    const occupied = new Set(state.people.map((p) => p.dwellingId));
    // opuštěné obydlí se neosídlí (demolition.md – Opuštění); nadzemní dům jen z pořadí (výš)
    return state.dwellings
      .filter((d) => !occupied.has(d.id) && !isDisused(d) && !isLogHouse(d))
      .sort((a, b) => a.id - b.id);
  };
  for (const d of empty()) settleNewDwelling(state, day, d.id);
  for (const d of empty()) {
    const son = loneSons(state, day)[0];
    if (son) moveIn(state, day, [son], d.id);
  }
}

/**
 * Kolik nových domácností může ves založit (kinship.md – Lidé k osídlení): z každé domácnosti
 * rodiny, které dům nedrží a smí odejít (`departingFamilies` – i z neplného domu, Martin
 * 19. 10. 2026), a svobodní synové plných domů, ze kterých žádná rodina odejít nemůže
 * (`loneSonOf` – jen z plného domu). Ve vsi s rodem i vedlejší manželky, které by přeplněný dům
 * muže rodu opustily, až z něj odejdou ženatí synové (`secondaryWifeFamilies`).
 */
export function possibleNewHouseholds(state: VillageState, day: number): number {
  let count = 0;
  for (const d of state.dwellings) {
    const departing = departingFamilies(state, d, day);
    const families = departing.length + secondaryWifeFamilies(state, d, day, departing).length;
    count += families > 0 ? families : loneSonOf(state, d, day) ? 1 : 0;
  }
  return count;
}

/**
 * Lidé k osídlení nového obydlí nebo dílny (population.md – Lidé k osídlení; cenou předem už nejsou,
 * jen určují, kdy správce staví a kolik rodin čeká – demolition.md): možné nové
 * domácnosti (`possibleNewHouseholds`) minus prázdná obydlí a rozestavěná nová obydlí – na každé
 * už jedna domácnost čeká. Nadzemní dům se nepočítá – obyčejná rodina do něj nejde (log-house.md
 * – Kdo v domě bydlí: „Rodina čeká na dům“ se tím neruší). První zemnice zakladatelů (stavba s `dwellingId`) ani nový dům stěhující
 * se domácnosti (`relocates`, migration.md) nikoho nečeká – osídlí je sami. Může vyjít záporně
 * (obydlí postavená do zásoby). Ves z doby před příbuzenstvím se počítá po doplnění pohlaví
 * a manželů (`withKinship`).
 */
export function availableSettlers(state: VillageState, day: number): number {
  const building = state.constructions.filter(
    (c) =>
      c.kind === 'dwelling' &&
      c.dwellingId === null &&
      c.relocates === undefined &&
      // nadzemní dílna (s `craft`) je dílna – čeká na ni rodina jako na dnešní
      (c.craft !== undefined || c.dwellingType === null || !isHouseType(c.dwellingType)),
  ).length;
  const empty = state.dwellings.filter(
    (d) => occupants(state, d.id).length === 0 && !isDisused(d) && !isLogHouse(d),
  ).length;
  // ves z doby před příbuzenstvím se počítá, jako by už měla pohlaví a manžele (`withKinship`)
  // dočasně ubytovaní hostitele nezakládají rodinu; jejich domácnost čeká na dům (+ displacedCount)
  const settlers = possibleNewHouseholds(withKinship(withoutDisplaced(state), day), day);
  return settlers + displacedCount(state) - building - empty;
}

/**
 * Kolik možných nových domácností nemá kam jít – na každou z nich nečeká prázdné ani rozestavěné
 * obydlí (= kladní `availableSettlers`). Upozornění „Rodina čeká na dům“ (dřív „Domácnost je plná“).
 */
export function waitingHouseholds(state: VillageState, day: number): number {
  return Math.max(0, availableSettlers(state, day));
}
