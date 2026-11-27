import { withArmsCaps } from '../people/arms-caps';
import { cloneState } from './clone';
import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../../calendar';
import { MINT_YEAR } from '../crafts/gold-crafts';
import { MINT } from '../rules/rules-gold';
import { newSteward } from '../steward/steward-state';
import type { ObstacleLayer } from '../../landscape';
import { cemeteryFoundingCost, touchingCemeteries, villageCemeteries } from '../buildings/cemetery';
import { newFenceSides } from '../buildings/fence-cost';
import { isHouseType, type HouseType } from '../buildings/log-house';
import {
  BUILD_COSTS,
  buildAffordability,
  dwellingLaborManDays,
  payUpfront,
  sacredLaborManDays,
  workshopCosts,
  workshopLaborManDays,
  type BuildKind,
} from '../buildings/costs';
import { craftCoverage } from '../crafts/crafts';
import { HORSE_PEN_NO_SURPLUS, horsePenPayment, payHorsePen } from '../livestock/horse-pen-payment';
import { isVillageExtinct } from './extinction';
import { PLAN_HAY_KEEP, winterHayKg } from '../livestock/hay';
import { foundingLivestock } from '../livestock/livestock';
import { ableTeams, startPen, type PenInput } from '../livestock/oxen';
import {
  MAX_PEN_SQUARES,
  PEN_SPECIES,
  connectedCells,
  penGraceEnd,
  penSquares,
  touchingPens,
} from '../livestock/pens';
import { clearingBurnCost } from '../forest/forest-clearing';
import { fieldsTouching, mergeFields, partFoundingCost } from '../fields/fields';
import { normalizeGrid, rotationTurn, squareKey } from '../placement/square-grid';
import { fieldGrids } from '../placement/squares';
import { giveWayToBuilding, validateTakenLand, type TakenLand } from '../buildings/land-taken';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import { orchardPlantingCost, villageOrchards } from '../buildings/orchard';
import { copyPlot } from '../buildings/plots';
import type { Walk } from '../paths/walking';
import { ageGroup } from '../people/people';
import { addCarriedStocks, addHeaps } from '../people/belongings';
import {
  faithOfSettlers,
  settlersCarts,
  settlersHorses,
  settlersMaxId,
  type Settlers,
} from '../people/departure';
import { isLineMan } from '../people/dynasty';
import { checkPersonName, generatedLineName, normalizePersonName } from '../people/dynasty-names';
import { nameUnnamed } from '../people/people-names';
import { replacementAffordability, relocationBlock } from '../people/relocation';
import {
  CRAFTS,
  CRAFT_BASE,
  FIELD_LIMITS,
  FOOD_NEED_KG_PER_YEAR,
  PLOT_VARIANTS,
  START_AGES,
  START_SEXES,
  BIRTH_SPACING,
  LORD,
  START_SEED_YEARS,
  START_STORES_MONTHS,
  FOUNDERS_STORES,
  dwellingBuildLabor,
  workshopTrees,
} from '../rules';
import { PAGAN_PLACES_FORBIDDEN, rodBaptized } from '../people/faith';
import { hasShrine, recordSpared, validateSpared, type SparedSacred } from '../people/sacred';
import { planThreshingFloorWood, threshingFloorLaborManDays } from '../fields/threshing-floors';
import type {
  CemeterySquare,
  Craft,
  BuildableDwellingType,
  DwellingPlot,
  DwellingType,
  DynastyState,
  FieldSurface,
  OrchardSquare,
  Person,
  Position,
  SacredBuildingKind,
  SquareGrid,
  TileCell,
  VillageState,
} from '../types';
import {
  addLogs,
  claimedObstacles,
  logsFromClearedTrees,
  planDwellingWood,
  planSacredWood,
  takeWood,
  type WoodPlan,
} from '../forest/wood';

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
  /**
   * Stojící stromy čtverce v lese v pořadí kácení (bez vyhrazených jinou stavbou) – díl pak
   * dostane `clearing` místo `trees` (forest.md – Klučení lesa pro pole – postup).
   */
  standing?: { id: number; log: boolean }[];
};

