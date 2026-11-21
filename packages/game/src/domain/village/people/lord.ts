// Vojvodova rodina a dovednosti (docs/design/lord.md): kdo patří k rodině, výcvik den po dni, růst
// a úbytek dovedností, denní minimum dvorce a kdy jde rodina na pole.
import { assignRiders, NO_RIDERS, trainHorsesDay } from '../livestock/horse-riders';
import { isUnshod } from '../livestock/horse-shoeing-term';
import { horsePens, isGrainHorse, penHorses } from '../livestock/horses';
import { currentLord, isDynastyTracked, isElite, isLineMan, lineMen } from './dynasty';
import { harvestHandsDay } from '../fields/harvest-hands';
import { huntToday } from '../wildlife/hunt-party';
import { householdHead } from './households';
import { adultDailyMin, householdMinimum, SUMMER_CHORES, type DayChores } from '../core/labor';
import { villageManorId } from './manor';
import { ageGroup, ageYears, isAway, isInjured, laborPerDay } from './people';
import { dailyMinPerHousehold } from '../core/productivity';
import { AGE, ARMS_CAPS, HORSES, LORD, type ArmsSource } from '../rules';
import { HUNT } from '../rules/rules-wildlife';
import { HARVEST_HELP_WINDOWS, lordHelpShare, lordSowingShare } from '../fields/sowing';
import type {
  ArmsSkills,
  ChronicleEvent,
  LordHelp,
  LordState,
  Person,
  VillageState,
} from '../types';

/** Co z vsi rodina potřebuje – lidé a dvorec. */
type LordView = Pick<
  VillageState,
  'people' | 'manorId' | 'dwellings' | 'constructions' | 'dynasty'
>;

/** Rodina vojvody (lord.md – Kdo je vojvodova rodina). */
export interface LordFamily {
  /** Hlava dvorce. */
  lord: Person | null;
  /**
   * Vojvoda a jeho potomci po meči v dvorci od 7 let – cvičí; za nimi muži rodu od 7 let v domech
   * elity (`eliteHomes`).
   */
  trainees: Person[];
  /** Žena vojvody, dcery, snachy a vnučky – jen domácnost dvorce a domů elity. */
  household: Person[];
  /** Zbytek dvorce a domů elity (zeť, ženich, chlapci pod 7 let) – pracují jako dosud. */
  others: Person[];
  /**
   * Vedlejší manželky vojvody mimo dvorec (lord.md – Rod vojvody, Manželky – Práce) – vedou svou
   * domácnost, k rodině patří, jejich děti ne. Jen ves s rodem.
   */
  wivesApart: Person[];
  /**
   * Domy elity (hillfort.md – Elita): obydlí mimo dvorec bez dílny, kde bydlí elitní muž od
   * `AGE.fertile` let (`isElite`) – v rodině se chovají jako dvorec. Od nejnižšího id; ves bez
   * rodu a rodina bez vojvody `[]`.
   */
  eliteHomes: number[];
}

/** Rodina bez vojvody – nikdo necvičí. */
const NO_FAMILY: LordFamily = {
  lord: null,
  trainees: [],
  household: [],
  others: [],
  wivesApart: [],
  eliteHomes: [],
};

type Hours = { bow: number; combat: number; riding: number };

/**
 * Rodina vojvody (lord.md – Kdo je vojvodova rodina): trénuje vojvoda a jeho potomci po meči
 * v dvorci (`fatherId` řetězem) od 7 let; žena vojvody, jeho dcery a vnučky po meči a snachy
 * (ženy cvičících) vedou jen domácnost; ostatní v dvorci (zeť, synové předchozího vojvody, chlapci
 * pod 7 let) jsou `others`. Kdo dvorec opustil, v rodině není.
 */
export function lordFamily(state: LordView, day: number): LordFamily {
  const manor = villageManorId(state);
  if (isDynastyTracked(state)) return dynastyFamily(state, manor, day);
  const lord = manor === null ? undefined : householdHead(state.people, manor, day);
  // vojvoda je nejstarší muž dvorce (lord.md – Kdo je vojvodova rodina); dvorec vdovy vojvodu nemá
  if (manor === null || !lord || lord.sex === 'female') return NO_FAMILY;
  const members = state.people.filter((p) => p.dwellingId === manor);
  // potomci po otci: vojvoda a všichni, kdo z něj vedou po otcích
  const line = new Set<number>([lord.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of members) {
      if (!line.has(p.id) && p.fatherId !== undefined && line.has(p.fatherId)) {
        line.add(p.id);
        grew = true;
      }
    }
  }
  const trainees: Person[] = [];
  const household: Person[] = [];
  const others: Person[] = [];
  for (const p of members) {
    const male = p.sex !== 'female';
    if (male && line.has(p.id) && ageYears(p.bornDay, day) >= AGE.olderChild) trainees.push(p);
    else if (!male && line.has(p.id)) household.push(p);
    else if (!male && p.spouseId !== undefined && line.has(p.spouseId)) household.push(p);
    else if (p.sex === 'female' && lord.spouseId === p.id) household.push(p);
    else others.push(p);
  }
  return { lord, trainees, household, others, wivesApart: [], eliteHomes: [] };
}

