import type { PlayerLock } from '@bohemia/game';
import type { Pool, PoolClient } from 'pg';

// Zámek hráče v Postgresu (docs/superpowers/plans/2026-10-31-worker.md – Souběh web × worker):
// advisory zámek na úrovni spojení. Spojení drží zámek po celou operaci a vlastní dotazy operace
// jdou hlavním poolem – kdo zámek drží, nepotřebuje další spojení zámků, aby práci dokončil. Když
// proces spadne (pád, kill, výpadek sítě), spojení skončí a Postgres zámek uvolní sám.

/**
 * Jmenný prostor zámků hráče – první číslo dvojice klíčů `pg_advisory_lock(int4, int4)`. Dvojice
 * čísel je v Postgresu oddělený prostor od klíčů jedním `bigint`, a pevná konstanta odliší zámky
 * hráče od jiných advisory zámků, které by v budoucnu přibyly.
 */
export const PLAYER_LOCK_NAMESPACE = 0x426f6865; // „Bohe“ v ASCII, vejde se do int4

/**
 * Druhé číslo klíče: 32bitový otisk FNV-1a z UTF-8 id hráče (jako int4 se znaménkem). Celý klíč
 * má 64 bitů (prostor + otisk), na hráče připadá 32 bitů. **Srážka** dvou hráčů na stejný otisk je
 * jen zbytečné čekání (web počká, worker hráče v tom kole přeskočí) – nikdy chyba, oba hráči dál
 * počítají jen pod svým zámkem. Pravděpodobnost aspoň jedné srážky mezi n hráči ≈ n² / 2³³
 * (1 000 hráčů ≈ 0,01 %, 10 000 ≈ 1,2 %) – i pak se potkají jen, když oba hrají ve stejné chvíli.
 * Výjimka: operace, která drží zámky dvou hráčů naráz (`runUnderLocks` – výkupné), by při srážce
 * právě této dvojice čekala sama na sebe do `waitTimeoutMs` a skončila `PlayerLockTimeoutError`,
 * aniž by se spustila.
 */
export function playerLockHash(playerId: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(playerId)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/** `run` nedostal zámek do `waitTimeoutMs` – operace se nespustila, zámek se nevzal. */
export class PlayerLockTimeoutError extends Error {
  constructor(playerId: string, waitTimeoutMs: number) {
    super(`Zámek hráče ${playerId} se neuvolnil do ${waitTimeoutMs} ms.`);
    this.name = 'PlayerLockTimeoutError';
  }
}

export interface PlayerLockOptions {
  /**
   * Jak dlouho `run` nejvýš čeká na zámek (ms, Postgres `lock_timeout` na spojení zámku); pak
   * `PlayerLockTimeoutError`. Bez hodnoty čeká, dokud se zámek neuvolní (web – jako fronta
   * v procesu). `tryRun` nečeká nikdy.
   */
  waitTimeoutMs?: number;
  /**
   * Spojení se zámkem spadlo uprostřed operace – zámek už neplatí a operace doběhne bez něj
   * (pojistkou je zámek verze vsi). Výchozí: `console.warn`.
   */
  onLost?: (playerId: string, error: Error) => void;
  /** Jmenný prostor klíčů (výchozí `PLAYER_LOCK_NAMESPACE`) – jiný má zámek tažení. */
  namespace?: number;
}

/** Postgres: čekání na zámek přerušil `lock_timeout`. */
const LOCK_NOT_AVAILABLE = '55P03';

function isLockTimeout(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === LOCK_NOT_AVAILABLE;
}

function warnLost(playerId: string, error: Error): void {
  console.warn(`Zámek hráče ${playerId}: spojení spadlo uprostřed operace (${error.message}).`);
}

/**
 * Adaptér portu `PlayerLock` nad poolem `pool` – **pool jen pro tento zámek** (`createLockPool`),
 * jeho spojení nastavení `lock_timeout` sdílejí. Zámek se uvolní ve `finally` i po chybě; když
 * odemčení selže nebo spojení spadlo, spojení se z poolu zahodí a zámek padne s ním.
 */
export function createPlayerLock(pool: Pool, options: PlayerLockOptions = {}): PlayerLock {
  const { waitTimeoutMs, onLost = warnLost, namespace = PLAYER_LOCK_NAMESPACE } = options;
  const timed = new WeakSet<PoolClient>();

  async function lock(client: PoolClient, playerId: string, wait: boolean): Promise<boolean> {
    const key = [namespace, playerLockHash(playerId)];
    if (!wait) {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1, $2) AS locked',
        key,
      );
      return result.rows[0]?.locked === true;
    }
    if (waitTimeoutMs !== undefined && !timed.has(client)) {
      await client.query("SELECT set_config('lock_timeout', $1, false)", [`${waitTimeoutMs}ms`]);
      timed.add(client);
    }
    try {
      await client.query('SELECT pg_advisory_lock($1, $2)', key);
    } catch (error) {
      if (waitTimeoutMs !== undefined && isLockTimeout(error)) {
        throw new PlayerLockTimeoutError(playerId, waitTimeoutMs);
      }
      throw error;
    }
    return true;
  }

  async function unlock(client: PoolClient, playerId: string): Promise<Error | undefined> {
    try {
      const result = await client.query<{ unlocked: boolean }>(
        'SELECT pg_advisory_unlock($1, $2) AS unlocked',
        [namespace, playerLockHash(playerId)],
      );
      return result.rows[0]?.unlocked === true ? undefined : new Error('zámek už nebyl držen');
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  async function hold<T>(
    playerId: string,
    wait: boolean,
    run: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }> {
    const client = await pool.connect();
    let lost: Error | undefined;
    // spojení vyjmuté z poolu nemá posluchače chyb – bez něj by pád spojení shodil proces
    const onError = (error: Error): void => {
      if (lost) return;
      lost = error;
      onLost(playerId, error);
    };
    client.on('error', onError);
    let locked = false;
    try {
      locked = await lock(client, playerId, wait);
      if (!locked) return { ran: false };
      return { ran: true, value: await run() };
    } finally {
      const broken = lost ?? (locked ? await unlock(client, playerId) : undefined);
      client.removeListener('error', onError);
      // s chybou pool spojení zavře – Postgres pak zámek uvolní sám
      client.release(broken);
    }
  }

  return {
    async run<T>(playerId: string, run: () => Promise<T>): Promise<T> {
      const held = await hold(playerId, true, run);
      if (!held.ran) throw new Error(`Zámek hráče ${playerId} se nevzal.`);
      return held.value;
    },
    tryRun<T>(
      playerId: string,
      run: () => Promise<T>,
    ): Promise<{ ran: true; value: T } | { ran: false }> {
      return hold(playerId, false, run);
    },
  };
}
