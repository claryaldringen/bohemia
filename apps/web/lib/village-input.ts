import {
  BAD_YEAR_KINDS,
  FORCED_DISASTER_KINDS,
  type BadYearKind,
  type ForcedDisasterKind,
  CRAFTS,
  DIRECTIONS,
  PEN_SPECIES,
  PLOT_VARIANTS,
  TRADE_GOOD_VALUES,
  type Craft,
  type Direction8,
  type FortKind,
  type FortTop,
  type TradeGood,
  type TradeGoods,
  type TradePeople,
  type DwellingPlot,
  type LeaveDestination,
  type PenSpecies,
  type BuildableDwellingType,
  type Position,
  type SacredBuildingKind,
  type SquareGrid,
  type TileCell,
  type TimeSkip,
} from '@bohemia/game';

// Ověření tvaru vstupu server actions vsi – data od klienta jsou nedůvěryhodná. Herní pravidla
// (kde smí stavba stát) ověřují až use-casy.

/** Nejvíc čtverců pole, které server vůbec přijme (pravidla povolí méně – MAX_FIELD_CELLS). */
const MAX_RAW_FIELD_CELLS = 5000;
const MAX_RAW_NAME_LENGTH = 200;
const DWELLING_TYPES: readonly BuildableDwellingType[] = ['zemnice', 'polozemnice'];
const SACRED_KINDS: readonly SacredBuildingKind[] = ['idol', 'shrine'];
const TIME_SKIPS: readonly TimeSkip[] = ['month', 'year', 'decade'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Poloha `{ x, z, rotation }` s konečnými čísly, jinak null. */
export function parsePosition(value: unknown): Position | null {
  if (!isRecord(value)) return null;
  const { x, z, rotation } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(z) || !isFiniteNumber(rotation)) return null;
  return { x, z, rotation };
}

export function parseDwellingType(value: unknown): BuildableDwellingType | null {
  return DWELLING_TYPES.find((type) => type === value) ?? null;
}

/** Čtverce pole jako pole `{ x, y }` s konečnými čísly (přebytečné klíče zahodí), jinak null. */
export function parseCells(value: unknown): TileCell[] | null {
  if (!Array.isArray(value) || value.length > MAX_RAW_FIELD_CELLS) return null;
  const cells: TileCell[] = [];
  for (const cell of value) {
    if (!isRecord(cell)) return null;
    const { x, y } = cell;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
    cells.push({ x, y });
  }
  return cells;
}

export function parseName(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_RAW_NAME_LENGTH ? value : null;
}

/**
 * Vstup založení vsi `{ name, dwelling, fieldCells?, lordName? }` (bez čtverců = bez pole, bez
 * `lordName` vojvoda na jméno čeká – lord.md, Zakladatelé), jinak null.
 */
export function parseFoundVillageInput(
  value: unknown,
): { name: string; dwelling: Position; fieldCells: TileCell[]; lordName?: string } | null {
  if (!isRecord(value)) return null;
  const name = parseName(value.name);
  const dwelling = parsePosition(value.dwelling);
  const fieldCells = value.fieldCells === undefined ? [] : parseCells(value.fieldCells);
  const lordName = value.lordName === undefined ? undefined : parseName(value.lordName);
  if (name === null || dwelling === null || fieldCells === null || lordName === null) return null;
  return lordName === undefined
    ? { name, dwelling, fieldCells }
    : { name, dwelling, fieldCells, lordName };
}

/** Vstup přejmenování vsi `{ name }`, jinak null. */
export function parseRenameVillageInput(value: unknown): { name: string } | null {
  if (!isRecord(value)) return null;
  const name = parseName(value.name);
  return name !== null ? { name } : null;
}

/** Vstup stavby obydlí `{ type, position }`, jinak null. */
export function parsePlaceDwellingInput(
  value: unknown,
): { type: BuildableDwellingType; position: Position; plot?: DwellingPlot } | null {
  if (!isRecord(value)) return null;
  const type = parseDwellingType(value.type);
  const position = parsePosition(value.position);
  if (type === null || position === null) return null;
  if (value.plot === undefined) return { type, position };
  const plot = parsePlot(value.plot);
  return plot !== null ? { type, position, plot } : null;
}