export type FieldInput = {
  parts: PartInput[];
  /**
   * Natočená mřížka pole (fields.md – Natočené stavby) – čtverce dílů jsou v ní; bez ní mřížka
   * krajiny. Rozšiřuje se jen pole v téže mřížce.
   */
  grid?: SquareGrid;
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
   * Natočená mřížka hřbitova (fields.md – Natočené stavby) – čtverce jsou v ní; bez ní mřížka
   * krajiny. Rozšiřuje se jen hřbitov v téže mřížce.
   */
  grid?: SquareGrid;
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
  /** Natočená mřížka sadu (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
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
export function validateActionDay(state: VillageState, day: number): void {
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

/**
 * Pozemek: celočíselné políčko, známá varianta a u natočeného pozemku konečný střed s natočením
 * po 15° (dvorec natočený být nemůže); jinak RangeError.
 */
function validatePlot(plot: DwellingPlot): void {
  if (!Number.isInteger(plot.cell.x) || !Number.isInteger(plot.cell.y)) {
    throw new RangeError('Políčko pozemku musí mít celočíselné souřadnice.');
  }
  if (!PLOT_VARIANTS.includes(plot.variant)) throw new RangeError('Neznámá varianta pozemku.');
  if (plot.square) {
    const { x, z, rotation } = plot.square;
    if (!Number.isFinite(x) || !Number.isFinite(z) || rotationTurn(rotation) === null) {
      throw new RangeError('Natočený pozemek musí mít konečný střed a natočení po 15°.');
    }
    if (plot.yard) throw new RangeError('Pozemek dvorce se nenatáčí.');
  }
}

/** Natočená mřížka stavby po čtvercích musí být platná (po 15°, 15–75°); jinak RangeError. */
function validateGrid(grid: SquareGrid | undefined): void {
  if (grid && !normalizeGrid(grid)) {
    throw new RangeError('Mřížka stavby musí mít konečný počátek a natočení po 15° (15–75°).');
  }
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
  validateGrid(field.grid);
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
  const grid = field.grid ? (normalizeGrid(field.grid) ?? undefined) : undefined;
  // navazuje se jen ve stejné mřížce (fields.md – Natočené stavby)
  const joined = fieldsTouching(
    state.parts,
    field.parts.flatMap((p) => (p.cell ? [p.cell] : [])),
    grid,
    fieldGrids(state),
  );
  const extended = joined[0];
  if (extended !== undefined && joined.length > 1) mergeFields(state, extended, joined.slice(1));
  const fieldId = extended ?? state.nextId++;
  if (extended === undefined) state.fields.push({ id: fieldId, ...(grid ? { grid } : {}) });
  // založení podle dnešního pokrytí nástroji (crafts.md – meze produktivity); ves s párem volů
  // a rádlem louku motykou nezakládá – drn rozorá rádlo při první orbě (oxen.md – Jen rádlo)
  const tools = craftCoverage(state, day).tools;
  const ard = ableTeams(state, day) > 0;
  let cost = 0;
  for (const input of field.parts) {
    const foundingCost = partFoundingCost(
      input.surface,
      input.areaM2,
      input.obstacleCost,
      tools,
      ard,
    );
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
      ...(input.surface === 'forest' && input.standing
        ? {
            clearing: {
              fell: input.standing.map((s) => ({ ...s })),
              felled: 0,
              burnCost: clearingBurnCost(input.areaM2, tools),
            },
          }
        : input.trees
          ? { trees: input.trees }
          : {}),
      ...(ard && input.surface === 'meadow' ? { sod: true as const } : {}),
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
    ...(extended === undefined ? {} : { extends: true as const }),
  });
  if (field.sacred) recordSpared(state, field.sacred, day);
}

/**
 * Zakladatelé rodu (lord.md – Zakladatelé; Martin 24. 10. 2026: „Vesnici zakládá vojvoda a jeho
 * rodina.“, 15. 11. 2026: „aby měl vojvoda minimálně 4 dospělé (alespoň 16 let) syny“): vojvoda,
 * jeho manželky a synové podle `LORD.founders` od id `lordId` – vojvoda, hlavní manželka, vedlejší
 * od nejstarší, synové od nejstaršího. Rodiče vojvody a manželek neznámí; všechny manželky porodí
 * nejdřív za 9 měsíců jako po svatbě. Vojvoda má příznak rodu a jméno, je-li zadané. Synové jsou
 * vojvodovi, matky podle `mother`: příznak rodu, syn hlavní manželky `mainWifeSon` (elitu jim dá
 * denní pravidlo `markElite`) a jméno vygenerované jako vnukům (`generatedLineName`) – dal ho rod,
 * hráč ho smí jednou přepsat (`nameByHouse`, absence.md – Jména synů).
 */
function dynastyFounders(
  lordId: number,
  dwellingId: number,
  day: number,
  name: string | undefined,
  seed: number,
): { people: Person[]; dynasty: DynastyState } {
  const { lordAge, wifeAges, sons } = LORD.founders;
  const bornDay = (age: number): number => day - Math.ceil(age * DAYS_PER_YEAR);
  const lord: Person = {
    id: lordId,
    bornDay: bornDay(lordAge),
    dwellingId,
    sex: 'male',
    spouseId: lordId + 1,
    line: true,
    ...(name === undefined ? {} : { name }),
  };
  const wives = wifeAges.map((age, i): Person => ({
    id: lordId + 1 + i,
    bornDay: bornDay(age),
    dwellingId,
    sex: 'female',
    spouseId: lordId,
    // první dítě nejdřív za 9 měsíců jako po svatbě (population.md – rozestup porodů)
    nextBirthFrom: day + BIRTH_SPACING.afterWeddingDays,
  }));
  const people = [lord, ...wives];
  sons.forEach(({ age, mother }, i) => {
    const id = lordId + 1 + wifeAges.length + i;
    people.push({
      id,
      bornDay: bornDay(age),
      dwellingId,
      sex: 'male',
      motherId: lordId + 1 + mother,
      fatherId: lordId,
      line: true,
      ...(mother === 0 ? { mainWifeSon: true as const } : {}),
      // jméno, které nenosí žádný muž rodu mezi zakladateli (vojvoda, starší bratři)
      name: generatedLineName({ seed, people }, day, id),
      nameByHouse: true,
    });
  });
  return {
    people,
    dynasty: {
      lordId,
      lords: [{ id: lordId, ...(name === undefined ? {} : { name }), fromDay: day }],
    },
  };
}

