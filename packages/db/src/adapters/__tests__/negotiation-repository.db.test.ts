import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import type { NegotiationTx } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';
import { createNegotiationRepository } from '../negotiation-repository';
import { createVassalageRepository } from '../vassalage-repository';
import { createWarRepository } from '../war-repository';

const db = createDatabase(testDatabaseUrl());
const negotiations = createNegotiationRepository(db);
const vassalages = createVassalageRepository(db);
const houses = createHouseRepository(db);
const wars = createWarRepository(db);

const NOW = new Date('2026-11-05T12:00:00Z');
const ids: string[] = [];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  ids.length = 0;
  for (const id of ['a', 'b', 'c']) {
    await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
    ids.push((await houses.create({ playerId: id, kind: 'player', createdAt: NOW })).id);
  }
});

afterAll(async () => {
  await db.$client.end();
});

function round(author: string): {
  authorHouseId: string;
  items: [];
  message: string | null;
  at: Date;
} {
  return { authorHouseId: author, items: [], message: 'ahoj', at: NOW };
}

/** Přijetí jako použije use-case: zamknout, ověřit otevřené, podmíněně uzavřít, uzavřít vazalství. */
async function accept(
  tx: NegotiationTx,
  id: string,
  lord: string,
  vassal: string,
): Promise<boolean> {
  const n = await tx.getForUpdate(id);
  if (n?.status !== 'open') return false;
  if (!(await tx.setStatus(id, 'accepted', n.version, NOW))) return false;
  await tx.vassalages.create({
    lordHouseId: lord,
    vassalHouseId: vassal,
    terms: {},
    origin: 'negotiation',
    sinceAt: NOW,
    sinceDay: 1,
  });
  return true;
}

async function withdraw(tx: NegotiationTx, id: string): Promise<boolean> {
  const n = await tx.getForUpdate(id);
  if (n?.status !== 'open') return false;
  return tx.setStatus(id, 'withdrawn', n.version, NOW);
}

