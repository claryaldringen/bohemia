import { TOTAL_GAME_DAYS } from '../calendar';
import { canStartNewDwelling } from './dwellings';
import { partFoundingCost } from './fields';
import { ageGroup } from './people';
import {
  DWELLINGS,
  FIELD_LIMITS,
  FOOD_NEED_KG_PER_YEAR,
  START_AGES,
  START_STORES_MONTHS,
} from './rules';
import type { DwellingType, FieldSurface, Person, Position, TileCell, VillageState } from './types';

const DAYS_PER_YEAR = 365.25; // věk se počítá po 365,25 dne
const MONTHS_PER_YEAR = 12;

export type PartInput = {
  areaM2: number;
  distanceM: number;
  naturalFertility: number;
  surface: FieldSurface;
  obstacleCost: number;
  cell?: TileCell; // políčko krajiny dílu (z placement.ts)
};

export type FieldInput = {
  parts: PartInput[];
  /** @deprecated Obrys z prvního prototypu – nová pole se skládají ze čtverců (dílů). */
  outline?: [number, number][];
};

/** Den akce musí být celé číslo uvnitř světa; jinak RangeError. */
function validateDay(day: number): void {
  if (!Number.isInteger(day) || day < 0 || day >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${day} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
}

/** Akce hráče nesmí do minulosti vsi – před den, do kterého je už dopočítaná; jinak RangeError. */
function validateActionDay(state: VillageState, day: number): void {
  validateDay(day);
  if (day < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, akce v den ${day} nejde.`);
  }
}

/** Poloha obydlí musí mít konečné souřadnice i natočení; jinak RangeError. */
function validatePosition(position: Position): void {
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    throw new RangeError('Poloha obydlí musí mít konečné souřadnice a natočení.');
  }
}

/** Cena překážek musí být konečná a nezáporná; jinak RangeError. */
function validateObstacleCost(obstacleCost: number): void {
  if (!Number.isFinite(obstacleCost)) throw new RangeError('Cena překážek musí být konečná.');
  if (obstacleCost < 0) throw new RangeError('Cena překážek nesmí být záporná.');
}

/**
 * Ověří vstup pole (společné pro první pole vsi i `foundField`); jinak RangeError. Nekonečná
 * čísla (NaN, ±∞) by stav otrávila natrvalo – po uložení do JSON z nich je `null`.
 */
function validateField(field: FieldInput): void {
  if (field.parts.length === 0) throw new RangeError('Pole musí mít aspoň jeden díl.');
  for (const part of field.parts) {
    if (!Number.isFinite(part.areaM2) || part.areaM2 <= 0) {
      throw new RangeError('Plocha dílu musí být kladná a konečná.');
    }
    if (!Number.isFinite(part.distanceM)) {
      throw new RangeError('Vzdálenost dílu od vsi musí být konečná.');
    }
    if (!Number.isFinite(part.naturalFertility)) {
      throw new RangeError('Úrodnost dílu musí být konečná.');
    }
    validateObstacleCost(part.obstacleCost);
    if (part.distanceM > FIELD_LIMITS.maxDistanceM) {
      throw new RangeError(`Díl pole je dál než ${FIELD_LIMITS.maxDistanceM} m od vsi.`);
    }
  }
  const total = field.parts.reduce((sum, p) => sum + p.areaM2, 0);
  if (total < FIELD_LIMITS.minAreaM2) {
    throw new RangeError(`Pole musí mít aspoň ${FIELD_LIMITS.minAreaM2} m².`);
  }
}

/** Přidá do (již naklonovaného) stavu pole, jeho díly ve stavu 'founding' a stavbu pole. */
function addField(state: VillageState, day: number, field: FieldInput): void {
  const fieldId = state.nextId++;
  state.fields.push({ id: fieldId });
  let cost = 0;
  for (const input of field.parts) {
    const foundingCost = partFoundingCost(input.surface, input.areaM2, input.obstacleCost);
    cost += foundingCost;
    state.parts.push({
      id: state.nextId++,
      fieldId,
      areaM2: input.areaM2,
      distanceM: input.distanceM,
      naturalFertility: input.naturalFertility,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'founding',
      sownYears: 0,
      fallowSinceDay: null,
      foundingCost,
      foundingDone: 0,
      surface: input.surface,
      ...(input.cell ? { cell: { ...input.cell } } : {}),
    });
  }
  state.constructions.push({
    id: state.nextId++,
    kind: 'field',
    startedDay: day,
    cost,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId,
  });
}

/**
 * Založí ves: zemnice, 4 lidé podle START_AGES, zásoby na START_STORES_MONTHS a první pole
 * jako stavba. Id se čerpají z jednoho čítače `nextId` (od 1) v pořadí obydlí, lidé, pole,
 * jeho díly, stavba pole.
 *
 * Konvence dne: ves vzniká na začátku dne `day` – `lastDay = day − 1`, takže den založení
 * odsimuluje až následující `advanceVillage(state, day)` (založení vsi ho volá hned).
 */
export function foundVillage(input: {
  seed: number;
  day: number;
  dwellingPosition: Position;
  firstField: FieldInput;
}): VillageState {
  const { seed, day, dwellingPosition, firstField } = input;
  validateDay(day);
  validatePosition(dwellingPosition);
  validateField(firstField);
  const dwellingId = 1;
  const people: Person[] = START_AGES.map((age, i) => ({
    id: dwellingId + 1 + i,
    bornDay: day - Math.ceil(age * DAYS_PER_YEAR),
    dwellingId,
  }));
  const annualNeed = people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  const state: VillageState = {
    seed,
    foundedDay: day,
    lastDay: day - 1,
    nextId: dwellingId + 1 + people.length,
    people,
    dwellings: [
      { id: dwellingId, type: 'zemnice', builtDay: day, condition: 1, position: dwellingPosition },
    ],
    fields: [],
    parts: [],
    constructions: [],
    plan: null,
    threshingFromPlan: null,
    storesKg: (annualNeed * START_STORES_MONTHS) / MONTHS_PER_YEAR,
    domesticBacklog: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [{ day, kind: 'village-founded' }],
  };
  addField(state, day, firstField);
  return state;
}

/**
 * Zahájí stavbu nového obydlí; RangeError, když to pravidla nedovolují nebo je vstup neplatný.
 *
 * Konvence dne (jako u `foundField`): akce se volá na ves dopočítanou do dne `day`
 * (`advanceVillage(state, day)`) a patří na konec toho dne – práci stavba dostane od dne
 * `day + 1`. Den před `state.lastDay` (do minulosti vsi) → RangeError.
 */
export function startNewDwelling(
  state: VillageState,
  day: number,
  type: DwellingType,
  position: Position,
  obstacleCost: number,
): VillageState {
  validateActionDay(state, day);
  validatePosition(position);
  validateObstacleCost(obstacleCost);
  if (!canStartNewDwelling(state, day)) {
    throw new RangeError('Nové obydlí teď nelze zahájit.');
  }
  const next = structuredClone(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'dwelling',
    startedDay: day,
    cost: DWELLINGS[type].cost + obstacleCost,
    done: 0,
    dwellingType: type,
    position,
    dwellingId: null,
    fieldId: null,
  });
  return next;
}

/**
 * Zahájí založení nového pole (díly ve stavu 'founding'); RangeError při neplatném vstupu.
 *
 * Konvence dne (jako u `startNewDwelling`): akce se volá na ves dopočítanou do dne `day`
 * a patří na konec toho dne – práci pole dostane od dne `day + 1`. Den před `state.lastDay`
 * (do minulosti vsi) → RangeError.
 */
export function foundField(state: VillageState, day: number, field: FieldInput): VillageState {
  validateActionDay(state, day);
  validateField(field);
  const next = structuredClone(state);
  addField(next, day, field);
  return next;
}