/**
 * Rod vsi osadníků (návrh Clauda – rod ve víc vsích řeší fáze 2–4): vojvodou je vůdce odchodu
 * `leaderId` – syn vojvody s dílem vsi, nebo vojvoda, který odešel (lord.md – Dělení vsi, Nová
 * ves) –, je-li mezi nimi jako muž rodu; jinak nejstarší muž rodu mezi nimi, bez něj je nová ves
 * bez rodu.
 */
function settlersLord(people: readonly Person[], leaderId?: number): Person | undefined {
  const leader = people.find((p) => p.id === leaderId && isLineMan(p));
  return leader ?? people.filter(isLineMan).sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)[0];
}

/** Rod vsi osadníků s vojvodou `lord` (`settlersLord`), bez něj ves bez rodu. */
function settlersDynasty(lord: Person | undefined, day: number): DynastyState {
  // nový objekt – stav vsi se nesmí dělit o `NO_DYNASTY`
  if (!lord) return { lordId: null, lords: [] };
  const name = lord.name === undefined ? {} : { name: lord.name };
  return { lordId: lord.id, lords: [{ id: lord.id, ...name, fromDay: day }] };
}

/** Vstup založení vsi (`foundVillage`). */
export interface VillageFounding {
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
  /**
   * Osadníci odešlí z jiné vsi (migration.md – Odchod do nové vsi): místo čtyř zakladatelů,
   * zásob a výchozího stáda přijdou jejich lidé (s rodokmenem), jídlo a stáda. Všichni bydlí na
   * staveništi první zemnice, dokud ji nepostaví.
   */
  settlers?: Settlers;
  /**
   * Ves zakládá vojvoda s manželkami a syny (lord.md – Zakladatelé) – `name` jméno vojvody (jen
   * písmena, `checkPersonName`); bez jména na ně vojvoda čeká. Bez `lord` ves bez rodu se dvěma páry
   * (testy, starší varianty kalibrace). S osadníky se nepoužije – zakladatele nemění (vojvodou je
   * nejstarší muž rodu mezi nimi, s vůdcem odchodu `settlers.lordId` on).
   */
  lord?: { name?: string };
}

/**
 * Založí ves: s vojvodou (`lord`) jeho rodina podle LORD.founders (lord.md – Zakladatelé), bez něj
 * ves bez rodu se 4 lidmi podle START_AGES; zásoby zakladatelů podle FOUNDERS_STORES (ves bez rodu
 * na START_STORES_MONTHS) a stavba první zemnice
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
export function foundVillage(input: VillageFounding): VillageState {
  validateFounding(input);
  const { seed, day, settlers } = input;
  const dwellingObstacleIds = input.dwellingObstacleIds ?? [];
  // osadníci si nesou id ze staré vsi – nová ves čísluje za nimi
  const householdId = settlers ? settlersMaxId(settlers) + 1 : 1;
  const { founders, people } = foundingPeople(input, householdId);
  const livestock = {
    ...(settlers
      ? { herds: { ...settlers.herds }, young: { ...settlers.young } }
      : foundingLivestock({ people }, day)),
    // rok na stavbu ohrad (oxen.md – Ohrady podle druhu, roční odklad)
    pensFromDay: penGraceEnd(day),
  };
  marryFounders(people, input, founders);
  const constructionId = settlers ? householdId + 1 : householdId + 1 + people.length;
  const annualNeed = people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  const food = settlers?.food;
  // zakladatelé první vsi (vojvoda s manželkami a syny) nesou velkou zásobu jídla a osiva jen na
  // setí (fields.md – Zásoby a nasycení, Start; FOUNDERS_STORES – jako praotec Čech)
  const foundersSeedKg = founders ? annualNeed * FOUNDERS_STORES.seedYears : 0;
  const state: VillageState = {
    seed,
    foundedDay: day,
    lastDay: day - 1,
    nextId: constructionId + 1,
    people,
    // ves bez rodu (bez vojvody) se chová jako před rodem (lord.md – Zakladatelé)
    dynasty: settlers
      ? settlersDynasty(settlersLord(people, settlers.lordId), day)
      : (founders?.dynasty ?? { lordId: null, lords: [] }),
    // ves syna (`departWithSon`) řídí správce od založení, první ves hráče ne (steward.md)
    steward: newSteward(day, settlers?.stewarded === true),
    // nová ves pokřtěného rodu je pokřtěná (christianity.md – Křest rodu)
    ...(settlers ? faithOfSettlers(settlers) : {}),
    dwellings: [],
    fields: [],
    parts: [],
    constructions: [firstDwellingSite(input, constructionId, householdId)],
    season: null,
    threshingSeason: null,
    // nová ves rovnou s osevním postupem po dílech (fields.md – Osevní postup po dílech, bod 7)
    sowingRotation: true,
    ...foundingStores(input, founders, annualNeed, foundersSeedKg),
    // nová ves mlátí až na humně, které postaví hráč – bez odkladu (production-chains.md – Humno)
    sheaves: { grainKg: 0, legumesKg: 0 },
    // zásoby osadníků jsou doma; jámy vesničané vykopou po prvním výmlatu (production-chains.md –
    // Obilné jámy)
    grainPits: [],
    hungry: false,
    commonLaborHistory: [],
    chronicle: [{ day, kind: 'village-founded' }],
    clearedObstacles: dwellingObstacleIds.map((id) => ({ id, day })),
    felledTrees: [],
    woodLogs: 0,
    // výchozí stádo osadníků (diet.md – Dobytek), u odešlých jejich díl stád; krajinu pro pastvu
    // doplní use-case
    livestock,
    // noví osadníci si přivedli i seno na první zimu stáda (diet.md – Oděv: jinak by ves založená
    // po seči přišla v zimě o ovce na vlnu) – na dny se sněhem i se ztrátou ve stohu jako plán seče
    // (diet.md – Zima bez sena); co nesnědí, shnije s příští sečí
    ...(settlers
      ? {}
      : { hay: { kg: winterHayKg(livestock.herds, 0) / PLAN_HAY_KEEP, mowing: null } }),
    ...settlersCarry(settlers, food),
    // první zemnice zakladatelů je dvorcem vojvody (trade.md – Dvorec vojvody)
    manorId: householdId,
  };
  settlersBelongings(state, settlers, people, day);
  firstFieldAndWood(state, input);
  // zakladatelé mají jména od založení (population.md – Jména) – vojvoda bez jména čeká na hráče
  nameUnnamed(state);
  // strop dovedností (war.md – Síla) platí od založení – dřív ho nové vsi dal až první dopočet
  // (převod `arms-caps`): dovednosti osadníků nad strop se srazí jako tehdy, ves dostane příznak
  return withArmsCaps(state);
}

/** Ověří vstup založení vsi (den, poloha, překážky, stromy, les, pole, posvátná místa, osadníci, jméno vojvody). */
function validateFounding(input: VillageFounding): void {
  const { day, dwellingPosition, firstField } = input;
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
  const { settlers } = input;
  if (settlers && settlers.people.length === 0) throw new RangeError('Osadníci chybí.');
  const lordName = input.lord?.name;
  if (lordName !== undefined) {
    const check = checkPersonName(lordName);
    if (!check.ok) throw new RangeError(check.reason ?? 'Neplatné jméno vojvody.');
  }
}