/**
 * Pozemek `{ cell: { x, y }, variant, square? }` – celočíselné políčko, známá varianta a u
 * natočeného pozemku střed a natočení (konečná čísla – násobek 15° ověří use-case), jinak null.
 */
export function parsePlot(value: unknown): DwellingPlot | null {
  if (!isRecord(value) || !isRecord(value.cell)) return null;
  const { x, y } = value.cell;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const variant = PLOT_VARIANTS.find((v) => v === value.variant);
  if (!variant) return null;
  const plot: DwellingPlot = { cell: { x: x as number, y: y as number }, variant };
  if (value.square === undefined) return plot;
  const square = parsePosition(value.square);
  return square ? { ...plot, square } : null;
}

/**
 * Natočená mřížka stavby po čtvercích `{ x, z, rotation }` (fields.md – Natočené stavby) –
 * konečná čísla (natočení po 15° ověří use-case); chybí = mřížka krajiny (undefined), jiný tvar
 * null.
 */
export function parseGrid(value: unknown): SquareGrid | undefined | null {
  if (value === undefined) return undefined;
  return parsePosition(value);
}

/** Vstup založení pole `{ cells, grid? }`, jinak null. */
export function parsePlaceFieldInput(
  value: unknown,
): { cells: TileCell[]; grid?: SquareGrid } | null {
  if (!isRecord(value)) return null;
  const cells = parseCells(value.cells);
  const grid = parseGrid(value.grid);
  if (cells === null || grid === null) return null;
  return grid ? { cells, grid } : { cells };
}

/** Vstup založení pohřebiště `{ cells, grid? }` (čtverce jako u pole), jinak null. */
export function parsePlaceCemeteryInput(
  value: unknown,
): { cells: TileCell[]; grid?: SquareGrid } | null {
  return parsePlaceFieldInput(value);
}

/** Vstup založení sadu `{ cells, grid? }` (čtverce jako u pole), jinak null. */
export function parsePlaceOrchardInput(
  value: unknown,
): { cells: TileCell[]; grid?: SquareGrid } | null {
  return parsePlaceFieldInput(value);
}

/**
 * Vstup stavby ohrady `{ cells, species, grid? }` – čtverce po políčkách jako hřbitov (i v natočené
 * mřížce) a druh zvířat (oxen.md – Ohrady podle druhu), jinak null. Víc než 4 čtverce odmítne až
 * kontrola umístění s důvodem pro hráče.
 */
export function parsePlacePenInput(
  value: unknown,
): { cells: TileCell[]; species: PenSpecies; grid?: SquareGrid } | null {
  const input = parsePlaceFieldInput(value);
  if (input === null || input.cells.length === 0 || !isRecord(value)) return null;
  // druh ohrady (oxen.md – Ohrady podle druhu); bez údaje skot jako dřívější jediná ohrada
  const species = value.species === undefined ? 'cattle' : value.species;
  const known = PEN_SPECIES.find((s) => s === species);
  return known ? { ...input, species: known } : null;
}

const FORT_KINDS: readonly FortKind[] = ['fence', 'palisade', 'rampart'];
const FORT_TOPS: readonly FortTop[] = ['fence', 'palisade'];

/**
 * Vstup stavby opevnění `{ cells, kind, grid? }` – čtverce plochy jako u pole (i v natočené
 * mřížce) a druh (fortifications.md – Druhy), jinak null. Tvar plochy (souvislost, 2 × 2) odmítne
 * až kontrola umístění s důvodem pro hráče.
 */
export function parsePlaceFortificationInput(
  value: unknown,
): { cells: TileCell[]; kind: FortKind; grid?: SquareGrid } | null {
  const input = parsePlaceFieldInput(value);
  if (input === null || input.cells.length === 0 || !isRecord(value)) return null;
  const kind = FORT_KINDS.find((k) => k === value.kind);
  return kind ? { ...input, kind } : null;
}

/**
 * Vstup vylepšení opevnění `{ fortificationId, work, top? }` – plot na palisádu (`upgrade`), nebo
 * plot či palisáda na val (`top`), jinak null.
 */
export function parseUpgradeFortificationInput(
  value: unknown,
): { fortificationId: number; work: 'upgrade' | 'top'; top?: FortTop } | null {
  if (!isRecord(value)) return null;
  const fortificationId = parsePositiveInt(value.fortificationId);
  if (fortificationId === null) return null;
  if (value.work === 'upgrade') return { fortificationId, work: 'upgrade' };
  if (value.work !== 'top') return null;
  if (value.top === undefined) return { fortificationId, work: 'top' };
  const top = FORT_TOPS.find((t) => t === value.top);
  return top ? { fortificationId, work: 'top', top } : null;
}

