import { TOTAL_GAME_DAYS } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import { cemeteryFoundingCost, touchingCemeteries, villageCemeteries } from './cemetery';
import {
  buildAffordability,
  dwellingLaborManDays,
  payUpfront,
  sacredLaborManDays,
  workshopLaborManDays,
  type BuildKind,
} from './costs';
import { craftCoverage } from './crafts';
import { isVillageExtinct } from './extinction';
import { startingLivestock } from './livestock';
import { startPen, startTeamTraining, type PenInput } from './oxen';
import { fieldsTouching, mergeFields, partFoundingCost } from './fields';
import { giveWayToBuilding, validateTakenLand, type TakenLand } from './land-taken';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import { orchardPlantingCost, villageOrchards } from './orchard';
import type { Walk } from './paths/walking';
import { ageGroup } from './people';
import { relocationAffordability, relocationBlock, returnConstructionWood } from './relocation';
import {
  CRAFTS,
  CRAFT_BASE,
  FIELD_LIMITS,
  FOOD_NEED_KG_PER_YEAR,
  PLOT_VARIANTS,
  START_AGES,
  START_STORES_MONTHS,
  dwellingBuildLabor,
  workshopTrees,
} from './rules';
import { hasShrine, recordSpared, validateSpared, type SparedSacred } from './sacred';
import type {
  CemeterySquare,
  Craft,
  DwellingPlot,
  DwellingType,
  FieldSurface,
  OrchardSquare,
  Person,
  Position,
  SacredBuildingKind,
  TileCell,
  VillageState,
} from './types';
import {
  addLogs,
  claimedObstacles,
  logsFromClearedTrees,
  planDwellingWood,
  planSacredWood,
  takeWood,
  type WoodPlan,
} from './wood';

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
  /** Posvátné duby a háje, které vesničané při mýcení nechají stát (happiness.md). */
  sacred?: SparedSacred;
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
  /**
   * Čtverce polí pod hřbitovem (`takenLand` z kontroly) – z pole zmizí (fields.md – Pole jako
   * krajina).
   */
  takenLand?: readonly TakenLand[];
  /** Strana čtverce – políčka krajiny (m). */
  squareSizeM: number;
  /** Háje, které vesničané nechají stát (happiness.md). */
  sacred?: SparedSacred;
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

export type OrchardInput = {
  squares: OrchardSquareInput[];
  /** Čtverce polí pod sadem (`takenLand` z kontroly) – z pole zmizí (fields.md – Pole jako krajina). */
  takenLand?: readonly TakenLand[];
  /** Posvátné duby a háje, které vesničané při mýcení nechají stát (happiness.md). */
  sacred?: SparedSacred;
};

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
function validateField(field: FieldInput, joinedAreaM2 = 0): void {
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
  // rozšíření navazujícího pole – nejmenší výměru musí mít pole i s ním (fields.md)
  const total = field.parts.reduce((sum, p) => sum + p.areaM2, 0) + joinedAreaM2;
  if (total < FIELD_LIMITS.minAreaM2) {
    throw new RangeError(`Pole musí mít aspoň ${FIELD_LIMITS.minAreaM2} m².`);
  }
  if (field.sacred) validateSpared(field.sacred);
}

/**
 * Přidá do (již naklonovaného) stavu díly pole ve stavu 'founding' a stavbu pole. Čtverce, které
 * stranou navazují na pole, ho rozšíří (stejné id, díly na konec, rozestavěné založení pole dostane
 * jejich cenu, jinak nová stavba pole); navazují-li na víc polí, ta se nejdřív sloučí do
 * nejstaršího (Martin – fields.md, Navazující pole). Jinak vznikne nové pole.
 */
