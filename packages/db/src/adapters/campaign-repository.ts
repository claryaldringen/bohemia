import { and, asc, eq, gt, lte, or, isNotNull, count, sql } from 'drizzle-orm';
import type {
  CampaignCheckpoint,
  CampaignIntent,
  CampaignOutbox,
  CampaignRepository,
  CampaignState,
  CheckpointSave,
} from '@bohemia/game';
import type { Database } from '../client';
import { campaign, campaignCheckpoint, campaignIntent } from '../schema';

/**
 * Drizzle adaptér portu CampaignRepository (plán 2026-11-03 – Úloha 6.5). Souběh záměru
 * a kontrolního bodu: `addIntent` sdílí řádek bodu (`FOR SHARE`), `saveCheckpoint` ho zamkne
 * (`FOR UPDATE`) a záměry spočítá až pod zámkem – záměr do už spočtených taktů tak buď bod
 * odmítne (`stale`), nebo se sám nezapíše (bod je už za jeho taktem). Stav v jsonb: čísla se
 * vrátí přesně, jen pořadí klíčů objektů se změní – takt pořadí klíčů nečte.
 */
export function createCampaignRepository(db: Database): CampaignRepository {
  return {
    async create(state: CampaignState, createdAt: Date): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.insert(campaign).values({
          id: state.id,
          warId: state.warId,
          playerId: state.playerId,
          status: state.phase === 'done' ? 'done' : 'active',
          createdAt,
        });
        await tx
          .insert(campaignCheckpoint)
          .values({ campaignId: state.id, tick: state.tick, state, outbox: null });
      });
    },

    async active(): Promise<string[]> {
      const rows = await db
        .select({ id: campaign.id })
        .from(campaign)
        .innerJoin(campaignCheckpoint, eq(campaignCheckpoint.campaignId, campaign.id))
        .where(or(eq(campaign.status, 'active'), isNotNull(campaignCheckpoint.outbox)))
        .orderBy(asc(campaign.createdAt), asc(campaign.id));
      return rows.map((r) => r.id);
    },

    async activeOf(playerId: string): Promise<string[]> {
      // vůdce, nebo hráč, jehož muži jdou v tažení (vazal ve službě) – muži jsou jen v bodu
      const member = JSON.stringify([{ playerId }]);
      const rows = await db
        .select({ id: campaign.id })
        .from(campaign)
        .innerJoin(campaignCheckpoint, eq(campaignCheckpoint.campaignId, campaign.id))
        .where(
          and(
            eq(campaign.status, 'active'),
            or(
              eq(campaign.playerId, playerId),
              sql`${campaignCheckpoint.state}->'members' @> ${member}::jsonb`,
            ),
          ),
        )
        .orderBy(asc(campaign.createdAt), asc(campaign.id));
      return rows.map((r) => r.id);
    },

    async checkpoint(campaignId: string): Promise<CampaignCheckpoint | null> {
      const [row] = await db
        .select({ state: campaignCheckpoint.state, outbox: campaignCheckpoint.outbox })
        .from(campaignCheckpoint)
        .where(eq(campaignCheckpoint.campaignId, campaignId));
      return row ? { state: row.state, outbox: row.outbox ?? null } : null;
    },

    async intentsAfter(campaignId: string, tick: number): Promise<CampaignIntent[]> {
      const rows = await db
        .select()
        .from(campaignIntent)
        .where(and(eq(campaignIntent.campaignId, campaignId), gt(campaignIntent.tick, tick)))
        .orderBy(asc(campaignIntent.tick), asc(campaignIntent.seq));
      return rows.map((r) => ({ tick: r.tick, seq: r.seq, byPlayer: r.byPlayer, body: r.body }));
    },

    saveCheckpoint(
      campaignId: string,
      input: {
        fromTick: number;
        seenIntents: number;
        state: CampaignState;
        outbox: CampaignOutbox | null;
      },
    ): Promise<CheckpointSave> {
      return db.transaction(async (tx) => {
        const [point] = await tx
          .select({ tick: campaignCheckpoint.tick })
          .from(campaignCheckpoint)
          .where(eq(campaignCheckpoint.campaignId, campaignId))
          .for('update');
        if (!point || point.tick !== input.fromTick) return 'stale';
        const [intents] = await tx
          .select({ n: count() })
          .from(campaignIntent)
          .where(
            and(
              eq(campaignIntent.campaignId, campaignId),
              gt(campaignIntent.tick, input.fromTick),
              lte(campaignIntent.tick, input.state.tick),
            ),
          );
        if ((intents?.n ?? 0) !== input.seenIntents) return 'stale';
        await tx
          .update(campaignCheckpoint)
          .set({
            tick: input.state.tick,
            state: input.state,
            outbox: input.outbox,
            updatedAt: sql`now()`,
          })
          .where(eq(campaignCheckpoint.campaignId, campaignId));
        if (input.state.phase === 'done') {
          await tx.update(campaign).set({ status: 'done' }).where(eq(campaign.id, campaignId));
        }
        return 'saved';
      });
    },

    async clearOutbox(campaignId: string, tick: number): Promise<void> {
      await db
        .update(campaignCheckpoint)
        .set({ outbox: null })
        .where(
          and(eq(campaignCheckpoint.campaignId, campaignId), eq(campaignCheckpoint.tick, tick)),
        );
    },

    async addIntent(
      campaignId: string,
      intent: Omit<CampaignIntent, 'seq'>,
    ): Promise<CampaignIntent | null> {
      const result = await db.execute<{ seq: number }>(sql`
        INSERT INTO ${campaignIntent} (campaign_id, tick, by_player, body)
        SELECT cp.campaign_id, ${intent.tick}, ${intent.byPlayer}, ${JSON.stringify(intent.body)}::jsonb
          FROM ${campaignCheckpoint} cp
          JOIN ${campaign} c ON c.id = cp.campaign_id
         WHERE cp.campaign_id = ${campaignId} AND cp.tick < ${intent.tick} AND c.status = 'active'
           FOR SHARE OF cp
        RETURNING seq`);
      const row = result.rows[0];
      return row ? { ...structuredClone(intent), seq: row.seq } : null;
    },
  };
}