/**
 * Rodina vsi s rodem (lord.md – Rod vojvody: Manželky – Výcvik, Synové po sňatku – „Cvičí, dokud
 * neodejde“, Nástupnictví): vojvoda je `dynasty.lordId` (i chlapec) a cvičí všichni muži rodu
 * v dvorci od 7 let – synové všech manželek, ženatí synové čekající na dům, vnuci, bratři. Jen
 * domácnost: manželky vojvody v dvorci, matka nezletilého vojvody (i vdaná), dcery mužů rodu
 * (i dřívějších vojvodů) a ženy mužů rodu z dvorce (snachy). Vedlejší manželky mimo dvorec jsou
 * `wivesApart`. Ostatní (zeť, vdovy po dřívějším vojvodovi, chlapci pod 7 let) pracují. Vojvoda mimo dvorec nebo
 * bez vojvody – nikdo (dvorec bez vojvody necvičí). Domy elity (`eliteHomes`) se třídí jako dvorec
 * (hillfort.md – Elita, Martin 8. 11. 2026: „stejné pravidlo jako rodina ve dvorci“): cvičí muži
 * rodu od 7 let v tom domě (i synové vedlejších manželek elitního muže, dokud neodejdou), ženy
 * a dcery mužů rodu vedou domácnost, ostatní pracují – návrh Clauda.
 */
function dynastyFamily(state: LordView, manor: number | null, day: number): LordFamily {
  const lord = currentLord(state);
  if (manor === null || !lord || lord.dwellingId !== manor) return NO_FAMILY;
  const minor = ageYears(lord.bornDay, day) < AGE.fertile;
  const fathers = new Set([
    ...lineMen(state).map((p) => p.id),
    ...(state.dynasty?.lords ?? []).map((l) => l.id),
  ]);
  const trainees: Person[] = [];
  const household: Person[] = [];
  const others: Person[] = [];
  const wivesApart: Person[] = [];
  for (const p of state.people) {
    if (p.dwellingId !== manor) {
      if (p.sex === 'female' && p.spouseId === lord.id) wivesApart.push(p);
      continue;
    }
    if (isLineMan(p) && ageYears(p.bornDay, day) >= AGE.olderChild) trainees.push(p);
    else if (p.sex !== 'female') others.push(p);
    else if (p.spouseId !== undefined && fathers.has(p.spouseId)) household.push(p);
    else if (p.fatherId !== undefined && fathers.has(p.fatherId)) household.push(p);
    // matka nezletilého vojvody dvorec drží a vede domácnost, i vdaná (lord.md – Nástupnictví)
    else if (p.id === lord.motherId && minor) household.push(p);
    else others.push(p);
  }
  const eliteHomes = eliteHomesOf(state, manor, wivesApart, day);
  if (eliteHomes.length > 0) {
    const homes = new Set(eliteHomes);
    for (const p of state.people) {
      if (!homes.has(p.dwellingId)) continue;
      if (isLineMan(p) && ageYears(p.bornDay, day) >= AGE.olderChild) trainees.push(p);
      else if (p.sex !== 'female') others.push(p);
      else if (p.spouseId !== undefined && fathers.has(p.spouseId)) household.push(p);
      else if (p.fatherId !== undefined && fathers.has(p.fatherId)) household.push(p);
      else others.push(p);
    }
  }
  return { lord, trainees, household, others, wivesApart, eliteHomes };
}

/**
 * Domy elity (hillfort.md – Elita): obydlí mimo dvorec, kde bydlí elitní muž od `AGE.fertile` let
 * (`isElite` – po sňatku ve vlastním domě). Obydlí s dílnou ne – dílna má přednost, muž dělá
 * řemeslo; dům vedlejší manželky vojvody (`wivesApart`) také ne – ten kryje ona (návrh Clauda).
 * Od nejnižšího id.
 */
function eliteHomesOf(
  state: LordView,
  manor: number,
  wivesApart: readonly Person[],
  day: number,
): number[] {
  const apart = new Set(wivesApart.map((w) => w.dwellingId));
  const homes = new Set<number>();
  for (const p of state.people) {
    if (p.dwellingId === manor || apart.has(p.dwellingId) || homes.has(p.dwellingId)) continue;
    if (!isElite(state, p) || ageYears(p.bornDay, day) < AGE.fertile) continue;
    if (state.dwellings.find((d) => d.id === p.dwellingId)?.workshop) continue;
    homes.add(p.dwellingId);
  }
  return [...homes].sort((a, b) => a - b);
}

/**
 * Hodiny výcviku muže za den podle věku (lord.md – Den rodiny): chlapci 7–9 let luk, 10–13 let
 * luk, boj a jízda, muži 14–44 let, vojvoda a muži od 45 let méně. Bez koně se jízda rozdělí do
 * luku a boje. Ženy a děti do 7 let nic.
 */
