import {
  CRAFTS,
  DIRECTIONS,
  PLOT_VARIANTS,
  TRADE_GOOD_VALUES,
  type Craft,
  type Direction8,
  type TradeGood,
  type TradeGoods,
  type TradePeople,
  type DwellingPlot,
  type LeaveDestination,
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

/** Vstup založení vsi `{ name, dwelling, fieldCells? }` (bez čtverců = bez pole), jinak null. */
export function parseFoundVillageInput(
  value: unknown,
): { name: string; dwelling: Position; fieldCells: TileCell[] } | null {
  if (!isRecord(value)) return null;
  const name = parseName(value.name);
  const dwelling = parsePosition(value.dwelling);
  const fieldCells = value.fieldCells === undefined ? [] : parseCells(value.fieldCells);
  return name !== null && dwelling !== null && fieldCells !== null
    ? { name, dwelling, fieldCells }
    : null;
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
 * Vstup stavby ohrady `{ cells, grid? }` – jeden čtverec (staví se jako pole po čtvercích, i
 * v natočené mřížce), jinak null. Víc čtverců odmítne až kontrola umístění s důvodem pro hráče.
 */
export function parsePlacePenInput(
  value: unknown,
): { cells: TileCell[]; grid?: SquareGrid } | null {
  const input = parsePlaceFieldInput(value);
  return input !== null && input.cells.length > 0 ? input : null;
}

/** Vstup vylepšení pevné cesty `{ roadId, upgrade }` (roads.md), jinak null. */
export function parseUpgradeRoadInput(
  value: unknown,
): { roadId: number; upgrade: 'improved' | 'causeway' } | null {
  if (!isRecord(value)) return null;
  const { roadId, upgrade } = value;
  if (!Number.isInteger(roadId) || (roadId as number) <= 0) return null;
  if (upgrade !== 'improved' && upgrade !== 'causeway') return null;
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

/** Vstup zrušení přestěhování `{ constructionId }`, jinak null. */
export function parseCancelRelocationInput(value: unknown): { constructionId: number } | null {
  if (!isRecord(value)) return null;
  const constructionId = parsePositiveInt(value.constructionId);
  return constructionId !== null ? { constructionId } : null;
}

/** Nejvíc obydlí v jednom odchodu, které server vůbec přijme. */
const MAX_LEAVING_DWELLINGS = 200;

/**
 * Vstup odchodu do nové vsi (migration.md) `{ dwellingIds, destination }` – `destination` je
 * `{ kind: 'here', dwelling: { x, z, rotation } }` (první zemnice na téže mapě), nebo
 * `{ kind: 'map', direction }` (nová mapa ve směru); jinak null.
 */
export function parseLeaveVillageInput(
  value: unknown,
): { dwellingIds: number[]; destination: LeaveDestination } | null {
  if (!isRecord(value) || !Array.isArray(value.dwellingIds)) return null;
  if (value.dwellingIds.length === 0 || value.dwellingIds.length > MAX_LEAVING_DWELLINGS) {
    return null;
  }
  const dwellingIds: number[] = [];
  for (const id of value.dwellingIds) {
    const parsed = parsePositiveInt(id);
    if (parsed === null) return null;
    dwellingIds.push(parsed);
  }
  const destination = value.destination;
  if (!isRecord(destination)) return null;
  if (destination.kind === 'here') {
    const dwelling = parsePosition(destination.dwelling);
    return dwelling ? { dwellingIds, destination: { kind: 'here', dwelling } } : null;
  }
  if (destination.kind === 'map') {
    const direction = parseDirection(destination.direction);
    return direction ? { dwellingIds, destination: { kind: 'map', direction } } : null;
  }
  return null;
}

/** Vstup založení vsi po příjezdu na novou mapu `{ dwelling: { x, z, rotation } }`, jinak null. */
export function parseSettleJourneyInput(value: unknown): { dwelling: Position } | null {
  if (!isRecord(value)) return null;
  const dwelling = parsePosition(value.dwelling);
  return dwelling ? { dwelling } : null;
}
