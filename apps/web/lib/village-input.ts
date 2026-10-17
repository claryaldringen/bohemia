import type { DwellingType, Position, TileCell } from '@bohemia/game';

// Ověření tvaru vstupu server actions vsi – data od klienta jsou nedůvěryhodná. Herní pravidla
// (kde smí stavba stát) ověřují až use-casy.

/** Nejvíc čtverců pole, které server vůbec přijme (pravidla povolí méně – MAX_FIELD_CELLS). */
const MAX_RAW_FIELD_CELLS = 5000;
const MAX_RAW_NAME_LENGTH = 200;
const DWELLING_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];

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
): { type: DwellingType; position: Position } | null {
  if (!isRecord(value)) return null;
  const type = parseDwellingType(value.type);
  const position = parsePosition(value.position);
  return type !== null && position !== null ? { type, position } : null;
}

/** Vstup založení pole `{ cells }`, jinak null. */
export function parsePlaceFieldInput(value: unknown): { cells: TileCell[] } | null {
  if (!isRecord(value)) return null;
  const cells = parseCells(value.cells);
  return cells !== null ? { cells } : null;
}
