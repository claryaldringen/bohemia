import type { JourneyOrder } from '@bohemia/game';
import { villageIdOf } from './village-input';

// Vstup server actions výjezdu vojvody (lord-control.md – Rozkazy; plán 2026-11-13 – Úloha 7) –
// jen tvar. Co rozkaz znamená (bod na mapě, soused, dosažitelnost), ověřují use-casy
// `launchJourney` a `commandJourney`.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isInt = (value: unknown): value is number => Number.isSafeInteger(value);
const isFinite_ = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Objekt s právě těmito klíči (přebytečné pole = odmítnutí). */
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((k) => k in value);

/** Nejvíc mužů v družině – s rezervou víc, než kolik mužů ves unese. */
const MAX_RETINUE = 200;

/** Rozkaz `go` / `cross` / `home` ve správném tvaru, jinak null. */
export function parseJourneyOrder(value: unknown): JourneyOrder | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'go': {
      const pos = value.pos;
      if (!hasOnly(value, ['kind', 'pos']) || !isRecord(pos) || !hasOnly(pos, ['x', 'z'])) {
        return null;
      }
      return isFinite_(pos.x) && isFinite_(pos.z)
        ? { kind: 'go', pos: { x: pos.x, z: pos.z } }
        : null;
    }
    case 'cross': {
      const cell = value.cell;
      if (!hasOnly(value, ['kind', 'cell']) || !isRecord(cell) || !hasOnly(cell, ['x', 'y'])) {
        return null;
      }
      return isInt(cell.x) && isInt(cell.y)
        ? { kind: 'cross', cell: { x: cell.x, y: cell.y } }
        : null;
    }
    case 'home':
      return hasOnly(value, ['kind']) ? { kind: 'home' } : null;
    default:
      return null;
  }
}

/** `{ villageId, retinue, order }` – vyslání výjezdu (`launchJourney`), jinak null. */
export function parseLaunchJourneyInput(
  value: unknown,
): { villageId: string; retinue: number[]; order: JourneyOrder } | null {
  if (!isRecord(value) || !hasOnly(value, ['villageId', 'retinue', 'order'])) return null;
  const villageId = villageIdOf(value);
  const retinue = value.retinue;
  if (villageId === null || !Array.isArray(retinue) || retinue.length > MAX_RETINUE) return null;
  if (!retinue.every(isInt)) return null;
  const order = parseJourneyOrder(value.order);
  return order ? { villageId, retinue: [...(retinue as number[])], order } : null;
}
