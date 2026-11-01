import {
  playerTime,
  type TimeOffsetRepository,
  type WorldClock,
  type WorldState,
} from '@bohemia/game';
import { worldDayOf } from './world';

/** Dnešní herní den hráče s jeho posunem času, nebo stav světa, který neběží. */
export type PlayerTodayResult =
  { ok: true; day: number; offsetDays: number } | { ok: false; state: WorldState };

/**
 * Dnešní herní den hráče – den světa + posun času hráče (vývojový režim, jinak 0). Podle něj se
 * dopočítávají vsi hráče a provádějí jeho akce.
 */
export async function playerTodayOf(
  offsets: TimeOffsetRepository,
  playerId: string,
  nowMs: number,
  world: WorldClock,
): Promise<PlayerTodayResult> {
  const day = worldDayOf(nowMs, world);
  if (!day.ok) return day;
  const time = await playerTime({ offsets }, { playerId, worldDay: day.day });
  return { ok: true, day: time.today, offsetDays: time.offsetDays };
}