export function trainingHours(
  person: Person,
  day: number,
  lord: Person | null,
  hasHorse: boolean,
): Hours {
  const age = ageYears(person.bornDay, day);
  if (person.sex === 'female' || age < AGE.olderChild) return { bow: 0, combat: 0, riding: 0 };
  const kind =
    lord?.id === person.id || age >= AGE.elder
      ? 'older'
      : age < LORD.youthFrom
        ? 'boy'
        : age < AGE.adult
          ? 'youth'
          : 'man';
  const share = LORD.split[kind][hasHorse ? 'withHorse' : 'noHorse'];
  const h = LORD.hours[kind];
  return { bow: h * share.bow, combat: h * share.combat, riding: h * share.riding };
}

/** Strop dovednosti podle věku (lord.md – Výcvik a zkušenost): 7–13 let 40, 14–44 let 100, pak −3 ročně. */
export function armsCap(person: Person, day: number): number {
  const age = ageYears(person.bornDay, day);
  if (age < AGE.olderChild) return 0;
  if (age < AGE.adult) return LORD.cap.boy;
  if (age < AGE.elder) return LORD.cap.man;
  return Math.max(0, LORD.cap.man - LORD.cap.declinePerYear * (age - AGE.elder));
}

/**
 * Strop dovednosti dnes (war.md – Síla): menší z věku (`armsCap`) a zdroje výcviku (`ARMS_CAPS` –
 * doma 50, lov 70, válka 100).
 */
export function trainingCap(person: Person, day: number, source: ArmsSource): number {
  return Math.min(armsCap(person, day), ARMS_CAPS[source]);
}

function bestOf(skills: ArmsSkills): Hours {
  return skills.best ?? { bow: skills.bow, combat: skills.combat, riding: skills.riding };
}

/** Jeden den růstu: každá dovednost přibude o `(strop − x) × gainPerHour × hodiny` (nikdy dolů). */
export function trainArms(skills: ArmsSkills, hours: Hours, cap: number): ArmsSkills {
  const grow = (x: number, h: number): number => x + Math.max(0, cap - x) * LORD.gainPerHour * h;
  const next = {
    bow: grow(skills.bow, hours.bow),
    combat: grow(skills.combat, hours.combat),
    riding: grow(skills.riding, hours.riding),
  };
  const best = bestOf(skills);
  return {
    ...next,
    best: {
      bow: Math.max(best.bow, next.bow),
      combat: Math.max(best.combat, next.combat),
      riding: Math.max(best.riding, next.riding),
    },
  };
}

/** Den bez výcviku: `× (1 − decayPerYear / 365)`, nejníž `best × floorShare` (a co je pod ním, zůstane). */
export function decayArms(skills: ArmsSkills): ArmsSkills {
  const best = bestOf(skills);
  const fall = (x: number, top: number): number => {
    const floor = top * LORD.floorShare;
    return x <= floor ? x : Math.max(floor, x * (1 - LORD.decayPerYear / 365));
  };
  return {
    bow: fall(skills.bow, best.bow),
    combat: fall(skills.combat, best.combat),
    riding: fall(skills.riding, best.riding),
    best,
  };
}

/** Dospělí (od 14 let) mimo cvičící a domácnost vojvody. */
function adultsOutsideFamily(state: LordView, family: LordFamily, day: number): number {
  const inFamily = new Set(
    [...family.trainees, ...family.household, ...family.wivesApart].map((p) => p.id),
  );
  return state.people.filter((p) => !inFamily.has(p.id) && ageGroup(p, day) !== 'child').length;
}

/** Cvičí rodina `family`? Bez vojvody ne (`familyTrains`). */
function trainsWith(state: LordView, family: LordFamily, day: number, training: boolean): boolean {
  if (!family.lord) return false;
  const need = training ? LORD.keepVillageAdults : LORD.minVillageAdults;
  return adultsOutsideFamily(state, family, day) >= need;
}

/**
 * Cvičí rodina místo práce? (lord.md – Zakládání vsi; Martin 24. 10. 2026: až má ves aspoň
 * `minVillageAdults` dospělých mimo rodinu.) Hystereze (návrh Clauda): kdo už cvičí (`training`),
 * zůstane u výcviku, dokud je jich mimo rodinu aspoň `keepVillageAdults`. Ves bez vojvody (dvorec
 * bez muže od 14 let) nemá koho cvičit – false.
 */
export function familyTrains(state: LordView, day: number, training = false): boolean {
  return trainsWith(state, lordFamily(state, day), day, training);
}

/**
 * Režim rodiny na dnešek (mutuje `state.lord`; volá ho práce dne): cvičí podle `familyTrains`
 * s hysterezí z uloženého režimu. Když rodina necvičí, `state.lord` zmizí – pracuje jako ostatní
 * a pole kvůli hladu ji netýká. Vrací cvičící rodinu, nebo null.
 */
