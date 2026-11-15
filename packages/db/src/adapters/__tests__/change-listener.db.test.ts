import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { notifyChange, type DbChange } from '../../changes';
import { listenChanges } from '../change-listener';

// Posluchač oznámení (plán 2026-11-15 – Úloha 1): příjem, nové připojení po výpadku, zavření.

const db = createDatabase(testDatabaseUrl());

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

afterAll(async () => {
  await db.$client.end();
});

async function until(condition: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  expect(condition()).toBe(true);
}

const activeListeners = async (name: string): Promise<number[]> => {
  const rows = await db.execute<{ pid: number }>(
    sql`SELECT pid FROM pg_stat_activity WHERE application_name = ${name}`,
  );
  return rows.rows.map((r) => Number(r.pid));
};

describe('listenChanges', () => {
  it('doručí změnu, po ukončení spojení se připojí znovu, zavolá onReconnect a dál doručuje', async () => {
    const name = `test-listener-${process.pid}-a`;
    const changes: DbChange[] = [];
    const errors: Error[] = [];
    let reconnects = 0;
    const listener = listenChanges(
      testDatabaseUrl(),
      {
        onChange: (c) => changes.push(c),
        onReconnect: () => (reconnects += 1),
        onError: (e) => errors.push(e),
      },
      { applicationName: name, retryMs: [50] },
    );
    try {
      await listener.ready;
      expect(reconnects).toBe(0);
      await notifyChange(db, { k: 'n', p: 'prvni' });
      await until(() => changes.length === 1);
      expect(changes[0]).toEqual({ k: 'n', p: 'prvni' });

      const [pid] = await activeListeners(name);
      await db.execute(sql`SELECT pg_terminate_backend(${pid})`);
      await until(() => reconnects === 1);
      await notifyChange(db, { k: 'n', p: 'druhy' });
      await until(() => changes.length === 2);
      expect(changes[1]).toEqual({ k: 'n', p: 'druhy' });
      expect(reconnects).toBe(1);
    } finally {
      await listener.close();
    }
  });

  it('vadný náklad zahodí přes onError a běží dál', async () => {
    const errors: Error[] = [];
    const changes: DbChange[] = [];
    const listener = listenChanges(
      testDatabaseUrl(),
      { onChange: (c) => changes.push(c), onReconnect: () => {}, onError: (e) => errors.push(e) },
      { applicationName: `test-listener-${process.pid}-b` },
    );
    try {
      await listener.ready;
      await db.execute(sql`SELECT pg_notify('bohemia_change', 'nejson')`);
      await until(() => errors.length === 1);
      await notifyChange(db, { k: 'n', p: 'ok' });
      await until(() => changes.length === 1);
    } finally {
      await listener.close();
    }
  });

  it('ověření spojení, které neodpoví včas, spustí obnovu a onReconnect', async () => {
    const name = `test-listener-${process.pid}-ping`;
    const errors: Error[] = [];
    let reconnects = 0;
    const listener = listenChanges(
      testDatabaseUrl(),
      { onChange: () => {}, onReconnect: () => (reconnects += 1), onError: (e) => errors.push(e) },
      // „zaseknutý“ dotaz ověření: pg_sleep přes limit
      {
        applicationName: name,
        retryMs: [50],
        pingMs: 50,
        pingTimeoutMs: 100,
        pingQuery: 'SELECT pg_sleep(30)',
      },
    );
    try {
      await listener.ready;
      await until(() => reconnects >= 1);
      expect(errors.some((e) => e.message.includes('neodpovídá'))).toBe(true);
    } finally {
      await listener.close();
    }
  });

  it('close() skončí bez dalšího pokusu o připojení', async () => {
    const name = `test-listener-${process.pid}-c`;
    let reconnects = 0;
    const listener = listenChanges(
      testDatabaseUrl(),
      { onChange: () => {}, onReconnect: () => (reconnects += 1) },
      { applicationName: name, retryMs: [30] },
    );
    await listener.ready;
    expect(await activeListeners(name)).toHaveLength(1);
    await listener.close();
    await new Promise((r) => setTimeout(r, 300));
    expect(await activeListeners(name)).toHaveLength(0);
    expect(reconnects).toBe(0);
  });
});
