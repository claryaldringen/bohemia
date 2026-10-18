import { TOTAL_GAME_DAYS } from '../domain/calendar';
import { dynastyStatus, type DynastyDeps } from './restart-game';

// Posun času hráče – vývojový režim (accounts.md; Martin, 18. 10. 2026: „abych při testování hry
// nemusel čekat, až se vesnice rozroste“). Hráč s posunem žije o tolik herních dní napřed
// – dnešní den je pro něj den světa + posun. Posun jen roste, uložený stav se nevrací zpět.

/** Port: posun času hráčů ve dnech (hráč bez záznamu má posun 0). */
export interface TimeOffsetRepository {
  offsetOf(playerId: string): Promise<number>;
  /**
   * Atomicky zvětší posun hráče o `days` dní, nejvýš na `maxOffset` – nikdy ho nezmenší.
   * Vrátí posun po změně.
   */
  extend(playerId: string, days: number, maxOffset: number): Promise<number>;
}

/** Poslední herní den světa (31. 12. 1499) – dál posun nesahá. */
const LAST_DAY = TOTAL_GAME_DAYS - 1;

/** Přeskoky času v dev módu: měsíc (30 herních dní), rok (365 dní) a 10 let (3 650 dní). */
export const TIME_SKIP_DAYS = { month: 30, year: 365, decade: 3650 } as const;
export type TimeSkip = keyof typeof TIME_SKIP_DAYS;

export const DEV_MODE_ONLY = 'Přeskakovat čas jde jen ve vývojovém režimu.';
export const WORLD_END_REACHED = 'Dál čas posunout nejde – svět končí rokem 1500.';

/** Dnešní den hráče: den světa + posun, nejvýš poslední den světa. */
export function playerDay(worldDay: number, offsetDays: number): number {
  return Math.min(worldDay + offsetDays, LAST_DAY);
}

export interface PlayerTimeInput {
  playerId: string;
  /** Dnešní herní den světa (index dne). */
  worldDay: number;
}

/** Dnešní den hráče a jeho posun času. */
export async function playerTime(
  deps: { offsets: TimeOffsetRepository },
  input: PlayerTimeInput,
): Promise<{ today: number; offsetDays: number }> {
  const offsetDays = await deps.offsets.offsetOf(input.playerId);
  return { today: playerDay(input.worldDay, offsetDays), offsetDays };
}

export interface SkipTimeInput extends PlayerTimeInput {
  /** Hráč má vývojový režim (příznak účtu) – jinak čas přeskočit nesmí. */
  devMode: boolean;
  skip: TimeSkip;
}

export type SkipTimeResult =
  { ok: true; today: number; offsetDays: number } | { ok: false; reason: string };

/**
 * Přeskočí čas hráče (jen ve vývojovém režimu): posun se zvětší o měsíc, nebo rok, nejvýš do
 * posledního dne světa, a všechny vsi hráče se dopočítají do nového dneška a uloží.
 */
export async function skipTime(
  deps: DynastyDeps & { offsets: TimeOffsetRepository },
  input: SkipTimeInput,
): Promise<SkipTimeResult> {
  if (!input.devMode) return { ok: false, reason: DEV_MODE_ONLY };
  const maxOffset = LAST_DAY - input.worldDay;
  const current = await deps.offsets.offsetOf(input.playerId);
  if (current >= maxOffset) return { ok: false, reason: WORLD_END_REACHED };
  const offsetDays = await deps.offsets.extend(
    input.playerId,
    TIME_SKIP_DAYS[input.skip],
    maxOffset,
  );
  const today = playerDay(input.worldDay, offsetDays);
  await dynastyStatus(deps, { playerId: input.playerId, today });
  return { ok: true, today, offsetDays };
}
