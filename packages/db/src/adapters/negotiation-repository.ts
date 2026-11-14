import { randomUUID } from 'node:crypto';
import { and, asc, eq, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type {
  Accepted,
  DueOutbox,
  NegotiationRecord,
  NegotiationRepository,
  OutboxClaim,
  OutboxPolicy,
  NegotiationRound,
  NegotiationTx,
  PeaceTribute,
  TermItem,
} from '@bohemia/game';
import { peaceTributeOf } from '@bohemia/game';
import type { Database, Executor } from '../client';
import {
  negotiation,
  negotiationOutbox,
  negotiationReject,
  negotiationRound,
  playerBlock,
} from '../schema';
import { createLoanRepository } from './loan-repository';
import { createWarRepository } from './war-repository';
import { createStewardshipRepository } from './stewardship-repository';
import { createNoticeRepository } from './notice-repository';
import { createVassalageRepository } from './vassalage-repository';
import { createPlacementTx } from './newcomer-placement';

type Row = typeof negotiation.$inferSelect;
type RoundRow = typeof negotiationRound.$inferSelect;

function toRound(row: RoundRow): NegotiationRound {
  return {
    authorHouseId: row.authorHouseId,
    items: row.items as TermItem[],
    message: row.message,
    at: row.createdAt,
  };
}

function toRecord(row: Row, rounds: RoundRow[]): NegotiationRecord {
  return {
    id: row.id,
    initiatorHouseId: row.opener,
    recipientHouseId: row.opener === row.partyLow ? row.partyHigh : row.partyLow,
    status: row.status,
    rounds: rounds.map(toRound),
    resolvedAt: row.closedAt,
    version: row.version,
    createdAt: row.createdAt,
    newcomer: row.newcomer,
  };
}

/** Seřazená dvojice rodů (základ unikátního indexu otevřeného jednání). */
function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function load(db: Executor, row: Row): Promise<NegotiationRecord> {
  const rounds = await db
    .select()
    .from(negotiationRound)
    .where(eq(negotiationRound.negotiationId, row.id))
    .orderBy(asc(negotiationRound.seq));
  return toRecord(row, rounds);
}

function createTx(db: Executor): NegotiationTx {
  return {
    async open(input): Promise<NegotiationRecord | null> {
      const [low, high] = ordered(input.initiatorHouseId, input.recipientHouseId);
      // ON CONFLICT DO NOTHING: druhé otevřené jednání mezi dvojicí (i opačným směrem) počká na
      // první transakci a nic nevloží – transakce se tím nezruší.
      const [row] = await db
        .insert(negotiation)
        .values({
          partyLow: low,
          partyHigh: high,
          opener: input.initiatorHouseId,
          createdAt: input.round.at,
          newcomer: input.newcomer === true,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return null;
      const [first] = await db
        .insert(negotiationRound)
        .values({
          negotiationId: row.id,
          seq: 1,
          authorHouseId: input.round.authorHouseId,
          items: input.round.items,
          message: input.round.message,
          createdAt: input.round.at,
        })
        .returning();
      return toRecord(row, first ? [first] : []);
    },
    async getForUpdate(id): Promise<NegotiationRecord | null> {
      const [row] = await db.select().from(negotiation).where(eq(negotiation.id, id)).for('update');
      return row ? load(db, row) : null;
    },
    async openBetween(a, b): Promise<NegotiationRecord | null> {
      const [low, high] = ordered(a, b);
      const [row] = await db
        .select()
        .from(negotiation)
        .where(
          and(
            eq(negotiation.partyLow, low),
            eq(negotiation.partyHigh, high),
            eq(negotiation.status, 'open'),
          ),
        );
      return row ? load(db, row) : null;
    },
    async openOf(houseId): Promise<NegotiationRecord[]> {
      const rows = await db
        .select()
        .from(negotiation)
        .where(
          and(
            eq(negotiation.status, 'open'),
            or(eq(negotiation.partyLow, houseId), eq(negotiation.partyHigh, houseId)),
          ),
        );
      return Promise.all(rows.map((row) => load(db, row)));
    },
    async addRound(id, round): Promise<void> {
      const [last] = await db
        .select({ seq: sql<number>`coalesce(max(${negotiationRound.seq}), 0)` })
        .from(negotiationRound)
        .where(eq(negotiationRound.negotiationId, id));
      await db.insert(negotiationRound).values({
        negotiationId: id,
        seq: (last?.seq ?? 0) + 1,
        authorHouseId: round.authorHouseId,
        items: round.items,
        message: round.message,
        createdAt: round.at,
      });
    },
    async setStatus(id, status, expectedVersion, at): Promise<boolean> {
      const rows = await db
        .update(negotiation)
        .set({
          status,
          version: sql`${negotiation.version} + 1`,
          closedAt: status === 'open' ? null : at,
        })
        .where(and(eq(negotiation.id, id), eq(negotiation.version, expectedVersion)))
        .returning({ id: negotiation.id });
      return rows.length > 0;
    },
    async blocks(blocker, blocked): Promise<boolean> {
      const rows = await db
        .select({ blocker: playerBlock.blockerHouseId })
        .from(playerBlock)
        .where(
          and(eq(playerBlock.blockerHouseId, blocker), eq(playerBlock.blockedHouseId, blocked)),
        );
      return rows.length > 0;
    },
    async setBlock(blocker, blocked, on, at): Promise<void> {
      if (on) {
        await db
          .insert(playerBlock)
          .values({ blockerHouseId: blocker, blockedHouseId: blocked, createdAt: at })
          .onConflictDoNothing();
      } else {
        await db
          .delete(playerBlock)
          .where(
            and(eq(playerBlock.blockerHouseId, blocker), eq(playerBlock.blockedHouseId, blocked)),
          );
      }
    },
    async lastReject(proposer, rejecter): Promise<Date | null> {
      const [row] = await db
        .select({ at: negotiationReject.at })
        .from(negotiationReject)
        .where(
          and(
            eq(negotiationReject.proposerHouseId, proposer),
            eq(negotiationReject.rejecterHouseId, rejecter),
          ),
        );
      return row?.at ?? null;
    },
    async recordReject(proposer, rejecter, at): Promise<void> {
      await db
        .insert(negotiationReject)
        .values({ proposerHouseId: proposer, rejecterHouseId: rejecter, at })
        .onConflictDoUpdate({
          target: [negotiationReject.proposerHouseId, negotiationReject.rejecterHouseId],
          set: { at },
        });
    },
    vassalages: createVassalageRepository(db),
    notices: createNoticeRepository(db),
    loans: createLoanRepository(db),
    stewardships: createStewardshipRepository(db),
    wars: createWarRepository(db),
    placement: createPlacementTx(db),
    // nájem zapisujícího procesu od zápisu – `clock_timestamp()` je okamžik příkazu (těsně před
    // commitem), ne začátek transakce ani požadavku
    async putOutbox(negotiationId, effects, at, leaseMs): Promise<string> {
      const claim = randomUUID();
      await db
        .insert(negotiationOutbox)
        .values({ negotiationId, effects, createdAt: at, claim, nextAt: leaseEnd(leaseMs) });
      return claim;
    },
  };
}

/** Okamžik `ms` po teď podle hodin databáze (nájem a odklad schránky – jedny hodiny pro všechny). */
function leaseEnd(ms: number): SQL {
  return sql`clock_timestamp() + ${ms}::double precision * interval '1 millisecond'`;
}

/**
 * Obnova nájmu schránky každou třetinu nájmu, dokud běží účinky (`withOutbox`). Každá obnova je
 * krátký `UPDATE` (spojení se hned vrátí); selhání jen zaloguje – nájem pak vyprší sám. Vrací stop.
 */
function renewLease(
  db: Database,
  negotiationId: string,
  claim: string,
  leaseMs: number,
): () => void {
  let stopped = false;
  let busy = false;
  const renew = async (): Promise<void> => {
    const rows = await db
      .update(negotiationOutbox)
      .set({ nextAt: leaseEnd(leaseMs) })
      .where(
        and(eq(negotiationOutbox.negotiationId, negotiationId), eq(negotiationOutbox.claim, claim)),
      )
      .returning({ id: negotiationOutbox.negotiationId });
    if (rows.length === 0 && !stopped) {
      stopped = true;
      clearInterval(timer);
      console.warn(`Schránka účinků jednání ${negotiationId}: nájem převzal jiný proces.`);
    }
  };
  const timer = setInterval(
    () => {
      if (busy || stopped) return;
      busy = true;
      renew()
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `Schránka účinků jednání ${negotiationId}: obnova nájmu selhala (${message}).`,
          );
        })
        .finally(() => {
          busy = false;
        });
    },
    Math.max(1, Math.floor(leaseMs / 3)),
  );
  // obnova nesmí držet proces naživu (konec workeru, testy)
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * Drizzle adaptér portu NegotiationRepository. Vazalství a upozornění přijetí jedou nad toutéž
 * transakcí jako stav jednání; zámek hráče se nebere (technické rozhodnutí 5 plánu).
 */
export function createNegotiationRepository(db: Database): NegotiationRepository {
  return {
    async peaceTributes(): Promise<PeaceTribute[]> {
      // přijatá jednání, jejichž některé kolo nese mír s tributem; poslední kolo rozhodne `peaceTributeOf`
      const rows = await db
        .select({ n: negotiation })
        .from(negotiation)
        .innerJoin(negotiationRound, eq(negotiationRound.negotiationId, negotiation.id))
        .where(
          and(
            eq(negotiation.status, 'accepted'),
            sql`${negotiationRound.items}::text like '%"peace"%'`,
            sql`${negotiationRound.items}::text like '%"tribute"%'`,
          ),
        );
      const seen = new Set<string>();
      const out: PeaceTribute[] = [];
      for (const { n } of rows) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        const tribute = peaceTributeOf(await load(db, n));
        if (tribute) out.push(tribute);
      }
      return out;
    },
    async newcomerRequestsOf(houseId): Promise<NegotiationRecord[]> {
      const rows = await db
        .select()
        .from(negotiation)
        .where(and(eq(negotiation.newcomer, true), eq(negotiation.opener, houseId)))
        .orderBy(asc(negotiation.createdAt), asc(negotiation.id));
      return Promise.all(rows.map((row) => load(db, row)));
    },
    async allOpen(): Promise<NegotiationRecord[]> {
      const rows = await db
        .select()
        .from(negotiation)
        .where(eq(negotiation.status, 'open'))
        .orderBy(asc(negotiation.createdAt), asc(negotiation.id));
      return Promise.all(rows.map((row) => load(db, row)));
    },
    transaction: <T>(fn: (tx: NegotiationTx) => Promise<T>): Promise<T> =>
      db.transaction((tx) => fn(createTx(tx))),
    async pendingOutboxes(limit, maxAttempts): Promise<DueOutbox[]> {
      const rows = await db
        .select({
          negotiationId: negotiationOutbox.negotiationId,
          attempts: negotiationOutbox.attempts,
        })
        .from(negotiationOutbox)
        .where(
          and(
            lte(negotiationOutbox.nextAt, sql`clock_timestamp()`),
            lt(negotiationOutbox.attempts, maxAttempts),
          ),
        )
        .orderBy(
          asc(negotiationOutbox.attempts),
          asc(negotiationOutbox.nextAt),
          asc(negotiationOutbox.negotiationId),
        )
        .limit(limit);
      return rows;
    },
    // Nájem místo zámku řádku: převzetí je jeden `UPDATE … RETURNING` a spojení se hned vrátí –
    // účinky (které samy berou spojení z téhož poolu) nic nedrží a výpadek spojení nájem
    // neuvolní. Zamyká se jen řádek schránky, ne jednání (cizí klíče účinků).
    async withOutbox<T>(
      negotiationId: string,
      fn: (effects: Accepted) => Promise<T>,
      policy: OutboxPolicy,
      held?: OutboxClaim,
    ): Promise<{ value: T } | null> {
      const claim = held ?? randomUUID();
      const free = lte(negotiationOutbox.nextAt, sql`clock_timestamp()`);
      const [row] = await db
        .update(negotiationOutbox)
        .set({ claim, nextAt: leaseEnd(policy.leaseMs) })
        .where(
          and(
            eq(negotiationOutbox.negotiationId, negotiationId),
            held === undefined ? free : or(free, eq(negotiationOutbox.claim, held)),
          ),
        )
        .returning({ effects: negotiationOutbox.effects, attempts: negotiationOutbox.attempts });
      if (!row) return null;
      const stop = renewLease(db, negotiationId, claim, policy.leaseMs);
      try {
        const value = await fn(row.effects as Accepted);
        stop();
        // smaže i schránku, kterou mezitím převzal jiný proces (prošlý nájem) – účinky jsou hotové
        // a jeho opakování nic nezdvojí
        await db
          .delete(negotiationOutbox)
          .where(eq(negotiationOutbox.negotiationId, negotiationId));
        return { value };
      } catch (error) {
        stop();
        const attempts = row.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);
        // jen vlastní nájem – schránku, kterou mezitím převzal jiný proces, nechá být
        await db
          .update(negotiationOutbox)
          .set({
            claim: null,
            attempts,
            lastError: message,
            nextAt: leaseEnd(policy.retryMs(attempts)),
          })
          .where(
            and(
              eq(negotiationOutbox.negotiationId, negotiationId),
              eq(negotiationOutbox.claim, claim),
            ),
          )
          .catch((failure: unknown) => {
            const reason = failure instanceof Error ? failure.message : String(failure);
            console.warn(
              `Schránka účinků jednání ${negotiationId}: odklad se nezapsal (${reason}).`,
            );
          });
        throw error;
      }
    },
  };
}
