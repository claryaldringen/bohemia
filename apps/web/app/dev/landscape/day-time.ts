// Den a noc na vývojové stránce – čisté funkce ovládání hodiny dne (DayTimeControls).
import { DAY_HOURS, GAME_DAY_MS } from '@/lib/scene/day-light';

/** Přehrávání dne: od které hodiny a kdy (epoch ms) začalo – den trvá jako ve hře (≈ 86 s). */
export interface DayPlay {
  fromHour: number;
  startedAt: number;
}

/** Hodina dne (0–24) přehrávaného dne v okamžiku `nowMs` – za herní den (GAME_DAY_MS) celý den. */
export function playedHour(play: DayPlay, nowMs: number): number {
  const hours = play.fromHour + ((nowMs - play.startedAt) / GAME_DAY_MS) * DAY_HOURS;
  return ((hours % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
}

/** Hodina dne jako „6:05“ (minuty dolů). */
export function formatHour(hour: number): string {
  const minutes = Math.floor((((hour % DAY_HOURS) + DAY_HOURS) % DAY_HOURS) * 60 + 1e-6);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