describe('NegotiationRepository (db)', () => {
  it('založí jednání s prvním kolem a načte ho', async () => {
    const [a, b] = ids as [string, string];
    const n = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    expect(n?.initiatorHouseId).toBe(a);
    expect(n?.recipientHouseId).toBe(b);
    const loaded = await negotiations.transaction((tx) => tx.getForUpdate(n?.id ?? ''));
    expect(loaded?.rounds).toHaveLength(1);
    expect(loaded?.status).toBe('open');
    await negotiations.transaction((tx) => tx.addRound(n?.id ?? '', round(b)));
    const again = await negotiations.transaction((tx) => tx.openBetween(b, a));
    expect(again?.rounds.map((r) => r.authorHouseId)).toEqual([a, b]);
  });

  it('dvě souběžná přijetí téhož jednání: jedno true, vazalství jedno', async () => {
    const [a, b] = ids as [string, string];
    const n = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    const id = n?.id ?? '';
    const results = await Promise.all([
      negotiations.transaction((tx) => accept(tx, id, a, b)),
      negotiations.transaction((tx) => accept(tx, id, a, b)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await vassalages.activeOf(a)).toHaveLength(1);
  });

  it('přijetí souběžně se stažením: projde jedno', async () => {
    const [a, b] = ids as [string, string];
    const n = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    const id = n?.id ?? '';
    const results = await Promise.all([
      negotiations.transaction((tx) => accept(tx, id, a, b)),
      negotiations.transaction((tx) => withdraw(tx, id)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const final = await negotiations.transaction((tx) => tx.getForUpdate(id));
    const lords = await vassalages.activeOf(a);
    expect(lords).toHaveLength(final?.status === 'accepted' ? 1 : 0);
  });

  it('setStatus s neaktuální verzí neprojde', async () => {
    const [a, b] = ids as [string, string];
    const n = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    const id = n?.id ?? '';
    expect(await negotiations.transaction((tx) => tx.setStatus(id, 'rejected', 1, NOW))).toBe(true);
    expect(await negotiations.transaction((tx) => tx.setStatus(id, 'withdrawn', 1, NOW))).toBe(
      false,
    );
    const final = await negotiations.transaction((tx) => tx.getForUpdate(id));
    expect(final).toMatchObject({ status: 'rejected', version: 2 });
    expect(final?.resolvedAt).toEqual(NOW);
  });

  it('A → B a B → A založené naráz: jedno otevřené', async () => {
    const [a, b] = ids as [string, string];
    const results = await Promise.all([
      negotiations.transaction((tx) =>
        tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
      ),
      negotiations.transaction((tx) =>
        tx.open({ initiatorHouseId: b, recipientHouseId: a, round: round(b) }),
      ),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const rows = await db.select().from(schema.negotiation);
    expect(rows).toHaveLength(1);
  });

  it('po uzavření jde otevřít další jednání mezi stejnými rody', async () => {
    const [a, b] = ids as [string, string];
    const first = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    await negotiations.transaction((tx) => tx.setStatus(first?.id ?? '', 'rejected', 1, NOW));
    const second = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: b, recipientHouseId: a, round: round(b) }),
    );
    expect(second).not.toBeNull();
  });

  it('allOpen vrátí jen otevřená jednání s koly; vypršelé (expired) už ne', async () => {
    const [a, b, c] = ids as [string, string, string];
    const ab = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    const ac = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: c, round: round(a) }),
    );
    const open = await negotiations.allOpen();
    expect(open.map((n) => n.id).sort()).toEqual([ab?.id, ac?.id].sort());
    expect(open[0]?.rounds).toHaveLength(1);
    expect(
      await negotiations.transaction((tx) => tx.setStatus(ab?.id ?? '', 'expired', 1, NOW)),
    ).toBe(true);
    expect((await negotiations.allOpen()).map((n) => n.id)).toEqual([ac?.id]);
    const expired = await negotiations.transaction((tx) => tx.getForUpdate(ab?.id ?? ''));
    expect(expired).toMatchObject({ status: 'expired', version: 2 });
  });

  it('blokování a poslední odmítnutí se čtou ve správném směru', async () => {
    const [a, b, c] = ids as [string, string, string];
    await negotiations.transaction(async (tx) => {
      await tx.setBlock(a, b, true, NOW);
      await tx.setBlock(a, b, true, NOW);
    });
    expect(await negotiations.transaction((tx) => tx.blocks(a, b))).toBe(true);
    expect(await negotiations.transaction((tx) => tx.blocks(b, a))).toBe(false);
    await negotiations.transaction((tx) => tx.setBlock(a, b, false, NOW));
    expect(await negotiations.transaction((tx) => tx.blocks(a, b))).toBe(false);

    const later = new Date('2026-11-06T12:00:00Z');
    expect(await negotiations.transaction((tx) => tx.lastReject(a, b))).toBeNull();
    await negotiations.transaction(async (tx) => {
      await tx.recordReject(a, b, NOW);
      await tx.recordReject(a, b, later);
    });
    expect(await negotiations.transaction((tx) => tx.lastReject(a, b))).toEqual(later);
    expect(await negotiations.transaction((tx) => tx.lastReject(b, a))).toBeNull();
    expect(await negotiations.transaction((tx) => tx.lastReject(a, c))).toBeNull();
  });

  it('účinky přijetí se vrátí s transakcí při chybě', async () => {
    const [a, b] = ids as [string, string];
    const n = await negotiations.transaction((tx) =>
      tx.open({ initiatorHouseId: a, recipientHouseId: b, round: round(a) }),
    );
    await expect(
      negotiations.transaction(async (tx) => {
        await accept(tx, n?.id ?? '', a, b);
        throw new Error('selhání');
      }),
    ).rejects.toThrow('selhání');
    expect(await vassalages.activeOf(a)).toHaveLength(0);
    const after = await negotiations.transaction((tx) => tx.getForUpdate(n?.id ?? ''));
    expect(after?.status).toBe('open');
  });

  it('dvě souběžná přijetí míru: jeden mír, válka skončí jednou; tribut se čte z přijatého jednání', async () => {
    const [a, b] = ids as [string, string];
    const goods = {
      grainKg: 100,
      hayKg: 0,
      cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
      horses: 0,
      logs: 0,
      people: { families: 0, men: 0, women: 0 },
      laborDays: 0,
    };
    const items = [{ kind: 'peace', tribute: { goods, payer: b } }];
    await wars.start({ houses: [a, b], startedAt: NOW, startedDay: 1, how: 'declared' });
    const n = await negotiations.transaction((tx) =>
      tx.open({
        initiatorHouseId: a,
        recipientHouseId: b,
        round: { authorHouseId: a, items: items as never, message: null, at: NOW },
      }),
    );
    const id = n?.id ?? '';
    const acceptPeace = (tx: NegotiationTx): Promise<boolean> =>
      (async () => {
        const rec = await tx.getForUpdate(id);
        if (rec?.status !== 'open') return false;
        if (!(await tx.setStatus(id, 'accepted', rec.version, NOW))) return false;
        const war = await tx.wars.activeBetween(a, b);
        return war ? tx.wars.end(war.id, 'peace', NOW) : false;
      })();
    const results = await Promise.all([
      negotiations.transaction(acceptPeace),
      negotiations.transaction(acceptPeace),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await wars.activeBetween(a, b)).toBeNull();
    const tributes = await negotiations.peaceTributes();
    expect(tributes).toHaveLength(1);
    expect(tributes[0]).toMatchObject({ payerHouseId: b, recipientHouseId: a });
  });
});
