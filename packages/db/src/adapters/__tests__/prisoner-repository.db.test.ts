import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  dayIndexOf,
  foundVillage,
  type PrisonerRecord,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createPrisonerRepository } from '../prisoner-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

// Rozhodnutí o zajatci (war.md – Vzdaní, zajetí a výkupné): o jednom zajetí projde jediné
// rozhodnutí, i když přijdou souběžně (web × web × jednání).

const db = createDatabase(testDatabaseUrl());
const prisoners = createPrisonerRepository(db);
const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
let villageId = '';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: 'hrac-1', name: '', email: 'hrac-1@example.com' });
  const settlement = await createSettlementRepository(db).createSeat({
    ownerId: 'hrac-1',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  });
  const state = foundVillage({
    seed: 11,
    day: DAY,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: {
      outline: [
        [0, 0],
        [40, 0],
        [40, 40],
      ],
      parts: Array.from({ length: 12 }, (_, i) => ({
        areaM2: 133.333333,
        distanceM: 40 + i * 3.7,
        naturalFertility: 61,
        surface: 'meadow' as const,
        obstacleCost: 0,
        cell: { x: 60 + i, y: 64 },
      })),
    },
  });
  const record = await createVillageRepository(db, 1).create(settlement!.id, 'Lhota', state);
  villageId = record!.id;
});

afterAll(async () => {
  await db.$client.end();
});

const record = (decision: PrisonerRecord['decision']): PrisonerRecord => ({
  id: 'tazeni-1:7',
  captorVillageId: villageId,
  homeVillageId: villageId,
  personId: 7,
  decision,
  decidedDay: DAY,
  decidedAt: new Date('2026-11-06T12:00:00Z'),
});

describe('prisoner repository', () => {
  it('při souběhu dvou rozhodnutí o zajatci projde jedno', async () => {
    const results = await Promise.all([
      prisoners.claim(record('released')),
      prisoners.claim(record('executed')),
      prisoners.claim(record('released')),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const saved = await prisoners.find('tazeni-1:7');
    expect(saved?.personId).toBe(7);
    expect(await prisoners.claim(record('executed'))).toBe(false);
  });

  it('neznámé zajetí nemá rozhodnutí', async () => {
    expect(await prisoners.find('nic:1')).toBeNull();
  });
});
