// Domácnosti po rodinách (kinship.md – Domácnosti; population.md – Nové obydlí, Martin 17.–18. 10.
// 2026: „plná domácnost → nová domácnost v novém obydlí“, „Pokud už jsou rodiče neplodní, tak ano,
// má [nejstarší zůstat]“, „pokud se lidé v domě tísní a je tam nejstarší dítě, nejstarší dítě může
// odejít do nového domu“, „ať prázdný dům obsadí i plná domácnost“; převod na rodiny návrh
// Clauda). Novou domácnost zakládá ženatý syn se ženou a dětmi, nejstarší ženatý syn zůstává
// s rodiči (dědic), z plného domu smí odejít i svobodný nejstarší syn; dcery odcházejí sňatkem. Čisté funkce nad stavem vsi, kroky
// `settleNewDwelling` a `occupyEmptyDwellings` stav mění.
import { isFull } from './dwellings';
import { withKinship } from './kinship';
import { ageYears, canBear, householdBreaksUp, occupants } from './people';
import { AGE, DWELLINGS } from './rules';
import type { ChronicleEvent, Dwelling, Person, VillageState } from './types';

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/** Bydlí v domácnosti `members` matka nebo otec člověka `p`? */
function parentHere(p: Person, members: readonly Person[]): boolean {
  return members.some((m) => m.id === p.motherId || m.id === p.fatherId);
}

/** Žena muže `husband`, když bydlí s ním. */
function wifeHere(husband: Person, members: readonly Person[]): Person | undefined {
  if (husband.sex !== 'male' || husband.spouseId === undefined) return undefined;
  return members.find((m) => m.id === husband.spouseId);
}

/** Svobodný v domácnosti – nemá v ní manžela / manželku. */
function unmarriedHere(p: Person, members: readonly Person[]): boolean {
  return p.spouseId === undefined || !members.some((m) => m.id === p.spouseId);
}

/** Rodina, která se může z domácnosti oddělit do nového domu. */
export interface Family {
  /** Domácnost, ze které odchází. */
  dwelling: Dwelling;
  /** Muž (ženatý syn), jeho žena a jejich svobodné děti z téže domácnosti. */
  people: Person[];
}

/**
 * Rodiny, které se mohou oddělit z domácnosti obydlí `dwelling` (kinship.md – Domácnosti): dům
 * drží jeden dědic – nejstarší ženatý syn (matka nebo otec bydlí v domě) a s ním jeho rodiče;
 * v domě bez ženatého syna vdova s vlastními dětmi, jinak (bratři po smrti rodičů) nejstarší
 * ženatý muž. Všichni ostatní ženatí
 * muži se se ženou a dětmi smí oddělit – i ženatý muž bez rodičů v domě vedle dědice (starší vsi
 * mají rodiče neznámé). Odchází muž, žena a jejich svobodné děti z domu – jen když se zbytek
 * domácnosti nerozpadne (`householdBreaksUp`). Od nejstaršího muže.
 */
export function familiesOf(state: VillageState, dwelling: Dwelling, day: number): Family[] {
  const members = occupants(state, dwelling.id);
  const husbands = members.filter((m) => wifeHere(m, members)).sort(byAge);
  const sons = husbands.filter((h) => parentHere(h, members));
  const heir = sons[0];
  // bez ženatého syna drží dům vdova s vlastními dětmi (Martin, 19. 10. 2026 – ve Vlkově mladý
  // pár nesměl z přeplněného domu vdovy do prázdné polozemnice) – ženatí muži pak smí všichni
  const widowHolds =
    !heir &&
    members.some(
      (w) =>
        w.sex === 'female' &&
        unmarriedHere(w, members) &&
        ageYears(w.bornDay, day) >= AGE.fertile &&
        members.some((c) => c.motherId === w.id),
    );
  // s dědicem zůstávají jeho rodiče (otec nebo muž matky), bez něj nejstarší ženatý muž
  const stays = (h: Person): boolean =>
    heir
      ? h === heir || sons.some((s) => s.fatherId === h.id || s.motherId === h.spouseId)
      : !widowHolds && h === husbands[0];
  const families: Family[] = [];
  for (const husband of husbands.filter((h) => !stays(h))) {
    const wife = wifeHere(husband, members);
    if (!wife) continue;
    const children = members.filter(
      (c) =>
        (c.motherId === wife.id || c.fatherId === husband.id) &&
        c.id !== wife.id &&
        unmarriedHere(c, members),
    );
    const people = [husband, wife, ...children];
    const staying = members.filter((m) => !people.includes(m));
    if (householdBreaksUp(staying, day)) continue;
    families.push({ dwelling, people });
  }
  return families;
}

/** Přeplnění domácnosti: lidé − kapacita obydlí. */
function crowding(state: VillageState, dwelling: Dwelling): number {
  return occupants(state, dwelling.id).length - DWELLINGS[dwelling.type].capacity;
}

/** Obydlí od nejvíc přeplněného, při shodě nižší id. */
function byCrowding(state: VillageState): Dwelling[] {
  return [...state.dwellings].sort(
    (a, b) => crowding(state, b) - crowding(state, a) || a.id - b.id,
  );
}

/**
 * Rodiny, které z domácnosti obydlí `dwelling` opravdu odejdou do nových domů: jen z plné nebo
 * přeplněné domácnosti (Martin: „plná domácnost → nová domácnost v novém obydlí“, „ať prázdný
 * dům obsadí i plná domácnost“; z neplného domu ne – rozhodnutí 18. 10. 2026) a jen dokud dům před
 * odchodem další rodiny zůstává plný – po odchodu první už obvykle plný není. V pořadí
 * `familiesOf`.
 */
