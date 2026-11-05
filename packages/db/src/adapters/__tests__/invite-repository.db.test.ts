import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createInviteRepository } from '../invite-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const invites = createInviteRepository(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  for (const id of ['p1', 'a', 'b']) {
    await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
  }
});

afterAll(async () => {
  await db.$client.end();
});

const NOW = new Date('2026-11-05T12:00:00Z');
const LATER = new Date('2026-11-19T12:00:00Z');

async function issue(code = 'BH7KM2QX'): Promise<void> {
  await invites.issue({ code, issuerId: 'p1', createdAt: NOW, validUntil: LATER });
}

describe('InviteRepository (Drizzle)', () => {
  it('issue při kolizi kódu vrátí null', async () => {
    expect(
      await invites.issue({ code: 'BH7KM2QX', issuerId: 'p1', createdAt: NOW, validUntil: LATER }),
    ).not.toBeNull();
    expect(
      await invites.issue({ code: 'BH7KM2QX', issuerId: 'p1', createdAt: NOW, validUntil: LATER }),
    ).toBeNull();
  });

  it('souběžné reserve dvou uživatelů – uspěje jeden', async () => {
    await issue();
    const results = await Promise.all([
      invites.reserve('BH7KM2QX', 'a', NOW),
      invites.reserve('BH7KM2QX', 'b', NOW),
    ]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    const reservedBy = (await invites.find('BH7KM2QX'))?.reservedBy;
    expect(reservedBy).toBe(results[0] === 'ok' ? 'a' : 'b');
  });

  it('reserve je idempotentní pro téhož, odmítne propadlý, zrušený a vlastní kód', async () => {
    await issue();
    expect(await invites.reserve('BH7KM2QX', 'a', NOW)).toBe('ok');
    expect(await invites.reserve('BH7KM2QX', 'a', NOW)).toBe('ok');
    expect(await invites.reserve('BH7KM2QX', 'p1', NOW)).toBe('invalid');
    await issue('CC7KM2QX');
    expect(await invites.reserve('CC7KM2QX', 'b', new Date(LATER.getTime() + 1))).toBe('invalid');
    expect(await invites.revoke('CC7KM2QX', 'p1', NOW)).toBe(true);
    expect(await invites.revoke('CC7KM2QX', 'p1', NOW)).toBe(false);
    expect(await invites.reserve('CC7KM2QX', 'b', NOW)).toBe('invalid');
  });

  it('consumeReservation vrátí kód jen jednou, i souběžně', async () => {
    await issue();
    await invites.reserve('BH7KM2QX', 'a', NOW);
    const taken = await Promise.all([
      invites.consumeReservation('a', NOW),
      invites.consumeReservation('a', NOW),
    ]);
    expect(taken.filter((t) => t !== null)).toHaveLength(1);
    expect((await invites.find('BH7KM2QX'))?.usedBy).toBe('a');
    expect(await invites.revoke('BH7KM2QX', 'p1', NOW)).toBe(false);
  });

  it('listOf vrací kódy vydavatele', async () => {
    await issue();
    await issue('CC7KM2QX');
    expect(await invites.listOf('p1')).toHaveLength(2);
    expect(await invites.listOf('a')).toHaveLength(0);
  });
});
