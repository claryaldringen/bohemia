// Vojvodova rodina a dovednosti (docs/design/lord.md): kdo patří k rodině, výcvik den po dni, růst
// a úbytek dovedností, denní minimum dvorce a kdy jde rodina na pole.
import { assignRiders, NO_RIDERS, trainHorsesDay } from './horse-riders';
import { isUnshod } from './horse-shoeing-term';
import { horsePens, isGrainHorse, penHorses } from './horses';
import { currentLord, isDynastyTracked, isElite, isLineMan, lineMen } from './dynasty';
import { harvestHandsDay } from './harvest-hands';
import { huntToday } from './hunt-party';
import { householdHead } from './households';
import { adultDailyMin, waterFetchingLabor } from './labor';
import { villageManorId } from './manor';
import { ageGroup, ageYears, isInjured, laborPerDay } from './people';
import { dailyMinPerHousehold } from './productivity';
import { AGE, ARMS_CAPS, HORSES, LORD, type ArmsSource } from './rules';
import { HUNT } from './rules-wildlife';
import { lordHelpShare } from './sowing';
import type { ArmsSkills, ChronicleEvent, Person, VillageState } from './types';

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
 * manželky ve vlastních domech) – jedno místo pravdy pro `work()`, plán osevu (`sowingCapacity`)
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
  /** Co dospělí rodiny dají do sezónních úloh při hladu (`allocateDay` – `lordField`); jinak 0. */
  field: number;
  /**
   * Pomoc s potřebným osevem (`allocateDay` – `lordHelp`): podíl dne z plánu (`lordHelpShare`) ×
   * `freeMen`; při hladu a mimo okna pomoci 0.
   */
  help: number;
  /**
   * Žňový den (fields.md – Žně všemi rukama, `harvestHandsDay`): cvičící muži dají `freeMen` na žeň
   * a výmlat (`allocateDay` – `lordHarvest`), pomoc s osevem pak 0; při hladu a mimo žně 0.
   */
  harvest: number;
  /** Práce dospělých rodiny po denním minimu dvorce – celý den rodiny při hladu (podíl ÷ `free`). */
  free: number;
  /**
   * Práce cvičících mužů po minimu dvorce (minimum kryjí napřed ženy) – jen ta jde na pomoc s
   * osevem; ženy na pole nechodí (Martin 23. 10. 2026: „Jen domácnost“), jen při hladu.
   */
  freeMen: number;
}

/**
 * Práce dvorce, když rodina cvičí (lord.md – Den rodiny; jako `workshopLabor` dílen): denní
 * minimum celé domácnosti dvorce (s chůzí pro vodu) kryjí napřed starší dvorce, zbytek dospělí
 * rodiny – ženy, a co nestačí, muži mimo výcvik (návrh Clauda; výcvik se tím nezkrátí). Minimum
 * domů vedlejších manželek vojvody (`wivesApart`) kryjí stejně ony, nekryté platí ves. Dům elity
 * (`eliteHomes`, hillfort.md – Elita) kryje své minimum jako dvorec jeho lidé z rodiny. Co ženám
 * zbude, je domácí výroba dvorce a do práce vsi nejde (Martin 23. 10. 2026: „Jen domácnost“).
 * Na poli (hlad – `state.lord.field`) dají všichni dospělí rodiny vše po minimu. Ve žňový den
 * (`harvestHandsDay`) dají cvičící muži `freeMen` na žeň a výmlat. Jinak s potřebným
 * osevem jen podíl dne z plánu, a to jen práce cvičících mužů (`freeMen`; ženy a dcery jen při hladu; lord.md – Kdy jde rodina na pole, bod 1; `FarmSeason.lordHelp`).
 */