export function updateLordTraining(state: VillageState, day: number): LordFamily | null {
  const family = lordFamily(state, day);
  if (trainsWith(state, family, day, state.lord?.trains === true)) {
    state.lord = { ...state.lord, trains: true };
    return family;
  }
  delete state.lord;
  return null;
}

/** Rodina, která podle uloženého režimu cvičí místo práce vsi; jinak null. */
export function trainingFamily(
  state: LordView & Pick<VillageState, 'lord'>,
  day: number,
): LordFamily | null {
  if (state.lord?.trains !== true) return null;
  const family = lordFamily(state, day);
  return family.lord ? family : null;
}

/**
 * Id lidí cvičící rodiny, kteří jsou mimo práci vsi (cvičící muži, domácnost vojvody a jeho vedlejší
 * manželky ve vlastních domech) – jedno místo pravdy pro `work()`, kapacitu práce v oknech (`sowingCapacity`)
 * i nákupy (`craft-buying`).
 */
export function lordApartIds(
  state: LordView & Pick<VillageState, 'lord'>,
  day: number,
): ReadonlySet<number> {
  const family = trainingFamily(state, day);
  return new Set(
    family ? [...family.trainees, ...family.household, ...family.wivesApart].map((p) => p.id) : [],
  );
}

/**
 * Obydlí, jejichž denní minimum kryje cvičící rodina (`manorLabor`) a ves ho nepočítá – dvorec,
 * domy vedlejších manželek vojvody (lord.md – Rod vojvody, Manželky – Práce) a domy elity
 * (hillfort.md – Elita).
 */
export function familyHomes(family: LordFamily | null): ReadonlySet<number> {
  if (!family?.lord) return new Set();
  return new Set([
    family.lord.dwellingId,
    ...family.wivesApart.map((w) => w.dwellingId),
    ...family.eliteHomes,
  ]);
}

/** Id cvičících z rodiny, která cvičí (vojvodovi synové nepasou – lord.md, Den rodiny). */
export function lordTraineeIds(
  state: LordView & Pick<VillageState, 'lord'>,
  day: number,
): ReadonlySet<number> {
  const family = trainingFamily(state, day);
  return new Set(family ? family.trainees.map((p) => p.id) : []);
}

/** Práce dvorce cvičící rodiny za den (`manorLabor`, člověkodny po štěstí). */
export interface ManorLabor {
  /** Denní minimum dvorce (s vodou), které po starších pokryli dospělí rodiny. */
  dailyMin: number;
  /** Denní minimum, na které rodina nestačí – jde z práce vsi (`allocateDay` – `manorMin`). */
  uncovered: number;
  /**
   * Pomoc ve žních (`allocateDay` – `lordHelp`, lord.md – Kdy jde rodina na pole): podíl dne
   * z plánu (`lordHelpShare`) × `free` ve žňový den (`harvestHandsDay`); jinak 0.
   */
  help: number;
  /**
   * Pomoc s přípravou půdy a setím (`allocateDay` – `lordSowing`, lord.md – Kdy jde rodina na
   * pole, Příprava půdy a setí; D102): podíl dne z plánu (`lordSowingShare`) × `free` v oknech
   * setí; jinak 0.
   */
  sowing: number;
  /**
   * Práce dospělých rodiny přítomných ve vsi po denním minimu dvorce – muži, ženy i dcery (z ní
   * podíly dne na poli – `lordFieldShares`).
   */
  free: number;
  /** Z toho práce cvičících mužů po minimu dvorce (minimum kryjí napřed ženy). */
  freeMen: number;
  /** Z `freeMen` práce samotného vojvody (minimum, na které ženy nestačí, kryjí napřed synové). */
  freeLord: number;
}

/**
 * Podíly dne skupin cvičící rodiny na poli ve žních (lord.md – Kdy jde rodina na pole; Martin
 * 9. 11. 2026): ženy a dcery, muži rodiny (synové, vnuci), samotný vojvoda – 0–1.
 */
export interface LordFieldShares {
  women: number;
  men: number;
  lord: number;
}

/** Nikdo z rodiny na poli. */
export const NO_LORD_FIELD: LordFieldShares = { women: 0, men: 0, lord: 0 };

/**
 * Kdo z rodiny jde na pole, když ves žně sama nestíhá (lord.md – Kdy jde rodina na pole; Martin
 * 9. 11. 2026: „Pokud se nestíhá, jdou ženy z vojvodovy rodiny, pokud se i tak nestíhá, jdou muži
 * z vojvodovy rodiny, samotný vojvoda až úplně nakonec“): práci `used` (po štěstí), kterou žně
 * dnes z rodiny vzaly, kryjí napřed ženy a dcery, pak muži a vojvoda až nakonec – každá skupina
 * jen tolik, kolik po předchozí ještě chybí.
 */
export function lordFieldShares(
  manor: Pick<ManorLabor, 'free' | 'freeMen' | 'freeLord'>,
  used: number,
): LordFieldShares {
  let left = Math.max(0, used);
  const take = (free: number): number => {
    if (free <= FIELD_EPSILON || left <= FIELD_EPSILON) return 0;
    const share = Math.min(1, left / free);
    left -= share * free;
    return share;
  };
  const women = take(manor.free - manor.freeMen);
  const men = take(manor.freeMen - manor.freeLord);
  return { women, men, lord: take(manor.freeLord) };
}

