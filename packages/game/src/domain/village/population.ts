import { createRandom, deriveSeed } from '../landscape/random';
import { isOvercrowded } from './dwellings';
import { ageGroup, ageYears, isFertileAdult, occupants } from './people';
import {
  ADULT_DEATHS_PER_YEAR,
  AGE,
  BIRTHS_PER_PAIR_PER_YEAR,
  CROWDED_BIRTH_FACTOR,
  CROWDED_DEATH_FACTOR,
  DWELLINGS,
  ELDER_DEATHS_PER_YEAR,
  HUNGER,
  LUCKY_CHILD_DEATH_FACTOR,
  LUCKY_YEARS,
  childDeathsPerYear,
} from './rules';
import type { ChronicleEvent, DwellingType, Person, VillageState } from './types';

const DAYS_PER_YEAR = 365.25; // hájení se měří v letech po 365,25 dne
const DAYS_PER_RISK_YEAR = 365; // roční riziko se na den převádí přes 365 dní
const HUNGER_GUARD_ADULTS = 2; // poslední dva lidé 14+ nedostanou přirážku za hlad

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

function baseDeathsPerYear(group: 'child' | 'adult' | 'elder', dwellingType: DwellingType): number {
  if (group === 'child') return childDeathsPerYear() * DWELLINGS[dwellingType].childDeathFactor;
  return group === 'adult' ? ADULT_DEATHS_PER_YEAR : ELDER_DEATHS_PER_YEAR;
}

/** Pravděpodobnost úmrtí člověka za den (hájení, přeplněnost a hlad zahrnuty). */
export function deathChancePerDay(
  person: Person,
  ctx: {
    day: number;
    foundedDay: number;
    satiation: number;
    overcrowded: boolean;
    dwellingType: DwellingType;
    protectFromHunger: boolean;
  },
): number {
  const group = ageGroup(person, ctx.day);
  const lucky = ctx.day - ctx.foundedDay < LUCKY_YEARS * DAYS_PER_YEAR;
  if (lucky && group !== 'child') return 0;
  const hunger = ctx.protectFromHunger ? 1 : 1 + HUNGER.deathExtraAtZero * (1 - ctx.satiation);
  const yearly =
    baseDeathsPerYear(group, ctx.dwellingType) *
    (lucky ? LUCKY_CHILD_DEATH_FACTOR : 1) *
    (ctx.overcrowded ? CROWDED_DEATH_FACTOR : 1) *
    hunger;
  return 1 - (1 - Math.min(1, yearly)) ** (1 / DAYS_PER_RISK_YEAR);
}

/** Dojde k rozpadu domácnosti? Jen děti, nebo jediný člověk 14+ a nikdo jiný. */
function isDissolving(members: Person[], day: number): boolean {
  if (members.length === 0) return false;
  const adults = members.filter((p) => ageYears(p.bornDay, day) >= AGE.adult).length;
  return adults === 0 || members.length === 1;
}

/** Rozpadlé domácnosti se přestěhují do obydlí s nejvíc volnými místy (při shodě nižší id). */
function dissolveHouseholds(state: VillageState, day: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const ids = state.dwellings.map((d) => d.id).sort((a, b) => a - b);
  for (const fromId of ids) {
    if (!isDissolving(occupants(state, fromId), day)) continue;
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
 * Jeden den populace: úmrtí (lidé podle id), porody (obydlí podle id, jeden pokus na pár),
 * pak rozpad domácností. Mutuje stav a vrací události dne.
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
  let livingAdults = state.people.filter((p) => ageYears(p.bornDay, day) >= AGE.adult).length;
  const dead = new Set<number>();
  for (const person of [...state.people].sort((a, b) => a.id - b.id)) {
    const isAdult = ageYears(person.bornDay, day) >= AGE.adult;
    const chance = deathChancePerDay(person, {
      day,
      foundedDay: state.foundedDay,
      satiation,
      overcrowded: crowded.get(person.dwellingId) ?? false,
      dwellingType: typeOf.get(person.dwellingId) ?? 'zemnice',
      protectFromHunger: isAdult && livingAdults <= HUNGER_GUARD_ADULTS,
    });
    if (random.next() < chance) {
      dead.add(person.id);
      if (isAdult) livingAdults--;
      events.push({ day, kind: 'death', group: ageGroup(person, day) });
    }
  }
  state.people = state.people.filter((p) => !dead.has(p.id));

  // porody
  for (const d of [...state.dwellings].sort((a, b) => a.id - b.id)) {
    const pairs = Math.floor(
      occupants(state, d.id).filter((p) => isFertileAdult(p, day)).length / 2,
    );
    const chance = birthChancePerDay({ satiation, overcrowded: crowded.get(d.id) ?? false });
    for (let i = 0; i < pairs; i++) {
      if (random.next() < chance) {
        state.people.push({ id: state.nextId++, bornDay: day, dwellingId: d.id });
        events.push({ day, kind: 'birth' });
      }
    }
  }

  events.push(...dissolveHouseholds(state, day));
  return events;
}
