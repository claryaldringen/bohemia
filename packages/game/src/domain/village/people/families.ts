// Rodiny, které se mohou oddělit z domácnosti (kinship.md – Domácnosti; lord.md – Synové po sňatku
// odcházejí z dvorce): kdo dům drží, kdo smí odejít a pořadí domácností podle přeplnění. Samostatný
// modul pod `households.ts` a `dynasty-housing.ts`, aby se navzájem neimportovaly. Čisté funkce.
import { currentLord, isDynastyTracked } from './dynasty';
import { villageManorId } from './manor';
import { ageYears, householdBreaksUp, occupants } from './people';
import { AGE, DWELLINGS } from '../rules';
import type { Dwelling, Person, VillageState } from '../types';

/** Od nejstaršího; při shodě data narození nižší id. */
export function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/** Bydlí v domácnosti `members` matka nebo otec člověka `p`? */
export function parentHere(p: Person, members: readonly Person[]): boolean {
  return members.some((m) => m.id === p.motherId || m.id === p.fatherId);
}

/**
 * Manželky muže `husband`, které bydlí s ním – u muže rodu i vedlejší (lord.md – Manželky; u ženy
 * je `spouseId` její muž), jinak jeho jediná žena.
 */
function wivesHere(husband: Person, members: readonly Person[]): Person[] {
  if (husband.sex !== 'male') return [];
  return members.filter((m) => m.sex === 'female' && m.spouseId === husband.id);
}

/** Je `dwelling` dvorec vsi, která sleduje rod vojvody? */
export function isTrackedManor(state: VillageState, dwelling: Dwelling): boolean {
  return isDynastyTracked(state) && villageManorId(state) === dwelling.id;
}

/** Svobodný v domácnosti – nemá v ní manžela / manželku. */
export function unmarriedHere(p: Person, members: readonly Person[]): boolean {
  return p.spouseId === undefined || !members.some((m) => m.id === p.spouseId);
}

/** Rodina, která se může z domácnosti oddělit do nového domu. */
export interface Family {
  /** Domácnost, ze které odchází. */
  dwelling: Dwelling;
  /**
   * Muž (ženatý syn), jeho žena (u muže rodu všechny jeho ženy z domu) a jejich svobodné děti
   * z téže domácnosti; u vedlejší manželky z přeplněného domu ona a její svobodné děti.
   */
  people: Person[];
}

/**
 * Rodiny, které se mohou oddělit z domácnosti obydlí `dwelling` (kinship.md – Domácnosti): dům
 * drží jeden dědic – nejstarší ženatý syn (matka nebo otec bydlí v domě) a s ním jeho rodiče;
 * v domě bez ženatého syna vdova s vlastními dětmi, jinak (bratři po smrti rodičů) nejstarší
 * ženatý muž. Všichni ostatní ženatí
 * muži se se ženou a dětmi smí oddělit – i ženatý muž bez rodičů v domě vedle dědice (starší vsi
 * mají rodiče neznámé). Odchází muž, žena a jejich svobodné děti z domu – jen když se zbytek
 * domácnosti nerozpadne (`householdBreaksUp`) a nový dům udrží (je v ní někdo 16–44; starší pár
 * by se rozpadl a vrátil). Od nejstaršího muže. V dvorci vsi s rodem drží dům vojvoda a odcházejí
 * všichni ženatí muži, i nejstarší syn (lord.md – Synové po sňatku odcházejí z dvorce); muž rodu
 * odchází se všemi ženami z domu. Rodina, ve které je vojvoda (nezletilý vojvoda u matky, ke které
 * se přiženil muž – lord.md – Nástupnictví), neodchází. Dvorec bez vojvody (nástupce ještě
 * nebydlí v dvorci, nebo rod skončil) nedrží nikdo – ženatí muži odcházejí všichni (návrh Clauda).
 * `reserved` – otroci z nabídky vsi, kteří ve `state` výběru chybí (`emigrantGroups`, markets.md –
 * Rozhodnutí plánu 5, bod 8): dítě s manželem z nich není svobodné – s rodinou neodejde a zůstane
 * doma jako každé vdané dítě (návrh Clauda). Chybí = žádní.
 */
