import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  isCurrentDigest,
  nearbyRefresh,
  settlementMerchantStops,
  type MerchantStop,
  type VillageDigestRecord,
  type VillageRecord,
  type VillageRepository,
  type VillageStamp,
  type VillageYearRow,
} from '@bohemia/game';
import type { Database } from '../client';
import { createInboxRepository } from './inbox-repository';
import { createSettlementRepository } from './settlement-repository';
import { createVillageHolds } from './village-holds';
import { encodeVillageState, type EncodedVillageState } from './village-state-codec';
import { storedVillageState, villageDerivedColumns } from './village-state-row';
import { settlement, village, villageYear } from '../schema';

type VillageRow = typeof village.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sloupce zápisu stavu bez zemské části: denní část (kodek – village-state-codec.ts), otisk země,
 * odvozené sloupce a souhrn (zdroj pravdy je stav) s verzí, kterou zápis vsi dá (`digestVersion`
 * = nová `version`). Starý jsonb `state` se vynuluje (líný převod).
 */
type WrittenColumns = Omit<
  typeof village.$inferInsert,
  'settlementId' | 'name' | 'digestVersion'
> & { digestVersion: number | SQL };

function written(
  encoded: EncodedVillageState,
  state: VillageRecord['state'],
  digestVersion: number | SQL,
): WrittenColumns {
  return {
    state: null,
    stateDay: encoded.day,
    landHash: encoded.landHash,
    ...villageDerivedColumns(state),
    digestVersion,
  };
}

/** Celý řádek nové vsi – zem se zapisuje vždy (i pro testy, které vkládají řádek samy). */
export function newVillageRow(
  settlementId: string,
  name: string,
  state: VillageRecord['state'],
): WrittenColumns & Pick<typeof village.$inferInsert, 'settlementId' | 'name'> {
  const encoded = encodeVillageState(state);
  return {
    settlementId,
    name,
    ...written(encoded, state, 1),
    stateLand: encoded.land(),
    version: 1,
  };
}

type SavedRow = Pick<VillageRow, 'id' | 'settlementId' | 'name' | 'version'>;

/** Řádek deníku vsi pro zápis. */
function yearValues(villageId: string, r: VillageYearRow): typeof villageYear.$inferInsert {
  const { year, day, adults, children, births, deaths, deathsHunger } = r;
  return {
    villageId,
    year,
    day,
    adults,
    children,
    births,
    deaths,
    deathsHunger,
    harvestKg: r.harvestKg,
    storesKg: r.storesKg,
    hungryDays: r.hungryDays,
    fieldM2: r.fieldM2,
    sownM2: r.sownM2,
    data: {
      herds: r.herds,
      stewardOn: r.stewardOn,
      built: r.built,
      sonsLeft: r.sonsLeft,
      disasters: r.disasters,
      chronicleFull: r.chronicleFull,
    },
  };
}

/** Přepis řádku deníku při shodě (ves + rok): všechny sloupce z nové hodnoty. */
function yearConflictSet(): Record<string, SQL> {
  return {
    day: sql`excluded.day`,
    adults: sql`excluded.adults`,
    children: sql`excluded.children`,
    births: sql`excluded.births`,
    deaths: sql`excluded.deaths`,
    deathsHunger: sql`excluded.deaths_hunger`,
    harvestKg: sql`excluded.harvest_kg`,
    storesKg: sql`excluded.stores_kg`,
    hungryDays: sql`excluded.hungry_days`,
    fieldM2: sql`excluded.field_m2`,
    sownM2: sql`excluded.sown_m2`,
    data: sql`excluded.data`,
    writtenAt: sql`now()`,
  };
}

function toRecord(row: VillageRow): VillageRecord {
  return {
    id: row.id,
    settlementId: row.settlementId,
    name: row.name,
    state: storedVillageState(row),
    version: row.version,
  };
}

/**
 * Sloupce otisku vsi – den dopočtu a spánek jsou uložené sloupce (odvozené ze stavu při zápisu),
 * stav se nepřenáší ani nedekóduje.
 */
const STAMP_COLUMNS = {
  id: village.id,
  settlementId: village.settlementId,
  name: village.name,
  version: village.version,
  lastDay: village.lastDay,
  asleep: village.asleep,
};

/** lastDay je ve stavu vždy; null by znamenalo poškozený řádek – ves je pak „nejvíc pozadu“. */
function toStamp(row: Omit<VillageStamp, 'lastDay'> & { lastDay: number | null }): VillageStamp {
  return { ...row, lastDay: row.lastDay ?? 0 };
}

/**
 * Drizzle adaptér portu VillageRepository – optimistické zamykání přes sloupec version. Sídlo
 * může mít víc vsí; první ves sídla zakládá `create` atomicky (zámek řádku sídla). Ze seedu světa
 * `worldSeed` jsou zastávky stezek (`merchantStopsOf`) – povinný na všech místech, kde se úložiště
 * zakládá.
 */
