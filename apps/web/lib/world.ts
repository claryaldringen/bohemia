import type { WorldClock } from '@bohemia/game';
import { worldDayOf } from '@bohemia/server';
import { formatWorldState } from './game-date';

export { currentWorld } from '@bohemia/server';

/** Dnešní herní den (index dne); když svět neběží (ještě nezačal / skončil), chyba pro hráče. */
export function gameDayIndex(
  nowMs: number,
  world: WorldClock,
): { ok: true; day: number } | { ok: false; error: string } {
  const day = worldDayOf(nowMs, world);
  if (!day.ok) return { ok: false, error: `${formatWorldState(day.state, world)}.` };
  return day;
}