/**
 * Lidé nové vsi: osadníci s rodokmenem, rodina vojvody (lord.md – Zakladatelé), nebo dva páry
 * ves bez rodu podle START_AGES.
 */
function foundingPeople(
  input: VillageFounding,
  householdId: number,
): { founders: ReturnType<typeof dynastyFounders> | null; people: Person[] } {
  const { day, settlers } = input;
  const lordName = input.lord?.name;
  const founders =
    !settlers && input.lord
      ? dynastyFounders(
          householdId + 1,
          householdId,
          day,
          lordName === undefined ? undefined : normalizePersonName(lordName),
          input.seed,
        )
      : null;
  // zakladatelé jsou dva páry (kinship.md – Pohlaví): manželé 25 let a chlapec s dívkou, kteří
  // nejsou příbuzní (rodiče neznámí) – vezmou se, až dorostou
  const people: Person[] = settlers
    ? settlers.people.map((p) => ({ ...p, dwellingId: householdId }))
    : founders
      ? founders.people
      : START_AGES.map((age, i) => ({
          id: householdId + 1 + i,
          bornDay: day - Math.ceil(age * DAYS_PER_YEAR),
          dwellingId: householdId,
          sex: START_SEXES[i] ?? 'male',
        }));
  return { founders, people };
}

/** Ves bez rodu: manželé ze zakladatelů, první dítě nejdřív za 9 měsíců jako po svatbě. */
function marryFounders(
  people: readonly Person[],
  input: VillageFounding,
  founders: ReturnType<typeof dynastyFounders> | null,
): void {
  const { day, settlers } = input;
  const [husband, wife] = people;
  if (!settlers && !founders && husband && wife) {
    husband.spouseId = wife.id;
    wife.spouseId = husband.id;
    // první dítě nejdřív za 9 měsíců jako po svatbě (population.md – rozestup porodů)
    wife.nextBirthFrom = day + BIRTH_SPACING.afterWeddingDays;
  }
}

/** Stavba první zemnice – zakladatelé bydlí na staveništi (id domácnosti = id budoucí zemnice). */
function firstDwellingSite(
  input: VillageFounding,
  constructionId: number,
  householdId: number,
): VillageState['constructions'][number] {
  const { day, dwellingPosition } = input;
  const dwellingObstacleCost = input.dwellingObstacleCost ?? 0;
  return {
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
  };
}

/**
 * Zásoby nové vsi: jídlo a osivo osadníků, velká zásoba zakladatelů s osivem jen na setí
 * (FOUNDERS_STORES), nebo ves bez rodu na START_STORES_MONTHS.
 */
