import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CURRENT_LAYER_VERSIONS, foundVillage, type SeenCell, type SeenPart } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createKnowledgeRepository } from '../knowledge-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

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
  it('knownCellsOf jedním dotazem: id vsi a počet staveb ze znalosti, sídlo bez archivu, vsi a rod', async () => {
    const settlements = createSettlementRepository(db);
    const villages = createVillageRepository(db);
    const place = { landscapeSeed: 1, layerVersions: CURRENT_LAYER_VERSIONS };
    const state = foundVillage({ seed: 1, day: 0, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    const held = await settlements.createSeat({
      ...place,
      ownerId: 'b',
      worldCell: { x: 3, y: 0 },
    });
    const village = (await villages.create(held!.id, 'Budeč', state))!;
    const gone = await settlements.create({ ...place, ownerId: 'b', worldCell: { x: 4, y: 0 } });
    await villages.create(gone!.id, 'Stará', state);
    await settlements.archive(gone!.id);
    await knowledge.merge(houseA, { x: 3, y: 0 }, { ...cell([part(1, 3)]), villageId: village.id });
    await knowledge.merge(houseA, { x: 4, y: 0 }, cell([], [[1, 1]]));
    await knowledge.merge(houseA, { x: 9, y: 9 }, { trail: [[1, 1]], parts: [] });
    await knowledge.merge(houseB, { x: 3, y: 0 }, cell([part(2, 3)]));
    expect(await knowledge.knownCellsOf(houseA)).toEqual([
      {
        cell: { x: 3, y: 0 },
        seenVillageId: village.id,
        seenParts: 1,
        villageIds: [village.id],
        holderHouseId: houseB,
      },
      // archivované sídlo políčko nedrží
      {
        cell: { x: 4, y: 0 },
        seenVillageId: 'v',
        seenParts: 0,
        villageIds: [],
        holderHouseId: null,
      },
      {
        cell: { x: 9, y: 9 },
        seenVillageId: null,
        seenParts: 0,
        villageIds: [],
        holderHouseId: null,
      },
    ]);
    // držitel bez živého rodu
    await db.execute(sql`UPDATE house SET ended_at = now() WHERE id = ${houseB}`);
    expect((await knowledge.knownCellsOf(houseA))[0]?.holderHouseId).toBeNull();
    expect(await knowledge.knownCellsOf(houseB)).toHaveLength(1);
  });

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