/**
 * Kdo z rodiny dnes opravdu byl na poli (`work()` – žně, výmlat, příprava půdy a setí): práce
 * `used`, kterou dnes rodině vzaly úlohy dne, je po délce dne (`allocateDay` – práce rodiny
 * × `daylight`; štěstí už nese `ManorLabor.free`) – v lidech na celý dnešní den je to
 * `used ÷ daylight` práce rodiny, stejně jako v plánu (`harvestFieldIds`), pořadí `lordFieldShares`.
 * Návrh Clauda – oprava chyby z 9. 11. 2026 (dřív podle práce delšího dne: v krátkém dni vojvoda při
 * celém podílu cvičil, v létě se přebytek žen připsal mužům) proti lord.md „Kdo je ten den na poli,
 * nejezdí, neloví ani necvičí“.
 */
export function lordFieldSharesToday(
  manor: Pick<ManorLabor, 'free' | 'freeMen' | 'freeLord'>,
  used: number,
  daylight: number,
): LordFieldShares {
  return daylight > 0 ? lordFieldShares(manor, used / daylight) : NO_LORD_FIELD;
}

/** Podíly dne na poli – číslo = celá rodina týmž podílem (testy a starší volání). */
function fieldSharesOf(field: number | LordFieldShares): LordFieldShares {
  if (typeof field !== 'number') return field;
  const share = Math.min(1, Math.max(0, field));
  return { women: share, men: share, lord: share };
}

/** Podíl dne na poli cvičícího `person` (vojvoda, nebo muž rodiny); chlapci 7–13 let pole nemají. */
function traineeFieldShare(
  person: Person,
  day: number,
  family: LordFamily,
  shares: LordFieldShares,
): number {
  if (ageGroup(person, day) === 'child') return 0;
  return person.id === family.lord?.id ? shares.lord : shares.men;
}

/**
 * Cvičící, kteří jsou dnes na poli (podíl dne > 0) – nejezdí a neloví (horses.md – Výcvik koně
 * a jezdec, wildlife.md – Lov rodu; návrh Clauda: jen kdo je ten den na poli).
 */
export function lordFieldIds(
  family: LordFamily,
  day: number,
  field: number | LordFieldShares,
): Set<number> {
  const shares = fieldSharesOf(field);
  return new Set(
    family.trainees
      .filter((p) => traineeFieldShare(p, day, family, shares) > FIELD_EPSILON)
      .map((p) => p.id),
  );
}

const FIELD_EPSILON = 1e-9;

/**
 * Práce dvorce, když rodina cvičí (lord.md – Den rodiny; jako `workshopLabor` dílen): denní
 * minimum celé domácnosti dvorce (s chůzí pro vodu) kryjí napřed starší dvorce, zbytek dospělí
 * rodiny – ženy, a co nestačí, muži mimo výcvik (návrh Clauda; výcvik se tím nezkrátí). Minimum
 * domů vedlejších manželek vojvody (`wivesApart`) kryjí stejně ony, nekryté platí ves. Dům elity
 * (`eliteHomes`, hillfort.md – Elita) kryje své minimum jako dvorec jeho lidé z rodiny. Co ženám
 * zbude, je domácí výroba dvorce a do práce vsi nejde (Martin 23. 10. 2026: „Jen domácnost“).
 * Ve žňový den (`harvestHandsDay`), kdy ves žně sama nestíhá, dá rodina přítomná ve vsi podíl
 * dne z plánu (`FarmSeason.lordHelp`; lord.md – Kdy jde rodina na pole), v oknech setí podíl
 * přípravy půdy a setí (`FarmSeason.lordSowing` – D102) – napřed ženy a dcery, pak muži, vojvoda
 * až nakonec (`lordFieldShares`). Kdo je pryč (tažení, výprava), práci nemá.
 */
