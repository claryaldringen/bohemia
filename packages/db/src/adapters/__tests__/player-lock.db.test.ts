import { afterAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { PlayerLock } from '@bohemia/game';
import { createLockPool } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import {
  PLAYER_LOCK_NAMESPACE,
  PlayerLockTimeoutError,
  createPlayerLock,
  playerLockHash,
} from '../player-lock';

// Dva pooly = dva „procesy“: advisory zámek patří spojení, takže web (pool 20) a worker (pool 2)
// se vůči sobě chovají jako dva procesy serveru nad stejnou databází.
const URL = testDatabaseUrl();
const webPool = createLockPool(URL, 20);
const workerPool = createLockPool(URL, 2);
const timedPool = createLockPool(URL, 1);
const admin = new Pool({ connectionString: URL, max: 2 });

const lost: string[] = [];
const web = createPlayerLock(webPool, { onLost: (playerId) => lost.push(playerId) });
const worker = createPlayerLock(workerPool);
const timed = createPlayerLock(timedPool, { waitTimeoutMs: 100 });

afterAll(async () => {
  await Promise.all([webPool.end(), workerPool.end(), timedPool.end(), admin.end()]);
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Operace, která drží zámek, dokud ji test nepustí. */
function hold(
  lock: PlayerLock,
  playerId: string,
): { entered: Promise<void>; release: () => void; done: Promise<string> } {
  const entered = deferred<void>();
  const gate = deferred<void>();
  const done = lock.run(playerId, async () => {
    entered.resolve();
    await gate.promise;
    return 'hotovo';
  });
  return { entered: entered.promise, release: () => gate.resolve(), done };
}

/** Advisory zámky klíče hráče v `pg_locks` (granted = držené, jinak čekající). */
async function locksOf(playerId: string, granted: boolean): Promise<{ pid: number }[]> {
  const result = await admin.query<{ pid: number }>(
    `SELECT pid FROM pg_locks
      WHERE locktype = 'advisory' AND classid = $1::oid AND objid = $2::oid AND objsubid = 2
        AND granted = $3`,
    [String(PLAYER_LOCK_NAMESPACE >>> 0), String(playerLockHash(playerId) >>> 0), granted],
  );
  return result.rows;
}

async function eventually(check: () => Promise<boolean> | boolean): Promise<void> {
  for (let i = 0; i < 250; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('podmínka se do 5 s nesplnila');
}

describe('createPlayerLock (Postgres advisory zámek)', () => {
  it('tryRun z druhého procesu vrátí „obsazeno“ a nic nespustí, po uvolnění projde', async () => {
    const held = hold(web, 'hrac-try');
    await held.entered;
    const run = vi.fn(() => Promise.resolve(1));
    expect(await worker.tryRun('hrac-try', run)).toEqual({ ran: false });
    expect(run).not.toHaveBeenCalled();
    held.release();
    expect(await held.done).toBe('hotovo');
    expect(await worker.tryRun('hrac-try', () => Promise.resolve(2))).toEqual({
      ran: true,
      value: 2,
    });
    expect(await locksOf('hrac-try', true)).toEqual([]);
  });

  it('run počká, až druhý proces zámek pustí', async () => {
    const order: string[] = [];
    const held = hold(worker, 'hrac-wait');
    await held.entered;
    const waiting = web.run('hrac-wait', () => {
      order.push('web');
      return Promise.resolve('web');
    });
    await eventually(async () => (await locksOf('hrac-wait', false)).length === 1);
    expect(order).toEqual([]);
    order.push('worker');
    held.release();
    await held.done;
    expect(await waiting).toBe('web');
    expect(order).toEqual(['worker', 'web']);
  });

  it('chyba v operaci zámek uvolní a projde k volajícímu', async () => {
    await expect(web.run('hrac-err', () => Promise.reject(new Error('selhalo')))).rejects.toThrow(
      'selhalo',
    );
    await expect(
      web.run('hrac-err', () => {
        throw new Error('hned');
      }),
    ).rejects.toThrow('hned');
    await expect(
      worker.tryRun('hrac-err', () => Promise.reject(new Error('worker'))),
    ).rejects.toThrow('worker');
    expect(await locksOf('hrac-err', true)).toEqual([]);
    expect(await worker.tryRun('hrac-err', () => Promise.resolve('ok'))).toEqual({
      ran: true,
      value: 'ok',
    });
  });

  it('pád spojení držitele (pg_terminate_backend) zámek uvolní', async () => {
    const held = hold(web, 'hrac-crash');
    await held.entered;
    const [holder] = await locksOf('hrac-crash', true);
    expect(holder).toBeDefined();
    await admin.query('SELECT pg_terminate_backend($1)', [holder?.pid]);
    await eventually(async () => (await worker.tryRun('hrac-crash', () => Promise.resolve())).ran);
    await eventually(() => lost.includes('hrac-crash'));
    // operace doběhne i bez zámku (pojistkou je zámek verze vsi), rozbité spojení se zahodí
    held.release();
    expect(await held.done).toBe('hotovo');
    expect(await web.tryRun('hrac-crash', () => Promise.resolve(3))).toEqual({
      ran: true,
      value: 3,
    });
    expect(await locksOf('hrac-crash', true)).toEqual([]);
  });

  it('různí hráči se neblokují', async () => {
    const held = hold(web, 'hrac-jeden');
    await held.entered;
    expect(await worker.tryRun('hrac-dva', () => Promise.resolve('dva'))).toEqual({
      ran: true,
      value: 'dva',
    });
    expect(await web.run('hrac-dva', () => Promise.resolve('dva'))).toBe('dva');
    expect(await worker.tryRun('hrac-jeden', () => Promise.resolve())).toEqual({ ran: false });
    held.release();
    await held.done;
  });

  it('20 souběžných run jednoho hráče ze dvou procesů nikdy dva naráz', async () => {
    let active = 0;
    let maxActive = 0;
    let done = 0;
    const work = async (): Promise<void> => {
      active++;
      maxActive = Math.max(maxActive, active);
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      done++;
    };
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? web : worker).run('hrac-davka', work)),
    );
    expect(done).toBe(20);
    expect(maxActive).toBe(1);
    expect(await locksOf('hrac-davka', true)).toEqual([]);
  });

  it('časový limit čekání: run bez zámku skončí chybou a zámek nezůstane viset', async () => {
    const held = hold(web, 'hrac-limit');
    await held.entered;
    const run = vi.fn(() => Promise.resolve('nikdy'));
    await expect(timed.run('hrac-limit', run)).rejects.toBeInstanceOf(PlayerLockTimeoutError);
    expect(run).not.toHaveBeenCalled();
    held.release();
    await held.done;
    // stejné spojení zámků dál funguje a zámek po něm nezůstal
    expect(await timed.run('hrac-limit', () => Promise.resolve('po'))).toBe('po');
    expect(await locksOf('hrac-limit', true)).toEqual([]);
    expect(await locksOf('hrac-limit', false)).toEqual([]);
  });
});
