import type { DwellingType, Position } from '@bohemia/game';

// Ověření tvaru vstupu server actions vsi – data od klienta jsou nedůvěryhodná. Herní pravidla
// (kde smí stavba stát) ověřují až use-casy.

/** Nejvíc bodů obrysu, které server vůbec přijme (pravidla povolí méně – MAX_OUTLINE_POINTS). */
const MAX_RAW_OUTLINE_POINTS = 1000;
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

/** Obrys jako pole dvojic `[x, z]` s konečnými čísly, jinak null. */
export function parseOutline(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length > MAX_RAW_OUTLINE_POINTS) return null;
  const outline: [number, number][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const [x, z] = point as unknown[];
    if (!isFiniteNumber(x) || !isFiniteNumber(z)) return null;
    outline.push([x, z]);
  }
  return outline;
}

export function parseName(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_RAW_NAME_LENGTH ? value : null;
}

/** Vstup založení vsi `{ name, dwelling, fieldOutline }`, jinak null. */
export function parseFoundVillageInput(
  value: unknown,
): { name: string; dwelling: Position; fieldOutline: [number, number][] } | null {
  if (!isRecord(value)) return null;
  const name = parseName(value.name);
  const dwelling = parsePosition(value.dwelling);
  const fieldOutline = parseOutline(value.fieldOutline);
  return name !== null && dwelling !== null && fieldOutline !== null
    ? { name, dwelling, fieldOutline }
    : null;
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

/** Vstup založení pole `{ outline }`, jinak null. */
export function parsePlaceFieldInput(value: unknown): { outline: [number, number][] } | null {
  if (!isRecord(value)) return null;
  const outline = parseOutline(value.outline);
  return outline !== null ? { outline } : null;
}