/** Vstup brány opevnění `{ fortificationId, position }` – klik na obvod ve světě, jinak null. */
export function parseAddFortificationGateInput(
  value: unknown,
): { fortificationId: number; position: { x: number; z: number } } | null {
  if (!isRecord(value) || !isRecord(value.position)) return null;
  const fortificationId = parsePositiveInt(value.fortificationId);
  const { x, z } = value.position;
  if (fortificationId === null || !isFiniteNumber(x) || !isFiniteNumber(z)) return null;
  return { fortificationId, position: { x, z } };
}

/** Vstup vylepšení pevné cesty `{ roadId, upgrade }` (roads.md), jinak null. */
export function parseUpgradeRoadInput(
  value: unknown,
): { roadId: number; upgrade: 'improved' } | null {
  if (!isRecord(value)) return null;
  const { roadId, upgrade } = value;
  if (!Number.isInteger(roadId) || (roadId as number) <= 0) return null;
  if (upgrade !== 'improved') return null;
  return { roadId: roadId as number, upgrade };
}

/** Nejvíc zboží jednoho druhu, které server v nabídce obchodu vůbec přijme. */
const MAX_RAW_TRADE_AMOUNT = 1_000_000;

/** Směr stezky (trade.md – 8 směrů), jinak null. */
export function parseDirection(value: unknown): Direction8 | null {
  return DIRECTIONS.find((d) => d === value) ?? null;
}

/** Vstup stavby zemské stezky `{ direction }` (trade.md), jinak null. */
export function parseBuildTrailInput(value: unknown): { direction: Direction8 } | null {
  if (!isRecord(value)) return null;
  const direction = parseDirection(value.direction);
  return direction ? { direction } : null;
}

/** Zboží `{ druh: množství }` – známé druhy, celá nezáporná čísla, jinak null. */
export function parseTradeGoods(value: unknown): TradeGoods | null {
  if (!isRecord(value)) return null;
  const goods: TradeGoods = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!(key in TRADE_GOOD_VALUES)) return null;
    if (!Number.isInteger(amount) || (amount as number) < 0) return null;
    if ((amount as number) > MAX_RAW_TRADE_AMOUNT) return null;
    if ((amount as number) > 0) goods[key as TradeGood] = amount as number;
  }
  return goods;
}

/** Nejvíc rodin či dospělých jednoho druhu, které server ve výměně lidí vůbec přijme. */
const MAX_RAW_TRADE_PEOPLE = 100;

/**
 * Lidé ve výměně `{ families, men, women }` (trade.md – Výměna lidí – muži a ženy zvlášť) – celá
 * nezáporná čísla, chybějící druh 0; chybí celé = nikdo (undefined), jinak null.
 */
export function parseTradePeople(value: unknown): TradePeople | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const count = (n: unknown): number | null =>
    n === undefined
      ? 0
      : Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_RAW_TRADE_PEOPLE
        ? (n as number)
        : null;
  const families = count(value.families);
  const men = count(value.men);
  const women = count(value.women);
  return families === null || men === null || women === null ? null : { families, men, women };
}

/**
 * Vstup výpravy k sousedovi `{ direction, give, get, givePeople?, getPeople? }` (trade.md –
 * Obchod, Výměna lidí), jinak null.
 */
export function parseSendExpeditionInput(value: unknown): {
  direction: Direction8;
  give: TradeGoods;
  get: TradeGoods;
  givePeople?: TradePeople;
  getPeople?: TradePeople;
} | null {
  if (!isRecord(value)) return null;
  const direction = parseDirection(value.direction);
  const give = parseTradeGoods(value.give);
  const get = parseTradeGoods(value.get);
  const givePeople = parseTradePeople(value.givePeople);
  const getPeople = parseTradePeople(value.getPeople);
  if (!direction || !give || !get || givePeople === null || getPeople === null) return null;
  return {
    direction,
    give,
    get,
    ...(givePeople ? { givePeople } : {}),
    ...(getPeople ? { getPeople } : {}),
  };
}

