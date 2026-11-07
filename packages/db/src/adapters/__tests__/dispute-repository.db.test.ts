import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createDisputeRepository } from '../dispute-repository';
import { createHouseRepository } from '../house-repository';

// Spory a rozsudek pána (vassalage.md – Mír a spory): jedna žaloba na dvojici, podmíněné zápisy.

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const disputes = createDisputeRepository(db);
const houses = createHouseRepository(db);
const NOW = new Date('2026-11-06T12:00:00Z');
const PLAYERS = ['pan', 'zalobce', 'obzalovany'];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(PLAYERS.map((id) => ({ id, name: '', email: `${id}@example.com` })));
});

afterAll(async () => {
  await db.$client.end();
});

const newHouse = (playerId: string): ReturnType<typeof houses.create> =>
  houses.create({ playerId, kind: 'player', createdAt: NOW });

describe('dispute repository', () => {
  it('jediný nerozsouzený spor na dvojici i při souběhu v obou směrech', async () => {
    const lord = await newHouse('pan');
    const p = await newHouse('zalobce');
    const d = await newHouse('obzalovany');
    const input = { lordHouseId: lord.id, message: 'Spor.', filedAt: NOW, filedDay: 10 };
    const results = await Promise.all([
      disputes.file({ ...input, plaintiffHouseId: p.id, defendantHouseId: d.id }),
      disputes.file({ ...input, plaintiffHouseId: d.id, defendantHouseId: p.id }),
      disputes.file({ ...input, plaintiffHouseId: p.id, defendantHouseId: d.id }),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await disputes.listOf(lord.id, 10)).toHaveLength(1);
  });

  it('vyjádření jednou, rozsudek jednou, mír platí do dne a porušení se zapíše jednou', async () => {
    const lord = await newHouse('pan');
    const p = await newHouse('zalobce');
    const d = await newHouse('obzalovany');
    const dispute = (await disputes.file({
      lordHouseId: lord.id,
      plaintiffHouseId: p.id,
      defendantHouseId: d.id,
      message: 'Spor.',
      filedAt: NOW,
      filedDay: 10,
    }))!;
    expect(
      await Promise.all([disputes.answer(dispute.id, 'a'), disputes.answer(dispute.id, 'b')]),
    ).toHaveLength(2);
    expect((await disputes.byId(dispute.id))!.statement).toMatch(/^[ab]$/);
    const judged = await Promise.all([
      disputes.judge(dispute.id, { kind: 'peace' }, 11, 500),
      disputes.judge(dispute.id, { kind: 'dismiss' }, 11, null),
    ]);
    expect(judged.filter(Boolean)).toHaveLength(1);
    expect(await disputes.answer(dispute.id, 'c')).toBe(false);
    const row = (await disputes.byId(dispute.id))!;
    expect(row.status).toBe('judged');
    if (row.verdict?.kind === 'peace') {
      expect(await disputes.peaceBetween(d.id, p.id, 100)).toMatchObject({ id: dispute.id });
      expect(await disputes.peaceBetween(d.id, p.id, 500)).toBeNull();
    }
    const broken = await Promise.all([
      disputes.markBroken(dispute.id, d.id),
      disputes.markBroken(dispute.id, d.id),
    ]);
    expect(broken.filter(Boolean)).toHaveLength(1);
    expect((await disputes.byId(dispute.id))!.brokenBy).toEqual([d.id]);
    // po rozsudku smí běžet nový spor téže dvojice
    expect(
      await disputes.file({
        lordHouseId: lord.id,
        plaintiffHouseId: p.id,
        defendantHouseId: d.id,
        message: 'Znovu.',
        filedAt: NOW,
        filedDay: 12,
      }),
    ).not.toBeNull();
  });
});
