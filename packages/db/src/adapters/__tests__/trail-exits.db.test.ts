import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { CURRENT_LAYER_VERSIONS, VILLAGE_DIGEST_VERSION, type TrailExit } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createTrailExitSource } from '../trail-exits';

// Výstupy zemských stezek sousedních vsí ze souhrnů (trade.md – Pokračování na sousední mapě;
// plán 2026-11-16-dense-forest – Rozhodnutí 13): jeden dotaz na 8 sousedních políček.

const db = createDatabase(testDatabaseUrl());
const source = createTrailExitSource(db);

const EAST: TrailExit = {
  direction: 'E',
  end: { x: 935, z: 120 },
  edge: { x: 960, z: 120 },
  builtDay: 3,
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

afterAll(async () => {
  await db.$client.end();
});

/** Sídlo hráče `id` na políčku (x, y) s vsí se souhrnem `digest` (null = bez vsi); id vsi. */
async function settled(
  id: string,
  x: number,
  y: number,
  digest: Record<string, unknown> | null,
  archived = false,
): Promise<string | null> {
  await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
  const [s] = await db
    .insert(schema.settlement)
    .values({
      ownerId: id,
      landscapeSeed: 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      gridX: x,
      gridY: y,
      ...(archived ? { archivedAt: new Date() } : {}),
    })
    .returning();
  if (!digest) return null;
  const [v] = await db
    .insert(schema.village)
    .values({
      settlementId: s!.id,
      name: `Ves ${id}`,
      state: {} as never,
      asleep: false,
      digest: digest as never,
      digestVersion: 1,
    })
    .returning();
  return v!.id;
}

const digestWith = (exits?: TrailExit[]): Record<string, unknown> => ({
  v: VILLAGE_DIGEST_VERSION,
  publicLineMen: [],
  ...(exits ? { trailExits: exits } : {}),
});

describe('TrailExitSource (Drizzle)', () => {
  it('vsi aktivních sídel na 8 sousedních políčkách – výstupy ze souhrnu, bez nich null', async () => {
    await settled('center', 0, 0, digestWith([EAST]));
    const east = await settled('east', 1, 0, digestWith([EAST]));
    const older = await settled('older', -1, 1, digestWith());
    await settled('far', 2, 0, digestWith([EAST]));
    await settled('gone', 0, 1, digestWith([EAST]), true);
    await settled('empty', 1, 1, null);
    const around = await source.trailExitsAround({ x: 0, y: 0 });
    expect(around).toEqual([
      { villageId: east, version: 1, cell: { x: 1, y: 0 }, exits: [EAST] },
      { villageId: older, version: 1, cell: { x: -1, y: 1 }, exits: null },
    ]);
  });

  it('souhrn jiné verze tvaru nebo starší verze stavu – exits null', async () => {
    const stale = await settled('stale', 1, 0, { ...digestWith([EAST]), v: -1 });
    const behind = await settled('behind', 0, -1, digestWith([EAST]));
    await db
      .update(schema.village)
      .set({ version: 2 })
      .where(sql`${schema.village.id} = ${behind}`);
    const around = await source.trailExitsAround({ x: 0, y: 0 });
    expect(around).toEqual([
      { villageId: behind, version: 2, cell: { x: 0, y: -1 }, exits: null },
      { villageId: stale, version: 1, cell: { x: 1, y: 0 }, exits: null },
    ]);
  });
});
