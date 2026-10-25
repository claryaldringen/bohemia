import { createRandom, deriveSeed } from '../landscape/random';
import { bury, hygieneDeathFactor, villageHygiene } from './cemetery';
import { isOvercrowded } from './dwellings';
import { isDynastyTracked, isLineMan, markNewborn } from './dynasty';
import { removePeople } from './kinship';
import { ageGroup, ageYears, canBear, canFather, householdBreaksUp, occupants } from './people';
import {
  ADULT_DEATHS_PER_YEAR,
  AGE,
  BIRTH_SPACING,
  BOY_SHARE,
  CROWDED_BIRTH_FACTOR,
  CROWDED_DEATH_FACTOR,
  DWELLINGS,
  ELDER_DEATHS_PER_YEAR,
  HUNGER,
  LUCKY_CHILD_DEATH_FACTOR,
  LUCKY_YEARS,
  STARVATION,
  childDeathsPerYear,
  maritalFertility,
} from './rules';
import type { ChronicleEvent, Dwelling, DwellingType, Person, VillageState } from './types';

const DAYS_PER_YEAR = 365.25; // hájení se měří v letech po 365,25 dne
const DAYS_PER_RISK_YEAR = 365; // roční riziko se na den převádí přes 365 dní
const MIN_WAIT_YEARS = 0.25; // nejkratší průměrné čekání na početí po pauze (pojistka)

type AgeGroup = 'child' | 'adult' | 'elder';
const AGE_GROUPS: readonly AgeGroup[] = ['child', 'adult', 'elder'];

/**
 * Vliv hladu na porody: 0 při energii ≤ 0,5, lineárně 1 při energii ≥ 0,95. Brzdí jen opravdový
 * hlad (podíl kalorií proti potřebě), ne jednotvárná strava (Martin, 25. 10. 2026; population.md
 * – Růst populace, diet.md).
 */
function hungerBirthFactor(energy: number): number {
  const span = HUNGER.birthsFullAt - HUNGER.birthsStopAt;
  return Math.min(1, Math.max(0, (energy - HUNGER.birthsStopAt) / span));
}

/**
 * Roční šance na porod vdané ženy věku `age` mimo pauzu po porodu (population.md – Růst
 * populace, rozestup porodů): po porodu žena BIRTH_SPACING.afterBirthDays nerodí, pak rodí s touto
 * šancí – průměrný odstup porodů tak vyjde 1 / plodnost věku (`maritalFertility`).
 */
export function birthRatePerYear(age: number): number {
  const fertility = maritalFertility(age);
  if (fertility <= 0) return 0;
  const pauseYears = BIRTH_SPACING.afterBirthDays / DAYS_PER_YEAR;
  return 1 / Math.max(MIN_WAIT_YEARS, 1 / fertility - pauseYears);
}

/**
 * Pravděpodobnost porodu manželského páru za den – podle věku ženy (`birthRatePerYear`), hladu
 * a přeplnění; v pauze po svatbě nebo porodu (`Person.nextBirthFrom`) ji počítá `populationDay`.
 */
export function birthChancePerDay(ctx: {
  energy: number;
  overcrowded: boolean;
  motherAge: number;
}): number {
  return (
    (birthRatePerYear(ctx.motherAge) / DAYS_PER_RISK_YEAR) *
    hungerBirthFactor(ctx.energy) *
    (ctx.overcrowded ? CROWDED_BIRTH_FACTOR : 1)
  );
}

function baseDeathsPerYear(group: AgeGroup, dwellingType: DwellingType): number {
  if (group === 'child') return childDeathsPerYear() * DWELLINGS[dwellingType].childDeathFactor;
  return group === 'adult' ? ADULT_DEATHS_PER_YEAR : ELDER_DEATHS_PER_YEAR;
}

/** Hájení – prvních LUCKY_YEARS herních let od založení vsi (population.md). */
export function inLuckyYears(foundedDay: number, day: number): boolean {
  return day - foundedDay < LUCKY_YEARS * DAYS_PER_YEAR;
}

