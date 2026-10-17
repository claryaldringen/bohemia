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

export type FieldInput = { outline: [number, number][]; parts: PartInput[] };

/** Ověří vstup pole (společné pro první pole vsi i `foundField`); jinak RangeError. */
function validateField(field: FieldInput): void {
  if (field.parts.length === 0) throw new RangeError('Pole musí mít aspoň jeden díl.');
  for (const part of field.parts) {
    if (!(part.areaM2 > 0)) throw new RangeError('Plocha dílu musí být kladná.');
    if (part.obstacleCost < 0) throw new RangeError('Cena překážek nesmí být záporná.');
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
  state.fields.push({ id: fieldId, outline: field.outline });
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
 */
export function foundVillage(input: {
  seed: number;
  day: number;
  dwellingPosition: Position;
  firstField: FieldInput;
}): VillageState {
  const { seed, day, dwellingPosition, firstField } = input;
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

/** Zahájí stavbu nového obydlí; RangeError, když to pravidla nedovolují nebo je cena překážek záporná. */
export function startNewDwelling(
  state: VillageState,
  day: number,
  type: DwellingType,
  position: Position,
  obstacleCost: number,
): VillageState {
  if (obstacleCost < 0) throw new RangeError('Cena překážek nesmí být záporná.');
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

/** Zahájí založení nového pole (díly ve stavu 'founding'); RangeError při neplatném vstupu. */
export function foundField(state: VillageState, day: number, field: FieldInput): VillageState {
  validateField(field);
  const next = structuredClone(state);
  addField(next, day, field);
  return next;
}