export function manorLabor(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  productivity = 1,
  family: LordFamily = lordFamily(state, day),
  chores: DayChores = SUMMER_CHORES,
): ManorLabor {
  const manor = villageManorId(state);
  const labor = (people: readonly Person[]): number =>
    people.reduce((sum, p) => sum + laborPerDay(p, day), 0) * Math.max(0, productivity);
  // denní minimum domácnosti obydlí `home` (s chůzí pro vodu) po starších
  const homeNeed = (home: number | null): number => {
    const members = home === null ? [] : state.people.filter((p) => p.dwellingId === home);
    const elders = members.filter((p) => ageGroup(p, day) === 'elder').length;
    // podle skladby dne (population.md – Skladba dne podle ročního období)
    const minimum = householdMinimum(
      dailyMinPerHousehold(potteryCoverage),
      members.length,
      state.dwellings.find((d) => d.id === home),
      chores,
    );
    return adultDailyMin(minimum, elders, productivity);
  };
  // dvorec a domy elity (hillfort.md – Elita: „stejné pravidlo jako rodina ve dvorci“) – každý dům
  // kryje své minimum lidmi rodiny z toho domu, napřed ženy, pak muži; ke dvorci patří, kdo nebydlí
  // v domě elity (pořadí lidí zachované – samotný dvorec vyjde bit po bitu jako dřív)
  const eliteHomes = new Set(family.eliteHomes);
  let need = 0;
  let homesMin = 0;
  let homesFree = 0;
  let freeMen = 0;
  let freeLord = 0;
  for (const home of [manor, ...family.eliteHomes]) {
    const inHome = (p: Person): boolean =>
      home === manor ? !eliteHomes.has(p.dwellingId) : p.dwellingId === home;
    const homeMin = homeNeed(home);
    const trainees = family.trainees.filter(inHome);
    const capacity = labor([...family.household.filter(inHome), ...trainees]);
    const covered = Math.min(homeMin, capacity);
    need += homeMin;
    homesMin += covered;
    homesFree += capacity - covered;
    const men = Math.min(capacity - covered, labor(trainees));
    freeMen += men;
    // minimum, na které ženy nestačí, kryjí napřed synové – vojvoda jde na pole poslední
    const lord = trainees.filter((p) => p.id === family.lord?.id);
    freeLord += Math.min(men, labor(lord));
  }
  // domy vedlejších manželek vojvody (lord.md – Rod vojvody, Manželky – Práce): minimum kryjí ony,
  // co nestačí, platí ves; co jim zbude, je domácí výroba – na pole jen ve žních s rodinou
  let apartNeed = 0;
  let apartMin = 0;
  let apartFree = 0;
  for (const home of new Set(family.wivesApart.map((w) => w.dwellingId))) {
    const homeMin = homeNeed(home);
    const wives = labor(family.wivesApart.filter((w) => w.dwellingId === home));
    apartNeed += homeMin;
    apartMin += Math.min(homeMin, wives);
    apartFree += Math.max(0, wives - homeMin);
  }
  const dailyMin = homesMin + apartMin;
  const free = homesFree + apartFree;
  // ve žňový den, kdy ves žně sama nestíhá, rodina – jen podíl, který chybí (kdo jde, určí
  // `lordFieldShares`: ženy, muži, vojvoda); v oknech setí podíl přípravy půdy a setí, které ves
  // sama nestihne (D102)
  const help = harvestHandsDay(state, day) ? lordHelpShare(state.season, day) * free : 0;
  const sowing = lordSowingShare(state.season, day) * free;
  return {
    dailyMin,
    uncovered: need + apartNeed - dailyMin,
    help,
    sowing,
    free,
    freeMen,
    freeLord,
  };
}

/**
 * Převod (lord.md – Kdy jde rodina na pole; Martin 9. 11. 2026): rodina nejde na pole při hladu
 * (`LordState.field`, `fedDays` zmizí) a s osevem nepomáhá (okna setí z `FarmSeason.lordHelp`
 * zmizí – zůstanou jen žně). Jednou, idempotentně; vstupní stav nemění.
 */
export function withoutSowingHelp(state: VillageState): VillageState {
  const lord = state.lord as (LordState & { field?: unknown; fedDays?: unknown }) | undefined;
  const lordLegacy = lord !== undefined && ('field' in lord || 'fedDays' in lord);
  const stale = (season: VillageState['season']): boolean =>
    season?.lordHelp !== undefined &&
    Object.keys(season.lordHelp).some(
      (w) => !(HARVEST_HELP_WINDOWS as readonly string[]).includes(w),
    );
  if (!lordLegacy && !stale(state.season)) return state;
  const next = { ...state };
  if (lord && lordLegacy) {
    const rest = { ...lord };
    delete rest.field;
    delete rest.fedDays;
    next.lord = rest;
  }
  const season = state.season;
  if (season && stale(season)) {
    const help: LordHelp = {};
    for (const w of HARVEST_HELP_WINDOWS) {
      const share = season.lordHelp?.[w];
      if (share !== undefined) help[w] = share;
    }
    const rest = { ...season };
    if (Object.keys(help).length > 0) rest.lordHelp = help;
    else delete rest.lordHelp;
    next.season = rest;
  }
  return next;
}

const NO_ARMS: ArmsSkills = { bow: 0, combat: 0, riding: 0 };

/**
 * Výcvik dne (lord.md – Výcvik a zkušenost; mutuje lidi a koně): cvičící rodiny dostanou
 * `trainArms` podle hodin dne – jízdu jen jezdec s koněm (horses.md – Výcvik koně a jezdec, páry
 * `assignRiders` drží i mimo výcvik); muži na poli jen `1 −` svůj podíl dne na poli (`field` –
 * `lordFieldShares`: muži rodiny, vojvoda), chlapci 7–13 let cvičí vždy. Kdo dnes necvičí (rodina
 * celý den na poli, muž mimo dvorec, rodina pracuje jako ostatní, kdo je pryč – `isAway`;
 * lord-control.md – Doma mezitím), zapomíná (`decayArms`). Koně se cvičí pod jezdci, kteří dnes
 * jezdili (`trainHorsesDay`); vrací události kroniky.
 */