/**
 * Nejvýš kolik nahromaděného hladu má skupina v hájení – den pod jejím prahem (dospělí 19, děti
 * a starší 11), aby po konci hájení lidé umírali postupně, ne všichni hned druhý den.
 */
export function luckyStarvationCap(group: AgeGroup): number {
  return STARVATION.threshold[group] - STARVATION.luckyMarginDays;
}

/** Strop nahromaděného hladu vsi v hájení – nejvyšší strop skupin (dospělí, 19 dní). */
export const LUCKY_STARVATION_CAP = Math.max(...AGE_GROUPS.map(luckyStarvationCap));

/**
 * Nahromaděný hlad po dni s nasycením `satiation` (population.md – Hlad a vymření): pod 0,9
 * přibude (0,9 − nasycení) / 0,9 (bez jídla celý den), od 0,9 ubude den (do nuly). Víc než
 * STARVATION.maxDays nemá vliv, v hájení (`lucky`) nejvýš LUCKY_STARVATION_CAP.
 */
export function nextStarvationDays(
  starvationDays: number,
  satiation: number,
  lucky = false,
): number {
  const cap = lucky ? LUCKY_STARVATION_CAP : STARVATION.maxDays;
  if (satiation >= STARVATION.fedFrom) {
    return Math.min(cap, Math.max(0, starvationDays - STARVATION.recoveryPerDay));
  }
  const growth = (STARVATION.fedFrom - Math.max(0, satiation)) / STARVATION.fedFrom;
  return Math.min(cap, starvationDays + growth);
}

/**
 * Denní riziko úmrtí hladem podle nahromaděného hladu a věkové skupiny (bez hájení): 0 do prahu,
 * pak ((hlad − práh) / (jistá smrt − práh))^curve, od hranice jisté smrti 1.
 */
export function starvationDeathChance(group: AgeGroup, starvationDays: number): number {
  const from = STARVATION.threshold[group];
  const to = STARVATION.certainDeath[group];
  if (starvationDays <= from) return 0;
  return Math.min(1, ((starvationDays - from) / (to - from)) ** STARVATION.curve);
}

/** Kontext úmrtnosti člověka v daný den. */
export interface DeathContext {
  day: number;
  foundedDay: number;
  satiation: number;
  overcrowded: boolean;
  dwellingType: DwellingType;
  /** Hygiena 0–1 z pohřebišť (cemetery.md); bez údaje 1 – bez přirážky. */
  hygiene?: number;
  /** Nahromaděný hlad vsi ve dnech bez jídla; bez údaje 0. */
  starvationDays?: number;
}

/**
 * Denní riziko úmrtí člověka po částech: `base` – běžné riziko (věk, přeplněnost, dnešní hlad,
 * hygiena), `starvation` – úmrtí hladem z nahromaděného hladu. Hájení chrání dospělé a starší
 * před obojím, dětem běžné riziko půlí a hlad skupiny drží den pod prahem (`luckyStarvationCap`).
 */
export function deathChances(
  person: Person,
  ctx: DeathContext,
): { base: number; starvation: number } {
  const group = ageGroup(person, ctx.day);
  const lucky = inLuckyYears(ctx.foundedDay, ctx.day);
  if (lucky && group !== 'child') return { base: 0, starvation: 0 };
  const deficit = ctx.starvationDays ?? 0;
  const luck = lucky ? LUCKY_CHILD_DEATH_FACTOR : 1;
  const hunger = 1 + HUNGER.deathExtraAtZero * (1 - ctx.satiation);
  const hygiene = lucky ? 1 : hygieneDeathFactor(group, ctx.hygiene ?? 1);
  const yearly =
    baseDeathsPerYear(group, ctx.dwellingType) *
    luck *
    (ctx.overcrowded ? CROWDED_DEATH_FACTOR : 1) *
    hunger *
    hygiene;
  return {
    base: 1 - (1 - Math.min(1, yearly)) ** (1 / DAYS_PER_RISK_YEAR),
    starvation: starvationDeathChance(
      group,
      lucky ? Math.min(deficit, luckyStarvationCap(group)) : deficit,
    ),
  };
}