export function manorLabor(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  productivity = 1,
  family: LordFamily = lordFamily(state, day),
): ManorLabor {
  const manor = villageManorId(state);
  const labor = (people: readonly Person[]): number =>
    people.reduce((sum, p) => sum + laborPerDay(p, day), 0) * Math.max(0, productivity);
  // denní minimum domácnosti obydlí `home` (s chůzí pro vodu) po starších
  const homeNeed = (home: number | null): number => {
    const members = home === null ? [] : state.people.filter((p) => p.dwellingId === home);
    const elders = members.filter((p) => ageGroup(p, day) === 'elder').length;
    const walk = state.dwellings.find((d) => d.id === home)?.waterWalkM;
    const minimum =
      dailyMinPerHousehold(potteryCoverage) + waterFetchingLabor(members.length, walk);
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
    freeMen += Math.min(capacity - covered, labor(trainees));
  }
  // domy vedlejších manželek vojvody (lord.md – Rod vojvody, Manželky – Práce): minimum kryjí ony,
  // co nestačí, platí ves; co jim zbude, je domácí výroba – na pole jen při hladu
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
  const hunger = state.lord?.field?.reason === 'hunger';
  const field = hunger ? free : 0;
  // ve žňový den jdou cvičící muži na žeň a výmlat (Martin 24. 10. 2026: „Dílny i vojvodova
  // rodina“) – ženy rodiny dál jen domácnost
  const harvest = !hunger && harvestHandsDay(state, day) ? freeMen : 0;
  const help = hunger || harvest > 0 ? 0 : lordHelpShare(state.season, day) * freeMen;
  return {
    dailyMin,
    uncovered: need + apartNeed - dailyMin,
    field,
    harvest,
    help,
    free,
    freeMen,
  };
}

/**
 * Kdy jde rodina na pole kvůli hladu (lord.md – Kdy jde rodina na pole; volá se po jídle dne,
 * mutuje `state.lord`): ves šetří jídlem nebo hladoví (`state.hungry`) → rodina jde od zítřka na
 * pole a počítadlo plných dní se vynuluje; jinak přibude den plného přídělu a po
 * `LORD.backToTrainingDays` dnech po sobě se rodina vrátí k výcviku. Kronika jen při změně. Jen
 * když rodina cvičí – jinak pracuje jako ostatní.
 */
export function lordFieldMode(state: VillageState, day: number): ChronicleEvent[] {
  const lord = state.lord;
  if (lord?.trains !== true) return [];
  if (state.hungry) {
    const events: ChronicleEvent[] = lord.field
      ? []
      : [{ day, kind: 'lord-to-field', reason: 'hunger' }];
    if (lord.field?.reason !== 'hunger') lord.field = { since: day, reason: 'hunger' };
    lord.fedDays = 0;
    return events;
  }
  if (!lord.field) return [];
  lord.fedDays = (lord.fedDays ?? 0) + 1;
  if (lord.fedDays < LORD.backToTrainingDays) return [];
  delete lord.field;
  delete lord.fedDays;
  return [{ day, kind: 'lord-to-training' }];
}

const NO_ARMS: ArmsSkills = { bow: 0, combat: 0, riding: 0 };

/**
 * Výcvik dne (lord.md – Výcvik a zkušenost; mutuje lidi a koně): cvičící rodiny dostanou
 * `trainArms` podle hodin dne – jízdu jen jezdec s koněm (horses.md – Výcvik koně a jezdec, páry
 * `assignRiders` drží i mimo výcvik); dospělí na poli jen `1 − fieldShare` dne (podíl práce
 * rodiny, který dnes spotřebovaly úlohy), chlapci 7–13 let cvičí vždy. Kdo dnes necvičí (rodina
 * celý den na poli, muž mimo dvorec, rodina pracuje jako ostatní), zapomíná (`decayArms`). Koně
 * se cvičí pod jezdci, kteří dnes jezdili (`trainHorsesDay`); vrací události kroniky.
 */
