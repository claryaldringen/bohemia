import { and, asc, eq, gt, lte, or, isNotNull, count, sql } from 'drizzle-orm';
import type {
  CampaignOutbox,
  CheckpointSave,
  GridCell,
  JourneyCheckpoint,
  JourneyIntent,
  JourneyRepository,
  JourneyState,
} from '@bohemia/game';
import type { Database } from '../client';
import { journey, journeyCheckpoint, journeyIntent } from '../schema';

/** Verze kontrolního bodu = `xmin` řádku (jako u tažení – `campaign-repository.ts`). */
const CHECKPOINT_VERSION = sql<string>`${journeyCheckpoint}.xmin::text`;

/**
 * Drizzle adaptér portu JourneyRepository (plán 2026-11-13 – Úloha 3): stejná sémantika zápisu
 * kontrolního bodu a záměrů jako `createCampaignRepository` (zámky `FOR UPDATE` / `FOR SHARE`,
 * `stale`), jen stav je `JourneyState` a hráč má nejvýš jeden běžící výjezd (částečný unikátní
 * index – druhý `create` vyhodí chybu databáze).
 */
export function createJourneyRepository(db: Database): JourneyRepository {
  return {
    async create(state: JourneyState, createdAt: Date): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.insert(journey).values({
          id: state.id,
          playerId: state.playerId,
          status: state.phase === 'done' ? 'done' : 'active',
          createdAt,
        });
        await tx
          .insert(journeyCheckpoint)
          .values({ journeyId: state.id, tick: state.tick, state, outbox: null });
      });
    },

    async active(): Promise<string[]> {
      const rows = await db
        .select({ id: journey.id })
        .from(journey)
        .innerJoin(journeyCheckpoint, eq(journeyCheckpoint.journeyId, journey.id))
        .where(or(eq(journey.status, 'active'), isNotNull(journeyCheckpoint.outbox)))
        .orderBy(asc(journey.createdAt), asc(journey.id));
      return rows.map((r) => r.id);
    },

    async activeOf(playerId: string): Promise<string | null> {
      const [row] = await db
        .select({ id: journey.id })
        .from(journey)
        .where(and(eq(journey.playerId, playerId), eq(journey.status, 'active')));
      return row?.id ?? null;
    },

    async onCell(cell: GridCell): Promise<string[]> {
      // políčko skupiny je jen v bodu (`state.groups`)
      const at = JSON.stringify([{ cell: { x: cell.x, y: cell.y } }]);
      const rows = await db
        .select({ id: journey.id })
        .from(journey)
        .innerJoin(journeyCheckpoint, eq(journeyCheckpoint.journeyId, journey.id))
        .where(
          and(
            eq(journey.status, 'active'),
            sql`${journeyCheckpoint.state}->'groups' @> ${at}::jsonb`,
          ),
        )
        .orderBy(asc(journey.createdAt), asc(journey.id));
      return rows.map((r) => r.id);
    },

    async checkpoint(journeyId: string): Promise<JourneyCheckpoint | null> {
      const [row] = await db
        .select({
          state: journeyCheckpoint.state,
          outbox: journeyCheckpoint.outbox,
          version: CHECKPOINT_VERSION,
        })
        .from(journeyCheckpoint)
        .where(eq(journeyCheckpoint.journeyId, journeyId));
      return row ? { state: row.state, outbox: row.outbox ?? null, version: row.version } : null;
    },

    async intentsAfter(journeyId: string, tick: number): Promise<JourneyIntent[]> {
      const rows = await db
        .select()
        .from(journeyIntent)
        .where(and(eq(journeyIntent.journeyId, journeyId), gt(journeyIntent.tick, tick)))
        .orderBy(asc(journeyIntent.tick), asc(journeyIntent.seq));
      return rows.map((r) => ({ tick: r.tick, seq: r.seq, byPlayer: r.byPlayer, body: r.body }));
    },

    saveCheckpoint(
      journeyId: string,
      input: {
        fromTick: number;
        seenIntents: number;
        state: JourneyState;
        outbox: CampaignOutbox | null;
      },
    ): Promise<CheckpointSave> {
      return db.transaction(async (tx) => {
        const [point] = await tx
          .select({ tick: journeyCheckpoint.tick })
          .from(journeyCheckpoint)
          .where(eq(journeyCheckpoint.journeyId, journeyId))
          .for('update');
        if (!point || point.tick !== input.fromTick) return 'stale';
        // skončený výjezd (`end` – Začít znovu) souběžný worker do běžící fáze nevrátí; stav se čte
        // až po zámku bodu samostatným dotazem – vidí tak i `end`, na který zámek čekal
        const [run] = await tx
          .select({ status: journey.status })
          .from(journey)
          .where(eq(journey.id, journeyId));
        if (run?.status !== 'active' && input.state.phase !== 'done') return 'stale';
        const [intents] = await tx
          .select({ n: count() })
          .from(journeyIntent)
          .where(
            and(
              eq(journeyIntent.journeyId, journeyId),
              gt(journeyIntent.tick, input.fromTick),
              lte(journeyIntent.tick, input.state.tick),
            ),
          );
        if ((intents?.n ?? 0) !== input.seenIntents) return 'stale';
        await tx
          .update(journeyCheckpoint)
          .set({
            tick: input.state.tick,
            state: input.state,
            outbox: input.outbox,
            updatedAt: sql`now()`,
          })
          .where(eq(journeyCheckpoint.journeyId, journeyId));
        if (input.state.phase === 'done') {
          await tx.update(journey).set({ status: 'done' }).where(eq(journey.id, journeyId));
        }
        return 'saved';
      });
    },

    async clearOutbox(journeyId: string, tick: number): Promise<void> {
      await db
        .update(journeyCheckpoint)
        .set({ outbox: null })
        .where(and(eq(journeyCheckpoint.journeyId, journeyId), eq(journeyCheckpoint.tick, tick)));
    },

    async end(journeyId: string): Promise<void> {
      // pod zámkem řádku bodu jako `saveCheckpoint` – souběžné uložení workerem počká a vrátí `stale`
      await db.transaction(async (tx) => {
        await tx
          .select({ tick: journeyCheckpoint.tick })
          .from(journeyCheckpoint)
          .where(eq(journeyCheckpoint.journeyId, journeyId))
          .for('update');
        await tx
          .update(journeyCheckpoint)
          .set({
            state: sql`jsonb_set(${journeyCheckpoint.state}, '{phase}', '"done"')`,
            outbox: null,
            updatedAt: sql`now()`,
          })
          .where(eq(journeyCheckpoint.journeyId, journeyId));
        await tx.update(journey).set({ status: 'done' }).where(eq(journey.id, journeyId));
      });
    },

    async addIntent(
      journeyId: string,
      intent: Omit<JourneyIntent, 'seq'>,
    ): Promise<JourneyIntent | null> {
      const result = await db.execute<{ seq: number }>(sql`
        INSERT INTO ${journeyIntent} (journey_id, tick, by_player, body)
        SELECT cp.journey_id, ${intent.tick}, ${intent.byPlayer}, ${JSON.stringify(intent.body)}::jsonb
          FROM ${journeyCheckpoint} cp
          JOIN ${journey} j ON j.id = cp.journey_id
         WHERE cp.journey_id = ${journeyId} AND cp.tick < ${intent.tick} AND j.status = 'active'
           FOR SHARE OF cp
        RETURNING seq`);
      const row = result.rows[0];
      return row ? { ...structuredClone(intent), seq: row.seq } : null;
    },
  };
}