function addField(state: VillageState, day: number, field: FieldInput): void {
  const joined = fieldsTouching(
    state.parts,
    field.parts.flatMap((p) => (p.cell ? [p.cell] : [])),
  );
  const extended = joined[0];
  if (extended !== undefined && joined.length > 1) mergeFields(state, extended, joined.slice(1));
  const fieldId = extended ?? state.nextId++;
  if (extended === undefined) state.fields.push({ id: fieldId });
  // založení podle dnešního pokrytí nástroji (crafts.md – meze produktivity)
  const tools = craftCoverage(state, day).tools;
  let cost = 0;
  for (const input of field.parts) {
    const foundingCost = partFoundingCost(input.surface, input.areaM2, input.obstacleCost, tools);
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
  const running = state.constructions.find((c) => c.kind === 'field' && c.fieldId === fieldId);
  if (running) {
    running.cost += cost;
    return;
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
  if (field.sacred) recordSpared(state, field.sacred, day);
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
  /** Posvátné duby a háje na vyklízené ploše první zemnice – zůstanou stát (happiness.md). */
  dwellingSpared?: SparedSacred;
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
  if (input.dwellingSpared) validateSpared(input.dwellingSpared);
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
    // výchozí stádo osadníků (diet.md – Dobytek); krajinu pro pastvu doplní use-case
    livestock: startingLivestock({ people }),
    meatKg: 0,
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
  if (input.dwellingSpared) recordSpared(state, input.dwellingSpared, day);
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
  /** Posvátné duby a háje na vyklízené ploše – zůstanou stát (happiness.md). */
  sacred?: SparedSacred;
  /**
   * Kusy čtverců polí a sadů, které obydlí sebere (`takenLand` z kontroly umístění) – pole a sad
   * se o ně zmenší (population.md – Obydlí na poli a v sadu).
   */
  takenLand?: readonly TakenLand[];
  /** Chůze ke stromům ke kácení po pevných cestách (roads.md); bez ní vzdušná vzdálenost. */
  walk?: Walk;
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
 * Pole a sady pod obydlím (`site.takenLand`) se zmenší, díly a čtverce pod prahem zmizí
 * (`giveWayToBuilding`) – až po plánu dřeva, ať cena sedí s cenou u kurzoru.
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
  validateDwellingSite(state, day, position, obstacleCost, obstacleIds, site);
  requireAffordable(state, type, site.obstacles);
  return addDwellingSite(state, day, type, position, obstacleCost, obstacleIds, site, null);
}

/**
 * Domácnost obydlí `householdId` si začne stavět nový dům jinde ve vsi (migration.md –
 * Přestěhování domácnosti). Stejné jako `startNewDwelling` – kontroly vstupu, dřevo, pozemek,
 * překážky a cena –, jen bez lidí k osídlení: stavba nese `relocates` a po dostavění se do ní
 * domácnost přestěhuje (`moveRelocatedHousehold`), starý dům zůstane prázdný. RangeError, když
 * domácnost neexistuje, nový dům si už staví nebo svůj dům přestavuje (`relocationBlock`), když
 * ves nemá dřevo předem nebo je vstup neplatný. Konvence dne jako u `startNewDwelling`.
 */
export function startRelocation(
  state: VillageState,
  day: number,
  householdId: number,
  type: DwellingType,
  position: Position,
  obstacleCost: number,
  obstacleIds: readonly number[] = [],
  site: DwellingSiteOptions = {},
): VillageState {
  validateDwellingSite(state, day, position, obstacleCost, obstacleIds, site);
  const block = relocationBlock(state, householdId);
  if (block !== null) throw new RangeError(`Domácnost ${householdId} se teď nestěhuje (${block}).`);
  if (!relocationAffordability(state, type, site.obstacles).affordable) {
    throw new RangeError('Na nový dům ves nemá dřevo.');
  }
  const next = addDwellingSite(
    state,
    day,
    type,
    position,
    obstacleCost,
    obstacleIds,
    site,
    householdId,
  );
  next.chronicle.push({ day, kind: 'relocation-started', dwellingId: householdId, type });
  return next;
}

/**
 * Hráč zruší rozestavěné přestěhování (stavba `constructionId`, migration.md): stavba zmizí,
 * klády, které vzala z hromady, i už skácené stromy se vrátí na hromadu, vyhrazené stromy se
 * uvolní. Odvedená práce a odstraněné překážky staveniště zůstanou. RangeError, když taková
 * stavba není (dostavěná, jiná stavba), nebo pro den do minulosti vsi.
 */
export function cancelRelocation(
  state: VillageState,
  day: number,
  constructionId: number,
): VillageState {
  validateActionDay(state, day);
  const c = state.constructions.find((x) => x.id === constructionId);
  if (!c || c.relocates === undefined) {
    throw new RangeError(`Stavba ${constructionId} není rozestavěné přestěhování.`);
  }
  const next = structuredClone(state);
  returnConstructionWood(next, c);
  next.constructions = next.constructions.filter((x) => x.id !== constructionId);
  next.chronicle.push({ day, kind: 'relocation-cancelled', dwellingId: c.relocates });
  return next;
}

/** Ověří vstup staveniště obydlí (den, poloha, překážky, pozemek…); jinak RangeError. */
function validateDwellingSite(
  state: VillageState,
  day: number,
  position: Position,
  obstacleCost: number,
  obstacleIds: readonly number[],
  site: DwellingSiteOptions,
): void {
  validateActionDay(state, day);
  validatePosition(position);
  validateObstacleCost(obstacleCost);
  validateObstacleIds(obstacleIds);
  validateTrees(site.clearedTrees ?? 0);
  if (site.forestDistanceM !== undefined) validateForestDistance(site.forestDistanceM);
  if (site.plot) validatePlot(site.plot);
  if (site.sacred) validateSpared(site.sacred);
  validateTakenLand(site.takenLand ?? []);
}

/**
 * Staveniště obydlí na klonu stavu: dřevo (klády z hromady, zbytek vyhrazené stromy), překážky
 * na vyklízené ploše, ušetřená posvátná místa a pole či sady pod obydlím. `relocates` – domácnost,
 * která se do obydlí po dostavění přestěhuje (null = nové obydlí pro novou domácnost).
 */
function addDwellingSite(
  state: VillageState,
  day: number,
  type: DwellingType,
  position: Position,
  obstacleCost: number,
  obstacleIds: readonly number[],
  site: DwellingSiteOptions,
  relocates: number | null,
): VillageState {
  const plan: WoodPlan = planDwellingWood(state, type, position, day, {
    ...(site.obstacles ? { obstacles: site.obstacles } : {}),
    clearedTrees: site.clearedTrees ?? 0,
    clearedIds: obstacleIds,
    ...(site.walk ? { walk: site.walk } : {}),
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
    ...(relocates === null ? {} : { relocates }),
  });
  if (site.sacred) recordSpared(next, site.sacred, day);
  giveWayToBuilding(next, day, site.takenLand ?? []);
  return next;
}

/** Staveniště řemeslné dílny – jako obydlí bez pozemku, navíc vzdálenost k potoku (crafts.md). */
export interface WorkshopSiteOptions extends Omit<DwellingSiteOptions, 'plot'> {
  /** Vzdálenost dílny k potoku (m) – ruda a hlína dál od vody stojí víc práce. */
  waterDistanceM?: number;
}

/**
 * Zahájí stavbu řemeslné dílny `craft` (crafts.md – Budovy): obydlí řemesla (hrnčíř a kovář
 * polozemnice, uhlíř zemnice s milířem) se staví volně jako zemnice a stojí o 30 % víc práce
 * i dřeva; nastěhuje se do ní mladý pár jako do nového obydlí. Překážky na vyklízené ploše (i kolem
 * milíře – `obstacleIds`, cena v `obstacleCost`) osadníci odstraní hned, dospělé stromy z ní
 * dají klády. Dřevo jako u obydlí – klády z hromady, zbytek nejbližší dospělé stromy. Pole a sady
 * pod vyklízenou plochou se zmenší jako u obydlí (`site.takenLand`). RangeError, když ves nemá
 * dřevo, lidi k osídlení nebo je vstup neplatný.
 *
 * Konvence dne (jako u `startNewDwelling`): akce se volá na ves dopočítanou do dne `day` a patří
 * na konec toho dne. Den před `state.lastDay` → RangeError.
 */
export function startWorkshop(
  state: VillageState,
  day: number,
  craft: Craft,
  position: Position,
  obstacleCost: number,
  obstacleIds: readonly number[] = [],
  site: WorkshopSiteOptions = {},
): VillageState {
  validateActionDay(state, day);
  if (!CRAFTS.includes(craft)) throw new RangeError('Neznámé řemeslo.');
  validatePosition(position);
  validateObstacleCost(obstacleCost);
  validateObstacleIds(obstacleIds);
  validateTrees(site.clearedTrees ?? 0);
  if (site.forestDistanceM !== undefined) validateForestDistance(site.forestDistanceM);
  if (
    site.waterDistanceM !== undefined &&
    !(site.waterDistanceM >= 0 && Number.isFinite(site.waterDistanceM))
  ) {
    throw new RangeError('Vzdálenost k potoku musí být nezáporná a konečná.');
  }
  if (site.sacred) validateSpared(site.sacred);
  validateTakenLand(site.takenLand ?? []);
  requireAffordable(state, craft, site.obstacles);
  const type = CRAFT_BASE[craft];
  const plan = planDwellingWood(state, type, position, day, {
    ...(site.obstacles ? { obstacles: site.obstacles } : {}),
    clearedTrees: site.clearedTrees ?? 0,
    clearedIds: obstacleIds,
    trees: workshopTrees(craft),
    ...(site.walk ? { walk: site.walk } : {}),
  });
  if (plan.missing > 0) throw new RangeError('Na stavbu ves nemá dřevo – není z čeho kácet.');
  const next = structuredClone(state);
  payUpfront(next, craft);
  recordClearedObstacles(next, obstacleIds, day);
  const wood = takeWood(next, plan);
  next.constructions.push({
    id: next.nextId++,
    kind: 'dwelling',
    startedDay: day,
    cost: workshopLaborManDays(craft, obstacleCost, plan),
    done: 0,
    dwellingType: type,
    position: { ...position },
    dwellingId: null,
    fieldId: null,
    wood,
    ...(site.forestDistanceM === undefined ? {} : { forestDistanceM: site.forestDistanceM }),
    craft,
    ...(site.waterDistanceM === undefined ? {} : { waterDistanceM: site.waterDistanceM }),
  });
  if (site.sacred) recordSpared(next, site.sacred, day);
  giveWayToBuilding(next, day, site.takenLand ?? []);
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
  const joined = new Set(
    fieldsTouching(
      state.parts,
      field.parts.flatMap((p) => (p.cell ? [p.cell] : [])),
    ),
  );
  validateField(
    field,
    state.parts.filter((p) => joined.has(p.fieldId)).reduce((sum, p) => sum + p.areaM2, 0),
  );
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
  if (input.sacred) validateSpared(input.sacred);
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
  validateTakenLand(input.takenLand ?? []);
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
  // čtverce polí pod hřbitovem z pole zmizí (fields.md – Pole jako krajina)
  giveWayToBuilding(next, day, input.takenLand ?? [], 'cemetery');
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
  if (input.sacred) recordSpared(next, input.sacred, day);
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
  if (input.sacred) validateSpared(input.sacred);
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
  validateTakenLand(input.takenLand ?? []);
  const taken = new Set(
    villageOrchards(state).flatMap((o) => o.squares.map((s) => `${s.cell.x},${s.cell.y}`)),
  );
  if (input.squares.some((s) => taken.has(`${s.cell.x},${s.cell.y}`))) {
    throw new RangeError('Čtverec už patří sadu.');
  }
  requireAffordable(state, 'orchard');
  const next = structuredClone(state);
  payUpfront(next, 'orchard');
  // čtverce polí pod sadem z pole zmizí (fields.md – Pole jako krajina)
  giveWayToBuilding(next, day, input.takenLand ?? [], 'orchard');
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
  if (input.sacred) recordSpared(next, input.sacred, day);
  return next;
}

/** Staveniště modly nebo svatyně – duby ke kácení a stromy z půdorysu (happiness.md). */
export interface SacredSiteOptions {
  /**
   * Vrstva překážek krajiny – duby ke kácení (nejbližší dospělé duby ke staveništi). Bez ní (jen
   * testy) se duby kácí bez polohy za cenu blízkého lesa.
   */
  obstacles?: ObstacleLayer;
  /** Dospělé stromy mezi `obstacleIds` – osadníci je skácí na hromadu klád. */
  clearedTrees?: number;
  /** Chůze k dubům ke kácení po pevných cestách (roads.md); bez ní vzdušná vzdálenost. */
  walk?: Walk;
  /**
   * Kusy dílů polí pod půdorysem (`takenLand` z kontroly) – díly se zmenší, pod prahem zmizí
   * (fields.md – Pole jako krajina).
   */
  takenLand?: readonly TakenLand[];
}

/**
 * Zahájí stavbu dřevěné modly nebo svatyně (happiness.md) – stavba ze společné práce vsi po
 * fázích, osadníci nejsou potřeba. Předem chce dospělé duby: vyhradí nejbližší dospělé duby ke
 * staveništi (ne posvátné) a skácí je jako první část práce. Překážky na půdorysu (`obstacleIds`,
 * cena v `obstacleCost`) osadníci odstraní hned, dospělé stromy z něj dají klády. Svatyně je
 * jedna na ves. RangeError, když ves nemá duby, už svatyni má nebo je vstup neplatný.
 *
 * Konvence dne (jako u `startNewDwelling`): akce se volá na ves dopočítanou do dne `day` a patří
 * na konec toho dne. Den před `state.lastDay` → RangeError.
 */
export function startSacredBuilding(
  state: VillageState,
  day: number,
  kind: SacredBuildingKind,
  position: Position,
  obstacleCost: number,
  obstacleIds: readonly number[] = [],
  site: SacredSiteOptions = {},
): VillageState {
  validateActionDay(state, day);
  validatePosition(position);
  validateObstacleCost(obstacleCost);
  validateObstacleIds(obstacleIds);
  validateTrees(site.clearedTrees ?? 0);
  validateTakenLand(site.takenLand ?? []);
  if (kind === 'shrine' && hasShrine(state)) {
    throw new RangeError('Ves už svatyni má – svatyně je jedna na ves.');
  }
  requireAffordable(state, kind, site.obstacles);
  const plan = planSacredWood(
    kind,
    position,
    { changes: () => obstacleChangesAt(state, day), claimed: () => claimedObstacles(state) },
    {
      obstacles: site.obstacles ?? null,
      clearedIds: obstacleIds,
      ...(site.walk ? { walk: site.walk } : {}),
    },
  );
  if (plan.missing > 0) throw new RangeError('Na stavbu ves nemá dospělé duby ke kácení.');
  const next = structuredClone(state);
  payUpfront(next, kind);
  recordClearedObstacles(next, obstacleIds, day);
  addLogs(next, logsFromClearedTrees(site.clearedTrees ?? 0));
  next.constructions.push({
    id: next.nextId++,
    kind,
    startedDay: day,
    cost: sacredLaborManDays(kind, obstacleCost, plan),
    done: 0,
    dwellingType: null,
    position: { ...position },
    dwellingId: null,
    fieldId: null,
    wood: takeWood(next, plan),
  });
  // díly polí pod půdorysem se zmenší (fields.md – Pole jako krajina) – po plánu dřeva
  giveWayToBuilding(next, day, site.takenLand ?? [], kind);
  return next;
}

/**
 * Zahájí stavbu ohrady s přístřeškem (oxen.md) na čtverci z `checkPenPlacement`. RangeError, když
 * je den mimo vsi, ves nemá dřevo předem nebo je vstup neplatný. Konvence dne jako u ostatních
 * staveb – práci stavba dostane od dne `day + 1`.
 */
export function foundPen(
  state: VillageState,
  day: number,
  input: PenInput,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): VillageState {
  validateActionDay(state, day);
  if (!Number.isInteger(input.cell.x) || !Number.isInteger(input.cell.y)) {
    throw new RangeError('Políčko ohrady musí mít celočíselné souřadnice.');
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.z)) {
    throw new RangeError('Střed ohrady musí mít konečné souřadnice.');
  }
  validateObstacleCost(input.obstacleCost);
  validateObstacleIds(input.obstacleIds);
  validateTrees(input.clearedTrees);
  validateTakenLand(input.takenLand ?? []);
  if ((state.pens ?? []).some((p) => p.cell.x === input.cell.x && p.cell.y === input.cell.y)) {
    throw new RangeError('Na čtverci už ohrada stojí.');
  }
  requireAffordable(state, 'pen', obstacles ?? undefined);
  const next = startPen(state, day, input, obstacles, walk);
  // čtverec pole pod ohradou z pole zmizí (fields.md – Pole jako krajina)
  giveWayToBuilding(next, day, input.takenLand ?? [], 'pen');
  return next;
}

/**
 * Hráč zadá v ohradě výcvik spřežení (oxen.md – „Vycvičit spřežení“). RangeError, když je den
 * mimo vsi nebo výcvik nejde (`trainingBlock`).
 */
export function trainTeam(
  state: VillageState,
  day: number,
  penId: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): VillageState {
  validateActionDay(state, day);
  return startTeamTraining(state, day, penId, obstacles, walk);
}
