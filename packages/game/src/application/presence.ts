/**
 * Port přítomnosti hráče u hry (war.md – Hráč ve vsi a mimo ni): okamžik, kdy měl hráč naposled
 * otevřenou kteroukoli svou ves nebo dal pokyn. Zapisuje web, čte worker.
 */
export interface PresenceRepository {
  /** Hráč je u hry v okamžiku `at` (starší zápis nepřepíše novější). */
  note(playerId: string, at: Date): Promise<void>;
  /** Poslední přítomnost (ms) hráčů, kteří nějakou mají. */
  lastSeen(playerIds: readonly string[]): Promise<Map<string, number>>;
}

/** Přítomnost se zapisuje nejvýš jednou za tuto dobu a proces (návrh Clauda). */
export const PRESENCE_NOTE_MS = 10_000;
