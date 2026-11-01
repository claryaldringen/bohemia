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
