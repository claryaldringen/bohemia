import {
  PLOT_VARIANTS,
  type DwellingPlot,
  type DwellingType,
  type Position,
  type SacredBuildingKind,
  type TileCell,
  type TimeSkip,
} from '@bohemia/game';

// Ověření tvaru vstupu server actions vsi – data od klienta jsou nedůvěryhodná. Herní pravidla
// (kde smí stavba stát) ověřují až use-casy.

/** Nejvíc čtverců pole, které server vůbec přijme (pravidla povolí méně – MAX_FIELD_CELLS). */
const MAX_RAW_FIELD_CELLS = 5000;
const MAX_RAW_NAME_LENGTH = 200;
const DWELLING_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
const SACRED_KINDS: readonly SacredBuildingKind[] = ['idol', 'shrine'];
const TIME_SKIPS: readonly TimeSkip[] = ['month', 'year'];

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

export function parseDwellingType(value: unknown): DwellingType | null {
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
): { type: DwellingType; position: Position; plot?: DwellingPlot } | null {
  if (!isRecord(value)) return null;
  const type = parseDwellingType(value.type);
  const position = parsePosition(value.position);
  if (type === null || position === null) return null;
  if (value.plot === undefined) return { type, position };
  const plot = parsePlot(value.plot);
  return plot !== null ? { type, position, plot } : null;
}

/** Pozemek `{ cell: { x, y }, variant }` – celočíselné políčko a známá varianta, jinak null. */
export function parsePlot(value: unknown): DwellingPlot | null {
  if (!isRecord(value) || !isRecord(value.cell)) return null;
  const { x, y } = value.cell;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const variant = PLOT_VARIANTS.find((v) => v === value.variant);
  return variant ? { cell: { x: x as number, y: y as number }, variant } : null;
}

/** Vstup založení pole `{ cells }`, jinak null. */
export function parsePlaceFieldInput(value: unknown): { cells: TileCell[] } | null {
  if (!isRecord(value)) return null;
  const cells = parseCells(value.cells);
  return cells !== null ? { cells } : null;
}

/** Vstup založení pohřebiště `{ cells }` (čtverce jako u pole), jinak null. */
export function parsePlaceCemeteryInput(value: unknown): { cells: TileCell[] } | null {
  return parsePlaceFieldInput(value);
}

/** Vstup založení sadu `{ cells }` (čtverce jako u pole), jinak null. */
export function parsePlaceOrchardInput(value: unknown): { cells: TileCell[] } | null {
  return parsePlaceFieldInput(value);
}

/**
 * Vstup stavby ohrady `{ cells }` – jeden čtverec (staví se jako pole po čtvercích), jinak null.
 * Víc čtverců odmítne až kontrola umístění s důvodem pro hráče.
 */
export function parsePlacePenInput(value: unknown): { cells: TileCell[] } | null {
  const input = parsePlaceFieldInput(value);
  return input !== null && input.cells.length > 0 ? input : null;
}

/** Vstup výcviku spřežení `{ penId }` – kladné celé číslo, jinak null. */
export function parseTrainTeamInput(value: unknown): { penId: number } | null {
  if (!isRecord(value)) return null;
  const { penId } = value;
  return Number.isInteger(penId) && (penId as number) > 0 ? { penId: penId as number } : null;
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

/** Vstup přeskočení času (vývojový režim) `{ skip: 'month' | 'year' }`, jinak null. */
export function parseSkipTimeInput(value: unknown): { skip: TimeSkip } | null {
  if (!isRecord(value)) return null;
  const skip = TIME_SKIPS.find((s) => s === value.skip);
  return skip === undefined ? null : { skip };
}