export function trainLordDay(
  state: VillageState,
  day: number,
  field: number | LordFieldShares = 0,
): ChronicleEvent[] {
  const family = trainingFamily(state, day);
  const trainees = new Set(family ? family.trainees.map((p) => p.id) : []);
  const shares = fieldSharesOf(field);
  const paired =
    horsePens(state).length > 0
      ? assignRiders(state, day, family ?? lordFamily(state, day))
      : NO_RIDERS;
  // dny na poli – žně s rodinou (horses.md – Výcvik koně a jezdec): kdo je dnes na poli, nejezdí
  // (jen on – návrh Clauda); když kůň není podkutý (horses.md – Kování), nejezdí nikdo – jezdec
  // cvičí místo jízdy luk a boj
  const onField = family ? lordFieldIds(family, day, shares) : new Set<number>();
  const mounted = isUnshod(state, day)
    ? NO_RIDERS
    : onField.size > 0
      ? new Set([...paired].filter((id) => !onField.has(id)))
      : paired;
  const riding = new Map<number, number>();
  // den lovu je výcvik (wildlife.md – Lov rodu): jezdec jízda 3 h a luk 3 h, pěší luk 2 h a boj 4 h
  const hunt = state.wildlife?.hunt?.today;
  const huntRiders = new Set(hunt?.day === day ? hunt.riders.map((r) => r.personId) : []);
  const huntFoot = new Set(hunt?.day === day ? hunt.foot : []);
  for (const p of state.people) {
    // zraněný na lovu necvičí (wildlife.md – Nebezpečí pro lidi) a nezapomíná
    if (isInjured(p, day)) continue;
    // kdo je pryč (výprava, tažení, robota…), necvičí a zapomíná; pár s koněm drží dál
    if (isAway(p, day)) {
      if (p.arms) p.arms = decayArms(p.arms);
      continue;
    }
    if (family && trainees.has(p.id)) {
      const share = 1 - traineeFieldShare(p, day, family, shares);
      const hunting = huntRiders.has(p.id) || huntFoot.has(p.id);
      const h = hunting
        ? HUNT.training[huntRiders.has(p.id) ? 'rider' : 'foot']
        : trainingHours(p, day, family.lord, mounted.has(p.id));
      if (share > 0 && h.bow + h.combat + h.riding > 0) {
        const hours = { bow: h.bow * share, combat: h.combat * share, riding: h.riding * share };
        p.arms = trainArms(
          p.arms ?? NO_ARMS,
          hours,
          trainingCap(p, day, hunting ? 'hunt' : 'home'),
        );
        if (hours.riding > 0) riding.set(p.id, share);
        continue;
      }
    }
    // odešlý syn na lovu cvičí oštěpem místo zapomínání (wildlife.md – Lov rodu)
    if (huntFoot.has(p.id)) {
      const hours = HUNT.training.foot;
      p.arms = trainArms(p.arms ?? NO_ARMS, hours, trainingCap(p, day, 'hunt'));
    } else if (p.arms) p.arms = decayArms(p.arms);
  }
  return family ? trainHorsesDay(state, day, riding) : [];
}

/**
 * Cvičící, kteří jdou podle plánu pomoci na pole – ve žňový den (`FarmSeason.lordHelp` × `free`)
 * a v oknech setí (`FarmSeason.lordSowing` × `free` – D102), pořadí `lordFieldShares`; mimo dny
 * pomoci prázdné. Odhad bez nádob od hrnčíře (minimum dvorce jako bez keramiky – `craftCoverage`
 * by s `crafts.ts` udělal kruh importů; návrh Clauda). Jen čte stav.
 */
export function harvestFieldIds(state: VillageState, day: number, family: LordFamily): Set<number> {
  const harvest = harvestHandsDay(state, day) && lordHelpShare(state.season, day) > 0;
  if (!harvest && lordSowingShare(state.season, day) <= 0) return new Set();
  const manor = manorLabor(state, day, 0, 1, family);
  return lordFieldIds(family, day, lordFieldShares(manor, manor.help + manor.sowing));
}

/** Jezdec dne (`lordRides`): kdo, na kterém koni, výcvik koně a hodiny jízdy dne. */
export interface LordRide {
  riderId: number;
  horseId: number;
  training: number;
  hours: number;
}

/**
 * Jízdy dne (horses.md – Kdy a kam se jezdí, dokud není lov; návrh Clauda): jezdci rodiny pohromadě
 * – objížďka polí, nebo jednou za `HORSES.borderRideEveryDays` dní po hotové zemské stezce
 * (`trailId`) k hranici mapy; výpravu, která dnes vyráží, doprovodí nejstarší jezdec mimo vojvodu
 * (sám vojvoda, když jiného jezdce nemá) a s ostatními nejede.
 */
export interface LordRides {
  riders: LordRide[];
  trailId: number | null;
  escort: (LordRide & { expeditionId: number; trailId: number }) | null;
}