export function trainLordDay(state: VillageState, day: number, fieldShare = 0): ChronicleEvent[] {
  const family = trainingFamily(state, day);
  const trainees = new Set(family ? family.trainees.map((p) => p.id) : []);
  const onField = Math.min(1, Math.max(0, fieldShare));
  const paired =
    horsePens(state).length > 0
      ? assignRiders(state, day, family ?? lordFamily(state, day))
      : NO_RIDERS;
  // dny na poli (horses.md – Výcvik koně a jezdec): koně stojí v ohradě, nikdo nejezdí – i chlapci,
  // kteří cvičí vždy, cvičí místo jízdy luk a boj jako jezdec bez koně
  // totéž platí, když kůň není podkutý (horses.md – Kování): jezdec cvičí místo jízdy luk a boj
  const mounted = state.lord?.field || isUnshod(state, day) ? NO_RIDERS : paired;
  const riding = new Map<number, number>();
  // den lovu je výcvik (wildlife.md – Lov rodu): jezdec jízda 3 h a luk 3 h, pěší luk 2 h a boj 4 h
  const hunt = state.wildlife?.hunt?.today;
  const huntRiders = new Set(hunt?.day === day ? hunt.riders.map((r) => r.personId) : []);
  const huntFoot = new Set(hunt?.day === day ? hunt.foot : []);
  for (const p of state.people) {
    // zraněný na lovu necvičí (wildlife.md – Nebezpečí pro lidi) a nezapomíná
    if (isInjured(p, day)) continue;
    if (family && trainees.has(p.id)) {
      const share = ageGroup(p, day) === 'child' ? 1 : 1 - onField;
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
 * službě) a hodinami jízdy dne (`trainingHours`), vojvoda první, pak od nejstaršího. V dnech na poli
 * (hlad, žňový den cvičících mužů) a bez cvičící rodiny null; ves bez jezdců prázdné `riders`. Jen čte stav (pro scénu).
 */
export function lordRides(state: VillageState, day: number): LordRides | null {
  const family = trainingFamily(state, day);
  if (!family || state.lord?.field) return null;
  // nepodkuté koně nikdo nevyvádí (horses.md – Kování)
  if (isUnshod(state, day)) return null;
  // ve žňový den jdou cvičící muži na žeň (`manorLabor` – `harvest`) a nejezdí (kůň stojí)
  if (harvestHandsDay(state, day) && family.trainees.some((p) => ageGroup(p, day) !== 'child')) {
    return null;
  }
  const trainees = new Map(family.trainees.map((p) => [p.id, p]));
  const hunting = new Set(huntToday(state, day)?.riders.map((r) => r.personId));
  const lordId = family.lord?.id;
  const riders: (LordRide & { bornDay: number })[] = [];
  for (const pen of horsePens(state)) {
    for (const horse of penHorses(pen)) {
      const rider = horse.riderId === undefined ? undefined : trainees.get(horse.riderId);
      // zraněný nejezdí; kdo dnes loví, objížďku nejede (wildlife.md – Lov rodu)
      if (!rider || !isGrainHorse(horse, day) || isInjured(rider, day)) continue;
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
 * `fieldShare` dospělých mužů a podíl `womenShare` žen rodiny (zaokrouhleno; ženy jen při hladu,
 * u pomoci s osevem 0), ostatní muži a chlapci cvičí a ženy vedou domácnost dvorce.
 */
export function lordDayCounts(
  family: LordFamily,
  day: number,
  fieldShare: number,
  womenShare = fieldShare,
): { training: number; field: number; household: number } {
  const adults = (people: Person[]): number =>
    people.filter((p) => ageGroup(p, day) !== 'child').length;
  const share = Math.min(1, Math.max(0, fieldShare));
  const men = Math.round(adults(family.trainees) * share);
  const women = Math.round(adults(family.household) * Math.min(1, Math.max(0, womenShare)));
  return {
    training: family.trainees.length - men,
    field: men + women,
    household: family.household.length - women,
  };
}
