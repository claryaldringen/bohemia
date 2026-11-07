import type { PlayerLock } from '../locks';

/** Zámek hráče v paměti – operace téhož hráče běží po jedné v pořadí příchodu, `tryRun` nečeká. */
export class InMemoryPlayerLock implements PlayerLock {
  /** Konec fronty hráče (poslední čekající nebo běžící operace). */
  private readonly tails = new Map<string, Promise<unknown>>();
  /** Kolik operací hráče běží nebo čeká – 0 = zámek je volný. */
  private readonly pending = new Map<string, number>();

  run<T>(playerId: string, run: () => Promise<T>): Promise<T> {
    this.pending.set(playerId, (this.pending.get(playerId) ?? 0) + 1);
    const previous = this.tails.get(playerId) ?? Promise.resolve();
    const turn = previous.then(run, run).finally(() => {
      const left = (this.pending.get(playerId) ?? 1) - 1;
      if (left === 0) {
        this.pending.delete(playerId);
        this.tails.delete(playerId);
      } else this.pending.set(playerId, left);
    });
    this.tails.set(
      playerId,
      turn.catch(() => undefined),
    );
    return turn;
  }

  async tryRun<T>(
    playerId: string,
    run: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }> {
    await Promise.resolve();
    if (this.pending.has(playerId)) return { ran: false };
    return { ran: true, value: await this.run(playerId, run) };
  }
}