/**
 * Kdo dnes jede a na kterém koni (horses.md – Výcvik koně a jezdec, Kdy a kam se jezdí): stejné
 * jako jízda v `trainLordDay` – jezdec z cvičící rodiny se svým koněm (`Horse.riderId`, kůň ve
 * službě) a hodinami jízdy dne (`trainingHours`), vojvoda první, pak od nejstaršího. Ve žňový den
 * a v okně setí, kdy rodina pomáhá, nejede, kdo je na poli (`harvestFieldIds`); bez cvičící rodiny
 * null; ves bez jezdců prázdné `riders`. Jen čte stav (pro scénu a hlídky polí).
 */
export function lordRides(state: VillageState, day: number): LordRides | null {
  const family = trainingFamily(state, day);
  if (!family) return null;
  // nepodkuté koně nikdo nevyvádí (horses.md – Kování)
  if (isUnshod(state, day)) return null;
  // ve žňový den a v okně setí, kdy rodina pomáhá (`manorLabor` – `help`, `sowing`), nejezdí, kdo
  // jde podle plánu pomoci na pole (`lordFieldShares` – ženy, muži, vojvoda; kůň stojí)
  const onField = harvestFieldIds(state, day, family);
  const trainees = new Map(family.trainees.filter((p) => !onField.has(p.id)).map((p) => [p.id, p]));
  const hunting = new Set(huntToday(state, day)?.riders.map((r) => r.personId));
  const lordId = family.lord?.id;
  const riders: (LordRide & { bornDay: number })[] = [];
  for (const pen of horsePens(state)) {
    for (const horse of penHorses(pen)) {
      const rider = horse.riderId === undefined ? undefined : trainees.get(horse.riderId);
      // zraněný nejezdí; kdo dnes loví, objížďku nejede (wildlife.md – Lov rodu)
      if (!rider || !isGrainHorse(horse, day) || isInjured(rider, day)) continue;
      // jezdec na výpravě je pryč (expeditions.md) – objížďku nejede
      if (isAway(rider, day)) continue;
      if (hunting.has(rider.id)) continue;
      const hours = trainingHours(rider, day, family.lord, true).riding;
      if (hours <= 0) continue;
      riders.push({
        riderId: rider.id,
        horseId: horse.id,
        training: horse.training,
        hours,
        bornDay: rider.bornDay,
      });
    }
  }
  const rank = (r: { riderId: number }): number => (r.riderId === lordId ? 0 : 1);
  riders.sort((a, b) => rank(a) - rank(b) || a.bornDay - b.bornDay || a.riderId - b.riderId);
  const leaving = (state.trade?.expeditions ?? [])
    .filter((e) => e.kind !== 'shipment' && e.startedDay === day)
    .sort((a, b) => a.id - b.id)[0];
  const escortRider = leaving ? (riders.find((r) => rank(r) === 1) ?? riders[0]) : undefined;
  const ride = ({ riderId, horseId, training, hours }: LordRide): LordRide => ({
    riderId,
    horseId,
    training,
    hours,
  });
  const escort =
    leaving && escortRider
      ? { ...ride(escortRider), expeditionId: leaving.id, trailId: leaving.trailId }
      : null;
  const trails = (state.trails ?? [])
    .filter((t) => t.builtDay !== null)
    .sort((a, b) => a.id - b.id);
  const every = HORSES.borderRideEveryDays;
  const dayIndex = Math.floor(day);
  const trailId =
    trails.length > 0 && ((dayIndex % every) + every) % every === 0
      ? trails[Math.floor(dayIndex / every) % trails.length]!.id
      : null;
  return {
    riders: riders.filter((r) => r.riderId !== escort?.riderId).map(ride),
    trailId,
    escort,
  };
}

/**
 * Počty lidí cvičící rodiny dne (`LaborDay.lord` – pro scénu a lištu): na poli je podíl
 * `field.women` dospělých žen, `field.men` dospělých mužů rodiny a vojvoda podle `field.lord`
 * (zaokrouhleno – `lordFieldShares`), ostatní muži a chlapci cvičí a ženy vedou domácnost dvorce.
 */
export function lordDayCounts(
  family: LordFamily,
  day: number,
  field: number | LordFieldShares,
): { training: number; field: number; household: number } {
  const shares = fieldSharesOf(field);
  const adults = (people: Person[]): Person[] => people.filter((p) => ageGroup(p, day) !== 'child');
  const grown = adults(family.trainees);
  const lordOnField = grown.some((p) => p.id === family.lord?.id) ? Math.round(shares.lord) : 0;
  const sons = grown.filter((p) => p.id !== family.lord?.id).length;
  const men = Math.round(sons * Math.min(1, Math.max(0, shares.men))) + lordOnField;
  const women = Math.round(
    adults(family.household).length * Math.min(1, Math.max(0, shares.women)),
  );
  return {
    training: family.trainees.length - men,
    field: men + women,
    household: family.household.length - women,
  };
}
