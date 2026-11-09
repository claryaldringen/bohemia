import type { AlarmCommand } from '@bohemia/game';

// Vstup server actions varování (plán 2026-11-09 – Úloha 12) – jen tvar; smí-li hráč příkaz dát
// a jde-li volba, ověří use-case `commandAlarm` (právo `war`, volby nad kontrolním bodem tažení).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 100;

/** Nejvýš tolik vsí domény v jednom příkazu (hradiště pošle nejvýš 4 posly). */
const MAX_DOMAIN = 32;

/** `{ villageId }` – pohled na varování a Vrátit se. */
export function parseAlarmVillage(input: unknown): { villageId: string } | null {
  return isRecord(input) && isId(input.villageId) ? { villageId: input.villageId } : null;
}

function command(value: unknown): AlarmCommand | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'messenger':
      if (value.personId === undefined) return { kind: 'messenger' };
      return Number.isSafeInteger(value.personId)
        ? { kind: 'messenger', personId: value.personId as number }
        : null;
    case 'flee':
      return value.mode === 'forest' || value.mode === 'people' || value.mode === 'all'
        ? { kind: 'flee', mode: value.mode }
        : null;
    case 'domain': {
      const to = value.to;
      if (!Array.isArray(to) || to.length > MAX_DOMAIN || !to.every(isId)) return null;
      return { kind: 'domain', to: [...new Set(to)] };
    }
    default:
      return null;
  }
}

/** `{ villageId, command }` – příkaz obránce varované vsi. */
export function parseAlarmCommand(
  input: unknown,
): { villageId: string; command: AlarmCommand } | null {
  if (!isRecord(input) || !isId(input.villageId)) return null;
  const parsed = command(input.command);
  return parsed ? { villageId: input.villageId, command: parsed } : null;
}
