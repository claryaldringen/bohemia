import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createActivityRepository } from '../activity-repository';
import { createHouseRepository } from '../house-repository';
import { createInviteRepository } from '../invite-repository';
import { createSuccessionCreditRepository } from '../succession-credit-repository';
import { createVassalageRepository } from '../vassalage-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const vassalages = createVassalageRepository(db);
const activity = createActivityRepository(db);
const credits = createSuccessionCreditRepository(db);
const houses = createHouseRepository(db);
const invites = createInviteRepository(db);

const NOW = new Date('2026-11-05T12:00:00Z');
const LATER = new Date('2026-11-19T12:00:00Z');
const ids: string[] = [];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  ids.length = 0;
  for (const id of ['a', 'b', 'c', 'd']) {
    await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
    ids.push((await houses.create({ playerId: id, kind: 'player', createdAt: NOW })).id);
  }
});

afterAll(async () => {
  await db.$client.end();
});

function edge(lord: number, vassal: number) {
  return {
    lordHouseId: ids[lord]!,
    vassalHouseId: ids[vassal]!,
    terms: {},
    origin: 'invite' as const,
    sinceAt: NOW,
    sinceDay: 5,
  };
}

describe('VassalageRepository (Drizzle)', () => {
  it('create, activeOf pro pána i vazala, end jen jednou', async () => {
    const v = await vassalages.create(edge(0, 1));
    expect(v).toMatchObject({ origin: 'invite', breaches: 0, version: 1, endedAt: null });
    expect(await vassalages.activeOf(ids[0]!)).toHaveLength(1);
    expect(await vassalages.activeOf(ids[1]!)).toHaveLength(1);
    expect(await vassalages.end(v.id, 'vypovězení', LATER)).toBe(true);
    expect(await vassalages.end(v.id, 'vypovězení', LATER)).toBe(false);
    expect(await vassalages.activeOf(ids[0]!)).toHaveLength(0);
  });

  it('edgesNear sleduje živé hrany do dané hloubky v obou směrech', async () => {
    await vassalages.create(edge(0, 1));
    await vassalages.create(edge(1, 2));
    const ended = await vassalages.create(edge(2, 3));
    await vassalages.end(ended.id, 'x', LATER);
    expect(await vassalages.edgesNear(ids[1]!, 1)).toHaveLength(2);
    expect(await vassalages.edgesNear(ids[0]!, 1)).toEqual([
      { lordHouseId: ids[0], vassalHouseId: ids[1] },
    ]);
    expect(await vassalages.edgesNear(ids[0]!, 3)).toHaveLength(2);
    expect(await vassalages.edgesNear(ids[3]!, 2)).toHaveLength(0);
  });
});

describe('ActivityRepository (Drizzle)', () => {
  it('record je idempotentní, distinctDays počítá různé dny', async () => {
    await activity.record('a', '2026-11-05');
    await activity.record('a', '2026-11-05');
    await activity.record('a', '2026-11-06');
    await activity.record('b', '2026-11-05');
    expect(await activity.distinctDays('a')).toBe(2);
    expect(await activity.distinctDays('c')).toBe(0);
  });
});

describe('SuccessionCreditRepository (Drizzle)', () => {
  it('grantOnce jednou za pozvaného, consumeOne ubere kredit a zapíše den', async () => {
    expect(await credits.grantOnce('a', 'b', NOW)).toBe(true);
    expect(await credits.grantOnce('a', 'b', NOW)).toBe(false);
    expect(await credits.grantOnce('a', 'c', NOW)).toBe(true);
    expect(await credits.unused('a')).toBe(2);
    expect(await credits.consumeOne('a', 321)).toBe(true);
    expect(await credits.unused('a')).toBe(1);
    const used = await db.select().from(schema.successionCredit);
    expect(used.filter((r) => r.usedDay === 321)).toHaveLength(1);
    expect(await credits.consumeOne('a', 322)).toBe(true);
    expect(await credits.consumeOne('a', 323)).toBe(false);
  });

  it('updateTerms přepíše podmínky jen při shodě verze a jen u živé dohody', async () => {
    const v = await vassalages.create(edge(0, 1));
    const terms = { service: { men: 3, days: 20 }, targetVillageId: 'ves-1' };
    expect(await vassalages.updateTerms(v.id, terms, 1)).toBe(true);
    // stará verze už neprojde (souběžná změna)
    expect(await vassalages.updateTerms(v.id, {}, 1)).toBe(false);
    expect(await vassalages.byId(v.id)).toMatchObject({ terms, version: 2 });
    await vassalages.end(v.id, 'renounced', LATER);
    expect(await vassalages.updateTerms(v.id, {}, 2)).toBe(false);
    expect((await vassalages.byId(v.id))?.terms).toEqual(terms);
  });

  it('addBreach zvedne počet a dohodu neukončí; skončenou nezapíše', async () => {
    const v = await vassalages.create(edge(0, 1));
    expect(await vassalages.addBreach(v.id, 'levy', 40)).toBe(true);
    expect(await vassalages.addBreach(v.id, 'summons', 41)).toBe(true);
    expect(await vassalages.byId(v.id)).toMatchObject({ breaches: 2, endedAt: null });
    expect(await vassalages.activeOf(ids[0]!)).toHaveLength(1);
    await vassalages.end(v.id, 'renounced', LATER);
    expect(await vassalages.addBreach(v.id, 'repay', 42)).toBe(false);
    expect(await vassalages.byId('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('souběžné consumeOne nespotřebují jeden kredit dvakrát', async () => {
    await credits.grantOnce('a', 'b', NOW);
    const results = await Promise.all([credits.consumeOne('a', 1), credits.consumeOne('a', 2)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('InviteRepository.listUsed', () => {
  it('vrací jen využité kódy', async () => {
    await invites.issue({ code: 'AAAAAAAA', issuerId: 'a', createdAt: NOW, validUntil: LATER });
    await invites.issue({ code: 'BBBBBBBB', issuerId: 'a', createdAt: NOW, validUntil: LATER });
    await invites.reserve('AAAAAAAA', 'b', NOW);
    await invites.consumeReservation('b', NOW);
    const used = await invites.listUsed();
    expect(used.map((i) => i.code)).toEqual(['AAAAAAAA']);
  });
});
