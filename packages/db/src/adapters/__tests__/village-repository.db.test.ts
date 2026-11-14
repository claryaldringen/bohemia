import path from 'node:path';
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  advanceVillage,
  dayIndexOf,
  foundVillage,
  isVillageAbandoned,
  isVillageExtinct,
  newSteward,
  settleStewardDepartures,
  settlersOf,
  stewardDepartureOrigin,
  villageDigest,
  type VillageRecord,
  type VillageState,
  type VillageYearRow,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository, newVillageRow } from '../village-repository';
import { encodeVillageState } from '../village-state-codec';

const db = createDatabase(testDatabaseUrl());
const villages = createVillageRepository(db);
const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const UNKNOWN = '00000000-0000-0000-0000-000000000000';
let settlementId = '';

const state = (): VillageState =>
  foundVillage({
    seed: 11,
    day: DAY,
    dwellingPosition: { x: -50.25, z: 12.125, rotation: 0.3 },
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
  settlementId = settlement!.id;
});

afterAll(async () => {
  await db.$client.end();
});

/** Další (nesídelní) sídlo hráče na políčku `x` mřížky – jedna ves, jedna mapa. */
async function nextMap(x: number): Promise<string> {
  const created = await createSettlementRepository(db).create({
    ownerId: 'hrac-1',
    landscapeSeed: 1 + x,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x, y: 0 },
  });
  return created!.id;
}

/** Ves na nové mapě `x` (`create` – jediná ves sídla). */
async function villageOnMap(x: number, name: string, s: VillageState): Promise<VillageRecord> {
  return (await villages.create(await nextMap(x), name, s))!;
}

