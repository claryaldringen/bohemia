import type { ExpeditionCommand } from '@bohemia/game';
import { parseJourneyOrder } from './journey-input';
import { villageIdOf } from './village-input';

// Vstup server action výpravy (expeditions.md – Výběr a skupina; plán 2026-11-14 – Úloha 7) – jen
// tvar. Co příkaz znamená (způsobilost lidí, dosažitelnost, válka, kůň), ověřují use-casy
// `commandParty` a `musterExpedition`.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Nejvíc lidí v jednom výběru – jako `MAX_PEOPLE` use-casu (ochrana vstupu). */
const MAX_PEOPLE = 200;

/** Id lidí: 1–200 nezáporných celých čísel bez duplicit. */
function parsePeople(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PEOPLE) return null;
  const ids: number[] = [];
  for (const id of value) {
    if (!Number.isSafeInteger(id) || (id as number) < 0) return null;
    ids.push(id as number);
  }
  return new Set(ids).size === ids.length ? ids : null;
}

/** Příkaz: Jdi sem (i s mapou `cell`), Přes okraj, Domů, Osedlat, Sesednout; jinak null. */
function parseCommand(value: unknown): ExpeditionCommand | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'saddle' || value.kind === 'dismount') {
    return Object.keys(value).length === 1 ? { kind: value.kind } : null;
  }
  if (value.kind === 'go' && 'cell' in value) {
    const { cell, ...rest } = value;
    const order = parseJourneyOrder(rest);
    if (order?.kind !== 'go' || !isRecord(cell) || Object.keys(cell).length !== 2) return null;
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) return null;
    return {
      kind: 'order',
      order: { ...order, cell: { x: cell.x as number, y: cell.y as number } },
    };
  }
  const order = parseJourneyOrder(value);
  return order ? { kind: 'order', order } : null;
}

/**
 * `{ villageId, people, command }` – příkaz vybraným lidem vsi. `command` je rozkaz jako
 * u `parseJourneyOrder` (`go` smí mít navíc `cell`), nebo `{ kind: 'saddle' | 'dismount' }`.
 */
export function parseExpeditionInput(
  raw: unknown,
): { villageId: string; people: number[]; command: ExpeditionCommand } | null {
  if (!isRecord(raw) || Object.keys(raw).length !== 3) return null;
  const villageId = villageIdOf(raw);
  const people = parsePeople(raw.people);
  const command = parseCommand(raw.command);
  return villageId !== null && people !== null && command !== null
    ? { villageId, people, command }
    : null;
}