/** Vstup výsadby jabloní podél pevné cesty `{ roadId }` (roads.md), jinak null. */
export function parsePlantRoadApplesInput(value: unknown): { roadId: number } | null {
  if (!isRecord(value)) return null;
  const { roadId } = value;
  return Number.isInteger(roadId) && (roadId as number) > 0 ? { roadId: roadId as number } : null;
}

/** Vstup stavby modly nebo svatyně `{ kind, position }`, jinak null. */
export function parsePlaceSacredInput(
  value: unknown,
): { kind: SacredBuildingKind; position: Position } | null {
  if (!isRecord(value)) return null;
  const kind = SACRED_KINDS.find((k) => k === value.kind) ?? null;
  const position = parsePosition(value.position);
  return kind !== null && position !== null ? { kind, position } : null;
}

/** Vstup stavby humna `{ position }` (production-chains.md – Humno), jinak null. */
export function parsePlaceThreshingFloorInput(value: unknown): { position: Position } | null {
  if (!isRecord(value)) return null;
  const position = parsePosition(value.position);
  return position !== null ? { position } : null;
}

/** Vstup stavby řemeslné dílny `{ craft, position }`, jinak null. */
export function parsePlaceWorkshopInput(
  value: unknown,
): { craft: Craft; position: Position } | null {
  if (!isRecord(value)) return null;
  const craft = CRAFTS.find((c) => c === value.craft) ?? null;
  const position = parsePosition(value.position);
  return craft !== null && position !== null ? { craft, position } : null;
}

/**
 * Vstup restartu hry: bez vstupu (obrazovka porážky) = jen po konci hry, `{ abandon: true }`
 * (nabídka hry) = i se živou vsí. Jiný tvar → null.
 */
export function parseRestartGameInput(value: unknown): { abandon: boolean } | null {
  if (value === undefined) return { abandon: false };
  if (!isRecord(value)) return null;
  if (value.abandon === undefined) return { abandon: false };
  return typeof value.abandon === 'boolean' ? { abandon: value.abandon } : null;
}

/** Vstup přeskočení času (vývojový režim) `{ skip: 'month' | 'year' | 'decade' }`, jinak null. */
export function parseSkipTimeInput(value: unknown): { skip: TimeSkip } | null {
  if (!isRecord(value)) return null;
  const skip = TIME_SKIPS.find((s) => s === value.skip);
  return skip === undefined ? null : { skip };
}

/**
 * Vstup vynucení pohromy (vývojový režim – disasters.md, plán P10): `{ kind: 'year', value: druh
 * zlého roku }` nebo `{ kind: 'disaster', value: 'hail' | 'flood' | 'fire' | 'tornado' }`, jinak null.
 */
export function parseDevDisasterInput(
  value: unknown,
): { kind: 'year'; value: BadYearKind } | { kind: 'disaster'; value: ForcedDisasterKind } | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'year') {
    const year = BAD_YEAR_KINDS.find((k) => k === value.value);
    return year === undefined ? null : { kind: 'year', value: year };
  }
  if (value.kind === 'disaster') {
    const disaster = FORCED_DISASTER_KINDS.find((k) => k === value.value);
    return disaster === undefined ? null : { kind: 'disaster', value: disaster };
  }
  return null;
}

/** Id vsi – UUID z databáze (jiný řetězec do dotazu vůbec nepustíme), jinak null. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseVillageId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * Id vsi, ve které hráč jedná – každý vstup akce nad vsí ho nese jako `villageId` (migration.md –
 * Víc vsí jednoho hráče); chybí nebo je neplatné → null.
 */
export function villageIdOf(input: unknown): string | null {
  return isRecord(input) ? parseVillageId(input.villageId) : null;
}

