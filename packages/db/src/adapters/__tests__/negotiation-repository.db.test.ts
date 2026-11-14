import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import type { Accepted, NegotiationTx, OutboxPolicy } from '@bohemia/game';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
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

// Schránka účinků přijatého jednání (audit A2): zápis v transakci přijetí, výběr nevyřízených,
// provedení pod zámkem řádku a smazání.
describe('schránka účinků přijetí (db)', () => {
  const POLICY: OutboxPolicy = { leaseMs: 60_000, retryMs: (attempts) => attempts * 60_000 };
  /** Druhý proces (worker) – vlastní pool. */
  const workerDb = createDatabase(testDatabaseUrl());
  const worker = createNegotiationRepository(workerDb);

  afterAll(async () => {
    await workerDb.$client.end();
  });

  const effects = (id: string): Accepted => ({
    v: 1,
    negotiationId: id,
    rounds: 1,
    day: 7,
    actors: {
      actor: { id: ids[1]!, playerId: 'b', lord: { villageId: 'ves-b', personId: 3 } },
      other: { id: ids[0]!, playerId: 'a', lord: null },
    },
    oath: null,
    aid: null,
    trading: null,
    gift: null,
    peace: null,
    ransoming: null,
    newcomerHouseId: null,
    peaceLater: null,
  });

  async function opened(recipient = 1): Promise<string> {
    const record = await negotiations.transaction((tx) =>
      tx.open({
        initiatorHouseId: ids[0]!,
        recipientHouseId: ids[recipient]!,
        round: round(ids[0]!),
      }),
    );
    return record!.id;
  }

  /** Zápis schránky v transakci přijetí; vrací nájem zapisujícího. */
  const put = (id: string, leaseMs = 0): Promise<string> =>
    negotiations.transaction((tx) => tx.putOutbox(id, effects(id), NOW, leaseMs));

  const pending = async (): Promise<string[]> =>
    (await negotiations.pendingOutboxes(10, 10)).map((d) => d.negotiationId);

  const row = async (
    id: string,
  ): Promise<typeof schema.negotiationOutbox.$inferSelect | undefined> =>
    (
      await db
        .select()
        .from(schema.negotiationOutbox)
        .where(sql`${schema.negotiationOutbox.negotiationId} = ${id}`)
    )[0];

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it('zápis v transakci přijetí – chyba ji vrátí; zapisující ji drží v nájmu od zápisu', async () => {
    const id = await opened();
    await expect(
      negotiations.transaction(async (tx) => {
        await tx.putOutbox(id, effects(id), NOW, POLICY.leaseMs);
        throw new Error('chyba přijetí');
      }),
    ).rejects.toThrow('chyba přijetí');
    expect(await row(id)).toBeUndefined();
    const claim = await put(id, POLICY.leaseMs);
    const stored = await row(id);
    // nájem od zápisu podle hodin databáze, ne od `at` (začátek požadavku)
    expect(stored!.nextAt.getTime() - Date.now()).toBeGreaterThan(50_000);
    expect(stored!.createdAt).toEqual(NOW);
    // jiný proces ji během nájmu nevezme, zapisující (s nájmem) hned
    expect(await pending()).toEqual([]);
    expect(await worker.withOutbox(id, async () => 'worker', POLICY)).toBeNull();
    expect(await negotiations.withOutbox(id, async (e) => e, POLICY, claim)).toEqual({
      value: effects(id),
    });
    expect(await row(id)).toBeUndefined();
    expect(await negotiations.withOutbox(id, async () => 1, POLICY, claim)).toBeNull();
  });

  it('spadne-li zapisující po commitu, vezme ji jiný proces až po konci nájmu', async () => {
    const id = await opened();
    await put(id, 300);
    expect(await worker.withOutbox(id, async () => 1, POLICY)).toBeNull();
    await sleep(400);
    expect(await pending()).toEqual([id]);
    expect(await worker.withOutbox(id, async () => 'worker', POLICY)).toEqual({ value: 'worker' });
    expect(await pending()).toEqual([]);
  });

  it('výjimka: pokus, chyba a odklad; výběr napřed s méně pokusy; vyčerpaná se nebere', async () => {
    const stuck = await opened();
    const fresh = await opened(2);
    await put(stuck);
    const instant: OutboxPolicy = { leaseMs: 60_000, retryMs: () => 0 };
    for (const n of [1, 2, 3]) {
      await expect(
        negotiations.withOutbox(
          stuck,
          async () => {
            throw new Error(`pád ${n}`);
          },
          instant,
        ),
      ).rejects.toThrow(`pád ${n}`);
    }
    expect(await row(stuck)).toMatchObject({ attempts: 3, lastError: 'pád 3', claim: null });
    await put(fresh);
    // zaseklá je starší, ale nová jde dřív; po limitu pokusů se zaseklá nebere vůbec
    expect(await negotiations.pendingOutboxes(1, 10)).toEqual([
      { negotiationId: fresh, attempts: 0 },
    ]);
    expect(await negotiations.pendingOutboxes(10, 3)).toEqual([
      { negotiationId: fresh, attempts: 0 },
    ]);
    // odklad po výjimce (1 min): mezitím ji nikdo nevezme
    await expect(
      worker.withOutbox(
        fresh,
        async () => {
          throw new Error('pád');
        },
        POLICY,
      ),
    ).rejects.toThrow('pád');
    expect((await row(fresh))!.nextAt.getTime() - Date.now()).toBeGreaterThan(50_000);
    expect(await pending()).toEqual([stuck]);
    expect(await negotiations.withOutbox(fresh, async () => 1, POLICY)).toBeNull();
  });

  it('web a worker nad stejnou schránkou současně: účinky jednou, nájem se během účinků obnovuje', async () => {
    const id = await opened();
    await put(id);
    const short: OutboxPolicy = { leaseMs: 300, retryMs: () => 0 };
    let runs = 0;
    const web = negotiations.withOutbox(
      id,
      async () => {
        runs++;
        await sleep(1200);
        return 'web';
      },
      short,
    );
    while (runs === 0) await sleep(5);
    // i po několika délkách nájmu ji worker nevezme – web nájem obnovuje
    for (let i = 0; i < 4; i++) {
      expect(await worker.withOutbox(id, async () => runs++, short)).toBeNull();
      await sleep(250);
    }
    expect(await web).toEqual({ value: 'web' });
    expect(runs).toBe(1);
    expect(await pending()).toEqual([]);
    // naráz bez čekání: zase jednou
    const other = await opened(2);
    await put(other);
    const both = await Promise.all(
      [negotiations, worker].map((repo) =>
        repo.withOutbox(
          other,
          async () => {
            runs++;
            await sleep(50);
          },
          POLICY,
        ),
      ),
    );
    expect(runs).toBe(2);
    expect(both.filter((b) => b !== null)).toHaveLength(1);
  });

  it('ukončené spojení webu během účinků: nájem platí dál, worker ji nevezme, web ji dokončí', async () => {
    const name = 'bohemia-outbox-web';
    const url = new URL(testDatabaseUrl());
    url.searchParams.set('application_name', name);
    const webDb = createDatabase(url.toString());
    // nečinné spojení ukončené databází – pool ho zahodí, proces nesmí spadnout
    const errors: string[] = [];
    webDb.$client.on('error', (error) => errors.push(error.message));
    const web = createNegotiationRepository(webDb);
    try {
      const id = await opened();
      const claim = await web.transaction((tx) =>
        tx.putOutbox(id, effects(id), NOW, POLICY.leaseMs),
      );
      const short: OutboxPolicy = { leaseMs: 300, retryMs: () => 0 };
      let runs = 0;
      let terminated = 0;
      const done = web.withOutbox(
        id,
        async () => {
          runs++;
          await sleep(100);
          const killed = await db.execute(
            sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                WHERE application_name = ${name} AND pid <> pg_backend_pid()`,
          );
          terminated = killed.rows.length;
          await sleep(700);
          // účinek dál jde přes týž pool – nové spojení
          await web.allOpen();
          return 'web';
        },
        short,
        claim,
      );
      while (runs === 0) await sleep(5);
      for (let i = 0; i < 4; i++) {
        await sleep(200);
        expect(await worker.withOutbox(id, async () => runs++, short)).toBeNull();
      }
      expect(await done).toEqual({ value: 'web' });
      expect(terminated).toBeGreaterThan(0);
      expect(runs).toBe(1);
      expect(await row(id)).toBeUndefined();
    } finally {
      await webDb.$client.end();
    }
  });

  it('pool o 1 spojení: účinky, které samy berou spojení, doběhnou – schránka spojení nedrží', async () => {
    const tinyDb = drizzle(new Pool({ connectionString: testDatabaseUrl(), max: 1 }), { schema });
    const tiny = createNegotiationRepository(tinyDb);
    try {
      const id = await opened();
      const claim = await tiny.transaction((tx) =>
        tx.putOutbox(id, effects(id), NOW, POLICY.leaseMs),
      );
      const done = tiny.withOutbox(
        id,
        async () => {
          await tiny.allOpen();
          return 'ok';
        },
        POLICY,
        claim,
      );
      const stuck = sleep(5000).then(() => 'uvázlo');
      expect(await Promise.race([done, stuck])).toEqual({ value: 'ok' });
    } finally {
      await tinyDb.$client.end();
    }
  });
});