/**
 * Pravděpodobnost úmrtí člověka za den – běžné riziko (hájení, přeplněnost, dnešní hlad
 * a hygiena) plus úmrtí z nahromaděného hladu (population.md – Hlad a vymření).
 */
export function deathChancePerDay(person: Person, ctx: DeathContext): number {
  const { base, starvation } = deathChances(person, ctx);
  return Math.min(1, base + starvation);
}

/**
 * Z obývaných obydlí `homes` (kromě `fromId`) to s nejvíc volnými místy, při shodě nižší id; jen
 * obydlí s aspoň `minFree` volnými místy.
 */
function roomiest(
  state: VillageState,
  homes: readonly Dwelling[],
  fromId: number,
  minFree: number,
): { id: number; free: number } | null {
  let target: { id: number; free: number } | null = null;
  for (const d of homes) {
    if (d.id === fromId) continue;
    const count = occupants(state, d.id).length;
    if (count === 0) continue;
    const free = DWELLINGS[d.type].capacity - count;
    if (free < minFree) continue;
    if (target === null || free > target.free || (free === target.free && d.id < target.id)) {
      target = { id: d.id, free };
    }
  }
  return target;
}

/**
 * Žijící otec – muž rodu – samotných dětí `members` mimo jejich dům `fromId` (první v pořadí
 * lidí vsi); ve vsi bez rodu nikdo.
 */
function lineFatherOf(
  state: VillageState,
  members: readonly Person[],
  fromId: number,
): Person | undefined {
  if (!isDynastyTracked(state)) return undefined;
  const fathers = new Set(members.flatMap((m) => (m.fatherId === undefined ? [] : [m.fatherId])));
  return state.people.find((p) => fathers.has(p.id) && isLineMan(p) && p.dwellingId !== fromId);
}

/**
 * Kam se rozpadlá domácnost přestěhuje (kinship.md – Domácnosti): k nejbližším příbuzným – do domu
 * syna, pak dcery, pak sourozence někoho z ní (v každé skupině dům s nejvíc volnými místy), jinak
 * do obydlí s nejvíc volnými místy (population.md – Rozpad domácnosti). Jen tam, kde se všichni
 * vejdou bez přeplnění (Martin, 19. 10. 2026: „Pokud by byla domácnost kam přijde přeplněná, ať
 * radši zůstane ve starém domě.“) – jinak null a domácnost zůstane doma. Samotné děti (nikdo od
 * 16 let) jdou k příbuzným i do přeplněného domu – samy bydlet nemohou (návrh Clauda); ve vsi
 * s rodem děti muže rodu nejdřív k otci (lord.md – Manželky – Dům vedlejší manželky).
 */
function dissolveTarget(
  state: VillageState,
  day: number,
  members: readonly Person[],
  fromId: number,
): { id: number } | null {
  const onlyChildren = members.every((p) => ageYears(p.bornDay, day) < AGE.fertile);
  const father = onlyChildren ? lineFatherOf(state, members, fromId) : undefined;
  if (father) return { id: father.dwellingId };
  const minFree = onlyChildren ? -Infinity : members.length;
  const ids = new Set(members.map((m) => m.id));
  const mothers = new Set(members.flatMap((m) => (m.motherId === undefined ? [] : [m.motherId])));
  const fathers = new Set(members.flatMap((m) => (m.fatherId === undefined ? [] : [m.fatherId])));
  const childOf = (p: Person): boolean =>
    (p.motherId !== undefined && ids.has(p.motherId)) ||
    (p.fatherId !== undefined && ids.has(p.fatherId));
  const tiers: ((p: Person) => boolean)[] = [
    (p) => p.sex === 'male' && childOf(p),
    (p) => p.sex === 'female' && childOf(p),
    (p) =>
      (p.motherId !== undefined && mothers.has(p.motherId)) ||
      (p.fatherId !== undefined && fathers.has(p.fatherId)),
  ];
  for (const related of tiers) {
    const homes = new Set(
      state.people.filter((p) => p.dwellingId !== fromId && related(p)).map((p) => p.dwellingId),
    );
    const target = roomiest(
      state,
      state.dwellings.filter((d) => homes.has(d.id)),
      fromId,
      minFree,
    );
    if (target) return target;
  }
  return roomiest(state, state.dwellings, fromId, minFree);
}

