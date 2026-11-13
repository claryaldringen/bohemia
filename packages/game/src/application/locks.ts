// Souběh web × worker (docs/superpowers/plans/2026-10-31-worker.md – Zámek hráče): nejvýš jedna
// operace nad vsemi jednoho hráče naráz. Adaptér (Postgres advisory zámek) je v `packages/db`.

/** Port: zámek hráče – nejvýš jedna operace nad vsemi hráče naráz (web i worker). */
export interface PlayerLock {
  /** Počká na zámek hráče a spustí `run`; zámek uvolní i po chybě. */
  run<T>(playerId: string, run: () => Promise<T>): Promise<T>;
  /** Jen když je zámek volný – jinak hned `{ ran: false }` (worker nikdy nečeká). */
  tryRun<T>(
    playerId: string,
    run: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }>;
}

/**
 * Spustí `run` pod zámky všech hráčů `playerIds` (výkupné: věznitel i plátce). Zámky se berou vždy
 * ve stejném pořadí – podle id, každý hráč jednou –, takže dvě operace nad stejnými hráči na sebe
 * nikdy nečekají do kruhu. Zámek není reentrantní: `run` už žádný z těchto zámků brát nesmí.
 *
 * Jediné místo, které drží zámky dvou hráčů naráz – jinde se na zámek hráče uvnitř jiného zámku
 * nečeká (převod držitele jde proto dvěma kroky), jinak by pevné pořadí nestačilo. Adaptér
 * v Postgresu bere každý zámek na vlastním spojení a hráče rozlišuje 32bitovým otiskem: srážka
 * otisků právě těchto hráčů (≈ 2⁻³² na dvojici) by skončila čekáním vnitřního zámku do časového
 * limitu a chybou – `run` se nespustí, nic se nepoškodí.
 */
export function runUnderLocks<T>(
  locks: Pick<PlayerLock, 'run'>,
  playerIds: readonly string[],
  run: () => Promise<T>,
): Promise<T> {
  const ordered = [...new Set(playerIds)].sort();
  const enter = (index: number): Promise<T> => {
    const playerId = ordered[index];
    return playerId === undefined ? run() : locks.run(playerId, () => enter(index + 1));
  };
  return enter(0);
}
