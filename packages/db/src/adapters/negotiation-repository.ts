import { and, asc, eq, or, sql } from 'drizzle-orm';
import type {
  NegotiationRecord,
  NegotiationRepository,
  NegotiationRound,
  NegotiationTx,
  TermItem,
} from '@bohemia/game';
import type { Database, Executor } from '../client';
import { negotiation, negotiationReject, negotiationRound, playerBlock } from '../schema';
import { createLoanRepository } from './loan-repository';
import { createWarRepository } from './war-repository';
import { createStewardshipRepository } from './stewardship-repository';
import { createNoticeRepository } from './notice-repository';
import { createVassalageRepository } from './vassalage-repository';

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
  };
}

/**
 * Drizzle adaptér portu NegotiationRepository. Vazalství a upozornění přijetí jedou nad toutéž
 * transakcí jako stav jednání; zámek hráče se nebere (technické rozhodnutí 5 plánu).
 */
export function createNegotiationRepository(db: Database): NegotiationRepository {
  return {
    transaction: <T>(fn: (tx: NegotiationTx) => Promise<T>): Promise<T> =>
      db.transaction((tx) => fn(createTx(tx))),
  };
}