describe('createVillageRepository', () => {
  it('create založí ves s vlastním id a verzí 1, find ji podle id vrátí beze změny stavu', async () => {
    const created = await villages.create(settlementId, 'Libice', state());
    expect(created).toEqual({
      id: expect.any(String),
      settlementId,
      name: 'Libice',
      state: state(),
      version: 1,
    });
    expect(created!.id).not.toBe(settlementId);
    expect(await villages.find(created!.id)).toEqual(created);
  });

  it('druhé create vrátí null a ves nezmění – první ves sídla jen jednou', async () => {
    const first = await villages.create(settlementId, 'Libice', state());
    expect(await villages.create(settlementId, 'Jiná', state())).toBeNull();
    expect(await villages.listBySettlement(settlementId)).toEqual([first]);
  });

  it('z pěti souběžných create projde jediné', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => villages.create(settlementId, `Ves ${n}`, state())),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await db.select().from(schema.village)).toHaveLength(1);
  });

  it('create neznámého sídla nic nezaloží', async () => {
    expect(await villages.create(UNKNOWN, 'Libice', state())).toBeNull();
    expect(await db.select().from(schema.village)).toHaveLength(0);
  });

  it('sídlo má nejvýš jednu ves – unikátní index pustí jen jednu i mimo create', async () => {
    const first = await villages.create(settlementId, 'Libice', state());
    expect(await villages.listBySettlement(settlementId)).toEqual([first]);
    // přímý zápis mimo adaptér druhou ves téhož sídla nepustí (jedna ves, jedna mapa)
    await expect(
      db.insert(schema.village).values(newVillageRow(settlementId, 'Budeč', state())),
    ).rejects.toThrow();
    expect(await villages.listBySettlement(settlementId)).toHaveLength(1);
    expect(await villages.listBySettlement(UNKNOWN)).toEqual([]);
  });

  it('stampsOf vrátí id, sídlo, jméno, verzi a den dopočtu vsí sídel – bez stavu', async () => {
    const first = await villages.create(settlementId, 'Libice', state());
    const second = await villageOnMap(1, 'Budeč', state());
    const later = advanceVillage(state(), DAY + 5, null);
    await villages.save(second.id, later, 1);
    const stamps = await villages.stampsOf([settlementId, second.settlementId, UNKNOWN]);
    expect(stamps.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        id: second.id,
        settlementId: second.settlementId,
        name: 'Budeč',
        version: 2,
        lastDay: later.lastDay,
        asleep: false,
      },
      {
        id: first!.id,
        settlementId,
        name: 'Libice',
        version: 1,
        lastDay: state().lastDay,
        asleep: false,
      },
    ]);
    expect(await villages.stampsOf([])).toEqual([]);
    expect(await villages.stampsOf([UNKNOWN])).toEqual([]);
  });

  it('stampsOfVillages vrátí otisky vsí podle id – post do schránky zvedne verzi, jméno jde zvlášť', async () => {
    const first = (await villages.create(settlementId, 'Libice', state()))!;
    const second = await villageOnMap(1, 'Budeč', state());
    const later = advanceVillage(state(), DAY + 5, null);
    await villages.save(second.id, later, 1);
    const stamps = await villages.stampsOfVillages([first.id, second.id, UNKNOWN, 'ne-uuid']);
    expect(stamps.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        id: second.id,
        settlementId: second.settlementId,
        name: 'Budeč',
        version: 2,
        lastDay: later.lastDay,
        asleep: false,
      },
      {
        id: first.id,
        settlementId,
        name: 'Libice',
        version: 1,
        lastDay: state().lastDay,
        asleep: false,
      },
    ]);
    expect(await villages.stampsOfVillages([])).toEqual([]);
    expect(await villages.stampsOfVillages([UNKNOWN, 'ne-uuid'])).toEqual([]);
    // tažení podle otisku pozná změnu: schránka zvedá verzi, přejmenování mění jméno
    await villages.inbox.post({
      villageId: first.id,
      day: DAY + 1,
      ref: 'stamp:1',
      body: { kind: 'shipment', goods: {} } as never,
    });
    await villages.rename(first.id, 'Libuše');
    const [after] = await villages.stampsOfVillages([first.id]);
    expect(after).toMatchObject({ version: 2, name: 'Libuše', lastDay: state().lastDay });
  });

  it('archivedOf vrátí vsi archivovaných sídel – záznam vsi zůstal (Začít znovu)', async () => {
    const kept = (await villages.create(settlementId, 'Libice', state()))!;
    const archived = await villageOnMap(1, 'Budeč', state());
    expect(await villages.archivedOf([kept.id, archived.id])).toEqual([]);
    await createSettlementRepository(db).archive(archived.settlementId);
    expect(await villages.archivedOf([kept.id, archived.id, UNKNOWN, 'ne-uuid'])).toEqual([
      archived.id,
    ]);
    expect(await villages.find(archived.id)).not.toBeNull();
    expect(await villages.archivedOf([])).toEqual([]);
  });

  it('sloupce last_day a asleep se plní při každém zápisu a shodují se s pravidly domény', async () => {
    const awake = await villages.create(settlementId, 'Žije', state());
    const extinct = await villageOnMap(1, 'Vymřela', { ...state(), extinctDay: DAY + 3 });
    const abandoned = await villageOnMap(2, 'Opuštěna', { ...state(), abandonedDay: DAY + 4 });
    const stamps = await villages.stampsOf([
      settlementId,
      extinct.settlementId,
      abandoned.settlementId,
    ]);
    for (const stamp of stamps) {
      const record = (await villages.find(stamp.id))!;
      expect(stamp.asleep).toBe(isVillageExtinct(record.state) || isVillageAbandoned(record.state));
      expect(stamp.lastDay).toBe(record.state.lastDay);
    }
    expect(
      stamps
        .filter((s) => s.asleep)
        .map((s) => s.id)
        .sort(),
    ).toEqual([extinct.id, abandoned.id].sort());
    // save přepíše oba sloupce – odvozuje je adaptér ze stavu při každém zápisu
    const later = advanceVillage(state(), DAY + 9, null);
    await villages.save(awake!.id, { ...later, extinctDay: DAY + 9 }, 1);
    const [after] = (await villages.stampsOf([settlementId])).filter((s) => s.id === awake!.id);
    expect(after).toMatchObject({ lastDay: later.lastDay, asleep: true });
    await villages.save(awake!.id, later, 2);
    const [woken] = (await villages.stampsOf([settlementId])).filter((s) => s.id === awake!.id);
    expect(woken).toMatchObject({ lastDay: later.lastDay, asleep: false });
  });

  it('digestsOf vrátí souhrn uložené verze bez stavu – po každém zápisu nový, bez souhrnu nic', async () => {
    const first = (await villages.create(settlementId, 'Libice', state()))!;
    const second = await villageOnMap(1, 'Lhota', { ...state(), extinctDay: DAY + 2 });
    const digests = await villages.digestsOf([first.id, second.id, UNKNOWN, 'neni-uuid']);
    const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1);
    expect(digests.sort(byId)).toEqual(
      [
        {
          id: first.id,
          settlementId,
          name: 'Libice',
          version: 1,
          digest: villageDigest(first.state),
        },
        {
          id: second.id,
          settlementId: second.settlementId,
          name: 'Lhota',
          version: 1,
          digest: villageDigest(second.state),
        },
      ].sort(byId),
    );
    // save souhrn obnoví (týž stav jako uložený)
    const later = advanceVillage(state(), DAY + 9, null);
    await villages.save(first.id, later, 1);
    const [saved] = await villages.digestsOf([first.id]);
    expect(saved).toMatchObject({ version: 2, digest: villageDigest(later) });
    expect(saved?.digest.lastDay).toBe(DAY + 9);
    // stav zapsaný mimo adaptér (e2e, ruční SQL) zvýší verzi – starý souhrn neplatí
    await db.execute(sql`UPDATE village SET version = version + 1 WHERE id = ${first.id}`);
    expect(await villages.digestsOf([first.id])).toEqual([]);
    // ves uložená před souhrnem (null) nebo se souhrnem jiné verze tvaru chybí – načte se celá
    await db.execute(sql`UPDATE village SET digest = NULL WHERE id = ${first.id}`);
    await db.execute(sql`UPDATE village SET digest = '{"v":0}'::jsonb WHERE id = ${second.id}`);
    expect(await villages.digestsOf([first.id, second.id])).toEqual([]);
    expect(await villages.digestsOf([])).toEqual([]);
  });

  it('fronta „nejvíc pozadu“ jde ze sloupců bez JSON a využije index', async () => {
    const a = await villages.create(settlementId, 'A', state());
    const b = await villageOnMap(1, 'B', advanceVillage(state(), DAY + 5, null));
    await villageOnMap(2, 'C', { ...state(), extinctDay: DAY + 1 });
    const behind = sql`SELECT id FROM village WHERE NOT asleep AND settlement_id = ${settlementId}
      AND last_day < ${DAY + 8} ORDER BY last_day ASC, id ASC`;
    const rows = await db.execute<{ id: string }>(behind);
    expect(rows.rows.map((r) => r.id)).toEqual([a!.id]);
    const all = sql`SELECT id FROM village WHERE NOT asleep AND last_day < ${DAY + 8}
      ORDER BY last_day ASC, id ASC`;
    expect((await db.execute<{ id: string }>(all)).rows.map((r) => r.id)).toEqual([a!.id, b.id]);
    // na tak malé tabulce plánovač index nevybere sám – ověříme, že ho jde použít
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const plan = await tx.execute<{ 'QUERY PLAN': string }>(sql`EXPLAIN ${behind}`);
      expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('village_awake_day_idx');
    });
  });

  it('weatherSeedOf vrátí seed počasí sídla – každé sídlo jiný, neznámé null', async () => {
    const seed = await villages.weatherSeedOf(settlementId);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 31);
    expect(await villages.weatherSeedOf(settlementId)).toBe(seed);
    const other = await createSettlementRepository(db).create({
      ownerId: 'hrac-1',
      landscapeSeed: 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    if (!other) throw new Error('Druhé sídlo nešlo založit.');
    expect(await villages.weatherSeedOf(other.id)).not.toBe(seed);
    expect(await villages.weatherSeedOf(UNKNOWN)).toBeNull();
    expect(await villages.weatherSeedOf('neni-uuid')).toBeNull();
  });

  it('find neznámé vsi i řetězce, který není UUID, vrátí null', async () => {
    expect(await villages.find(UNKNOWN)).toBeNull();
    expect(await villages.find('village-1')).toBeNull();
  });

  it('save s aktuální verzí uloží stav a zvýší verzi, se starou verzí vrátí null', async () => {
    const { id } = (await villages.create(settlementId, 'Libice', state()))!;
    const next = advanceVillage(state(), DAY + 10, null);
    const saved = await villages.save(id, next, 1);
    // záznam nese předaný stav – databáze ho zpátky neposílá
    expect(saved?.state).toBe(next);
    expect(saved).toMatchObject({ id, settlementId, name: 'Libice' });
    expect(saved).toMatchObject({ id, version: 2, state: next });
    expect(await villages.save(id, state(), 1)).toBeNull();
    expect((await villages.find(id))?.state.lastDay).toBe(DAY + 10);
  });

  it('save jedné vsi hráče druhou ves nezmění', async () => {
    const first = (await villages.create(settlementId, 'Libice', state()))!;
    const second = await villageOnMap(1, 'Budeč', state());
    await villages.save(second.id, advanceVillage(state(), DAY + 3, null), 1);
    expect(await villages.find(first.id)).toEqual(first);
    expect((await villages.find(second.id))?.version).toBe(2);
  });

  it('ze souběžných save se stejnou verzí projde jediný', async () => {
    const { id } = (await villages.create(settlementId, 'Libice', state()))!;
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => villages.save(id, advanceVillage(state(), DAY + n, null), 1)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect((await villages.find(id))?.version).toBe(2);
  });

  /** Uložený řádek vsi se všemi sloupci (bajty stavu, otisk země). */
  const rowOf = async (id: string): Promise<typeof schema.village.$inferSelect> =>
    (await db.select().from(schema.village).where(eq(schema.village.id, id)))[0]!;

  it('stav jde kodekem po částech – načtení vrátí tentýž JSON včetně pořadí klíčů', async () => {
    const next = advanceVillage(state(), DAY + 20, null);
    const created = (await villages.create(settlementId, 'Libice', state()))!;
    await villages.save(created.id, next, 1);
    expect(JSON.stringify((await villages.find(created.id))!.state)).toBe(JSON.stringify(next));
    const row = await rowOf(created.id);
    expect(row.state).toBeNull();
    expect(row.landHash).toBe(encodeVillageState(next).landHash);
    expect(row.lastDay).toBe(next.lastDay);
  });

  it('save zapíše zem jen při změně – stejný otisk nechá `state_land` netknutý', async () => {
    const created = (await villages.create(settlementId, 'Libice', state()))!;
    const first = await rowOf(created.id);
    // značka: tatáž zem jinak komprimovaná (týž JSON, jiné bajty) – přepis země by ji smazal
    const marker = zstdCompressSync(zstdDecompressSync(first.stateLand!), {
      params: { [constants.ZSTD_c_compressionLevel]: 19 },
    });
    expect(marker.equals(first.stateLand!)).toBe(false);
    await db
      .update(schema.village)
      .set({ stateLand: marker })
      .where(eq(schema.village.id, created.id));
    const dayOnly = { ...created.state, storesKg: created.state.storesKg + 5, lastDay: DAY + 1 };
    expect(await villages.save(created.id, dayOnly, 1)).not.toBeNull();
    const kept = await rowOf(created.id);
    expect(kept).toMatchObject({ version: 2, landHash: first.landHash });
    expect(kept.stateLand!.equals(marker)).toBe(true);
    expect(kept.stateDay!.equals(first.stateDay!)).toBe(false);
    expect(JSON.stringify((await villages.find(created.id))!.state)).toBe(JSON.stringify(dayOnly));
    // změna země se zapíše celá
    const landChanged = { ...dayOnly, parts: dayOnly.parts.slice(1) };
    expect(await villages.save(created.id, landChanged, 2)).not.toBeNull();
    const rewritten = await rowOf(created.id);
    expect(rewritten.landHash).not.toBe(first.landHash);
    expect(rewritten.stateLand!.equals(marker)).toBe(false);
    expect(JSON.stringify((await villages.find(created.id))!.state)).toBe(
      JSON.stringify(landChanged),
    );
  });

  it('starý řádek jen s jsonb `state` se načte a prvním uložením převede (líný převod)', async () => {
    const old = state();
    const [inserted] = await db
      .insert(schema.village)
      .values({ settlementId, name: 'Stará', state: old, asleep: false, lastDay: old.lastDay })
      .returning({ id: schema.village.id });
    const found = (await villages.find(inserted!.id))!;
    expect(found).toMatchObject({ version: 1, state: old });
    expect(await villages.save(found.id, found.state, 1)).not.toBeNull();
    const row = await rowOf(found.id);
    expect(row).toMatchObject({ state: null, version: 2, digestVersion: 2 });
    expect(row.landHash).toBe(encodeVillageState(found.state).landHash);
    expect(row.stateDay).not.toBeNull();
    expect(row.stateLand).not.toBeNull();
    expect(JSON.stringify((await villages.find(found.id))!.state)).toBe(
      JSON.stringify(found.state),
    );
  });

  it('save se starou verzí a jinou zemí nezapíše nic – ani zem', async () => {
    const created = (await villages.create(settlementId, 'Libice', state()))!;
    expect(await villages.save(created.id, { ...created.state, storesKg: 1 }, 1)).not.toBeNull();
    const before = await rowOf(created.id);
    const stale = { ...created.state, parts: created.state.parts.slice(2) };
    expect(await villages.save(created.id, stale, 1)).toBeNull();
    expect(await rowOf(created.id)).toEqual(before);
  });

  it('dopočítání po uložení a načtení dá totéž jako bez databáze (JSON nic nezmění)', async () => {
    const stored = advanceVillage(state(), DAY + 400, null);
    const { id } = (await villages.create(settlementId, 'Libice', stored))!;
    const loaded = await villages.find(id);
    const later = DAY + 900;
    expect(advanceVillage(loaded!.state, later, null)).toEqual(advanceVillage(stored, later, null));
  });

  it('opevnění ve stavu vsi projde adaptérem tam a zpět beze změny (fortifications.md)', async () => {
    const s = state();
    const fortificationId = s.nextId++;
    s.fortifications = [
      {
        id: fortificationId,
        grid: { x: 3.5, z: -7.25, rotation: Math.PI / 12 },
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        kind: 'rampart',
        top: 'palisade',
        segments: Array.from({ length: 8 }, (_, index) => ({
          index,
          builtDay: DAY - 20 + index,
          topBuiltDay: index < 3 ? DAY - 2 : null,
          state: 1,
          ...(index === 5 ? { breachedDay: DAY - 1 } : {}),
        })),
        gates: [{ segment: 2, offsetM: 3.25, x: 18.5, z: -4.125 }],
        rampartHeight: 0.875,
      },
    ];
    s.constructions.push({
      id: s.nextId++,
      kind: 'fortification',
      startedDay: DAY - 2,
      cost: 40,
      done: 12.5,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      fortificationId,
      fortWork: 'top',
      fortSegments: [3, 4, 5, 6, 7].map((index) => ({ index, cost: 8 })),
      wood: { trees: 20, fromPile: 20, fell: [], felled: 0 },
    });
    const { id } = (await villages.create(settlementId, 'Libice', s))!;
    const loaded = await villages.find(id);
    expect(loaded?.state).toEqual(s);
    const later = DAY + 60;
    expect(advanceVillage(loaded!.state, later, null)).toEqual(advanceVillage(s, later, null));
  });

  it('rename změní jméno, stav ani verzi ne; neznámá ves vrátí false', async () => {
    const { id } = (await villages.create(settlementId, 'Libice', state()))!;
    expect(await villages.rename(id, 'Testovice')).toBe(true);
    expect(await villages.find(id)).toMatchObject({
      name: 'Testovice',
      version: 1,
      state: state(),
    });
    expect(await villages.rename(UNKNOWN, 'Jiná')).toBe(false);
  });

  it('addOnce založí ves s klíčem jen jednou, findByOrigin ji najde – i z pěti souběžných', async () => {
    const keyed = { ...state(), origin: 'steward-son:a:1' };
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => villages.addOnce(settlementId, `Ves ${n}`, keyed)),
    );
    const ids = new Set(results.map((r) => r?.id));
    expect(ids.size).toBe(1);
    expect(await db.select().from(schema.village)).toHaveLength(1);
    expect((await villages.findByOrigin('steward-son:a:1'))?.id).toBe(results[0]?.id);
    expect(await villages.findByOrigin('steward-son:a:2')).toBeNull();
    expect(await villages.addOnce(UNKNOWN, 'Ves', { ...keyed, origin: 'x' })).toBeNull();
  });

  it('addOnce se stejným klíčem na dvou různých sídlech založí ves jen jednou (unikátní index)', async () => {
    const other = await createSettlementRepository(db).createSeat({
      ownerId: 'hrac-1',
      landscapeSeed: 2,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    const otherId = other!.id;
    const keyed = { ...state(), origin: 'steward-son:b:1' };
    const results = await Promise.all([
      villages.addOnce(settlementId, 'Ves A', keyed),
      villages.addOnce(otherId, 'Ves B', keyed),
      villages.addOnce(settlementId, 'Ves C', keyed),
      villages.addOnce(otherId, 'Ves D', keyed),
    ]);
    expect(new Set(results.map((r) => r?.id)).size).toBe(1);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(await db.select().from(schema.village)).toHaveLength(1);
    expect((await villages.findByOrigin('steward-son:b:1'))?.id).toBe(results[0]?.id);
  });

  it('settleStewardDepartures s adaptérem: souběžné vybavení schránky založí ves syna jednou', async () => {
    const base = state();
    const mother: VillageState = {
      ...base,
      steward: {
        ...newSteward(DAY, true),
        departures: [
          {
            id: DAY,
            sonId: 1,
            seed: 5,
            name: 'Lhota',
            directions: [{ direction: 'N', travelDays: 2 }],
            settlers: settlersOf(base),
          },
        ],
      },
    };
    const added = (await villages.create(settlementId, 'Libice', mother))!;
    const deps = {
      settlements: createSettlementRepository(db),
      villages,
      worldSeed: 7,
    };
    const input = { playerId: 'hrac-1', villageId: added.id };
    await Promise.all([settleStewardDepartures(deps, input), settleStewardDepartures(deps, input)]);
    expect(await settleStewardDepartures(deps, input)).toEqual([]);
    const all = await db.select().from(schema.village);
    const sons = all.filter((v) => v.origin === stewardDepartureOrigin(added.id, DAY));
    expect(sons).toHaveLength(1);
    expect(sons[0]?.name).toBe('Lhota');
    const marked = (await villages.find(added.id))?.state.steward?.departures?.[0];
    expect(marked?.villageId).toBe(sons[0]?.id);
    expect(marked?.settlers).toBeUndefined();
    // Čas, ne souběh: obě vybavení generují krajinu sídla (CPU) – pod zátěží to přesáhlo 5 s,
    // než došlo na kteroukoli kontrolu.
  }, 60_000);

  it('smazání hráče smaže sídla i všechny jeho vsi', async () => {
    await villages.create(settlementId, 'Libice', state());
    await villageOnMap(1, 'Budeč', state());
    await db.execute(sql`DELETE FROM "user" WHERE id = 'hrac-1'`);
    expect(await db.select().from(schema.village)).toHaveLength(0);
  });

  describe('deník vsí', () => {
    const row = (year: number, births: number): VillageYearRow => ({
      year,
      day: 365 * (year - 500) + 364,
      adults: 12,
      children: 7,
      births,
      deaths: 2,
      deathsHunger: 1,
      harvestKg: 9000,
      storesKg: 4000,
      hungryDays: 3,
      fieldM2: 40000,
      sownM2: 30000,
      herds: { sheep: 4, goat: 2, pig: 1, cow: 3 },
      stewardOn: true,
      built: { dwelling: 1, field: 2 },
      sonsLeft: 0,
      disasters: { hail: 1 },
      chronicleFull: false,
    });
    const rowsOf = (id: string): Promise<(typeof schema.villageYear.$inferSelect)[]> =>
      db
        .select()
        .from(schema.villageYear)
        .where(sql`${schema.villageYear.villageId} = ${id}`)
        .orderBy(schema.villageYear.year);

    it('save zapíše řádky roků a opakovaný zápis řádek roku přepíše', async () => {
      const created = (await villages.create(settlementId, 'Libice', state()))!;
      const saved = (await villages.save(created.id, state(), 1, [row(500, 5), row(501, 6)]))!;
      expect((await rowsOf(created.id)).map((r) => [r.year, r.births])).toEqual([
        [500, 5],
        [501, 6],
      ]);
      await villages.save(created.id, state(), saved.version, [row(501, 9)]);
      const rows = await rowsOf(created.id);
      expect(rows.map((r) => [r.year, r.births])).toEqual([
        [500, 5],
        [501, 9],
      ]);
      expect(rows[1]?.data.built).toEqual({ dwelling: 1, field: 2 });
    });

    it('save se starou verzí neuloží ani řádky', async () => {
      const created = (await villages.create(settlementId, 'Libice', state()))!;
      expect(await villages.save(created.id, state(), 99, [row(500, 5)])).toBeNull();
      expect(await rowsOf(created.id)).toHaveLength(0);
    });

    it('smazání vsi smaže i její deník', async () => {
      const created = (await villages.create(settlementId, 'Libice', state()))!;
      await villages.save(created.id, state(), 1, [row(500, 5)]);
      await db.execute(sql`DELETE FROM village WHERE id = ${created.id}`);
      expect(await db.select().from(schema.villageYear)).toHaveLength(0);
    });
  });
});
