import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { CampaignState } from '@bohemia/game';
import { createDatabase, createLockPool } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createCampaignLock } from '../campaign-lock';
import { createCampaignRepository } from '../campaign-repository';
import { createHouseRepository } from '../house-repository';
import { createWarRepository } from '../war-repository';

// Úložiště a zámek tažení (Úloha 6.5, Review bod 5): kontrolní bod beze ztráty přesnosti, záměr
// v minulosti odmítnut, záměr do spočtených taktů bod zastaví, tažení počítá jen jeden worker.

const URL = testDatabaseUrl();
const db = createDatabase(URL);
const campaigns = createCampaignRepository(db);
const houses = createHouseRepository(db);
const wars = createWarRepository(db);
const poolA = createLockPool(URL, 2);
const poolB = createLockPool(URL, 2);
const workerA = createCampaignLock(poolA);
const workerB = createCampaignLock(poolB);
const NOW = new Date('2026-11-06T12:00:00Z');
const ID = '00000000-0000-4000-8000-0000000000c1';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

let warId = '';
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['a', 'b'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
  const a = await houses.create({ playerId: 'a', kind: 'player', createdAt: NOW });
  const b = await houses.create({ playerId: 'b', kind: 'player', createdAt: NOW });
  warId = (
    await wars.start({ houses: [a.id, b.id], startedAt: NOW, startedDay: 1, how: 'declared' })
  ).war.id;
});

afterAll(async () => {
  await Promise.all([db.$client.end(), poolA.end(), poolB.end()]);
});