/**
 * Rozpadlé domácnosti (nikdo 16–44 – `householdBreaksUp`) se přestěhují k příbuzným, jinak do
 * obydlí s nejvíc volnými místy (`dissolveTarget`); obydlí podle id. Když by kdekoli přeplnily
 * dům, zůstanou ve svém – dům udrží i jediný obyvatel, dokud nezemře, pomáhají mu sousedé
 * (Martin, 19. 10. 2026); obydlený dům nechátrá.
 */
function dissolveHouseholds(state: VillageState, day: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const ids = state.dwellings.map((d) => d.id).sort((a, b) => a - b);
  for (const fromId of ids) {
    const members = occupants(state, fromId);
    if (!householdBreaksUp(members, day)) continue;
    const target = dissolveTarget(state, day, members, fromId);
    if (target === null) continue;
    for (const p of state.people) {
      if (p.dwellingId === fromId) p.dwellingId = target.id;
    }
    events.push({ day, kind: 'household-merged', fromDwellingId: fromId, toDwellingId: target.id });
  }
  return events;
}

/**
 * Od kterého dne může která žena znovu porodit (population.md – rozestup porodů):
 * `Person.nextBirthFrom`, a když chybí (vsi uložené dřív, lidé od souseda), podle nejmladšího
 * žijícího dítěte – za BIRTH_SPACING.afterBirthDays od jeho narození.
 */
function birthPauses(state: VillageState): Map<number, number> {
  const pauses = new Map<number, number>();
  for (const child of state.people) {
    if (child.motherId === undefined) continue;
    const until = child.bornDay + BIRTH_SPACING.afterBirthDays;
    pauses.set(child.motherId, Math.max(pauses.get(child.motherId) ?? until, until));
  }
  for (const p of state.people) {
    if (p.nextBirthFrom !== undefined) pauses.set(p.id, p.nextBirthFrom);
  }
  return pauses;
}

/**
 * Jeden den populace (porody i úmrtnost hladem podle energie `energy`, nasycení `satiation` jen jako její
 * výchozí hodnota – diet.md): úmrtí (lidé podle id, každý zemřelý se pohřbí – cemetery.md; zemřel hlady,
 * když los padl do části rizika z nahromaděného hladu `state.starvationDays`), porody
 * (domácnosti podle id, jeden pokus na manželský pár – kinship.md), pak rozpad domácností. Hygiena platí podle
 * pohřebišť na začátku dne. Mutuje stav a vrací události dne.
 */