function foundingStores(
  input: VillageFounding,
  founders: ReturnType<typeof dynastyFounders> | null,
  annualNeed: number,
  foundersSeedKg: number,
): Pick<VillageState, 'storesKg' | 'reservedSeedKg' | 'reservedSeedUntilDay'> {
  const { day, settlers } = input;
  const food = settlers?.food;
  const seedUntilDay = settlers?.whole?.seedUntilDay;
  return {
    storesKg: food
      ? food.grainKg + (settlers?.seedKg ?? 0)
      : founders
        ? annualNeed * FOUNDERS_STORES.foodYears + foundersSeedKg
        : (annualNeed * START_STORES_MONTHS) / MONTHS_PER_YEAR + annualNeed * START_SEED_YEARS,
    // osivo, které osadníci přinesli, ves nesní (fields.md – Osivo pro ves bez zásob); rezerva celé
    // vsi i s lhůtou osiva zakladatelů
    ...(settlers?.seedKg ? { reservedSeedKg: settlers.seedKg } : {}),
    ...(settlers?.seedKg && seedUntilDay !== undefined && day < seedUntilDay
      ? { reservedSeedUntilDay: seedUntilDay }
      : {}),
    // osivo zakladatelů na víc osevů – neuvolní se do FOUNDERS_STORES.seedKeepYears let
    ...(foundersSeedKg > 0
      ? {
          reservedSeedKg: foundersSeedKg,
          reservedSeedUntilDay: day + Math.ceil(FOUNDERS_STORES.seedKeepYears * DAYS_PER_YEAR),
        }
      : {}),
  };
}

/** Co osadníci přinesli: maso, sýr, luštěniny, jablka, předci a vystěhovalci. */
function settlersCarry(
  settlers: VillageFounding['settlers'],
  food: Settlers['food'] | undefined,
): Pick<
  VillageState,
  'meatKg' | 'slaughterMeatKg' | 'cheeseKg' | 'legumesKg' | 'applesKg' | 'ancestors' | 'emigrants'
> {
  return {
    // maso osadníků je ostatní uzené – jí se hned (celá ves nese i svou zásobu z porážky 1. 11.);
    // nová ves je po převodu dvou zásob uzeného
    meatKg: food ? food.meatKg : 0,
    slaughterMeatKg: settlers?.whole?.slaughterMeatKg ?? 0,
    ...(food && food.cheeseKg > 0 ? { cheeseKg: food.cheeseKg } : {}),
    ...(food && food.legumesKg > 0 ? { legumesKg: food.legumesKg } : {}),
    ...(food && food.applesKg > 0 ? { applesKg: food.applesKg } : {}),
    ...(settlers && settlers.ancestors.length > 0
      ? { ancestors: settlers.ancestors.map((a) => ({ ...a })) }
      : {}),
    ...(settlers && settlers.emigrants.length > 0
      ? { emigrants: settlers.emigrants.map((e) => ({ ...e })) }
      : {}),
  };
}

/**
 * Vozy, voli a koně osadníků (bez ohrady), celé vsi i zásoby a vybavení; kronika nové vsi vedené
 * synem vojvody.
 */
function settlersBelongings(
  state: VillageState,
  settlers: VillageFounding['settlers'],
  people: readonly Person[],
  day: number,
): void {
  if (!settlers) return;
  // vozy a voli osadníků (migration.md – Vůz při odchodu): vozy jsou vsi, voli čekají bez ohrady
  const carts = settlersCarts(settlers);
  if (carts.length > 0) state.carts = carts.map((c) => ({ ...c, id: state.nextId++ }));
  if (settlers.oxen && settlers.oxen.length > 0) {
    state.looseOxen = settlers.oxen.map((ox) => ({ ...ox }));
  }
  // kůň vůdce (celé vsi všichni koně) čeká bez ohrady (lord.md – Dělení vsi, Kůň syna) – nové id
  // ve vsi
  const horses = settlersHorses(settlers);
  if (horses.length > 0) state.looseHorses = horses.map((h) => ({ ...h, id: state.nextId++ }));
  // celá ves přinesla úplně vše (migration.md – Co si vezmou); klády a kámen na hromadu u prvního
  // staveniště – před dřevem první zemnice, ta bere nejdřív celé klády z hromady (forest.md)
  if (settlers.whole) addCarriedStocks(state, settlers.whole.stocks);
  if (settlers.whole?.heaps) addHeaps(state, settlers.whole.heaps);
  // kronika nové vsi vedené synem vojvody: „Vojvodou je Bořivoj“ (lord.md – Dělení vsi, Nová ves)
  if (settlers.lordId !== undefined && state.dynasty?.lordId === settlers.lordId) {
    const lord = people.find((p) => p.id === settlers.lordId);
    state.chronicle.push({
      day,
      kind: 'lord',
      ...(lord?.name === undefined ? {} : { name: lord.name }),
    });
  }
}

/**
 * První pole napřed (stromy na jeho dílech patří poli), pak dřevo první zemnice z vyklízené plochy
 * a nejbližších stromů (forest.md) a ušetřená posvátná místa.
 */