export function familiesOf(
  state: VillageState,
  dwelling: Dwelling,
  day: number,
  reserved?: ReadonlySet<number>,
): Family[] {
  const members = occupants(state, dwelling.id);
  const husbands = members.filter((m) => wivesHere(m, members).length > 0).sort(byAge);
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
  // dvorec vsi s rodem drží vojvoda – dědice mezi ženatými syny nemá (lord.md – Synové po sňatku);
  // bez vojvody v dvorci ho nedrží nikdo
  const manor = isTrackedManor(state, dwelling);
  const lord = manor ? members.find((m) => m.id === currentLord(state)?.id) : undefined;
  // s dědicem zůstávají jeho rodiče (otec nebo muž matky), bez něj nejstarší ženatý muž
  const stays = (h: Person): boolean =>
    manor
      ? h === lord
      : heir
        ? h === heir || sons.some((s) => s.fatherId === h.id || s.motherId === h.spouseId)
        : !widowHolds && h === husbands[0];
  const families: Family[] = [];
  for (const husband of husbands.filter((h) => !stays(h))) {
    const wives = wivesHere(husband, members);
    const wifeIds = new Set(wives.map((w) => w.id));
    const children = members.filter(
      (c) =>
        ((c.motherId !== undefined && wifeIds.has(c.motherId)) || c.fatherId === husband.id) &&
        !wifeIds.has(c.id) &&
        unmarriedHere(c, members) &&
        !(c.spouseId !== undefined && reserved?.has(c.spouseId) === true),
    );
    const people = [husband, ...wives, ...children];
    // s vojvodou nikdo neodchází – nezletilý vojvoda zůstává s matkou v dvorci, její muž s nimi
    if (lord !== undefined && people.includes(lord)) continue;
    // rodina musí dům udržet sama (někdo 16–44) – starší pár by se v novém domě hned rozpadl,
    // vrátil k příbuzným a druhý den odešel znovu (stěhování tam a zpět, kalibrace 19. 10. 2026)
    if (householdBreaksUp(people, day)) continue;
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
export function byCrowding(state: VillageState): Dwelling[] {
  return [...state.dwellings].sort(
    (a, b) => crowding(state, b) - crowding(state, a) || a.id - b.id,
  );
}

/**
 * Rodiny, které z domácnosti obydlí `dwelling` mohou odejít do nových nebo prázdných domů – každá
 * rodina z `familiesOf` (všichni kromě toho, kdo dům drží), jen dokud se zbytek domácnosti po
 * odchodu všech dosud vybraných rodin nerozpadne. Plnost domu nerozhoduje (Martin, 19. 10. 2026 –
 * schválený návrh Clauda: ženatý pár, který dům nedrží, smí odejít kdykoli; dřív jen z plné nebo
 * přeplněné domácnosti a jen dokud dům zůstával plný). V pořadí `familiesOf`.
 */
export function departingFamilies(state: VillageState, dwelling: Dwelling, day: number): Family[] {
  let staying = occupants(state, dwelling.id);
  const out: Family[] = [];
  for (const family of familiesOf(state, dwelling, day)) {
    const rest = staying.filter((m) => !family.people.includes(m));
    if (householdBreaksUp(rest, day)) continue;
    out.push(family);
    staying = rest;
  }
  return out;
}

/**
 * Rodiny vsi, které se teď mohou oddělit do prázdného nebo nového domu – z každé domácnosti první
 * z `departingFamilies` (od nejstaršího muže); domácnosti od nejvíc přeplněné, při shodě nižší id.
 */
export function leavingFamilies(state: VillageState, day: number): Family[] {
  return byCrowding(state).flatMap((d) => departingFamilies(state, d, day).slice(0, 1));
}
