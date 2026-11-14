import type { CampaignOutbox, JourneyIntent, JourneyState } from '../../domain/war';
import type { GridCell } from '../../domain/village/people/world-grid';
import type { CheckpointSave } from '../campaigns';
import type { JourneyCheckpoint, JourneyRepository } from '../journeys';

/** Verze bodu v paměti = obsah řádku (jako `InMemoryCampaigns`). */
function versionOf(row: { tick: number; state: string; outbox: string | null }): string {
  return JSON.stringify([row.tick, row.state, row.outbox]);
}

/** Úložiště výjezdů v paměti – stav ukládá jako JSON (jako jsonb v DB). */
export class InMemoryJourneys implements JourneyRepository {
  readonly rows = new Map<
    string,
    { status: 'active' | 'done'; tick: number; state: string; outbox: string | null }
  >();
  readonly intents: (JourneyIntent & { journeyId: string })[] = [];
  /** Kolikrát se uložil kontrolní bod. */
  saves = 0;
  /** Další `create` selže touto chybou (test vrácení mužů). */
  failCreate: Error | null = null;
  private seq = 0;

  create(state: JourneyState): Promise<void> {
    if (this.failCreate) return Promise.reject(this.failCreate);
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

  activeOf(playerId: string): Promise<string | null> {
    const found = [...this.rows].find(
      ([, r]) =>
        r.status === 'active' && (JSON.parse(r.state) as JourneyState).playerId === playerId,
    );
    return Promise.resolve(found ? found[0] : null);
  }

  onCell(cell: GridCell): Promise<string[]> {
    return Promise.resolve(
      [...this.rows]
        .filter(([, r]) => {
          if (r.status !== 'active') return false;
          const s = JSON.parse(r.state) as JourneyState;
          return s.groups.some((g) => g.cell.x === cell.x && g.cell.y === cell.y);
        })
        .map(([id]) => id),
    );
  }

  checkpoint(journeyId: string): Promise<JourneyCheckpoint | null> {
    const row = this.rows.get(journeyId);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      state: JSON.parse(row.state) as JourneyState,
      outbox: row.outbox === null ? null : (JSON.parse(row.outbox) as CampaignOutbox),
      version: versionOf(row),
    });
  }

  intentsAfter(journeyId: string, tick: number): Promise<JourneyIntent[]> {
    return Promise.resolve(
      this.intents
        .filter((i) => i.journeyId === journeyId && i.tick > tick)
        .sort((a, b) => a.tick - b.tick || a.seq - b.seq)
        .map(({ tick: t, seq, byPlayer, body }) => ({ tick: t, seq, byPlayer, body })),
    );
  }

  saveCheckpoint(
    journeyId: string,
    input: {
      fromTick: number;
      seenIntents: number;
      state: JourneyState;
      outbox: CampaignOutbox | null;
    },
  ): Promise<CheckpointSave> {
    const row = this.rows.get(journeyId);
    const inRange = this.intents.filter(
      (i) => i.journeyId === journeyId && i.tick > input.fromTick && i.tick <= input.state.tick,
    );
    if (
      !row ||
      (row.status === 'done' && input.state.phase !== 'done') ||
      row.tick !== input.fromTick ||
      inRange.length !== input.seenIntents
    ) {
      return Promise.resolve('stale');
    }
    this.saves++;
    row.tick = input.state.tick;
    row.state = JSON.stringify(input.state);
    row.outbox = input.outbox ? JSON.stringify(input.outbox) : null;
    if (input.state.phase === 'done') row.status = 'done';
    return Promise.resolve('saved');
  }

  clearOutbox(journeyId: string, tick: number): Promise<void> {
    const row = this.rows.get(journeyId);
    if (row && row.tick === tick) row.outbox = null;
    return Promise.resolve();
  }

  end(journeyId: string): Promise<void> {
    const row = this.rows.get(journeyId);
    if (row) {
      row.status = 'done';
      row.state = JSON.stringify({ ...(JSON.parse(row.state) as JourneyState), phase: 'done' });
      row.outbox = null;
    }
    return Promise.resolve();
  }

  addIntent(journeyId: string, intent: Omit<JourneyIntent, 'seq'>): Promise<JourneyIntent | null> {
    const row = this.rows.get(journeyId);
    if (!row || row.status !== 'active' || intent.tick <= row.tick) return Promise.resolve(null);
    const stored = { ...structuredClone(intent), seq: ++this.seq };
    this.intents.push({ ...stored, journeyId });
    return Promise.resolve(stored);
  }
}