export function populationDay(
  state: VillageState,
  day: number,
  satiation: number,
  energy: number = satiation,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const random = createRandom(deriveSeed(state.seed, 'day:' + day));
  const crowded = new Map<number, boolean>();
  const typeOf = new Map<number, DwellingType>();
  for (const d of state.dwellings) {
    crowded.set(d.id, isOvercrowded(state, d.id, day));
    typeOf.set(d.id, d.type);
  }

  // úmrtí
  const hygiene = villageHygiene(state);
  const starvationDays = state.starvationDays ?? 0;
  const dead = new Set<number>();
  for (const person of [...state.people].sort((a, b) => a.id - b.id)) {
    const { base, starvation } = deathChances(person, {
      day,
      foundedDay: state.foundedDay,
      // hlad zvyšuje úmrtnost z nedostatku energie, ne z pestrosti stravy (diet.md)
      satiation: energy,
      overcrowded: crowded.get(person.dwellingId) ?? false,
      dwellingType: typeOf.get(person.dwellingId) ?? 'zemnice',
      hygiene,
      starvationDays,
    });
    const roll = random.next();
    if (roll < Math.min(1, base + starvation)) {
      dead.add(person.id);
      const group = ageGroup(person, day);
      // jméno zemřelého muže rodu (lord.md – Kde se jméno ukazuje); ostatní jméno nemají
      const name = person.name === undefined ? {} : { name: person.name };
      const age = ageYears(person.bornDay, day);
      events.push(
        roll < base
          ? { day, kind: 'death', group, age, ...name }
          : { day, kind: 'death', group, age, cause: 'hunger', ...name },
      );
      // mohyla podle významu zemřelého – vojvodova rodina, hlava rodiny, dítě (cemetery.md)
      const full = bury(state, day, person);
      if (full) events.push(full);
    }
  }
  // zemřelí – manželé ovdoví, rodiče žijících zůstanou v rodokmenu (kinship.md)
  removePeople(state, dead);

  // porody – po domácnostech podle id (i zakladatelé na staveništi první zemnice), v domácnosti
  // po manželských párech podle id ženy: žena 16–44 s manželem od 16 let v témže domě
  // (kinship.md – Pohlaví), šance podle věku ženy, po svatbě a po porodu pauza (rozestup porodů);
  // chlapec s pravděpodobností BOY_SHARE. Vedlejší manželka muže rodu nemusí bydlet s mužem
  // (lord.md – Manželky, Návštěvy a porody) – jejího muže hledá mapa lidí, sestavená nejvýš jednou
  // za den; přeplnění podle jejího domu
  const households = [...new Set(state.people.map((p) => p.dwellingId))].sort((a, b) => a - b);
  const pauses = birthPauses(state);
  let everyone: Map<number, Person> | undefined;
  const fatherOf = (mother: Person, members: readonly Person[]): Person | undefined => {
    const here = members.find((m) => m.id === mother.spouseId);
    if (here || mother.spouseId === undefined) return here;
    everyone ??= new Map(state.people.map((p) => [p.id, p]));
    const husband = everyone.get(mother.spouseId);
    // jen vedlejší manželka (muž má hlavní jinou); ostatní páry rodí jen v témže domě
    return husband && husband.spouseId !== mother.id ? husband : undefined;
  };
  for (const household of households) {
    const members = occupants(state, household);
    const couples = members.flatMap((mother) => {
      if (!canBear(mother, day)) return [];
      const father = fatherOf(mother, members);
      return father && canFather(father, day) ? [{ mother, father }] : [];
    });
    for (const { mother, father } of couples) {
      const chance = birthChancePerDay({
        energy,
        overcrowded: crowded.get(household) ?? false,
        motherAge: ageYears(mother.bornDay, day),
      });
      // los vždy – pauza po svatbě nebo porodu nemění losy ostatních párů
      const roll = random.next();
      if (day < (pauses.get(mother.id) ?? day) || roll >= chance) continue;
      mother.nextBirthFrom = day + BIRTH_SPACING.afterBirthDays;
      const child: Person = {
        id: state.nextId++,
        bornDay: day,
        dwellingId: household,
        sex: random.next() < BOY_SHARE ? 'male' : 'female',
        motherId: mother.id,
        fatherId: father.id,
      };
      state.people.push(child);
      events.push({ day, kind: 'birth' });
      // syn muže rodu – příznak rodu, jméno vnukovi (lord.md – Rod vojvody); ves bez rodu nic
      events.push(...markNewborn(state, child, day));
    }
  }

  events.push(...dissolveHouseholds(state, day));
  return events;
}
