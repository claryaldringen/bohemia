import { TOTAL_GAME_DAYS, dateOfDayIndex, realTimeOf, type WorldClock } from '@bohemia/game';

/** Rezerva po začátku herního dne, ať se hodiny napříč procesy neliší o hranici dne. */
export const WAKE_MARGIN_MS = 1000;

/**
 * Jak dlouho spát, když není co počítat: do 1 s po začátku dalšího herního dne, nejvýš `idleMs`
 * (posun času hráče, zrychlené světy, nová ves ze schránky). Před startem světa, po jeho konci
 * i v poslední den spí `idleMs`.
 */
export function nextWakeMs(
  nowMs: number,
  worldDay: number | null,
  world: WorldClock,
  idleMs: number,
): number {
  if (worldDay === null || worldDay + 1 >= TOTAL_GAME_DAYS) return idleMs;
  const nextDayStart = realTimeOf(dateOfDayIndex(worldDay + 1), world);
  return Math.max(0, Math.min(idleMs, nextDayStart + WAKE_MARGIN_MS - nowMs));
}

export const BUSY_SKIP_MS = 2000;
export const FAILED_SKIP_MIN_MS = 60_000;
export const FAILED_SKIP_MAX_MS = 15 * 60_000;

/**
 * Odklady hráčů v paměti procesu: zámek držel web → 2 s; chyba → 1 min, zdvojuje se do 15 min;
 * úspěšná dávka odklad i počítadlo chyb zruší. Use-case dostane jen množinu `active`.
 */
export class SkipTable {
  private readonly entries = new Map<string, { until: number; failures: number }>();

  busy(playerId: string, nowMs: number): void {
    const failures = this.entries.get(playerId)?.failures ?? 0;
    this.entries.set(playerId, { until: nowMs + BUSY_SKIP_MS, failures });
  }

  failed(playerId: string, nowMs: number): void {
    const failures = (this.entries.get(playerId)?.failures ?? 0) + 1;
    const wait = Math.min(FAILED_SKIP_MAX_MS, FAILED_SKIP_MIN_MS * 2 ** (failures - 1));
    this.entries.set(playerId, { until: nowMs + wait, failures });
  }

  done(playerId: string): void {
    this.entries.delete(playerId);
  }

  /** Hráči s platným odkladem; prošlé odklady bez chyb se zahodí. */
  active(nowMs: number): Set<string> {
    const result = new Set<string>();
    for (const [playerId, entry] of this.entries) {
      if (entry.until > nowMs) result.add(playerId);
      else if (entry.failures === 0) this.entries.delete(playerId);
    }
    return result;
  }
}
