import { TOTAL_GAME_DAYS } from '../calendar';
import { cemeteryFoundingCost, villageCemeteries } from './cemetery';
import { buildAffordability, payUpfront, type BuildKind } from './costs';
import { partFoundingCost } from './fields';
import { ageGroup } from './people';
import {
  DWELLINGS,
  FIELD_LIMITS,
  FOOD_NEED_KG_PER_YEAR,
  START_AGES,
  START_STORES_MONTHS,
} from './rules';
import type {
  CemeterySquare,
  DwellingType,
  FieldSurface,
  Person,
  Position,
  TileCell,
  VillageState,
} from './types';

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

/** Čtverec zakládaného pohřebiště (z `cemeteryPartsFromCells`) a cena překážek na něm. */
export type CemeterySquareInput = CemeterySquare & { obstacleCost: number };

export type CemeteryInput = {
  squares: CemeterySquareInput[];
  /** Strana čtverce – políčka krajiny (m). */
  squareSizeM: number;
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
 * Ověří vstup pole (společné pro první pole vsi i `foundField`); jinak RangeError. Čísla, která
 * nejsou konečná (NaN, ±∞), by stav otrávila natrvalo – po uložení do JSON z nich je `null`.
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
 * Založí ves: zemnice, 4 lidé podle START_AGES a zásoby na START_STORES_MONTHS. První pole je
 * volitelné (hráč staví, kdy chce – population.md, Založení vsi); když je, vznikne jako stavba.
 * Id se čerpají z jednoho čítače `nextId` (od 1) v pořadí obydlí, lidé, pole, jeho díly,
 * stavba pole.
 *
 * Konvence dne: ves vzniká na začátku dne `day` – `lastDay = day − 1`, takže den založení
 * odsimuluje až následující `advanceVillage(state, day)` (založení vsi ho volá hned).
 */
export function foundVillage(input: {
  seed: number;
  day: number;
  dwellingPosition: Position;
  firstField?: FieldInput | null;
}): VillageState {
  const { seed, day, dwellingPosition, firstField } = input;
  validateDay(day);
  validatePosition(dwellingPosition);
  if (firstField) validateField(firstField);
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
  if (firstField) addField(state, day, firstField);
  return state;
}

/** Suroviny předem musí ves mít; jinak RangeError (pravidla ověří use-case dřív, česky). */
function requireAffordable(state: VillageState, kind: BuildKind): void {
  if (!buildAffordability(state, kind).affordable) {
    throw new RangeError('Na stavbu ves nemá suroviny.');
  }
}

/**
 * Zahájí stavbu nového obydlí – kdykoli (hráč staví, kdy chce; population.md – Nové obydlí);
 * RangeError, když ves nemá suroviny předem nebo je vstup neplatný.
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
  requireAffordable(state, type);
  const next = structuredClone(state);
  payUpfront(next, type);
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
 * Zahájí založení nového pole (díly ve stavu 'founding'); RangeError při neplatném vstupu
 * nebo když ves nemá suroviny předem.
 *
 * Konvence dne (jako u `startNewDwelling`): akce se volá na ves dopočítanou do dne `day`
 * a patří na konec toho dne – práci pole dostane od dne `day + 1`. Den před `state.lastDay`
 * (do minulosti vsi) → RangeError.
 */
export function foundField(state: VillageState, day: number, field: FieldInput): VillageState {
  validateActionDay(state, day);
  validateField(field);
  requireAffordable(state, 'field');
  const next = structuredClone(state);
  payUpfront(next, 'field');
  addField(next, day, field);
  return next;
}

/** Ověří vstup pohřebiště; jinak RangeError (čísla, která nejsou konečná, by stav otrávila). */
function validateCemetery(input: CemeteryInput): void {
  if (input.squares.length === 0) throw new RangeError('Pohřebiště musí mít aspoň jeden čtverec.');
  if (!Number.isFinite(input.squareSizeM) || input.squareSizeM <= 0) {
    throw new RangeError('Strana čtverce pohřebiště musí být kladná a konečná.');
  }
  for (const square of input.squares) {
    if (!Number.isInteger(square.cell.x) || !Number.isInteger(square.cell.y)) {
      throw new RangeError('Políčko čtverce pohřebiště musí mít celočíselné souřadnice.');
    }
    if (!Number.isFinite(square.x) || !Number.isFinite(square.z)) {
      throw new RangeError('Střed čtverce pohřebiště musí mít konečné souřadnice.');
    }
    if (!Number.isFinite(square.waterDistanceM) || square.waterDistanceM < 0) {
      throw new RangeError('Vzdálenost čtverce pohřebiště od vody musí být nezáporná a konečná.');
    }
    validateObstacleCost(square.obstacleCost);
  }
}

/**
 * Zahájí založení pohřebiště (cemetery.md – Stavba): pohřebiště bez hrobů a stavba ze
 * společné práce vsi za 10 člověkodní na čtverec + překážky. Mrtvé přijímá až po dokončení.
 * RangeError při neplatném vstupu nebo když ves nemá suroviny předem.
 *
 * Konvence dne (jako u `foundField`): akce se volá na ves dopočítanou do dne `day` a patří na
 * konec toho dne – práci stavba dostane od dne `day + 1`. Den před `state.lastDay` → RangeError.
 */
export function foundCemetery(
  state: VillageState,
  day: number,
  input: CemeteryInput,
): VillageState {
  validateActionDay(state, day);
  validateCemetery(input);
  requireAffordable(state, 'cemetery');
  const next = structuredClone(state);
  payUpfront(next, 'cemetery');
  const cemeteryId = next.nextId++;
  next.cemeteries = [
    ...villageCemeteries(next),
    {
      id: cemeteryId,
      squares: input.squares.map(({ cell, x, z, waterDistanceM }) => ({
        cell: { x: cell.x, y: cell.y },
        x,
        z,
        waterDistanceM,
      })),
      squareSizeM: input.squareSizeM,
      graves: 0,
      builtDay: null,
    },
  ];
  next.constructions.push({
    id: next.nextId++,
    kind: 'cemetery',
    startedDay: day,
    cost: cemeteryFoundingCost(input.squares),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    cemeteryId,
  });
  return next;
}
