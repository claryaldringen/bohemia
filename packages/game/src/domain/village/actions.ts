import { TOTAL_GAME_DAYS } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import { cemeteryFoundingCost, touchingCemeteries, villageCemeteries } from './cemetery';
import { buildAffordability, dwellingLaborManDays, payUpfront, type BuildKind } from './costs';
import { isVillageExtinct } from './extinction';
import { partFoundingCost } from './fields';
import { recordClearedObstacles } from './obstacles';
import { orchardPlantingCost, villageOrchards } from './orchard';
import { ageGroup } from './people';
import {
  FIELD_LIMITS,
  FOOD_NEED_KG_PER_YEAR,
  PLOT_VARIANTS,
  START_AGES,
  START_STORES_MONTHS,
  dwellingBuildLabor,
} from './rules';
import type {
  CemeterySquare,
  DwellingPlot,
  DwellingType,
  FieldSurface,
  OrchardSquare,
  Person,
  Position,
  TileCell,
  VillageState,
} from './types';
import { planDwellingWood, takeWood, type WoodPlan } from './wood';

const DAYS_PER_YEAR = 365.25; // věk se počítá po 365,25 dne
const MONTHS_PER_YEAR = 12;

export type PartInput = {
  areaM2: number;
  distanceM: number;
  naturalFertility: number;
  surface: FieldSurface;
  obstacleCost: number;
  cell?: TileCell; // políčko krajiny dílu (z placement.ts)
  /** Překážky na čtverci (id z vrstvy překážek) – zmizí, až osadníci díl založí. */
  obstacleIds?: number[];
  /** Dospělé stromy mezi překážkami – po založení dílu dají klády na hromadu (forest.md). */
  trees?: number;
};

export type FieldInput = {
  parts: PartInput[];
  /** @deprecated Obrys z prvního prototypu – nová pole se skládají ze čtverců (dílů). */
  outline?: [number, number][];
};

/**
 * Čtverec zakládaného pohřebiště (z `cemeteryPartsFromCells`), cena překážek na něm a překážky
 * (id z vrstvy překážek), které zmizí, až osadníci hřbitov nebo rozšíření dostaví.
 */
export type CemeterySquareInput = Omit<CemeterySquare, 'obstacles' | 'trees'> & {
  obstacleCost: number;
  obstacleIds?: number[];
  /** Dospělé stromy mezi překážkami – po ohrazení čtverce dají klády na hromadu (forest.md). */
  trees?: number;
};

export type CemeteryInput = {
  squares: CemeterySquareInput[];
  /** Strana čtverce – políčka krajiny (m). */
  squareSizeM: number;
};

/**
 * Čtverec vysazovaného sadu (z `orchardPartsFromCells`): políčko, plocha bez skalních výchozů,
 * vzdálenost od nejbližšího obydlí, cena překážek a překážky (id z vrstvy překážek), které
 * zmizí, až osadníci čtverec vysadí.
 */
export type OrchardSquareInput = Pick<OrchardSquare, 'cell' | 'areaM2' | 'distanceM'> & {
  obstacleCost: number;
  obstacleIds?: number[];
  /** Dospělé stromy na čtverci, které nevyhradila jiná stavba – klády z mýcení. */
  trees?: number;
};

export type OrchardInput = { squares: OrchardSquareInput[] };

