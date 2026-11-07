import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CURRENT_LAYER_VERSIONS, type Settlement } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';

const db = createDatabase(testDatabaseUrl());
const repository = createSettlementRepository(db);

const addPlayer = async (id: string): Promise<void> => {
  await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await addPlayer('hrac-1');
});

afterAll(async () => {
  await db.$client.end();
});

const base = { ownerId: 'hrac-1', landscapeSeed: 1234, layerVersions: CURRENT_LAYER_VERSIONS };
const origin = { x: 0, y: 0 };
const seat = { ...base, worldCell: origin };

/** Sídelní sídlo na volném políčku – v testech, kde na umístění nezáleží. */
const createdSeat = async (input: typeof seat = seat): Promise<Settlement> => {
  const created = await repository.createSeat(input);
  if (!created) throw new Error('Políčko je obsazené.');
  return created;
};

describe('createSettlementRepository', () => {
  it('createSeat založí sídlo a findSeat ho najde', async () => {
    const created = await createdSeat();
    expect(created).toMatchObject({ ...seat, isSeat: true, worldCell: origin });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await repository.findSeat('hrac-1')).toEqual(created);
  });

  it('druhé createSeat vrátí původní sídlo a seed se nezmění', async () => {
    const first = await repository.createSeat(seat);
    const second = await repository.createSeat({ ...seat, landscapeSeed: 9999 });
    expect(second).toEqual(first);
    expect(second?.landscapeSeed).toBe(1234);
  });

  it('pět souběžných createSeat vytvoří jediný řádek', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => repository.createSeat({ ...seat, landscapeSeed: n })),
    );
    expect(new Set(results.map((r) => r?.id)).size).toBe(1);
    const rows = await db.select().from(schema.settlement);
    expect(rows).toHaveLength(1);
  });

  it('findSeat neznámého hráče vrátí null', async () => {
    expect(await repository.findSeat('nikdo')).toBeNull();
  });

  it('listActive vrátí aktivní sídla hráče, sídelní první', async () => {
    const created = await createdSeat();
    const [other] = await db
      .insert(schema.settlement)
      .values({ ...base, landscapeSeed: 55, isSeat: false })
      .returning();
    const active = await repository.listActive('hrac-1');
    expect(active.map((s) => s.id)).toEqual([created.id, other!.id]);
    expect(active[0]).toEqual(created);
    expect(await repository.listActive('nikdo')).toEqual([]);
  });

  it('archive odloží sídlo – findSeat ani listActive ho nevrátí, data zůstanou', async () => {
    const created = await createdSeat();
    expect(await repository.archive(created.id)).toBe(true);
    expect(await repository.findSeat('hrac-1')).toBeNull();
    expect(await repository.listActive('hrac-1')).toEqual([]);
    const [row] = await db.select().from(schema.settlement);
    expect(row).toMatchObject({ id: created.id, isSeat: false, landscapeSeed: 1234 });
    expect(row?.archivedAt).toBeInstanceOf(Date);
    expect(await repository.archive(created.id)).toBe(false);
  });

  it('po archivaci jde založit nové sídelní sídlo s jiným seedem', async () => {
    const old = await createdSeat();
    await repository.archive(old.id);
    const fresh = await createdSeat({ ...seat, landscapeSeed: 4321 });
    expect(fresh.id).not.toBe(old.id);
    expect(fresh).toMatchObject({ isSeat: true, landscapeSeed: 4321 });
    expect(await repository.findSeat('hrac-1')).toEqual(fresh);
    expect(await db.select().from(schema.settlement)).toHaveLength(2);
  });

  it('souběžné archive archivují sídlo jen jednou', async () => {
    const created = await createdSeat();
    const results = await Promise.all([1, 2, 3].map(() => repository.archive(created.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('create založí nesídelní sídlo na políčku mřížky světa, obsazené políčko odmítne', async () => {
    const home = await createdSeat();
    const created = await repository.create({
      ...base,
      landscapeSeed: 77,
      worldCell: { x: 3, y: -2 },
    });
    expect(created).toMatchObject({
      ownerId: 'hrac-1',
      isSeat: false,
      landscapeSeed: 77,
      worldCell: { x: 3, y: -2 },
    });
    expect((await repository.listActive('hrac-1')).map((s) => s.id)).toEqual([
      home.id,
      created!.id,
    ]);
    expect(await repository.create({ ...base, worldCell: { x: 3, y: -2 } })).toBeNull();
    // mřížka je společná – ani jiný hráč na obsazené políčko nesmí
    await addPlayer('hrac-2');
    const taken = { ownerId: 'hrac-2', landscapeSeed: 78, layerVersions: CURRENT_LAYER_VERSIONS };
    expect(await repository.create({ ...taken, worldCell: { x: 3, y: -2 } })).toBeNull();
    expect(await repository.createSeat({ ...taken, worldCell: { x: 3, y: -2 } })).toBeNull();
    expect(await repository.findSeat('hrac-2')).toBeNull();
    const free = await repository.createSeat({ ...taken, worldCell: { x: 9, y: 9 } });
    expect(free).toMatchObject({ ownerId: 'hrac-2', worldCell: { x: 9, y: 9 } });
    expect(await repository.findSeat('hrac-1')).toEqual(home);
  });

  it('assignWorldCell dá sídlu bez polohy políčko, sídlo s polohou nemění', async () => {
    const [row] = await db
      .insert(schema.settlement)
      .values({ ...base, isSeat: true })
      .returning();
    const home = (await repository.findSeat('hrac-1'))!;
    expect(row!.id).toBe(home.id);
    expect(home.worldCell).toBeNull();
    const placed = await repository.assignWorldCell(home.id, { x: 0, y: 0 });
    expect(placed).toMatchObject({ id: home.id, worldCell: { x: 0, y: 0 } });
    const again = await repository.assignWorldCell(home.id, { x: 5, y: 5 });
    expect(again?.worldCell).toEqual({ x: 0, y: 0 });
    await repository.archive(home.id);
    expect(await repository.assignWorldCell(home.id, { x: 1, y: 1 })).toBeNull();
    expect(
      await repository.assignWorldCell('00000000-0000-0000-0000-000000000000', { x: 0, y: 0 }),
    ).toBeNull();
  });

  it('archivované sídlo políčko mřížky uvolní', async () => {
    const cell = { x: 0, y: 1 };
    const created = await repository.create({ ...base, worldCell: cell });
    expect(await repository.create({ ...base, worldCell: cell })).toBeNull();
    await repository.archive(created!.id);
    expect(await repository.create({ ...base, worldCell: cell })).toMatchObject({
      worldCell: cell,
    });
  });

  it('createSeat na políčku jiného hráče vrátí null, existující sídelní sídlo hráče vrátí vždy', async () => {
    const first = await createdSeat();
    await addPlayer('hrac-2');
    const other = { ownerId: 'hrac-2', landscapeSeed: 5, layerVersions: CURRENT_LAYER_VERSIONS };
    expect(await repository.createSeat({ ...other, worldCell: origin })).toBeNull();
    // hráč se sídlem dostane své sídlo, i když žádá o jiné (obsazené) políčko
    expect(await repository.createSeat({ ...seat, worldCell: { x: 7, y: 7 } })).toEqual(first);
  });

  it('souběžní nováčci na témže políčku: vyhraje jeden, ostatní dostanou null', async () => {
    for (const id of ['a', 'b', 'c']) await addPlayer(`hrac-${id}`);
    const results = await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        repository.createSeat({
          ownerId: `hrac-${id}`,
          landscapeSeed: 1,
          layerVersions: CURRENT_LAYER_VERSIONS,
          worldCell: { x: 4, y: 4 },
        }),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it('occupiedCells vrátí aktivní mapy všech hráčů s polohou', async () => {
    await createdSeat();
    await addPlayer('hrac-2');
    const second = await repository.create({
      ownerId: 'hrac-2',
      landscapeSeed: 6,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 16, y: 2 },
    });
    await db.insert(schema.settlement).values({ ...base, ownerId: 'hrac-2', isSeat: false }); // bez polohy
    expect(await repository.occupiedCells()).toEqual(
      expect.arrayContaining([
        { ownerId: 'hrac-1', cell: origin },
        { ownerId: 'hrac-2', cell: { x: 16, y: 2 } },
      ]),
    );
    expect(await repository.occupiedCells()).toHaveLength(2);
    await repository.archive(second!.id);
    expect(await repository.occupiedCells()).toEqual([{ ownerId: 'hrac-1', cell: origin }]);
  });

  it('smazání hráče smaže i jeho sídla', async () => {
    await createdSeat();
    await db.execute(sql`DELETE FROM "user" WHERE id = 'hrac-1'`);
    expect(await db.select().from(schema.settlement)).toHaveLength(0);
  });
});
