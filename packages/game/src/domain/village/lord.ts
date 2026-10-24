// Vojvodova rodina a dovednosti (docs/design/lord.md): kdo patří k rodině, výcvik den po dni, růst
// a úbytek dovedností, denní minimum dvorce a kdy jde rodina na pole.
import { assignRiders, NO_RIDERS, trainHorsesDay } from './horse-riders';
import { horsePens, isGrainHorse, penHorses } from './horses';
import { householdHead } from './households';
import { adultDailyMin, waterFetchingLabor } from './labor';
import { villageManorId } from './manor';
import { ageGroup, ageYears, laborPerDay } from './people';
import { dailyMinPerHousehold } from './productivity';
import { AGE, HORSES, LORD } from './rules';
import { lordHelpShare } from './sowing';
import type { ArmsSkills, ChronicleEvent, Person, VillageState } from './types';

/** Co z vsi rodina potřebuje – lidé a dvorec. */
type LordView = Pick<VillageState, 'people' | 'manorId' | 'dwellings' | 'constructions'>;

/** Rodina vojvody (lord.md – Kdo je vojvodova rodina). */
export interface LordFamily {
  /** Hlava dvorce. */
  lord: Person | null;
  /** Vojvoda a jeho potomci po meči v dvorci od 7 let – cvičí. */
  trainees: Person[];
  /** Žena vojvody, dcery, snachy a vnučky – jen domácnost dvorce. */
  household: Person[];
  /** Zbytek dvorce (zeť, ženich, chlapci pod 7 let) – pracují jako dosud. */
  others: Person[];
}

type Hours = { bow: number; combat: number; riding: number };

/**
 * Rodina vojvody (lord.md – Kdo je vojvodova rodina): trénuje vojvoda a jeho potomci po meči
 * v dvorci (`fatherId` řetězem) od 7 let; žena vojvody, jeho dcery a vnučky po meči a snachy
 * (ženy cvičících) vedou jen domácnost; ostatní v dvorci (zeť, synové předchozího vojvody, chlapci
 * pod 7 let) jsou `others`. Kdo dvorec opustil, v rodině není.
 */
export function lordFamily(state: LordView, day: number): LordFamily {
  const manor = villageManorId(state);
  const lord = manor === null ? undefined : householdHead(state.people, manor, day);
  // vojvoda je nejstarší muž dvorce (lord.md – Kdo je vojvodova rodina); dvorec vdovy vojvodu nemá
  if (manor === null || !lord || lord.sex === 'female') {
    return { lord: null, trainees: [], household: [], others: [] };
  }
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
  return { lord, trainees, household, others };
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
  const inFamily = new Set([...family.trainees, ...family.household].map((p) => p.id));
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
 * Id lidí cvičící rodiny, kteří jsou mimo práci vsi (cvičící muži a domácnost vojvody) – jedno
 * místo pravdy pro `work()`, plán osevu (`sowingCapacity`) i nákupy (`craft-buying`).
 */
export function lordApartIds(
  state: LordView & Pick<VillageState, 'lord'>,
  day: number,
): ReadonlySet<number> {
  const family = trainingFamily(state, day);
  return new Set(family ? [...family.trainees, ...family.household].map((p) => p.id) : []);
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
 * rodiny – ženy, a co nestačí, muži mimo výcvik (návrh Clauda; výcvik se tím nezkrátí). Co ženám
 * zbude, je domácí výroba dvorce a do práce vsi nejde (Martin 23. 10. 2026: „Jen domácnost“).
 * Na poli (hlad – `state.lord.field`) dají všichni dospělí rodiny vše po minimu. Jinak s potřebným
 * osevem jen podíl dne z plánu, a to jen práce cvičících mužů (`freeMen`; ženy a dcery jen při hladu; lord.md – Kdy jde rodina na pole, bod 1; `YearPlan.lordHelp`).
 */
export function manorLabor(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  productivity = 1,
  family: LordFamily = lordFamily(state, day),
): ManorLabor {
  const manor = villageManorId(state);
  const members = manor === null ? [] : state.people.filter((p) => p.dwellingId === manor);
  const elders = members.filter((p) => ageGroup(p, day) === 'elder').length;
  const walk = state.dwellings.find((d) => d.id === manor)?.waterWalkM;
  const minimum = dailyMinPerHousehold(potteryCoverage) + waterFetchingLabor(members.length, walk);
  const need = adultDailyMin(minimum, elders, productivity);
  const capacity =
    [...family.household, ...family.trainees].reduce((sum, p) => sum + laborPerDay(p, day), 0) *
    Math.max(0, productivity);
  const menCapacity =
    family.trainees.reduce((sum, p) => sum + laborPerDay(p, day), 0) * Math.max(0, productivity);
  const dailyMin = Math.min(need, capacity);
  const free = capacity - dailyMin;
  const freeMen = Math.min(free, menCapacity);
  const hunger = state.lord?.field?.reason === 'hunger';
  const field = hunger ? free : 0;
  const help = hunger ? 0 : lordHelpShare(state.plan, day) * freeMen;
  return { dailyMin, uncovered: need - dailyMin, field, help, free, freeMen };
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
  const mounted = state.lord?.field ? NO_RIDERS : paired;
  const riding = new Map<number, number>();
  for (const p of state.people) {
    if (family && trainees.has(p.id)) {
      const share = ageGroup(p, day) === 'child' ? 1 : 1 - onField;
      const h = trainingHours(p, day, family.lord, mounted.has(p.id));
      if (share > 0 && h.bow + h.combat + h.riding > 0) {
        const hours = { bow: h.bow * share, combat: h.combat * share, riding: h.riding * share };
        p.arms = trainArms(p.arms ?? NO_ARMS, hours, armsCap(p, day));
        if (hours.riding > 0) riding.set(p.id, share);
        continue;
      }
    }
    if (p.arms) p.arms = decayArms(p.arms);
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
 * a bez cvičící rodiny null; ves bez jezdců prázdné `riders`. Jen čte stav (pro scénu).
 */
export function lordRides(
  state: LordView & Pick<VillageState, 'lord' | 'pens' | 'trails' | 'trade'>,
  day: number,
): LordRides | null {
  const family = trainingFamily(state, day);
  if (!family || state.lord?.field) return null;
  const trainees = new Map(family.trainees.map((p) => [p.id, p]));
  const lordId = family.lord?.id;
  const riders: (LordRide & { bornDay: number })[] = [];
  for (const pen of horsePens(state)) {
    for (const horse of penHorses(pen)) {
      const rider = horse.riderId === undefined ? undefined : trainees.get(horse.riderId);
      if (!rider || !isGrainHorse(horse, day)) continue;
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
    .filter((e) => e.startedDay === day)
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