export function departingFamilies(state: VillageState, dwelling: Dwelling, day: number): Family[] {
  let living = occupants(state, dwelling.id).length;
  const capacity = DWELLINGS[dwelling.type].capacity;
  const out: Family[] = [];
  for (const family of familiesOf(state, dwelling, day)) {
    if (living < capacity) break;
    out.push(family);
    living -= family.people.length;
  }
  return out;
}

/**
 * Rodiny vsi, které se teď mohou oddělit do prázdného nebo nového domu – z každé plné domácnosti
 * první z `departingFamilies`; domácnosti od nejvíc přeplněné, při shodě nižší id.
 */
export function leavingFamilies(state: VillageState, day: number): Family[] {
  return byCrowding(state).flatMap((d) => departingFamilies(state, d, day).slice(0, 1));
}

/**
 * Svobodný syn, který smí z plného (i přeplněného) domu `dwelling` odejít sám (Martin – „nejstarší
 * dítě může odejít“, „ať prázdný dům obsadí i plná domácnost“; kinship.md – Domácnosti): nejstarší
 * svobodný syn od 16 let (matka nebo otec bydlí v domě); bez něj jiný svobodný muž od 16 let bez
 * rodičů v domě (`lodgerOf`). Zpátky ho nic nevrátí – sňatkem se stěhuje
 * žena k muži a sestra ani matka si ho nevezme (blízcí příbuzní). Dědic zůstává: když v domě ještě není ženatý syn a rodiče už jsou neplodní (žádná
 * matka synů v domě nemůže rodit), zůstává nejstarší syn a odejít smí druhý nejstarší (Martin).
 * Jen když se zbytek domácnosti nerozpadne; jinak undefined.
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
  if (!candidate) return undefined;
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

/** Přestěhuje lidi do obydlí a zapíše založení domácnosti (mutuje stav). */
function moveIn(
  state: VillageState,
  day: number,
  people: readonly Person[],
  dwellingId: number,
): void {
  for (const p of people) p.dwellingId = dwellingId;
  state.chronicle.push({ day, kind: 'household-founded', dwellingId } satisfies ChronicleEvent);
}

/**
 * Nové nebo prázdné obydlí osídlí první rodina, která se může oddělit (`leavingFamilies`); vrací,
 * jestli se někdo nastěhoval (mutuje stav).
 */
export function settleNewDwelling(state: VillageState, day: number, dwellingId: number): boolean {
  const family = leavingFamilies(state, day)[0];
  if (!family) return false;
  moveIn(state, day, family.people, dwellingId);
  return true;
}

/**
 * Krok 6 (kinship.md – Domácnosti): úplně prázdná obydlí (podle id) nejdřív osídlí rodiny ženatých
 * synů (`settleNewDwelling`), co zůstane prázdné, svobodní synové z plných domů (`loneSons`) – až
 * po prvním kole, aby rodina měla přednost.
 */
export function occupyEmptyDwellings(state: VillageState, day: number): void {
  const empty = (): Dwelling[] => {
    const occupied = new Set(state.people.map((p) => p.dwellingId));
    return state.dwellings.filter((d) => !occupied.has(d.id)).sort((a, b) => a.id - b.id);
  };
  for (const d of empty()) settleNewDwelling(state, day, d.id);
  for (const d of empty()) {
    const son = loneSons(state, day)[0];
    if (son) moveIn(state, day, [son], d.id);
  }
}

/**
 * Kolik nových domácností může ves založit (kinship.md – Lidé k osídlení): z plných a přeplněných
 * domácností rodiny ženatých synů, které odejdou, dokud dům zůstává plný (`departingFamilies`),
 * a svobodní nejstarší synové plných domů, ze kterých žádná rodina odejít nemůže. Neplný dům
 * nikoho nedává.
 */
export function possibleNewHouseholds(state: VillageState, day: number): number {
  let count = 0;
  for (const d of state.dwellings) {
    const families = departingFamilies(state, d, day).length;
    count += families > 0 ? families : loneSonOf(state, d, day) ? 1 : 0;
  }
  return count;
}

/**
 * Lidé k osídlení nového obydlí (population.md – Odemčení, Lidé k osídlení): možné nové
 * domácnosti (`possibleNewHouseholds`) minus prázdná obydlí a rozestavěná nová obydlí – na každé
 * už jedna domácnost čeká. První zemnice zakladatelů (stavba s `dwellingId`) ani nový dům stěhující
 * se domácnosti (`relocates`, migration.md) nikoho nečeká – osídlí je sami. Může vyjít záporně
 * (obydlí postavená do zásoby). Ves z doby před příbuzenstvím se počítá po doplnění pohlaví
 * a manželů (`withKinship`).
 */
export function availableSettlers(state: VillageState, day: number): number {
  const building = state.constructions.filter(
    (c) => c.kind === 'dwelling' && c.dwellingId === null && c.relocates === undefined,
  ).length;
  const empty = state.dwellings.filter((d) => occupants(state, d.id).length === 0).length;
  // ves z doby před příbuzenstvím se počítá, jako by už měla pohlaví a manžele (`withKinship`)
  return possibleNewHouseholds(withKinship(state, day), day) - building - empty;
}

/**
 * Kolik možných nových domácností nemá kam jít – na každou z nich nečeká prázdné ani rozestavěné
 * obydlí (= kladní `availableSettlers`). Upozornění „Domácnost je plná“.
 */
export function waitingHouseholds(state: VillageState, day: number): number {
  return Math.max(0, availableSettlers(state, day));
}
