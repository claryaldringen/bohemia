import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createNoticeRepository } from '../notice-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const notices = createNoticeRepository(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values([
    { id: 'p1', name: '', email: 'p1@example.com' },
    { id: 'p2', name: '', email: 'p2@example.com' },
  ]);
});

afterAll(async () => {
  await db.$client.end();
});

const base = { payload: { who: 'Ctibor' }, gameDay: 7 } as const;

describe('NoticeRepository (Drizzle)', () => {
  it('after vrací jen upozornění hráče, rostoucí podle id, nejvýš limit', async () => {
    await notices.post({ ...base, playerId: 'p1', kind: 'invite-accepted' });
    await notices.post({ ...base, playerId: 'p2', kind: 'invite-accepted' });
    await notices.post({ ...base, playerId: 'p1', kind: 'invitee-played' });
    await notices.post({ ...base, playerId: 'p1', kind: 'invitee-played' });
    const all = await notices.after('p1', 0, 10);
    expect(all.map((n) => n.kind)).toEqual(['invite-accepted', 'invitee-played', 'invitee-played']);
    expect(all.every((n) => n.playerId === 'p1' && n.readAt === null)).toBe(true);
    expect(all[0]).toMatchObject({ payload: { who: 'Ctibor' }, gameDay: 7 });
    expect(all[0]!.id).toBeLessThan(all[1]!.id);
    expect(await notices.after('p1', 0, 2)).toHaveLength(2);
    expect((await notices.after('p1', all[0]!.id, 10)).map((n) => n.id)).toEqual([
      all[1]!.id,
      all[2]!.id,
    ]);
  });

  it('markRead označí jen upozornění hráče do upToId', async () => {
    await notices.post({ ...base, playerId: 'p1', kind: 'invite-accepted' });
    await notices.post({ ...base, playerId: 'p2', kind: 'invite-accepted' });
    await notices.post({ ...base, playerId: 'p1', kind: 'invitee-played' });
    const mine = await notices.after('p1', 0, 10);
    await notices.markRead('p1', mine[0]!.id);
    expect((await notices.after('p1', 0, 10)).map((n) => n.readAt !== null)).toEqual([true, false]);
    expect((await notices.after('p2', 0, 10))[0]!.readAt).toBeNull();
  });
});