/** Kladné celé číslo (id obydlí, stavby), jinak null. */
function parsePositiveInt(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

/**
 * Vstup přestěhování domácnosti `{ dwellingId, type, position, plot? }` – nový dům jako stavba
 * obydlí (migration.md), jinak null.
 */
export function parseRelocateHouseholdInput(value: unknown): {
  dwellingId: number;
  type: BuildableDwellingType;
  position: Position;
  plot?: DwellingPlot;
} | null {
  if (!isRecord(value)) return null;
  const dwellingId = parsePositiveInt(value.dwellingId);
  const dwelling = parsePlaceDwellingInput(value);
  return dwellingId !== null && dwelling !== null ? { dwellingId, ...dwelling } : null;
}

/**
 * Vstup pojmenování muže rodu `{ personId, name }` (lord.md – Jména; jestli jméno smí být, ověří
 * use-case), jinak null.
 */
export function parseNameLineManInput(value: unknown): { personId: number; name: string } | null {
  if (!isRecord(value)) return null;
  const personId = parsePositiveInt(value.personId);
  const name = parseName(value.name);
  return personId !== null && name !== null ? { personId, name } : null;
}

/** Vstup přepínače správce `{ on }` (steward.md), jinak null. */
export function parseSetStewardInput(value: unknown): { on: boolean } | null {
  if (!isRecord(value)) return null;
  return typeof value.on === 'boolean' ? { on: value.on } : null;
}

/** Vstup vyhlášení lovu navíc `{}` (jen `villageId`, který čte `villageAction`), jinak null. */
export function parseDeclareHuntInput(value: unknown): Record<string, never> | null {
  return isRecord(value) ? {} : null;
}

/** Vstup zrušení rozestavěné stavby `{ constructionId }`, jinak null. */
export function parseCancelConstructionInput(value: unknown): { constructionId: number } | null {
  if (!isRecord(value)) return null;
  const constructionId = parsePositiveInt(value.constructionId);
  return constructionId !== null ? { constructionId } : null;
}

/** Nejvíc obydlí v jednom odchodu, které server vůbec přijme. */
const MAX_LEAVING_DWELLINGS = 200;

/** Cíl odchodu: dvoje použití – vybraná obydlí a syn vojvody. */
export type LeaveVillageInput =
  | { dwellingIds: number[]; destination: LeaveDestination }
  | { sonId: number; destination: LeaveDestination };

/**
 * Cíl odchodu `{ kind: 'map', direction }`; jinak null – i dřívější `{ kind: 'here' }` (jedna ves,
 * jedna mapa – migration.md).
 */
function parseLeaveDestination(destination: unknown): LeaveDestination | null {
  if (!isRecord(destination)) return null;
  if (destination.kind === 'map') {
    const direction = parseDirection(destination.direction);
    return direction ? { kind: 'map', direction } : null;
  }
  return null;
}

/**
 * Vstup odchodu do nové vsi (migration.md) `{ dwellingIds, destination }`, nebo odchodu syna
 * vojvody s poměrnou částí vsi (lord.md – Dělení vsi) `{ sonId, destination }` – `destination` je
 * `{ kind: 'map', direction }` (nová mapa ve směru); jinak null.
 */
export function parseLeaveVillageInput(value: unknown): LeaveVillageInput | null {
  if (!isRecord(value)) return null;
  const destination = parseLeaveDestination(value.destination);
  if (destination === null) return null;
  if (value.sonId !== undefined) {
    if (value.dwellingIds !== undefined) return null;
    const sonId = parsePositiveInt(value.sonId);
    return sonId === null ? null : { sonId, destination };
  }
  if (!Array.isArray(value.dwellingIds)) return null;
  if (value.dwellingIds.length === 0 || value.dwellingIds.length > MAX_LEAVING_DWELLINGS) {
    return null;
  }
  const dwellingIds: number[] = [];
  for (const id of value.dwellingIds) {
    const parsed = parsePositiveInt(id);
    if (parsed === null) return null;
    dwellingIds.push(parsed);
  }
  return { dwellingIds, destination };
}

/** Vstup volby odchodu mladšího syna po pohřbu `{ direction, sonName? }` (seniorate.md), jinak null. */
export function parseChoosePlayerDepartureInput(
  value: unknown,
): { direction: Direction8; sonName?: string } | null {
  if (!isRecord(value)) return null;
  const direction = parseDirection(value.direction);
  if (direction === null) return null;
  if (value.sonName === undefined) return { direction };
  const sonName = parseName(value.sonName);
  return sonName === null ? null : { direction, sonName };
}

/** Vstup založení vsi po příjezdu na novou mapu `{ dwelling: { x, z, rotation } }`, jinak null. */
export function parseSettleJourneyInput(value: unknown): { dwelling: Position } | null {
  if (!isRecord(value)) return null;
  const dwelling = parsePosition(value.dwelling);
  return dwelling ? { dwelling } : null;
}