export function createVillageRepository(db: Database, worldSeed: number): VillageRepository {
  // Hledání podle klíče založení jde přes unikátní index `village_origin_uq` (sloupec `origin`).
  const byOrigin = async (origin: string): Promise<VillageRecord | null> => {
    const [row] = await db
      .select()
      .from(village)
      .where(eq(village.origin, origin))
      .orderBy(asc(village.createdAt))
      .limit(1);
    return row ? toRecord(row) : null;
  };
  // schránka vsí nad tabulkou `village_inbox` (docs/code/world.md – Schránka vsi)
  const inbox = createInboxRepository(db);
  const repository: VillageRepository = {
    inbox,
    // bariéra ves × tažení (village-holds.ts) – dopočet vsi nepředběhne tažení u ní
    holds: createVillageHolds(db),
    // okolí vsi v pevné dny (nearby.ts) – dopočet zapíše snímek sousedních vsí před dnem obnovy;
    // sousedé z otisků vsí, jejich souhrnů (svobodní) a sídel, bez načtení stavů – každé úložiště
    // v DB ho má, ať den snímku nezávisí na tom, kdo ves přes den obnovy dopočítá
    nearby: nearbyRefresh({
      villages: {
        inbox,
        stampsOf: (ids) => repository.stampsOf(ids),
        stampsOfVillages: (ids) => repository.stampsOfVillages(ids),
        digestsOf: (ids) => repository.digestsOf(ids),
      },
      settlements: createSettlementRepository(db),
    }),

    async find(villageId): Promise<VillageRecord | null> {
      // id vsi přichází i zvenku (cookie, vstup akce) – jiný řetězec než UUID by dotaz shodil
      if (!UUID.test(villageId)) return null;
      const [row] = await db.select().from(village).where(eq(village.id, villageId)).limit(1);
      return row ? toRecord(row) : null;
    },

    async weatherSeedOf(settlementId): Promise<number | null> {
      if (!UUID.test(settlementId)) return null;
      const [row] = await db
        .select({ weatherSeed: settlement.weatherSeed })
        .from(settlement)
        .where(eq(settlement.id, settlementId))
        .limit(1);
      return row?.weatherSeed ?? null;
    },

    async merchantStopsOf(settlementId): Promise<readonly MerchantStop[] | null> {
      if (!UUID.test(settlementId)) return null;
      const [row] = await db
        .select({ x: settlement.gridX, y: settlement.gridY, skeleton: settlement.skeleton })
        .from(settlement)
        .where(eq(settlement.id, settlementId))
        .limit(1);
      if (!row) return null;
      const cell = row.x === null || row.y === null ? null : { x: row.x, y: row.y };
      return settlementMerchantStops(worldSeed, cell, row.skeleton);
    },

    async listBySettlement(settlementId): Promise<VillageRecord[]> {
      const rows = await db
        .select()
        .from(village)
        .where(eq(village.settlementId, settlementId))
        .orderBy(asc(village.createdAt), asc(village.id));
      return rows.map(toRecord);
    },

    async create(settlementId, name, state): Promise<VillageRecord | null> {
      // Atomicky: souběžná založení první vsi se seřadí na zámku řádku sídla – projde jen první,
      // ostatní už ves uvidí. Neznámé sídlo nemá co zamknout – nic se nezaloží.
      return db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: settlement.id })
          .from(settlement)
          .where(eq(settlement.id, settlementId))
          .for('update');
        if (!owner) return null;
        const [existing] = await tx
          .select({ id: village.id })
          .from(village)
          .where(eq(village.settlementId, settlementId))
          .limit(1);
        if (existing) return null;
        const [row] = await tx
          .insert(village)
          .values(newVillageRow(settlementId, name, state))
          .returning();
        return row ? toRecord(row) : null;
      });
    },

    findByOrigin: byOrigin,

    async addOnce(settlementId, name, state): Promise<VillageRecord | null> {
      const origin = state.origin;
      if (origin === undefined) throw new Error('Ves bez klíče založení (origin).');
      if (!UUID.test(settlementId)) return null;
      // Atomicky: souběžná vybavení téže schránky se seřadí na zámku řádku sídla – druhé už ves
      // s klíčem uvidí a vrátí ji.
      try {
        return await db.transaction(async (tx) => {
          const [owner] = await tx
            .select({ id: settlement.id })
            .from(settlement)
            .where(eq(settlement.id, settlementId))
            .for('update');
          if (!owner) return null;
          const [existing] = await tx
            .select()
            .from(village)
            .where(eq(village.origin, origin))
            .limit(1);
          if (existing) return toRecord(existing);
          // jedna ves, jedna mapa – sídlo s jinou vsí nic nezaloží
          const [other] = await tx
            .select({ id: village.id })
            .from(village)
            .where(eq(village.settlementId, settlementId))
            .limit(1);
          if (other) return null;
          const [row] = await tx
            .insert(village)
            .values(newVillageRow(settlementId, name, state))
            .returning();
          return row ? toRecord(row) : null;
        });
      } catch (error) {
        // souběh na různých sídlech: unikátní index `village_origin_uq` pustil jen jednu ves (index
        // `village_settlement_uq` – jinou ves sídla – zámek řádku sídla nepustí, `byOrigin` pak null)
        if (!isUniqueViolation(error)) throw error;
        return byOrigin(origin);
      }
    },

    async save(villageId, state, expectedVersion, yearRows = []): Promise<VillageRecord | null> {
      const encoded = encodeVillageState(state);
      // Zpět jen identitu, jméno a verzi – stav (u velké vsi přes 1 MB JSON) má volající v ruce.
      // Napřed bez země (otisk země se shoduje s uloženým – zem se nepřepíše ani nekomprimuje);
      // když se nic nezapsalo, zem se změnila (nebo jde o starý řádek bez `land_hash`), nebo je
      // verze jiná – druhý pokus zapíše i zem a o konfliktu verze rozhodne sám.
      const update = async (tx: Pick<Database, 'update'>): Promise<SavedRow | undefined> => {
        const values = {
          ...written(encoded, state, sql`${village.version} + 1`),
          version: sql`${village.version} + 1`,
          updatedAt: sql`now()`,
        };
        const sameVersion = and(eq(village.id, villageId), eq(village.version, expectedVersion));
        const returning = {
          id: village.id,
          settlementId: village.settlementId,
          name: village.name,
          version: village.version,
        };
        const [kept] = await tx
          .update(village)
          .set(values)
          .where(and(sameVersion, eq(village.landHash, encoded.landHash)))
          .returning(returning);
        if (kept) return kept;
        const [rewritten] = await tx
          .update(village)
          .set({ ...values, stateLand: encoded.land() })
          .where(sameVersion)
          .returning(returning);
        return rewritten;
      };
      if (yearRows.length === 0) {
        const row = await update(db);
        return row ? { ...row, state } : null;
      }
      // řádky deníku jen s úspěšným zápisem stavu, v téže transakci (idempotentně: ves + rok)
      return db.transaction(async (tx) => {
        const row = await update(tx);
        if (!row) return null;
        await tx
          .insert(villageYear)
          .values(yearRows.map((r) => yearValues(villageId, r)))
          .onConflictDoUpdate({
            target: [villageYear.villageId, villageYear.year],
            set: yearConflictSet(),
          });
        return { ...row, state };
      });
    },

    async rename(villageId, name): Promise<boolean> {
      // Jméno je mimo stav simulace – verze (zámek stavu) se nemění.
      const rows = await db
        .update(village)
        .set({ name, updatedAt: sql`now()` })
        .where(eq(village.id, villageId))
        .returning({ id: village.id });
      return rows.length > 0;
    },

    async digestsOf(villageIds): Promise<VillageDigestRecord[]> {
      const ids = villageIds.filter((id) => UUID.test(id));
      if (ids.length === 0) return [];
      // jen malý souhrn (pár KB) – stav vsi se nepřenáší ani neparsuje
      const rows = await db
        .select({
          id: village.id,
          settlementId: village.settlementId,
          name: village.name,
          version: village.version,
          digest: village.digest,
        })
        .from(village)
        // souhrn jen k uložené verzi stavu (zápis mimo adaptér ho zneplatní)
        .where(and(inArray(village.id, ids), eq(village.digestVersion, village.version)));
      return rows.flatMap(({ digest, ...row }) =>
        isCurrentDigest(digest) ? [{ ...row, digest }] : [],
      );
    },

    async stampsOf(settlementIds): Promise<VillageStamp[]> {
      if (settlementIds.length === 0) return [];
      const rows = await db
        .select(STAMP_COLUMNS)
        .from(village)
        .where(inArray(village.settlementId, [...settlementIds]))
        .orderBy(asc(village.createdAt), asc(village.id));
      return rows.map(toStamp);
    },

    async stampsOfVillages(villageIds): Promise<VillageStamp[]> {
      const ids = villageIds.filter((id) => UUID.test(id));
      if (ids.length === 0) return [];
      const rows = await db.select(STAMP_COLUMNS).from(village).where(inArray(village.id, ids));
      return rows.map(toStamp);
    },

    async archivedOf(villageIds): Promise<string[]> {
      const ids = villageIds.filter((id) => UUID.test(id));
      if (ids.length === 0) return [];
      const rows = await db
        .select({ id: village.id })
        .from(village)
        .innerJoin(settlement, eq(settlement.id, village.settlementId))
        .where(and(inArray(village.id, ids), sql`${settlement.archivedAt} IS NOT NULL`));
      return rows.map((r) => r.id);
    },
  };
  return repository;
}

/** Porušení unikátního indexu (PostgreSQL 23505) – Drizzle chybu někdy obalí (`cause`). */
export function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 3; depth++) {
    const code = (e as { code?: unknown }).code;
    if (code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
