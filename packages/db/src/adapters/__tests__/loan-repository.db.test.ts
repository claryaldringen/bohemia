import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import type { NegotiationTx, NewLoan } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';
import { createLoanRepository } from '../loan-repository';
import { createNegotiationRepository } from '../negotiation-repository';

const db = createDatabase(testDatabaseUrl());
const loans = createLoanRepository(db);
const negotiations = createNegotiationRepository(db);
const houses = createHouseRepository(db);

const NOW = new Date('2026-11-05T12:00:00Z');
const ids: string[] = [];
const VILLAGE = '00000000-0000-4000-8000-000000000001';

const goods = (grainKg: number): NewLoan['principal'] => ({
  grainKg,
  hayKg: 0,
  cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
  horses: 0,
  logs: 0,
  stoneM3: 0,
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  ids.length = 0;
  for (const id of ['a', 'b']) {
    await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
    ids.push((await houses.create({ playerId: id, kind: 'player', createdAt: NOW })).id);
  }
});

afterAll(async () => {
  await db.$client.end();
});

async function openNegotiation(): Promise<string> {
  const [a, b] = ids as [string, string];
  const record = await negotiations.transaction((tx) =>
    tx.open({
      initiatorHouseId: b,
      recipientHouseId: a,
      round: { authorHouseId: b, items: [], message: null, at: NOW },
    }),
  );
  return record!.id;
}

const loanOf = (negotiationId: string): NewLoan => {
  const [a, b] = ids as [string, string];
  return {
    negotiationId,
    creditorHouseId: a,
    debtorHouseId: b,
    creditorVillageId: VILLAGE,
    debtorVillageId: null,
    principal: goods(200),
    schedule: [
      { year: 601, goods: goods(100) },
      { year: 602, goods: goods(100) },
    ],
    sinceAt: NOW,
    sinceDay: 10,
  };
};

/** Přijetí jako použije use-case: zamknout, podmíněně uzavřít, založit půjčku. */
async function accept(tx: NegotiationTx, id: string): Promise<boolean> {
  const n = await tx.getForUpdate(id);
  if (n?.status !== 'open') return false;
  if (!(await tx.setStatus(id, 'accepted', n.version, NOW))) return false;
  await tx.loans.create(loanOf(id));
  return true;
}

describe('LoanRepository (db)', () => {
  it('dvě souběžná přijetí téhož jednání: jedno true, půjčka jedna', async () => {
    const id = await openNegotiation();
    const results = await Promise.all([
      negotiations.transaction((tx) => accept(tx, id)),
      negotiations.transaction((tx) => accept(tx, id)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await loans.allActive()).toHaveLength(1);
  });

  it('create je idempotentní podle jednání', async () => {
    const id = await openNegotiation();
    const first = await loans.create(loanOf(id));
    const second = await loans.create(loanOf(id));
    expect(second.id).toBe(first.id);
    expect(await loans.allActive()).toHaveLength(1);
  });

  it('splátky se sčítají a při dosažení celku půjčka splatí', async () => {
    const created = await loans.create(loanOf(await openNegotiation()));
    expect((await loans.pay(created.id, 100, NOW))?.status).toBe('active');
    const done = await loans.pay(created.id, 100, NOW);
    expect(done).toMatchObject({ status: 'repaid', paidKg: 200 });
    expect(done?.settledAt).not.toBeNull();
    // splacená půjčka už nic nepřijme
    expect(await loans.pay(created.id, 5, NOW)).toBeNull();
    expect(await loans.allActive()).toHaveLength(0);
  });

  it('souběžné splátky se nepřepíšou', async () => {
    const created = await loans.create(loanOf(await openNegotiation()));
    await Promise.all(Array.from({ length: 5 }, () => loans.pay(created.id, 10, NOW)));
    expect((await loans.byId(created.id))?.paidKg).toBe(50);
  });

  it('neplnění, zrušení podle jednání a podle dlužníka', async () => {
    const [, b] = ids as [string, string];
    const created = await loans.create(loanOf(await openNegotiation()));
    expect(await loans.addBreach(created.id)).toBe(true);
    expect((await loans.byId(created.id))?.breaches).toBe(1);
    expect(await loans.activeOfDebtor(b)).toHaveLength(1);
    expect(await loans.cancelOfDebtor(b, NOW)).toEqual([created.id]);
    expect((await loans.byId(created.id))?.status).toBe('cancelled');
    expect(await loans.addBreach(created.id)).toBe(false);
    expect(await loans.cancelOfNegotiation(created.negotiationId, NOW)).toBe(false);
  });
});