/** Den akce musí být celé číslo uvnitř světa; jinak RangeError. */
function validateDay(day: number): void {
  if (!Number.isInteger(day) || day < 0 || day >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${day} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
}

/**
 * Akce hráče nesmí do minulosti vsi – před den, do kterého je už dopočítaná – ani do vymřelé vsi;
 * jinak RangeError.
 */
function validateActionDay(state: VillageState, day: number): void {
  if (isVillageExtinct(state)) throw new RangeError('Ves vymřela – nikdo v ní nežije.');
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

/** Pozemek: celočíselné políčko a známá varianta; jinak RangeError. */
function validatePlot(plot: DwellingPlot): void {
  if (!Number.isInteger(plot.cell.x) || !Number.isInteger(plot.cell.y)) {
    throw new RangeError('Políčko pozemku musí mít celočíselné souřadnice.');
  }
  if (!PLOT_VARIANTS.includes(plot.variant)) throw new RangeError('Neznámá varianta pozemku.');
}

/** Cena překážek musí být konečná a nezáporná; jinak RangeError. */
function validateObstacleCost(obstacleCost: number): void {
  if (!Number.isFinite(obstacleCost)) throw new RangeError('Cena překážek musí být konečná.');
  if (obstacleCost < 0) throw new RangeError('Cena překážek nesmí být záporná.');
}

/** Počet stromů (klády z mýcení) je nezáporné celé číslo; jinak RangeError. */
function validateTrees(trees: number): void {
  if (!Number.isInteger(trees) || trees < 0) {
    throw new RangeError('Počet stromů musí být nezáporné celé číslo.');
  }
}

/** Vzdálenost k okraji lesa je nezáporná a konečná; jinak RangeError. */
function validateForestDistance(distanceM: number): void {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new RangeError('Vzdálenost k lesu musí být nezáporná a konečná.');
  }
}

/** Id překážek jsou nezáporná celá čísla bez opakování; jinak RangeError. */
function validateObstacleIds(ids: readonly number[]): void {
  if (!ids.every((id) => Number.isInteger(id) && id >= 0)) {
    throw new RangeError('Id překážek musí být nezáporná celá čísla.');
  }
  if (new Set(ids).size !== ids.length) throw new RangeError('Překážka se nesmí opakovat.');
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
    validateObstacleIds(part.obstacleIds ?? []);
    validateTrees(part.trees ?? 0);
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
      ...(input.obstacleIds?.length ? { obstacles: [...input.obstacleIds] } : {}),
      ...(input.trees ? { trees: input.trees } : {}),
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
 * Založí ves: 4 lidé podle START_AGES, zásoby na START_STORES_MONTHS a stavba první zemnice
 * (population.md – Založení vsi). Zemnici si zakladatelé postaví vlastní prací jako každou
 * stavbu – do dostavění bydlí na staveništi a pak se do ní nastěhují (jejich domácnost má id
 * budoucí zemnice, stavba ho nese v `dwellingId`). První pole je volitelné (hráč staví, kdy
 * chce); když je, vznikne jako stavba. Id se čerpají z jednoho čítače `nextId` (od 1) v pořadí
 * domácnost zakladatelů (= id zemnice), lidé, stavba zemnice, pole, jeho díly, stavba pole.
 *
 * Konvence dne: ves vzniká na začátku dne `day` – `lastDay = day − 1`, takže den založení
 * odsimuluje až následující `advanceVillage(state, day)` (založení vsi ho volá hned).
 *
 * Dřevo první zemnice (forest.md): stromy z vyklízené plochy jdou na hromadu klád, zbytek se
 * skácí z nejbližších dospělých stromů (`obstacles`) jako část stavby. Založení vsi dřevo
 * neblokuje – když stromy nestačí, zemnice vezme, co je.
 */
export function foundVillage(input: {
  seed: number;
  day: number;
  dwellingPosition: Position;
  firstField?: FieldInput | null;
  /**
   * Překážky na vyklízené ploše první zemnice – osadníci je odstraní při zahájení stavby (při
   * založení vsi) a zaplatí prací navíc (`dwellingObstacleCost`) jako u každého obydlí.
   */
  dwellingObstacleIds?: readonly number[];
  dwellingObstacleCost?: number;
  /** Dospělé stromy mezi `dwellingObstacleIds` – osadníci je skácí na hromadu klád. */
  dwellingClearedTrees?: number;
  /**
   * Vrstva překážek krajiny – stromy ke kácení. Bez ní (jen testy) se kácí bez polohy za cenu
   * blízkého lesa.
   */
  obstacles?: ObstacleLayer;
  /** Vzdálenost první zemnice k nejbližšímu okraji lesa (m) – palivo (forest.md). */
  forestDistanceM?: number;
}): VillageState {
  const { seed, day, dwellingPosition, firstField } = input;
  const dwellingObstacleIds = input.dwellingObstacleIds ?? [];
  const dwellingObstacleCost = input.dwellingObstacleCost ?? 0;
  const clearedTrees = input.dwellingClearedTrees ?? 0;
  validateDay(day);
  validatePosition(dwellingPosition);
  validateObstacleCost(dwellingObstacleCost);
  validateObstacleIds(dwellingObstacleIds);
  validateTrees(clearedTrees);
  if (input.forestDistanceM !== undefined) validateForestDistance(input.forestDistanceM);
  if (firstField) validateField(firstField);
  const householdId = 1;
  const people: Person[] = START_AGES.map((age, i) => ({
    id: householdId + 1 + i,
    bornDay: day - Math.ceil(age * DAYS_PER_YEAR),
    dwellingId: householdId,
  }));
  const constructionId = householdId + 1 + people.length;
  const annualNeed = people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  const state: VillageState = {
    seed,
    foundedDay: day,
    lastDay: day - 1,
    nextId: constructionId + 1,
    people,
    dwellings: [],
    fields: [],
    parts: [],
    constructions: [
      {
        id: constructionId,
        kind: 'dwelling',
        startedDay: day,
        cost: dwellingBuildLabor('zemnice') + dwellingObstacleCost,
        done: 0,
        dwellingType: 'zemnice',
        position: { ...dwellingPosition },
        dwellingId: householdId,
        fieldId: null,
        ...(input.forestDistanceM === undefined ? {} : { forestDistanceM: input.forestDistanceM }),
      },
    ],
    plan: null,
    threshingFromPlan: null,
    storesKg: (annualNeed * START_STORES_MONTHS) / MONTHS_PER_YEAR,
    domesticBacklog: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [{ day, kind: 'village-founded' }],
    clearedObstacles: dwellingObstacleIds.map((id) => ({ id, day })),
    felledTrees: [],
    woodLogs: 0,
  };
  // pole napřed – stromy na jeho dílech patří poli (klády po založení), zemnice je nekácí
  if (firstField) addField(state, day, firstField);
  const plan = planDwellingWood(state, 'zemnice', dwellingPosition, day, {
    ...(input.obstacles ? { obstacles: input.obstacles } : {}),
    clearedTrees,
    clearedIds: dwellingObstacleIds,
  });
  const zemnice = state.constructions[0]!;
  zemnice.wood = takeWood(state, plan);
  zemnice.cost = dwellingLaborManDays('zemnice', dwellingObstacleCost, plan);
  return state;
}

/**
 * Co stavba potřebuje předem (suroviny, dřevo, lidi k osídlení), ves mít musí; jinak RangeError
 * (pravidla ověří use-case dřív, česky).
 */
function requireAffordable(state: VillageState, kind: BuildKind, obstacles?: ObstacleLayer): void {
  if (!buildAffordability(state, kind, obstacles).affordable) {
    throw new RangeError('Na stavbu ves nemá suroviny, dřevo nebo lidi k osídlení.');
  }
}

/** Staveniště nového obydlí – dřevo a palivo (forest.md). */
export interface DwellingSiteOptions {
  /**
   * Vrstva překážek krajiny – stromy ke kácení (nejbližší dospělé stromy ke staveništi). Bez ní
   * (jen testy) se dřevo, které nestačí z hromady, kácí bez polohy za cenu blízkého lesa.
   */
  obstacles?: ObstacleLayer;
  /** Dospělé stromy mezi `obstacleIds` – osadníci je skácí na hromadu klád. */
  clearedTrees?: number;
  /** Vzdálenost obydlí k nejbližšímu okraji lesa (m) – palivo. */
  forestDistanceM?: number;
  /** Pozemek obydlí (`checkPlotPlacement`) – `position` je pak poloha domu na něm. */
  plot?: DwellingPlot;
}

/**
 * Zahájí stavbu nového obydlí – kdykoli, když je kým ho osadit (population.md – Nové obydlí,
 * Odemčení); RangeError, když ves nemá suroviny předem, dřevo, lidi k osídlení nebo je vstup
 * neplatný. Překážky na vyklízené ploše (`obstacleIds`, cena v `obstacleCost`) osadníci odstraní
 * hned při zahájení stavby, dospělé stromy z ní (`clearedTrees`) dají klády na hromadu.
 *
 * Dřevo (forest.md – Stavby a kácení): stavba vezme celé klády z hromady a zbytek stromů vyhradí
 * mezi nejbližšími dospělými stromy ke staveništi – skácí je jako první část své práce (2 čd za
 * strom, dál než 100 m od staveniště dráž). Práce na samotném obydlí je cena obydlí bez kácení
 * blízkého lesa (`dwellingBuildLabor`).
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
  obstacleIds: readonly number[] = [],
  site: DwellingSiteOptions = {},
): VillageState {
  validateActionDay(state, day);
  validatePosition(position);
  validateObstacleCost(obstacleCost);
  validateObstacleIds(obstacleIds);
  validateTrees(site.clearedTrees ?? 0);
  if (site.forestDistanceM !== undefined) validateForestDistance(site.forestDistanceM);
  if (site.plot) validatePlot(site.plot);
  requireAffordable(state, type, site.obstacles);
  const plan: WoodPlan = planDwellingWood(state, type, position, day, {
    ...(site.obstacles ? { obstacles: site.obstacles } : {}),
    clearedTrees: site.clearedTrees ?? 0,
    clearedIds: obstacleIds,
  });
  if (plan.missing > 0) throw new RangeError('Na stavbu ves nemá dřevo – není z čeho kácet.');
  const next = structuredClone(state);
  payUpfront(next, type);
  recordClearedObstacles(next, obstacleIds, day);
  const wood = takeWood(next, plan);
  next.constructions.push({
    id: next.nextId++,
    kind: 'dwelling',
    startedDay: day,
    cost: dwellingLaborManDays(type, obstacleCost, plan),
    done: 0,
    dwellingType: type,
    position,
    ...(site.plot ? { plot: { cell: { ...site.plot.cell }, variant: site.plot.variant } } : {}),
    dwellingId: null,
    fieldId: null,
    wood,
    ...(site.forestDistanceM === undefined ? {} : { forestDistanceM: site.forestDistanceM }),
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

/** Ověří vstup hřbitova; jinak RangeError (čísla, která nejsou konečná, by stav otrávila). */
function validateCemetery(input: CemeteryInput): void {
  if (input.squares.length === 0) throw new RangeError('Hřbitov musí mít aspoň jeden čtverec.');
  if (!Number.isFinite(input.squareSizeM) || input.squareSizeM <= 0) {
    throw new RangeError('Strana čtverce hřbitova musí být kladná a konečná.');
  }
  const cells = new Set<string>();
  for (const square of input.squares) {
    if (!Number.isInteger(square.cell.x) || !Number.isInteger(square.cell.y)) {
      throw new RangeError('Políčko čtverce hřbitova musí mít celočíselné souřadnice.');
    }
    if (!Number.isFinite(square.x) || !Number.isFinite(square.z)) {
      throw new RangeError('Střed čtverce hřbitova musí mít konečné souřadnice.');
    }
    if (!Number.isFinite(square.waterDistanceM) || square.waterDistanceM < 0) {
      throw new RangeError('Vzdálenost čtverce hřbitova od vody musí být nezáporná a konečná.');
    }
    validateObstacleCost(square.obstacleCost);
    validateTrees(square.trees ?? 0);
    cells.add(`${square.cell.x},${square.cell.y}`);
  }
  if (cells.size !== input.squares.length) throw new RangeError('Čtverce hřbitova se opakují.');
  validateObstacleIds(input.squares.flatMap((s) => s.obstacleIds ?? []));
}

/**
 * Zahájí založení hřbitova, nebo jeho rozšíření (cemetery.md – Stavba): čtverce, které stranou
 * navazují na hotový nebo rozestavěný hřbitov, ho rozšíří (stejné id, čtverce na konec, do
 * dokončení stavby se nepočítají); jinak vznikne nový hřbitov bez hrobů. Stavba ze společné
 * práce vsi za 10 člověkodní na čtverec + překážky. RangeError při neplatném vstupu, při
 * navázání na víc hřbitovů, překryvu s hřbitovem nebo když ves nemá suroviny předem.
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
  const existing = villageCemeteries(state);
  const taken = new Set(existing.flatMap((c) => c.squares.map((s) => `${s.cell.x},${s.cell.y}`)));
  if (input.squares.some((s) => taken.has(`${s.cell.x},${s.cell.y}`))) {
    throw new RangeError('Čtverec už patří hřbitovu.');
  }
  const touching = touchingCemeteries(
    existing,
    input.squares.map((s) => s.cell),
  );
  if (touching.length > 1) throw new RangeError('Hřbitov smí navazovat jen na jeden hřbitov.');
  const extended = touching[0];
  if (extended && extended.squareSizeM !== input.squareSizeM) {
    throw new RangeError('Rozšíření musí mít stejně velké čtverce jako hřbitov.');
  }
  requireAffordable(state, 'cemetery');
  const next = structuredClone(state);
  payUpfront(next, 'cemetery');
  const cemeteries = villageCemeteries(next);
  const square = (
    { cell, x, z, waterDistanceM, obstacleIds, trees }: CemeterySquareInput,
    constructionId?: number,
  ): CemeterySquare => ({
    cell: { x: cell.x, y: cell.y },
    x,
    z,
    waterDistanceM,
    ...(constructionId === undefined ? {} : { constructionId }),
    ...(obstacleIds?.length ? { obstacles: [...obstacleIds] } : {}),
    ...(trees ? { trees } : {}),
  });
  let cemeteryId: number;
  let constructionId: number;
  const target = extended ? cemeteries.find((c) => c.id === extended.id) : undefined;
  if (target) {
    cemeteryId = target.id;
    constructionId = next.nextId++;
    target.squares.push(...input.squares.map((s) => square(s, constructionId)));
  } else {
    cemeteryId = next.nextId++;
    constructionId = next.nextId++;
    cemeteries.push({
      id: cemeteryId,
      squares: input.squares.map((s) => square(s)),
      squareSizeM: input.squareSizeM,
      graves: 0,
      builtDay: null,
    });
  }
  next.cemeteries = cemeteries;
  next.constructions.push({
    id: constructionId,
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

/** Ověří vstup sadu; jinak RangeError (čísla, která nejsou konečná, by stav otrávila). */
function validateOrchard(input: OrchardInput): void {
  if (input.squares.length === 0) throw new RangeError('Sad musí mít aspoň jeden čtverec.');
  const cells = new Set<string>();
  for (const square of input.squares) {
    if (!Number.isInteger(square.cell.x) || !Number.isInteger(square.cell.y)) {
      throw new RangeError('Políčko čtverce sadu musí mít celočíselné souřadnice.');
    }
    if (!Number.isFinite(square.areaM2) || square.areaM2 <= 0) {
      throw new RangeError('Plocha čtverce sadu musí být kladná a konečná.');
    }
    if (!Number.isFinite(square.distanceM)) {
      throw new RangeError('Vzdálenost čtverce sadu od vsi musí být konečná.');
    }
    if (square.distanceM > FIELD_LIMITS.maxDistanceM) {
      throw new RangeError(`Čtverec sadu je dál než ${FIELD_LIMITS.maxDistanceM} m od vsi.`);
    }
    validateObstacleCost(square.obstacleCost);
    validateTrees(square.trees ?? 0);
    cells.add(`${square.cell.x},${square.cell.y}`);
  }
  if (cells.size !== input.squares.length) throw new RangeError('Čtverce sadu se opakují.');
  validateObstacleIds(input.squares.flatMap((s) => s.obstacleIds ?? []));
}

/**
 * Zahájí výsadbu jabloňového sadu (orchard.md – Stavba): nový sad se čtverci, které se teprve
 * sázejí, a stavba ze společné práce vsi – 80 člověkodní na hektar + překážky, jen v oknech
 * výsadby (jaro, podzim). RangeError při neplatném vstupu, překryvu s jiným sadem nebo když ves
 * nemá suroviny předem. Ostatní pravidla umístění (louka, pole, obydlí, hřbitov, vzdálenost,
 * souvislost) ověří `orchardPartsFromCells`.
 *
 * Konvence dne (jako u `foundField`): akce se volá na ves dopočítanou do dne `day` a patří na
 * konec toho dne – práci stavba dostane od dne `day + 1`. Den před `state.lastDay` → RangeError.
 */
export function foundOrchard(state: VillageState, day: number, input: OrchardInput): VillageState {
  validateActionDay(state, day);
  validateOrchard(input);
  const taken = new Set(
    villageOrchards(state).flatMap((o) => o.squares.map((s) => `${s.cell.x},${s.cell.y}`)),
  );
  if (input.squares.some((s) => taken.has(`${s.cell.x},${s.cell.y}`))) {
    throw new RangeError('Čtverec už patří sadu.');
  }
  requireAffordable(state, 'orchard');
  const next = structuredClone(state);
  payUpfront(next, 'orchard');
  const orchardId = next.nextId++;
  const squares: OrchardSquare[] = input.squares.map((s) => ({
    cell: { x: s.cell.x, y: s.cell.y },
    areaM2: s.areaM2,
    distanceM: s.distanceM,
    plantingCost: orchardPlantingCost(s.areaM2, s.obstacleCost),
    plantingDone: 0,
    plantedDay: null,
    ...(s.obstacleIds?.length ? { obstacles: [...s.obstacleIds] } : {}),
    ...(s.trees ? { trees: s.trees } : {}),
  }));
  next.orchards = [...villageOrchards(next), { id: orchardId, squares }];
  next.applesKg ??= 0;
  next.constructions.push({
    id: next.nextId++,
    kind: 'orchard',
    startedDay: day,
    cost: squares.reduce((sum, s) => sum + s.plantingCost, 0),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    orchardId,
  });
  return next;
}
