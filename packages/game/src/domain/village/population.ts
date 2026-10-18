import { createRandom, deriveSeed } from '../landscape/random';
import { bury, hygieneDeathFactor, villageHygiene } from './cemetery';
import { isOvercrowded } from './dwellings';
import { ageGroup, isFertileAdult, occupants } from './people';
import {
  ADULT_DEATHS_PER_YEAR,
  BIRTHS_PER_PAIR_PER_YEAR,
  CROWDED_BIRTH_FACTOR,
  CROWDED_DEATH_FACTOR,
  DWELLINGS,
  ELDER_DEATHS_PER_YEAR,
  HUNGER,
  LUCKY_CHILD_DEATH_FACTOR,
  LUCKY_YEARS,
  STARVATION,
  childDeathsPerYear,
} from './rules';
import type { ChronicleEvent, DwellingType, Person, VillageState } from './types';

const DAYS_PER_YEAR = 365.25; // hájení se měří v letech po 365,25 dne
const DAYS_PER_RISK_YEAR = 365; // roční riziko se na den převádí přes 365 dní

type AgeGroup = 'child' | 'adult' | 'elder';
const AGE_GROUPS: readonly AgeGroup[] = ['child', 'adult', 'elder'];

/** Vliv hladu na porody: 0 při nasycení ≤ 0,5, lineárně 1 při nasycení ≥ 0,95. */
function hungerBirthFactor(satiation: number): number {
  const span = HUNGER.birthsFullAt - HUNGER.birthsStopAt;
  return Math.min(1, Math.max(0, (satiation - HUNGER.birthsStopAt) / span));
}

/** Pravděpodobnost porodu páru za den. */
export function birthChancePerDay(ctx: { satiation: number; overcrowded: boolean }): number {
  return (
    (BIRTHS_PER_PAIR_PER_YEAR / DAYS_PER_RISK_YEAR) *
    hungerBirthFactor(ctx.satiation) *
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
 * Nahromaděný hlad po dni s nasycením `satiation` (population.md – Hlad a vymření): přibude
 * max(0, 0,9 − nasycení) / 0,9 (bez jídla celý den, od 90 % nic), při nasycení ≥ 0,95 ubude den
 * (do nuly). Víc než STARVATION.maxDays nemá vliv, v hájení (`lucky`) nejvýš LUCKY_STARVATION_CAP.
 */
export function nextStarvationDays(
  starvationDays: number,
  satiation: number,
  lucky = false,
): number {
  const cap = lucky ? LUCKY_STARVATION_CAP : STARVATION.maxDays;
  if (satiation >= STARVATION.recoverAt) {
    return Math.min(cap, Math.max(0, starvationDays - STARVATION.recoveryPerDay));
  }
  const growth = Math.max(0, STARVATION.growthBelow - satiation) / STARVATION.growthBelow;
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
 * Dojde k rozpadu domácnosti? Nikdo 14–44 let (jen děti nebo starší), nebo jediný člověk
 * a nikdo jiný.
 */
export function householdBreaksUp(members: Person[], day: number): boolean {
  if (members.length === 0) return false;
  const adults = members.filter((p) => isFertileAdult(p, day)).length;
  return adults === 0 || members.length === 1;
}

/** Rozpadlé domácnosti se přestěhují do obydlí s nejvíc volnými místy (při shodě nižší id). */
function dissolveHouseholds(state: VillageState, day: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const ids = state.dwellings.map((d) => d.id).sort((a, b) => a - b);
  for (const fromId of ids) {
    if (!householdBreaksUp(occupants(state, fromId), day)) continue;
    let target: { id: number; free: number } | null = null;
    for (const d of state.dwellings) {
      if (d.id === fromId) continue;
      const count = occupants(state, d.id).length;
      if (count === 0) continue;
      const free = DWELLINGS[d.type].capacity - count;
      if (target === null || free > target.free || (free === target.free && d.id < target.id)) {
        target = { id: d.id, free };
      }
    }
    if (target === null) continue;
    for (const p of state.people) {
      if (p.dwellingId === fromId) p.dwellingId = target.id;
    }
    events.push({ day, kind: 'household-merged', fromDwellingId: fromId, toDwellingId: target.id });
  }
  return events;
}

/**
 * Jeden den populace: úmrtí (lidé podle id, každý zemřelý se pohřbí – cemetery.md; zemřel hlady,
 * když los padl do části rizika z nahromaděného hladu `state.starvationDays`), porody
 * (domácnosti podle id, jeden pokus na pár), pak rozpad domácností. Hygiena platí podle
 * pohřebišť na začátku dne. Mutuje stav a vrací události dne.
 */
export function populationDay(
  state: VillageState,
  day: number,
  satiation: number,
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
      satiation,
      overcrowded: crowded.get(person.dwellingId) ?? false,
      dwellingType: typeOf.get(person.dwellingId) ?? 'zemnice',
      hygiene,
      starvationDays,
    });
    const roll = random.next();
    if (roll < Math.min(1, base + starvation)) {
      dead.add(person.id);
      const group = ageGroup(person, day);
      events.push(
        roll < base
          ? { day, kind: 'death', group }
          : { day, kind: 'death', group, cause: 'hunger' },
      );
      const full = bury(state, day);
      if (full) events.push(full);
    }
  }
  state.people = state.people.filter((p) => !dead.has(p.id));

  // porody – po domácnostech podle id (i zakladatelé na staveništi první zemnice; prázdné
  // obydlí by stejně nemělo pár)
  const households = [...new Set(state.people.map((p) => p.dwellingId))].sort((a, b) => a - b);
  for (const household of households) {
    const pairs = Math.floor(
      occupants(state, household).filter((p) => isFertileAdult(p, day)).length / 2,
    );
    const chance = birthChancePerDay({
      satiation,
      overcrowded: crowded.get(household) ?? false,
    });
    for (let i = 0; i < pairs; i++) {
      if (random.next() < chance) {
        state.people.push({ id: state.nextId++, bornDay: day, dwellingId: household });
        events.push({ day, kind: 'birth' });
      }
    }
  }

  events.push(...dissolveHouseholds(state, day));
  return events;
}
