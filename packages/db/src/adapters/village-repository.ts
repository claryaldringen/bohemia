import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  EMPTY_INBOX,
  isCurrentDigest,
  villageDigest,
  type VillageDigest,
  type VillageDigestRecord,
  type VillageRecord,
  type VillageRepository,
  type VillageStamp,
  type VillageYearRow,
} from '@bohemia/game';
import type { Database } from '../client';
import { settlement, village, villageYear } from '../schema';

type VillageRow = typeof village.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Řádek vsi pro zápis stavu – souhrn se odvodí ze stavu (zdroj pravdy je stav) a nese verzi,
 * kterou zápis vsi dá (`digestVersion` = nová `version`).
 */
function written(
  state: VillageRecord['state'],
  digestVersion: number | SQL,
): { state: VillageRecord['state']; digest: VillageDigest; digestVersion: number | SQL } {
  return { state, digest: villageDigest(state), digestVersion };
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
    state: row.state,
    version: row.version,
  };
}

/**
 * Drizzle adaptér portu VillageRepository – optimistické zamykání přes sloupec version. Sídlo
 * může mít víc vsí; první ves sídla zakládá `create` atomicky (zámek řádku sídla).
 */
export function createVillageRepository(db: Database): VillageRepository {
  // Hledání podle klíče založení jde přes unikátní index `village_origin_uq`.
  const byOrigin = async (origin: string): Promise<VillageRecord | null> => {
    const [row] = await db
      .select()
      .from(village)
      .where(sql`${village.state}->>'origin' = ${origin}`)
      .orderBy(asc(village.createdAt))
      .limit(1);
    return row ? toRecord(row) : null;
  };
  return {
    // schránka vsí zatím prázdná – adaptér nad tabulkou `village_inbox` přijde v úloze 1.7
    // (docs/code/village-core.md – Schránka vsi)
    inbox: EMPTY_INBOX,

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
          .values({ settlementId, name, ...written(state, 1), version: 1 })
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
            .where(sql`${village.state}->>'origin' = ${origin}`)
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
            .values({ settlementId, name, ...written(state, 1), version: 1 })
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
      // Zpět jen identitu, jméno a verzi – stav (u velké vsi přes 1 MB JSON) má volající v ruce,
      // databáze by ho jinak celý serializovala a posílala zpátky.
      const update = (tx: Pick<Database, 'update'>): Promise<SavedRow[]> =>
        tx
          .update(village)
          .set({
            ...written(state, sql`${village.version} + 1`),
            version: sql`${village.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(village.id, villageId), eq(village.version, expectedVersion)))
          .returning({
            id: village.id,
            settlementId: village.settlementId,
            name: village.name,
            version: village.version,
          });
      if (yearRows.length === 0) {
        const [row] = await update(db);
        return row ? { ...row, state } : null;
      }
      // řádky deníku jen s úspěšným zápisem stavu, v téže transakci (idempotentně: ves + rok)
      return db.transaction(async (tx) => {
        const [row] = await update(tx);
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
      // Den dopočtu a spánek jsou uložené sloupce (generované ze stavu při zápisu) – stav se
      // nepřenáší ani neparsuje v Node.
      const rows = await db
        .select({
          id: village.id,
          settlementId: village.settlementId,
          name: village.name,
          version: village.version,
          lastDay: village.lastDay,
          asleep: village.asleep,
        })
        .from(village)
        .where(inArray(village.settlementId, [...settlementIds]))
        .orderBy(asc(village.createdAt), asc(village.id));
      // lastDay je ve stavu vždy; null by znamenalo poškozený JSON – ves je pak „nejvíc pozadu“
      return rows.map((row) => ({ ...row, lastDay: row.lastDay ?? 0 }));
    },
  };
}

/** Porušení unikátního indexu (PostgreSQL 23505) – Drizzle chybu někdy obalí (`cause`). */
function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 3; depth++) {
    const code = (e as { code?: unknown }).code;
    if (code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
