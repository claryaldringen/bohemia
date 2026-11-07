import type { EscheatPart } from '@bohemia/game';

// Kontrola vstupu akcí odúmrti z prohlížeče (tvar, ne pravidla – ta hlídá jádro).

const MAX_ITEMS = 200;

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_ITEMS &&
  value.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 64);

/** `{ escheatId, parts: [{ toHouseId, villageIds, vassalIds }] }`, jinak null. */
export function parseProposeEscheatInput(
  input: unknown,
): { escheatId: string; parts: EscheatPart[] } | null {
  if (typeof input !== 'object' || input === null) return null;
  const { escheatId, parts } = input as Record<string, unknown>;
  if (typeof escheatId !== 'string' || escheatId.length === 0) return null;
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > MAX_ITEMS) return null;
  const out: EscheatPart[] = [];
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) return null;
    const { toHouseId, villageIds, vassalIds } = part as Record<string, unknown>;
    if (typeof toHouseId !== 'string' || toHouseId.length === 0) return null;
    if (!isIdList(villageIds) || !isIdList(vassalIds)) return null;
    out.push({ toHouseId, villageIds: [...villageIds], vassalIds: [...vassalIds] });
  }
  return { escheatId, parts: out };
}

/** `{ escheatId, version }`, jinak null. */
export function parseConsentEscheatInput(
  input: unknown,
): { escheatId: string; version: number } | null {
  if (typeof input !== 'object' || input === null) return null;
  const { escheatId, version } = input as Record<string, unknown>;
  if (typeof escheatId !== 'string' || escheatId.length === 0) return null;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return null;
  return { escheatId, version };
}
