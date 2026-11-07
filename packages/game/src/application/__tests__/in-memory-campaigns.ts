import type { CampaignIntent, CampaignOutbox, CampaignState } from '../../domain/war';
import type {
  CampaignCheckpoint,
  CampaignLock,
  CampaignRepository,
  CheckpointSave,
} from '../campaigns';

/** Úložiště tažení v paměti – stav ukládá jako JSON (jako jsonb v DB). */
export class InMemoryCampaigns implements CampaignRepository {
  readonly rows = new Map<
    string,
    { status: 'active' | 'done'; tick: number; state: string; outbox: string | null }
  >();
  readonly intents: (CampaignIntent & { campaignId: string })[] = [];
  /** Kolikrát se uložil kontrolní bod. */
  saves = 0;
  private seq = 0;

  create(state: CampaignState): Promise<void> {
    this.rows.set(state.id, {
      status: 'active',
      tick: state.tick,
      state: JSON.stringify(state),
      outbox: null,
    });
    return Promise.resolve();
  }

  active(): Promise<string[]> {
    return Promise.resolve(
      [...this.rows]
        .filter(([, r]) => r.status === 'active' || r.outbox !== null)
        .map(([id]) => id),
    );
  }

  activeOf(playerId: string): Promise<string[]> {
    return Promise.resolve(
      [...this.rows]
        .filter(
          ([, r]) =>
            r.status === 'active' && (JSON.parse(r.state) as CampaignState).playerId === playerId,
        )
        .map(([id]) => id),
    );
  }

  checkpoint(campaignId: string): Promise<CampaignCheckpoint | null> {
    const row = this.rows.get(campaignId);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      state: JSON.parse(row.state) as CampaignState,
      outbox: row.outbox === null ? null : (JSON.parse(row.outbox) as CampaignOutbox),
    });
  }

  intentsAfter(campaignId: string, tick: number): Promise<CampaignIntent[]> {
    return Promise.resolve(
      this.intents
        .filter((i) => i.campaignId === campaignId && i.tick > tick)
        .sort((a, b) => a.tick - b.tick || a.seq - b.seq)
        .map(({ tick: t, seq, byPlayer, body }) => ({ tick: t, seq, byPlayer, body })),
    );
  }

  saveCheckpoint(
    campaignId: string,
    input: {
      fromTick: number;
      seenIntents: number;
      state: CampaignState;
      outbox: CampaignOutbox | null;
    },
  ): Promise<CheckpointSave> {
    const row = this.rows.get(campaignId);
    const inRange = this.intents.filter(
      (i) => i.campaignId === campaignId && i.tick > input.fromTick && i.tick <= input.state.tick,
    );
    const late = inRange.length !== input.seenIntents;
    if (!row || row.tick !== input.fromTick || late) return Promise.resolve('stale');
    this.saves++;
    row.tick = input.state.tick;
    row.state = JSON.stringify(input.state);
    row.outbox = input.outbox ? JSON.stringify(input.outbox) : null;
    if (input.state.phase === 'done') row.status = 'done';
    return Promise.resolve('saved');
  }

  clearOutbox(campaignId: string, tick: number): Promise<void> {
    const row = this.rows.get(campaignId);
    if (row && row.tick === tick) row.outbox = null;
    return Promise.resolve();
  }

  addIntent(
    campaignId: string,
    intent: Omit<CampaignIntent, 'seq'>,
  ): Promise<CampaignIntent | null> {
    const row = this.rows.get(campaignId);
    if (!row || row.status !== 'active' || intent.tick <= row.tick) return Promise.resolve(null);
    const stored = { ...structuredClone(intent), seq: ++this.seq };
    this.intents.push({ ...stored, campaignId });
    return Promise.resolve(stored);
  }
}

/** Zámek tažení v paměti; `held` = tažení, která právě počítá „jiný proces“. */
export class InMemoryCampaignLock implements CampaignLock {
  readonly held = new Set<string>();

  async tryRun<T>(
    campaignId: string,
    run: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }> {
    if (this.held.has(campaignId)) return { ran: false };
    this.held.add(campaignId);
    try {
      return { ran: true, value: await run() };
    } finally {
      this.held.delete(campaignId);
    }
  }
}