function firstFieldAndWood(state: VillageState, input: VillageFounding): void {
  const { day, dwellingPosition, firstField } = input;
  const dwellingObstacleIds = input.dwellingObstacleIds ?? [];
  const dwellingObstacleCost = input.dwellingObstacleCost ?? 0;
  const clearedTrees = input.dwellingClearedTrees ?? 0;
  // pole napřed – stromy na jeho dílech patří poli (klády po založení), zemnice je nekácí
  if (firstField) addField(state, day, firstField);
  const plan = planDwellingWood(state, 'zemnice', dwellingPosition, day, {
    ...(input.obstacles ? { obstacles: input.obstacles } : {}),
    clearedTrees,
    clearedIds: dwellingObstacleIds,
  });
  const zemnice = state.constructions[0]!;
  zemnice.wood = takeWood(state, plan, dwellingPosition);
  zemnice.cost = dwellingLaborManDays('zemnice', dwellingObstacleCost, plan);
  if (input.dwellingSpared) recordSpared(state, input.dwellingSpared, day);
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
  type: BuildableDwellingType,
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
 * Náhrada domu (demolition.md – Správce; akce správce): domácnost obydlí `householdId` si začne
 * stavět nový dům jinde ve vsi. Stejné jako `startNewDwelling` – kontroly vstupu, dřevo, pozemek,
 * překážky a cena –, jen bez lidí k osídlení: stavba nese `relocates` a `replaces`, po dostavění se
 * do ní domácnost přestěhuje (`moveRelocatedHousehold`) a starý dům se zbourá (`startDemolition`).
 * RangeError, když domácnost neexistuje, nový dům si už staví nebo svůj dům přestavuje
 * (`relocationBlock`), když ves nemá dřevo předem nebo je vstup neplatný. Konvence dne jako
 * u `startNewDwelling`.
 */
export function startReplacement(
  state: VillageState,
  day: number,
  householdId: number,
  type: BuildableDwellingType,
  position: Position,
  obstacleCost: number,
  obstacleIds: readonly number[] = [],
  site: DwellingSiteOptions = {},
): VillageState {
  validateDwellingSite(state, day, position, obstacleCost, obstacleIds, site);
  const block = relocationBlock(state, householdId);
  if (block !== null) throw new RangeError(`Domácnost ${householdId} se teď nestěhuje (${block}).`);
  if (!replacementAffordability(state, type, site.obstacles).affordable) {
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
  // domácnost má jen jednu stavbu nového domu (`relocationBlock`)
  const added = next.constructions.find((c) => c.relocates === householdId);
  if (added) added.replaces = true;
  next.chronicle.push({ day, kind: 'relocation-started', dwellingId: householdId, type });
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
  type: BuildableDwellingType,
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
  const next = cloneState(state);
  payUpfront(next, type);
  recordClearedObstacles(next, obstacleIds, day);
  const wood = takeWood(next, plan, position);
  next.constructions.push({
    id: next.nextId++,
    kind: 'dwelling',
    startedDay: day,
    cost: dwellingLaborManDays(type, obstacleCost, plan),
    done: 0,
    dwellingType: type,
    position,
    ...(site.plot ? { plot: copyPlot(site.plot) } : {}),
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
  houseType?: HouseType,
): VillageState {
  validateActionDay(state, day);
  if (!CRAFTS.includes(craft)) throw new RangeError('Neznámé řemeslo.');
  // mincovna až od roku 950 (gold.md – Pravidla 3) – i bez krajiny
  if (craft === 'minter' && dateOfDayIndex(day).year < MINT.fromYear)
    throw new RangeError(MINT_YEAR);
  if (houseType !== undefined && !isHouseType(houseType)) {
    throw new RangeError('Nadzemní dílna je vypletená nebo roubená.');
  }
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
  const type: DwellingType = houseType ?? CRAFT_BASE[craft];
  const costs = houseType ? workshopCosts(craft, houseType) : BUILD_COSTS;
  if (!buildAffordability(state, craft, site.obstacles, costs).affordable) {
    throw new RangeError('Na stavbu ves nemá suroviny, dřevo nebo lidi k osídlení.');
  }
  const plan = planDwellingWood(state, type, position, day, {
    ...(site.obstacles ? { obstacles: site.obstacles } : {}),
    clearedTrees: site.clearedTrees ?? 0,
    clearedIds: obstacleIds,
    trees: workshopTrees(craft, type),
    ...(site.walk ? { walk: site.walk } : {}),
  });
  if (plan.missing > 0) throw new RangeError('Na stavbu ves nemá dřevo – není z čeho kácet.');
  const next = cloneState(state);
  payUpfront(next, craft, costs);
  recordClearedObstacles(next, obstacleIds, day);
  const wood = takeWood(next, plan, position);
  next.constructions.push({
    id: next.nextId++,
    kind: 'dwelling',
    startedDay: day,
    cost: workshopLaborManDays(craft, obstacleCost, plan, type),
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
  validateGrid(field.grid);
  const joined = new Set(
    fieldsTouching(
      state.parts,
      field.parts.flatMap((p) => (p.cell ? [p.cell] : [])),
      field.grid ? (normalizeGrid(field.grid) ?? undefined) : undefined,
      fieldGrids(state),
    ),
  );
  validateField(
    field,
    state.parts.filter((p) => joined.has(p.fieldId)).reduce((sum, p) => sum + p.areaM2, 0),
  );
  requireAffordable(state, 'field');
  const next = cloneState(state);
  payUpfront(next, 'field');
  addField(next, day, field);
  return next;
}

/** Ověří vstup hřbitova; jinak RangeError (čísla, která nejsou konečná, by stav otrávila). */
function validateCemetery(input: CemeteryInput): void {
  if (input.squares.length === 0) throw new RangeError('Hřbitov musí mít aspoň jeden čtverec.');
  validateGrid(input.grid);
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
  const grid = input.grid ? (normalizeGrid(input.grid) ?? undefined) : undefined;
  const taken = new Set(existing.flatMap((c) => c.squares.map((s) => squareKey(c.grid, s.cell))));
  if (input.squares.some((s) => taken.has(squareKey(grid, s.cell)))) {
    throw new RangeError('Čtverec už patří hřbitovu.');
  }
  const touching = touchingCemeteries(
    existing,
    input.squares.map((s) => s.cell),
    grid,
  );
  if (touching.length > 1) throw new RangeError('Hřbitov smí navazovat jen na jeden hřbitov.');
  const extended = touching[0];
  if (extended && extended.squareSizeM !== input.squareSizeM) {
    throw new RangeError('Rozšíření musí mít stejně velké čtverce jako hřbitov.');
  }
  requireAffordable(state, 'cemetery');
  const next = cloneState(state);
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
      ...(grid ? { grid } : {}),
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
    cost: cemeteryFoundingCost(
      input.squares,
      newFenceSides(
        input.squares.map((s) => s.cell),
        (extended?.squares ?? []).map((s) => s.cell),
      ),
    ),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    cemeteryId,
    ...(target ? { extends: true as const } : {}),
  });
  if (input.sacred) recordSpared(next, input.sacred, day);
  return next;
}

/** Ověří vstup sadu; jinak RangeError (čísla, která nejsou konečná, by stav otrávila). */
function validateOrchard(input: OrchardInput): void {
  if (input.squares.length === 0) throw new RangeError('Sad musí mít aspoň jeden čtverec.');
  validateGrid(input.grid);
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
  const grid = input.grid ? (normalizeGrid(input.grid) ?? undefined) : undefined;
  const taken = new Set(
    villageOrchards(state).flatMap((o) => o.squares.map((s) => squareKey(o.grid, s.cell))),
  );
  if (input.squares.some((s) => taken.has(squareKey(grid, s.cell)))) {
    throw new RangeError('Čtverec už patří sadu.');
  }
  requireAffordable(state, 'orchard');
  const next = cloneState(state);
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
  next.orchards = [...villageOrchards(next), { id: orchardId, squares, ...(grid ? { grid } : {}) }];
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
 * jedna na ves; pokřtěný rod ji nezaloží vůbec. RangeError, když ves nemá duby, už svatyni má nebo je vstup neplatný.
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
  // pokřtěný rod novou modlu ani svatyni nezaloží (stojící a rozestavěné zůstávají)
  if (rodBaptized(state)) throw new RangeError(PAGAN_PLACES_FORBIDDEN);
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
  const next = cloneState(state);
  payUpfront(next, kind);
  recordClearedObstacles(next, obstacleIds, day);
  addLogs(next, logsFromClearedTrees(site.clearedTrees ?? 0), position);
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
    wood: takeWood(next, plan, position),
  });
  // díly polí pod půdorysem se zmenší (fields.md – Pole jako krajina) – po plánu dřeva
  giveWayToBuilding(next, day, site.takenLand ?? [], kind);
  return next;
}

/** Staveniště humna – překážky a les pod půdorysem, pole pod ním a chůze ke stromům. */
export interface ThreshingFloorSiteOptions {
  /** Práce navíc za překážky a les pod půdorysem (`checkThreshingFloorPlacement`); bez údaje 0. */
  obstacleCost?: number;
  /** Překážky na půdorysu – osadníci je odstraní hned při zahájení stavby. */
  obstacleIds?: readonly number[];
  /** Dospělé stromy mezi `obstacleIds` – osadníci je skácí na hromadu klád. */
  clearedTrees?: number;
  /**
   * Kusy dílů polí pod půdorysem (`takenLand` z kontroly) – díly se zmenší, pod prahem zmizí
   * (fields.md – Pole jako krajina).
   */
  takenLand?: readonly TakenLand[];
  /** Chůze ke stromům ke kácení po pevných cestách (roads.md); bez ní vzdušná vzdálenost. */
  walk?: Walk;
}

/**
 * Zahájí stavbu humna (production-chains.md – Humno) – stavba ze společné práce vsi, osadníci
 * nejsou potřeba. Dřevo (HUMNO.trees) jako u ostatních staveb: celé klády z hromady, zbytek
 * vyhradí mezi nejbližšími dospělými stromy a skácí je jako první část práce. Překážky na půdorysu
 * (`site.obstacleIds`, cena v `site.obstacleCost`) osadníci odstraní hned, dospělé stromy z nich
 * dají klády. Humno vznikne hned (`VillageState.threshingFloors`, id = id stavby, `builtDay`
 * null) a zabírá půdorys; po dostavění dostane den. Díly polí pod půdorysem se zmenší
 * (`site.takenLand`) – až po plánu dřeva, ať cena sedí s cenou u kurzoru. `obstacles` = vrstva
 * překážek krajiny (null jen v testech – kácení bez polohy). RangeError, když ves nemá dřevo nebo
 * je vstup neplatný.
 *
 * Konvence dne (jako u `startNewDwelling`): akce se volá na ves dopočítanou do dne `day` a patří
 * na konec toho dne. Den před `state.lastDay` → RangeError.
 */
export function startThreshingFloor(
  state: VillageState,
  day: number,
  position: Position,
  obstacles: ObstacleLayer | null,
  site: ThreshingFloorSiteOptions = {},
): VillageState {
  validateActionDay(state, day);
  validatePosition(position);
  const obstacleCost = site.obstacleCost ?? 0;
  const obstacleIds = site.obstacleIds ?? [];
  validateObstacleCost(obstacleCost);
  validateObstacleIds(obstacleIds);
  validateTrees(site.clearedTrees ?? 0);
  validateTakenLand(site.takenLand ?? []);
  requireAffordable(state, 'threshing-floor', obstacles ?? undefined);
  const plan = planThreshingFloorWood(state, position, day, {
    obstacles,
    clearedTrees: site.clearedTrees ?? 0,
    clearedIds: obstacleIds,
    ...(site.walk ? { walk: site.walk } : {}),
  });
  if (plan.missing > 0) throw new RangeError('Na humno ves nemá dřevo – není z čeho kácet.');
  const next = cloneState(state);
  payUpfront(next, 'threshing-floor');
  recordClearedObstacles(next, obstacleIds, day);
  const wood = takeWood(next, plan, position);
  const id = next.nextId++;
  next.constructions.push({
    id,
    kind: 'threshing-floor',
    startedDay: day,
    cost: threshingFloorLaborManDays(obstacleCost, plan),
    done: 0,
    dwellingType: null,
    position: { ...position },
    dwellingId: null,
    fieldId: null,
    wood,
  });
  (next.threshingFloors ??= []).push({ id, position: { ...position }, builtDay: null });
  // díly polí pod půdorysem se zmenší (fields.md – Pole jako krajina) – po plánu dřeva
  giveWayToBuilding(next, day, site.takenLand ?? [], 'threshing-floor');
  return next;
}

/**
 * Zahájí stavbu ohrady s přístřeškem (oxen.md – Ohrady podle druhu) na čtvercích
 * z `penSquaresFromCells`: čtverce navazující stranou na ohradu téhož druhu (ve stejné mřížce) ji
 * rozšíří (stejné id, stavba rozšíření), jinak vznikne nová ohrada daného druhu. Ohrada má nejvýš
 * MAX_PEN_SQUARES čtverců, souvislých stranou; na dvě ohrady navázat nejde. RangeError, když je
 * den mimo vsi, ves nemá dřevo předem, nebo je vstup neplatný. Konvence dne jako u ostatních
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
  if (!PEN_SPECIES.includes(input.species)) throw new RangeError('Neznámý druh ohrady.');
  if (input.squares.length === 0) throw new RangeError('Ohrada musí mít aspoň jeden čtverec.');
  const keys = new Set<string>();
  for (const q of input.squares) {
    if (!Number.isInteger(q.cell.x) || !Number.isInteger(q.cell.y)) {
      throw new RangeError('Políčko ohrady musí mít celočíselné souřadnice.');
    }
    if (!Number.isFinite(q.x) || !Number.isFinite(q.z)) {
      throw new RangeError('Střed ohrady musí mít konečné souřadnice.');
    }
    validateObstacleCost(q.obstacleCost);
    validateObstacleIds(q.obstacleIds);
    validateTrees(q.clearedTrees);
    keys.add(`${q.cell.x},${q.cell.y}`);
  }
  if (keys.size !== input.squares.length) throw new RangeError('Čtverce ohrady se opakují.');
  validateTakenLand(input.takenLand ?? []);
  validateGrid(input.grid);
  const grid = input.grid ? (normalizeGrid(input.grid) ?? undefined) : undefined;
  const pens = state.pens ?? [];
  const taken = new Set(pens.flatMap((p) => penSquares(p).map((q) => squareKey(p.grid, q.cell))));
  if (input.squares.some((q) => taken.has(squareKey(grid, q.cell)))) {
    throw new RangeError('Na čtverci už ohrada stojí.');
  }
  const cells = input.squares.map((q) => q.cell);
  const touching = touchingPens(pens, cells, input.species, grid);
  if (touching.length > 1) throw new RangeError('Ohrada smí navazovat jen na jednu ohradu.');
  const extended = touching[0];
  const all = [...(extended ? penSquares(extended).map((q) => q.cell) : []), ...cells];
  if (all.length > MAX_PEN_SQUARES) {
    throw new RangeError(`Ohrada může mít nejvýš ${MAX_PEN_SQUARES} čtverce.`);
  }
  if (!connectedCells(all)) throw new RangeError('Čtverce ohrady musí navazovat stranou.');
  requireAffordable(state, 'pen', obstacles ?? undefined);
  // koně nové ohrady koní jsou součást stavby – platí se předem z přebytku vsi (horses.md – Koně se
  // stavbou ohrady); rozšíření koně nepřiveze
  const payment =
    input.species === 'horse' && !extended
      ? horsePenPayment(state, day, craftCoverage(state, day))
      : null;
  if (input.species === 'horse' && !extended && !payment) {
    throw new RangeError(HORSE_PEN_NO_SURPLUS);
  }
  const next = startPen(
    state,
    day,
    { ...input, ...(grid ? { grid } : {}) },
    obstacles,
    walk,
    extended?.id,
  );
  if (payment) {
    payHorsePen(next, payment, day);
    next.constructions[next.constructions.length - 1]!.horsePenPaid = payment;
  }
  // čtverce pole pod ohradou z pole zmizí (fields.md – Pole jako krajina)
  giveWayToBuilding(next, day, input.takenLand ?? [], 'pen');
  return next;
}
