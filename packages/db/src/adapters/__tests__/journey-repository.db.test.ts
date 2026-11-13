import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { JourneyState } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createJourneyRepository } from '../journey-repository';

// Úložiště výjezdů (plán 2026-11-13 – Úloha 3): stejná sémantika kontrolního bodu a záměrů jako
// u tažení, hráč má nejvýš jeden běžící výjezd.

const db = createDatabase(testDatabaseUrl());
const journeys = createJourneyRepository(db);
const NOW = new Date('2026-11-13T12:00:00Z');
const ID = '00000000-0000-4000-8000-0000000000e1';
const ID2 = '00000000-0000-4000-8000-0000000000e2';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['a', 'b'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
});

afterAll(async () => {
  await db.$client.end();
});

/** Stav výjezdu s čísly, která JSON a jsonb musí vrátit bit po bitu. */
function state(tick: number, extra: Partial<JourneyState> = {}): JourneyState {
  return {
    kind: 'journey',
    id: ID,
    seed: 7,
    tick,
    day: 3,
    throughDay: 2,
    phase: 'out',
    playerId: 'a',
    houseId: 'h',
    leaderName: 'Bořivoj',
    home: { villageId: 'v', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
    members: [],
    groups: [
      {
        id: 0,
        order: 'follow-leader',
        cell: { x: 4, y: 2 },
        pos: { x: 0.1 + 0.2, z: -1e-7 },
        goal: null,
        route: [],
        leg: { points: [{ x: 1 / 3, z: 2 / 3 }], meadowM: [Math.PI * 1e5], walkedM: 1e21 },
        arrived: false,
      },
    ],
    arrivedTick: null,
    ...extra,
  } as JourneyState;
}

const HOME = { kind: 'home' as const };

describe('journey repository', () => {
  it('založení a kontrolní bod bit po bitu; active, activeOf, onCell', async () => {
    await journeys.create(state(100), NOW);
    const point = await journeys.checkpoint(ID);
    expect(point?.state).toStrictEqual(state(100));
    expect(point?.outbox).toBeNull();
    expect(await journeys.checkpoint(ID2)).toBeNull();
    expect(await journeys.active()).toEqual([ID]);
    expect(await journeys.activeOf('a')).toBe(ID);
    expect(await journeys.activeOf('b')).toBeNull();
    expect(await journeys.onCell({ x: 4, y: 2 })).toEqual([ID]);
    expect(await journeys.onCell({ x: 2, y: 4 })).toEqual([]);
  });

  it('druhý běžící výjezd téhož hráče se nezaloží; po skončení ano', async () => {
    await journeys.create(state(100), NOW);
    await expect(journeys.create(state(100, { id: ID2 }), NOW)).rejects.toThrow();
    // neúspěšné založení nenechá po sobě bod ani řádek
    expect(await journeys.checkpoint(ID2)).toBeNull();
    await journeys.create(state(100, { id: ID2, playerId: 'b' }), NOW);
    await journeys.saveCheckpoint(ID, {
      fromTick: 100,
      seenIntents: 0,
      state: state(110, { phase: 'done' }),
      outbox: null,
    });
    await journeys.create(state(120, { id: '00000000-0000-4000-8000-0000000000e3' }), NOW);
    expect(await journeys.activeOf('a')).toBe('00000000-0000-4000-8000-0000000000e3');
  });

  it('záměr s taktem nejvýš bodem odmítne, za bodem zapíše; seq roste', async () => {
    await journeys.create(state(100), NOW);
    expect(await journeys.addIntent(ID, { tick: 100, byPlayer: 'a', body: HOME })).toBeNull();
    const first = await journeys.addIntent(ID, { tick: 102, byPlayer: 'a', body: HOME });
    const second = await journeys.addIntent(ID, { tick: 101, byPlayer: 'a', body: HOME });
    expect(first?.seq).toBeLessThan(second!.seq);
    expect((await journeys.intentsAfter(ID, 100)).map((i) => i.tick)).toEqual([101, 102]);
    expect(await journeys.intentsAfter(ID, 101)).toHaveLength(1);
    expect(await journeys.addIntent(ID2, { tick: 200, byPlayer: 'a', body: HOME })).toBeNull();
  });

  it('uložení: posunutý bod nebo nový záměr do spočtených taktů = stale; konec výjezdu', async () => {
    await journeys.create(state(100), NOW);
    await journeys.addIntent(ID, { tick: 120, byPlayer: 'a', body: HOME });
    const save = (fromTick: number, seenIntents: number, tick: number): Promise<string> =>
      journeys.saveCheckpoint(ID, { fromTick, seenIntents, state: state(tick), outbox: null });
    expect(await save(100, 0, 140)).toBe('stale');
    expect(await save(99, 1, 140)).toBe('stale');
    expect(await save(100, 1, 140)).toBe('saved');
    expect(await journeys.addIntent(ID, { tick: 140, byPlayer: 'a', body: HOME })).toBeNull();

    const outbox = {
      villageEvents: [],
      notices: [{ playerId: 'a', kind: 'campaign-returned' as const, payload: {}, gameDay: 3 }],
    };
    expect(
      await journeys.saveCheckpoint(ID, {
        fromTick: 140,
        seenIntents: 0,
        state: state(150, { phase: 'done' }),
        outbox,
      }),
    ).toBe('saved');
    // skončený výjezd s nedoručenými událostmi se počítá dál, ale už není běžící
    expect(await journeys.active()).toEqual([ID]);
    expect(await journeys.activeOf('a')).toBeNull();
    expect(await journeys.onCell({ x: 4, y: 2 })).toEqual([]);
    expect(await journeys.addIntent(ID, { tick: 200, byPlayer: 'a', body: HOME })).toBeNull();
    // verze bodu se mění zápisem řádku
    const before = await journeys.checkpoint(ID);
    expect(before?.outbox).toEqual(outbox);
    await journeys.clearOutbox(ID, 149);
    expect((await journeys.checkpoint(ID))?.outbox).toEqual(outbox);
    await journeys.clearOutbox(ID, 150);
    const after = await journeys.checkpoint(ID);
    expect(after?.outbox).toBeNull();
    expect(after?.version).not.toBe(before?.version);
    expect(await journeys.active()).toEqual([]);
  });
});
