import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { SeenCell, SeenPart } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createKnowledgeRepository } from '../knowledge-repository';

// Úložiště znalosti rodu (plán 2026-11-13 – Úloha 10): znalost po políčkách, sloučení pod zámkem
// řádku (souběžné zápisy se neztratí), cizí rod nic nevidí, zánik rodu znalost smaže.

const db = createDatabase(testDatabaseUrl());
const knowledge = createKnowledgeRepository(db);
const CELL = { x: 2, y: -1 };
let houseA = '';
let houseB = '';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['a', 'b'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
  const [a, b] = await db
    .insert(schema.house)
    .values([
      { playerId: 'a', kind: 'player', placedAt: new Date() },
      { playerId: 'b', kind: 'player', placedAt: new Date() },
    ])
    .returning();
  houseA = a!.id;
  houseB = b!.id;
});

afterAll(async () => {
  await db.$client.end();
});

function part(n: number, day: number, kind = 'dwelling'): SeenPart {
  return {
    key: `${kind}:${n}`,
    pos: { x: n, z: 0 },
    day,
    data: { kind } as unknown as SeenPart['data'],
  };
}

function cell(
  parts: SeenPart[],
  trail: [number, number][] = [],
  gone?: SeenCell['gone'],
): SeenCell {
  return { villageId: 'v', trail, parts, ...(gone ? { gone } : {}) };
}

describe('KnowledgeRepository', () => {
  it('uloží a přečte znalost po políčkách; neznámé políčko je null', async () => {
    expect(await knowledge.of(houseA, CELL)).toBeNull();
    const seen = cell(
      [part(1, 5)],
      [
        [-20, 0],
        [0, 0],
      ],
    );
    await knowledge.merge(houseA, CELL, seen);
    await knowledge.merge(houseA, { x: 0, y: 3 }, cell([], [[0, 0]]));
    expect(await knowledge.of(houseA, CELL)).toEqual(seen);
    expect(await knowledge.of(houseA, { x: 2, y: 0 })).toBeNull();
    expect(await knowledge.cellsOf(houseA)).toEqual([
      { x: 0, y: 3 },
      { x: 2, y: -1 },
    ]);
  });

  it('cizí rod nic nevidí', async () => {
    await knowledge.merge(houseA, CELL, cell([part(1, 5)]));
    expect(await knowledge.of(houseB, CELL)).toBeNull();
    expect(await knowledge.cellsOf(houseB)).toEqual([]);
  });

  it('sloučení: novější den přepíše, stopy se sjednotí, zánik odstraní, opakování nic nezmění', async () => {
    await knowledge.merge(houseA, CELL, cell([part(1, 5), part(2, 5)], [[0, 0]]));
    const later = cell([part(1, 8, 'ruin')], [[20, 0]], [{ key: 'dwelling:1', day: 8 }]);
    await knowledge.merge(houseA, CELL, later);
    const once = await knowledge.of(houseA, CELL);
    expect(once?.parts.map((p) => [p.key, p.day])).toEqual([
      ['dwelling:2', 5],
      ['ruin:1', 8],
    ]);
    expect(once?.trail).toEqual([
      [0, 0],
      [20, 0],
    ]);
    await knowledge.merge(houseA, CELL, later);
    expect(await knowledge.of(houseA, CELL)).toEqual(once);
  });

  it('souběžné zápisy do téhož rodu a políčka se neztratí', async () => {
    const writes = Array.from({ length: 12 }, (_, i) =>
      knowledge.merge(houseA, CELL, cell([part(i, 5)], [[i * 20, 0]])),
    );
    await Promise.all(writes);
    const seen = await knowledge.of(houseA, CELL);
    expect(seen?.parts).toHaveLength(12);
    expect(seen?.trail).toHaveLength(12);
  });

  it('zánik rodu smaže jeho znalost', async () => {
    await knowledge.merge(houseA, CELL, cell([part(1, 5)]));
    await knowledge.merge(houseB, CELL, cell([part(1, 5)]));
    await db.execute(sql`DELETE FROM "house" WHERE id = ${houseA}`);
    expect(await knowledge.cellsOf(houseA)).toEqual([]);
    expect(await knowledge.cellsOf(houseB)).toHaveLength(1);
  });
});