/** Stav tažení s čísly, která JSON a jsonb musí vrátit bit po bitu. */
function state(tick: number, extra: Partial<CampaignState> = {}): CampaignState {
  return {
    id: ID,
    warId,
    seed: 7,
    tick,
    day: 3,
    phase: 'marching',
    playerId: 'a',
    leaderName: 'Bořivoj',
    commander: { villageId: 'v', personId: 1 },
    deputy: null,
    assembly: { villageId: 'v', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
    target: { villageId: 'w', cell: { x: 1, y: 0 }, pos: { x: -880, z: 0 } },
    members: [],
    groups: [
      {
        id: 0,
        order: 'follow-leader',
        cell: { x: 0, y: 0 },
        pos: { x: 0.1 + 0.2, z: -1e-7 },
        goal: null,
        route: [],
        leg: { points: [{ x: 1 / 3, z: 2 / 3 }], meadowM: [Math.PI * 1e5], walkedM: 1e21 },
        arrived: false,
      },
    ],
    supplies: { foodKg: 12.345678901234567 },
    loot: { foodKg: 0, herd: 0 },
    captives: [],
    liveCommand: true,
    discovered: [],
    returnReason: null,
    ...extra,
  };
}

const SET_OUT = { kind: 'set-out' as const };

describe('campaign repository', () => {
  it('kontrolní bod vrátí stav bit po bitu (jsonb mění jen pořadí klíčů)', async () => {
    await campaigns.create(state(100), NOW);
    const point = await campaigns.checkpoint(ID);
    expect(point?.state).toStrictEqual(state(100));
    expect(point?.outbox).toBeNull();
    expect(await campaigns.active()).toEqual([ID]);
    // tažení vůdce – jen jeho a jen běžící (panel Vojsko)
    expect(await campaigns.activeOf('a')).toEqual([ID]);
    expect(await campaigns.activeOf('b')).toEqual([]);
    // tažení proti vsi – scéna napadené vsi
    expect(await campaigns.activeAgainst('w')).toEqual([ID]);
    expect(await campaigns.activeAgainst('v')).toEqual([]);
  });

  it('tažení, ve kterém jdou muži vazala, je i jeho (panel Vojsko – Ú6.17)', async () => {
    // v bodu záleží jen na hráči muže – zbytek muže test nepotřebuje
    const member = (playerId: string): CampaignState['members'][number] =>
      ({ ref: { villageId: 'v', personId: 1 }, playerId }) as CampaignState['members'][number];
    await campaigns.create(state(100, { members: [member('a'), member('b')] }), NOW);
    expect(await campaigns.activeOf('a')).toEqual([ID]);
    expect(await campaigns.activeOf('b')).toEqual([ID]);
    expect(await campaigns.activeOf('c')).toEqual([]);
  });

  it('záměr s taktem nejvýš bodem odmítne, za bodem zapíše; seq roste', async () => {
    await campaigns.create(state(100), NOW);
    expect(await campaigns.addIntent(ID, { tick: 100, byPlayer: 'a', body: SET_OUT })).toBeNull();
    const first = await campaigns.addIntent(ID, { tick: 102, byPlayer: 'a', body: SET_OUT });
    const second = await campaigns.addIntent(ID, { tick: 101, byPlayer: 'a', body: SET_OUT });
    expect(first?.seq).toBeLessThan(second!.seq);
    expect((await campaigns.intentsAfter(ID, 100)).map((i) => i.tick)).toEqual([101, 102]);
    expect(await campaigns.intentsAfter(ID, 101)).toHaveLength(1);
  });

  it('uložení: posunutý bod nebo nový záměr do spočtených taktů = stale; konec tažení', async () => {
    await campaigns.create(state(100), NOW);
    await campaigns.addIntent(ID, { tick: 120, byPlayer: 'a', body: SET_OUT });
    const save = (fromTick: number, seenIntents: number, tick: number): Promise<string> =>
      campaigns.saveCheckpoint(ID, { fromTick, seenIntents, state: state(tick), outbox: null });
    expect(await save(100, 0, 140)).toBe('stale');
    expect(await save(99, 1, 140)).toBe('stale');
    expect(await save(100, 1, 140)).toBe('saved');
    expect(await campaigns.addIntent(ID, { tick: 140, byPlayer: 'a', body: SET_OUT })).toBeNull();

    const outbox = {
      villageEvents: [],
      notices: [{ playerId: 'a', kind: 'campaign-returned' as const, payload: {}, gameDay: 3 }],
    };
    expect(
      await campaigns.saveCheckpoint(ID, {
        fromTick: 140,
        seenIntents: 0,
        state: state(150, { phase: 'done' }),
        outbox,
      }),
    ).toBe('saved');
    // skončené tažení s nedoručenými událostmi se ještě dopočítává (doručení), pak už ne
    expect(await campaigns.active()).toEqual([ID]);
    expect(await campaigns.activeOf('a')).toEqual([]);
    expect(await campaigns.activeAgainst('w')).toEqual([]);
    expect((await campaigns.checkpoint(ID))?.outbox).toEqual(outbox);
    await campaigns.clearOutbox(ID, 149);
    expect(await campaigns.active()).toEqual([ID]);
    await campaigns.clearOutbox(ID, 150);
    expect(await campaigns.active()).toEqual([]);
    expect(await campaigns.addIntent(ID, { tick: 999, byPlayer: 'a', body: SET_OUT })).toBeNull();
  });

  it('souběh záměrů s uložením bodu: každý záměr buď bod zastaví, nebo se nezapíše', async () => {
    await campaigns.create(state(100), NOW);
    for (let round = 0; round < 10; round++) {
      const from = 100 + round * 10;
      const [saved, intent] = await Promise.all([
        campaigns.saveCheckpoint(ID, {
          fromTick: from,
          seenIntents: 0,
          state: state(from + 10),
          outbox: null,
        }),
        campaigns.addIntent(ID, { tick: from + 5, byPlayer: 'a', body: SET_OUT }),
      ]);
      // uložený bod se záměrem uvnitř spočtených taktů by záměr ztratil
      expect(saved === 'saved' && intent !== null).toBe(false);
      if (saved === 'stale') {
        expect(
          await campaigns.saveCheckpoint(ID, {
            fromTick: from,
            seenIntents: 1,
            state: state(from + 10),
            outbox: null,
          }),
        ).toBe('saved');
      }
    }
  });
});

describe('campaign lock', () => {
  it('dva workery – tažení počítá jen jeden, druhý ho přeskočí; po uvolnění ho vezme', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let entered = (): void => undefined;
    const inside = new Promise<void>((r) => (entered = r));
    const runs: string[] = [];
    const first = workerA.tryRun(ID, async () => {
      runs.push('A');
      entered();
      await gate;
      return 'A';
    });
    await inside;
    expect(await workerB.tryRun(ID, () => Promise.resolve(runs.push('B')))).toEqual({ ran: false });
    expect(await workerB.tryRun('jiné', () => Promise.resolve('jiné'))).toEqual({
      ran: true,
      value: 'jiné',
    });
    release();
    expect(await first).toEqual({ ran: true, value: 'A' });
    expect(await workerB.tryRun(ID, () => Promise.resolve('B'))).toEqual({ ran: true, value: 'B' });
    expect(runs).toEqual(['A']);
  });
});
